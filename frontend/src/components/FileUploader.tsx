'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Upload, Trash2, FolderOpen, Grid, List, Plus, CheckCircle,
  AlertCircle, Loader2, Search, RefreshCw, Database,
  Folder, FolderPlus, ChevronRight, Home, Edit2,
  File as FileIcon2, ArrowLeft, X, Move
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FileUploaderProps {
  agentId: string;
  onUploadSuccess?: () => void;
}

interface KBFolder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: Date;
}

interface KBFile {
  id: string;
  name: string;
  size: number;
  ext: string;
  folderId: string | null;
  status: 'uploaded' | 'pending' | 'uploading' | 'error';
  chunkCount?: number;
  error?: string;
  uploadedAt: Date;
  file?: File;
}

type ViewMode = 'grid' | 'list';
type SortBy = 'name' | 'size' | 'date' | 'type';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const EXT_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  pdf:  { bg: '#fff1f0', text: '#cf1322', border: '#ffa39e' },
  txt:  { bg: '#e6f4ff', text: '#0958d9', border: '#91caff' },
  csv:  { bg: '#f6ffed', text: '#389e0d', border: '#95de64' },
  docx: { bg: '#f0f0ff', text: '#531dab', border: '#b37feb' },
  md:   { bg: '#fff0f6', text: '#c41d7f', border: '#ffadd2' },
};
const DEFAULT_EXT_COLOR = { bg: '#fafafa', text: '#595959', border: '#d9d9d9' };

const FOLDER_COLORS = ['#faad14','#52c41a','#1677ff','#eb2f96','#722ed1','#13c2c2','#fa541c','#a0d911'];
function folderColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffffffff;
  return FOLDER_COLORS[Math.abs(h) % FOLDER_COLORS.length];
}

