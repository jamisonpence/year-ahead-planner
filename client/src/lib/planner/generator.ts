import type { DayPlan, Macros, MealSlot, PlannedMeal, Plan, Preferences, Recipe } from "./types";
import { sumMacros } from "./macros";

// Default category bias for each slot
const SLOT_CATEGORIES: Record<MealSlot, string[]> = {
  breakfast: ["Healthy Breakfast", "Breakfast for Dinner", "Baking", "Bread Machine"],
  lunch: ["Healthy Lunch", "Asian", "Mexican", "Mediterranean", "Vegetarian", "Vegan"],
  dinner: [
    "Healthy Dinner",
    "Chicken",
    "Pasta",
    "Steak",
    "Seafood",
    "Instant Pot",
    "Slow Cooker",
    "BBQ & Grilling",
    "Italian Regional",
    "Indian",
  ],
  snack: ["Sides & Vegetables", "Desserts", "Healthy Kids"],
};

// Daily macro share per slot for 3 vs 4 meals
const MEAL_WEIGHTS_3: Record<MealSlot, number> = {
  breakfast: 0.25,
  lunch: 0.35,
  dinner: 0.4,
  snack: 0,
};
const MEAL_WEIGHTS_4: Record<MealSlot, number> = {
  breakfast: 0.25,
  lunch: 0.3,
  dinner: 0.35,
  snack: 0.1,
};

function slotsFor(mealsPerDay: 3 | 4): MealSlot[] {
  return mealsPerDay === 3
    ? ["breakfast", "lunch", "dinner"]
    : ["breakfast", "lunch", "dinner", "snack"];
}

export function weightsFor(mealsPerDay: 3 | 4) {
  return mealsPerDay === 3 ? MEAL_WEIGHTS_3 : MEAL_WEIGHTS_4;
}

// Diet style → tag/category filter
function matchesDiets(recipe: Recipe, diets: string[]): boolean {
  if (!diets.length) return true;
  const tagsLower = recipe.tags.map((t) => t.toLowerCase());
  const cat = recipe.category.toLowerCase();
  const ingLower = recipe.ingredients.join(" ").toLowerCase();
  return diets.every((d) => {
    switch (d) {
      case "vegan":
        return cat === "vegan" || tagsLower.includes("vegan");
      case "vegetarian":
        return (
          cat === "vegan" ||
          cat === "vegetarian" ||
          tagsLower.includes("vegan") ||
          tagsLower.includes("vegetarian")
        );
      case "keto":
        return cat === "keto" || tagsLower.includes("keto") || tagsLower.includes("low-carb");
      case "whole30":
        return cat === "whole30" || tagsLower.includes("whole30");
      case "mediterranean":
        return cat === "mediterranean" || tagsLower.includes("mediterranean");
      case "gluten-free":
        return (
          tagsLower.includes("gluten-free") ||
          tagsLower.includes("gf") ||
          (!ingLower.includes("flour") &&
            !ingLower.includes("bread") &&
            !ingLower.includes("pasta") &&
            !ingLower.includes("wheat"))
        );
      case "dairy-free":
        return (
          tagsLower.includes("dairy-free") ||
          (!ingLower.includes("milk") &&
            !ingLower.includes("butter") &&
            !ingLower.includes("cheese") &&
            !ingLower.includes("cream") &&
            !ingLower.includes("yogurt"))
        );
      default:
        return true;
    }
  });
}

function matchesCategoryFilter(recipe: Recipe, categories: string[]): boolean {
  if (!categories.length) return true;
  return categories.includes(recipe.category);
}

function matchesExclusions(recipe: Recipe, exclusions: string[]): boolean {
  if (!exclusions.length) return true;
  const blob = recipe.ingredients.join(" ").toLowerCase();
  return !exclusions.some((ex) => ex && blob.includes(ex.toLowerCase()));
}

export function filterPool(recipes: Recipe[], prefs: Preferences): Recipe[] {
  return recipes.filter(
    (r) =>
      matchesDiets(r, prefs.diets) &&
      matchesCategoryFilter(r, prefs.categories) &&
      matchesExclusions(r, prefs.exclusions),
  );
}

function macroDistance(target: Macros, m: Macros): number {
  return (
    Math.abs(target.cal - m.cal) +
    4 * Math.abs(target.p - m.p) +
    4 * Math.abs(target.c - m.c) +
    9 * Math.abs(target.f - m.f)
  );
}

function pickTopN<T>(list: T[], n: number): T {
  if (!list.length) throw new Error("Empty list");
  const k = Math.min(n, list.length);
  const idx = Math.floor(Math.random() * k);
  return list[idx];
}

