/**
 * deskFormat.js — parses KaTuroDesk chat replies into blocks for DeskFormattedText:
 * paragraphs, lists (bullets, numbered, nested), tables, headings. Pure functions.
 */

const BULLET_CHAR = /[•●▪◦‣]/;
const LIST_LINE = /^(\s*)([-*+]|\d{1,2}[.)])\s+(.+)$/;

function isTableRow(line) {
  return /^\s*\|.*\|\s*$/.test(line);
}

function isTableSeparator(line) {
  return isTableRow(line) && /^[\s|:-]+$/.test(line) && line.includes('-');
}

function parseTableRow(line) {
  return line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
}

/**
 * Turns "•" bullets into list lines. "Label: • a • b" becomes the label line followed
 * by "- a" and "- b"; a line starting with "•" becomes "- ...". A single "•" in the
 * middle of an ordinary sentence is left alone.
 */
export function expandBullets(text) {
  const out = [];
  for (const rawLine of String(text).replace(/\r/g, '').replace(/\t/g, '    ').split('\n')) {
    if (!BULLET_CHAR.test(rawLine) || isTableRow(rawLine)) {
      out.push(rawLine);
      continue;
    }
    const indent = rawLine.match(/^\s*/)[0];
    const body = rawLine.slice(indent.length);
    const startsWithBullet = new RegExp(`^${BULLET_CHAR.source}`).test(body);
    const segs = body.split(new RegExp(`\\s*${BULLET_CHAR.source}\\s*`));
    const lead = startsWithBullet ? '' : segs[0].trim();
    const items = segs.slice(1).map((s) => s.trim()).filter(Boolean);
    if (!items.length || !(startsWithBullet || items.length >= 2 || /:$/.test(lead))) {
      out.push(rawLine);
      continue;
    }
    if (lead) out.push(indent + lead);
    for (const item of items) out.push(`${indent}- ${item}`);
  }
  return out;
}

/** "School: Dayap NHS" → a bold "School:" label. Short labels only, never URLs or times. */
export function splitLabel(text) {
  // The label itself may not contain markup ("**Bold**: x" stays as written); the value may.
  const m = text.match(/^([^:*<>]{2,40}?):\s+(\S.*)$/);
  if (!m || m[1].split(/\s+/).length > 6 || /[.!?]\s/.test(m[1])) return null;
  return { label: m[1], rest: m[2] };
}

/** Parses reply text into blocks: heading, hr, table, list, para (with a lead-in flag). */
export function parseBlocks(text) {
  const lines = expandBullets(text);
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (trimmed === '') {
      i++;
      continue;
    }

    if (/^[-*_]{3,}$/.test(trimmed)) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({ type: 'heading', level: headingMatch[1].length, text: headingMatch[2].trim() });
      i++;
      continue;
    }

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

    if (LIST_LINE.test(rawLine)) {
      const raw = [];
      while (i < lines.length) {
        const m = lines[i].match(LIST_LINE);
        if (m) {
          raw.push({ width: m[1].length, marker: m[2], text: m[3].trim() });
          i++;
          continue;
        }
        // A blank line between items of the same list does not end it.
        if (lines[i].trim() === '' && LIST_LINE.test(lines[i + 1] || '')) {
          i++;
          continue;
        }
        // An indented line right under an item continues that item.
        if (raw.length && /^\s{2,}\S/.test(lines[i]) && !LIST_LINE.test(lines[i])) {
          raw[raw.length - 1].text += ` ${lines[i].trim()}`;
          i++;
          continue;
        }
        break;
      }
      // Nesting levels from the indent widths actually used (2 or 4 spaces both work).
      const widths = [...new Set(raw.map((r) => r.width))].sort((a, b) => a - b);
      const items = raw.map((r) => ({
        level: Math.min(widths.indexOf(r.width), 3),
        ordered: /\d/.test(r.marker),
        number: r.marker.replace(/\)$/, '.'),
        text: r.text,
      }));
      // A short paragraph ending with ":" right before the list is its label.
      const prev = blocks[blocks.length - 1];
      if (prev?.type === 'para' && prev.lines.length === 1 && /:$/.test(prev.lines[0]) && prev.lines[0].length <= 120) {
        prev.leadIn = true;
      }
      blocks.push({ type: 'list', items });
      continue;
    }

    const paraLines = [trimmed];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^#{1,4}\s+/.test(lines[i].trim()) &&
      !LIST_LINE.test(lines[i]) &&
      !isTableRow(lines[i]) &&
      !/^[-*_]{3,}$/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }
    blocks.push({ type: 'para', lines: paraLines });
  }
  return blocks;
}
