import { useState, useMemo } from "react";
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
  Palette, Plus, Pencil, Trash2, Search, Heart, X,
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
        <Button onClick={openAdd} size="sm" className="gap-1.5">
          <Plus size={15} /> Add Artwork
        </Button>
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
    </div>
  );
}
