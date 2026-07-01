import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Search, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

type SearchHit = {
  type: string;
  id: number;
  title: string;
  sub: string | null;
  href: string;
};

const TYPE_META: Record<string, { label: string; emoji: string }> = {
  goal:    { label: "Goals",          emoji: "🎯" },
  project: { label: "Projects",       emoji: "📁" },
  task:    { label: "Tasks",          emoji: "✅" },
  book:    { label: "Books",          emoji: "📚" },
  movie:   { label: "Movies & Shows", emoji: "🎬" },
  artist:  { label: "Artists",        emoji: "🎤" },
  song:    { label: "Songs",          emoji: "🎵" },
  recipe:  { label: "Recipes",        emoji: "🍽️" },
  spot:    { label: "Places",         emoji: "📍" },
  person:  { label: "People",         emoji: "👤" },
  quote:   { label: "Quotes",         emoji: "💬" },
  journal: { label: "Journal",        emoji: "✍️" },
  event:   { label: "Events",         emoji: "📅" },
  chore:   { label: "Chores",         emoji: "🧹" },
  hobby:   { label: "Hobbies",        emoji: "🎨" },
  habit:   { label: "Habits",         emoji: "⚡" },
  trip:    { label: "Trips",          emoji: "✈️" },
  art:     { label: "Art",            emoji: "🖼️" },
  plant:   { label: "Plants",         emoji: "🪴" },
};
const TYPE_ORDER = Object.keys(TYPE_META);

export default function CommandPalette({ open, onOpenChange }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [, navigate] = useLocation();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset when opened/closed
  useEffect(() => {
    if (!open) { setQuery(""); setHits([]); setActiveIdx(0); setLoading(false); }
  }, [open]);

  function handleChange(q: string) {
    setQuery(q);
    setActiveIdx(0);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) { setHits([]); setLoading(false); return; }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const seq = ++seqRef.current;
      try {
        const r = await apiRequest("GET", `/api/search?q=${encodeURIComponent(q.trim())}`);
        const data: SearchHit[] = await r.json();
        if (seq === seqRef.current) { setHits(data); setLoading(false); }
      } catch {
        if (seq === seqRef.current) { setHits([]); setLoading(false); }
      }
    }, 250);
  }

  // Sorted flat list (grouped by type) — index-addressable for keyboard nav
  const sorted = TYPE_ORDER.flatMap((t) => hits.filter((h) => h.type === t));

  function go(href: string) {
    onOpenChange(false);
    navigate(href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { onOpenChange(false); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, sorted.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    if (e.key === "Enter" && sorted[activeIdx]) { e.preventDefault(); go(sorted[activeIdx].href); }
  }

  // Keep the active item visible while arrowing
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${activeIdx}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-background/70 backdrop-blur-sm flex items-start justify-center pt-[15vh] px-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onOpenChange(false); }}
    >
      <div className="w-full max-w-lg bg-popover border rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 border-b">
          <Search size={15} className="text-muted-foreground shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search everything — goals, books, recipes, people…"
            className="flex-1 py-3.5 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
          />
          {loading
            ? <Loader2 size={14} className="animate-spin text-muted-foreground shrink-0" />
            : <kbd className="text-[9px] font-mono border rounded px-1 py-0.5 bg-secondary/60 text-muted-foreground shrink-0">esc</kbd>}
        </div>

        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-1">
          {query.trim().length < 2 && (
            <p className="py-8 text-center text-xs text-muted-foreground">
              Type at least 2 characters to search your entire life OS
            </p>
          )}
          {query.trim().length >= 2 && !loading && sorted.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">No results for “{query}”</p>
          )}
          {(() => {
            let idx = -1;
            return TYPE_ORDER.map((type) => {
              const items = hits.filter((h) => h.type === type);
              if (!items.length) return null;
              return (
                <div key={type}>
                  <p className="px-4 pt-2 pb-1 text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
                    {TYPE_META[type].label}
                  </p>
                  {items.map((h) => {
                    idx++;
                    const i = idx;
                    return (
                      <button
                        key={`${h.type}-${h.id}`}
                        data-idx={i}
                        onClick={() => go(h.href)}
                        onMouseMove={() => setActiveIdx(i)}
                        className={`w-full flex items-center gap-2.5 px-4 py-2 text-left transition-colors ${
                          i === activeIdx ? "bg-secondary/80" : "hover:bg-secondary/50"
                        }`}
                      >
                        <span className="text-base leading-none shrink-0">{TYPE_META[h.type].emoji}</span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm truncate">{h.title}</span>
                          {h.sub && <span className="block text-xs text-muted-foreground truncate">{h.sub}</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            });
          })()}
        </div>
      </div>
    </div>
  );
}
