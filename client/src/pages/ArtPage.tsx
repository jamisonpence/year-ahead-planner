import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { ArtPiece } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Palette, Plus, Pencil, Trash2, Search, Heart, X, Upload, Download, HelpCircle,
} from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────

const ACCENT_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f97316",
  "#10b981", "#3b82f6", "#f59e0b", "#ef4444",
  "#84cc16", "#06b6d4", "#f43f5e", "#a78bfa",
];

const MEDIUMS = [
  { value: "painting",    label: "Painting"    },
  { value: "sculpture",   label: "Sculpture"   },
  { value: "photography", label: "Photography" },
  { value: "digital",     label: "Digital"     },
  { value: "print",       label: "Print"       },
  { value: "drawing",     label: "Drawing"     },
  { value: "textile",     label: "Textile"     },
  { value: "other",       label: "Other"       },
];

const STATUSES = [
  { value: "want_to_see", label: "Want to See" },
  { value: "seen",        label: "Seen"        },
  { value: "own",         label: "Own"         },
];

const STATUS_COLORS: Record<string, string> = {
  want_to_see: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  seen:        "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  own:         "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
};

const FILTER_TABS = [
  { value: "all",         label: "All"         },
  { value: "want_to_see", label: "Want to See" },
  { value: "seen",        label: "Seen"        },
  { value: "own",         label: "Own"         },
  { value: "favorites",   label: "Favorites"   },
];

const EMPTY_FORM = {
  title: "",
  artistName: "",
  yearCreated: "",
  medium: "other",
  movement: "",
  whereViewed: "",
  city: "",
  status: "want_to_see",
  notes: "",
  isFavorite: false,
  accentColor: ACCENT_COLORS[0],
  imageUrl: "",
};

// ── Art Card ──────────────────────────────────────────────────────────────────

