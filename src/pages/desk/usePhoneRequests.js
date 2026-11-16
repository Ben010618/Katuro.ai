import { useEffect, useRef } from 'react';
import { createDeskRequestHandler, localAppliedStore, localHistoryStore } from '../../services/link/deskRequests';
import { createAssistantHandler, ASSISTANT_OPS } from '../../services/link/deskAssistant';
import { readDirectoryRecursively } from '../../services/localFileSystem';
import { useDeskStore } from '../../store/deskStore';

/**
 * KaTuroDesk answers the linked phone's requests: class records and bubble quizzes
 * (KaTuro App, Phase 2), and the schedule and the assistant (Phase 4; the agent runs here,
 * as the teacher signed in on KaTuroDesk). Always on the KaTuro folder (Documents\KaTuro), whatever folder
 * the teacher has open; when the KaTuro folder is open, its file list refreshes after the
 * phone records scores.
 */
export function usePhoneRequests({ user, profile } = {}) {
  const account = useRef({ user, profile });
  useEffect(() => { account.current = { user, profile }; }, [user, profile]);
  useEffect(() => {
    const api = typeof window !== 'undefined' ? window.katuroDeskApi : undefined;
    if (!api?.onLinkRequest || !api?.phoneHomeRoot) return undefined;
    let handler = null;
    let off = null;
    let alive = true;
    api.phoneHomeRoot().then((rootPath) => {
      if (!alive) return;
      let timer = null;
      const refreshIfHome = () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          const { workspace, refreshFiles } = useDeskStore.getState();
          if (workspace?.rootPath && workspace.rootPath.toLowerCase() === String(rootPath).toLowerCase()) refreshFiles();
        }, 800);
      };
      handler = createDeskRequestHandler({
        handle: { kind: 'electron', isElectron: true, rootPath },
        applied: localAppliedStore(),
        history: localHistoryStore(),
        onWrote: refreshIfHome,
      });
      const handle = { kind: 'electron', isElectron: true, rootPath };
      const assistant = createAssistantHandler({
        getState: () => useDeskStore.getState(),
        calendar: {
          add: (ev) => useDeskStore.getState().addCalendarEvent(ev),
          update: (id, patch) => useDeskStore.getState().updateCalendarEvent(id, patch),
          remove: (id) => useDeskStore.getState().removeCalendarEvent(id),
        },
        getWorkspace: async () => ({ handle, rootPath, name: 'KaTuro', isVirtual: false, files: await readDirectoryRecursively(handle) }),
        getAccount: () => account.current,
        runTurn: async (options) => {
          const { runDeskAgentTurn } = await import('../../services/deskAgentAI');
          const result = await runDeskAgentTurn(options);
          if (result.createdFiles?.length) refreshIfHome();
          return result;
        },
      });
      const offRequests = api.onLinkRequest(({ op, args, device }) => (ASSISTANT_OPS.has(op) ? assistant(op, args) : handler(op, args, device)));
      // A photo or file the phone sent into Records / Lessons shows up in the folder panel.
      const offFiles = api.onPhoneFileAdded?.(() => refreshIfHome());
      off = () => { offRequests(); offFiles?.(); };
    }).catch((err) => console.warn('Phone requests are off:', err));
    return () => {
      alive = false;
      off?.();
    };
  }, []);
}
