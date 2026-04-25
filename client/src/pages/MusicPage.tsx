import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { MusicArtistWithSongs, MusicSong } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Music2, Plus, Heart, ChevronDown, ChevronRight,
  Trash2, Pencil, Search, Music, Upload, Download, HelpCircle, Loader2, Users, Mic2,
} from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────

const ACCENT_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f97316",
  "#10b981", "#3b82f6", "#f59e0b", "#ef4444",
];

const MUSIC_GENRES = [
  "Pop", "Rock", "Hip-Hop", "R&B", "Jazz", "Classical", "Electronic",
  "Country", "Folk", "Indie", "Metal", "Punk", "Soul", "Reggae",
  "Latin", "Blues", "Funk", "Gospel", "Alternative", "Other",
];

const SONG_STATUS_LABELS: Record<string, string> = {
  want_to_listen: "Want to Listen",
  listening: "Listening",
  listened: "Listened",
};

const EMPTY_ARTIST_FORM = {
  name: "",
  genres: "",
  notes: "",
  accentColor: ACCENT_COLORS[0],
  isFavorite: false,
};

const EMPTY_SONG_FORM = {
  title: "",
  album: "",
  genre: "",
  year: "",
  status: "want_to_listen",
  isFavorite: false,
  rating: "",
  notes: "",
};

// ── Star Rating component ─────────────────────────────────────────────────────

