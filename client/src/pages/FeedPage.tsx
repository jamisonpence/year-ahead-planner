import { useState, useRef } from "react";
import { cleanFeedTitle } from "@/lib/feedTitle";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import {
  Heart, Flame, ThumbsUp, MessageCircle, Send, BookOpen,
  Film, Music, UtensilsCrossed, MapPin, Quote as QuoteIcon,
  Plus, RefreshCw, Users, ChevronRight, X, Sparkles,
  Target, Zap, Dumbbell,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(date: string | Date) {
  try { return formatDistanceToNow(new Date(date), { addSuffix: true }); }
  catch { return ""; }
}

const ACTIVITY_LABELS: Record<string, string> = {
  book_added:               "added a book",
  book_finished:            "finished reading",
  movie_added:              "added a movie",
  song_added:               "added a song",
  recipe_added:             "saved a recipe",
  spot_added:               "saved a spot",
  quote_added:              "saved a quote",
  recommendation_received:  "recommended something to you",
  goal_completed:           "completed a goal 🎉",
  goal_milestone:           "hit a milestone 🌟",
  habit_streak:             "is on a streak 🔥",
  workout_pr:               "set a new PR 💪",
};

const ITEM_TYPE_ICONS: Record<string, React.ElementType> = {
  book:    BookOpen,
  movie:   Film,
  song:    Music,
  recipe:  UtensilsCrossed,
  spot:    MapPin,
  quote:   QuoteIcon,
  goal:    Target,
  habit:   Zap,
  workout: Dumbbell,
};

const REACTION_EMOJIS = ["❤️", "🔥", "👍"] as const;
type ReactionEmoji = typeof REACTION_EMOJIS[number];

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({
  name, avatarUrl, size = 40, ring = false, ringColor = "ring-violet-500",
}: {
  name: string; avatarUrl?: string | null; size?: number;
  ring?: boolean; ringColor?: string;
}) {
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const cls = `rounded-full shrink-0 flex items-center justify-center font-semibold bg-violet-500/20 text-violet-600 dark:text-violet-400 ${
    ring ? `ring-2 ring-offset-2 ring-offset-background ${ringColor}` : ""
  }`;
  return avatarUrl ? (
    <img src={avatarUrl} alt={name} width={size} height={size}
      className={`${cls} object-cover`} style={{ width: size, height: size }} />
  ) : (
    <div className={cls} style={{ width: size, height: size, fontSize: size * 0.35 }}>
      {initials}
    </div>
  );
}

// ── Stories row ───────────────────────────────────────────────────────────────

function StoriesRow() {
  const { user } = useAuth();
  const { data } = useQuery<{ me: any; friends: any[] }>({
    queryKey: ["/api/feed/stories"],
    queryFn: () => apiRequest("GET", "/api/feed/stories").then(r => r.json()),
    staleTime: 30_000,
  });
  const [, navigate] = useLocation();

  if (!data) return (
    <div className="flex gap-4 px-4 py-3 overflow-x-auto scrollbar-hide">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex flex-col items-center gap-1.5 shrink-0">
          <div className="w-14 h-14 rounded-full bg-secondary animate-pulse" />
          <div className="w-10 h-2 rounded bg-secondary animate-pulse" />
        </div>
      ))}
    </div>
  );

  const me = data.me;
  const friends = data.friends ?? [];

  return (
    <div className="overflow-x-auto scrollbar-hide">
      <div className="flex gap-4 px-4 py-3 w-max">
        {/* Current user — always first */}
        <div className="flex flex-col items-center gap-1.5 shrink-0">
          <div className="relative">
            <Avatar name={me?.name ?? user?.name ?? "You"} avatarUrl={me?.avatarUrl ?? user?.avatarUrl}
              size={56} ring={me?.hasRecentActivity} ringColor="ring-violet-500" />
            <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-violet-500 border-2 border-background flex items-center justify-center">
              <Plus size={11} className="text-white" strokeWidth={3} />
            </div>
          </div>
          <span className="text-[10px] text-muted-foreground font-medium max-w-[56px] truncate text-center">You</span>
        </div>

        {/* Friends */}
        {friends.map(f => (
          <Link key={f.id} href={`/profile/${f.id}`}>
            <div className="flex flex-col items-center gap-1.5 shrink-0 cursor-pointer">
              <Avatar name={f.name} avatarUrl={f.avatarUrl} size={56}
                ring={f.hasRecentActivity} ringColor="ring-emerald-400" />
              <span className="text-[10px] text-muted-foreground font-medium max-w-[56px] truncate text-center">
                {f.name.split(" ")[0]}
              </span>
            </div>
          </Link>
        ))}

        {/* No friends yet — prompt */}
        {friends.length === 0 && (
          <Link href="/relationships">
            <div className="flex flex-col items-center gap-1.5 shrink-0 cursor-pointer opacity-70">
              <div className="w-14 h-14 rounded-full border-2 border-dashed border-muted-foreground/40 flex items-center justify-center">
                <Plus size={20} className="text-muted-foreground/60" />
              </div>
              <span className="text-[10px] text-muted-foreground">Add friends</span>
            </div>
          </Link>
        )}
      </div>
    </div>
  );
}

