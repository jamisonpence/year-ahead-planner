import { useState, useMemo, useRef } from "react";
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
  Trash2, Pencil, Search, Music, Upload,
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

  function parseCsvText(text: string): Record<string, string>[] {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];
    const headers = parseCsvLine(lines[0]).map(h => h.trim());
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
      if (c === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
      else if (c === ',' && !inQ) { result.push(cur); cur = ""; }
      else cur += c;
    }
    result.push(cur); return result;
  }

  async function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const rows = parseCsvText(text);
    // Group rows by artistName
    const byArtist = new Map<string, Record<string, string>[]>();
    for (const row of rows) {
      const artistName = row.artistName?.trim();
      if (!artistName) continue;
      if (!byArtist.has(artistName)) byArtist.set(artistName, []);
      byArtist.get(artistName)!.push(row);
    }
    let artistsCreated = 0, songsCreated = 0, errors = 0;
    // Build lookup of existing artists (case-insensitive)
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
        if (!row.songTitle?.trim()) continue;
        try {
          await apiRequest("POST", "/api/music/songs", {
            artistId,
            title: row.songTitle.trim(),
            album: row.album || null,
            genre: row.genre || null,
            year: row.year ? parseInt(row.year) : null,
            status: row.status || "want_to_listen",
            isFavorite: row.isFavorite === "true" || row.isFavorite === "1",
            rating: row.rating ? parseInt(row.rating) : null,
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
    toast({ title: `Imported ${parts.join(", ")}${errors ? `, ${errors} errors` : ""}` });
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
          <Button size="sm" variant="outline" onClick={() => csvRef.current?.click()} className="gap-1.5">
            <Upload className="h-4 w-4" /> Upload CSV
          </Button>
          <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
          <Button size="sm" onClick={openAddArtist} className="gap-1.5">
            <Plus className="h-4 w-4" /> Add Artist
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
    </div>
  );
}
