import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Movie } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Film, Plus, Star, Heart, Trash2, Pencil, Search, X, Check,
  Tv2, Clock, ChevronDown, ChevronUp,
} from "lucide-react";

const GENRES = ["Action", "Animation", "Comedy", "Crime", "Documentary", "Drama", "Fantasy", "Horror", "Musical", "Romance", "Sci-Fi", "Thriller", "Western"];
const STREAMING = ["Netflix", "HBO Max", "Disney+", "Amazon Prime", "Hulu", "Apple TV+", "Peacock", "Paramount+", "Other"];
const POSTER_COLORS = [
  "hsl(210 80% 48%)", "hsl(25 85% 52%)", "hsl(340 75% 50%)",
  "hsl(160 60% 40%)", "hsl(270 60% 50%)", "hsl(45 90% 48%)",
  "hsl(195 75% 42%)", "hsl(0 70% 48%)",
];

const EMPTY_FORM = {
  title: "", year: "", director: "", genres: [] as string[],
  status: "backlog", rating: 0, notes: "", listsJson: "[]",
  isFavorite: false, posterColor: POSTER_COLORS[0], streamingOn: "",
  customList: "",
};

function StarRating({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n} type="button"
          onClick={() => onChange?.(n === value ? 0 : n)}
          onMouseEnter={() => onChange && setHover(n)}
          onMouseLeave={() => onChange && setHover(0)}
          className={`transition-colors ${(hover || value) >= n ? "text-amber-400" : "text-muted-foreground/30"}`}
        >
          <Star size={16} fill={(hover || value) >= n ? "currentColor" : "none"} />
        </button>
      ))}
    </div>
  );
}

