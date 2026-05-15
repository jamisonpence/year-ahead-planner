import { useQuery } from "@tanstack/react-query";
import { BookOpen, Film, Music, UtensilsCrossed, MapPin, Quote, Users, Sparkles, TrendingUp, Heart } from "lucide-react";

// ── Type definitions ──────────────────────────────────────────────────────────

interface TasteProfileItem {
  category: string;
  count: number;
  percentage: number;
}

interface TrendingItem {
  itemType: string;
  itemTitle: string;
  itemImageUrl?: string;
  itemSubtitle?: string;
  friendCount: number;
}

interface RecommendedItem {
  itemType: string;
  itemTitle: string;
  itemImageUrl?: string;
  itemSubtitle?: string;
  friendName: string;
  friendId: number;
}

interface SharedTasteFriend {
  id: number;
  name: string;
  avatarUrl?: string;
  overlapCount: number;
  overlapPct: number;
  breakdown: { books: number; movies: number; songs: number; recipes: number };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CATEGORY_META: Record<string, { label: string; icon: React.FC<any>; color: string; bg: string }> = {
  book:    { label: "Books",     icon: BookOpen,       color: "text-amber-600",   bg: "bg-amber-100 dark:bg-amber-900/30" },
  movie:   { label: "Movies",    icon: Film,           color: "text-blue-600",    bg: "bg-blue-100 dark:bg-blue-900/30" },
  song:    { label: "Music",     icon: Music,          color: "text-pink-600",    bg: "bg-pink-100 dark:bg-pink-900/30" },
  recipe:  { label: "Recipes",   icon: UtensilsCrossed, color: "text-green-600",  bg: "bg-green-100 dark:bg-green-900/30" },
  spot:    { label: "Spots",     icon: MapPin,         color: "text-violet-600",  bg: "bg-violet-100 dark:bg-violet-900/30" },
  quote:   { label: "Quotes",    icon: Quote,          color: "text-orange-600",  bg: "bg-orange-100 dark:bg-orange-900/30" },
};

const BAR_COLORS = [
  "bg-violet-500",
  "bg-blue-500",
  "bg-pink-500",
  "bg-amber-500",
  "bg-green-500",
  "bg-orange-500",
];

function catLabel(type: string) {
  return CATEGORY_META[type]?.label ?? type.charAt(0).toUpperCase() + type.slice(1);
}

function catColor(type: string) {
  return CATEGORY_META[type]?.color ?? "text-muted-foreground";
}

function catBg(type: string) {
  return CATEGORY_META[type]?.bg ?? "bg-muted";
}

function CatIcon({ type, className }: { type: string; className?: string }) {
  const meta = CATEGORY_META[type];
  if (!meta) return null;
  const Icon = meta.icon;
  return <Icon className={className ?? "w-4 h-4"} />;
}

function ItemArtwork({ imageUrl, itemType, title }: { imageUrl?: string; itemType: string; title: string }) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={title}
        className="w-full h-full object-cover"
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
      />
    );
  }
  return (
    <div className={`w-full h-full flex items-center justify-center ${catBg(itemType)}`}>
      <CatIcon type={itemType} className={`w-7 h-7 ${catColor(itemType)}`} />
    </div>
  );
}

