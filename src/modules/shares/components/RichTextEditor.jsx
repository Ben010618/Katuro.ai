import { useRef, useEffect } from 'react';
import PropTypes from 'prop-types';

const TOOLS = [
  { cmd: 'bold',                label: 'B',   title: 'Bold',            style: { fontWeight: 900 } },
  { cmd: 'italic',              label: 'I',   title: 'Italic',          style: { fontStyle: 'italic' } },
  { cmd: 'underline',           label: 'U',   title: 'Underline',       style: { textDecoration: 'underline' } },
  { cmd: 'hiliteColor',         label: '▌',   title: 'Highlight',       value: '#fef08a', style: { background: '#fef08a', borderRadius: 3, padding: '2px 4px' } },
  { cmd: 'insertUnorderedList', label: '• —', title: 'Bullet list' },
];

const DIVIDER = '|';

export function RichTextEditor({ onChange, placeholder, initialValue }) {
  const editorRef = useRef(null);

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
    // Ctrl/Cmd shortcuts
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'b') { e.preventDefault(); exec('bold'); }
      if (e.key === 'i') { e.preventDefault(); exec('italic'); }
      if (e.key === 'u') { e.preventDefault(); exec('underline'); }
    }
  }

  return (
    <div className="sh-rte-wrap">

      {/* Toolbar */}
      <div className="sh-rte-toolbar" onMouseDown={e => e.preventDefault()}>
        {TOOLS.map((tool, idx) =>
          tool === DIVIDER
            ? <span key={idx} className="sh-rte-divider" />
            : (
              <button
                key={tool.cmd}
                className="sh-rte-btn"
                title={tool.title}
                onMouseDown={() => exec(tool.cmd, tool.value ?? null)}
                type="button"
                style={tool.style}
              >
                {tool.label}
              </button>
            )
        )}

        {/* Separator */}
        <span className="sh-rte-divider" />

        {/* Remove highlight */}
        <button
          className="sh-rte-btn sh-rte-btn--sm"
          title="Remove highlight"
          onMouseDown={() => exec('hiliteColor', 'transparent')}
          type="button"
        >
          ✕HL
        </button>

        {/* Clear all formatting */}
        <button
          className="sh-rte-btn sh-rte-btn--sm"
          title="Clear formatting"
          onMouseDown={() => exec('removeFormat')}
          type="button"
        >
          Tx
        </button>
      </div>

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
