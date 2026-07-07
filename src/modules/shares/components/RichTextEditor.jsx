import { useRef, useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Bold, Italic, Underline, Highlighter, List, Link as LinkIcon, Eraser, RemoveFormatting, Check, X } from 'lucide-react';

const TOOLS = [
  { cmd: 'bold',      Icon: Bold,        title: 'Bold (Ctrl+B)' },
  { cmd: 'italic',    Icon: Italic,      title: 'Italic (Ctrl+I)' },
  { cmd: 'underline', Icon: Underline,   title: 'Underline (Ctrl+U)' },
  { cmd: 'hiliteColor', Icon: Highlighter, title: 'Highlight', value: '#fef08a' },
  { cmd: 'insertUnorderedList', Icon: List, title: 'Bullet list' },
];

export function RichTextEditor({ onChange, placeholder, initialValue }) {
  const editorRef = useRef(null);
  const savedRangeRef = useRef(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl,  setLinkUrl]  = useState('');

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = initialValue || '';
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function exec(cmd, value = null) {
    editorRef.current?.focus();
    document.execCommand(cmd, false, value);
    onChange(editorRef.current?.innerHTML ?? '');
  }

  function handleInput() {
    onChange(editorRef.current?.innerHTML ?? '');
  }

  function handleKeyDown(e) {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'b') { e.preventDefault(); exec('bold'); }
      if (e.key === 'i') { e.preventDefault(); exec('italic'); }
      if (e.key === 'u') { e.preventDefault(); exec('underline'); }
      if (e.key === 'k') { e.preventDefault(); openLinkInput(); }
    }
  }

  function openLinkInput() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    } else {
      savedRangeRef.current = null;
    }
    setLinkUrl('');
    setLinkOpen(true);
  }

  function cancelLink() {
    setLinkOpen(false);
    setLinkUrl('');
  }

  function applyLink() {
    const raw = linkUrl.trim();
    if (!raw) { cancelLink(); return; }
    const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

    editorRef.current?.focus();
    const sel = window.getSelection();
    if (savedRangeRef.current) {
      sel.removeAllRanges();
      sel.addRange(savedRangeRef.current);
    }
    const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;

    const a = document.createElement('a');
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';

    if (range && !range.collapsed) {
      a.appendChild(range.extractContents());
      range.insertNode(a);
    } else {
      a.textContent = href;
      if (range) range.insertNode(a);
      else editorRef.current?.appendChild(a);
    }

    onChange(editorRef.current?.innerHTML ?? '');
    cancelLink();
  }

  return (
    <div className="sh-rte-wrap">

      {/* Toolbar */}
      <div className="sh-rte-toolbar" onMouseDown={e => e.preventDefault()}>
        {TOOLS.map(tool => (
          <button
            key={tool.cmd}
            className="sh-rte-btn"
            title={tool.title}
            onMouseDown={() => exec(tool.cmd, tool.value ?? null)}
            type="button"
          >
            <tool.Icon size={15} />
          </button>
        ))}

        <button
          className="sh-rte-btn"
          title="Insert link (Ctrl+K)"
          onMouseDown={openLinkInput}
          type="button"
        >
          <LinkIcon size={15} />
        </button>

        <span className="sh-rte-divider" />

        <button
          className="sh-rte-btn sh-rte-btn--sm"
          title="Remove highlight"
          onMouseDown={() => exec('hiliteColor', 'transparent')}
          type="button"
        >
          <Eraser size={14} />
        </button>

        <button
          className="sh-rte-btn sh-rte-btn--sm"
          title="Clear formatting"
          onMouseDown={() => exec('removeFormat')}
          type="button"
        >
          <RemoveFormatting size={14} />
        </button>
      </div>

      {/* Link input row */}
      {linkOpen && (
        <div className="sh-rte-link-row" onMouseDown={e => e.preventDefault()}>
          <LinkIcon size={14} className="sh-rte-link-row-icon" />
          <input
            autoFocus
            type="text"
            className="sh-rte-link-input"
            placeholder="Paste or type a URL…"
            value={linkUrl}
            onChange={e => setLinkUrl(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); applyLink(); }
              if (e.key === 'Escape') { e.preventDefault(); cancelLink(); }
            }}
          />
          <button className="sh-rte-link-btn sh-rte-link-btn--confirm" onMouseDown={applyLink} type="button" aria-label="Add link">
            <Check size={14} />
          </button>
          <button className="sh-rte-link-btn sh-rte-link-btn--cancel" onMouseDown={cancelLink} type="button" aria-label="Cancel">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Editable area */}
      <div
        ref={editorRef}
        className="sh-rte-editor"
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        data-placeholder={placeholder}
        spellCheck
      />
    </div>
  );
}

RichTextEditor.propTypes = {
  onChange:     PropTypes.func.isRequired,
  placeholder:  PropTypes.string,
  initialValue: PropTypes.string,
};

RichTextEditor.defaultProps = {
  placeholder:  'Write something…',
  initialValue: '',
};