export default function MoviesPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState("backlog");
  const [search, setSearch] = useState("");
  const [genreFilter, setGenreFilter] = useState<string | null>(null);
  const [listFilter, setListFilter] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Movie | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [newListInput, setNewListInput] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: movies = [] } = useQuery<Movie[]>({ queryKey: ["/api/movies"] });

  const createMut = useMutation({
    mutationFn: (d: any) => apiRequest("POST", "/api/movies", d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/movies"] }); close_modal(); },
    onError: () => toast({ title: "Error saving movie", variant: "destructive" }),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: number; d: any }) => apiRequest("PATCH", `/api/movies/${id}`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/movies"] }); close_modal(); },
    onError: () => toast({ title: "Error updating movie", variant: "destructive" }),
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/movies/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/movies"] }),
  });
  const toggleFav = useMutation({
    mutationFn: ({ id, isFavorite }: { id: number; isFavorite: boolean }) =>
      apiRequest("PATCH", `/api/movies/${id}`, { isFavorite }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/movies"] }),
  });
  const markWatched = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/movies/${id}`, { status: "watched" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/movies"] }),
  });

  // Collect all custom lists
  const allCustomLists = useMemo(() => {
    const set = new Set<string>();
    movies.forEach((m) => {
      try { (JSON.parse(m.listsJson) as string[]).forEach((l) => set.add(l)); } catch {}
    });
    return Array.from(set).sort();
  }, [movies]);

  function open_add() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, posterColor: POSTER_COLORS[Math.floor(Math.random() * POSTER_COLORS.length)] });
    setModalOpen(true);
  }
  function open_edit(m: Movie) {
    setEditing(m);
    let lists: string[] = [];
    try { lists = JSON.parse(m.listsJson); } catch {}
    setForm({
      title: m.title, year: m.year ? String(m.year) : "",
      director: m.director ?? "", genres: m.genres ? m.genres.split(",") : [],
      status: m.status, rating: m.rating ?? 0, notes: m.notes ?? "",
      listsJson: m.listsJson, isFavorite: m.isFavorite,
      posterColor: m.posterColor ?? POSTER_COLORS[0],
      streamingOn: m.streamingOn ?? "", customList: "",
    });
    setModalOpen(true);
  }
  function close_modal() { setModalOpen(false); setEditing(null); setNewListInput(""); }

  function save() {
    const payload = {
      title: form.title.trim(),
      year: form.year ? parseInt(form.year) : null,
      director: form.director.trim() || null,
      genres: form.genres.join(",") || null,
      status: form.status,
      rating: form.rating || null,
      notes: form.notes.trim() || null,
      listsJson: form.listsJson,
      isFavorite: form.isFavorite,
      posterColor: form.posterColor,
      streamingOn: form.streamingOn || null,
    };
    if (!payload.title) { toast({ title: "Title is required", variant: "destructive" }); return; }
    if (editing) updateMut.mutate({ id: editing.id, d: payload });
    else createMut.mutate(payload);
  }

  function toggleGenreForm(g: string) {
    setForm((f) => ({ ...f, genres: f.genres.includes(g) ? f.genres.filter((x) => x !== g) : [...f.genres, g] }));
  }
  function addCustomList() {
    const val = newListInput.trim();
    if (!val) return;
    let lists: string[] = [];
    try { lists = JSON.parse(form.listsJson); } catch {}
    if (!lists.includes(val)) {
      const updated = [...lists, val];
      setForm((f) => ({ ...f, listsJson: JSON.stringify(updated) }));
    }
    setNewListInput("");
  }
  function removeCustomList(name: string) {
    let lists: string[] = [];
    try { lists = JSON.parse(form.listsJson); } catch {}
    setForm((f) => ({ ...f, listsJson: JSON.stringify(lists.filter((l) => l !== name)) }));
  }

  // Filtering
  const filtered = useMemo(() => {
    return movies.filter((m) => {
      const matchSearch = !search || m.title.toLowerCase().includes(search.toLowerCase()) ||
        (m.director ?? "").toLowerCase().includes(search.toLowerCase());
      const matchGenre = !genreFilter || (m.genres ?? "").split(",").includes(genreFilter);
      const matchList = !listFilter || (() => {
        try { return (JSON.parse(m.listsJson) as string[]).includes(listFilter); } catch { return false; }
      })();
      return matchSearch && matchGenre && matchList;
    });
  }, [movies, search, genreFilter, listFilter]);

  const backlog = filtered.filter((m) => m.status === "backlog");
  const watched = filtered.filter((m) => m.status === "watched");
  const favorites = filtered.filter((m) => m.isFavorite);

  // Group favorites by genre
  const favByGenre = useMemo(() => {
    const map: Record<string, Movie[]> = {};
    favorites.forEach((m) => {
      const genres = m.genres ? m.genres.split(",") : ["Uncategorized"];
      genres.forEach((g) => {
        if (!map[g]) map[g] = [];
        map[g].push(m);
      });
    });
    return map;
  }, [favorites]);

  function MovieCard({ movie }: { movie: Movie }) {
    const expanded = expandedId === movie.id;
    let lists: string[] = [];
    try { lists = JSON.parse(movie.listsJson); } catch {}
    return (
      <div className="rounded-xl border bg-card overflow-hidden group hover:shadow-md transition-shadow">
        {/* Color bar */}
        <div className="h-1.5 w-full" style={{ background: movie.posterColor ?? "hsl(210 80% 48%)" }} />
        <div className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-sm truncate">{movie.title}</h3>
                {movie.year && <span className="text-xs text-muted-foreground shrink-0">{movie.year}</span>}
                {movie.isFavorite && <Heart size={13} className="text-rose-500 fill-rose-500 shrink-0" />}
              </div>
              {movie.director && <p className="text-xs text-muted-foreground mt-0.5">Dir. {movie.director}</p>}
              {movie.streamingOn && (
                <div className="flex items-center gap-1 mt-1">
                  <Tv2 size={11} className="text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{movie.streamingOn}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => toggleFav.mutate({ id: movie.id, isFavorite: !movie.isFavorite })}
                className="p-1.5 rounded hover:bg-secondary transition-colors">
                <Heart size={14} className={movie.isFavorite ? "text-rose-500 fill-rose-500" : "text-muted-foreground"} />
              </button>
              <button onClick={() => open_edit(movie)} className="p-1.5 rounded hover:bg-secondary transition-colors">
                <Pencil size={13} className="text-muted-foreground" />
              </button>
              <button onClick={() => deleteMut.mutate(movie.id)} className="p-1.5 rounded hover:bg-secondary transition-colors">
                <Trash2 size={13} className="text-muted-foreground hover:text-destructive" />
              </button>
            </div>
          </div>

          {/* Genres */}
          {movie.genres && (
            <div className="flex flex-wrap gap-1 mt-2">
              {movie.genres.split(",").map((g) => (
                <Badge key={g} variant="secondary" className="text-xs py-0 px-1.5">{g}</Badge>
              ))}
            </div>
          )}

          {/* Rating */}
          {(movie.rating ?? 0) > 0 && (
            <div className="mt-2"><StarRating value={movie.rating ?? 0} /></div>
          )}

          {/* Custom lists */}
          {lists.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {lists.map((l) => (
                <Badge key={l} className="text-xs py-0 px-1.5 bg-primary/10 text-primary border-primary/20">{l}</Badge>
              ))}
            </div>
          )}

          {/* Expand notes */}
          {movie.notes && (
            <div>
              <button onClick={() => setExpandedId(expanded ? null : movie.id)}
                className="flex items-center gap-1 text-xs text-muted-foreground mt-2 hover:text-foreground transition-colors">
                {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                {expanded ? "Hide notes" : "Notes"}
              </button>
              {expanded && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{movie.notes}</p>}
            </div>
          )}

          {/* Backlog action */}
          {movie.status === "backlog" && (
            <button onClick={() => markWatched.mutate(movie.id)}
              className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground border rounded-lg py-1.5 hover:bg-secondary transition-colors">
              <Check size={13} /> Mark as watched
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Film size={22} /> Movies</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {movies.length} total · {backlog.length} to watch · {watched.length} watched · {favorites.length} favorites
          </p>
        </div>
        <Button onClick={open_add} size="sm" className="gap-1.5"><Plus size={15} /> Add Movie</Button>
      </div>

      {/* Search + filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title or director…" className="pl-8 h-8 text-sm" />
        </div>
        <Select value={genreFilter ?? "__none__"} onValueChange={(v) => setGenreFilter(v === "__none__" ? null : v)}>
          <SelectTrigger className="w-36 h-8 text-sm"><SelectValue placeholder="Genre" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">All genres</SelectItem>
            {GENRES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
          </SelectContent>
        </Select>
        {allCustomLists.length > 0 && (
          <Select value={listFilter ?? "__none__"} onValueChange={(v) => setListFilter(v === "__none__" ? null : v)}>
            <SelectTrigger className="w-36 h-8 text-sm"><SelectValue placeholder="List" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">All lists</SelectItem>
              {allCustomLists.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {(genreFilter || listFilter || search) && (
          <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={() => { setSearch(""); setGenreFilter(null); setListFilter(null); }}>
            <X size={13} /> Clear
          </Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="backlog" className="gap-1.5">
            <Clock size={14} /> Backlog <span className="ml-1 text-xs opacity-60">{backlog.length}</span>
          </TabsTrigger>
          <TabsTrigger value="watched" className="gap-1.5">
            <Check size={14} /> Watched <span className="ml-1 text-xs opacity-60">{watched.length}</span>
          </TabsTrigger>
          <TabsTrigger value="favorites" className="gap-1.5">
            <Heart size={14} /> Favorites <span className="ml-1 text-xs opacity-60">{favorites.length}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="backlog">
          {backlog.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Film size={40} className="mx-auto mb-3 opacity-20" />
              <p className="text-sm">No movies in your backlog yet.</p>
              <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={open_add}><Plus size={14} /> Add one</Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {backlog.map((m) => <MovieCard key={m.id} movie={m} />)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="watched">
          {watched.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Check size={40} className="mx-auto mb-3 opacity-20" />
              <p className="text-sm">No watched movies yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {watched.map((m) => <MovieCard key={m.id} movie={m} />)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="favorites">
          {favorites.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Heart size={40} className="mx-auto mb-3 opacity-20" />
              <p className="text-sm">No favorites yet — heart a movie to add it here.</p>
            </div>
          ) : (
            <div className="space-y-8">
              {Object.entries(favByGenre).sort(([a], [b]) => a.localeCompare(b)).map(([genre, ms]) => (
                <div key={genre}>
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">{genre}</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {ms.map((m) => <MovieCard key={m.id} movie={m} />)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Add / Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={(o) => { if (!o) close_modal(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Movie" : "Add Movie"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Title *</label>
                <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Movie title" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Year</label>
                <Input value={form.year} onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))} placeholder="2024" type="number" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Director</label>
                <Input value={form.director} onChange={(e) => setForm((f) => ({ ...f, director: e.target.value }))} placeholder="Director name" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Streaming on</label>
                <Select value={form.streamingOn || "__none__"} onValueChange={(v) => setForm((f) => ({ ...f, streamingOn: v === "__none__" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {STREAMING.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="backlog">Backlog (want to watch)</SelectItem>
                  <SelectItem value="watched">Watched</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Genres</label>
              <div className="flex flex-wrap gap-1.5">
                {GENRES.map((g) => (
                  <button key={g} type="button" onClick={() => toggleGenreForm(g)}
                    className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${form.genres.includes(g) ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-secondary"}`}>
                    {g}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">My Rating</label>
              <StarRating value={form.rating} onChange={(v) => setForm((f) => ({ ...f, rating: v }))} />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Poster color</label>
              <div className="flex gap-2 flex-wrap">
                {POSTER_COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => setForm((f) => ({ ...f, posterColor: c }))}
                    style={{ background: c }}
                    className={`w-6 h-6 rounded-full border-2 transition-all ${form.posterColor === c ? "border-foreground scale-110" : "border-transparent"}`} />
                ))}
              </div>
            </div>

            {/* Custom lists */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Custom Lists</label>
              <div className="flex gap-2">
                <Input value={newListInput} onChange={(e) => setNewListInput(e.target.value)}
                  placeholder="e.g. Date Night, Watch with Kids"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomList(); } }} />
                <Button type="button" variant="outline" size="sm" onClick={addCustomList}>Add</Button>
              </div>
              {(() => {
                let lists: string[] = [];
                try { lists = JSON.parse(form.listsJson); } catch {}
                return lists.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {lists.map((l) => (
                      <Badge key={l} className="gap-1 bg-primary/10 text-primary border-primary/20">
                        {l}
                        <button type="button" onClick={() => removeCustomList(l)}><X size={10} /></button>
                      </Badge>
                    ))}
                  </div>
                ) : null;
              })()}
            </div>

            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setForm((f) => ({ ...f, isFavorite: !f.isFavorite }))}
                className={`flex items-center gap-1.5 text-sm transition-colors ${form.isFavorite ? "text-rose-500" : "text-muted-foreground hover:text-foreground"}`}>
                <Heart size={16} fill={form.isFavorite ? "currentColor" : "none"} />
                {form.isFavorite ? "In favorites" : "Add to favorites"}
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Notes</label>
              <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Thoughts, where you heard about it…" rows={3} />
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={save} disabled={createMut.isPending || updateMut.isPending} className="flex-1">
                {editing ? "Save Changes" : "Add Movie"}
              </Button>
              <Button variant="outline" onClick={close_modal}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
