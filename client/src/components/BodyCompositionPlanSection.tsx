/**
 * BodyCompositionPlanSection
 *
 * Unified Body Composition Plan component used in:
 *   - WorkoutsPage → Plans tab  (triggered externally via props)
 *   - HealthPage → Nutrition → Plans sub-section  (standalone)
 *
 * Plans are stored as workoutPlans with goalType = "body_composition".
 * Check-ins are stored in body_comp_check_ins, referencing workoutPlan.id.
 *
 * goalMetricJson shape (extended backward-compat):
 * {
 *   metric: "body_weight" | "body_fat" | "muscle_mass" | "recomp",
 *   currentValue, targetValue, unit,          ← legacy compat fields
 *   weightUnit, currentWeight, goalWeight,
 *   currentBodyFat, goalBodyFat,
 *   currentMuscleMass, goalMuscleMass,
 *   activityLevel, maintenanceCalories,
 *   targetCalories, proteinGrams, carbsGrams, fatGrams,
 *   proteinPerLb, fatPct,
 * }
 */

import { useState, useEffect } from "react";
import { usePlanner, ALL_CATEGORIES, CATEGORY_PRESETS } from "@/state/PlannerContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Flame, TrendingUp, RefreshCw, X, ChevronRight, ChevronLeft,
  Scale, Target, Dumbbell, CheckCircle2, Pencil, Trash2,
  MoreHorizontal, ClipboardList, Zap, Sparkles, Heart, Play, CalendarPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { WorkoutPlan, BodyCompCheckIn } from "@shared/schema";

// ── Types ──────────────────────────────────────────────────────────────────────

type GoalMetric = "body_weight" | "body_fat" | "muscle_mass" | "recomp";
type ActivityLevel = "sedentary" | "light" | "moderate" | "heavy" | "athlete";
type CalStrategy = "cut" | "bulk" | "recomp";

interface ExtendedMetricJson {
  metric: GoalMetric;
  // legacy compat
  currentValue?: number;
  targetValue?: number;
  unit?: string;
  // body stats
  weightUnit: "lbs" | "kg";
  currentWeight?: number;
  goalWeight?: number;
  currentBodyFat?: number;
  goalBodyFat?: number;
  currentMuscleMass?: number;
  goalMuscleMass?: number;
  // nutrition
  activityLevel?: ActivityLevel;
  maintenanceCalories?: number;
  targetCalories?: number;
  proteinGrams?: number;
  carbsGrams?: number;
  fatGrams?: number;
  proteinPerLb?: number;
  fatPct?: number;
}

