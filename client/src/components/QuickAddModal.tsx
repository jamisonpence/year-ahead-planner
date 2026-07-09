import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { X, ArrowLeft, Check, Loader2, Search, BookOpen, Film, ExternalLink } from "lucide-react";
import { loadIntentions, type IntentionKey } from "@/components/OnboardingModal";

// ── Types ─────────────────────────────────────────────────────────────────────

export type SectionKey =
  | "reading" | "movies" | "music" | "spots" | "recipe"
  | "task" | "note" | "habit" | "habit_complete" | "task_complete" | "workout" | "goal" | "person";

/** Dispatch this from any page to open QuickAdd (optionally pre-jumped to a section). */
export function openQuickAdd(section?: SectionKey): void {
  window.dispatchEvent(new CustomEvent("open-quick-add", { detail: { section } }));
}

interface ActivityItem {
  id: number;
  activityType: string;
  itemType: string;
  itemTitle: string;
  createdAt: string;
}

// ── Section config ────────────────────────────────────────────────────────────

interface SectionMeta { key: SectionKey; emoji: string; label: string; sub: string }

const ALL_SECTIONS: SectionMeta[] = [
  // Save / library
  { key: "reading", emoji: "📚", label: "Book",       sub: "Save a book"            },
  { key: "movies",  emoji: "🎬", label: "Movie / Show", sub: "Add to watch list"    },
  { key: "music",   emoji: "🎵", label: "Music",      sub: "Add artist or song"     },
  { key: "spots",   emoji: "📍", label: "Place",      sub: "Add a spot or place"    },
  { key: "recipe",  emoji: "🍽️", label: "Recipe",     sub: "Save a recipe"          },
  // Create
  { key: "task",          emoji: "✅", label: "Task",        sub: "Create a new task"        },
  { key: "goal",          emoji: "🎯", label: "Goal",        sub: "Set a new goal"           },
  { key: "habit",         emoji: "🌱", label: "Habit",       sub: "Build a daily habit"      },
  { key: "note",          emoji: "📝", label: "Private Note", sub: "Write a private thought" },
  { key: "person",        emoji: "👤", label: "Person",      sub: "Add someone to contacts"  },
  // Log
  { key: "habit_complete",emoji: "🔥", label: "Log Habit",   sub: "Mark a habit done today"  },
  { key: "task_complete", emoji: "☑️", label: "Complete Task", sub: "Check off a pending task"},
  { key: "workout",       emoji: "💪", label: "Workout",     sub: "Log a session"            },
];

const SECTION_MAP = Object.fromEntries(ALL_SECTIONS.map(s => [s.key, s])) as Record<SectionKey, SectionMeta>;

const SECTION_EMOJI: Record<string, string> = Object.fromEntries(
  ALL_SECTIONS.map(s => [s.key, s.emoji])
);

// ── Persona ordering ──────────────────────────────────────────────────────────
// Defines the default display order for each persona.
// All 12 sections are always present — just re-prioritized.
const PERSONA_ORDER: Record<string, SectionKey[]> = {
  momentum: [
    "task", "goal", "habit", "note", "habit_complete", "task_complete",
    "reading", "music", "movies", "spots", "recipe", "workout", "person",
  ],
  health: [
    "workout", "habit", "goal", "recipe", "task",
    "habit_complete", "note", "task_complete", "reading", "movies", "music", "spots", "person",
  ],
  explore_life: [
    "reading", "recipe", "spots", "music", "movies",
    "note", "task", "goal", "habit", "habit_complete", "workout", "task_complete", "person",
  ],
  connect: [
    "person", "spots", "reading", "music", "recipe", "movies",
    "note", "task", "goal", "habit", "habit_complete", "task_complete", "workout",
  ],
};

/** Return ALL_SECTIONS sorted by persona priority (falls back to default order). */
function getPersonaOrderedSections(persona: string): SectionMeta[] {
  const order = PERSONA_ORDER[persona];
  if (!order) return ALL_SECTIONS;
  return order.map(k => SECTION_MAP[k]).filter(Boolean);
}

// ── Intention → suggested sections ───────────────────────────────────────────
const INTENTION_SECTIONS: Partial<Record<IntentionKey, SectionKey[]>> = {
  goal:            ["goal", "task"],
  habit:           ["habit", "habit_complete"],
  plan_week:       ["task", "task_complete"],
  save_recs:       ["reading", "music", "spots", "recipe"],
  track_workouts:  ["workout", "habit"],
  organize_places: ["spots"],
  connect_friends: ["person"],
  private_notes:   ["note"],
};

/** Return deduplicated suggested section keys for the user's stored intentions (max 3). */
function getSuggestedSections(intentions: IntentionKey[]): SectionKey[] {
  const seen = new Set<SectionKey>();
  const result: SectionKey[] = [];
  for (const intent of intentions) {
    for (const key of INTENTION_SECTIONS[intent] ?? []) {
      if (!seen.has(key) && result.length < 3) {
        seen.add(key);
        result.push(key);
      }
    }
  }
  return result;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function entityEmoji(itemType: string): string {
  const map: Record<string, string> = {
    book: "📚", movie: "🎬", show: "🎬", artist: "🎵", song: "🎵",
    recipe: "🍽️", spot: "📍", quote: "💬", art: "🎨",
    workout: "💪", plant: "🌿", hobby: "✨",
  };
  return map[itemType?.toLowerCase()] ?? "✦";
}

// ── Form: Input + Button shared UI ───────────────────────────────────────────

function FormInput({
  label, value, onChange, placeholder, required, multiline,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; required?: boolean; multiline?: boolean;
}) {
  const cls = "w-full px-3 py-2.5 rounded-xl border bg-background text-sm outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500/60 transition-all resize-none";
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {multiline
        ? <textarea className={cls} rows={3} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
        : <input className={cls} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
      }
    </div>
  );
}

