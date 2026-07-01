import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from "@/components/ui/command";
import { apiRequest } from "@/lib/queryClient";
import { Loader2 } from "lucide-react";

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

export default function CommandPalette({ open, onOpenChange }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [, navigate] = useLocation();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);

  // Reset on close
  useEffect(() => {
    if (!open) { setQuery(""); setHits([]); }
  }, [open]);

  function handleChange(q: string) {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) { setHits([]); setLoading(false); return; }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const seq = ++seqRef.current;
      try {
        const r = await apiRequest("GET", `/api/search?q=${encodeURIComponent(q.trim())}`);
        const data: SearchHit[] = await r.json();
        if (seq === seqRef.current) setHits(data);
      } catch {
        if (seq === seqRef.current) setHits([]);
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    }, 250);
  }

  function go(href: string) {
    onOpenChange(false);
    navigate(href);
  }

  // Group hits by type, keeping TYPE_META ordering
  const groups = Object.keys(TYPE_META)
    .map((type) => ({ type, items: hits.filter((h) => h.type === type) }))
    .filter((g) => g.items.length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 overflow-hidden max-w-lg top-[20%] translate-y-0">
        <Command shouldFilter={false} className="rounded-xl">
          <div className="relative">
            <CommandInput
              value={query}
              onValueChange={handleChange}
              placeholder="Search everything — goals, books, recipes, people…"
            />
            {loading && (
              <Loader2 size={14} className="absolute right-10 top-3.5 animate-spin text-muted-foreground" />
            )}
          </div>
          <CommandList className="max-h-[50vh]">
            {query.trim().length >= 2 && !loading && hits.length === 0 && (
              <CommandEmpty>No results for “{query}”</CommandEmpty>
            )}
            {query.trim().length < 2 && (
              <p className="py-6 text-center text-xs text-muted-foreground">
                Type at least 2 characters to search your entire life OS
              </p>
            )}
            {groups.map((g) => (
              <CommandGroup key={g.type} heading={TYPE_META[g.type].label}>
                {g.items.map((h) => (
                  <CommandItem
                    key={`${h.type}-${h.id}`}
                    value={`${h.type}-${h.id}`}
                    onSelect={() => go(h.href)}
                    className="gap-2.5 cursor-pointer"
                  >
                    <span className="text-base leading-none">{TYPE_META[h.type].emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{h.title}</p>
                      {h.sub && <p className="text-xs text-muted-foreground truncate">{h.sub}</p>}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