function ArtCard({
  piece, onEdit, onDelete, onToggleFav,
}: {
  piece: ArtPiece;
  onEdit: () => void;
  onDelete: () => void;
  onToggleFav: () => void;
}) {
  const accentColor = piece.accentColor ?? "#6366f1";
  const mediumLabel = MEDIUMS.find((m) => m.value === piece.medium)?.label ?? piece.medium;
  const statusLabel = STATUSES.find((s) => s.value === piece.status)?.label ?? piece.status;
  const statusColor = STATUS_COLORS[piece.status] ?? STATUS_COLORS.want_to_see;

  return (
    <div className="rounded-xl border bg-card overflow-hidden hover:shadow-md transition-shadow">
      <div className="h-1.5 w-full" style={{ background: accentColor }} />
      {piece.imageUrl && (
        <div className="h-36 overflow-hidden bg-muted">
          <img src={piece.imageUrl} alt={piece.title} className="w-full h-full object-cover" />
        </div>
      )}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-sm">{piece.title}</h3>
              {piece.yearCreated && (
                <span className="text-xs text-muted-foreground shrink-0">{piece.yearCreated}</span>
              )}
              {piece.isFavorite && <Heart size={12} className="text-rose-500 fill-rose-500 shrink-0" />}
            </div>
            {piece.artistName && (
              <p className="text-xs text-muted-foreground mt-0.5">{piece.artistName}</p>
            )}
            {(piece.whereViewed || piece.city) && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {[piece.whereViewed, piece.city].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={onToggleFav} className="p-1.5 rounded hover:bg-secondary transition-colors">
              <Heart size={13} className={piece.isFavorite ? "text-rose-500 fill-rose-500" : "text-muted-foreground"} />
            </button>
            <button onClick={onEdit} className="p-1.5 rounded hover:bg-secondary transition-colors">
              <Pencil size={12} className="text-muted-foreground" />
            </button>
            <button onClick={onDelete} className="p-1.5 rounded hover:bg-secondary transition-colors">
              <Trash2 size={12} className="text-muted-foreground hover:text-destructive" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          <Badge className={`text-xs py-0 px-1.5 border-0 ${statusColor}`}>{statusLabel}</Badge>
          <Badge variant="secondary" className="text-xs py-0 px-1.5">{mediumLabel}</Badge>
          {piece.movement && (
            <Badge variant="outline" className="text-xs py-0 px-1.5">{piece.movement}</Badge>
          )}
        </div>

        {piece.notes && (
          <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{piece.notes}</p>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ArtPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState("all");
  const [mediumFilter, setMediumFilter] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ArtPiece | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [csvInfoOpen, setCsvInfoOpen] = useState(false);
  const csvRef = useRef<HTMLInputElement>(null);

  const { data: allPieces = [] } = useQuery<ArtPiece[]>({
    queryKey: ["/api/art"],
    queryFn: async () => (await apiRequest("GET", "/api/art")).json(),
  });

  const createMut = useMutation({
    mutationFn: (d: any) => apiRequest("POST", "/api/art", d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/art"] }); closeModal(); },
    onError: () => toast({ title: "Error saving", variant: "destructive" }),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: number; d: any }) => apiRequest("PATCH", `/api/art/${id}`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/art"] }); closeModal(); },
    onError: () => toast({ title: "Error updating", variant: "destructive" }),
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/art/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/art"] }),
  });
  const toggleFav = useMutation({
    mutationFn: ({ id, isFavorite }: { id: number; isFavorite: boolean }) =>
      apiRequest("PATCH", `/api/art/${id}`, { isFavorite }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/art"] }),
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

  const MEDIUM_MAP: Record<string, string> = {
    painting: "painting", sculpture: "sculpture", photography: "photography",
    digital: "digital", print: "print", drawing: "drawing", textile: "textile", other: "other",
  };
  const STATUS_MAP: Record<string, string> = {
    want_to_see: "want_to_see", "want to see": "want_to_see",
    seen: "seen", viewed: "seen",
    own: "own", owned: "own",
  };

  function downloadCsvTemplate() {
    const header = "title,artistName,yearCreated,medium,movement,whereViewed,city,status,notes,isFavorite";
    const ex1 = `"Starry Night","Vincent van Gogh",1889,painting,Post-Impressionism,"Museum of Modern Art",New York,seen,"Breathtaking in person",true`;
    const ex2 = `"Girl with a Pearl Earring","Johannes Vermeer",1665,painting,Dutch Golden Age,"Mauritshuis",The Hague,want_to_see,,false`;
    const blob = new Blob([`${header}\n${ex1}\n${ex2}`], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "art_template.csv"; a.click();
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
      if (!row.title?.trim()) { skipped++; continue; }
      try {
        await apiRequest("POST", "/api/art", {
          title: row.title.trim(),
          artistName: row.artistname?.trim() || row.artist_name?.trim() || null,
          yearCreated: row.yearcreated ? parseInt(row.yearcreated) : null,
          medium: MEDIUM_MAP[row.medium?.toLowerCase().trim() ?? ""] ?? "other",
          movement: row.movement?.trim() || null,
          whereViewed: row.whereViewed?.trim() || row.whereviewed?.trim() || row.where_viewed?.trim() || null,
          city: row.city?.trim() || null,
          status: STATUS_MAP[row.status?.toLowerCase().trim() ?? ""] ?? "want_to_see",
          notes: row.notes?.trim() || null,
          isFavorite: row.isfavorite === "true" || row.isFavorite === "true",
          accentColor: ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)],
        });
        created++;
      } catch {
        errors.push(row.title?.slice(0, 30) ?? "unknown");
      }
    }
    qc.invalidateQueries({ queryKey: ["/api/art"] });
    e.target.value = "";
    const desc = [
      `${created} artwork${created !== 1 ? "s" : ""} imported`,
      skipped ? `${skipped} skipped (no title)` : "",
      errors.length ? `${errors.length} failed` : "",
    ].filter(Boolean).join(" · ");
    toast({ title: "CSV imported", description: desc });
  }

  function openAdd() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, accentColor: ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)] });
    setModalOpen(true);
  }
  function openEdit(p: ArtPiece) {
    setEditing(p);
    setForm({
      title: p.title,
      artistName: p.artistName ?? "",
      yearCreated: p.yearCreated ? String(p.yearCreated) : "",
      medium: p.medium,
      movement: p.movement ?? "",
      whereViewed: p.whereViewed ?? "",
      city: p.city ?? "",
      status: p.status,
      notes: p.notes ?? "",
      isFavorite: p.isFavorite,
      accentColor: p.accentColor ?? ACCENT_COLORS[0],
      imageUrl: p.imageUrl ?? "",
    });
    setModalOpen(true);
  }
  function closeModal() { setModalOpen(false); setEditing(null); }

  function save() {
    if (!form.title.trim()) { toast({ title: "Title is required", variant: "destructive" }); return; }
    const payload: any = {
      title: form.title.trim(),
      artistName: form.artistName.trim() || null,
      yearCreated: form.yearCreated ? parseInt(form.yearCreated) : null,
      medium: form.medium,
      movement: form.movement.trim() || null,
      whereViewed: form.whereViewed.trim() || null,
      city: form.city.trim() || null,
      status: form.status,
      notes: form.notes.trim() || null,
      isFavorite: form.isFavorite,
      accentColor: form.accentColor,
      imageUrl: form.imageUrl.trim() || null,
    };
    if (editing) updateMut.mutate({ id: editing.id, d: payload });
    else createMut.mutate(payload);
  }

  const filtered = useMemo(() => {
    let result = [...allPieces];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((p) =>
        p.title.toLowerCase().includes(q) ||
        (p.artistName ?? "").toLowerCase().includes(q) ||
        (p.movement ?? "").toLowerCase().includes(q) ||
        (p.city ?? "").toLowerCase().includes(q),
      );
    }
    if (filterTab === "favorites") {
      result = result.filter((p) => p.isFavorite);
    } else if (filterTab !== "all") {
      result = result.filter((p) => p.status === filterTab);
    }
    if (mediumFilter) {
      result = result.filter((p) => p.medium === mediumFilter);
    }
    return result;
  }, [allPieces, search, filterTab, mediumFilter]);

  const counts = useMemo(() => ({
    all:         allPieces.length,
    want_to_see: allPieces.filter((p) => p.status === "want_to_see").length,
    seen:        allPieces.filter((p) => p.status === "seen").length,
    own:         allPieces.filter((p) => p.status === "own").length,
    favorites:   allPieces.filter((p) => p.isFavorite).length,
  }), [allPieces]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Palette size={22} /> Art
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {allPieces.length} artwork{allPieces.length !== 1 ? "s" : ""}
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
            <Plus size={15} /> Add Artwork
          </Button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-muted rounded-lg p-1 w-fit mb-4 flex-wrap">
        {FILTER_TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setFilterTab(t.value)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
              filterTab === t.value ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            <span className="text-xs opacity-60 ml-0.5">
              {counts[t.value as keyof typeof counts]}
            </span>
          </button>
        ))}
      </div>

      {/* Medium pills + search */}
      <div className="flex flex-wrap gap-2 mb-5">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search artwork, artist, movement, city…"
            className="pl-8 h-8 text-sm"
          />
        </div>
        {(search || mediumFilter) && (
          <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={() => { setSearch(""); setMediumFilter(null); }}>
            <X size={13} /> Clear
          </Button>
        )}
      </div>

      {/* Medium filter pills */}
      <div className="flex flex-wrap gap-1.5 mb-5">
        <button
          onClick={() => setMediumFilter(null)}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-all border ${
            !mediumFilter ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-secondary border-transparent"
          }`}
        >
          All Media
        </button>
        {MEDIUMS.map((m) => (
          <button
            key={m.value}
            onClick={() => setMediumFilter(mediumFilter === m.value ? null : m.value)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all border ${
              mediumFilter === m.value ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-secondary border-transparent"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Art grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Palette size={48} className="mx-auto mb-4 opacity-20" />
          <p className="text-sm">{allPieces.length === 0 ? "No artworks yet. Add your first one!" : "No artworks match your filters."}</p>
          {allPieces.length === 0 && (
            <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={openAdd}>
              <Plus size={14} /> Add Artwork
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((p) => (
            <ArtCard
              key={p.id}
              piece={p}
              onEdit={() => openEdit(p)}
              onDelete={() => deleteMut.mutate(p.id)}
              onToggleFav={() => toggleFav.mutate({ id: p.id, isFavorite: !p.isFavorite })}
            />
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={(o) => { if (!o) closeModal(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Artwork" : "Add Artwork"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Title *</label>
                <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Artwork title" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Year</label>
                <Input
                  value={form.yearCreated}
                  onChange={(e) => setForm((f) => ({ ...f, yearCreated: e.target.value }))}
                  placeholder="1889"
                  type="number"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Artist Name</label>
                <Input value={form.artistName} onChange={(e) => setForm((f) => ({ ...f, artistName: e.target.value }))} placeholder="Artist name" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Movement</label>
                <Input value={form.movement} onChange={(e) => setForm((f) => ({ ...f, movement: e.target.value }))} placeholder="e.g. Impressionism" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Medium</label>
                <Select value={form.medium} onValueChange={(v) => setForm((f) => ({ ...f, medium: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MEDIUMS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Status</label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Where Viewed</label>
                <Input value={form.whereViewed} onChange={(e) => setForm((f) => ({ ...f, whereViewed: e.target.value }))} placeholder="e.g. MoMA" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">City</label>
                <Input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} placeholder="e.g. New York" />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Image URL</label>
              <Input value={form.imageUrl} onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))} placeholder="https://…" />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Notes</label>
              <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Accent Color</label>
              <div className="flex gap-2 flex-wrap">
                {ACCENT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, accentColor: c }))}
                    className={`w-7 h-7 rounded-full border-2 transition-transform ${form.accentColor === c ? "border-foreground scale-110" : "border-transparent"}`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, isFavorite: !f.isFavorite }))}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                  form.isFavorite
                    ? "bg-rose-50 border-rose-200 text-rose-600 dark:bg-rose-900/20 dark:border-rose-800 dark:text-rose-400"
                    : "bg-card hover:bg-secondary"
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
            <DialogTitle className="flex items-center gap-2"><HelpCircle size={16} /> Art CSV Format</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-3">Your CSV must have a header row. Column names are case-insensitive. Only <span className="font-semibold text-foreground">title</span> is required — all others are optional.</p>
          <div className="space-y-1 text-sm">
            {[
              { col: "title",       req: true,  note: "Title of the artwork" },
              { col: "artistName",  req: false, note: "Artist or creator name" },
              { col: "yearCreated", req: false, note: "e.g. 1889" },
              { col: "medium",      req: false, note: "painting · sculpture · photography · digital · print · drawing · textile · other" },
              { col: "movement",    req: false, note: "e.g. Impressionism, Surrealism" },
              { col: "whereViewed", req: false, note: "Museum or gallery name" },
              { col: "city",        req: false, note: "City where viewed" },
              { col: "status",      req: false, note: "want_to_see (default) · seen · own" },
              { col: "notes",       req: false, note: "Free text" },
              { col: "isFavorite",  req: false, note: "true · false" },
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