// ── Reaction bar ──────────────────────────────────────────────────────────────

function ReactionBar({ itemId, reactions, currentUserId }: {
  itemId: number; reactions: any[]; currentUserId: number;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const reactionMut = useMutation({
    mutationFn: (emoji: string) =>
      apiRequest("POST", `/api/feed/${itemId}/react`, { emoji }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/feed"] }),
    onError: () => toast({ title: "Couldn't save reaction", variant: "destructive" }),
  });

  // Count per emoji + whether current user reacted
  const counts = REACTION_EMOJIS.reduce((acc, e) => {
    const list = reactions.filter(r => r.emoji === e);
    acc[e] = { count: list.length, mine: list.some(r => r.userId === currentUserId) };
    return acc;
  }, {} as Record<string, { count: number; mine: boolean }>);

  return (
    <div className="flex items-center gap-1.5">
      {REACTION_EMOJIS.map(e => (
        <button
          key={e}
          onClick={() => reactionMut.mutate(e)}
          disabled={reactionMut.isPending}
          className={`flex items-center gap-1 text-xs rounded-full px-2.5 py-1 border transition-all ${
            counts[e].mine
              ? "bg-violet-500/15 border-violet-400/40 text-violet-600 dark:text-violet-300 font-semibold"
              : "border-border text-muted-foreground hover:border-violet-300 hover:bg-violet-500/5"
          }`}
        >
          <span>{e}</span>
          {counts[e].count > 0 && <span>{counts[e].count}</span>}
        </button>
      ))}
    </div>
  );
}

// ── Comment section ───────────────────────────────────────────────────────────

function CommentSection({ itemId, comments, currentUserId }: {
  itemId: number; comments: any[]; currentUserId: number;
}) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const { toast } = useToast();

  const commentMut = useMutation({
    mutationFn: (content: string) =>
      apiRequest("POST", `/api/feed/${itemId}/comment`, { content }).then(r => r.json()),
    onSuccess: () => {
      setText("");
      qc.invalidateQueries({ queryKey: ["/api/feed"] });
    },
    onError: () => toast({ title: "Couldn't post comment", variant: "destructive" }),
  });

  return (
    <div className="space-y-2 pt-1">
      {comments.map(c => (
        <div key={c.id} className="flex gap-2 text-xs">
          <span className="font-semibold shrink-0">{c.userName?.split(" ")[0]}</span>
          <span className="text-muted-foreground">{c.content}</span>
        </div>
      ))}
      <div className="flex items-center gap-2 pt-1">
        <input
          ref={inputRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && text.trim()) commentMut.mutate(text.trim()); }}
          placeholder="Add a comment…"
          className="flex-1 text-xs bg-secondary/50 border border-border rounded-full px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-400/50"
        />
        <button
          onClick={() => { if (text.trim()) commentMut.mutate(text.trim()); }}
          disabled={!text.trim() || commentMut.isPending}
          className="p-1.5 rounded-full bg-violet-500 text-white disabled:opacity-40 transition-opacity"
        >
          <Send size={12} />
        </button>
      </div>
    </div>
  );
}

