import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Flame, TrendingUp, RefreshCw, X, ChevronRight, ChevronLeft,
  Scale, Target, Dumbbell, CheckCircle2, Pencil, Trash2, Calendar,
  MoreHorizontal, ClipboardList, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { BodyCompPlan, BodyCompCheckIn } from "@shared/schema";

// ── Types ──────────────────────────────────────────────────────────────────────

type PlanType = "cut" | "bulk" | "recomp";
type ActivityLevel = "sedentary" | "light" | "moderate" | "heavy" | "athlete";

interface PlanWithCheckIns extends BodyCompPlan {
  checkIns?: BodyCompCheckIn[];
}

// ── Constants ──────────────────────────────────────────────────────────────────

const ACTIVITY_LEVELS: { value: ActivityLevel; label: string; multiplier: number }[] = [
  { value: "sedentary",  label: "Sedentary",                  multiplier: 1.2   },
  { value: "light",      label: "Light Exercise (1–2 days/wk)", multiplier: 1.375 },
  { value: "moderate",   label: "Moderate Exercise (3–5 days/wk)", multiplier: 1.55 },
  { value: "heavy",      label: "Heavy Exercise (6–7 days/wk)",  multiplier: 1.725 },
  { value: "athlete",    label: "Athlete (2× per day)",         multiplier: 1.9   },
];

