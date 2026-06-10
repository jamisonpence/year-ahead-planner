import { useState, useMemo, useEffect, useRef } from "react";
import QuotesPage from "@/pages/QuotesPage";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { JournalEntry } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  BookOpen, Plus, Heart, Search, Pencil, Trash2,
  ChevronDown, ChevronRight, Star, Calendar, Tag, Quote,
  Folder, FolderOpen, FileText, MoreHorizontal, X, FolderPlus, FilePlus, ChevronUp,
} from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────

const MOODS = [
  { value: "happy",       emoji: "😊", label: "Happy",      border: "border-l-yellow-400"  },
  { value: "sad",         emoji: "😔", label: "Sad",        border: "border-l-blue-400"    },
  { value: "frustrated",  emoji: "😤", label: "Frustrated", border: "border-l-red-400"     },
  { value: "calm",        emoji: "😌", label: "Calm",       border: "border-l-green-400"   },
  { value: "reflective",  emoji: "🤔", label: "Reflective", border: "border-l-purple-400"  },
  { value: "excited",     emoji: "🥳", label: "Excited",    border: "border-l-orange-400"  },
  { value: "anxious",     emoji: "😰", label: "Anxious",    border: "border-l-rose-400"    },
  { value: "neutral",     emoji: "😐", label: "Neutral",    border: "border-l-slate-400"   },
];

const MOOD_MAP = Object.fromEntries(MOODS.map((m) => [m.value, m]));

function getMoodBorder(mood: string | null | undefined): string {
  return mood && MOOD_MAP[mood] ? MOOD_MAP[mood].border : "border-l-slate-200";
}

function getMoodEmoji(mood: string | null | undefined): string {
  return mood && MOOD_MAP[mood] ? MOOD_MAP[mood].emoji : "";
}

