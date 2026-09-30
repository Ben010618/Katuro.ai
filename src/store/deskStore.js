import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  createVirtualWorkspace,
  readDirectoryRecursively,
  writeFileToDirectory,
} from '../services/localFileSystem';

const INITIAL_WELCOME_MESSAGE = {
  id: 'msg-welcome',
  role: 'assistant',
  agentId: 'dll',
  content:
    'Kumusta! I am your AI Co-Teacher at **KaTuroDesk**.\n\nI can read, create, and organize DepEd lesson plans, quizzes, Table of Specifications, and PowerPoint slides directly in your classroom folder. Select a folder on the left or tell me what lesson you want to prepare today!',
  timestamp: Date.now(),
  steps: [
    { text: 'KaTuroDesk workspace initialized', status: 'done' },
    { text: 'DepEd MATATAG curriculum engine online', status: 'done' },
  ],
};

export const useDeskStore = create(
  persist(
    (set, get) => ({
      // Current Directory / Workspace
      workspace: createVirtualWorkspace('Sample DepEd Classroom Folder'),
      activeFile: null,
      activeAgentId: 'dll', // 'dll' | 'tos' | 'grader' | 'slides' | 'research'

      // Conversation Stream
      messages: [INITIAL_WELCOME_MESSAGE],
      isGenerating: false,

      // Active Document Canvas / Artifact
      activeArtifact: null, // { id, type: 'dll' | 'tos' | 'quiz' | 'slides', title, subtitle, data, rawHtml }

      // Actions
      setWorkspace: (ws) => set({ workspace: ws, activeFile: null }),

      refreshFiles: async () => {
        const { workspace } = get();
        if (!workspace?.handle || workspace.isVirtual) return;
        try {
          const updatedTree = await readDirectoryRecursively(workspace.handle);
          set({
            workspace: {
              ...workspace,
              files: updatedTree,
            },
          });
        } catch (err) {
          console.error('Failed to refresh files:', err);
        }
      },

      setActiveFile: (file) => set({ activeFile: file }),

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

      clearConversation: () => set({ messages: [INITIAL_WELCOME_MESSAGE], activeArtifact: null }),

      saveCurrentArtifactToDisk: async (customFilename = null) => {
        const { workspace, activeArtifact, refreshFiles } = get();
        if (!workspace?.handle || !activeArtifact) return null;

        const filename =
          customFilename ||
          activeArtifact.filename ||
          `${activeArtifact.title || 'DepEd_Document'}.${activeArtifact.type === 'slides' ? 'pptx' : 'docx'}`;

        const content =
          activeArtifact.fileBlob ||
          activeArtifact.rawText ||
          JSON.stringify(activeArtifact.data, null, 2);

        const result = await writeFileToDirectory(workspace.handle, filename, content);
        await refreshFiles();
        return result;
      },
    }),
    {
      name: 'katuro-desk-store-v1',
      partialize: (state) => ({
        activeAgentId: state.activeAgentId,
        // Don't persist native DOM handles (cannot be serialized to JSON)
      }),
    }
  )
);