const PLAN_CARDS: { type: PlanType; icon: React.ReactNode; name: string; desc: string; timeframe: string; color: string; bgColor: string; borderColor: string }[] = [
  {
    type: "cut",
    icon: <Flame size={28} />,
    name: "Fat Loss (Cut)",
    desc: "Lose body fat while preserving muscle",
    timeframe: "8–12 week blocks",
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-50 dark:bg-orange-950/30",
    borderColor: "border-orange-300 dark:border-orange-700",
  },
  {
    type: "bulk",
    icon: <Dumbbell size={28} />,
    name: "Muscle Gain (Bulk)",
    desc: "Build muscle with a controlled surplus",
    timeframe: "3–6 months",
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-50 dark:bg-blue-950/30",
    borderColor: "border-blue-300 dark:border-blue-700",
  },
  {
    type: "recomp",
    icon: <RefreshCw size={28} />,
    name: "Body Recomposition",
    desc: "Lose fat and gain muscle simultaneously",
    timeframe: "8–12+ weeks",
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-50 dark:bg-green-950/30",
    borderColor: "border-green-300 dark:border-green-700",
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function calcTDEE(weight: number, unit: "lbs" | "kg", age: number, heightIn: number, sex: "male" | "female", activity: ActivityLevel): number {
  // Mifflin-St Jeor BMR
  const weightKg = unit === "lbs" ? weight * 0.453592 : weight;
  const heightCm = heightIn * 2.54;
  const bmr = sex === "male"
    ? 10 * weightKg + 6.25 * heightCm - 5 * age + 5
    : 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
  const mult = ACTIVITY_LEVELS.find(a => a.value === activity)?.multiplier ?? 1.55;
  return Math.round(bmr * mult);
}

function calcMacros(totalCals: number, proteinPerLb: number, fatPct: number, bodyweightLbs: number) {
  const proteinGrams = Math.round(proteinPerLb * bodyweightLbs);
  const proteinCals = proteinGrams * 4;
  const fatCals = Math.round(totalCals * (fatPct / 100));
  const fatGrams = Math.round(fatCals / 9);
  const carbCals = totalCals - proteinCals - fatCals;
  const carbGrams = Math.round(Math.max(0, carbCals) / 4);
  return { proteinGrams, fatGrams, carbGrams, proteinCals, fatCals, carbCals };
}

function weeksFromDates(start: string, end: string): number {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  return Math.max(1, Math.round((e - s) / (7 * 24 * 60 * 60 * 1000)));
}

function addWeeks(dateStr: string, weeks: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

function planTypeBadge(type: PlanType) {
  if (type === "cut")   return { label: "Fat Loss",   className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 border border-orange-200 dark:border-orange-700" };
  if (type === "bulk")  return { label: "Muscle Gain", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-700" };
  return { label: "Recomp", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 border border-green-200 dark:border-green-700" };
}

// ── Step 1 — Goal Selection ────────────────────────────────────────────────────

function Step1({ onSelect }: { onSelect: (type: PlanType) => void }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Choose your primary goal to get started.</p>
      <div className="grid gap-3">
        {PLAN_CARDS.map(card => (
          <button
            key={card.type}
            onClick={() => onSelect(card.type)}
            className={`w-full text-left flex items-center gap-4 p-4 rounded-xl border-2 transition-all hover:shadow-sm ${card.bgColor} ${card.borderColor} hover:scale-[1.01]`}
          >
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

// ── Step 2 — Stats ────────────────────────────────────────────────────────────

interface Stats {
  weightUnit: "lbs" | "kg";
  currentWeight: string;
  goalWeight: string;
  currentBodyFat: string;
  goalBodyFat: string;
  activityLevel: ActivityLevel;
  maintenanceCalories: string;
  // TDEE calculator fields
  sex: "male" | "female";
  age: string;
  heightFt: string;
  heightIn: string;
  startDate: string;
  endDate: string;
}

function Step2({ planType, stats, onChange }: { planType: PlanType; stats: Stats; onChange: (s: Stats) => void }) {
  const [tdeeOpen, setTdeeOpen] = useState(false);

  const defaultWeeks = planType === "cut" ? 10 : planType === "bulk" ? 16 : 12;

  function calcAndFill() {
    const ht = (parseFloat(stats.heightFt) || 0) * 12 + (parseFloat(stats.heightIn) || 0);
    const wt = parseFloat(stats.currentWeight) || 0;
    const age = parseFloat(stats.age) || 0;
    if (wt > 0 && ht > 0 && age > 0) {
      const tdee = calcTDEE(wt, stats.weightUnit, age, ht, stats.sex, stats.activityLevel);
      onChange({ ...stats, maintenanceCalories: String(tdee) });
    }
  }

  const set = (key: keyof Stats) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...stats, [key]: e.target.value });

  return (
    <div className="space-y-4">
      {/* Weight unit toggle */}
      <div className="flex gap-2">
        {(["lbs", "kg"] as const).map(u => (
          <button key={u} onClick={() => onChange({ ...stats, weightUnit: u })}
            className={`flex-1 py-2 rounded-lg text-sm font-medium border-2 transition-all ${stats.weightUnit === u ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>
            {u}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Current weight ({stats.weightUnit})</label>
          <Input type="number" value={stats.currentWeight} onChange={set("currentWeight")} placeholder="185" className="h-9" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Goal weight ({stats.weightUnit}) <span className="text-muted-foreground/60">optional</span></label>
          <Input type="number" value={stats.goalWeight} onChange={set("goalWeight")} placeholder="170" className="h-9" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Current body fat % <span className="text-muted-foreground/60">optional</span></label>
          <Input type="number" value={stats.currentBodyFat} onChange={set("currentBodyFat")} placeholder="22" className="h-9" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Goal body fat % <span className="text-muted-foreground/60">optional</span></label>
          <Input type="number" value={stats.goalBodyFat} onChange={set("goalBodyFat")} placeholder="15" className="h-9" />
        </div>
      </div>

      {/* Maintenance calories + TDEE calculator */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Maintenance calories (TDEE)</label>
        <Input type="number" value={stats.maintenanceCalories} onChange={set("maintenanceCalories")} placeholder="2400" className="h-9" />
        <p className="text-[11px] text-muted-foreground">Your estimated daily calorie burn at current activity level.</p>
      </div>

      {/* TDEE Calculator */}
      <div className="border rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setTdeeOpen(o => !o)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-primary bg-primary/5 hover:bg-primary/10 transition-colors"
        >
          <span className="flex items-center gap-1.5"><Zap size={12} /> Calculate my TDEE</span>
          <ChevronRight size={13} className={`transition-transform ${tdeeOpen ? "rotate-90" : ""}`} />
        </button>
        {tdeeOpen && (
          <div className="p-4 space-y-3 bg-secondary/20">
            <p className="text-[11px] text-muted-foreground">Enter your details to estimate your daily calorie burn (TDEE) using the Mifflin-St Jeor formula.</p>

            <div className="flex gap-2">
              {(["male", "female"] as const).map(s => (
                <button key={s} type="button" onClick={() => onChange({ ...stats, sex: s })}
                  className={`flex-1 h-8 rounded-lg text-xs font-medium border-2 transition-all ${stats.sex === s ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Age</label>
                <Input type="number" value={stats.age} onChange={set("age")} placeholder="30" className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Height (ft)</label>
                <Input type="number" value={stats.heightFt} onChange={set("heightFt")} placeholder="5" className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Height (in)</label>
                <Input type="number" value={stats.heightIn} onChange={set("heightIn")} placeholder="10" className="h-8 text-xs" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] text-muted-foreground">Activity level</label>
              <select
                value={stats.activityLevel}
                onChange={e => onChange({ ...stats, activityLevel: e.target.value as ActivityLevel })}
                className="w-full border rounded-lg px-3 h-8 text-xs bg-background"
              >
                {ACTIVITY_LEVELS.map(a => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </div>

            <Button size="sm" className="w-full gap-1.5 h-8" onClick={calcAndFill}>
              <Zap size={12} /> Calculate & Fill In
            </Button>
          </div>
        )}
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Start date</label>
          <Input type="date" value={stats.startDate}
            onChange={e => onChange({ ...stats, startDate: e.target.value, endDate: addWeeks(e.target.value, defaultWeeks) })}
            className="h-9" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Target end date</label>
          <Input type="date" value={stats.endDate}
            onChange={e => onChange({ ...stats, endDate: e.target.value })}
            className="h-9" />
        </div>
      </div>
    </div>
  );
}

// ── Step 3 — Calorie Target ───────────────────────────────────────────────────

function Step3({ planType, maintenance, targetCals, onTargetChange }:
  { planType: PlanType; maintenance: number; targetCals: number; onTargetChange: (v: number) => void }) {

  const ranges: Record<PlanType, [number, number]> = {
    cut:   [maintenance - 700, maintenance - 500],
    bulk:  [maintenance + 200, maintenance + 300],
    recomp:[maintenance - 150, maintenance + 150],
  };
  const [lo, hi] = ranges[planType];

  const rangeLabelMap: Record<PlanType, string> = {
    cut:   `${lo.toLocaleString()}–${hi.toLocaleString()} kcal (${500}–${700} below maintenance)`,
    bulk:  `${lo.toLocaleString()}–${hi.toLocaleString()} kcal (200–300 above maintenance)`,
    recomp:`${lo.toLocaleString()}–${hi.toLocaleString()} kcal (within ±150 of maintenance)`,
  };

  const mid = Math.round((lo + hi) / 2);
  if (targetCals === 0) onTargetChange(mid);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-card p-4 space-y-2 text-center">
        <p className="text-xs text-muted-foreground">Your recommended daily calorie target</p>
        <p className="text-4xl font-bold text-primary">{targetCals > 0 ? targetCals.toLocaleString() : mid.toLocaleString()}</p>
        <p className="text-xs text-muted-foreground">kcal / day</p>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">Recommended range: {rangeLabelMap[planType]}</label>
        <input
          type="range"
          min={lo - 200}
          max={hi + 200}
          step={25}
          value={targetCals || mid}
          onChange={e => onTargetChange(Number(e.target.value))}
          className="w-full accent-primary"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>{(lo - 200).toLocaleString()}</span>
          <span className="font-medium text-primary">{lo.toLocaleString()}–{hi.toLocaleString()} kcal recommended</span>
          <span>{(hi + 200).toLocaleString()}</span>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Or enter a custom target</label>
        <Input
          type="number"
          value={targetCals || ""}
          onChange={e => onTargetChange(Number(e.target.value))}
          placeholder={String(mid)}
          className="h-9"
        />
      </div>

      <div className={`rounded-lg px-3 py-2 text-xs text-muted-foreground border ${targetCals < lo ? "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-700 text-amber-700 dark:text-amber-300" : "bg-secondary/30"}`}>
        {planType === "cut" && `Deficit: ${(maintenance - (targetCals || mid)).toLocaleString()} kcal/day below maintenance (${maintenance.toLocaleString()} kcal)`}
        {planType === "bulk" && `Surplus: ${((targetCals || mid) - maintenance).toLocaleString()} kcal/day above maintenance (${maintenance.toLocaleString()} kcal)`}
        {planType === "recomp" && `Difference: ${Math.abs((targetCals || mid) - maintenance).toLocaleString()} kcal/day ${(targetCals || mid) >= maintenance ? "above" : "below"} maintenance (${maintenance.toLocaleString()} kcal)`}
      </div>
    </div>
  );
}

// ── Step 4 — Macros ───────────────────────────────────────────────────────────

function Step4({
  planType, totalCals, bodyweightLbs,
  proteinPerLb, fatPct,
  onProteinChange, onFatChange,
}: {
  planType: PlanType;
  totalCals: number;
  bodyweightLbs: number;
  proteinPerLb: number;
  fatPct: number;
  onProteinChange: (v: number) => void;
  onFatChange: (v: number) => void;
}) {
  const { proteinGrams, fatGrams, carbGrams, proteinCals, fatCals, carbCals } = calcMacros(totalCals, proteinPerLb, fatPct, bodyweightLbs);
  const carbsNegative = carbCals < 0;
  const fatTooLow = fatPct < 20;

  const total = proteinCals + fatCals + Math.max(0, carbCals);
  const pPct = total > 0 ? Math.round((proteinCals / total) * 100) : 0;
  const fPct = total > 0 ? Math.round((fatCals / total) * 100) : 0;
  const cPct = total > 0 ? Math.round((Math.max(0, carbCals) / total) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* Macro summary card */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground">Daily Targets</p>
        <div className="flex items-center justify-around text-center">
          <div>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{proteinGrams}g</p>
            <p className="text-[11px] text-muted-foreground">Protein</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{Math.max(0, carbGrams)}g</p>
            <p className="text-[11px] text-muted-foreground">Carbs</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-rose-600 dark:text-rose-400">{fatGrams}g</p>
            <p className="text-[11px] text-muted-foreground">Fat</p>
          </div>
          <div>
            <p className="text-2xl font-bold">{totalCals.toLocaleString()}</p>
            <p className="text-[11px] text-muted-foreground">kcal</p>
          </div>
        </div>

        {/* Macro ratio bar */}
        <div className="h-4 rounded-full overflow-hidden flex">
          <div className="bg-blue-500 h-full transition-all" style={{ width: `${pPct}%` }} />
          <div className="bg-amber-500 h-full transition-all" style={{ width: `${cPct}%` }} />
          <div className="bg-rose-500 h-full transition-all" style={{ width: `${fPct}%` }} />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span className="text-blue-600 dark:text-blue-400 font-medium">P {pPct}%</span>
          <span className="text-amber-600 dark:text-amber-400 font-medium">C {cPct}%</span>
          <span className="text-rose-600 dark:text-rose-400 font-medium">F {fPct}%</span>
        </div>
      </div>

      {/* Protein slider */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium">Protein — {proteinGrams}g ({proteinCals} kcal)</label>
          <span className="text-xs text-muted-foreground">{proteinPerLb.toFixed(1)} g/lb</span>
        </div>
        <input
          type="range" min={0.7} max={1.2} step={0.05}
          value={proteinPerLb}
          onChange={e => onProteinChange(Number(e.target.value))}
          className="w-full accent-blue-500"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>0.7 g/lb</span>
          <span className="font-medium text-blue-500">
            {planType === "cut" ? "1.0 g/lb recommended" : planType === "bulk" ? "0.8 g/lb recommended" : "0.9 g/lb recommended"}
          </span>
          <span>1.2 g/lb</span>
        </div>
      </div>

      {/* Fat slider */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium">Fat — {fatGrams}g ({fatCals} kcal)</label>
          <span className="text-xs text-muted-foreground">{fatPct}% of calories</span>
        </div>
        <input
          type="range" min={15} max={45} step={1}
          value={fatPct}
          onChange={e => onFatChange(Number(e.target.value))}
          className="w-full accent-rose-500"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>15%</span>
          <span>25% default</span>
          <span>45%</span>
        </div>
        {fatTooLow && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
            ⚠️ Going below 20% of calories from fat long-term can negatively affect hormones and health.
          </p>
        )}
      </div>

      {/* Carbs display */}
      <div className="rounded-lg border bg-secondary/20 px-3 py-2.5 space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium">Carbs (auto-calculated)</span>
          <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">{Math.max(0, carbGrams)}g ({Math.max(0, carbCals)} kcal)</span>
        </div>
        <p className="text-[11px] text-muted-foreground">Remaining calories after protein and fat are accounted for.</p>
        {carbsNegative && (
          <p className="text-[11px] text-destructive bg-destructive/10 border border-destructive/20 rounded px-2 py-1 mt-1">
            ⚠️ Your protein and fat targets exceed your calorie goal — reduce protein or fat to allow room for carbs.
          </p>
        )}
      </div>
    </div>
  );
}

// ── Step 5 — Summary ──────────────────────────────────────────────────────────

function Step5({ planType, targetCals, proteinGrams, carbGrams, fatGrams, startDate, endDate, maintenance, currentWeight, weightUnit }:
  { planType: PlanType; targetCals: number; proteinGrams: number; carbGrams: number; fatGrams: number; startDate: string; endDate: string; maintenance: number; currentWeight: number; weightUnit: string }) {

  const weeks = weeksFromDates(startDate, endDate);
  const deficit = maintenance - targetCals;
  const lbsPerWeek = Math.abs(deficit) / 3500;
  const totalLbs = lbsPerWeek * weeks;

  const badge = planTypeBadge(planType);

  const outcomeText = planType === "cut"
    ? `At a deficit of ${deficit.toLocaleString()} kcal/day, expect roughly ${lbsPerWeek.toFixed(1)} lbs/week of loss. A ${weeks}-week cut could result in ~${totalLbs.toFixed(1)} lbs of fat loss at this pace.`
    : planType === "bulk"
    ? `Muscle grows slowly — expect noticeable strength increases within 6–8 weeks and visible size changes after 12+ weeks of consistent training and surplus.`
    : `Recomposition is slower than cutting or bulking. Most people see noticeable changes in 8–12 weeks, with bigger results over many months.`;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4 space-y-4">
        {/* Type badge */}
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${badge.className}`}>{badge.label}</span>
          <span className="text-xs text-muted-foreground">{weeks} weeks · {new Date(startDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })} → {new Date(endDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
        </div>

        {/* Calorie target */}
        <div className="flex items-center justify-between border-b pb-3">
          <span className="text-sm font-medium">Daily calories</span>
          <span className="text-lg font-bold text-primary">{targetCals.toLocaleString()} kcal</span>
        </div>

        {/* Macros */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-xl font-bold text-blue-600 dark:text-blue-400">{proteinGrams}g</p>
            <p className="text-[11px] text-muted-foreground">Protein</p>
          </div>
          <div>
            <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{Math.max(0, carbGrams)}g</p>
            <p className="text-[11px] text-muted-foreground">Carbs</p>
          </div>
          <div>
            <p className="text-xl font-bold text-rose-600 dark:text-rose-400">{fatGrams}g</p>
            <p className="text-[11px] text-muted-foreground">Fat</p>
          </div>
        </div>
      </div>

      {/* Outcome prediction */}
      <div className="rounded-xl border bg-secondary/20 px-4 py-3 text-sm text-muted-foreground leading-relaxed">
        <p className="text-xs font-semibold text-foreground mb-1">Expected outcomes</p>
        {outcomeText}
      </div>
    </div>
  );
}

// ── Plan Wizard ───────────────────────────────────────────────────────────────

function PlanWizard({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [step, setStep] = useState(1);

  // Wizard state
  const [planType, setPlanType] = useState<PlanType>("cut");
  const todayStr = new Date().toISOString().slice(0, 10);
  const [stats, setStats] = useState<Stats>({
    weightUnit: "lbs",
    currentWeight: "",
    goalWeight: "",
    currentBodyFat: "",
    goalBodyFat: "",
    activityLevel: "moderate",
    maintenanceCalories: "",
    sex: "male",
    age: "",
    heightFt: "",
    heightIn: "",
    startDate: todayStr,
    endDate: addWeeks(todayStr, 10),
  });

  const maintenanceNum = parseInt(stats.maintenanceCalories) || 0;
  const defaultMid: Record<PlanType, number> = {
    cut:   maintenanceNum - 600,
    bulk:  maintenanceNum + 250,
    recomp: maintenanceNum,
  };
  const [targetCals, setTargetCals] = useState(0);

  const defaultProtein: Record<PlanType, number> = { cut: 1.0, bulk: 0.8, recomp: 0.9 };
  const [proteinPerLb, setProteinPerLb] = useState(defaultProtein[planType]);
  const [fatPct, setFatPct] = useState(25);

  const bodyweightLbs = stats.weightUnit === "lbs"
    ? parseFloat(stats.currentWeight) || 150
    : (parseFloat(stats.currentWeight) || 68) * 2.20462;
  const goalWeightLbs = stats.goalWeight
    ? (stats.weightUnit === "lbs" ? parseFloat(stats.goalWeight) : parseFloat(stats.goalWeight) * 2.20462)
    : bodyweightLbs;
  const effectiveWeightForProtein = goalWeightLbs || bodyweightLbs;

  const effectiveTargetCals = targetCals || defaultMid[planType];
  const { proteinGrams, fatGrams, carbGrams } = calcMacros(effectiveTargetCals, proteinPerLb, fatPct, effectiveWeightForProtein);

  const saveMut = useMutation({
    mutationFn: (data: object) => apiRequest("POST", "/api/body-comp-plans", data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/body-comp-plans"] });
      toast({ title: "Plan saved!" });
      onSaved();
    },
    onError: () => toast({ title: "Failed to save plan", variant: "destructive" }),
  });

  function handleSave() {
    saveMut.mutate({
      planType,
      weightUnit: stats.weightUnit,
      currentWeight: parseFloat(stats.currentWeight) || null,
      goalWeight: parseFloat(stats.goalWeight) || null,
      currentBodyFat: parseFloat(stats.currentBodyFat) || null,
      goalBodyFat: parseFloat(stats.goalBodyFat) || null,
      activityLevel: stats.activityLevel,
      maintenanceCalories: maintenanceNum || 2000,
      targetCalories: effectiveTargetCals,
      proteinGrams,
      carbsGrams: Math.max(0, carbGrams),
      fatGrams,
      proteinPerLb,
      fatPct,
      startDate: stats.startDate,
      endDate: stats.endDate,
      isActive: true,
    });
  }

  function handleSelectType(t: PlanType) {
    setPlanType(t);
    setProteinPerLb(defaultProtein[t]);
    setTargetCals(0);
    // Auto-set end date based on plan type
    const weeks = t === "cut" ? 10 : t === "bulk" ? 16 : 12;
    setStats(s => ({ ...s, endDate: addWeeks(s.startDate, weeks) }));
    setStep(2);
  }

  const STEP_LABELS = ["Goal", "Your Stats", "Calorie Target", "Macros", "Summary"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-card border rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h2 className="font-semibold">Body Composition Plan</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Step {step} of 5 — {STEP_LABELS[step - 1]}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors"><X size={16} /></button>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-secondary">
          <div className="h-full bg-primary transition-all" style={{ width: `${(step / 5) * 100}%` }} />
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto p-5">
          {step === 1 && <Step1 onSelect={handleSelectType} />}
          {step === 2 && <Step2 planType={planType} stats={stats} onChange={setStats} />}
          {step === 3 && maintenanceNum > 0 && (
            <Step3
              planType={planType}
              maintenance={maintenanceNum}
              targetCals={effectiveTargetCals}
              onTargetChange={setTargetCals}
            />
          )}
          {step === 3 && maintenanceNum === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Scale size={32} className="mx-auto mb-3 opacity-20" />
              <p>Please enter your maintenance calories in Step 2 first.</p>
              <Button size="sm" variant="outline" className="mt-3" onClick={() => setStep(2)}>Go back to Stats</Button>
            </div>
          )}
          {step === 4 && (
            <Step4
              planType={planType}
              totalCals={effectiveTargetCals}
              bodyweightLbs={effectiveWeightForProtein}
              proteinPerLb={proteinPerLb}
              fatPct={fatPct}
              onProteinChange={setProteinPerLb}
              onFatChange={setFatPct}
            />
          )}
          {step === 5 && (
            <Step5
              planType={planType}
              targetCals={effectiveTargetCals}
              proteinGrams={proteinGrams}
              carbGrams={Math.max(0, carbGrams)}
              fatGrams={fatGrams}
              startDate={stats.startDate}
              endDate={stats.endDate}
              maintenance={maintenanceNum}
              currentWeight={parseFloat(stats.currentWeight) || 0}
              weightUnit={stats.weightUnit}
            />
          )}
        </div>

        {/* Footer nav */}
        {step > 1 && (
          <div className="px-5 py-4 border-t flex items-center justify-between gap-3">
            <Button variant="outline" size="sm" onClick={() => setStep(s => s - 1)} className="gap-1.5">
              <ChevronLeft size={14} /> Back
            </Button>
            {step < 5 ? (
              <Button size="sm" onClick={() => setStep(s => s + 1)} className="gap-1.5 flex-1 sm:flex-none sm:min-w-[120px]">
                Next <ChevronRight size={14} />
              </Button>
            ) : (
              <Button size="sm" onClick={handleSave} disabled={saveMut.isPending} className="gap-1.5 flex-1 sm:flex-none sm:min-w-[120px] bg-green-600 hover:bg-green-700 text-white">
                <CheckCircle2 size={14} /> Save Plan
              </Button>
            )}
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
      qc.invalidateQueries({ queryKey: ["/api/body-comp-plans", planId, "check-ins"] });
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
              <label className="text-xs font-medium text-muted-foreground">Body fat % <span className="text-muted-foreground/60">optional</span></label>
              <Input type="number" value={bodyFat} onChange={e => setBodyFat(e.target.value)} placeholder="18" className="h-9" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Notes</label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="How did the week feel? Energy levels, strength changes..." rows={3} className="resize-none" />
          </div>
          <Button className="w-full gap-1.5" onClick={() => saveMut.mutate({ date, weight: parseFloat(weight) || null, bodyFat: parseFloat(bodyFat) || null, notes: notes || null })} disabled={saveMut.isPending}>
            <CheckCircle2 size={14} /> Log Check-in
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Active Plan Card ──────────────────────────────────────────────────────────

function ActivePlanCard({ plan, onEdit, onEndEarly, onCheckIn }: {
  plan: BodyCompPlan;
  onEdit: () => void;
  onEndEarly: () => void;
  onCheckIn: () => void;
}) {
  const { data: checkIns = [] } = useQuery<BodyCompCheckIn[]>({
    queryKey: ["/api/body-comp-plans", plan.id, "check-ins"],
    queryFn: () => apiRequest("GET", `/api/body-comp-plans/${plan.id}/check-ins`).then(r => r.json()),
  });
  const qc = useQueryClient();
  const { toast } = useToast();

  const today = new Date();
  const start = new Date(plan.startDate);
  const end = new Date(plan.endDate);
  const totalWeeks = weeksFromDates(plan.startDate, plan.endDate);
  const weeksElapsed = Math.min(totalWeeks, Math.max(0, Math.floor((today.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000))));
  const weeksRemaining = Math.max(0, totalWeeks - weeksElapsed);
  const progressPct = Math.min(100, Math.round((weeksElapsed / totalWeeks) * 100));

  const badge = planTypeBadge(plan.planType as PlanType);

  const deleteCheckIn = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/body-comp-check-ins/${id}`).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/body-comp-plans", plan.id, "check-ins"] }); toast({ title: "Check-in removed" }); },
  });

  const latestCheckIn = checkIns[0];

  return (
    <div className="bg-card border-2 border-primary rounded-xl overflow-hidden shadow-sm shadow-primary/10">
      {/* Active banner */}
      <div className="bg-primary text-primary-foreground text-xs font-semibold px-4 py-1.5 flex items-center gap-1.5">
        <Target size={10} /> Active Plan — {weeksRemaining} week{weeksRemaining !== 1 ? "s" : ""} remaining
      </div>

      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badge.className}`}>{badge.label}</span>
              <span className="text-xs text-muted-foreground">{totalWeeks} weeks</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {new Date(plan.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })} →{" "}
              {new Date(plan.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"><MoreHorizontal size={14} /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}><Pencil size={13} className="mr-2" />Edit Plan</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onEndEarly}><X size={13} className="mr-2" />End Plan Early</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Daily targets */}
        <div className="grid grid-cols-4 gap-2 text-center">
          <div className="bg-secondary/30 rounded-lg py-2">
            <p className="text-sm font-bold text-primary">{plan.targetCalories.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground">kcal</p>
          </div>
          <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg py-2">
            <p className="text-sm font-bold text-blue-600 dark:text-blue-400">{plan.proteinGrams}g</p>
            <p className="text-[10px] text-muted-foreground">Protein</p>
          </div>
          <div className="bg-amber-50 dark:bg-amber-950/20 rounded-lg py-2">
            <p className="text-sm font-bold text-amber-600 dark:text-amber-400">{plan.carbsGrams}g</p>
            <p className="text-[10px] text-muted-foreground">Carbs</p>
          </div>
          <div className="bg-rose-50 dark:bg-rose-950/20 rounded-lg py-2">
            <p className="text-sm font-bold text-rose-600 dark:text-rose-400">{plan.fatGrams}g</p>
            <p className="text-[10px] text-muted-foreground">Fat</p>
          </div>
        </div>

        {/* Starting stats snapshot */}
        {(plan.currentWeight || plan.currentBodyFat) && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground border rounded-lg px-3 py-2">
            <Scale size={12} className="shrink-0" />
            <span>Start: {plan.currentWeight ? `${plan.currentWeight} ${plan.weightUnit}` : "—"}{plan.currentBodyFat ? ` · ${plan.currentBodyFat}% BF` : ""}</span>
            {plan.goalWeight && <span className="text-primary font-medium">→ Goal: {plan.goalWeight} {plan.weightUnit}</span>}
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
              {latestCheckIn.weight ? ` · ${latestCheckIn.weight} ${plan.weightUnit}` : ""}
              {latestCheckIn.bodyFat ? ` · ${latestCheckIn.bodyFat}% BF` : ""}
            </span>
          </div>
        )}

        {/* Check-in button */}
        <Button size="sm" className="w-full gap-1.5 bg-green-600 hover:bg-green-700 text-white" onClick={onCheckIn}>
          <ClipboardList size={13} /> Log a Check-in
        </Button>

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
                      {ci.weight ? `${ci.weight} ${plan.weightUnit}` : "—"}
                      {ci.bodyFat ? ` · ${ci.bodyFat}% BF` : ""}
                    </p>
                    {ci.notes && <p className="text-muted-foreground/70 italic mt-0.5 line-clamp-2">{ci.notes}</p>}
                  </div>
                  <button onClick={() => deleteCheckIn.mutate(ci.id)} className="text-muted-foreground/40 hover:text-destructive shrink-0">
                    <X size={12} />
                  </button>
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

function InactivePlanCard({ plan, onDelete }: { plan: BodyCompPlan; onDelete: () => void }) {
  const badge = planTypeBadge(plan.planType as PlanType);
  const totalWeeks = weeksFromDates(plan.startDate, plan.endDate);

  return (
    <div className="bg-card border rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badge.className}`}>{badge.label}</span>
            <span className="text-xs text-muted-foreground">{totalWeeks} weeks</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {new Date(plan.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })} →{" "}
            {new Date(plan.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"><MoreHorizontal size={14} /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}><Trash2 size={13} className="mr-2" />Delete Plan</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex gap-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{plan.targetCalories.toLocaleString()} kcal</span>
        <span>·</span>
        <span>{plan.proteinGrams}g P</span>
        <span>{plan.carbsGrams}g C</span>
        <span>{plan.fatGrams}g F</span>
      </div>
    </div>
  );
}

// ── Main Section ──────────────────────────────────────────────────────────────

export default function BodyCompositionPlanSection() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [checkInPlanId, setCheckInPlanId] = useState<number | null>(null);

  const { data: plans = [] } = useQuery<BodyCompPlan[]>({
    queryKey: ["/api/body-comp-plans"],
    queryFn: () => apiRequest("GET", "/api/body-comp-plans").then(r => r.json()),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/body-comp-plans/${id}`).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/body-comp-plans"] }); toast({ title: "Plan deleted" }); },
    onError: () => toast({ title: "Failed to delete plan", variant: "destructive" }),
  });

  const endEarlyMut = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/body-comp-plans/${id}`, { isActive: false }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/body-comp-plans"] }); toast({ title: "Plan ended" }); },
  });

  const activePlans = plans.filter(p => p.isActive);
  const inactivePlans = plans.filter(p => !p.isActive);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">Body Composition Plans</p>
          <p className="text-xs text-muted-foreground">Goal-setting & macro calculator for fat loss, muscle gain, or recomposition</p>
        </div>
        <Button size="sm" onClick={() => setWizardOpen(true)} className="gap-1.5 shrink-0">
          <Plus size={13} /> New Plan
        </Button>
      </div>

      {/* Active plans */}
      {activePlans.length > 0 && (
        <div className="space-y-3">
          {activePlans.map(plan => (
            <ActivePlanCard
              key={plan.id}
              plan={plan}
              onEdit={() => {}}
              onEndEarly={() => endEarlyMut.mutate(plan.id)}
              onCheckIn={() => setCheckInPlanId(plan.id)}
            />
          ))}
        </div>
      )}

      {/* Inactive / past plans */}
      {inactivePlans.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Past Plans</p>
          {inactivePlans.map(plan => (
            <InactivePlanCard
              key={plan.id}
              plan={plan}
              onDelete={() => deleteMut.mutate(plan.id)}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {plans.length === 0 && (
        <div className="border-2 border-dashed rounded-xl py-12 text-center space-y-3">
          <div className="flex justify-center gap-3 text-muted-foreground opacity-30">
            <Flame size={28} />
            <Dumbbell size={28} />
            <RefreshCw size={28} />
          </div>
          <div>
            <p className="font-medium text-sm">No body composition plans yet</p>
            <p className="text-xs text-muted-foreground mt-1">Create a plan to calculate your daily calorie and macro targets</p>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5 mt-2" onClick={() => setWizardOpen(true)}>
            <Plus size={13} /> Create Your First Plan
          </Button>
        </div>
      )}

      {/* Modals */}
      {wizardOpen && <PlanWizard onClose={() => setWizardOpen(false)} onSaved={() => setWizardOpen(false)} />}
      {checkInPlanId !== null && <CheckInModal planId={checkInPlanId} onClose={() => setCheckInPlanId(null)} />}
    </div>
  );
}
