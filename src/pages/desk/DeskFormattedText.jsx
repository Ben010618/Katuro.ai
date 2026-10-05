/**
 * DeskFormattedText.jsx
 *
 * Renders AI chat replies as clean, formatted JSX: paragraphs, labelled lists with a
 * hanging indent, numbered steps, tables, and inline emphasis (bold, italic, underline).
 * Raw markdown punctuation never shows. Replies that cram several "•" items into one
 * line ("School: X • Grade: Y • ...") are split into a proper list first (deskFormat.js).
 */
import { parseBlocks, splitLabel } from './deskFormat';

// Inline emphasis: ***bold italic***, **bold**, <u>underline</u>, `code`, *italic*.
// Content is rendered recursively, so **<u>both</u>** works.
const INLINE = /\*\*\*(?=\S)(.+?)(?<=\S)\*\*\*|\*\*(?=\S)(.+?)(?<=\S)\*\*|<u>(.+?)<\/u>|`([^`]+)`|(?<![\w*])\*(?=\S)([^*\n]+?)(?<=\S)\*(?![\w*])/gi;

/** Removes markdown leftovers that did not form a pair (a lone "**", "`" or "<u>"). */
const stray = (s) => s.replace(/\*{2,}/g, '').replace(/`+/g, '').replace(/<\/?u>/gi, '');

function renderInline(text, keyPrefix = 'i') {
  if (typeof text !== 'string' || !text) return null;
  const nodes = [];
  const pattern = new RegExp(INLINE.source, INLINE.flags);
  let lastIndex = 0;
  let match;
  let n = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(stray(text.slice(lastIndex, match.index)));
    const key = `${keyPrefix}-${n++}`;
    const [, boldItalic, bold, underline, code, italic] = match;
    if (boldItalic !== undefined) {
      nodes.push(<strong key={key} className="font-semibold text-gray-900"><em className="italic">{renderInline(boldItalic, key)}</em></strong>);
    } else if (bold !== undefined) {
      nodes.push(<strong key={key} className="font-semibold text-gray-900">{renderInline(bold, key)}</strong>);
    } else if (underline !== undefined) {
      nodes.push(<span key={key} className="underline decoration-emerald-600 decoration-[1.5px] underline-offset-2">{renderInline(underline, key)}</span>);
    } else if (code !== undefined) {
      nodes.push(<code key={key} className="px-1 py-0.5 mx-0.5 rounded text-[11px] bg-gray-100 text-gray-800 font-mono border border-gray-200">{code}</code>);
    } else if (italic !== undefined) {
      nodes.push(<em key={key} className="italic">{renderInline(italic, key)}</em>);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) nodes.push(stray(text.slice(lastIndex)));
  return nodes;
}

function ListItemText({ text, k }) {
  const labelled = splitLabel(text);
  if (!labelled) return renderInline(text, k);
  return (
    <>
      <strong className="font-semibold text-gray-900">{labelled.label}:</strong> {renderInline(labelled.rest, k)}
    </>
  );
}

export default function DeskFormattedText({ text, className = '' }) {
  if (!text) return null;
  const blocks = parseBlocks(text);

  return (
    <div className={`space-y-2 text-xs leading-relaxed text-gray-800 ${className}`}>
      {blocks.map((block, idx) => {
        if (block.type === 'hr') return <hr key={idx} className="my-3 border-gray-200" />;

        if (block.type === 'heading') {
          if (block.level === 1) {
            return <h2 key={idx} className="text-sm font-bold text-gray-900 pt-1 pb-1 border-b border-gray-200">{renderInline(block.text, `h${idx}`)}</h2>;
          }
          if (block.level === 2) {
            return <h3 key={idx} className="text-[13px] font-bold text-gray-900 pt-1">{renderInline(block.text, `h${idx}`)}</h3>;
          }
          return <h4 key={idx} className="text-xs font-bold text-emerald-900 pt-0.5">{renderInline(block.text, `h${idx}`)}</h4>;
        }

        if (block.type === 'table') {
          return (
            <div key={idx} className="my-2 overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-left text-[11px] border-collapse bg-white">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-gray-700 font-semibold">
                    {block.header.map((col, cIdx) => (
                      <th key={cIdx} className="px-2.5 py-1.5 border-r border-gray-100 last:border-r-0">{renderInline(col, `t${idx}-${cIdx}`)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {block.rows.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-gray-50/70 transition-colors">
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className="px-2.5 py-1.5 text-gray-700 border-r border-gray-100 last:border-r-0">{renderInline(cell, `t${idx}-${rIdx}-${cIdx}`)}</td>
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
            <ul key={idx} className="space-y-1 !mt-1">
              {block.items.map((item, itemIdx) => (
                <li key={itemIdx} className="flex items-start gap-2" style={{ paddingLeft: item.level * 18 }}>
                  {item.ordered ? (
                    <span className="min-w-[1.1rem] text-right font-semibold text-emerald-800 tabular-nums select-none">{item.number}</span>
                  ) : (
                    <span aria-hidden="true" className={`mt-[0.45rem] h-[5px] w-[5px] flex-shrink-0 rounded-full ${item.level ? 'border border-emerald-700' : 'bg-emerald-700'}`} />
                  )}
                  <span className="flex-1 min-w-0">
                    <ListItemText text={item.text} k={`l${idx}-${itemIdx}`} />
                  </span>
                </li>
              ))}
            </ul>
          );
        }

        if (block.type === 'para') {
          return (
            <p key={idx} className={block.leadIn ? 'font-semibold text-gray-900 !mt-3 first:!mt-0' : undefined}>
              {block.lines.map((line, lIdx) => (
                <span key={lIdx}>
                  {lIdx > 0 && <br />}
                  {renderInline(line, `p${idx}-${lIdx}`)}
                </span>
              ))}
            </p>
          );
        }

        return null;
      })}
    </div>
  );
}
