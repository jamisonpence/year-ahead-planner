import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Quote, QuoteShareWithUser, PublicUser } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, parseISO } from "date-fns";
import {
  Quote as QuoteIcon, Plus, Pencil, Trash2, Search, Heart, X, Upload, Download,
  HelpCircle, Shuffle, CheckCircle2, Loader2, Tag, Send, Inbox, CornerUpRight, Check,
} from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { value: "all",          label: "All"         },
  { value: "motivation",   label: "Motivation"  },
  { value: "wisdom",       label: "Wisdom"      },
  { value: "humor",        label: "Humor"       },
  { value: "love",         label: "Love"        },
  { value: "life",         label: "Life"        },
  { value: "philosophy",   label: "Philosophy"  },
  { value: "other",        label: "Other"       },
];

const CATEGORY_COLORS: Record<string, string> = {
  motivation:  "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  wisdom:      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  humor:       "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  love:        "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  life:        "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  philosophy:  "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  other:       "bg-secondary text-secondary-foreground",
};

const SORT_OPTIONS = [
  { value: "newest",    label: "Newest first"     },
  { value: "alpha",     label: "Alphabetical"     },
  { value: "favorites", label: "Favorites first"  },
];

const EMPTY_FORM = {
  text: "",
  author: "",
  source: "",
  category: "other",
  tags: "",
  notes: "",
  isFavorite: false,
};

// ── Quotable Modal ────────────────────────────────────────────────────────────

const QUOTABLE_BASE = "/api/quotable";

type QuotableQuote = {
  _id: string; content: string; author: string;
  tags: string[];
};
type QuotableTag = { _id: string; name: string; quoteCount: number };

// Map Quotable tags → our category system
function inferCategoryFromTags(tags: string[]): string {
  const t = tags.join(" ").toLowerCase();
  if (/inspir|motivat|success|courag|persever|leadership|ambition/.test(t)) return "motivation";
  if (/wisdom|knowledge|truth|mind|learning|education/.test(t)) return "wisdom";
  if (/humor|funny|comedy|wit|humorous/.test(t)) return "humor";
  if (/love|friendship|family|heart|relationship|romance/.test(t)) return "love";
  if (/life|happiness|joy|hope|peace|living|gratitude/.test(t)) return "life";
  if (/philosophy|god|religion|faith|spirit|meaning|soul/.test(t)) return "philosophy";
  return "other";
}