function getMoodLabel(mood: string | null | undefined): string {
  return mood && MOOD_MAP[mood] ? MOOD_MAP[mood].label : "";
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(dateStr: string): string {
  // dateStr is YYYY-MM-DD
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

const EMPTY_FORM = {
  date: todayISO(),
  title: "",
  content: "",
  mood: "",
  tags: "",
  isFavorite: false,
};

// ── Entry Card ────────────────────────────────────────────────────────────────

function EntryCard({
  entry,
  onEdit,
  onDelete,
  onToggleFav,
}: {
  entry: JournalEntry;
  onEdit: () => void;
  onDelete: () => void;
  onToggleFav: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const tags = entry.tags ? entry.tags.split(",").map((t) => t.trim()).filter(Boolean) : [];
  const excerpt = entry.content.length > 200 ? entry.content.slice(0, 200) + "…" : entry.content;
  const needsExpand = entry.content.length > 200;
  const moodBorder = getMoodBorder(entry.mood);

  return (
    <div
      className={`rounded-xl border bg-card border-l-4 ${moodBorder} shadow-sm hover:shadow-md transition-shadow`}
    >
      {/* Card header row */}
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar size={11} />
            <span>{formatDate(entry.date)}</span>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={onToggleFav}
              className="p-1.5 rounded hover:bg-secondary transition-colors"
              title={entry.isFavorite ? "Remove from favorites" : "Add to favorites"}
            >
              <Heart
                size={13}
                className={entry.isFavorite ? "text-rose-500 fill-rose-500" : "text-muted-foreground"}
              />
            </button>
            <button
              onClick={onEdit}
              className="p-1.5 rounded hover:bg-secondary transition-colors"
              title="Edit entry"
            >
              <Pencil size={12} className="text-muted-foreground" />
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 rounded hover:bg-secondary transition-colors"
              title="Delete entry"
            >
              <Trash2 size={12} className="text-muted-foreground hover:text-destructive" />
            </button>
          </div>
        </div>

        {entry.title && (
          <h3 className="font-semibold text-base mt-1.5 leading-snug">{entry.title}</h3>
        )}

        {/* Content */}
        <div
          className="mt-2 cursor-pointer"
          onClick={() => needsExpand && setExpanded((e) => !e)}
        >
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {expanded ? entry.content : excerpt}
          </p>
          {needsExpand && (
            <button
              className="flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-muted-foreground mt-1.5 transition-colors"
              onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
            >
              {expanded ? (
                <><ChevronDown size={12} /> Show less</>
              ) : (
                <><ChevronRight size={12} /> Read more</>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Footer row */}
      {(entry.mood || tags.length > 0) && (
        <div className="px-5 pb-3 flex flex-wrap items-center gap-1.5 border-t border-border/50 pt-2.5">
          {entry.mood && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <span>{getMoodEmoji(entry.mood)}</span>
              <span>{getMoodLabel(entry.mood)}</span>
            </span>
          )}
          {entry.mood && tags.length > 0 && (
            <span className="text-muted-foreground/30 text-xs">·</span>
          )}
          {tags.map((t) => (
            <Badge key={t} variant="secondary" className="text-xs py-0 px-1.5">
              {t}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Notes Section ─────────────────────────────────────────────────────────────

type NoteItem = { id: string; title: string; content: string; updatedAt: string };
type SubFolder = { id: string; name: string; color: string; notes: NoteItem[] };
type NoteFolder = { id: string; name: string; color: string; notes: NoteItem[]; subfolders: SubFolder[] };

const FOLDER_COLORS = [
  { value: "bg-blue-500",   label: "Blue"   },
  { value: "bg-violet-500", label: "Purple" },
  { value: "bg-emerald-500",label: "Green"  },
  { value: "bg-amber-500",  label: "Amber"  },
  { value: "bg-rose-500",   label: "Red"    },
  { value: "bg-slate-500",  label: "Gray"   },
];

const NOTES_KEY = "mylifos_notes_v1";

function loadNotes(): NoteFolder[] {
  try { const r = localStorage.getItem(NOTES_KEY); return r ? JSON.parse(r) : []; } catch { return []; }
}
function saveNotes(folders: NoteFolder[]) {
  try { localStorage.setItem(NOTES_KEY, JSON.stringify(folders)); } catch {}
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

function NotesSection() {
  const [folders, setFolders] = useState<NoteFolder[]>(loadNotes);
  const persist = (next: NoteFolder[]) => { setFolders(next); saveNotes(next); };
  const [mobileNotesView, setMobileNotesView] = useState<"folders" | "note">("folders");

  // UI state
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [expandedSubfolders, setExpandedSubfolders] = useState<Set<string>>(new Set());
  const [selectedNote, setSelectedNote] = useState<{ folderId: string; subfolderId?: string; note: NoteItem } | null>(null);
  const [editingNote, setEditingNote] = useState<NoteItem | null>(null);

  // Folder modal
  const [folderModal, setFolderModal] = useState<{ mode: "add" | "edit"; folderId?: string; parentFolderId?: string } | null>(null);
  const [folderName, setFolderName] = useState("");
  const [folderColor, setFolderColor] = useState("bg-blue-500");

  // Note modal
  const [noteModal, setNoteModal] = useState<{ folderId: string; subfolderId?: string; note?: NoteItem } | null>(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");

  const toggleFolder = (id: string) => setExpandedFolders(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleSubfolder = (id: string) => setExpandedSubfolders(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // ── Folder CRUD ──
  function openAddFolder(parentFolderId?: string) {
    setFolderName(""); setFolderColor("bg-blue-500");
    setFolderModal({ mode: "add", parentFolderId });
  }
  function openEditFolder(folderId: string, parentFolderId?: string) {
    const folder = parentFolderId
      ? folders.find(f => f.id === parentFolderId)?.subfolders.find(s => s.id === folderId)
      : folders.find(f => f.id === folderId);
    if (!folder) return;
    setFolderName(folder.name); setFolderColor(folder.color);
    setFolderModal({ mode: "edit", folderId, parentFolderId });
  }
  function saveFolder() {
    if (!folderName.trim()) return;
    const { mode, folderId, parentFolderId } = folderModal!;
    if (parentFolderId) {
      // subfolder
      persist(folders.map(f => f.id !== parentFolderId ? f : {
        ...f, subfolders: mode === "add"
          ? [...f.subfolders, { id: uid(), name: folderName.trim(), color: folderColor, notes: [] }]
          : f.subfolders.map(s => s.id !== folderId ? s : { ...s, name: folderName.trim(), color: folderColor }),
      }));
    } else {
      if (mode === "add") {
        persist([...folders, { id: uid(), name: folderName.trim(), color: folderColor, notes: [], subfolders: [] }]);
      } else {
        persist(folders.map(f => f.id !== folderId ? f : { ...f, name: folderName.trim(), color: folderColor }));
      }
    }
    setFolderModal(null);
  }
  function deleteFolder(folderId: string, parentFolderId?: string) {
    if (!confirm("Delete this folder and all its notes?")) return;
    if (parentFolderId) {
      persist(folders.map(f => f.id !== parentFolderId ? f : { ...f, subfolders: f.subfolders.filter(s => s.id !== folderId) }));
    } else {
      persist(folders.filter(f => f.id !== folderId));
    }
    if (selectedNote?.folderId === folderId || selectedNote?.subfolderId === folderId) setSelectedNote(null);
  }

  // ── Note CRUD ──
  function openAddNote(folderId: string, subfolderId?: string) {
    setNoteTitle(""); setNoteContent("");
    setNoteModal({ folderId, subfolderId });
  }
  function openEditNote(folderId: string, subfolderId: string | undefined, note: NoteItem) {
    setNoteTitle(note.title); setNoteContent(note.content);
    setNoteModal({ folderId, subfolderId, note });
  }
  function saveNote() {
    if (!noteTitle.trim()) return;
    const { folderId, subfolderId, note } = noteModal!;
    const now = new Date().toISOString();
    const updated: NoteItem = note
      ? { ...note, title: noteTitle.trim(), content: noteContent, updatedAt: now }
      : { id: uid(), title: noteTitle.trim(), content: noteContent, updatedAt: now };
    persist(folders.map(f => {
      if (f.id !== folderId) return f;
      if (subfolderId) {
        return { ...f, subfolders: f.subfolders.map(s => s.id !== subfolderId ? s : {
          ...s, notes: note ? s.notes.map(n => n.id === note.id ? updated : n) : [...s.notes, updated],
        })};
      }
      return { ...f, notes: note ? f.notes.map(n => n.id === note.id ? updated : n) : [...f.notes, updated] };
    }));
    if (selectedNote?.note.id === note?.id) setSelectedNote({ folderId, subfolderId, note: updated });
    setNoteModal(null);
  }
  function deleteNote(folderId: string, subfolderId: string | undefined, noteId: string) {
    if (!confirm("Delete this note?")) return;
    persist(folders.map(f => {
      if (f.id !== folderId) return f;
      if (subfolderId) return { ...f, subfolders: f.subfolders.map(s => s.id !== subfolderId ? s : { ...s, notes: s.notes.filter(n => n.id !== noteId) }) };
      return { ...f, notes: f.notes.filter(n => n.id !== noteId) };
    }));
    if (selectedNote?.note.id === noteId) setSelectedNote(null);
  }

  const noteCount = (f: NoteFolder) => f.notes.length + f.subfolders.reduce((s, sf) => s + sf.notes.length, 0);

  // Track which folder/subfolder is "active" for contextual actions
  const [activeFolder, setActiveFolder] = useState<{ folderId: string; subfolderId?: string } | null>(null);

  return (
    <div className="flex flex-col md:flex-row gap-4 min-h-[500px]">
      {/* ── Sidebar: Folders ──────────────────────────────────── */}
      <div className={`shrink-0 flex flex-col gap-1.5 w-full md:w-72 ${mobileNotesView === "note" ? "hidden md:flex" : "flex"}`}>

        {/* Header + New Folder button */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Folders</span>
          <button
            onClick={() => openAddFolder()}
            className="flex items-center gap-1 text-xs text-primary hover:underline font-medium"
          >
            <FolderPlus size={13} /> New Folder
          </button>
        </div>

        {folders.length === 0 && (
          <div className="rounded-xl border-2 border-dashed border-border p-6 text-center text-muted-foreground">
            <Folder size={28} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm font-medium mb-1">No folders yet</p>
            <p className="text-xs mb-3">Create a folder to start organizing your notes</p>
            <button
              onClick={() => openAddFolder()}
              className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-lg font-medium hover:bg-primary/90 transition-colors"
            >
              + Create First Folder
            </button>
          </div>
        )}

        {folders.map(folder => {
          const isExpanded = expandedFolders.has(folder.id);
          return (
            <div key={folder.id} className="rounded-lg border bg-card overflow-hidden">
              {/* Folder header */}
              <div
                className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-secondary/40 transition-colors"
                onClick={() => { toggleFolder(folder.id); setActiveFolder({ folderId: folder.id }); }}
              >
                <div className={`w-3 h-3 rounded-sm shrink-0 ${folder.color}`} />
                {isExpanded ? <FolderOpen size={15} className="text-muted-foreground shrink-0" /> : <Folder size={15} className="text-muted-foreground shrink-0" />}
                <span className="text-sm flex-1 font-medium truncate">{folder.name}</span>
                <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded-full">{noteCount(folder)}</span>
                <div className="flex items-center gap-1 ml-1" onClick={e => e.stopPropagation()}>
                  <button onClick={() => openEditFolder(folder.id)} title="Rename" className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"><Pencil size={11} /></button>
                  <button onClick={() => deleteFolder(folder.id)} title="Delete folder" className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"><Trash2 size={11} /></button>
                </div>
              </div>

              {/* Expanded contents */}
              {isExpanded && (
                <div className="border-t bg-secondary/20 px-2 py-2 space-y-1">
                  {/* Quick-add row for folder */}
                  <div className="flex gap-1.5 mb-2">
                    <button
                      onClick={() => openAddNote(folder.id)}
                      className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 font-medium transition-colors"
                    >
                      <FilePlus size={12} /> Add Note
                    </button>
                    <button
                      onClick={() => openAddFolder(folder.id)}
                      className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 rounded-md bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground font-medium transition-colors"
                    >
                      <FolderPlus size={12} /> Add Subfolder
                    </button>
                  </div>

                  {/* Subfolders */}
                  {folder.subfolders.map(sub => (
                    <div key={sub.id} className="rounded-md border bg-card/60 overflow-hidden">
                      <div
                        className="flex items-center gap-2 px-2 py-2 cursor-pointer hover:bg-secondary/40 transition-colors"
                        onClick={() => { toggleSubfolder(sub.id); setActiveFolder({ folderId: folder.id, subfolderId: sub.id }); }}
                      >
                        <div className={`w-2.5 h-2.5 rounded-sm shrink-0 ${sub.color}`} />
                        <Folder size={12} className="text-muted-foreground shrink-0" />
                        <span className="text-xs flex-1 font-medium truncate">{sub.name}</span>
                        <span className="text-[10px] text-muted-foreground">{sub.notes.length}</span>
                        <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
                          <button onClick={() => openAddNote(folder.id, sub.id)} title="Add note" className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-primary transition-colors"><FilePlus size={11} /></button>
                          <button onClick={() => openEditFolder(sub.id, folder.id)} title="Rename" className="p-1 rounded hover:bg-secondary text-muted-foreground transition-colors"><Pencil size={11} /></button>
                          <button onClick={() => deleteFolder(sub.id, folder.id)} title="Delete" className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"><Trash2 size={11} /></button>
                        </div>
                      </div>
                      {expandedSubfolders.has(sub.id) && (
                        <div className="border-t bg-secondary/10 px-2 py-1 space-y-0.5">
                          {sub.notes.length === 0 && (
                            <p className="text-[11px] text-muted-foreground text-center py-2">No notes — click <FilePlus size={10} className="inline" /> above to add one</p>
                          )}
                          {sub.notes.map(note => (
                            <div key={note.id}
                              className={`flex items-center gap-1.5 px-2 py-1.5 rounded cursor-pointer text-xs transition-colors ${selectedNote?.note.id === note.id ? "bg-primary/15 text-primary font-medium" : "hover:bg-secondary text-muted-foreground"}`}
                              onClick={() => { setSelectedNote({ folderId: folder.id, subfolderId: sub.id, note }); setMobileNotesView("note"); }}>
                              <FileText size={11} className="shrink-0" />
                              <span className="flex-1 truncate">{note.title}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Folder-level notes */}
                  {folder.notes.length === 0 && folder.subfolders.length === 0 && (
                    <p className="text-[11px] text-muted-foreground text-center py-1">Use the buttons above to add a note or subfolder</p>
                  )}
                  {folder.notes.map(note => (
                    <div key={note.id}
                      className={`flex items-center gap-1.5 px-2 py-1.5 rounded cursor-pointer text-xs transition-colors ${selectedNote?.note.id === note.id ? "bg-primary/15 text-primary font-medium" : "hover:bg-secondary text-muted-foreground"}`}
                      onClick={() => { setSelectedNote({ folderId: folder.id, note }); setMobileNotesView("note"); }}>
                      <FileText size={11} className="shrink-0" />
                      <span className="flex-1 truncate">{note.title}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Main: Note viewer / empty state ────────────────────── */}
      <div className={`flex-1 min-w-0 bg-card border rounded-xl p-5 flex flex-col ${mobileNotesView === "folders" && selectedNote ? "hidden md:flex" : "flex"}`}>
        {!selectedNote ? (
          <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground py-16">
            <FileText size={36} className="mb-3 opacity-20" />
            <p className="text-sm font-medium text-foreground">No note selected</p>
            <p className="text-xs mt-1 text-center max-w-xs">
              {folders.length === 0
                ? "Create a folder on the left, then add a note inside it."
                : "Open a folder on the left, then click a note or use Add Note to create one."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4 h-full">
            <div className="flex items-start justify-between gap-3">
              <div>
                <button
                  onClick={() => setMobileNotesView("folders")}
                  className="md:hidden flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-1.5 transition-colors"
                >
                  ← Back to folders
                </button>
                <h2 className="text-lg font-bold">{selectedNote.note.title}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Updated {new Date(selectedNote.note.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs"
                  onClick={() => openEditNote(selectedNote.folderId, selectedNote.subfolderId, selectedNote.note)}>
                  <Pencil size={11} /> Edit
                </Button>
                <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive hover:bg-destructive/10"
                  onClick={() => deleteNote(selectedNote.folderId, selectedNote.subfolderId, selectedNote.note.id)}>
                  <Trash2 size={11} />
                </Button>
              </div>
            </div>
            <div className="flex-1 text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap overflow-y-auto">
              {selectedNote.note.content || <span className="text-muted-foreground italic">No content.</span>}
            </div>
          </div>
        )}
      </div>

      {/* ── Folder modal ────────────────────────────────────────── */}
      {folderModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={() => setFolderModal(null)}>
          <div className="bg-card border rounded-t-2xl sm:rounded-2xl w-full sm:w-80 flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <div className="flex justify-center pt-2 pb-0.5 sm:hidden"><div className="w-10 h-1 rounded-full bg-muted-foreground/30" /></div>
            <div className="px-5 pt-3 pb-3 flex items-center justify-between border-b shrink-0">
              <h3 className="font-semibold">{folderModal.mode === "add" ? (folderModal.parentFolderId ? "New Subfolder" : "New Folder") : "Edit Folder"}</h3>
              <button onClick={() => setFolderModal(null)}><X size={16} className="text-muted-foreground" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0">
              <input className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Folder name" value={folderName} onChange={e => setFolderName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && saveFolder()} autoFocus />
              <div className="flex gap-2 flex-wrap">
                {FOLDER_COLORS.map(c => (
                  <button key={c.value} onClick={() => setFolderColor(c.value)}
                    className={`w-7 h-7 rounded-full ${c.value} border-2 transition-all ${folderColor === c.value ? "border-foreground scale-110" : "border-transparent"}`}
                    title={c.label} />
                ))}
              </div>
            </div>
            <div className="flex gap-2 px-5 py-4 border-t shrink-0">
              <Button className="flex-1" onClick={saveFolder} disabled={!folderName.trim()}>Save</Button>
              <Button variant="outline" onClick={() => setFolderModal(null)}>Cancel</Button>
            </div>
            <div className="h-[env(safe-area-inset-bottom,0px)] shrink-0 sm:hidden" />
          </div>
        </div>
      )}

      {/* ── Note modal ──────────────────────────────────────────── */}
      {noteModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={() => setNoteModal(null)}>
          <div className="bg-card border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <div className="flex justify-center pt-2 pb-0.5 sm:hidden"><div className="w-10 h-1 rounded-full bg-muted-foreground/30" /></div>
            <div className="px-5 pt-3 pb-3 flex items-center justify-between border-b shrink-0">
              <h3 className="font-semibold">{noteModal.note ? "Edit Note" : "New Note"}</h3>
              <button onClick={() => setNoteModal(null)}><X size={16} className="text-muted-foreground" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 min-h-0">
              <input className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary font-medium"
                placeholder="Note title" value={noteTitle} onChange={e => setNoteTitle(e.target.value)} autoFocus />
              <textarea className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                placeholder="Write your note…" rows={8} value={noteContent} onChange={e => setNoteContent(e.target.value)} />
            </div>
            <div className="flex gap-2 px-5 py-4 border-t shrink-0">
              <Button className="flex-1" onClick={saveNote} disabled={!noteTitle.trim()}>Save</Button>
              <Button variant="outline" onClick={() => setNoteModal(null)}>Cancel</Button>
            </div>
            <div className="h-[env(safe-area-inset-bottom,0px)] shrink-0 sm:hidden" />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function JournalPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [section, setSection] = useState<"journal" | "quotes" | "mantras" | "notes">("journal");

  const [search, setSearch] = useState("");
  const [moodFilter, setMoodFilter] = useState("all");
  const [favOnly, setFavOnly] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<JournalEntry | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const { data: allEntries = [] } = useQuery<JournalEntry[]>({
    queryKey: ["/api/journal"],
    queryFn: async () => (await apiRequest("GET", "/api/journal")).json(),
  });

  const createMut = useMutation({
    mutationFn: (d: any) => apiRequest("POST", "/api/journal", d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/journal"] });
      closeModal();
      toast({ title: "Entry saved" });
    },
    onError: () => toast({ title: "Error saving entry", variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: number; d: any }) => apiRequest("PATCH", `/api/journal/${id}`, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/journal"] });
      closeModal();
      toast({ title: "Entry updated" });
    },
    onError: () => toast({ title: "Error updating entry", variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/journal/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/journal"] });
      toast({ title: "Entry deleted" });
    },
  });

  const toggleFav = useMutation({
    mutationFn: ({ id, isFavorite }: { id: number; isFavorite: boolean }) =>
      apiRequest("PATCH", `/api/journal/${id}`, { isFavorite }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/journal"] }),
  });

  function openAdd(preDate?: string) {
    setEditing(null);
    setForm({ ...EMPTY_FORM, date: preDate ?? todayISO() });
    setModalOpen(true);
  }

  function openEdit(entry: JournalEntry) {
    setEditing(entry);
    setForm({
      date: entry.date,
      title: entry.title ?? "",
      content: entry.content,
      mood: entry.mood ?? "",
      tags: entry.tags ?? "",
      isFavorite: entry.isFavorite,
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
  }

  function save() {
    if (!form.content.trim()) {
      toast({ title: "Content is required", variant: "destructive" });
      return;
    }
    const payload = {
      date: form.date || todayISO(),
      title: form.title.trim() || null,
      content: form.content.trim(),
      mood: form.mood || null,
      tags: form.tags.trim() || null,
      isFavorite: form.isFavorite,
      createdAt: editing?.createdAt ?? new Date().toISOString(),
    };
    if (editing) {
      updateMut.mutate({ id: editing.id, d: payload });
    } else {
      createMut.mutate(payload);
    }
  }

  const filtered = useMemo(() => {
    let result = [...allEntries];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (e) =>
          (e.title ?? "").toLowerCase().includes(q) ||
          e.content.toLowerCase().includes(q) ||
          (e.tags ?? "").toLowerCase().includes(q),
      );
    }
    if (moodFilter !== "all") {
      result = result.filter((e) => e.mood === moodFilter);
    }
    if (favOnly) {
      result = result.filter((e) => e.isFavorite);
    }

    // already sorted newest-first by server (desc date), keep that order
    return result;
  }, [allEntries, search, moodFilter, favOnly]);

  const favoriteCount = allEntries.filter((e) => e.isFavorite).length;
  const hasFilters = search || moodFilter !== "all" || favOnly;

  return (
    <div className="p-3 sm:p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen size={22} /> Journal
          </h1>
          {section === "journal" && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {allEntries.length} {allEntries.length === 1 ? "entry" : "entries"}
              {favoriteCount > 0 && ` · ${favoriteCount} favorited`}
            </p>
          )}
        </div>
        {section === "journal" && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => openAdd(todayISO())}>
              <Calendar size={14} /> Today
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => openAdd()}>
              <Plus size={15} /> New Entry
            </Button>
          </div>
        )}
      </div>

      {/* Section tab switcher */}
      <div className="flex gap-1 bg-secondary rounded-lg p-1 mb-5">
        <button
          onClick={() => setSection("journal")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${
            section === "journal" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <BookOpen size={14} /> Journal
        </button>
        <button
          onClick={() => setSection("quotes")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${
            section === "quotes" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Quote size={14} /> Quotes
        </button>
        <button
          onClick={() => setSection("mantras")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${
            section === "mantras" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          🔥 Mantras
        </button>
        <button
          onClick={() => setSection("notes")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${
            section === "notes" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <FileText size={14} /> Notes
        </button>
      </div>

      {/* Quotes / Mantras sections */}
      {section === "quotes" && <QuotesPage embedded embeddedTab="quotes" />}
      {section === "mantras" && <QuotesPage embedded embeddedTab="mantras" />}
      {section === "notes" && <NotesSection />}

      {/* Journal content */}
      {section === "journal" && <>


      {/* Search + filters */}
      <div className="space-y-3 mb-6">
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search entries…"
              className="pl-8 h-8 text-sm"
            />
          </div>
          <Button
            variant={favOnly ? "default" : "outline"}
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => setFavOnly(!favOnly)}
          >
            <Star size={13} className={favOnly ? "fill-current" : ""} />
            Favorites
          </Button>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1"
              onClick={() => { setSearch(""); setMoodFilter("all"); setFavOnly(false); }}
            >
              Clear
            </Button>
          )}
        </div>

        {/* Mood filter pills */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setMoodFilter("all")}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-all border ${
              moodFilter === "all"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card hover:bg-secondary border-transparent"
            }`}
          >
            All
          </button>
          {MOODS.map((m) => (
            <button
              key={m.value}
              onClick={() => setMoodFilter(m.value === moodFilter ? "all" : m.value)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-all border ${
                moodFilter === m.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card hover:bg-secondary border-transparent"
              }`}
            >
              {m.emoji} {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Entry list */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <BookOpen size={36} className="mx-auto mb-3 opacity-20" />
          <p className="font-semibold text-foreground">
            {allEntries.length === 0 ? "No entries yet" : "No entries match your filters"}
          </p>
          <p className="text-sm mt-1">
            {allEntries.length === 0
              ? "Start writing your first entry."
              : "Try adjusting your filters."}
          </p>
          {allEntries.length === 0 && (
            <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={() => openAdd()}>
              <Plus size={14} /> New Entry
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              onEdit={() => openEdit(entry)}
              onDelete={() => deleteMut.mutate(entry.id)}
              onToggleFav={() => toggleFav.mutate({ id: entry.id, isFavorite: !entry.isFavorite })}
            />
          ))}
        </div>
      )}

      {/* Add / Edit Modal — full-screen on mobile (above app chrome), centered on desktop */}
      {modalOpen && (
        <>
          {/* Mobile: full-screen above header+nav (z-[80] beats z-[70]) */}
          <div className="lg:hidden fixed inset-0 z-[80] bg-background flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b shrink-0 h-14">
              <span className="text-base font-semibold">{editing ? "Edit Entry" : "New Journal Entry"}</span>
              <button onClick={closeModal} className="p-1.5 rounded-lg hover:bg-secondary transition-colors"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-4 p-4 pb-6">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Calendar size={11} /> Date</label>
                <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Title (optional)</label>
                <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Give this entry a title…" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">What's on your mind *</label>
                <Textarea value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} placeholder="What's on your mind…" rows={8} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Mood</label>
                <div className="flex flex-wrap gap-1.5">
                  {MOODS.map((m) => (
                    <button key={m.value} type="button" onClick={() => setForm((f) => ({ ...f, mood: f.mood === m.value ? "" : m.value }))}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border transition-all ${form.mood === m.value ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-secondary border-border"}`}>
                      <span>{m.emoji}</span><span>{m.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Tag size={11} /> Tags (comma-separated)</label>
                <Input value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} placeholder="e.g. gratitude, work, family" />
              </div>
              <div>
                <button type="button" onClick={() => setForm((f) => ({ ...f, isFavorite: !f.isFavorite }))}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-colors ${form.isFavorite ? "bg-rose-50 border-rose-200 text-rose-600 dark:bg-rose-900/20 dark:border-rose-800 dark:text-rose-400" : "bg-card hover:bg-secondary border-border"}`}>
                  <Heart size={14} className={form.isFavorite ? "fill-current" : ""} />
                  {form.isFavorite ? "Favorited" : "Add to favorites"}
                </button>
              </div>
            </div>
            <div className="flex gap-2 px-4 py-3 border-t shrink-0">
              <Button variant="outline" className="flex-1" onClick={closeModal}>Cancel</Button>
              <Button className="flex-1" onClick={save} disabled={createMut.isPending || updateMut.isPending}>
                {editing ? "Save Changes" : "Save Entry"}
              </Button>
            </div>
          </div>

          {/* Desktop: centered dialog */}
          <div className="hidden lg:flex fixed inset-0 z-50 items-center justify-center bg-black/60" onClick={closeModal}>
            <div className="w-full max-w-lg bg-background border rounded-2xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
                <span className="text-base font-semibold">{editing ? "Edit Entry" : "New Journal Entry"}</span>
                <button onClick={closeModal} className="p-1 rounded-lg hover:bg-secondary transition-colors"><X size={16} /></button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-4 p-5">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Calendar size={11} /> Date</label>
                  <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Title (optional)</label>
                  <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Give this entry a title…" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">What's on your mind *</label>
                  <Textarea value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} placeholder="What's on your mind…" rows={8} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Mood</label>
                  <div className="flex flex-wrap gap-1.5">
                    {MOODS.map((m) => (
                      <button key={m.value} type="button" onClick={() => setForm((f) => ({ ...f, mood: f.mood === m.value ? "" : m.value }))}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border transition-all ${form.mood === m.value ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-secondary border-border"}`}>
                        <span>{m.emoji}</span><span>{m.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Tag size={11} /> Tags (comma-separated)</label>
                  <Input value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} placeholder="e.g. gratitude, work, family" />
                </div>
                <div>
                  <button type="button" onClick={() => setForm((f) => ({ ...f, isFavorite: !f.isFavorite }))}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-colors ${form.isFavorite ? "bg-rose-50 border-rose-200 text-rose-600 dark:bg-rose-900/20 dark:border-rose-800 dark:text-rose-400" : "bg-card hover:bg-secondary border-border"}`}>
                    <Heart size={14} className={form.isFavorite ? "fill-current" : ""} />
                    {form.isFavorite ? "Favorited" : "Add to favorites"}
                  </button>
                </div>
              </div>
              <div className="flex justify-end gap-2 px-5 py-4 border-t shrink-0">
                <Button variant="outline" size="sm" onClick={closeModal}>Cancel</Button>
                <Button size="sm" onClick={save} disabled={createMut.isPending || updateMut.isPending}>
                  {editing ? "Save Changes" : "Save Entry"}
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
      </>}
    </div>
  );
}