function SegmentPicker<T extends string>({
  label, options, value, onChange,
}: {
  label: string; options: { value: T; label: string }[];
  value: T; onChange: (v: T) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="flex gap-1.5 flex-wrap">
        {options.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors
              ${value === opt.value
                ? "bg-violet-500 border-violet-500 text-white"
                : "bg-secondary/50 border-transparent hover:bg-secondary"}`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SubmitButton({ loading, disabled, label = "Add" }: { loading: boolean; disabled?: boolean; label?: string }) {
  return (
    <button
      type="submit"
      disabled={loading || disabled}
      className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 text-white font-semibold text-sm
        hover:from-violet-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed
        flex items-center justify-center gap-2 transition-all shadow-sm"
    >
      {loading ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
      {loading ? "Adding…" : label}
    </button>
  );
}

// ── Per-section forms ─────────────────────────────────────────────────────────

interface QuickBookResult {
  id: string;
  title: string;
  author: string;
  year?: string;
  pageCount?: number;
  genre?: string;
  coverUrl?: string;
}

interface QuickMovieResult {
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  media_type?: "movie" | "tv";
}

const QUICK_TMDB_IMG_BASE = "https://image.tmdb.org/t/p/w185";
const QUICK_POSTER_COLORS = [
  "hsl(210 80% 48%)", "hsl(25 85% 52%)", "hsl(340 75% 50%)",
  "hsl(160 60% 40%)", "hsl(270 60% 50%)", "hsl(45 90% 48%)",
  "hsl(195 75% 42%)", "hsl(0 70% 48%)",
];

function normalizeQuickBook(volume: any): QuickBookResult {
  const info = volume.volumeInfo ?? {};
  const rawThumb = info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || "";
  return {
    id: volume.id ?? info.title ?? String(Math.random()),
    title: info.title ?? "Unknown Title",
    author: (info.authors ?? []).join(", "),
    year: info.publishedDate?.slice(0, 4),
    pageCount: info.pageCount ?? undefined,
    genre: info.categories?.[0] ?? undefined,
    coverUrl: rawThumb ? rawThumb.replace(/^http:\/\//, "https://") : undefined,
  };
}

function quickMovieTitle(item: QuickMovieResult) {
  return item.title || item.name || "Untitled";
}

function quickMovieYear(item: QuickMovieResult) {
  return (item.release_date || item.first_air_date || "").slice(0, 4);
}

function ReadingForm({ onSuccess }: { onSuccess: () => void }) {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<QuickBookResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualAuthor, setManualAuthor] = useState("");
  const [addingId, setAddingId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mut = useMutation({
    mutationFn: (book: Partial<QuickBookResult> & { title: string }) => apiRequest("POST", "/api/books", {
      title: book.title,
      author: book.author || undefined,
      genre: book.genre || undefined,
      totalPages: book.pageCount || undefined,
      coverUrl: book.coverUrl || undefined,
      status: "backlog",
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/books"] }); qc.invalidateQueries({ queryKey: ["/api/feed/mine"] }); qc.invalidateQueries({ queryKey: ["/api/user/summary"] }); onSuccess(); },
    onSettled: () => setAddingId(null),
  });

  function runSearch(nextQuery: string) {
    setQuery(nextQuery);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!nextQuery.trim()) { setResults([]); setLoading(false); return; }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await apiRequest("GET", `/api/gbooks/search?q=${encodeURIComponent(nextQuery.trim())}`);
        const data = await res.json();
        setResults((Array.isArray(data) ? data : []).slice(0, 8).map(normalizeQuickBook));
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);
  }

  function addBook(book: QuickBookResult) {
    setAddingId(book.id);
    mut.mutate(book);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Search books</label>
        <div className="relative">
          {loading
            ? <Loader2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin" />
            : <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />}
          <input
            value={query}
            onChange={e => runSearch(e.target.value)}
            placeholder="Title, author, or ISBN"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border bg-background text-sm outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500/60 transition-all"
          />
        </div>
        <p className="text-[11px] text-muted-foreground">Choose a result to save the real title, author, cover, and page count.</p>
      </div>

      {results.length > 0 && (
        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {results.map(book => (
            <button
              key={book.id}
              type="button"
              onClick={() => addBook(book)}
              disabled={mut.isPending}
              className="w-full flex items-center gap-3 rounded-xl border bg-background p-2.5 text-left hover:bg-secondary/60 transition-colors disabled:opacity-60"
            >
              {book.coverUrl ? (
                <img src={book.coverUrl} alt="" className="h-14 w-10 rounded object-cover shrink-0" />
              ) : (
                <div className="h-14 w-10 rounded bg-secondary flex items-center justify-center shrink-0">
                  <BookOpen size={14} className="text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">{book.title}</p>
                <p className="text-xs text-muted-foreground truncate">{book.author || "Unknown author"}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {[book.year, book.pageCount ? `${book.pageCount} pages` : null].filter(Boolean).join(" · ")}
                </p>
              </div>
              {addingId === book.id ? <Loader2 size={15} className="animate-spin text-primary shrink-0" /> : <Check size={15} className="text-muted-foreground shrink-0" />}
            </button>
          ))}
        </div>
      )}

      <button type="button" onClick={() => setManualOpen(v => !v)} className="text-xs font-medium text-primary hover:underline">
        {manualOpen ? "Hide manual entry" : "Can't find it? Add manually"}
      </button>

      {manualOpen && (
        <form onSubmit={e => { e.preventDefault(); if (manualTitle.trim()) mut.mutate({ title: manualTitle.trim(), author: manualAuthor.trim() }); }} className="space-y-4 rounded-xl border bg-secondary/20 p-3">
          <FormInput label="Book title" value={manualTitle} onChange={setManualTitle} placeholder="e.g. Atomic Habits" required />
          <FormInput label="Author" value={manualAuthor} onChange={setManualAuthor} placeholder="e.g. James Clear" />
          <SubmitButton loading={mut.isPending} disabled={!manualTitle.trim()} />
        </form>
      )}
    </div>
  );
}

function MoviesForm({ onSuccess }: { onSuccess: () => void }) {
  const qc = useQueryClient();
  const [mediaType, setMediaType] = useState<"movie" | "show">("movie");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<QuickMovieResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [addingId, setAddingId] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mut = useMutation({
    mutationFn: (payload: any) => apiRequest("POST", "/api/movies", payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/movies"] }); qc.invalidateQueries({ queryKey: ["/api/feed/mine"] }); qc.invalidateQueries({ queryKey: ["/api/user/summary"] }); onSuccess(); },
    onSettled: () => setAddingId(null),
  });

  function runSearch(nextQuery: string, nextType = mediaType) {
    setQuery(nextQuery);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!nextQuery.trim()) { setResults([]); setLoading(false); return; }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const type = nextType === "show" ? "tv" : "movie";
        const res = await apiRequest("GET", `/api/tmdb/search?q=${encodeURIComponent(nextQuery.trim())}&type=${type}`);
        const data = await res.json();
        setResults((Array.isArray(data) ? data : []).slice(0, 8));
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);
  }

  async function addMovie(item: QuickMovieResult) {
    setAddingId(item.id);
    try {
      const type = mediaType === "show" ? "tv" : "movie";
      const detailRes = await apiRequest("GET", `/api/tmdb/${type}/${item.id}`);
      const detail = await detailRes.json();
      const isShow = mediaType === "show";
      const title = detail.title || detail.name || quickMovieTitle(item);
      const year = parseInt((detail.release_date || detail.first_air_date || "").slice(0, 4)) || null;
      const director = isShow
        ? (detail.credits?.created_by?.[0]?.name ?? null)
        : (detail.credits?.crew?.find((c: any) => c.job === "Director")?.name ?? null);
      mut.mutate({
        mediaType,
        title,
        year,
        director,
        genres: (detail.genres ?? []).map((g: any) => g.name).join(",") || null,
        status: "backlog",
        rating: null,
        notes: null,
        listsJson: "[]",
        isFavorite: false,
        posterColor: QUICK_POSTER_COLORS[Math.floor(Math.random() * QUICK_POSTER_COLORS.length)],
        streamingOn: null,
        totalSeasons: isShow ? (detail.number_of_seasons ?? null) : null,
        currentSeason: null,
        videoUrl: null,
        posterUrl: detail.poster_path ? `${QUICK_TMDB_IMG_BASE}${detail.poster_path}` : null,
      });
    } catch {
      setAddingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <SegmentPicker
        label="Type"
        options={[{ value: "movie", label: "Movie" }, { value: "show", label: "TV Show" }]}
        value={mediaType}
        onChange={(next) => { setMediaType(next); setResults([]); if (query.trim()) runSearch(query, next); }}
      />
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Search {mediaType === "show" ? "shows" : "movies"}</label>
        <div className="relative">
          {loading
            ? <Loader2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin" />
            : <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />}
          <input
            value={query}
            onChange={e => runSearch(e.target.value)}
            placeholder={mediaType === "show" ? "Search TV shows" : "Search movies"}
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border bg-background text-sm outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500/60 transition-all"
          />
        </div>
        <p className="text-[11px] text-muted-foreground">Choose a TMDB result to save poster, year, genre, and creator details.</p>
      </div>

      {results.length > 0 && (
        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {results.map(item => {
            const title = quickMovieTitle(item);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => addMovie(item)}
                disabled={mut.isPending}
                className="w-full flex items-center gap-3 rounded-xl border bg-background p-2.5 text-left hover:bg-secondary/60 transition-colors disabled:opacity-60"
              >
                {item.poster_path ? (
                  <img src={`${QUICK_TMDB_IMG_BASE}${item.poster_path}`} alt="" className="h-14 w-10 rounded object-cover shrink-0" />
                ) : (
                  <div className="h-14 w-10 rounded bg-secondary flex items-center justify-center shrink-0">
                    <Film size={14} className="text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{title}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {mediaType === "show" ? "TV Show" : "Movie"}{quickMovieYear(item) ? ` · ${quickMovieYear(item)}` : ""}
                  </p>
                </div>
                {addingId === item.id ? <Loader2 size={15} className="animate-spin text-primary shrink-0" /> : <Check size={15} className="text-muted-foreground shrink-0" />}
              </button>
            );
          })}
        </div>
      )}

      <button type="button" onClick={() => setManualOpen(v => !v)} className="text-xs font-medium text-primary hover:underline">
        {manualOpen ? "Hide manual entry" : "Can't find it? Add manually"}
      </button>

      {manualOpen && (
        <form onSubmit={e => { e.preventDefault(); if (manualTitle.trim()) mut.mutate({ title: manualTitle.trim(), mediaType }); }} className="space-y-4 rounded-xl border bg-secondary/20 p-3">
          <FormInput label="Title" value={manualTitle} onChange={setManualTitle} placeholder={mediaType === "movie" ? "e.g. Inception" : "e.g. Severance"} required />
          <SubmitButton loading={mut.isPending} disabled={!manualTitle.trim()} />
        </form>
      )}
    </div>
  );
}

function MusicForm({ onSuccess }: { onSuccess: () => void }) {
  const qc = useQueryClient();
  const [artistName, setArtistName] = useState("");
  const [songTitle, setSongTitle] = useState("");
  const [addSong, setAddSong] = useState(false);
  const mut = useMutation({
    mutationFn: async () => {
      const artistRes = await apiRequest("POST", "/api/music/artists", { name: artistName });
      const artist = await artistRes.json();
      if (addSong && songTitle.trim() && artist?.id) {
        await apiRequest("POST", "/api/music/songs", { artistId: artist.id, title: songTitle });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/music"] });
      qc.invalidateQueries({ queryKey: ["/api/feed/mine"] });
      qc.invalidateQueries({ queryKey: ["/api/user/summary"] });
      onSuccess();
    },
  });
  return (
    <form onSubmit={e => { e.preventDefault(); if (artistName.trim()) mut.mutate(); }} className="space-y-4">
      <FormInput label="Artist / Band" value={artistName} onChange={setArtistName} placeholder="e.g. Hozier" required />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setAddSong(!addSong)}
          className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors shrink-0
            ${addSong ? "bg-violet-500 border-violet-500" : "border-border"}`}
        >
          {addSong && <Check size={11} className="text-white" />}
        </button>
        <span className="text-xs text-muted-foreground">Also add a specific song</span>
      </div>
      {addSong && (
        <FormInput label="Song title" value={songTitle} onChange={setSongTitle} placeholder="e.g. Take Me to Church" />
      )}
      <SubmitButton loading={mut.isPending} disabled={!artistName.trim()} />
    </form>
  );
}

