import { useEffect, useRef } from 'react';
import { createDeskRequestHandler, localAppliedStore, localHistoryStore } from '../../services/link/deskRequests';
import { createAssistantHandler, ASSISTANT_OPS } from '../../services/link/deskAssistant';
import { deskAddressDoc, deskAddressKey, publishDeskAddress } from '../../services/link/deskAddress';
import { readDirectoryRecursively } from '../../services/localFileSystem';
import { useDeskStore } from '../../store/deskStore';

/**
 * KaTuroDesk answers the linked phone's requests: class records and bubble quizzes
 * (KaTuro App, Phase 2), and the schedule and the assistant (Phase 4; the agent runs here,
 * as the teacher signed in on KaTuroDesk). Always on the KaTuro folder (Records and Lessons), whatever folder
 * the teacher has open; when the KaTuro folder is open, its file list refreshes after the
 * phone records scores.
 */
export function usePhoneRequests({ user, profile } = {}) {
  const account = useRef({ user, profile });
  useEffect(() => { account.current = { user, profile }; }, [user, profile]);
  // Phones link only to the KaTuro account signed in here (and stop when it changes).
  useEffect(() => {
    window.katuroDeskApi?.setLinkAccount?.(user?.uid || '')?.catch?.(() => {});
    // Signing out (the Desk page closes): no phone is served until someone signs in again.
    return () => { window.katuroDeskApi?.setLinkAccount?.('')?.catch?.(() => {}); };
  }, [user?.uid]);
  // Where the phone link listens, saved for this teacher so a linked phone can find this
  // computer again after its Wi-Fi address changes (deskAddress.js). Written only on change.
  useEffect(() => {
    const api = typeof window !== 'undefined' ? window.katuroDeskApi : undefined;
    const uid = user?.uid;
    if (!uid || !api?.linkStatus) return undefined;
    let lastKey = '';
    const publish = (status) => {
      const doc = deskAddressDoc(status);
      const key = deskAddressKey(doc);
      if (!doc || key === lastKey) return;
      lastKey = key;
      publishDeskAddress(uid, doc).catch(() => { lastKey = ''; }); // offline: tried again on the next change
    };
    const check = () => api.linkStatus().then(publish).catch(() => {});
    check();
    const off = api.onLinkChanged?.(publish);
    // A new Wi-Fi address is not an event of the link itself: looked at once a minute.
    const timer = setInterval(check, 60000);
    return () => { off?.(); clearInterval(timer); };
  }, [user?.uid]);
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
      // The KaTuro folder itself: its class records are edited in place (localFileSystem.editsInPlace).
      const handle = { kind: 'electron', isElectron: true, rootPath, katuroHome: true };
      handler = createDeskRequestHandler({
        handle,
        applied: localAppliedStore(),
        history: localHistoryStore(),
        onWrote: refreshIfHome,
      });
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
