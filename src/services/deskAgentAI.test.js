import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createVirtualWorkspace, readFileText, writeFileToDirectory } from './localFileSystem';
import { runDeskAgentTurn } from './deskAgentAI';
import { useDeskStore } from '../store/deskStore';

// Mock callGeminiProxy and deductTokens so tests are instant and deterministic
vi.mock('./geminiConfig', () => ({
  callGeminiProxy: vi.fn().mockResolvedValue(`### OFFICIAL DEPED DAILY LESSON LOG (DLL)
**Grade Level:** Grade 7 | **Learning Area:** Science | **Quarter:** 1

#### I. OBJECTIVES
- **Content Standard:** Demonstrates understanding of the parts and functions of the compound microscope and plant/animal cells.
- **Performance Standard:** Employs appropriate techniques using the compound microscope to gather data about cells.
- **Learning Competency:** **[SCI7-Q1-01]** Identify the parts of a compound microscope and their functions.

#### II. CONTENT
- Microscopy and Cellular Biology

#### III. LEARNING RESOURCES
- DepEd MATATAG Curriculum Guide, Laboratory Manual.

#### IV. PROCEDURES
- **Monday:** Orientation to the compound microscope.
- **Tuesday:** Hands-on glass slide preparation.
- **Wednesday:** Comparison of onion skin cells and cheek cells.
- **Thursday:** Structure vs function synthesis.
- **Friday:** Formative assessment & mastery check.`),
}));

vi.mock('./db', () => ({
  deductTokens: vi.fn().mockResolvedValue(true),
}));

describe('KaTuroDesk Local File System & Virtual Workspace', () => {
  it('creates an initialized virtual workspace with sample DepEd files', () => {
    const ws = createVirtualWorkspace('Grade 7 Science Q1');
    expect(ws.name).toBe('Grade 7 Science Q1');
    expect(ws.isVirtual).toBe(true);
    expect(ws.files.length).toBeGreaterThan(0);
    // Virtual workspace contains folder trees and files
    const allNames = JSON.stringify(ws.files);
    expect(allNames).toContain('.docx');
    expect(allNames).toContain('Class_Roster');
  });

  it('reads content from virtual files gracefully using readFileText', async () => {
    const ws = createVirtualWorkspace('Sample Folder');
    // Save a virtual file first
    const saveResult = await ws.handle.saveVirtualFile('test-notes.txt', 'Sample DepEd lesson notes');
    expect(saveResult.success).toBe(true);

    const savedFile = ws.files.find((f) => f.name === 'test-notes.txt');
    const content = await readFileText({ isVirtual: true, content: savedFile.content });
    expect(content).toBe('Sample DepEd lesson notes');
  });
});

describe('KaTuroDesk Zustand Store', () => {
  it('initializes with default welcome message and virtual workspace', () => {
    const state = useDeskStore.getState();
    expect(state.messages.length).toBeGreaterThanOrEqual(1);
    expect(state.workspace).toBeDefined();
    expect(state.activeAgentId).toBe('dll');
  });

  it('adds user messages and updates steps correctly', () => {
    const { addMessage, updateLastAssistantMessage } = useDeskStore.getState();

    addMessage({
      role: 'user',
      content: 'Teacher prompt for test',
    });

    addMessage({
      role: 'assistant',
      content: 'Assistant drafting...',
      steps: [{ text: 'Step 1', status: 'running' }],
    });

    updateLastAssistantMessage({
      content: 'Assistant finished!',
      steps: [{ text: 'Step 1', status: 'done' }],
    });

    const updatedState = useDeskStore.getState();
    const lastMsg = updatedState.messages[updatedState.messages.length - 1];
    expect(lastMsg.content).toBe('Assistant finished!');
    expect(lastMsg.steps[0].status).toBe('done');
  });

  it('sets and updates active artifact for live canvas rendering', () => {
    const { setActiveArtifact } = useDeskStore.getState();
    const mockArtifact = {
      id: 'test-art-1',
      type: 'dll',
      title: 'Science Grade 7 - Lesson 1',
      rawText: '### Objectives',
      data: { subject: 'Science', gradeLevel: 'Grade 7' },
    };

    setActiveArtifact(mockArtifact);
    expect(useDeskStore.getState().activeArtifact).toEqual(mockArtifact);
  });
});

describe('KaTuroDesk Autonomous Co-Teacher Orchestration', () => {
  it('throws INSUFFICIENT_TOKENS when token balance is less than required cost and not freeMode', async () => {
    await expect(
      runDeskAgentTurn({
        prompt: 'Create a DLL for Science 7',
        user: { uid: 'user-123' },
        tokenBalance: 0,
        freeMode: false,
      })
    ).rejects.toThrow('INSUFFICIENT_TOKENS');
  });

  it('successfully executes steps and produces authentic DepEd MATATAG artifact', async () => {
    const stepsEmitted = [];
    const result = await runDeskAgentTurn({
      prompt: 'Prepare Grade 7 Science Lesson on Cell Structure and Plant Tissues',
      agentId: 'dll',
      workspace: createVirtualWorkspace('Grade 7 Science'),
      user: { uid: 'user-123' },
      tokenBalance: 10,
      freeMode: false,
      onStepUpdate: (steps) => {
        stepsEmitted.push([...steps]);
      },
    });

    expect(result).toBeDefined();
    expect(result.content).toContain('Daily Lesson Log');
    expect(result.artifact).toBeDefined();
    expect(result.artifact.title).toContain('Science');
    expect(result.artifact.rawText).toContain('OFFICIAL DEPED DAILY LESSON LOG');
    expect(result.artifact.data.gradeLevel).toBe('Grade 7');
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.steps.every((s) => s.status === 'done')).toBe(true);
  });

  it('reads multiple referenced documents and creates a designated subfolder', async () => {
    const ws = createVirtualWorkspace('Grade 7 Science');
    const result = await runDeskAgentTurn({
      prompt: "Study 'Week 1 - Cell Theory.docx' and 'Q1_Summative_Test_1_with_TOS.docx', create a folder named 'Remediation_Week1', and inside it generate a differentiated remedial worksheet",
      agentId: 'dll',
      workspace: ws,
      user: { uid: 'user-123' },
      tokenBalance: 10,
      freeMode: false,
    });

    expect(result.createdFolder).toBe('Remediation_Week1');
    expect(result.createdFilePath).toContain('Remediation_Week1');
    expect(result.steps.some((s) => s.text.includes('Read & extracted') || s.text.includes('Reading & synthesizing'))).toBe(true);
    expect(result.steps.some((s) => s.text.includes('Remediation_Week1'))).toBe(true);
    expect(result.content).toContain('Remediation_Week1');
  });
});