function targetForSlot(target: Macros, slot: MealSlot, mealsPerDay: 3 | 4): Macros {
  const w = weightsFor(mealsPerDay)[slot];
  return {
    cal: target.cal * w,
    p: target.p * w,
    c: target.c * w,
    f: target.f * w,
  };
}

function biasedScore(recipe: Recipe, target: Macros, slot: MealSlot): number {
  const dist = macroDistance(target, recipe.macros);
  // Slight bonus when category matches slot bias
  const slotBias = SLOT_CATEGORIES[slot].includes(recipe.category) ? -dist * 0.15 : 0;
  return dist + slotBias;
}

export function generateDay(
  pool: Recipe[],
  target: Macros,
  mealsPerDay: 3 | 4,
  recentlyUsed: Set<string>,
  dayIndex = 0,
): DayPlan {
  const slots = slotsFor(mealsPerDay);
  const usedToday = new Set<string>();
  const meals: PlannedMeal[] = [];

  for (const slot of slots) {
    const slotTarget = targetForSlot(target, slot, mealsPerDay);
    let candidates = pool.filter(
      (r) => !usedToday.has(r.id) && !recentlyUsed.has(r.id),
    );
    if (!candidates.length) {
      candidates = pool.filter((r) => !usedToday.has(r.id));
    }
    if (!candidates.length) candidates = pool.slice();
    // Sort by score, lower better. Prefer slot-biased categories.
    candidates.sort((a, b) => biasedScore(a, slotTarget, slot) - biasedScore(b, slotTarget, slot));
    const recipe = pickTopN(candidates, 5);
    usedToday.add(recipe.id);
    recentlyUsed.add(recipe.id);
    meals.push({ slot, recipe });
  }

  return {
    day: dayIndex,
    meals,
    totals: sumMacros(meals.map((m) => m.recipe.macros)),
  };
}

function dayScore(day: DayPlan, target: Macros): number {
  return (
    Math.abs(target.cal - day.totals.cal) +
    4 * Math.abs(target.p - day.totals.p) +
    4 * Math.abs(target.c - day.totals.c) +
    9 * Math.abs(target.f - day.totals.f)
  );
}

function bestDay(
  pool: Recipe[],
  target: Macros,
  mealsPerDay: 3 | 4,
  recentlyUsed: Set<string>,
  dayIndex: number,
  attempts = 6,
): DayPlan {
  let best: DayPlan | null = null;
  let bestScore = Infinity;
  for (let i = 0; i < attempts; i++) {
    const candidate = generateDay(pool, target, mealsPerDay, new Set(recentlyUsed), dayIndex);
    const s = dayScore(candidate, target);
    if (s < bestScore) {
      bestScore = s;
      best = candidate;
    }
  }
  return best!;
}

export function generatePlan(
  recipes: Recipe[],
  target: Macros,
  prefs: Preferences,
  household = 1,
): Plan {
  const pool = filterPool(recipes, prefs);
  if (!pool.length) {
    return { days: [], target, household };
  }
  const days: DayPlan[] = [];
  const recentlyUsed = new Set<string>();
  const recentByDay: string[][] = [];
  for (let i = 0; i < prefs.planLength; i++) {
    const day = bestDay(pool, target, prefs.mealsPerDay, recentlyUsed, i);
    days.push(day);
    const ids = day.meals.map((m) => m.recipe.id);
    for (const id of ids) recentlyUsed.add(id);
    recentByDay.push(ids);
    if (recentByDay.length > 3) {
      const old = recentByDay.shift()!;
      for (const id of old) recentlyUsed.delete(id);
    }
  }
  return { days, target, household };
}

/** Find 5 alternative meals that fit remaining budget for slot. */
export function swapCandidates(
  recipes: Recipe[],
  prefs: Preferences,
  day: DayPlan,
  swapSlot: MealSlot,
  dailyTarget: Macros,
): Recipe[] {
  const pool = filterPool(recipes, prefs);
  const otherMeals = day.meals.filter((m) => m.slot !== swapSlot);
  const used = new Set(otherMeals.map((m) => m.recipe.id));
  const consumed = sumMacros(otherMeals.map((m) => m.recipe.macros));
  const remaining: Macros = {
    cal: dailyTarget.cal - consumed.cal,
    p: dailyTarget.p - consumed.p,
    c: dailyTarget.c - consumed.c,
    f: dailyTarget.f - consumed.f,
  };
  const cands = pool
    .filter((r) => !used.has(r.id))
    .map((r) => ({ r, s: biasedScore(r, remaining, swapSlot) }))
    .sort((a, b) => a.s - b.s)
    .slice(0, 5)
    .map((x) => x.r);
  return cands;
}
