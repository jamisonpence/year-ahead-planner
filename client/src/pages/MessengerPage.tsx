import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format, parseISO, isToday, isYesterday } from "date-fns";
import {
  MessageSquare, Plus, Search, Users, X, Send, ChevronLeft,
  Pencil, Trash2, Check, CheckCheck, MoreHorizontal, Gift,
  MapPin, Film, ChefHat, BookOpen, Dumbbell,
} from "lucide-react";
import type { ConversationWithDetails, MessageWithSender, PublicUser, ReactionSummary, SharePayload } from "@shared/schema";

// ── Helpers ───────────────────────────────────────────────────────────────────

function msgTime(iso: string): string {
  const d = parseISO(iso);
  if (isToday(d))      return format(d, "h:mm a");
  if (isYesterday(d))  return "Yesterday";
  return format(d, "MMM d");
}

function fullTime(iso: string): string {
  return format(parseISO(iso), "MMM d, yyyy 'at' h:mm a");
}

function Avatar({ name, avatarUrl, size = 36, className = "" }: {
  name: string; avatarUrl: string | null; size?: number; className?: string;
}) {
  const initials = name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
  if (avatarUrl) return (
    <img src={avatarUrl} alt={name}
      className={`rounded-full object-cover shrink-0 ${className}`}
      style={{ width: size, height: size }} />
  );
  return (
    <div
      className={`rounded-full bg-primary/20 text-primary font-semibold flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {initials}
    </div>
  );
}

// Conversation display name: for DMs, show the other person's name; for groups, show group name
function convName(conv: ConversationWithDetails, myId: number): string {
  if (conv.isGroup) return conv.name ?? "Group";
  const other = conv.participants.find(p => p.id !== myId);
  return other?.name ?? "Direct Message";
}

function convAvatar(conv: ConversationWithDetails, myId: number, size = 36) {
  if (conv.isGroup) {
    return (
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <div className={`absolute inset-0 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center text-violet-600 dark:text-violet-400`}>
          <Users size={Math.round(size * 0.45)} />
        </div>
      </div>
    );
  }
  const other = conv.participants.find(p => p.id !== myId);
  if (!other) return null;
  return <Avatar name={other.name} avatarUrl={other.avatarUrl} size={size} />;
}

// ── New DM Dialog ─────────────────────────────────────────────────────────────

function NewDMDialog({ friends, onStart, onClose }: {
  friends: PublicUser[];
  onStart: (friendId: number) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = query
    ? friends.filter(f => f.name.toLowerCase().includes(query.toLowerCase()) || f.email.toLowerCase().includes(query.toLowerCase()))
    : friends;

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare size={16} /> New Message
          </DialogTitle>
        </DialogHeader>
        <div className="relative mb-3">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search friends…"
            className="pl-8 h-9"
            autoFocus
          />
        </div>
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No friends found</p>
        ) : (
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {filtered.map(f => (
              <button
                key={f.id}
                onClick={() => onStart(f.id)}
                className="flex items-center gap-3 w-full p-2.5 rounded-xl hover:bg-secondary/60 transition-colors text-left"
              >
                <Avatar name={f.name} avatarUrl={f.avatarUrl} size={36} />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{f.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{f.email}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── New Group Dialog ──────────────────────────────────────────────────────────

function NewGroupDialog({ friends, onCreate, onClose }: {
  friends: PublicUser[];
  onCreate: (name: string, participantIds: number[]) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number[]>([]);

  const filtered = query
    ? friends.filter(f => f.name.toLowerCase().includes(query.toLowerCase()))
    : friends;

  const toggle = (id: number) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users size={16} /> New Group
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Group name…"
            className="h-9"
            autoFocus
          />
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Add friends…"
              className="pl-8 h-9"
            />
          </div>

          {selected.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selected.map(id => {
                const f = friends.find(x => x.id === id)!;
                return (
                  <span key={id} className="flex items-center gap-1 bg-primary/10 text-primary text-xs rounded-full px-2.5 py-1">
                    {f.name.split(" ")[0]}
                    <button onClick={() => toggle(id)}><X size={11} /></button>
                  </span>
                );
              })}
            </div>
          )}

          <div className="space-y-1 max-h-48 overflow-y-auto">
            {filtered.map(f => (
              <button
                key={f.id}
                onClick={() => toggle(f.id)}
                className={`flex items-center gap-3 w-full p-2 rounded-xl transition-colors text-left ${
                  selected.includes(f.id) ? "bg-primary/10" : "hover:bg-secondary/60"
                }`}
              >
                <Avatar name={f.name} avatarUrl={f.avatarUrl} size={30} />
                <span className="text-sm flex-1">{f.name}</span>
                {selected.includes(f.id) && <Check size={14} className="text-primary shrink-0" />}
              </button>
            ))}
          </div>

          <Button
            className="w-full gap-2"
            disabled={!name.trim() || selected.length === 0}
            onClick={() => onCreate(name.trim(), selected)}
          >
            <Users size={15} /> Create Group
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Reaction Picker ───────────────────────────────────────────────────────────

const QUICK_EMOJIS = [
  // Smileys & people
  "😀","😃","😄","😁","😆","😅","🤣","😂","🙂","😊","😇","🥰","😍","🤩","😘","😗",
  "😚","😙","🥲","😋","😛","😜","🤪","😝","🤑","🤗","🤭","🤫","🤔","🤐","🤨","😐",
  "😑","😶","😏","😒","🙄","😬","🤥","😌","😔","😪","🤤","😴","😷","🤒","🤕","🤢",
  "🤮","🤧","🥵","🥶","🥴","😵","🤯","🤠","🥸","😎","🤓","🧐","😕","😟","🙁","☹️",
  "😮","😯","😲","😳","🥺","😦","😧","😨","😰","😥","😢","😭","😱","😖","😣","😞",
  "😓","😩","😫","🥱","😤","😡","😠","🤬","😈","👿","💀","☠️","💩","🤡","👹","👺",
  "👻","👽","👾","🤖",
  // Hand gestures & people
  "👋","🤚","🖐️","✋","🖖","👌","🤌","🤏","✌️","🤞","🤟","🤘","🤙","👈","👉","👆",
  "🖕","👇","☝️","👍","👎","✊","👊","🤛","🤜","👏","🙌","👐","🤲","🤝","🙏","✍️",
  "💅","🤳","💪","🦾","🦵","🦶","👂","🦻","👃","🫀","🫁","🧠","🦷","🦴","👀","👁️",
  "👅","👄","💋",
  // Hearts & symbols
  "❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕","💞","💓","💗","💖",
  "💘","💝","💟","♥️","🔥","✨","⭐","🌟","💫","⚡","❄️","🌈","☁️","🌊","💧","💦",
  // Celebration & misc
  "🎉","🎊","🎈","🎁","🏆","🥇","🎯","🎮","🕹️","🎲","🃏","🎰","🧩","🎭","🎨","🎬",
  "🎤","🎧","🎼","🎵","🎶","🎷","🎸","🎹","🎺","🎻","🥁","🪘",
  // Food & drink
  "🍕","🍔","🌮","🍜","🍣","🍰","🎂","🍩","🍪","🍫","🍬","🍭","☕","🧋","🍺","🥂",
  // Animals
  "🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🦄",
  "🐙","🦋","🐝","🌸","🌺","🌻","🌹","🍀","🌴","🌵",
  // Objects & activities
  "💪","🏃","🚀","✈️","🚗","⚽","🏀","🏈","⚾","🎾","🏐","🏉","🎱","🏓","🏸","🥊",
  "🎿","🛷","🏂","🪂","🤸","🏊","🚴","🧘","💼","📱","💻","📷","🎥","🔑","🏠","🌍",
];

// ── Share Card ────────────────────────────────────────────────────────────────

const SHARE_TYPE_META: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  spot:    { icon: <MapPin size={14} />,    color: "#f97316", label: "Place"   },
  movie:   { icon: <Film size={14} />,      color: "#8b5cf6", label: "Movie"   },
  recipe:  { icon: <ChefHat size={14} />,   color: "#10b981", label: "Recipe"  },
  book:    { icon: <BookOpen size={14} />,  color: "#3b82f6", label: "Book"    },
  workout: { icon: <Dumbbell size={14} />,  color: "#ef4444", label: "Workout" },
};

function ShareDetailModal({ payload, onClose }: { payload: SharePayload; onClose: () => void }) {
  const meta = SHARE_TYPE_META[payload.shareType] ?? { icon: <Gift size={14} />, color: "#6b7280", label: "Share" };
  const d = payload.details ?? {};

  const renderDetails = () => {
    if (payload.shareType === 'recipe') {
      const totalMins = (d.prepTime ?? 0) + (d.cookTime ?? 0);
      // ingredientsJson stores { name: string; qty: string }[] objects
      let ingredients: { name: string; qty: string }[] = [];
      try {
        const parsed = JSON.parse(d.ingredientsJson ?? '[]');
        if (Array.isArray(parsed)) {
          ingredients = parsed.map((ing: any) =>
            typeof ing === 'string'
              ? { name: ing, qty: '' }
              : { name: String(ing.name ?? ''), qty: String(ing.qty ?? '') }
          );
        }
      } catch {}

      return (
        <div className="space-y-4">
          {/* Stats row */}
          <div className="flex gap-3 flex-wrap">
            {d.category && (
              <div className="flex-1 min-w-[80px] rounded-xl bg-secondary/60 p-3 text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-0.5">Category</p>
                <p className="text-sm font-semibold">{d.category}</p>
              </div>
            )}
            {totalMins > 0 && (
              <div className="flex-1 min-w-[80px] rounded-xl bg-secondary/60 p-3 text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-0.5">Total Time</p>
                <p className="text-sm font-semibold">{totalMins} min</p>
              </div>
            )}
            {d.servings && (
              <div className="flex-1 min-w-[80px] rounded-xl bg-secondary/60 p-3 text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-0.5">Servings</p>
                <p className="text-sm font-semibold">{d.servings}</p>
              </div>
            )}
          </div>
          {ingredients.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Ingredients</p>
              <ul className="space-y-1">
                {ingredients.map((ing, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: meta.color }} />
                    <span>{[ing.qty, ing.name].filter(Boolean).join(' ')}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {d.instructions && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Instructions</p>
              <p className="text-sm leading-relaxed text-foreground/80 whitespace-pre-line">{d.instructions}</p>
            </div>
          )}
        </div>
      );
    }

    if (payload.shareType === 'spot') {
      const tags: string[] = (() => {
        try { return JSON.parse(d.tags ?? '[]'); } catch { return []; }
      })();
      return (
        <div className="space-y-4">
          {/* Address / location */}
          {(d.address || d.city) && (
            <div className="flex items-start gap-2 text-sm">
              <MapPin size={15} className="mt-0.5 shrink-0" style={{ color: meta.color }} />
              <span>{[d.address, d.neighborhood, d.city].filter(Boolean).join(', ')}</span>
            </div>
          )}
          {/* Stats row */}
          <div className="flex gap-3 flex-wrap">
            {d.type && (
              <div className="flex-1 min-w-[80px] rounded-xl bg-secondary/60 p-3 text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-0.5">Type</p>
                <p className="text-sm font-semibold capitalize">{d.type}</p>
              </div>
            )}
            {d.priceRange && (
              <div className="flex-1 min-w-[80px] rounded-xl bg-secondary/60 p-3 text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-0.5">Price</p>
                <p className="text-sm font-semibold">{d.priceRange}</p>
              </div>
            )}
            {d.rating && (
              <div className="flex-1 min-w-[80px] rounded-xl bg-secondary/60 p-3 text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-0.5">Rating</p>
                <p className="text-sm font-semibold">⭐ {d.rating}/5</p>
              </div>
            )}
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t: string) => (
                <span key={t} className="text-xs px-2.5 py-1 rounded-full border font-medium" style={{ borderColor: `${meta.color}50`, color: meta.color, background: `${meta.color}12` }}>
                  {t}
                </span>
              ))}
            </div>
          )}
          {d.website && (
            <a href={d.website} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm font-medium hover:underline"
              style={{ color: meta.color }}
            >
              🔗 {d.website}
            </a>
          )}
          {d.spotNotes && (
            <div className="rounded-xl bg-secondary/40 px-3 py-2.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Notes</p>
              <p className="text-sm leading-relaxed">{d.spotNotes}</p>
            </div>
          )}
        </div>
      );
    }

    if (payload.shareType === 'movie') {
      const genres: string[] = (() => {
        try { return JSON.parse(d.genres ?? '[]'); } catch { return []; }
      })();
      const streaming: string[] = (() => {
        try { return JSON.parse(d.streamingOn ?? '[]'); } catch { return []; }
      })();
      return (
        <div className="space-y-4">
          <div className="flex gap-4">
            {d.posterUrl && (
              <img src={d.posterUrl} alt={payload.name} className="w-20 rounded-xl object-cover shrink-0" />
            )}
            <div className="flex-1 space-y-3">
              <div className="flex gap-2 flex-wrap">
                {d.mediaType && (
                  <div className="rounded-xl bg-secondary/60 px-3 py-2 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-0.5">Type</p>
                    <p className="text-sm font-semibold">{d.mediaType === 'tv' ? 'TV Show' : 'Movie'}</p>
                  </div>
                )}
                {d.releaseYear && (
                  <div className="rounded-xl bg-secondary/60 px-3 py-2 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-0.5">Year</p>
                    <p className="text-sm font-semibold">{d.releaseYear}</p>
                  </div>
                )}
              </div>
              {d.director && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-0.5">Director</p>
                  <p className="text-sm font-medium">{d.director}</p>
                </div>
              )}
            </div>
          </div>
          {genres.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {genres.map((g: string) => (
                <span key={g} className="text-xs px-2.5 py-1 rounded-full border font-medium" style={{ borderColor: `${meta.color}50`, color: meta.color, background: `${meta.color}12` }}>
                  {g}
                </span>
              ))}
            </div>
          )}
          {streaming.length > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1.5">Watch on</p>
              <div className="flex flex-wrap gap-1.5">
                {streaming.map((s: string) => (
                  <span key={s} className="text-xs px-2.5 py-1 rounded-full bg-secondary/80 border font-medium">{s}</span>
                ))}
              </div>
            </div>
          )}
          {d.movieNotes && (
            <div className="rounded-xl bg-secondary/40 px-3 py-2.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Notes</p>
              <p className="text-sm leading-relaxed">{d.movieNotes}</p>
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  const hasDetails = payload.details && Object.values(payload.details).some(v => v != null && v !== '' && v !== '[]');

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          {/* Type badge */}
          <div
            className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest mb-2 w-fit px-2.5 py-1 rounded-full"
            style={{ background: `${meta.color}20`, color: meta.color }}
          >
            {meta.icon}
            {meta.label} Recommendation
          </div>
          <DialogTitle className="flex items-center gap-2 text-lg">
            {payload.emoji && <span className="text-2xl">{payload.emoji}</span>}
            {payload.name}
          </DialogTitle>
          {payload.subtitle && (
            <p className="text-sm text-muted-foreground">{payload.subtitle}</p>
          )}
        </DialogHeader>

        <div className="overflow-y-auto flex-1 space-y-4 pr-1">
          {payload.note && (
            <div
              className="rounded-xl px-3 py-2.5 text-sm italic"
              style={{ background: `${meta.color}12`, borderLeft: `3px solid ${meta.color}` }}
            >
              <span className="not-italic text-[10px] font-semibold uppercase tracking-widest text-muted-foreground block mb-1">Personal note</span>
              "{payload.note}"
            </div>
          )}

          {hasDetails ? renderDetails() : (
            <p className="text-sm text-muted-foreground text-center py-4">No additional details available.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ShareCard({ shareType, shareData, isOwn }: {
  shareType: string;
  shareData: string;
  isOwn: boolean;
}) {
  const [showDetail, setShowDetail] = useState(false);
  let payload: SharePayload;
  try { payload = JSON.parse(shareData); }
  catch { return <span className="text-xs text-muted-foreground italic">Shared item</span>; }

  const meta = SHARE_TYPE_META[shareType] ?? { icon: <Gift size={14} />, color: "#6b7280", label: "Share" };
  const hasDetails = !!(
    payload.details &&
    Object.values(payload.details).some(v => v != null && v !== '' && v !== '[]' && v !== '{}')
  );

  return (
    <>
      <div
        onClick={() => hasDetails && setShowDetail(true)}
        className={`rounded-2xl overflow-hidden border text-sm max-w-[260px] transition-all ${
          isOwn ? "rounded-br-sm" : "rounded-bl-sm"
        } ${hasDetails ? "cursor-pointer hover:shadow-md hover:scale-[1.01] active:scale-100" : ""}`}
        style={{ borderColor: `${meta.color}40`, background: `${meta.color}12` }}
      >
        {/* Header badge */}
        <div
          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest"
          style={{ background: `${meta.color}25`, color: meta.color }}
        >
          {meta.icon}
          {payload.emoji && <span>{payload.emoji}</span>}
          {meta.label} Recommendation
        </div>

        {/* Body */}
        <div className="px-3 py-2.5">
          <p className="font-semibold leading-tight">{payload.name}</p>
          {payload.subtitle && (
            <p className="text-[11px] text-muted-foreground mt-0.5">{payload.subtitle}</p>
          )}
          {payload.note && (
            <p className="mt-1.5 text-xs italic text-foreground/70 border-t pt-1.5" style={{ borderColor: `${meta.color}30` }}>
              "{payload.note}"
            </p>
          )}
          {hasDetails && (
            <p className="mt-1.5 text-[10px] font-medium" style={{ color: meta.color }}>
              Tap to view details →
            </p>
          )}
        </div>
      </div>
      {showDetail && <ShareDetailModal payload={payload} onClose={() => setShowDetail(false)} />}
    </>
  );
}

// ── Share Picker ──────────────────────────────────────────────────────────────

type SharePickerTab = 'spots' | 'movies' | 'recipes';

function SharePicker({ onShare, onClose }: {
  onShare: (shareType: string, shareData: SharePayload, note: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<SharePickerTab>('spots');
  const [search, setSearch] = useState('');
  const [note, setNote] = useState('');
  const [selected, setSelected] = useState<{ type: string; payload: SharePayload } | null>(null);

  const { data: spots = [] }   = useQuery<any[]>({ queryKey: ['/api/spots'],   queryFn: () => apiRequest('GET', '/api/spots').then(r => r.json())   });
  const { data: movies = [] }  = useQuery<any[]>({ queryKey: ['/api/movies'],  queryFn: () => apiRequest('GET', '/api/movies').then(r => r.json())  });
  const { data: recipes = [] } = useQuery<any[]>({ queryKey: ['/api/recipes'], queryFn: () => apiRequest('GET', '/api/recipes').then(r => r.json()) });

  const items: { type: string; payload: SharePayload }[] = (() => {
    const q = search.toLowerCase();
    if (tab === 'spots') {
      return spots
        .filter((s: any) => !q || s.name?.toLowerCase().includes(q))
        .map((s: any) => {
          const spotTypeEmoji: Record<string, string> = { restaurant: '🍽️', bar: '🍸', cafe: '☕', hotel: '🏨', attraction: '🎯', shop: '🛍️', park: '🌳', other: '📍' };
          return {
            type: 'spot',
            payload: {
              shareType: 'spot', name: s.name,
              subtitle: [s.type, s.neighborhood || s.city].filter(Boolean).join(' · '),
              emoji: spotTypeEmoji[s.type] ?? '📍',
              id: s.id,
              details: {
                type: s.type,
                address: s.address,
                neighborhood: s.neighborhood,
                city: s.city,
                website: s.website,
                priceRange: s.priceRange,
                tags: s.tags,
                rating: s.rating,
                spotNotes: s.spotNotes,
              },
            } as SharePayload,
          };
        });
    }
    if (tab === 'movies') {
      return movies
        .filter((m: any) => !q || m.title?.toLowerCase().includes(q))
        .map((m: any) => ({
          type: 'movie',
          payload: {
            shareType: 'movie', name: m.title,
            subtitle: [m.mediaType === 'tv' ? 'TV Show' : 'Movie', m.releaseYear ? String(m.releaseYear) : null].filter(Boolean).join(' · '),
            emoji: m.mediaType === 'tv' ? '📺' : '🎬',
            imageUrl: m.posterUrl ?? undefined,
            id: m.id,
            details: {
              mediaType: m.mediaType,
              releaseYear: m.releaseYear,
              director: m.director,
              genres: m.genres,
              streamingOn: m.streamingOn,
              posterUrl: m.posterUrl,
              movieNotes: m.movieNotes,
            },
          } as SharePayload,
        }));
    }
    if (tab === 'recipes') {
      return recipes
        .filter((r: any) => !q || r.name?.toLowerCase().includes(q))
        .map((r: any) => {
          const totalMins = (r.prepTime ?? 0) + (r.cookTime ?? 0);
          return {
            type: 'recipe',
            payload: {
              shareType: 'recipe', name: r.name,
              subtitle: [r.category, totalMins > 0 ? `${totalMins} min` : null].filter(Boolean).join(' · '),
              emoji: r.emoji ?? '🍽️',
              imageUrl: r.imageUrl ?? undefined,
              id: r.id,
              details: {
                category: r.category,
                prepTime: r.prepTime,
                cookTime: r.cookTime,
                servings: r.servings,
                ingredientsJson: r.ingredientsJson,
                instructions: r.instructions,
              },
            } as SharePayload,
          };
        });
    }
    return [];
  })();

  const tabs: { key: SharePickerTab; label: string; icon: React.ReactNode }[] = [
    { key: 'spots',   label: 'Places',  icon: <MapPin size={13} /> },
    { key: 'movies',  label: 'Movies',  icon: <Film size={13} /> },
    { key: 'recipes', label: 'Recipes', icon: <ChefHat size={13} /> },
  ];

  return (
    <div className="absolute bottom-full mb-2 left-0 w-80 bg-card border rounded-2xl shadow-xl overflow-hidden z-50">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b">
        <span className="text-sm font-semibold">Share a Recommendation</span>
        <button onClick={onClose} className="p-1 rounded-full hover:bg-secondary transition-colors"><X size={13} /></button>
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setSearch(''); setSelected(null); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
              tab === t.key ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="px-3 pt-2">
        <Input
          placeholder={`Search ${tab}…`}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="h-8 text-xs"
        />
      </div>

      {/* Items list */}
      <div className="max-h-44 overflow-y-auto px-2 py-2 space-y-0.5">
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">No {tab} found</p>
        ) : items.map((item, i) => (
          <button
            key={i}
            onClick={() => setSelected(selected?.payload.name === item.payload.name ? null : item)}
            className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-xs transition-colors ${
              selected?.payload.name === item.payload.name
                ? 'bg-primary/10 border border-primary/30'
                : 'hover:bg-secondary'
            }`}
          >
            <span className="text-base leading-none">{item.payload.emoji}</span>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{item.payload.name}</p>
              {item.payload.subtitle && <p className="text-muted-foreground truncate">{item.payload.subtitle}</p>}
            </div>
            {selected?.payload.name === item.payload.name && (
              <Check size={13} className="text-primary shrink-0" />
            )}
          </button>
        ))}
      </div>

      {/* Note + send */}
      {selected && (
        <div className="border-t px-3 py-2.5 space-y-2">
          <Input
            placeholder="Add a note… (optional)"
            value={note}
            onChange={e => setNote(e.target.value)}
            className="h-8 text-xs"
          />
          <Button
            size="sm"
            className="w-full gap-1.5"
            onClick={() => { onShare(selected.type, selected.payload, note); onClose(); }}
          >
            <Send size={13} /> Send Recommendation
          </Button>
        </div>
      )}
    </div>
  );
}

