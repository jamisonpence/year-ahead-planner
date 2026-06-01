import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  Adult,
  Macros,
  Mode,
  Plan,
  Preferences,
  Recipe,
  Stats,
} from "@/lib/planner/types";
import { macrosFor } from "@/lib/planner/macros";
import { generatePlan, swapCandidates as swapCandidatesFn } from "@/lib/planner/generator";

export const ALL_CATEGORIES = [
  "Air Fryer","Asian","BBQ & Grilling","Baking","Bread Machine","Breakfast for Dinner",
  "Chicken","Desserts","Game Day","Healthy Breakfast","Healthy Dinner","Healthy Kids",
  "Healthy Lunch","Holiday Feasts","Indian","Instant Pot","Italian Regional","Jewish",
  "Keto","Kid-Friendly","Mediterranean","Mexican","Pasta","Seafood","Sides & Vegetables",
  "Slow Cooker","Soups & Stews","Steak","Vegan","Vegetarian","Whole30",
];

export const CATEGORY_PRESETS: Record<string, string[]> = {
  "Quick weeknight": ["Air Fryer", "Instant Pot", "Healthy Dinner", "Healthy Lunch"],
  "Family-friendly": ["Healthy Kids", "Kid-Friendly", "Slow Cooker"],
  Athlete: ["Chicken", "Steak", "Seafood", "Healthy Breakfast", "Healthy Lunch", "Healthy Dinner"],
  Comfort: ["Pasta", "BBQ & Grilling", "Slow Cooker", "Soups & Stews"],
};

export const DEFAULT_STATS: Stats = {
  sex: "male",
  age: 30,
  heightCm: 180,
  weightKg: 80,
  activity: "moderate",
  goal: "maintain",
};

export const DEFAULT_PREFS: Preferences = {
  diets: [],
  categories: [],
  mealsPerDay: 3,
  exclusions: [],
  planLength: 1,
};

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

// ── localStorage helpers ───────────────────────────────────────────────────────
function lsGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function lsSet(key: string, val: unknown) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

type Ctx = {
  recipes: Recipe[];
  recipesLoading: boolean;
  recipesError: Error | null;

  mode: Mode;
  setMode: (m: Mode) => void;

  stats: Stats;
  setStats: (s: Stats) => void;
  macros: Macros;
  setMacros: (m: Macros) => void;
  resetMacrosFromStats: () => void;

  adults: Adult[];
  setAdults: (a: Adult[]) => void;
  kids: number;
  setKids: (n: number) => void;
  kidCalsEach: number;
  setKidCalsEach: (n: number) => void;
  householdSize: () => number;
  familyDailyTarget: () => Macros;

  prefs: Preferences;
  setPrefs: (p: Preferences) => void;

  plan: Plan | null;
  setPlan: (p: Plan | null) => void;

  effectiveTarget: () => Macros;
  generate: () => void;
  regenerateDay: (dayIndex: number) => void;
  swap: (dayIndex: number, mealIndex: number, recipe: Recipe) => void;
  swapOptions: (dayIndex: number, mealIndex: number) => Recipe[];
  removeMeal: (dayIndex: number, mealIndex: number) => void;
  markLeftover: (sourceDayIndex: number, mealIndex: number, targetDayIndex: number) => void;
};

const PlannerCtx = createContext<Ctx | null>(null);

async function fetchRecipes(): Promise<Recipe[]> {
  // Use absolute path so it works when mounted inside any route
  const res = await fetch("/recipes.json");
  if (!res.ok) throw new Error("Failed to load recipes");
  return res.json();
}

