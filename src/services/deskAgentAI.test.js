import { describe, it, expect } from 'vitest';
import {
  createVirtualWorkspace,
  readFileText,
  readFileBytes,
  writeFileToDirectory,
  getAvailablePath,
  createDirectoryInWorkspace,
  findEntryByPath,
  saveWorkingCopy,
  workingCopyPath,
  fileExists,
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

describe('Safe-edit SOP (backup original, edit a working clone)', () => {
  it('names working copies beside the original', () => {
    expect(workingCopyPath('Grades/SF2.xlsx')).toBe('Grades/SF2 (KaTuro edit).xlsx');
    expect(workingCopyPath('Grades/SF2 (KaTuro edit).xlsx')).toBe('Grades/SF2 (KaTuro edit).xlsx');
  });

  it('backs up the original, writes the clone, and versions the clone on re-edit', async () => {
    const ws = createVirtualWorkspace('X');
    await writeFileToDirectory(ws.handle, 'Grades/SF2.xlsx', 'ORIGINAL');
    const t1 = new Date(2026, 9, 3, 8, 0, 0);
    const first = await saveWorkingCopy(ws.handle, 'Grades/SF2.xlsx', 'EDIT 1', 'text/plain', t1);

    expect(first.path).toBe('Grades/SF2 (KaTuro edit).xlsx');
    expect(first.backups).toEqual(['KaTuro Backups/2026-10-03/Grades/SF2 (backup 080000).xlsx']);
    expect(new TextDecoder().decode(await readFileBytes(ws.handle, 'Grades/SF2.xlsx'))).toBe('ORIGINAL');
    expect(new TextDecoder().decode(await readFileBytes(ws.handle, first.backups[0]))).toBe('ORIGINAL');

    const second = await saveWorkingCopy(ws.handle, 'Grades/SF2.xlsx', 'EDIT 2', 'text/plain', new Date(2026, 9, 3, 9, 30, 0));
    expect(second.backups).toContain('KaTuro Backups/2026-10-03/Grades/SF2 (KaTuro edit) (backup 093000).xlsx');
    expect(new TextDecoder().decode(await readFileBytes(ws.handle, 'KaTuro Backups/2026-10-03/Grades/SF2 (KaTuro edit) (backup 093000).xlsx'))).toBe('EDIT 1');
    expect(new TextDecoder().decode(await readFileBytes(ws.handle, second.path))).toBe('EDIT 2');
    expect(new TextDecoder().decode(await readFileBytes(ws.handle, 'Grades/SF2.xlsx'))).toBe('ORIGINAL');
  });

  it('never overwrites an earlier backup made in the same second', async () => {
    const ws = createVirtualWorkspace('X');
    await writeFileToDirectory(ws.handle, 'a.docx', 'v0');
    const t = new Date(2026, 9, 3, 10, 0, 0);
    await saveWorkingCopy(ws.handle, 'a.docx', 'v1', 'text/plain', t);
    await saveWorkingCopy(ws.handle, 'a.docx', 'v2', 'text/plain', t);
    expect(await fileExists(ws.handle, 'KaTuro Backups/2026-10-03/a (backup 100000) (2).docx')).toBe(true);
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
