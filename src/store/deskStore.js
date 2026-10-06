import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  createVirtualWorkspace,
  readDirectoryRecursively,
  reopenLastDirectory,
  writeFileToDirectory,
  backupFile,
  fileExists,
  readFileBytes,
  findEntryByPath,
  saveWorkingCopy,
} from '../services/localFileSystem';

import { createFileIndex } from '../services/desk/index/fileIndex';
import { createTask, updateTask, recoverInterrupted } from '../services/desk/schedule/schedule';

export const IMPORTS_ROOT = 'KaTuro Imports';

// One background index per app window: reads every file once and caches it on this PC,
// so the agent never re-parses unchanged files and the planner sees what each file is.
export const folderIndex = createFileIndex();

export function workspaceIdOf(ws) {
  if (!ws) return '';
  return ws.rootPath || (ws.isVirtual ? `virtual:${ws.name}` : `fsa:${ws.name}`);
}

const INITIAL_WELCOME_MESSAGE = {
  id: 'msg-welcome',
  role: 'assistant',
  agentId: 'katuro_assistant',
  content:
    'Kumusta Teacher! I am your KaTuro Teaching Assistant.\n\nOpen your classroom folder on the left, then ask me to read, analyze, or create documents. I work with Word, Excel, PowerPoint, PDF, and photos of your papers. I can run an item analysis, make remedial slips, encode scores into your e-Class Record, check attendance, write DLLs and lesson plans, make slides, merge PDFs, and more. Tip: tick files in the explorer or drop files here to attach them.',
  timestamp: Date.now(),
  steps: [],
};

