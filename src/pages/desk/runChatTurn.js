/**
 * runChatTurn.js — one assistant turn shown in the chat.
 * Used by the chat box and by scheduled tasks, so both behave exactly the same
 * (same agent, privacy mode, persona, file outputs and error messages).
 */
import { useDeskStore, folderIndex } from '../../store/deskStore';
import { runDeskAgentTurn } from '../../services/deskAgentAI';
import { getTeacherSalutationName } from '../../services/teacherProfileUtils';
import { getPersona } from '../../services/desk/personas';
import { isCorrection, sendFeedback, toolsOf } from '../../services/desk/feedback';

/**
 * @param {object} o
 * @param {string} o.text            what the agent is asked to do
 * @param {string[]} o.attachments   workspace paths treated as "these files"
 * @param {object} o.user, o.profile
 * @param {object} [o.scheduled]     { id, name } when a scheduled task started this turn
 * @param {Function} [o.onOpenCanvas]
 * @param {object} [o.confirmedPlan] a plan the teacher approved with "Proceed" (runs with no new AI call)
 * @returns {Promise<{ status: 'done'|'needs_info'|'error', content: string, files: string[] }>}
 */
export async function runChatTurn({ text, attachments = [], user, profile, scheduled = null, onOpenCanvas, confirmedPlan = null }) {
  const store = useDeskStore.getState();
  const { messages, persona, privacyMode, workspace, activeFile, activeArtifact } = store;
  const salutation = getTeacherSalutationName(profile, user);

  const history = messages
    .filter((m) => m.id !== 'msg-welcome' && m.content && !m.isThinking)
    .map((m) => ({ role: m.role, content: m.content }));

  // "No, I meant…" right after KaTuro ran a tool: count it as a correction (names of tools only).
  if (!scheduled && !confirmedPlan && isCorrection(text)) {
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant' && m.id !== 'msg-welcome');
    const tools = toolsOf(lastAssistant);
    if (tools.length && user?.uid) sendFeedback({ uid: user.uid, rating: 'correction', reason: 'Teacher corrected KaTuro', tools, persona }).catch(() => {});
  }

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
      confirmedPlan,
      autoApprove: Boolean(scheduled),
      onUpdate: ({ steps, reply }) => {
        useDeskStore.getState().updateLastAssistantMessage({ steps, ...(reply ? { content: reply, isThinking: false } : {}) });
      },
    });

    const s = useDeskStore.getState();
    s.updateLastAssistantMessage({
      content: result.content, steps: result.steps, isThinking: false, artifacts: result.artifacts,
      ...(result.tools?.length ? { toolNames: result.tools } : {}),
      // One-tap answers to a question, and a plan waiting for "Proceed".
      ...(result.choices?.length ? { choices: result.choices } : {}),
      ...(result.pendingPlan ? { pendingPlan: result.pendingPlan, pendingAttachments: attachments } : {}),
    });
    if (result.artifacts.length) {
      s.addArtifacts(result.artifacts);
      s.setActiveArtifact(result.artifacts[0]);
      onOpenCanvas?.();
    }
    if (result.createdFiles.length) await s.refreshFiles();

    const failed = result.steps?.some((st) => st.status === 'error');
    const status = result.pendingPlan || result.asked || /\*\*Needs your input\*\*/.test(result.content) ? 'needs_info' : failed && !result.createdFiles.length ? 'error' : 'done';
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
