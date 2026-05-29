import { useMemo, useState } from "react";
import { Link } from "wouter";
import { usePlanner, ALL_CATEGORIES } from "@/state/PlannerContext";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Search, Clock, X, ChevronLeft, ChevronRight, Compass } from "lucide-react";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 48;

const CATEGORY_EMOJI: Record<string, string> = {
  "Air Fryer": "🌬️",
  "Asian": "🥢",
  "BBQ & Grilling": "🔥",
  "Baking": "🧁",
  "Bread Machine": "🍞",
  "Breakfast for Dinner": "🍳",
  "Chicken": "🍗",
  "Desserts": "🍰",
  "Game Day": "🏈",
  "Healthy Breakfast": "🥗",
  "Healthy Dinner": "🥦",
  "Healthy Kids": "👦",
  "Healthy Lunch": "🥙",
  "Holiday Feasts": "🎄",
  "Indian": "🫙",
  "Instant Pot": "🫕",
  "Italian Regional": "🍝",
  "Jewish": "✡️",
  "Keto": "🥑",
  "Kid-Friendly": "🧒",
  "Mediterranean": "🫒",
  "Mexican": "🌮",
  "Pasta": "🍜",
  "Seafood": "🦞",
  "Sides & Vegetables": "🥕",
  "Slow Cooker": "🍲",
  "Soups & Stews": "🥣",
  "Steak": "🥩",
  "Vegan": "🌱",
  "Vegetarian": "🥬",
  "Whole30": "💪",
};

function MacroBar({ p, c, f }: { p: number; c: number; f: number }) {
  const tot = p + c + f;
  const pp = tot > 0 ? (p / tot) * 100 : 33;
  const cp = tot > 0 ? (c / tot) * 100 : 34;
  const fp = tot > 0 ? (f / tot) * 100 : 33;
  return (
    <div className="h-1 rounded-full overflow-hidden flex mt-1.5">
      <div className="bg-blue-500 h-full" style={{ width: `${pp}%` }} />
      <div className="bg-amber-500 h-full" style={{ width: `${cp}%` }} />
      <div className="bg-rose-500 h-full" style={{ width: `${fp}%` }} />
    </div>
  );
}

