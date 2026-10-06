import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Save,
  Download,
  Printer,
  Edit3,
  Eye,
  Check,
  FileText,
  FileSpreadsheet,
  Presentation,
  ChevronLeft,
  ChevronRight,
  PanelRightClose,
  ExternalLink,
  FolderSearch,
  Paperclip,
  History,
  Loader2,
  X,
} from 'lucide-react';
import { useDeskStore } from '../../store/deskStore';
import {
  openInDefaultApp,
  revealInFolder,
  readFileBytes,
  findEntryByPath,
} from '../../services/localFileSystem';
import { normalizeDocumentSpec } from '../../services/desk/docSpec';
import { buildHtml } from '../../services/desk/generators/htmlFromSpec';
import DeskSpecEditor from './DeskSpecEditor';
import DeskSheetGrid from './DeskSheetGrid';
import DeskFilePreview from './DeskFilePreview';
import DeskChangesView from './DeskChangesView';
import DeskVoiceScoresView from './DeskVoiceScoresView';
import { getFileIcon } from './deskFileIcons';

const isElectron = typeof window !== 'undefined' && Boolean(window.katuroDeskApi);

const MIME = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  pdf: 'application/pdf',
};

function TypeBadge({ type }) {
  const label = { document: 'DOC', slides: 'SLIDES', sheet: 'SHEET', table: 'TABLE', files: 'FILES', preview: 'FILE', changes: 'CHANGES', voice_scores: 'VOICE' }[type] || String(type || '').toUpperCase();
  return (
    <span className="px-1.5 py-0.5 rounded text-[9.5px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 flex-shrink-0">{label}</span>
  );
}

