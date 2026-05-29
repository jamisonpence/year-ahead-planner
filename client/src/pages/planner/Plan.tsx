import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { usePlanner } from "@/state/PlannerContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { Plan, DayPlan, Recipe, MealSlot } from "@/lib/planner/types";
import { Clock, RefreshCw, Repeat, Printer, Download, ChevronRight, Utensils, Coffee, Salad, Cookie, ListChecks } from "lucide-react";
import { MacroBars } from "@/components/planner/MacroChips";
import { planToCSV, downloadFile } from "@/lib/planner/shopping";
import { cn } from "@/lib/utils";

const SLOT_ICON: Record<MealSlot, any> = {
  breakfast: Coffee,
  lunch: Salad,
  dinner: Utensils,
  snack: Cookie,
};
const DAY_LABELS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

export default function PlanPage() {
  const { plan, generate, regenerateDay, recipesLoading } = usePlanner();
  const [, navigate] = useLocation();
  const [view, setView] = useState<"daily" | "weekly">("daily");
  const [swapTarget, setSwapTarget] = useState<{ dayIndex: number; mealIndex: number } | null>(null);
  const [recipeView, setRecipeView] = useState<Recipe | null>(null);

  if (recipesLoading) {
    return <div className="text-sm text-muted-foreground">Loading recipes…</div>;
  }
  if (!plan) {
    return (
      <Card className="mx-auto max-w-2xl rounded-2xl">
        <CardContent className="p-8 text-center">
          <h2 className="text-base font-semibold">No plan yet</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">Run setup to build your first plan.</p>
          <Link href="/meal-planner/setup">
            <Button className="mt-5" data-testid="button-go-setup">Open setup</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  const isWeekly = plan.days.length > 1;
  const effectiveView = isWeekly ? view : "daily";

  return (
    <div className="space-y-6">
      <PlanHeader plan={plan} onRegenAll={generate} onExportCSV={() => downloadFile("plan.csv", planToCSV(plan))} />
      {isWeekly && (
        <Tabs value={effectiveView} onValueChange={(v) => setView(v as any)}>
          <TabsList className="grid w-full max-w-xs grid-cols-2">
            <TabsTrigger value="daily" data-testid="tab-daily">Day view</TabsTrigger>
            <TabsTrigger value="weekly" data-testid="tab-weekly">Week view</TabsTrigger>
          </TabsList>
        </Tabs>
      )}
      {effectiveView === "daily" && isWeekly ? (
        <DailyTabs
          plan={plan}
          onRegenDay={regenerateDay}
          onSwap={(dayIndex, mealIndex) => setSwapTarget({ dayIndex, mealIndex })}
          onView={(r) => setRecipeView(r)}
        />
      ) : (
        <div className="space-y-6">
          {plan.days.map((d, i) => (
            <DayCard
              key={d.day}
              day={d}
              target={plan.target}
              onRegen={() => regenerateDay(i)}
              onSwap={(mealIndex) => setSwapTarget({ dayIndex: i, mealIndex })}
              onView={setRecipeView}
            />
          ))}
        </div>
      )}

      <SwapSheet
        open={!!swapTarget}
        onOpenChange={(o) => !o && setSwapTarget(null)}
        target={swapTarget}
        onPick={() => setSwapTarget(null)}
      />
      <RecipeDialog recipe={recipeView} onOpenChange={(o) => !o && setRecipeView(null)} />
    </div>
  );
}

function PlanHeader({ plan, onRegenAll, onExportCSV }: { plan: Plan; onRegenAll: () => void; onExportCSV: () => void; }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Your plan</div>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">
          {plan.days.length === 1 ? "Today's meals" : "Weekly plan"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Daily target · <span className="font-medium text-foreground tabular-nums">{plan.target.cal} cal</span> · {plan.target.p}P · {plan.target.c}C · {plan.target.f}F
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={onRegenAll} data-testid="button-regen-all">
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Regenerate
        </Button>
        <Link href="/meal-planner/shopping">
          <Button variant="outline" size="sm" data-testid="button-go-shopping">
            <ListChecks className="mr-1.5 h-3.5 w-3.5" /> Shopping list
          </Button>
        </Link>
        <Button variant="outline" size="sm" onClick={() => window.print()} data-testid="button-print">
          <Printer className="mr-1.5 h-3.5 w-3.5" /> Print
        </Button>
        <Button variant="outline" size="sm" onClick={onExportCSV} data-testid="button-export-csv">
          <Download className="mr-1.5 h-3.5 w-3.5" /> CSV
        </Button>
      </div>
    </div>
  );
}

function DailyTabs({ plan, onRegenDay, onSwap, onView }: {
  plan: Plan; onRegenDay: (i: number) => void;
  onSwap: (dayIndex: number, mealIndex: number) => void;
  onView: (r: Recipe) => void;
}) {
  const [active, setActive] = useState("0");
  return (
    <Tabs value={active} onValueChange={setActive}>
      <TabsList className="flex w-full flex-wrap h-auto justify-start gap-1 bg-secondary/40 p-1">
        {plan.days.map((d, i) => (
          <TabsTrigger key={d.day} value={String(i)} className="text-xs" data-testid={`tab-day-${i}`}>
            Day {i + 1}
          </TabsTrigger>
        ))}
      </TabsList>
      {plan.days.map((d, i) => (
        <TabsContent key={d.day} value={String(i)} className="mt-5">
          <DayCard
            day={d}
            target={plan.target}
            onRegen={() => onRegenDay(i)}
            onSwap={(mealIndex) => onSwap(i, mealIndex)}
            onView={onView}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function DayCard({ day, target, onRegen, onSwap, onView }: {
  day: DayPlan; target: any; onRegen: () => void;
  onSwap: (mealIndex: number) => void; onView: (r: Recipe) => void;
}) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Day {day.day + 1}</div>
            <h2 className="mt-0.5 text-base font-semibold">{DAY_LABELS[day.day % 7]}</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={onRegen} data-testid={`button-regen-day-${day.day}`}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" /> Regenerate day
          </Button>
        </div>
        <div className="mt-4">
          <MacroBars totals={day.totals} target={target} />
        </div>
        <div className="mt-5 space-y-3">
          {day.meals.map((m, mi) => {
            const Icon = SLOT_ICON[m.slot];
            return (
              <div
                key={mi}
                className="flex flex-col gap-3 rounded-xl border border-border bg-background/40 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <Icon className="h-3.5 w-3.5" />
                    {m.slot}
                  </div>
                  <button
                    onClick={() => onView(m.recipe)}
                    className="mt-1 text-left text-sm font-semibold hover:text-primary"
                    data-testid={`recipe-name-${day.day}-${mi}`}
                  >
                    {m.recipe.name}
                  </button>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <Badge variant="outline" className="text-[10px]">{m.recipe.category}</Badge>
                    <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {m.recipe.totalMin} min</span>
                    <span className="tabular-nums">
                      {m.recipe.macros.cal} cal · {m.recipe.macros.p}P · {m.recipe.macros.c}C · {m.recipe.macros.f}F
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => onSwap(mi)} data-testid={`button-swap-${day.day}-${mi}`}>
                    <Repeat className="mr-1 h-3.5 w-3.5" /> Swap
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function SwapSheet({ open, onOpenChange, target, onPick }: {
  open: boolean; onOpenChange: (b: boolean) => void;
  target: { dayIndex: number; mealIndex: number } | null;
  onPick: (r: Recipe) => void;
}) {
  const planner = usePlanner();
  const options = useMemo<Recipe[]>(() => {
    if (!target || !planner.plan) return [];
    return planner.swapOptions(target.dayIndex, target.mealIndex);
  }, [target, planner.plan, planner.prefs]);

  const currentSlot = useMemo(() => {
    if (!target || !planner.plan) return null;
    return planner.plan.days[target.dayIndex].meals[target.mealIndex].slot;
  }, [target, planner.plan]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Swap {currentSlot}</SheetTitle>
          <SheetDescription>Five options that fit your day's remaining macros.</SheetDescription>
        </SheetHeader>
        <div className="mt-5 space-y-3">
          {options.length === 0 && (
            <div className="text-sm text-muted-foreground">No alternatives match your filters.</div>
          )}
          {options.map((r) => (
            <button
              key={r.id}
              onClick={() => {
                if (target) planner.swap(target.dayIndex, target.mealIndex, r);
                onPick(r);
              }}
              className="block w-full rounded-xl border border-border bg-card p-4 text-left hover:shadow-md"
              data-testid={`swap-option-${r.id}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{r.name}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <Badge variant="outline" className="text-[10px]">{r.category}</Badge>
                    <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {r.totalMin} min</span>
                    <span className="tabular-nums">{r.macros.cal} cal · {r.macros.p}P · {r.macros.c}C · {r.macros.f}F</span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
              </div>
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function RecipeDialog({ recipe, onOpenChange }: { recipe: Recipe | null; onOpenChange: (b: boolean) => void }) {
  return (
    <Dialog open={!!recipe} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        {recipe && (
          <>
            <DialogHeader>
              <DialogTitle>{recipe.name}</DialogTitle>
              <DialogDescription>{recipe.description}</DialogDescription>
            </DialogHeader>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">{recipe.category}</Badge>
              <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {recipe.totalMin} min</span>
              <span>{recipe.difficulty}</span>
              <span>{recipe.servings} servings</span>
              <span className="tabular-nums">{recipe.macros.cal} cal · {recipe.macros.p}P · {recipe.macros.c}C · {recipe.macros.f}F</span>
            </div>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <div>
                <h4 className="text-xs uppercase tracking-wide text-muted-foreground">Ingredients</h4>
                <ul className="mt-2 space-y-1 text-sm">
                  {recipe.ingredients.map((ing, i) => (
                    <li key={i} className="flex gap-2"><span className="text-muted-foreground">·</span>{ing}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="text-xs uppercase tracking-wide text-muted-foreground">Instructions</h4>
                <ol className="mt-2 space-y-2 text-sm">
                  {recipe.instructions.map((step, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-muted-foreground tabular-nums">{i + 1}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
            <div className="mt-5 text-xs text-muted-foreground">
              Source: <SourceLink source={recipe.source} />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function SourceLink({ source }: { source: string }) {
  const m = source.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
  if (m) return <a href={m[2]} target="_blank" rel="noreferrer" className="underline hover:text-foreground">{m[1]}</a>;
  return <span>{source}</span>;
}
