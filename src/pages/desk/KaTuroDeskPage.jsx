import { useState } from 'react';
import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Sparkles,
  FolderTree,
  MessageSquare,
  FileCheck,
  Coins,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import DeskFolderPanel from './DeskFolderPanel';
import DeskAgentChatPanel from './DeskAgentChatPanel';
import DeskCanvasPanel from './DeskCanvasPanel';
import FacultyCustomizerModal from '../../components/FacultyCustomizerModal';
import { useDeskStore } from '../../store/deskStore';

export default function KaTuroDeskPage() {
  const { user, tokenBalance, freeMode } = useAuth();
  const { workspace } = useDeskStore();

  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [isFacultyModalOpen, setIsFacultyModalOpen] = useState(false);
  
  // Mobile tab state: 'folder' | 'chat' | 'canvas'
  const [activeMobileTab, setActiveMobileTab] = useState('chat');

  const handleTopUpClick = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('kt-zero-tokens'));
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] w-full overflow-hidden bg-gray-100">
      {/* Top Studio Control Bar */}
      <div className="h-10 bg-[#16211a] text-white px-3 flex items-center justify-between border-b border-[#2d3e33] flex-shrink-0 select-none">
        <div className="flex items-center gap-2">
          {/* Toggle Left Panel */}
          <button
            onClick={() => setShowLeftPanel(!showLeftPanel)}
            title={showLeftPanel ? 'Collapse Folder Tree' : 'Expand Folder Tree'}
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
            Co-Teacher
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
          <button
            onClick={handleTopUpClick}
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#243429] hover:bg-[#2e4335] text-amber-300 text-xs border border-amber-500/20 transition cursor-pointer"
            title="Click to top-up tokens via GCash"
          >
            <Coins size={12} className="text-amber-400" />
            <span className="font-bold">{tokenBalance ?? 0}</span>
            <span className="text-[10px] text-gray-300 hidden sm:inline">Tokens</span>
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
        <div className={`hidden md:flex h-full transition-all duration-200 ${showLeftPanel ? 'block' : 'hidden'}`}>
          <DeskFolderPanel
            user={user}
            tokenBalance={tokenBalance}
            onOpenFacultyModal={() => setIsFacultyModalOpen(true)}
          />
        </div>

        {/* Desktop Center Panel (Agent Conversation Stream) */}
        <div className="hidden md:flex flex-1 h-full min-w-0">
          <DeskAgentChatPanel
            user={user}
            tokenBalance={tokenBalance}
            freeMode={freeMode}
          />
        </div>

        {/* Desktop Right Panel (Live DepEd Canvas) */}
        <div className={`hidden md:flex h-full transition-all duration-200 ${showRightPanel ? 'block' : 'hidden'}`}>
          <DeskCanvasPanel />
        </div>

        {/* Mobile Viewport: Single active panel tab */}
        <div className="flex md:hidden w-full h-full">
          {activeMobileTab === 'folder' && (
            <div className="w-full h-full">
              <DeskFolderPanel
                user={user}
                tokenBalance={tokenBalance}
                onOpenFacultyModal={() => setIsFacultyModalOpen(true)}
              />
            </div>
          )}
          {activeMobileTab === 'chat' && (
            <div className="w-full h-full">
              <DeskAgentChatPanel
                user={user}
                tokenBalance={tokenBalance}
                freeMode={freeMode}
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

      {/* Faculty Avatar & Persona Customizer Modal */}
      <FacultyCustomizerModal
        isOpen={isFacultyModalOpen}
        onClose={() => setIsFacultyModalOpen(false)}
      />
    </div>
  );
}
