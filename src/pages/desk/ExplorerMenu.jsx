import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flattenFileTree } from '../../services/localFileSystem';

/**
 * The Explorer's right-click menu: a small list at the mouse (or under the "more" button),
 * kept inside the window. Arrow keys move, Enter picks, Escape or a click elsewhere closes.
 * items: [{ id, label, icon, onSelect, danger?, disabled?, hint? } | { separator: true }]
 */
export function ExplorerContextMenu({ x, y, title, items, onClose, keyboard = false }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = Math.max(4, Math.min(x, window.innerWidth - r.width - 4));
    const top = Math.max(4, Math.min(y, window.innerHeight - r.height - 4));
    setPos({ left, top });
    // From the keyboard the first item takes focus; from the mouse the menu itself (arrows still work).
    if (keyboard) el.querySelector('[role="menuitem"]:not([disabled])')?.focus();
    else el.focus();
  }, [x, y, keyboard]);

  useEffect(() => {
    const away = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    const close = () => onClose();
    document.addEventListener('mousedown', away, true);
    document.addEventListener('contextmenu', away, true);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    document.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', away, true);
      document.removeEventListener('contextmenu', away, true);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
      document.removeEventListener('scroll', close, true);
    };
  }, [onClose]);

  const onKeyDown = (e) => {
    const list = [...(ref.current?.querySelectorAll('[role="menuitem"]:not([disabled])') || [])];
    const i = list.indexOf(document.activeElement);
    if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); onClose(true); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); list[i < 0 ? list.length - 1 : (i - 1 + list.length) % list.length]?.focus(); }
    else if (e.key === 'Home') { e.preventDefault(); list[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); list[list.length - 1]?.focus(); }
  };

  return (
    <div
      ref={ref}
      role="menu"
      tabIndex={-1}
      aria-label={title}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      style={{ left: pos.left, top: pos.top }}
      className="kt-explorer-menu fixed z-[60] min-w-[200px] max-w-[260px] py-1 rounded-lg bg-[#1b2620] border border-[#2b3e32] shadow-xl outline-none text-[11.5px] text-[#d3e0d8]"
    >
      {title && <p className="px-3 pt-1 pb-1.5 text-[10px] text-[#9eb6a6] truncate border-b border-[#2b3e32] mb-1" title={title}>{title}</p>}
      {items.map((it, i) =>
        it.separator ? (
          <div key={`sep-${i}`} role="separator" className="my-1 border-t border-[#2b3e32]" />
        ) : (
          <button
            key={it.id}
            type="button"
            role="menuitem"
            disabled={it.disabled}
            title={it.hint || undefined}
            onClick={() => { onClose(); it.onSelect(); }}
            className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition hover:bg-[#223328] focus:bg-[#223328] focus:outline-none disabled:opacity-40 disabled:hover:bg-transparent ${it.danger ? 'text-red-400' : ''}`}
          >
            {it.icon && <it.icon size={13} className="flex-shrink-0" aria-hidden="true" />}
            <span className="truncate">{it.label}</span>
          </button>
        ),
      )}
    </div>
  );
}

/**
 * Asks for a name (rename, new folder, new file) or for a yes before deleting.
 * kind: 'rename' | 'newFolder' | 'newFile' | 'delete'
 */
export function ExplorerDialog({ kind, item, parentLabel, onCancel, onConfirm }) {
  const isDelete = kind === 'delete';
  const isFolder = item?.kind === 'directory' || Boolean(item?.children);
  const [name, setName] = useState(kind === 'rename' ? item?.name || '' : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const cancelRef = useRef(null);

  useEffect(() => {
    if (isDelete) { cancelRef.current?.focus(); return; }
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    // Rename selects the name without its extension, like Windows does.
    const dot = kind === 'rename' && !isFolder ? name.lastIndexOf('.') : -1;
    el.setSelectionRange(0, dot > 0 ? dot : name.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const heading = {
    rename: `Rename ${isFolder ? 'folder' : 'file'}`,
    newFolder: 'New folder',
    newFile: 'New file',
    delete: `Delete this ${isFolder ? 'folder' : 'file'}?`,
  }[kind];

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!isDelete && !name.trim()) { setError('Type a name.'); return; }
    setBusy(true);
    setError('');
    try {
      await onConfirm(name.trim());
    } catch (err) {
      setError(err?.message || 'That did not work. Try again.');
      setBusy(false);
    }
  };

  const fileCount = isFolder ? flattenFileTree(item.children || []).length : 0;
  return (
    <div className="kt-layer z-[70] flex items-center justify-center bg-black/40 p-2" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="kt-explorer-dialog-title"
        onSubmit={submit}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !busy) { e.stopPropagation(); onCancel(); return; }
          if (e.key !== 'Tab') return;
          // Tab stays inside the dialog.
          const list = [...e.currentTarget.querySelectorAll('input, button:not([disabled])')];
          const i = list.indexOf(document.activeElement);
          if (e.shiftKey && i <= 0) { e.preventDefault(); list[list.length - 1]?.focus(); }
          else if (!e.shiftKey && i === list.length - 1) { e.preventDefault(); list[0]?.focus(); }
        }}
        className="w-[min(92vw,380px)] rounded-xl bg-white border border-gray-200 shadow-2xl p-4 text-gray-800"
      >
        <h2 id="kt-explorer-dialog-title" className="text-sm font-bold mb-1">{heading}</h2>
        {isDelete ? (
          <div className="text-xs text-gray-600 space-y-1.5 mb-3">
            <p>Are you sure you want to delete <strong className="text-gray-800 break-all">{item?.name}</strong>?</p>
            {isFolder && <p>{fileCount > 0 ? `Everything inside it (${fileCount} file${fileCount === 1 ? '' : 's'}) goes too.` : 'The folder is empty.'}</p>}
            <p className="text-gray-500">It goes to the Recycle Bin, so you can bring it back from there. On a USB drive Windows has no Recycle Bin and deletes it for good.</p>
          </div>
        ) : (
          <>
            {parentLabel && <p className="text-[11px] text-gray-500 mb-2 truncate" title={parentLabel}>In {parentLabel}</p>}
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(''); }}
              aria-label={heading}
              placeholder={kind === 'newFile' ? 'e.g. Science7_Week2.docx' : kind === 'newFolder' ? 'e.g. Remediation_Week1' : ''}
              className="w-full mb-1 px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 focus:outline-none focus:border-emerald-500"
            />
            {kind === 'newFile' && <p className="text-[10.5px] text-gray-500 mb-2">End the name with .docx, .xlsx or .pptx for a Word, Excel or PowerPoint file.</p>}
          </>
        )}
        {error && <p role="alert" className="text-[11px] text-red-600 mb-2">{error}</p>}
        <div className="flex justify-end gap-2 mt-2">
          <button ref={cancelRef} type="button" onClick={onCancel} disabled={busy} className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-100 disabled:opacity-50">
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg text-white disabled:opacity-50 ${isDelete ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-700 hover:bg-emerald-800'}`}
          >
            {busy ? 'Working…' : isDelete ? 'Yes, delete' : kind === 'rename' ? 'Rename' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}