function getExt(name: string) { return name.split('.').pop()?.toLowerCase() || ''; }
function formatSize(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}
function formatDate(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Small reusable pieces ────────────────────────────────────────────────────

function ExtBadge({ ext }: { ext: string }) {
  const c = EXT_COLOR[ext] || DEFAULT_EXT_COLOR;
  return (
    <span className="inline-block text-xs font-bold px-1.5 py-0.5 rounded"
      style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}`, fontSize: 10, lineHeight: '16px' }}>
      {ext.toUpperCase()}
    </span>
  );
}

function StatusIcon({ status }: { status: KBFile['status'] }) {
  if (status === 'uploading') return <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin flex-shrink-0" />;
  if (status === 'uploaded')  return <CheckCircle className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />;
  if (status === 'error')     return <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />;
  return <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0 inline-block" />;
}

// ─── New Folder Modal ─────────────────────────────────────────────────────────

function NewFolderModal({ onCreate, onClose }: { onCreate: (name: string) => void; onClose: () => void }) {
  const [val, setVal] = useState('');
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-80" style={{ border: '1px solid #e5e7eb' }}>
        <h3 className="font-semibold text-gray-800 mb-1 text-sm">New Folder</h3>
        <p className="text-xs text-gray-400 mb-4">Enter a name for the folder</p>
        <input autoFocus value={val} onChange={e => setVal(e.target.value)}
          placeholder="e.g. Product Docs"
          onKeyDown={e => { if (e.key === 'Enter' && val.trim()) onCreate(val.trim()); }}
          className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none text-gray-800 placeholder-gray-300"
          style={{ border: '1.5px solid #e5e7eb' }}
          onFocus={e => (e.currentTarget.style.borderColor = '#1677ff')}
          onBlur={e => (e.currentTarget.style.borderColor = '#e5e7eb')} />
        <div className="flex gap-2 mt-4">
          <button onClick={onClose}
            className="flex-1 py-2 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-50 border border-gray-200 transition-colors">
            Cancel
          </button>
          <button onClick={() => val.trim() && onCreate(val.trim())}
            className="flex-1 py-2 rounded-lg text-sm font-medium text-white transition-colors"
            style={{ background: val.trim() ? '#1677ff' : '#93c5fd' }}>
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

function RenameModal({ current, onRename, onClose }: { current: string; onRename: (n: string) => void; onClose: () => void }) {
  const [val, setVal] = useState(current);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-80" style={{ border: '1px solid #e5e7eb' }}>
        <h3 className="font-semibold text-gray-800 mb-4 text-sm">Rename Folder</h3>
        <input autoFocus value={val} onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && val.trim()) onRename(val.trim()); if (e.key === 'Escape') onClose(); }}
          className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none text-gray-800"
          style={{ border: '1.5px solid #e5e7eb' }}
          onFocus={e => (e.currentTarget.style.borderColor = '#1677ff')}
          onBlur={e => (e.currentTarget.style.borderColor = '#e5e7eb')} />
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-50 border border-gray-200 transition-colors">Cancel</button>
          <button onClick={() => val.trim() && onRename(val.trim())} className="flex-1 py-2 rounded-lg text-sm font-medium text-white transition-colors" style={{ background: '#1677ff' }}>Rename</button>
        </div>
      </div>
    </div>
  );
}

// ─── Folder Drop Target ───────────────────────────────────────────────────────

function FolderDropTarget({ folder, fileCount, onOpen, onRename, onDelete, onDropFiles }:
  { folder: KBFolder; fileCount: number; onOpen: () => void; onRename: () => void; onDelete: () => void; onDropFiles: (fileIds: string[], folderId: string) => void }) {
  const [dragOver, setDragOver] = useState(false);
  const color = folderColor(folder.id);

  return (
    <div
      onDoubleClick={onOpen}
      onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
      onDragLeave={e => { e.stopPropagation(); setDragOver(false); }}
      onDrop={e => {
        e.preventDefault(); e.stopPropagation(); setDragOver(false);
        const ids = e.dataTransfer.getData('fileIds');
        if (ids) onDropFiles(JSON.parse(ids), folder.id);
      }}
      className="group relative flex flex-col rounded-xl cursor-pointer transition-all select-none"
      style={{
        background: dragOver ? '#e6f4ff' : '#fff',
        border: `1.5px solid ${dragOver ? '#1677ff' : '#ebebeb'}`,
        boxShadow: dragOver ? '0 0 0 3px #bae0ff' : '0 1px 3px rgba(0,0,0,0.05)',
        padding: '14px 10px 12px',
        transform: dragOver ? 'scale(1.03)' : 'scale(1)',
      }}>

      {/* Hover actions */}
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={e => { e.stopPropagation(); onRename(); }}
          className="w-5 h-5 rounded flex items-center justify-center hover:bg-gray-100 transition-colors">
          <Edit2 className="w-3 h-3 text-gray-400" />
        </button>
        <button onClick={e => { e.stopPropagation(); onDelete(); }}
          className="w-5 h-5 rounded flex items-center justify-center hover:bg-red-50 transition-colors">
          <Trash2 className="w-3 h-3 text-red-400" />
        </button>
      </div>

      {dragOver && (
        <div className="absolute inset-0 rounded-xl flex items-center justify-center pointer-events-none"
          style={{ background: 'rgba(22,119,255,0.07)' }}>
          <span className="text-xs font-semibold text-blue-500">Drop here</span>
        </div>
      )}

      {/* Folder icon */}
      <div className="w-12 h-10 mx-auto mb-2.5">
        <svg viewBox="0 0 48 40" width="48" height="40">
          <path d="M2 8C2 5.8 3.8 4 6 4H18L22 8H42C44.2 8 46 9.8 46 12V34C46 36.2 44.2 38 42 38H6C3.8 38 2 36.2 2 34V8Z"
            fill={color} fillOpacity="0.18" stroke={color} strokeOpacity="0.45" strokeWidth="1.5" />
          <path d="M2 14H46V34C46 36.2 44.2 38 42 38H6C3.8 38 2 36.2 2 34V14Z"
            fill={color} fillOpacity="0.28" />
        </svg>
      </div>

      <p className="text-xs font-semibold text-center truncate text-gray-700 px-1" title={folder.name}>{folder.name}</p>
      <p className="text-xs text-center text-gray-400 mt-0.5">{fileCount} file{fileCount !== 1 ? 's' : ''}</p>
    </div>
  );
}

// ─── Draggable File Card (Grid) ───────────────────────────────────────────────

function FileGridCard({ f, onDelete }: { f: KBFile; onDelete: () => void }) {
  const c = EXT_COLOR[f.ext] || DEFAULT_EXT_COLOR;
  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.setData('fileIds', JSON.stringify([f.id])); e.dataTransfer.effectAllowed = 'move'; }}
      className="group relative flex flex-col rounded-xl cursor-grab active:cursor-grabbing transition-all select-none"
      style={{
        background: '#fff',
        border: '1.5px solid #ebebeb',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        padding: '14px 10px 12px',
      }}
      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = '#d0d0d0')}
      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = '#ebebeb')}>

      <button onClick={e => { e.stopPropagation(); onDelete(); }}
        className="absolute top-2 right-2 w-5 h-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50">
        <Trash2 className="w-3 h-3 text-red-400" />
      </button>

      {/* Drag hint */}
      <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <Move className="w-3 h-3 text-gray-300" />
      </div>

      <div className="w-10 h-12 rounded-lg mb-2.5 flex items-center justify-center mx-auto"
        style={{ background: c.bg, border: `1.5px solid ${c.border}` }}>
        <span className="text-xs font-black" style={{ color: c.text, fontSize: 9, letterSpacing: 0.5 }}>
          {f.ext.toUpperCase().slice(0, 4)}
        </span>
      </div>

      <p className="text-xs font-medium text-center truncate w-full text-gray-700 px-1" title={f.name}>{f.name}</p>
      <p className="text-xs text-center text-gray-400 mt-0.5">{formatSize(f.size)}</p>

      <div className="flex items-center justify-center gap-1 mt-1.5">
        <StatusIcon status={f.status} />
        {f.status === 'uploaded' && f.chunkCount && (
          <span className="text-xs text-blue-500">{f.chunkCount} chunks</span>
        )}
        {f.status === 'pending' && <span className="text-xs text-amber-500">Pending</span>}
        {f.status === 'error' && <span className="text-xs text-red-400">Failed</span>}
      </div>
    </div>
  );
}

function FolderListRow({
  folder,
  fileCount,
  onOpen,
  onRename,
  onDelete,
  onDropFiles,
}: {
  folder: KBFolder;
  fileCount: number;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
  onDropFiles: (fileIds: string[], folderId: string) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const color = folderColor(folder.id);

  return (
    <div
      onDoubleClick={onOpen}
      onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);
        const ids = e.dataTransfer.getData('fileIds');
        if (ids) onDropFiles(JSON.parse(ids), folder.id);
      }}
      className="group grid items-center px-5 py-3 cursor-pointer transition-colors"
      style={{
        gridTemplateColumns: '24px 1fr 70px 90px 100px 90px',
        background: dragOver ? '#e6f4ff' : undefined
      }}
      onMouseEnter={e => !dragOver && ((e.currentTarget as HTMLElement).style.background = '#f9fafb')}
      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = dragOver ? '#e6f4ff' : '')}>
      <Folder className="w-4 h-4 flex-shrink-0" style={{ color }} />
      <span className="text-sm font-semibold text-gray-700 truncate">{folder.name}</span>
      <span className="text-xs text-gray-400">Folder</span>
      <span className="text-xs text-gray-400">{fileCount} items</span>
      <span className="text-xs text-gray-400">{formatDate(folder.createdAt)}</span>
      <div className="flex items-center gap-1.5">
        <button onClick={e => { e.stopPropagation(); onRename(); }}
          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-gray-100 transition-all">
          <Edit2 className="w-3 h-3 text-gray-400" />
        </button>
        <button onClick={e => { e.stopPropagation(); onDelete(); }}
          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 transition-all">
          <Trash2 className="w-3 h-3 text-red-400" />
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function KnowledgeBase({ agentId, onUploadSuccess }: FileUploaderProps) {
  const [folders, setFolders] = useState<KBFolder[]>([]);
  const [files, setFiles] = useState<KBFile[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const [searchQuery, setSearchQuery] = useState('');
  // Removed isDraggingOver state to disable overlay
  const [isUploading, setIsUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [renameTarget, setRenameTarget] = useState<KBFolder | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);


  const hasUnsavedUploads =
    isUploading || files.some(f => f.status === 'pending' || f.status === 'uploading');
  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/agents/${agentId}/knowledge`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (res.ok) {
        const data = await res.json();
        const rawFiles: any[] = data.files || data || [];
        const rawFolders: any[] = data.folders || [];
        setFolders(rawFolders.map((f: any) => ({
          id: f.id, name: f.name, parentId: f.parent_id || null,
          createdAt: new Date(f.created_at || Date.now()),
        })));
        setFiles(rawFiles.map((f: any) => ({
          id: f.id, name: f.filename, size: f.size || 0,
          ext: getExt(f.filename), folderId: f.folder_id || null,
          status: 'uploaded', chunkCount: f.chunk_count,
          uploadedAt: new Date(f.created_at || Date.now()),
        })));
      }
    } catch { /* silent */ } finally { setLoading(false); }
  }, [agentId]);

  useEffect(() => { fetchData(); }, [fetchData]);

    // Warn user if they try to refresh / close tab while files are pending or uploading
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!hasUnsavedUploads) return;
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedUploads]);

  // Warn user if they navigate away inside the app while files are pending or uploading
  useEffect(() => {
    if (!hasUnsavedUploads) return;

    const message = 'You have pending or uploading files. Leaving this page will lose them.';

    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      const anchor = target.closest('a') as HTMLAnchorElement | null;
      if (!anchor) return;

      const href = anchor.getAttribute('href');
      if (!href) return;

      // Ignore special cases
      if (
        anchor.target === '_blank' ||
        anchor.hasAttribute('download') ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const isSamePage =
        anchor.pathname === window.location.pathname &&
        anchor.search === window.location.search;

      if (isSamePage) return;

      const ok = window.confirm(message);
      if (!ok) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    const handlePopState = () => {
      const ok = window.confirm(message);
      if (!ok) {
        window.history.pushState(null, '', window.location.href);
      }
    };

    // Push one state so back button can be intercepted
    window.history.pushState(null, '', window.location.href);

    document.addEventListener('click', handleDocumentClick, true);
    window.addEventListener('popstate', handlePopState);

    return () => {
      document.removeEventListener('click', handleDocumentClick, true);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [hasUnsavedUploads]);

  // ── Stage new files ────────────────────────────────────────────────────────

  const stageFiles = useCallback((incoming: File[]) => {
    const valid: KBFile[] = [];
    const duplicates: string[] = [];

    for (const f of incoming) {
      const ext = getExt(f.name);
      if (!['pdf', 'txt', 'csv', 'docx', 'md'].includes(ext)) continue;
      // Check if the file already exists anywhere in the agent's knowledge base
      const isDuplicate = files.some(x => x.name === f.name);
      if (isDuplicate) {
        duplicates.push(f.name);
        continue;
      }
      valid.push({
        id: `local-${Date.now()}-${Math.random()}`,
        name: f.name, size: f.size, ext,
        folderId: currentFolderId,
        status: 'pending',
        uploadedAt: new Date(),
        file: f,
      });
    }
    if (duplicates.length > 0) {
      alert(`The following files already exist and were skipped:\n\n${duplicates.join('\n')}`);
    }
    setFiles(prev => [...prev, ...valid]);
  }, [files, currentFolderId]);

  // ── Folder ops ─────────────────────────────────────────────────────────────

  const createFolder = async (name: string) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/agents/${agentId}/knowledge/folders`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}` 
        },
        body: JSON.stringify({ name, parent_id: currentFolderId })
      });
      
      if (res.ok) {
        const newFolder = await res.json();
        setFolders(prev => [...prev, {
          id: newFolder.id, 
          name: newFolder.name, 
          parentId: newFolder.parent_id, 
          createdAt: new Date(newFolder.created_at)
        }]);
      } else {
        // NEW: This will print the actual backend error to your browser!
        const errorText = await res.text();
        console.error("Server rejected the folder creation:", res.status, errorText);
        alert(`Failed to create folder. Server says: ${errorText}`); 
      }
    } catch (error) {
      console.error("Network or fetch error:", error);
    } finally {
      setShowNewFolder(false);
    }
  };

  const renameFolder = async (id: string, name: string) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/agents/${agentId}/knowledge/folders/${id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}` 
        },
        body: JSON.stringify({ name })
      });
      if (res.ok) {
        setFolders(prev => prev.map(f => f.id === id ? { ...f, name } : f));
      }
    } catch (error) {
      console.error("Error renaming folder", error);
    } finally {
      setRenameTarget(null);
    }
  };

  const deleteFolder = async (id: string) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/agents/${agentId}/knowledge/folders/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      
      if (res.ok) {
        setFiles(prev => prev.map(f => f.folderId === id ? { ...f, folderId: currentFolderId } : f));
        setFolders(prev => prev.filter(f => f.id !== id));
      }
    } catch (error) {
      console.error("Error deleting folder", error);
    }
  };

  // ── File ops ───────────────────────────────────────────────────────────────

  const deleteFile = async (id: string) => {
    const f = files.find(x => x.id === id);
    if (f?.status === 'uploaded') {
      try {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/agents/${agentId}/knowledge/${id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        });
      } catch { /* silent */ }
    }
    setFiles(prev => prev.filter(x => x.id !== id));
  };

  // Drop files into a folder (drag & drop)
  const onDropFilesIntoFolder = async (fileIds: string[], targetFolderId: string) => {
    // 1. Optimistic UI update (feels instant to the user)
    setFiles(prev => prev.map(f => fileIds.includes(f.id) ? { ...f, folderId: targetFolderId } : f));
    
    // 2. Background sync to backend
    for (const id of fileIds) {
      if (id.startsWith('local-')) continue; // Do not sync pending un-uploaded files
      
      try {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/agents/${agentId}/knowledge/${id}/move`, {
          method: 'PUT',
          headers: { 
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('token')}` 
          },
          body: JSON.stringify({ folder_id: targetFolderId })
        });
      } catch (error) {
        console.error(`Failed to move file ${id}`, error);
      }
    }
  };

  // Upload pending
  const handleUpload = async () => {
    const pending = files.filter(f => f.status === 'pending');
    if (!pending.length) return;
    setIsUploading(true);
    setFiles(prev => prev.map(f => f.status === 'pending' ? { ...f, status: 'uploading' } : f));
    try {
      const formData = new FormData();
      pending.forEach(f => f.file && formData.append('files', f.file));
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/agents/${agentId}/knowledge/bulk`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: formData,
      });
      if (!res.ok) throw new Error();
      const result = await res.json();
      setFiles(prev => prev.map(f => {
        if (f.status !== 'uploading') return f;
        const idx = pending.findIndex(p => p.id === f.id);
        const r = result.files?.[idx];
        return { ...f, status: r?.success ? 'uploaded' : 'error', error: r?.error, chunkCount: r?.chunk_count, id: r?.id || f.id, file: undefined };
      }));
      onUploadSuccess?.();
    } catch {
      setFiles(prev => prev.map(f => f.status === 'uploading' ? { ...f, status: 'error', error: 'Upload failed' } : f));
    } finally { setIsUploading(false); }
  };


  // ── Navigation ─────────────────────────────────────────────────────────────

  const breadcrumb: KBFolder[] = [];
  let ptr = currentFolderId;
  while (ptr) {
    const f = folders.find(x => x.id === ptr);
    if (!f) break;
    breadcrumb.unshift(f);
    ptr = f.parentId;
  }

  const goUp = () => {
    const cur = folders.find(f => f.id === currentFolderId);
    setCurrentFolderId(cur?.parentId ?? null);
    setSearchQuery('');
  };

  // ── Move file(s) to root ─────────────────────────────────────────────────--
  const moveToRoot = async (fileIds: string[]) => {
    // Optimistic UI update
    setFiles(prev => prev.map(f => fileIds.includes(f.id) ? { ...f, folderId: null } : f));
    // Backend sync
    for (const fileId of fileIds) {
      if (fileId.startsWith('local-')) continue; // Don't sync pending files
      try {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/agents/${agentId}/knowledge/${fileId}/move`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({ folder_id: null })
        });
      } catch (err) {
        console.error('Failed to move file to root', err);
      }
    }
  };

  // ── Filtered & sorted items ────────────────────────────────────────────────

  const applySort = <T extends { name: string; size?: number; uploadedAt?: Date; createdAt?: Date; ext?: string }>(arr: T[]): T[] =>
    [...arr].sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'size') return (b.size || 0) - (a.size || 0);
      if (sortBy === 'date') return ((b.uploadedAt || b.createdAt || new Date()).getTime()) - ((a.uploadedAt || a.createdAt || new Date()).getTime());
      if (sortBy === 'type') return (a.ext || '').localeCompare(b.ext || '');
      return 0;
    });

  const q = searchQuery.toLowerCase();
  const visibleFolders = applySort(
    folders.filter(f => f.parentId === currentFolderId && (!q || f.name.toLowerCase().includes(q)))
      .map(f => ({ ...f, size: 0, uploadedAt: f.createdAt }))
  );
  const visibleFiles = applySort(
    files.filter(f => f.folderId === currentFolderId && (!q || f.name.toLowerCase().includes(q)))
  );

  const pendingCount = files.filter(f => f.status === 'pending').length;
  const uploadedCount = files.filter(f => f.status === 'uploaded').length;
  const totalFiles = files.length;
  const isEmpty = visibleFolders.length === 0 && visibleFiles.length === 0;

  return (
    <div className="w-full" style={{ fontFamily: "'DM Sans', 'Segoe UI', system-ui, sans-serif" }}>

      {/* ── Section header ── */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Knowledge Base</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            {uploadedCount} file{uploadedCount !== 1 ? 's' : ''} · {folders.length} folder{folders.length !== 1 ? 's' : ''}
            {pendingCount > 0 && <span className="text-amber-500 font-medium"> · {pendingCount} pending</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <button onClick={handleUpload} disabled={isUploading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-60"
              style={{ background: '#52c41a', boxShadow: '0 2px 8px rgba(82,196,26,0.3)' }}>
              {isUploading
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading...</>
                : <><Upload className="w-3.5 h-3.5" /> Upload {pendingCount} File{pendingCount !== 1 ? 's' : ''}</>}
            </button>
          )}
          <button onClick={fetchData} disabled={loading}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Main card ── */}
      <div className="rounded-2xl overflow-hidden"
        style={{ border: '1.5px solid #ebebeb', background: '#fff', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>

        {/* ── Toolbar ── */}
        <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: '#f3f4f6', background: '#fafafa' }}>
          {/* Breadcrumb */}
          <div className="flex items-center gap-1 mr-2 flex-1 min-w-0">
            {/* Home breadcrumb as drop target */}
            <div
              onDragOver={e => { e.preventDefault(); e.stopPropagation(); (e.currentTarget as HTMLElement).style.background = '#e6f4ff'; }}
              onDragLeave={e => { e.preventDefault(); e.stopPropagation(); (e.currentTarget as HTMLElement).style.background = ''; }}
              onDrop={e => {
                e.preventDefault(); e.stopPropagation(); (e.currentTarget as HTMLElement).style.background = '';
                const ids = e.dataTransfer.getData('fileIds');
                if (ids) moveToRoot(JSON.parse(ids));
                setCurrentFolderId(null); setSearchQuery('');
              }}
              style={{ borderRadius: 8, transition: 'background 0.2s' }}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-blue-500 transition-colors flex-shrink-0 cursor-pointer px-1"
            >
              <Home className="w-3.5 h-3.5" />
              <span className="font-medium">Root</span>
            </div>
            {breadcrumb.map((f, i) => (
              <span key={f.id} className="flex items-center gap-1 min-w-0">
                <ChevronRight className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                <button onClick={() => { setCurrentFolderId(f.id); setSearchQuery(''); }}
                  className={`text-sm font-medium truncate transition-colors max-w-[120px] ${i === breadcrumb.length - 1 ? 'text-gray-800' : 'text-gray-400 hover:text-blue-500'}`}>
                  {f.name}
                </button>
              </span>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {currentFolderId && (
              <button onClick={goUp}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:bg-gray-100 transition-colors border border-gray-200">
                <ArrowLeft className="w-3.5 h-3.5" /> Up
              </button>
            )}
            <button onClick={() => setShowNewFolder(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors border border-gray-200">
              <FolderPlus className="w-3.5 h-3.5 text-amber-500" /> New Folder
            </button>
            <button onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors"
              style={{ background: '#1677ff' }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = '#4096ff')}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = '#1677ff')}>
              <Plus className="w-3.5 h-3.5" /> Add Files
            </button>

            <div className="w-px h-5 bg-gray-200 mx-1" />

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-300" />
              <input type="text" placeholder="Search..." value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-7 pr-2.5 py-1.5 rounded-lg text-xs focus:outline-none text-gray-700 placeholder-gray-300 w-36 transition-colors"
                style={{ border: '1.5px solid #e5e7eb', background: '#fff' }}
                onFocus={e => (e.currentTarget.style.borderColor = '#1677ff')}
                onBlur={e => (e.currentTarget.style.borderColor = '#e5e7eb')} />
            </div>

            {/* Sort */}
            <select value={sortBy} onChange={e => setSortBy(e.target.value as SortBy)}
              className="px-2 py-1.5 rounded-lg text-xs text-gray-600 focus:outline-none cursor-pointer"
              style={{ border: '1.5px solid #e5e7eb', background: '#fff' }}>
              <option value="name">Name</option>
              <option value="size">Size</option>
              <option value="date">Date</option>
              <option value="type">Type</option>
            </select>

            {/* View toggle */}
            <div className="flex rounded-lg overflow-hidden" style={{ border: '1.5px solid #e5e7eb' }}>
              {(['grid', 'list'] as ViewMode[]).map(v => (
                <button key={v} onClick={() => setViewMode(v)} className="p-1.5 transition-colors"
                  style={{ background: viewMode === v ? '#1677ff' : '#fff', color: viewMode === v ? '#fff' : '#9ca3af' }}>
                  {v === 'grid' ? <Grid className="w-3.5 h-3.5" /> : <List className="w-3.5 h-3.5" />}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Drop zone wrapper ── */}

        <div
          className="relative"
          onDragOver={e => { e.preventDefault(); }}
          onDragLeave={e => { e.preventDefault(); }}
          onDrop={e => {
            e.preventDefault();
            // Check if it's external files (from OS)
            if (e.dataTransfer.files.length > 0) { stageFiles(Array.from(e.dataTransfer.files)); return; }
            // Check if it's internal file cards being dragged to root
            const ids = e.dataTransfer.getData('fileIds');
            if (ids) setFiles(prev => prev.map(f => JSON.parse(ids).includes(f.id) ? { ...f, folderId: currentFolderId } : f));
          }}
          style={{ minHeight: 320 }}>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
              <p className="text-sm text-gray-400">Loading files...</p>
            </div>
          ) : isEmpty ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center"
                style={{ border: '2px dashed #e5e7eb' }}>
                <FolderOpen className="w-7 h-7 text-gray-200" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-gray-400">
                  {searchQuery ? `Nothing matches "${searchQuery}"` : 'This folder is empty'}
                </p>
                <p className="text-xs text-gray-300 mt-1">Drop files here or click "Add Files" above</p>
              </div>
              <button onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
                style={{ background: '#1677ff' }}>
                <Plus className="w-4 h-4" /> Add Files
              </button>
            </div>
          ) : viewMode === 'grid' ? (
            /* ── Grid ── */
            <div className="p-5">
              {visibleFolders.length > 0 && (
                <div className="mb-5">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <Folder className="w-3.5 h-3.5" /> Folders
                    <span className="text-gray-300 font-normal ml-1">— double-click to open, drag files onto a folder to move</span>
                  </p>
                  <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))' }}>
                    {visibleFolders.map(f => {
                      const folder = folders.find(x => x.id === f.id)!;
                      const count = files.filter(x => x.folderId === f.id).length;
                      return (
                        <FolderDropTarget key={f.id} folder={folder} fileCount={count}
                          onOpen={() => { setCurrentFolderId(f.id); setSearchQuery(''); }}
                          onRename={() => setRenameTarget(folder)}
                          onDelete={() => deleteFolder(f.id)}
                          onDropFiles={onDropFilesIntoFolder} />
                      );
                    })}
                  </div>
                </div>
              )}

              {visibleFiles.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <FileIcon2 className="w-3.5 h-3.5" /> Files
                    {visibleFolders.length > 0 && <span className="text-gray-300 font-normal ml-1">— drag onto a folder above to organize</span>}
                  </p>
                  <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))' }}>
                    {visibleFiles.map(f => (
                      <FileGridCard key={f.id} f={f} onDelete={() => deleteFile(f.id)} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ── List ── */
            <div className="divide-y divide-gray-50">
              {/* Header */}
              <div className="grid px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-400"
                style={{ gridTemplateColumns: '24px 1fr 70px 90px 100px 90px', background: '#fafafa' }}>
                <span />
                <span>Name</span>
                <span>Type</span>
                <span>Size</span>
                <span>Date</span>
                <span>Status</span>
              </div>

              {/* Folders */}
              {visibleFolders.map(f => {
                const folder = folders.find(x => x.id === f.id)!;
                const count = files.filter(x => x.folderId === f.id).length;
                return (
                  <FolderListRow
                    key={f.id}
                    folder={folder}
                    fileCount={count}
                    onOpen={() => { setCurrentFolderId(f.id); setSearchQuery(''); }}
                    onRename={() => setRenameTarget(folder)}
                    onDelete={() => deleteFolder(f.id)}
                    onDropFiles={onDropFilesIntoFolder}
                  />
                );
              })}

              {/* Files */}
              {visibleFiles.map(f => (
                <div key={f.id}
                  draggable
                  onDragStart={e => { e.dataTransfer.setData('fileIds', JSON.stringify([f.id])); }}
                  className="group grid items-center px-5 py-3 cursor-grab active:cursor-grabbing transition-colors"
                  style={{ gridTemplateColumns: '24px 1fr 70px 90px 100px 90px' }}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = '#f9fafb')}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = '')}>
                  <FileIcon2 className="w-4 h-4 text-gray-300 flex-shrink-0" />
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium text-gray-700 truncate" title={f.name}>{f.name}</span>
                    {f.status === 'pending' && <span className="text-xs bg-amber-50 text-amber-500 px-1.5 py-0.5 rounded border border-amber-100 flex-shrink-0">pending</span>}
                    {f.status === 'error' && <span className="text-xs bg-red-50 text-red-400 px-1.5 py-0.5 rounded border border-red-100 flex-shrink-0">error</span>}
                  </div>
                  <ExtBadge ext={f.ext} />
                  <span className="text-xs text-gray-400">{formatSize(f.size)}</span>
                  <span className="text-xs text-gray-400">{formatDate(f.uploadedAt)}</span>
                  <div className="flex items-center gap-1.5">
                    <StatusIcon status={f.status} />
                    {f.status === 'uploaded' && f.chunkCount && (
                      <span className="text-xs text-blue-400">{f.chunkCount}c</span>
                    )}
                    <button onClick={() => deleteFile(f.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 transition-all ml-auto">
                      <Trash2 className="w-3 h-3 text-red-400" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Footer status bar ── */}
        <div className="flex items-center justify-between px-5 py-2.5 border-t" style={{ borderColor: '#f3f4f6', background: '#fafafa' }}>
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span>{uploadedCount} uploaded</span>
            <span>·</span>
            <span>{folders.length} folder{folders.length !== 1 ? 's' : ''}</span>
            {pendingCount > 0 && <><span>·</span><span className="text-amber-500 font-semibold">{pendingCount} pending upload</span></>}
          </div>
          <span className="text-xs text-gray-300">PDF · TXT · CSV · DOCX · MD · Unlimited Size</span>
        </div>
      </div>

      {/* ── Modals ── */}
      {showNewFolder && <NewFolderModal onCreate={createFolder} onClose={() => setShowNewFolder(false)} />}
      {renameTarget && <RenameModal current={renameTarget.name} onRename={n => renameFolder(renameTarget.id, n)} onClose={() => setRenameTarget(null)} />}
      
      <input ref={fileInputRef} type="file" accept=".pdf,.txt,.csv,.docx,.md" multiple
        onChange={e => { stageFiles(Array.from(e.target.files || [])); e.target.value = ''; }}
        className="hidden" />
    </div>
  );
}