function StarRating({
  value,
  onChange,
  readonly = false,
}: {
  value: number | null;
  onChange?: (v: number) => void;
  readonly?: boolean;
}) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={readonly}
          onClick={() => onChange?.(n)}
          className={`text-sm transition-colors ${readonly ? "cursor-default" : "cursor-pointer hover:text-yellow-400"} ${(value ?? 0) >= n ? "text-yellow-400" : "text-muted-foreground/30"}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

// ── Song row ──────────────────────────────────────────────────────────────────

function SongRow({
  song,
  onEdit,
  onDelete,
  onStatusChange,
}: {
  song: MusicSong;
  onEdit: (s: MusicSong) => void;
  onDelete: (id: number) => void;
  onStatusChange: (id: number, status: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted/40 group transition-colors">
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium truncate block">{song.title}</span>
        {song.album && <span className="text-xs text-muted-foreground truncate block">{song.album}{song.year ? ` · ${song.year}` : ""}</span>}
      </div>

      {song.genre && (
        <Badge variant="secondary" className="text-[10px] shrink-0 hidden sm:inline-flex">{song.genre.split(",")[0]}</Badge>
      )}

      <StarRating value={song.rating} readonly />

      <Select value={song.status} onValueChange={(v) => onStatusChange(song.id, v)}>
        <SelectTrigger className="h-6 w-[110px] text-[11px] shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(SONG_STATUS_LABELS).map(([k, v]) => (
            <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button onClick={() => onEdit(song)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
          <Pencil className="h-3 w-3" />
        </button>
        <button onClick={() => onDelete(song.id)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-red-500 transition-colors">
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

// ── Artist card ───────────────────────────────────────────────────────────────

function ArtistCard({
  artist,
  onEditArtist,
  onDeleteArtist,
  onToggleArtistFav,
  onAddSong,
  onEditSong,
  onDeleteSong,
  onSongStatusChange,
}: {
  artist: MusicArtistWithSongs;
  onEditArtist: (a: MusicArtistWithSongs) => void;
  onDeleteArtist: (id: number) => void;
  onToggleArtistFav: (a: MusicArtistWithSongs) => void;
  onAddSong: (artistId: number) => void;
  onEditSong: (s: MusicSong) => void;
  onDeleteSong: (id: number) => void;
  onSongStatusChange: (id: number, status: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const accent = artist.accentColor ?? "#6366f1";

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {/* Artist header */}
      <div
        className="h-1.5 w-full"
        style={{ background: accent }}
      />
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          onClick={() => setExpanded((e) => !e)}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        <div
          className="h-9 w-9 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0"
          style={{ background: accent }}
        >
          {artist.name[0].toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">{artist.name}</span>
            {artist.genres && artist.genres.split(",").map((g) => (
              <Badge key={g} variant="secondary" className="text-[10px]">{g.trim()}</Badge>
            ))}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {artist.songs.length} {artist.songs.length === 1 ? "song" : "songs"}
            {" · "}
            {artist.songs.filter((s) => s.status === "listened").length} listened
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onToggleArtistFav(artist)}
            className={`p-1.5 rounded transition-colors ${artist.isFavorite ? "text-pink-500" : "text-muted-foreground/40 hover:text-pink-400"}`}
          >
            <Heart className="h-4 w-4" fill={artist.isFavorite ? "currentColor" : "none"} />
          </button>
          <button onClick={() => onAddSong(artist.id)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Add song">
            <Plus className="h-4 w-4" />
          </button>
          <button onClick={() => onEditArtist(artist)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
            <Pencil className="h-4 w-4" />
          </button>
          <button onClick={() => onDeleteArtist(artist.id)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-red-500 transition-colors">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Songs list */}
      {expanded && (
        <div className="border-t">
          {artist.songs.length === 0 ? (
            <div className="px-4 py-3 text-xs text-muted-foreground italic flex items-center gap-2">
              <Music className="h-3.5 w-3.5" />
              No songs yet — click + to add one
            </div>
          ) : (
            <div className="py-1">
              {artist.songs.map((s) => (
                <SongRow
                  key={s.id}
                  song={s}
                  onEdit={onEditSong}
                  onDelete={onDeleteSong}
                  onStatusChange={onSongStatusChange}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Last.fm Search Modal ──────────────────────────────────────────────────────

type LfmArtist = { name: string; listeners: string; url: string };
type LfmTrack  = { name: string; artist: string; listeners: string; url: string };

function LastFmModal({ open, onClose, artists, onAdded }: {
  open: boolean;
  onClose: () => void;
  artists: MusicArtistWithSongs[];
  onAdded: () => void;
}) {
  const { toast } = useToast();
  const [type, setType] = useState<"artist" | "track">("artist");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LfmArtist[] | LfmTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => { if (!open) { setQuery(""); setResults([]); } }, [open]);

  async function doSearch() {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const r = await apiRequest("GET", `/api/lastfm/search?q=${encodeURIComponent(query)}&type=${type}`);
      setResults(await r.json());
    } catch (e: any) {
      toast({ title: "Search failed", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }

  async function addArtist(name: string) {
    setAdding(name);
    try {
      await apiRequest("POST", "/api/music/artists", {
        name, genres: null, notes: null, accentColor: ACCENT_COLORS[0], isFavorite: false,
      });
      onAdded();
      toast({ title: "Artist added", description: name });
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setAdding(null); }
  }

  async function addTrack(trackName: string, artistName: string) {
    const key = `${artistName}::${trackName}`;
    setAdding(key);
    try {
      // Find or create artist
      const existing = artists.find(a => a.name.toLowerCase() === artistName.toLowerCase());
      let artistId: number;
      if (existing) {
        artistId = existing.id;
      } else {
        const r = await apiRequest("POST", "/api/music/artists", {
          name: artistName, genres: null, notes: null, accentColor: ACCENT_COLORS[0], isFavorite: false,
        });
        const created = await r.json();
        artistId = created.id;
      }
      await apiRequest("POST", "/api/music/songs", {
        artistId, title: trackName, album: null, genre: null,
        year: null, status: "want_to_listen", isFavorite: false, rating: null, notes: null,
      });
      onAdded();
      toast({ title: "Song added", description: `${trackName} · ${artistName}` });
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setAdding(null); }
  }

  const artistResults = results as LfmArtist[];
  const trackResults  = results as LfmTrack[];

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Search size={16} /> Search Last.fm
          </DialogTitle>
        </DialogHeader>

        {/* Type toggle */}
        <div className="px-5 pb-3 shrink-0 flex gap-2">
          <button
            onClick={() => { setType("artist"); setResults([]); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${type === "artist" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            <Users size={12} /> Artists
          </button>
          <button
            onClick={() => { setType("track"); setResults([]); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${type === "track" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            <Mic2 size={12} /> Songs
          </button>
        </div>

        {/* Search bar */}
        <div className="px-5 pb-3 shrink-0 flex gap-2">
          <Input
            placeholder={type === "artist" ? "Search for an artist…" : "Search for a song…"}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === "Enter" && doSearch()}
            className="text-sm"
          />
          <Button size="sm" onClick={doSearch} disabled={loading} className="shrink-0">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          </Button>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-1.5">
          {results.length === 0 && !loading && (
            <p className="text-center text-xs text-muted-foreground pt-6">
              {query ? "No results found" : `Search Last.fm for ${type === "artist" ? "artists" : "songs"} to add to your library`}
            </p>
          )}

          {type === "artist" && artistResults.map((a, i) => {
            const alreadyAdded = artists.some(x => x.name.toLowerCase() === a.name.toLowerCase());
            const isAdding = adding === a.name;
            return (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/40 transition-colors">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Music2 size={14} className="text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{a.name}</p>
                  {a.listeners && <p className="text-xs text-muted-foreground">{Number(a.listeners).toLocaleString()} listeners</p>}
                </div>
                {alreadyAdded ? (
                  <span className="text-xs text-muted-foreground italic">Added</span>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => addArtist(a.name)} disabled={isAdding} className="shrink-0 text-xs h-7 px-2.5">
                    {isAdding ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                    {isAdding ? "" : " Add"}
                  </Button>
                )}
              </div>
            );
          })}

          {type === "track" && trackResults.map((t, i) => {
            const key = `${t.artist}::${t.name}`;
            const isAdding = adding === key;
            return (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/40 transition-colors">
                <div className="w-8 h-8 rounded-full bg-violet-500/10 flex items-center justify-center shrink-0">
                  <Music size={14} className="text-violet-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{t.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{t.artist}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => addTrack(t.name, t.artist)} disabled={isAdding} className="shrink-0 text-xs h-7 px-2.5">
                  {isAdding ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                  {isAdding ? "" : " Add"}
                </Button>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MusicPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: artists = [], isLoading } = useQuery<MusicArtistWithSongs[]>({
    queryKey: ["/api/music/artists"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/music/artists");
      return r.json();
    },
  });

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [tab, setTab] = useState("artists");
  const [search, setSearch] = useState("");
  const [genreFilter, setGenreFilter] = useState<string | null>(null);
  const [csvInfoOpen, setCsvInfoOpen] = useState(false);
  const [lastfmOpen, setLastfmOpen] = useState(false);

  // Artist modal
  const [artistModal, setArtistModal] = useState(false);
  const [editingArtist, setEditingArtist] = useState<MusicArtistWithSongs | null>(null);
  const [artistForm, setArtistForm] = useState({ ...EMPTY_ARTIST_FORM });

  // Song modal
  const [songModal, setSongModal] = useState(false);
  const [editingSong, setEditingSong] = useState<MusicSong | null>(null);
  const [songArtistId, setSongArtistId] = useState<number | null>(null);
  const [songForm, setSongForm] = useState({ ...EMPTY_SONG_FORM });

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/music/artists"] });

  const createArtist = useMutation({
    mutationFn: (d: any) => apiRequest("POST", "/api/music/artists", d),
    onSuccess: () => { invalidate(); closeArtistModal(); toast({ title: "Artist added" }); },
  });
  const updateArtist = useMutation({
    mutationFn: ({ id, d }: { id: number; d: any }) => apiRequest("PATCH", `/api/music/artists/${id}`, d),
    onSuccess: () => { invalidate(); closeArtistModal(); },
  });
  const deleteArtist = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/music/artists/${id}`),
    onSuccess: () => { invalidate(); toast({ title: "Artist removed" }); },
  });

  const createSong = useMutation({
    mutationFn: (d: any) => apiRequest("POST", "/api/music/songs", d),
    onSuccess: () => { invalidate(); closeSongModal(); toast({ title: "Song added" }); },
  });
  const updateSong = useMutation({
    mutationFn: ({ id, d }: { id: number; d: any }) => apiRequest("PATCH", `/api/music/songs/${id}`, d),
    onSuccess: () => { invalidate(); closeSongModal(); },
  });
  const deleteSong = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/music/songs/${id}`),
    onSuccess: () => { invalidate(); toast({ title: "Song removed" }); },
  });

  // ── CSV upload ────────────────────────────────────────────────────────────────
  const csvRef = useRef<HTMLInputElement>(null);

  const SONG_STATUS_MAP_CSV: Record<string, string> = {
    want_to_listen: "want_to_listen", "want to listen": "want_to_listen", want: "want_to_listen",
    listening: "listening",
    listened: "listened", done: "listened",
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
    const header = "artistName,songTitle,album,genre,year,status,rating,notes";
    const ex1 = `"Radiohead","Karma Police","OK Computer",Rock,1997,want_to_listen,,`;
    const ex2 = `"Radiohead","Creep","Pablo Honey",Rock,1992,listened,5,"Classic"`;
    const ex3 = `"Arctic Monkeys","Do I Wanna Know","AM",Indie Rock,2013,listened,5,`;
    const blob = new Blob([`${header}\n${ex1}\n${ex2}\n${ex3}`], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "music_template.csv"; a.click();
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
    // Group by artistname (headers are lowercased)
    const byArtist = new Map<string, Record<string, string>[]>();
    for (const row of rows) {
      const artistName = (row.artistname || row.artist_name || row.artist || "").trim();
      if (!artistName) continue;
      if (!byArtist.has(artistName)) byArtist.set(artistName, []);
      byArtist.get(artistName)!.push(row);
    }
    let artistsCreated = 0, songsCreated = 0, errors = 0;
    const existingMap = new Map<string, number>(artists.map(a => [a.name.toLowerCase(), a.id]));
    for (const [artistName, artistRows] of byArtist.entries()) {
      let artistId = existingMap.get(artistName.toLowerCase());
      if (!artistId) {
        try {
          const r = await apiRequest("POST", "/api/music/artists", {
            name: artistName,
            genres: artistRows[0].genres || null,
            isFavorite: false,
          });
          const data = await r.json();
          artistId = data.id;
          existingMap.set(artistName.toLowerCase(), artistId!);
          artistsCreated++;
        } catch { errors++; continue; }
      }
      for (const row of artistRows) {
        const songTitle = (row.songtitle || row.song_title || row.title || "").trim();
        if (!songTitle) continue;
        try {
          const rawStatus = row.status || "want_to_listen";
          const status = SONG_STATUS_MAP_CSV[rawStatus.toLowerCase().trim()] ?? "want_to_listen";
          await apiRequest("POST", "/api/music/songs", {
            artistId,
            title: songTitle,
            album: row.album || null,
            genre: row.genre || null,
            year: row.year ? parseInt(row.year) : null,
            status,
            isFavorite: row.isfavorite === "true" || row.isfavorite === "1",
            rating: row.rating ? Math.min(5, Math.max(1, parseInt(row.rating))) : null,
            notes: row.notes || null,
          });
          songsCreated++;
        } catch { errors++; }
      }
    }
    qc.invalidateQueries({ queryKey: ["/api/music/artists"] });
    const parts = [];
    if (artistsCreated) parts.push(`${artistsCreated} artist${artistsCreated !== 1 ? "s" : ""}`);
    if (songsCreated) parts.push(`${songsCreated} song${songsCreated !== 1 ? "s" : ""}`);
    const summary = parts.length ? parts.join(", ") : "0 items";
    if (errors === 0) toast({ title: `✓ Imported ${summary}` });
    else toast({ title: `Imported ${summary}, ${errors} errors`, variant: "destructive" });
    e.target.value = "";
  }

  // ── Modal helpers ─────────────────────────────────────────────────────────────
  function openAddArtist() {
    setEditingArtist(null);
    setArtistForm({ ...EMPTY_ARTIST_FORM });
    setArtistModal(true);
  }
  function openEditArtist(a: MusicArtistWithSongs) {
    setEditingArtist(a);
    setArtistForm({
      name: a.name,
      genres: a.genres ?? "",
      notes: a.notes ?? "",
      accentColor: a.accentColor ?? ACCENT_COLORS[0],
      isFavorite: a.isFavorite,
    });
    setArtistModal(true);
  }
  function closeArtistModal() {
    setArtistModal(false);
    setEditingArtist(null);
    setArtistForm({ ...EMPTY_ARTIST_FORM });
  }
  function submitArtist() {
    const payload = {
      name: artistForm.name.trim(),
      genres: artistForm.genres.trim() || null,
      notes: artistForm.notes.trim() || null,
      accentColor: artistForm.accentColor,
      isFavorite: artistForm.isFavorite,
    };
    if (editingArtist) {
      updateArtist.mutate({ id: editingArtist.id, d: payload });
    } else {
      createArtist.mutate(payload);
    }
  }

  function openAddSong(artistId: number) {
    setEditingSong(null);
    setSongArtistId(artistId);
    setSongForm({ ...EMPTY_SONG_FORM });
    setSongModal(true);
  }
  function openEditSong(s: MusicSong) {
    setEditingSong(s);
    setSongArtistId(s.artistId);
    setSongForm({
      title: s.title,
      album: s.album ?? "",
      genre: s.genre ?? "",
      year: s.year ? String(s.year) : "",
      status: s.status,
      isFavorite: s.isFavorite,
      rating: s.rating ? String(s.rating) : "",
      notes: s.notes ?? "",
    });
    setSongModal(true);
  }
  function closeSongModal() {
    setSongModal(false);
    setEditingSong(null);
    setSongArtistId(null);
    setSongForm({ ...EMPTY_SONG_FORM });
  }
  function submitSong() {
    if (!songArtistId) return;
    const payload = {
      artistId: songArtistId,
      title: songForm.title.trim(),
      album: songForm.album.trim() || null,
      genre: songForm.genre.trim() || null,
      year: songForm.year ? parseInt(songForm.year) : null,
      status: songForm.status,
      isFavorite: songForm.isFavorite,
      rating: songForm.rating ? parseInt(songForm.rating) : null,
      notes: songForm.notes.trim() || null,
    };
    if (editingSong) {
      updateSong.mutate({ id: editingSong.id, d: payload });
    } else {
      createSong.mutate(payload);
    }
  }

  // ── Derived data ──────────────────────────────────────────────────────────────
  const q = search.toLowerCase();

  const filteredArtists = useMemo(() => {
    return artists.filter((a) => {
      const matchSearch = !q || a.name.toLowerCase().includes(q) ||
        a.songs.some((s) => s.title.toLowerCase().includes(q) || (s.album ?? "").toLowerCase().includes(q));
      const matchGenre = !genreFilter || (a.genres ?? "").split(",").map((g) => g.trim()).includes(genreFilter);
      return matchSearch && matchGenre;
    });
  }, [artists, q, genreFilter]);

  // All songs across all artists
  const allSongs = useMemo(() => artists.flatMap((a) => a.songs.map((s) => ({ ...s, artistName: a.name }))), [artists]);

  const wantToListen = useMemo(() =>
    allSongs.filter((s) => s.status === "want_to_listen" && (!q || s.title.toLowerCase().includes(q) || s.artistName.toLowerCase().includes(q))),
    [allSongs, q]);

  const favoriteArtists = useMemo(() => artists.filter((a) => a.isFavorite), [artists]);

  const favArtistsByGenre = useMemo(() => {
    const map: Record<string, typeof favoriteArtists> = {};
    favoriteArtists.forEach((a) => {
      const genres = a.genres ? a.genres.split(",").map((g) => g.trim()) : ["Uncategorized"];
      genres.forEach((g) => {
        if (!map[g]) map[g] = [];
        map[g].push(a);
      });
    });
    return map;
  }, [favoriteArtists]);

  const allGenres = useMemo(() => {
    const set = new Set<string>();
    artists.forEach((a) => (a.genres ?? "").split(",").forEach((g) => g.trim() && set.add(g.trim())));
    return Array.from(set).sort();
  }, [artists]);

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
            <Music2 className="h-5 w-5 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Music</h1>
            <p className="text-xs text-muted-foreground">
              {artists.length} {artists.length === 1 ? "artist" : "artists"} · {allSongs.length} songs
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setLastfmOpen(true)} className="gap-1.5">
            <Search className="h-4 w-4" /> Search
          </Button>
          <Button size="sm" onClick={openAddArtist} className="gap-1.5">
            <Plus className="h-4 w-4" /> Add Artist
          </Button>
          <Button size="sm" variant="outline" onClick={() => csvRef.current?.click()} className="gap-1.5">
            <Upload className="h-4 w-4" /> Upload CSV
          </Button>
          <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
          <Button size="sm" variant="outline" onClick={downloadCsvTemplate} className="gap-1.5">
            <Download className="h-4 w-4" /> Template
          </Button>
          <Button size="sm" variant="outline" onClick={() => setCsvInfoOpen(true)} className="gap-1.5">
            <HelpCircle className="h-4 w-4" /> CSV Format
          </Button>
        </div>
      </div>

      {/* Search + Genre filter */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search artists or songs…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        {allGenres.length > 0 && (
          <Select value={genreFilter ?? "__all__"} onValueChange={(v) => setGenreFilter(v === "__all__" ? null : v)}>
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <SelectValue placeholder="All genres" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All genres</SelectItem>
              {allGenres.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4 h-8 text-xs">
          <TabsTrigger value="artists" className="text-xs">
            Artists ({filteredArtists.length})
          </TabsTrigger>
          <TabsTrigger value="want" className="text-xs">
            Want to Listen ({wantToListen.length})
          </TabsTrigger>
          <TabsTrigger value="favorites" className="text-xs">
            Favorites ({favoriteArtists.length})
          </TabsTrigger>
        </TabsList>

        {/* Artists tab */}
        <TabsContent value="artists">
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground text-sm">Loading…</div>
          ) : filteredArtists.length === 0 ? (
            <div className="text-center py-16">
              <Music2 className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                {artists.length === 0 ? "No artists yet — add one to get started" : "No artists match your search"}
              </p>
              {artists.length === 0 && (
                <Button size="sm" variant="outline" className="mt-3" onClick={openAddArtist}>
                  <Plus className="h-4 w-4 mr-1" /> Add your first artist
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredArtists.map((a) => (
                <ArtistCard
                  key={a.id}
                  artist={a}
                  onEditArtist={openEditArtist}
                  onDeleteArtist={(id) => deleteArtist.mutate(id)}
                  onToggleArtistFav={(a) => updateArtist.mutate({ id: a.id, d: { isFavorite: !a.isFavorite } })}
                  onAddSong={openAddSong}
                  onEditSong={openEditSong}
                  onDeleteSong={(id) => deleteSong.mutate(id)}
                  onSongStatusChange={(id, status) => updateSong.mutate({ id, d: { status } })}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Want to Listen tab */}
        <TabsContent value="want">
          {wantToListen.length === 0 ? (
            <div className="text-center py-16">
              <Music className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No songs in your "Want to Listen" queue</p>
            </div>
          ) : (
            <div className="space-y-1">
              {wantToListen.map((s) => (
                <div key={s.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/40 group transition-colors">
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium">{s.title}</span>
                    <span className="text-xs text-muted-foreground ml-2">{(s as any).artistName}</span>
                    {s.album && <span className="text-xs text-muted-foreground block">{s.album}</span>}
                  </div>
                  {s.genre && <Badge variant="secondary" className="text-[10px] shrink-0 hidden sm:inline-flex">{s.genre.split(",")[0]}</Badge>}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[11px] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => updateSong.mutate({ id: s.id, d: { status: "listened" } })}
                  >
                    Mark listened
                  </Button>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Favorites tab — shows favorited artists grouped by genre */}
        <TabsContent value="favorites">
          {favoriteArtists.length === 0 ? (
            <div className="text-center py-16">
              <Heart className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No favorite artists yet — heart an artist to add them here</p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(favArtistsByGenre).sort(([a], [b]) => a.localeCompare(b)).map(([genre, artistList]) => (
                <div key={genre}>
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{genre}</h3>
                    <div className="flex-1 border-t" />
                    <span className="text-xs text-muted-foreground">{artistList.length}</span>
                  </div>
                  <div className="space-y-3">
                    {artistList.map((a) => (
                      <ArtistCard
                        key={a.id}
                        artist={a}
                        onEditArtist={openEditArtist}
                        onDeleteArtist={(id) => deleteArtist.mutate(id)}
                        onToggleArtistFav={(a) => updateArtist.mutate({ id: a.id, d: { isFavorite: !a.isFavorite } })}
                        onAddSong={openAddSong}
                        onEditSong={openEditSong}
                        onDeleteSong={(id) => deleteSong.mutate(id)}
                        onSongStatusChange={(id, status) => updateSong.mutate({ id, d: { status } })}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Artist Modal ────────────────────────────────────────────────────────── */}
      <Dialog open={artistModal} onOpenChange={(o) => { if (!o) closeArtistModal(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingArtist ? "Edit Artist" : "Add Artist"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div>
              <label className="text-xs font-medium mb-1 block">Name *</label>
              <Input
                placeholder="Artist name"
                value={artistForm.name}
                onChange={(e) => setArtistForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Genres</label>
              <Input
                placeholder="e.g. Rock, Indie (comma-separated)"
                value={artistForm.genres}
                onChange={(e) => setArtistForm((f) => ({ ...f, genres: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1.5 block">Accent color</label>
              <div className="flex gap-2 flex-wrap">
                {ACCENT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setArtistForm((f) => ({ ...f, accentColor: c }))}
                    className={`h-6 w-6 rounded-full border-2 transition-all ${artistForm.accentColor === c ? "border-foreground scale-110" : "border-transparent"}`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Notes</label>
              <Textarea
                placeholder="Any notes about this artist…"
                value={artistForm.notes}
                onChange={(e) => setArtistForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                className="resize-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="artist-fav"
                checked={artistForm.isFavorite}
                onChange={(e) => setArtistForm((f) => ({ ...f, isFavorite: e.target.checked }))}
                className="accent-pink-500"
              />
              <label htmlFor="artist-fav" className="text-sm cursor-pointer">Mark as favorite</label>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={closeArtistModal}>Cancel</Button>
              <Button
                size="sm"
                onClick={submitArtist}
                disabled={!artistForm.name.trim() || createArtist.isPending || updateArtist.isPending}
              >
                {editingArtist ? "Save" : "Add Artist"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Song Modal ───────────────────────────────────────────────────────────── */}
      <Dialog open={songModal} onOpenChange={(o) => { if (!o) closeSongModal(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingSong ? "Edit Song" : "Add Song"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div>
              <label className="text-xs font-medium mb-1 block">Title *</label>
              <Input
                placeholder="Song title"
                value={songForm.title}
                onChange={(e) => setSongForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium mb-1 block">Album</label>
                <Input
                  placeholder="Album name"
                  value={songForm.album}
                  onChange={(e) => setSongForm((f) => ({ ...f, album: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Year</label>
                <Input
                  type="number"
                  placeholder="2024"
                  value={songForm.year}
                  onChange={(e) => setSongForm((f) => ({ ...f, year: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Genre</label>
              <Input
                placeholder="e.g. Rock, Indie"
                value={songForm.genre}
                onChange={(e) => setSongForm((f) => ({ ...f, genre: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Status</label>
              <Select value={songForm.status} onValueChange={(v) => setSongForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SONG_STATUS_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium mb-1.5 block">Rating</label>
              <StarRating
                value={songForm.rating ? parseInt(songForm.rating) : null}
                onChange={(v) => setSongForm((f) => ({ ...f, rating: String(v) }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Notes</label>
              <Textarea
                placeholder="Thoughts, where you heard it…"
                value={songForm.notes}
                onChange={(e) => setSongForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                className="resize-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="song-fav"
                checked={songForm.isFavorite}
                onChange={(e) => setSongForm((f) => ({ ...f, isFavorite: e.target.checked }))}
                className="accent-pink-500"
              />
              <label htmlFor="song-fav" className="text-sm cursor-pointer">Mark as favorite</label>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={closeSongModal}>Cancel</Button>
              <Button
                size="sm"
                onClick={submitSong}
                disabled={!songForm.title.trim() || createSong.isPending || updateSong.isPending}
              >
                {editingSong ? "Save" : "Add Song"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Last.fm Search Modal */}
      <LastFmModal
        open={lastfmOpen}
        onClose={() => setLastfmOpen(false)}
        artists={artists}
        onAdded={() => qc.invalidateQueries({ queryKey: ["/api/music/artists"] })}
      />

      {/* CSV Format Info Dialog */}
      <Dialog open={csvInfoOpen} onOpenChange={setCsvInfoOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><HelpCircle size={16} /> Music CSV Format</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-3">Your CSV must have a header row. Column names are case-insensitive. <span className="font-semibold text-foreground">artistName</span> and <span className="font-semibold text-foreground">songTitle</span> are required — all others are optional.</p>
          <div className="space-y-1 text-sm">
            {[
              { col: "artistName", req: true,  note: "Artist or band name" },
              { col: "songTitle",  req: true,  note: "Song title" },
              { col: "album",      req: false, note: "Album name" },
              { col: "genre",      req: false, note: "e.g. Rock · Indie · Hip-Hop · Jazz" },
              { col: "year",       req: false, note: "Release year, e.g. 1997" },
              { col: "status",     req: false, note: "want_to_listen (default) · listening · listened" },
              { col: "rating",     req: false, note: "1–5" },
              { col: "notes",      req: false, note: "Free text" },
            ].map(({ col, req, note }) => (
              <div key={col} className="flex gap-3 py-1.5 border-b last:border-0">
                <code className="text-xs font-mono bg-secondary px-1.5 py-0.5 rounded shrink-0 self-start">{col}</code>
                {req && <span className="text-xs text-red-500 font-medium shrink-0 self-start pt-0.5">required</span>}
                <span className="text-xs text-muted-foreground leading-relaxed">{note}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">Songs with the same <code className="font-mono bg-secondary px-1 rounded">artistName</code> are grouped under one artist automatically. Tip: click <strong>Template</strong> to download a pre-filled example CSV.</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
