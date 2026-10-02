import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FolderOpen,
  FolderPlus,
  RefreshCw,
  Search,
  HardDrive,
  Cloud,
  CreditCard,
  UserCheck,
  ChevronRight,
  ChevronDown,
  Plus,
  Folder,
  PanelLeftClose,
  Upload,
  ExternalLink,
  Paperclip,
} from 'lucide-react';
import { useDeskStore } from '../../store/deskStore';
import {
  pickLocalDirectory,
  writeFileToDirectory,
  createDirectoryInWorkspace,
  flattenFileTree,
  openInDefaultApp,
} from '../../services/localFileSystem';
import { getFileIcon } from './deskFileIcons';
import { planStatusText, SUBSCRIBE_CONTACT_URL } from '../../services/plans';

const isElectron = typeof window !== 'undefined' && Boolean(window.katuroDeskApi);

function TreeNode({ item, depth, expanded, onToggle, activePath, attached, onOpen, onAttach, onOpenExternal }) {
  const isDirectory = item.kind === 'directory' || item.children;
  const pad = { paddingLeft: `${6 + depth * 12}px` };

  if (isDirectory) {
    const isOpen = expanded[item.path] ?? depth === 0;
    return (
      <div>
        <div
          onClick={() => onToggle(item.path, !isOpen)}
          style={pad}
          className="flex items-center gap-1.5 pr-2 py-1 rounded hover:bg-[#223328] cursor-pointer text-[#d3e0d8] font-medium text-[11.5px] transition"
        >
          {isOpen ? <ChevronDown size={13} className="text-[#8ca495] flex-shrink-0" /> : <ChevronRight size={13} className="text-[#8ca495] flex-shrink-0" />}
          <Folder size={14} className="text-amber-400 flex-shrink-0" />
          <span className="truncate">{item.name}</span>
          <span className="ml-auto text-[9px] text-[#718b7b]">{item.children?.length || 0}</span>
        </div>
        {isOpen && item.children?.map((child) => (
          <TreeNode
            key={child.path}
            item={child}
            depth={depth + 1}
            expanded={expanded}
            onToggle={onToggle}
            activePath={activePath}
            attached={attached}
            onOpen={onOpen}
            onAttach={onAttach}
            onOpenExternal={onOpenExternal}
          />
        ))}
      </div>
    );
  }

  const isSelected = activePath === item.path;
  const isAttached = attached.includes(item.path);
  return (
    <div
      onClick={() => onOpen(item)}
      onDoubleClick={() => onOpenExternal(item)}
      style={pad}
      title={isElectron ? `${item.path}\nClick to preview · double-click to open in its app` : item.path}
      className={`group flex items-center gap-1.5 pr-1.5 py-1 rounded cursor-pointer text-[11px] transition ${
        isSelected ? 'bg-[#2d563f] text-white font-semibold' : 'text-[#c6d6cb] hover:bg-[#223328]'
      }`}
    >
      <input
        type="checkbox"
        checked={isAttached}
        onClick={(e) => e.stopPropagation()}
        onChange={() => onAttach(item.path)}
        title="Attach to chat"
        className={`w-3 h-3 accent-emerald-500 flex-shrink-0 ${isAttached ? '' : 'opacity-0 group-hover:opacity-100'}`}
      />
      {getFileIcon(item.name)}
      <span className="truncate flex-1 min-w-0">{item.name}</span>
      {isElectron && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenExternal(item);
          }}
          title="Open in Word / Excel / PowerPoint"
          className="opacity-0 group-hover:opacity-100 p-0.5 text-[#9eb6a6] hover:text-white"
        >
          <ExternalLink size={11} />
        </button>
      )}
    </div>
  );
}