// ── Feed card ─────────────────────────────────────────────────────────────────

function FeedCard({ item, currentUserId }: { item: any; currentUserId: number }) {
  const [showComments, setShowComments] = useState(false);
  const isRec = item.activityType === "recommendation_received";
  const Icon = ITEM_TYPE_ICONS[item.itemType] ?? Sparkles;

  return (
    <div className={`rounded-2xl border bg-card overflow-hidden transition-shadow hover:shadow-md ${
      isRec
        ? "border-violet-400/40 shadow-[0_0_0_1px_rgba(167,139,250,0.15)] bg-gradient-to-br from-violet-500/[0.04] to-card"
        : ""
    }`}>
      {/* Recommendation badge */}
      {isRec && (
        <div className="px-4 pt-3 pb-0">
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-500 border border-violet-400/30">
            <Sparkles size={9} />For You
          </span>
        </div>
      )}

      <div className="p-4 space-y-3">
        {/* Header: avatar + name + action + time */}
        <div className="flex items-center gap-2.5">
          <Avatar name={item.user.name} avatarUrl={item.user.avatarUrl} size={36} />
          <div className="flex-1 min-w-0">
            <p className="text-sm leading-tight">
              <span className="font-semibold">{item.user.name.split(" ")[0]}</span>
              {" "}
              <span className="text-muted-foreground">{ACTIVITY_LABELS[item.activityType] ?? "did something"}</span>
            </p>
            <p className="text-[11px] text-muted-foreground/70">{timeAgo(item.createdAt)}</p>
          </div>
        </div>

        {/* Item card */}
        {item.itemTitle && (
          <div className="flex items-center gap-3 p-2.5 rounded-xl bg-secondary/40 border border-border/50">
            {item.itemImageUrl ? (
              <img
                src={item.itemImageUrl}
                alt={item.itemTitle}
                className="w-12 h-12 rounded-lg object-cover shrink-0 shadow-sm"
                onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            ) : (
              <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                <Icon size={20} className="text-muted-foreground/60" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-tight truncate">{cleanFeedTitle(item.itemTitle)}</p>
              {item.itemSubtitle && (
                <p className="text-xs text-muted-foreground truncate mt-0.5">{item.itemSubtitle}</p>
              )}
            </div>
          </div>
        )}

        {/* Reaction bar */}
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <ReactionBar itemId={item.id} reactions={item.reactions} currentUserId={currentUserId} />
          <button
            onClick={() => setShowComments(v => !v)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <MessageCircle size={13} />
            <span>{item.comments.length > 0 ? item.comments.length : "Comment"}</span>
          </button>
        </div>

        {/* Add to collection button for recommendations */}
        {isRec && item.itemTitle && (
          <button className="w-full text-xs font-medium py-2 rounded-xl border border-violet-400/40 text-violet-500 hover:bg-violet-500/10 transition-colors">
            + Add to my collection
          </button>
        )}

        {/* Comments */}
        {showComments && (
          <CommentSection
            itemId={item.id}
            comments={item.comments}
            currentUserId={currentUserId}
          />
        )}
      </div>
    </div>
  );
}

// ── My activity card (compact, empty-state fallback) ─────────────────────────

function MyActivityCard({ item }: { item: any }) {
  const Icon = ITEM_TYPE_ICONS[item.itemType] ?? Sparkles;
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border bg-card">
      {item.itemImageUrl ? (
        <img src={item.itemImageUrl} alt={item.itemTitle} className="w-10 h-10 rounded-lg object-cover shrink-0"
          onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
      ) : (
        <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
          <Icon size={16} className="text-muted-foreground/60" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{cleanFeedTitle(item.itemTitle) || "—"}</p>
        <p className="text-xs text-muted-foreground">{ACTIVITY_LABELS[item.activityType] ?? item.activityType} · {timeAgo(item.createdAt)}</p>
      </div>
    </div>
  );
}

// ── Main FeedPage ─────────────────────────────────────────────────────────────

export default function FeedPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);

  const { data: feedData, isLoading: feedLoading, refetch } = useQuery<{
    items: any[]; hasFriends: boolean; page: number; total: number;
  }>({
    queryKey: ["/api/feed", page],
    queryFn: () => apiRequest("GET", `/api/feed?page=${page}`).then(r => r.json()),
    staleTime: 30_000,
  });

  const { data: myActivity = [], isLoading: myLoading } = useQuery<any[]>({
    queryKey: ["/api/feed/mine"],
    queryFn: () => apiRequest("GET", "/api/feed/mine?limit=10").then(r => r.json()),
    staleTime: 30_000,
    enabled: feedData?.hasFriends === false || (feedData?.items?.length === 0),
  });

  const currentUserId = user?.id ?? 0;
  const items = feedData?.items ?? [];
  const hasFriends = feedData?.hasFriends ?? true;
  const total = feedData?.total ?? 0;
  const pageSize = 20;
  const hasMore = page * pageSize < total;

  const isLoading = feedLoading;

  // ── No friends state ──────────────────────────────────────────────────────
  if (!isLoading && !hasFriends) {
    return (
      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        <StoriesRow />

        <div className="text-center py-12 px-4 space-y-4">
          <div className="w-16 h-16 rounded-full bg-violet-500/10 flex items-center justify-center mx-auto">
            <Users size={28} className="text-violet-400" />
          </div>
          <div>
            <p className="font-semibold text-base">Follow friends to see their activity</p>
            <p className="text-sm text-muted-foreground mt-1">When your friends add books, movies, recipes and more, it'll show up here.</p>
          </div>
          <Link href="/relationships">
            <button className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 transition-colors">
              <Users size={15} />Find Friends
            </button>
          </Link>
        </div>

        {/* Own activity as fallback */}
        {myActivity.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">Your Recent Activity</p>
            {myActivity.map(item => <MyActivityCard key={item.id} item={item} />)}
          </div>
        )}
      </div>
    );
  }

  // ── Friends have no activity yet ──────────────────────────────────────────
  if (!isLoading && hasFriends && items.length === 0) {
    return (
      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        <StoriesRow />
        <div className="text-center py-8 space-y-2">
          <p className="font-semibold text-sm">No activity yet</p>
          <p className="text-xs text-muted-foreground">Your friends haven't added anything recently. Check back soon!</p>
        </div>
        {myActivity.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">Your Recent Activity</p>
            {myActivity.map(item => <MyActivityCard key={item.id} item={item} />)}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      {/* Page title */}
      <div className="px-4 pt-4 pb-1">
        <h1 className="text-2xl font-bold">Feed</h1>
        <p className="text-sm text-muted-foreground">What your friends are up to</p>
      </div>

      {/* Stories */}
      <StoriesRow />

      {/* Refresh button */}
      <div className="flex items-center justify-between px-4 pt-2 pb-1">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Latest</p>
        <button
          onClick={() => { setPage(1); refetch(); qc.invalidateQueries({ queryKey: ["/api/feed/stories"] }); }}
          className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Feed */}
      <div className="px-4 pb-6 space-y-3">
        {isLoading
          ? [...Array(3)].map((_, i) => (
              <div key={i} className="rounded-2xl border bg-card p-4 space-y-3 animate-pulse">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-secondary" />
                  <div className="space-y-1.5 flex-1">
                    <div className="h-3 bg-secondary rounded w-1/2" />
                    <div className="h-2.5 bg-secondary rounded w-1/4" />
                  </div>
                </div>
                <div className="h-16 bg-secondary rounded-xl" />
                <div className="h-7 bg-secondary rounded-full w-1/2" />
              </div>
            ))
          : items.map(item => (
              <FeedCard key={item.id} item={item} currentUserId={currentUserId} />
            ))
        }

        {/* Pagination */}
        {!isLoading && (
          <div className="flex items-center justify-center gap-3 pt-2">
            {page > 1 && (
              <button onClick={() => setPage(p => p - 1)}
                className="text-xs px-4 py-2 rounded-xl border hover:bg-secondary transition-colors flex items-center gap-1">
                ← Newer
              </button>
            )}
            {hasMore && (
              <button onClick={() => setPage(p => p + 1)}
                className="text-xs px-4 py-2 rounded-xl border hover:bg-secondary transition-colors flex items-center gap-1">
                Load more <ChevronRight size={12} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
