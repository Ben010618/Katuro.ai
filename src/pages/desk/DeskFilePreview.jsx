import { useEffect, useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { useDeskStore } from '../../store/deskStore';
import { readFileBytes, findEntryByPath, readerNameFor } from '../../services/localFileSystem';
import DeskSheetGrid from './DeskSheetGrid';

const IMAGE_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp' };

/** Read-only preview of any workspace file, parsed by the same readers the agent uses. */
export default function DeskFilePreview({ path }) {
  const workspace = useDeskStore((s) => s.workspace);
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    let cancelled = false;
    let objectUrl = null;
    (async () => {
      setState({ loading: true });
      try {
        const entry = findEntryByPath(workspace?.files || [], path);
        const bytes = await readFileBytes(workspace?.handle, entry || path);
        const ext = path.split('.').pop().toLowerCase();
        if (IMAGE_MIME[ext]) {
          objectUrl = URL.createObjectURL(new Blob([bytes], { type: IMAGE_MIME[ext] }));
          if (!cancelled) setState({ loading: false, imageUrl: objectUrl });
          return;
        }
        if (ext === 'pdf' && typeof window !== 'undefined') {
          objectUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
        }
        const { readDocument, describeParsed } = await import('../../services/desk/readers/index.js');
        const parsed = await readDocument({ bytes, name: readerNameFor(entry, path.split('/').pop()) });
        if (!cancelled) setState({ loading: false, parsed, description: describeParsed(parsed), pdfUrl: ext === 'pdf' ? objectUrl : null });
      } catch (err) {
        if (!cancelled) setState({ loading: false, error: err.message });
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, workspace]);

  if (state.loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-500 p-6">
        <Loader2 size={14} className="animate-spin" /> Reading {path.split('/').pop()}…
      </div>
    );
  }
  if (state.error) {
    return (
      <div className="flex items-start gap-2 text-xs text-red-700 p-4 bg-red-50 border border-red-200 rounded">
        <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" /> Could not read this file: {state.error}
      </div>
    );
  }
  if (state.imageUrl) {
    return <img src={state.imageUrl} alt={path} className="max-w-full rounded shadow border border-gray-300 bg-white" />;
  }

  const { parsed, description } = state;
  return (
    <div className="w-full space-y-2">
      <p className="text-[10.5px] text-gray-500">{description}</p>
      {parsed.warnings?.length > 0 && (
        <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">{parsed.warnings.join(' ')}</div>
      )}

      {parsed.kind === 'docx' && parsed.html && (
        <iframe
          title="Word preview"
          sandbox="allow-same-origin"
          className="w-full h-[70vh] bg-white border border-gray-300 rounded shadow-sm"
          srcDoc={`<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;font-size:13px;line-height:1.45;padding:24px;color:#111}table{border-collapse:collapse;width:100%;margin:8px 0}td,th{border:1px solid #999;padding:4px 6px;vertical-align:top}img{max-width:100%}</style></head><body>${parsed.html}</body></html>`}
        />
      )}

      {(parsed.kind === 'xlsx' || parsed.kind === 'csv') && <DeskSheetGrid sheets={parsed.sheets || []} />}

      {parsed.kind === 'pptx' && (
        <div className="space-y-2">
          {(parsed.slides || []).map((s) => (
            <div key={s.number} className="bg-white border border-gray-300 rounded-lg shadow-sm p-3 aspect-[16/9] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between text-[10px] text-gray-400 mb-1">
                <span>Slide {s.number}</span>
              </div>
              <h3 className="text-sm font-bold text-gray-900 mb-1">{s.title}</h3>
              <p className="text-[11px] text-gray-700 whitespace-pre-wrap overflow-hidden">{s.text}</p>
              {s.notes && <p className="mt-auto text-[10px] text-gray-500 italic border-t border-gray-100 pt-1 truncate">Notes: {s.notes}</p>}
            </div>
          ))}
        </div>
      )}

      {parsed.kind === 'pdf' && (
        state.pdfUrl && typeof window !== 'undefined' && window.katuroDeskApi ? (
          <iframe title="PDF preview" src={state.pdfUrl} className="w-full h-[72vh] bg-white border border-gray-300 rounded" />
        ) : (
          <div className="space-y-2">
            {(parsed.pages || []).map((p) => (
              <div key={p.number} className="bg-white border border-gray-300 rounded p-3 text-[11px] whitespace-pre-wrap text-gray-800">
                <p className="text-[10px] text-gray-400 mb-1">Page {p.number}</p>
                {p.text || <span className="text-gray-400 italic">(no text — scanned page; the AI can read it with vision)</span>}
              </div>
            ))}
          </div>
        )
      )}

      {parsed.kind === 'text' && (
        <pre className="bg-white border border-gray-300 rounded p-3 text-[11px] whitespace-pre-wrap text-gray-800 max-h-[70vh] overflow-auto">{parsed.text}</pre>
      )}
    </div>
  );
}
