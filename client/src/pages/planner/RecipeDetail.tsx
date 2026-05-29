import { Link, useParams, useLocation } from "wouter";
import { usePlanner } from "@/state/PlannerContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Clock, ChefHat, Users, Plus } from "lucide-react";
import { SourceLink } from "./Plan";
import type { MealSlot } from "@/lib/planner/types";
import { useToast } from "@/hooks/use-toast";

const SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];

export default function RecipeDetail() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { recipes, plan, setPlan } = usePlanner();
  const { toast } = useToast();
  const recipe = recipes.find((r) => r.id === params.id);

  if (!recipe) {
    return (
      <div className="text-sm text-muted-foreground">
        Recipe not found.{" "}
        <Link href="/meal-planner/library" className="underline">Back to library</Link>
      </div>
    );
  }

  function addToDay(slot: MealSlot) {
    if (!plan) {
      toast({ title: "No plan yet", description: "Generate a plan first, then add recipes from the library." });
      return;
    }
    const today = plan.days[0];
    const idx = today.meals.findIndex((m) => m.slot === slot);
    let meals;
    if (idx >= 0) meals = today.meals.map((m, i) => i === idx ? { slot, recipe: recipe! } : m);
    else meals = [...today.meals, { slot, recipe: recipe! }];
    const totals = meals.reduce(
      (acc, m) => ({
        cal: acc.cal + m.recipe.macros.cal,
        p: acc.p + m.recipe.macros.p,
        c: acc.c + m.recipe.macros.c,
        f: acc.f + m.recipe.macros.f,
      }),
      { cal: 0, p: 0, c: 0, f: 0 },
    );
    const newDay = { ...today, meals, totals };
    setPlan({ ...plan, days: plan.days.map((d, i) => (i === 0 ? newDay : d)) });
    toast({ title: "Added to today's plan", description: `${recipe!.name} → ${slot}` });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate("/meal-planner/library")} data-testid="button-back-library">
        <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back
      </Button>
      <div>
        <Badge variant="outline" className="text-[10px]">{recipe.category}</Badge>
        <h1 className="mt-3 text-xl font-semibold tracking-tight" data-testid="text-recipe-name">{recipe.name}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{recipe.description}</p>
        <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> {recipe.totalMin} min total ({recipe.prepMin} prep + {recipe.cookMin} cook)</span>
          <span className="inline-flex items-center gap-1.5"><ChefHat className="h-3.5 w-3.5" /> {recipe.difficulty}</span>
          <span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> {recipe.servings} servings</span>
        </div>
      </div>

      <Card className="rounded-2xl">
        <CardContent className="p-5">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { l: "Calories", v: recipe.macros.cal },
              { l: "Protein", v: `${recipe.macros.p}g` },
              { l: "Carbs", v: `${recipe.macros.c}g` },
              { l: "Fat", v: `${recipe.macros.f}g` },
            ].map((x) => (
              <div key={x.l}>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{x.l}</div>
                <div className="mt-0.5 text-base font-semibold tabular-nums">{x.v}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <h3 className="text-xs uppercase tracking-wide text-muted-foreground">Ingredients</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {recipe.ingredients.map((ing, i) => (
              <li key={i} className="flex gap-2"><span className="text-primary">·</span>{ing}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-xs uppercase tracking-wide text-muted-foreground">Instructions</h3>
          <ol className="mt-3 space-y-3 text-sm">
            {recipe.instructions.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-medium text-primary tabular-nums">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <Card className="rounded-2xl">
        <CardContent className="p-5">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Add to today's plan</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {SLOTS.map((s) => (
              <Button key={s} variant="outline" size="sm" onClick={() => addToDay(s)} data-testid={`button-add-${s}`}>
                <Plus className="mr-1 h-3.5 w-3.5" /> {s}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground">
        Source: <SourceLink source={recipe.source} />
      </div>
    </div>
  );
}
