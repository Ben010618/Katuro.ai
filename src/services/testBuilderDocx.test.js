import { describe, it, expect } from 'vitest';
import { buildTestPaperParts } from './testBuilderDocx';

describe('buildTestPaperParts', () => {
  it('builds test and key blocks for Multiple Choice items', () => {
    const items = [
      {
        question: 'What is the primary organ for photosynthesis?',
        choices: { A: 'Stem', B: 'Leaf', C: 'Root', D: 'Flower' },
        answer: 'B',
        format: 'Multiple Choice',
        cognitiveLevel: 'remembering',
      },
    ];
    const { testBlocks, keyBlocks } = buildTestPaperParts(items, 'en');
    expect(testBlocks.length).toBeGreaterThan(0);
    expect(keyBlocks.length).toBeGreaterThan(0);
  });

  it('builds test and key blocks for True or False items', () => {
    const items = [
      {
        question: 'The sun revolves around the Earth.',
        answer: 'FALSE',
        format: 'True or False',
        cognitiveLevel: 'understanding',
      },
    ];
    const { testBlocks, keyBlocks } = buildTestPaperParts(items, 'en');
    expect(testBlocks.length).toBeGreaterThan(0);
    expect(keyBlocks.length).toBeGreaterThan(0);
  });

  it('builds test and key blocks for Matching Type items', () => {
    const items = [
      {
        question: 'Mitochondria',
        matchDefinition: 'Powerhouse of the cell',
        format: 'Matching Type',
        cognitiveLevel: 'remembering',
      },
      {
        question: 'Chloroplast',
        matchDefinition: 'Site of photosynthesis',
        format: 'Matching Type',
        cognitiveLevel: 'remembering',
      },
    ];
    const { testBlocks, keyBlocks } = buildTestPaperParts(items, 'en');
    expect(testBlocks.length).toBeGreaterThan(0);
    expect(keyBlocks.length).toBeGreaterThan(0);
  });

  it('builds test and key blocks for Filipino medium', () => {
    const items = [
      {
        question: 'Ano ang pambansang ibon ng Pilipinas?',
        choices: { A: 'Maya', B: 'Agila', C: 'Kalapati', D: 'Loro' },
        answer: 'B',
        format: 'Multiple Choice',
        cognitiveLevel: 'remembering',
      },
      {
        question: 'Ang Maynila ang kabisera ng Pilipinas.',
        answer: 'TRUE',
        format: 'True or False',
        cognitiveLevel: 'remembering',
      },
    ];
    const { testBlocks, keyBlocks } = buildTestPaperParts(items, 'fil');
    expect(testBlocks.length).toBeGreaterThan(0);
    expect(keyBlocks.length).toBeGreaterThan(0);
  });

  it('handles empty items array gracefully', () => {
    const { testBlocks, keyBlocks } = buildTestPaperParts([], 'en');
    expect(testBlocks).toEqual([]);
    expect(keyBlocks).toEqual([]);
  });

  it('safely handles items with missing or undefined properties', () => {
    const items = [
      {
        question: 'Undefined answer test',
        format: 'Multiple Choice',
        choices: null,
        answer: null,
      },
      {
        question: 'Undefined free text',
        format: 'Essay',
        answer: undefined,
      },
    ];
    const { testBlocks, keyBlocks } = buildTestPaperParts(items, 'en');
    expect(testBlocks.length).toBeGreaterThan(0);
    expect(keyBlocks.length).toBeGreaterThan(0);
  });
});
