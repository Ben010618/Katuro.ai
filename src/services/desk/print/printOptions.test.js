import { describe, it, expect } from 'vitest';
import { parsePageRanges, specForPrint, portraitPaperInches, pickPrinter } from './printOptions';

describe('print panel choices', () => {
  it('page ranges the way teachers type them', () => {
    expect(parsePageRanges('')).toEqual({ ranges: [] });
    expect(parsePageRanges('1-3, 5')).toEqual({ ranges: [{ from: 0, to: 2 }, { from: 4, to: 4 }] });
    expect(parsePageRanges('2-', 6)).toEqual({ ranges: [{ from: 1, to: 5 }] });
    expect(parsePageRanges('4-9', 6)).toEqual({ ranges: [{ from: 3, to: 5 }] });
    expect(parsePageRanges('7', 6).error).toMatch(/6 pages/);
    expect(parsePageRanges('3-1').error).toMatch(/not a page range/);
    expect(parsePageRanges('0').error).toMatch(/not a page range/);
    expect(parsePageRanges('a-b').error).toMatch(/not a page/);
  });

  it('another paper or orientation lays the document out again; margins that no longer fit fall back', () => {
    const spec = { title: 'T', paper: 'long', orientation: 'portrait', margins: { top: 1, bottom: 1, left: 1, right: 1 }, blocks: [{ type: 'paragraph', text: 'x' }] };
    const a4 = specForPrint(spec, { paper: 'a4', orientation: 'landscape' });
    expect([a4.paper, a4.orientation, a4.margins]).toEqual(['a4', 'landscape', { top: 1, bottom: 1, left: 1, right: 1 }]);
    expect(specForPrint(spec, { paper: 'nonsense' }).paper).toBe('long');
    // 3" sides still leave 2.5" of text on short bond: kept. Bad values are dropped (KaTuro margins).
    expect(specForPrint({ ...spec, margins: { top: 1, bottom: 1, left: 3, right: 3 } }, { paper: 'letter' }).margins.left).toBe(3);
    expect(specForPrint({ ...spec, margins: { top: 1, bottom: 1, left: 5, right: 1 } }, { paper: 'letter' }).margins).toBeUndefined();
    expect(portraitPaperInches('legal')).toEqual({ width: 8.5, height: 14 });
  });

  it('starts with the Windows default printer when it works', () => {
    const list = [
      { name: 'Microsoft Print to PDF', savesFile: true },
      { name: 'EPSON L3210', isDefault: true, problem: 'Offline' },
      { name: 'Brother', problem: '' },
    ];
    expect(pickPrinter(list)).toBe('Brother');
    expect(pickPrinter([{ name: 'A' }, { name: 'B', isDefault: true }])).toBe('B');
    expect(pickPrinter([{ name: 'Only PDF', savesFile: true }])).toBe('Only PDF');
    expect(pickPrinter([])).toBe('');
  });
});
