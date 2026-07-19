import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getQuiz } from '../services/db';
import { createScan, getScansForQuiz, confirmScan, deleteScan } from '../services/scansDb';
import { scanAnswerSheet } from '../services/scanAI';
import { uploadFile } from '../services/storageService';
import { gradeScan } from '../utils/scanGrading';
import { trackEvent } from '../services/usageTracker';
import { useToast } from '../context/ToastContext';
import SendToGradebookModal from '../components/SendToGradebookModal';
import {
  Camera, Loader2, CheckCircle, AlertCircle, ArrowLeft,
  Trash2, ImageOff, ScanLine, X, Send,
} from 'lucide-react';

const LETTERS = { 4: ['A', 'B', 'C', 'D'], 5: ['A', 'B', 'C', 'D', 'E'] };

const REASON_MESSAGES = {
  truncated:      'The AI response was cut off. Try re-uploading this sheet.',
  invalid_json:   'The AI returned an unexpected format. Try re-uploading this sheet.',
  empty_response: 'The AI returned no content. Try re-uploading this sheet.',
  safety_block:   'This photo was blocked by the content filter. Try a clearer photo.',
  api_error:      'AI service error. Try re-uploading this sheet.',
};

function describeError(err) {
  return REASON_MESSAGES[err?.reason] || err?.message || 'Could not read this sheet.';
}