function ReactionPicker({ onPick, onClose }: { onPick: (e: string) => void; onClose: () => void }) {
  return (
    <div
      className="absolute z-50 p-2 rounded-2xl bg-popover border shadow-xl w-72"
      onMouseLeave={onClose}
    >
      <div className="grid grid-cols-9 gap-0.5 max-h-56 overflow-y-auto">
        {QUICK_EMOJIS.map((e, i) => (
          <button
            key={i}
            onClick={() => { onPick(e); onClose(); }}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-secondary transition-colors text-base leading-none"
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}


// ── GIF Picker Dialog ─────────────────────────────────────────────────────────
function GifPickerDialog({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (url: string) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);   // start true so spinner shows immediately
  const [apiError, setApiError] = useState(false);

  useEffect(() => {
    if (open) { setQuery(""); setResults([]); setApiError(false); setLoading(true); loadTrending(); }
  }, [open]);

  async function loadTrending() {
    setLoading(true);
    try {
      const r = await apiRequest("GET", "/api/gifs/trending?limit=24");
      const data = await r.json();
      const items = data?.data ?? data?.results ?? [];
      setResults(items);
      if (items.length === 0) setApiError(true);
    } catch { setApiError(true); setResults([]); }
    finally { setLoading(false); }
  }

  async function doSearch(q: string) {
    if (!q.trim()) { loadTrending(); return; }
    setLoading(true); setApiError(false);
    try {
      const r = await apiRequest("GET", `/api/gifs/search?q=${encodeURIComponent(q)}&limit=24`);
      const data = await r.json();
      setResults(data?.data ?? data?.results ?? []);
    } catch { setResults([]); }
    finally { setLoading(false); }
  }

  function getUrl(gif: any): string {
    return gif?.images?.fixed_height?.url ?? gif?.images?.original?.url
      ?? gif?.url ?? gif?.gif_url ?? gif?.media?.[0]?.gif?.url ?? gif?.media_formats?.gif?.url ?? "";
  }

  function getPreview(gif: any): string {
    return gif?.images?.fixed_height_small?.url ?? gif?.images?.fixed_height?.url ?? getUrl(gif);
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm p-0 gap-0 flex flex-col" style={{ height: "420px" }}>
        <DialogHeader className="px-4 pt-4 pb-2 shrink-0 border-b">
          <DialogTitle className="text-sm font-semibold">Send a GIF</DialogTitle>
        </DialogHeader>
        <div className="px-3 pt-3 pb-2 shrink-0">
          <div className="flex gap-2">
            <input
              className="flex-1 px-3 py-2 rounded-xl border bg-secondary/60 text-sm outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground"
              placeholder="Search GIFs…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") doSearch(query); }}
            />
            <button type="button" onClick={() => doSearch(query)}
              className="px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors shrink-0">
              Search
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-4">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 size={24} className="animate-spin text-muted-foreground" />
            </div>
          ) : apiError ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-center px-4">
              <p className="text-sm font-medium text-muted-foreground">GIF service not active</p>
              <p className="text-xs text-muted-foreground">Add <code className="bg-secondary px-1 rounded">KLIPY_API_KEY</code> in Railway Variables to enable GIFs.</p>
            </div>
          ) : results.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-10">No results. Try a different search.</p>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {results.map((gif, i) => {
                const preview = getPreview(gif);
                const full = getUrl(gif);
                if (!preview || !full) return null;
                return (
                  <button key={i} type="button" onClick={() => { onPick(full); onClose(); }}
                    className="rounded-lg overflow-hidden aspect-square hover:opacity-80 transition-opacity active:scale-95 bg-muted">
                    <img src={preview} alt="" className="w-full h-full object-cover" loading="lazy" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Message Bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg, isOwn, myId, showAvatar, onDelete, onReact }: {
  msg: MessageWithSender;
  isOwn: boolean;
  myId: number;
  showAvatar: boolean;
  onDelete?: () => void;
  onReact: (emoji: string, alreadyReacted: boolean) => void;
}) {
  const [hover, setHover] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  if (msg.isDeleted) {
    return (
      <div className={`flex gap-2 my-0.5 ${isOwn ? "flex-row-reverse" : "flex-row"}`}>
        {!isOwn && <div style={{ width: 28 }} />}
        <p className="text-xs text-muted-foreground italic px-2">Message deleted</p>
      </div>
    );
  }

  const reactions: ReactionSummary[] = msg.reactions ?? [];

  return (
    <div
      className={`flex gap-2 my-0.5 group items-end ${isOwn ? "flex-row-reverse" : "flex-row"}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); }}
    >
      {/* Avatar placeholder (keeps alignment) */}
      {!isOwn && (
        showAvatar
          ? <Avatar name={msg.sender.name} avatarUrl={msg.sender.avatarUrl} size={28} className="mb-0.5 shrink-0" />
          : <div style={{ width: 28 }} className="shrink-0" />
      )}

      <div className={`flex flex-col max-w-[72%] ${isOwn ? "items-end" : "items-start"}`}>
        {showAvatar && !isOwn && (
          <p className="text-[10px] text-muted-foreground mb-0.5 px-1">{msg.sender.name}</p>
        )}

        <div className={`relative flex items-end gap-1 ${isOwn ? "flex-row-reverse" : "flex-row"}`}>
          {msg.messageType === 'share' && msg.shareType && msg.shareData ? (
            <ShareCard shareType={msg.shareType} shareData={msg.shareData} isOwn={isOwn} />
          ) : msg.content?.startsWith("[gif]") ? (
              <img
                src={msg.content.slice(5)}
                alt="GIF"
                className="rounded-2xl max-w-[220px] max-h-[200px] object-cover"
              />
            ) : (
              <div
                className={`px-3 py-2 rounded-2xl text-sm leading-snug break-words ${
                  isOwn
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-secondary text-foreground rounded-bl-sm"
                }`}
              >
                {msg.content}
              </div>
            )}

          {/* Action buttons: react + delete — visible on hover */}
          <div className={`flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ${isOwn ? "flex-row-reverse" : "flex-row"}`}>
            {/* Emoji react button */}
            <div className="relative">
              <button
                onClick={() => setPickerOpen(p => !p)}
                className="p-1 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors text-base leading-none"
                title="Add reaction"
              >
                <span className="text-sm font-bold leading-none">+</span>
              </button>
              {pickerOpen && (
                <div className={`absolute bottom-full mb-1 ${isOwn ? "right-0" : "left-0"}`}>
                  <ReactionPicker
                    onPick={emoji => {
                      const already = reactions.find(r => r.emoji === emoji)?.userIds.includes(myId) ?? false;
                      onReact(emoji, already);
                      setPickerOpen(false);
                    }}
                    onClose={() => setPickerOpen(false)}
                  />
                </div>
              )}
            </div>
            {/* Delete button (own messages only) */}
            {isOwn && onDelete && (
              <button
                onClick={onDelete}
                className="p-1 rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                title="Delete"
              >
                <Trash2 size={11} />
              </button>
            )}
          </div>
        </div>

        {/* Reactions row */}
        {reactions.length > 0 && (
          <div className={`flex flex-wrap gap-1 mt-1 px-1 ${isOwn ? "justify-end" : "justify-start"}`}>
            {reactions.map(r => {
              const iMine = r.userIds.includes(myId);
              return (
                <button
                  key={r.emoji}
                  onClick={() => onReact(r.emoji, iMine)}
                  title={`${r.count} reaction${r.count !== 1 ? "s" : ""}`}
                  className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs border transition-colors ${
                    iMine
                      ? "bg-primary/15 border-primary/40 text-primary"
                      : "bg-secondary border-border text-foreground hover:bg-secondary/80"
                  }`}
                >
                  <span>{r.emoji}</span>
                  {r.count > 1 && <span className="font-medium">{r.count}</span>}
                </button>
              );
            })}
          </div>
        )}

        <p className="text-[10px] text-muted-foreground mt-0.5 px-1" title={fullTime(msg.createdAt)}>
          {msgTime(msg.createdAt)}
        </p>
      </div>
    </div>
  );
}

