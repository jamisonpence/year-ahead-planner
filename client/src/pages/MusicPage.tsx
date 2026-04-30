import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { format, parseISO } from "date-fns";
import type { MusicArtistWithSongs, MusicSong, MusicRecommendationWithUser, PublicUser } from "@shared/schema";
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
  Send, Check, X, Inbox, CornerUpRight, Radio, ListMusic, ChevronUp, Share2,
} from "lucide-react";
import type { MusicCollectionWithItems, MusicCollectionItemWithData } from "@shared/schema";

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
  artistName,
  onEdit,
  onDelete,
  onStatusChange,
  onRecommend,
  onOpenYouTube,
}: {
  song: MusicSong;
  artistName?: string;
  onEdit: (s: MusicSong) => void;
  onDelete: (id: number) => void;
  onStatusChange: (id: number, status: string) => void;
  onRecommend?: (songTitle: string, artistName: string) => void;
  onOpenYouTube?: (query: string) => void;
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
        {onOpenYouTube && artistName && (
          <button onClick={() => onOpenYouTube(`${artistName} ${song.title}`)} className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-muted-foreground hover:text-red-500 transition-colors" title="Find on YouTube">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"/></svg>
          </button>
        )}
        {onRecommend && artistName && (
          <button onClick={() => onRecommend(song.title, artistName)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-primary transition-colors" title="Recommend to friend">
            <Send className="h-3 w-3" />
          </button>
        )}
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

// ── Add Song Modal (Last.fm auto-search + manual fallback) ────────────────────

function AddSongModal({
  open,
  onClose,
  artistId,
  artistName,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  artistId: number;
  artistName: string;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"search" | "manual">("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ name: string; artist: string; listeners: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());

  // Manual form state
  const [manualForm, setManualForm] = useState({ ...EMPTY_SONG_FORM });

  // Reset and auto-search when modal opens
  useEffect(() => {
    if (open) {
      setActiveTab("search");
      setQuery(artistName);
      setResults([]);
      setAdded(new Set());
      setManualForm({ ...EMPTY_SONG_FORM });
      // auto-trigger search
      doSearch(artistName);
    }
  }, [open, artistName]);

  async function doSearch(q: string) {
    if (!q.trim()) return;
    setLoading(true);
    try {
      const r = await apiRequest("GET", `/api/lastfm/search?q=${encodeURIComponent(q)}&type=track`);
      setResults(await r.json());
    } catch {
      toast({ title: "Last.fm search failed", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function addFromSearch(trackName: string) {
    setAdding(trackName);
    try {
      await apiRequest("POST", "/api/music/songs", {
        artistId,
        title: trackName,
        album: null,
        genre: null,
        year: null,
        status: "want_to_listen",
        isFavorite: false,
        rating: null,
        notes: null,
      });
      setAdded((s) => new Set([...s, trackName]));
      onCreated();
      toast({ title: `Added "${trackName}"` });
    } catch {
      toast({ title: "Failed to add song", variant: "destructive" });
    } finally {
      setAdding(null);
    }
  }

  async function submitManual() {
    if (!manualForm.title.trim()) return;
    setAdding("manual");
    try {
      await apiRequest("POST", "/api/music/songs", {
        artistId,
        title: manualForm.title.trim(),
        album: manualForm.album.trim() || null,
        genre: manualForm.genre.trim() || null,
        year: manualForm.year ? parseInt(manualForm.year) : null,
        status: manualForm.status,
        isFavorite: manualForm.isFavorite,
        rating: manualForm.rating ? parseInt(manualForm.rating) : null,
        notes: manualForm.notes.trim() || null,
      });
      onCreated();
      toast({ title: `Added "${manualForm.title.trim()}"` });
      onClose();
    } catch {
      toast({ title: "Failed to add song", variant: "destructive" });
    } finally {
      setAdding(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-0 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Music size={15} /> Add Songs — <span className="text-muted-foreground font-normal">{artistName}</span>
          </DialogTitle>
        </DialogHeader>

        {/* Tab toggle */}
        <div className="px-5 pt-3 pb-3 shrink-0 flex gap-2 border-b">
          <button
            onClick={() => setActiveTab("search")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${activeTab === "search" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            <Search size={11} /> Search Last.fm
          </button>
          <button
            onClick={() => setActiveTab("manual")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${activeTab === "manual" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            <Pencil size={11} /> Manual
          </button>
        </div>

        {/* Search tab */}
        {activeTab === "search" && (
          <>
            <div className="px-5 py-3 shrink-0 flex gap-2">
              <Input
                placeholder="Search for a song…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && doSearch(query)}
                className="text-sm h-8"
              />
              <Button size="sm" className="h-8 shrink-0" onClick={() => doSearch(query)} disabled={loading}>
                {loading ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-1.5 min-h-0">
              {loading && (
                <div className="flex items-center justify-center py-10">
                  <Loader2 size={20} className="animate-spin text-muted-foreground" />
                </div>
              )}
              {!loading && results.length === 0 && (
                <p className="text-center text-xs text-muted-foreground pt-8">
                  {query ? "No results — try a different search" : "Type a song name and press Search"}
                </p>
              )}
              {!loading && results.map((t, i) => {
                const isAdded = added.has(t.name);
                const isAdding = adding === t.name;
                return (
                  <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg border bg-card hover:bg-muted/40 transition-colors">
                    <div className="w-8 h-8 rounded-full bg-violet-500/10 flex items-center justify-center shrink-0">
                      <Music size={13} className="text-violet-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{t.name}</p>
                      {t.listeners && (
                        <p className="text-xs text-muted-foreground">{Number(t.listeners).toLocaleString()} listeners</p>
                      )}
                    </div>
                    {isAdded ? (
                      <span className="flex items-center gap-1 text-xs text-green-600 font-medium shrink-0">
                        <Check size={12} /> Added
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => addFromSearch(t.name)}
                        disabled={isAdding}
                        className="h-7 text-xs px-2.5 shrink-0"
                      >
                        {isAdding ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                        {isAdding ? "" : " Add"}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Manual tab */}
        {activeTab === "manual" && (
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 min-h-0">
            <div>
              <label className="text-xs font-medium mb-1 block">Title *</label>
              <Input
                placeholder="Song title"
                value={manualForm.title}
                onChange={(e) => setManualForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium mb-1 block">Album</label>
                <Input
                  placeholder="Album name"
                  value={manualForm.album}
                  onChange={(e) => setManualForm((f) => ({ ...f, album: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Year</label>
                <Input
                  type="number"
                  placeholder="2024"
                  value={manualForm.year}
                  onChange={(e) => setManualForm((f) => ({ ...f, year: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Genre</label>
              <Input
                placeholder="e.g. Pop, Rock"
                value={manualForm.genre}
                onChange={(e) => setManualForm((f) => ({ ...f, genre: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Status</label>
              <Select value={manualForm.status} onValueChange={(v) => setManualForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger className="h-8 text-sm">
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
                value={manualForm.rating ? parseInt(manualForm.rating) : null}
                onChange={(v) => setManualForm((f) => ({ ...f, rating: String(v) }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Notes</label>
              <Textarea
                placeholder="Thoughts, where you heard it…"
                value={manualForm.notes}
                onChange={(e) => setManualForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                className="resize-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="add-song-fav"
                checked={manualForm.isFavorite}
                onChange={(e) => setManualForm((f) => ({ ...f, isFavorite: e.target.checked }))}
                className="accent-pink-500"
              />
              <label htmlFor="add-song-fav" className="text-sm cursor-pointer">Mark as favorite</label>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
              <Button
                size="sm"
                onClick={submitManual}
                disabled={!manualForm.title.trim() || adding === "manual"}
              >
                {adding === "manual" ? <Loader2 size={13} className="animate-spin mr-1" /> : null}
                Add Song
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
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
  onRecommendArtist,
  onRecommendSong,
  onOpenSpotify,
  onOpenYouTube,
}: {
  artist: MusicArtistWithSongs;
  onEditArtist: (a: MusicArtistWithSongs) => void;
  onDeleteArtist: (id: number) => void;
  onToggleArtistFav: (a: MusicArtistWithSongs) => void;
  onAddSong: (artistId: number, artistName: string) => void;
  onEditSong: (s: MusicSong) => void;
  onDeleteSong: (id: number) => void;
  onSongStatusChange: (id: number, status: string) => void;
  onRecommendArtist?: (artistName: string) => void;
  onRecommendSong?: (songTitle: string, artistName: string) => void;
  onOpenSpotify?: (artistName: string) => void;
  onOpenYouTube?: (query: string) => void;
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
          {onRecommendArtist && (
            <button onClick={() => onRecommendArtist(artist.name)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-primary transition-colors" title="Recommend artist to friend">
              <Send className="h-4 w-4" />
            </button>
          )}
          {onOpenSpotify && (
            <button onClick={() => onOpenSpotify(artist.name)} className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-muted-foreground hover:text-red-500 transition-colors" title="Find on YouTube">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"/></svg>
            </button>
          )}
          <button onClick={() => onAddSong(artist.id, artist.name)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Add song">
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
                  artistName={artist.name}
                  onEdit={onEditSong}
                  onDelete={onDeleteSong}
                  onStatusChange={onSongStatusChange}
                  onRecommend={onRecommendSong}
                  onOpenYouTube={onOpenYouTube}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Avatar helper ─────────────────────────────────────────────────────────────
function Avatar({ user }: { user: { name: string; avatarUrl?: string | null } }) {
  if (user.avatarUrl) return <img src={user.avatarUrl} alt={user.name} className="w-7 h-7 rounded-full object-cover shrink-0" />;
  return (
    <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold shrink-0">
      {user.name.charAt(0).toUpperCase()}
    </div>
  );
}

// ── Music Recommend Modal ─────────────────────────────────────────────────────
function MusicRecommendModal({ open, onClose, type, artistName, songTitle }: {
  open: boolean;
  onClose: () => void;
  type: "artist" | "song";
  artistName: string;
  songTitle?: string;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedFriendId, setSelectedFriendId] = useState<number | null>(null);
  const [note, setNote] = useState("");

  const { data: friends = [] } = useQuery<PublicUser[]>({
    queryKey: ["/api/friends"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/friends"); return r.json(); },
    enabled: open,
  });

  useEffect(() => {
    if (open) { setSelectedFriendId(null); setNote(""); }
  }, [open, artistName, songTitle]);

  const sendMut = useMutation({
    mutationFn: (body: object) => apiRequest("POST", "/api/music-recommendations", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/shares/count"] });
      const label = type === "song" ? `"${songTitle}"` : `${artistName}`;
      toast({ title: `Recommended ${label}` });
      onClose();
    },
    onError: () => toast({ title: "Failed to send recommendation", variant: "destructive" }),
  });

  function handleSend() {
    if (!selectedFriendId || !artistName) return;
    sendMut.mutate({ toUserId: selectedFriendId, type, artistName, songTitle: songTitle || null, notes: note.trim() || null });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Send size={15} /> Recommend {type === "song" ? "a Song" : "an Artist"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 border">
          <div className="w-9 h-9 rounded-full bg-violet-500/15 flex items-center justify-center shrink-0">
            {type === "song" ? <Music size={16} className="text-violet-500" /> : <Music2 size={16} className="text-violet-500" />}
          </div>
          <div className="min-w-0">
            {type === "song" && <p className="text-sm font-semibold line-clamp-1">{songTitle}</p>}
            <p className={`line-clamp-1 ${type === "song" ? "text-xs text-muted-foreground" : "text-sm font-semibold"}`}>{artistName}</p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Send to</label>
            {friends.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3 border rounded-lg">
                <Users size={18} className="mx-auto mb-1 opacity-30" />
                No friends yet — connect with people in the Relationships tab
              </p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {friends.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setSelectedFriendId(f.id === selectedFriendId ? null : f.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left transition-colors ${
                      selectedFriendId === f.id ? "border-primary bg-primary/10" : "hover:bg-secondary border-border"
                    }`}
                  >
                    <Avatar user={f} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{f.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{f.email}</p>
                    </div>
                    {selectedFriendId === f.id && <Check size={14} className="text-primary shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Note (optional)</label>
            <textarea
              className="w-full text-sm border rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              rows={2}
              placeholder="Why you'd recommend it…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-1">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSend} disabled={!selectedFriendId || sendMut.isPending} className="gap-1.5">
            <Send size={13} /> Send
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Music Recommendations Tab ─────────────────────────────────────────────────
function MusicRecommendationsTab({ artists, onRecommendOpen }: {
  artists: MusicArtistWithSongs[];
  onRecommendOpen: (type: "artist" | "song", artistName: string, songTitle?: string) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: recs } = useQuery<{ received: MusicRecommendationWithUser[]; sent: MusicRecommendationWithUser[] }>({
    queryKey: ["/api/music-recommendations"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/music-recommendations"); return r.json(); },
  });

  const dismissMut = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/music-recommendations/${id}/dismiss`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/music-recommendations"] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/music-recommendations/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/music-recommendations"] }),
  });

  async function handleAddToLibrary(rec: MusicRecommendationWithUser) {
    try {
      if (rec.type === "artist") {
        const existing = artists.find((a) => a.name.toLowerCase() === rec.artistName.toLowerCase());
        if (existing) { toast({ title: `${rec.artistName} is already in your library` }); return; }
        await apiRequest("POST", "/api/music/artists", {
          name: rec.artistName, genres: null, notes: null, accentColor: ACCENT_COLORS[0], isFavorite: false,
        });
        toast({ title: `Added ${rec.artistName} to your library` });
      } else {
        const existing = artists.find((a) => a.name.toLowerCase() === rec.artistName.toLowerCase());
        let artistId: number;
        if (existing) {
          artistId = existing.id;
        } else {
          const r = await apiRequest("POST", "/api/music/artists", {
            name: rec.artistName, genres: null, notes: null, accentColor: ACCENT_COLORS[0], isFavorite: false,
          });
          const created = await r.json();
          artistId = created.id;
        }
        await apiRequest("POST", "/api/music/songs", {
          artistId, title: rec.songTitle, album: null, genre: null,
          year: null, status: "want_to_listen", isFavorite: false, rating: null, notes: null,
        });
        toast({ title: `Added "${rec.songTitle}" to your library` });
      }
      qc.invalidateQueries({ queryKey: ["/api/music/artists"] });
    } catch {
      toast({ title: "Failed to add to library", variant: "destructive" });
    }
  }

  const received = recs?.received ?? [];
  const sent = recs?.sent ?? [];

  return (
    <div className="space-y-6">
      {/* Received */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Inbox size={14} className="text-muted-foreground" />
          <h3 className="font-semibold text-sm">Recommended to You</h3>
          {received.length > 0 && (
            <span className="text-xs bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 font-medium">{received.length}</span>
          )}
        </div>
        {received.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8 border rounded-lg border-dashed">
            No recommendations yet — friends can recommend artists and songs to you
          </p>
        ) : (
          <div className="space-y-2">
            {received.map((rec) => (
              <div key={rec.id} className="flex items-center gap-3 p-3 border rounded-xl bg-card">
                <div className="w-10 h-10 rounded-full bg-violet-500/10 flex items-center justify-center shrink-0">
                  {rec.type === "song"
                    ? <Music size={16} className="text-violet-500" />
                    : <Music2 size={16} className="text-violet-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  {rec.type === "song" && <p className="text-sm font-semibold line-clamp-1">{rec.songTitle}</p>}
                  <p className={`line-clamp-1 ${rec.type === "song" ? "text-xs text-muted-foreground" : "text-sm font-semibold"}`}>{rec.artistName}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Avatar user={rec.fromUser} />
                    <span className="text-xs text-muted-foreground">from <span className="font-medium text-foreground">{rec.fromUser.name}</span></span>
                    <Badge variant="secondary" className="text-[10px] ml-1">{rec.type}</Badge>
                  </div>
                  {rec.notes && <p className="text-xs italic text-muted-foreground mt-1 line-clamp-1">"{rec.notes}"</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" className="h-7 text-xs gap-1" onClick={() => handleAddToLibrary(rec)}>
                    <Plus size={11} /> Add
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => dismissMut.mutate(rec.id)}>
                    <X size={12} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sent */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <CornerUpRight size={14} className="text-muted-foreground" />
          <h3 className="font-semibold text-sm">Sent by You</h3>
        </div>
        {sent.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8 border rounded-lg border-dashed">
            You haven't recommended any music yet — click the <Send size={11} className="inline" /> icon on an artist or song
          </p>
        ) : (
          <div className="space-y-2">
            {sent.map((rec) => (
              <div key={rec.id} className="flex items-center gap-3 p-3 border rounded-lg bg-card">
                <div className="w-8 h-8 rounded-full bg-violet-500/10 flex items-center justify-center shrink-0">
                  {rec.type === "song" ? <Music size={13} className="text-violet-500" /> : <Music2 size={13} className="text-violet-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  {rec.type === "song" && <p className="text-sm font-medium line-clamp-1">{rec.songTitle}</p>}
                  <p className={`line-clamp-1 ${rec.type === "song" ? "text-xs text-muted-foreground" : "text-sm font-medium"}`}>{rec.artistName}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-xs text-muted-foreground">to <span className="font-medium text-foreground">{rec.toUser.name}</span></span>
                    <span className="text-xs text-muted-foreground">· {format(parseISO(rec.createdAt), "MMM d")}</span>
                  </div>
                </div>
                {rec.notes && <p className="text-xs italic text-muted-foreground max-w-28 line-clamp-2 hidden sm:block">"{rec.notes}"</p>}
                <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0" onClick={() => deleteMut.mutate(rec.id)}>
                  <Trash2 size={12} />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
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

// ── YouTube Tab ───────────────────────────────────────────────────────────────

type YtVideo = { videoId: string; title: string; channel: string; thumbnail: string };

function LastFmTab({ initialArtistName, allArtists }: { initialArtistName?: string; allArtists: MusicArtistWithSongs[] }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [query, setQuery]               = useState(initialArtistName ?? "");
  const [videos, setVideos]             = useState<YtVideo[]>([]);
  const [loading, setLoading]           = useState(false);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);

  // Add-to-library state
  const [addSongForm, setAddSongForm]   = useState<{ videoTitle: string } | null>(null);
  const [songArtistInput, setSongArtistInput] = useState("");
  const [songTitleInput, setSongTitleInput]   = useState("");
  const [adding, setAdding]             = useState(false);

  useEffect(() => {
    if (initialArtistName) {
      setQuery(initialArtistName);
      doSearch(initialArtistName);
    }
  }, [initialArtistName]);

  async function addArtistToLibrary() {
    const name = query.trim();
    if (!name) return;
    if (allArtists.some(a => a.name.toLowerCase() === name.toLowerCase())) {
      toast({ title: `${name} is already in your library` }); return;
    }
    setAdding(true);
    try {
      await apiRequest("POST", "/api/music/artists", { name, genres: null, notes: null, accentColor: ACCENT_COLORS[0], isFavorite: false });
      qc.invalidateQueries({ queryKey: ["/api/music/artists"] });
      toast({ title: `Added "${name}" to your library` });
    } catch { toast({ title: "Failed to add artist", variant: "destructive" }); }
    finally { setAdding(false); }
  }

  function openAddSong(videoTitle: string) {
    // Guess artist = query, song title = first part of video title before " - " or full title
    const guessedTitle = videoTitle.replace(/\(.*?\)/g, "").replace(/\[.*?\]/g, "").replace(/official.*$/i, "").replace(/lyrics.*$/i, "").replace(/audio.*$/i, "").trim();
    setSongArtistInput(query.trim());
    setSongTitleInput(guessedTitle);
    setAddSongForm({ videoTitle });
  }

  async function submitAddSong() {
    const artistName = songArtistInput.trim();
    const songTitle  = songTitleInput.trim();
    if (!artistName || !songTitle) return;
    setAdding(true);
    try {
      const existing = allArtists.find(a => a.name.toLowerCase() === artistName.toLowerCase());
      let artistId: number;
      if (existing) {
        artistId = existing.id;
      } else {
        const r = await apiRequest("POST", "/api/music/artists", { name: artistName, genres: null, notes: null, accentColor: ACCENT_COLORS[0], isFavorite: false });
        artistId = (await r.json()).id;
      }
      await apiRequest("POST", "/api/music/songs", { artistId, title: songTitle, album: null, genre: null, year: null, status: "want_to_listen", isFavorite: false, rating: null, notes: null });
      qc.invalidateQueries({ queryKey: ["/api/music/artists"] });
      toast({ title: `Added "${songTitle}" to your library` });
      setAddSongForm(null);
    } catch { toast({ title: "Failed to add song", variant: "destructive" }); }
    finally { setAdding(false); }
  }

  async function doSearch(q: string = query) {
    if (!q.trim()) return;
    setLoading(true);
    setVideos([]);
    setActiveVideoId(null);
    setNotConfigured(false);
    try {
      const r = await fetch(`/api/youtube/search?q=${encodeURIComponent(q)}`);
      if (r.status === 503) { setNotConfigured(true); return; }
      if (!r.ok) {
        const err = await r.json().catch(() => ({})) as any;
        toast({ title: "Search failed", description: err.error || `Error ${r.status}`, variant: "destructive" });
        return;
      }
      const vids: YtVideo[] = await r.json();
      setVideos(vids);
      if (vids.length > 0) setActiveVideoId(vids[0].videoId);
    } catch {
      toast({ title: "Search failed", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="flex gap-2">
        <input
          className="flex-1 text-sm border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="Search for an artist, song, or album…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === "Enter" && doSearch()}
        />
        <button
          type="button"
          onClick={() => doSearch()}
          disabled={loading}
          className="px-3 py-2 rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground transition-colors"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
        </button>
      </div>

      {/* Add artist shortcut */}
      {query.trim() && !notConfigured && (
        <div className="flex items-center justify-between px-1">
          <span className="text-xs text-muted-foreground">
            {allArtists.some(a => a.name.toLowerCase() === query.trim().toLowerCase())
              ? <span className="text-green-600 flex items-center gap-1"><Check size={11} /> "{query.trim()}" is in your library</span>
              : `Add "${query.trim()}" as an artist?`
            }
          </span>
          {!allArtists.some(a => a.name.toLowerCase() === query.trim().toLowerCase()) && (
            <button
              type="button"
              onClick={addArtistToLibrary}
              disabled={adding}
              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary transition-colors disabled:opacity-50"
            >
              {adding ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
              Add Artist
            </button>
          )}
        </div>
      )}

      {notConfigured && (
        <div className="text-center py-8 border rounded-xl bg-card space-y-2">
          <p className="text-sm font-medium text-muted-foreground">YouTube API key not configured</p>
          <p className="text-xs text-muted-foreground">Add <code className="bg-secondary px-1 rounded">YOUTUBE_API_KEY</code> to your Railway environment variables.</p>
        </div>
      )}

      {/* Add Song inline form */}
      {addSongForm && (
        <div className="border rounded-xl bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Add to Library</p>
            <button type="button" onClick={() => setAddSongForm(null)} className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Artist</label>
              <input
                className="w-full text-sm border rounded-lg px-3 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                value={songArtistInput}
                onChange={e => setSongArtistInput(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Song Title</label>
              <input
                className="w-full text-sm border rounded-lg px-3 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                value={songTitleInput}
                onChange={e => setSongTitleInput(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAddSongForm(null)} className="text-xs px-3 py-1.5 rounded-lg border hover:bg-muted transition-colors">Cancel</button>
            <button
              type="button"
              onClick={submitAddSong}
              disabled={adding || !songArtistInput.trim() || !songTitleInput.trim()}
              className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-1"
            >
              {adding ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
              Add Song
            </button>
          </div>
        </div>
      )}

      {!notConfigured && !loading && videos.length === 0 && !query.trim() && (
        <div className="text-center py-12 text-muted-foreground">
          <svg className="w-10 h-10 mx-auto mb-3 opacity-20" viewBox="0 0 24 24" fill="currentColor"><path d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"/></svg>
          <p className="text-sm">Search for music to play it here</p>
        </div>
      )}

      {/* Player */}
      {activeVideoId && (
        <div className="rounded-xl overflow-hidden border shadow-sm" style={{ aspectRatio: "16/9" }}>
          <iframe
            key={activeVideoId}
            src={`https://www.youtube.com/embed/${activeVideoId}?autoplay=1&rel=0`}
            width="100%"
            height="100%"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            style={{ display: "block", border: "none" }}
          />
        </div>
      )}

      {/* Video list */}
      {videos.length > 0 && (
        <div className="space-y-1.5">
          {videos.map(v => (
            <div
              key={v.videoId}
              className={`flex items-center gap-3 p-2 rounded-xl border transition-colors ${activeVideoId === v.videoId ? "border-primary bg-primary/5" : "border-border"}`}
            >
              <button type="button" onClick={() => setActiveVideoId(v.videoId)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                <img src={v.thumbnail} alt={v.title} className="w-20 h-12 rounded-lg object-cover shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium line-clamp-2 leading-snug">{v.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{v.channel}</p>
                </div>
              </button>
              <div className="flex items-center gap-1 shrink-0">
                {activeVideoId === v.videoId && <Check size={14} className="text-primary" />}
                <button
                  type="button"
                  onClick={() => openAddSong(v.title)}
                  className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                  title="Add song to library"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Collections ───────────────────────────────────────────────────────────────

const COVER_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f97316",
  "#10b981", "#3b82f6", "#f59e0b", "#ef4444",
  "#14b8a6", "#84cc16", "#f43f5e", "#06b6d4",
];

const COVER_EMOJIS = ["🎵", "🎶", "🎸", "🎹", "🥁", "🎺", "🎻", "🎤", "🎧", "🎼", "🎷", "🪗", "🎙️", "🎚️", "🪘", "🪕", "⭐", "🔥", "💿", "📼", "🌙", "☀️", "🌊", "🍂"];

const EMPTY_COL_FORM = {
  name: "",
  description: "",
  coverColor: COVER_COLORS[0],
  coverEmoji: "🎵",
  sharedWithFriends: false,
};

// Collection form modal (create / edit)
function CollectionFormDialog({
  open,
  onClose,
  onSubmit,
  initial,
  isPending,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: typeof EMPTY_COL_FORM) => void;
  initial?: typeof EMPTY_COL_FORM;
  isPending?: boolean;
}) {
  const [form, setForm] = useState(initial ?? { ...EMPTY_COL_FORM });
  const isEdit = !!initial;

  // Reset form when dialog opens
  useEffect(() => {
    if (open) setForm(initial ?? { ...EMPTY_COL_FORM });
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Collection" : "New Collection"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          {/* Cover preview */}
          <div className="flex items-center gap-4">
            <div
              className="h-16 w-16 rounded-xl flex items-center justify-center text-3xl shrink-0 shadow-sm"
              style={{ background: form.coverColor }}
            >
              {form.coverEmoji}
            </div>
            <div className="flex-1 space-y-2">
              <div>
                <label className="text-xs font-medium mb-1 block">Color</label>
                <div className="flex gap-1.5 flex-wrap">
                  {COVER_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, coverColor: c }))}
                      className={`h-5 w-5 rounded-full border-2 transition-all ${form.coverColor === c ? "border-foreground scale-110" : "border-transparent"}`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Emoji</label>
                <div className="flex gap-1 flex-wrap max-h-12 overflow-y-auto">
                  {COVER_EMOJIS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, coverEmoji: e }))}
                      className={`h-7 w-7 rounded text-sm transition-all flex items-center justify-center ${form.coverEmoji === e ? "ring-2 ring-primary bg-primary/10" : "hover:bg-muted"}`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium mb-1 block">Name *</label>
            <Input
              placeholder="My collection name…"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>

          <div>
            <label className="text-xs font-medium mb-1 block">Description</label>
            <Textarea
              placeholder="What's this collection about…"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              className="resize-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="col-shared"
              checked={form.sharedWithFriends}
              onChange={(e) => setForm((f) => ({ ...f, sharedWithFriends: e.target.checked }))}
              className="accent-primary"
            />
            <label htmlFor="col-shared" className="text-sm cursor-pointer flex items-center gap-1.5">
              <Share2 size={13} className="text-muted-foreground" /> Share with friends
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button
              size="sm"
              onClick={() => onSubmit(form)}
              disabled={!form.name.trim() || isPending}
            >
              {isEdit ? "Save" : "Create"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Item picker — lets user pick a song or artist to add to a collection
function ItemPickerModal({
  open,
  onClose,
  artists,
  existingItemIds,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  artists: MusicArtistWithSongs[];
  existingItemIds: { songs: Set<number>; artists: Set<number> };
  onAdd: (itemType: string, songId?: number, artistId?: number) => void;
}) {
  const [pickType, setPickType] = useState<"song" | "artist">("song");
  const [query, setQuery] = useState("");
  const q = query.toLowerCase();

  useEffect(() => { if (!open) setQuery(""); }, [open]);

  const allSongs = useMemo(
    () => artists.flatMap((a) => a.songs.map((s) => ({ ...s, artistName: a.name }))),
    [artists]
  );

  const filteredSongs = useMemo(() =>
    allSongs.filter((s) =>
      !existingItemIds.songs.has(s.id) &&
      (!q || s.title.toLowerCase().includes(q) || s.artistName.toLowerCase().includes(q))
    ),
    [allSongs, existingItemIds, q]
  );

  const filteredArtists = useMemo(() =>
    artists.filter((a) =>
      !existingItemIds.artists.has(a.id) &&
      (!q || a.name.toLowerCase().includes(q))
    ),
    [artists, existingItemIds, q]
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 shrink-0">
          <DialogTitle className="text-base flex items-center gap-2">
            <Plus size={15} /> Add to Collection
          </DialogTitle>
        </DialogHeader>

        <div className="px-5 pb-3 shrink-0 flex gap-2">
          <button
            onClick={() => { setPickType("song"); setQuery(""); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${pickType === "song" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            <Music size={11} /> Songs
          </button>
          <button
            onClick={() => { setPickType("artist"); setQuery(""); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${pickType === "artist" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            <Music2 size={11} /> Artists
          </button>
        </div>

        <div className="px-5 pb-3 shrink-0">
          <Input
            placeholder={pickType === "song" ? "Search songs…" : "Search artists…"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="text-sm h-8"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-1">
          {pickType === "song" && (
            filteredSongs.length === 0
              ? <p className="text-xs text-muted-foreground text-center py-6">{q ? "No matching songs" : "All songs already in collection"}</p>
              : filteredSongs.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => { onAdd("song", s.id, undefined); }}
                  className="w-full flex items-center gap-3 p-2.5 rounded-lg border hover:bg-muted/60 transition-colors text-left"
                >
                  <div className="w-8 h-8 rounded-full bg-violet-500/10 flex items-center justify-center shrink-0">
                    <Music size={13} className="text-violet-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{s.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{s.artistName}</p>
                  </div>
                  <Plus size={13} className="text-muted-foreground shrink-0" />
                </button>
              ))
          )}
          {pickType === "artist" && (
            filteredArtists.length === 0
              ? <p className="text-xs text-muted-foreground text-center py-6">{q ? "No matching artists" : "All artists already in collection"}</p>
              : filteredArtists.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => { onAdd("artist", undefined, a.id); }}
                  className="w-full flex items-center gap-3 p-2.5 rounded-lg border hover:bg-muted/60 transition-colors text-left"
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                    style={{ background: a.accentColor ?? "#6366f1" }}
                  >
                    {a.name[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{a.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{a.songs.length} songs</p>
                  </div>
                  <Plus size={13} className="text-muted-foreground shrink-0" />
                </button>
              ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Single collection detail view
function CollectionDetail({
  collection,
  artists,
  onBack,
  onEdit,
  onDelete,
  onAddItem,
  onRemoveItem,
  onMoveItem,
}: {
  collection: MusicCollectionWithItems;
  artists: MusicArtistWithSongs[];
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddItem: (itemType: string, songId?: number, artistId?: number) => void;
  onRemoveItem: (itemId: number) => void;
  onMoveItem: (itemId: number, direction: "up" | "down") => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const existingItemIds = useMemo(() => ({
    songs: new Set(collection.items.filter((i) => i.itemType === "song").map((i) => i.songId!).filter(Boolean)),
    artists: new Set(collection.items.filter((i) => i.itemType === "artist").map((i) => i.artistId!).filter(Boolean)),
  }), [collection.items]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 text-sm"
        >
          <ChevronRight size={14} className="rotate-180" /> Back
        </button>
        <div className="flex-1" />
        <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)} className="gap-1.5 h-8 text-xs">
          <Plus size={13} /> Add Item
        </Button>
        <Button size="sm" variant="outline" onClick={onEdit} className="h-8 text-xs gap-1.5">
          <Pencil size={13} /> Edit
        </Button>
        <Button size="sm" variant="outline" onClick={onDelete} className="h-8 text-xs gap-1.5 text-red-500 hover:text-red-600 hover:border-red-300">
          <Trash2 size={13} /> Delete
        </Button>
      </div>

      {/* Collection header card */}
      <div className="rounded-xl overflow-hidden border bg-card">
        <div className="h-2 w-full" style={{ background: collection.coverColor }} />
        <div className="flex items-center gap-4 p-4">
          <div
            className="h-14 w-14 rounded-xl flex items-center justify-center text-2xl shrink-0 shadow-sm"
            style={{ background: collection.coverColor }}
          >
            {collection.coverEmoji}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-semibold text-base">{collection.name}</h2>
              {collection.sharedWithFriends && (
                <Badge variant="secondary" className="text-[10px] gap-1">
                  <Share2 size={9} /> Shared
                </Badge>
              )}
            </div>
            {collection.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{collection.description}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">{collection.items.length} {collection.items.length === 1 ? "item" : "items"}</p>
          </div>
        </div>
      </div>

      {/* Items list */}
      {collection.items.length === 0 ? (
        <div className="text-center py-12 border rounded-xl border-dashed">
          <ListMusic size={28} className="text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No items yet</p>
          <Button size="sm" variant="outline" className="mt-3 gap-1.5" onClick={() => setPickerOpen(true)}>
            <Plus size={13} /> Add songs or artists
          </Button>
        </div>
      ) : (
        <div className="space-y-1.5">
          {collection.items.map((item, idx) => (
            <div key={item.id} className="flex items-center gap-3 p-2.5 rounded-lg border bg-card group hover:bg-muted/30 transition-colors">
              <span className="text-xs text-muted-foreground w-5 text-center shrink-0">{idx + 1}</span>
              {item.itemType === "song" && item.song ? (
                <>
                  <div className="w-8 h-8 rounded-full bg-violet-500/10 flex items-center justify-center shrink-0">
                    <Music size={13} className="text-violet-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.song.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{item.song.artistName}</p>
                  </div>
                </>
              ) : item.itemType === "artist" && item.artist ? (
                <>
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                    style={{ background: item.artist.accentColor ?? "#6366f1" }}
                  >
                    {item.artist.name[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.artist.name}</p>
                    <Badge variant="secondary" className="text-[10px] mt-0.5">Artist</Badge>
                  </div>
                </>
              ) : (
                <div className="flex-1 text-xs text-muted-foreground italic">Unknown item</div>
              )}
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button
                  disabled={idx === 0}
                  onClick={() => onMoveItem(item.id, "up")}
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors"
                  title="Move up"
                >
                  <ChevronUp size={13} />
                </button>
                <button
                  disabled={idx === collection.items.length - 1}
                  onClick={() => onMoveItem(item.id, "down")}
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors"
                  title="Move down"
                >
                  <ChevronDown size={13} />
                </button>
                <button
                  onClick={() => onRemoveItem(item.id)}
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-red-500 transition-colors"
                  title="Remove"
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ItemPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        artists={artists}
        existingItemIds={existingItemIds}
        onAdd={(itemType, songId, artistId) => {
          onAddItem(itemType, songId, artistId);
          // keep picker open so user can add multiple
        }}
      />
    </div>
  );
}

// Collections tab main component
function CollectionsTab({ artists }: { artists: MusicArtistWithSongs[] }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: collections = [], isLoading } = useQuery<MusicCollectionWithItems[]>({
    queryKey: ["/api/music/collections"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/music/collections"); return r.json(); },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/music/collections"] });

  const createMut = useMutation({
    mutationFn: (d: any) => apiRequest("POST", "/api/music/collections", d),
    onSuccess: () => { invalidate(); setFormOpen(false); toast({ title: "Collection created" }); },
    onError: () => toast({ title: "Failed to create collection", variant: "destructive" }),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: number; d: any }) => apiRequest("PATCH", `/api/music/collections/${id}`, d),
    onSuccess: () => { invalidate(); setFormOpen(false); },
    onError: () => toast({ title: "Failed to update collection", variant: "destructive" }),
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/music/collections/${id}`),
    onSuccess: () => { invalidate(); setSelectedId(null); toast({ title: "Collection deleted" }); },
  });
  const addItemMut = useMutation({
    mutationFn: ({ colId, itemType, songId, artistId }: any) =>
      apiRequest("POST", `/api/music/collections/${colId}/items`, { itemType, songId: songId ?? null, artistId: artistId ?? null }),
    onSuccess: () => invalidate(),
    onError: () => toast({ title: "Failed to add item", variant: "destructive" }),
  });
  const removeItemMut = useMutation({
    mutationFn: ({ colId, itemId }: any) => apiRequest("DELETE", `/api/music/collections/${colId}/items/${itemId}`),
    onSuccess: () => invalidate(),
  });
  const reorderMut = useMutation({
    mutationFn: ({ colId, itemIds }: any) => apiRequest("PUT", `/api/music/collections/${colId}/items/order`, { itemIds }),
    onSuccess: () => invalidate(),
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editingCol, setEditingCol] = useState<MusicCollectionWithItems | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const selectedCollection = collections.find((c) => c.id === selectedId) ?? null;

  function openCreate() { setEditingCol(null); setFormOpen(true); }
  function openEdit(col: MusicCollectionWithItems) { setEditingCol(col); setFormOpen(true); }

  function handleFormSubmit(data: typeof EMPTY_COL_FORM) {
    if (editingCol) {
      updateMut.mutate({ id: editingCol.id, d: data });
    } else {
      createMut.mutate(data);
    }
  }

  function handleMoveItem(col: MusicCollectionWithItems, itemId: number, direction: "up" | "down") {
    const items = [...col.items];
    const idx = items.findIndex((i) => i.id === itemId);
    if (idx < 0) return;
    const newIdx = direction === "up" ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= items.length) return;
    [items[idx], items[newIdx]] = [items[newIdx], items[idx]];
    reorderMut.mutate({ colId: col.id, itemIds: items.map((i) => i.id) });
  }

  if (selectedCollection) {
    return (
      <CollectionDetail
        collection={selectedCollection}
        artists={artists}
        onBack={() => setSelectedId(null)}
        onEdit={() => openEdit(selectedCollection)}
        onDelete={() => deleteMut.mutate(selectedCollection.id)}
        onAddItem={(itemType, songId, artistId) => addItemMut.mutate({ colId: selectedCollection.id, itemType, songId, artistId })}
        onRemoveItem={(itemId) => removeItemMut.mutate({ colId: selectedCollection.id, itemId })}
        onMoveItem={(itemId, dir) => handleMoveItem(selectedCollection, itemId, dir)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{collections.length} {collections.length === 1 ? "collection" : "collections"}</p>
        <Button size="sm" onClick={openCreate} className="gap-1.5">
          <Plus size={13} /> New Collection
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Loading…</div>
      ) : collections.length === 0 ? (
        <div className="text-center py-16 border rounded-xl border-dashed">
          <ListMusic size={32} className="text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No collections yet</p>
          <p className="text-xs text-muted-foreground mt-1">Create a collection to group songs and artists together</p>
          <Button size="sm" variant="outline" className="mt-4 gap-1.5" onClick={openCreate}>
            <Plus size={13} /> Create your first collection
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {collections.map((col) => (
            <button
              key={col.id}
              type="button"
              onClick={() => setSelectedId(col.id)}
              className="rounded-xl border bg-card overflow-hidden text-left hover:shadow-md transition-shadow group"
            >
              <div className="h-1.5 w-full" style={{ background: col.coverColor }} />
              <div className="flex items-center gap-3 p-4">
                <div
                  className="h-12 w-12 rounded-lg flex items-center justify-center text-2xl shrink-0 shadow-sm"
                  style={{ background: col.coverColor }}
                >
                  {col.coverEmoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-semibold text-sm truncate">{col.name}</span>
                    {col.sharedWithFriends && (
                      <Share2 size={11} className="text-muted-foreground shrink-0" />
                    )}
                  </div>
                  {col.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{col.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {col.items.length} {col.items.length === 1 ? "item" : "items"}
                    {col.items.filter((i) => i.itemType === "song").length > 0 && (
                      <span> · {col.items.filter((i) => i.itemType === "song").length} songs</span>
                    )}
                    {col.items.filter((i) => i.itemType === "artist").length > 0 && (
                      <span> · {col.items.filter((i) => i.itemType === "artist").length} artists</span>
                    )}
                  </p>
                </div>
                <ChevronRight size={14} className="text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </button>
          ))}
        </div>
      )}

      <CollectionFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmit={handleFormSubmit}
        initial={editingCol ? {
          name: editingCol.name,
          description: editingCol.description ?? "",
          coverColor: editingCol.coverColor,
          coverEmoji: editingCol.coverEmoji,
          sharedWithFriends: editingCol.sharedWithFriends,
        } : undefined}
        isPending={createMut.isPending || updateMut.isPending}
      />
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
  const [spotifyArtistName, setSpotifyArtistName] = useState<string | undefined>();
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("shared") === "1") setTab("recommendations");
  }, []);
  useEffect(() => {
    if (tab !== "recommendations") return;
    apiRequest("POST", "/api/shares/mark-read", { type: "music" })
      .then(() => qc.invalidateQueries({ queryKey: ["/api/shares/count"] })).catch(() => {});
  }, [tab]);
  const [genreFilter, setGenreFilter] = useState<string | null>(null);
  const [csvInfoOpen, setCsvInfoOpen] = useState(false);
  const [lastfmOpen, setLastfmOpen] = useState(false);

  // Recommend state
  const [recommendOpen, setRecommendOpen] = useState(false);
  const [recommendType, setRecommendType] = useState<"artist" | "song">("artist");
  const [recommendArtistName, setRecommendArtistName] = useState("");
  const [recommendSongTitle, setRecommendSongTitle] = useState<string | undefined>();

  function openRecommend(type: "artist" | "song", artistName: string, songTitle?: string) {
    setRecommendType(type);
    setRecommendArtistName(artistName);
    setRecommendSongTitle(songTitle);
    setRecommendOpen(true);
  }

  // Artist modal
  const [artistModal, setArtistModal] = useState(false);
  const [editingArtist, setEditingArtist] = useState<MusicArtistWithSongs | null>(null);
  const [artistForm, setArtistForm] = useState({ ...EMPTY_ARTIST_FORM });

  // Add Song modal (new — Last.fm search + manual)
  const [addSongModal, setAddSongModal] = useState(false);
  const [addSongArtistId, setAddSongArtistId] = useState<number>(0);
  const [addSongArtistName, setAddSongArtistName] = useState("");

  // Edit Song modal (existing songs only)
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

  function openAddSong(artistId: number, artistName: string) {
    setAddSongArtistId(artistId);
    setAddSongArtistName(artistName);
    setAddSongModal(true);
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
          <TabsTrigger value="recommendations" className="text-xs">
            Recommendations
          </TabsTrigger>
          <TabsTrigger value="spotify" className="text-xs flex items-center gap-1">
            <Radio size={11} />
            Discover
          </TabsTrigger>
          <TabsTrigger value="collections" className="text-xs flex items-center gap-1">
            <ListMusic size={11} />
            Collections
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
                  onRecommendArtist={(name) => openRecommend("artist", name)}
                  onRecommendSong={(song, artist) => openRecommend("song", artist, song)}
                  onOpenSpotify={(name) => { setSpotifyArtistName(name); setTab("spotify"); }}
                  onOpenYouTube={(q) => { setSpotifyArtistName(q); setTab("spotify"); }}
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
                        onRecommendArtist={(name) => openRecommend("artist", name)}
                        onRecommendSong={(song, artist) => openRecommend("song", artist, song)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Recommendations tab */}
        <TabsContent value="recommendations">
          <MusicRecommendationsTab artists={artists} onRecommendOpen={openRecommend} />
        </TabsContent>

        {/* Discover tab */}
        <TabsContent value="spotify">
          <LastFmTab initialArtistName={spotifyArtistName} allArtists={artists} />
        </TabsContent>

        {/* Collections tab */}
        <TabsContent value="collections">
          <CollectionsTab artists={artists} />
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

      {/* ── Add Song Modal (smart: Last.fm + manual) ─────────────────────────────── */}
      <AddSongModal
        open={addSongModal}
        onClose={() => setAddSongModal(false)}
        artistId={addSongArtistId}
        artistName={addSongArtistName}
        onCreated={invalidate}
      />

      {/* ── Song Edit Modal ──────────────────────────────────────────────────────── */}
      <Dialog open={songModal} onOpenChange={(o) => { if (!o) closeSongModal(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Song</DialogTitle>
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
                Save Changes
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

      {/* Music Recommend Modal */}
      <MusicRecommendModal
        open={recommendOpen}
        onClose={() => setRecommendOpen(false)}
        type={recommendType}
        artistName={recommendArtistName}
        songTitle={recommendSongTitle}
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
