import { describe, it, expect, beforeEach } from 'vitest';
import { loadPins, savePins, togglePin, movePins, indexTree } from './explorerPins';

describe('Explorer pins', () => {
  beforeEach(() => {
    const store = new Map();
    globalThis.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    };
  });

  it('are kept per open folder', () => {
    savePins('C:\\Home', ['Records', 'Lessons/Week 1.pptx']);
    expect(loadPins('c:\\home')).toEqual(['Records', 'Lessons/Week 1.pptx']);
    expect(loadPins('D:\\Other')).toEqual([]);
    expect(loadPins('')).toEqual([]);
  });

  it('survive broken storage', () => {
    localStorage.setItem('katuro-desk-pins:c:\\home', '{not json');
    expect(loadPins('C:\\Home')).toEqual([]);
    globalThis.localStorage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(loadPins('C:\\Home')).toEqual([]);
    expect(() => savePins('C:\\Home', ['x'])).not.toThrow();
  });

  it('pin to the top and unpin', () => {
    expect(togglePin(['a'], 'b')).toEqual(['b', 'a']);
    expect(togglePin(['b', 'a'], 'b')).toEqual(['a']);
  });

  it('follow a rename and go with a delete, including what is inside', () => {
    const pins = ['Seminars', 'Seminars/Day 1.docx', 'Seminars2', 'Records'];
    expect(movePins(pins, 'Seminars', 'Trainings')).toEqual(['Trainings', 'Trainings/Day 1.docx', 'Seminars2', 'Records']);
    expect(movePins(pins, 'Seminars', null)).toEqual(['Seminars2', 'Records']);
  });

  it('find any folder or file by path', () => {
    const map = indexTree([{ path: 'Records', kind: 'directory', children: [{ path: 'Records/a.xlsx', kind: 'file' }] }]);
    expect([...map.keys()]).toEqual(['Records', 'Records/a.xlsx']);
  });
});
