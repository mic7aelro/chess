'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronRight, ChevronDown, ChevronLeft, FolderOpen, Folder, Plus } from 'lucide-react';
import {
  getFolders,
  getReviews,
  createFolder,
  deleteReview,
  deleteFolder,
  renameReview,
  type SavedFolder,
  type SavedReview,
} from '@/lib/library';
import type { AnalysisResult } from '@/types';

interface Props {
  onLoad: (pgn: string, result: AnalysisResult, reviewId: string) => void;
  onRerun: (pgn: string) => void;
  refreshKey: number;
}

interface ContextMenu {
  x: number;
  y: number;
  review: SavedReview;
}

interface ConfirmDialog {
  title: string;
  message: string;
  onConfirm: () => void | Promise<void>;
}

export function LibraryPanel({ onLoad, onRerun, refreshKey }: Props) {
  const [folders, setFolders]             = useState<SavedFolder[]>([]);
  const [reviews, setReviews]             = useState<SavedReview[]>([]);
  const [expanded, setExpanded]           = useState<Record<string, boolean>>({});
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [contextMenu, setContextMenu]     = useState<ContextMenu | null>(null);
  const [confirm, setConfirm]             = useState<ConfirmDialog | null>(null);
  const [renaming, setRenaming]           = useState<{ id: string; value: string } | null>(null);

  async function refresh() {
    const [f, r] = await Promise.all([getFolders(), getReviews()]);
    setFolders(f);
    setReviews(r);
  }

  useEffect(() => { refresh(); }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close context menu on outside click
  const closeMenu = useCallback(() => setContextMenu(null), []);
  useEffect(() => {
    if (!contextMenu) return;
    window.addEventListener('click', closeMenu);
    window.addEventListener('contextmenu', closeMenu);
    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('contextmenu', closeMenu);
    };
  }, [contextMenu, closeMenu]);

  function toggleFolder(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  async function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    const folder = await createFolder(name);
    setNewFolderName('');
    setCreatingFolder(false);
    await refresh();
    setExpanded((prev) => ({ ...prev, [folder.id]: true }));
  }

  function handleDeleteFolder(id: string) {
    if (!confirm) {
      setConfirm({
        title: 'Delete folder',
        message: 'Delete this folder and all its games? This cannot be undone.',
        onConfirm: async () => { await deleteFolder(id); await refresh(); },
      });
    }
  }

  function handleRightClick(e: React.MouseEvent, review: SavedReview) {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, review });
  }

  function handleRename(review: SavedReview) {
    setContextMenu(null);
    setRenaming({ id: review.id, value: review.name });
  }

  async function commitRename() {
    if (!renaming) return;
    const name = renaming.value.trim();
    if (name) await renameReview(renaming.id, name);
    setRenaming(null);
    await refresh();
  }

  function handleRerun(review: SavedReview) {
    setContextMenu(null);
    setConfirm({
      title: 'Re-Analyse',
      message: `Re-analyse "${review.name}"? This will replace the stored result.`,
      onConfirm: () => onRerun(review.pgn),
    });
  }

  function handleDelete(review: SavedReview) {
    setContextMenu(null);
    setConfirm({
      title: 'Delete game',
      message: `Remove "${review.name}" from your library? This cannot be undone.`,
      onConfirm: async () => { await deleteReview(review.id); await refresh(); },
    });
  }

  const unsaved = reviews.filter((r) => !folders.find((f) => f.id === r.folderId));

  return (
    <div className="flex flex-col h-full relative">
      {/* Header */}
      <div className="flex items-center justify-between px-4 border-b border-zinc-800 shrink-0" style={{ height: 48 }}>
        <span className="text-base font-bold text-white tracking-tight">Library</span>
        <button
          onClick={() => setCreatingFolder((v) => !v)}
          className="text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer"
          title={creatingFolder ? 'Cancel' : 'New folder'}
        >
          {creatingFolder ? <ChevronLeft size={18} /> : <Plus size={16} />}
        </button>
      </div>

      {/* New folder input */}
      {creatingFolder && (
        <div className="px-4 py-2 border-b border-zinc-800 shrink-0 flex gap-2">
          <input
            autoFocus
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white outline-none focus:border-zinc-500"
            placeholder="Folder name…"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateFolder();
              if (e.key === 'Escape') setCreatingFolder(false);
            }}
          />
          <button
            onClick={handleCreateFolder}
            className="text-xs bg-white text-black px-2 py-1 rounded font-semibold hover:bg-zinc-200 transition-colors cursor-pointer"
          >
            Add
          </button>
        </div>
      )}

      {/* Folder list */}
      <div className="flex-1 overflow-y-auto py-2">
        {folders.length === 0 && !creatingFolder && (
          <p className="text-xs text-zinc-600 text-center mt-8 px-4">
            No folders yet. Click + to create one.
          </p>
        )}

        {folders.map((folder) => {
          const folderReviews = reviews.filter((r) => r.folderId === folder.id);
          const isOpen = expanded[folder.id] ?? false;
          return (
            <div key={folder.id}>
              <div className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-zinc-800/50 group cursor-pointer select-none">
                <button
                  className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                  onClick={() => toggleFolder(folder.id)}
                >
                  <span className="text-zinc-500 shrink-0">
                    {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </span>
                  <span className="text-zinc-400 shrink-0">
                    {isOpen ? <FolderOpen size={16} /> : <Folder size={16} />}
                  </span>
                  <span className="text-sm text-zinc-200 font-medium truncate">{folder.name}</span>
                  <span className="text-xs text-zinc-600 shrink-0">({folderReviews.length})</span>
                </button>
              </div>

              {isOpen && (
                <div className="pl-6">
                  {folderReviews.length === 0 && (
                    <p className="text-xs text-zinc-600 px-3 py-1.5">No games saved here.</p>
                  )}
                  {folderReviews.map((review) => (
                    <ReviewRow
                      key={review.id}
                      review={review}
                      renaming={renaming?.id === review.id ? renaming.value : null}
                      onLoad={onLoad}
                      onRightClick={handleRightClick}
                      onRenameChange={(v) => setRenaming((r) => r ? { ...r, value: v } : r)}
                      onRenameCommit={commitRename}
                      onRenameCancel={() => setRenaming(null)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {unsaved.length > 0 && (
          <div className="mt-2">
            <p className="text-[10px] text-zinc-700 uppercase tracking-wider px-4 py-1">Unsorted</p>
            {unsaved.map((review) => (
              <ReviewRow
                key={review.id}
                review={review}
                renaming={renaming?.id === review.id ? renaming.value : null}
                onLoad={onLoad}
                onRightClick={handleRightClick}
                onRenameChange={(v) => setRenaming((r) => r ? { ...r, value: v } : r)}
                onRenameCommit={commitRename}
                onRenameCancel={() => setRenaming(null)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenuPopup
          x={contextMenu.x}
          y={contextMenu.y}
          onRename={() => handleRename(contextMenu.review)}
          onRerun={() => handleRerun(contextMenu.review)}
          onDelete={() => handleDelete(contextMenu.review)}
        />
      )}

      {/* Confirmation dialog */}
      {confirm && (
        <ConfirmationDialog
          title={confirm.title}
          message={confirm.message}
          onConfirm={() => { confirm.onConfirm(); setConfirm(null); }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

function ReviewRow({
  review,
  renaming,
  onLoad,
  onRightClick,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
}: {
  review: SavedReview;
  renaming: string | null;
  onLoad: (pgn: string, result: AnalysisResult, reviewId: string) => void;
  onRightClick: (e: React.MouseEvent, review: SavedReview) => void;
  onRenameChange: (v: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (renaming !== null) inputRef.current?.focus(); }, [renaming]);

  if (renaming !== null) {
    return (
      <div className="px-3 py-1.5 mx-1">
        <input
          ref={inputRef}
          className="w-full bg-zinc-700 border border-zinc-500 rounded px-2 py-0.5 text-sm text-white outline-none"
          value={renaming}
          onChange={(e) => onRenameChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onRenameCommit();
            if (e.key === 'Escape') onRenameCancel();
          }}
          onBlur={onRenameCommit}
        />
      </div>
    );
  }

  return (
    <div
      className="flex items-center px-3 py-1.5 hover:bg-zinc-800/40 cursor-pointer rounded mx-1 select-none"
      onClick={() => onLoad(review.pgn, review.result, review.id)}
      onContextMenu={(e) => onRightClick(e, review)}
    >
      <div className="min-w-0">
        <p className="text-sm text-zinc-300 truncate font-medium">{review.name}</p>
        {review.date && <p className="text-xs text-zinc-600 truncate">{review.date}</p>}
      </div>
    </div>
  );
}

function ContextMenuPopup({
  x, y, onRename, onRerun, onDelete,
}: {
  x: number; y: number;
  onRename: () => void;
  onRerun: () => void;
  onDelete: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Adjust position so menu stays within viewport
  const [pos, setPos] = useState({ x, y });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({
      x: x + rect.width > window.innerWidth  ? x - rect.width  : x,
      y: y + rect.height > window.innerHeight ? y - rect.height : y,
    });
  }, [x, y]);

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-[140px]"
      style={{ left: pos.x, top: pos.y }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={onRename}
        className="w-full text-left px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 cursor-pointer transition-colors"
      >
        Rename
      </button>
      <button
        onClick={onRerun}
        className="w-full text-left px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 cursor-pointer transition-colors"
      >
        Re-Analyse
      </button>
      <div className="my-1 border-t border-zinc-700" />
      <button
        onClick={onDelete}
        className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-zinc-700 cursor-pointer transition-colors"
      >
        Delete
      </button>
    </div>
  );
}

function ConfirmationDialog({
  title, message, onConfirm, onCancel,
}: {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1a1a1a] border border-zinc-700 rounded-xl p-5 w-full flex flex-col gap-4">
        <div>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <p className="text-xs text-zinc-400 mt-1">{message}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-1.5 text-xs text-zinc-400 border border-zinc-700 rounded hover:bg-zinc-800 cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-1.5 text-xs font-semibold bg-white text-black rounded hover:bg-zinc-200 cursor-pointer transition-colors"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
