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
  ChevronDown,
  Plus,
  Folder,
  PanelLeftClose,
} from 'lucide-react';
import { useDeskStore } from '../../store/deskStore';
import {
  pickLocalDirectory,
  writeFileToDirectory,
  createDirectoryInWorkspace,
} from '../../services/localFileSystem';

export default function DeskFolderPanel({ user, tokenBalance = 0, onCollapse }) {
  const { workspace, setWorkspace, refreshFiles, activeFile, setActiveFile } = useDeskStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpeningFolder, setIsOpeningFolder] = useState(false);
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [expandedFolders, setExpandedFolders] = useState({
    'Lesson Logs (DLL)': true,
    'Exams & TOS': true,
    'Classroom Slides': true,
    'Remediation_Week1': true,
  });

  const { faculty } = useFacultyStore();

  const handleOpenFolder = async () => {
    setIsOpeningFolder(true);
    try {
      const result = await pickLocalDirectory();
      if (result && result.files) {
        setWorkspace({
          name: result.name,
          handle: result.handle,
          files: result.files,
          isVirtual: result.isVirtual ?? false,
        });
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
      const virtualFiles = workspace?.files || [];
      const newFileObj = {
        name,
        path: name,
        kind: 'file',
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

  const handleCreateNewFolder = async (e) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    const folder = newFolderName.trim();

    if (workspace?.handle) {
      await createDirectoryInWorkspace(workspace.handle, folder);
      if (!workspace.isVirtual) {
        await refreshFiles();
      } else {
        // Virtual update
        const virtualFiles = workspace?.files || [];
        const newFolderObj = {
          name: folder,
          path: folder,
          kind: 'directory',
          children: [],
        };
        setWorkspace({
          ...workspace,
          files: [newFolderObj, ...virtualFiles],
        });
      }
    }

    setExpandedFolders((prev) => ({ ...prev, [folder]: true }));
    setNewFolderName('');
    setIsCreatingFolder(false);
  };

  const toggleFolder = (folderName) => {
    setExpandedFolders((prev) => ({
      ...prev,
      [folderName]: !prev[folderName],
    }));
  };

  const getFileIcon = (fileName) => {
    const lower = fileName.toLowerCase();
    if (lower.endsWith('.docx') || lower.endsWith('.doc')) {
      return <FileText size={15} className="text-blue-400 flex-shrink-0" />;
    }
    if (lower.endsWith('.pptx') || lower.endsWith('.ppt')) {
      return <Presentation size={15} className="text-amber-400 flex-shrink-0" />;
    }
    if (lower.endsWith('.xlsx') || lower.endsWith('.csv')) {
      return <FileSpreadsheet size={15} className="text-emerald-400 flex-shrink-0" />;
    }
    if (lower.endsWith('.md') || lower.endsWith('.txt')) {
      return <FileCode size={15} className="text-slate-400 flex-shrink-0" />;
    }
    return <File size={15} className="text-gray-400 flex-shrink-0" />;
  };

  const handleTopUpClick = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('kt-zero-tokens'));
    }
  };

  // Filter items matching search
  const rawItems = workspace?.files || [];
  const filterTree = (items) => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter((item) => {
      if (item.name.toLowerCase().includes(q)) return true;
      if (item.children && item.children.some((c) => c.name.toLowerCase().includes(q))) return true;
      return false;
    });
  };

  const visibleItems = filterTree(rawItems);

  return (
    <aside className="w-64 lg:w-72 flex-shrink-0 flex flex-col h-full bg-[#1b2620] text-[#f4f7f5] border-r border-[#2d3e33] select-none relative">
      {/* Workspace Header */}
      <div className="p-3 border-b border-[#2d3e33] bg-[#141e18]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold tracking-wider uppercase text-[#9eb6a6] flex items-center gap-1.5">
            {workspace?.isVirtual ? (
              <>
                <Cloud size={12} className="text-teal-400" />
                Virtual Classroom
              </>
            ) : (
              <>
                <HardDrive size={12} className="text-emerald-400" />
                Local Laptop
              </>
            )}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => refreshFiles()}
              title="Refresh folder content"
              className="p-1 hover:bg-[#26372d] text-[#b3c9bc] hover:text-white rounded transition"
            >
              <RefreshCw size={12} />
            </button>
            {onCollapse && (
              <button
                onClick={onCollapse}
                title="Collapse sidebar (give more room to chat)"
                className="p-1 hover:bg-[#26372d] text-[#b3c9bc] hover:text-white rounded transition"
              >
                <PanelLeftClose size={13} />
              </button>
            )}
          </div>
        </div>

        <div className="bg-[#202e25] border border-[#2b3e32] rounded-lg p-2 flex items-center justify-between gap-2 shadow-xs">
          <div className="min-w-0">
            <h2 className="text-xs font-bold text-white truncate" title={workspace?.name || 'Classroom Folder'}>
              {workspace?.name || 'My DepEd Lessons'}
            </h2>
            <p className="text-[9.5px] text-[#9eb6a6] truncate">
              {workspace?.isVirtual ? 'Browser Sandbox (Direct write)' : 'Direct Disk Syncing'}
            </p>
          </div>
          <button
            onClick={handleOpenFolder}
            disabled={isOpeningFolder}
            className="px-2 py-1 bg-[#2d6a4f] hover:bg-[#235841] text-white text-[10.5px] font-semibold rounded shadow-xs flex items-center gap-1 transition flex-shrink-0 disabled:opacity-50"
            title="Open a real folder from your laptop disk"
          >
            <FolderOpen size={12} />
            <span>Open</span>
          </button>
        </div>
      </div>

      {/* Action Toolbar: Search + Add File + Add Folder */}
      <div className="p-2 border-b border-[#2d3e33] flex items-center gap-1 bg-[#18231c]">
        <div className="relative flex-1">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#7f9988]" />
          <input
            type="text"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#121b15] text-white text-[11px] pl-6 pr-2 py-1 rounded border border-[#27382d] focus:outline-none focus:border-[#408a65] placeholder-[#647c6e]"
          />
        </div>
        <button
          onClick={() => {
            setIsCreatingFolder(!isCreatingFolder);
            setIsCreatingFile(false);
          }}
          title="Create New Subfolder"
          className="p-1 bg-[#223328] hover:bg-[#2b4133] text-[#b3c9bc] hover:text-white rounded border border-[#2b3e32] transition"
        >
          <FolderPlus size={13} />
        </button>
        <button
          onClick={() => {
            setIsCreatingFile(!isCreatingFile);
            setIsCreatingFolder(false);
          }}
          title="Create New File"
          className="p-1 bg-[#223328] hover:bg-[#2b4133] text-[#b3c9bc] hover:text-white rounded border border-[#2b3e32] transition"
        >
          <Plus size={13} />
        </button>
      </div>

      {/* New Folder Form */}
      {isCreatingFolder && (
        <form onSubmit={handleCreateNewFolder} className="p-2 bg-[#121b15] border-b border-[#2d3e33] flex items-center gap-1">
          <input
            type="text"
            placeholder="e.g. Remediation_Week1"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            autoFocus
            className="flex-1 bg-[#0c130e] text-white text-[11px] px-2 py-0.5 rounded border border-[#375440] focus:outline-none"
          />
          <button type="submit" className="px-1.5 py-0.5 bg-emerald-700 text-white text-[10px] font-bold rounded">
            Create
          </button>
          <button type="button" onClick={() => setIsCreatingFolder(false)} className="text-gray-400 hover:text-white text-[10px] px-1">
            ✕
          </button>
        </form>
      )}

      {/* New File Form */}
      {isCreatingFile && (
        <form onSubmit={handleCreateNewFile} className="p-2 bg-[#121b15] border-b border-[#2d3e33] flex items-center gap-1">
          <input
            type="text"
            placeholder="e.g. Science7_Week2.docx"
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            autoFocus
            className="flex-1 bg-[#0c130e] text-white text-[11px] px-2 py-0.5 rounded border border-[#375440] focus:outline-none"
          />
          <button type="submit" className="px-1.5 py-0.5 bg-emerald-700 text-white text-[10px] font-bold rounded">
            Add
          </button>
          <button type="button" onClick={() => setIsCreatingFile(false)} className="text-gray-400 hover:text-white text-[10px] px-1">
            ✕
          </button>
        </form>
      )}

      {/* File & Folder Tree */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar text-xs">
        <div className="text-[9.5px] uppercase font-bold tracking-wider text-[#799583] px-1.5 py-0.5 flex items-center justify-between">
          <span>Explorer</span>
          <span className="text-[8.5px] font-normal lowercase opacity-75">click to focus</span>
        </div>

        {visibleItems.length === 0 ? (
          <div className="py-8 px-3 text-center">
            <FolderPlus size={24} className="mx-auto text-[#405749] mb-1.5" />
            <p className="text-[11px] text-[#8ca495]">Folder is empty</p>
          </div>
        ) : (
          visibleItems.map((item) => {
            const isDirectory = item.kind === 'directory' || item.children;
            if (isDirectory) {
              const isExpanded = expandedFolders[item.name] ?? false;
              return (
                <div key={item.name} className="space-y-0.5">
                  <div
                    onClick={() => toggleFolder(item.name)}
                    className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-[#223328] cursor-pointer text-[#d3e0d8] font-medium text-[11.5px] transition"
                  >
                    {isExpanded ? <ChevronDown size={13} className="text-[#8ca495]" /> : <ChevronRight size={13} className="text-[#8ca495]" />}
                    <Folder size={14} className="text-amber-400 flex-shrink-0" />
                    <span className="truncate">{item.name}</span>
                    <span className="ml-auto text-[9px] text-[#718b7b]">({item.children?.length || 0})</span>
                  </div>

                  {isExpanded && item.children && (
                    <div className="pl-4 space-y-0.5 border-l border-[#2d4234] ml-2">
                      {item.children.map((child) => {
                        const isSelected = activeFile?.name === child.name;
                        return (
                          <div
                            key={child.name}
                            onClick={() => setActiveFile(child)}
                            className={`flex items-center justify-between px-2 py-1 rounded cursor-pointer text-[11px] transition ${
                              isSelected ? 'bg-[#2d563f] text-white font-semibold' : 'text-[#c6d6cb] hover:bg-[#223328]'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 truncate min-w-0">
                              {getFileIcon(child.name)}
                              <span className="truncate">{child.name}</span>
                            </div>
                            {isSelected && <CheckCircle2 size={11} className="text-emerald-300 flex-shrink-0" />}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            // Top-level file
            const isSelected = activeFile?.name === item.name;
            return (
              <div
                key={item.name}
                onClick={() => setActiveFile(item)}
                className={`flex items-center justify-between px-2 py-1 rounded cursor-pointer text-[11px] transition ${
                  isSelected ? 'bg-[#2d563f] text-white font-semibold' : 'text-[#c6d6cb] hover:bg-[#223328]'
                }`}
              >
                <div className="flex items-center gap-1.5 truncate min-w-0">
                  {getFileIcon(item.name)}
                  <span className="truncate">{item.name}</span>
                </div>
                {isSelected && <CheckCircle2 size={11} className="text-emerald-300 flex-shrink-0" />}
              </div>
            );
          })
        )}
      </div>

      {/* Account & Token Status (Bottom Bar) */}
      <div className="p-2.5 bg-[#141f17] border-t border-[#2d3e33] space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="w-6 h-6 rounded-full bg-emerald-800 text-emerald-200 flex items-center justify-center font-bold text-[11px]">
              {user?.displayName ? user.displayName.charAt(0).toUpperCase() : 'T'}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-white truncate leading-tight">
                {user?.displayName || 'Teacher'}
              </p>
              <p className="text-[9px] text-emerald-400 flex items-center gap-0.5 leading-tight">
                <UserCheck size={9} /> Verified DepEd Account
              </p>
            </div>
          </div>
        </div>

        {/* Token Balance & GCash Top-Up */}
        <div className="bg-[#1c2a20] rounded p-1.5 border border-[#2b3f31] flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Coins size={13} className="text-amber-400" />
            <span className="text-[11px] font-bold text-amber-300">
              {tokenBalance ?? 0}
            </span>
            <span className="text-[9px] text-gray-400">Tokens</span>
          </div>
          <button
            onClick={handleTopUpClick}
            className="px-2 py-0.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[10px] rounded shadow-2xs flex items-center gap-1 transition"
          >
            <CreditCard size={10} />
            <span>Top-up / GCash</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