function RecipesForm({ onSuccess }: { onSuccess: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🍽️");
  const [recipeUrl, setRecipeUrl] = useState("");
  const [category, setCategory] = useState("");
  const [prepTime, setPrepTime] = useState("");
  const [cookTime, setCookTime] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [ingredients, setIngredients] = useState<{ name: string; qty: string }[]>([]);
  const [instructions, setInstructions] = useState("");
  const [importError, setImportError] = useState("");
  const FOOD_EMOJIS = ["🍽️","🍕","🍜","🍱","🥗","🍝","🥘","🍛","🍣","🥙","🍔","🥞","🍰","☕","🍷"];
  const mut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/recipes", {
      name: name.trim(),
      emoji,
      category: category.trim() || null,
      prepTime: prepTime ? parseInt(prepTime) : null,
      cookTime: cookTime ? parseInt(cookTime) : null,
      ingredientsJson: JSON.stringify(ingredients.filter(i => i.name.trim())),
      instructions: instructions.trim() || null,
      imageUrl: imageUrl.trim() || null,
      source: sourceUrl.trim() || null,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/recipes"] }); qc.invalidateQueries({ queryKey: ["/api/feed/mine"] }); qc.invalidateQueries({ queryKey: ["/api/user/summary"] }); onSuccess(); },
  });
  const importMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/recipes/import-url", { url: recipeUrl.trim() });
      return res.json();
    },
    onSuccess: (data) => {
      setImportError("");
      if (data.name) setName(data.name);
      if (data.category) setCategory(data.category);
      if (data.prepTime != null) setPrepTime(String(data.prepTime));
      if (data.cookTime != null) setCookTime(String(data.cookTime));
      if (data.source) setSourceUrl(data.source);
      if (data.imageUrl) setImageUrl(data.imageUrl);
      if (Array.isArray(data.ingredients)) setIngredients(data.ingredients);
      if (data.instructions) setInstructions(data.instructions);
    },
    onError: (err) => {
      setImportError(err instanceof Error ? err.message : "Could not import that recipe. Try another URL.");
    },
  });
  const hasImportedDetails = ingredients.length > 0 || instructions.trim() || sourceUrl.trim();
  return (
    <form onSubmit={e => { e.preventDefault(); if (name.trim()) mut.mutate(); }} className="space-y-4">
      <div className="rounded-2xl border bg-secondary/30 p-3 space-y-2.5">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ExternalLink size={15} className="text-violet-400" />
          Import from recipe URL
        </div>
        <div className="flex gap-2">
          <input
            className="min-w-0 flex-1 px-3 py-2.5 rounded-xl border bg-background text-sm outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500/60 transition-all"
            value={recipeUrl}
            onChange={e => { setRecipeUrl(e.target.value); setImportError(""); }}
            placeholder="https://example.com/recipe"
            inputMode="url"
          />
          <button
            type="button"
            disabled={!recipeUrl.trim() || importMut.isPending}
            onClick={() => importMut.mutate()}
            className="px-3 py-2.5 rounded-xl bg-violet-500 text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5"
          >
            {importMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
            Import
          </button>
        </div>
        {importError && <p className="text-xs text-red-400">{importError}</p>}
        {hasImportedDetails && (
          <div className="rounded-xl bg-background/70 border p-2.5 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Imported recipe details</p>
            <p>{ingredients.length} ingredients{instructions ? " · Instructions included" : ""}</p>
            {sourceUrl && <p className="truncate">Source: {sourceUrl}</p>}
          </div>
        )}
      </div>
      <FormInput label="Recipe name" value={name} onChange={setName} placeholder="e.g. Lemon Pasta" required />
      <div className="grid grid-cols-2 gap-3">
        <FormInput label="Category" value={category} onChange={setCategory} placeholder="Dinner" />
        <FormInput label="Prep min" value={prepTime} onChange={setPrepTime} placeholder="15" />
      </div>
      <FormInput label="Cook min" value={cookTime} onChange={setCookTime} placeholder="25" />
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Pick an emoji</label>
        <div className="flex flex-wrap gap-2">
          {FOOD_EMOJIS.map(e => (
            <button
              key={e}
              type="button"
              onClick={() => setEmoji(e)}
              className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center transition-colors
                ${emoji === e ? "bg-violet-500/20 ring-2 ring-violet-500/50" : "bg-secondary/50 hover:bg-secondary"}`}
            >
              {e}
            </button>
          ))}
        </div>
      </div>
      {instructions && (
        <FormInput label="Instructions preview" value={instructions} onChange={setInstructions} multiline />
      )}
      <SubmitButton loading={mut.isPending} disabled={!name.trim()} />
    </form>
  );
}

function SpotsForm({ onSuccess }: { onSuccess: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [type, setType] = useState<"restaurant" | "bar" | "cafe" | "park" | "museum" | "other">("restaurant");
  const mut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/spots", { name, type }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/spots"] }); qc.invalidateQueries({ queryKey: ["/api/feed/mine"] }); qc.invalidateQueries({ queryKey: ["/api/user/summary"] }); onSuccess(); },
  });
  return (
    <form onSubmit={e => { e.preventDefault(); if (name.trim()) mut.mutate(); }} className="space-y-4">
      <SegmentPicker
        label="Type"
        options={[
          { value: "restaurant", label: "Restaurant" },
          { value: "bar",        label: "Bar"         },
          { value: "cafe",       label: "Café"        },
          { value: "park",       label: "Park"        },
          { value: "museum",     label: "Museum"      },
          { value: "other",      label: "Other"       },
        ]}
        value={type}
        onChange={setType}
      />
      <FormInput label="Place name" value={name} onChange={setName} placeholder="e.g. Blue Bottle Coffee" required />
      <SubmitButton loading={mut.isPending} disabled={!name.trim()} />
    </form>
  );
}

function QuotesForm({ onSuccess }: { onSuccess: () => void }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [category, setCategory] = useState<"inspiration" | "wisdom" | "humor" | "life" | "other">("inspiration");
  const mut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/quotes", { text, category }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/quotes"] }); qc.invalidateQueries({ queryKey: ["/api/feed/mine"] }); qc.invalidateQueries({ queryKey: ["/api/user/summary"] }); onSuccess(); },
  });
  return (
    <form onSubmit={e => { e.preventDefault(); if (text.trim()) mut.mutate(); }} className="space-y-4">
      <FormInput label="Quote" value={text} onChange={setText} placeholder="Enter the quote…" required multiline />
      <SegmentPicker
        label="Category"
        options={[
          { value: "inspiration", label: "Inspiration" },
          { value: "wisdom",      label: "Wisdom"      },
          { value: "humor",       label: "Humor"       },
          { value: "life",        label: "Life"        },
          { value: "other",       label: "Other"       },
        ]}
        value={category}
        onChange={setCategory}
      />
      <SubmitButton loading={mut.isPending} disabled={!text.trim()} />
    </form>
  );
}

function ArtForm({ onSuccess }: { onSuccess: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [medium, setMedium] = useState<"painting" | "sculpture" | "photography" | "digital" | "print" | "other">("painting");
  const [artist, setArtist] = useState("");
  const mut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/art", { title, medium, artist: artist || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/art"] }); qc.invalidateQueries({ queryKey: ["/api/feed/mine"] }); qc.invalidateQueries({ queryKey: ["/api/user/summary"] }); onSuccess(); },
  });
  return (
    <form onSubmit={e => { e.preventDefault(); if (title.trim()) mut.mutate(); }} className="space-y-4">
      <FormInput label="Artwork title" value={title} onChange={setTitle} placeholder="e.g. Starry Night" required />
      <FormInput label="Artist" value={artist} onChange={setArtist} placeholder="e.g. Van Gogh" />
      <SegmentPicker
        label="Medium"
        options={[
          { value: "painting",     label: "Painting"     },
          { value: "sculpture",    label: "Sculpture"    },
          { value: "photography",  label: "Photography"  },
          { value: "digital",      label: "Digital"      },
          { value: "print",        label: "Print"        },
          { value: "other",        label: "Other"        },
        ]}
        value={medium}
        onChange={setMedium}
      />
      <SubmitButton loading={mut.isPending} disabled={!title.trim()} />
    </form>
  );
}

function WorkoutsForm({ onSuccess }: { onSuccess: () => void }) {
  const qc = useQueryClient();
  const today = new Date().toISOString().split("T")[0];
  const [name, setName] = useState("");
  const [workoutType, setWorkoutType] = useState<"strength" | "cardio" | "yoga" | "hiit" | "sports" | "other">("strength");
  const mut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/workout-logs", { date: today, name: name || workoutType, workoutType }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/workout-logs"] }); qc.invalidateQueries({ queryKey: ["/api/feed/mine"] }); qc.invalidateQueries({ queryKey: ["/api/user/summary"] }); onSuccess(); },
  });
  return (
    <form onSubmit={e => { e.preventDefault(); mut.mutate(); }} className="space-y-4">
      <SegmentPicker
        label="Type"
        options={[
          { value: "strength", label: "Strength" },
          { value: "cardio",   label: "Cardio"   },
          { value: "yoga",     label: "Yoga"      },
          { value: "hiit",     label: "HIIT"      },
          { value: "sports",   label: "Sports"    },
          { value: "other",    label: "Other"     },
        ]}
        value={workoutType}
        onChange={setWorkoutType}
      />
      <FormInput label="Name (optional)" value={name} onChange={setName} placeholder={`e.g. Morning ${workoutType} session`} />
      <SubmitButton loading={mut.isPending} label="Log Workout" />
    </form>
  );
}

function PlantsForm({ onSuccess }: { onSuccess: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [lightNeeds, setLightNeeds] = useState<"low" | "medium" | "bright" | "direct">("medium");
  const mut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/plants", { name, lightNeeds }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/plants"] }); qc.invalidateQueries({ queryKey: ["/api/feed/mine"] }); qc.invalidateQueries({ queryKey: ["/api/user/summary"] }); onSuccess(); },
  });
  return (
    <form onSubmit={e => { e.preventDefault(); if (name.trim()) mut.mutate(); }} className="space-y-4">
      <FormInput label="Plant name" value={name} onChange={setName} placeholder="e.g. Monstera Deliciosa" required />
      <SegmentPicker
        label="Light needs"
        options={[
          { value: "low",    label: "Low"    },
          { value: "medium", label: "Medium" },
          { value: "bright", label: "Bright" },
          { value: "direct", label: "Direct sun" },
        ]}
        value={lightNeeds}
        onChange={setLightNeeds}
      />
      <SubmitButton loading={mut.isPending} disabled={!name.trim()} />
    </form>
  );
}

function HobbiesForm({ onSuccess }: { onSuccess: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [hobbyType, setHobbyType] = useState<"sports" | "arts" | "gaming" | "music" | "cooking" | "collecting" | "outdoor" | "other">("other");
  const [skillLevel, setSkillLevel] = useState<"beginner" | "intermediate" | "advanced">("beginner");
  const mut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/hobbies", { name, hobbyType, skillLevel, status: "active" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/hobbies"] }); qc.invalidateQueries({ queryKey: ["/api/feed/mine"] }); qc.invalidateQueries({ queryKey: ["/api/user/summary"] }); onSuccess(); },
  });
  return (
    <form onSubmit={e => { e.preventDefault(); if (name.trim()) mut.mutate(); }} className="space-y-4">
      <FormInput label="Hobby name" value={name} onChange={setName} placeholder="e.g. Watercolor painting" required />
      <SegmentPicker
        label="Category"
        options={[
          { value: "sports",     label: "Sports"     },
          { value: "arts",       label: "Arts"        },
          { value: "gaming",     label: "Gaming"      },
          { value: "music",      label: "Music"       },
          { value: "cooking",    label: "Cooking"     },
          { value: "collecting", label: "Collecting"  },
          { value: "outdoor",    label: "Outdoor"     },
          { value: "other",      label: "Other"       },
        ]}
        value={hobbyType}
        onChange={setHobbyType}
      />
      <SegmentPicker
        label="Skill level"
        options={[
          { value: "beginner",     label: "Beginner"     },
          { value: "intermediate", label: "Intermediate" },
          { value: "advanced",     label: "Advanced"     },
        ]}
        value={skillLevel}
        onChange={setSkillLevel}
      />
      <SubmitButton loading={mut.isPending} disabled={!name.trim()} />
    </form>
  );
}

// ── Create Habit ──────────────────────────────────────────────────────────────
function HabitCreateForm({ onSuccess }: { onSuccess: () => void }) {
  const qc = useQueryClient();
  const today = new Date().toISOString().split("T")[0];
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("✅");
  const [frequency, setFrequency] = useState<"daily" | "weekly">("daily");
  const [category, setCategory] = useState<"health" | "mind" | "growth" | "social" | "general">("general");
  const HABIT_EMOJIS = ["✅","🔥","💪","🧘","📚","💧","🥗","🏃","🛌","🎯","🧠","💡","🌱","🙏","❤️"];
  const mut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/habits", {
      title, emoji, frequency, category,
      color: "#6366f1",
      targetDaysPerWeek: frequency === "daily" ? 7 : 3,
      createdAt: today,
      completionsJson: "[]",
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/habits"] }); onSuccess(); },
  });
  return (
    <form onSubmit={e => { e.preventDefault(); if (title.trim()) mut.mutate(); }} className="space-y-4">
      <FormInput label="Habit name" value={title} onChange={setTitle} placeholder="e.g. Morning run" required />
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Pick an emoji</label>
        <div className="flex flex-wrap gap-2">
          {HABIT_EMOJIS.map(e => (
            <button key={e} type="button" onClick={() => setEmoji(e)}
              className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center transition-colors
                ${emoji === e ? "bg-violet-500/20 ring-2 ring-violet-500/50" : "bg-secondary/50 hover:bg-secondary"}`}>
              {e}
            </button>
          ))}
        </div>
      </div>
      <SegmentPicker label="Frequency"
        options={[{ value: "daily" as const, label: "Daily" }, { value: "weekly" as const, label: "Weekly" }]}
        value={frequency} onChange={setFrequency} />
      <SegmentPicker label="Category"
        options={[
          { value: "health"  as const, label: "Health"  },
          { value: "mind"    as const, label: "Mind"    },
          { value: "growth"  as const, label: "Growth"  },
          { value: "social"  as const, label: "Social"  },
          { value: "general" as const, label: "General" },
        ]}
        value={category} onChange={setCategory} />
      <SubmitButton loading={mut.isPending} disabled={!title.trim()} label="Create Habit" />
    </form>
  );
}