function InitialAvatar({ name, avatarUrl }: { name: string; avatarUrl?: string }) {
  if (avatarUrl) {
    return <img src={avatarUrl} alt={name} className="w-10 h-10 rounded-full object-cover" />;
  }
  const initials = name.split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();
  const colors = ["bg-violet-500", "bg-blue-500", "bg-pink-500", "bg-amber-500", "bg-green-500"];
  const idx = name.charCodeAt(0) % colors.length;
  return (
    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold ${colors[idx]}`}>
      {initials}
    </div>
  );
}

// ── Section: Taste Profile ────────────────────────────────────────────────────

function TasteProfileSection() {
  const { data, isLoading } = useQuery<TasteProfileItem[]>({
    queryKey: ["/api/discover/taste-profile"],
  });

  if (isLoading) {
    return (
      <div className="px-4 mb-8">
        <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-violet-500" /> Your Taste Profile
        </h2>
        <div className="space-y-3">
          {[70, 55, 40, 30].map((w, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-20 h-3 rounded bg-muted animate-pulse" />
              <div className={`h-3 rounded bg-muted animate-pulse`} style={{ width: `${w}%` }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="px-4 mb-8">
        <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-violet-500" /> Your Taste Profile
        </h2>
        <p className="text-sm text-muted-foreground">Start adding books, movies, music, and more to see your taste profile.</p>
      </div>
    );
  }

  return (
    <div className="px-4 mb-8">
      <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-violet-500" /> Your Taste Profile
      </h2>
      <div className="bg-card rounded-2xl border p-4 space-y-3.5">
        {data.map((item, i) => (
          <div key={item.category} className="flex items-center gap-3">
            <div className={`w-4 h-4 flex-shrink-0 ${catColor(item.category)}`}>
              <CatIcon type={item.category} className="w-4 h-4" />
            </div>
            <span className="text-sm w-16 flex-shrink-0 text-muted-foreground">{catLabel(item.category)}</span>
            <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${BAR_COLORS[i % BAR_COLORS.length]}`}
                style={{ width: `${item.percentage}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground w-9 text-right">{item.percentage}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Section: Trending with Friends ────────────────────────────────────────────

function TrendingSection() {
  const { data, isLoading } = useQuery<TrendingItem[]>({
    queryKey: ["/api/discover/trending"],
  });

  if (isLoading) {
    return (
      <div className="mb-8">
        <h2 className="text-base font-semibold mb-3 px-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-pink-500" /> Trending with Friends
        </h2>
        <div className="flex gap-3 overflow-x-auto px-4 pb-2 scrollbar-none">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex-shrink-0 w-28">
              <div className="w-28 h-36 rounded-xl bg-muted animate-pulse mb-2" />
              <div className="h-3 bg-muted rounded animate-pulse mb-1 w-full" />
              <div className="h-3 bg-muted rounded animate-pulse w-2/3" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="px-4 mb-8">
        <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-pink-500" /> Trending with Friends
        </h2>
        <p className="text-sm text-muted-foreground">Connect with friends and start saving things to see what's trending in your circle.</p>
      </div>
    );
  }

  return (
    <div className="mb-8">
      <h2 className="text-base font-semibold mb-3 px-4 flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-pink-500" /> Trending with Friends
      </h2>
      <div className="flex gap-3 overflow-x-auto px-4 pb-2 scrollbar-none">
        {data.map((item, i) => (
          <div key={`${item.itemType}-${item.itemTitle}-${i}`} className="flex-shrink-0 w-28">
            <div className="w-28 h-36 rounded-xl overflow-hidden bg-muted mb-2 relative">
              <ItemArtwork imageUrl={item.itemImageUrl} itemType={item.itemType} title={item.itemTitle} />
              {/* Friend count badge */}
              <div className="absolute bottom-1.5 left-1.5 bg-black/60 text-white text-[10px] font-medium px-1.5 py-0.5 rounded-full flex items-center gap-1">
                <Users className="w-2.5 h-2.5" />
                {item.friendCount}
              </div>
            </div>
            <p className="text-xs font-medium leading-tight line-clamp-2">{item.itemTitle}</p>
            {item.itemSubtitle && (
              <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{item.itemSubtitle}</p>
            )}
            <p className="text-[10px] text-pink-500 mt-0.5">{item.friendCount} friend{item.friendCount !== 1 ? "s" : ""} saved this</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Section: You Might Like ────────────────────────────────────────────────────

function YouMightLikeSection() {
  const { data, isLoading } = useQuery<RecommendedItem[]>({
    queryKey: ["/api/discover/you-might-like"],
  });

  if (isLoading) {
    return (
      <div className="px-4 mb-8">
        <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
          <Heart className="w-4 h-4 text-red-500" /> You Might Like
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex gap-3 p-3 rounded-xl bg-muted/40 border">
              <div className="w-14 h-14 rounded-lg bg-muted animate-pulse flex-shrink-0" />
              <div className="flex-1 min-w-0 space-y-1.5 pt-0.5">
                <div className="h-3 bg-muted rounded animate-pulse w-full" />
                <div className="h-3 bg-muted rounded animate-pulse w-3/4" />
                <div className="h-2.5 bg-muted rounded animate-pulse w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="px-4 mb-8">
        <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
          <Heart className="w-4 h-4 text-red-500" /> You Might Like
        </h2>
        <p className="text-sm text-muted-foreground">Add more to your collections and connect with friends to get personalized recommendations.</p>
      </div>
    );
  }

  return (
    <div className="px-4 mb-8">
      <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
        <Heart className="w-4 h-4 text-red-500" /> You Might Like
      </h2>
      <div className="grid grid-cols-2 gap-3">
        {data.map((item, i) => (
          <div
            key={`${item.itemType}-${item.itemTitle}-${i}`}
            className="flex gap-3 p-3 rounded-xl bg-card border"
          >
            <div className="w-14 h-14 rounded-lg overflow-hidden bg-muted flex-shrink-0">
              <ItemArtwork imageUrl={item.itemImageUrl} itemType={item.itemType} title={item.itemTitle} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold line-clamp-2 leading-tight">{item.itemTitle}</p>
              {item.itemSubtitle && (
                <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{item.itemSubtitle}</p>
              )}
              <div className={`mt-1 inline-flex items-center gap-0.5 text-[10px] font-medium ${catColor(item.itemType)}`}>
                <CatIcon type={item.itemType} className="w-3 h-3" />
                <span>{catLabel(item.itemType)}</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">via {item.friendName}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Section: Shared Taste ─────────────────────────────────────────────────────

function SharedTasteSection() {
  const { data, isLoading } = useQuery<SharedTasteFriend[]>({
    queryKey: ["/api/discover/shared-taste"],
  });

  if (isLoading) {
    return (
      <div className="px-4 mb-8">
        <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
          <Users className="w-4 h-4 text-violet-500" /> Shared Taste
        </h2>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 border">
              <div className="w-10 h-10 rounded-full bg-muted animate-pulse" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-muted rounded animate-pulse w-28" />
                <div className="h-2 bg-muted rounded animate-pulse w-full" />
              </div>
              <div className="h-5 w-12 bg-muted rounded-full animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="px-4 mb-8">
        <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
          <Users className="w-4 h-4 text-violet-500" /> Shared Taste
        </h2>
        <p className="text-sm text-muted-foreground">Add friends to see how much your tastes overlap!</p>
      </div>
    );
  }

  return (
    <div className="px-4 mb-8">
      <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
        <Users className="w-4 h-4 text-violet-500" /> Shared Taste
      </h2>
      <div className="space-y-3">
        {data.map(friend => {
          const { books, movies, songs, recipes } = friend.breakdown;
          const cats = [
            { type: "book", count: books },
            { type: "movie", count: movies },
            { type: "song", count: songs },
            { type: "recipe", count: recipes },
          ].filter(c => c.count > 0);

          return (
            <div key={friend.id} className="flex items-center gap-3 p-3 rounded-2xl bg-card border">
              <InitialAvatar name={friend.name} avatarUrl={friend.avatarUrl} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{friend.name}</p>
                {cats.length > 0 ? (
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
                    {cats.map(c => (
                      <span key={c.type} className={`text-[10px] flex items-center gap-0.5 ${catColor(c.type)}`}>
                        <CatIcon type={c.type} className="w-2.5 h-2.5" />
                        {c.count} {catLabel(c.type).toLowerCase()}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-muted-foreground mt-0.5">{friend.overlapCount} item{friend.overlapCount !== 1 ? "s" : ""} in common</p>
                )}
              </div>
              <div className="flex-shrink-0 text-center">
                <div
                  className="text-sm font-bold"
                  style={{
                    color: friend.overlapPct >= 50
                      ? "#7c3aed"
                      : friend.overlapPct >= 25
                        ? "#2563eb"
                        : undefined,
                  }}
                >
                  {friend.overlapPct}%
                </div>
                <div className="text-[10px] text-muted-foreground">match</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DiscoverPage() {
  return (
    <div className="min-h-screen bg-background pb-4">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-4 py-3 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">Discover</h1>
            <p className="text-xs text-muted-foreground">Explore based on your tastes</p>
          </div>
          <div className="w-8 h-8 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-violet-500" />
          </div>
        </div>
      </div>

      <TasteProfileSection />
      <TrendingSection />
      <YouMightLikeSection />
      <SharedTasteSection />
    </div>
  );
}
