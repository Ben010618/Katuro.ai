import { useEffect, useState } from 'react';
import { useTestBuilderStore } from '../../store/testBuilderStore';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../context/ToastContext';
import { getTeacherProfile, deductTokens, refundTokens } from '../../services/db';
import { updateTestSession } from '../../services/testBuilderDb';
import { generateItemsForCompetency } from '../../services/testBuilderItemsAI';
import { COGNITIVE_LEVELS, deriveKeyStage, deriveHotsFloor, deriveLanguage, KEY_STAGE_LABELS, resolveItemCeiling } from '../../config/testBuilderConfig';
import { totalDays, computeTOS } from '../../utils/testBuilderCalc';
import { trackEvent, trackGeneration, startTimer } from '../../services/usageTracker';
import {
  ClipboardCheck, CheckCircle2, AlertTriangle, BadgeCheck,
  FileText, KeyRound, Table2, Sparkles, Loader2, AlertCircle, X, Lock,
} from 'lucide-react';
import DownloadProgress from '../../components/DownloadProgress';
import { useSmoothProgress } from '../../hooks/useSmoothProgress';

// Names the file in the download overlay so a teacher exporting all three in a
// row can tell which one is currently being built.
const DOWNLOAD_LABELS = {
  tos:       'Table of Specifications (DOCX)',
  questions: 'Test Questions (DOCX)',
  key:       'Answer Key (DOCX)',
};

const sectionLabel = {
  margin: '0 0 12px', fontSize: 11, fontWeight: 700, color: 'var(--kt-text-secondary)',
  textTransform: 'uppercase', letterSpacing: '1.2px',
};

const GENERATE_ITEMS_COST = 5;