// ── Quick Log: Add Task ───────────────────────────────────────────────────────
function TaskForm({ onSuccess }: { onSuccess: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<"low"|"medium"|"high">("medium");
  const mut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/general-tasks", { title, priority, completed: false }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/general-tasks"] }); onSuccess(); },
  });
  return (
    <form onSubmit={e => { e.preventDefault(); if (title.trim()) mut.mutate(); }} className="space-y-4">
      <FormInput label="Task" value={title} onChange={setTitle} placeholder="e.g. Call the dentist" required />
      <SegmentPicker label="Priority"
        options={[{ value:"low",label:"Low" },{ value:"medium",label:"Medium" },{ value:"high",label:"High" }]}
        value={priority} onChange={setPriority} />
      <SubmitButton loading={mut.isPending} disabled={!title.trim()} label="Add Task" />
    </form>
  );
}

// ── Quick Log: Add Note ───────────────────────────────────────────────────────
function NoteForm({ onSuccess }: { onSuccess: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const today = new Date().toISOString().split("T")[0];
  const mut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/journal", {
      title: title.trim() || "Quick Note",
      content: content.trim(),
      date: today,
      mood: "neutral",
      tags: null,
      createdAt: new Date().toISOString(),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/journal"] });
      qc.invalidateQueries({ queryKey: ["/api/feed/mine"] });
      qc.invalidateQueries({ queryKey: ["/api/user/summary"] });
      onSuccess();
    },
  });
  function saveNote() {
    if (!content.trim() || mut.isPending) return;
    mut.mutate();
  }
  return (
    <form onSubmit={e => { e.preventDefault(); saveNote(); }} className="space-y-4">
      <FormInput label="Title (optional)" value={title} onChange={setTitle} placeholder="e.g. Meeting notes" />
      <FormInput label="Note" value={content} onChange={setContent} placeholder="What's on your mind?" required multiline />
      <button
        type="button"
        onClick={saveNote}
        disabled={mut.isPending || !content.trim()}
        className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 text-white font-semibold text-sm hover:from-violet-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all shadow-sm"
      >
        {mut.isPending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
        {mut.isPending ? "Saving…" : "Save Note"}
      </button>
    </form>
  );
}

