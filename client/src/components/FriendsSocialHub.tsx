import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import {
  Search, Loader2, UserPlus, UserCheck, Clock, X, Check, Send,
  Plus, BookOpen, Film, Music, ChefHat, MapPin, Palette, Quote,
  UserX, ChevronDown, ChevronUp, Sparkles, Link2, Contact,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PublicUser {
  id: number;
  name: string;
  email: string;
  avatarUrl: string | null;
}

interface SearchResult extends PublicUser {
  relationshipStatus: "none" | "friends" | "outgoing_pending" | "incoming";
  incomingRequestId: number | null;
}

interface InboxItem {
  id: number;
  recType: string;
  fromUser: { id: number; name: string; avatarUrl: string | null };
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  note: string | null;
  createdAt: string;
  isRead: boolean;
}

interface EnrichedFriend extends PublicUser {
  tasteMatchPct: number;
  recentActivityLabel: string | null;
  overlapCount: number;
}

interface FriendRequest {
  id: number;
  otherUser: PublicUser;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const d = Math.round((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

const REC_TYPES = [
  { key: "all",    label: "All",     emoji: "" },
  { key: "book",   label: "Books",   emoji: "📚" },
  { key: "movie",  label: "Movies",  emoji: "🎬" },
  { key: "music",  label: "Music",   emoji: "🎵" },
  { key: "recipe", label: "Recipes", emoji: "🍽️" },
  { key: "spot",   label: "Spots",   emoji: "📍" },
  { key: "art",    label: "Art",     emoji: "🎨" },
  { key: "quote",  label: "Quotes",  emoji: "💬" },
];

const REC_ICONS: Record<string, React.FC<any>> = {
  book: BookOpen, movie: Film, music: Music, recipe: ChefHat,
  spot: MapPin, art: Palette, quote: Quote,
};

const REC_COLORS: Record<string, string> = {
  book: "text-amber-600", movie: "text-blue-600", music: "text-pink-600",
  recipe: "text-green-600", spot: "text-violet-600", art: "text-orange-600", quote: "text-rose-600",
};

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({ user, size = 36 }: { user: { name: string; avatarUrl?: string | null }; size?: number }) {
  const colors = ["bg-violet-500","bg-blue-500","bg-pink-500","bg-amber-500","bg-green-500"];
  const idx = user.name.charCodeAt(0) % colors.length;
  if (user.avatarUrl) return <img src={user.avatarUrl} alt={user.name} className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />;
  return (
    <div className={`rounded-full flex items-center justify-center font-semibold text-white shrink-0 select-none ${colors[idx]}`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {user.name.charAt(0).toUpperCase()}
    </div>
  );
}

// ── Rec Modal ─────────────────────────────────────────────────────────────────

function RecModal({ friend, onClose }: { friend: EnrichedFriend; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [type, setType] = useState("book");
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [note, setNote] = useState("");

  const SEND_LABELS: Record<string, { titleLabel: string; subtitleLabel: string; titlePlaceholder: string; subtitlePlaceholder: string }> = {
    book:   { titleLabel: "Book Title",   subtitleLabel: "Author",    titlePlaceholder: "e.g. Dune",           subtitlePlaceholder: "e.g. Frank Herbert" },
    movie:  { titleLabel: "Movie Title",  subtitleLabel: "Director",  titlePlaceholder: "e.g. Inception",      subtitlePlaceholder: "e.g. Christopher Nolan" },
    music:  { titleLabel: "Artist/Song",  subtitleLabel: "Song Title", titlePlaceholder: "e.g. Radiohead",     subtitlePlaceholder: "e.g. Creep (optional)" },
    recipe: { titleLabel: "Recipe Name",  subtitleLabel: "",          titlePlaceholder: "e.g. Pasta Carbonara", subtitlePlaceholder: "" },
    spot:   { titleLabel: "Place Name",   subtitleLabel: "City",      titlePlaceholder: "e.g. Nobu",           subtitlePlaceholder: "e.g. New York" },
    art:    { titleLabel: "Artwork Title", subtitleLabel: "Artist",   titlePlaceholder: "e.g. Starry Night",   subtitlePlaceholder: "e.g. Van Gogh" },
    quote:  { titleLabel: "Quote",        subtitleLabel: "Author",    titlePlaceholder: "e.g. Be the change…", subtitlePlaceholder: "e.g. Gandhi" },
  };

  const sendMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/recommendations/send", {
      toUserId: friend.id, type, title: title.trim(), subtitle: subtitle.trim() || undefined, note: note.trim() || undefined,
    }),
    onSuccess: () => {
      toast({ title: "Recommendation sent!", description: `Sent to ${friend.name}` });
      qc.invalidateQueries({ queryKey: ["/api/user/summary"] });
      onClose();
    },
    onError: () => toast({ title: "Failed to send", variant: "destructive" }),
  });

  const meta = SEND_LABELS[type];

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-end justify-center lg:items-center" onClick={onClose}>
      <div className="bg-card border rounded-t-3xl lg:rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-base">Recommend to {friend.name}</h3>
            <p className="text-xs text-muted-foreground">Choose something to share</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors"><X size={16} /></button>
        </div>

        {/* Type picker */}
        <div className="flex gap-1.5 flex-wrap">
          {REC_TYPES.slice(1).map(t => (
            <button
              key={t.key}
              onClick={() => setType(t.key)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${type === t.key ? "bg-violet-500 text-white" : "bg-secondary hover:bg-secondary/80"}`}
            >
              {t.emoji} {t.label}
            </button>
          ))}
        </div>

        {/* Title */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">{meta.titleLabel} *</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={meta.titlePlaceholder}
            className="w-full px-3 py-2 text-sm border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-violet-400/30"
          />
        </div>

        {/* Subtitle */}
        {meta.subtitleLabel && (
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">{meta.subtitleLabel}</label>
            <input
              value={subtitle}
              onChange={e => setSubtitle(e.target.value)}
              placeholder={meta.subtitlePlaceholder}
              className="w-full px-3 py-2 text-sm border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-violet-400/30"
            />
          </div>
        )}

        {/* Note */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Personal note (optional)</label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Why are you recommending this?"
            rows={2}
            className="w-full px-3 py-2 text-sm border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-violet-400/30 resize-none"
          />
        </div>

        <button
          onClick={() => sendMut.mutate()}
          disabled={!title.trim() || sendMut.isPending}
          className="w-full py-2.5 rounded-xl bg-violet-500 text-white text-sm font-semibold hover:bg-violet-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          {sendMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          Send Recommendation
        </button>
      </div>
    </div>
  );
}

// ── Accountability Buddies ────────────────────────────────────────────────────

type BuddyOwner = { id: number; name: string; avatarUrl: string | null };
type BuddiesData = {
  goals: Array<{ id: number; title: string; progressCurrent: number; progressTarget: number; targetDate: string | null; owner: BuddyOwner }>;
  readingGoals: Array<{ id: number; label: string | null; year: number; booksTarget: number; booksFinished: number; owner: BuddyOwner }>;
  nutritionGoals: Array<{ id: number; calories: number; caloriesToday: number; owner: BuddyOwner }>;
  workoutPlans: Array<{ id: number; name: string; workoutsThisWeek: number; owner: BuddyOwner }>;
};

function BuddiesSection() {
  const { toast } = useToast();
  const { data } = useQuery<BuddiesData>({
    queryKey: ["/api/buddies/mine"],
    queryFn: () => apiRequest("GET", "/api/buddies/mine").then(r => r.json()),
  });

  const nudgeMut = useMutation({
    mutationFn: ({ toUserId, itemTitle }: { toUserId: number; itemTitle: string }) =>
      apiRequest("POST", "/api/buddies/nudge", { toUserId, itemTitle }),
    onSuccess: () => toast({ title: "Nudge sent! 👊" }),
    onError: () => toast({ title: "Couldn't send nudge", variant: "destructive" }),
  });

  if (!data) return null;
  const rows: Array<{ key: string; emoji: string; title: string; progress: string; pct: number | null; owner: BuddyOwner }> = [
    ...data.goals.map(g => ({
      key: `g-${g.id}`, emoji: "🎯", title: g.title, owner: g.owner,
      progress: `${Math.round((g.progressCurrent / (g.progressTarget || 1)) * 100)}% complete`,
      pct: Math.min(100, Math.round((g.progressCurrent / (g.progressTarget || 1)) * 100)),
    })),
    ...data.readingGoals.map(r => ({
      key: `r-${r.id}`, emoji: "📚", title: r.label || `${r.year} Reading`, owner: r.owner,
      progress: `${r.booksFinished}/${r.booksTarget} books`,
      pct: Math.min(100, Math.round((r.booksFinished / (r.booksTarget || 1)) * 100)),
    })),
    ...data.nutritionGoals.map(n => ({
      key: `n-${n.id}`, emoji: "🥗", title: "Nutrition goal", owner: n.owner,
      progress: `${n.caloriesToday}/${n.calories} cal today`, pct: null,
    })),
    ...data.workoutPlans.map(w => ({
      key: `w-${w.id}`, emoji: "💪", title: w.name, owner: w.owner,
      progress: `${w.workoutsThisWeek} workout${w.workoutsThisWeek === 1 ? "" : "s"} this week`, pct: null,
    })),
  ];
  if (rows.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        <Sparkles size={12} /> Accountability buddies
      </div>
      <p className="text-xs text-muted-foreground -mt-1">
        You're the buddy on these — cheer them on or give them a push.
      </p>
      {rows.map(row => (
        <div key={row.key} className="flex items-center gap-3 p-3 rounded-xl border bg-card">
          <Avatar user={row.owner} size={40} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{row.emoji} {row.title}</p>
            <p className="text-xs text-muted-foreground truncate">{row.owner.name} · {row.progress}</p>
            {row.pct !== null && (
              <div className="mt-1.5 h-1.5 rounded-full bg-secondary overflow-hidden">
                <div className="h-full bg-violet-500 rounded-full transition-all" style={{ width: `${row.pct}%` }} />
              </div>
            )}
          </div>
          <button
            onClick={() => nudgeMut.mutate({ toUserId: row.owner.id, itemTitle: row.title })}
            disabled={nudgeMut.isPending}
            className="shrink-0 text-xs font-medium bg-violet-500 text-white px-2.5 py-1.5 rounded-full hover:bg-violet-600 disabled:opacity-50 transition-colors"
          >
            👊 Nudge
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Contact Matches + Invite Link ─────────────────────────────────────────────

interface ContactMatch extends SearchResult {
  source: "google" | "linkedin";
  contactName: string | null;
}

function ContactMatchesSection({ onSendRequest, onAccept, sendPending, libraryCount }: {
  onSendRequest: (id: number) => void;
  onAccept: (reqId: number) => void;
  sendPending: boolean;
  libraryCount: number;
}) {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: matches = [] } = useQuery<ContactMatch[]>({
    queryKey: ["/api/friends/contact-matches"],
    queryFn: () => apiRequest("GET", "/api/friends/contact-matches").then(r => r.json()),
  });

  const inviteMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/invites").then(r => r.json()),
    onSuccess: (data: { url: string }) => {
      navigator.clipboard.writeText(data.url)
        .then(() => toast({ title: "Invite link copied!", description: "Anyone who joins through it becomes your friend automatically." }))
        .catch(() => toast({ title: "Your invite link", description: data.url }));
    },
    onError: () => toast({ title: "Couldn't create invite link", variant: "destructive" }),
  });

  const pending = matches.filter(m => m.relationshipStatus !== "friends");

  return (
    <div className="space-y-2">
      {pending.length > 0 && (
        <>
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <Contact size={12} /> From your contacts
          </div>
          {pending.map(m => (
            <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl border bg-card">
              <Avatar user={m} size={40} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{m.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {m.source === "google" ? "Google contact" : "LinkedIn connection"}
                  {m.contactName && m.contactName !== m.name ? ` · ${m.contactName}` : ""}
                </p>
              </div>
              <div className="shrink-0">
                {m.relationshipStatus === "incoming" ? (
                  <button
                    onClick={() => onAccept(m.incomingRequestId!)}
                    className="text-xs font-medium flex items-center gap-1 bg-blue-500 text-white px-2.5 py-1.5 rounded-full hover:bg-blue-600 transition-colors"
                  >
                    <Check size={11} />Accept
                  </button>
                ) : m.relationshipStatus === "outgoing_pending" ? (
                  <span className="text-xs text-amber-600 font-medium flex items-center gap-1 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded-full">
                    <Clock size={11} />Pending
                  </span>
                ) : (
                  <button
                    onClick={() => onSendRequest(m.id)}
                    disabled={sendPending}
                    className="text-xs font-medium flex items-center gap-1 bg-violet-500 text-white px-2.5 py-1.5 rounded-full hover:bg-violet-600 disabled:opacity-50 transition-colors"
                  >
                    <UserPlus size={11} />Add
                  </button>
                )}
              </div>
            </div>
          ))}
        </>
      )}
      {libraryCount >= 3 ? (
        <button
          onClick={() => inviteMut.mutate()}
          disabled={inviteMut.isPending}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-violet-400/40 text-violet-500 text-sm font-medium hover:bg-violet-500/5 disabled:opacity-50 transition-colors"
        >
          {inviteMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
          Copy my invite link
        </button>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-secondary/30 px-4 py-3 text-center">
          <p className="text-xs text-muted-foreground">
            Save a few books, places, or interests first — then invite friends to compare tastes.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Search Section ────────────────────────────────────────────────────────────

function SearchSection({ onSendRequest, onAccept, friends, requests, sendPending }:{
  onSendRequest: (id: number) => void;
  onAccept: (reqId: number) => void;
  friends: PublicUser[];
  requests: { incoming: FriendRequest[]; outgoing: FriendRequest[] };
  sendPending: boolean;
}) {
  const [, navigate] = useLocation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const r = await apiRequest("GET", `/api/users/search?q=${encodeURIComponent(q)}`);
      setResults(await r.json());
    } catch { setResults([]); }
    finally { setLoading(false); }
  }, []);

  function handleChange(val: string) {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 350);
  }

  useEffect(() => {
    if (query.trim()) doSearch(query);
  }, [friends.length, requests.incoming.length, requests.outgoing.length]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        {loading && <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />}
        <input
          value={query}
          onChange={e => handleChange(e.target.value)}
          placeholder="Search by name or email…"
          className="w-full pl-9 pr-8 py-2.5 text-sm border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-violet-400/30"
        />
      </div>

      {query.trim() && !loading && results.length === 0 && (
        <div className="text-center py-4 space-y-2">
          <p className="text-sm text-muted-foreground">No users found for "{query}"</p>
          <button
            onClick={() => navigator.clipboard.writeText(window.location.origin).then(() => toast({ title: "Link copied!" }))}
            className="text-xs px-3 py-1.5 rounded-lg border border-primary/30 text-primary hover:bg-primary/10 transition-colors"
          >
            Copy invite link
          </button>
        </div>
      )}

      {results.map(u => {
        const isFriend = u.relationshipStatus === "friends";
        const isPending = u.relationshipStatus === "outgoing_pending";
        const isIncoming = u.relationshipStatus === "incoming";
        const friendObj = friends.find(f => f.id === u.id) as EnrichedFriend | undefined;
        return (
          <div
            key={u.id}
            onClick={isFriend ? () => navigate(`/profile/${u.id}`) : undefined}
            className={`flex items-center gap-3 p-3 rounded-xl border bg-card ${isFriend ? "cursor-pointer hover:border-violet-300/50 hover:bg-violet-50/30 dark:hover:bg-violet-950/10 transition-colors" : ""}`}
          >
            <Avatar user={u} size={40} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{u.name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {isFriend ? "Tap to view profile" : u.email}
              </p>
              {isFriend && (friendObj as any)?.tasteMatchPct !== undefined && (friendObj as any).tasteMatchPct > 0 && (
                <p className="text-xs text-violet-500 mt-0.5">{(friendObj as any).tasteMatchPct}% taste match</p>
              )}
            </div>
            <div className="shrink-0">
              {isFriend ? (
                <span className="text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1 bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded-full">
                  <UserCheck size={11} />Friends
                </span>
              ) : isIncoming ? (
                <button
                  onClick={e => { e.stopPropagation(); onAccept(u.incomingRequestId!); }}
                  className="text-xs font-medium flex items-center gap-1 bg-blue-500 text-white px-2.5 py-1.5 rounded-full hover:bg-blue-600 transition-colors"
                >
                  <Check size={11} />Accept
                </button>
              ) : isPending ? (
                <span className="text-xs text-amber-600 font-medium flex items-center gap-1 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded-full">
                  <Clock size={11} />Pending
                </span>
              ) : (
                <button
                  onClick={e => { e.stopPropagation(); onSendRequest(u.id); }}
                  disabled={sendPending}
                  className="text-xs font-medium flex items-center gap-1 bg-violet-500 text-white px-2.5 py-1.5 rounded-full hover:bg-violet-600 disabled:opacity-50 transition-colors"
                >
                  <UserPlus size={11} />Add
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}


// ── Friend Requests Section ───────────────────────────────────────────────────

function FriendRequestsSection({
  incoming,
  onAccept,
  onDecline,
}: {
  incoming: FriendRequest[];
  onAccept: (id: number) => void;
  onDecline: (id: number) => void;
}) {
  if (incoming.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="font-semibold text-base">Friend Requests</h2>
        <span className="px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold">
          {incoming.length}
        </span>
      </div>
      <div className="space-y-2">
        {incoming.map((req) => (
          <div
            key={req.id}
            className="flex items-center gap-3 p-3 rounded-xl border bg-card"
          >
            {req.otherUser.avatarUrl ? (
              <img
                src={req.otherUser.avatarUrl}
                alt={req.otherUser.name}
                className="w-10 h-10 rounded-full object-cover shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
                {req.otherUser.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{req.otherUser.name}</p>
              <p className="text-xs text-muted-foreground">Wants to connect with you</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => onAccept(req.id)}
                className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
              >
                Accept
              </button>
              <button
                onClick={() => onDecline(req.id)}
                className="px-3 py-1.5 rounded-lg border text-xs font-medium hover:bg-secondary transition-colors"
              >
                Decline
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Inbox Section ─────────────────────────────────────────────────────────────

function InboxSection() {
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState(true);
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: items = [], isLoading } = useQuery<InboxItem[]>({
    queryKey: ["/api/recommendations/inbox", filter],
    queryFn: () => apiRequest("GET", `/api/recommendations/inbox?type=${filter}`).then(r => r.json()),
  });

  const markReadMut = useMutation({
    mutationFn: ({ type, id }: { type: string; id: number }) =>
      apiRequest("PATCH", `/api/recommendations/${type}/${id}/read`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/recommendations/inbox"] });
      qc.invalidateQueries({ queryKey: ["/api/shares/count"] });
    },
  });

  const addMut = useMutation({
    mutationFn: ({ type, id }: { type: string; id: number }) =>
      apiRequest("POST", `/api/recommendations/${type}/${id}/add`),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/recommendations/inbox"] });
      qc.invalidateQueries({ queryKey: ["/api/shares/count"] });
      toast({ title: "Added to your collection!" });
      markReadMut.mutate(vars);
    },
    onError: () => toast({ title: "Couldn't add item", variant: "destructive" }),
  });

  const unreadCount = items.filter(i => !i.isRead).length;

  return (
    <div className="space-y-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left"
      >
        <h2 className="font-semibold text-base">Inbox</h2>
        {unreadCount > 0 && (
          <span className="px-1.5 py-0.5 rounded-full bg-violet-500 text-white text-[10px] font-bold">{unreadCount}</span>
        )}
        <span className="ml-auto text-muted-foreground">
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>

      {expanded && (
        <>
          {/* Filter tabs — hidden while the inbox is empty (nothing to filter) */}
          {(items.length > 0 || filter !== "all") && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {REC_TYPES.map(t => (
              <button
                key={t.key}
                onClick={() => setFilter(t.key)}
                className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors shrink-0 ${filter === t.key ? "bg-violet-500 text-white" : "bg-secondary hover:bg-secondary/80"}`}
              >
                {t.emoji} {t.label}
              </button>
            ))}
          </div>
          )}

          {isLoading && (
            <div className="py-6 flex items-center justify-center">
              <Loader2 size={20} className="animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && items.length === 0 && (
            <div className="py-8 text-center text-muted-foreground">
              <p className="text-sm">No recommendations yet</p>
              <p className="text-xs mt-1">Your friends' picks will show up here</p>
            </div>
          )}

          <div className="space-y-2">
            {items.map(item => {
              const Icon = REC_ICONS[item.recType];
              const color = REC_COLORS[item.recType] ?? "text-muted-foreground";
              return (
                <div
                  key={`${item.recType}-${item.id}`}
                  onClick={() => { if (!item.isRead) markReadMut.mutate({ type: item.recType, id: item.id }); }}
                  className={`flex gap-3 p-3 rounded-2xl border transition-colors cursor-pointer ${
                    !item.isRead ? "bg-violet-50 dark:bg-violet-950/20 border-violet-200/60 dark:border-violet-700/30" : "bg-card"
                  }`}
                >
                  {/* Artwork */}
                  <div className={`w-14 h-14 rounded-xl overflow-hidden bg-muted flex-shrink-0 flex items-center justify-center`}>
                    {item.imageUrl
                      ? <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                      : Icon ? <Icon size={22} className={color} /> : null
                    }
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Sender */}
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Avatar user={item.fromUser} size={16} />
                      <p className="text-[11px] text-muted-foreground">
                        <span className="font-medium">{item.fromUser.name}</span> recommended
                      </p>
                      <span className="ml-auto text-[10px] text-muted-foreground shrink-0">{timeAgo(item.createdAt)}</span>
                    </div>

                    {/* Title */}
                    <p className="text-sm font-semibold line-clamp-1">{item.title}</p>
                    {item.subtitle && <p className="text-xs text-muted-foreground line-clamp-1">{item.subtitle}</p>}
                    {item.note && <p className="text-xs text-muted-foreground italic mt-0.5 line-clamp-2">"{item.note}"</p>}
                  </div>

                  {/* Add button */}
                  <button
                    onClick={e => { e.stopPropagation(); addMut.mutate({ type: item.recType, id: item.id }); }}
                    disabled={addMut.isPending}
                    className="shrink-0 self-center w-8 h-8 rounded-full bg-violet-500/10 hover:bg-violet-500 text-violet-500 hover:text-white transition-colors flex items-center justify-center"
                    title="Add to my collection"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── Friends List Section ──────────────────────────────────────────────────────

function FriendsListSection({ onUnfriend }: { onUnfriend: (id: number) => void }) {
  const [, navigate] = useLocation();
  const [recTarget, setRecTarget] = useState<EnrichedFriend | null>(null);
  const [expanded, setExpanded] = useState(true);

  const { data: friends = [], isLoading } = useQuery<EnrichedFriend[]>({
    queryKey: ["/api/friends/enriched"],
    queryFn: () => apiRequest("GET", "/api/friends/enriched").then(r => r.json()),
  });

  return (
    <div className="space-y-3">
      <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-2 w-full text-left">
        <h2 className="font-semibold text-base">Friends</h2>
        <span className="text-xs text-muted-foreground bg-secondary px-1.5 py-0.5 rounded-full">{friends.length}</span>
        <span className="ml-auto text-muted-foreground">
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>

      {expanded && (
        <>
          {isLoading && (
            <div className="py-6 flex items-center justify-center">
              <Loader2 size={20} className="animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && friends.length === 0 && (
            <div className="py-6 text-center text-muted-foreground">
              <p className="text-sm">No friends yet</p>
              <p className="text-xs mt-1">Use the search above to find people on the app</p>
            </div>
          )}

          <div className="space-y-2">
            {friends.map(f => (
              <div
                key={f.id}
                onClick={() => navigate(`/profile/${f.id}`)}
                className="flex items-center gap-3 p-3 rounded-2xl border bg-card cursor-pointer hover:border-violet-300/50 transition-colors"
              >
                <Avatar user={f} size={44} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold truncate">{f.name}</p>
                    {f.tasteMatchPct > 0 && (
                      <span className="shrink-0 text-[10px] font-bold text-violet-500 bg-violet-50 dark:bg-violet-950/30 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                        <Sparkles size={8} />{f.tasteMatchPct}%
                      </span>
                    )}
                  </div>
                  {f.recentActivityLabel
                    ? <p className="text-xs text-muted-foreground line-clamp-1">{f.recentActivityLabel}</p>
                    : <p className="text-xs text-muted-foreground">{f.email}</p>
                  }
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={e => { e.stopPropagation(); setRecTarget(f); }}
                    className="px-2.5 py-1.5 rounded-xl border text-xs font-medium text-violet-600 border-violet-300/60 bg-violet-50 dark:bg-violet-950/20 hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-colors"
                  >
                    Rec →
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); onUnfriend(f.id); }}
                    className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                    title="Remove friend"
                  >
                    <UserX size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {recTarget && <RecModal friend={recTarget} onClose={() => setRecTarget(null)} />}
    </div>
  );
}

// ── Pending Requests Section ──────────────────────────────────────────────────

function PendingSection({ requests, onAccept, onDecline, onCancel }: {
  requests: { incoming: FriendRequest[]; outgoing: FriendRequest[] };
  onAccept: (id: number) => void;
  onDecline: (id: number) => void;
  onCancel: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const total = requests.incoming.length + requests.outgoing.length;
  if (total === 0) return null;

  return (
    <div className="space-y-3">
      <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-2 w-full text-left">
        <h2 className="font-semibold text-base">Pending</h2>
        {total > 0 && (
          <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-bold">{total}</span>
        )}
        <span className="ml-auto text-muted-foreground">
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>

      {expanded && (
        <div className="space-y-2">
          {requests.incoming.map(req => (
            <div key={req.id} className="flex items-center gap-3 p-3 rounded-2xl border bg-card">
              <Avatar user={req.otherUser} size={40} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{req.otherUser.name}</p>
                <p className="text-xs text-muted-foreground">Sent you a request</p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button
                  onClick={() => onAccept(req.id)}
                  className="w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center hover:bg-green-600 transition-colors"
                  title="Accept"
                >
                  <Check size={14} />
                </button>
                <button
                  onClick={() => onDecline(req.id)}
                  className="w-8 h-8 rounded-full border text-muted-foreground flex items-center justify-center hover:bg-destructive/10 hover:text-destructive transition-colors"
                  title="Decline"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          ))}

          {requests.outgoing.map(req => (
            <div key={req.id} className="flex items-center gap-3 p-3 rounded-2xl border bg-card opacity-75">
              <Avatar user={req.otherUser} size={40} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{req.otherUser.name}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock size={10} />Request sent</p>
              </div>
              <button
                onClick={() => onCancel(req.id)}
                className="text-xs text-muted-foreground border px-2.5 py-1 rounded-full hover:text-destructive hover:border-destructive/30 transition-colors"
              >
                Cancel
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Social Hub ───────────────────────────────────────────────────────────

export default function FriendsSocialHub() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: friendsData = [] } = useQuery<PublicUser[]>({
    queryKey: ["/api/friends"],
    queryFn: () => apiRequest("GET", "/api/friends").then(r => r.json()),
  });

  // Library richness — gates invite prompt
  const { data: _hub } = useQuery<{ lifeStats: { counts: Record<string, number> } }>({
    queryKey: ["/api/mylifos/hub"],
    queryFn: () => apiRequest("GET", "/api/mylifos/hub").then(r => r.json()),
  });
  const hubCounts = _hub?.lifeStats?.counts ?? {};
  const hubLibraryCount = (hubCounts.reading ?? 0) + (hubCounts.movies ?? 0) +
    (hubCounts.music ?? 0) + (hubCounts.recipes ?? 0) +
    (hubCounts.spots ?? 0) + (hubCounts.hobbies ?? 0) + (hubCounts.journal ?? 0);

  const { data: requests = { incoming: [], outgoing: [] } } = useQuery<{ incoming: FriendRequest[]; outgoing: FriendRequest[] }>({
    queryKey: ["/api/friend-requests"],
    queryFn: () => apiRequest("GET", "/api/friend-requests").then(r => r.json()),
  });

  const sendMut = useMutation({
    mutationFn: (toUserId: number) => apiRequest("POST", "/api/friend-requests", { toUserId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/friend-requests"] });
      qc.invalidateQueries({ queryKey: ["/api/friends"] });
      toast({ title: "Friend request sent!" });
    },
    onError: () => toast({ title: "Couldn't send request", variant: "destructive" }),
  });

  const respondMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: "accepted" | "declined" }) =>
      apiRequest("PATCH", `/api/friend-requests/${id}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/friend-requests"] });
      qc.invalidateQueries({ queryKey: ["/api/friends"] });
      qc.invalidateQueries({ queryKey: ["/api/friends/enriched"] });
      qc.invalidateQueries({ queryKey: ["/api/friend-requests/count"] });
    },
  });

  const cancelMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/friend-requests/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/friend-requests"] }),
  });

  const unfriendMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/friends/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/friends"] });
      qc.invalidateQueries({ queryKey: ["/api/friends/enriched"] });
      toast({ title: "Friend removed" });
    },
  });

  return (
    <div className="space-y-6">
      {/* Search */}
      <SearchSection
        onSendRequest={(id) => sendMut.mutate(id)}
        onAccept={(reqId) => respondMut.mutate({ id: reqId, status: "accepted" })}
        friends={friendsData}
        requests={requests}
        sendPending={sendMut.isPending}
      />

      {/* Accountability buddies */}
      <BuddiesSection />

      {/* Contact matches + invite link */}
      <ContactMatchesSection
        onSendRequest={(id) => sendMut.mutate(id)}
        onAccept={(reqId) => respondMut.mutate({ id: reqId, status: "accepted" })}
        sendPending={sendMut.isPending}
        libraryCount={hubLibraryCount}
      />

      {/* Incoming Friend Requests */}
      <FriendRequestsSection
        incoming={requests.incoming}
        onAccept={(id) => respondMut.mutate({ id, status: "accepted" })}
        onDecline={(id) => respondMut.mutate({ id, status: "declined" })}
      />

      {/* Recommendations Inbox */}
      <InboxSection />

      {/* Friends List */}
      <FriendsListSection
        onUnfriend={(id) => unfriendMut.mutate(id)}
      />
    </div>
  );
}