function localDateStamp(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const useDeskStore = create(
  persist(
    (set, get) => ({
      // Current Directory / Workspace
      workspace: createVirtualWorkspace('Sample DepEd Classroom Folder'),
      activeFile: null,
      activeAgentId: 'dll', // legacy, unused by the planner agent

      // Files ticked in the explorer / dropped into chat — the agent treats them as "these files"
      attachedPaths: [],

      // Learner-name masking before text goes to the AI (RA 10173)
      privacyMode: true,

      // Assistant personality chosen in Settings: 'matt' | 'luna' | 'grey'
      persona: 'matt',

      // Conversation Stream
      messages: [INITIAL_WELCOME_MESSAGE],
      isGenerating: false,

      // Background folder indexing progress: { running, done, total, failed }
      indexStatus: { running: false, done: 0, total: 0, failed: 0 },

      // Scheduled tasks (saved on this PC): see services/desk/schedule/schedule.js
      scheduledTasks: [],

      // Outputs produced this session + what the Canvas shows
      artifacts: [],
      activeArtifact: null, // an output artifact, or { type: 'preview', path, title } for a workspace file

      // Actions
      setWorkspace: (ws) => {
        set({ workspace: ws, activeFile: null, attachedPaths: [] });
        get().startFolderIndex();
      },

      /** (Re)indexes the current folder in the background; cheap when nothing changed. */
      startFolderIndex: () => {
        const { workspace } = get();
        if (!workspace?.handle) return Promise.resolve();
        set({ indexStatus: { running: true, done: 0, total: 0, failed: 0 } });
        const run = folderIndex.start({
          workspaceId: workspaceIdOf(workspace),
          files: workspace.files || [],
          handle: workspace.handle,
          onProgress: ({ done, total }) => set({ indexStatus: { ...folderIndex.status(), done, total, running: true } }),
        });
        return run.then(() => set({ indexStatus: { ...folderIndex.status(), running: false } }));
      },

      restoreLastWorkspace: async () => {
        try {
          const ws = await reopenLastDirectory();
          if (ws) {
            set({ workspace: ws, activeFile: null, attachedPaths: [] });
            get().startFolderIndex();
          }
          return Boolean(ws);
        } catch (err) {
          console.warn('Could not reopen last folder:', err);
          return false;
        }
      },

      refreshFiles: async () => {
        const { workspace } = get();
        if (!workspace?.handle) return;
        try {
          const updatedTree = await readDirectoryRecursively(workspace.handle);
          set((state) => ({ workspace: { ...state.workspace, files: updatedTree } }));
          get().startFolderIndex();
        } catch (err) {
          console.error('Failed to refresh files:', err);
        }
      },

      setActiveFile: (file) => set({ activeFile: file }),

      openPreview: (file) => {
        if (!file || file.kind !== 'file') return;
        set({ activeFile: file, activeArtifact: { id: `preview-${file.path}`, type: 'preview', path: file.path, title: file.name } });
      },

      toggleAttachment: (path) =>
        set((state) => ({
          attachedPaths: state.attachedPaths.includes(path)
            ? state.attachedPaths.filter((p) => p !== path)
            : [...state.attachedPaths, path],
        })),

      clearAttachments: () => set({ attachedPaths: [] }),

      /**
       * Copies files from anywhere (drag & drop, paste, file picker, phone photos)
       * into "KaTuro Imports/<date>/" inside the classroom folder and attaches them.
       */
      importFiles: async (fileList) => {
        const { workspace, refreshFiles } = get();
        if (!workspace?.handle) throw new Error('Open a classroom folder first.');
        const imported = [];
        for (const file of Array.from(fileList || [])) {
          const name = file.name && file.name !== 'image.png' ? file.name : `Pasted_${Date.now()}.${(file.type || 'image/png').split('/')[1] || 'png'}`;
          const bytes = new Uint8Array(await file.arrayBuffer());
          const res = await writeFileToDirectory(workspace.handle, `${IMPORTS_ROOT}/${localDateStamp()}/${name}`, bytes, file.type || 'application/octet-stream', { overwrite: false });
          imported.push(res.path);
        }
        await refreshFiles();
        set((state) => ({ attachedPaths: [...new Set([...state.attachedPaths, ...imported])] }));
        return imported;
      },

      setPrivacyMode: (privacyMode) => set({ privacyMode }),

      setPersona: (persona) => set({ persona }),

      setActiveAgent: (agentId) => set({ activeAgentId: agentId }),

      /** Creates a scheduled task for the open folder. Throws a teacher-friendly message when invalid. */
      addScheduledTask: (input) => {
        const { workspace } = get();
        const task = createTask({ ...input, workspaceId: workspaceIdOf(workspace), workspaceName: workspace?.name || '' });
        set((state) => ({ scheduledTasks: [...state.scheduledTasks, task] }));
        return task;
      },

      /** Edits a task (name, prompt, files, schedule, enabled). Throws when the new schedule is invalid. */
      updateScheduledTask: (id, patch) => {
        const task = get().scheduledTasks.find((t) => t.id === id);
        if (!task) throw new Error('That task no longer exists.');
        const next = updateTask(task, patch);
        set((state) => ({ scheduledTasks: state.scheduledTasks.map((t) => (t.id === id ? next : t)) }));
        return next;
      },

      /** Low-level replace used by the scheduler while a task runs. */
      replaceScheduledTask: (id, fn) =>
        set((state) => ({ scheduledTasks: state.scheduledTasks.map((t) => (t.id === id ? fn(t) : t)) })),

      deleteScheduledTask: (id) => set((state) => ({ scheduledTasks: state.scheduledTasks.filter((t) => t.id !== id) })),

      addMessage: (msg) => {
        set((state) => ({
          messages: [
            ...state.messages,
            {
              id: msg.id || `msg-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
              role: msg.role || 'user',
              agentId: msg.agentId || state.activeAgentId,
              content: msg.content || '',
              timestamp: Date.now(),
              steps: msg.steps || [],
              artifacts: msg.artifacts || [],
              attachments: msg.attachments || [],
              ...(msg.isThinking ? { isThinking: true } : {}),
              ...(msg.scheduled ? { scheduled: msg.scheduled } : {}),
            },
          ],
        }));
      },

      updateLastAssistantMessage: (patch) => {
        set((state) => {
          const list = [...state.messages];
          const lastIdx = list.map((m) => m.role).lastIndexOf('assistant');
          if (lastIdx === -1) return state;
          list[lastIdx] = {
            ...list[lastIdx],
            ...patch,
          };
          return { messages: list };
        });
      },

      setIsGenerating: (isGenerating) => set({ isGenerating }),

      setActiveArtifact: (artifact) => set({ activeArtifact: artifact }),

      addArtifacts: (list = []) => set((state) => ({ artifacts: [...list, ...state.artifacts] })),

      updateArtifact: (id, patch) =>
        set((state) => {
          const artifacts = state.artifacts.map((a) => (a.id === id ? { ...a, ...patch } : a));
          const activeArtifact = state.activeArtifact?.id === id ? { ...state.activeArtifact, ...patch } : state.activeArtifact;
          const messages = state.messages.map((m) =>
            m.artifacts?.some((a) => a.id === id)
              ? { ...m, artifacts: m.artifacts.map((a) => (a.id === id ? { ...a, ...patch } : a)) }
              : m,
          );
          return { artifacts, activeArtifact, messages };
        }),

      clearConversation: () => set({ messages: [INITIAL_WELCOME_MESSAGE], activeArtifact: null }),

      /**
       * Applies the teacher-approved subset of a pending "changes" artifact.
       * Only those cells/paragraphs are written (docmap), into a working copy of the
       * target; the original is backed up first (safe-edit SOP).
       */
      applyPendingChanges: async (id, selected) => {
        const { workspace, artifacts, activeArtifact, updateArtifact, refreshFiles } = get();
        const art = artifacts.find((a) => a.id === id) || (activeArtifact?.id === id ? activeArtifact : null);
        if (!art || art.type !== 'changes' || !workspace?.handle) throw new Error('Nothing to apply.');
        const { targetPath, edits } = art.data;
        const chosen = edits.filter((_, i) => !selected || selected.includes(i));
        if (!chosen.length) throw new Error('Select at least one change to apply.');
        const { applyEdits } = await import('../services/desk/docmap/index.js');
        const entry = findEntryByPath(workspace.files || [], targetPath);
        const original = await readFileBytes(workspace.handle, entry || targetPath);
        const result = await applyEdits(original, targetPath.split('/').pop(), chosen);
        const saved = await saveWorkingCopy(workspace.handle, targetPath, result.bytes);
        const ext = targetPath.split('.').pop().toLowerCase();
        updateArtifact(id, {
          files: [{ path: saved.path, name: saved.name, format: ext, size: result.bytes.byteLength }],
          data: { ...art.data, status: 'applied', appliedCount: result.applied.length, skipped: result.skipped, backups: saved.backups, savedPath: saved.path },
          subtitle: `${result.applied.length} change(s) saved to ${saved.name}${result.skipped.length ? `; ${result.skipped.length} skipped` : ''}`,
        });
        await refreshFiles();
        return { ...saved, applied: result.applied, skipped: result.skipped };
      },

      discardPendingChanges: (id) => {
        const { artifacts, activeArtifact, updateArtifact } = get();
        const art = artifacts.find((a) => a.id === id) || (activeArtifact?.id === id ? activeArtifact : null);
        if (art?.type === 'changes') updateArtifact(id, { data: { ...art.data, status: 'discarded' }, subtitle: 'Discarded — nothing was changed' });
      },

      /**
       * Re-renders an edited document/table artifact and overwrites ITS OWN output files
       * (files KaTuro generated this session — never the teacher's originals).
       */
      saveArtifactEdits: async (id, spec) => {
        const { workspace, artifacts, activeArtifact, updateArtifact, refreshFiles } = get();
        const art = artifacts.find((a) => a.id === id) || (activeArtifact?.id === id ? activeArtifact : null);
        if (!art || !workspace?.handle) throw new Error('Nothing to save.');
        const files = [];
        for (const f of art.files || []) {
          let bytes = null;
          if (art.type === 'document' && f.format === 'docx') {
            const { buildDocx } = await import('../services/desk/generators/docxFromSpec');
            bytes = await buildDocx(spec);
          } else if (art.type === 'document' && f.format === 'pdf') {
            const [{ buildHtml }, { renderHtmlToPdf }] = await Promise.all([
              import('../services/desk/generators/htmlFromSpec'),
              import('../services/localFileSystem'),
            ]);
            bytes = await renderHtmlToPdf(buildHtml(spec, { forPrint: true }), { pageSize: spec.paper, landscape: spec.orientation === 'landscape' });
            if (!bytes) {
              const { buildPdf } = await import('../services/desk/generators/pdfFromSpec');
              bytes = await buildPdf(spec);
            }
          } else if ((art.type === 'table' || art.type === 'sheet') && f.format === 'xlsx') {
            const { buildSheetWorkbook } = await import('../services/desk/generators/xlsxWriters');
            bytes = await buildSheetWorkbook(spec);
          }
          if (bytes) {
            // Version history: keep the previous version before overwriting.
            if (await fileExists(workspace.handle, f.path)) await backupFile(workspace.handle, f.path);
            await writeFileToDirectory(workspace.handle, f.path, bytes);
            files.push({ ...f, size: bytes.byteLength });
          } else {
            files.push(f);
          }
        }
        updateArtifact(id, { spec, files, editedAt: Date.now() });
        await refreshFiles();
        return files;
      },
    }),
    {
      name: 'katuro-desk-store-v1',
      // A task that was running when the app closed is shown as interrupted, never stuck "running".
      merge: (persisted, current) => ({
        ...current,
        ...(persisted || {}),
        scheduledTasks: recoverInterrupted(Array.isArray(persisted?.scheduledTasks) ? persisted.scheduledTasks : []),
      }),
      partialize: (state) => ({
        activeAgentId: state.activeAgentId,
        privacyMode: state.privacyMode,
        persona: state.persona,
        scheduledTasks: state.scheduledTasks,
        // Don't persist native handles or file bytes (not serializable / private)
      }),
    }
  )
);
