import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  ChevronLeft,
  ChevronRight,
  BadgeCheck,
  FileText,
  Settings,
  CalendarClock,
  RefreshCw,
  MessageSquare,
  X,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import DeskFolderPanel from './DeskFolderPanel';
import DeskAgentChatPanel from './DeskAgentChatPanel';
import DeskCanvasPanel from './DeskCanvasPanel';
import { CANVAS_DEFAULT_WIDTH, CHAT_MIN_WIDTH, clampCanvasWidth, loadCanvasWidth, saveCanvasWidth } from './canvasResize';
import { useDeskStore } from '../../store/deskStore';
import DeskSettingsModal from './DeskSettingsModal';
import { KaTuroAIAvatar } from './DeskAvatar';
import { getPersona } from '../../services/desk/personas';
import { planStatusText } from '../../services/plans';
import DeskScheduleModal from './DeskScheduleModal';
import ktLogo from '../../assets/KT-Favicon.webp';
import { useDeskScheduler } from './deskScheduler';
import { useDeskUpdate } from './useDeskUpdate';
import MessagesPanel from '../../features/messages/MessagesPanel';
import { useChats, useChatNotifications } from '../../features/messages/chatStore';
import { flattenFileTree, findEntryByPath, readFileBytes, writeFileToDirectory, openInDefaultApp } from '../../services/localFileSystem';

const deskApi = typeof window !== 'undefined' ? window.katuroDeskApi : undefined;
// In the desktop app the Windows title bar is hidden: the top bar is the drag area and
// leaves room on the right for the minimize / maximize / close buttons.
const IN_DESKTOP_WINDOW = Boolean(deskApi?.isElectron);
const WINDOW_CONTROLS_PX = deskApi?.platform === 'darwin' ? 0 : 146;

function deskNotify(title, body) {
  const desk = typeof window !== 'undefined' ? window.katuroDeskApi : undefined;
  if (desk?.notify) desk.notify(title, String(body || '').slice(0, 140)).catch(() => {});
}