function SlidesView({ spec }) {
  const [idx, setIdx] = useState(0);
  const slides = spec?.slides || [];
  const total = slides.length + 1;
  const slide = idx === 0 ? null : slides[idx - 1];
  return (
    <div className="w-full max-w-lg flex flex-col items-center">
      <div className="w-full aspect-[16/9] bg-white rounded-xl shadow-lg overflow-hidden border border-gray-300 flex flex-col">
        {idx === 0 ? (
          <div className="flex-1 bg-gradient-to-br from-[#1F3A2E] to-[#14281e] text-white p-6 flex flex-col justify-center">
            <h3 className="text-lg font-bold leading-tight">{spec.title}</h3>
            {spec.subtitle && <p className="text-xs text-emerald-100/90 mt-2">{spec.subtitle}</p>}
          </div>
        ) : (
          <>
            <div className="bg-[#1F3A2E] text-white px-4 py-2 text-sm font-bold">{slide.title}</div>
            <div className="flex-1 p-4 text-[11.5px] text-gray-800 overflow-hidden">
              {slide.layout === 'twoColumn' ? (
                <div className="grid grid-cols-2 gap-3">
                  <ul className="list-disc pl-4 space-y-1">{(slide.left || []).map((b, i) => <li key={i}>{b}</li>)}</ul>
                  <ul className="list-disc pl-4 space-y-1">{(slide.right || []).map((b, i) => <li key={i}>{b}</li>)}</ul>
                </div>
              ) : (
                <ul className="list-disc pl-4 space-y-1">{slide.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>
              )}
            </div>
          </>
        )}
      </div>
      {slide?.notes && <p className="w-full mt-2 text-[10.5px] text-gray-600 italic bg-white/70 border border-gray-200 rounded p-2">Teacher notes: {slide.notes}</p>}
      <div className="flex items-center gap-3 mt-3">
        <button disabled={idx === 0} onClick={() => setIdx((p) => Math.max(0, p - 1))} className="p-1.5 rounded-full bg-white border border-gray-300 shadow-2xs hover:bg-gray-50 disabled:opacity-30">
          <ChevronLeft size={16} />
        </button>
        <span className="text-xs font-semibold text-gray-700">Slide {idx + 1} / {total}</span>
        <button disabled={idx >= total - 1} onClick={() => setIdx((p) => Math.min(total - 1, p + 1))} className="p-1.5 rounded-full bg-white border border-gray-300 shadow-2xs hover:bg-gray-50 disabled:opacity-30">
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

export default function DeskCanvasPanel({ onCollapse, width }) {
  const { activeArtifact, setActiveArtifact, artifacts, saveArtifactEdits, workspace, toggleAttachment, attachedPaths } = useDeskStore();
  const [isEditing, setIsEditing] = useState(false);
  const [draftSpec, setDraftSpec] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState('');
  const [showOutputs, setShowOutputs] = useState(false);
  const iframeRef = useRef(null);
  const viewportRef = useRef(null);
  const [viewportWidth, setViewportWidth] = useState(440);

  // The paper preview is laid out at real page width, then zoomed to fit the panel,
  // so tables don't wrap letter-by-letter in a narrow Canvas.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => setViewportWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Reset local edit state whenever a different artifact is shown.
  const [shownId, setShownId] = useState(activeArtifact?.id);
  if (shownId !== activeArtifact?.id) {
    setShownId(activeArtifact?.id);
    setIsEditing(false);
    setDraftSpec(null);
    setError('');
  }

  const art = activeArtifact;
  const spec = draftSpec || art?.spec;
  const pageWidthPx = useMemo(() => {
    if (art?.type !== 'document' || !spec) return 0;
    try {
      return (normalizeDocumentSpec(spec).orientation === 'landscape' ? 13 : 8.5) * 96 + 48;
    } catch {
      return 0;
    }
  }, [art?.type, spec]);
  const zoom = pageWidthPx ? Math.min(1, Math.max(0.3, (viewportWidth - 8) / pageWidthPx)).toFixed(3) : '1';

  // Built once per document. The zoom it starts with is the panel width at that moment;
  // later width changes (dragging the divider) re-zoom the open page below, without a reload.
  const docHtml = useMemo(() => {
    if (art?.type !== 'document' || !spec) return '';
    try {
      const normalized = normalizeDocumentSpec(spec);
      return buildHtml(normalized, { forPrint: false }).replace('</head>', `<style>html{zoom:${zoom}}</style></head>`);
    } catch (e) {
      return `<p style="font-family:sans-serif;color:#b91c1c">Preview failed: ${String(e.message)}</p>`;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- zoom is applied live by applyZoom; rebuilding would reload the page on every drag step
  }, [art?.type, spec]);

  const applyZoom = useCallback(() => {
    const root = iframeRef.current?.contentDocument?.documentElement;
    if (root) root.style.zoom = zoom;
  }, [zoom]);
  useEffect(() => { applyZoom(); }, [applyZoom]);

  const handleSave = async () => {
    if (!draftSpec || !art) return;
    setIsSaving(true);
    setError('');
    try {
      const toSave = art.type === 'document' ? normalizeDocumentSpec(draftSpec) : draftSpec;
      await saveArtifactEdits(art.id, toSave);
      setDraftSpec(null);
      setIsEditing(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      setError(`Could not save: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpen = async (path) => {
    setError('');
    try {
      await openInDefaultApp(workspace?.handle, path);
    } catch (err) {
      setError(`Could not open: ${err.message}`);
    }
  };

  const handleReveal = async (path) => {
    try {
      await revealInFolder(workspace?.handle, path);
    } catch (err) {
      setError(err.message);
    }
  };

  // Browser build: no Explorer to open, so download the generated file.
  const handleDownload = async (file) => {
    try {
      const entry = findEntryByPath(workspace?.files || [], file.path);
      const bytes = await readFileBytes(workspace?.handle, entry || file.path);
      const url = URL.createObjectURL(new Blob([bytes], { type: MIME[file.format] || 'application/octet-stream' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(`Download failed: ${err.message}`);
    }
  };

  const handlePrint = () => {
    const win = iframeRef.current?.contentWindow;
    if (win) win.print();
    else window.print();
  };

  const outputsMenu = artifacts.length > 0 && (
    <div className="relative">
      <button
        onClick={() => setShowOutputs((v) => !v)}
        title="Outputs from this session"
        className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded border border-gray-200 transition flex items-center gap-1 text-[10.5px]"
      >
        <History size={12} /> {artifacts.length}
      </button>
      {showOutputs && (
        <div className="absolute right-0 top-8 z-30 w-72 max-h-80 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg p-1">
          {artifacts.map((a) => (
            <button
              key={a.id}
              onClick={() => {
                setActiveArtifact(a);
                setShowOutputs(false);
              }}
              className={`w-full text-left px-2 py-1.5 rounded text-[11px] hover:bg-emerald-50 ${a.id === art?.id ? 'bg-emerald-50 font-semibold' : ''}`}
            >
              <span className="block truncate text-gray-900">{a.title}</span>
              <span className="block truncate text-[10px] text-gray-500">{(a.files || []).map((f) => f.name).join(' · ')}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  if (!art) {
    return (
      <aside className={`${width ? '' : 'w-80 lg:w-96 xl:w-[460px] '}flex-shrink-0 flex flex-col h-full bg-[#f1f5f3] border-l border-gray-200 select-none`} style={width ? { width } : undefined}>
        <div className="p-2.5 bg-white border-b border-gray-200 flex items-center justify-between">
          <span className="text-[11px] font-bold text-gray-700">
            Document Canvas
          </span>
          <div className="flex items-center gap-1">
            {outputsMenu}
            {onCollapse && (
              <button onClick={onCollapse} title="Minimize Canvas" className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition">
                <PanelRightClose size={13} />
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-emerald-100/60 border border-emerald-200 flex items-center justify-center text-emerald-700 mb-3 shadow-xs">
            <FileText size={28} />
          </div>
          <h2 className="text-xs font-bold text-gray-800 mb-1">DepEd Document Studio</h2>
          <p className="text-[11px] text-gray-500 max-w-xs leading-relaxed mb-5">
            Click a file on the left to preview it, or ask your Co-Teacher to create a document. Generated Word, Excel, PowerPoint and PDF files appear here.
          </p>
          <div className="inline-flex items-center px-3 py-1 rounded-full bg-white border border-gray-200 text-[10.5px] font-medium text-emerald-800 shadow-2xs">
            DepEd Long Bond Paper (8.5" × 13")
          </div>
        </div>
      </aside>
    );
  }

  const isPreview = art.type === 'preview';
  const canEdit = (art.type === 'document' || art.type === 'table') && art.files?.length > 0 && Boolean(art.spec);
  const files = isPreview ? [{ path: art.path, name: art.title, format: art.path.split('.').pop().toLowerCase() }] : art.files || [];

  return (
    <aside className={`${width ? '' : 'w-80 lg:w-96 xl:w-[460px] '}flex-shrink-0 flex flex-col h-full bg-[#e8ecea] border-l border-gray-300`} style={width ? { width } : undefined}>
      {/* Canvas Action Bar */}
      <div className="p-2.5 bg-white border-b border-gray-200 flex items-center justify-between shadow-2xs z-10 gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <TypeBadge type={art.type} />
            <h2 className="text-xs font-bold text-gray-900 truncate" title={art.title}>{art.title}</h2>
          </div>
          <p className="text-[9.5px] text-gray-500 truncate" title={art.subtitle}>{isPreview ? art.path : art.subtitle}</p>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {canEdit && (
            <button
              onClick={() => {
                if (isEditing) {
                  setIsEditing(false);
                } else {
                  setDraftSpec(draftSpec || structuredClone(art.spec));
                  setIsEditing(true);
                }
              }}
              title={isEditing ? 'Back to preview' : 'Edit content'}
              className="p-1.5 text-gray-600 hover:text-emerald-700 hover:bg-emerald-50 rounded border border-gray-200 transition"
            >
              {isEditing ? <Eye size={12} /> : <Edit3 size={12} />}
            </button>
          )}
          {draftSpec && (
            <button
              onClick={handleSave}
              disabled={isSaving}
              title="Save changes to the generated file(s)"
              className="px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition shadow-2xs bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-60"
            >
              {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              <span className="hidden sm:inline">Save</span>
            </button>
          )}
          {saveSuccess && (
            <span className="px-1.5 py-1 rounded text-[10.5px] font-semibold bg-emerald-600 text-white flex items-center gap-1">
              <Check size={11} /> Saved
            </span>
          )}
          {art.type === 'document' && !isEditing && (
            <button onClick={handlePrint} title="Print" className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded border border-gray-200 transition">
              <Printer size={13} />
            </button>
          )}
          {isPreview && (
            <button
              onClick={() => toggleAttachment(art.path)}
              title={attachedPaths.includes(art.path) ? 'Remove from chat' : 'Attach to chat'}
              className={`p-1.5 rounded border transition ${attachedPaths.includes(art.path) ? 'bg-emerald-600 text-white border-emerald-600' : 'text-gray-600 hover:bg-gray-100 border-gray-200'}`}
            >
              <Paperclip size={13} />
            </button>
          )}
          {outputsMenu}
          {onCollapse && (
            <button onClick={onCollapse} title="Minimize Canvas" className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded border border-gray-200 transition ml-0.5">
              <PanelRightClose size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Output files */}
      {files.length > 0 && (
        <div className="px-2.5 py-1.5 bg-[#f6f8f7] border-b border-gray-200 flex flex-wrap gap-1.5">
          {files.map((f) => (
            <div key={f.path} className="flex items-center gap-1 bg-white border border-gray-200 rounded-md pl-1.5 pr-0.5 py-0.5 text-[10.5px] max-w-full">
              {getFileIcon(f.name, 12)}
              <span className="truncate max-w-[160px] text-gray-800" title={f.path}>{f.name}</span>
              {isElectron ? (
                <>
                  <button onClick={() => handleOpen(f.path)} title="Open in Word / Excel / PowerPoint" className="p-0.5 text-gray-500 hover:text-emerald-700">
                    <ExternalLink size={11} />
                  </button>
                  <button onClick={() => handleReveal(f.path)} title="Show in folder" className="p-0.5 text-gray-500 hover:text-emerald-700">
                    <FolderSearch size={11} />
                  </button>
                </>
              ) : (
                <button onClick={() => handleDownload(f)} title="Download" className="p-0.5 text-gray-500 hover:text-emerald-700">
                  <Download size={11} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="px-3 py-1.5 text-[11px] bg-red-50 text-red-700 border-b border-red-200 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')}><X size={11} /></button>
        </div>
      )}

      {/* Canvas Viewport */}
      <div ref={viewportRef} className="flex-1 overflow-y-auto p-3 flex justify-center custom-scrollbar">
        {isPreview ? (
          <DeskFilePreview path={art.path} />
        ) : art.type === 'changes' ? (
          <DeskChangesView key={art.id} art={art} />
        ) : art.type === 'voice_scores' ? (
          <DeskVoiceScoresView key={art.id} art={art} />
        ) : art.type === 'document' ? (
          isEditing && draftSpec ? (
            <DeskSpecEditor spec={draftSpec} onChange={setDraftSpec} />
          ) : (
            <iframe
              ref={iframeRef}
              title="Document preview"
              sandbox="allow-same-origin allow-modals"
              srcDoc={docHtml}
              onLoad={applyZoom}
              className="w-full h-full min-h-[600px] bg-white border border-gray-300 rounded shadow-md"
            />
          )
        ) : art.type === 'slides' ? (
          <SlidesView spec={art.spec} />
        ) : art.type === 'sheet' || art.type === 'table' ? (
          <div className="w-full">
            {art.data?.notes && <p className="mb-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">AI note: {art.data.notes}</p>}
            {art.type === 'table' && !isEditing && <p className="mb-2 text-[11px] text-gray-600">Check these values against the original. Click the edit button to correct any cell, then Save.</p>}
            <DeskSheetGrid
              sheets={(spec?.sheets || []).map((s) => ({ name: s.name, columns: s.columns.map((c) => c.header), rows: s.rows }))}
              editable={isEditing}
              onChange={(i, sheet) =>
                setDraftSpec((prev) => {
                  const base = prev || structuredClone(art.spec);
                  return {
                    ...base,
                    sheets: base.sheets.map((s, j) => (j === i ? { ...s, columns: sheet.columns.map((h, k) => ({ ...(s.columns[k] || {}), header: h })), rows: sheet.rows } : s)),
                  };
                })
              }
            />
          </div>
        ) : (
          <div className="w-full space-y-2">
            {files.map((f) => (
              <div key={f.path} className="bg-white border border-gray-200 rounded-lg p-3 flex items-center gap-2">
                {f.format === 'xlsx' ? <FileSpreadsheet size={16} /> : f.format === 'pptx' ? <Presentation size={16} /> : <FileText size={16} />}
                <span className="text-xs text-gray-800 truncate">{f.path}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
