import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format, parseISO } from "date-fns";
import { useLocation } from "wouter";
import {
  Plus, Dumbbell, Flame, Star, Pencil, Trash2, MoreHorizontal,
  LayoutTemplate, ClipboardList, Zap, Package, Search, Loader2,
  Sparkles, ChevronRight, CheckCircle2, X, Info, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { workoutStreak, weeklyWorkoutStats, getRecentPRs, WORKOUT_TYPE_LABELS, WORKOUT_TYPES } from "@/lib/plannerUtils";
import WorkoutLogModal from "@/components/modals/WorkoutLogModal";
import WorkoutTemplateModal from "@/components/modals/WorkoutTemplateModal";
import type { WorkoutLog, WorkoutTemplate, Equipment, GoalWithProjects } from "@shared/schema";

// ── Constants ─────────────────────────────────────────────────────────────────

const EQUIPMENT_CATEGORIES = [
  { value: "barbell",        label: "Barbell & Plates",    color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" },
  { value: "dumbbell",       label: "Dumbbells",           color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  { value: "kettlebell",     label: "Kettlebells",         color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" },
  { value: "cable",          label: "Cable Machine",       color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300" },
  { value: "machine",        label: "Weight Machine",      color: "bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300" },
  { value: "pullup_bar",     label: "Pull-up Bar",         color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
  { value: "bench",          label: "Bench / Box",         color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300" },
  { value: "resistance_band",label: "Resistance Bands",    color: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300" },
  { value: "cardio",         label: "Cardio Machine",      color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
  { value: "bodyweight",     label: "Bodyweight / Rings",  color: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300" },
  { value: "other",          label: "Other",               color: "bg-secondary text-muted-foreground" },
];

const EXERCISE_EQUIPMENT_MAP: Record<string, string> = {
  barbell: "barbell", dumbbell: "dumbbell", kettlebell: "kettle bells",
  cable: "cable", machine: "machine", resistance_band: "bands",
  bodyweight: "body only",
};

const MUSCLE_GROUPS = [
  "abdominals", "chest", "shoulders", "biceps", "triceps", "forearms",
  "lats", "middle back", "lower back", "traps",
  "quads", "hamstrings", "glutes", "calves", "adductors", "abductors",
];

const EXERCISE_CATEGORIES = ["strength", "cardio", "stretching", "plyometrics", "powerlifting", "olympic weightlifting"];

// ── Exercise Search Modal ─────────────────────────────────────────────────────

type ExerciseResult = {
  id: string; name: string; equipment: string; primaryMuscles: string[];
  secondaryMuscles: string[]; category: string; level: string;
  force: string; mechanic: string; image: string | null; instructions: string[];
};

function ExerciseSearchModal({ open, onClose, templates }: {
  open: boolean; onClose: () => void; templates: WorkoutTemplate[];
}) {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [draftQuery, setDraftQuery] = useState("");
  const [equipFilter, setEquipFilter] = useState("all");
  const [muscleFilter, setMuscleFilter] = useState("all");
  const [catFilter, setCatFilter] = useState("all");
  const [results, setResults] = useState<ExerciseResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<ExerciseResult | null>(null);
  const [addToTemplateId, setAddToTemplateId] = useState<string>("__none__");
  const [adding, setAdding] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery(""); setDraftQuery(""); setResults([]); setSelected(null);
      setEquipFilter("all"); setMuscleFilter("all"); setCatFilter("all");
    }
  }, [open]);

  async function doSearch(q = draftQuery, eq2 = equipFilter, mf = muscleFilter, cf = catFilter) {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (eq2 !== "all") params.set("equipment", EXERCISE_EQUIPMENT_MAP[eq2] ?? eq2);
    if (mf !== "all") params.set("muscle", mf);
    if (cf !== "all") params.set("category", cf);
    if (!params.toString()) return;
    setLoading(true); setResults([]); setSelected(null); setQuery(q);
    try {
      const res = await apiRequest("GET", `/api/exercises/search?${params.toString()}`);
      const data: ExerciseResult[] = await res.json();
      setResults(data);
      if (data.length > 0) setSelected(data[0]);
    } catch { /* ignore */ } finally { setLoading(false); }
  }

  async function handleAddToTemplate() {
    if (!selected || addToTemplateId === "__none__") return;
    setAdding(true);
    try {
      const exercise = {
        name: selected.name,
        type: "Lifting",
        sets: [{ reps: 10, weight: 0 }, { reps: 10, weight: 0 }, { reps: 10, weight: 0 }],
        restSeconds: 90,
        notes: selected.instructions[0]?.slice(0, 80) ?? "",
      };
      await apiRequest("POST", `/api/workout-templates/${addToTemplateId}/add-exercise`, exercise);
      queryClient.invalidateQueries({ queryKey: ["/api/workout-templates"] });
      const t = templates.find(t => t.id === +addToTemplateId);
      toast({ title: `Added to "${t?.name}"` });
    } catch { toast({ title: "Failed to add exercise", variant: "destructive" }); }
    finally { setAdding(false); }
  }

  const muscleTag = (m: string) => (
    <span key={m} className="text-xs bg-secondary px-1.5 py-0.5 rounded-full capitalize">{m}</span>
  );

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[88vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Search size={16} /> Exercise Library
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">800+ exercises — search by name, muscle, or equipment</p>
        </DialogHeader>

        {/* Search bar + filters */}
        <div className="px-4 py-3 border-b bg-muted/30 shrink-0 space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={inputRef}
                value={draftQuery}
                onChange={e => setDraftQuery(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") doSearch(); }}
                placeholder="Search exercises… (e.g. squat, bicep curl)"
                className="pl-8 h-8 text-sm"
              />
            </div>
            <Button size="sm" onClick={() => doSearch()} disabled={loading} className="h-8">
              {loading ? <Loader2 size={13} className="animate-spin" /> : "Search"}
            </Button>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Select value={equipFilter} onValueChange={v => { setEquipFilter(v); doSearch(draftQuery, v, muscleFilter, catFilter); }}>
              <SelectTrigger className="h-7 text-xs w-40"><SelectValue placeholder="Equipment" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All equipment</SelectItem>
                {EQUIPMENT_CATEGORIES.filter(c => EXERCISE_EQUIPMENT_MAP[c.value]).map(c => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
                <SelectItem value="bodyweight">Body only</SelectItem>
              </SelectContent>
            </Select>
            <Select value={muscleFilter} onValueChange={v => { setMuscleFilter(v); doSearch(draftQuery, equipFilter, v, catFilter); }}>
              <SelectTrigger className="h-7 text-xs w-40"><SelectValue placeholder="Muscle group" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All muscles</SelectItem>
                {MUSCLE_GROUPS.map(m => <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={catFilter} onValueChange={v => { setCatFilter(v); doSearch(draftQuery, equipFilter, muscleFilter, v); }}>
              <SelectTrigger className="h-7 text-xs w-36"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {EXERCISE_CATEGORIES.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
              </SelectContent>
            </Select>
            {(equipFilter !== "all" || muscleFilter !== "all" || catFilter !== "all" || draftQuery) && (
              <button onClick={() => { setEquipFilter("all"); setMuscleFilter("all"); setCatFilter("all"); setDraftQuery(""); setResults([]); setSelected(null); }}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                <X size={12} /> Clear
              </button>
            )}
          </div>
        </div>

        {/* Two-panel results */}
        <div className="flex flex-1 min-h-0">
          {/* Results list */}
          <div className="w-64 shrink-0 border-r overflow-y-auto">
            {loading && (
              <div className="flex items-center justify-center h-20 text-muted-foreground"><Loader2 size={18} className="animate-spin" /></div>
            )}
            {!loading && results.length === 0 && (
              <div className="text-center py-10 px-4 text-muted-foreground">
                <Dumbbell size={28} className="mx-auto mb-2 opacity-20" />
                <p className="text-xs">Search or filter to browse exercises</p>
              </div>
            )}
            {results.map(r => (
              <button key={r.id} onClick={() => setSelected(r)}
                className={`w-full text-left p-3 border-b transition-colors flex gap-2.5 items-start ${selected?.id === r.id ? "bg-secondary" : "hover:bg-secondary/50"}`}>
                {r.image && (
                  <img src={r.image} alt={r.name} className="w-10 h-10 rounded object-cover shrink-0 bg-muted" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium leading-snug line-clamp-2">{r.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 capitalize">{r.equipment}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {r.primaryMuscles.slice(0, 2).map(m => (
                      <span key={m} className="text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1.5 rounded-full capitalize">{m}</span>
                    ))}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Preview panel */}
          <div className="flex-1 overflow-y-auto p-4 min-w-0">
            {selected ? (
              <div className="space-y-4">
                <div className="flex gap-4">
                  {selected.image && (
                    <img src={selected.image} alt={selected.name} className="w-28 h-28 rounded-lg object-cover bg-muted shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-base leading-tight">{selected.name}</h3>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <Badge variant="secondary" className="capitalize text-xs">{selected.equipment}</Badge>
                      <Badge variant="outline" className="capitalize text-xs">{selected.level}</Badge>
                      {selected.force && <Badge variant="outline" className="capitalize text-xs">{selected.force}</Badge>}
                      {selected.mechanic && <Badge variant="outline" className="capitalize text-xs">{selected.mechanic}</Badge>}
                    </div>
                  </div>
                </div>

                {selected.primaryMuscles.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Primary Muscles</p>
                    <div className="flex flex-wrap gap-1">{selected.primaryMuscles.map(muscleTag)}</div>
                  </div>
                )}
                {selected.secondaryMuscles.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Secondary Muscles</p>
                    <div className="flex flex-wrap gap-1">{selected.secondaryMuscles.map(muscleTag)}</div>
                  </div>
                )}
                {selected.instructions.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Instructions</p>
                    <ol className="space-y-1.5 list-none">
                      {selected.instructions.map((step, i) => (
                        <li key={i} className="flex gap-2 text-xs text-muted-foreground">
                          <span className="w-5 h-5 rounded-full bg-secondary text-foreground flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">{i + 1}</span>
                          <span className="leading-relaxed">{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {/* Add to template */}
                <div className="border rounded-xl p-3 bg-muted/30 space-y-2">
                  <p className="text-xs font-semibold">Add to a workout template</p>
                  <div className="flex gap-2">
                    <Select value={addToTemplateId} onValueChange={setAddToTemplateId}>
                      <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="Select template…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Select a template…</SelectItem>
                        {templates.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button size="sm" className="h-8 gap-1" disabled={addToTemplateId === "__none__" || adding} onClick={handleAddToTemplate}>
                      {adding ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Add
                    </Button>
                  </div>
                  {templates.length === 0 && (
                    <p className="text-xs text-muted-foreground">Create a template first to add exercises to it.</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center">
                  <ChevronRight size={24} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Select an exercise to see details</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Generate Workout Plan Modal ────────────────────────────────────────────────

type GeneratedDay = {
  dayLabel: string; name: string; workoutType: string;
  durationEstimate: string; exercises: any[];
};
type GeneratedPlan = {
  planName: string; description: string; days: GeneratedDay[];
};

function GenerateWorkoutPlanModal({ open, onClose, userEquipment, goals }: {
  open: boolean; onClose: () => void;
  userEquipment: Equipment[]; goals: GoalWithProjects[];
}) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selectedEquip, setSelectedEquip] = useState<string[]>([]);
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [daysPerWeek, setDaysPerWeek] = useState("3");
  const [focus, setFocus] = useState("general fitness");
  const [level, setLevel] = useState("intermediate");
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [generating, setGenerating] = useState(false);
  const [plan, setPlan] = useState<GeneratedPlan | null>(null);
  const [savingDay, setSavingDay] = useState<number | null>(null);
  const [savedDays, setSavedDays] = useState<Set<number>>(new Set());
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);

  useEffect(() => {
    if (open) {
      // Pre-select all user equipment
      setSelectedEquip(userEquipment.map(e => e.name));
      setPlan(null); setSavedDays(new Set());
      // Check if API key is set
      apiRequest("GET", "/api/user/api-key/status").then(r => r.json()).then((d: any) => setHasApiKey(!!d.hasKey));
    }
  }, [open, userEquipment]);

  async function handleGenerate() {
    setGenerating(true); setPlan(null);
    try {
      const res = await apiRequest("POST", "/api/workout/generate", {
        equipmentList: selectedEquip,
        goalsList: selectedGoals,
        daysPerWeek: parseInt(daysPerWeek),
        focus, level, additionalNotes,
      });
      if (!res.ok) {
        const err = await res.json() as any;
        if (err.error === "no_api_key") {
          toast({ title: "Anthropic API key required", description: "Add your API key in Settings to use AI features.", variant: "destructive" });
        } else {
          toast({ title: "Generation failed", description: err.message ?? "Try again", variant: "destructive" });
        }
        return;
      }
      const data: GeneratedPlan = await res.json();
      setPlan(data);
    } catch {
      toast({ title: "Generation failed", description: "Check your API key and try again.", variant: "destructive" });
    } finally { setGenerating(false); }
  }

  async function saveDay(day: GeneratedDay, index: number) {
    setSavingDay(index);
    try {
      // Convert AI exercises to our template format
      const exercises = day.exercises.map((ex: any) => {
        if (ex.distance || ex.duration && !ex.sets) {
          // Cardio / duration-only
          return { name: ex.name, type: ex.type ?? "Run", sets: [], distance: ex.distance ?? "", duration: ex.duration ?? "", restSeconds: 0, notes: ex.notes ?? "" };
        }
        return { name: ex.name, type: ex.type ?? "Lifting", sets: ex.sets ?? [{ reps: 10, weight: 0 }], restSeconds: ex.restSeconds ?? 90, notes: ex.notes ?? "" };
      });
      await apiRequest("POST", "/api/workout-templates", {
        name: day.name,
        workoutType: day.workoutType ?? "custom",
        scheduledDay: null,
        recurring: "none",
        notes: `Generated plan: ${plan?.planName}. Est. duration: ${day.durationEstimate}`,
        linkedGoalId: null,
        exercisesJson: JSON.stringify(exercises),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/workout-templates"] });
      setSavedDays(s => new Set([...s, index]));
      toast({ title: `"${day.name}" saved as template` });
    } catch {
      toast({ title: "Failed to save template", variant: "destructive" });
    } finally { setSavingDay(null); }
  }

  async function saveAllDays() {
    if (!plan) return;
    for (let i = 0; i < plan.days.length; i++) {
      if (!savedDays.has(i)) await saveDay(plan.days[i], i);
    }
  }

  const fitnessGoals = goals.filter(g => g.category === "fitness" || g.category === "health");

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles size={16} className="text-purple-500" /> Generate Workout Plan
          </DialogTitle>
        </DialogHeader>

        {hasApiKey === false && (
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm text-amber-800 dark:text-amber-300 flex gap-2 items-start">
            <Info size={14} className="shrink-0 mt-0.5" />
            <span>
              AI plan generation requires an Anthropic API key.{" "}
              <button className="underline font-medium" onClick={() => { onClose(); setLocation("/settings"); }}>Add it in Settings</button>.
            </span>
          </div>
        )}

        {!plan ? (
          <div className="space-y-5 pt-1">
            {/* Equipment selection */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Available Equipment</p>
              <p className="text-xs text-muted-foreground">Select what you'll be training with</p>
              {userEquipment.length === 0 ? (
                <p className="text-xs text-muted-foreground border rounded-lg p-3 bg-muted/30">
                  No equipment saved yet. Add equipment in the Equipment tab, or type custom equipment below.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {userEquipment.map(e => {
                    const active = selectedEquip.includes(e.name);
                    const cat = EQUIPMENT_CATEGORIES.find(c => c.value === e.category);
                    return (
                      <button key={e.id}
                        onClick={() => setSelectedEquip(p => active ? p.filter(n => n !== e.name) : [...p, e.name])}
                        className={`px-3 py-1.5 rounded-lg text-sm border transition-all flex items-center gap-1.5 ${active ? "border-primary bg-primary/10 text-primary" : "border-transparent bg-secondary text-muted-foreground hover:text-foreground"}`}>
                        {active && <CheckCircle2 size={12} />}
                        {e.name}
                        {cat && <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${cat.color}`}>{cat.label}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
              <Input
                value={selectedEquip.filter(e => !userEquipment.map(u => u.name).includes(e)).join(", ")}
                onChange={e => {
                  const custom = e.target.value.split(",").map(s => s.trim()).filter(Boolean);
                  const saved = userEquipment.map(u => u.name).filter(n => selectedEquip.includes(n));
                  setSelectedEquip([...saved, ...custom]);
                }}
                placeholder="Add custom equipment (comma-separated)…"
                className="h-8 text-sm"
              />
            </div>

            {/* Goals */}
            {fitnessGoals.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Fitness Goals <span className="text-muted-foreground font-normal text-xs">(optional)</span></p>
                <div className="flex flex-wrap gap-2">
                  {fitnessGoals.map(g => {
                    const active = selectedGoals.includes(g.title);
                    return (
                      <button key={g.id}
                        onClick={() => setSelectedGoals(p => active ? p.filter(t => t !== g.title) : [...p, g.title])}
                        className={`px-3 py-1.5 rounded-lg text-sm border transition-all flex items-center gap-1.5 ${active ? "border-primary bg-primary/10 text-primary" : "border-transparent bg-secondary text-muted-foreground hover:text-foreground"}`}>
                        {active && <CheckCircle2 size={12} />}
                        {g.title}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Preferences */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Days / Week</label>
                <Select value={daysPerWeek} onValueChange={setDaysPerWeek}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["2", "3", "4", "5", "6"].map(d => <SelectItem key={d} value={d}>{d} days</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Focus</label>
                <Select value={focus} onValueChange={setFocus}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["general fitness", "strength", "hypertrophy", "endurance", "weight loss", "mobility", "athletic"].map(f => (
                      <SelectItem key={f} value={f} className="capitalize">{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Level</label>
                <Select value={level} onValueChange={setLevel}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">Beginner</SelectItem>
                    <SelectItem value="intermediate">Intermediate</SelectItem>
                    <SelectItem value="advanced">Advanced</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Additional notes <span className="font-normal">(optional)</span></label>
              <Textarea
                value={additionalNotes}
                onChange={e => setAdditionalNotes(e.target.value)}
                rows={2}
                placeholder="e.g. bad knees, prefer compound movements, short on time…"
              />
            </div>

            <Button onClick={handleGenerate} disabled={generating || hasApiKey === false} className="w-full gap-2">
              {generating ? <><Loader2 size={14} className="animate-spin" /> Generating your plan…</> : <><Sparkles size={14} /> Generate Plan</>}
            </Button>
          </div>
        ) : (
          <div className="space-y-4 pt-1">
            {/* Plan overview */}
            <div className="bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950/20 dark:to-blue-950/20 border border-purple-200/50 dark:border-purple-800/50 rounded-xl p-4">
              <h3 className="font-semibold text-base">{plan.planName}</h3>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{plan.description}</p>
            </div>

            {/* Days */}
            <div className="space-y-3">
              {plan.days.map((day, i) => (
                <div key={i} className="border rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 bg-secondary/30 border-b">
                    <div>
                      <p className="font-semibold text-sm">{day.name}</p>
                      <p className="text-xs text-muted-foreground">{day.dayLabel} · {day.durationEstimate}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs bg-secondary px-2 py-0.5 rounded capitalize">{WORKOUT_TYPE_LABELS[day.workoutType] ?? day.workoutType}</span>
                      {savedDays.has(i) ? (
                        <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
                          <CheckCircle2 size={13} /> Saved
                        </span>
                      ) : (
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                          disabled={savingDay === i}
                          onClick={() => saveDay(day, i)}>
                          {savingDay === i ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                          Save as Template
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="p-3 space-y-1.5">
                    {day.exercises.map((ex: any, j: number) => (
                      <div key={j} className="flex items-start gap-2.5 text-xs py-1.5 border-b last:border-0">
                        <span className="w-5 h-5 rounded-full bg-secondary flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">{j + 1}</span>
                        <div className="flex-1 min-w-0">
                          <span className="font-medium">{ex.name}</span>
                          <span className="text-muted-foreground ml-2">
                            {ex.sets ? `${ex.sets.length} sets × ${ex.sets[0]?.reps} reps` : ""}
                            {ex.distance ? ex.distance : ""}
                            {ex.duration ? ` · ${ex.duration}` : ""}
                            {ex.restSeconds ? ` · ${ex.restSeconds}s rest` : ""}
                          </span>
                          {ex.notes && <p className="text-muted-foreground italic mt-0.5">{ex.notes}</p>}
                        </div>
                        <Badge variant="outline" className="text-[10px] py-0 shrink-0">{ex.type}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button className="flex-1 gap-1.5" onClick={saveAllDays}
                disabled={savedDays.size === plan.days.length}>
                {savedDays.size === plan.days.length ? <><CheckCircle2 size={14} /> All Saved!</> : <><Plus size={14} /> Save All as Templates</>}
              </Button>
              <Button variant="outline" onClick={() => setPlan(null)}>
                Regenerate
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Equipment Add/Edit Modal ───────────────────────────────────────────────────

function EquipmentModal({ open, onClose, editing }: {
  open: boolean; onClose: () => void; editing: Equipment | null;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("other");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? "");
      setCategory(editing?.category ?? "other");
      setNotes(editing?.notes ?? "");
    }
  }, [open, editing]);

  const createMut = useMutation({
    mutationFn: (d: any) => apiRequest("POST", "/api/equipment", d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/equipment"] }); onClose(); },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });
  const updateMut = useMutation({
    mutationFn: (d: any) => apiRequest("PATCH", `/api/equipment/${editing?.id}`, d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/equipment"] }); onClose(); },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  function handleSave() {
    if (!name.trim()) return;
    const payload = { name: name.trim(), category, notes: notes.trim() || null };
    editing ? updateMut.mutate(payload) : createMut.mutate(payload);
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Equipment" : "Add Equipment"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Name *</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. 45lb Barbell, 25lb Kettlebell" autoFocus />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Category</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EQUIPMENT_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Notes <span className="font-normal">(optional)</span></label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. adjustable, 5–50 lb" />
          </div>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={handleSave} disabled={!name.trim() || createMut.isPending || updateMut.isPending}>
              {editing ? "Save Changes" : "Add Equipment"}
            </Button>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function WorkoutsPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<"logs" | "templates" | "equipment">("logs");
  const [logModal, setLogModal] = useState(false);
  const [templateModal, setTemplateModal] = useState(false);
  const [editLog, setEditLog] = useState<WorkoutLog | null>(null);
  const [editTemplate, setEditTemplate] = useState<WorkoutTemplate | null>(null);
  const [exerciseSearchOpen, setExerciseSearchOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [equipmentModal, setEquipmentModal] = useState(false);
  const [editEquipment, setEditEquipment] = useState<Equipment | null>(null);

  const { data: logs = [] } = useQuery<WorkoutLog[]>({ queryKey: ["/api/workout-logs"] });
  const { data: templates = [] } = useQuery<WorkoutTemplate[]>({ queryKey: ["/api/workout-templates"] });
  const { data: equipmentList = [] } = useQuery<Equipment[]>({ queryKey: ["/api/equipment"] });
  const { data: goals = [] } = useQuery<GoalWithProjects[]>({ queryKey: ["/api/goals"] });

  const streak = workoutStreak(logs);
  const { completed: wkCompleted, planned: wkPlanned } = weeklyWorkoutStats(logs, templates);
  const recentPRs = getRecentPRs(logs);

  const deleteLog = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/workout-logs/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/workout-logs"] }); toast({ title: "Log deleted" }); }
  });
  const deleteTemplate = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/workout-templates/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/workout-templates"] }); toast({ title: "Template deleted" }); }
  });
  const deleteEquipment = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/equipment/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/equipment"] }),
  });

  // Group equipment by category
  const equipmentByCategory = useMemo(() => {
    const grouped: Record<string, Equipment[]> = {};
    for (const item of equipmentList) {
      if (!grouped[item.category]) grouped[item.category] = [];
      grouped[item.category].push(item);
    }
    return grouped;
  }, [equipmentList]);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Workouts</h1>
          {streak > 0 && (
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-[hsl(210_80%_48%)] bg-[hsl(210_80%_48%/0.1)] px-2.5 py-1 rounded-full border border-[hsl(210_80%_48%/0.3)]">
              <Flame size={13} />{streak}d streak
            </span>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => setExerciseSearchOpen(true)} className="gap-1.5">
            <Search size={13} /> Exercise Library
          </Button>
          <Button size="sm" variant="outline" onClick={() => setGenerateOpen(true)} className="gap-1.5 border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/30">
            <Sparkles size={13} /> Generate Plan
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setEditTemplate(null); setTemplateModal(true); }} className="gap-1.5">
            <Plus size={13} /><LayoutTemplate size={13} /> Template
          </Button>
          <Button size="sm" onClick={() => { setEditLog(null); setLogModal(true); }} className="gap-1.5">
            <Plus size={13} /><ClipboardList size={13} /> Log Workout
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-card border rounded-xl p-3 text-center">
          <p className="text-xl font-bold">{wkCompleted}</p>
          <p className="text-xs text-muted-foreground">Done this week</p>
        </div>
        <div className="bg-card border rounded-xl p-3 text-center">
          <p className="text-xl font-bold">{wkPlanned}</p>
          <p className="text-xs text-muted-foreground">Planned</p>
        </div>
        <div className="bg-card border rounded-xl p-3 text-center">
          <p className="text-xl font-bold">{streak}d</p>
          <p className="text-xs text-muted-foreground">Current streak</p>
        </div>
        <div className="bg-card border rounded-xl p-3 text-center">
          <p className="text-xl font-bold">{logs.filter(l => l.completed).length}</p>
          <p className="text-xs text-muted-foreground">Total logged</p>
        </div>
      </div>

      {/* Recent PRs */}
      {recentPRs.length > 0 && (
        <div className="bg-card border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3"><Zap size={15} className="text-amber-500" /><span className="text-sm font-semibold">Recent PRs</span></div>
          <div className="flex gap-3 flex-wrap">
            {recentPRs.map((pr, i) => (
              <div key={i} className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                <Star size={12} className="text-amber-500" fill="currentColor" />
                <div>
                  <p className="text-xs font-semibold">{pr.exercise}</p>
                  <p className="text-xs text-muted-foreground">{pr.weight} lb · {format(parseISO(pr.date), "MMM d")}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-secondary rounded-lg p-1 w-fit">
        <button onClick={() => setTab("logs")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${tab === "logs" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}>
          <ClipboardList size={14} /> Workout Logs <span className="text-xs opacity-60">{logs.length}</span>
        </button>
        <button onClick={() => setTab("templates")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${tab === "templates" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}>
          <LayoutTemplate size={14} /> Templates <span className="text-xs opacity-60">{templates.length}</span>
        </button>
        <button onClick={() => setTab("equipment")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${tab === "equipment" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}>
          <Package size={14} /> Equipment <span className="text-xs opacity-60">{equipmentList.length}</span>
        </button>
      </div>

      {/* Workout Logs */}
      {tab === "logs" && (
        <div className="space-y-3">
          {logs.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground"><Dumbbell size={40} className="mx-auto mb-4 opacity-20" /><p className="font-medium">No workouts logged yet</p></div>
          ) : logs.map(log => {
            let exercises: any[] = [];
            try { exercises = JSON.parse(log.exercisesJson); } catch {}
            const prs = exercises.filter(e => e.isPR);
            return (
              <div key={log.id} className="bg-card border rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[hsl(210_80%_48%/0.12)] text-[hsl(210_80%_48%)] flex items-center justify-center shrink-0">
                      <Dumbbell size={17} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm">{log.name}</p>
                        <span className="text-xs text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">{WORKOUT_TYPE_LABELS[log.workoutType] ?? log.workoutType}</span>
                        {prs.length > 0 && <span className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800 flex items-center gap-0.5"><Star size={9} fill="currentColor" />{prs.length} PR{prs.length > 1 ? "s" : ""}</span>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{format(parseISO(log.date), "EEE, MMM d, yyyy")}{log.durationMinutes ? ` · ${log.durationMinutes} min` : ""}</p>
                      {exercises.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {exercises.slice(0, 5).map((ex, i) => (
                            <span key={i} className="text-xs bg-secondary px-2 py-0.5 rounded-full text-muted-foreground">
                              {ex.name}{ex.isPR ? " ⭐" : ""}
                              {ex.sets?.length ? ` ${ex.sets.length}×` : ""}
                            </span>
                          ))}
                          {exercises.length > 5 && <span className="text-xs text-muted-foreground">+{exercises.length - 5}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"><MoreHorizontal size={14} /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => { setEditLog(log); setLogModal(true); }}><Pencil size={13} className="mr-2" />Edit</DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => deleteLog.mutate(log.id)}><Trash2 size={13} className="mr-2" />Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Templates */}
      {tab === "templates" && (
        <div className="space-y-3">
          {templates.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <LayoutTemplate size={40} className="mx-auto mb-4 opacity-20" />
              <p className="font-medium">No templates yet</p>
              <p className="text-sm mt-1">Create a template or use <strong>Generate Plan</strong> to build one with AI</p>
              <div className="flex gap-2 justify-center mt-4">
                <Button variant="outline" size="sm" className="gap-1" onClick={() => { setEditTemplate(null); setTemplateModal(true); }}><Plus size={13} /> New Template</Button>
                <Button variant="outline" size="sm" className="gap-1 border-purple-300 text-purple-700" onClick={() => setGenerateOpen(true)}><Sparkles size={13} /> Generate Plan</Button>
              </div>
            </div>
          ) : templates.map(t => {
            let exercises: any[] = [];
            try { exercises = JSON.parse(t.exercisesJson); } catch {}
            return (
              <div key={t.id} className="bg-card border rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="font-semibold text-sm">{t.name}</p>
                      <span className="text-xs bg-secondary px-1.5 py-0.5 rounded text-muted-foreground">{WORKOUT_TYPE_LABELS[t.workoutType] ?? t.workoutType}</span>
                      {t.scheduledDay && <span className="text-xs bg-secondary px-1.5 py-0.5 rounded text-muted-foreground capitalize">{t.scheduledDay}</span>}
                      {t.recurring !== "none" && <span className="text-xs border border-border px-1.5 py-0.5 rounded text-muted-foreground">{t.recurring === "weekly" ? "Weekly" : t.recurring}</span>}
                    </div>
                    {exercises.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {exercises.map((ex, i) => {
                          const setCount = Array.isArray(ex.sets) ? ex.sets.length : (ex.sets ?? 0);
                          const setsSummary = Array.isArray(ex.sets)
                            ? ex.sets.map((s: any) => `${s.reps}×${s.weight}lb`).join(", ")
                            : `${ex.sets}×${ex.reps} @ ${ex.weight}lb`;
                          return (
                            <span key={i} className="text-xs bg-secondary px-2 py-0.5 rounded-full text-muted-foreground" title={setsSummary}>
                              {ex.name} · {setCount} sets
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"><MoreHorizontal size={14} /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => { setEditLog(null); setLogModal(true); }}><ClipboardList size={13} className="mr-2" />Log this workout</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setEditTemplate(t); setTemplateModal(true); }}><Pencil size={13} className="mr-2" />Edit</DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => deleteTemplate.mutate(t.id)}><Trash2 size={13} className="mr-2" />Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Equipment */}
      {tab === "equipment" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Track your gym equipment — it's used for exercise search and AI plan generation.
            </p>
            <Button size="sm" className="gap-1.5" onClick={() => { setEditEquipment(null); setEquipmentModal(true); }}>
              <Plus size={13} /> Add Equipment
            </Button>
          </div>

          {equipmentList.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground border rounded-xl border-dashed">
              <Package size={40} className="mx-auto mb-4 opacity-20" />
              <p className="font-medium">No equipment added yet</p>
              <p className="text-sm mt-1">Add your gym equipment so AI can personalize your workout plans</p>
              <Button variant="outline" size="sm" className="mt-4 gap-1" onClick={() => { setEditEquipment(null); setEquipmentModal(true); }}>
                <Plus size={13} /> Add Equipment
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {EQUIPMENT_CATEGORIES.filter(cat => equipmentByCategory[cat.value]?.length > 0).map(cat => (
                <div key={cat.value}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{cat.label}</p>
                  <div className="flex flex-wrap gap-2">
                    {equipmentByCategory[cat.value].map(item => (
                      <div key={item.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${cat.color}`}>
                        <span className="text-sm font-medium">{item.name}</span>
                        {item.notes && <span className="text-xs opacity-70">({item.notes})</span>}
                        <div className="flex gap-0.5 ml-1">
                          <button onClick={() => { setEditEquipment(item); setEquipmentModal(true); }}
                            className="p-0.5 rounded opacity-60 hover:opacity-100 transition-opacity">
                            <Pencil size={11} />
                          </button>
                          <button onClick={() => deleteEquipment.mutate(item.id)}
                            className="p-0.5 rounded opacity-60 hover:opacity-100 hover:text-destructive transition-all">
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Quick-add common equipment */}
          {equipmentList.length === 0 && (
            <div className="border rounded-xl p-4 bg-muted/30">
              <p className="text-sm font-medium mb-3">Quick add common equipment:</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { name: "Barbell", category: "barbell" },
                  { name: "Dumbbells (pair)", category: "dumbbell" },
                  { name: "Kettlebell", category: "kettlebell" },
                  { name: "Pull-up Bar", category: "pullup_bar" },
                  { name: "Resistance Bands", category: "resistance_band" },
                  { name: "Flat Bench", category: "bench" },
                  { name: "Cable Machine", category: "cable" },
                  { name: "Treadmill", category: "cardio" },
                ].map(item => (
                  <button key={item.name}
                    className="px-3 py-1.5 text-sm rounded-lg bg-secondary hover:bg-secondary/80 border transition-colors"
                    onClick={async () => {
                      await apiRequest("POST", "/api/equipment", { name: item.name, category: item.category });
                      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
                    }}>
                    + {item.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      <WorkoutLogModal open={logModal} onClose={() => { setLogModal(false); setEditLog(null); }} templates={templates} editLog={editLog} />
      <WorkoutTemplateModal open={templateModal} onClose={() => { setTemplateModal(false); setEditTemplate(null); }} editTemplate={editTemplate} />
      <ExerciseSearchModal open={exerciseSearchOpen} onClose={() => setExerciseSearchOpen(false)} templates={templates} />
      <GenerateWorkoutPlanModal open={generateOpen} onClose={() => setGenerateOpen(false)} userEquipment={equipmentList} goals={goals} />
      <EquipmentModal open={equipmentModal} onClose={() => { setEquipmentModal(false); setEditEquipment(null); }} editing={editEquipment} />
    </div>
  );
}