export default function Library() {
  const { recipes, recipesLoading } = usePlanner();
  const [q, setQ] = useState("");
  const [activeCat, setActiveCat] = useState<string>("All");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<string>("any");
  const [timeFilter, setTimeFilter] = useState<string>("any");
  const [page, setPage] = useState(0);

  function selectCat(c: string) {
    setActiveCat(c);
    setPage(0);
  }

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return recipes.filter((r) => {
      if (activeCat !== "All" && r.category !== activeCat) return false;
      if (tagFilter && !r.tags.includes(tagFilter)) return false;
      if (difficulty !== "any" && (r.difficulty ?? "").toLowerCase() !== difficulty) return false;
      if (timeFilter === "under30" && r.totalMin >= 30) return false;
      if (timeFilter === "30to60" && (r.totalMin < 30 || r.totalMin > 60)) return false;
      if (timeFilter === "over60" && r.totalMin <= 60) return false;
      if (ql && !r.name.toLowerCase().includes(ql) && !r.category.toLowerCase().includes(ql) &&
          !r.tags.some((t) => t.toLowerCase().includes(ql))) return false;
      return true;
    });
  }, [recipes, q, activeCat, tagFilter, difficulty, timeFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const hasFilters = activeCat !== "All" || tagFilter || difficulty !== "any" || timeFilter !== "any";

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(0); }}
          placeholder="Search recipes…"
          className="pl-9"
          data-testid="input-search"
        />
      </div>

      {/* Category pills */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {["All", ...ALL_CATEGORIES].map((c) => {
          const active = activeCat === c;
          return (
            <button
              key={c}
              onClick={() => selectCat(c)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition hover:shadow-sm",
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-foreground/30",
              )}
            >
              {c === "All" ? "🍽️ All" : `${CATEGORY_EMOJI[c] ?? "🍴"} ${c}`}
            </button>
          );
        })}
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-2">
        {tagFilter && (
          <button
            onClick={() => { setTagFilter(null); setPage(0); }}
            className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary px-3 py-1 text-xs font-medium text-primary"
          >
            {tagFilter} <X className="h-3 w-3" />
          </button>
        )}

        <select
          value={difficulty}
          onChange={(e) => { setDifficulty(e.target.value); setPage(0); }}
          className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground hover:border-foreground/30 cursor-pointer outline-none"
        >
          <option value="any">Any difficulty</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>

        <select
          value={timeFilter}
          onChange={(e) => { setTimeFilter(e.target.value); setPage(0); }}
          className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground hover:border-foreground/30 cursor-pointer outline-none"
        >
          <option value="any">Any time</option>
          <option value="under30">Under 30 min</option>
          <option value="30to60">30–60 min</option>
          <option value="over60">Over 60 min</option>
        </select>

        {hasFilters && (
          <button
            onClick={() => { setActiveCat("All"); setTagFilter(null); setDifficulty("any"); setTimeFilter("any"); setPage(0); }}
            className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground hover:border-foreground/30"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        )}

        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} recipes</span>
      </div>

      {/* Recipe grid */}
      {recipesLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading recipes…</div>
      ) : pageItems.length === 0 ? (
        <div className="py-16 flex flex-col items-center gap-3 text-muted-foreground">
          <Compass className="h-10 w-10 opacity-30" />
          <p className="text-sm">No recipes match your filters.</p>
          <button
            onClick={() => { setQ(""); setActiveCat("All"); setTagFilter(null); setDifficulty("any"); setTimeFilter("any"); }}
            className="text-xs underline underline-offset-2"
          >
            Clear all filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pageItems.map((r) => {
            const emoji = CATEGORY_EMOJI[r.category] ?? "🍴";
            return (
              <Link
                key={r.id}
                href={`/meal-planner/recipe/${r.id}`}
                className="group block"
                data-testid={`library-card-${r.id}`}
              >
                <Card className="rounded-2xl h-full flex flex-col hover:shadow-md transition-shadow overflow-hidden">
                  <CardContent className="p-4 flex flex-col flex-1 gap-0">
                    {/* Header: emoji + name + category */}
                    <div className="flex items-start gap-2.5">
                      <span className="text-2xl leading-none mt-0.5 shrink-0">{emoji}</span>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold leading-snug group-hover:text-primary line-clamp-2">
                          {r.name}
                        </div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">{r.category}</div>
                      </div>
                    </div>

                    {/* Macro numbers */}
                    <div className="mt-3 flex items-center gap-2 text-[11px] tabular-nums text-muted-foreground">
                      <span className="font-semibold text-foreground">{r.macros.cal}</span>
                      <span>cal</span>
                      <span className="text-blue-500 font-medium">{r.macros.p}P</span>
                      <span className="text-amber-500 font-medium">{r.macros.c}C</span>
                      <span className="text-rose-500 font-medium">{r.macros.f}F</span>
                    </div>

                    {/* Macro bar */}
                    <MacroBar p={r.macros.p} c={r.macros.c} f={r.macros.f} />

                    {/* Time + difficulty */}
                    <div className="mt-2.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {r.totalMin} min
                      </span>
                      {r.difficulty && (
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-medium",
                            r.difficulty.toLowerCase() === "easy"
                              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                              : r.difficulty.toLowerCase() === "medium"
                              ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                              : "bg-rose-500/10 text-rose-700 dark:text-rose-400",
                          )}
                        >
                          {r.difficulty}
                        </span>
                      )}
                    </div>

                    {/* Tags */}
                    {r.tags && r.tags.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1">
                        {r.tags.slice(0, 4).map((tag) => (
                          <button
                            key={tag}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setTagFilter(tag === tagFilter ? null : tag);
                              setPage(0);
                            }}
                            className={cn(
                              "rounded-full border px-2 py-0.5 text-[10px] transition",
                              tag === tagFilter
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border text-muted-foreground hover:border-foreground/30",
                            )}
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Spacer */}
                    <div className="flex-1" />

                    {/* Footer: Save to My Recipes */}
                    <div className="mt-3 pt-3 border-t border-border/60">
                      <span className="text-[11px] font-medium text-primary group-hover:underline underline-offset-2">
                        View recipe →
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <button
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
            className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs disabled:opacity-40 hover:bg-accent/30"
            data-testid="button-prev-page"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Prev
          </button>
          <div className="text-xs text-muted-foreground">Page {page + 1} of {totalPages}</div>
          <button
            disabled={page >= totalPages - 1}
            onClick={() => setPage(page + 1)}
            className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs disabled:opacity-40 hover:bg-accent/30"
            data-testid="button-next-page"
          >
            Next <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
