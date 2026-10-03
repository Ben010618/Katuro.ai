import { useEffect, useState } from 'react';
import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  BadgeCheck,
  FileText,
  Settings,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import DeskFolderPanel from './DeskFolderPanel';
import DeskAgentChatPanel from './DeskAgentChatPanel';
import DeskCanvasPanel from './DeskCanvasPanel';
import { useDeskStore } from '../../store/deskStore';
import DeskSettingsModal from './DeskSettingsModal';
import { KaTuroAIAvatar } from './DeskAvatar';
import { getPersona } from '../../services/desk/personas';
import { planStatusText } from '../../services/plans';

export default function KaTuroDeskPage() {
  const { user, profile, photoURL, plan } = useAuth();
  const { workspace, activeArtifact, persona, startFolderIndex } = useDeskStore();

  // Index the folder that is open when the desk mounts (later folders index on open/refresh).
  useEffect(() => {
    startFolderIndex();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [showSettings, setShowSettings] = useState(false);

  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);

  // Mobile tab state: 'folder' | 'chat' | 'canvas'
  const [activeMobileTab, setActiveMobileTab] = useState('chat');

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-gray-100 font-sans">
      <DeskSettingsModal open={showSettings} onClose={() => setShowSettings(false)} />
      {/* Top Studio Bar */}
      <div className="h-10 bg-[#16211a] text-white px-3 flex items-center justify-between border-b border-[#2d3e33] flex-shrink-0 select-none">
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
            <span className="text-emerald-400 font-bold flex items-center gap-1">
              <Sparkles size={14} /> KaTuroDesk
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
          <span
            className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-xs border ${plan.plan === 'subscription' ? 'bg-[#243429] text-amber-300 border-amber-500/30' : 'bg-[#1f2b23] text-emerald-200 border-[#2d3e33]'}`}
            title={planStatusText(plan)}
          >
            {plan.plan === 'subscription' && <BadgeCheck size={12} />}
            <span className="font-semibold">{plan.label}</span>
          </span>

          <button
            onClick={() => setShowSettings(true)}
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
      <div className="flex-1 flex overflow-hidden relative">
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
        <div className="hidden md:flex flex-1 h-full min-w-0 transition-all duration-200">
          <DeskAgentChatPanel
            user={user}
            profile={profile}
            photoURL={photoURL}
            plan={plan}
            onOpenCanvas={() => setShowRightPanel(true)}
            onToggleLeftPanel={() => setShowLeftPanel(!showLeftPanel)}
            showLeftPanel={showLeftPanel}
          />
        </div>

        {/* Divider Toggle Button: Center to Right */}
        <div className="hidden md:flex items-center relative z-20">
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
          <div className="hidden md:flex h-full flex-shrink-0 transition-all duration-200">
            <DeskCanvasPanel onCollapse={() => setShowRightPanel(false)} />
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