export default function StepReview() {
  const store = useTestBuilderStore();
  const { user, freeMode } = useAuth();
  const { addToast } = useToast();

  const keyStage = deriveKeyStage(store.gradeLevel);
  const itemCeiling = resolveItemCeiling(keyStage, store.testType, store.itemCeilingOverride);
  const hotsFloor = keyStage ? deriveHotsFloor(keyStage) : 0;

  // Auto-heal TOS if it's empty or out-of-sync but competencies exist
  useEffect(() => {
    if ((!store.tos?.rows || store.tos.rows.length === 0) && store.competencies?.length > 0 && itemCeiling > 0) {
      const computed = computeTOS(store.competencies, store.cognitiveWeights, itemCeiling);
      store.setTos(computed);
    }
  }, [store.competencies, store.cognitiveWeights, itemCeiling]); // eslint-disable-line react-hooks/exhaustive-deps

  const grandTotal = (store.tos?.columnTotals || []).reduce((a, b) => a + b, 0);
  const hotsOk = (store.tos?.hotsPct || 0) >= hotsFloor;

  const [teacherProfile,  setTeacherProfile]  = useState(null);
  const [genLoading,      setGenLoading]      = useState(false);
  const [genPhase,        setGenPhase]        = useState('');
  // One AI call per TOS row, so the wait scales with how many rows there are.
  const shownProgress = useSmoothProgress({ active: genLoading, estimateSec: 40 * Math.max(1, store.tos?.rows?.length || 1) });
  const [genError,        setGenError]        = useState('');
  const [downloadingKind, setDownloadingKind] = useState(null); // 'tos' | 'questions' | 'key' | null
  const generatedParts = store.generatedParts; // { testBlocks, keyBlocks }

  useEffect(() => {
    if (!user?.uid) return;
    getTeacherProfile(user.uid).then(setTeacherProfile).catch(() => {});
  }, [user?.uid]);

  const docMeta = {
    subject: store.subject,
    gradeLevel: store.gradeLevel,
    testType: store.testType,
    terms: store.terms.join(', '),
    itemCeiling,
  };

  const canGenerateItems = grandTotal > 0 && !genLoading;
  const canDownloadTos   = grandTotal > 0;

  async function handleGenerateItems() {
    if (!canGenerateItems || !user?.uid) return;
    setGenLoading(true);
    setGenError('');
    store.setGeneratedParts(null);
    let elapsedMs;
    let tokensDeducted = false;
    try {
      setGenPhase(freeMode ? 'Preparing…' : 'Checking tokens…');
      await deductTokens(user.uid, 'test_builder_generate_doc', GENERATE_ITEMS_COST);
      tokensDeducted = true;
      elapsedMs = startTimer();

      const allItems = [];
      const failedRows = [];
      let cursor = 0;
      for (let i = 0; i < store.tos.rows.length; i++) {
        const row = store.tos.rows[i];
        if (row.total === 0) continue;

        let result;
        let lastErr;
        for (let attempt = 0; attempt < 3; attempt++) {
          setGenPhase(`Writing items for competency ${i + 1} of ${store.tos.rows.length}…`);
          try {
            result = await generateItemsForCompetency({
              competencyText: row.label,
              cells: row.cells,
              subject: store.subject,
              gradeLevel: store.gradeLevel,
              questionFormats: store.questionFormats,
              proficiencyLevel: store.proficiencyLevel,
              contextNotes: store.contextNotes,
              startIndex: cursor,
              isRetry: attempt > 0,
            });
            break;
          } catch (err) {
            lastErr = err;
            console.warn(`generateItemsForCompetency (row ${i + 1}) attempt ${attempt + 1} failed:`, err);
            // Neither of these can clear up by retrying: dailyLimit is our own
            // in-app cap, quotaExhausted is Google's per-day cap (resets at
            // midnight). Retrying just burns time and allowance.
            if (err.dailyLimit || err.quotaExhausted) break;
            if (attempt < 2) {
              const waitMs = err.status === 429
                ? Math.min((err.retryAfter || 30) * 1000, 30_000)
                : 5000 + attempt * 3000;
              const waitSec = Math.round(waitMs / 1000);
              for (let s = waitSec; s > 0; s--) {
                setGenPhase(`Due to high demand, competency ${i + 1} is slow — retrying in ${s}s…`);
                await new Promise(r => setTimeout(r, 1000));
              }
              setGenPhase(`Retrying competency ${i + 1} of ${store.tos.rows.length}…`);
            }
          }
        }
        // BUG-FIX: this used to `throw lastErr`, discarding every competency
        // that had already generated. A test with 8 competencies that failed on
        // row 6 threw away 5 successful rows — 20+ completed AI calls and the
        // teacher's quota with them — and left them nothing to show for a
        // 3-5 minute wait. Record the failure and keep going; whatever was
        // generated is still a usable partial test the teacher can top up.
        if (!result) {
          failedRows.push({ index: i + 1, label: row.label, err: lastErr });
          // A spent daily quota will fail every remaining competency too, so
          // stop rather than walk the rest of the list to collect more of the
          // same error.
          if (lastErr?.quotaExhausted || lastErr?.dailyLimit) break;
          continue;
        }

        allItems.push(...result.items);
        cursor = result.nextIndex;

        // BUG-FIX: Pace sequential API calls to avoid Gemini's RPM (requests-per-
        // minute) rate limit. Without this pause, firing 5–8 competency calls in rapid
        // succession triggers 429 errors on rows 3–4 (root cause of the ~115s failures
        // visible in Admin → Analytics → "Recent Generation Errors"). Skip the delay
        // after the last row since there's nothing to pace after it.
        const nonEmptyRowsRemaining = store.tos.rows.slice(i + 1).some(r => r.total > 0);
        if (nonEmptyRowsRemaining) {
          setGenPhase(`Competency ${i + 1} done — preparing next…`);
          await new Promise(r => setTimeout(r, 3000));
        }
      }

      // Nothing at all came back — surface the real cause rather than a blank test.
      if (allItems.length === 0) {
        throw failedRows[0]?.err || new Error('Item generation failed. Please try again.');
      }

      const { buildTestPaperParts } = await import('../../services/testBuilderDocx');
      const parts = buildTestPaperParts(allItems, deriveLanguage(store.subject));
      store.setGeneratedParts(parts);
      if (user?.uid && store.sessionId) {
        updateTestSession(user.uid, store.sessionId, {
          generatedParts: parts,
          status: 'tos_generated',
        }).catch((e) => console.error('Failed to auto-save generated parts:', e));
        store.setField('status', 'tos_generated');
      }

      // Partial success is still success — the teacher keeps the items that did
      // generate, and is told exactly which competencies to regenerate rather
      // than being made to rerun the whole test.
      if (failedRows.length > 0) {
        const names = failedRows.map(f => `#${f.index} ${f.label}`).join(', ');
        const why   = failedRows[0]?.err?.quotaExhausted
          ? " Today's AI quota is used up — it resets at midnight."
          : '';
        setGenError(
          `Generated ${allItems.length} item${allItems.length === 1 ? '' : 's'}, but ` +
          `${failedRows.length} competenc${failedRows.length === 1 ? 'y' : 'ies'} could not be written (${names}).` +
          `${why} Your completed items are saved — regenerate to fill the gaps.`
        );
      }
      addToast(
        freeMode ? 'Test items generated! You can now download.' : `Test items generated! (${GENERATE_ITEMS_COST} tokens used) You can now download.`,
        'success'
      );
      trackEvent(user.uid, 'test_builder_items_generated', { subject: store.subject, grade: store.gradeLevel });
      trackGeneration(user.uid, 'test_builder_items', { success: true, durationMs: elapsedMs() });
    } catch (err) {
      setGenError(err.message || 'Item generation failed. Please try again.');
      if (tokensDeducted) {
        refundTokens(user.uid, 'test_builder_generate_doc', GENERATE_ITEMS_COST).catch(e => console.error('Token refund failed:', e));
      }
      if (elapsedMs) {
        trackGeneration(user.uid, 'test_builder_items', { success: false, durationMs: elapsedMs(), error: err.message });
      }
    } finally {
      setGenLoading(false);
      setGenPhase('');
    }
  }

  async function handleDownload(kind) {
    setDownloadingKind(kind);
    try {
      const { downloadTosDocx, downloadTestQuestionsDocx, downloadAnswerKeyDocx } = await import('../../services/testBuilderDocx');
      if (kind === 'tos') {
        await downloadTosDocx({ tos: store.tos, itemCeiling, meta: docMeta, profile: teacherProfile });
      } else if (kind === 'questions') {
        await downloadTestQuestionsDocx({ testBlocks: generatedParts.testBlocks, meta: docMeta, profile: teacherProfile });
      } else if (kind === 'key') {
        await downloadAnswerKeyDocx({ keyBlocks: generatedParts.keyBlocks, meta: docMeta, profile: teacherProfile });
      }
    } catch (err) {
      setGenError(err.message || 'Download failed. Please try again.');
    } finally {
      setDownloadingKind(null);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, paddingBottom: 32 }}>
      <DownloadProgress active={downloadingKind !== null} label={DOWNLOAD_LABELS[downloadingKind] ?? 'Test document (DOCX)'} />

      <div>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'var(--kt-green-tint)', color: 'var(--kt-green-dark)',
          borderRadius: 20, padding: '4px 12px',
          fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px',
        }}>
          <ClipboardCheck size={12} /> Review
        </span>
        <h2 style={{ margin: '10px 0 6px', fontSize: 22, fontWeight: 700, color: 'var(--kt-text-primary)' }}>
          Review before confirming
        </h2>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--kt-text-secondary)', lineHeight: 1.65, maxWidth: 560 }}>
          Everything below is traceable back to what you entered — nothing here is a black box.
        </p>
      </div>

      {/* Overview card */}
      <div className="card card-accent">
        <p style={sectionLabel}>Overview</p>
        <div className="kt-grid-4" style={{ gap: 14 }}>
          <ReviewField label="Grade Level" value={store.gradeLevel || '—'} />
          <ReviewField label="Subject" value={store.subject || '—'} />
          <ReviewField label="Test Type" value={store.testType} />
          <ReviewField label="Key Stage" value={keyStage ? KEY_STAGE_LABELS[keyStage] : '—'} />
        </div>
        <div className="kt-grid-2" style={{ marginTop: 14, gap: 14 }}>
          <ReviewField label="Terms" value={store.terms.length ? store.terms.join(', ') : '—'} />
          <ReviewField label="Question Formats" value={store.questionFormats.length ? store.questionFormats.join(', ') : '—'} />
        </div>
        {store.contextNotes?.trim() && (
          <div style={{ marginTop: 14 }}>
            <ReviewField label="Context Box" value={store.contextNotes} />
          </div>
        )}
      </div>

      {/* Competencies card */}
      <div className="card">
        <p style={sectionLabel}>Competencies ({totalDays(store.competencies.map((c) => c.days))} / 50 days)</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {store.competencies.map((c, i) => (
            <div key={c.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '9px 12px', borderRadius: 9, background: 'var(--kt-card-2)',
            }}>
              <span style={{ fontSize: 13, color: 'var(--kt-text-primary)' }}>
                {c.text?.trim() || <span style={{ fontStyle: 'italic', color: 'var(--kt-muted)' }}>Untitled competency {i + 1}</span>}
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, fontFamily: '"DM Mono", monospace', color: 'var(--kt-green-primary)', flexShrink: 0, marginLeft: 12 }}>
                {c.days}d
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Cognitive weights card */}
      <div className="card">
        <p style={sectionLabel}>Cognitive Weight Breakdown</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {COGNITIVE_LEVELS.map((l) => {
            const pct = store.cognitiveWeights[l.key] || 0;
            return (
              <div key={l.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--kt-text-primary)', width: 110, flexShrink: 0 }}>{l.label}</span>
                <div className="progress-track" style={{ flex: 1, height: 7 }}>
                  <div className="progress-fill" style={{
                    height: '100%', width: `${pct}%`,
                    background: l.hots ? 'linear-gradient(90deg, #7c3aed, #a78bfa)' : 'linear-gradient(90deg, #2d6a4f, #52b788)',
                  }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 800, fontFamily: '"DM Mono", monospace', color: 'var(--kt-text-secondary)', width: 34, textAlign: 'right' }}>{pct}%</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* TOS summary */}
      <div className="card">
        <p style={sectionLabel}>Table of Specifications</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1, textAlign: 'center', background: 'var(--kt-card-2)', borderRadius: 10, padding: '12px 8px' }}>
            <p style={{ margin: 0, fontSize: 20, fontWeight: 800, fontFamily: '"DM Mono", monospace', color: 'var(--kt-green-primary)' }}>{grandTotal}</p>
            <p style={{ margin: '2px 0 0', fontSize: 10, fontWeight: 700, color: 'var(--kt-text-secondary)', textTransform: 'uppercase', letterSpacing: '1px' }}>of {itemCeiling} items</p>
          </div>
          <div style={{
            flex: 2, display: 'flex', alignItems: 'center', gap: 8, borderRadius: 10, padding: '12px 14px',
            background: hotsOk ? 'var(--kt-green-tint)' : 'rgba(232,163,32,0.14)',
          }}>
            {hotsOk ? <CheckCircle2 size={16} color="var(--kt-green-dark)" /> : <AlertTriangle size={16} color="#b47a10" />}
            <span style={{ fontSize: 12, fontWeight: 600, color: hotsOk ? 'var(--kt-green-dark)' : '#92400e' }}>
              {store.tos.hotsCount} HOTS items · {Math.round(store.tos.hotsPct)}% (floor {hotsFloor}%)
            </span>
          </div>
        </div>
      </div>

      {store.status === 'tos_generated' && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, background: 'var(--kt-green-tint)',
          borderRadius: 10, padding: '10px 16px',
        }}>
          <BadgeCheck size={16} color="var(--kt-green-dark)" />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--kt-green-dark)' }}>
            This TOS has been saved. You can confirm again to re-save any later edits.
          </span>
        </div>
      )}

      {/* Generate + download outputs */}
      <div style={{
        background: 'linear-gradient(135deg, #0d2218 0%, #1a3d2b 55%, #2d6a4f 100%)',
        borderRadius: 14, padding: '20px 22px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: generatedParts ? 18 : 0 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0, display: 'grid', placeItems: 'center',
            background: 'linear-gradient(135deg, #52b788, #2d6a4f)',
          }}>
            <Sparkles size={20} color="#fff" />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ margin: '0', fontSize: 14, fontWeight: 800, color: '#fff' }}>Generate Test Items with AI</p>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: 'rgba(216,243,220,0.8)', lineHeight: 1.5 }}>
              AI writes items for exactly the counts in your TOS, using only your selected Question Format(s).{freeMode ? '' : ` (${GENERATE_ITEMS_COST} tokens)`}
            </p>
          </div>
          <button
            onClick={handleGenerateItems}
            disabled={!canGenerateItems}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, flexShrink: 0,
              background: canGenerateItems ? '#fff' : 'rgba(255,255,255,0.12)',
              color: canGenerateItems ? '#1a3d2b' : 'rgba(255,255,255,0.5)',
              border: 'none', borderRadius: 10, padding: '11px 18px',
              fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
              cursor: canGenerateItems ? 'pointer' : 'not-allowed',
            }}
          >
            {genLoading
              ? <><Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> {genPhase || 'Generating…'}</>
              : canGenerateItems
                ? <><Sparkles size={14} /> {generatedParts ? 'Regenerate' : 'Generate Items'}</>
                : <><Lock size={14} /> Locked</>}
          </button>
        </div>

        {genLoading && (
          <div style={{ marginTop: 12 }}>
            <div style={{ height: 6, background: 'rgba(255,255,255,0.18)', borderRadius: 100, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${shownProgress}%`, borderRadius: 100,
                background: '#fff', transition: 'width 0.25s linear',
              }} />
            </div>
            <p style={{ margin: '6px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.75)' }}>
              {shownProgress}% — {genPhase || 'Generating test items…'}
            </p>
          </div>
        )}

        {/* Three independent downloads */}
        <div className="kt-grid-3" style={{ gap: 10 }}>
          <DownloadButton
            icon={Table2} label="TOS" sub="Table of Specifications"
            enabled={canDownloadTos} loading={downloadingKind === 'tos'}
            onClick={() => handleDownload('tos')}
          />
          <DownloadButton
            icon={FileText} label="Test Questions" sub="The actual test"
            enabled={!!generatedParts} loading={downloadingKind === 'questions'}
            onClick={() => handleDownload('questions')}
          />
          <DownloadButton
            icon={KeyRound} label="Answer Key" sub="Matches the test"
            enabled={!!generatedParts} loading={downloadingKind === 'key'}
            onClick={() => handleDownload('key')}
          />
        </div>
      </div>

      {genError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fde8e8', borderRadius: 10, padding: '10px 14px' }}>
          <AlertCircle size={15} color="var(--kt-danger)" style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 12, color: 'var(--kt-danger)', fontWeight: 600 }}>{genError}</span>
          <button onClick={() => setGenError('')} aria-label="Dismiss error" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--kt-danger)', padding: 2 }}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function ReviewField({ label, value }) {
  return (
    <div>
      <p style={{ margin: '0 0 3px', fontSize: 10, fontWeight: 700, color: 'var(--kt-text-secondary)', textTransform: 'uppercase', letterSpacing: '1px' }}>{label}</p>
      <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--kt-text-primary)' }}>{value}</p>
    </div>
  );
}

function DownloadButton({ icon: Icon, label, sub, enabled, loading, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={!enabled || loading}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        background: enabled ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${enabled ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 11, padding: '14px 10px',
        cursor: enabled && !loading ? 'pointer' : 'not-allowed',
        fontFamily: 'inherit', transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => { if (enabled && !loading) e.currentTarget.style.background = 'rgba(255,255,255,0.14)'; }}
      onMouseLeave={(e) => { if (enabled && !loading) e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
    >
      {loading
        ? <Loader2 size={17} color="#fff" style={{ animation: 'spin 0.8s linear infinite' }} />
        : <Icon size={17} color={enabled ? '#fff' : 'rgba(255,255,255,0.4)'} />}
      <span style={{ fontSize: 12, fontWeight: 700, color: enabled ? '#fff' : 'rgba(255,255,255,0.4)' }}>{label}</span>
      <span style={{ fontSize: 10, color: enabled ? 'rgba(216,243,220,0.7)' : 'rgba(255,255,255,0.3)' }}>{sub}</span>
    </button>
  );
}