/* ── Per-scan review card ─────────────────────────────────────────────── */
function ScanReviewCard({ scan, quiz, onConfirm, onDelete }) {
  const letters = LETTERS[quiz.numChoices] || LETTERS[4];
  const baseAnswers = scan.reviewedAnswers || scan.detectedAnswers || {};
  const [answers, setAnswers] = useState(baseAnswers);
  const [name, setName] = useState(scan.studentName || '');
  const [saving, setSaving] = useState(false);

  const { score, total } = gradeScan(answers, quiz.answerKey);
  const confirmed = scan.status === 'confirmed';
  const dirty = JSON.stringify(answers) !== JSON.stringify(baseAnswers) || name !== (scan.studentName || '');

  function setAnswer(num, value) {
    setAnswers(prev => ({ ...prev, [String(num)]: value || null }));
  }

  async function handleConfirm() {
    setSaving(true);
    try {
      await onConfirm(scan, { answers, name, score, total });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      background: 'var(--kt-card)', borderRadius: 14,
      border: `1px solid ${confirmed && !dirty ? 'rgba(45,106,79,0.25)' : 'var(--kt-border)'}`,
      padding: 18,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flex: 1, minWidth: 220 }}>
          {scan.imageURL ? (
            <a href={scan.imageURL} target="_blank" rel="noreferrer">
              <img
                src={scan.imageURL}
                alt="Scanned sheet"
                style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--kt-border)' }}
              />
            </a>
          ) : (
            <div style={{ width: 56, height: 56, borderRadius: 8, background: 'var(--kt-surface)', display: 'grid', placeItems: 'center' }}>
              <ImageOff size={18} color="var(--kt-text-secondary)" />
            </div>
          )}
          <div style={{ flex: 1, minWidth: 160 }}>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Student No. / Name"
              className="input"
              style={{ fontSize: 13, fontWeight: 600, padding: '6px 10px', marginBottom: 4 }}
            />
            <p style={{ margin: 0, fontSize: 11, color: 'var(--kt-text-secondary)' }}>
              {scan.section ? `Section ${scan.section} · ` : ''}
              {confirmed && !dirty
                ? <span style={{ color: '#2d6a4f', fontWeight: 700 }}>Confirmed</span>
                : <span style={{ color: '#e8a320', fontWeight: 700 }}>Pending review</span>}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{ textAlign: 'right' }}>
            <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--kt-text-primary)', fontFamily: '"DM Mono", monospace' }}>
              {score}/{total}
            </p>
          </div>
          <button
            onClick={() => onDelete(scan)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: '#e05c5c' }}
            title="Delete scan"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {/* Answer grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))', gap: 6, marginBottom: 14 }}>
        {quiz.answerKey.map((correct, i) => {
          const num = i + 1;
          const detected = answers[String(num)] ?? null;
          const uncertain = (scan.uncertainItems || []).includes(String(num));
          const isCorrect = !!detected && detected === correct;
          const bg = uncertain ? '#fef3c7' : detected == null ? 'var(--kt-surface)' : isCorrect ? '#d8f3dc' : '#fde8e8';
          const border = uncertain ? '#e8a320' : detected == null ? 'var(--kt-border)' : isCorrect ? 'rgba(45,106,79,0.3)' : 'rgba(224,92,92,0.3)';
          return (
            <div key={num} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 8, padding: '4px 6px', textAlign: 'center' }}>
              <p style={{ margin: '0 0 2px', fontSize: 9, fontWeight: 700, color: 'var(--kt-text-secondary)' }}>{num}</p>
              <select
                value={detected || ''}
                onChange={e => setAnswer(num, e.target.value)}
                style={{
                  width: '100%', fontSize: 12, fontWeight: 700, textAlign: 'center',
                  border: 'none', background: 'transparent', color: 'var(--kt-text-primary)',
                  cursor: 'pointer',
                }}
              >
                <option value="">—</option>
                {letters.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          );
        })}
      </div>

      <button
        onClick={handleConfirm}
        disabled={saving || (confirmed && !dirty)}
        className={dirty || !confirmed ? 'btn-primary' : 'btn-outline'}
        style={{ fontSize: 13, padding: '8px 16px' }}
      >
        {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={14} />}
        {confirmed && !dirty ? 'Confirmed' : 'Confirm & Save Score'}
      </button>
    </div>
  );
}

/* ── Main page ─────────────────────────────────────────────────────────── */
export default function ScanAnswerSheetsPage() {
  const { quizId } = useParams();
  const navigate    = useNavigate();
  const { user }    = useAuth();
  const { addToast } = useToast();
  const fileInputRef = useRef(null);

  const [quiz,        setQuiz]        = useState(null);
  const [loadingQuiz,  setLoadingQuiz] = useState(true);
  const [scans,        setScans]      = useState([]);
  const [processing,   setProcessing] = useState([]);
  const [showGradebookModal, setShowGradebookModal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const q = await getQuiz(user.uid, quizId);
      if (!cancelled) { setQuiz(q); setLoadingQuiz(false); }
    })();
    return () => { cancelled = true; };
  }, [user.uid, quizId]);

  const refreshScans = useCallback(async () => {
    const list = await getScansForQuiz(user.uid, quizId);
    setScans(list);
  }, [user.uid, quizId]);

  useEffect(() => { refreshScans(); }, [refreshScans]);

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []);
    for (const file of files) {
      const key = `${file.name}-${file.lastModified}`;
      setProcessing(prev => [...prev, { key, name: file.name, status: 'uploading', error: null }]);

      try {
        const { storagePath, downloadURL } = await uploadFile(user.uid, file);
        setProcessing(prev => prev.map(p => p.key === key ? { ...p, status: 'reading' } : p));

        let result;
        let lastErr;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            result = await scanAnswerSheet(file, { numQuestions: quiz.numQuestions, numChoices: quiz.numChoices });
            break;
          } catch (err) {
            lastErr = err;
            console.warn(`scanAnswerSheet (${file.name}) attempt ${attempt + 1} failed:`, err);
            if (err.dailyLimit) break;
            if (attempt < 2) {
              const wait = err.status === 429
                ? Math.min((err.retryAfter || 30) * 1000, 30_000)
                : 5000 + attempt * 3000;
              setProcessing(prev => prev.map(p => p.key === key
                ? { ...p, status: 'reading', note: `Due to high demand, retrying in ${Math.round(wait / 1000)}s…` }
                : p));
              await new Promise(r => setTimeout(r, wait));
            }
          }
        }
        if (!result) throw lastErr || new Error('Could not read this sheet.');

        const { score, total } = gradeScan(result.answers, quiz.answerKey);

        await createScan(user.uid, quizId, {
          studentName:     result.studentNo || '',
          section:         result.section || '',
          imagePath:       storagePath,
          imageURL:        downloadURL,
          detectedAnswers: result.answers,
          uncertainItems:  result.uncertain,
          score, total,
        });

        trackEvent(user.uid, 'answer_sheet_scanned', { quizId });
        setProcessing(prev => prev.filter(p => p.key !== key));
      } catch (err) {
        console.warn('Scan failed:', file.name, err);
        setProcessing(prev => prev.map(p => p.key === key ? { ...p, status: 'error', error: describeError(err) } : p));
      }
    }
    await refreshScans();
  }

  async function handleConfirm(scan, { answers, name, score, total }) {
    await confirmScan(user.uid, quizId, scan.id, { reviewedAnswers: answers, score, total });
    if (name !== scan.studentName) {
      // studentName is display-only metadata, kept alongside reviewedAnswers
      scan.studentName = name;
    }
    await refreshScans();
    addToast('Scan confirmed and scored.', 'success');
  }

  async function handleDelete(scan) {
    await deleteScan(user.uid, quizId, scan.id);
    await refreshScans();
  }

  if (loadingQuiz) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '48px 0', justifyContent: 'center', color: 'var(--kt-text-secondary)' }}>
        <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
        <span style={{ fontSize: 13 }}>Loading quiz…</span>
      </div>
    );
  }

  if (!quiz) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 24px' }}>
        <AlertCircle size={28} color="#e05c5c" style={{ marginBottom: 10 }} />
        <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--kt-text-primary)' }}>Quiz not found</p>
        <button className="btn-outline" style={{ marginTop: 16 }} onClick={() => navigate('/quiz-builder')}>
          <ArrowLeft size={14} /> Back to Quiz Builder
        </button>
      </div>
    );
  }

  const confirmedCount = scans.filter(s => s.status === 'confirmed').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 900, margin: '0 auto' }}>

      {/* Header */}
      <div>
        <button
          onClick={() => navigate('/quiz-builder')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--kt-text-secondary)', fontSize: 12, marginBottom: 10, padding: 0 }}
        >
          <ArrowLeft size={13} /> Back to Quiz Builder
        </button>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: 'var(--kt-text-primary)' }}>Scan Answer Sheets</h1>
            <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--kt-text-secondary)' }}>
              {quiz.title} · {quiz.numQuestions}Q · {scans.length} scanned
              {scans.length > 0 ? ` · ${confirmedCount} confirmed` : ''}
            </p>
          </div>
          {confirmedCount > 0 && (
            <button className="btn-primary" onClick={() => setShowGradebookModal(true)} style={{ fontSize: 13 }}>
              <Send size={14} /> Send to Gradebook
            </button>
          )}
        </div>
      </div>

      {showGradebookModal && (
        <SendToGradebookModal
          uid={user.uid}
          quiz={quiz}
          scans={scans.filter(s => s.status === 'confirmed')}
          onClose={() => setShowGradebookModal(false)}
          onRecorded={refreshScans}
        />
      )}

      {/* Upload control */}
      <div style={{
        background: 'var(--kt-card)', borderRadius: 14, border: '2px dashed rgba(45,106,79,0.25)',
        padding: '28px', textAlign: 'center',
      }}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          style={{ display: 'none' }}
          onChange={e => { handleFiles(e.target.files); e.target.value = ''; }}
        />
        <div style={{ width: 48, height: 48, borderRadius: 12, background: '#d8f3dc', display: 'grid', placeItems: 'center', margin: '0 auto 12px' }}>
          <Camera size={22} color="#2d6a4f" />
        </div>
        <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: 'var(--kt-text-primary)' }}>
          Take a photo or upload scanned sheets
        </p>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--kt-text-secondary)' }}>
          One photo per student · you can select multiple files at once
        </p>
        <button className="btn-primary" onClick={() => fileInputRef.current?.click()}>
          <Camera size={14} /> Scan Sheets
        </button>
      </div>

      {/* Processing queue */}
      {processing.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {processing.map(p => (
            <div key={p.key} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
              borderRadius: 10, background: p.status === 'error' ? '#fde8e8' : 'var(--kt-surface)',
              border: `1px solid ${p.status === 'error' ? 'rgba(224,92,92,0.25)' : 'var(--kt-border)'}`,
            }}>
              {p.status === 'error'
                ? <AlertCircle size={15} color="#e05c5c" style={{ flexShrink: 0 }} />
                : <Loader2 size={15} style={{ animation: 'spin 1s linear infinite', flexShrink: 0, color: '#2d6a4f' }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: 'var(--kt-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.name}
                </p>
                <p style={{ margin: 0, fontSize: 11, color: p.status === 'error' ? '#e05c5c' : 'var(--kt-text-secondary)' }}>
                  {p.status === 'uploading' ? 'Uploading…' : p.status === 'reading' ? (p.note || 'AI reading answers…') : p.error}
                </p>
              </div>
              {p.status === 'error' && (
                <button
                  onClick={() => setProcessing(prev => prev.filter(x => x.key !== p.key))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--kt-text-secondary)' }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Scan review list */}
      {scans.length === 0 && processing.length === 0 ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '48px 24px', background: 'var(--kt-surface)', borderRadius: 12,
          border: '2px dashed rgba(45,106,79,0.18)', gap: 10, textAlign: 'center',
        }}>
          <ScanLine size={28} color="#2d6a4f" />
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--kt-text-primary)' }}>No sheets scanned yet</p>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--kt-text-secondary)' }}>Scan a sheet above to see AI-graded results here.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {scans.map(scan => (
            <ScanReviewCard
              key={scan.id}
              scan={scan}
              quiz={quiz}
              onConfirm={handleConfirm}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
