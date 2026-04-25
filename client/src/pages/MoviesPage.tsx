import { useState, useMemo, useRef, useEffect } from "react";
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
  Tv2, Clock, ChevronDown, ChevronUp, PlayCircle, Upload, Download, Video, ExternalLink, HelpCircle, Clapperboard,
} from "lucide-react";

const GENRES = ["Action", "Animation", "Comedy", "Crime", "Documentary", "Drama", "Fantasy", "Horror", "Musical", "Romance", "Sci-Fi", "Thriller", "Western"];
const STREAMING = ["Netflix", "HBO Max", "Disney+", "Amazon Prime", "Hulu", "Apple TV+", "Peacock", "Paramount+", "Other"];
const POSTER_COLORS = [
  "hsl(210 80% 48%)", "hsl(25 85% 52%)", "hsl(340 75% 50%)",
  "hsl(160 60% 40%)", "hsl(270 60% 50%)", "hsl(45 90% 48%)",
  "hsl(195 75% 42%)", "hsl(0 70% 48%)",
];

const TMDB_IMG_BASE = "https://image.tmdb.org/t/p/w342";

const EMPTY_FORM = {
  mediaType: "movie" as "movie" | "show" | "video",
  title: "", year: "", director: "", genres: [] as string[],
  status: "backlog", rating: 0, notes: "", listsJson: "[]",
  isFavorite: false, posterColor: POSTER_COLORS[0], streamingOn: "",
  customList: "",
  totalSeasons: "", currentSeason: "",
  videoUrl: "",
  posterUrl: "",
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
  const [mediaTypeView, setMediaTypeView] = useState<"movie" | "show" | "video">("movie");
  const [tab, setTab] = useState("backlog");
  const [search, setSearch] = useState("");
  const [genreFilter, setGenreFilter] = useState<string | null>(null);
  const [listFilter, setListFilter] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Movie | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [newListInput, setNewListInput] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [csvInfoOpen, setCsvInfoOpen] = useState(false);
  const [tmdbOpen, setTmdbOpen] = useState(false);

  const { data: allItems = [] } = useQuery<Movie[]>({ queryKey: ["/api/movies"] });

  // Split by type
  const items = useMemo(
    () => allItems.filter((m) => {
      const mt = m.mediaType ?? "movie";
      if (mediaTypeView === "video") return mt === "video";
      if (mediaTypeView === "show") return mt === "show";
      return mt === "movie";
    }),
    [allItems, mediaTypeView],
  );
  const isVideoView = mediaTypeView === "video";

  const createMut = useMutation({
    mutationFn: (d: any) => apiRequest("POST", "/api/movies", d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/movies"] }); close_modal(); },
    onError: () => toast({ title: "Error saving", variant: "destructive" }),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: number; d: any }) => apiRequest("PATCH", `/api/movies/${id}`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/movies"] }); close_modal(); },
    onError: () => toast({ title: "Error updating", variant: "destructive" }),
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
  const markStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest("PATCH", `/api/movies/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/movies"] }),
  });

  const allCustomLists = useMemo(() => {
    const set = new Set<string>();
    items.forEach((m) => {
      try { (JSON.parse(m.listsJson) as string[]).forEach((l) => set.add(l)); } catch {}
    });
    return Array.from(set).sort();
  }, [items]);

  const csvRef = useRef<HTMLInputElement>(null);

  const MEDIA_TYPE_MAP: Record<string, string> = {
    movie: "movie", film: "movie", show: "show", series: "show", "tv show": "show", video: "video",
  };
  const MOVIE_STATUS_MAP: Record<string, string> = {
    backlog: "backlog", "want to watch": "backlog", "want to see": "backlog",
    watching: "watching", "in progress": "watching",
    watched: "watched", seen: "watched", finished: "finished",
  };

  function parseCsvText(text: string): Record<string, string>[] {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];
    const headers = parseCsvLine(lines[0]).map(h => h.trim().toLowerCase());
    return lines.slice(1).map(line => {
      const cols = parseCsvLine(line);
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = (cols[i] ?? "").trim(); });
      return row;
    }).filter(row => Object.values(row).some(v => v));
  }
  function parseCsvLine(line: string): string[] {
    const result: string[] = []; let cur = ""; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
      else if (c === ',' && !inQ) { result.push(cur); cur = ""; }
      else cur += c;
    }
    result.push(cur); return result;
  }

  function downloadCsvTemplate() {
    const header = "title,mediaType,year,director,genres,status,rating,notes,streamingOn,isFavorite";
    const ex1 = `"Inception",movie,2010,"Christopher Nolan","Action,Sci-Fi",backlog,5,"Mind-bending",Netflix,false`;
    const ex2 = `"Breaking Bad",show,2008,"Vince Gilligan",Drama,watched,5,,Netflix,true`;
    const blob = new Blob([`${header}\n${ex1}\n${ex2}`], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "movies_template.csv"; a.click();
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
    const errorTitles: string[] = [];
    for (const row of rows) {
      if (!row.title?.trim()) { skipped++; continue; }
      try {
        const rawType = row.mediatype || row.media_type || row.type || "movie";
        const mediaType = MEDIA_TYPE_MAP[rawType.toLowerCase().trim()] ?? "movie";
        const rawStatus = row.status || "backlog";
        const status = MOVIE_STATUS_MAP[rawStatus.toLowerCase().trim()] ?? "backlog";
        await apiRequest("POST", "/api/movies", {
          title: row.title.trim(),
          mediaType,
          year: row.year ? parseInt(row.year) : null,
          director: row.director || null,
          genres: row.genres || null,
          status,
          rating: row.rating ? Math.min(5, Math.max(1, parseInt(row.rating))) : null,
          notes: row.notes || null,
          streamingOn: row.streamingon || row.streaming_on || row.streamingOn || null,
          isFavorite: row.isfavorite === "true" || row.isfavorite === "1" || row.isFavorite === "true",
          listsJson: "[]",
          posterColor: POSTER_COLORS[Math.floor(Math.random() * POSTER_COLORS.length)],
        });
        created++;
      } catch { errorTitles.push(row.title); }
    }
    qc.invalidateQueries({ queryKey: ["/api/movies"] });
    if (errorTitles.length === 0) {
      toast({ title: `✓ Imported ${created} title${created !== 1 ? "s" : ""}${skipped ? ` (${skipped} skipped)` : ""}` });
    } else {
      toast({ title: `Imported ${created}, failed ${errorTitles.length}`, description: `Failed: ${errorTitles.slice(0, 3).join(", ")}`, variant: "destructive" });
    }
    e.target.value = "";
  }

  function open_add() {
    setEditing(null);
    setForm({
      ...EMPTY_FORM,
      mediaType: mediaTypeView,
      status: "backlog",
      posterColor: POSTER_COLORS[Math.floor(Math.random() * POSTER_COLORS.length)],
      videoUrl: "",
    });
    setModalOpen(true);
  }
  function open_edit(m: Movie) {
    setEditing(m);
    let lists: string[] = [];
    try { lists = JSON.parse(m.listsJson); } catch {}
    setForm({
      mediaType: (m.mediaType ?? "movie") as "movie" | "show" | "video",
      title: m.title, year: m.year ? String(m.year) : "",
      director: m.director ?? "", genres: m.genres ? m.genres.split(",") : [],
      status: m.status, rating: m.rating ?? 0, notes: m.notes ?? "",
      listsJson: m.listsJson, isFavorite: m.isFavorite,
      posterColor: m.posterColor ?? POSTER_COLORS[0],
      streamingOn: m.streamingOn ?? "", customList: "",
      totalSeasons: m.totalSeasons ? String(m.totalSeasons) : "",
      currentSeason: m.currentSeason ? String(m.currentSeason) : "",
      videoUrl: (m as any).videoUrl ?? "",
      posterUrl: (m as any).posterUrl ?? "",
    });
    setModalOpen(true);
  }
  function close_modal() { setModalOpen(false); setEditing(null); setNewListInput(""); }

  function save() {
    const isShow = form.mediaType === "show";
    const isVideo = form.mediaType === "video";
    const payload: any = {
      mediaType: isVideo ? "video" : form.mediaType,
      title: form.title.trim(),
      year: form.year ? parseInt(form.year) : null,
      director: form.director.trim() || null,
      genres: isVideo ? null : (form.genres.join(",") || null),
      status: form.status,
      rating: form.rating || null,
      notes: form.notes.trim() || null,
      listsJson: isVideo ? "[]" : form.listsJson,
      isFavorite: form.isFavorite,
      posterColor: form.posterColor,
      streamingOn: form.streamingOn || null,
      totalSeasons: isShow && form.totalSeasons ? parseInt(form.totalSeasons) : null,
      currentSeason: isShow && form.currentSeason ? parseInt(form.currentSeason) : null,
      videoUrl: isVideo ? (form.videoUrl.trim() || null) : null,
      posterUrl: form.posterUrl.trim() || null,
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
    if (!lists.includes(val)) setForm((f) => ({ ...f, listsJson: JSON.stringify([...lists, val]) }));
    setNewListInput("");
  }
  function removeCustomList(name: string) {
    let lists: string[] = [];
    try { lists = JSON.parse(form.listsJson); } catch {}
    setForm((f) => ({ ...f, listsJson: JSON.stringify(lists.filter((l) => l !== name)) }));
  }

  const filtered = useMemo(() => {
    return items.filter((m) => {
      const matchSearch = !search || m.title.toLowerCase().includes(search.toLowerCase()) ||
        (m.director ?? "").toLowerCase().includes(search.toLowerCase());
      const matchGenre = !genreFilter || (m.genres ?? "").split(",").includes(genreFilter);
      const matchList = !listFilter || (() => {
        try { return (JSON.parse(m.listsJson) as string[]).includes(listFilter); } catch { return false; }
      })();
      return matchSearch && matchGenre && matchList;
    });
  }, [items, search, genreFilter, listFilter]);

  const isShowView = mediaTypeView === "show";
  const backlog = filtered.filter((m) => m.status === "backlog");
  const watching = filtered.filter((m) => m.status === "watching");
  const watched = filtered.filter((m) => m.status === "watched" || m.status === "finished");
  const favorites = filtered.filter((m) => m.isFavorite);

  const favByGenre = useMemo(() => {
    const map: Record<string, Movie[]> = {};
    favorites.forEach((m) => {
      const genres = m.genres ? m.genres.split(",") : ["Uncategorized"];
      genres.forEach((g) => { if (!map[g]) map[g] = []; map[g].push(m); });
    });
    return map;
  }, [favorites]);

  // Switch type view — reset to backlog tab
  function switchView(v: "movie" | "show" | "video") {
    setMediaTypeView(v);
    setTab("backlog");
    setSearch(""); setGenreFilter(null); setListFilter(null);
  }

  function MediaCard({ movie }: { movie: Movie }) {
    const expanded = expandedId === movie.id;
    const isShow = (movie.mediaType ?? "movie") === "show";
    const posterUrl = (movie as any).posterUrl as string | null;
    let lists: string[] = [];
    try { lists = JSON.parse(movie.listsJson); } catch {}
    return (
      <div className="rounded-xl border bg-card overflow-hidden hover:shadow-md transition-shadow">
        {posterUrl ? (
          <div className="relative h-44 bg-muted overflow-hidden">
            <img src={posterUrl} alt={movie.title} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
            <div className="absolute bottom-2 left-3 right-3 flex items-end justify-between">
              <div>
                <h3 className="font-semibold text-sm text-white leading-tight line-clamp-1">{movie.title}</h3>
                {movie.year && <span className="text-xs text-white/70">{movie.year}</span>}
              </div>
              <div className="flex items-center gap-1">
                {movie.isFavorite && <Heart size={13} className="text-rose-400 fill-rose-400" />}
              </div>
            </div>
          </div>
        ) : (
          <div className="h-1.5 w-full" style={{ background: movie.posterColor ?? "hsl(210 80% 48%)" }} />
        )}
        <div className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              {!posterUrl && (
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-sm truncate">{movie.title}</h3>
                  {movie.year && <span className="text-xs text-muted-foreground shrink-0">{movie.year}</span>}
                  {movie.isFavorite && <Heart size={13} className="text-rose-500 fill-rose-500 shrink-0" />}
                </div>
              )}
              {movie.director && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isShow ? "Created by" : "Dir."} {movie.director}
                </p>
              )}
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                {movie.streamingOn && (
                  <div className="flex items-center gap-1">
                    <Tv2 size={11} className="text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{movie.streamingOn}</span>
                  </div>
                )}
                {isShow && movie.totalSeasons && (
                  <span className="text-xs text-muted-foreground">
                    {movie.currentSeason
                      ? `S${movie.currentSeason}/${movie.totalSeasons}`
                      : `${movie.totalSeasons} season${movie.totalSeasons !== 1 ? "s" : ""}`}
                  </span>
                )}
              </div>
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

          {movie.genres && (
            <div className="flex flex-wrap gap-1 mt-2">
              {movie.genres.split(",").map((g) => (
                <Badge key={g} variant="secondary" className="text-xs py-0 px-1.5">{g}</Badge>
              ))}
            </div>
          )}

          {(movie.rating ?? 0) > 0 && (
            <div className="mt-2"><StarRating value={movie.rating ?? 0} /></div>
          )}

          {lists.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {lists.map((l) => (
                <Badge key={l} className="text-xs py-0 px-1.5 bg-primary/10 text-primary border-primary/20">{l}</Badge>
              ))}
            </div>
          )}

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

          {/* Action buttons based on status */}
          {movie.status === "backlog" && (
            <div className="mt-3 flex gap-2">
              {isShow && (
                <button onClick={() => markStatus.mutate({ id: movie.id, status: "watching" })}
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs text-muted-foreground border rounded-lg py-1.5 hover:bg-secondary transition-colors">
                  <PlayCircle size={13} /> Now watching
                </button>
              )}
              <button onClick={() => markStatus.mutate({ id: movie.id, status: isShow ? "finished" : "watched" })}
                className="flex-1 flex items-center justify-center gap-1.5 text-xs text-muted-foreground border rounded-lg py-1.5 hover:bg-secondary transition-colors">
                <Check size={13} /> {isShow ? "Mark finished" : "Mark watched"}
              </button>
            </div>
          )}
          {movie.status === "watching" && (
            <button onClick={() => markStatus.mutate({ id: movie.id, status: "finished" })}
              className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground border rounded-lg py-1.5 hover:bg-secondary transition-colors">
              <Check size={13} /> Mark finished
            </button>
          )}
        </div>
      </div>
    );
  }

  const watchedLabel = isShowView ? "Finished" : "Watched";
  const watchedCount = watched.length;
  const emptyIcon = isShowView ? <Tv2 size={40} className="mx-auto mb-3 opacity-20" /> : <Film size={40} className="mx-auto mb-3 opacity-20" />;
  const singularLabel = isShowView ? "show" : "movie";

  function VideoCard({ movie }: { movie: Movie }) {
    const vUrl = (movie as any).videoUrl as string | null | undefined;
    return (
      <div className="rounded-xl border bg-card overflow-hidden hover:shadow-md transition-shadow">
        <div className="h-1.5 w-full" style={{ background: movie.posterColor ?? "hsl(270 60% 50%)" }} />
        <div className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm">{movie.title}</h3>
              {movie.streamingOn && (
                <p className="text-xs text-muted-foreground mt-0.5">{movie.streamingOn}</p>
              )}
              {vUrl && (
                <a
                  href={vUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                >
                  <ExternalLink size={11} /> Open link
                </a>
              )}
              {movie.status === "watched" ? (
                <Badge className="mt-2 text-xs py-0 px-1.5 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 border-0">Watched</Badge>
              ) : (
                <Badge className="mt-2 text-xs py-0 px-1.5 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-0">Want to watch</Badge>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => open_edit(movie)} className="p-1.5 rounded hover:bg-secondary transition-colors">
                <Pencil size={13} className="text-muted-foreground" />
              </button>
              <button onClick={() => deleteMut.mutate(movie.id)} className="p-1.5 rounded hover:bg-secondary transition-colors">
                <Trash2 size={13} className="text-muted-foreground hover:text-destructive" />
              </button>
            </div>
          </div>
          {movie.status !== "watched" && (
            <button
              onClick={() => markStatus.mutate({ id: movie.id, status: "watched" })}
              className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground border rounded-lg py-1.5 hover:bg-secondary transition-colors"
            >
              <Check size={13} /> Mark watched
            </button>
          )}
        </div>
      </div>
    );
  }

  // Stats for header
  const movieCount = allItems.filter((m) => (m.mediaType ?? "movie") === "movie").length;
  const showCount = allItems.filter((m) => m.mediaType === "show").length;
  const videoCount = allItems.filter((m) => m.mediaType === "video").length;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Film size={22} /> Movies & Shows
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {movieCount} movie{movieCount !== 1 ? "s" : ""} · {showCount} show{showCount !== 1 ? "s" : ""} · {videoCount} video{videoCount !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          {!isVideoView && (
            <Button size="sm" variant="outline" onClick={() => setTmdbOpen(true)} className="gap-1.5">
              <Clapperboard size={13} /> Search
            </Button>
          )}
          <Button onClick={open_add} size="sm" className="gap-1.5">
            <Plus size={15} /> Add {isVideoView ? "Video" : isShowView ? "Show" : "Movie"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => csvRef.current?.click()} className="gap-1.5">
            <Upload size={13} /> Upload CSV
          </Button>
          <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
          <Button size="sm" variant="outline" onClick={downloadCsvTemplate} className="gap-1.5">
            <Download size={13} /> Template
          </Button>
          <Button size="sm" variant="outline" onClick={() => setCsvInfoOpen(true)} className="gap-1.5">
            <HelpCircle size={13} /> CSV Format
          </Button>
        </div>
      </div>

      {/* Type toggle */}
      <div className="flex gap-1 bg-muted rounded-lg p-1 w-fit mb-5">
        <button
          onClick={() => switchView("movie")}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
            mediaTypeView === "movie" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Film size={15} /> Movies
        </button>
        <button
          onClick={() => switchView("show")}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
            mediaTypeView === "show" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Tv2 size={15} /> Shows
        </button>
        <button
          onClick={() => switchView("video")}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
            mediaTypeView === "video" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Video size={15} /> Videos
        </button>
      </div>

      {/* Video view */}
      {isVideoView && (
        <div>
          <div className="flex flex-wrap gap-2 mb-4">
            <div className="relative flex-1 min-w-48">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search videos…"
                className="pl-8 h-8 text-sm" />
            </div>
            {search && (
              <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={() => setSearch("")}>
                <X size={13} /> Clear
              </Button>
            )}
          </div>
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Video size={40} className="mx-auto mb-3 opacity-20" />
              <p className="text-sm">No videos yet.</p>
              <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={open_add}><Plus size={14} /> Add Video</Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map((m) => <VideoCard key={m.id} movie={m} />)}
            </div>
          )}
        </div>
      )}

      {/* Search + filters + tabs (Movies / Shows only) */}
      {!isVideoView && <>
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search by title or ${isShowView ? "creator" : "director"}…`}
            className="pl-8 h-8 text-sm" />
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
          {isShowView && (
            <TabsTrigger value="watching" className="gap-1.5">
              <PlayCircle size={14} /> Watching <span className="ml-1 text-xs opacity-60">{watching.length}</span>
            </TabsTrigger>
          )}
          <TabsTrigger value="watched" className="gap-1.5">
            <Check size={14} /> {watchedLabel} <span className="ml-1 text-xs opacity-60">{watchedCount}</span>
          </TabsTrigger>
          <TabsTrigger value="favorites" className="gap-1.5">
            <Heart size={14} /> Favorites <span className="ml-1 text-xs opacity-60">{favorites.length}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="backlog">
          {backlog.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              {emptyIcon}
              <p className="text-sm">No {singularLabel}s in your backlog yet.</p>
              <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={open_add}><Plus size={14} /> Add one</Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {backlog.map((m) => <MediaCard key={m.id} movie={m} />)}
            </div>
          )}
        </TabsContent>

        {isShowView && (
          <TabsContent value="watching">
            {watching.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <PlayCircle size={40} className="mx-auto mb-3 opacity-20" />
                <p className="text-sm">No shows in progress. Move one from your backlog!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {watching.map((m) => <MediaCard key={m.id} movie={m} />)}
              </div>
            )}
          </TabsContent>
        )}

        <TabsContent value="watched">
          {watched.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Check size={40} className="mx-auto mb-3 opacity-20" />
              <p className="text-sm">No {isShowView ? "finished shows" : "watched movies"} yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {watched.map((m) => <MediaCard key={m.id} movie={m} />)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="favorites">
          {favorites.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Heart size={40} className="mx-auto mb-3 opacity-20" />
              <p className="text-sm">No favorites yet — heart a {singularLabel} to add it here.</p>
            </div>
          ) : (
            <div className="space-y-8">
              {Object.entries(favByGenre).sort(([a], [b]) => a.localeCompare(b)).map(([genre, ms]) => (
                <div key={genre}>
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">{genre}</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {ms.map((m) => <MediaCard key={m.id} movie={m} />)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
      </>}

      {/* Add / Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={(o) => { if (!o) close_modal(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing
                ? `Edit ${form.mediaType === "show" ? "Show" : form.mediaType === "video" ? "Video" : "Movie"}`
                : `Add ${form.mediaType === "show" ? "Show" : form.mediaType === "video" ? "Video" : "Movie"}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">

            {/* Type toggle (only when adding) */}
            {!editing && (
              <div className="flex gap-1 bg-muted rounded-lg p-1 w-fit">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, mediaType: "movie", status: "backlog", totalSeasons: "", currentSeason: "" }))}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-sm font-medium transition-all ${
                    form.mediaType === "movie" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Film size={13} /> Movie
                </button>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, mediaType: "show", status: "backlog" }))}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-sm font-medium transition-all ${
                    form.mediaType === "show" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Tv2 size={13} /> Show
                </button>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, mediaType: "video", status: "want_to_watch" }))}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-sm font-medium transition-all ${
                    form.mediaType === "video" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Video size={13} /> Video
                </button>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Title *</label>
                <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder={form.mediaType === "show" ? "Show title" : "Movie title"} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Year</label>
                <Input value={form.year} onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
                  placeholder="2024" type="number" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  {form.mediaType === "show" ? "Creator" : "Director"}
                </label>
                <Input value={form.director} onChange={(e) => setForm((f) => ({ ...f, director: e.target.value }))}
                  placeholder={form.mediaType === "show" ? "Creator name" : "Director name"} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">{form.mediaType === "video" ? "Platform" : "Streaming on"}</label>
                <Select value={form.streamingOn || "__none__"} onValueChange={(v) => setForm((f) => ({ ...f, streamingOn: v === "__none__" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {STREAMING.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Show-specific season fields */}
            {form.mediaType === "show" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Total Seasons</label>
                  <Input value={form.totalSeasons} onChange={(e) => setForm((f) => ({ ...f, totalSeasons: e.target.value }))}
                    placeholder="e.g. 5" type="number" min="1" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Current Season</label>
                  <Input value={form.currentSeason} onChange={(e) => setForm((f) => ({ ...f, currentSeason: e.target.value }))}
                    placeholder="e.g. 2" type="number" min="1" />
                </div>
              </div>
            )}

            {/* Video URL field (video only) */}
            {form.mediaType === "video" && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">URL</label>
                <Input
                  value={form.videoUrl}
                  onChange={(e) => setForm((f) => ({ ...f, videoUrl: e.target.value }))}
                  placeholder="https://…"
                />
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {form.mediaType === "video" ? (
                    <>
                      <SelectItem value="want_to_watch">Want to Watch</SelectItem>
                      <SelectItem value="watched">Watched</SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value="backlog">Backlog (want to watch)</SelectItem>
                      {form.mediaType === "show" && <SelectItem value="watching">Watching</SelectItem>}
                      <SelectItem value={form.mediaType === "show" ? "finished" : "watched"}>
                        {form.mediaType === "show" ? "Finished" : "Watched"}
                      </SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>

            {form.mediaType !== "video" && (
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
            )}

            {form.mediaType !== "video" && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">My Rating</label>
                <StarRating value={form.rating} onChange={(v) => setForm((f) => ({ ...f, rating: v }))} />
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Card color</label>
              <div className="flex gap-2 flex-wrap">
                {POSTER_COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => setForm((f) => ({ ...f, posterColor: c }))}
                    style={{ background: c }}
                    className={`w-6 h-6 rounded-full border-2 transition-all ${form.posterColor === c ? "border-foreground scale-110" : "border-transparent"}`} />
                ))}
              </div>
            </div>

            {form.mediaType !== "video" && (
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
            )}

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
                {editing ? "Save Changes" : `Add ${form.mediaType === "show" ? "Show" : form.mediaType === "video" ? "Video" : "Movie"}`}
              </Button>
              <Button variant="outline" onClick={close_modal}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* CSV Format Info Dialog */}
      <Dialog open={csvInfoOpen} onOpenChange={setCsvInfoOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><HelpCircle size={16} /> Movies &amp; Shows CSV Format</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-3">Your CSV must have a header row. Column names are case-insensitive. Only <span className="font-semibold text-foreground">title</span> is required — all others are optional.</p>
          <div className="space-y-1 text-sm">
            {[
              { col: "title",      req: true,  note: "Title of the movie or show" },
              { col: "mediaType",  req: false, note: "movie (default) · show" },
              { col: "year",       req: false, note: "e.g. 2023" },
              { col: "director",   req: false, note: "Director / creator name" },
              { col: "genres",     req: false, note: "Comma-separated, e.g. Action,Sci-Fi" },
              { col: "status",     req: false, note: "backlog (default) · watching · watched · want_to_rewatch" },
              { col: "rating",     req: false, note: "1–5" },
              { col: "notes",      req: false, note: "Free text" },
              { col: "streamingOn",req: false, note: "Netflix · HBO Max · Disney+ · Amazon Prime · Hulu · etc." },
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

      {/* TMDB Search Modal */}
      <TMDBSearchModal
        open={tmdbOpen}
        onClose={() => setTmdbOpen(false)}
        defaultType={mediaTypeView === "show" ? "tv" : "movie"}
        onAdd={(payload) => createMut.mutate(payload)}
        posterColors={POSTER_COLORS}
      />
    </div>
  );
}

// ── TMDB Search Modal ──────────────────────────────────────────────────────────
interface TMDBResult {
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  overview?: string;
  poster_path?: string | null;
  genre_ids?: number[];
  vote_average?: number;
  number_of_seasons?: number;
}

interface TMDBDetail extends TMDBResult {
  genres?: { id: number; name: string }[];
  credits?: {
    crew?: { job: string; name: string }[];
    created_by?: { name: string }[];
  };
  number_of_seasons?: number;
}

const TMDB_GENRE_MAP: Record<number, string> = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
  99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History",
  27: "Horror", 10402: "Musical", 9648: "Mystery", 10749: "Romance",
  878: "Sci-Fi", 10770: "TV Movie", 53: "Thriller", 10752: "War", 37: "Western",
  // TV
  10759: "Action", 10762: "Kids", 10763: "News", 10764: "Reality",
  10765: "Sci-Fi", 10766: "Soap", 10767: "Talk", 10768: "War",
};

function TMDBSearchModal({
  open, onClose, defaultType, onAdd, posterColors,
}: {
  open: boolean;
  onClose: () => void;
  defaultType: "movie" | "tv";
  onAdd: (payload: any) => void;
  posterColors: string[];
}) {
  const { toast } = useToast();
  const [searchType, setSearchType] = useState<"movie" | "tv">(defaultType);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TMDBResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [addedIds, setAddedIds] = useState<Set<number>>(new Set());
  const [addingId, setAddingId] = useState<number | null>(null);

  // Reset when modal opens
  useEffect(() => {
    if (open) { setQuery(""); setResults([]); setAddedIds(new Set()); }
  }, [open]);

  async function doSearch() {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await apiRequest("GET", `/api/tmdb/search?q=${encodeURIComponent(query.trim())}&type=${searchType}`);
      const data = await res.json();
      setResults(Array.isArray(data) ? data : []);
    } catch (e) {
      toast({ title: "Search failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally { setLoading(false); }
  }

  async function addItem(item: TMDBResult) {
    setAddingId(item.id);
    try {
      // Fetch full details for director/creator + genre names
      const detailRes = await apiRequest("GET", `/api/tmdb/${searchType}/${item.id}`);
      const detail: TMDBDetail = await detailRes.json();

      const isTV = searchType === "tv";
      const title = detail.title || detail.name || "";
      const year = parseInt((detail.release_date || detail.first_air_date || "").slice(0, 4)) || null;
      const genres = (detail.genres ?? []).map((g) => g.name).join(",") || null;
      const director = isTV
        ? (detail.credits?.created_by?.[0]?.name ?? null)
        : (detail.credits?.crew?.find((c) => c.job === "Director")?.name ?? null);
      const posterUrl = detail.poster_path ? `${TMDB_IMG_BASE}${detail.poster_path}` : null;

      const payload: any = {
        mediaType: isTV ? "show" : "movie",
        title,
        year,
        director,
        genres,
        status: "backlog",
        rating: null,
        notes: null,
        listsJson: "[]",
        isFavorite: false,
        posterColor: posterColors[Math.floor(Math.random() * posterColors.length)],
        streamingOn: null,
        totalSeasons: isTV ? (detail.number_of_seasons ?? null) : null,
        currentSeason: null,
        videoUrl: null,
        posterUrl,
      };

      onAdd(payload);
      setAddedIds((prev) => new Set([...prev, item.id]));
      toast({ title: `✓ Added "${title}"` });
    } catch {
      toast({ title: "Failed to add", variant: "destructive" });
    } finally { setAddingId(null); }
  }

  const imgBase = "https://image.tmdb.org/t/p/w185";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Clapperboard size={16} /> Search
          </DialogTitle>
        </DialogHeader>

        {/* Type toggle + search */}
        <div className="px-5 pb-3 space-y-3 shrink-0 border-b">
          <div className="flex gap-1 bg-muted rounded-lg p-1 w-fit">
            <button
              onClick={() => { setSearchType("movie"); setResults([]); }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-sm font-medium transition-all ${searchType === "movie" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Film size={13} /> Movies
            </button>
            <button
              onClick={() => { setSearchType("tv"); setResults([]); }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-sm font-medium transition-all ${searchType === "tv" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Tv2 size={13} /> TV Shows
            </button>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                className="w-full pl-8 pr-3 py-2 text-sm rounded-md border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder={searchType === "tv" ? "Search TV shows…" : "Search movies…"}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") doSearch(); }}
              />
            </div>
            <Button size="sm" onClick={doSearch} disabled={loading || !query.trim()}>
              {loading ? <Clock size={14} className="animate-spin" /> : "Search"}
            </Button>
          </div>
        </div>

        {/* Results */}
        <div className="overflow-y-auto flex-1 px-4 py-3">
          {loading && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-lg border bg-muted animate-pulse h-44" />
              ))}
            </div>
          )}
          {!loading && results.length === 0 && query && (
            <div className="text-center py-10 text-muted-foreground text-sm">No results found.</div>
          )}
          {!loading && results.length === 0 && !query && (
            <div className="text-center py-10 text-muted-foreground text-sm">
              <Clapperboard size={36} className="mx-auto mb-2 opacity-20" />
              Search for {searchType === "tv" ? "TV shows" : "movies"} to add them to your list.
            </div>
          )}
          {!loading && results.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {results.map((item) => {
                const title = item.title || item.name || "";
                const year = (item.release_date || item.first_air_date || "").slice(0, 4);
                const added = addedIds.has(item.id);
                const isAdding = addingId === item.id;
                const genres = (item.genre_ids ?? []).slice(0, 2).map((id) => TMDB_GENRE_MAP[id]).filter(Boolean);
                return (
                  <div key={item.id} className="rounded-lg border bg-card overflow-hidden flex flex-col">
                    {item.poster_path ? (
                      <img
                        src={`${imgBase}${item.poster_path}`}
                        alt={title}
                        className="w-full h-36 object-cover"
                      />
                    ) : (
                      <div className="w-full h-36 bg-muted flex items-center justify-center">
                        {searchType === "tv" ? <Tv2 size={28} className="opacity-20" /> : <Film size={28} className="opacity-20" />}
                      </div>
                    )}
                    <div className="p-2 flex flex-col flex-1">
                      <p className="text-xs font-semibold line-clamp-2 leading-tight">{title}</p>
                      {year && <p className="text-xs text-muted-foreground mt-0.5">{year}</p>}
                      {genres.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {genres.map((g) => (
                            <span key={g} className="text-[10px] bg-secondary text-secondary-foreground px-1 py-0.5 rounded">{g}</span>
                          ))}
                        </div>
                      )}
                      <button
                        onClick={() => !added && addItem(item)}
                        disabled={added || isAdding}
                        className={`mt-auto mt-2 w-full flex items-center justify-center gap-1 text-xs py-1.5 rounded-md border transition-colors ${
                          added
                            ? "bg-green-50 text-green-600 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800"
                            : "hover:bg-secondary"
                        }`}
                      >
                        {isAdding ? <Clock size={12} className="animate-spin" /> : added ? <><Check size={12} /> Added</> : <><Plus size={12} /> Add</>}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t shrink-0 flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
