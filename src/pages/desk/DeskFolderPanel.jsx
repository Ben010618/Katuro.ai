import { useState } from 'react';
import {
  FolderOpen,
  FolderPlus,
  RefreshCw,
  Search,
  FileText,
  FileCode,
  FileSpreadsheet,
  Presentation,
  File,
  CheckCircle2,
  HardDrive,
  Cloud,
  Coins,
  CreditCard,
  UserCheck,
  ChevronRight,
  Plus,
  Settings,
} from 'lucide-react';
import { useDeskStore } from '../../store/deskStore';
import { pickLocalDirectory, writeFileToDirectory } from '../../services/localFileSystem';
import { useFacultyStore } from '../../store/facultyStore';

export default function DeskFolderPanel({ user, tokenBalance = 0, onOpenFacultyModal }) {
  const { workspace, setWorkspace, refreshFiles, activeFile, setActiveFile } = useDeskStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpeningFolder, setIsOpeningFolder] = useState(false);
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [newFileName, setNewFileName] = useState('');

  const { faculty } = useFacultyStore();

  const handleOpenFolder = async () => {
    setIsOpeningFolder(true);
    try {
      const result = await pickLocalDirectory();
      if (result.success) {
        setWorkspace({
          name: result.name,
          handle: result.handle,
          files: result.files,
          isVirtual: false,
        });
      } else if (result.error && result.error !== 'The user aborted a request.') {
        alert(result.error);
      }
    } catch (err) {
      console.warn('Folder selection dismissed or failed:', err);
    } finally {
      setIsOpeningFolder(false);
    }
  };

  const handleCreateNewFile = async (e) => {
    e.preventDefault();
    if (!newFileName.trim()) return;
    const name = newFileName.trim().includes('.') ? newFileName.trim() : `${newFileName.trim()}.docx`;
    
    if (workspace?.handle && !workspace.isVirtual) {
      await writeFileToDirectory(workspace.handle, name, `# ${name}\nCreated in KaTuroDesk`);
      await refreshFiles();
    } else {
      // Virtual workspace file addition
      const virtualFiles = workspace?.files || [];
      const newFileObj = {
        name,
        path: name,
        type: 'file',
        size: 1024,
        lastModified: Date.now(),
        content: `# ${name}\nCreated in KaTuroDesk virtual workspace`,
      };
      setWorkspace({
        ...workspace,
        files: [newFileObj, ...virtualFiles],
      });
    }

    setNewFileName('');
    setIsCreatingFile(false);
  };

  const files = (workspace?.files || []).filter((f) =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getFileIcon = (fileName) => {
    const lower = fileName.toLowerCase();
    if (lower.endsWith('.docx') || lower.endsWith('.doc')) {
      return <FileText size={16} className="text-blue-600 flex-shrink-0" />;
    }
    if (lower.endsWith('.pptx') || lower.endsWith('.ppt')) {
      return <Presentation size={16} className="text-amber-600 flex-shrink-0" />;
    }
    if (lower.endsWith('.xlsx') || lower.endsWith('.csv')) {
      return <FileSpreadsheet size={16} className="text-emerald-600 flex-shrink-0" />;
    }
    if (lower.endsWith('.md') || lower.endsWith('.txt')) {
      return <FileCode size={16} className="text-slate-600 flex-shrink-0" />;
    }
    return <File size={16} className="text-gray-400 flex-shrink-0" />;
  };

  const handleTopUpClick = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('kt-zero-tokens'));
    }
  };

  return (
    <aside className="w-72 md:w-80 flex-shrink-0 flex flex-col h-full bg-[#1e2922] text-[#f4f7f5] border-r border-[#2d3e33] select-none">
      {/* Workspace Header */}
      <div className="p-3.5 border-b border-[#2d3e33] bg-[#16211a]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold tracking-wider uppercase text-[#9eb6a6] flex items-center gap-1.5">
            {workspace?.isVirtual ? (
              <>
                <Cloud size={13} className="text-teal-400" />
                Virtual Classroom Folder
              </>
            ) : (
              <>
                <HardDrive size={13} className="text-emerald-400" />
                Local Laptop Folder
              </>
            )}
          </span>
          <button
            onClick={() => refreshFiles()}
            title="Refresh folder content"
            className="p-1 hover:bg-[#26372d] text-[#b3c9bc] hover:text-white rounded transition"
          >
            <RefreshCw size={13} />
          </button>
        </div>

        <div className="bg-[#213027] border border-[#2d4234] rounded-lg p-2.5 flex items-center justify-between gap-2 shadow-inner">
          <div className="min-w-0">
            <h2 className="text-xs font-bold text-white truncate" title={workspace?.name || 'Classroom Folder'}>
              {workspace?.name || 'My DepEd Lessons'}
            </h2>
            <p className="text-[10px] text-[#9eb6a6] truncate">
              {workspace?.isVirtual ? 'Browser Sandbox (Direct write ready)' : 'Direct Disk Syncing'}
            </p>
          </div>
          <button
            onClick={handleOpenFolder}
            disabled={isOpeningFolder}
            className="px-2.5 py-1.5 bg-[#2d6a4f] hover:bg-[#235841] text-white text-[11px] font-medium rounded-md shadow-sm flex items-center gap-1.5 transition flex-shrink-0 disabled:opacity-50"
            title="Open a real folder from your laptop disk"
          >
            <FolderOpen size={13} />
            <span>Open</span>
          </button>
        </div>
      </div>

      {/* File Search & Quick New File */}
      <div className="p-2.5 border-b border-[#2d3e33] flex items-center gap-1.5 bg-[#1a261f]">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#7f9988]" />
          <input
            type="text"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#131c17] text-white text-xs pl-7 pr-2.5 py-1.5 rounded border border-[#293d30] focus:outline-none focus:border-[#408a65] placeholder-[#647c6e]"
          />
        </div>
        <button
          onClick={() => setIsCreatingFile(!isCreatingFile)}
          title="Create New File"
          className="p-1.5 bg-[#24362b] hover:bg-[#2d4436] text-[#b3c9bc] hover:text-white rounded border border-[#2d4234] transition"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* New File Inline Form */}
      {isCreatingFile && (
        <form onSubmit={handleCreateNewFile} className="p-2.5 bg-[#141e18] border-b border-[#2d3e33] flex items-center gap-1.5">
          <input
            type="text"
            placeholder="e.g. Science7_Week2.docx"
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            autoFocus
            className="flex-1 bg-[#0d1410] text-white text-xs px-2.5 py-1 rounded border border-[#3b5945] focus:outline-none text-[11px]"
          />
          <button
            type="submit"
            className="px-2 py-1 bg-emerald-700 hover:bg-emerald-600 text-white text-[11px] font-medium rounded"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => setIsCreatingFile(false)}
            className="px-1.5 py-1 text-gray-400 hover:text-gray-200 text-[11px]"
          >
            ✕
          </button>
        </form>
      )}

      {/* File Tree / Explorer */}
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5 custom-scrollbar">
        <div className="text-[10px] uppercase font-bold tracking-wider text-[#799583] px-2 py-1 flex items-center justify-between">
          <span>Files ({files.length})</span>
          <span className="text-[9px] font-normal lowercase opacity-75">click to focus</span>
        </div>

        {files.length === 0 ? (
          <div className="py-8 px-4 text-center">
            <FolderPlus size={28} className="mx-auto text-[#405749] mb-2" />
            <p className="text-xs text-[#8ca495]">No files found</p>
            <p className="text-[10px] text-[#637d6e] mt-0.5">Click "Open" to load your lesson folder or ask Sir Dan to write one!</p>
          </div>
        ) : (
          files.map((file) => {
            const isSelected = activeFile?.name === file.name;
            return (
              <div
                key={file.name}
                onClick={() => setActiveFile(file)}
                className={`group flex items-center justify-between px-2.5 py-1.5 rounded-md cursor-pointer text-xs transition ${
                  isSelected
                    ? 'bg-[#2d563f] text-white font-medium shadow-sm'
                    : 'text-[#d3e0d8] hover:bg-[#223328]'
                }`}
              >
                <div className="flex items-center gap-2 truncate min-w-0">
                  {getFileIcon(file.name)}
                  <span className="truncate text-[11.5px]">{file.name}</span>
                </div>
                {isSelected && <CheckCircle2 size={12} className="text-emerald-300 flex-shrink-0" />}
              </div>
            );
          })
        )}
      </div>

      {/* Account & Token Status (Bottom Bar) */}
      <div className="p-3 bg-[#141f17] border-t border-[#2d3e33] space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-full bg-emerald-800 text-emerald-200 flex items-center justify-center font-bold text-xs ring-1 ring-emerald-500/30">
              {user?.displayName ? user.displayName.charAt(0).toUpperCase() : 'T'}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate leading-tight">
                {user?.displayName || 'Teacher'}
              </p>
              <p className="text-[10px] text-emerald-400 flex items-center gap-1 leading-tight">
                <UserCheck size={10} /> DepEd Account Verified
              </p>
            </div>
          </div>
          <button
            onClick={onOpenFacultyModal}
            title="Customize Co-Teacher Avatars & Personas"
            className="p-1.5 hover:bg-[#233529] text-[#9eb6a6] hover:text-white rounded transition"
          >
            <Settings size={14} />
          </button>
        </div>

        {/* Token Balance & GCash Top-Up */}
        <div className="bg-[#1c2a20] rounded-lg p-2 border border-[#2b3f31] flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Coins size={14} className="text-amber-400" />
            <div>
              <span className="text-xs font-bold text-amber-300">
                {tokenBalance ?? 0}
              </span>
              <span className="text-[10px] text-gray-400 ml-1">Tokens</span>
            </div>
          </div>
          <button
            onClick={handleTopUpClick}
            className="px-2 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[10.5px] rounded shadow-sm flex items-center gap-1 transition"
          >
            <CreditCard size={11} />
            <span>Top-up / GCash</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