export default function DeskFolderPanel({ user, profile, plan, onCollapse }) {
  const {
    workspace,
    setWorkspace,
    refreshFiles,
    restoreLastWorkspace,
    activeFile,
    openPreview,
    attachedPaths,
    toggleAttachment,
    importFiles,
  } = useDeskStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpeningFolder, setIsOpeningFolder] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [expanded, setExpanded] = useState({});
  const [notice, setNotice] = useState('');
  const importInputRef = useRef(null);

  // Desktop: reopen the folder from last session so teachers don't re-pick it every day.
  useEffect(() => {
    if (isElectron && workspace?.isVirtual) restoreLastWorkspace();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Account name: KaTuro profile first (Google sign-in often has no displayName).
  const accountName = profile?.displayName || [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || user?.displayName || user?.email || 'Teacher';

  const flash = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 3500);
  };

  const handleOpenFolder = async () => {
    setIsOpeningFolder(true);
    try {
      const result = await pickLocalDirectory();
      if (result && result.files) {
        setWorkspace({
          name: result.name,
          handle: result.handle,
          files: result.files,
          rootPath: result.rootPath,
          isVirtual: result.isVirtual ?? false,
        });
        setExpanded({});
      }
    } catch (err) {
      console.warn('Folder selection dismissed or failed:', err);
    } finally {
      setIsOpeningFolder(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshFiles();
    setIsRefreshing(false);
  };

  const handleCreateNewFile = async (e) => {
    e.preventDefault();
    if (!newFileName.trim()) return;
    const name = newFileName.trim().includes('.') ? newFileName.trim() : `${newFileName.trim()}.txt`;
    try {
      if (/\.(docx|xlsx|pptx)$/i.test(name)) {
        // A blank Office file must be a real Office file, not text with an Office extension.
        const ext = name.split('.').pop().toLowerCase();
        let bytes;
        if (ext === 'docx') {
          const { buildDocx } = await import('../../services/desk/generators/docxFromSpec');
          bytes = await buildDocx({ title: name.replace(/\.docx$/i, ''), header: null, blocks: [] });
        } else if (ext === 'xlsx') {
          const { buildSheetWorkbook } = await import('../../services/desk/generators/xlsxWriters');
          bytes = await buildSheetWorkbook({ title: name, sheets: [{ name: 'Sheet1', columns: [], rows: [] }] });
        } else {
          const { buildPptx } = await import('../../services/desk/generators/pptxFromSpec');
          bytes = await buildPptx({ title: name.replace(/\.pptx$/i, ''), slides: [] });
        }
        await writeFileToDirectory(workspace.handle, name, bytes, undefined, { overwrite: false });
      } else {
        await writeFileToDirectory(workspace.handle, name, '', 'text/plain', { overwrite: false });
      }
      await refreshFiles();
    } catch (err) {
      flash(`Could not create file: ${err.message}`);
    }
    setNewFileName('');
    setIsCreatingFile(false);
  };

  const handleCreateNewFolder = async (e) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    const folder = newFolderName.trim();
    try {
      await createDirectoryInWorkspace(workspace.handle, folder);
      await refreshFiles();
      setExpanded((prev) => ({ ...prev, [folder]: true }));
    } catch (err) {
      flash(`Could not create folder: ${err.message}`);
    }
    setNewFolderName('');
    setIsCreatingFolder(false);
  };

  const handleImport = async (e) => {
    const files = e.target.files;
    if (!files?.length) return;
    try {
      const paths = await importFiles(files);
      flash(`Imported ${paths.length} file(s) and attached them to chat`);
    } catch (err) {
      flash(err.message);
    }
    e.target.value = '';
  };

  const handleOpenExternal = async (item) => {
    try {
      const opened = await openInDefaultApp(workspace?.handle, item.path);
      if (!opened) openPreview(item);
    } catch (err) {
      flash(`Could not open: ${err.message}`);
    }
  };

  const rawItems = useMemo(() => workspace?.files || [], [workspace?.files]);
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return null;
    return flattenFileTree(rawItems).filter((f) => f.path.toLowerCase().includes(q)).slice(0, 200);
  }, [searchQuery, rawItems]);

  const fileCount = useMemo(() => flattenFileTree(rawItems).length, [rawItems]);

  const nodeProps = {
    expanded,
    onToggle: (path, open) => setExpanded((prev) => ({ ...prev, [path]: open })),
    activePath: activeFile?.path,
    attached: attachedPaths,
    onOpen: openPreview,
    onAttach: toggleAttachment,
    onOpenExternal: handleOpenExternal,
  };

  return (
    <aside className="w-64 lg:w-72 flex-shrink-0 flex flex-col h-full bg-[#1b2620] text-[#f4f7f5] border-r border-[#2d3e33] select-none relative">
      {/* Workspace Header */}
      <div className="p-3 border-b border-[#2d3e33] bg-[#141e18]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold tracking-wider uppercase text-[#9eb6a6] flex items-center gap-1.5">
            {workspace?.isVirtual ? (
              <>
                <Cloud size={12} className="text-teal-400" />
                Sample Folder (demo)
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
              onClick={handleRefresh}
              title="Refresh folder content"
              className="p-1 hover:bg-[#26372d] text-[#b3c9bc] hover:text-white rounded transition"
            >
              <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
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
            <h2 className="text-xs font-bold text-white truncate" title={workspace?.rootPath || workspace?.name || 'Classroom Folder'}>
              {workspace?.name || 'My DepEd Lessons'}
            </h2>
            <p className="text-[9.5px] text-[#9eb6a6] truncate">
              {workspace?.isVirtual ? 'Demo files · open your real folder' : `${fileCount} files · stays on this PC`}
            </p>
          </div>
          <button
            onClick={handleOpenFolder}
            disabled={isOpeningFolder}
            className="px-2 py-1 bg-[#2d6a4f] hover:bg-[#235841] text-white text-[10.5px] font-semibold rounded shadow-xs flex items-center gap-1 transition flex-shrink-0 disabled:opacity-50"
            title="Open a real folder from your laptop, USB or external drive"
          >
            <FolderOpen size={12} />
            <span>Open</span>
          </button>
        </div>
      </div>

      {/* Action Toolbar: Search + Import + Add File + Add Folder */}
      <div className="p-2 border-b border-[#2d3e33] flex items-center gap-1 bg-[#18231c]">
        <div className="relative flex-1">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#7f9988]" />
          <input
            type="text"
            placeholder="Search all files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#121b15] text-white text-[11px] pl-6 pr-2 py-1 rounded border border-[#27382d] focus:outline-none focus:border-[#408a65] placeholder-[#647c6e]"
          />
        </div>
        <button
          onClick={() => importInputRef.current?.click()}
          title="Import files (Word, Excel, PDF, photos) into this folder"
          className="p-1 bg-[#223328] hover:bg-[#2b4133] text-[#b3c9bc] hover:text-white rounded border border-[#2b3e32] transition"
        >
          <Upload size={13} />
        </button>
        <input ref={importInputRef} type="file" multiple hidden onChange={handleImport} />
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
          title="Create New File (.docx, .xlsx, .pptx, .txt)"
          className="p-1 bg-[#223328] hover:bg-[#2b4133] text-[#b3c9bc] hover:text-white rounded border border-[#2b3e32] transition"
        >
          <Plus size={13} />
        </button>
      </div>

      {notice && (
        <div className="px-3 py-1.5 text-[10.5px] bg-emerald-900/60 text-emerald-100 border-b border-emerald-800">{notice}</div>
      )}

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
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5 custom-scrollbar text-xs">
        <div className="text-[9.5px] uppercase font-bold tracking-wider text-[#799583] px-1.5 py-0.5 flex items-center justify-between">
          <span>Explorer</span>
          {attachedPaths.length > 0 ? (
            <span className="text-[9px] font-semibold normal-case text-emerald-300 flex items-center gap-0.5">
              <Paperclip size={9} /> {attachedPaths.length} attached
            </span>
          ) : (
            <span className="text-[8.5px] font-normal normal-case opacity-75">tick to attach</span>
          )}
        </div>

        {searchResults ? (
          searchResults.length === 0 ? (
            <p className="text-[11px] text-[#8ca495] px-2 py-4 text-center">No files match "{searchQuery}"</p>
          ) : (
            searchResults.map((f) => (
              <div key={f.path}>
                <TreeNode item={f} depth={0} {...nodeProps} />
                <p className="text-[9px] text-[#6f8a7a] pl-9 -mt-0.5 mb-0.5 truncate">{f.path.split('/').slice(0, -1).join(' / ')}</p>
              </div>
            ))
          )
        ) : rawItems.length === 0 ? (
          <div className="py-8 px-3 text-center">
            <FolderPlus size={24} className="mx-auto text-[#405749] mb-1.5" />
            <p className="text-[11px] text-[#8ca495]">Folder is empty</p>
          </div>
        ) : (
          rawItems.map((item) => <TreeNode key={item.path} item={item} depth={0} {...nodeProps} />)
        )}
      </div>

      {/* Account & Plan (Bottom Bar) */}
      <div className="p-2.5 bg-[#141f17] border-t border-[#2d3e33] space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="w-6 h-6 rounded-full bg-emerald-800 text-emerald-200 flex items-center justify-center font-bold text-[11px]">
              {accountName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-white truncate leading-tight">
                {accountName}
              </p>
              <p className="text-[9px] text-emerald-400 flex items-center gap-0.5 leading-tight">
                <UserCheck size={9} /> Verified DepEd Account
              </p>
            </div>
          </div>
        </div>

        {/* Plan: Free / Subscription (set by the KaTuro admin) */}
        <div className="bg-[#1c2a20] rounded p-1.5 border border-[#2b3f31] flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className={`text-[11px] font-bold truncate ${plan?.plan === 'subscription' ? 'text-amber-300' : 'text-emerald-200'}`}>{plan?.label || 'Free'}</p>
            <p className="text-[9px] text-gray-400 truncate">{plan ? planStatusText(plan) : 'Free plan'}{plan?.expiringSoon ? ` · ${plan.daysLeft}d left` : ''}</p>
          </div>
          {(!plan || plan.plan === 'free' || plan.expiringSoon) && (
            <a
              href={SUBSCRIBE_CONTACT_URL}
              target="_blank"
              rel="noreferrer"
              className="px-2 py-0.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[10px] rounded shadow-2xs flex items-center gap-1 transition flex-shrink-0"
            >
              <CreditCard size={10} />
              <span>{plan?.expiringSoon ? 'Renew' : 'Subscribe'}</span>
            </a>
          )}
        </div>
      </div>
    </aside>
  );
}
