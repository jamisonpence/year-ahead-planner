import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  ArrowLeft, BookOpen, Film, Music2, ChefHat, MapPin, Palette, Quote,
  Target, Dumbbell, Leaf, Star, Heart, Lock, ChevronRight,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type ProfileData = {
  user: { id: number; name: string; avatarUrl: string | null; email: string };
  visibleTabs: string[];
  data: {
    reading?: Array<{ id: number; title: string; author: string | null; status: string; rating: number | null; isFavorite: boolean; coverUrl: string | null }>;
    movies?: Array<{ id: number; title: string; mediaType: string; status: string; rating: number | null; isFavorite: boolean; posterUrl: string | null; posterColor: string | null }>;
    music?: Array<{ id: number; name: string; isFavorite: boolean; genre: string | null; songs: Array<{ id: number; title: string; isFavorite: boolean }> }>;
    recipes?: Array<{ id: number; name: string; emoji: string; category: string | null; tags: string | null }>;
    spots?: Array<{ id: number; name: string; type: string; city: string | null; neighborhood: string | null; rating: number | null; isFavorite: boolean }>;
    art?: Array<{ id: number; title: string; artistName: string | null; medium: string | null; imageUrl: string | null; accentColor: string | null; whereViewed: string | null }>;
    quotes?: Array<{ id: number; text: string; author: string | null; category: string | null; isFavorite: boolean }>;
    goals?: Array<{ id: number; name: string; status: string; category: string }>;
    workouts?: Array<{ id: number; name: string; muscleGroup: string | null }>;
    plants?: Array<{ id: number; name: string; species: string | null; imageUrl: string | null }>;
  };
};

const TAB_META: Record<string, { label: string; icon: React.ElementType; key: string }> = {
  "/reading":    { label: "Reading",       icon: BookOpen,  key: "reading"  },
  "/movies":     { label: "Movies",        icon: Film,      key: "movies"   },
  "/music":      { label: "Music",         icon: Music2,    key: "music"    },
  "/recipes":    { label: "Recipes",       icon: ChefHat,   key: "recipes"  },
  "/spots":      { label: "Spots",         icon: MapPin,    key: "spots"    },
  "/art":        { label: "Art",           icon: Palette,   key: "art"      },
  "/quotes":     { label: "Quotes",        icon: Quote,     key: "quotes"   },
  "/goals":      { label: "Goals",         icon: Target,    key: "goals"    },
  "/workouts":   { label: "Workouts",      icon: Dumbbell,  key: "workouts" },
  "/plants":     { label: "Plants",        icon: Leaf,      key: "plants"   },
};

