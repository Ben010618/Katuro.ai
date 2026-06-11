import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Printer } from 'lucide-react';

// ── Constants ────────────────────────────────────────────────────────────────

const LETTERS = { 4: ['A', 'B', 'C', 'D'], 5: ['A', 'B', 'C', 'D', 'E'] };
const DIGITS  = [0, 1, 2, 3, 4, 5];

export const A4_PX_W = 748;  // 198mm at 96dpi
export const A4_PX_H = 1077; // 285mm at 96dpi

// 5 items → 6 per A4 (3 col), everything else → 4 per A4 (2 col)
function getLayout(numQ) {
  if (numQ <= 5) return { cols: 3, perPage: 6 };
  return { cols: 2, perPage: 4 };
}

// Per-layout size config: answer bubbles + identity bubbles
function getCfg(cols) {
  if (cols === 3) return {
    ans:  { bub: '3.2mm', gap: '0.7mm', numW: '4.5mm', rowH: '4.8mm', hdrFs: '6pt' },
    id:   { bub: '2.6mm', gap: '0.5mm', numW: '3.5mm', rowH: '3.4mm', fs: '5pt', hdrFs: '4.8pt' },
    fs:   '5.5pt',
  };
  return {
    ans:  { bub: '3.8mm', gap: '0.9mm', numW: '5.5mm', rowH: '5.2mm', hdrFs: '7pt' },
    id:   { bub: '3.0mm', gap: '0.6mm', numW: '4.0mm', rowH: '3.8mm', fs: '5.5pt', hdrFs: '5.5pt' },
    fs:   '6.5pt',
  };
}

// ── Sub-components ───────────────────────────────────────────────────────────

// L-bracket anchor mark — oriented per corner, used for perspective correction
function LBracket({ corner }) {
  const SIZE = '5mm';
  const THICK = '1.1mm';
  const POS = '1.5mm';
  const borders = {
    tl: { borderTop: `${THICK} solid #000`, borderLeft:  `${THICK} solid #000`, top:    POS, left:   POS },
    tr: { borderTop: `${THICK} solid #000`, borderRight: `${THICK} solid #000`, top:    POS, right:  POS },
    bl: { borderBottom: `${THICK} solid #000`, borderLeft:  `${THICK} solid #000`, bottom: POS, left:   POS },
    br: { borderBottom: `${THICK} solid #000`, borderRight: `${THICK} solid #000`, bottom: POS, right:  POS },
  };
  return (
    <div style={{
      position: 'absolute', width: SIZE, height: SIZE,
      ...borders[corner],
    }} />
  );
}