export default function KaTuroDeskPage() {
  const { user, profile, photoURL, plan } = useAuth();
  const { workspace, activeArtifact, persona, startFolderIndex, restoreLastWorkspace, scheduledTasks, isGenerating } = useDeskStore();
  const { status: update, install: installUpdate } = useDeskUpdate();

  useEffect(() => {
    // Desktop: reopen the folder from last session so teachers don't re-pick it every day
    // (and so scheduled tasks find their folder after a background start).
    if (IN_DESKTOP_WINDOW && useDeskStore.getState().workspace?.isVirtual) restoreLastWorkspace();
    // Index the folder that is open when the desk mounts (later folders index on open/refresh).
    else startFolderIndex();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState('assistant');
  const [showMessages, setShowMessages] = useState(false);
  const [openChatId, setOpenChatId] = useState(null);
  // null = closed; {} = open on the list; { prompt, attachedPaths } = open on a new task
  const [schedule, setSchedule] = useState(null);

  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);

  // Document Canvas width: drag the divider (like a VS Code split); remembered on this PC.
  const workspaceRef = useRef(null);
  const chatPanelRef = useRef(null);
  const [canvasWidth, setCanvasWidth] = useState(loadCanvasWidth);
  const [canvasMax, setCanvasMax] = useState(Infinity);
  const [resizing, setResizing] = useState(false);
  const measureCanvasMax = useCallback(() => {
    const ws = workspaceRef.current;
    const chat = chatPanelRef.current;
    if (!ws || !chat || !chat.offsetWidth) return Infinity;
    // Room right of the chat's left edge, minus the chat's minimum and the 16px divider strip.
    const max = ws.clientWidth - chat.offsetLeft - CHAT_MIN_WIDTH - 16;
    setCanvasMax(max);
    return max;
  }, []);
  useEffect(() => {
    const ws = workspaceRef.current;
    if (!ws || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => measureCanvasMax());
    ro.observe(ws);
    return () => ro.disconnect();
  }, [measureCanvasMax, showLeftPanel]);
  const shownCanvasWidth = clampCanvasWidth(canvasWidth, canvasMax);

  const startCanvasResize = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const ws = workspaceRef.current;
    if (!ws) return;
    const max = measureCanvasMax();
    const right = ws.getBoundingClientRect().right;
    let last = shownCanvasWidth;
    setResizing(true);
    const move = (ev) => {
      last = clampCanvasWidth(right - ev.clientX - 8, max);
      setCanvasWidth(last);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setResizing(false);
      saveCanvasWidth(last);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
  const nudgeCanvas = (e) => {
    const step = e.shiftKey ? 64 : 16;
    let next = null;
    if (e.key === 'ArrowLeft') next = shownCanvasWidth + step;
    else if (e.key === 'ArrowRight') next = shownCanvasWidth - step;
    else if (e.key === 'Home') next = CANVAS_DEFAULT_WIDTH;
    if (next === null) return;
    e.preventDefault();
    next = clampCanvasWidth(next, measureCanvasMax());
    setCanvasWidth(next);
    saveCanvasWidth(next);
  };
  const resetCanvasWidth = () => {
    const next = clampCanvasWidth(CANVAS_DEFAULT_WIDTH, measureCanvasMax());
    setCanvasWidth(next);
    saveCanvasWidth(next);
  };

  useDeskScheduler({ user, profile, onOpenCanvas: () => setShowRightPanel(true) });

  // Messages ↔ classroom folder (desktop app with a real folder open): send files from
  // the folder; "Open" / "Save to my folder" put received files in "KaTuro Messages/".
  const folderHandle = workspace?.handle?.kind === 'electron' ? workspace.handle : null;
  const deskFiles = useMemo(() => (folderHandle ? {
    list: () => flattenFileTree(useDeskStore.getState().workspace?.files || []),
    read: async (path) => {
      const ws = useDeskStore.getState().workspace;
      const bytes = await readFileBytes(ws.handle, findEntryByPath(ws.files || [], path) || path);
      return { name: path.split('/').pop(), bytes };
    },
    save: async (name, bytes) => {
      const res = await writeFileToDirectory(folderHandle, `KaTuro Messages/${name}`, bytes, 'application/octet-stream', { overwrite: false });
      useDeskStore.getState().refreshFiles();
      return res.path;
    },
    open: (path) => openInDefaultApp(folderHandle, path),
  } : null), [folderHandle]);

  // Messages: unread badge + Windows notification for new messages.
  const chatState = useChats(user?.uid);
  useChatNotifications({
    uid: user?.uid,
    chats: chatState.chats,
    invites: chatState.invites,
    invitesReady: chatState.invitesReady,
    ready: chatState.ready,
    openCid: openChatId,
    panelOpen: showMessages,
    notify: deskNotify,
  });
  const activeTasks = scheduledTasks.filter((t) => t.enabled).length;

  // Mobile tab state: 'folder' | 'chat' | 'canvas'
  const [activeMobileTab, setActiveMobileTab] = useState('chat');

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-gray-100 font-sans">
      <DeskSettingsModal key={settingsTab} initialTab={settingsTab} open={showSettings} onClose={() => setShowSettings(false)} user={user} profile={profile} />
      {showMessages && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowMessages(false)}>
          <div className="w-full max-w-5xl relative" style={{ height: '85vh' }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Messages">
            <button
              onClick={() => setShowMessages(false)}
              title="Close Messages"
              className="absolute -top-3 -right-3 z-10 w-7 h-7 rounded-full bg-white border border-gray-300 shadow flex items-center justify-center text-gray-600 hover:text-gray-900"
            >
              <X size={14} />
            </button>
            <MessagesPanel
              user={user}
              deskFiles={deskFiles}
              onOpenChatChange={setOpenChatId}
            />
          </div>
        </div>
      )}
      {schedule && (
        <DeskScheduleModal
          prefill={schedule.prompt !== undefined ? schedule : null}
          onClose={() => setSchedule(null)}
          user={user}
          profile={profile}
          onOpenCanvas={() => setShowRightPanel(true)}
        />
      )}
      {/* Top Studio Bar (also the window's title bar in the desktop app) */}
      <div
        className={`h-10 bg-[#16211a] text-white px-3 flex items-center justify-between border-b border-[#2d3e33] flex-shrink-0 select-none ${IN_DESKTOP_WINDOW ? 'desk-titlebar' : ''}`}
        style={IN_DESKTOP_WINDOW ? { paddingRight: WINDOW_CONTROLS_PX } : undefined}
      >
        <div className="flex items-center gap-2">
          {/* Toggle Left Panel */}
          <button
            onClick={() => setShowLeftPanel(!showLeftPanel)}
            title={showLeftPanel ? 'Collapse Folder Tree (give room to chat)' : 'Expand Folder Tree'}
            className="hidden md:flex p-1.5 hover:bg-[#25352a] text-[#a4baa9] hover:text-white rounded transition"
          >
            {showLeftPanel ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
          </button>

          <div className="flex items-center gap-2 text-xs font-semibold">
            <span className="text-emerald-400 font-bold flex items-center gap-1.5">
              <img src={ktLogo} alt="" className="w-4 h-4 object-contain" draggable={false} /> KaTuroDesk
            </span>
            <span className="text-gray-500">/</span>
            <span className="text-gray-300 truncate max-w-[200px]" title={workspace?.name}>
              {workspace?.name || 'Classroom Folder'}
            </span>
          </div>
        </div>

        {/* Center Mobile View Tabs */}
        <div className="flex md:hidden items-center bg-[#213026] p-0.5 rounded-lg border border-[#2b3d31]">
          <button
            onClick={() => setActiveMobileTab('folder')}
            className={`px-2.5 py-0.5 text-[11px] rounded font-medium ${
              activeMobileTab === 'folder' ? 'bg-emerald-700 text-white' : 'text-gray-400'
            }`}
          >
            Folder
          </button>
          <button
            onClick={() => setActiveMobileTab('chat')}
            className={`px-2.5 py-0.5 text-[11px] rounded font-medium ${
              activeMobileTab === 'chat' ? 'bg-emerald-700 text-white' : 'text-gray-400'
            }`}
          >
            Assistant
          </button>
          <button
            onClick={() => setActiveMobileTab('canvas')}
            className={`px-2.5 py-0.5 text-[11px] rounded font-medium ${
              activeMobileTab === 'canvas' ? 'bg-emerald-700 text-white' : 'text-gray-400'
            }`}
          >
            Canvas
          </button>
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-2">
          {update.state === 'ready' && (
            <button
              onClick={installUpdate}
              disabled={isGenerating}
              title={isGenerating ? 'Wait for the current request to finish, then restart.' : `Install KaTuroDesk ${update.version} now. Your files and settings stay.`}
              className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold transition disabled:opacity-50"
            >
              <RefreshCw size={12} /> Restart to update
            </button>
          )}
          {update.state === 'downloading' && (
            <span className="text-[11px] text-[#a4baa9] hidden lg:inline" title={`Downloading KaTuroDesk ${update.version || ''}`}>
              Updating… {update.percent || 0}%
            </span>
          )}
          <span
            className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-xs border ${plan.plan === 'subscription' ? 'bg-[#243429] text-amber-300 border-amber-500/30' : 'bg-[#1f2b23] text-emerald-200 border-[#2d3e33]'}`}
            title={planStatusText(plan)}
          >
            {plan.plan === 'subscription' && <BadgeCheck size={12} />}
            <span className="font-semibold">{plan.label}</span>
          </span>

          <button
            onClick={() => setSchedule({})}
            title="Scheduled tasks"
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-md hover:bg-[#25352a] text-[#a4baa9] hover:text-white border border-transparent hover:border-[#2d3e33] transition"
          >
            <CalendarClock size={14} />
            <span className="text-[11px] font-semibold hidden sm:inline">Scheduled</span>
            {activeTasks > 0 && <span className="min-w-[16px] h-4 px-1 rounded-full bg-emerald-700 text-white text-[10px] font-bold flex items-center justify-center">{activeTasks}</span>}
          </button>

          <button
            onClick={() => setShowMessages(true)}
            title="Messages: find teachers by @username and chat with your contacts"
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-md hover:bg-[#25352a] text-[#a4baa9] hover:text-white border border-transparent hover:border-[#2d3e33] transition"
          >
            <MessageSquare size={14} />
            <span className="text-[11px] font-semibold hidden sm:inline">Messages</span>
            {chatState.badgeCount > 0 && <span title={chatState.inviteCount ? `${chatState.inviteCount} invite(s) to answer` : undefined} className="min-w-[16px] h-4 px-1 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center">{chatState.badgeCount > 99 ? '99+' : chatState.badgeCount}</span>}
          </button>

          <button
            onClick={() => { setSettingsTab('assistant'); setShowSettings(true); }}
            title="Settings: choose your assistant (Matt or Luna)"
            className="flex items-center gap-1.5 pl-0.5 pr-2 py-0.5 rounded-md hover:bg-[#25352a] text-[#a4baa9] hover:text-white border border-transparent hover:border-[#2d3e33] transition"
          >
            <KaTuroAIAvatar persona={persona} size={22} />
            <span className="text-[11px] font-semibold hidden sm:inline">{getPersona(persona).name}</span>
            <Settings size={14} />
          </button>

          {/* Toggle Right Panel */}
          <button
            onClick={() => setShowRightPanel(!showRightPanel)}
            title={showRightPanel ? 'Collapse Document Canvas' : 'Expand Document Canvas'}
            className="hidden md:flex p-1.5 hover:bg-[#25352a] text-[#a4baa9] hover:text-white rounded transition"
          >
            {showRightPanel ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
          </button>
        </div>
      </div>

      {/* 3-Panel Main Workspace */}
      <div ref={workspaceRef} className={`flex-1 flex overflow-hidden relative${resizing ? ' select-none cursor-col-resize' : ''}`}>
        {/* While dragging the divider, this layer keeps the mouse away from the preview iframe. */}
        {resizing && <div className="absolute inset-0 z-30 cursor-col-resize" />}
        {/* Desktop Left Panel (Folder / File Tree) */}
        {showLeftPanel && (
          <div className="hidden md:flex h-full flex-shrink-0 relative transition-all duration-200">
            <DeskFolderPanel
              user={user}
              profile={profile}
              plan={plan}
              onCollapse={() => setShowLeftPanel(false)}
            />
          </div>
        )}

        {/* Divider Toggle Button: Left to Center */}
        <div className="hidden md:flex items-center relative z-20">
          <button
            onClick={() => setShowLeftPanel(!showLeftPanel)}
            title={showLeftPanel ? 'Collapse Folder Tree (◄)' : 'Expand Folder Tree (►)'}
            className="w-4 h-10 -ml-2 rounded-r-md bg-[#223328] hover:bg-[#2d4436] text-[#b3c9bc] hover:text-white border border-[#2d4234] border-l-0 shadow-sm flex items-center justify-center transition"
          >
            {showLeftPanel ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
          </button>
        </div>

        {/* Desktop Center Panel (Agent Conversation Stream - Wide & Expansive Hero) */}
        <div ref={chatPanelRef} className="hidden md:flex flex-1 h-full min-w-0">
          <DeskAgentChatPanel
            user={user}
            profile={profile}
            photoURL={photoURL}
            plan={plan}
            onOpenCanvas={() => setShowRightPanel(true)}
            onSchedule={(draft) => setSchedule(draft)}
            onToggleLeftPanel={() => setShowLeftPanel(!showLeftPanel)}
            showLeftPanel={showLeftPanel}
          />
        </div>

        {/* Divider: drag to resize the canvas (double-click resets); the button collapses it. */}
        <div className="hidden md:flex items-center relative z-20">
          {showRightPanel && (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize Document Canvas"
              aria-valuenow={shownCanvasWidth}
              tabIndex={0}
              title="Drag to resize. Double-click to reset."
              onPointerDown={startCanvasResize}
              onDoubleClick={resetCanvasWidth}
              onKeyDown={nudgeCanvas}
              className={`group absolute inset-y-0 -left-1 w-3 cursor-col-resize flex justify-center outline-none`}
            >
              <span className={`h-full w-[3px] rounded transition-colors ${resizing ? 'bg-emerald-500' : 'bg-transparent group-hover:bg-emerald-400/70 group-focus-visible:bg-emerald-400/70'}`} />
            </div>
          )}
          <button
            onClick={() => setShowRightPanel(!showRightPanel)}
            title={showRightPanel ? 'Collapse Document Canvas (►)' : 'Expand Document Canvas (◄)'}
            className="w-4 h-10 -mr-2 rounded-l-md bg-white hover:bg-gray-100 text-gray-500 hover:text-gray-900 border border-gray-300 border-r-0 shadow-sm flex items-center justify-center transition"
          >
            {showRightPanel ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
          </button>
        </div>

        {/* Desktop Right Panel (Live DepEd Canvas) */}
        {showRightPanel ? (
          <div className="hidden md:flex h-full flex-shrink-0">
            <DeskCanvasPanel width={shownCanvasWidth} onCollapse={() => setShowRightPanel(false)} />
          </div>
        ) : (
          /* Slim Minimized Ribbon when Canvas is Collapsed */
          <div
            onClick={() => setShowRightPanel(true)}
            title="Click to expand Document Canvas"
            className="hidden md:flex w-9 h-full bg-[#f1f5f3] hover:bg-[#e4ede7] border-l border-gray-300 flex-col items-center py-4 cursor-pointer select-none transition group"
          >
            <div className="p-1 rounded bg-white shadow-2xs text-emerald-700 group-hover:scale-110 transition mb-3">
              <FileText size={15} />
            </div>
            <span
              className="text-[10px] font-bold tracking-wider uppercase text-gray-500 group-hover:text-emerald-800 transition"
              style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
            >
              {activeArtifact?.title ? activeArtifact.title.slice(0, 24) : 'Live Canvas'}
            </span>
          </div>
        )}

        {/* Mobile Viewport: Single active panel tab */}
        <div className="flex md:hidden w-full h-full">
          {activeMobileTab === 'folder' && (
            <div className="w-full h-full">
              <DeskFolderPanel
                user={user}
                profile={profile}
                plan={plan}
              />
            </div>
          )}
          {activeMobileTab === 'chat' && (
            <div className="w-full h-full">
              <DeskAgentChatPanel
                user={user}
                profile={profile}
                photoURL={photoURL}
                plan={plan}
                onOpenCanvas={() => setActiveMobileTab('canvas')}
                onSchedule={(draft) => setSchedule(draft)}
              />
            </div>
          )}
          {activeMobileTab === 'canvas' && (
            <div className="w-full h-full">
              <DeskCanvasPanel />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
