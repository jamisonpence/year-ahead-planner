import type { Activity, Goal, Macros, Sex, Stats } from "./types";

const ACTIVITY_MULT: Record<Activity, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very: 1.725,
  athlete: 1.9,
};

const GOAL_MULT: Record<Goal, number> = {
  cut: 0.8,
  maintain: 1.0,
  bulk: 1.1,
};

export const GOAL_SPLIT: Record<Goal, { p: number; c: number; f: number }> = {
  cut: { p: 0.4, c: 0.3, f: 0.3 },
  maintain: { p: 0.3, c: 0.4, f: 0.3 },
  bulk: { p: 0.3, c: 0.45, f: 0.25 },
};

export function bmrFor(stats: Stats): number {
  const { sex, weightKg, heightCm, age } = stats;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === "male" ? base + 5 : base - 161;
}

export function tdeeFor(stats: Stats): number {
  return bmrFor(stats) * ACTIVITY_MULT[stats.activity];
}

export function macrosFor(stats: Stats): Macros {
  const tdee = tdeeFor(stats);
  const cal = Math.round(tdee * GOAL_MULT[stats.goal]);
  return splitCalories(cal, stats.goal);
}

export function splitCalories(cal: number, goal: Goal): Macros {
  const s = GOAL_SPLIT[goal];
  const p = Math.round((cal * s.p) / 4);
  const c = Math.round((cal * s.c) / 4);
  const f = Math.round((cal * s.f) / 9);
  return { cal, p, c, f };
}

export function caloriesFromMacros(m: Omit<Macros, "cal">): number {
  return m.p * 4 + m.c * 4 + m.f * 9;
}

/** Convert ft+in → cm and lb → kg */
export function ftInToCm(ft: number, inch: number): number {
  return Math.round((ft * 12 + inch) * 2.54);
}
export function cmToFtIn(cm: number): { ft: number; inch: number } {
  const totalIn = cm / 2.54;
  const ft = Math.floor(totalIn / 12);
  const inch = Math.round(totalIn - ft * 12);
  return { ft, inch };
}
export function lbToKg(lb: number): number {
  return Math.round(lb * 0.45359237 * 10) / 10;
}
export function kgToLb(kg: number): number {
  return Math.round(kg / 0.45359237);
}

export function sumMacros(list: Macros[]): Macros {
  return list.reduce(
    (acc, m) => ({
      cal: acc.cal + m.cal,
      p: acc.p + m.p,
      c: acc.c + m.c,
      f: acc.f + m.f,
    }),
    { cal: 0, p: 0, c: 0, f: 0 },
  );
}
