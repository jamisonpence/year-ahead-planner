import { useState, useMemo } from "react";
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
  ChevronDown, ChevronRight, Star, Calendar, Tag,
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

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function JournalPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

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
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen size={22} /> Journal
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {allEntries.length} {allEntries.length === 1 ? "entry" : "entries"}
            {favoriteCount > 0 && ` · ${favoriteCount} favorited`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => openAdd(todayISO())}>
            <Calendar size={14} /> Today
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => openAdd()}>
            <Plus size={15} /> New Entry
          </Button>
        </div>
      </div>

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
        <div className="text-center py-20 text-muted-foreground">
          <BookOpen size={52} className="mx-auto mb-4 opacity-20" />
          <p className="text-sm">
            {allEntries.length === 0
              ? "No entries yet. Start writing your first entry."
              : "No entries match your filters."}
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

      {/* Add / Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={(o) => { if (!o) closeModal(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Entry" : "New Journal Entry"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Date */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Calendar size={11} /> Date
              </label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
            </div>

            {/* Title */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Title (optional)</label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Give this entry a title…"
              />
            </div>

            {/* Content */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">What's on your mind *</label>
              <Textarea
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                placeholder="What's on your mind…"
                rows={8}
              />
            </div>

            {/* Mood selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Mood</label>
              <div className="flex flex-wrap gap-1.5">
                {MOODS.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, mood: f.mood === m.value ? "" : m.value }))}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border transition-all ${
                      form.mood === m.value
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card hover:bg-secondary border-border"
                    }`}
                  >
                    <span>{m.emoji}</span>
                    <span>{m.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Tags */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Tag size={11} /> Tags (comma-separated)
              </label>
              <Input
                value={form.tags}
                onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                placeholder="e.g. gratitude, work, family"
              />
            </div>

            {/* Favorite toggle */}
            <div>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, isFavorite: !f.isFavorite }))}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                  form.isFavorite
                    ? "bg-rose-50 border-rose-200 text-rose-600 dark:bg-rose-900/20 dark:border-rose-800 dark:text-rose-400"
                    : "bg-card hover:bg-secondary border-border"
                }`}
              >
                <Heart size={14} className={form.isFavorite ? "fill-current" : ""} />
                {form.isFavorite ? "Favorited" : "Add to favorites"}
              </button>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={closeModal}>Cancel</Button>
              <Button
                size="sm"
                onClick={save}
                disabled={createMut.isPending || updateMut.isPending}
              >
                {editing ? "Save Changes" : "Save Entry"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
