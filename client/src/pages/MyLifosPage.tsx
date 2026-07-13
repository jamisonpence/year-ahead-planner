import { useState } from "react";
import type { ElementType, ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Archive, BookMarked, ChevronRight, Heart, Inbox,
  Library, Search, Sparkles, StickyNote, ThumbsUp, Bookmark,
  Clock, Plus, TrendingUp, Users, Send,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { loadIntentions, type IntentionKey } from "@/components/OnboardingModal";

// ── Types ─────────────────────────────────────────────────────────────────────

type SavedItem = {
  type: string;
  title: string;
  subtitle?: string | null;
  imageUrl?: string | null;
  createdAt?: string;
  href?: string;
};

type Collection = {
  key: string;
  label: string;
  href: string;
  count: number;
  items: string[];
};

type SharedItem = {
  id: number;
  recType: string;
  title: string;
  subtitle?: string | null;
  note?: string | null;
  createdAt: string;
  fromUser: { id: number; name: string; avatarUrl: string | null };
};

type FavoriteItem = {
  type: string;
  id: number;
  title: string;
  subtitle?: string | null;
  href: string;
};

type NoteItem = {
  id: number;
  title: string;
  date: string;
  mood?: string | null;
};

type HubData = {
  recentlySaved: SavedItem[];
  collections: Collection[];
  sharedWithMe: SharedItem[];
  favorites: FavoriteItem[];
  privateNotes: { total: number; recent: NoteItem[] };
  lifeStats: {
    totalItems: number;
    friendsCount: number;
    recommendationsSent: number;
    counts: Record<string, number>;
  };
};

type SearchResult = {
  type: string;
  id: number;
  title: string;
  sub?: string | null;
  href: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function cardClass(extra = "") {
  return `rounded-xl border bg-card ${extra}`;
}

function typeLabel(type: string) {
  return type.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function savedItemHref(item: SavedItem) {
  const type = item.type?.toLowerCase();
  const map: Record<string, string> = {
    art: "/library?tab=art",
    artist: "/library?tab=music",
    book: "/library",
    chore: "/housekeeping",
    event: "/calendar",
    goal: "/goals",
    habit: "/habits",
    hobby: "/hobbies",
    interest: "/hobbies",
    journal: "/journal",
    movie: "/library?tab=watching",
    note: "/journal",
    person: "/people",
    place: "/places",
    quote: "/quotes",
    recipe: "/health?tab=recipes",
    song: "/library?tab=music",
    spot: "/places",
    task: "/tasks",
    trip: "/places?tab=trips",
    workout: "/health",
  };
  return item.href || map[type] || "/mylifos";
}

function SectionHeader({
  icon: Icon, title, href,
}: { icon: ElementType; title: string; href?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <div className="flex items-center gap-2">
        <Icon size={15} className="text-primary" />
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      {href && (
        <Link href={href}>
          <a className="text-xs text-primary hover:underline">Open</a>
        </Link>
      )}
    </div>
  );
}

// ── First-save action definitions ─────────────────────────────────────────────

interface SaveAction {
  id: string;
  emoji: string;
  label: string;
  sub: string;
  href: string;
  /** counts key in lifeStats.counts — used to suppress if user already has content */
  countKey?: string;
}

const ALL_SAVE_ACTIONS: SaveAction[] = [
  { id: "book",     emoji: "📚", label: "Save a book",           sub: "Track what you're reading",          href: "/reading",             countKey: "reading"  },
  { id: "place",    emoji: "📍", label: "Add a place",           sub: "Restaurants, trips, spots to keep",  href: "/places",              countKey: "spots"    },
  { id: "recipe",   emoji: "🍽️", label: "Save a recipe",         sub: "Food you love making or eating",     href: "/health?tab=recipes",  countKey: "recipes"  },
  { id: "note",     emoji: "📝", label: "Write a private note",  sub: "Thoughts that stay with you",        href: "/journal",             countKey: "journal"  },
  { id: "interest", emoji: "✨", label: "Add an interest",        sub: "Hobbies and things you love",        href: "/hobbies",             countKey: "hobbies"  },
  { id: "music",    emoji: "🎵", label: "Save an artist",        sub: "Music that moves you",               href: "/library?tab=music",   countKey: "music"    },
  { id: "movie",    emoji: "🎬", label: "Add a movie or show",   sub: "Build your watch list",              href: "/library?tab=watching",countKey: "movies"   },
  { id: "person",   emoji: "👤", label: "Add a friend",          sub: "Keep up with people you care about", href: "/people",              countKey: "relationships" },
  { id: "workout",  emoji: "💪", label: "Log a workout",         sub: "Start tracking your fitness",        href: "/health",              countKey: "workouts" },
  { id: "favorite", emoji: "❤️", label: "Mark a favorite",       sub: "Heart any item to save it here",     href: "/library",             countKey: undefined  },
];

const ACTION_MAP = Object.fromEntries(ALL_SAVE_ACTIONS.map(a => [a.id, a]));

// Persona default order
const PERSONA_SAVE_ORDER: Record<string, string[]> = {
  momentum:     ["book", "note", "interest", "recipe", "movie", "music", "place", "person", "workout", "favorite"],
  health:       ["workout", "recipe", "interest", "note", "book", "place", "music", "movie", "person", "favorite"],
  explore_life: ["book", "place", "recipe", "music", "movie", "interest", "note", "person", "workout", "favorite"],
  connect:      ["person", "book", "place", "note", "recipe", "music", "movie", "interest", "workout", "favorite"],
};

// Intention boosters — move these to the front
const INTENTION_SAVE_BOOST: Partial<Record<IntentionKey, string[]>> = {
  save_recs:       ["book", "music", "movie"],
  organize_places: ["place"],
  track_workouts:  ["workout", "recipe"],
  private_notes:   ["note"],
  connect_friends: ["person"],
  goal:            ["note"],
  habit:           ["interest"],
};

function buildFirstSaveActions(
  persona: string,
  intentions: IntentionKey[],
  counts: Record<string, number>,
  max = 6,
): SaveAction[] {
  const base = PERSONA_SAVE_ORDER[persona] ?? PERSONA_SAVE_ORDER.momentum;

  // Intention boosts go first (deduplicated)
  const boosted: string[] = [];
  for (const intent of intentions) {
    for (const id of INTENTION_SAVE_BOOST[intent] ?? []) {
      if (!boosted.includes(id)) boosted.push(id);
    }
  }

  // Merge: boosted → then persona order, deduplicated
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const id of [...boosted, ...base]) {
    if (!seen.has(id)) { seen.add(id); ordered.push(id); }
  }

  // Filter out things the user already has AND that have a countKey
  return ordered
    .map(id => ACTION_MAP[id])
    .filter(Boolean)
    .filter(a => !a.countKey || (counts[a.countKey] ?? 0) === 0)
    .slice(0, max);
}

// ── Shared sub-components ─────────────────────────────────────────────────────

const SHORTCUTS = [
  ["/library",      "📚 Media"],
  ["/hobbies",      "🎸 Interests"],
  ["/health",       "🏋️ Health"],
  ["/places",       "📍 Places"],
  ["/housekeeping", "🏠 Home"],
  ["/budget",       "💰 Finance"],
  ["/faith",        "🕊️ Faith"],
  ["/politics",     "🗳️ Civic"],
] as const;

function RecentlyScrollRow({ items }: { items: SavedItem[] }) {
  if (items.length === 0) return null;
  return (
    <section>
      <div className="flex items-center gap-2 mb-2.5 px-0.5">
        <Clock size={13} className="text-muted-foreground" />
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Pick up where you left off
        </h2>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory">
        {items.slice(0, 5).map((item, idx) => (
          <Link key={`${item.type}-${item.title}-${idx}`} href={savedItemHref(item)}>
            <a className="group flex-none w-44 rounded-xl border bg-card hover:shadow-sm hover:border-primary/30 transition-all snap-start cursor-pointer overflow-hidden">
              {item.imageUrl ? (
                <img src={item.imageUrl} alt={item.title} className="w-full h-24 object-cover" />
              ) : (
                <div className="w-full h-24 bg-secondary/50 flex items-center justify-center">
                  <Archive size={22} className="text-muted-foreground opacity-30 group-hover:text-primary group-hover:opacity-60 transition-colors" />
                </div>
              )}
              <div className="p-2.5">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium truncate leading-snug group-hover:text-primary transition-colors">{item.title}</p>
                  <ChevronRight size={12} className="shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {typeLabel(item.type)}{item.subtitle ? ` · ${item.subtitle}` : ""}
                </p>
              </div>
            </a>
          </Link>
        ))}
      </div>
    </section>
  );
}

function CollectionsGrid({ collections }: { collections: Collection[] }) {
  // In capture mode show all collections even with 0 count as entry points
  const show = collections.filter(c => c.count > 0);
  if (show.length === 0) return null;
  return (
    <section className={cardClass("p-4")}>
      <SectionHeader icon={Library} title="Collections" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {show.map((col) => (
          <Link key={col.key} href={col.href}>
            <a className="group rounded-xl border bg-background p-3 hover:bg-secondary/60 transition-colors block">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold group-hover:text-primary transition-colors truncate">{col.label}</p>
                <ChevronRight size={13} className="text-muted-foreground shrink-0" />
              </div>
              <p className="text-2xl font-bold mt-2.5 tabular-nums">{col.count}</p>
              <p className="text-xs text-muted-foreground mt-1 truncate">{col.items.join(" · ")}</p>
            </a>
          </Link>
        ))}
      </div>
    </section>
  );
}

function SharedWithMeCard({ items, thankMut, thankedIds }: {
  items: SharedItem[];
  thankMut: { mutate: (id: number) => void; isPending: boolean };
  thankedIds: Set<number>;
}) {
  return (
    <div className={cardClass("p-4")}>
      <SectionHeader icon={Inbox} title="Shared with me" href="/people?tab=discover" />
      {items.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground">
          <Inbox size={24} className="mx-auto mb-2 opacity-20" />
          <p className="text-sm font-medium text-foreground">No recommendations yet</p>
          <p className="text-xs mt-1">Connect with friends to receive books, movies, and place recommendations.</p>
          <Link href="/people"><a className="inline-block mt-3 text-xs font-medium text-primary hover:underline">Add friends →</a></Link>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const thanked = thankedIds.has(item.id);
            return (
              <div key={`${item.recType}-${item.id}`} className="rounded-xl border bg-background p-3">
                <div className="flex items-start gap-2.5">
                  {item.fromUser.avatarUrl ? (
                    <img src={item.fromUser.avatarUrl} alt={item.fromUser.name} className="w-7 h-7 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 text-xs font-bold">
                      {item.fromUser.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{typeLabel(item.recType)} · from {item.fromUser.name}</p>
                    {item.note && (
                      <p className="text-xs text-muted-foreground mt-1.5 italic line-clamp-2 bg-secondary/50 rounded px-2 py-1">
                        "{item.note}"
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-border/60">
                  <button
                    onClick={() => !thanked && thankMut.mutate(item.id)}
                    disabled={thanked || thankMut.isPending}
                    className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                      thanked
                        ? "bg-primary/10 border-primary/20 text-primary cursor-default"
                        : "border-border hover:bg-secondary text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <ThumbsUp size={11} />
                    {thanked ? "Thanks sent" : "Thanks"}
                  </button>
                  <button className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border border-border hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                    <Bookmark size={11} /> Save
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FavoritesCard({ items }: { items: FavoriteItem[] }) {
  return (
    <div className={cardClass("p-4")}>
      <SectionHeader icon={Heart} title="Favorites" />
      {items.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground">
          <Heart size={24} className="mx-auto mb-2 opacity-20" />
          <p className="text-sm font-medium text-foreground">No favorites yet</p>
          <p className="text-xs mt-1">Heart items across your library to pin the best ones here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.slice(0, 8).map((item) => (
            <Link key={`${item.type}-${item.id}`} href={item.href}>
              <a className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 hover:bg-secondary/60 transition-colors">
                <Heart size={13} className="text-rose-500 fill-rose-500 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium truncate">{item.title}</span>
                  <span className="block text-xs text-muted-foreground truncate">
                    {typeLabel(item.type)}{item.subtitle ? ` · ${item.subtitle}` : ""}
                  </span>
                </span>
                <ChevronRight size={12} className="text-muted-foreground shrink-0 ml-auto" />
              </a>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function PrivateNotesCard({ notes }: { notes: { total: number; recent: NoteItem[] } }) {
  return (
    <div className={cardClass("p-4")}>
      <SectionHeader icon={StickyNote} title="Private notes" href="/journal" />
      {notes.recent.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground">
          <StickyNote size={24} className="mx-auto mb-2 opacity-20" />
          <p className="text-sm font-medium text-foreground">No private notes yet</p>
          <p className="text-xs mt-1">Write freely — private notes never appear in your feed.</p>
          <Link href="/journal"><a className="inline-block mt-3 text-xs font-medium text-primary hover:underline">Open Journal →</a></Link>
        </div>
      ) : (
        <div className="space-y-2">
          {notes.recent.map((note) => (
            <Link key={note.id} href="/journal">
              <a className="block rounded-lg border bg-background px-3 py-2 hover:bg-secondary/60 transition-colors">
                <p className="text-sm font-medium truncate">{note.title}</p>
                <p className="text-xs text-muted-foreground">{note.date}{note.mood ? ` · ${note.mood}` : ""}</p>
              </a>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Capture mode: First saves section ─────────────────────────────────────────

function FirstSavesSection({
  persona,
  intentions,
  counts,
}: {
  persona: string;
  intentions: IntentionKey[];
  counts: Record<string, number>;
}) {
  const actions = buildFirstSaveActions(persona, intentions, counts, 6);
  if (actions.length === 0) return null;

  return (
    <section>
      <div className="flex items-center gap-2 mb-3 px-0.5">
        <Plus size={13} className="text-primary" />
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Start saving — pick one
        </h2>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {actions.map((action) => (
          <Link key={action.id} href={action.href}>
            <a className="group flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-card border hover:bg-secondary/50 hover:border-primary/30 transition-all active:scale-95 text-left">
              <span className="text-2xl leading-none shrink-0">{action.emoji}</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-tight group-hover:text-primary transition-colors">{action.label}</p>
                <p className="text-[11px] text-muted-foreground leading-tight mt-0.5 truncate">{action.sub}</p>
              </div>
            </a>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ── Retrieval mode: Stats row ─────────────────────────────────────────────────

function StatsRow({ stats }: { stats: HubData["lifeStats"] }) {
  const items = [
    { icon: Archive,     label: "Items saved",   value: stats.totalItems         },
    { icon: Users,       label: "Friends",        value: stats.friendsCount       },
    { icon: Send,        label: "Recs sent",      value: stats.recommendationsSent },
  ];
  return (
    <section className={cardClass("p-4")}>
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp size={14} className="text-primary" />
        <h2 className="text-sm font-semibold">Your Library at a Glance</h2>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {items.map(({ icon: Icon, label, value }) => (
          <div key={label} className="text-center rounded-xl bg-secondary/40 py-3 px-2">
            <Icon size={16} className="mx-auto mb-1.5 text-primary opacity-60" />
            <p className="text-2xl font-bold tabular-nums">{value}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── All-collections entry points for capture mode ─────────────────────────────

function CaptureCollectionEntries({ collections }: { collections: Collection[] }) {
  // Show all categories as entry points — even 0-count ones as "add your first"
  const allEntries = [
    { key: "media",    label: "Media",       href: "/library",      emoji: "📚" },
    { key: "places",   label: "Places",      href: "/places",       emoji: "📍" },
    { key: "health",   label: "Health",      href: "/health",       emoji: "💪" },
    { key: "interests",label: "Interests",   href: "/hobbies",      emoji: "✨" },
    { key: "notes",    label: "Journal",     href: "/journal",      emoji: "📝" },
    { key: "people",   label: "People",      href: "/people",       emoji: "👤" },
  ];
  const countMap = Object.fromEntries(collections.map(c => [c.key, c.count]));

  return (
    <section className={cardClass("p-4")}>
      <SectionHeader icon={Library} title="Everything" />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {allEntries.map((e) => {
          const count = countMap[e.key];
          return (
            <Link key={e.key} href={e.href}>
              <a className="group rounded-xl border bg-background p-3 hover:bg-secondary/60 transition-colors block">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-lg">{e.emoji}</span>
                  <ChevronRight size={13} className="text-muted-foreground shrink-0" />
                </div>
                <p className="text-sm font-semibold mt-2 group-hover:text-primary transition-colors">{e.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {count != null && count > 0 ? `${count} item${count !== 1 ? "s" : ""}` : "Start adding →"}
                </p>
              </a>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MyLifosPage() {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [thankedIds, setThankedIds] = useState<Set<number>>(new Set());
  const searchTerm = query.trim();

  const persona    = (() => { try { return localStorage.getItem("mylifos_onboarding_persona") ?? ""; } catch { return ""; } })();
  const intentions = loadIntentions();

  const { data, isLoading } = useQuery<HubData>({
    queryKey: ["/api/mylifos/hub"],
    queryFn: async () => (await apiRequest("GET", "/api/mylifos/hub")).json(),
  });

  const { data: searchResults = [] } = useQuery<SearchResult[]>({
    queryKey: ["/api/search", searchTerm],
    enabled: searchTerm.length >= 2,
    queryFn: async () => (await apiRequest("GET", `/api/search?q=${encodeURIComponent(searchTerm)}`)).json(),
  });

  const thankMut = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", `/api/recommendations/${id}/react`, { type: "thanks" }),
    onSettled: (_data, _err, id) => {
      setThankedIds((prev) => new Set([...prev, id]));
      toast({ title: "Thanks sent! 👍" });
    },
  });

  // Determine mode: count only "library" categories the user intentionally saves
  const libraryCount = data
    ? (data.lifeStats.counts.reading ?? 0) +
      (data.lifeStats.counts.movies ?? 0) +
      (data.lifeStats.counts.music ?? 0) +
      (data.lifeStats.counts.recipes ?? 0) +
      (data.lifeStats.counts.spots ?? 0) +
      (data.lifeStats.counts.hobbies ?? 0) +
      (data.lifeStats.counts.journal ?? 0)
    : 0;
  const isCaptureMode = libraryCount < 5;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 space-y-5">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <header className="space-y-3">
          <div>
            <p className="text-xs font-semibold text-primary uppercase tracking-wider">MyLifos</p>
            <h1 className="text-2xl font-bold tracking-tight">Saved Life</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {isCaptureMode || !data
                ? "Save the things that matter — build your personal library."
                : "Your archive — everything you save, love, and receive."}
            </p>
          </div>

          {/* Search */}
          <div className={cardClass("p-3")}>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search everything in your library"
                className="pl-9 h-11"
              />
            </div>
            {searchTerm.length >= 2 && (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {searchResults.length === 0 ? (
                  <p className="text-sm text-muted-foreground px-1">No matches yet.</p>
                ) : searchResults.slice(0, 9).map((item) => (
                  <Link key={`${item.type}-${item.id}`} href={item.href}>
                    <a className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 hover:bg-secondary/70 transition-colors">
                      <span className="text-[10px] uppercase font-semibold text-muted-foreground border rounded-full px-1.5 py-0.5 shrink-0">
                        {typeLabel(item.type)}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium truncate">{item.title}</span>
                        {item.sub && <span className="block text-xs text-muted-foreground truncate">{item.sub}</span>}
                      </span>
                    </a>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </header>

        {/* ── Loading skeleton ─────────────────────────────────────────────── */}
        {isLoading || !data ? (
          <div className="space-y-4 animate-pulse">
            <div className="h-36 rounded-xl bg-secondary/50" />
            <div className="flex gap-3">
              <div className="flex-none w-44 h-40 rounded-xl bg-secondary/40" />
              <div className="flex-none w-44 h-40 rounded-xl bg-secondary/30" />
              <div className="flex-none w-44 h-40 rounded-xl bg-secondary/30" />
            </div>
            <div className="h-48 rounded-xl bg-secondary/40" />
          </div>

        ) : isCaptureMode ? (
          /* ── CAPTURE MODE ──────────────────────────────────────────────── */
          <>
            {/* 1. First saves — persona + intention aware */}
            <FirstSavesSection
              persona={persona}
              intentions={intentions}
              counts={data.lifeStats.counts}
            />

            {/* 2. Recently saved (if any) */}
            {data.recentlySaved.length > 0 && (
              <RecentlyScrollRow items={data.recentlySaved} />
            )}

            {/* 3. Everything — all category entry points */}
            <CaptureCollectionEntries collections={data.collections} />

            {/* 4. Browse shortcuts */}
            <section className={cardClass("p-4")}>
              <SectionHeader icon={Sparkles} title="Browse everything" />
              <div className="flex flex-wrap gap-2">
                {SHORTCUTS.map(([href, label]) => (
                  <Link key={href} href={href}>
                    <a className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm hover:bg-secondary transition-colors">
                      <BookMarked size={12} className="shrink-0 opacity-60" /> {label}
                    </a>
                  </Link>
                ))}
              </div>
            </section>
          </>

        ) : (
          /* ── RETRIEVAL MODE ────────────────────────────────────────────── */
          <>
            {/* 1. Continue where you left off */}
            <RecentlyScrollRow items={data.recentlySaved} />

            {/* 2. Shared with me + Favorites */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SharedWithMeCard
                items={data.sharedWithMe}
                thankMut={thankMut}
                thankedIds={thankedIds}
              />
              <FavoritesCard items={data.favorites} />
            </section>

            {/* 3. Collections */}
            <CollectionsGrid collections={data.collections} />

            {/* 4. Private notes + Browse */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <PrivateNotesCard notes={data.privateNotes} />
              <div className={cardClass("p-4")}>
                <SectionHeader icon={Sparkles} title="Browse everything" />
                <div className="flex flex-wrap gap-2">
                  {SHORTCUTS.map(([href, label]) => (
                    <Link key={href} href={href}>
                      <a className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm hover:bg-secondary transition-colors">
                        <BookMarked size={12} className="shrink-0 opacity-60" /> {label}
                      </a>
                    </Link>
                  ))}
                </div>
              </div>
            </section>

            {/* 5. Stats */}
            <StatsRow stats={data.lifeStats} />
          </>
        )}
      </div>
    </div>
  );
}