function QuotableModal({ open, onClose, onAdd }: {
  open: boolean;
  onClose: () => void;
  onAdd: (q: { text: string; author: string; tags: string; category: string }) => void;
}) {
  const [mode, setMode] = useState<"random" | "search" | "topics">("random");
  const [query, setQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [results, setResults] = useState<QuotableQuote[]>([]);
  const [availableTags, setAvailableTags] = useState<QuotableTag[]>([]);
  const [loading, setLoading] = useState(false);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);

  const fetchRandom = useCallback(async () => {
    setLoading(true); setResults([]);
    try {
      const r = await fetch(`${QUOTABLE_BASE}/random?limit=8`);
      if (!r.ok) throw new Error();
      const data = await r.json();
      setResults(Array.isArray(data) ? data : [data]);
    } catch { /* server proxy unavailable */ }
    finally { setLoading(false); }
  }, []);

  const fetchByTag = useCallback(async (tag: string) => {
    setLoading(true); setResults([]);
    try {
      const r = await fetch(`${QUOTABLE_BASE}/by-topic?topic=${encodeURIComponent(tag)}`);
      if (!r.ok) throw new Error();
      const data = await r.json();
      setResults(Array.isArray(data) ? data : []);
    } catch { }
    finally { setLoading(false); }
  }, []);

  const fetchSearch = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setLoading(true); setResults([]);
    try {
      const r = await fetch(`${QUOTABLE_BASE}/search?query=${encodeURIComponent(q.trim())}`);
      if (!r.ok) throw new Error();
      const data = await r.json();
      setResults(Array.isArray(data) ? data : []);
    } catch { }
    finally { setLoading(false); }
  }, []);

  const loadTags = useCallback(async () => {
    if (availableTags.length > 0) return;
    setTagsLoading(true);
    try {
      const r = await fetch(`${QUOTABLE_BASE}/topics`);
      if (!r.ok) throw new Error();
      const data: QuotableTag[] = await r.json();
      setAvailableTags(data);
    } catch { }
    finally { setTagsLoading(false); }
  }, [availableTags.length]);

  // On open / mode change
  useEffect(() => {
    if (!open) { setSavedIds(new Set()); return; }
    if (mode === "random") fetchRandom();
    if (mode === "search") setTimeout(() => searchRef.current?.focus(), 80);
    if (mode === "topics") { loadTags(); setSelectedTag(null); setResults([]); }
  }, [open, mode]);

  function switchMode(m: "random" | "search" | "topics") {
    setMode(m); setResults([]); setQuery(""); setSelectedTag(null);
  }

  function handleTagClick(tag: string) {
    setSelectedTag(tag);
    fetchByTag(tag);
  }

  function handleAdd(q: QuotableQuote) {
    onAdd({
      text: q.content,
      author: q.author,
      tags: q.tags.slice(0, 4).join(", "),
      category: inferCategoryFromTags(q.tags),
    });
    setSavedIds(s => new Set([...s, q._id]));
  }

  const showTagGrid = mode === "topics" && !selectedTag;

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[88vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <QuoteIcon size={15} /> Find Quotes
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">Browse 3,000+ quotes by topic or search by keyword. Click Add to save.</p>
        </DialogHeader>

        {/* Mode tabs */}
        <div className="flex gap-1 bg-muted rounded-lg p-1 mx-5 mt-3 mb-1 shrink-0">
          {([
            ["random", "Random",        Shuffle],
            ["search", "Search",        Search],
            ["topics", "Browse Topics", Tag],
          ] as const).map(([key, label, Icon]) => (
            <button key={key} onClick={() => switchMode(key)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-sm font-medium transition-all ${
                mode === key ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}>
              <Icon size={12} /> {label}
            </button>
          ))}
        </div>

        {/* Search bar — only visible in search mode */}
        {mode === "search" && (
          <div className="flex gap-2 px-5 py-2.5 shrink-0">
            <div className="relative flex-1">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") fetchSearch(query); }}
                placeholder="Search by keyword, topic, or phrase…"
                className="pl-8 h-8 text-sm"
              />
            </div>
            <Button size="sm" className="h-8" onClick={() => fetchSearch(query)} disabled={loading || !query.trim()}>
              {loading ? <Loader2 size={13} className="animate-spin" /> : "Search"}
            </Button>
          </div>
        )}

        {/* Active tag chip + clear */}
        {mode === "topics" && selectedTag && (
          <div className="px-5 py-2 shrink-0 flex items-center gap-2">
            <span className="text-xs bg-primary/10 text-primary border border-primary/20 px-2.5 py-1 rounded-full flex items-center gap-1.5 capitalize">
              #{selectedTag}
              <button onClick={() => { setSelectedTag(null); setResults([]); }} className="hover:opacity-60"><X size={10} /></button>
            </span>
          </div>
        )}

        {/* Random header with refresh */}
        {mode === "random" && !loading && results.length > 0 && (
          <div className="px-5 py-2 shrink-0 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{results.length} random quotes</span>
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={fetchRandom}>
              <Shuffle size={11} /> Shuffle
            </Button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto border-t">
          {/* Loading spinner */}
          {loading && (
            <div className="flex items-center justify-center h-28 text-muted-foreground gap-2">
              <Loader2 size={16} className="animate-spin" />
              <span className="text-sm">Loading…</span>
            </div>
          )}

          {/* Tag browser grid */}
          {!loading && showTagGrid && (
            <div className="p-5">
              {tagsLoading && (
                <div className="flex items-center justify-center h-24"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
              )}
              {!tagsLoading && availableTags.length > 0 && (
                <>
                  <p className="text-xs text-muted-foreground mb-3">Click a topic to browse quotes</p>
                  <div className="flex flex-wrap gap-2">
                    {availableTags.map(tag => (
                      <button key={tag._id} onClick={() => handleTagClick(tag.name)}
                        className="px-3 py-1.5 rounded-full border bg-card hover:bg-secondary hover:border-primary/30 transition-all text-sm capitalize flex items-center gap-1.5">
                        <span>{tag.name}</span>
                        <span className="text-xs text-muted-foreground">{tag.quoteCount}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
              {!tagsLoading && availableTags.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">Couldn't load topics. Check your connection.</p>
              )}
            </div>
          )}

          {/* Empty state for search */}
          {!loading && mode === "search" && results.length === 0 && query.trim() === "" && (
            <div className="flex flex-col items-center justify-center h-28 text-muted-foreground gap-1">
              <Search size={20} className="opacity-25" />
              <p className="text-sm">Type something and hit Search</p>
            </div>
          )}
          {!loading && mode === "search" && results.length === 0 && query.trim() !== "" && (
            <p className="text-sm text-muted-foreground text-center py-8">No quotes found for "{query}"</p>
          )}

          {/* Quote results list */}
          {!loading && results.length > 0 && (
            <div className="divide-y">
              {results.map(q => {
                const saved = savedIds.has(q._id);
                return (
                  <div key={q._id} className="p-4 flex flex-col gap-2 hover:bg-muted/30 transition-colors group">
                    <p className="text-sm italic leading-relaxed text-foreground/90">
                      &ldquo;{q.content}&rdquo;
                    </p>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-muted-foreground">— {q.author}</p>
                        {q.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {q.tags.slice(0, 4).map(t => (
                              <span key={t} className="text-[10px] bg-secondary px-1.5 py-0.5 rounded-full capitalize text-muted-foreground">{t}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => !saved && handleAdd(q)}
                        disabled={saved}
                        className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                          saved
                            ? "bg-green-50 text-green-600 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800 cursor-default"
                            : "bg-card hover:bg-primary hover:text-primary-foreground hover:border-primary border-border"
                        }`}
                      >
                        {saved ? <><CheckCircle2 size={12} /> Saved</> : <><Plus size={12} /> Add</>}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Shuffle for topic browsing */}
          {!loading && mode === "topics" && selectedTag && results.length > 0 && (
            <div className="p-4 text-center">
              <Button size="sm" variant="outline" onClick={() => fetchByTag(selectedTag)}>Shuffle same topic</Button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 border-t bg-muted/20 shrink-0 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Powered by <a href="https://github.com/lukePeavey/quotable" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Quotable</a>
          </span>
          {savedIds.size > 0 && (
            <span className="text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1">
              <CheckCircle2 size={11} /> {savedIds.size} added
            </span>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Quote Card ────────────────────────────────────────────────────────────────

function QuoteCard({
  quote, onEdit, onDelete, onToggleFav, onShare,
}: {
  quote: Quote;
  onEdit: () => void;
  onDelete: () => void;
  onToggleFav: () => void;
  onShare: () => void;
}) {
  const catColor = CATEGORY_COLORS[quote.category] ?? CATEGORY_COLORS.other;
  const tags = quote.tags ? quote.tags.split(",").map((t) => t.trim()).filter(Boolean) : [];

  return (
    <div className="rounded-xl border bg-card p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <QuoteIcon size={16} className="text-muted-foreground/40 shrink-0 mt-1" />
        <p className="flex-1 text-base italic leading-relaxed">&ldquo;{quote.text}&rdquo;</p>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onToggleFav} className="p-1.5 rounded hover:bg-secondary transition-colors">
            <Heart
              size={14}
              className={quote.isFavorite ? "text-rose-500 fill-rose-500" : "text-muted-foreground"}
            />
          </button>
          <button onClick={onShare} className="p-1.5 rounded hover:bg-secondary transition-colors" title="Share with friend">
            <Send size={13} className="text-muted-foreground" />
          </button>
          <button onClick={onEdit} className="p-1.5 rounded hover:bg-secondary transition-colors">
            <Pencil size={13} className="text-muted-foreground" />
          </button>
          <button onClick={onDelete} className="p-1.5 rounded hover:bg-secondary transition-colors">
            <Trash2 size={13} className="text-muted-foreground hover:text-destructive" />
          </button>
        </div>
      </div>

      {(quote.author || quote.source) && (
        <div className="pl-5">
          {quote.author && <p className="text-sm font-semibold">&mdash; {quote.author}</p>}
          {quote.source && <p className="text-xs text-muted-foreground">{quote.source}</p>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5 pl-5">
        <Badge className={`text-xs py-0 px-1.5 border-0 ${catColor}`}>{quote.category}</Badge>
        {tags.map((t) => (
          <Badge key={t} variant="secondary" className="text-xs py-0 px-1.5">{t}</Badge>
        ))}
      </div>

      {quote.notes && (
        <p className="text-xs text-muted-foreground pl-5 border-l-2 border-muted">{quote.notes}</p>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function QuotesPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [favOnly, setFavOnly] = useState(false);
  const [sortBy, setSortBy] = useState("newest");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Quote | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [csvInfoOpen, setCsvInfoOpen] = useState(false);
  const [quotableOpen, setQuotableOpen] = useState(false);
  const [shareQuote, setShareQuote] = useState<Quote | null>(null);
  const [showShared, setShowShared] = useState(false);
  const csvRef = useRef<HTMLInputElement>(null);

  const { data: allQuotes = [] } = useQuery<Quote[]>({
    queryKey: ["/api/quotes"],
    queryFn: async () => (await apiRequest("GET", "/api/quotes")).json(),
  });

  const createMut = useMutation({
    mutationFn: (d: any) => apiRequest("POST", "/api/quotes", d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/quotes"] }); closeModal(); },
    onError: () => toast({ title: "Error saving", variant: "destructive" }),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: number; d: any }) => apiRequest("PATCH", `/api/quotes/${id}`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/quotes"] }); closeModal(); },
    onError: () => toast({ title: "Error updating", variant: "destructive" }),
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/quotes/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/quotes"] }),
  });
  const toggleFav = useMutation({
    mutationFn: ({ id, isFavorite }: { id: number; isFavorite: boolean }) =>
      apiRequest("PATCH", `/api/quotes/${id}`, { isFavorite }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/quotes"] }),
  });

  function parseCsvText(text: string): Record<string, string>[] {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];
    const parseLine = (line: string) => {
      const result: string[] = []; let cur = ""; let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
        else if (c === ',' && !inQ) { result.push(cur); cur = ""; }
        else cur += c;
      }
      result.push(cur); return result;
    };
    const headers = parseLine(lines[0]).map(h => h.trim().toLowerCase());
    return lines.slice(1).map(line => {
      const cols = parseLine(line);
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = (cols[i] ?? "").trim(); });
      return row;
    }).filter(row => Object.values(row).some(v => v));
  }

  const CATEGORY_MAP: Record<string, string> = {
    motivation: "motivation", wisdom: "wisdom", humor: "humor",
    love: "love", life: "life", philosophy: "philosophy", other: "other",
  };

  function downloadCsvTemplate() {
    const header = "text,author,source,category,tags,notes,isFavorite";
    const ex1 = `"The only way to do great work is to love what you do.",Steve Jobs,Stanford Commencement 2005,motivation,"inspiration,work",,false`;
    const ex2 = `"In the middle of every difficulty lies opportunity.",Albert Einstein,,wisdom,life,,true`;
    const blob = new Blob([`${header}\n${ex1}\n${ex2}`], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "quotes_template.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  async function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const rows = parseCsvText(text);
    if (rows.length === 0) {
      toast({ title: "No rows found", description: "Make sure your CSV has a header row and data rows.", variant: "destructive" });
      e.target.value = ""; return;
    }
    let created = 0, skipped = 0;
    const errors: string[] = [];
    for (const row of rows) {
      if (!row.text?.trim()) { skipped++; continue; }
      try {
        await apiRequest("POST", "/api/quotes", {
          text: row.text.trim(),
          author: row.author?.trim() || null,
          source: row.source?.trim() || null,
          category: CATEGORY_MAP[row.category?.toLowerCase().trim() ?? ""] ?? "other",
          tags: row.tags?.trim() || null,
          notes: row.notes?.trim() || null,
          isFavorite: row.isfavorite === "true" || row.isFavorite === "true",
        });
        created++;
      } catch {
        errors.push(row.text?.slice(0, 30) ?? "unknown");
      }
    }
    qc.invalidateQueries({ queryKey: ["/api/quotes"] });
    e.target.value = "";
    const desc = [
      `${created} quote${created !== 1 ? "s" : ""} imported`,
      skipped ? `${skipped} skipped (no text)` : "",
      errors.length ? `${errors.length} failed` : "",
    ].filter(Boolean).join(" · ");
    toast({ title: "CSV imported", description: desc });
  }

  function openAdd() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setModalOpen(true);
  }
  function openEdit(q: Quote) {
    setEditing(q);
    setForm({
      text: q.text,
      author: q.author ?? "",
      source: q.source ?? "",
      category: q.category,
      tags: q.tags ?? "",
      notes: q.notes ?? "",
      isFavorite: q.isFavorite,
    });
    setModalOpen(true);
  }
  function closeModal() { setModalOpen(false); setEditing(null); }

  function save() {
    if (!form.text.trim()) { toast({ title: "Quote text is required", variant: "destructive" }); return; }
    const payload = {
      text: form.text.trim(),
      author: form.author.trim() || null,
      source: form.source.trim() || null,
      category: form.category,
      tags: form.tags.trim() || null,
      notes: form.notes.trim() || null,
      isFavorite: form.isFavorite,
    };
    if (editing) updateMut.mutate({ id: editing.id, d: payload });
    else createMut.mutate(payload);
  }

  const filtered = useMemo(() => {
    let result = [...allQuotes];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter((x) =>
        x.text.toLowerCase().includes(q) ||
        (x.author ?? "").toLowerCase().includes(q) ||
        (x.tags ?? "").toLowerCase().includes(q),
      );
    }
    if (categoryFilter !== "all") {
      result = result.filter((x) => x.category === categoryFilter);
    }
    if (favOnly) {
      result = result.filter((x) => x.isFavorite);
    }

    if (sortBy === "alpha") {
      result.sort((a, b) => a.text.localeCompare(b.text));
    } else if (sortBy === "favorites") {
      result.sort((a, b) => (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0));
    }
    // "newest" = default order from server (by sortOrder desc then id desc)

    return result;
  }, [allQuotes, search, categoryFilter, favOnly, sortBy]);

  const favoriteCount = allQuotes.filter((q) => q.isFavorite).length;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <QuoteIcon size={22} /> Quotes
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {allQuotes.length} quote{allQuotes.length !== 1 ? "s" : ""} · {favoriteCount} favorited
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => setQuotableOpen(true)} className="gap-1.5">
            <Search size={13} /> Find Quotes
          </Button>
          <Button size="sm" variant="outline" onClick={downloadCsvTemplate} className="gap-1.5">
            <Download size={13} /> Template
          </Button>
          <Button size="sm" variant="outline" onClick={() => setCsvInfoOpen(true)} className="gap-1.5">
            <HelpCircle size={13} /> CSV Format
          </Button>
          <Button size="sm" variant="outline" onClick={() => csvRef.current?.click()} className="gap-1.5">
            <Upload size={13} /> Upload CSV
          </Button>
          <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
          <Button onClick={openAdd} size="sm" className="gap-1.5">
            <Plus size={15} /> Add Quote
          </Button>
        </div>
      </div>

      {/* Search + filters */}
      <div className="space-y-3 mb-5">
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search quotes, authors, tags…"
              className="pl-8 h-8 text-sm"
            />
          </div>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-40 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button
            variant={favOnly ? "default" : "outline"}
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => { setFavOnly(!favOnly); setShowShared(false); }}
          >
            <Heart size={13} className={favOnly ? "fill-current" : ""} />
            Favorites
          </Button>
          <Button
            variant={showShared ? "default" : "outline"}
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => { setShowShared(!showShared); setFavOnly(false); }}
          >
            <Inbox size={13} /> Shared
          </Button>
          {(search || categoryFilter !== "all" || favOnly) && !showShared && (
            <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={() => { setSearch(""); setCategoryFilter("all"); setFavOnly(false); }}>
              <X size={13} /> Clear
            </Button>
          )}
        </div>

        {/* Category pills */}
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              onClick={() => setCategoryFilter(c.value)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-all border ${
                categoryFilter === c.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card hover:bg-secondary border-transparent"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Quote list / Shared tab */}
      {showShared ? (
        <SharedQuotesTab />
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <QuoteIcon size={48} className="mx-auto mb-4 opacity-20" />
          <p className="text-sm">{allQuotes.length === 0 ? "No quotes yet. Add your first one!" : "No quotes match your filters."}</p>
          {allQuotes.length === 0 && (
            <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={openAdd}>
              <Plus size={14} /> Add Quote
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((q) => (
            <QuoteCard
              key={q.id}
              quote={q}
              onEdit={() => openEdit(q)}
              onDelete={() => deleteMut.mutate(q.id)}
              onToggleFav={() => toggleFav.mutate({ id: q.id, isFavorite: !q.isFavorite })}
              onShare={() => setShareQuote(q)}
            />
          ))}
        </div>
      )}

      {/* Quote Share Modal */}
      {shareQuote && (
        <QuoteShareModal quote={shareQuote} onClose={() => setShareQuote(null)} />
      )}

      {/* Quotable search */}
      <QuotableModal
        open={quotableOpen}
        onClose={() => setQuotableOpen(false)}
        onAdd={({ text, author, tags, category }) => {
          createMut.mutate({
            text,
            author: author || null,
            source: null,
            category,
            tags: tags || null,
            notes: null,
            isFavorite: false,
          });
        }}
      />

      {/* Add/Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={(o) => { if (!o) closeModal(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Quote" : "Add Quote"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Quote Text *</label>
              <Textarea
                value={form.text}
                onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))}
                placeholder="Enter the quote…"
                rows={4}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Author</label>
                <Input
                  value={form.author}
                  onChange={(e) => setForm((f) => ({ ...f, author: e.target.value }))}
                  placeholder="e.g. Marcus Aurelius"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Source</label>
                <Input
                  value={form.source}
                  onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
                  placeholder="e.g. Meditations"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Category</label>
                <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.filter((c) => c.value !== "all").map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Tags (comma-separated)</label>
                <Input
                  value={form.tags}
                  onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                  placeholder="stoic, daily"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Notes</label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                placeholder="Personal reflection…"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, isFavorite: !f.isFavorite }))}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                  form.isFavorite ? "bg-rose-50 border-rose-200 text-rose-600 dark:bg-rose-900/20 dark:border-rose-800 dark:text-rose-400" : "bg-card hover:bg-secondary"
                }`}
              >
                <Heart size={14} className={form.isFavorite ? "fill-current" : ""} />
                {form.isFavorite ? "Favorited" : "Add to favorites"}
              </button>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={closeModal}>Cancel</Button>
              <Button size="sm" onClick={save}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* CSV Format Info */}
      <Dialog open={csvInfoOpen} onOpenChange={setCsvInfoOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><HelpCircle size={16} /> Quotes CSV Format</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-3">Your CSV must have a header row. Column names are case-insensitive. Only <span className="font-semibold text-foreground">text</span> is required — all others are optional.</p>
          <div className="space-y-1 text-sm">
            {[
              { col: "text",       req: true,  note: "The quote itself" },
              { col: "author",     req: false, note: "Who said it" },
              { col: "source",     req: false, note: "Book, film, speech, etc." },
              { col: "category",   req: false, note: "motivation · wisdom · humor · love · life · philosophy · other  (default: other)" },
              { col: "tags",       req: false, note: "Comma-separated, e.g. gratitude,work" },
              { col: "notes",      req: false, note: "Free text" },
              { col: "isFavorite", req: false, note: "true · false" },
            ].map(({ col, req, note }) => (
              <div key={col} className="flex gap-3 py-1.5 border-b last:border-0">
                <code className="text-xs font-mono bg-secondary px-1.5 py-0.5 rounded shrink-0 self-start">{col}</code>
                {req && <span className="text-xs text-red-500 font-medium shrink-0 self-start pt-0.5">required</span>}
                <span className="text-xs text-muted-foreground leading-relaxed">{note}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">Tip: click <strong>Template</strong> to download a pre-filled example CSV.</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Avatar helper ──────────────────────────────────────────────────────────────
function Avatar({ name, avatarUrl, size = 28 }: { name: string; avatarUrl?: string | null; size?: number }) {
  if (avatarUrl) return <img src={avatarUrl} alt={name} style={{ width: size, height: size }} className="rounded-full object-cover shrink-0" />;
  return (
    <div style={{ width: size, height: size }} className="rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

// ── Quote Share Modal ──────────────────────────────────────────────────────────
function QuoteShareModal({ quote, onClose }: { quote: Quote; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedFriend, setSelectedFriend] = useState<number | null>(null);
  const [note, setNote] = useState("");

  const { data: friends = [] } = useQuery<PublicUser[]>({ queryKey: ["/api/friends"] });

  const sendMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/quote-shares", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/quote-shares"] });
      qc.invalidateQueries({ queryKey: ["/api/shares/count"] });
      toast({ title: "Shared!", description: "Quote sent to your friend." });
      onClose();
    },
    onError: () => toast({ title: "Error sharing", variant: "destructive" }),
  });

  function handleSend() {
    if (!selectedFriend) return;
    sendMut.mutate({
      toUserId: selectedFriend,
      text: quote.text,
      author: quote.author ?? null,
      source: quote.source ?? null,
      category: quote.category ?? null,
      tags: quote.tags ?? null,
      quoteNotes: quote.notes ?? null,
      notes: note.trim() || null,
    });
  }

  const catColor = CATEGORY_COLORS[quote.category] ?? CATEGORY_COLORS.other;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send size={16} /> Share quote
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          {/* Quote preview */}
          <div className="rounded-lg border bg-secondary/30 p-4">
            <p className="text-sm italic leading-relaxed">&ldquo;{quote.text}&rdquo;</p>
            {quote.author && <p className="text-xs font-semibold mt-2">&mdash; {quote.author}</p>}
            {quote.source && <p className="text-xs text-muted-foreground">{quote.source}</p>}
            <Badge className={`mt-2 text-xs py-0 px-1.5 border-0 ${catColor}`}>{quote.category}</Badge>
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Send to a friend</p>
            {friends.length === 0 ? (
              <p className="text-sm text-muted-foreground">No friends yet. Add friends in the People section.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {friends.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setSelectedFriend(f.id)}
                    className={`flex items-center gap-3 p-2.5 rounded-lg border text-left transition-colors ${
                      selectedFriend === f.id ? "border-primary bg-primary/5" : "hover:bg-secondary"
                    }`}
                  >
                    <Avatar name={f.name} avatarUrl={f.avatarUrl} size={32} />
                    <span className="text-sm font-medium">{f.name}</span>
                    {selectedFriend === f.id && <Check size={14} className="ml-auto text-primary" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Add a note (optional)</p>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Thought of you when I read this…" rows={2} />
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSend} disabled={!selectedFriend || sendMut.isPending} className="flex-1 gap-1.5">
              <Send size={14} /> Send
            </Button>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Shared Quotes Tab ──────────────────────────────────────────────────────────
function SharedQuotesTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [view, setView] = useState<"received" | "sent">("received");

  const { data } = useQuery<{ received: QuoteShareWithUser[]; sent: QuoteShareWithUser[] }>({
    queryKey: ["/api/quote-shares"],
  });
  const received = data?.received ?? [];
  const sent = data?.sent ?? [];

  const dismissMut = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/quote-shares/${id}/dismiss`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/quote-shares"] }),
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/quote-shares/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/quote-shares"] }),
  });
  const addMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/quotes", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/quotes"] });
      toast({ title: "Added to your Quotes!" });
    },
    onError: () => toast({ title: "Error adding", variant: "destructive" }),
  });

  function handleAdd(share: QuoteShareWithUser) {
    addMut.mutate({
      text: share.text,
      author: share.author ?? null,
      source: share.source ?? null,
      category: share.category ?? "other",
      tags: share.tags ?? null,
      notes: share.quoteNotes ?? null,
      isFavorite: false,
    });
  }

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setView("received")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${view === "received" ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}
        >
          <Inbox size={14} /> Received {received.length > 0 && <span className="ml-1 bg-white/20 text-xs px-1.5 py-0.5 rounded-full">{received.length}</span>}
        </button>
        <button
          onClick={() => setView("sent")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${view === "sent" ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}
        >
          <CornerUpRight size={14} /> Sent
        </button>
      </div>

      {view === "received" && (
        received.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Inbox size={40} className="mx-auto mb-3 opacity-20" />
            <p className="text-sm">No quotes shared with you yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {received.map((share) => {
              const catColor = CATEGORY_COLORS[share.category ?? "other"] ?? CATEGORY_COLORS.other;
              const tags = share.tags ? share.tags.split(",").map((t) => t.trim()).filter(Boolean) : [];
              return (
                <div key={share.id} className="rounded-xl border bg-card p-5 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <QuoteIcon size={16} className="text-muted-foreground/40 shrink-0 mt-1" />
                    <p className="flex-1 text-base italic leading-relaxed">&ldquo;{share.text}&rdquo;</p>
                    <button onClick={() => dismissMut.mutate(share.id)} className="p-1 rounded hover:bg-secondary transition-colors shrink-0">
                      <X size={13} className="text-muted-foreground" />
                    </button>
                  </div>

                  {(share.author || share.source) && (
                    <div className="pl-5">
                      {share.author && <p className="text-sm font-semibold">&mdash; {share.author}</p>}
                      {share.source && <p className="text-xs text-muted-foreground">{share.source}</p>}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-1.5 pl-5">
                    {share.category && <Badge className={`text-xs py-0 px-1.5 border-0 ${catColor}`}>{share.category}</Badge>}
                    {tags.map((t) => <Badge key={t} variant="secondary" className="text-xs py-0 px-1.5">{t}</Badge>)}
                  </div>

                  <div className="flex items-center gap-2 pl-5">
                    <Avatar name={share.fromUser.name} avatarUrl={share.fromUser.avatarUrl} size={20} />
                    <span className="text-xs text-muted-foreground">from {share.fromUser.name}</span>
                    <span className="text-xs text-muted-foreground ml-auto">{format(parseISO(share.createdAt), "MMM d")}</span>
                  </div>
                  {share.notes && <p className="text-xs italic text-muted-foreground pl-5 border-l-2 border-muted">"{share.notes}"</p>}

                  <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={() => handleAdd(share)} disabled={addMut.isPending}>
                    <Plus size={12} /> Save to my Quotes
                  </Button>
                </div>
              );
            })}
          </div>
        )
      )}

      {view === "sent" && (
        sent.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <CornerUpRight size={40} className="mx-auto mb-3 opacity-20" />
            <p className="text-sm">You haven't shared any quotes yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sent.map((share) => (
              <div key={share.id} className="rounded-xl border bg-card p-4 flex flex-col gap-2">
                <p className="text-sm italic leading-relaxed line-clamp-3">&ldquo;{share.text}&rdquo;</p>
                {share.author && <p className="text-xs font-semibold">&mdash; {share.author}</p>}
                {share.notes && <p className="text-xs text-muted-foreground italic">"{share.notes}"</p>}
                <div className="flex items-center justify-between gap-2 mt-1">
                  <div className="flex items-center gap-2">
                    <Avatar name={share.toUser.name} avatarUrl={share.toUser.avatarUrl} size={18} />
                    <span className="text-xs text-muted-foreground">to {share.toUser.name} · {format(parseISO(share.createdAt), "MMM d")}</span>
                  </div>
                  <button onClick={() => deleteMut.mutate(share.id)} className="p-1.5 rounded hover:bg-secondary transition-colors">
                    <Trash2 size={13} className="text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
