import { describe, it, expect } from 'vitest';
import {
  createVirtualWorkspace,
  readFileText,
  readFileBytes,
  writeFileToDirectory,
  getAvailablePath,
  createDirectoryInWorkspace,
  findEntryByPath,
} from './localFileSystem';
import { useDeskStore } from '../store/deskStore';

describe('KaTuroDesk workspace file engine (virtual backend)', () => {
  it('creates an initialized virtual workspace with sample DepEd files', () => {
    const ws = createVirtualWorkspace('Grade 7 Science Q1');
    expect(ws.name).toBe('Grade 7 Science Q1');
    expect(ws.isVirtual).toBe(true);
    const allNames = JSON.stringify(ws.files);
    expect(allNames).toContain('.docx');
    expect(allNames).toContain('Class_Roster');
  });

  it('reads content from virtual files gracefully using readFileText', async () => {
    const ws = createVirtualWorkspace('Sample Folder');
    const saveResult = await ws.handle.saveVirtualFile('test-notes.txt', 'Sample DepEd lesson notes');
    expect(saveResult.success).toBe(true);
    const savedFile = ws.files.find((f) => f.name === 'test-notes.txt');
    const content = await readFileText({ isVirtual: true, content: savedFile.content });
    expect(content).toBe('Sample DepEd lesson notes');
  });

  it('writes binary into nested folders and reads the same bytes back', async () => {
    const ws = createVirtualWorkspace('X');
    const bytes = new Uint8Array([80, 75, 3, 4, 0, 255]);
    const res = await writeFileToDirectory(ws.handle, 'A/B/file.docx', bytes);
    expect(res.path).toBe('A/B/file.docx');
    const back = await readFileBytes(ws.handle, 'A/B/file.docx');
    expect(Array.from(back)).toEqual(Array.from(bytes));
    expect(findEntryByPath(ws.handle.getFiles(), 'a/b/FILE.docx')).toBeTruthy();
  });

  it('never overwrites when asked not to (auto-renames)', async () => {
    const ws = createVirtualWorkspace('X');
    await writeFileToDirectory(ws.handle, 'Out/report.docx', 'one');
    expect(await getAvailablePath(ws.handle, 'Out/report.docx')).toBe('Out/report (2).docx');
    const second = await writeFileToDirectory(ws.handle, 'Out/report.docx', 'two', 'text/plain', { overwrite: false });
    expect(second.path).toBe('Out/report (2).docx');
  });

  it('rejects path traversal', async () => {
    const ws = createVirtualWorkspace('X');
    await expect(writeFileToDirectory(ws.handle, '../escape.txt', 'x')).rejects.toThrow(/not allowed/);
    await expect(createDirectoryInWorkspace(ws.handle, 'a/../../b')).rejects.toThrow(/not allowed/);
  });
});

describe('KaTuroDesk Zustand Store', () => {
  it('initializes with welcome message, virtual workspace and privacy on', () => {
    const state = useDeskStore.getState();
    expect(state.messages.length).toBeGreaterThanOrEqual(1);
    expect(state.workspace).toBeDefined();
    expect(state.privacyMode).toBe(true);
  });

  it('adds messages and patches the last assistant message', () => {
    const { addMessage, updateLastAssistantMessage } = useDeskStore.getState();
    addMessage({ role: 'user', content: 'Teacher prompt for test' });
    addMessage({ role: 'assistant', content: '', isThinking: true });
    updateLastAssistantMessage({ content: 'Assistant finished!', steps: [{ id: 's', label: 'Step 1', status: 'done' }], isThinking: false });
    const lastMsg = useDeskStore.getState().messages.at(-1);
    expect(lastMsg.content).toBe('Assistant finished!');
    expect(lastMsg.steps[0].status).toBe('done');
  });

  it('toggles attachments and tracks session artifacts', () => {
    const s = useDeskStore.getState();
    s.toggleAttachment('a.xlsx');
    s.toggleAttachment('b.pdf');
    s.toggleAttachment('a.xlsx');
    expect(useDeskStore.getState().attachedPaths).toEqual(['b.pdf']);
    s.addArtifacts([{ id: 'art1', type: 'document', title: 'T', files: [] }]);
    s.setActiveArtifact(useDeskStore.getState().artifacts[0]);
    s.updateArtifact('art1', { title: 'T2' });
    expect(useDeskStore.getState().activeArtifact.title).toBe('T2');
  });

  it('imports dropped files into KaTuro Imports and attaches them', async () => {
    useDeskStore.getState().setWorkspace(createVirtualWorkspace('Imp'));
    const fakeFile = { name: 'photo.jpg', type: 'image/jpeg', arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
    const paths = await useDeskStore.getState().importFiles([fakeFile]);
    expect(paths[0]).toMatch(/^KaTuro Imports\/\d{4}-\d{2}-\d{2}\/photo\.jpg$/);
    expect(useDeskStore.getState().attachedPaths).toContain(paths[0]);
  });
});