// ── Quick Log: Mark Habit Done ────────────────────────────────────────────────
function HabitCompleteForm({ onSuccess }: { onSuccess: () => void }) {
  const qc = useQueryClient();
  const today = new Date().toISOString().split("T")[0];
  const { data: habits = [] } = useQuery<any[]>({ queryKey: ["/api/habits"] });
  const [selected, setSelected] = useState<number | null>(null);
  const mut = useMutation({
    mutationFn: () => apiRequest("POST", `/api/habits/${selected}/complete/${today}`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/habits"] }); onSuccess(); },
  });
  if (!habits.length) return <p className="text-sm text-muted-foreground text-center py-6">No habits set up yet. Add habits in the Habits page first.</p>;
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">Select the habit you completed today:</p>
      <div className="space-y-2 max-h-52 overflow-y-auto">
        {habits.map((h: any) => (
          <button key={h.id} type="button" onClick={() => setSelected(h.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors ${selected === h.id ? "border-violet-500 bg-violet-500/10" : "border-border hover:bg-secondary"}`}>
            <span className="text-xl leading-none shrink-0">{h.emoji}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{h.title}</p>
              <p className="text-xs text-muted-foreground capitalize">{h.category}</p>
            </div>
            {selected === h.id && <Check size={15} className="text-violet-500 shrink-0" />}
          </button>
        ))}
      </div>
      <SubmitButton loading={mut.isPending} disabled={!selected} label="Mark Complete" />
    </div>
  );
}

// ── Quick Log: Complete a Task ────────────────────────────────────────────────
function TaskCompleteForm({ onSuccess }: { onSuccess: () => void }) {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: generalTasks = [] } = useQuery<any[]>({ queryKey: ["/api/general-tasks"] });
  const { data: projects = [] } = useQuery<any[]>({
    queryKey: ["/api/projects/standalone"],
    queryFn: () => apiRequest("GET", "/api/projects/standalone").then(r => r.json()),
  });

  const [selected, setSelected] = useState<{ id: number; type: "general" | "project" } | null>(null);

  const generalMut = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/general-tasks/${id}`, { completed: true }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/general-tasks"] }); onSuccess(); },
  });
  const projectMut = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/project-tasks/${id}`, { completed: true }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/projects/standalone"] }); onSuccess(); },
  });

  const pending = generalTasks.filter((t: any) => !t.completed);
  const dueToday = pending.filter((t: any) => t.dueDate === today);
  const noDueDate = pending.filter((t: any) => !t.dueDate);
  const otherDue  = pending.filter((t: any) => t.dueDate && t.dueDate !== today);

  const pendingProjectTasks = projects.flatMap((p: any) =>
    (p.tasks ?? []).filter((t: any) => !t.completed).map((t: any) => ({ ...t, projectTitle: p.title }))
  );

  const totalPending = pending.length + pendingProjectTasks.length;
  if (totalPending === 0) return (
    <p className="text-sm text-muted-foreground text-center py-6">No pending tasks — you're all caught up! 🎉</p>
  );

  function TaskRow({ t, type }: { t: any; type: "general" | "project" }) {
    const isSelected = selected?.id === t.id && selected?.type === type;
    return (
      <button type="button"
        onClick={() => setSelected({ id: t.id, type })}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors ${isSelected ? "border-violet-500 bg-violet-500/10" : "border-border hover:bg-secondary"}`}>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{t.title}</p>
          <p className="text-xs text-muted-foreground">
            {t.projectTitle ? `📁 ${t.projectTitle}` : t.dueDate === today ? "📅 Due today" : t.priority ? `${t.priority} priority` : "No due date"}
          </p>
        </div>
        {isSelected && <Check size={15} className="text-violet-500 shrink-0" />}
      </button>
    );
  }

  function Section({ label, tasks, type }: { label: string; tasks: any[]; type: "general" | "project" }) {
    if (!tasks.length) return null;
    return (
      <div>
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{label}</p>
        <div className="space-y-1.5">
          {tasks.map(t => <TaskRow key={t.id} t={t} type={type} />)}
        </div>
      </div>
    );
  }

  function handleComplete() {
    if (!selected) return;
    if (selected.type === "general") generalMut.mutate(selected.id);
    else projectMut.mutate(selected.id);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-4 overflow-y-auto" style={{ maxHeight: "52vh" }}>
        <Section label="Due Today" tasks={dueToday} type="general" />
        <Section label="No Due Date" tasks={noDueDate} type="general" />
        <Section label="Other Due Dates" tasks={otherDue} type="general" />
        {projects.map((p: any) => {
          const pts = (p.tasks ?? []).filter((t: any) => !t.completed);
          if (!pts.length) return null;
          return (
            <div key={p.id}>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">📁 {p.title}</p>
              <div className="space-y-1.5">
                {pts.map((t: any) => <TaskRow key={t.id} t={{ ...t, projectTitle: p.title }} type="project" />)}
              </div>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={handleComplete}
        disabled={!selected || generalMut.isPending || projectMut.isPending}
        className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 text-white font-semibold text-sm hover:from-violet-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all shadow-sm"
      >
        {(generalMut.isPending || projectMut.isPending) ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
        {(generalMut.isPending || projectMut.isPending) ? "Saving…" : "Mark Complete"}
      </button>
    </div>
  );
}

// ── Quick Log: Add Goal ───────────────────────────────────────────────────────
function GoalForm({ onSuccess }: { onSuccess: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [horizon, setHorizon] = useState<"this_week" | "this_month" | "this_year">("this_year");
  const mut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/goals", { title, horizon, progressType: "boolean" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/goals"] }); onSuccess(); },
  });
  return (
    <form onSubmit={e => { e.preventDefault(); if (title.trim()) mut.mutate(); }} className="space-y-4">
      <FormInput label="Goal" value={title} onChange={setTitle} placeholder="e.g. Run a 5K" required />
      <SegmentPicker label="Horizon"
        options={[
          { value: "this_week",  label: "This week"  },
          { value: "this_month", label: "This month" },
          { value: "this_year",  label: "This year"  },
        ]}
        value={horizon} onChange={setHorizon} />
      <SubmitButton loading={mut.isPending} disabled={!title.trim()} label="Add Goal" />
    </form>
  );
}

// ── Quick Log: Add Person ─────────────────────────────────────────────────────
function PersonForm({ onSuccess }: { onSuccess: () => void }) {
  const qc = useQueryClient();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const mut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/people", { firstName, lastName: lastName || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/people"] }); onSuccess(); },
  });
  return (
    <form onSubmit={e => { e.preventDefault(); if (firstName.trim()) mut.mutate(); }} className="space-y-4">
      <FormInput label="First name" value={firstName} onChange={setFirstName} placeholder="e.g. Sarah" required />
      <FormInput label="Last name (optional)" value={lastName} onChange={setLastName} placeholder="e.g. Johnson" />
      <SubmitButton loading={mut.isPending} disabled={!firstName.trim()} label="Add Friend" />
    </form>
  );
}

