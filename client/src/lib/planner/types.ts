export type Macros = { cal: number; p: number; c: number; f: number };

export type Recipe = {
  id: string;
  slug: string;
  category: string;
  name: string;
  description: string;
  servings: number;
  prepMin: number;
  cookMin: number;
  totalMin: number;
  difficulty: "Easy" | "Medium" | "Hard";
  ingredients: string[];
  instructions: string[];
  tags: string[];
  source: string;
  macros: Macros;
};

export type Sex = "male" | "female";
export type Activity = "sedentary" | "light" | "moderate" | "very" | "athlete";
export type Goal = "cut" | "maintain" | "bulk";
export type Mode = "personal" | "family" | "shareable";
export type DietStyle =
  | "vegan"
  | "vegetarian"
  | "keto"
  | "whole30"
  | "mediterranean"
  | "gluten-free"
  | "dairy-free";

export type Stats = {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activity: Activity;
  goal: Goal;
};

export type Adult = { id: string; stats: Stats; macros: Macros };

export type Preferences = {
  diets: DietStyle[];
  categories: string[]; // empty = any
  mealsPerDay: 3 | 4;
  exclusions: string[]; // lowercase words
  planLength: 1 | 7;
};

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";

export type PlannedMeal = {
  slot: MealSlot;
  recipe: Recipe;
};

export type DayPlan = {
  day: number; // 0-indexed
  meals: PlannedMeal[];
  totals: Macros;
};

export type Plan = {
  days: DayPlan[];
  target: Macros; // per-day target
  household: number; // servings to feed
};
