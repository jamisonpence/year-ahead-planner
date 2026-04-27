import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { ArtPiece, ArtShareWithUser, PublicUser } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, parseISO } from "date-fns";
import {
  Palette, Plus, Pencil, Trash2, Search, Heart, X, Upload, Download, HelpCircle, Landmark, Loader2, ExternalLink,
  Send, Inbox, CornerUpRight, Check,
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
  { value: "shared",      label: "Shared"      },
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

// ── Museum Search ─────────────────────────────────────────────────────────────

type MuseumResult = {
  id: string; title: string; artistName: string | null; yearCreated: string | null;
  medium: string | null; movement: string | null; imageUrl: string | null;
  sourceUrl: string | null; museum: string; city: string;
};

type BrowseCategory = { id?: number; type?: string; label: string; emoji: string };

const MET_DEPARTMENTS: BrowseCategory[] = [
  { id: 11, label: "European Paintings",        emoji: "🖼️" },
  { id: 21, label: "Modern Art",                emoji: "🎨" },
  { id: 19, label: "Photographs",               emoji: "📷" },
  { id: 9,  label: "Drawings & Prints",         emoji: "✏️" },
  { id: 6,  label: "Asian Art",                 emoji: "🏮" },
  { id: 10, label: "Egyptian Art",              emoji: "🏺" },
  { id: 13, label: "Greek & Roman Art",         emoji: "⚱️" },
  { id: 17, label: "Medieval Art",              emoji: "⚔️" },
  { id: 14, label: "Islamic Art",               emoji: "☪️" },
  { id: 5,  label: "African, Oceanic & Americas", emoji: "🌍" },
  { id: 4,  label: "Arms & Armor",              emoji: "🛡️" },
  { id: 1,  label: "American Decorative Arts",  emoji: "🏛️" },
];

const AIC_TYPES: BrowseCategory[] = [
  { type: "Painting",               label: "Paintings",            emoji: "🖼️" },
  { type: "Drawing and Watercolor", label: "Drawings & Watercolors", emoji: "✏️" },
  { type: "Print",                  label: "Prints",               emoji: "🖨️" },
  { type: "Photograph",             label: "Photography",          emoji: "📷" },
  { type: "Sculpture",              label: "Sculpture",            emoji: "🗿" },
  { type: "Decorative Arts",        label: "Decorative Arts",      emoji: "🏺" },
  { type: "Textile",                label: "Textiles",             emoji: "🧶" },
  { type: "Architecture",           label: "Architecture",         emoji: "🏛️" },
];

function inferMedium(raw: string | null): string {
  if (!raw) return "other";
  const t = raw.toLowerCase();
  if (/oil|acrylic|tempera|gouache|watercolor|fresco|encaustic/.test(t)) return "painting";
  if (/pencil|chalk|charcoal|ink|pastel|crayon|graphite/.test(t)) return "drawing";
  if (/print|etching|lithograph|woodcut|engraving|silkscreen|screen/.test(t)) return "print";
  if (/photograph|gelatin|daguerreotype|silver print/.test(t)) return "photography";
  if (/marble|bronze|terracotta|ceramic|plaster|wood carv|stone|cast/.test(t)) return "sculpture";
  if (/cotton|silk|wool|linen|tapestry|embroid|textile|fabric|weav/.test(t)) return "textile";
  if (/digital/.test(t)) return "digital";
  return "other";
}

function MuseumSearchModal({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (prefill: Partial<typeof EMPTY_FORM>) => void;
}) {
  const [activeTab, setActiveTab] = useState<"met" | "aic">("met");
  const [draftQuery, setDraftQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<BrowseCategory | null>(null);
  const [results, setResults] = useState<MuseumResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<MuseumResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const browsing = !loading && results.length === 0 && !activeCategory;

  useEffect(() => {
    if (open) {
      setDraftQuery(""); setResults([]); setSelected(null); setActiveCategory(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Reset category + results when switching tabs
  function switchTab(tab: "met" | "aic") {
    setActiveTab(tab);
    setResults([]); setSelected(null); setActiveCategory(null); setDraftQuery("");
  }

  async function doSearch(q = draftQuery, cat = activeCategory) {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (cat?.id) params.set("departmentId", String(cat.id));
    if (cat?.type) params.set("artworkType", cat.type);
    if (!params.toString()) return;
    setLoading(true); setResults([]); setSelected(null);
    try {
      const endpoint = activeTab === "met" ? "/api/museum/met/search" : "/api/museum/aic/search";
      const res = await apiRequest("GET", `${endpoint}?${params.toString()}`);
      const data: MuseumResult[] = await res.json();
      setResults(data);
      if (data.length > 0) setSelected(data[0]);
    } catch { /* ignore */ } finally { setLoading(false); }
  }

  function handleBrowseCategory(cat: BrowseCategory) {
    setActiveCategory(cat);
    doSearch("", cat);
  }

  function clearAll() {
    setActiveCategory(null); setDraftQuery(""); setResults([]); setSelected(null);
  }

  function handleAdd(r: MuseumResult) {
    const yearStr = r.yearCreated ? String(r.yearCreated).replace(/[^0-9]/g, "").slice(0, 4) : "";
    onSelect({
      title: r.title, artistName: r.artistName ?? "",
      yearCreated: yearStr, medium: inferMedium(r.medium),
      movement: r.movement ?? "", whereViewed: r.museum,
      city: r.city, imageUrl: r.imageUrl ?? "", status: "want_to_see",
    });
    onClose();
  }

  const categories = activeTab === "met" ? MET_DEPARTMENTS : AIC_TYPES;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[88vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Landmark size={16} /> Browse Museum Collections
          </DialogTitle>
        </DialogHeader>

        {/* Museum tabs */}
        <div className="flex gap-1 bg-muted rounded-lg p-1 w-fit mx-5 mt-3 mb-1 shrink-0">
          {([["met", "The Met"], ["aic", "Art Institute of Chicago"]] as const).map(([key, label]) => (
            <button key={key} onClick={() => switchTab(key)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                activeTab === key ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* Search bar */}
        <div className="flex gap-2 px-5 py-2.5 shrink-0">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input ref={inputRef} value={draftQuery}
              onChange={(e) => setDraftQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { setActiveCategory(null); doSearch(draftQuery, null); } }}
              placeholder={activeTab === "met" ? "Search The Met collection…" : "Search Art Institute of Chicago…"}
              className="pl-8 h-8 text-sm"
            />
          </div>
          <Button size="sm" className="h-8" onClick={() => { setActiveCategory(null); doSearch(draftQuery, null); }}
            disabled={loading || !draftQuery.trim()}>
            {loading ? <Loader2 size={13} className="animate-spin" /> : "Search"}
          </Button>
          {(activeCategory || draftQuery || results.length > 0) && (
            <Button size="sm" variant="ghost" className="h-8 px-2" onClick={clearAll}>
              <X size={13} />
            </Button>
          )}
        </div>

        {/* Active category chip */}
        {activeCategory && (
          <div className="px-5 pb-2 shrink-0 flex items-center gap-2">
            <span className="text-xs bg-primary/10 text-primary border border-primary/20 px-2.5 py-1 rounded-full flex items-center gap-1.5">
              {activeCategory.emoji} {activeCategory.label}
              <button onClick={clearAll} className="ml-0.5 hover:text-primary/60"><X size={10} /></button>
            </span>
            <button onClick={() => doSearch("", activeCategory)}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
              ↻ Shuffle
            </button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 min-h-0 border-t overflow-hidden flex flex-col">
          {/* Category browse grid — shown when nothing loaded yet */}
          {browsing && (
            <div className="flex-1 overflow-y-auto p-5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Browse by {activeTab === "met" ? "Department" : "Category"}
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {categories.map((cat) => (
                  <button key={cat.label} onClick={() => handleBrowseCategory(cat)}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-xl border bg-card hover:bg-secondary hover:border-primary/30 transition-all text-center group">
                    <span className="text-2xl">{cat.emoji}</span>
                    <span className="text-xs font-medium leading-tight text-muted-foreground group-hover:text-foreground transition-colors">{cat.label}</span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-5 text-center">Or type in the search bar above to find specific works</p>
            </div>
          )}

          {/* Results + preview (two-panel) — shown when loading or results available */}
          {!browsing && (
            <div className="flex flex-1 min-h-0">
              {/* Results list */}
              <div className="w-52 shrink-0 border-r overflow-y-auto">
                {loading && (
                  <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground">
                    <Loader2 size={18} className="animate-spin" />
                    <p className="text-xs">{activeCategory ? `Loading ${activeCategory.label}…` : "Searching…"}</p>
                  </div>
                )}
                {!loading && results.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-8 px-3">No results with images found</p>
                )}
                {results.map((r) => (
                  <button key={r.id} onClick={() => setSelected(r)}
                    className={`w-full text-left p-3 border-b transition-colors flex gap-2 ${selected?.id === r.id ? "bg-secondary" : "hover:bg-secondary/50"}`}>
                    {r.imageUrl && (
                      <img src={r.imageUrl} alt={r.title} className="w-10 h-10 object-cover rounded shrink-0 bg-muted" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium line-clamp-2 leading-snug">{r.title}</p>
                      {r.artistName && <p className="text-xs text-muted-foreground truncate mt-0.5">{r.artistName}</p>}
                      {r.yearCreated && <p className="text-xs text-muted-foreground">{r.yearCreated}</p>}
                    </div>
                  </button>
                ))}
              </div>

              {/* Preview panel */}
              <div className="flex-1 overflow-y-auto p-4">
                {selected ? (
                  <div className="space-y-4">
                    {selected.imageUrl && (
                      <img src={selected.imageUrl} alt={selected.title}
                        className="w-full max-h-60 object-contain rounded-lg bg-muted" />
                    )}
                    <div>
                      <h3 className="font-semibold text-sm leading-snug">{selected.title}</h3>
                      {selected.artistName && <p className="text-sm text-muted-foreground mt-0.5">{selected.artistName}</p>}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {selected.yearCreated && (
                        <div><span className="text-muted-foreground font-medium block">Date</span>{selected.yearCreated}</div>
                      )}
                      {selected.medium && (
                        <div><span className="text-muted-foreground font-medium block">Medium</span><span className="line-clamp-2">{selected.medium}</span></div>
                      )}
                      {selected.movement && (
                        <div><span className="text-muted-foreground font-medium block">Dept. / Style</span>{selected.movement}</div>
                      )}
                      <div><span className="text-muted-foreground font-medium block">Museum</span>{selected.museum}</div>
                    </div>
                    {selected.sourceUrl && (
                      <a href={selected.sourceUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                        <ExternalLink size={11} /> View on museum website
                      </a>
                    )}
                    <Button size="sm" className="w-full" onClick={() => handleAdd(selected)}>
                      Add to My Art
                    </Button>
                  </div>
                ) : (
                  !loading && <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Select a result to preview</div>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Art Card ──────────────────────────────────────────────────────────────────

function ArtCard({
  piece, onEdit, onDelete, onToggleFav, onShare,
}: {
  piece: ArtPiece;
  onEdit: () => void;
  onDelete: () => void;
  onToggleFav: () => void;
  onShare: () => void;
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
            <button onClick={onShare} className="p-1.5 rounded hover:bg-secondary transition-colors" title="Share with friend">
              <Send size={12} className="text-muted-foreground" />
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
  const [museumOpen, setMuseumOpen] = useState(false);
  const [shareArtPiece, setShareArtPiece] = useState<ArtPiece | null>(null);
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
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => setMuseumOpen(true)} className="gap-1.5">
            <Landmark size={13} /> Search Museums
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

      {/* Art grid / Shared tab */}
      {filterTab === "shared" ? (
        <SharedArtTab />
      ) : filtered.length === 0 ? (
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
              onShare={() => setShareArtPiece(p)}
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

      {/* Art Share Modal */}
      {shareArtPiece && (
        <ArtShareModal piece={shareArtPiece} onClose={() => setShareArtPiece(null)} />
      )}

      {/* Museum Search */}
      <MuseumSearchModal
        open={museumOpen}
        onClose={() => setMuseumOpen(false)}
        onSelect={(prefill) => {
          setEditing(null);
          setForm({ ...EMPTY_FORM, accentColor: ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)], ...prefill });
          setModalOpen(true);
        }}
      />

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

// ── Avatar helper ──────────────────────────────────────────────────────────────
function Avatar({ name, avatarUrl, size = 28 }: { name: string; avatarUrl?: string | null; size?: number }) {
  if (avatarUrl) return <img src={avatarUrl} alt={name} style={{ width: size, height: size }} className="rounded-full object-cover shrink-0" />;
  return (
    <div style={{ width: size, height: size }} className="rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

// ── Art Share Modal ────────────────────────────────────────────────────────────
function ArtShareModal({ piece, onClose }: { piece: ArtPiece; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedFriend, setSelectedFriend] = useState<number | null>(null);
  const [note, setNote] = useState("");

  const { data: friends = [] } = useQuery<PublicUser[]>({ queryKey: ["/api/friends"] });

  const sendMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/art-shares", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/art-shares"] });
      toast({ title: "Shared!", description: `"${piece.title}" shared with your friend.` });
      onClose();
    },
    onError: () => toast({ title: "Error sharing", variant: "destructive" }),
  });

  function handleSend() {
    if (!selectedFriend) return;
    sendMut.mutate({
      toUserId: selectedFriend,
      title: piece.title,
      artistName: piece.artistName ?? null,
      yearCreated: piece.yearCreated ?? null,
      medium: piece.medium ?? null,
      movement: piece.movement ?? null,
      whereViewed: piece.whereViewed ?? null,
      city: piece.city ?? null,
      accentColor: piece.accentColor ?? null,
      imageUrl: piece.imageUrl ?? null,
      artNotes: piece.notes ?? null,
      notes: note.trim() || null,
    });
  }

  const accentColor = piece.accentColor ?? "#6366f1";

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send size={16} /> Share artwork
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          {/* Piece preview */}
          <div className="rounded-lg border overflow-hidden">
            <div className="h-1 w-full" style={{ background: accentColor }} />
            {piece.imageUrl && (
              <div className="h-28 overflow-hidden bg-muted">
                <img src={piece.imageUrl} alt={piece.title} className="w-full h-full object-cover" />
              </div>
            )}
            <div className="p-3">
              <p className="font-semibold text-sm">{piece.title}</p>
              {piece.artistName && <p className="text-xs text-muted-foreground">{piece.artistName}{piece.yearCreated ? `, ${piece.yearCreated}` : ""}</p>}
              {(piece.whereViewed || piece.city) && (
                <p className="text-xs text-muted-foreground">{[piece.whereViewed, piece.city].filter(Boolean).join(" · ")}</p>
              )}
            </div>
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
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Thought you'd love this…" rows={2} />
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

// ── Shared Art Tab ─────────────────────────────────────────────────────────────
function SharedArtTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [view, setView] = useState<"received" | "sent">("received");

  const { data } = useQuery<{ received: ArtShareWithUser[]; sent: ArtShareWithUser[] }>({
    queryKey: ["/api/art-shares"],
  });
  const received = data?.received ?? [];
  const sent = data?.sent ?? [];

  const dismissMut = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/art-shares/${id}/dismiss`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/art-shares"] }),
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/art-shares/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/art-shares"] }),
  });
  const addMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/art", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/art"] });
      toast({ title: "Added to your Art!" });
    },
    onError: () => toast({ title: "Error adding", variant: "destructive" }),
  });

  function handleAdd(share: ArtShareWithUser) {
    addMut.mutate({
      title: share.title,
      artistName: share.artistName ?? null,
      yearCreated: share.yearCreated ?? null,
      medium: share.medium ?? "other",
      movement: share.movement ?? null,
      whereViewed: share.whereViewed ?? null,
      city: share.city ?? null,
      accentColor: share.accentColor ?? ACCENT_COLORS[0],
      imageUrl: share.imageUrl ?? null,
      notes: share.artNotes ? `${share.artNotes} (shared by ${share.fromUser.name})` : `Shared by ${share.fromUser.name}`,
      status: "want_to_see",
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
            <p className="text-sm">No artworks shared with you yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {received.map((share) => {
              const accentColor = share.accentColor ?? "#6366f1";
              const mediumLabel = MEDIUMS.find((m) => m.value === share.medium)?.label ?? share.medium;
              return (
                <div key={share.id} className="rounded-xl border bg-card overflow-hidden">
                  <div className="h-1.5 w-full" style={{ background: accentColor }} />
                  {share.imageUrl && (
                    <div className="h-36 overflow-hidden bg-muted">
                      <img src={share.imageUrl} alt={share.title} className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm">{share.title}</h3>
                        {share.artistName && <p className="text-xs text-muted-foreground mt-0.5">{share.artistName}{share.yearCreated ? `, ${share.yearCreated}` : ""}</p>}
                        {(share.whereViewed || share.city) && (
                          <p className="text-xs text-muted-foreground mt-0.5">{[share.whereViewed, share.city].filter(Boolean).join(" · ")}</p>
                        )}
                      </div>
                      <button onClick={() => dismissMut.mutate(share.id)} className="p-1 rounded hover:bg-secondary transition-colors shrink-0">
                        <X size={13} className="text-muted-foreground" />
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {mediumLabel && <Badge variant="secondary" className="text-xs py-0 px-1.5">{mediumLabel}</Badge>}
                      {share.movement && <Badge variant="outline" className="text-xs py-0 px-1.5">{share.movement}</Badge>}
                    </div>

                    {share.artNotes && <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{share.artNotes}</p>}

                    <div className="flex items-center gap-2 mt-2">
                      <Avatar name={share.fromUser.name} avatarUrl={share.fromUser.avatarUrl} size={20} />
                      <span className="text-xs text-muted-foreground">from {share.fromUser.name}</span>
                      <span className="text-xs text-muted-foreground ml-auto">{format(parseISO(share.createdAt), "MMM d")}</span>
                    </div>
                    {share.notes && <p className="text-xs italic text-muted-foreground mt-1">"{share.notes}"</p>}

                    <Button size="sm" className="w-full gap-1.5 h-8 text-xs mt-3" onClick={() => handleAdd(share)} disabled={addMut.isPending}>
                      <Plus size={12} /> Add to my Art
                    </Button>
                  </div>
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
            <p className="text-sm">You haven't shared any artworks yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sent.map((share) => (
              <div key={share.id} className="flex items-start gap-3 p-3 rounded-lg border bg-card">
                {share.imageUrl && (
                  <img src={share.imageUrl} alt={share.title} className="w-12 h-12 rounded object-cover shrink-0" />
                )}
                {!share.imageUrl && (
                  <div className="w-12 h-12 rounded shrink-0" style={{ background: share.accentColor ?? "#6366f1" }} />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{share.title}</p>
                  {share.artistName && <p className="text-xs text-muted-foreground">{share.artistName}</p>}
                  {share.notes && <p className="text-xs text-muted-foreground italic mt-0.5">"{share.notes}"</p>}
                  <div className="flex items-center gap-2 mt-1">
                    <Avatar name={share.toUser.name} avatarUrl={share.toUser.avatarUrl} size={18} />
                    <span className="text-xs text-muted-foreground">to {share.toUser.name} · {format(parseISO(share.createdAt), "MMM d")}</span>
                  </div>
                </div>
                <button onClick={() => deleteMut.mutate(share.id)} className="p-1.5 rounded hover:bg-secondary transition-colors shrink-0">
                  <Trash2 size={13} className="text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
