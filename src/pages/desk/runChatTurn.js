/**
 * runChatTurn.js — one assistant turn shown in the chat.
 * Used by the chat box and by scheduled tasks, so both behave exactly the same
 * (same agent, privacy mode, persona, file outputs and error messages).
 */
import { useDeskStore, folderIndex } from '../../store/deskStore';
import { runDeskAgentTurn } from '../../services/deskAgentAI';
import { getTeacherSalutationName } from '../../services/teacherProfileUtils';
import { getPersona } from '../../services/desk/personas';

/**
 * @param {object} o
 * @param {string} o.text            what the agent is asked to do
 * @param {string[]} o.attachments   workspace paths treated as "these files"
 * @param {object} o.user, o.profile
 * @param {object} [o.scheduled]     { id, name } when a scheduled task started this turn
 * @param {Function} [o.onOpenCanvas]
 * @returns {Promise<{ status: 'done'|'needs_info'|'error', content: string, files: string[] }>}
 */
export async function runChatTurn({ text, attachments = [], user, profile, scheduled = null, onOpenCanvas }) {
  const store = useDeskStore.getState();
  const { messages, persona, privacyMode, workspace, activeFile, activeArtifact } = store;
  const salutation = getTeacherSalutationName(profile, user);

  const history = messages
    .filter((m) => m.id !== 'msg-welcome' && m.content && !m.isThinking)
    .map((m) => ({ role: m.role, content: m.content }));

  store.addMessage({ role: 'user', content: text, attachments, ...(scheduled ? { scheduled } : {}) });
  store.addMessage({ role: 'assistant', agentId: 'katuro_assistant', content: '', isThinking: true });
  store.setIsGenerating(true);

  try {
    const result = await runDeskAgentTurn({
      prompt: text,
      workspace,
      activeFile,
      activeArtifact: activeArtifact?.type === 'preview' ? null : activeArtifact,
      attachedPaths: attachments,
      history,
      user,
      profile,
      privacyMode,
      persona,
      fileIndex: folderIndex,
      onUpdate: ({ steps, reply }) => {
        useDeskStore.getState().updateLastAssistantMessage({ steps, ...(reply ? { content: reply, isThinking: false } : {}) });
      },
    });

    const s = useDeskStore.getState();
    s.updateLastAssistantMessage({ content: result.content, steps: result.steps, isThinking: false, artifacts: result.artifacts });
    if (result.artifacts.length) {
      s.addArtifacts(result.artifacts);
      s.setActiveArtifact(result.artifacts[0]);
      onOpenCanvas?.();
    }
    if (result.createdFiles.length) await s.refreshFiles();

    const failed = result.steps?.some((st) => st.status === 'error');
    const status = /\*\*Needs your input\*\*/.test(result.content) ? 'needs_info' : failed && !result.createdFiles.length ? 'error' : 'done';
    return { status, content: result.content, files: result.createdFiles.map((f) => f.path) };
  } catch (err) {
    console.error('Agent execution error:', err);
    const content = err.dailyLimit || err.status === 429
      ? getPersona(persona).limitReached(salutation)
      : `Something went wrong: ${String(err.message || 'Unknown error').replace(/[.\s]+$/, '')}. Please try again.`;
    useDeskStore.getState().updateLastAssistantMessage({ content, isThinking: false });
    return { status: 'error', content, files: [] };
  } finally {
    useDeskStore.getState().setIsGenerating(false);
  }
}