// ── Section form router ───────────────────────────────────────────────────────

function SectionForm({ section, onSuccess }: { section: SectionKey; onSuccess: () => void }) {
  const forms: Record<SectionKey, React.ReactNode> = {
    reading:        <ReadingForm        onSuccess={onSuccess} />,
    movies:         <MoviesForm         onSuccess={onSuccess} />,
    music:          <MusicForm          onSuccess={onSuccess} />,
    spots:          <SpotsForm          onSuccess={onSuccess} />,
    recipe:         <RecipesForm        onSuccess={onSuccess} />,
    task:           <TaskForm           onSuccess={onSuccess} />,
    goal:           <GoalForm           onSuccess={onSuccess} />,
    habit:          <HabitCreateForm    onSuccess={onSuccess} />,
    note:           <NoteForm           onSuccess={onSuccess} />,
    person:         <PersonForm         onSuccess={onSuccess} />,
    habit_complete: <HabitCompleteForm  onSuccess={onSuccess} />,
    task_complete:  <TaskCompleteForm   onSuccess={onSuccess} />,
    workout:        <WorkoutsForm       onSuccess={onSuccess} />,
  };
  return <>{forms[section]}</>;
}

// ── Recent adds row ───────────────────────────────────────────────────────────

function RecentAddsRow() {
  const { data: feed = [] } = useQuery<ActivityItem[]>({
    queryKey: ["/api/feed/mine"],
    queryFn: () => apiRequest("GET", "/api/feed/mine?limit=6").then(r => r.json()),
    staleTime: 30_000,
  });

  const recent = feed.slice(0, 3);
  if (recent.length === 0) return null;

  return (
    <div className="px-5 pb-3">
      <p className="text-[10px] text-muted-foreground font-medium mb-2 uppercase tracking-wide">Recently added</p>
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {recent.map(item => (
          <div
            key={item.id}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary/60 border border-border/40 shrink-0"
          >
            <span className="text-sm leading-none">{entityEmoji(item.itemType)}</span>
            <span className="text-xs font-medium truncate max-w-[120px]">{item.itemTitle}</span>
            <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(item.createdAt)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Success flash ─────────────────────────────────────────────────────────────

function SuccessFlash({ section, onDone }: { section: SectionKey; onDone: () => void }) {
  const s = ALL_SECTIONS.find(x => x.key === section)!;
  useEffect(() => {
    const t = setTimeout(onDone, 1400);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-3">
      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg">
        <Check size={28} className="text-white" strokeWidth={2.5} />
      </div>
      <div className="text-center">
        <p className="text-base font-bold">{s.emoji} Added!</p>
        <p className="text-xs text-muted-foreground mt-0.5">Saved to your {s.label}</p>
      </div>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

interface QuickAddModalProps {
  open: boolean;
  onClose: () => void;
  initialSection?: SectionKey | null;
}

export default function QuickAddModal({ open, onClose, initialSection }: QuickAddModalProps) {
  const [activeSection, setActiveSection] = useState<SectionKey | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const intentions = loadIntentions();
  const suggestedSections = getSuggestedSections(intentions);
  const persona = (() => { try { return localStorage.getItem("mylifos_onboarding_persona") ?? ""; } catch { return ""; } })();
  const orderedSections = getPersonaOrderedSections(persona);
  const quickCaptureSections = new Set<SectionKey>(["task", "note"]);
  const secondarySuggestedSections = suggestedSections.filter(key => !quickCaptureSections.has(key));
  const secondaryOrderedSections = orderedSections.filter(sec => !quickCaptureSections.has(sec.key));

  // Slide-up animation state
  const [visible, setVisible] = useState(false);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    if (open) {
      setRendered(true);
      if (initialSection) setActiveSection(initialSection);
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    } else {
      setVisible(false);
      const t = setTimeout(() => {
        setRendered(false);
        setActiveSection(null);
        setShowSuccess(false);
      }, 300);
      return () => clearTimeout(t);
    }
  }, [open, initialSection]);

  // Swipe-down to dismiss
  const touchStartY = useRef<number | null>(null);
  function onTouchStart(e: React.TouchEvent) {
    touchStartY.current = e.touches[0].clientY;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartY.current === null) return;
    const delta = e.changedTouches[0].clientY - touchStartY.current;
    if (delta > 90) onClose();
    touchStartY.current = null;
  }

  if (!rendered) return null;

  const activeInfo = activeSection ? ALL_SECTIONS.find(s => s.key === activeSection) : null;

  function handleSuccess() {
    setShowSuccess(true);
    // onDone in SuccessFlash will call this after delay
  }

  function handleSuccessDone() {
    setShowSuccess(false);
    setActiveSection(null);
    onClose();
  }

  // ── Shared inner content (header + body) ──────────────────────────────────
  const modalHeader = (
    <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b">
      {activeSection ? (
        <button
          onClick={() => { setActiveSection(null); setShowSuccess(false); }}
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={15} />
          Back
        </button>
      ) : (
        <span className="font-bold text-base">Add Something</span>
      )}
      <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
        <X size={16} />
      </button>
    </div>
  );

  const modalBody = (
    <>
      {showSuccess && activeSection ? (
        <div className="pb-10">
          <SuccessFlash section={activeSection} onDone={handleSuccessDone} />
        </div>
      ) : activeSection && activeInfo ? (
        /* Section form view */
        <div className="px-5 pt-5 pb-10 space-y-5">
          <div className="flex items-center gap-2.5">
            <span className="text-3xl leading-none">{activeInfo.emoji}</span>
            <div>
              <p className="font-bold text-base leading-tight">{activeInfo.label}</p>
              <p className="text-xs text-muted-foreground">{activeInfo.sub}</p>
            </div>
          </div>
          <SectionForm section={activeSection} onSuccess={handleSuccess} />
        </div>
      ) : (
        /* Persona-sorted single grid */
        <div className="px-4 pb-10 space-y-5 pt-2">
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2.5 px-1">
              Quick Capture
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              {(["task", "note"] as SectionKey[]).map(key => {
                const sec = SECTION_MAP[key];
                return (
                  <button
                    key={sec.key}
                    onClick={() => setActiveSection(sec.key)}
                    className="flex items-center gap-3 px-4 py-4 rounded-2xl bg-secondary/50 hover:bg-secondary border border-border/60 hover:border-primary/30 transition-all active:scale-95 text-left"
                  >
                    <span className="text-2xl leading-none shrink-0">{sec.emoji}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold leading-tight truncate">{sec.label}</p>
                      <p className="text-[11px] text-muted-foreground leading-tight truncate">{sec.sub}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Suggested section (shown when user has intentions) */}
          {secondarySuggestedSections.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2.5 px-1">
                ✨ Suggested for You
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                {secondarySuggestedSections.map(key => {
                  const sec = SECTION_MAP[key];
                  if (!sec) return null;
                  return (
                    <button
                      key={sec.key}
                      onClick={() => setActiveSection(sec.key)}
                      className="flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-primary/6 hover:bg-primary/12 border border-primary/20 hover:border-primary/40 transition-all active:scale-95 text-left"
                    >
                      <span className="text-2xl leading-none shrink-0">{sec.emoji}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold leading-tight truncate">{sec.label}</p>
                        <p className="text-[11px] text-muted-foreground leading-tight truncate">{sec.sub}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* All sections, ordered by persona */}
          <div>
            {secondarySuggestedSections.length > 0 && (
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2.5 px-1">
                All Options
              </p>
            )}
            <div className="grid grid-cols-2 gap-2.5">
              {secondaryOrderedSections.map(sec => (
                <button
                  key={sec.key}
                  onClick={() => setActiveSection(sec.key)}
                  className="flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-secondary/50 hover:bg-violet-500/10 border border-transparent hover:border-violet-400/30 transition-all active:scale-95 text-left"
                >
                  <span className="text-2xl leading-none shrink-0">{sec.emoji}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-tight truncate">{sec.label}</p>
                    <p className="text-[11px] text-muted-foreground leading-tight truncate">{sec.sub}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );

  return (
    <>
      {/* Backdrop — shown on all screen sizes */}
      <div
        className={`fixed inset-0 z-[75] bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${visible ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />

      {/* ── Mobile: bottom sheet ──────────────────────────────────────────── */}
      <div
        className={`lg:hidden fixed bottom-0 left-0 right-0 z-[80] bg-card rounded-t-3xl shadow-2xl
          transition-transform duration-300 ease-out flex flex-col
          ${visible ? "translate-y-0" : "translate-y-full"}`}
        style={{ maxHeight: "calc(100dvh - 3.5rem)" }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>
        <div className="shrink-0">{modalHeader}</div>
        <div className="overflow-y-auto flex-1 min-h-0">
          {modalBody}
        </div>
      </div>

      {/* ── Desktop: centered dialog ──────────────────────────────────────── */}
      <div
        className={`hidden lg:flex fixed inset-0 z-[80] items-center justify-center transition-all duration-200
          ${visible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
      >
        <div
          className={`bg-card rounded-2xl shadow-2xl w-[440px] max-h-[80vh] flex flex-col overflow-hidden
            transition-all duration-200 ${visible ? "scale-100" : "scale-95"}`}
          onClick={e => e.stopPropagation()}
        >
          {modalHeader}
          <div className="overflow-y-auto flex-1">
            {modalBody}
          </div>
        </div>
      </div>
    </>
  );
}
