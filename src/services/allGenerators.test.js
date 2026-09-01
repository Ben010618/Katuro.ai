import { describe, it, expect, vi } from 'vitest';
import { generateCotLesson } from './cotAI';
import { generateDLLProcedure } from './dllAI';
import {
  genMatching,
  genJumbled,
  genTrueFalse,
  genCrossword,
  genWordHunt,
  genFillBlanks,
} from './gamificationAI';
import { generateOutline } from './presentationAI';

// Mock geminiConfig & nvidiaConfig
vi.mock('./geminiConfig', () => ({
  callGeminiProxy: vi.fn(),
  getGeminiKey: vi.fn().mockResolvedValue('test-gemini-key'),
}));

vi.mock('./nvidiaConfig', () => ({
  getNvidiaConfig: vi.fn().mockResolvedValue({
    apiKey: 'test-nvidia-key',
    model: 'nvidia/llama-3.1-nemotron-70b-instruct',
    imageModel: 'stabilityai/stable-diffusion-xl',
  }),
  callNvidiaChat: vi.fn().mockResolvedValue(
    JSON.stringify({
      slides: [
        { id: 1, type: 'title', title: 'Test Lesson', keyPoints: [], expand: false },
        { id: 2, type: 'concept', title: 'Main Concept', keyPoints: ['Point 1'], expand: true },
      ],
    })
  ),
  generateNvidiaImage: vi.fn().mockResolvedValue('data:image/png;base64,mockImage'),
}));

import { callGeminiProxy } from './geminiConfig';

describe('All AI Generation Modules Full Verification Suite', () => {
  const sampleLesson = {
    subject: 'Science',
    gradeLevel: 'Grade 5',
    topic: 'States of Matter',
    melc: 'Investigate changes in materials under different conditions',
  };

  it('1. COT Lesson Plan generates and parses valid PPST-aligned structure', async () => {
    callGeminiProxy.mockResolvedValueOnce({
      text: JSON.stringify({
        meta: { topic: 'States of Matter' },
        learningObjectives: ['Objective 1', 'Objective 2'],
        fourAs: {
          activity: { title: 'Ice Melting', content: 'Observe ice cubes' },
          analysis: { title: 'Analysis', content: 'Why did it melt?' },
          abstraction: { title: 'Abstraction', content: 'States of matter overview' },
          application: { title: 'Application', content: 'Everyday applications' },
        },
        cotEvidenceMap: [],
      }),
    });

    const plan = await generateCotLesson({
      teacherName: 'Teacher Juan',
      school: 'Central Elementary',
      subject: 'Science',
      grade: 'Grade 5',
      quarter: 'Q1',
      topic: 'States of Matter',
      melc: 'Investigate changes in materials',
      materials: 'Ice, cup, water',
      selectedIndicators: [{ id: 'ppst-1-1-2', code: 'PPST 1.1.2', num: '1', description: 'Applied content knowledge' }],
    });

    expect(plan.meta.topic).toBe('States of Matter');
    expect(plan.fourAs.activity.title).toBe('Ice Melting');
  });

  it('2. DLL (Daily Lesson Log) generates Mon-Fri procedures and objectives cleanly', async () => {
    callGeminiProxy.mockResolvedValueOnce({
      text: JSON.stringify({
        objectives: {
          monday: 'Identify solids',
          tuesday: 'Identify liquids',
          wednesday: 'Identify gases',
          thursday: 'Compare states',
          friday: 'Weekly quiz',
        },
        procedure: {
          monday: { A: 'Review', B: 'Intro', C: 'Demo', D: 'Practice', E: 'Activity', F: 'Mastery', G: 'Application', H: 'Generalization', I: 'Evaluation', J: 'Remediation' },
        },
        resources: {
          teacherGuidePages: 'pp. 10-15',
          learnersMaterialPages: 'pp. 20-25',
        },
      }),
    });

    const dll = await generateDLLProcedure({
      subject: 'Science',
      gradeLevel: 'Grade 5',
      term: 'Quarter 1',
      contentStandards: 'Content std',
      performanceStandards: 'Perf std',
      melcList: [{ text: 'Investigate changes in materials', days: 5 }],
      contentList: [{ text: 'States of matter', days: 5 }],
    });

    expect(dll.objectives.monday).toBe('Identify solids');
    expect(dll.procedure.monday.A).toBe('Review');
    expect(dll.resources.teacherGuidePages).toBe('pp. 10-15');
  });

  it('3. Gamification Worksheets (Matching, Jumbled, True/False, Crossword, WordHunt, Fill-in-Blanks) all generate without error', async () => {
    // 3a. Matching
    callGeminiProxy.mockResolvedValueOnce({
      text: JSON.stringify({ pairs: [{ term: 'Solid', definition: 'Fixed shape and volume' }] }),
    });
    const matching = await genMatching(sampleLesson, 1);
    expect(matching.length).toBe(1);
    expect(matching[0].term).toBe('Solid');

    // 3b. Jumbled
    callGeminiProxy.mockResolvedValueOnce({
      text: JSON.stringify({ items: [{ word: 'LIQUID', clue: 'Has fixed volume but no fixed shape' }] }),
    });
    const jumbled = await genJumbled(sampleLesson, 1);
    expect(jumbled.length).toBe(1);
    expect(jumbled[0].word).toBe('LIQUID');

    // 3c. True/False
    callGeminiProxy.mockResolvedValueOnce({
      text: JSON.stringify({ items: [{ statement: 'Ice is a solid.', answer: true }] }),
    });
    const tf = await genTrueFalse(sampleLesson, 1);
    expect(tf.length).toBe(1);
    expect(tf[0].answer).toBe(true);

    // 3d. Crossword
    callGeminiProxy.mockResolvedValueOnce({
      text: JSON.stringify({ pairs: [{ word: 'GAS', clue: 'Fills any container' }] }),
    });
    const crossword = await genCrossword(sampleLesson, 1);
    expect(crossword.length).toBe(1);
    expect(crossword[0].word).toBe('GAS');

    // 3e. WordHunt
    callGeminiProxy.mockResolvedValueOnce({
      text: JSON.stringify({ words: [{ word: 'MATTER', definition: 'Occupies space' }] }),
    });
    const wordHunt = await genWordHunt(sampleLesson, 1);
    expect(wordHunt.length).toBe(1);
    expect(wordHunt[0].word).toBe('MATTER');

    // 3f. Fill in Blanks
    callGeminiProxy.mockResolvedValueOnce({
      text: JSON.stringify({ items: [{ sentence: 'Water is a _______.', answer: 'liquid', choices: ['liquid', 'solid', 'gas', 'plasma'] }] }),
    });
    const fillBlanks = await genFillBlanks(sampleLesson, 1);
    expect(fillBlanks.length).toBe(1);
    expect(fillBlanks[0].answer).toBe('liquid');
  });

  it('4. Presentation PPT outline generator creates valid structured slides with NVIDIA NIM failover', async () => {
    const res = await generateOutline({
      subject: 'Science',
      gradeLevel: 'Grade 5',
      melcCode: 'S5MT-Ia-1',
      topic: 'States of Matter',
      slideCount: 2,
    });

    expect(res.outline).toBeDefined();
    expect(res.outline.length).toBe(2);
    expect(res.outline[0].title).toBe('Test Lesson');
  });
});
