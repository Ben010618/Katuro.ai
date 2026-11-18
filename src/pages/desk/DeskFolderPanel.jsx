import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FolderOpen,
  FolderPlus,
  RefreshCw,
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
  Home,
  MoreHorizontal,
  Pin,
  PinOff,
  Pencil,
  Trash2,
  FolderSearch,
  Copy,
  FilePlus,
  Eye,
  LayoutTemplate,
} from 'lucide-react';
import { useDeskStore } from '../../store/deskStore';
import {
  pickLocalDirectory,
  openHomeDirectory,
  writeFileToDirectory,
  createDirectoryInWorkspace,
  flattenFileTree,
  openInDefaultApp,
  revealInFolder,
  renameInWorkspace,
  trashInWorkspace,
  absolutePath,
  readFileBytes,
} from '../../services/localFileSystem';
import { ExplorerContextMenu, ExplorerDialog } from './ExplorerMenu';
import { loadPins, savePins, togglePin, movePins, indexTree } from './explorerPins';
import { getFileIcon } from './deskFileIcons';
import { backupDue } from '../../services/desk/backup';
import { planStatusText, SUBSCRIBE_CONTACT_URL } from '../../services/plans';
import { teacherInfo } from '../../services/teacherInfo';
import AvatarImage from '../../components/AvatarImage';

const isElectron = typeof window !== 'undefined' && Boolean(window.katuroDeskApi);

// One file or folder name, as Windows allows it (the main process checks again).
function checkName(raw) {
  const n = String(raw ?? '').trim();
  if (!n || n === '.' || n === '..') throw new Error('Type a name.');
  if (/[<>:"/\\|?*]/.test(n)) throw new Error('A name cannot have any of these: \\ / : * ? " < > |');
  if (/[. ]$/.test(n)) throw new Error('A name cannot end with a dot or a space.');
  return n;
}

function moreButton(item, onMenu) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        const r = e.currentTarget.getBoundingClientRect();
        onMenu(item, r.left, r.bottom + 2, e.detail === 0);
      }}
      aria-label={`More for ${item.name}`}
      aria-haspopup="menu"
      title="More (or right-click)"
      className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-0.5 text-[#9eb6a6] hover:text-white rounded flex-shrink-0"
    >
      <MoreHorizontal size={12} />
    </button>
  );
}