export function PlannerProvider({ children }: { children: ReactNode }) {
  const recipesQ = useQuery({
    queryKey: ["planner-recipes-static"],
    queryFn: fetchRecipes,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  // PERSIST: load initial state from localStorage
  const [mode, setModeState] = useState<Mode>(() => lsGet("mp.mode", "personal" as Mode));
  const [stats, setStatsState] = useState<Stats>(() => lsGet("mp.stats", DEFAULT_STATS));
  const [macros, setMacrosState] = useState<Macros>(() => lsGet("mp.macros", macrosFor(DEFAULT_STATS)));
  const [adults, setAdultsState] = useState<Adult[]>(() =>
    lsGet("mp.adults", [{ id: uid(), stats: DEFAULT_STATS, macros: macrosFor(DEFAULT_STATS) }])
  );
  const [kids, setKidsState] = useState<number>(() => lsGet("mp.kids", 0));
  const [kidCalsEach, setKidCalsEachState] = useState<number>(() => lsGet("mp.kidCalsEach", 1600));
  const [prefs, setPrefsState] = useState<Preferences>(() => lsGet("mp.prefs", DEFAULT_PREFS));
  const [plan, setPlanState] = useState<Plan | null>(() => lsGet("mp.plan", null));

  // PERSIST: write to localStorage on change
  const setMode = (v: Mode) => { setModeState(v); lsSet("mp.mode", v); };
  const setStats = (v: Stats) => { setStatsState(v); lsSet("mp.stats", v); };
  const setMacros = (v: Macros) => { setMacrosState(v); lsSet("mp.macros", v); };
  const setAdults = (v: Adult[]) => { setAdultsState(v); lsSet("mp.adults", v); };
  const setKids = (v: number) => { setKidsState(v); lsSet("mp.kids", v); };
  const setKidCalsEach = (v: number) => { setKidCalsEachState(v); lsSet("mp.kidCalsEach", v); };
  const setPrefs = (v: Preferences) => { setPrefsState(v); lsSet("mp.prefs", v); };
  const setPlan = (v: Plan | null) => { setPlanState(v); lsSet("mp.plan", v); };

  const recipes = recipesQ.data ?? [];

  function resetMacrosFromStats() {
    setMacros(macrosFor(stats));
  }

  function householdSize() {
    if (mode === "family") return adults.length + kids;
    return 1;
  }

  function familyDailyTarget(): Macros {
    const adultSum = adults.reduce(
      (acc, a) => ({
        cal: acc.cal + a.macros.cal,
        p: acc.p + a.macros.p,
        c: acc.c + a.macros.c,
        f: acc.f + a.macros.f,
      }),
      { cal: 0, p: 0, c: 0, f: 0 },
    );
    const kidCal = kids * kidCalsEach;
    return {
      cal: adultSum.cal + kidCal,
      p: adultSum.p + Math.round((kidCal * 0.3) / 4),
      c: adultSum.c + Math.round((kidCal * 0.4) / 4),
      f: adultSum.f + Math.round((kidCal * 0.3) / 9),
    };
  }

  function effectiveTarget(): Macros {
    if (mode === "family") return familyDailyTarget();
    return macros;
  }

  function generate() {
    if (!recipes.length) return;
    const t = effectiveTarget();
    const p = generatePlan(recipes, t, prefs, householdSize());
    setPlan(p);
  }

  function regenerateDay(dayIndex: number) {
    if (!plan) return;
    const t = plan.target;
    const newPlan = generatePlan(recipes, t, { ...prefs, planLength: 1 }, plan.household);
    if (!newPlan.days.length) return;
    const newDay = { ...newPlan.days[0], day: dayIndex };
    const next = { ...plan, days: plan.days.map((d, i) => (i === dayIndex ? newDay : d)) };
    setPlan(next);
  }

  function swap(dayIndex: number, mealIndex: number, recipe: Recipe) {
    if (!plan) return;
    const day = plan.days[dayIndex];
    const newMeals = day.meals.map((m, i) =>
      i === mealIndex ? { ...m, recipe } : m,
    );
    const totals = newMeals.reduce(
      (acc, m) => ({
        cal: acc.cal + m.recipe.macros.cal,
        p: acc.p + m.recipe.macros.p,
        c: acc.c + m.recipe.macros.c,
        f: acc.f + m.recipe.macros.f,
      }),
      { cal: 0, p: 0, c: 0, f: 0 },
    );
    const newDay = { ...day, meals: newMeals, totals };
    setPlan({
      ...plan,
      days: plan.days.map((d, i) => (i === dayIndex ? newDay : d)),
    });
  }

  function removeMeal(dayIndex: number, mealIndex: number) {
    if (!plan) return;
    const day = plan.days[dayIndex];
    const newMeals = day.meals.map((m, i) => i === mealIndex ? { ...m, removed: true } : m);
    const totals = newMeals.filter(m => !m.removed).reduce(
      (acc, m) => ({ cal: acc.cal + m.recipe.macros.cal, p: acc.p + m.recipe.macros.p, c: acc.c + m.recipe.macros.c, f: acc.f + m.recipe.macros.f }),
      { cal: 0, p: 0, c: 0, f: 0 }
    );
    setPlan({ ...plan, days: plan.days.map((d, i) => i === dayIndex ? { ...d, meals: newMeals, totals } : d) });
  }

  function markLeftover(sourceDayIndex: number, mealIndex: number, targetDayIndex: number) {
    if (!plan) return;
    const sourceMeal = plan.days[sourceDayIndex]?.meals[mealIndex];
    if (!sourceMeal) return;
    const leftoverMeal = { ...sourceMeal, isLeftover: true, leftoverFromDay: sourceDayIndex };
    const targetDay = plan.days[targetDayIndex];
    // Add leftover to target day (or replace an existing leftover slot if present)
    const newMeals = [...targetDay.meals, leftoverMeal];
    const totals = newMeals.filter(m => !m.removed).reduce(
      (acc, m) => ({ cal: acc.cal + m.recipe.macros.cal, p: acc.p + m.recipe.macros.p, c: acc.c + m.recipe.macros.c, f: acc.f + m.recipe.macros.f }),
      { cal: 0, p: 0, c: 0, f: 0 }
    );
    setPlan({ ...plan, days: plan.days.map((d, i) => i === targetDayIndex ? { ...d, meals: newMeals, totals } : d) });
  }

  function swapOptions(dayIndex: number, mealIndex: number): Recipe[] {
    if (!plan) return [];
    const day = plan.days[dayIndex];
    const meal = day.meals[mealIndex];
    return swapCandidatesFn(recipes, prefs, day, meal.slot, plan.target);
  }

  // Auto-update macros when stats change in personal/shareable mode
  useEffect(() => {
    if (mode !== "family") setMacros(macrosFor(stats));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats.sex, stats.age, stats.heightCm, stats.weightKg, stats.activity, stats.goal, mode]);

  const value = useMemo<Ctx>(
    () => ({
      recipes,
      recipesLoading: recipesQ.isLoading,
      recipesError: (recipesQ.error as Error) ?? null,
      mode, setMode,
      stats, setStats,
      macros, setMacros,
      resetMacrosFromStats,
      adults, setAdults,
      kids, setKids,
      kidCalsEach, setKidCalsEach,
      householdSize,
      familyDailyTarget,
      prefs, setPrefs,
      plan, setPlan,
      effectiveTarget,
      generate,
      regenerateDay,
      swap,
      swapOptions,
      removeMeal,
      markLeftover,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recipes, recipesQ.isLoading, recipesQ.error, mode, stats, macros, adults, kids, kidCalsEach, prefs, plan],
  );

  return <PlannerCtx.Provider value={value}>{children}</PlannerCtx.Provider>;
}

export function usePlanner() {
  const ctx = useContext(PlannerCtx);
  if (!ctx) throw new Error("usePlanner must be used within PlannerProvider");
  return ctx;
}