// One group of digit columns (Student No / Section / Quiz No)
function DigitCols({ label, numCols, cfg }) {
  const { bub, gap, numW, rowH, fs, hdrFs } = cfg.id;
  const colW = `calc(${bub} + ${gap})`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Group label */}
      <div style={{
        textAlign: 'center', fontSize: hdrFs, fontWeight: 700,
        borderBottom: '0.2mm solid #888', paddingBottom: '0.3mm', marginBottom: '0.3mm',
        whiteSpace: 'nowrap', overflow: 'hidden',
      }}>
        {label}
      </div>
      {/* Column position headers */}
      <div style={{ display: 'flex', paddingLeft: numW }}>
        {Array.from({ length: numCols }, (_, i) => (
          <div key={i} style={{ width: colW, textAlign: 'center', fontSize: fs, fontWeight: 700 }}>
            {i + 1}
          </div>
        ))}
      </div>
      {/* Digit rows 0–5 */}
      {DIGITS.map(d => (
        <div key={d} style={{ display: 'flex', alignItems: 'center', height: rowH }}>
          <span style={{ width: numW, textAlign: 'right', paddingRight: '0.7mm', fontSize: fs, fontWeight: 700, flexShrink: 0 }}>
            {d}
          </span>
          <div style={{ display: 'flex', gap }}>
            {Array.from({ length: numCols }, (_, i) => (
              <div key={i} style={{ width: bub, height: bub, borderRadius: '50%', border: '0.4mm solid #222', flexShrink: 0 }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// One full bubble sheet
function Sheet({ numQ, numChoices, cols }) {
  const letters = LETTERS[numChoices] || LETTERS[4];
  const half    = Math.ceil(numQ / 2);
  const col1    = Array.from({ length: half },      (_, i) => i + 1);
  const col2    = Array.from({ length: numQ - half }, (_, i) => half + i + 1);
  const cfg     = getCfg(cols);
  const { ans, fs } = cfg;
  const ansColW = `calc(${ans.bub} + ${ans.gap})`;

  return (
    <div style={{
      position: 'relative',
      border: '0.3mm solid #bbb',
      borderRadius: '1.5mm',
      padding: '4mm 3.5mm 3.5mm',
      fontFamily: 'Arial, Helvetica, sans-serif',
      background: '#fff',
      breakInside: 'avoid',
      pageBreakInside: 'avoid',
      boxSizing: 'border-box',
    }}>
      {/* ── L-bracket anchor marks ── */}
      <LBracket corner="tl" />
      <LBracket corner="tr" />
      <LBracket corner="bl" />
      <LBracket corner="br" />

      {/* ── Name / Date header ── */}
      <div style={{ border: '0.4mm solid #000', borderRadius: '1mm', overflow: 'hidden', marginBottom: '2mm' }}>
        <div style={{ display: 'flex', height: '6mm', borderBottom: '0.3mm solid #000', alignItems: 'stretch' }}>
          <div style={{ width: '10mm', flexShrink: 0, background: '#ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '5.5pt', borderRight: '0.3mm solid #000' }}>Name</div>
          <div style={{ flex: 1 }} />
        </div>
        <div style={{ display: 'flex', height: '4.5mm', alignItems: 'stretch' }}>
          <div style={{ width: '10mm', flexShrink: 0, background: '#ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '5.5pt', borderRight: '0.3mm solid #000' }}>Date</div>
          <div style={{ flex: 1, borderRight: '0.3mm solid #000' }} />
          <div style={{ width: '14mm', flexShrink: 0, background: '#ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '5.5pt', borderRight: '0.3mm solid #000' }}>Period</div>
          <div style={{ width: '14mm', flexShrink: 0 }} />
        </div>
      </div>

      {/* ── Identity OMR zone ── */}
      <div style={{
        border: '0.25mm solid #ccc', borderRadius: '1mm', padding: '1.5mm 2mm',
        marginBottom: '2mm', background: '#fcfcfc',
      }}>
        <div style={{ display: 'flex', gap: '2mm', alignItems: 'flex-start', justifyContent: 'center' }}>
          <DigitCols label="STUDENT NO." numCols={4} cfg={cfg} />
          <div style={{ width: '0.2mm', background: '#ccc', alignSelf: 'stretch', margin: '0 1mm' }} />
          <DigitCols label="SECTION"    numCols={3} cfg={cfg} />
          <div style={{ width: '0.2mm', background: '#ccc', alignSelf: 'stretch', margin: '0 1mm' }} />
          <DigitCols label="QUIZ NO."   numCols={2} cfg={cfg} />
        </div>
      </div>

      {/* ── Answer bubble zone ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2mm' }}>
        {[col1, col2].map((col, ci) => col.length > 0 && (
          <div key={ci}>
            {/* Letter headers */}
            <div style={{ display: 'flex', paddingLeft: ans.numW, marginBottom: '0.5mm' }}>
              {letters.map(l => (
                <div key={l} style={{ width: ansColW, textAlign: 'center', fontWeight: 700, fontSize: ans.hdrFs }}>
                  {l}
                </div>
              ))}
            </div>
            {/* Answer rows */}
            {col.map(n => (
              <div key={n} style={{ display: 'flex', alignItems: 'center', height: ans.rowH }}>
                <span style={{ width: ans.numW, textAlign: 'right', paddingRight: '0.8mm', fontWeight: 700, fontSize: ans.hdrFs, flexShrink: 0 }}>
                  {n}
                </span>
                <div style={{ display: 'flex', gap: ans.gap }}>
                  {letters.map(l => (
                    <div key={l} style={{ width: ans.bub, height: ans.bub, borderRadius: '50%', border: '0.45mm solid #222', flexShrink: 0 }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* ── Footer: test version + branding ── */}
      <div style={{ marginTop: '1.5mm', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'nowrap' }}>
          <span style={{ fontSize: '4.5pt', color: '#666', marginRight: '0.8mm' }}>Test Ver.</span>
          {['A', 'B', 'C', 'D'].map(v => (
            <span key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3mm', marginRight: '0.8mm' }}>
              <span style={{ fontSize: '5pt', fontWeight: 700 }}>{v}</span>
              <div style={{ width: '2.5mm', height: '2.5mm', borderRadius: '50%', border: '0.35mm solid #555' }} />
            </span>
          ))}
        </div>
        <span style={{ fontSize: '4.5pt', color: '#888' }}>
          <b style={{ color: '#163828' }}>kaTuro</b>
          <span style={{ color: '#4CAF50' }}>.ai</span>
        </span>
      </div>
    </div>
  );
}

// ── Exported: standalone A4 preview (no modal/print logic) ───────────────────

export function BubbleSheetPreview({ numQ, numChoices, width = 300 }) {
  const layout = getLayout(numQ);
  const sheets  = Array.from({ length: layout.perPage });
  const scale   = width / A4_PX_W;

  return (
    <div style={{ width, height: Math.round(A4_PX_H * scale), overflow: 'hidden', background: '#fff', borderRadius: 4 }}>
      <div style={{ width: A4_PX_W, height: A4_PX_H, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        <div style={{ width: '198mm', minHeight: '285mm', display: 'grid', gridTemplateColumns: `repeat(${layout.cols}, 1fr)`, gap: '3mm', alignContent: 'start', background: '#fff', padding: '4mm', boxSizing: 'border-box' }}>
          {sheets.map((_, i) => (
            <Sheet key={i} numQ={numQ} numChoices={numChoices} cols={layout.cols} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Default export: full print modal ─────────────────────────────────────────

export default function BubbleSheetPrint({ quiz, onClose, autoprint = false }) {
  const { numQuestions, numChoices, title } = quiz;
  const layout  = getLayout(numQuestions);
  const sheets  = Array.from({ length: layout.perPage });

  const portalEl   = useRef(null);
  const downloadRef = useRef(null);
  if (!portalEl.current) {
    portalEl.current = document.createElement('div');
    portalEl.current.id = 'bs-portal';
  }

  useEffect(() => {
    document.body.appendChild(portalEl.current);
    let timer = null;

    if (autoprint) {
      // Download PDF: capture off-screen div with html2canvas → jsPDF, no print dialog
      timer = setTimeout(async () => {
        try {
          const el = downloadRef.current;
          if (el) {
            const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
              import('html2canvas'),
              import('jspdf'),
            ]);
            const canvas = await html2canvas(el, {
              scale: 2,
              useCORS: true,
              logging: false,
              backgroundColor: '#ffffff',
              width: A4_PX_W,
              height: A4_PX_H,
            });
            const imgData = canvas.toDataURL('image/jpeg', 0.92);
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
            pdf.save(`bubble-sheet-${numQuestions}q.pdf`);
          }
        } catch (err) {
          console.error('PDF download failed:', err);
        }
        onClose();
      }, 300);
    } else {
      document.body.style.overflow = 'hidden';
      const style = document.createElement('style');
      style.id = 'bs-print-css';
      style.textContent = `
        @media print {
          @page { size: A4 portrait; margin: 6mm; }
          body > * { display: none !important; }
          body > #bs-portal { display: block !important; position: static !important; background: white; }
          #bs-portal .bs-modal { display: none !important; }
          #bs-portal .bs-print-target {
            display: grid !important;
            width: 198mm;
            min-height: 285mm;
            grid-template-columns: repeat(${layout.cols}, 1fr) !important;
            gap: 3mm !important;
            align-content: start !important;
            background: white;
            padding: 4mm !important;
            box-sizing: border-box !important;
          }
        }
      `;
      document.head.appendChild(style);
    }

    return () => {
      if (timer) clearTimeout(timer);
      if (portalEl.current.isConnected) document.body.removeChild(portalEl.current);
      if (!autoprint) {
        document.body.style.overflow = '';
        document.getElementById('bs-print-css')?.remove();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout.cols, autoprint]);

  const previewW = Math.min(typeof window !== 'undefined' ? window.innerWidth - 80 : 700, 700);
  const scale    = previewW / A4_PX_W;

  const sheetNodes = sheets.map((_, i) => (
    <Sheet key={i} numQ={numQuestions} numChoices={numChoices} cols={layout.cols} />
  ));

  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
    gap: '3mm',
    alignContent: 'start',
    background: '#fff',
    padding: '4mm',
    boxSizing: 'border-box',
  };

  return createPortal(
    <>
      {/* ── Screen: modal preview (skipped in autoprint/download mode) ── */}
      {!autoprint && <div
        className="bs-modal"
        style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.82)',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          overflowY: 'auto', padding: '20px 16px 40px',
        }}
        onClick={e => e.target === e.currentTarget && onClose()}
      >
        {/* Toolbar */}
        <div style={{ width: previewW, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, flexShrink: 0 }}>
          <div>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#fff', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
              Bubble Sheet — {numQuestions} Items
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.55)', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
              {layout.perPage} sheets per A4 · {numChoices} choices · OMR-ready with student ID, section & quiz fields
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => window.print()}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                background: '#2d6a4f', color: '#fff', border: 'none',
                borderRadius: 10, padding: '9px 18px', cursor: 'pointer',
                fontFamily: '"Plus Jakarta Sans", sans-serif', fontSize: 14, fontWeight: 700,
              }}
            >
              <Printer size={15} /> Print
            </button>
            <button
              onClick={onClose}
              style={{ background: 'rgba(255,255,255,0.14)', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* A4 preview at scaled size */}
        <div style={{ width: previewW, height: A4_PX_H * scale, background: '#fff', borderRadius: 8, overflow: 'hidden', flexShrink: 0, boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}>
          <div style={{ width: A4_PX_W, height: A4_PX_H, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
            <div style={{ width: '198mm', minHeight: '285mm', ...gridStyle }}>
              {sheetNodes}
            </div>
          </div>
        </div>

        <p style={{ marginTop: 12, fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
          Print on A4 bond paper · Students fill in Student No, Section, Quiz No, then shade answers
        </p>
      </div>}

      {/* ── Print target: hidden on screen, shown by @media print ── */}
      {!autoprint && (
        <div className="bs-print-target" style={{ display: 'none' }}>
          {sheetNodes}
        </div>
      )}

      {/* ── Download target: off-screen, rendered for html2canvas capture ── */}
      {autoprint && (
        <div
          ref={downloadRef}
          style={{
            position: 'fixed',
            left: '-9999px',
            top: 0,
            width: A4_PX_W,
            height: A4_PX_H,
            display: 'grid',
            gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
            gap: '3mm',
            alignContent: 'start',
            background: '#fff',
            padding: '15px',
            boxSizing: 'border-box',
          }}
        >
          {sheetNodes}
        </div>
      )}
    </>,
    portalEl.current
  );
}
