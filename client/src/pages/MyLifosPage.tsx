import { useMemo, useState } from "react";
import type { ElementType, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Activity, Archive, BookMarked, ChevronRight, Clock, Heart, Inbox,
  Library, Lock, Search, Sparkles, StickyNote, BarChart3,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";

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

export default function MyLifosPage() {
  const [query, setQuery] = useState("");
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

  const topStats = useMemo(() => {
    if (!data) return [];
    return [
      { label: "Saved items", value: data.lifeStats.totalItems },
      { label: "Collections", value: data.collections.length },
      { label: "Favorites", value: data.favorites.length },
      { label: "Private notes", value: data.privateNotes.total },
      { label: "Shared with me", value: data.sharedWithMe.length },
      { label: "Friends", value: data.lifeStats.friendsCount },
    ];
  }, [data]);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 space-y-5">
        <header className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-primary uppercase tracking-wider">MyLifos</p>
              <h1 className="text-2xl font-bold tracking-tight">Saved Life</h1>
              <p className="text-sm text-muted-foreground mt-1">Everything you save, love, receive, and remember in one place.</p>
            </div>
            <Link href="/journal">
              <a className="inline-flex items-center gap-1.5 text-sm border rounded-lg px-3 py-2 hover:bg-secondary transition-colors">
                <Lock size={14} /> Private notes
              </a>
            </Link>
          </div>

          <div className={cardClass("p-3")}>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search everything in MyLifos"
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
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 animate-pulse">
            <div className="lg:col-span-2 h-52 rounded-xl bg-secondary/50" />
            <div className="h-52 rounded-xl bg-secondary/40" />
            <div className="lg:col-span-3 h-28 rounded-xl bg-secondary/30" />
          </div>
        ) : (
          <>
            <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {topStats.map((stat) => (
                <div key={stat.label} className={cardClass("p-3")}>
                  <p className="text-xl font-semibold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
                </div>
              ))}
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className={cardClass("p-4 lg:col-span-2")}>
                <SectionHeader icon={Clock} title="Recently saved" />
                {data.recentlySaved.length === 0 ? (
                  <EmptyState>Recent saves will appear here as you add to MyLifos.</EmptyState>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {data.recentlySaved.map((item, idx) => (
                      <div key={`${item.type}-${item.title}-${idx}`} className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2">
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt={item.title} className="w-10 h-10 rounded object-cover shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded bg-secondary flex items-center justify-center shrink-0">
                            <Archive size={15} className="text-muted-foreground" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{item.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{typeLabel(item.type)}{item.subtitle ? ` · ${item.subtitle}` : ""}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className={cardClass("p-4")}>
                <SectionHeader icon={Inbox} title="Shared with me" href="/people?tab=discover" />
                {data.sharedWithMe.length === 0 ? (
                  <EmptyState>Recommendations from friends will collect here.</EmptyState>
                ) : (
                  <div className="space-y-2">
                    {data.sharedWithMe.map((item) => (
                      <div key={`${item.recType}-${item.id}`} className="rounded-lg border bg-background px-3 py-2">
                        <p className="text-sm font-medium truncate">{item.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{typeLabel(item.recType)} from {item.fromUser.name}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section className={cardClass("p-4")}>
              <SectionHeader icon={Library} title="Collections" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {data.collections.map((collection) => (
                  <Link key={collection.key} href={collection.href}>
                    <a className="rounded-xl border bg-background p-3 hover:bg-secondary/60 transition-colors">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold">{collection.label}</p>
                        <ChevronRight size={14} className="text-muted-foreground" />
                      </div>
                      <p className="text-2xl font-semibold mt-3">{collection.count}</p>
                      <p className="text-xs text-muted-foreground mt-1 truncate">{collection.items.join(" · ")}</p>
                    </a>
                  </Link>
                ))}
              </div>
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className={cardClass("p-4")}>
                <SectionHeader icon={Heart} title="Favorites" />
                {data.favorites.length === 0 ? (
                  <EmptyState>Heart items across MyLifos to build your favorites.</EmptyState>
                ) : (
                  <div className="space-y-2">
                    {data.favorites.slice(0, 6).map((item) => (
                      <Link key={`${item.type}-${item.id}`} href={item.href}>
                        <a className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 hover:bg-secondary/60 transition-colors">
                          <Heart size={13} className="text-rose-500 fill-rose-500 shrink-0" />
                          <span className="min-w-0">
                            <span className="block text-sm font-medium truncate">{item.title}</span>
                            <span className="block text-xs text-muted-foreground truncate">{typeLabel(item.type)}{item.subtitle ? ` · ${item.subtitle}` : ""}</span>
                          </span>
                        </a>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              <div className={cardClass("p-4")}>
                <SectionHeader icon={StickyNote} title="Private notes" href="/journal" />
                {data.privateNotes.recent.length === 0 ? (
                  <EmptyState>Your journal and private notes stay here.</EmptyState>
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
                <SectionHeader icon={BarChart3} title="Life stats" />
                <div className="space-y-3">
                  {[
                    ["Media", (data.lifeStats.counts.reading ?? 0) + (data.lifeStats.counts.movies ?? 0) + (data.lifeStats.counts.music ?? 0)],
                    ["Health", (data.lifeStats.counts.workouts ?? 0) + (data.lifeStats.counts.recipes ?? 0)],
                    ["Places", data.lifeStats.counts.spots ?? 0],
                    ["Goals", data.lifeStats.counts.goals ?? 0],
                    ["People", data.lifeStats.counts.relationships ?? 0],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-medium">{value}</span>
                    </div>
                  ))}
                  <div className="pt-3 border-t flex items-center gap-2 text-xs text-muted-foreground">
                    <Activity size={13} />
                    <span>{data.lifeStats.recommendationsSent} recommendations sent</span>
                  </div>
                </div>
              </div>
            </section>

            <section className={cardClass("p-4")}>
              <SectionHeader icon={Sparkles} title="Repository shortcuts" />
              <div className="flex flex-wrap gap-2">
                {[
                  ["/library", "Media"],
                  ["/hobbies", "Interests"],
                  ["/health", "Health"],
                  ["/places", "Places"],
                  ["/housekeeping", "Home"],
                  ["/budget", "Finance"],
                  ["/faith", "Faith"],
                  ["/politics", "Civic"],
                ].map(([href, label]) => (
                  <Link key={href} href={href}>
                    <a className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm hover:bg-secondary transition-colors">
                      <BookMarked size={13} /> {label}
                    </a>
                  </Link>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
