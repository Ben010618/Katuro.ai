import React from 'react';

/**
 * DeskFormattedText.jsx
 * 
 * Renders AI responses and document previews as clean, beautifully formatted JSX.
 * Eliminates raw markdown punctuation (such as literal '**', '###', '`', '*', or table pipes '|')
 * and transforms them into elegant typography, badges, indented lists, and structured tables.
 */

function renderInline(text) {
  if (typeof text !== 'string' || !text) return null;

  // Pattern matches:
  // 1. **`code`** (bold inline code)
  // 2. **bold**
  // 3. `code`
  // 4. *italic*
  const pattern = /\*\*`([^`]+)`\*\*|\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*/g;
  const nodes = [];
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    if (match[1] !== undefined) {
      // **`code`**
      nodes.push(
        <strong key={key++} className="font-semibold text-gray-900">
          <code className="px-1.5 py-0.5 mx-0.5 rounded text-[11px] bg-emerald-50 text-emerald-800 font-mono border border-emerald-200/70">
            {match[1]}
          </code>
        </strong>
      );
    } else if (match[2] !== undefined) {
      // **bold**
      nodes.push(
        <strong key={key++} className="font-semibold text-gray-900">
          {match[2]}
        </strong>
      );
    } else if (match[3] !== undefined) {
      // `code`
      nodes.push(
        <code
          key={key++}
          className="px-1.5 py-0.5 mx-0.5 rounded text-[11px] bg-gray-100 text-gray-800 font-mono border border-gray-200"
        >
          {match[3]}
        </code>
      );
    } else if (match[4] !== undefined) {
      // *italic*
      nodes.push(
        <em key={key++} className="italic text-gray-700">
          {match[4]}
        </em>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    // Clean up any stray unmatched markdown artifacts
    const remaining = text.slice(lastIndex).replace(/\*{2,}/g, '').replace(/`+/g, '');
    nodes.push(remaining);
  }

  return nodes;
}

function isTableRow(line) {
  return /^\s*\|.*\|\s*$/.test(line);
}

function isTableSeparator(line) {
  return isTableRow(line) && /^[\s|:-]+$/.test(line) && line.includes('-');
}

function parseTableRow(line) {
  return line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim());
}

export default function DeskFormattedText({ text, className = '' }) {
  if (!text) return null;

  const lines = text.split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // 1. Skip completely empty lines
    if (trimmed === '') {
      i++;
      continue;
    }

    // 2. Horizontal Rules (--- or ***)
    if (/^[-*_]{3,}$/.test(trimmed)) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }

    // 3. Headings (#, ##, ###, ####) - Remove all '#' and render as styled heading
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const headingText = headingMatch[2].trim();
      blocks.push({ type: 'heading', level, text: headingText });
      i++;
      continue;
    }

    // 4. Tables (| Header 1 | Header 2 |)
    if (isTableRow(rawLine) && lines[i + 1] && isTableSeparator(lines[i + 1])) {
      const header = parseTableRow(rawLine);
      i += 2;
      const rows = [];
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(parseTableRow(lines[i]));
        i++;
      }
      blocks.push({ type: 'table', header, rows });
      continue;
    }

    // 5. Lists (Bullet & Numbered, including indented sub-items)
    const listMatch = rawLine.match(/^(\s*)([-*+]|\d+\.)\s+(.+)$/);
    if (listMatch) {
      const items = [];
      while (i < lines.length) {
        const itemMatch = lines[i].match(/^(\s*)([-*+]|\d+\.)\s+(.+)$/);
        if (!itemMatch) break;
        const indentLevel = Math.floor(itemMatch[1].length / 2);
        items.push({
          indent: indentLevel,
          text: itemMatch[3].trim(),
        });
        i++;
      }
      blocks.push({ type: 'list', items });
      continue;
    }

    // 6. Regular Paragraphs
    const paraLines = [trimmed];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trim().match(/^#{1,4}\s+/) &&
      !lines[i].match(/^(\s*)([-*+]|\d+\.)\s+/) &&
      !isTableRow(lines[i]) &&
      !lines[i].trim().match(/^[-*_]{3,}$/)
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }

    blocks.push({ type: 'para', text: paraLines.join(' ') });
  }

  return (
    <div className={`space-y-2.5 ${className}`}>
      {blocks.map((block, idx) => {
        if (block.type === 'hr') {
          return <hr key={idx} className="my-3 border-gray-200" />;
        }

        if (block.type === 'heading') {
          if (block.level === 1) {
            return (
              <h2
                key={idx}
                className="text-sm font-bold text-gray-900 mt-3 mb-1.5 pb-1 border-b border-gray-200"
              >
                {renderInline(block.text)}
              </h2>
            );
          }
          if (block.level === 2) {
            return (
              <h3
                key={idx}
                className="text-[13px] font-bold text-gray-900 mt-2.5 mb-1"
              >
                {renderInline(block.text)}
              </h3>
            );
          }
          return (
            <h4
              key={idx}
              className="text-xs font-bold text-emerald-900 mt-2 mb-1 flex items-center gap-1.5"
            >
              {renderInline(block.text)}
            </h4>
          );
        }

        if (block.type === 'table') {
          return (
            <div key={idx} className="my-2.5 overflow-x-auto rounded-lg border border-gray-200 shadow-2xs">
              <table className="w-full text-left text-[11px] border-collapse bg-white">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-gray-700 font-semibold">
                    {block.header.map((col, cIdx) => (
                      <th key={cIdx} className="px-2.5 py-1.5 border-r border-gray-100 last:border-r-0">
                        {renderInline(col)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {block.rows.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-gray-50/70 transition-colors">
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className="px-2.5 py-1.5 text-gray-700 border-r border-gray-100 last:border-r-0">
                          {renderInline(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        if (block.type === 'list') {
          return (
            <div key={idx} className="my-1.5 space-y-1">
              {block.items.map((item, itemIdx) => {
                const mlClass =
                  item.indent >= 2 ? 'ml-6' : item.indent === 1 ? 'ml-3' : 'ml-0';
                return (
                  <div
                    key={itemIdx}
                    className={`flex items-start gap-1.5 text-xs text-gray-800 ${mlClass}`}
                  >
                    <span className="text-emerald-600 font-bold select-none text-[10px] mt-0.5 flex-shrink-0">
                      •
                    </span>
                    <div className="flex-1 leading-relaxed">
                      {renderInline(item.text)}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        }

        if (block.type === 'para') {
          return (
            <p key={idx} className="text-xs leading-relaxed text-gray-800">
              {renderInline(block.text)}
            </p>
          );
        }

        return null;
      })}
    </div>
  );
}
