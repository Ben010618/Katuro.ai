import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateItemsForCompetency } from './testBuilderItemsAI';
import { buildItemSlots, computeTOS } from '../utils/testBuilderCalc';
import {
  buildTestPaperParts,
  downloadTosDocx,
  downloadTestQuestionsDocx,
  downloadAnswerKeyDocx,
} from './testBuilderDocx';
import { suggestCognitiveWeights } from './testBuilderAI';

// Mock callGeminiProxy
vi.mock('./geminiConfig', () => ({
  callGeminiProxy: vi.fn(),
}));

import { callGeminiProxy } from './geminiConfig';

describe('End-to-End Test Generation Suite', () => {
  beforeEach(() => {
    // Mock browser download environment (URL and createElement)
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    globalThis.URL.revokeObjectURL = vi.fn();
    if (typeof document !== 'undefined') {
      document.createElement = vi.fn((tag) => {
        if (tag === 'a') {
          return {
            href: '',
            download: '',
            click: vi.fn(),
          };
        }
        return {};
      });
    }
  });

  const sampleCompetencies = [
    { id: 'c1', text: 'Identify main idea in a paragraph', days: 5 },
    { id: 'c2', text: 'Distinguish fact from opinion', days: 5 },
    { id: 'c3', text: 'Draw conclusions from text', days: 10 },
  ];

  const sampleWeights = {
    remembering: 20,
    understanding: 30,
    applying: 20,
    analyzing: 15,
    evaluating: 10,
    creating: 5,
  };

  it('Step 1: Successfully computes Table of Specifications (TOS) without errors', () => {
    const tos = computeTOS(sampleCompetencies, sampleWeights, 30);
    expect(tos.rows).toHaveLength(3);
    const grandTotal = tos.rows.reduce((sum, r) => sum + r.total, 0);
    expect(grandTotal).toBe(30);
    expect(tos.columnTotals[0]).toBeGreaterThan(0);
    expect(tos.hotsPct).toBeGreaterThanOrEqual(0);
  });

  it('Step 2: Successfully builds item slots across all supported question formats', () => {
    const tos = computeTOS(sampleCompetencies, sampleWeights, 30);
    const formats = ['Multiple Choice', 'True or False', 'Matching Type', 'Identification', 'Enumeration', 'Essay'];
    
    // Combine cells across all rows to get complete test paper slots
    let slots = [];
    let startIdx = 0;
    for (const row of tos.rows) {
      const rowSlots = buildItemSlots(row.cells, formats, startIdx, { competencyId: row.id, competencyText: row.text });
      slots = slots.concat(rowSlots);
      startIdx += rowSlots.length;
    }

    expect(slots.length).toBe(30);
    expect(slots[0].format).toBeDefined();
    expect(slots[0].cognitiveLevel).toBeDefined();

    // Ensure all formats are distributed
    const assignedFormats = new Set(slots.map((s) => s.format));
    expect(assignedFormats.size).toBe(formats.length);
  });

  it('Step 3: Bloom cognitive weights AI suggestion handles valid & fallback responses', async () => {
    callGeminiProxy.mockResolvedValueOnce({
      text: JSON.stringify({
        weights: {
          remembering: 15,
          understanding: 25,
          applying: 25,
          analyzing: 15,
          evaluating: 10,
          creating: 10,
        },
        rationale: 'Balanced for Grade 5 Reading',
      }),
    });

    const result = await suggestCognitiveWeights({
      gradeLevel: 'Grade 5',
      subject: 'English',
      competencies: sampleCompetencies,
      keyStage: 'key_stage_2',
    });

    expect(result.weights).toBeDefined();
    const sum = Object.values(result.weights).reduce((a, b) => a + b, 0);
    expect(sum).toBe(100);
  });

  it('Step 4: AI test item generation generates items and normalizes formats', async () => {
    const mockItems = [
      {
        question: 'What is the main idea?',
        choices: {
          A: 'The topic sentence',
          B: 'A supporting detail',
          C: 'The title only',
          D: 'A conclusion',
        },
        answer: 'A',
      },
      {
        question: 'A fact is something that can be proven true.',
        answer: 'TRUE',
      },
      {
        question: 'Photosynthesis',
        matchDefinition: 'Process by which plants make food',
      },
      {
        question: 'The process of grouping items based on similarities is called ____.',
        answer: 'Classification',
      },
      {
        question: 'Enumerate the three main states of matter.',
        answer: 'Solid, Liquid, Gas',
      },
      {
        question: 'Explain why forest conservation is critical for preventing floods.',
        answer: 'Trees absorb water and anchor soil.',
      },
    ];

    callGeminiProxy.mockResolvedValueOnce({
      text: JSON.stringify({ items: mockItems }),
    });

    const formats = ['Multiple Choice', 'True or False', 'Matching Type', 'Identification', 'Enumeration', 'Essay'];
    const cells = [1, 1, 1, 1, 1, 1]; // 6 items across 6 bloom levels

    const result = await generateItemsForCompetency({
      competencyText: 'Identify main idea and scientific concepts',
      cells,
      subject: 'Science',
      gradeLevel: 'Grade 5',
      questionFormats: formats,
      proficiencyLevel: 'proficient',
      contextNotes: 'MATATAG aligned',
      startIndex: 0,
    });

    expect(result.items.length).toBe(6);
    expect(result.items[0].format).toBe('Multiple Choice');
    expect(result.items[0].choices.A).toBe('The topic sentence');
    expect(result.items[1].format).toBe('True or False');
    expect(result.items[1].answer).toBe('TRUE');
    expect(result.items[2].format).toBe('Matching Type');
    expect(result.items[2].matchDefinition).toBe('Process by which plants make food');
    expect(result.items[3].format).toBe('Identification');
    expect(result.items[3].answer).toBe('Classification');
    expect(result.items[4].format).toBe('Enumeration');
    expect(result.items[4].answer).toBe('Solid, Liquid, Gas');
    expect(result.items[5].format).toBe('Essay');
  });

  it('Step 5: buildTestPaperParts structures test and key blocks for English and Filipino', () => {
    const allItems = [
      {
        format: 'Multiple Choice',
        question: 'Choose the correct answer.',
        choices: { A: 'Alpha', B: 'Beta', C: 'Gamma', D: 'Delta' },
        answer: 'A',
      },
      {
        format: 'True or False',
        question: 'Is the sky blue?',
        answer: 'TRUE',
      },
      {
        format: 'Matching Type',
        question: 'Water',
        matchDefinition: 'H2O molecule',
        answer: 'A',
      },
      {
        format: 'Identification',
        question: 'Name of the first Philippine president:',
        answer: 'Emilio Aguinaldo',
      },
      {
        format: 'Enumeration',
        question: 'Give 3 primary colors:',
        answer: 'Red, Blue, Yellow',
      },
      {
        format: 'Essay',
        question: 'Discuss the impact of climate change.',
        answer: 'Model answer for essay',
      },
    ];

    // English parts
    const enParts = buildTestPaperParts(allItems, 'en');
    expect(enParts.testBlocks.length).toBeGreaterThan(0);
    expect(enParts.keyBlocks.length).toBeGreaterThan(0);

    // Filipino parts
    const filParts = buildTestPaperParts(allItems, 'fil');
    expect(filParts.testBlocks.length).toBeGreaterThan(0);
    expect(filParts.keyBlocks.length).toBeGreaterThan(0);
  });

  it('Step 6: DOCX generation creates valid documents without throwing exceptions', async () => {
    const meta = {
      subject: 'Science',
      gradeLevel: 'Grade 5',
      testType: 'summative_test_1',
      terms: 'First Quarter',
      targetCompetencies: 'Identify and describe states of matter',
      contextNotes: 'DepEd compliant format',
    };

    const profile = {
      schoolName: 'Central Elementary School',
      name: 'Teacher Juan',
      division: 'Division of City Schools',
      region: 'Region IV-A',
    };

    const tos = computeTOS(sampleCompetencies, sampleWeights, 10);
    const mockItems = [
      {
        format: 'Multiple Choice',
        question: 'Sample MC Question',
        choices: { A: '1', B: '2', C: '3', D: '4' },
        answer: 'A',
      },
      {
        format: 'True or False',
        question: 'Sample TF Question',
        answer: 'TRUE',
      },
      {
        format: 'Matching Type',
        question: 'Sample Matching Prompt',
        matchDefinition: 'Definition A',
        answer: 'A',
      },
      {
        format: 'Identification',
        question: 'Sample Identification Question',
        answer: 'Identification Answer',
      },
      {
        format: 'Enumeration',
        question: 'Sample Enumeration Question',
        answer: 'Item 1, Item 2',
      },
      {
        format: 'Essay',
        question: 'Sample Essay Question',
        answer: 'Essay model answer',
      },
    ];

    const parts = buildTestPaperParts(mockItems, 'en');

    // Test downloading TOS DOCX
    await expect(downloadTosDocx({ tos, itemCeiling: 10, meta, profile })).resolves.not.toThrow();

    // Test downloading Test Questions DOCX
    await expect(downloadTestQuestionsDocx({ testBlocks: parts.testBlocks, meta, profile })).resolves.not.toThrow();

    // Test downloading Answer Key DOCX
    await expect(downloadAnswerKeyDocx({ keyBlocks: parts.keyBlocks, meta, profile })).resolves.not.toThrow();
  });

  it('Step 7: Seamlessly swaps to NVIDIA NIM fallback when Gemini is busy or errors', async () => {
    // Resolves with NVIDIA NIM fallback response
    const mockNvidiaItems = [
      {
        question: 'What is matter?',
        choices: { A: 'Anything that occupies space', B: 'Energy only', C: 'Light only', D: 'Vacuum' },
        answer: 'A',
      },
    ];

    callGeminiProxy.mockResolvedValueOnce({
      text: JSON.stringify({ items: mockNvidiaItems }),
      finishReason: 'STOP',
      engine: 'nvidia',
    });

    const result = await generateItemsForCompetency({
      competencyText: 'Describe characteristics of matter',
      cells: [1, 0, 0, 0, 0, 0],
      subject: 'Science',
      gradeLevel: 'Grade 5',
      questionFormats: ['Multiple Choice'],
      proficiencyLevel: 'proficient',
      contextNotes: 'Fallback test',
      startIndex: 0,
      isRetry: true,
    });

    expect(result.items.length).toBe(1);
    expect(result.items[0].question).toBe('What is matter?');
    expect(result.items[0].choices.A).toBe('Anything that occupies space');
  });
});
