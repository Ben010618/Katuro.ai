import { useEffect, useState } from 'react';
import { useTestBuilderStore } from '../../store/testBuilderStore';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../context/ToastContext';
import { getTeacherProfile, deductTokens } from '../../services/db';
import { generateItemsForCompetency } from '../../services/testBuilderItemsAI';
import { buildTestPaperParts, downloadTestQuestionsDocx, downloadAnswerKeyDocx, downloadTosDocx } from '../../services/testBuilderDocx';
import { COGNITIVE_LEVELS, deriveKeyStage, deriveHotsFloor, deriveLanguage, KEY_STAGE_LABELS, resolveItemCeiling } from '../../config/testBuilderConfig';
import { totalDays } from '../../utils/testBuilderCalc';
import { trackEvent, trackGeneration, startTimer } from '../../services/usageTracker';
import {
  ClipboardCheck, CheckCircle2, AlertTriangle, BadgeCheck,
  FileText, KeyRound, Table2, Sparkles, Loader2, AlertCircle, X, Lock,
} from 'lucide-react';

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
  const hotsOk = store.tos.hotsPct >= hotsFloor;
  const grandTotal = store.tos.columnTotals.reduce((a, b) => a + b, 0);

  const [teacherProfile,  setTeacherProfile]  = useState(null);
  const [genLoading,      setGenLoading]      = useState(false);
  const [genPhase,        setGenPhase]        = useState('');
  const [genError,        setGenError]        = useState('');
  const [generatedParts,  setGeneratedParts]  = useState(null); // { testBlocks, keyBlocks } — cached so both downloads agree
  const [downloadingKind, setDownloadingKind] = useState(null); // 'tos' | 'questions' | 'key' | null

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

  const canGenerateItems = store.status === 'tos_generated' && grandTotal > 0 && !genLoading;
  const canDownloadTos   = store.status === 'tos_generated' && grandTotal > 0;

  async function handleGenerateItems() {
    if (!canGenerateItems || !user?.uid) return;
    setGenLoading(true);
    setGenError('');
    setGeneratedParts(null);
    let elapsedMs;
    try {
      setGenPhase(freeMode ? 'Preparing…' : 'Checking tokens…');
      await deductTokens(user.uid, 'test_builder_generate_doc', GENERATE_ITEMS_COST);
      elapsedMs = startTimer();

      const allItems = [];
      let cursor = 0;
      for (let i = 0; i < store.tos.rows.length; i++) {
        const row = store.tos.rows[i];
        if (row.total === 0) continue;
        setGenPhase(`Writing items for competency ${i + 1} of ${store.tos.rows.length}…`);
        const { items, nextIndex } = await generateItemsForCompetency({
          competencyText: row.label,
          cells: row.cells,
          subject: store.subject,
          gradeLevel: store.gradeLevel,
          questionFormats: store.questionFormats,
          proficiencyLevel: store.proficiencyLevel,
          contextNotes: store.contextNotes,
          startIndex: cursor,
        });
        allItems.push(...items);
        cursor = nextIndex;
      }

      setGeneratedParts(buildTestPaperParts(allItems, deriveLanguage(store.subject)));
      addToast(
        freeMode ? 'Test items generated! You can now download.' : `Test items generated! (${GENERATE_ITEMS_COST} tokens used) You can now download.`,
        'success'
      );
      trackEvent(user.uid, 'test_builder_items_generated', { subject: store.subject, grade: store.gradeLevel });
      trackGeneration(user.uid, 'test_builder_items', { success: true, durationMs: elapsedMs() });
    } catch (err) {
      setGenError(err.message || 'Item generation failed. Please try again.');
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          <ReviewField label="Grade Level" value={store.gradeLevel || '—'} />
          <ReviewField label="Subject" value={store.subject || '—'} />
          <ReviewField label="Test Type" value={store.testType} />
          <ReviewField label="Key Stage" value={keyStage ? KEY_STAGE_LABELS[keyStage] : '—'} />
        </div>
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
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
            <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#fff' }}>Generate Test Items with AI</p>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: 'rgba(216,243,220,0.8)', lineHeight: 1.5 }}>
              {store.status === 'tos_generated'
                ? `AI writes items for exactly the counts in your TOS, using only your selected Question Format(s).${freeMode ? '' : ` (${GENERATE_ITEMS_COST} tokens)`}`
                : 'Confirm and Save first to unlock item generation.'}
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

        {/* Three independent downloads */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
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