function TreeNode({ item, depth, ...props }) {
  const { expanded, onToggle, activePath, attached, onOpen, onAttach, onOpenExternal, onMenu, pinned } = props;
  const isDirectory = item.kind === 'directory' || item.children;
  const pad = { paddingLeft: `${6 + depth * 12}px` };
  const rightClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onMenu(item, e.clientX, e.clientY);
  };
  const isPinned = pinned.includes(item.path);

  if (isDirectory) {
    const isOpen = expanded[item.path] ?? depth === 0;
    return (
      <div>
        <div
          onClick={() => onToggle(item.path, !isOpen)}
          onContextMenu={rightClick}
          data-path={item.path}
          style={pad}
          className="group flex items-center gap-1.5 pr-1.5 py-1 rounded hover:bg-[#223328] cursor-pointer text-[#d3e0d8] font-medium text-[11.5px] transition"
        >
          {isOpen ? <ChevronDown size={13} className="text-[#8ca495] flex-shrink-0" /> : <ChevronRight size={13} className="text-[#8ca495] flex-shrink-0" />}
          <Folder size={14} className="text-amber-400 flex-shrink-0" />
          <span className="truncate">{item.name}</span>
          {isPinned && <Pin size={9} className="text-[#9eb6a6] flex-shrink-0" aria-label="Pinned" />}
          <span className="ml-auto text-[9px] text-[#718b7b]">{item.children?.length || 0}</span>
          {moreButton(item, onMenu)}
        </div>
        {isOpen && item.children?.map((child) => (
          <TreeNode key={child.path} item={child} depth={depth + 1} {...props} />
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
      onContextMenu={rightClick}
      data-path={item.path}
      style={pad}
      title={isElectron ? `${item.path}\nClick to preview · double-click to open in its app · right-click for more` : item.path}
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
      {isPinned && <Pin size={9} className="text-[#9eb6a6] flex-shrink-0" aria-label="Pinned" />}
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
      {moreButton(item, onMenu)}
    </div>
  );
}

export default function DeskFolderPanel({ user, profile, plan, onCollapse, onOpenBackup }) {
  // A gentle reminder when the KaTuro folder has not been backed up for a week (Settings → Backup).
  const [backupReminder, setBackupReminder] = useState(false);
  useEffect(() => {
    const api = typeof window !== 'undefined' ? window.katuroDeskApi : undefined;
    if (!api?.lastBackup) return undefined;
    let alive = true;
    api.lastBackup().then((info) => { if (alive) setBackupReminder(backupDue(info)); }).catch(() => {});
    const done = () => setBackupReminder(false);
    window.addEventListener('katuro-backup-done', done);
    return () => { alive = false; window.removeEventListener('katuro-backup-done', done); };
  }, []);
  const {
    workspace,
    setWorkspace,
    refreshFiles,
    activeFile,
    openPreview,
    attachedPaths,
    toggleAttachment,
    importFiles,
    indexStatus,
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

  // Account name: KaTuro profile first (Google sign-in often has no displayName).
  const accountName = teacherInfo(profile, user).name || user?.email || 'Teacher';

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

  const handleOpenHome = async () => {
    setIsOpeningFolder(true);
    try {
      const result = await openHomeDirectory();
      if (result) {
        setWorkspace({ name: result.name, handle: result.handle, files: result.files, rootPath: result.rootPath, isVirtual: false });
        setExpanded({});
      }
    } catch (err) {
      console.warn('Could not open the KaTuro folder:', err);
      flash('Could not open your KaTuro folder.');
    } finally {
      setIsOpeningFolder(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshFiles();
    setIsRefreshing(false);
  };

  // A new file at a workspace path ("Lessons/Week 2.docx"). Office names get a real blank file.
  const createFileAt = async (relName) => {
    const name = relName.split('/').pop().includes('.') ? relName : `${relName}.txt`;
    const base = name.split('/').pop();
    let res;
    if (/\.(docx|xlsx|pptx)$/i.test(name)) {
      // A blank Office file must be a real Office file, not text with an Office extension.
      const ext = name.split('.').pop().toLowerCase();
      let bytes;
      if (ext === 'docx') {
        const { buildDocx } = await import('../../services/desk/generators/docxFromSpec');
        bytes = await buildDocx({ title: base.replace(/\.docx$/i, ''), header: null, blocks: [] });
      } else if (ext === 'xlsx') {
        const { buildSheetWorkbook } = await import('../../services/desk/generators/xlsxWriters');
        bytes = await buildSheetWorkbook({ title: base, sheets: [{ name: 'Sheet1', columns: [], rows: [] }] });
      } else {
        const { buildPptx } = await import('../../services/desk/generators/pptxFromSpec');
        bytes = await buildPptx({ title: base.replace(/\.pptx$/i, ''), slides: [] });
      }
      res = await writeFileToDirectory(workspace.handle, name, bytes, undefined, { overwrite: false });
    } else {
      res = await writeFileToDirectory(workspace.handle, name, '', 'text/plain', { overwrite: false });
    }
    await refreshFiles();
    return res;
  };

  const handleCreateNewFile = async (e) => {
    e.preventDefault();
    if (!newFileName.trim()) return;
    try {
      await createFileAt(newFileName.trim());
    } catch (err) {
      flash(`Could not create file: ${err.message}`);
    }
    setNewFileName('');
    setIsCreatingFile(false);
  };

  // ── Right-click menu (rename, new folder, pin, show in File Explorer, delete, and more) ──
  const [menu, setMenu] = useState(null); // { item | null (the open folder), x, y }
  const [dialog, setDialogState] = useState(null); // { kind, item, parent, back }
  // A dialog opened from the menu returns focus to the row or "more" button the menu came from.
  const setDialog = (d) => {
    if (d) { setDialogState({ ...d, back: menu?.back }); return; }
    const back = dialog?.back;
    setDialogState(null);
    if (back && back !== document.body) requestAnimationFrame(() => { if (document.contains(back)) back.focus?.(); });
  };
  const rootPath = workspace?.rootPath;
  const [pinsVersion, setPinsVersion] = useState(0);
  const pins = useMemo(() => (pinsVersion >= 0 ? loadPins(rootPath) : []), [rootPath, pinsVersion]);
  const updatePins = (next) => { savePins(rootPath, next); setPinsVersion((n) => n + 1); };
  const treeFiles = workspace?.files;
  const byPath = useMemo(() => indexTree(treeFiles || []), [treeFiles]);
  const onDesk = workspace?.handle?.kind === 'electron';
  // Records, Lessons and Templates in the KaTuro folder are used by KaTuroDesk and the KaTuro App; they keep their names.
  const isMainFolder = (item) => Boolean(workspace?.handle?.katuroHome) && ['Records', 'Lessons', 'Templates'].includes(item.path);
  const isFolderItem = (item) => item.kind === 'directory' || Boolean(item.children);

  const openMenu = (item, x, y, keyboard = false) => setMenu({ item, x, y, keyboard, back: document.activeElement });
  const closeMenu = useCallback((restoreFocus) => {
    setMenu((m) => {
      // Escape: keyboard users land back where they were (the "more" button), not at the top of the page.
      const back = m?.back;
      if (restoreFocus === true && back && back !== document.body && document.contains(back)) requestAnimationFrame(() => back.focus?.());
      return null;
    });
  }, []);

  const revealPath = async (relPath) => {
    try {
      if (relPath) await revealInFolder(workspace.handle, relPath);
      else await openInDefaultApp(workspace.handle, '');
    } catch (err) {
      flash(`Could not show it: ${err.message}`);
    }
  };

  const saveAsTemplate = async (item) => {
    try {
      const bytes = await readFileBytes(workspace.handle, item.path);
      const res = await writeFileToDirectory(workspace.handle, `Templates/${item.name}`, bytes, undefined, { overwrite: false });
      await refreshFiles();
      expandTo('Templates');
      flash(`Saved in Templates as ${res.name}. Ask me to make a new one from it.`);
    } catch (err) {
      flash(`Could not save the template: ${err.message}`);
    }
  };

  const copyPath = async (relPath) => {
    const full = absolutePath(workspace.handle, relPath) || relPath;
    try {
      await navigator.clipboard.writeText(full);
      flash('Location copied');
    } catch {
      flash(full);
    }
  };

  const expandTo = (relPath) => {
    const parts = relPath.split('/');
    setExpanded((prev) => {
      const next = { ...prev };
      for (let i = 1; i <= parts.length; i++) next[parts.slice(0, i).join('/')] = true;
      return next;
    });
  };

  const confirmDialog = async (name) => {
    const { kind, item, parent } = dialog;
    if (kind === 'rename') {
      const newPath = await renameInWorkspace(workspace.handle, item.path, name);
      useDeskStore.getState().pathMoved(item.path, newPath);
      updatePins(movePins(pins, item.path, newPath));
      await refreshFiles();
      flash(`Renamed to ${name}`);
    } else if (kind === 'delete') {
      await trashInWorkspace(workspace.handle, item.path);
      useDeskStore.getState().pathMoved(item.path, null);
      updatePins(movePins(pins, item.path, null));
      await refreshFiles();
      flash(`${item.name} is in the Recycle Bin`);
    } else if (kind === 'newFolder') {
      const rel = parent ? `${parent}/${checkName(name)}` : checkName(name);
      await createDirectoryInWorkspace(workspace.handle, rel);
      await refreshFiles();
      expandTo(rel);
    } else if (kind === 'newFile') {
      const rel = parent ? `${parent}/${checkName(name)}` : checkName(name);
      const res = await createFileAt(rel);
      if (parent) expandTo(parent);
      if (res?.path) flash(`Made ${res.path.split('/').pop()}`);
    }
    setDialog(null);
  };

  const menuItems = (item) => {
    if (!item) {
      return [
        { id: 'newFolder', label: 'New folder', icon: FolderPlus, onSelect: () => setDialog({ kind: 'newFolder', item: null, parent: '' }) },
        { id: 'newFile', label: 'New file', icon: FilePlus, onSelect: () => setDialog({ kind: 'newFile', item: null, parent: '' }) },
        { id: 'refresh', label: 'Refresh', icon: RefreshCw, onSelect: handleRefresh },
        ...(onDesk ? [{ id: 'show', label: 'Open in File Explorer', icon: FolderSearch, onSelect: () => revealPath('') }] : []),
      ];
    }
    const folder = isFolderItem(item);
    const locked = isMainFolder(item);
    const lockedHint = 'Records, Lessons and Templates keep their names: KaTuroDesk and the KaTuro App use them.';
    const isPinned = pins.includes(item.path);
    return [
      ...(folder
        ? [
            { id: 'newFolder', label: 'New folder inside', icon: FolderPlus, onSelect: () => setDialog({ kind: 'newFolder', item, parent: item.path }) },
            { id: 'newFile', label: 'New file inside', icon: FilePlus, onSelect: () => setDialog({ kind: 'newFile', item, parent: item.path }) },
          ]
        : [
            { id: 'preview', label: 'Preview', icon: Eye, onSelect: () => openPreview(item) },
            ...(onDesk ? [{ id: 'open', label: 'Open in its app', icon: ExternalLink, onSelect: () => handleOpenExternal(item) }] : []),
            {
              id: 'attach',
              label: attachedPaths.includes(item.path) ? 'Remove from chat' : 'Attach to chat',
              icon: Paperclip,
              onSelect: () => toggleAttachment(item.path),
            },
            // A Word file becomes a template: KaTuroDesk makes new documents from copies of it.
            ...(workspace?.handle?.katuroHome && /\.docx$/i.test(item.name) && !item.path.startsWith('Templates/')
              ? [{ id: 'template', label: 'Save as template', icon: LayoutTemplate, onSelect: () => saveAsTemplate(item) }]
              : []),
          ]),
      { separator: true },
      ...(onDesk ? [{ id: 'rename', label: 'Rename', icon: Pencil, disabled: locked, hint: locked ? lockedHint : '', onSelect: () => setDialog({ kind: 'rename', item }) }] : []),
      { id: 'pin', label: isPinned ? 'Unpin' : 'Pin to top', icon: isPinned ? PinOff : Pin, onSelect: () => updatePins(togglePin(pins, item.path)) },
      ...(onDesk
        ? [
            { id: 'show', label: 'Show in File Explorer', icon: FolderSearch, onSelect: () => revealPath(item.path) },
            { id: 'copy', label: 'Copy location', icon: Copy, onSelect: () => copyPath(item.path) },
            { separator: true },
            { id: 'delete', label: 'Delete…', icon: Trash2, danger: true, disabled: locked, hint: locked ? lockedHint : '', onSelect: () => setDialog({ kind: 'delete', item }) },
          ]
        : []),
    ];
  };

  const pinnedItems = pins.map((p) => byPath.get(p)).filter(Boolean);
  const goToPin = (item) => {
    if (isFolderItem(item)) {
      expandTo(item.path);
      setSearchQuery('');
      requestAnimationFrame(() => {
        const el = [...document.querySelectorAll('[data-path]')].find((n) => n.getAttribute('data-path') === item.path);
        el?.scrollIntoView({ block: 'nearest' });
      });
    } else {
      openPreview(item);
    }
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

  const rawItems = useMemo(() => treeFiles || [], [treeFiles]);
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
    onMenu: openMenu,
    pinned: pins,
  };

  return (
    <aside className="neu-sidebar neu-zone w-64 lg:w-72 flex-shrink-0 flex flex-col h-full bg-[#1b2620] text-[#f4f7f5] border-r border-[#2d3e33] select-none relative">
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
              {workspace?.isVirtual
                ? 'Demo files · open your real folder'
                : indexStatus?.running && indexStatus.total > 0
                  ? `Reading files… ${indexStatus.done}/${indexStatus.total}`
                  : `${fileCount} files · stays on this PC`}
            </p>
          </div>
          {isElectron && !workspace?.handle?.katuroHome && (
            <button
              onClick={handleOpenHome}
              disabled={isOpeningFolder}
              className="px-2 py-1 bg-[#223328] hover:bg-[#2b4133] text-[#b3c9bc] hover:text-white text-[10.5px] font-semibold rounded border border-[#2b3e32] flex items-center gap-1 transition flex-shrink-0 disabled:opacity-50"
              title="Go back to your KaTuro folder (Records and Lessons)"
            >
              <Home size={12} />
              <span>KaTuro</span>
            </button>
          )}
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
        {backupReminder && onOpenBackup && (
          <button type="button" onClick={onOpenBackup} className="mt-2 w-full text-left text-[10.5px] text-[#b3c9bc] hover:text-white bg-[#223328] hover:bg-[#2b4133] border border-[#2b3e32] rounded px-2 py-1" title="Settings → Backup">
            No backup in the last 7 days. Back up your KaTuro folder to a USB drive.
          </button>
        )}
      </div>

      {/* Action Toolbar: Search + Import + Add File + Add Folder */}
      <div className="p-2 border-b border-[#2d3e33] flex items-center gap-1 bg-[#18231c]">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Search all files..."
            aria-label="Search all files"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#121b15] text-white text-[11px] px-2 py-1 rounded border border-[#27382d] focus:outline-none focus:border-[#408a65] placeholder-[#647c6e]"
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
      <div
        className="flex-1 overflow-y-auto p-2 space-y-0.5 custom-scrollbar text-xs"
        onContextMenu={(e) => {
          if (!workspace?.handle) return;
          e.preventDefault();
          openMenu(null, e.clientX, e.clientY);
        }}
      >
        {pinnedItems.length > 0 && !searchResults && (
          <div className="mb-1.5 pb-1.5 border-b border-[#2b3e32]" data-tour="pinned">
            <div className="text-[9.5px] uppercase font-bold tracking-wider text-[#799583] px-1.5 py-0.5 flex items-center gap-1">
              <Pin size={9} /> Pinned
            </div>
            {pinnedItems.map((item) => (
              <div
                key={`pin-${item.path}`}
                onClick={() => goToPin(item)}
                onDoubleClick={() => !isFolderItem(item) && handleOpenExternal(item)}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); openMenu(item, e.clientX, e.clientY); }}
                title={item.path}
                className="group flex items-center gap-1.5 pl-1.5 pr-1.5 py-1 rounded cursor-pointer text-[11px] text-[#c6d6cb] hover:bg-[#223328] transition"
              >
                {isFolderItem(item) ? <Folder size={13} className="text-amber-400 flex-shrink-0" /> : getFileIcon(item.name)}
                <span className="truncate flex-1 min-w-0">{item.name}</span>
                {moreButton(item, openMenu)}
              </div>
            ))}
          </div>
        )}
        <div className="text-[9.5px] uppercase font-bold tracking-wider text-[#799583] px-1.5 py-0.5 flex items-center justify-between">
          <span>Explorer</span>
          {attachedPaths.length > 0 ? (
            <span className="text-[9px] font-semibold normal-case text-emerald-300 flex items-center gap-0.5">
              <Paperclip size={9} /> {attachedPaths.length} attached
            </span>
          ) : (
            <span className="text-[8.5px] font-normal normal-case opacity-75">right-click for more</span>
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

      {menu && (
        <ExplorerContextMenu
          x={menu.x}
          y={menu.y}
          keyboard={menu.keyboard}
          title={menu.item ? menu.item.name : workspace?.name}
          items={menuItems(menu.item)}
          onClose={closeMenu}
        />
      )}
      {dialog && (
        <ExplorerDialog
          kind={dialog.kind}
          item={dialog.item}
          parentLabel={dialog.kind === 'newFolder' || dialog.kind === 'newFile' ? [workspace?.name, ...(dialog.parent ? dialog.parent.split('/') : [])].join(' / ') : ''}
          onCancel={() => setDialog(null)}
          onConfirm={confirmDialog}
        />
      )}

      {/* Account & Plan (Bottom Bar) */}
      <div className="p-2.5 bg-[#141f17] border-t border-[#2d3e33] space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 min-w-0">
            <AvatarImage
              photoURL={profile?.photoURL || user?.photoURL}
              alt={`${accountName} profile photo`}
              className="w-6 h-6 rounded-full object-cover flex-shrink-0"
            />
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