export interface BodyCompSectionProps {
  /** When true, the wizard modal opens immediately (triggered externally, e.g. from PlanBuilderModal) */
  externalWizardOpen?: boolean;
  /** Plan to pre-fill when editing via an external trigger */
  externalEditingPlan?: WorkoutPlan | null;
  /** Called when externally-triggered wizard closes */
  onExternalWizardClose?: () => void;
  /** Called when user wants to add a workout plan from within the body comp wizard */
  onAddWorkoutPlan?: (goal: string) => void;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const ACTIVITY_LEVELS: { value: ActivityLevel; label: string; multiplier: number }[] = [
  { value: "sedentary",  label: "Sedentary",                      multiplier: 1.2   },
  { value: "light",      label: "Light Exercise (1–2 days/wk)",   multiplier: 1.375 },
  { value: "moderate",   label: "Moderate Exercise (3–5 days/wk)",multiplier: 1.55  },
  { value: "heavy",      label: "Heavy Exercise (6–7 days/wk)",   multiplier: 1.725 },
  { value: "athlete",    label: "Athlete (2× per day)",           multiplier: 1.9   },
];

interface GoalCard {
  metric: GoalMetric;
  icon: React.ReactNode;
  name: string;
  desc: string;
  timeframe: string;
  strategy: CalStrategy;
  color: string;
  bgColor: string;
  borderColor: string;
}

const GOAL_CARDS: GoalCard[] = [
  {
    metric: "body_weight",
    icon: <Scale size={28} />,
    name: "Body Weight",
    desc: "Reach your target body weight",
    timeframe: "8–16 week blocks",
    strategy: "cut",
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-50 dark:bg-orange-950/30",
    borderColor: "border-orange-300 dark:border-orange-700",
  },
  {
    metric: "body_fat",
    icon: <Flame size={28} />,
    name: "Body Fat %",
    desc: "Reduce body fat while preserving muscle",
    timeframe: "8–12 week blocks",
    strategy: "cut",
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-50 dark:bg-red-950/30",
    borderColor: "border-red-300 dark:border-red-700",
  },
  {
    metric: "muscle_mass",
    icon: <Dumbbell size={28} />,
    name: "Muscle Mass",
    desc: "Build lean muscle with a controlled surplus",
    timeframe: "3–6 months",
    strategy: "bulk",
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-50 dark:bg-blue-950/30",
    borderColor: "border-blue-300 dark:border-blue-700",
  },
  {
    metric: "recomp",
    icon: <RefreshCw size={28} />,
    name: "Body Recomposition",
    desc: "Lose fat and gain muscle simultaneously",
    timeframe: "8–12+ weeks",
    strategy: "recomp",
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-50 dark:bg-green-950/30",
    borderColor: "border-green-300 dark:border-green-700",
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function calcTDEE(weightLbs: number, age: number, heightIn: number, sex: "male" | "female", activity: ActivityLevel): number {
  const wKg = weightLbs * 0.453592;
  const hCm = heightIn * 2.54;
  const bmr = sex === "male"
    ? 10 * wKg + 6.25 * hCm - 5 * age + 5
    : 10 * wKg + 6.25 * hCm - 5 * age - 161;
  return Math.round(bmr * (ACTIVITY_LEVELS.find(a => a.value === activity)?.multiplier ?? 1.55));
}

function calcMacros(totalCals: number, proteinPerLb: number, fatPct: number, weightLbs: number) {
  const proteinG = Math.round(proteinPerLb * weightLbs);
  const proteinCals = proteinG * 4;
  const fatCals = Math.round(totalCals * (fatPct / 100));
  const fatG = Math.round(fatCals / 9);
  const carbCals = totalCals - proteinCals - fatCals;
  const carbG = Math.round(Math.max(0, carbCals) / 4);
  return { proteinG, fatG, carbG, proteinCals, fatCals, carbCals };
}

function addWeeks(dateStr: string, weeks: number) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

function weeksFromDates(start: string, end: string) {
  return Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / (7 * 86400000)));
}

function getCalStrategy(metric: GoalMetric, currentW: number, goalW: number): CalStrategy {
  if (metric === "body_fat") return "cut";
  if (metric === "muscle_mass") return "bulk";
  if (metric === "recomp") return "recomp";
  // body_weight: compare goal vs current
  if (goalW > 0 && goalW < currentW) return "cut";
  if (goalW > 0 && goalW > currentW) return "bulk";
  return "recomp";
}

function calRangeForStrategy(maintenance: number, strategy: CalStrategy): [number, number] {
  if (strategy === "cut")  return [maintenance - 700, maintenance - 500];
  if (strategy === "bulk") return [maintenance + 200, maintenance + 300];
  return [maintenance - 150, maintenance + 150];
}

function metricBadge(metric: GoalMetric | string) {
  const map: Record<string, { label: string; className: string }> = {
    body_weight: { label: "Body Weight",   className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 border border-orange-200 dark:border-orange-700" },
    body_fat:    { label: "Body Fat %",    className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border border-red-200 dark:border-red-700" },
    muscle_mass: { label: "Muscle Mass",   className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-700" },
    recomp:      { label: "Recomposition", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 border border-green-200 dark:border-green-700" },
    // legacy compat
    weight:      { label: "Body Weight",   className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 border border-orange-200 dark:border-orange-700" },
    body_fat_pct:{ label: "Body Fat %",    className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border border-red-200 dark:border-red-700" },
  };
  return map[metric] ?? { label: "Body Comp", className: "bg-secondary text-muted-foreground border" };
}

function parseMetricJson(plan: WorkoutPlan): ExtendedMetricJson | null {
  try {
    if (!plan.goalMetricJson) return null;
    return JSON.parse(plan.goalMetricJson) as ExtendedMetricJson;
  } catch { return null; }
}

// ── Wizard state shape ────────────────────────────────────────────────────────

interface WizardState {
  metric: GoalMetric;
  weightUnit: "lbs" | "kg";
  currentWeight: string;
  goalWeight: string;
  currentBodyFat: string;
  goalBodyFat: string;
  currentMuscleMass: string;
  goalMuscleMass: string;
  activityLevel: ActivityLevel;
  maintenanceCalories: string;
  targetCalories: number;
  proteinPerLb: number;
  fatPct: number;
  startDate: string;
  endDate: string;
  // TDEE calc fields
  sex: "male" | "female";
  age: string;
  heightFt: string;
  heightIn: string;
  // BF% calc fields
  bfCalcOpen: boolean;
  bfSex: "male" | "female";
  bfHeightIn: string;
  bfNeckIn: string;
  bfWaistIn: string;
  bfHipsIn: string;
  // Muscle mass estimator fields
  mmCalcOpen: boolean;
  mmWeightLbs: string;
  mmBfPct: string;
}

const DEFAULT_PROTEIN: Record<GoalMetric, number> = {
  body_weight: 1.0,
  body_fat:    1.0,
  muscle_mass: 0.8,
  recomp:      0.9,
};
const DEFAULT_WEEKS: Record<GoalMetric, number> = {
  body_weight: 10,
  body_fat:    10,
  muscle_mass: 16,
  recomp:      12,
};

function makeDefaultState(metric: GoalMetric = "body_fat"): WizardState {
  const today = new Date().toISOString().slice(0, 10);
  return {
    metric,
    weightUnit: "lbs",
    currentWeight: "",
    goalWeight: "",
    currentBodyFat: "",
    goalBodyFat: "",
    currentMuscleMass: "",
    goalMuscleMass: "",
    activityLevel: "moderate",
    maintenanceCalories: "",
    targetCalories: 0,
    proteinPerLb: DEFAULT_PROTEIN[metric],
    fatPct: 25,
    startDate: today,
    endDate: addWeeks(today, DEFAULT_WEEKS[metric]),
    sex: "male",
    age: "",
    heightFt: "",
    heightIn: "",
    bfCalcOpen: false,
    bfSex: "male",
    bfHeightIn: "",
    bfNeckIn: "",
    bfWaistIn: "",
    bfHipsIn: "",
    mmCalcOpen: false,
    mmWeightLbs: "",
    mmBfPct: "",
  };
}

function stateFromPlan(plan: WorkoutPlan): WizardState {
  const m = parseMetricJson(plan);
  if (!m) return makeDefaultState();
  const base = makeDefaultState(m.metric ?? "body_weight");
  return {
    ...base,
    metric:           m.metric ?? "body_weight",
    weightUnit:       m.weightUnit ?? "lbs",
    currentWeight:    String(m.currentWeight ?? m.currentValue ?? ""),
    goalWeight:       String(m.goalWeight ?? m.targetValue ?? ""),
    currentBodyFat:   String(m.currentBodyFat ?? ""),
    goalBodyFat:      String(m.goalBodyFat ?? ""),
    currentMuscleMass:String(m.currentMuscleMass ?? ""),
    goalMuscleMass:   String(m.goalMuscleMass ?? ""),
    activityLevel:    m.activityLevel ?? "moderate",
    maintenanceCalories: String(m.maintenanceCalories ?? ""),
    targetCalories:   m.targetCalories ?? 0,
    proteinPerLb:     m.proteinPerLb ?? DEFAULT_PROTEIN[m.metric ?? "body_fat"],
    fatPct:           m.fatPct ?? 25,
    startDate:        plan.startDate ?? new Date().toISOString().slice(0, 10),
    endDate:          plan.startDate && plan.durationWeeks
      ? addWeeks(plan.startDate, plan.durationWeeks)
      : addWeeks(new Date().toISOString().slice(0, 10), DEFAULT_WEEKS[m.metric ?? "body_fat"]),
  };
}

// ── Step 1: Goal Selection ────────────────────────────────────────────────────

function Step1({ onSelect }: { onSelect: (m: GoalMetric) => void }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Choose your primary body composition goal.</p>
      <div className="grid gap-3">
        {GOAL_CARDS.map(card => (
          <button key={card.metric} onClick={() => onSelect(card.metric)}
            className={`w-full text-left flex items-center gap-4 p-4 rounded-xl border-2 transition-all hover:shadow-sm hover:scale-[1.01] ${card.bgColor} ${card.borderColor}`}>
            <div className={`shrink-0 ${card.color}`}>{card.icon}</div>
            <div className="flex-1 min-w-0">
              <p className={`font-semibold text-sm ${card.color}`}>{card.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{card.desc} · {card.timeframe}</p>
            </div>
            <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Step 2: Stats ─────────────────────────────────────────────────────────────

function Step2({ s, set }: { s: WizardState; set: (p: Partial<WizardState>) => void }) {
  // TDEE calc
  function calcAndFill() {
    const ht = (parseFloat(s.heightFt) || 0) * 12 + (parseFloat(s.heightIn) || 0);
    const wt = parseFloat(s.currentWeight) || 0;
    const age = parseFloat(s.age) || 0;
    if (wt > 0 && ht > 0 && age > 0) {
      const wtLbs = s.weightUnit === "kg" ? wt * 2.20462 : wt;
      set({ maintenanceCalories: String(calcTDEE(wtLbs, age, ht, s.sex, s.activityLevel)) });
    }
  }

  // BF% calculator result
  const bfH = parseFloat(s.bfHeightIn), bfN = parseFloat(s.bfNeckIn),
    bfW = parseFloat(s.bfWaistIn), bfHip = parseFloat(s.bfHipsIn);
  let bfResult: number | null = null;
  if (s.bfSex === "male" && bfH > 0 && bfN > 0 && bfW > bfN)
    bfResult = Math.max(0, 86.010 * Math.log10(bfW - bfN) - 70.041 * Math.log10(bfH) + 36.76);
  else if (s.bfSex === "female" && bfH > 0 && bfN > 0 && bfW > 0 && bfHip > 0)
    bfResult = Math.max(0, 163.205 * Math.log10(bfW + bfHip - bfN) - 97.684 * Math.log10(bfH) - 78.387);
  const bfRes = bfResult !== null ? parseFloat(bfResult.toFixed(1)) : null;

  // Muscle mass estimator result
  const mmWt = parseFloat(s.mmWeightLbs), mmBf = parseFloat(s.mmBfPct);
  let mmResult: number | null = null;
  if (mmWt > 0 && mmBf > 0 && mmBf < 100) {
    const lbm = mmWt * (1 - mmBf / 100);
    mmResult = parseFloat((lbm * 0.56).toFixed(1));
  }
  const toUnit = (v: number) => s.weightUnit === "kg" ? parseFloat((v / 2.205).toFixed(1)) : v;
  const unitLabel = s.weightUnit;

  return (
    <div className="space-y-4">
      {/* Weight unit toggle */}
      <div className="flex gap-2">
        {(["lbs", "kg"] as const).map(u => (
          <button key={u} onClick={() => set({ weightUnit: u })}
            className={`flex-1 py-2 rounded-lg text-sm font-medium border-2 transition-all ${s.weightUnit === u ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>{u}</button>
        ))}
      </div>

      {/* Current weight (all goals) */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Current weight ({s.weightUnit})</label>
          <Input type="number" value={s.currentWeight} onChange={e => set({ currentWeight: e.target.value })} placeholder="185" className="h-9" />
        </div>
        {/* Goal weight — body_weight goal */}
        {s.metric === "body_weight" && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Goal weight ({s.weightUnit})</label>
            <Input type="number" value={s.goalWeight} onChange={e => set({ goalWeight: e.target.value })} placeholder="165" className="h-9" />
          </div>
        )}
      </div>

      {/* Body Fat % inputs */}
      {(s.metric === "body_fat" || s.metric === "recomp") && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Current body fat %</label>
            <Input type="number" value={s.currentBodyFat} onChange={e => set({ currentBodyFat: e.target.value })} placeholder="22" className="h-9" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Goal body fat % {s.metric === "recomp" ? <span className="text-muted-foreground/60">opt</span> : ""}</label>
            <Input type="number" value={s.goalBodyFat} onChange={e => set({ goalBodyFat: e.target.value })} placeholder="15" className="h-9" />
          </div>
        </div>
      )}
      {s.metric === "body_weight" && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Current body fat % <span className="text-muted-foreground/60">opt</span></label>
            <Input type="number" value={s.currentBodyFat} onChange={e => set({ currentBodyFat: e.target.value })} placeholder="22" className="h-9" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Goal body fat % <span className="text-muted-foreground/60">opt</span></label>
            <Input type="number" value={s.goalBodyFat} onChange={e => set({ goalBodyFat: e.target.value })} placeholder="15" className="h-9" />
          </div>
        </div>
      )}

      {/* Muscle mass inputs */}
      {s.metric === "muscle_mass" && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Current muscle mass ({s.weightUnit})</label>
            <Input type="number" value={s.currentMuscleMass} onChange={e => set({ currentMuscleMass: e.target.value })} placeholder="140" className="h-9" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Goal muscle mass ({s.weightUnit})</label>
            <Input type="number" value={s.goalMuscleMass} onChange={e => set({ goalMuscleMass: e.target.value })} placeholder="155" className="h-9" />
          </div>
        </div>
      )}

      {/* Body Fat % Calculator (Navy Tape Method) — shown for body_fat, muscle_mass (to estimate), body_weight */}
      {(s.metric === "body_fat" || s.metric === "muscle_mass" || s.metric === "body_weight" || s.metric === "recomp") && (
        <div className="border rounded-xl overflow-hidden">
          <button type="button" onClick={() => set({ bfCalcOpen: !s.bfCalcOpen })}
            className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/20 hover:bg-green-100/60 dark:hover:bg-green-900/30 transition-colors">
            <span className="flex items-center gap-1.5"><Sparkles size={12} /> Body Fat % Calculator (Navy Tape Method)</span>
            <ChevronRight size={13} className={`transition-transform ${s.bfCalcOpen ? "rotate-90" : ""}`} />
          </button>
          {s.bfCalcOpen && (
            <div className="p-4 space-y-3 bg-secondary/10">
              <p className="text-[11px] text-muted-foreground">All measurements in inches. Narrowest point for neck/waist, widest for hips.</p>
              <div className="flex gap-2">
                {(["male", "female"] as const).map(sex => (
                  <button key={sex} type="button" onClick={() => set({ bfSex: sex })}
                    className={`flex-1 h-8 rounded-lg text-xs font-medium border-2 transition-all ${s.bfSex === sex ? "border-green-500 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300" : "border-border text-muted-foreground"}`}>
                    {sex.charAt(0).toUpperCase() + sex.slice(1)}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1"><label className="text-[11px] text-muted-foreground">Height (in)</label>
                  <Input type="number" value={s.bfHeightIn} onChange={e => set({ bfHeightIn: e.target.value })} placeholder='70"' className="h-8 text-xs" /></div>
                <div className="space-y-1"><label className="text-[11px] text-muted-foreground">Neck (in)</label>
                  <Input type="number" value={s.bfNeckIn} onChange={e => set({ bfNeckIn: e.target.value })} placeholder='15"' className="h-8 text-xs" /></div>
                <div className="space-y-1"><label className="text-[11px] text-muted-foreground">Waist (in)</label>
                  <Input type="number" value={s.bfWaistIn} onChange={e => set({ bfWaistIn: e.target.value })} placeholder='34"' className="h-8 text-xs" /></div>
                {s.bfSex === "female" && (
                  <div className="space-y-1"><label className="text-[11px] text-muted-foreground">Hips (in)</label>
                    <Input type="number" value={s.bfHipsIn} onChange={e => set({ bfHipsIn: e.target.value })} placeholder='38"' className="h-8 text-xs" /></div>
                )}
              </div>
              {bfRes !== null && (
                <div className="flex items-center justify-between bg-green-100 dark:bg-green-900/30 rounded-lg px-3 py-2">
                  <span className="text-sm font-bold text-green-700 dark:text-green-300">Estimated: {bfRes}%</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => set({ currentBodyFat: String(bfRes), bfCalcOpen: false })}>Use as current</Button>
                    {s.metric === "body_fat" && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => set({ goalBodyFat: String(bfRes), bfCalcOpen: false })}>Use as goal</Button>}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Muscle Mass Estimator — shown for muscle_mass goal */}
      {s.metric === "muscle_mass" && (
        <div className="border rounded-xl overflow-hidden">
          <button type="button" onClick={() => set({ mmCalcOpen: !s.mmCalcOpen })}
            className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/20 hover:bg-blue-100/60 dark:hover:bg-blue-900/30 transition-colors">
            <span className="flex items-center gap-1.5"><Sparkles size={12} /> Muscle Mass Estimator (from Body Fat %)</span>
            <ChevronRight size={13} className={`transition-transform ${s.mmCalcOpen ? "rotate-90" : ""}`} />
          </button>
          {s.mmCalcOpen && (
            <div className="p-4 space-y-3 bg-secondary/10">
              <p className="text-[11px] text-muted-foreground">Enter total body weight and body fat % to estimate skeletal muscle mass (≈56% of lean body mass).</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1"><label className="text-[11px] text-muted-foreground">Body weight (lbs)</label>
                  <Input type="number" value={s.mmWeightLbs} onChange={e => set({ mmWeightLbs: e.target.value })} placeholder="185" className="h-8 text-xs" /></div>
                <div className="space-y-1"><label className="text-[11px] text-muted-foreground">Body fat %</label>
                  <Input type="number" value={s.mmBfPct} onChange={e => set({ mmBfPct: e.target.value })} placeholder="20" className="h-8 text-xs" /></div>
              </div>
              {mmResult !== null && (
                <div className="space-y-1.5">
                  <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg px-3 py-2 text-xs space-y-1">
                    <div className="flex justify-between"><span className="text-muted-foreground">Est. Lean Body Mass</span><span className="font-semibold">{toUnit(mmResult / 0.56)} {unitLabel}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Est. Skeletal Muscle</span><span className="font-bold text-blue-700 dark:text-blue-300">{toUnit(mmResult)} {unitLabel}</span></div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => set({ currentMuscleMass: String(toUnit(mmResult!)), mmCalcOpen: false })}>Use as current</Button>
                    <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => { const goal = toUnit(mmResult! * 1.05); set({ goalMuscleMass: String(goal), mmCalcOpen: false }); }}>Use +5% as goal</Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Maintenance / TDEE */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Maintenance calories (TDEE)</label>
        <Input type="number" value={s.maintenanceCalories} onChange={e => set({ maintenanceCalories: e.target.value })} placeholder="2400" className="h-9" />
        <p className="text-[11px] text-muted-foreground">Your estimated daily calorie burn. Use the calculator below to find yours.</p>
      </div>

      {/* TDEE Calculator */}
      <div className="border rounded-xl overflow-hidden">
        <button type="button" onClick={() => set({ bfCalcOpen: false })}
          className="hidden" />
        <details className="group">
          <summary className="flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-primary cursor-pointer list-none bg-primary/5 hover:bg-primary/10 transition-colors">
            <span className="flex items-center gap-1.5"><Zap size={12} /> Calculate my TDEE</span>
            <ChevronRight size={13} className="transition-transform group-open:rotate-90" />
          </summary>
          <div className="p-4 space-y-3 bg-secondary/10">
            <p className="text-[11px] text-muted-foreground">Uses the Mifflin-St Jeor formula to estimate your total daily energy expenditure.</p>
            <div className="flex gap-2">
              {(["male", "female"] as const).map(sx => (
                <button key={sx} type="button" onClick={() => set({ sex: sx })}
                  className={`flex-1 h-8 rounded-lg text-xs font-medium border-2 transition-all ${s.sex === sx ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>
                  {sx.charAt(0).toUpperCase() + sx.slice(1)}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1"><label className="text-[11px] text-muted-foreground">Age</label>
                <Input type="number" value={s.age} onChange={e => set({ age: e.target.value })} placeholder="30" className="h-8 text-xs" /></div>
              <div className="space-y-1"><label className="text-[11px] text-muted-foreground">Height ft</label>
                <Input type="number" value={s.heightFt} onChange={e => set({ heightFt: e.target.value })} placeholder="5" className="h-8 text-xs" /></div>
              <div className="space-y-1"><label className="text-[11px] text-muted-foreground">Height in</label>
                <Input type="number" value={s.heightIn} onChange={e => set({ heightIn: e.target.value })} placeholder="10" className="h-8 text-xs" /></div>
            </div>
            <select value={s.activityLevel} onChange={e => set({ activityLevel: e.target.value as ActivityLevel })}
              className="w-full border rounded-lg px-3 h-9 text-xs bg-background">
              {ACTIVITY_LEVELS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
            <Button size="sm" className="w-full gap-1.5 h-8" onClick={calcAndFill}><Zap size={12} /> Calculate & Fill In</Button>
          </div>
        </details>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Start date</label>
          <Input type="date" value={s.startDate} onChange={e => set({ startDate: e.target.value, endDate: addWeeks(e.target.value, DEFAULT_WEEKS[s.metric]) })} className="h-9" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">End date</label>
          <Input type="date" value={s.endDate} onChange={e => set({ endDate: e.target.value })} className="h-9" />
        </div>
      </div>
    </div>
  );
}

// ── Step 3: Calorie Target ────────────────────────────────────────────────────

function Step3({ s, maintenance, strategy, onTargetChange }:
  { s: WizardState; maintenance: number; strategy: CalStrategy; onTargetChange: (v: number) => void }) {
  const [lo, hi] = calRangeForStrategy(maintenance, strategy);
  const mid = Math.round((lo + hi) / 2);
  const effective = s.targetCalories || mid;

  const stratLabel: Record<CalStrategy, string> = {
    cut:   `${lo.toLocaleString()}–${hi.toLocaleString()} kcal (${500}–${700} below maintenance)`,
    bulk:  `${lo.toLocaleString()}–${hi.toLocaleString()} kcal (200–300 above maintenance)`,
    recomp:`${lo.toLocaleString()}–${hi.toLocaleString()} kcal (within ±150 of maintenance)`,
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-card p-4 space-y-2 text-center">
        <p className="text-xs text-muted-foreground">Your recommended daily calorie target</p>
        <p className="text-4xl font-bold text-primary">{effective.toLocaleString()}</p>
        <p className="text-xs text-muted-foreground">kcal / day</p>
      </div>
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">Range: {stratLabel[strategy]}</label>
        <input type="range" min={lo - 200} max={hi + 200} step={25} value={effective}
          onChange={e => onTargetChange(Number(e.target.value))} className="w-full accent-primary" />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>{(lo - 200).toLocaleString()}</span>
          <span className="font-medium text-primary">{lo.toLocaleString()}–{hi.toLocaleString()} recommended</span>
          <span>{(hi + 200).toLocaleString()}</span>
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Or enter a custom target</label>
        <Input type="number" value={effective || ""} onChange={e => onTargetChange(Number(e.target.value))} placeholder={String(mid)} className="h-9" />
      </div>
      <div className="rounded-lg px-3 py-2 text-xs text-muted-foreground bg-secondary/30 border">
        {strategy === "cut"   && `Deficit: ${(maintenance - effective).toLocaleString()} kcal/day below maintenance (${maintenance.toLocaleString()} kcal)`}
        {strategy === "bulk"  && `Surplus: ${(effective - maintenance).toLocaleString()} kcal/day above maintenance (${maintenance.toLocaleString()} kcal)`}
        {strategy === "recomp"&& `${Math.abs(effective - maintenance).toLocaleString()} kcal/day ${effective >= maintenance ? "above" : "below"} maintenance (${maintenance.toLocaleString()} kcal)`}
      </div>
    </div>
  );
}

// ── Step 4: Macros ────────────────────────────────────────────────────────────

function Step4({ s, totalCals, weightLbs, onProteinChange, onFatChange }:
  { s: WizardState; totalCals: number; weightLbs: number; onProteinChange: (v: number) => void; onFatChange: (v: number) => void }) {
  const { proteinG, fatG, carbG, proteinCals, fatCals, carbCals } = calcMacros(totalCals, s.proteinPerLb, s.fatPct, weightLbs);
  const carbsNeg = carbCals < 0;
  const fatLow = s.fatPct < 20;
  const total = proteinCals + fatCals + Math.max(0, carbCals);
  const pPct = total > 0 ? Math.round((proteinCals / total) * 100) : 0;
  const fPct = total > 0 ? Math.round((fatCals / total) * 100) : 0;
  const cPct = total > 0 ? Math.round((Math.max(0, carbCals) / total) * 100) : 0;

  const proteinRec: Record<GoalMetric, string> = {
    body_weight: "1.0 g/lb recommended",
    body_fat:    "1.0 g/lb recommended",
    muscle_mass: "0.8 g/lb recommended",
    recomp:      "0.9 g/lb recommended",
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground">Daily Targets</p>
        <div className="flex items-center justify-around text-center">
          {[
            { val: proteinG,          label: "Protein", color: "text-blue-600 dark:text-blue-400" },
            { val: Math.max(0, carbG), label: "Carbs",   color: "text-amber-600 dark:text-amber-400" },
            { val: fatG,              label: "Fat",      color: "text-rose-600 dark:text-rose-400" },
            { val: totalCals,         label: "kcal",     color: "" },
          ].map(item => (
            <div key={item.label}>
              <p className={`text-2xl font-bold ${item.color}`}>{item.val.toLocaleString()}{item.label !== "kcal" ? "g" : ""}</p>
              <p className="text-[11px] text-muted-foreground">{item.label}</p>
            </div>
          ))}
        </div>
        <div className="h-4 rounded-full overflow-hidden flex">
          <div className="bg-blue-500 h-full" style={{ width: `${pPct}%` }} />
          <div className="bg-amber-500 h-full" style={{ width: `${cPct}%` }} />
          <div className="bg-rose-500 h-full" style={{ width: `${fPct}%` }} />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span className="text-blue-600 dark:text-blue-400 font-medium">P {pPct}%</span>
          <span className="text-amber-600 dark:text-amber-400 font-medium">C {cPct}%</span>
          <span className="text-rose-600 dark:text-rose-400 font-medium">F {fPct}%</span>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between">
          <label className="text-xs font-medium">Protein — {proteinG}g ({proteinCals} kcal)</label>
          <span className="text-xs text-muted-foreground">{s.proteinPerLb.toFixed(1)} g/lb</span>
        </div>
        <input type="range" min={0.7} max={1.2} step={0.05} value={s.proteinPerLb}
          onChange={e => onProteinChange(Number(e.target.value))} className="w-full accent-blue-500" />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>0.7</span><span className="font-medium text-blue-500">{proteinRec[s.metric]}</span><span>1.2 g/lb</span>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between">
          <label className="text-xs font-medium">Fat — {fatG}g ({fatCals} kcal)</label>
          <span className="text-xs text-muted-foreground">{s.fatPct}% of calories</span>
        </div>
        <input type="range" min={15} max={45} step={1} value={s.fatPct}
          onChange={e => onFatChange(Number(e.target.value))} className="w-full accent-rose-500" />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>15%</span><span>25% default</span><span>45%</span>
        </div>
        {fatLow && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
            ⚠️ Going below 20% of calories from fat long-term can negatively affect hormones and health.
          </p>
        )}
      </div>

      <div className="rounded-lg border bg-secondary/20 px-3 py-2.5 space-y-1">
        <div className="flex justify-between">
          <span className="text-xs font-medium">Carbs (auto-calculated)</span>
          <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">{Math.max(0, carbG)}g</span>
        </div>
        {carbsNeg && (
          <p className="text-[11px] text-destructive bg-destructive/10 border border-destructive/20 rounded px-2 py-1 mt-1">
            ⚠️ Protein + fat exceed calorie goal. Reduce protein or fat to allow carbs.
          </p>
        )}
      </div>
    </div>
  );
}

// ── Step 5: Add Meal Plan (inline diet configurator) ─────────────────────────

const DIET_OPTIONS: { v: string; l: string }[] = [
  { v: "vegan", l: "Vegan" }, { v: "vegetarian", l: "Vegetarian" },
  { v: "keto", l: "Keto" }, { v: "whole30", l: "Whole30" },
  { v: "mediterranean", l: "Mediterranean" }, { v: "gluten-free", l: "Gluten-Free" },
  { v: "dairy-free", l: "Dairy-Free" },
];

function Step5MealPlan({ s, totalCals, proteinG, carbG, fatG, strategy, onSkip, onCreatePlan }:
  { s: WizardState; totalCals: number; proteinG: number; carbG: number; fatG: number; strategy: CalStrategy;
    onSkip: () => void; onCreatePlan: (diets: string[], exclusions: string, mealsPerDay: 3|4, planLength: 1|7) => void; }) {
  const [selectedDiets, setSelectedDiets] = useState<string[]>([]);
  const [exclusions, setExclusions] = useState("");
  const [mealsPerDay, setMealsPerDay] = useState<3|4>(3);
  const [planLength, setPlanLength] = useState<1|7>(7);

  function toggleDiet(v: string) {
    setSelectedDiets(prev => prev.includes(v) ? prev.filter(d => d !== v) : [...prev, v]);
  }

  return (
    <div className="space-y-4">
      {/* Macro targets */}
      <div className="rounded-xl border bg-card p-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Your daily targets</p>
        <div className="flex items-center justify-between border-b pb-2 mb-2">
          <span className="text-sm font-medium">Calories</span>
          <span className="text-base font-bold text-primary">{totalCals.toLocaleString()} kcal</span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div><p className="text-lg font-bold text-blue-600 dark:text-blue-400">{proteinG}g</p><p className="text-[10px] text-muted-foreground">Protein</p></div>
          <div><p className="text-lg font-bold text-amber-600 dark:text-amber-400">{Math.max(0, carbG)}g</p><p className="text-[10px] text-muted-foreground">Carbs</p></div>
          <div><p className="text-lg font-bold text-rose-600 dark:text-rose-400">{fatG}g</p><p className="text-[10px] text-muted-foreground">Fat</p></div>
        </div>
      </div>

      {/* Diet style */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Dietary style <span className="font-normal normal-case">(optional)</span></p>
        <div className="flex flex-wrap gap-1.5">
          {DIET_OPTIONS.map(d => (
            <button key={d.v} type="button"
              onClick={() => toggleDiet(d.v)}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${selectedDiets.includes(d.v) ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground hover:bg-secondary"}`}>
              {d.l}
            </button>
          ))}
        </div>
      </div>

      {/* Exclusions */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Ingredients to avoid</p>
        <Input placeholder="e.g. mushrooms, cilantro, peanuts" value={exclusions} onChange={e => setExclusions(e.target.value)} className="h-8 text-sm" />
        <p className="text-[11px] text-muted-foreground mt-1">Comma-separated. Recipes with these ingredients will be excluded.</p>
      </div>

      {/* Meals per day + plan length */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Meals per day</p>
          <div className="flex gap-2">
            {([3,4] as const).map(n => (
              <button key={n} type="button" onClick={() => setMealsPerDay(n)}
                className={`flex-1 rounded-lg border py-1.5 text-xs font-medium transition-colors ${mealsPerDay === n ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-secondary"}`}>
                {n === 3 ? "3 meals" : "3 + snack"}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Plan length</p>
          <div className="flex gap-2">
            {([1,7] as const).map(n => (
              <button key={n} type="button" onClick={() => setPlanLength(n)}
                className={`flex-1 rounded-lg border py-1.5 text-xs font-medium transition-colors ${planLength === n ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-secondary"}`}>
                {n === 1 ? "1 day" : "7 days"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <Button className="flex-1 gap-1.5" onClick={() => onCreatePlan(selectedDiets, exclusions, mealsPerDay, planLength)}>
          Next: Categories →
        </Button>
        <Button variant="outline" onClick={onSkip}>Skip</Button>
      </div>
    </div>
  );
}

// ── Step 6: Summary ───────────────────────────────────────────────────────────

function Step5({ s, totalCals, proteinG, carbG, fatG, maintenance, strategy }:
  { s: WizardState; totalCals: number; proteinG: number; carbG: number; fatG: number; maintenance: number; strategy: CalStrategy }) {
  const weeks = weeksFromDates(s.startDate, s.endDate);
  const deficit = maintenance - totalCals;
  const lbsPerWeek = Math.abs(deficit) / 3500;
  const totalLbs = lbsPerWeek * weeks;
  const card = GOAL_CARDS.find(c => c.metric === s.metric)!;
  const badge = metricBadge(s.metric);

  const outcomeText =
    strategy === "cut"
      ? `At a deficit of ${deficit.toLocaleString()} kcal/day, expect roughly ${lbsPerWeek.toFixed(1)} lbs/week of loss. A ${weeks}-week plan could result in ~${totalLbs.toFixed(1)} lbs of fat loss.`
      : strategy === "bulk"
      ? `Muscle grows slowly — expect noticeable strength increases within 6–8 weeks and visible size changes after 12+ weeks of consistent training and surplus.`
      : `Recomposition is slower than cutting or bulking. Most people see noticeable changes in 8–12 weeks, with bigger results over many months.`;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4 space-y-4">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${badge.className}`}>{badge.label}</span>
          <span className="text-xs text-muted-foreground">{weeks} weeks · {new Date(s.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })} → {new Date(s.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
        </div>
        <div className="flex items-center justify-between border-b pb-3">
          <span className="text-sm font-medium">Daily calories</span>
          <span className="text-lg font-bold text-primary">{totalCals.toLocaleString()} kcal</span>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div><p className="text-xl font-bold text-blue-600 dark:text-blue-400">{proteinG}g</p><p className="text-[11px] text-muted-foreground">Protein</p></div>
          <div><p className="text-xl font-bold text-amber-600 dark:text-amber-400">{Math.max(0, carbG)}g</p><p className="text-[11px] text-muted-foreground">Carbs</p></div>
          <div><p className="text-xl font-bold text-rose-600 dark:text-rose-400">{fatG}g</p><p className="text-[11px] text-muted-foreground">Fat</p></div>
        </div>
      </div>
      <div className="rounded-xl border bg-secondary/20 px-4 py-3 text-sm text-muted-foreground leading-relaxed">
        <p className="text-xs font-semibold text-foreground mb-1">Expected outcomes</p>
        {outcomeText}
      </div>
    </div>
  );
}

// ── Step 6: Categories ────────────────────────────────────────────────────────

function Step6Categories({ selectedCategories, onToggle, onPreset, onClear }:
  { selectedCategories: string[]; onToggle: (c: string) => void; onPreset: (name: string) => void; onClear: () => void; }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-muted-foreground mb-3">Leave empty for any. Or pick a preset below.</p>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {Object.keys(CATEGORY_PRESETS).map(name => (
            <button key={name} type="button" onClick={() => onPreset(name)}
              className="rounded-full border px-3 py-1.5 text-xs font-medium bg-secondary hover:bg-secondary/80 transition-colors">
              {name}
            </button>
          ))}
          {selectedCategories.length > 0 && (
            <button type="button" onClick={onClear}
              className="rounded-full border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              Any
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-64 overflow-y-auto pr-1">
          {ALL_CATEGORIES.map(c => {
            const active = selectedCategories.includes(c);
            return (
              <label key={c} className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border cursor-pointer transition-colors text-xs ${active ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-secondary"}`}>
                <input type="checkbox" checked={active} onChange={() => onToggle(c)} className="w-3.5 h-3.5 accent-primary" />
                {c}
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Step 7: Review Meal Plan ──────────────────────────────────────────────────

const DAY_LABELS_SHORT = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const SLOT_EMOJI: Record<string, string> = { breakfast:"☕", lunch:"🥗", dinner:"🍽️", snack:"🍪" };

function Step7ReviewPlan() {
  const planner = usePlanner();
  const plan = planner.plan;
  const [activeDay, setActiveDay] = useState(0);
  const [swapTarget, setSwapTarget] = useState<{dayIndex:number;mealIndex:number}|null>(null);
  const [swapOptions, setSwapOptions] = useState<any[]>([]);
  const [leftoverTarget, setLeftoverTarget] = useState<{dayIndex:number;mealIndex:number;name:string}|null>(null);

  if (!plan) return (
    <div className="text-center py-10 text-muted-foreground">
      <p className="text-sm">No plan generated yet.</p>
    </div>
  );

  const day = plan.days[activeDay];
  if (!day) return null;

  function openSwap(dayIndex: number, mealIndex: number) {
    setSwapTarget({ dayIndex, mealIndex });
    setSwapOptions(planner.swapOptions(dayIndex, mealIndex));
  }

  return (
    <div className="space-y-3">
      {/* Day tabs */}
      {plan.days.length > 1 && (
        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
          {plan.days.map((d, i) => (
            <button key={i} onClick={() => setActiveDay(i)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${activeDay === i ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
              Day {i + 1}
            </button>
          ))}
        </div>
      )}

      {/* Macro bar */}
      <div className="grid grid-cols-4 gap-1.5 text-center">
        {[
          { label: "Cal", val: day.totals.cal, target: plan.target.cal, color: "text-primary" },
          { label: "P", val: day.totals.p, target: plan.target.p, color: "text-blue-500" },
          { label: "C", val: day.totals.c, target: plan.target.c, color: "text-amber-500" },
          { label: "F", val: day.totals.f, target: plan.target.f, color: "text-rose-500" },
        ].map(m => (
          <div key={m.label} className="rounded-lg border bg-card p-2">
            <p className={`text-sm font-bold ${m.color}`}>{m.val}</p>
            <p className="text-[10px] text-muted-foreground">/{m.target} {m.label}</p>
          </div>
        ))}
      </div>

      {/* Meal cards */}
      <div className="space-y-2 max-h-72 overflow-y-auto pr-0.5">
        {day.meals.filter((m: any) => !m.removed).map((m: any) => {
          const mi = day.meals.indexOf(m);
          return (
            <div key={mi} className={`rounded-xl border p-3 ${m.isLeftover ? "border-amber-300 dark:border-amber-700 bg-amber-50/20 dark:bg-amber-950/10" : "bg-card"}`}>
              <div className="flex items-start gap-2">
                <span className="text-base shrink-0">{SLOT_EMOJI[m.slot] ?? "🍴"}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{m.slot}{m.isLeftover ? " · 🍱 Leftover" : ""}</p>
                  <p className="text-sm font-semibold leading-tight">{m.recipe.name}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{m.recipe.macros.cal} cal · {m.recipe.macros.p}P · {m.recipe.macros.c}C · {m.recipe.macros.f}F</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!m.isLeftover && (
                    <button onClick={() => openSwap(activeDay, mi)}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg border text-xs hover:bg-secondary transition-colors">
                      <RefreshCw size={11} /> Swap
                    </button>
                  )}
                  <button onClick={() => setLeftoverTarget({ dayIndex: activeDay, mealIndex: mi, name: m.recipe.name })}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg border text-xs hover:bg-secondary transition-colors">
                    <CalendarPlus size={11} /> Leftover
                  </button>
                  <button onClick={() => planner.removeMeal(activeDay, mi)}
                    className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Regenerate day */}
      <button onClick={() => planner.regenerateDay(activeDay)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <RefreshCw size={11} /> Regenerate {DAY_LABELS_SHORT[activeDay % 7]}
      </button>

      {/* Leftover day picker */}
      {leftoverTarget && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60" onClick={() => setLeftoverTarget(null)}>
          <div className="w-full sm:max-w-sm bg-background border sm:rounded-2xl rounded-t-2xl p-4 space-y-3 max-h-[60vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between shrink-0">
              <p className="text-sm font-semibold">Copy as Leftover to…</p>
              <button onClick={() => setLeftoverTarget(null)} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
            </div>
            <p className="text-xs text-muted-foreground shrink-0">"{leftoverTarget.name}" will be added to the selected day.</p>
            <div className="overflow-y-auto space-y-1.5 flex-1">
              {plan.days.filter(d => d.day !== leftoverTarget.dayIndex).map(d => (
                <button key={d.day}
                  onClick={() => { planner.markLeftover(leftoverTarget.dayIndex, leftoverTarget.mealIndex, d.day); setLeftoverTarget(null); }}
                  className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl border hover:bg-secondary transition-colors text-sm font-medium">
                  <CalendarPlus size={15} className="text-muted-foreground shrink-0" />
                  {DAY_LABELS_SHORT[d.day % 7] === "Mon" ? "Monday" : DAY_LABELS_SHORT[d.day % 7] === "Tue" ? "Tuesday" : DAY_LABELS_SHORT[d.day % 7] === "Wed" ? "Wednesday" : DAY_LABELS_SHORT[d.day % 7] === "Thu" ? "Thursday" : DAY_LABELS_SHORT[d.day % 7] === "Fri" ? "Friday" : DAY_LABELS_SHORT[d.day % 7] === "Sat" ? "Saturday" : "Sunday"}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Swap picker */}
      {swapTarget && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60" onClick={() => setSwapTarget(null)}>
          <div className="w-full sm:max-w-sm bg-background border sm:rounded-2xl rounded-t-2xl p-4 space-y-2 max-h-[60vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between shrink-0">
              <p className="text-sm font-semibold">Swap with…</p>
              <button onClick={() => setSwapTarget(null)} className="text-muted-foreground hover:text-foreground text-lg">×</button>
            </div>
            <div className="overflow-y-auto space-y-1.5 flex-1">
              {swapOptions.map((r: any) => (
                <button key={r.id} onClick={() => { planner.swap(swapTarget.dayIndex, swapTarget.mealIndex, r); setSwapTarget(null); }}
                  className="w-full text-left px-3 py-2 rounded-xl border hover:bg-secondary transition-colors">
                  <p className="text-sm font-medium">{r.name}</p>
                  <p className="text-[11px] text-muted-foreground">{r.macros.cal} cal · {r.macros.p}P · {r.macros.c}C · {r.macros.f}F</p>
                </button>
              ))}
              {swapOptions.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No alternatives found.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Plan Wizard Modal ─────────────────────────────────────────────────────────

interface WizardProps {
  editing: WorkoutPlan | null;
  onClose: () => void;
  onSaved: () => void;
  onAddWorkoutPlan?: (goal: string) => void;
}

function PlanWizardModal({ editing, onClose, onSaved, onAddWorkoutPlan }: WizardProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [step, setStep] = useState(editing ? 2 : 1);
  const planner = usePlanner();
  const [wizardCategories, setWizardCategories] = useState<string[]>([]);
  const [ws, setWs] = useState<WizardState>(() => editing ? stateFromPlan(editing) : makeDefaultState("body_fat"));

  // Merge partial updates
  function set(patch: Partial<WizardState>) { setWs(prev => ({ ...prev, ...patch })); }

  // Derived values
  const maintenanceNum = parseInt(ws.maintenanceCalories) || 0;
  const currentWLbs = ws.weightUnit === "lbs" ? (parseFloat(ws.currentWeight) || 150) : (parseFloat(ws.currentWeight) || 68) * 2.20462;
  const goalWLbs = ws.weightUnit === "lbs" ? (parseFloat(ws.goalWeight) || 0) : (parseFloat(ws.goalWeight) || 0) * 2.20462;
  const strategy = getCalStrategy(ws.metric, currentWLbs, goalWLbs);
  const [lo, hi] = maintenanceNum > 0 ? calRangeForStrategy(maintenanceNum, strategy) : [1800, 2400];
  const mid = Math.round((lo + hi) / 2);
  const effectiveCals = ws.targetCalories || mid;
  const { proteinG, fatG, carbG } = calcMacros(effectiveCals, ws.proteinPerLb, ws.fatPct, currentWLbs);

  function handleSelectMetric(m: GoalMetric) {
    setWs(makeDefaultState(m));
    setStep(2);
  }

  function buildGoalMetricJson(): string {
    const card = GOAL_CARDS.find(c => c.metric === ws.metric)!;
    // Legacy compat fields
    let currentValue = parseFloat(ws.currentWeight) || 0;
    let targetValue = parseFloat(ws.goalWeight) || 0;
    let unit = ws.weightUnit;
    if (ws.metric === "body_fat") {
      currentValue = parseFloat(ws.currentBodyFat) || 0;
      targetValue = parseFloat(ws.goalBodyFat) || 0;
      unit = "%";
    } else if (ws.metric === "muscle_mass") {
      currentValue = parseFloat(ws.currentMuscleMass) || 0;
      targetValue = parseFloat(ws.goalMuscleMass) || 0;
      unit = ws.weightUnit;
    } else if (ws.metric === "recomp") {
      currentValue = parseFloat(ws.currentWeight) || 0;
      targetValue = parseFloat(ws.currentWeight) || 0;
      unit = ws.weightUnit;
    }

    return JSON.stringify({
      metric: ws.metric,
      currentValue, targetValue, unit,
      // extended
      weightUnit: ws.weightUnit,
      currentWeight:    parseFloat(ws.currentWeight)     || null,
      goalWeight:       parseFloat(ws.goalWeight)        || null,
      currentBodyFat:   parseFloat(ws.currentBodyFat)    || null,
      goalBodyFat:      parseFloat(ws.goalBodyFat)       || null,
      currentMuscleMass:parseFloat(ws.currentMuscleMass) || null,
      goalMuscleMass:   parseFloat(ws.goalMuscleMass)    || null,
      activityLevel:    ws.activityLevel,
      maintenanceCalories: maintenanceNum || null,
      targetCalories:   effectiveCals,
      proteinGrams:     proteinG,
      carbsGrams:       Math.max(0, carbG),
      fatGrams:         fatG,
      proteinPerLb:     ws.proteinPerLb,
      fatPct:           ws.fatPct,
    });
  }

  function autoName(): string {
    const names: Record<GoalMetric, string> = {
      body_weight: "Body Weight Plan",
      body_fat:    "Fat Loss Plan",
      muscle_mass: "Muscle Building Plan",
      recomp:      "Body Recomposition Plan",
    };
    return names[ws.metric];
  }

  const totalWeeks = weeksFromDates(ws.startDate, ws.endDate);
  // Auto-generate milestones
  function buildMilestones() {
    const checkpoints = [4, 8, 12, totalWeeks].filter(c => c <= totalWeeks && c > 0);
    return [...new Set(checkpoints)].map(wk => ({ week: wk, description: `Week ${wk} progress check-in` }));
  }

  const saveMut = useMutation({
    mutationFn: (payload: object) =>
      editing
        ? apiRequest("PATCH", `/api/workout-plans/${editing.id}`, payload).then(r => r.json())
        : apiRequest("POST", "/api/workout-plans", payload).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/workout-plans"] });
      toast({ title: editing ? "Plan updated!" : "Plan created!" });
      onSaved();
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  function handleSave() {
    saveMut.mutate({
      name: autoName(),
      description: null,
      durationWeeks: totalWeeks,
      scheduleJson: "[]",
      goalType: "body_composition",
      goalMetricJson: buildGoalMetricJson(),
      startDate: ws.startDate,
      milestonesJson: JSON.stringify(buildMilestones()),
      isActive: editing ? editing.isActive : false,
      createdAt: editing ? editing.createdAt : new Date().toISOString(),
    });
  }

  // Stores diet prefs temporarily; categories are picked in step 6
  const [wizardDietPrefs, setWizardDietPrefs] = useState<{ diets: string[]; exclusions: string; mealsPerDay: 3|4; planLength: 1|7 } | null>(null);

  function handleCreateMealPlan(diets: string[], exclusions: string, mealsPerDay: 3|4, planLength: 1|7) {
    setWizardDietPrefs({ diets, exclusions, mealsPerDay, planLength });
    setStep(6); // go to categories step
  }

  function handleGenerateMealPlan(categories: string[]) {
    const prefs = wizardDietPrefs ?? { diets: [], exclusions: "", mealsPerDay: 3 as const, planLength: 7 as const };
    const heightIn = (parseFloat(ws.heightFt) || 0) * 12 + (parseFloat(ws.heightIn) || 0);
    const heightCm = Math.round(heightIn * 2.54);
    const weightKg = ws.weightUnit === "kg" ? parseFloat(ws.currentWeight) || 70 : Math.round((parseFloat(ws.currentWeight) || 154) * 0.453592);
    const age = parseInt(ws.age) || 30;
    const actMap: Record<string, any> = { sedentary:"sedentary", lightly_active:"light", moderately_active:"moderate", very_active:"very", extremely_active:"athlete" };
    const goalMap: Record<string, any> = { cut:"cut", bulk:"bulk", recomp:"maintain", maintain:"maintain" };
    planner.setMode("personal");
    planner.setStats({ sex: ws.sex, age, heightCm: heightCm || 170, weightKg, activity: actMap[ws.activityLevel] ?? "moderate", goal: goalMap[strategy] ?? "maintain" });
    planner.setMacros({ cal: effectiveCals, p: proteinG, c: Math.max(0, carbG), f: fatG });
    const excList = prefs.exclusions.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    planner.setPrefs({ ...planner.prefs, diets: prefs.diets as any, exclusions: excList, mealsPerDay: prefs.mealsPerDay, planLength: prefs.planLength, categories });
    planner.generate();
    setStep(7); // go to Review step
  }

  const STEP_LABELS = ["Goal", "Your Stats", "Calorie Target", "Macros", "Diet", "Categories", "Review Plan", "Summary"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-card border rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h2 className="font-semibold">{editing ? "Edit" : "New"} Body Composition Plan</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Step {step} of 8 — {STEP_LABELS[step - 1]}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors"><X size={16} /></button>
        </div>
        <div className="h-1 bg-secondary">
          <div className="h-full bg-primary transition-all" style={{ width: `${(step / 8) * 100}%` }} />
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {step === 1 && <Step1 onSelect={handleSelectMetric} />}
          {step === 2 && <Step2 s={ws} set={set} />}
          {step === 3 && maintenanceNum > 0 && (
            <Step3 s={ws} maintenance={maintenanceNum} strategy={strategy}
              onTargetChange={v => set({ targetCalories: v })} />
          )}
          {step === 3 && maintenanceNum === 0 && (
            <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/20 p-6 text-center space-y-3">
              <Scale size={32} className="mx-auto text-amber-500" />
              <p className="text-sm font-medium text-amber-700 dark:text-amber-300">Maintenance calories required</p>
              <p className="text-xs text-muted-foreground">Go back to Step 2 and enter your estimated daily calorie burn (TDEE) to continue.</p>
              <Button size="sm" variant="outline" className="mt-1" onClick={() => setStep(2)}>← Back to Stats</Button>
            </div>
          )}
          {step === 4 && (
            <Step4 s={ws} totalCals={effectiveCals} weightLbs={currentWLbs}
              onProteinChange={v => set({ proteinPerLb: v })}
              onFatChange={v => set({ fatPct: v })} />
          )}
          {step === 5 && (
            <Step5MealPlan s={ws} totalCals={effectiveCals} proteinG={proteinG} carbG={Math.max(0, carbG)} fatG={fatG}
              strategy={strategy}
              onSkip={() => setStep(8)}
              onCreatePlan={handleCreateMealPlan} />
          )}
          {step === 6 && (
            <Step6Categories
              selectedCategories={wizardCategories}
              onToggle={c => setWizardCategories(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])}
              onPreset={name => setWizardCategories(CATEGORY_PRESETS[name] ?? [])}
              onClear={() => setWizardCategories([])}
            />
          )}
          {step === 7 && <Step7ReviewPlan />}
          {step === 8 && (
            <Step5 s={ws} totalCals={effectiveCals} proteinG={proteinG} carbG={Math.max(0, carbG)} fatG={fatG}
              maintenance={maintenanceNum} strategy={strategy} />
          )}
        </div>

        {step > 1 && (
          <div className="px-5 py-4 border-t flex items-center justify-between gap-3">
            <Button variant="outline" size="sm" onClick={() => setStep(s => s - 1)} className="gap-1.5"><ChevronLeft size={14} /> Back</Button>
            {step === 4
              ? (
                <div className="flex gap-2 flex-1">
                  <Button size="sm" className="flex-1 gap-1.5" onClick={() => setStep(5)}>
                    🥗 Add Meal Plan
                  </Button>
                  {(ws.metric === "muscle_mass" || ws.metric === "body_fat") && onAddWorkoutPlan && (
                    <Button size="sm" variant="outline" className="flex-1 gap-1.5"
                      onClick={() => onAddWorkoutPlan(ws.metric === "muscle_mass" ? "hypertrophy" : "fatloss")}>
                      💪 Add Workout Plan
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => setStep(8)}>
                    Skip to Summary
                  </Button>
                </div>
              )
              : step === 5
              ? null  // step 5 has its own CTA buttons
              : step === 6
              ? <Button size="sm" onClick={() => handleGenerateMealPlan(wizardCategories)} className="gap-1.5 flex-1 sm:flex-none sm:min-w-[120px]">
                  🥗 Generate &amp; Review
                </Button>
              : step === 7
              ? <Button size="sm" onClick={() => setStep(8)} className="gap-1.5 flex-1 sm:flex-none sm:min-w-[120px]">
                  Looks good <ChevronRight size={14} />
                </Button>
              : step < 8
              ? <Button size="sm" onClick={() => {
                  if (step === 2 && !parseInt(ws.maintenanceCalories)) {
                    toast({ title: "Enter your maintenance calories (TDEE) before continuing.", variant: "destructive" });
                    return;
                  }
                  setStep(s => s + 1);
                }} className="gap-1.5 flex-1 sm:flex-none sm:min-w-[120px]">Next <ChevronRight size={14} /></Button>
              : <Button size="sm" onClick={handleSave} disabled={saveMut.isPending}
                  className="gap-1.5 flex-1 sm:flex-none sm:min-w-[120px] bg-green-600 hover:bg-green-700 text-white">
                  <CheckCircle2 size={14} /> {editing ? "Update Plan" : "Save Plan"}
                </Button>}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Check-In Modal ────────────────────────────────────────────────────────────

function CheckInModal({ planId, onClose }: { planId: number; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const todayStr = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(todayStr);
  const [weight, setWeight] = useState("");
  const [bodyFat, setBodyFat] = useState("");
  const [notes, setNotes] = useState("");

  const saveMut = useMutation({
    mutationFn: (data: object) => apiRequest("POST", `/api/body-comp-plans/${planId}/check-ins`, data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/body-comp-check-ins", planId] });
      toast({ title: "Check-in logged!" });
      onClose();
    },
    onError: () => toast({ title: "Failed to log check-in", variant: "destructive" }),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-card border rounded-2xl w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold">Log Weekly Check-in</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Date</label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-9" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Weight</label>
              <Input type="number" value={weight} onChange={e => setWeight(e.target.value)} placeholder="185" className="h-9" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Body fat % <span className="text-muted-foreground/60">opt</span></label>
              <Input type="number" value={bodyFat} onChange={e => setBodyFat(e.target.value)} placeholder="18" className="h-9" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Notes</label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Energy levels, strength changes, how the week felt..." rows={3} className="resize-none" />
          </div>
          <Button className="w-full gap-1.5" disabled={saveMut.isPending}
            onClick={() => saveMut.mutate({ date, weight: parseFloat(weight) || null, bodyFat: parseFloat(bodyFat) || null, notes: notes || null })}>
            <CheckCircle2 size={14} /> Log Check-in
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Active Plan Card ──────────────────────────────────────────────────────────

function ActivePlanCard({ plan, onEdit, onDeactivate, onCheckIn }: {
  plan: WorkoutPlan; onEdit: () => void; onDeactivate: () => void; onCheckIn: () => void;
}) {
  const { data: checkIns = [] } = useQuery<BodyCompCheckIn[]>({
    queryKey: ["/api/body-comp-check-ins", plan.id],
    queryFn: () => apiRequest("GET", `/api/body-comp-plans/${plan.id}/check-ins`).then(r => r.json()),
  });
  const qc = useQueryClient();
  const { toast } = useToast();

  const m = parseMetricJson(plan);
  const today = new Date();
  const start = new Date(plan.startDate ?? today);
  const totalWeeks = plan.durationWeeks;
  const weeksElapsed = Math.min(totalWeeks, Math.max(0, Math.floor((today.getTime() - start.getTime()) / (7 * 86400000))));
  const weeksRemaining = Math.max(0, totalWeeks - weeksElapsed);
  const progressPct = Math.min(100, Math.round((weeksElapsed / totalWeeks) * 100));
  const endDate = plan.startDate ? addWeeks(plan.startDate, totalWeeks) : "";
  const badge = metricBadge(m?.metric ?? "body_weight");

  const deleteCheckIn = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/body-comp-check-ins/${id}`).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/body-comp-check-ins", plan.id] }); toast({ title: "Check-in removed" }); },
  });

  const latestCheckIn = checkIns[0];

  return (
    <div className="bg-card border-2 border-primary rounded-xl overflow-hidden shadow-sm shadow-primary/10">
      <div className="bg-primary text-primary-foreground text-xs font-semibold px-4 py-1.5 flex items-center gap-1.5">
        <Play size={10} fill="currentColor" /> Active Plan — {weeksRemaining} week{weeksRemaining !== 1 ? "s" : ""} remaining
      </div>
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badge.className}`}>{badge.label}</span>
              <span className="text-xs text-muted-foreground">{totalWeeks} weeks</span>
            </div>
            {plan.startDate && (
              <p className="text-xs text-muted-foreground">
                {new Date(plan.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                {endDate && ` → ${new Date(endDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
              </p>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"><MoreHorizontal size={14} /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}><Pencil size={13} className="mr-2" />Edit Plan</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDeactivate}><X size={13} className="mr-2" />Deactivate Plan</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Daily targets */}
        {m?.targetCalories && (
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              { val: m.targetCalories.toLocaleString(), label: "kcal", bg: "bg-secondary/30", color: "text-primary" },
              { val: `${m.proteinGrams ?? "—"}g`, label: "Protein", bg: "bg-blue-50 dark:bg-blue-950/20", color: "text-blue-600 dark:text-blue-400" },
              { val: `${m.carbsGrams ?? "—"}g`, label: "Carbs", bg: "bg-amber-50 dark:bg-amber-950/20", color: "text-amber-600 dark:text-amber-400" },
              { val: `${m.fatGrams ?? "—"}g`, label: "Fat", bg: "bg-rose-50 dark:bg-rose-950/20", color: "text-rose-600 dark:text-rose-400" },
            ].map(item => (
              <div key={item.label} className={`${item.bg} rounded-lg py-2`}>
                <p className={`text-sm font-bold ${item.color}`}>{item.val}</p>
                <p className="text-[10px] text-muted-foreground">{item.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Stats snapshot */}
        {m && (m.currentWeight || m.currentBodyFat) && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground border rounded-lg px-3 py-2">
            <Scale size={12} className="shrink-0" />
            <span>Start: {m.currentWeight ? `${m.currentWeight} ${m.weightUnit}` : "—"}{m.currentBodyFat ? ` · ${m.currentBodyFat}% BF` : ""}</span>
            {m.goalWeight && <span className="text-primary font-medium ml-auto">→ Goal: {m.goalWeight} {m.weightUnit}</span>}
            {m.goalBodyFat && !m.goalWeight && <span className="text-primary font-medium ml-auto">→ Goal: {m.goalBodyFat}% BF</span>}
          </div>
        )}

        {/* Progress bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Week {weeksElapsed} of {totalWeeks}</span>
            <span>{progressPct}% complete</span>
          </div>
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progressPct}%` }} />
          </div>
        </div>

        {/* Latest check-in */}
        {latestCheckIn && (
          <div className="flex items-center gap-2 text-xs bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2">
            <CheckCircle2 size={11} className="text-green-600 shrink-0" />
            <span className="text-muted-foreground">
              Last check-in: {new Date(latestCheckIn.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              {latestCheckIn.weight ? ` · ${latestCheckIn.weight} ${m?.weightUnit ?? "lbs"}` : ""}
              {latestCheckIn.bodyFat ? ` · ${latestCheckIn.bodyFat}% BF` : ""}
            </span>
          </div>
        )}

        <div className="flex gap-2">
          <Button size="sm" className="flex-1 gap-1.5 bg-green-600 hover:bg-green-700 text-white" onClick={onCheckIn}>
            <ClipboardList size={13} /> Log a Check-in
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-primary border-primary/40 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40"
            onClick={onDeactivate}
          >
            <CheckCircle2 size={12} /> Active
          </Button>
        </div>

        {/* Check-in history */}
        {checkIns.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Check-in History</p>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {checkIns.map(ci => (
                <div key={ci.id} className="flex items-start justify-between gap-2 text-xs border rounded-lg px-3 py-2 bg-secondary/20">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{new Date(ci.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
                    <p className="text-muted-foreground">
                      {ci.weight ? `${ci.weight} ${m?.weightUnit ?? "lbs"}` : "—"}{ci.bodyFat ? ` · ${ci.bodyFat}% BF` : ""}
                    </p>
                    {ci.notes && <p className="text-muted-foreground/70 italic mt-0.5 line-clamp-2">{ci.notes}</p>}
                  </div>
                  <button onClick={() => deleteCheckIn.mutate(ci.id)} className="text-muted-foreground/40 hover:text-destructive shrink-0"><X size={12} /></button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Inactive Plan Card ────────────────────────────────────────────────────────

function InactivePlanCard({ plan, onEdit, onDelete, onActivate }: {
  plan: WorkoutPlan; onEdit: () => void; onDelete: () => void; onActivate: () => void;
}) {
  const m = parseMetricJson(plan);
  const badge = metricBadge(m?.metric ?? "body_weight");
  const endDate = plan.startDate ? addWeeks(plan.startDate, plan.durationWeeks) : "";

  return (
    <div className="bg-card border rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badge.className}`}>{badge.label}</span>
            <span className="text-xs text-muted-foreground">{plan.durationWeeks} weeks</span>
          </div>
          <p className="text-sm font-semibold">{plan.name}</p>
          {plan.startDate && (
            <p className="text-xs text-muted-foreground">
              {new Date(plan.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              {endDate && ` → ${new Date(endDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
            </p>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"><MoreHorizontal size={14} /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}><Pencil size={13} className="mr-2" />Edit Plan</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}><Trash2 size={13} className="mr-2" />Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {m?.targetCalories && (
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{m.targetCalories.toLocaleString()} kcal</span>
          <span>·</span>
          {m.proteinGrams != null && <span>{m.proteinGrams}g P</span>}
          {m.carbsGrams != null && <span>{m.carbsGrams}g C</span>}
          {m.fatGrams != null && <span>{m.fatGrams}g F</span>}
        </div>
      )}
      {/* Activate button */}
      <div className="pt-1 border-t">
        <Button size="sm" className="w-full gap-1.5" onClick={onActivate}>
          <Play size={12} /> Set as Active Plan
        </Button>
      </div>
    </div>
  );
}

// ── Main Section ──────────────────────────────────────────────────────────────

export default function BodyCompositionPlanSection({
  externalWizardOpen = false,
  externalEditingPlan = null,
  onExternalWizardClose,
  onAddWorkoutPlan,
}: BodyCompSectionProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [internalWizardOpen, setInternalWizardOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<WorkoutPlan | null>(null);
  const [checkInPlanId, setCheckInPlanId] = useState<number | null>(null);

  // Sync external trigger
  useEffect(() => {
    if (externalWizardOpen) {
      setEditingPlan(externalEditingPlan);
      setInternalWizardOpen(true);
    }
  }, [externalWizardOpen, externalEditingPlan]);

  const wizardOpen = internalWizardOpen;

  function closeWizard() {
    setInternalWizardOpen(false);
    setEditingPlan(null);
    onExternalWizardClose?.();
  }

  const { data: allPlans = [] } = useQuery<WorkoutPlan[]>({
    queryKey: ["/api/workout-plans"],
    queryFn: () => apiRequest("GET", "/api/workout-plans").then(r => r.json()),
  });

  // Filter to body_composition plans only
  const plans = allPlans.filter(p => p.goalType === "body_composition");
  const activePlans = plans.filter(p => p.isActive);
  const inactivePlans = plans.filter(p => !p.isActive);

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/workout-plans/${id}`).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/workout-plans"] }); toast({ title: "Plan deleted" }); },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  const activateMut = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/workout-plans/${id}/activate`).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/workout-plans"] }); toast({ title: "Plan activated!" }); },
    onError: () => toast({ title: "Failed to activate plan", variant: "destructive" }),
  });

  const deactivateMut = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/workout-plans/${id}`, { isActive: false }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/workout-plans"] }); toast({ title: "Plan deactivated" }); },
    onError: () => toast({ title: "Failed to deactivate plan", variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold flex items-center gap-1.5"><Heart size={14} className="text-rose-500" /> Body Composition Plans</p>
          <p className="text-xs text-muted-foreground">Goal-setting & macro calculator — fat loss, muscle gain, or recomposition</p>
        </div>
        <Button size="sm" onClick={() => { setEditingPlan(null); setInternalWizardOpen(true); }} className="gap-1.5 shrink-0">
          <Plus size={13} /> New Plan
        </Button>
      </div>

      {/* Active plans */}
      {activePlans.map(plan => (
        <ActivePlanCard key={plan.id} plan={plan}
          onEdit={() => { setEditingPlan(plan); setInternalWizardOpen(true); }}
          onDeactivate={() => deactivateMut.mutate(plan.id)}
          onCheckIn={() => setCheckInPlanId(plan.id)} />
      ))}

      {/* Past plans */}
      {inactivePlans.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Past Plans</p>
          {inactivePlans.map(plan => (
            <InactivePlanCard key={plan.id} plan={plan}
              onEdit={() => { setEditingPlan(plan); setInternalWizardOpen(true); }}
              onDelete={() => deleteMut.mutate(plan.id)}
              onActivate={() => activateMut.mutate(plan.id)} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {plans.length === 0 && !wizardOpen && (
        <div className="border-2 border-dashed rounded-xl py-10 text-center space-y-3">
          <div className="flex justify-center gap-3 text-muted-foreground opacity-30">
            <Scale size={26} /><Flame size={26} /><Dumbbell size={26} /><RefreshCw size={26} />
          </div>
          <div>
            <p className="font-medium text-sm">No body composition plans yet</p>
            <p className="text-xs text-muted-foreground mt-1">Create a plan to calculate your daily calorie and macro targets</p>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { setEditingPlan(null); setInternalWizardOpen(true); }}>
            <Plus size={13} /> Create Your First Plan
          </Button>
        </div>
      )}

      {/* Wizard modal */}
      {wizardOpen && (
        <PlanWizardModal
          editing={editingPlan}
          onClose={closeWizard}
          onSaved={closeWizard}
          onAddWorkoutPlan={onAddWorkoutPlan}
        />
      )}

      {/* Check-in modal */}
      {checkInPlanId !== null && (
        <CheckInModal planId={checkInPlanId} onClose={() => setCheckInPlanId(null)} />
      )}
    </div>
  );
}
