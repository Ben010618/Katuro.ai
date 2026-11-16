import { useEffect } from 'react';
import { createDeskRequestHandler, localAppliedStore } from '../../services/link/deskRequests';
import { useDeskStore } from '../../store/deskStore';

/**
 * KaTuroDesk answers the linked phone's requests about class records and bubble quizzes
 * (KaTuro App, Phase 2). Always on the KaTuro folder (Documents\KaTuro), whatever folder
 * the teacher has open; when the KaTuro folder is open, its file list refreshes after the
 * phone records scores.
 */
export function usePhoneRequests() {
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
        onWrote: refreshIfHome,
      });
      const offRequests = api.onLinkRequest(({ op, args }) => handler(op, args));
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
