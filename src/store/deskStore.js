import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  createVirtualWorkspace,
  readDirectoryRecursively,
  reopenLastDirectory,
  writeFileToDirectory,
} from '../services/localFileSystem';

export const IMPORTS_ROOT = 'KaTuro Imports';

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

      // Conversation Stream
      messages: [INITIAL_WELCOME_MESSAGE],
      isGenerating: false,

      // Outputs produced this session + what the Canvas shows
      artifacts: [],
      activeArtifact: null, // an output artifact, or { type: 'preview', path, title } for a workspace file

      // Actions
      setWorkspace: (ws) => set({ workspace: ws, activeFile: null, attachedPaths: [] }),

      restoreLastWorkspace: async () => {
        try {
          const ws = await reopenLastDirectory();
          if (ws) set({ workspace: ws, activeFile: null, attachedPaths: [] });
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

      setActiveAgent: (agentId) => set({ activeAgentId: agentId }),

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
      partialize: (state) => ({
        activeAgentId: state.activeAgentId,
        privacyMode: state.privacyMode,
        // Don't persist native handles or file bytes (not serializable / private)
      }),
    }
  )
);
