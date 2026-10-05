import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expandBullets, parseBlocks, splitLabel } from './deskFormat';
import DeskFormattedText from './DeskFormattedText';

// The reply that rendered as run-on paragraphs (all items on one line).
const CRAMMED = `If I may, here is the summary feedback based on the file Grade 9 TRONO_RESEARCH_2026-2027.xlsx:

General Information (from sheet INPUT): • School: Dayap National High School • School ID: 301238 • Subject: Research

Learner Enrollment (from sheets INPUT and TERM1): • Total Learners: 29 • Male Learners: 10 • Female Learners: 19

I hope this summary helps you, Sir.`;

const html = (text) => renderToStaticMarkup(createElement(DeskFormattedText, { text }));

describe('desk chat formatting', () => {
  it('splits inline "•" items into a label line and one list item each', () => {
    expect(expandBullets('Info: • School: Dayap • Grade: 9')).toEqual(['Info:', '- School: Dayap', '- Grade: 9']);
    expect(expandBullets('• one • two')).toEqual(['- one', '- two']);
    // A single dot inside an ordinary sentence stays as written.
    expect(expandBullets('Luna • KaTuro assistant')).toEqual(['Luna • KaTuro assistant']);
  });

  it('the crammed reply becomes paragraphs, labelled lists and a closing line', () => {
    const blocks = parseBlocks(CRAMMED);
    expect(blocks.map((b) => b.type)).toEqual(['para', 'para', 'list', 'para', 'list', 'para']);
    expect(blocks[1]).toMatchObject({ leadIn: true, lines: ['General Information (from sheet INPUT):'] });
    expect(blocks[2].items.map((i) => i.text)).toEqual(['School: Dayap National High School', 'School ID: 301238', 'Subject: Research']);
    expect(blocks[4].items).toHaveLength(3);
  });

  it('numbered steps keep their numbers; nesting follows the indent actually used', () => {
    const [list] = parseBlocks('1. Open the file\n    - check the INPUT sheet\n2) Encode scores');
    expect(list.items).toEqual([
      { level: 0, ordered: true, number: '1.', text: 'Open the file' },
      { level: 1, ordered: false, number: '-', text: 'check the INPUT sheet' },
      { level: 0, ordered: true, number: '2.', text: 'Encode scores' },
    ]);
  });

  it('a blank line between items keeps one list; an indented line continues an item', () => {
    const blocks = parseBlocks('- a\n\n- b\n  more of b');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].items.map((i) => i.text)).toEqual(['a', 'b more of b']);
  });

  it('labels: short "Label: value" only — not URLs, times or sentences', () => {
    expect(splitLabel('Total Learners: 29')).toEqual({ label: 'Total Learners', rest: '29' });
    expect(splitLabel('See https://deped.gov.ph')).toBeNull();
    expect(splitLabel('Class starts at 7:30 am')).toBeNull();
    expect(splitLabel('All went well. Then this: more')).toBeNull();
    expect(splitLabel('**Already bold**: x')).toBeNull();
  });

  it('renders bold, italic, underline and bold labels; no markdown symbols are left', () => {
    const out = html('**29 learners** passed. Read *DO 8, s. 2015*. <u>Submit by Friday.</u>\n\n- Mean: **40.52**');
    expect(out).toContain('<strong class="font-semibold text-gray-900">29 learners</strong>');
    expect(out).toContain('<em class="italic">DO 8, s. 2015</em>');
    expect(out).toMatch(/<span class="underline[^"]*">Submit by Friday\.<\/span>/);
    expect(out).toContain('<strong class="font-semibold text-gray-900">Mean:</strong>');
    expect(out).not.toMatch(/\*\*|<u>|&lt;u&gt;/);
  });

  it('math and lone asterisks are not mistaken for italics', () => {
    const out = html('Score = 2 * 3 * 4 and a lone ** mark');
    expect(out).not.toContain('<em');
    expect(out).toContain('2 * 3 * 4');
    expect(out).not.toContain('**');
  });

  it('the crammed reply renders each item as its own list row', () => {
    const out = html(CRAMMED);
    expect((out.match(/<li /g) || []).length).toBe(6);
    expect(out).not.toContain('•');
  });
});
