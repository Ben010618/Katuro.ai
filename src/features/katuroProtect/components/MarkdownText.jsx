// Turns the raw markdown pulled out of the reference document (bold, inline
// code, bullet lists, tables) into clean JSX — the source text was never
// meant to be shown verbatim; dumping it as-is left literal "**", "`", "-",
// and table "|" characters on screen, which is exactly the "hard to read"
// problem this fixes. Scoped to only what this document actually uses (no
// full markdown library needed): bold, inline code, bullets, tables, paragraphs.

function renderInline(text) {
  const nodes = [];
  const re = /\*\*(.+?)\*\*|`(.+?)`/g;
  let lastIndex = 0;
  let match;
  let key = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    if (match[1] !== undefined) {
      nodes.push(<strong key={key++}>{match[1]}</strong>);
    } else {
      nodes.push(
        <code key={key++} style={{ background: 'var(--kt-surface)', border: '1px solid var(--kt-border)', borderRadius: 4, padding: '1px 5px', fontSize: '0.92em', fontFamily: '"DM Mono", monospace' }}>
          {match[2]}
        </code>,
      );
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function isTableRow(line) {
  return /^\s*\|.*\|\s*$/.test(line);
}
function isTableSeparator(line) {
  return isTableRow(line) && /^[\s|:-]+$/.test(line) && line.includes('-');
}
function parseTableRow(line) {
  return line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
}

function parseBlocks(text) {
  const lines = text.split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (isTableRow(line) && lines[i + 1] && isTableSeparator(lines[i + 1])) {
      const header = parseTableRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(parseTableRow(lines[i]));
        i++;
      }
      blocks.push({ type: 'table', header, rows });
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i++;
      }
      blocks.push({ type: 'list', items });
      continue;
    }

    if (line.trim() === '') { i++; continue; }

    const paraLines = [line];
    i++;
    while (i < lines.length && lines[i].trim() !== '' && !/^\s*[-*]\s+/.test(lines[i]) && !isTableRow(lines[i])) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push({ type: 'para', text: paraLines.join(' ') });
  }
  return blocks;
}

const cellStyle = { padding: '5px 8px', border: '1px solid var(--kt-border)', textAlign: 'left', verticalAlign: 'top' };

export default function MarkdownText({ text }) {
  const blocks = parseBlocks(text);
  return (
    <>
      {blocks.map((block, i) => {
        if (block.type === 'para') {
          return <p key={i} style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--kt-text-primary)', lineHeight: 1.6 }}>{renderInline(block.text)}</p>;
        }
        if (block.type === 'list') {
          return (
            <ul key={i} style={{ margin: '0 0 10px', paddingLeft: 20, fontSize: 13, color: 'var(--kt-text-primary)', lineHeight: 1.6 }}>
              {block.items.map((item, j) => <li key={j}>{renderInline(item)}</li>)}
            </ul>
          );
        }
        if (block.type === 'table') {
          return (
            <div key={i} style={{ overflowX: 'auto', marginBottom: 10 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                <thead>
                  <tr>{block.header.map((h, j) => <th key={j} style={{ ...cellStyle, background: 'var(--kt-surface)', fontWeight: 700 }}>{renderInline(h)}</th>)}</tr>
                </thead>
                <tbody>
                  {block.rows.map((row, ri) => (
                    <tr key={ri}>{row.map((cell, ci) => <td key={ci} style={cellStyle}>{renderInline(cell)}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return null;
      })}
    </>
  );
}
