import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { usePlanner, ALL_CATEGORIES, CATEGORY_PRESETS } from "@/state/PlannerContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ftInToCm, cmToFtIn, kgToLb, lbToKg, macrosFor, splitCalories, caloriesFromMacros } from "@/lib/planner/macros";
import type { Activity, DietStyle, Goal, Macros, Sex } from "@/lib/planner/types";
import { ArrowRight, ChevronLeft, Sparkles, Users, User, Share2, Plus, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

type Step = 1 | 2 | 3 | 4;

export default function Setup({ onClose }: { onClose?: () => void } = {}) {
  const [, navigate] = useLocation();
  const planner = usePlanner();
  const [step, setStep] = useState<Step>(1);
  const [useMetricHeight, setUseMetricHeight] = useState(false);
  const [useMetricWeight, setUseMetricWeight] = useState(false);
  const [pendingNav, setPendingNav] = useState(false);

  const stepLabels = ["Mode", "Stats", "Diet", "Categories"];

  // Navigate only after plan state is confirmed in context
  useEffect(() => {
    if (pendingNav && planner.plan) {
      setPendingNav(false);
      if (onClose) { onClose(); navigate("/meal-planner/plan"); }
      else navigate("/meal-planner/plan");
    }
  }, [planner.plan, pendingNav]);

  function next() {
    if (step < 4) setStep(((step + 1) as Step));
    else {
      planner.generate();
      setPendingNav(true);
    }
  }
  function prev() {
    if (step > 1) setStep(((step - 1) as Step));
    else if (onClose) onClose();
  }

  return (
    <div className="w-full flex flex-col h-full">
      <div className="mb-4 sm:mb-6 shrink-0">
        <h1 className="text-xl font-semibold tracking-tight">Build your plan</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Four quick steps. No account. No tracking. Just food that fits your day.
        </p>
      </div>
      <div className="mb-4 flex items-center gap-2 shrink-0">
        {stepLabels.map((label, i) => {
          const idx = (i + 1) as Step;
          const active = step === idx;
          const done = step > idx;
          return (
            <div key={label} className="flex items-center gap-2">
              <div
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-medium",
                  active && "border-primary bg-primary text-primary-foreground",
                  done && "border-primary/50 bg-primary/10 text-primary",
                  !active && !done && "border-border text-muted-foreground",
                )}
              >
                {idx}
              </div>
              <span className={cn("text-xs", active ? "text-foreground" : "text-muted-foreground")}>{label}</span>
              {i < stepLabels.length - 1 && <span className="mx-1 h-px w-6 bg-border" />}
            </div>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 pb-2">
        {step === 1 && <StepMode />}
        {step === 2 && (
          <StepStats
            useMetricHeight={useMetricHeight}
            setUseMetricHeight={setUseMetricHeight}
            useMetricWeight={useMetricWeight}
            setUseMetricWeight={setUseMetricWeight}
          />
        )}
        {step === 3 && <StepDiet />}
        {step === 4 && <StepCategories />}
      </div>

      <div className="mt-4 flex items-center justify-between shrink-0 pt-3 border-t">
        <Button variant="ghost" onClick={prev} disabled={step === 1} data-testid="button-back">
          <ChevronLeft className="mr-1 h-4 w-4" /> Back
        </Button>
        <Button onClick={next} data-testid="button-next">
          {step === 4 ? (
            <>
              <Sparkles className="mr-1.5 h-4 w-4" /> Generate plan
            </>
          ) : (
            <>
              Next <ArrowRight className="ml-1 h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function StepMode() {
  const { mode, setMode } = usePlanner();
  const opts: { value: any; label: string; desc: string; icon: any }[] = [
    { value: "personal", label: "Personal", desc: "One person. Macros calculated from your stats.", icon: User },
    { value: "family", label: "Family", desc: "Multiple adults + kids. Plans scale to your household.", icon: Users },
    { value: "shareable", label: "Shareable", desc: "Same as personal — designed to hand to a friend.", icon: Share2 },
  ];
  return (
    <Card className="rounded-2xl">
      <CardContent className="p-6">
        <h2 className="text-base font-semibold">Who are you planning for?</h2>
        <p className="mt-1 text-sm text-muted-foreground">Pick the mode that matches your kitchen.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {opts.map((o) => {
            const Icon = o.icon;
            const active = mode === o.value;
            return (
              <button
                key={o.value}
                onClick={() => setMode(o.value)}
                data-testid={`mode-${o.value}`}
                className={cn(
                  "rounded-xl border p-4 text-left transition hover:shadow-md",
                  active ? "border-primary bg-primary/5" : "border-border",
                )}
              >
                <Icon className={cn("h-5 w-5", active ? "text-primary" : "text-muted-foreground")} />
                <div className="mt-3 text-sm font-medium">{o.label}</div>
                <div className="mt-1 text-xs text-muted-foreground">{o.desc}</div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function StepStats(props: {
  useMetricHeight: boolean; setUseMetricHeight: (b: boolean) => void;
  useMetricWeight: boolean; setUseMetricWeight: (b: boolean) => void;
}) {
  const { mode } = usePlanner();
  if (mode === "family") return <FamilyStats {...props} />;
  return <PersonalStats {...props} />;
}

function PersonalStats({
  useMetricHeight, setUseMetricHeight, useMetricWeight, setUseMetricWeight,
}: { useMetricHeight: boolean; setUseMetricHeight: (b: boolean) => void; useMetricWeight: boolean; setUseMetricWeight: (b: boolean) => void; }) {
  const { stats, setStats, macros, setMacros } = usePlanner();
  return (
    <div className="space-y-6">
      <StatsEditor
        stats={stats}
        onChange={setStats}
        useMetricHeight={useMetricHeight}
        setUseMetricHeight={setUseMetricHeight}
        useMetricWeight={useMetricWeight}
        setUseMetricWeight={setUseMetricWeight}
      />
      <MacroOverride
        macros={macros}
        setMacros={setMacros}
        goal={stats.goal}
        recalculate={() => setMacros(macrosFor(stats))}
      />
    </div>
  );
}

function FamilyStats(_props: any) {
  const { adults, setAdults, kids, setKids, kidCalsEach, setKidCalsEach, familyDailyTarget } = usePlanner();
  function updateAdult(i: number, stats: any) {
    const next = adults.slice();
    next[i] = { ...next[i], stats, macros: macrosFor(stats) };
    setAdults(next);
  }
  function addAdult() {
    setAdults([...adults, { id: Math.random().toString(36).slice(2,8), stats: adults[0].stats, macros: macrosFor(adults[0].stats) }]);
  }
  function removeAdult(i: number) {
    if (adults.length <= 1) return;
    setAdults(adults.filter((_, j) => j !== i));
  }
  const total = familyDailyTarget();
  return (
    <div className="space-y-5">
      <Card className="rounded-2xl">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">Household</h2>
              <p className="mt-1 text-sm text-muted-foreground">Adults each get their own macros. Kids share a calorie target.</p>
            </div>
            <Button variant="outline" size="sm" onClick={addAdult} data-testid="button-add-adult">
              <Plus className="mr-1 h-3.5 w-3.5" /> Add adult
            </Button>
          </div>
          <div className="mt-5 space-y-5">
            {adults.map((a, i) => (
              <div key={a.id} className="rounded-xl border border-border bg-background/40 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-sm font-medium">Adult {i + 1}</div>
                  {adults.length > 1 && (
                    <Button variant="ghost" size="sm" onClick={() => removeAdult(i)} data-testid={`button-remove-adult-${i}`}>
                      <Minus className="mr-1 h-3.5 w-3.5" /> Remove
                    </Button>
                  )}
                </div>
                <StatsEditor
                  stats={a.stats}
                  onChange={(s) => updateAdult(i, s)}
                  useMetricHeight={false}
                  setUseMetricHeight={() => {}}
                  useMetricWeight={false}
                  setUseMetricWeight={() => {}}
                  compact
                />
                <div className="mt-3 text-xs text-muted-foreground">
                  Target · <span className="font-medium text-foreground">{a.macros.cal} cal</span>{" · "}
                  {a.macros.p}P {a.macros.c}C {a.macros.f}F
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card className="rounded-2xl">
        <CardContent className="p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold">Kids</h2>
              <p className="mt-1 text-sm text-muted-foreground">Approximate calories per kid per day.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => setKids(Math.max(0, kids - 1))} data-testid="button-kid-minus">
                <Minus className="h-4 w-4" />
              </Button>
              <div className="w-8 text-center tabular-nums text-base font-medium">{kids}</div>
              <Button variant="outline" size="icon" onClick={() => setKids(kids + 1)} data-testid="button-kid-plus">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {kids > 0 && (
            <div className="mt-5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Calories per kid · daily</Label>
                <span className="text-sm tabular-nums font-medium">{kidCalsEach}</span>
              </div>
              <Slider
                value={[kidCalsEach]}
                onValueChange={(v) => setKidCalsEach(v[0])}
                min={1000}
                max={2400}
                step={50}
                className="mt-2"
                data-testid="slider-kid-cal"
              />
            </div>
          )}
        </CardContent>
      </Card>
      <Card className="rounded-2xl border-primary/30 bg-primary/5">
        <CardContent className="p-6">
          <div className="text-xs uppercase tracking-wide text-primary">Household daily target</div>
          <div className="mt-2 text-base font-semibold tabular-nums">{total.cal} cal · {total.p}P · {total.c}C · {total.f}F</div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatsEditor({
  stats, onChange, useMetricHeight, setUseMetricHeight, useMetricWeight, setUseMetricWeight, compact,
}: {
  stats: any; onChange: (s: any) => void;
  useMetricHeight: boolean; setUseMetricHeight: (b: boolean) => void;
  useMetricWeight: boolean; setUseMetricWeight: (b: boolean) => void;
  compact?: boolean;
}) {
  const ftIn = cmToFtIn(stats.heightCm);
  const lb = kgToLb(stats.weightKg);

  return (
    <Card className={cn("rounded-2xl", compact && "border-0 shadow-none bg-transparent")}>
      <CardContent className={cn("p-6", compact && "p-0")}>
        {!compact && (
          <>
            <h2 className="text-base font-semibold">Your stats</h2>
            <p className="mt-1 text-sm text-muted-foreground">We use Mifflin-St Jeor + activity multiplier to estimate your daily energy.</p>
          </>
        )}
        <div className={cn("mt-5 grid gap-4", compact ? "sm:grid-cols-2" : "sm:grid-cols-2")}>
          <div>
            <Label className="text-xs">Sex</Label>
            <RadioGroup
              value={stats.sex}
              onValueChange={(v) => onChange({ ...stats, sex: v as Sex })}
              className="mt-1.5 grid grid-cols-2 gap-2"
            >
              {[
                { v: "male", l: "Male" },
                { v: "female", l: "Female" },
              ].map((o) => (
                <Label
                  key={o.v}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:shadow-sm",
                    stats.sex === o.v && "border-primary bg-primary/5",
                  )}
                >
                  <RadioGroupItem value={o.v} />
                  {o.l}
                </Label>
              ))}
            </RadioGroup>
          </div>
          <div>
            <Label className="text-xs" htmlFor="age">Age</Label>
            <Input
              id="age" type="number" min={14} max={100}
              value={stats.age}
              onChange={(e) => onChange({ ...stats, age: parseInt(e.target.value || "0") })}
              data-testid="input-age"
              className="mt-1.5"
            />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Height</Label>
              <button type="button" className="text-[11px] text-muted-foreground hover:text-foreground" onClick={() => setUseMetricHeight(!useMetricHeight)}>
                {useMetricHeight ? "Switch to ft/in" : "Switch to cm"}
              </button>
            </div>
            {useMetricHeight ? (
              <Input
                type="number" min={100} max={250}
                value={stats.heightCm}
                onChange={(e) => onChange({ ...stats, heightCm: parseInt(e.target.value || "0") })}
                className="mt-1.5"
                data-testid="input-height-cm"
              />
            ) : (
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                <Input
                  type="number" min={3} max={8} value={ftIn.ft}
                  onChange={(e) => onChange({ ...stats, heightCm: ftInToCm(parseInt(e.target.value || "0"), ftIn.inch) })}
                  placeholder="ft"
                  data-testid="input-height-ft"
                />
                <Input
                  type="number" min={0} max={11} value={ftIn.inch}
                  onChange={(e) => onChange({ ...stats, heightCm: ftInToCm(ftIn.ft, parseInt(e.target.value || "0")) })}
                  placeholder="in"
                  data-testid="input-height-in"
                />
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Weight</Label>
              <button type="button" className="text-[11px] text-muted-foreground hover:text-foreground" onClick={() => setUseMetricWeight(!useMetricWeight)}>
                {useMetricWeight ? "Switch to lb" : "Switch to kg"}
              </button>
            </div>
            {useMetricWeight ? (
              <Input
                type="number" min={30} max={250} step={0.1}
                value={stats.weightKg}
                onChange={(e) => onChange({ ...stats, weightKg: parseFloat(e.target.value || "0") })}
                className="mt-1.5"
                data-testid="input-weight-kg"
              />
            ) : (
              <Input
                type="number" min={60} max={500}
                value={lb}
                onChange={(e) => onChange({ ...stats, weightKg: lbToKg(parseFloat(e.target.value || "0")) })}
                className="mt-1.5"
                data-testid="input-weight-lb"
              />
            )}
          </div>
          <div>
            <Label className="text-xs">Activity</Label>
            <Select value={stats.activity} onValueChange={(v) => onChange({ ...stats, activity: v as Activity })}>
              <SelectTrigger data-testid="select-activity" className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sedentary">Sedentary — desk job, no exercise</SelectItem>
                <SelectItem value="light">Light — light exercise 1-3x/wk</SelectItem>
                <SelectItem value="moderate">Moderate — exercise 3-5x/wk</SelectItem>
                <SelectItem value="very">Very active — hard exercise 6-7x/wk</SelectItem>
                <SelectItem value="athlete">Athlete — twice daily training</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Goal</Label>
            <Select value={stats.goal} onValueChange={(v) => onChange({ ...stats, goal: v as Goal })}>
              <SelectTrigger data-testid="select-goal" className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cut">Cut — lose fat (−20%)</SelectItem>
                <SelectItem value="maintain">Maintain</SelectItem>
                <SelectItem value="bulk">Lean bulk (+10%)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MacroOverride({ macros, setMacros, goal, recalculate }: { macros: Macros; setMacros: (m: Macros) => void; goal: Goal; recalculate: () => void; }) {
  function onCal(v: number) {
    setMacros(splitCalories(v, goal));
  }
  function onMacro(k: "p" | "c" | "f", v: number) {
    const next = { ...macros, [k]: v };
    next.cal = caloriesFromMacros({ p: next.p, c: next.c, f: next.f });
    setMacros(next);
  }
  return (
    <Card className="rounded-2xl border-primary/30 bg-primary/5">
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">Your daily target</h2>
            <p className="mt-1 text-sm text-muted-foreground">Auto-calculated. Override any field — edit calories and we'll re-split macros.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={recalculate} data-testid="button-recalc">
            Recalculate
          </Button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <NumberField label="Calories" value={macros.cal} onChange={onCal} testid="input-cal" />
          <NumberField label="Protein g" value={macros.p} onChange={(v) => onMacro("p", v)} testid="input-protein" />
          <NumberField label="Carbs g" value={macros.c} onChange={(v) => onMacro("c", v)} testid="input-carbs" />
          <NumberField label="Fat g" value={macros.f} onChange={(v) => onMacro("f", v)} testid="input-fat" />
        </div>
      </CardContent>
    </Card>
  );
}

function NumberField({ label, value, onChange, testid }: { label: string; value: number; onChange: (n: number) => void; testid: string }) {
  return (
    <div>
      <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</Label>
      <Input
        type="number"
        value={value}
        onChange={(e) => onChange(Math.max(0, parseInt(e.target.value || "0")))}
        className="mt-1.5 text-base font-semibold tabular-nums"
        data-testid={testid}
      />
    </div>
  );
}

function StepDiet() {
  const { prefs, setPrefs } = usePlanner();
  const diets: { v: DietStyle; l: string }[] = [
    { v: "vegan", l: "Vegan" },
    { v: "vegetarian", l: "Vegetarian" },
    { v: "keto", l: "Keto" },
    { v: "whole30", l: "Whole30" },
    { v: "mediterranean", l: "Mediterranean" },
    { v: "gluten-free", l: "Gluten-Free" },
    { v: "dairy-free", l: "Dairy-Free" },
  ];
  function toggle(d: DietStyle) {
    setPrefs({ ...prefs, diets: prefs.diets.includes(d) ? prefs.diets.filter((x) => x !== d) : [...prefs.diets, d] });
  }
  function setExclusions(text: string) {
    const list = text.split(/[,\n]/).map((s) => s.trim().toLowerCase()).filter(Boolean);
    setPrefs({ ...prefs, exclusions: list });
  }
  return (
    <Card className="rounded-2xl">
      <CardContent className="p-6">
        <h2 className="text-base font-semibold">Diet & exclusions</h2>
        <p className="mt-1 text-sm text-muted-foreground">Optional. Pick none for full variety.</p>
        <div className="mt-5">
          <Label className="text-xs">Dietary style</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {diets.map((d) => {
              const active = prefs.diets.includes(d.v);
              return (
                <button
                  key={d.v}
                  onClick={() => toggle(d.v)}
                  data-testid={`diet-${d.v}`}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm hover:shadow-sm",
                    active ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground",
                  )}
                >
                  {d.l}
                </button>
              );
            })}
          </div>
        </div>
        <div className="mt-6">
          <Label className="text-xs" htmlFor="exclusions">Ingredients to avoid</Label>
          <Input
            id="exclusions"
            placeholder="e.g. mushrooms, cilantro, peanuts"
            defaultValue={prefs.exclusions.join(", ")}
            onBlur={(e) => setExclusions(e.target.value)}
            className="mt-1.5"
            data-testid="input-exclusions"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">Comma-separated. We drop any recipe whose ingredients mention these words.</p>
        </div>
        <div className="mt-6">
          <Label className="text-xs">Meals per day</Label>
          <RadioGroup
            value={String(prefs.mealsPerDay)}
            onValueChange={(v) => setPrefs({ ...prefs, mealsPerDay: parseInt(v) as 3 | 4 })}
            className="mt-2 grid grid-cols-2 gap-2"
          >
            {[3, 4].map((n) => (
              <Label
                key={n}
                className={cn(
                  "flex cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm hover:shadow-sm",
                  prefs.mealsPerDay === n && "border-primary bg-primary/5",
                )}
              >
                <RadioGroupItem value={String(n)} />
                {n === 3 ? "3 meals" : "3 + snack"}
              </Label>
            ))}
          </RadioGroup>
        </div>
        <div className="mt-6">
          <Label className="text-xs">Plan length</Label>
          <RadioGroup
            value={String(prefs.planLength)}
            onValueChange={(v) => setPrefs({ ...prefs, planLength: parseInt(v) as 1 | 7 })}
            className="mt-2 grid grid-cols-2 gap-2"
          >
            {[1, 7].map((n) => (
              <Label
                key={n}
                className={cn(
                  "flex cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm hover:shadow-sm",
                  prefs.planLength === n && "border-primary bg-primary/5",
                )}
              >
                <RadioGroupItem value={String(n)} />
                {n === 1 ? "1 day" : "7 days"}
              </Label>
            ))}
          </RadioGroup>
        </div>
      </CardContent>
    </Card>
  );
}

function StepCategories() {
  const { prefs, setPrefs } = usePlanner();
  function toggle(c: string) {
    const list = prefs.categories.includes(c)
      ? prefs.categories.filter((x) => x !== c)
      : [...prefs.categories, c];
    setPrefs({ ...prefs, categories: list });
  }
  function applyPreset(name: string) {
    setPrefs({ ...prefs, categories: CATEGORY_PRESETS[name] });
  }
  function clearAll() {
    setPrefs({ ...prefs, categories: [] });
  }
  return (
    <Card className="rounded-2xl">
      <CardContent className="p-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">Categories</h2>
            <p className="mt-1 text-sm text-muted-foreground">Leave empty for any. Or pick a preset below.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={clearAll} data-testid="button-clear-cats">Any</Button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {Object.keys(CATEGORY_PRESETS).map((n) => (
            <button
              key={n}
              onClick={() => applyPreset(n)}
              className="rounded-full border border-border bg-accent/30 px-3 py-1.5 text-xs font-medium hover:shadow-sm"
              data-testid={`preset-${n.toLowerCase().replace(/\s+/g, "-")}`}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
          {ALL_CATEGORIES.map((c) => {
            const active = prefs.categories.includes(c);
            return (
              <label
                key={c}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/20",
                  active && "bg-primary/5",
                )}
              >
                <Checkbox checked={active} onCheckedChange={() => toggle(c)} data-testid={`cat-${c}`} />
                <span>{c}</span>
              </label>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
