import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Quote } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Quote as QuoteIcon, Plus, Pencil, Trash2, Search, Heart, X, Upload, Download, HelpCircle,
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

// ── Quote Card ────────────────────────────────────────────────────────────────

function QuoteCard({
  quote, onEdit, onDelete, onToggleFav,
}: {
  quote: Quote;
  onEdit: () => void;
  onDelete: () => void;
  onToggleFav: () => void;
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
        <div className="flex gap-2">
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
            onClick={() => setFavOnly(!favOnly)}
          >
            <Heart size={13} className={favOnly ? "fill-current" : ""} />
            Favorites
          </Button>
          {(search || categoryFilter !== "all" || favOnly) && (
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

      {/* Quote list */}
      {filtered.length === 0 ? (
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
            />
          ))}
        </div>
      )}

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
