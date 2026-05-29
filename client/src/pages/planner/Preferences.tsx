import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { usePlanner, ALL_CATEGORIES, CATEGORY_PRESETS } from "@/state/PlannerContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { splitCalories, caloriesFromMacros, macrosFor } from "@/lib/planner/macros";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DietStyle } from "@/lib/planner/types";

export default function Preferences() {
  const planner = usePlanner();
  const [, navigate] = useLocation();
  const { prefs, setPrefs, macros, setMacros, stats, mode, effectiveTarget, generate, plan } = planner;
  const t = effectiveTarget();

  // Navigate to plan page only after plan state is confirmed updated
  const [pendingNav, setPendingNav] = useState(false);
  useEffect(() => {
    if (pendingNav && plan) {
      setPendingNav(false);
      navigate("/meal-planner/plan");
    }
  }, [plan, pendingNav]);

  function regen() {
    generate();
    setPendingNav(true);
  }

  function toggleDiet(d: DietStyle) {
    setPrefs({ ...prefs, diets: prefs.diets.includes(d) ? prefs.diets.filter((x) => x !== d) : [...prefs.diets, d] });
  }
  function toggleCat(c: string) {
    setPrefs({ ...prefs, categories: prefs.categories.includes(c) ? prefs.categories.filter((x) => x !== c) : [...prefs.categories, c] });
  }
  function setExclusions(text: string) {
    setPrefs({ ...prefs, exclusions: text.split(/[,\n]/).map((s) => s.trim().toLowerCase()).filter(Boolean) });
  }

  const diets: { v: DietStyle; l: string }[] = [
    { v: "vegan", l: "Vegan" }, { v: "vegetarian", l: "Vegetarian" }, { v: "keto", l: "Keto" }, { v: "whole30", l: "Whole30" },
    { v: "mediterranean", l: "Mediterranean" }, { v: "gluten-free", l: "Gluten-Free" }, { v: "dairy-free", l: "Dairy-Free" },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Preferences</div>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">Tune your plan</h1>
          <p className="mt-1 text-sm text-muted-foreground">Edit targets and filters, then regenerate.</p>
        </div>
        <Button onClick={regen} data-testid="button-regen-from-prefs">
          <Sparkles className="mr-1.5 h-4 w-4" /> Regenerate plan
        </Button>
      </div>

      {mode !== "family" && (
        <Card className="rounded-2xl">
          <CardContent className="p-5">
            <div className="flex items-end justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold">Daily target</h2>
                <p className="mt-1 text-sm text-muted-foreground">Edit any field. Editing calories re-splits macros per your goal.</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setMacros(macrosFor(stats))} data-testid="button-reset-macros">Reset</Button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { l: "Calories", v: macros.cal, k: "cal" as const },
                { l: "Protein g", v: macros.p, k: "p" as const },
                { l: "Carbs g", v: macros.c, k: "c" as const },
                { l: "Fat g", v: macros.f, k: "f" as const },
              ].map((x) => (
                <div key={x.k}>
                  <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">{x.l}</Label>
                  <Input
                    type="number"
                    value={x.v}
                    onChange={(e) => {
                      const v = Math.max(0, parseInt(e.target.value || "0"));
                      if (x.k === "cal") setMacros(splitCalories(v, stats.goal));
                      else {
                        const next = { ...macros, [x.k]: v };
                        next.cal = caloriesFromMacros({ p: next.p, c: next.c, f: next.f });
                        setMacros(next);
                      }
                    }}
                    className="mt-1.5 text-base font-semibold tabular-nums"
                    data-testid={`prefs-${x.k}`}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {mode === "family" && (
        <Card className="rounded-2xl border-primary/30 bg-primary/5">
          <CardContent className="p-5">
            <div className="text-xs uppercase tracking-wide text-primary">Household daily target</div>
            <div className="mt-2 text-base font-semibold tabular-nums">{t.cal} cal · {t.p}P · {t.c}C · {t.f}F</div>
            <p className="mt-2 text-xs text-muted-foreground">Adjust adults & kids in setup if this needs to change.</p>
          </CardContent>
        </Card>
      )}

      <Card className="rounded-2xl">
        <CardContent className="p-5">
          <h2 className="text-base font-semibold">Diet & exclusions</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {diets.map((d) => {
              const active = prefs.diets.includes(d.v);
              return (
                <button key={d.v} onClick={() => toggleDiet(d.v)} data-testid={`prefs-diet-${d.v}`}
                  className={cn("rounded-full border px-3 py-1.5 text-sm hover:shadow-sm",
                    active ? "border-primary bg-primary/10 text-primary" : "border-border")}>
                  {d.l}
                </button>
              );
            })}
          </div>
          <div className="mt-5">
            <Label className="text-xs">Ingredients to avoid</Label>
            <Input
              placeholder="e.g. mushrooms, cilantro, peanuts"
              defaultValue={prefs.exclusions.join(", ")}
              onBlur={(e) => setExclusions(e.target.value)}
              className="mt-1.5"
              data-testid="prefs-exclusions"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardContent className="p-5">
          <h2 className="text-base font-semibold">Meals & plan length</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Meals per day</Label>
              <RadioGroup
                value={String(prefs.mealsPerDay)}
                onValueChange={(v) => setPrefs({ ...prefs, mealsPerDay: parseInt(v) as 3 | 4 })}
                className="mt-2 grid grid-cols-2 gap-2"
              >
                {[3, 4].map((n) => (
                  <Label key={n} className={cn("flex cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm hover:shadow-sm", prefs.mealsPerDay === n && "border-primary bg-primary/5")}>
                    <RadioGroupItem value={String(n)} />
                    {n === 3 ? "3 meals" : "3 + snack"}
                  </Label>
                ))}
              </RadioGroup>
            </div>
            <div>
              <Label className="text-xs">Plan length</Label>
              <RadioGroup
                value={String(prefs.planLength)}
                onValueChange={(v) => setPrefs({ ...prefs, planLength: parseInt(v) as 1 | 7 })}
                className="mt-2 grid grid-cols-2 gap-2"
              >
                {[1, 7].map((n) => (
                  <Label key={n} className={cn("flex cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm hover:shadow-sm", prefs.planLength === n && "border-primary bg-primary/5")}>
                    <RadioGroupItem value={String(n)} />
                    {n === 1 ? "1 day" : "7 days"}
                  </Label>
                ))}
              </RadioGroup>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardContent className="p-5">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold">Categories</h2>
              <p className="mt-1 text-sm text-muted-foreground">Empty = any category.</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setPrefs({ ...prefs, categories: [] })} data-testid="prefs-clear-cats">Any</Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.keys(CATEGORY_PRESETS).map((n) => (
              <button key={n} onClick={() => setPrefs({ ...prefs, categories: CATEGORY_PRESETS[n] })}
                className="rounded-full border border-border bg-accent/30 px-3 py-1.5 text-xs font-medium hover:shadow-sm"
                data-testid={`prefs-preset-${n.toLowerCase().replace(/\s+/g, "-")}`}>
                {n}
              </button>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
            {ALL_CATEGORIES.map((c) => {
              const active = prefs.categories.includes(c);
              return (
                <label key={c} className={cn("flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/20", active && "bg-primary/5")}>
                  <Checkbox checked={active} onCheckedChange={() => toggleCat(c)} />
                  <span>{c}</span>
                </label>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