function Avatar({ name, avatarUrl, size = 48 }: { name: string; avatarUrl: string | null; size?: number }) {
  if (avatarUrl) return <img src={avatarUrl} alt={name} className="rounded-full shrink-0 object-cover" style={{ width: size, height: size }} />;
  return (
    <div className="rounded-full bg-primary/15 flex items-center justify-center font-bold text-primary shrink-0" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function Stars({ rating }: { rating: number | null }) {
  if (!rating) return null;
  return (
    <span className="flex items-center gap-0.5">
      {[1,2,3,4,5].map(i => (
        <Star key={i} size={10} className={i <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/20"} />
      ))}
    </span>
  );
}

// ── Tab content panels ────────────────────────────────────────────────────────

function ReadingPanel({ books }: { books: ProfileData["data"]["reading"] }) {
  if (!books?.length) return <Empty label="No books yet" />;
  const current = books.filter(b => b.status === "reading");
  const read = books.filter(b => b.status === "read");
  const want = books.filter(b => b.status === "want_to_read");
  return (
    <div className="space-y-6">
      {current.length > 0 && <BookGroup label="Currently Reading" books={current} />}
      {read.length > 0 && <BookGroup label="Read" books={read} />}
      {want.length > 0 && <BookGroup label="Want to Read" books={want} />}
    </div>
  );
}

function BookGroup({ label, books }: { label: string; books: NonNullable<ProfileData["data"]["reading"]> }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{label} ({books.length})</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {books.map(b => (
          <div key={b.id} className="flex items-start gap-3 p-3 rounded-xl border bg-card">
            {b.coverUrl ? (
              <img src={b.coverUrl} alt={b.title} className="w-10 h-14 object-cover rounded shrink-0" />
            ) : (
              <div className="w-10 h-14 rounded bg-primary/10 flex items-center justify-center shrink-0">
                <BookOpen size={16} className="text-primary/50" />
              </div>
            )}
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-sm font-medium leading-snug truncate">{b.title}</p>
              {b.author && <p className="text-xs text-muted-foreground truncate">{b.author}</p>}
              <div className="flex items-center gap-2 mt-1">
                <Stars rating={b.rating} />
                {b.isFavorite && <Heart size={10} className="fill-red-400 text-red-400" />}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MoviesPanel({ items }: { items: ProfileData["data"]["movies"] }) {
  if (!items?.length) return <Empty label="No movies or shows yet" />;
  const movies = items.filter(m => m.mediaType !== "show");
  const shows = items.filter(m => m.mediaType === "show");
  return (
    <div className="space-y-6">
      {movies.length > 0 && <MediaGroup label="Movies" items={movies} />}
      {shows.length > 0 && <MediaGroup label="Shows" items={shows} />}
    </div>
  );
}

function MediaGroup({ label, items }: { label: string; items: NonNullable<ProfileData["data"]["movies"]> }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{label} ({items.length})</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {items.map(m => (
          <div key={m.id} className="rounded-xl border bg-card overflow-hidden">
            {m.posterUrl ? (
              <img src={m.posterUrl} alt={m.title} className="w-full aspect-[2/3] object-cover" />
            ) : (
              <div className="w-full aspect-[2/3] flex items-center justify-center" style={{ backgroundColor: m.posterColor || "hsl(var(--secondary))" }}>
                <Film size={24} className="text-white/50" />
              </div>
            )}
            <div className="p-2">
              <p className="text-xs font-medium leading-snug line-clamp-2">{m.title}</p>
              <div className="flex items-center gap-1.5 mt-1">
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${m.status === "watched" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-secondary text-muted-foreground"}`}>
                  {m.status === "watched" ? "Watched" : "Watchlist"}
                </span>
                {m.isFavorite && <Heart size={9} className="fill-red-400 text-red-400" />}
              </div>
              <Stars rating={m.rating} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MusicPanel({ artists }: { artists: ProfileData["data"]["music"] }) {
  if (!artists?.length) return <Empty label="No music yet" />;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {artists.map(a => (
        <div key={a.id} className="p-3 rounded-xl border bg-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
              <Music2 size={14} className="text-purple-500" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{a.name}</p>
              {a.genre && <p className="text-xs text-muted-foreground">{a.genre}</p>}
            </div>
            {a.isFavorite && <Heart size={12} className="fill-red-400 text-red-400 ml-auto shrink-0" />}
          </div>
          {a.songs.length > 0 && (
            <div className="space-y-1 pl-2 border-l ml-4">
              {a.songs.slice(0, 4).map((s: any) => (
                <p key={s.id} className="text-xs text-muted-foreground truncate flex items-center gap-1">
                  {s.isFavorite && <Heart size={8} className="fill-red-400 text-red-400 shrink-0" />}
                  {s.title}
                </p>
              ))}
              {a.songs.length > 4 && <p className="text-xs text-muted-foreground/60">+{a.songs.length - 4} more</p>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function RecipesPanel({ recipes }: { recipes: ProfileData["data"]["recipes"] }) {
  if (!recipes?.length) return <Empty label="No recipes yet" />;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
      {recipes.map(r => (
        <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl border bg-card">
          <span className="text-2xl leading-none shrink-0">{r.emoji || "🍽️"}</span>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{r.name}</p>
            {r.category && <p className="text-xs text-muted-foreground capitalize">{r.category.replace(/_/g, " ")}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

function SpotsPanel({ spots }: { spots: ProfileData["data"]["spots"] }) {
  if (!spots?.length) return <Empty label="No spots yet" />;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {spots.map(s => (
        <div key={s.id} className="flex items-start gap-3 p-3 rounded-xl border bg-card">
          <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0 mt-0.5">
            <MapPin size={14} className="text-orange-500" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium truncate">{s.name}</p>
              {s.isFavorite && <Heart size={10} className="fill-red-400 text-red-400 shrink-0" />}
            </div>
            <p className="text-xs text-muted-foreground capitalize">{s.type.replace(/_/g, " ")}{s.city ? ` · ${s.city}` : ""}</p>
            <Stars rating={s.rating} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ArtPanel({ pieces }: { pieces: ProfileData["data"]["art"] }) {
  if (!pieces?.length) return <Empty label="No art yet" />;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {pieces.map(p => (
        <div key={p.id} className="rounded-xl border bg-card overflow-hidden">
          {p.imageUrl ? (
            <img src={p.imageUrl} alt={p.title} className="w-full aspect-square object-cover" />
          ) : (
            <div className="w-full aspect-square flex items-center justify-center" style={{ backgroundColor: p.accentColor || "hsl(var(--secondary))" }}>
              <Palette size={24} className="text-white/50" />
            </div>
          )}
          <div className="p-2">
            <p className="text-xs font-semibold leading-snug line-clamp-2">{p.title}</p>
            {p.artistName && <p className="text-[10px] text-muted-foreground truncate">{p.artistName}</p>}
            {p.whereViewed && <p className="text-[10px] text-muted-foreground/60 truncate">{p.whereViewed}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

function QuotesPanel({ quotes }: { quotes: ProfileData["data"]["quotes"] }) {
  if (!quotes?.length) return <Empty label="No quotes yet" />;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {quotes.map(q => (
        <div key={q.id} className="p-4 rounded-xl border bg-card flex flex-col gap-2">
          <p className="text-sm italic leading-relaxed text-foreground">"{q.text}"</p>
          <div className="flex items-center justify-between mt-auto">
            <div>
              {q.author && <p className="text-xs font-medium text-muted-foreground">— {q.author}</p>}
              {q.category && <p className="text-xs text-muted-foreground/60 capitalize">{q.category}</p>}
            </div>
            {q.isFavorite && <Heart size={12} className="fill-red-400 text-red-400 shrink-0" />}
          </div>
        </div>
      ))}
    </div>
  );
}

function GoalsPanel({ goals }: { goals: ProfileData["data"]["goals"] }) {
  if (!goals?.length) return <Empty label="No goals yet" />;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {goals.map(g => (
        <div key={g.id} className="flex items-center gap-3 p-3 rounded-xl border bg-card">
          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: g.status === "completed" ? "hsl(142 71% 45%)" : "hsl(var(--cat-goal))" }} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{g.name}</p>
            <p className="text-xs text-muted-foreground capitalize">{g.category?.replace(/_/g, " ")}</p>
          </div>
          <span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 ${g.status === "completed" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-secondary text-muted-foreground"}`}>
            {g.status === "completed" ? "Done" : "Active"}
          </span>
        </div>
      ))}
    </div>
  );
}

function WorkoutsPanel({ workouts }: { workouts: ProfileData["data"]["workouts"] }) {
  if (!workouts?.length) return <Empty label="No workouts yet" />;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {workouts.map(w => (
        <div key={w.id} className="flex items-center gap-3 p-3 rounded-xl border bg-card">
          <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
            <Dumbbell size={14} className="text-blue-500" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{w.name}</p>
            {w.muscleGroup && <p className="text-xs text-muted-foreground capitalize">{w.muscleGroup.replace(/_/g, " ")}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

function PlantsPanel({ plants }: { plants: ProfileData["data"]["plants"] }) {
  if (!plants?.length) return <Empty label="No plants yet" />;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
      {plants.map(p => (
        <div key={p.id} className="rounded-xl border bg-card overflow-hidden">
          {p.imageUrl ? (
            <img src={p.imageUrl} alt={p.name} className="w-full aspect-square object-cover" />
          ) : (
            <div className="w-full aspect-square bg-green-50 dark:bg-green-950/20 flex items-center justify-center">
              <Leaf size={28} className="text-green-400" />
            </div>
          )}
          <div className="p-2">
            <p className="text-xs font-semibold truncate">{p.name}</p>
            {p.species && <p className="text-[10px] text-muted-foreground truncate italic">{p.species}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return <p className="text-sm text-muted-foreground py-8 text-center">{label}</p>;
}

// ── Main Profile Page ─────────────────────────────────────────────────────────

export default function ProfilePage() {
  const params = useParams<{ userId: string }>();
  const [, navigate] = useLocation();
  const userId = parseInt(params.userId ?? "0");

  const { data: profile, isLoading, isError } = useQuery<ProfileData>({
    queryKey: ["/api/profile", userId],
    queryFn: () => apiRequest("GET", `/api/profile/${userId}`).then(r => r.json()),
    enabled: !!userId,
  });

  const displayTabs = (profile?.visibleTabs ?? [])
    .filter(path => TAB_META[path])
    .map(path => ({ path, ...TAB_META[path] }));

  const [activeTab, setActiveTab] = useState<string | null>(null);
  const currentTab = activeTab ?? displayTabs[0]?.path ?? null;

  if (isLoading) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="h-8 w-32 bg-secondary rounded animate-pulse mb-6" />
        <div className="flex items-center gap-4 mb-8">
          <div className="w-20 h-20 rounded-full bg-secondary animate-pulse" />
          <div className="space-y-2">
            <div className="h-6 w-40 bg-secondary rounded animate-pulse" />
            <div className="h-4 w-28 bg-secondary rounded animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (isError || !profile) {
    return (
      <div className="p-8 max-w-4xl mx-auto text-center">
        <button onClick={() => navigate("/relationships")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8">
          <ArrowLeft size={15} /> Back to Relationships
        </button>
        <Lock size={36} className="mx-auto mb-3 text-muted-foreground/30" />
        <p className="text-muted-foreground">Profile not available.</p>
      </div>
    );
  }

  const { user, data } = profile;

  function renderContent() {
    if (!currentTab) return (
      <div className="text-center py-16">
        <Lock size={36} className="mx-auto mb-3 text-muted-foreground/30" />
        <p className="text-muted-foreground text-sm">{user.name} hasn't made any tabs public yet.</p>
      </div>
    );
    switch (currentTab) {
      case "/reading":   return <ReadingPanel books={data.reading} />;
      case "/movies":    return <MoviesPanel items={data.movies} />;
      case "/music":     return <MusicPanel artists={data.music} />;
      case "/recipes":   return <RecipesPanel recipes={data.recipes} />;
      case "/spots":     return <SpotsPanel spots={data.spots} />;
      case "/art":       return <ArtPanel pieces={data.art} />;
      case "/quotes":    return <QuotesPanel quotes={data.quotes} />;
      case "/goals":     return <GoalsPanel goals={data.goals} />;
      case "/workouts":  return <WorkoutsPanel workouts={data.workouts} />;
      case "/plants":    return <PlantsPanel plants={data.plants} />;
      default:           return <Empty label="Content coming soon" />;
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Back */}
      <button
        onClick={() => navigate("/relationships")}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft size={15} /> Back to Relationships
      </button>

      {/* Profile header */}
      <div className="flex items-center gap-4 mb-8 p-5 rounded-2xl border bg-card">
        <Avatar name={user.name} avatarUrl={user.avatarUrl} size={64} />
        <div>
          <h1 className="text-xl font-bold">{user.name}</h1>
          <p className="text-sm text-muted-foreground">{user.email}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {displayTabs.length === 0
              ? "No public tabs"
              : `${displayTabs.length} tab${displayTabs.length === 1 ? "" : "s"} shared`}
          </p>
        </div>
      </div>

      {displayTabs.length === 0 ? (
        <div className="text-center py-16">
          <Lock size={36} className="mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-muted-foreground">{user.name} hasn't made any tabs public yet.</p>
          <p className="text-xs text-muted-foreground/60 mt-1">They can change this in their Settings → Profile Privacy.</p>
        </div>
      ) : (
        <>
          {/* Tab bar */}
          <div className="flex flex-wrap gap-2 mb-6">
            {displayTabs.map(tab => {
              const Icon = tab.icon;
              const isActive = currentTab === tab.path;
              return (
                <button
                  key={tab.path}
                  onClick={() => setActiveTab(tab.path)}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium transition-all border ${
                    isActive
                      ? "bg-foreground text-background border-foreground"
                      : "border-border hover:bg-secondary text-muted-foreground"
                  }`}
                >
                  <Icon size={13} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Content */}
          <div>{renderContent()}</div>
        </>
      )}
    </div>
  );
}
