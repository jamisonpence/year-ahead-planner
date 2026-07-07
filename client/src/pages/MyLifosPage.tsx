import { useState } from "react";
import type { ElementType, ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Archive, BookMarked, ChevronRight, Heart, Inbox,
  Library, Search, Sparkles, StickyNote, ThumbsUp, Bookmark,
  Clock,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

type SavedItem = {
  type: string;
  title: string;
  subtitle?: string | null;
  imageUrl?: string | null;
  createdAt?: string;
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

function cardClass(extra = "") {
  return `rounded-xl border bg-card ${extra}`;
}

function typeLabel(type: string) {
  return type.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function EmptyState({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground py-6 text-center">{children}</p>;
}

function SectionHeader({ icon: Icon, title, href }: { icon: ElementType; title: string; href?: string }) {
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

const SHORTCUTS = [
  ["/library", "📚 Media"],
  ["/hobbies", "🎸 Interests"],
  ["/health", "🏋️ Health"],
  ["/places", "📍 Places"],
  ["/housekeeping", "🏠 Home"],
  ["/budget", "💰 Finance"],
  ["/faith", "🕊️ Faith"],
  ["/politics", "🗳️ Civic"],
] as const;

export default function MyLifosPage() {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [thankedIds, setThankedIds] = useState<Set<number>>(new Set());
  const searchTerm = query.trim();

  const { data, isLoading } = useQuery<HubData>({
    queryKey: ["/api/mylifos/hub"],
    queryFn: async () => (await apiRequest("GET", "/api/mylifos/hub")).json(),
  });

  const { data: searchResults = [] } = useQuery<SearchResult[]>({
    queryKey: ["/api/search", searchTerm],
    enabled: searchTerm.length >= 2,
    queryFn: async () => (await apiRequest("GET", `/api/search?q=${encodeURIComponent(searchTerm)}`)).json(),
  });

  // Quick "Thanks" on shared recommendations
  const thankMut = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", `/api/recommendations/${id}/react`, { type: "thanks" }),
    onSettled: (_data, _err, id) => {
      // Update UI regardless of server response
      setThankedIds((prev) => new Set([...prev, id]));
      toast({ title: "Thanks sent! 👍" });
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 space-y-5">

        {/* ── Header ────────────────────────────────────────────────────── */}
        <header className="space-y-3">
          <div>
            <p className="text-xs font-semibold text-primary uppercase tracking-wider">Library</p>
            <h1 className="text-2xl font-bold tracking-tight">Saved Life</h1>
            <p className="text-sm text-muted-foreground mt-1">Your archive — everything you save, love, and receive.</p>
          </div>

          <div className={cardClass("p-3")}>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search everything in Library"
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
                      <span className="text-[10px] uppercase font-semibold text-muted-foreground border rounded-full px-1.5 py-0.5 shrink-0">{typeLabel(item.type)}</span>
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

        {isLoading || !data ? (
          <div className="space-y-4 animate-pulse">
            <div className="flex gap-3">
              <div className="flex-none w-44 h-40 rounded-xl bg-secondary/50" />
              <div className="flex-none w-44 h-40 rounded-xl bg-secondary/40" />
              <div className="flex-none w-44 h-40 rounded-xl bg-secondary/30" />
            </div>
            <div className="h-52 rounded-xl bg-secondary/40" />
            <div className="grid grid-cols-2 gap-4">
              <div className="h-48 rounded-xl bg-secondary/30" />
              <div className="h-48 rounded-xl bg-secondary/30" />
            </div>
          </div>
        ) : (
          <>
            {/* ── Pick up where you left off ──────────────────────────────── */}
            {data.recentlySaved.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-2.5 px-0.5">
                  <Clock size={13} className="text-muted-foreground" />
                  <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pick up where you left off</h2>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory">
                  {data.recentlySaved.slice(0, 5).map((item, idx) => (
                    <div
                      key={`${item.type}-${item.title}-${idx}`}
                      className="flex-none w-44 rounded-xl border bg-card hover:shadow-sm transition-shadow snap-start cursor-pointer"
                    >
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.title} className="w-full h-24 object-cover rounded-t-xl" />
                      ) : (
                        <div className="w-full h-24 rounded-t-xl bg-secondary/50 flex items-center justify-center">
                          <Archive size={22} className="text-muted-foreground opacity-30" />
                        </div>
                      )}
                      <div className="p-2.5">
                        <p className="text-sm font-medium truncate leading-snug">{item.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{typeLabel(item.type)}{item.subtitle ? ` · ${item.subtitle}` : ""}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── Browse (Collections by type) ────────────────────────────── */}
            <section className={cardClass("p-4")}>
              <SectionHeader icon={Library} title="Browse" />
              {data.collections.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <Library size={28} className="mx-auto mb-2 opacity-20" />
                  <p className="text-sm font-medium text-foreground">Your library is empty</p>
                  <p className="text-xs mt-1">Save books, movies, music, places, and more — everything lives here.</p>
                  <Link href="/reading"><a className="inline-block mt-3 text-xs font-medium text-primary hover:underline">Start with a book →</a></Link>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {data.collections.map((collection) => (
                    <Link key={collection.key} href={collection.href}>
                      <a className="group rounded-xl border bg-background p-3 hover:bg-secondary/60 transition-colors block">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold group-hover:text-primary transition-colors truncate">{collection.label}</p>
                          <ChevronRight size={13} className="text-muted-foreground shrink-0" />
                        </div>
                        <p className="text-2xl font-bold mt-2.5 tabular-nums">{collection.count}</p>
                        <p className="text-xs text-muted-foreground mt-1 truncate">{collection.items.join(" · ")}</p>
                      </a>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            {/* ── Shared with me + Favorites ──────────────────────────────── */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">

              {/* Shared with me */}
              <div className={cardClass("p-4")}>
                <SectionHeader icon={Inbox} title="Shared with me" href="/people?tab=discover" />
                {data.sharedWithMe.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <Inbox size={24} className="mx-auto mb-2 opacity-20" />
                    <p className="text-sm font-medium text-foreground">No recommendations yet</p>
                    <p className="text-xs mt-1">Connect with friends and they can share books, movies, and places with you.</p>
                    <Link href="/people"><a className="inline-block mt-3 text-xs font-medium text-primary hover:underline">Add friends →</a></Link>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {data.sharedWithMe.map((item) => {
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
                            <button
                              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border border-border hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <Bookmark size={11} /> Save
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Favorites */}
              <div className={cardClass("p-4")}>
                <SectionHeader icon={Heart} title="Favorites" />
                {data.favorites.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <Heart size={24} className="mx-auto mb-2 opacity-20" />
                    <p className="text-sm font-medium text-foreground">No favorites yet</p>
                    <p className="text-xs mt-1">Heart items across your library to pin the best ones here.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {data.favorites.slice(0, 8).map((item) => (
                      <Link key={`${item.type}-${item.id}`} href={item.href}>
                        <a className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 hover:bg-secondary/60 transition-colors">
                          <Heart size={13} className="text-rose-500 fill-rose-500 shrink-0" />
                          <span className="min-w-0">
                            <span className="block text-sm font-medium truncate">{item.title}</span>
                            <span className="block text-xs text-muted-foreground truncate">{typeLabel(item.type)}{item.subtitle ? ` · ${item.subtitle}` : ""}</span>
                          </span>
                          <ChevronRight size={12} className="text-muted-foreground shrink-0 ml-auto" />
                        </a>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* ── Private Notes + Browse Shortcuts ────────────────────────── */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">

              <div className={cardClass("p-4")}>
                <SectionHeader icon={StickyNote} title="Private notes" href="/journal" />
                {data.privateNotes.recent.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <StickyNote size={24} className="mx-auto mb-2 opacity-20" />
                    <p className="text-sm font-medium text-foreground">No private notes yet</p>
                    <p className="text-xs mt-1">Write freely — private notes and journal entries never appear in your feed.</p>
                    <Link href="/journal"><a className="inline-block mt-3 text-xs font-medium text-primary hover:underline">Open Journal →</a></Link>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {data.privateNotes.recent.map((note) => (
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
          </>
        )}
      </div>
    </div>
  );
}