// ── Conversation List Item ────────────────────────────────────────────────────

function ConvItem({ conv, myId, active, onClick }: {
  conv: ConversationWithDetails;
  myId: number;
  active: boolean;
  onClick: () => void;
}) {
  const name = convName(conv, myId);
  const lastMsg = conv.lastMessage;
  const preview = lastMsg
    ? lastMsg.isDeleted
      ? "Message deleted"
      : lastMsg.sender.id === myId
        ? `You: ${lastMsg.content}`
        : lastMsg.content
    : "No messages yet";
  const time = lastMsg ? msgTime(lastMsg.createdAt) : "";

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors text-left hover:bg-secondary/60 ${
        active ? "bg-secondary border border-border" : ""
      }`}
    >
      <div className="shrink-0">{convAvatar(conv, myId, 40)}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1 mb-0.5">
          <p className={`text-sm truncate ${conv.unreadCount > 0 ? "font-semibold" : "font-medium"}`}>{name}</p>
          <span className="text-[10px] text-muted-foreground shrink-0">{time}</span>
        </div>
        <div className="flex items-center justify-between gap-1">
          <p className="text-xs text-muted-foreground truncate leading-tight">{preview}</p>
          {conv.unreadCount > 0 && (
            <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
              {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function MessengerPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();
  const myId = (user as any)?.id as number;

  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [gifPickerOpen, setGifPickerOpen] = useState(false);
  const [showDMDialog, setShowDMDialog] = useState(false);
  const [showGroupDialog, setShowGroupDialog] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Data queries ────────────────────────────────────────────────────────────

  const { data: conversations = [] } = useQuery<ConversationWithDetails[]>({
    queryKey: ["/api/messenger/conversations"],
    queryFn: async () => (await apiRequest("GET", "/api/messenger/conversations")).json(),
    refetchInterval: 8000,
  });

  const { data: friends = [] } = useQuery<PublicUser[]>({
    queryKey: ["/api/friends"],
    queryFn: async () => (await apiRequest("GET", "/api/friends")).json(),
  });

  const { data: messages = [], refetch: refetchMessages } = useQuery<MessageWithSender[]>({
    queryKey: ["/api/messenger/conversations", activeConvId, "messages"],
    queryFn: async () => (await apiRequest("GET", `/api/messenger/conversations/${activeConvId}/messages?limit=100`)).json(),
    enabled: !!activeConvId,
    refetchInterval: 3000,
  });

  // ── Mutations ───────────────────────────────────────────────────────────────

  const startDM = useMutation({
    mutationFn: (friendId: number) => apiRequest("POST", "/api/messenger/dm", { friendId }).then(r => r.json()),
    onSuccess: (conv: { id: number }) => {
      qc.invalidateQueries({ queryKey: ["/api/messenger/conversations"] });
      openConversation(conv.id);
      setShowDMDialog(false);
    },
    onError: () => toast({ title: "Could not open conversation", variant: "destructive" }),
  });

  const createGroup = useMutation({
    mutationFn: ({ name, participantIds }: { name: string; participantIds: number[] }) =>
      apiRequest("POST", "/api/messenger/groups", { name, participantIds }).then(r => r.json()),
    onSuccess: (conv: { id: number }) => {
      qc.invalidateQueries({ queryKey: ["/api/messenger/conversations"] });
      openConversation(conv.id);
      setShowGroupDialog(false);
    },
    onError: () => toast({ title: "Could not create group", variant: "destructive" }),
  });

  const [showSharePicker, setShowSharePicker] = useState(false);

  const sendMessage = useMutation({
    mutationFn: (content: string) =>
      apiRequest("POST", `/api/messenger/conversations/${activeConvId}/messages`, { content }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/messenger/conversations", activeConvId, "messages"] });
      qc.invalidateQueries({ queryKey: ["/api/messenger/conversations"] });
      setDraft("");
    },
    onError: () => toast({ title: "Failed to send message", variant: "destructive" }),
  });

  const sendShare = useMutation({
    mutationFn: ({ shareType, shareData, note }: { shareType: string; shareData: SharePayload; note: string }) =>
      apiRequest("POST", `/api/messenger/conversations/${activeConvId}/share`, {
        shareType, shareData, note,
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/messenger/conversations", activeConvId, "messages"] });
      qc.invalidateQueries({ queryKey: ["/api/messenger/conversations"] });
      toast({ title: "Recommendation sent!" });
    },
    onError: () => toast({ title: "Failed to send", variant: "destructive" }),
  });

  const deleteMessage = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/messenger/messages/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/messenger/conversations", activeConvId, "messages"] }),
  });

  const reactToMessage = useMutation({
    mutationFn: ({ msgId, emoji, remove }: { msgId: number; emoji: string; remove: boolean }) =>
      remove
        ? apiRequest("DELETE", `/api/messenger/messages/${msgId}/reactions/${encodeURIComponent(emoji)}`)
        : apiRequest("POST", `/api/messenger/messages/${msgId}/reactions`, { emoji }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/messenger/conversations", activeConvId, "messages"] }),
  });

  const markRead = useCallback((convId: number) => {
    apiRequest("POST", `/api/messenger/conversations/${convId}/read`).then(() => {
      qc.invalidateQueries({ queryKey: ["/api/messenger/conversations"] });
      qc.invalidateQueries({ queryKey: ["/api/messenger/unread-count"] });
    }).catch(() => {});
  }, [qc]);

  // ── Effects ─────────────────────────────────────────────────────────────────

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Mark as read when opening a conversation
  useEffect(() => {
    if (activeConvId) markRead(activeConvId);
  }, [activeConvId, messages.length]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  function openConversation(id: number) {
    setActiveConvId(id);
    setMobileView("chat");
    setDraft("");
  }

  function handleSend() {
    const content = draft.trim();
    if (!content || !activeConvId) return;
    sendMessage.mutate(content);
  }

  function handleSendGif(url: string) {
    if (!activeConvId) return;
    sendMessage.mutate("[gif]" + url);
    setGifPickerOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // ── Filtered conversations ───────────────────────────────────────────────────

  const filteredConvs = conversations.filter(c => {
    if (!search) return true;
    const name = convName(c, myId).toLowerCase();
    return name.includes(search.toLowerCase());
  });

  const activeConv = conversations.find(c => c.id === activeConvId) ?? null;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-x-0 top-14 bottom-24 flex lg:static lg:inset-auto lg:h-screen">

      {/* ── Left: Conversation List ──────────────────────────────────────────── */}
      <div className={`flex flex-col border-r bg-card ${
        mobileView === "chat" ? "hidden md:flex" : "flex"
      } w-full md:w-80 lg:w-96 shrink-0`}>

        {/* Header */}
        <div className="px-4 py-3 border-b">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-lg font-bold flex items-center gap-2">
              <MessageSquare size={18} className="text-primary" /> Messenger
            </h1>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" className="h-8 w-8 p-0" title="New Group" onClick={() => setShowGroupDialog(true)}>
                <Users size={14} />
              </Button>
              <Button size="sm" className="h-8 w-8 p-0" title="New Message" onClick={() => setShowDMDialog(true)}>
                <Plus size={15} />
              </Button>
            </div>
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search conversations…"
              className="pl-8 h-8 text-sm"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {filteredConvs.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <MessageSquare size={32} className="mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium">{search ? "No conversations found" : "No messages yet"}</p>
              {!search && (
                <p className="text-xs mt-1">
                  <button className="text-primary hover:underline" onClick={() => setShowDMDialog(true)}>
                    Start a conversation
                  </button>
                </p>
              )}
            </div>
          ) : (
            filteredConvs.map(conv => (
              <ConvItem
                key={conv.id}
                conv={conv}
                myId={myId}
                active={conv.id === activeConvId}
                onClick={() => openConversation(conv.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Right: Chat Area ─────────────────────────────────────────────────── */}
      <div className={`flex flex-col flex-1 min-w-0 ${
        mobileView === "list" ? "hidden md:flex" : "flex"
      }`}>
        {activeConv ? (
          <>
            {/* Chat header */}
            <div className="px-4 py-3 border-b bg-card flex items-center gap-3">
              {/* Mobile back button */}
              <button
                className="md:hidden p-1.5 rounded-lg hover:bg-secondary transition-colors"
                onClick={() => setMobileView("list")}
              >
                <ChevronLeft size={18} />
              </button>

              {convAvatar(activeConv, myId, 38)}

              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{convName(activeConv, myId)}</p>
                {activeConv.isGroup && (
                  <p className="text-xs text-muted-foreground truncate">
                    {activeConv.participants.map(p => p.name.split(" ")[0]).join(", ")}
                  </p>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-0">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <MessageSquare size={36} className="mb-3 opacity-20" />
                  <p className="text-sm">No messages yet</p>
                  <p className="text-xs mt-1">Be the first to say something!</p>
                </div>
              ) : (
                messages.map((msg, i) => {
                  const prev = messages[i - 1];
                  // Show avatar only for the last message in a sequence from same sender
                  const next = messages[i + 1];
                  const showAvatar = !next || next.senderId !== msg.senderId;
                  return (
                    <MessageBubble
                      key={msg.id}
                      msg={msg}
                      isOwn={msg.senderId === myId}
                      myId={myId}
                      showAvatar={showAvatar}
                      onDelete={msg.senderId === myId ? () => deleteMessage.mutate(msg.id) : undefined}
                      onReact={(emoji, alreadyReacted) =>
                        reactToMessage.mutate({ msgId: msg.id, emoji, remove: alreadyReacted })
                      }
                    />
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Compose */}
            <div className="px-4 py-3 border-t bg-card">
              <div className="flex items-end gap-2">
                {/* Share picker trigger */}
                <div className="relative">
                  <button
                    onClick={() => setShowSharePicker(p => !p)}
                    className={`h-10 w-10 rounded-xl border flex items-center justify-center transition-colors shrink-0 ${
                      showSharePicker ? "bg-primary text-primary-foreground border-primary" : "hover:bg-secondary text-muted-foreground"
                    }`}
                    title="Share a recommendation"
                  >
                    <Gift size={16} />
                  </button>
                  {showSharePicker && (
                    <SharePicker
                      onShare={(shareType, shareData, note) =>
                        sendShare.mutate({ shareType, shareData, note })
                      }
                      onClose={() => setShowSharePicker(false)}
                    />
                  )}
                </div>

                <Textarea
                  ref={textareaRef}
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message…"
                  className="flex-1 min-h-[40px] max-h-32 resize-none text-sm py-2 leading-snug"
                  rows={1}
                />
                {/* GIF button */}
                <button
                  type="button"
                  onClick={e => { e.preventDefault(); e.stopPropagation(); setGifPickerOpen(true); }}
                  className="h-10 w-10 flex items-center justify-center rounded-lg transition-colors shrink-0 text-muted-foreground hover:text-foreground hover:bg-secondary"
                  title="Send GIF"
                >
                  <span className="text-[11px] font-bold leading-none tracking-tight">GIF</span>
                </button>
                <Button
                  size="sm"
                  className="h-10 w-10 p-0 shrink-0"
                  disabled={!draft.trim() || sendMessage.isPending}
                  onClick={handleSend}
                >
                  <Send size={15} />
                </Button>
              </div>
            </div>
          </>
        ) : (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <MessageSquare size={28} className="text-primary/60" />
            </div>
            <div className="text-center">
              <p className="font-medium text-foreground">Your messages</p>
              <p className="text-sm mt-1">Select a conversation or start a new one</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowDMDialog(true)}>
                <MessageSquare size={14} /> New Message
              </Button>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowGroupDialog(true)}>
                <Users size={14} /> New Group
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Dialogs ──────────────────────────────────────────────────────────── */}
      <GifPickerDialog
        open={gifPickerOpen}
        onClose={() => setGifPickerOpen(false)}
        onPick={handleSendGif}
      />

      {showDMDialog && (
        <NewDMDialog
          friends={friends}
          onStart={friendId => startDM.mutate(friendId)}
          onClose={() => setShowDMDialog(false)}
        />
      )}
      {showGroupDialog && (
        <NewGroupDialog
          friends={friends}
          onCreate={(name, participantIds) => createGroup.mutate({ name, participantIds })}
          onClose={() => setShowGroupDialog(false)}
        />
      )}
    </div>
  );
}
