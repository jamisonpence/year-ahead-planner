import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { todayStr } from "@/lib/plannerUtils";
import { format, parseISO, startOfWeek, addDays, subDays } from "date-fns";
import {
  CheckCircle2, Circle, Plus, Pencil, Trash2, Flame, Trophy,
  Dumbbell, Target, Sparkles, MoreHorizontal, Star, X, ChevronRight,
  CalendarCheck, TrendingUp, Zap, Clock, BarChart2, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import WorkoutLogModal from "@/components/modals/WorkoutLogModal";
import type { HabitWithStats, WorkoutLog, WorkoutTemplate, WorkoutPlan, Hobby } from "@shared/schema";

// ── Types ─────────────────────────────────────────────────────────────────────

type HabitCategory = "general" | "health" | "fitness" | "learning" | "mindfulness" | "productivity" | "social" | "finance";

const HABIT_CATEGORIES: { value: HabitCategory; label: string; emoji: string }[] = [
  { value: "general",       label: "General",      emoji: "✅" },
  { value: "health",        label: "Health",        emoji: "❤️" },
  { value: "fitness",       label: "Fitness",       emoji: "💪" },
  { value: "learning",      label: "Learning",      emoji: "📚" },
  { value: "mindfulness",   label: "Mindfulness",   emoji: "🧘" },
  { value: "productivity",  label: "Productivity",  emoji: "⚡" },
  { value: "social",        label: "Social",        emoji: "👥" },
  { value: "finance",       label: "Finance",       emoji: "💰" },
];

const EMOJI_PRESETS = ["✅", "💪", "🏃", "🧘", "📚", "💧", "🥗", "😴", "🎯", "📝", "🌿", "🎵", "🧠", "❤️", "⭐", "🔥"];
const COLOR_PRESETS = ["#6366f1", "#ec4899", "#f97316", "#22c55e", "#3b82f6", "#a855f7", "#eab308", "#14b8a6", "#ef4444", "#64748b"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getLast7Days(): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });
}

function getWeekDays(anchor: string): string[] {
  const base = startOfWeek(parseISO(anchor), { weekStartsOn: 0 });
  return Array.from({ length: 7 }, (_, i) => format(addDays(base, i), "yyyy-MM-dd"));
}

function streakLabel(n: number) {
  if (n === 0) return "";
  if (n === 1) return "1 day";
  return `${n} days`;
}

// Parse workout schedule JSON to get today's entry
function getTodayWorkout(plan: WorkoutPlan | null): string | null {
  if (!plan) return null;
  // scheduleJson stores dayOfWeek as lowercase ("monday"), format() returns "Monday"
  const todayLower = format(new Date(), "EEEE").toLowerCase();
  try {
    const raw = JSON.parse(plan.scheduleJson ?? "[]");
    if (!Array.isArray(raw) || raw.length === 0) return null;
    // New week-based format: [{ week, days: [{ dayOfWeek, label }] }]
    if ("week" in (raw[0] ?? {})) {
      const flat = raw.flatMap((w: any) => w.days ?? []);
      const entry = flat.find((d: any) => d.dayOfWeek?.toLowerCase() === todayLower);
      return entry?.label ?? null;
    }
    // Legacy flat format: [{ dayOfWeek, label, templateName }]
    const entry = raw.find((d: any) => d.dayOfWeek?.toLowerCase() === todayLower);
    return entry?.label ?? entry?.templateName ?? null;
  } catch { return null; }
}

// Extract today's hobby activity blocks from hobby plans
type HobbyTask = { hobbyId: number; hobbyName: string; taskKey: string; label: string; completed: boolean; emoji?: string };

// Same algorithm as hpPickTrainingDays in HobbiesPage — Monday-first indexing (Mon=0 … Sun=6)
function hpPickTrainingDays(days: number): number[] {
  const out: number[] = [];
  const step = 7 / days;
  for (let i = 0; i < days; i++) out.push(Math.round(i * step) % 7);
  return Array.from(new Set(out)).sort((a, b) => a - b);
}

function getHobbyTasksForToday(hobbies: Hobby[]): HobbyTask[] {
  const tasks: HobbyTask[] = [];
  for (const hobby of hobbies) {
    try {
      const extra = JSON.parse(hobby.extraJson ?? "{}");
      const plans: any[] = extra.plans ?? [];
      for (const plan of plans) {
        if (!plan.isActive || plan.isPaused || plan.completedAt) continue;
        if (!plan.activities || plan.activities.length === 0) continue;
        if (!plan.startDate) continue;

        const sessionsPerWeek = Math.max(1, Math.min(7, plan.commitmentDaysPerWeek ?? 3));
        // Use Monday-first indexing to match computeHobbyPlan: (getDay()+6)%7
        const trainingDays = hpPickTrainingDays(sessionsPerWeek);

        const [sy, sm, sd] = plan.startDate.split("-").map(Number);
        const start = new Date(sy, sm - 1, sd);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        if (today < start) continue;

        // Check if today is a training day (Monday-first index)
        const todayMonIdx = (today.getDay() + 6) % 7;
        if (!trainingDays.includes(todayMonIdx)) continue;

        // Walk from start to today counting sessions to get exact sessionIndex
        let sessionIndex = 0;
        const cursor = new Date(start);
        while (cursor < today) {
          const idx = (cursor.getDay() + 6) % 7;
          if (trainingDays.includes(idx)) sessionIndex++;
          cursor.setDate(cursor.getDate() + 1);
        }

        // Build blocks matching computeHobbyPlan exactly
        const completedKeys = new Set((plan.taskCompletions ?? []).map((c: any) => c.taskKey as string));
        const minutesPerSession = Math.max(plan.minutesPerSession ?? 45, 5);
        const blockCount = minutesPerSession >= 40 ? 2 : 1;
        const sortedActs = [...plan.activities].sort((a: any, b: any) => b.weight - a.weight);

        for (let b = 0; b < blockCount; b++) {
          const act = sortedActs[(sessionIndex + b) % sortedActs.length];
          const taskKey = `session-${sessionIndex}-block-${b}`;
          tasks.push({
            hobbyId: hobby.id,
            hobbyName: hobby.name,
            taskKey,
            label: act.name ?? "Activity",
            completed: completedKeys.has(taskKey),
            emoji: hobby.emoji ?? "✨",
          });
        }
      }
    } catch {}
  }
  return tasks;
}

// ── Habit Modal (add/edit) ────────────────────────────────────────────────────

function HabitModal({ open, onClose, edit }: {
  open: boolean; onClose: () => void; edit: HabitWithStats | null;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [emoji, setEmoji] = useState("✅");
  const [color, setColor] = useState("#6366f1");
  const [category, setCategory] = useState<HabitCategory>("general");
  const [targetDays, setTargetDays] = useState(7);
  const [frequency, setFrequency] = useState("daily");

  // Reset when modal opens
  useEffect(() => {
    if (open) {
      if (edit) {
        setTitle(edit.title); setDescription(edit.description ?? "");
        setEmoji(edit.emoji); setColor(edit.color);
        setCategory(edit.category as HabitCategory);
        setTargetDays(edit.targetDaysPerWeek); setFrequency(edit.frequency);
      } else {
        setTitle(""); setDescription(""); setEmoji("✅"); setColor("#6366f1");
        setCategory("general"); setTargetDays(7); setFrequency("daily");
      }
    }
  }, [open]);

  const inv = () => queryClient.invalidateQueries({ queryKey: ["/api/habits"] });
  const createMut = useMutation({
    mutationFn: (d: any) => apiRequest("POST", "/api/habits", d),
    onSuccess: () => { inv(); toast({ title: "Habit created" }); onClose(); },
  });
  const updateMut = useMutation({
    mutationFn: (d: any) => apiRequest("PATCH", `/api/habits/${edit?.id}`, d),
    onSuccess: () => { inv(); toast({ title: "Habit updated" }); onClose(); },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const d = { title: title.trim(), description: description.trim() || null, emoji, color, category, targetDaysPerWeek: targetDays, frequency };
    edit ? updateMut.mutate(d) : createMut.mutate(d);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{edit ? "Edit Habit" : "New Habit"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Name *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Drink 8 glasses of water" required />
          </div>

          <div className="space-y-1.5">
            <Label>Description <span className="text-muted-foreground text-xs">(opt)</span></Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Why this habit matters..." />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as HabitCategory)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {HABIT_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.emoji} {c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Target</Label>
              <Select value={String(targetDays)} onValueChange={(v) => setTargetDays(parseInt(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1,2,3,4,5,6,7].map((d) => (
                    <SelectItem key={d} value={String(d)}>{d}x / week</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Emoji</Label>
            <div className="flex flex-wrap gap-1.5">
              {EMOJI_PRESETS.map((e) => (
                <button key={e} type="button" onClick={() => setEmoji(e)}
                  className={`w-8 h-8 rounded text-lg flex items-center justify-center border-2 transition-colors
                    ${emoji === e ? "border-primary bg-primary/10" : "border-transparent hover:border-border"}`}>
                  {e}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {COLOR_PRESETS.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full border-2 transition-all ${color === c ? "border-foreground scale-110" : "border-transparent"}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Button type="submit" disabled={createMut.isPending || updateMut.isPending} className="flex-1">
              {edit ? "Save Changes" : "Create Habit"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Habit Card (in today view) ────────────────────────────────────────────────

function TodayHabitRow({ habit, onToggle }: { habit: HabitWithStats; onToggle: () => void }) {
  const today = todayStr();
  const completed = habit.completions.some(c => c.date === today);
  const last7 = getLast7Days();

  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${completed ? "bg-secondary/40 border-border/50" : "bg-card border-border"}`}>
      <button onClick={onToggle} className="shrink-0 transition-transform active:scale-90">
        {completed
          ? <CheckCircle2 size={22} style={{ color: habit.color }} />
          : <Circle size={22} className="text-muted-foreground" />}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-base">{habit.emoji}</span>
          <span className={`font-medium text-sm ${completed ? "line-through text-muted-foreground" : ""}`}>{habit.title}</span>
        </div>
        {/* 7-day dots */}
        <div className="flex gap-0.5 mt-1">
          {last7.map((d) => {
            const done = habit.completions.some(c => c.date === d);
            return (
              <div key={d} className={`w-2 h-2 rounded-full ${done ? "" : "bg-muted"}`}
                style={done ? { backgroundColor: habit.color } : {}} />
            );
          })}
        </div>
      </div>

      <div className="text-right shrink-0">
        {habit.streakCurrent > 0 && (
          <div className="flex items-center gap-0.5 text-amber-500 text-xs font-semibold">
            <Flame size={11} />
            {habit.streakCurrent}
          </div>
        )}
        <div className="text-[10px] text-muted-foreground mt-0.5">{habit.targetDaysPerWeek}x/wk</div>
      </div>
    </div>
  );
}

// ── Habit Management Card ─────────────────────────────────────────────────────

function HabitManageCard({ habit, onEdit, onDelete }: {
  habit: HabitWithStats; onEdit: () => void; onDelete: () => void;
}) {
  const today = todayStr();
  const last7 = getLast7Days();
  const todayDone = habit.completions.some(c => c.date === today);
  const completedThisWeek = last7.filter(d => habit.completions.some(c => c.date === d)).length;

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0" style={{ backgroundColor: habit.color + "22" }}>
            {habit.emoji}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-sm truncate">{habit.title}</div>
            {habit.description && <div className="text-xs text-muted-foreground truncate">{habit.description}</div>}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0"><MoreHorizontal size={14} /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}><Pencil size={13} className="mr-2" />Edit</DropdownMenuItem>
            <DropdownMenuItem onClick={onDelete} className="text-destructive"><Trash2 size={13} className="mr-2" />Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2">
        <div className="text-center">
          <div className="flex items-center justify-center gap-0.5 text-amber-500">
            <Flame size={12} />
            <span className="font-bold text-sm">{habit.streakCurrent}</span>
          </div>
          <div className="text-[10px] text-muted-foreground">Current</div>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-0.5 text-purple-500">
            <Trophy size={12} />
            <span className="font-bold text-sm">{habit.streakBest}</span>
          </div>
          <div className="text-[10px] text-muted-foreground">Best</div>
        </div>
        <div className="text-center">
          <div className="font-bold text-sm" style={{ color: habit.color }}>
            {completedThisWeek}/{habit.targetDaysPerWeek}
          </div>
          <div className="text-[10px] text-muted-foreground">This week</div>
        </div>
      </div>

      {/* 7-day strip */}
      <div className="flex gap-1">
        {last7.map((d, i) => {
          const done = habit.completions.some(c => c.date === d);
          const isToday = d === today;
          return (
            <div key={d} className="flex-1 flex flex-col items-center gap-0.5">
              <div className={`w-full h-5 rounded-sm ${done ? "" : isToday ? "border-2 border-dashed border-muted-foreground/40 bg-muted/30" : "bg-muted/40"}`}
                style={done ? { backgroundColor: habit.color } : {}} />
              <span className="text-[9px] text-muted-foreground">{["S","M","T","W","T","F","S"][new Date(d + "T12:00:00").getDay()]}</span>
            </div>
          );
        })}
      </div>

      {/* Category badge + today status */}
      <div className="flex items-center justify-between">
        <Badge variant="secondary" className="text-xs">{habit.category}</Badge>
        {todayDone && (
          <span className="text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1">
            <CheckCircle2 size={11} /> Done today
          </span>
        )}
      </div>
    </div>
  );
}

// ── Weekly Grid View ──────────────────────────────────────────────────────────

function WeeklyHabitGrid({ habits }: { habits: HabitWithStats[] }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const anchorDate = format(addDays(new Date(), weekOffset * 7), "yyyy-MM-dd");
  const weekDays = getWeekDays(anchorDate);
  const today = todayStr();

  const dayLabels = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  return (
    <div className="space-y-3">
      {/* Week nav */}
      <div className="flex items-center justify-between">
        <Button size="sm" variant="ghost" onClick={() => setWeekOffset(w => w - 1)} className="h-7 w-7 p-0">‹</Button>
        <div className="text-sm font-medium">
          {format(parseISO(weekDays[0]), "MMM d")} – {format(parseISO(weekDays[6]), "MMM d, yyyy")}
          {weekOffset === 0 && <span className="ml-2 text-xs text-muted-foreground">(This week)</span>}
        </div>
        <Button size="sm" variant="ghost" onClick={() => setWeekOffset(w => w + 1)} disabled={weekOffset >= 0} className="h-7 w-7 p-0">›</Button>
      </div>

      {habits.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm">No habits yet. Add one in the Habits tab!</div>
      )}

      {/* Grid */}
      {habits.length > 0 && (
        <div className="rounded-xl border bg-card overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2 pl-3 font-medium text-muted-foreground w-32">Habit</th>
                {weekDays.map((d, i) => (
                  <th key={d} className={`text-center p-2 font-medium w-10 ${d === today ? "text-primary" : "text-muted-foreground"}`}>
                    <div>{dayLabels[i]}</div>
                    <div className={`text-[10px] ${d === today ? "font-bold" : ""}`}>{format(parseISO(d), "d")}</div>
                  </th>
                ))}
                <th className="text-center p-2 font-medium text-muted-foreground w-12">%</th>
              </tr>
            </thead>
            <tbody>
              {habits.map((h, hi) => {
                const weekCompletions = weekDays.filter(d => h.completions.some(c => c.date === d)).length;
                const pct = Math.round((weekCompletions / h.targetDaysPerWeek) * 100);
                return (
                  <tr key={h.id} className={hi < habits.length - 1 ? "border-b" : ""}>
                    <td className="p-2 pl-3">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span>{h.emoji}</span>
                        <span className="truncate font-medium">{h.title}</span>
                      </div>
                    </td>
                    {weekDays.map((d) => {
                      const done = h.completions.some(c => c.date === d);
                      const isFuture = d > today;
                      return (
                        <td key={d} className="text-center p-1">
                          {done
                            ? <div className="w-6 h-6 rounded-full mx-auto flex items-center justify-center" style={{ backgroundColor: h.color + "33", color: h.color }}><CheckCircle2 size={13} /></div>
                            : isFuture
                              ? <div className="w-6 h-6 rounded-full mx-auto bg-muted/20" />
                              : <div className="w-6 h-6 rounded-full mx-auto bg-muted/50 flex items-center justify-center"><X size={10} className="text-muted-foreground/40" /></div>
                          }
                        </td>
                      );
                    })}
                    <td className="text-center p-2">
                      <span className={`font-semibold ${pct >= 100 ? "text-green-500" : pct >= 70 ? "text-amber-500" : "text-muted-foreground"}`}>
                        {pct}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function HabitsPage() {
  const { toast } = useToast();
  const today = todayStr();
  const [tab, setTab] = useState<"today" | "habits" | "weekly">("today");
  const [habitModalOpen, setHabitModalOpen] = useState(false);
  const [editHabit, setEditHabit] = useState<HabitWithStats | null>(null);
  const [workoutLogOpen, setWorkoutLogOpen] = useState(false);
  const [editWorkoutLog, setEditWorkoutLog] = useState<WorkoutLog | null>(null);

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: habits = [], isLoading: habitsLoading } = useQuery<HabitWithStats[]>({
    queryKey: ["/api/habits"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/habits"); return r.json(); },
  });

  const { data: workoutLogs = [] } = useQuery<WorkoutLog[]>({
    queryKey: ["/api/workout-logs"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/workout-logs"); return r.json(); },
  });

  const { data: workoutTemplates = [] } = useQuery<WorkoutTemplate[]>({
    queryKey: ["/api/workout-templates"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/workout-templates"); return r.json(); },
  });

  const { data: activePlan = null } = useQuery<WorkoutPlan | null>({
    queryKey: ["/api/workout-plans/active"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/workout-plans");
      const plans: WorkoutPlan[] = await r.json();
      return plans.find(p => p.isActive) ?? null;
    },
  });

  const { data: hobbiesRaw = [] } = useQuery<Hobby[]>({
    queryKey: ["/api/hobbies"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/hobbies"); return r.json(); },
  });

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const invHabits = () => queryClient.invalidateQueries({ queryKey: ["/api/habits"] });

  const toggleMut = useMutation({
    mutationFn: ({ id, date }: { id: number; date: string }) =>
      apiRequest("POST", `/api/habits/${id}/complete/${date}`, {}),
    onSuccess: () => invHabits(),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/habits/${id}`),
    onSuccess: () => { invHabits(); toast({ title: "Habit deleted" }); },
  });

  // ── Derived ──────────────────────────────────────────────────────────────────
  const todayWorkoutLabel = useMemo(() => getTodayWorkout(activePlan), [activePlan]);
  const todayWorkoutLogged = useMemo(() =>
    workoutLogs.some(l => l.date === today), [workoutLogs, today]);

  const hobbyTasks = useMemo(() => getHobbyTasksForToday(hobbiesRaw), [hobbiesRaw]);

  const todayHabitsCompleted = habits.filter(h => h.completions.some(c => c.date === today)).length;
  const totalStreak = habits.reduce((sum, h) => sum + h.streakCurrent, 0);

  // Recent workout logs (last 5)
  const recentLogs = useMemo(() =>
    [...workoutLogs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5),
    [workoutLogs]);

  // ── Today tab ────────────────────────────────────────────────────────────────

  const todayDayLabel = format(new Date(), "EEEE, MMMM d");

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-5 pb-3 border-b flex-shrink-0">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <CalendarCheck size={20} className="text-primary" />
          Habits & Daily Tracker
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Build consistency, log workouts, track your day</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b flex-shrink-0">
        {(["today","habits","weekly"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-sm font-medium capitalize transition-colors
              ${tab === t ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t === "today" ? "Today" : t === "habits" ? "My Habits" : "Weekly"}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* ── TODAY TAB ── */}
        {tab === "today" && (
          <div className="space-y-4">
            {/* Date + summary bar */}
            <div className="rounded-xl bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 p-4">
              <div className="text-sm font-medium text-muted-foreground">{todayDayLabel}</div>
              <div className="flex items-center gap-4 mt-2">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 size={16} className="text-green-500" />
                  <span className="text-sm font-semibold">{todayHabitsCompleted}/{habits.length} habits</span>
                </div>
                {totalStreak > 0 && (
                  <div className="flex items-center gap-1 text-amber-500">
                    <Flame size={14} />
                    <span className="text-sm font-semibold">{totalStreak} streak pts</span>
                  </div>
                )}
              </div>
            </div>

            {/* Habits section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-sm flex items-center gap-1.5">
                  <Sparkles size={14} className="text-primary" />
                  Habits
                </h2>
                <Button size="sm" variant="outline" className="h-6 text-xs gap-1 px-2"
                  onClick={() => { setEditHabit(null); setHabitModalOpen(true); }}>
                  <Plus size={10} /> Add
                </Button>
              </div>

              {habitsLoading && <div className="text-sm text-muted-foreground py-2">Loading habits…</div>}

              {!habitsLoading && habits.length === 0 && (
                <div className="rounded-xl border border-dashed p-6 text-center">
                  <Sparkles size={24} className="mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm font-medium">No habits yet</p>
                  <p className="text-xs text-muted-foreground mt-1 mb-3">Start building consistency with daily habits</p>
                  <Button size="sm" onClick={() => { setEditHabit(null); setHabitModalOpen(true); }}>
                    <Plus size={13} className="mr-1" /> Create your first habit
                  </Button>
                </div>
              )}

              {habits.map((h) => (
                <TodayHabitRow
                  key={h.id}
                  habit={h}
                  onToggle={() => toggleMut.mutate({ id: h.id, date: today })}
                />
              ))}
            </div>

            {/* Workout section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-sm flex items-center gap-1.5">
                  <Dumbbell size={14} className="text-primary" />
                  Workout
                </h2>
                <Button size="sm" variant="outline" className="h-6 text-xs gap-1 px-2"
                  onClick={() => { setEditWorkoutLog(null); setWorkoutLogOpen(true); }}>
                  <Plus size={10} /> Log
                </Button>
              </div>

              {todayWorkoutLabel ? (
                <div className={`rounded-xl border p-3 flex items-center gap-3 ${todayWorkoutLogged ? "bg-secondary/40" : "bg-card"}`}>
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${todayWorkoutLogged ? "bg-green-500/20" : "bg-primary/10"}`}>
                    {todayWorkoutLogged
                      ? <CheckCircle2 size={18} className="text-green-500" />
                      : <Dumbbell size={18} className="text-primary" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{todayWorkoutLabel}</div>
                    <div className="text-xs text-muted-foreground">{todayWorkoutLogged ? "Logged ✓" : "Scheduled for today"}</div>
                  </div>
                  {!todayWorkoutLogged && (
                    <Button size="sm" className="h-7 text-xs"
                      onClick={() => { setEditWorkoutLog(null); setWorkoutLogOpen(true); }}>
                      Log it
                    </Button>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border p-3 flex items-center gap-3 bg-card">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-muted/40">
                    <Dumbbell size={18} className="text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-sm text-muted-foreground">Rest day</div>
                    <div className="text-xs text-muted-foreground">No workout scheduled</div>
                  </div>
                  <Button size="sm" variant="outline" className="h-7 text-xs"
                    onClick={() => { setEditWorkoutLog(null); setWorkoutLogOpen(true); }}>
                    Log anyway
                  </Button>
                </div>
              )}
            </div>

            {/* Hobby plan tasks */}
            {hobbyTasks.length > 0 && (
              <div className="space-y-2">
                <h2 className="font-semibold text-sm flex items-center gap-1.5">
                  <Target size={14} className="text-primary" />
                  Hobby Plan Tasks
                </h2>
                {hobbyTasks.map((t) => (
                  <div key={t.taskKey} className={`rounded-xl border p-3 flex items-center gap-3 ${t.completed ? "bg-secondary/40" : "bg-card"}`}>
                    <div className="text-lg shrink-0">{t.emoji}</div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium ${t.completed ? "line-through text-muted-foreground" : ""}`}>{t.label}</div>
                      <div className="text-xs text-muted-foreground">{t.hobbyName}</div>
                    </div>
                    {t.completed && <CheckCircle2 size={16} className="text-green-500 shrink-0" />}
                  </div>
                ))}
                <p className="text-xs text-muted-foreground px-1">Mark tasks complete in the Hobbies section.</p>
              </div>
            )}

            {/* Recent workout logs */}
            {recentLogs.length > 0 && (
              <div className="space-y-2">
                <h2 className="font-semibold text-sm flex items-center gap-1.5">
                  <BarChart2 size={14} className="text-primary" />
                  Recent Workouts
                </h2>
                <div className="space-y-1.5">
                  {recentLogs.map((log) => (
                    <div key={log.id} className="rounded-lg border bg-card p-2.5 flex items-center gap-2.5">
                      <Dumbbell size={14} className="text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium truncate">{log.name}</span>
                        {log.durationMinutes && <span className="text-xs text-muted-foreground ml-1.5">· {log.durationMinutes} min</span>}
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">{format(parseISO(log.date), "MMM d")}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── HABITS TAB ── */}
        {tab === "habits" && (
          <div className="space-y-4">
            {/* Summary stats */}
            {habits.length > 0 && (
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border bg-card p-3 text-center">
                  <div className="text-2xl font-bold text-primary">{habits.length}</div>
                  <div className="text-xs text-muted-foreground">Active Habits</div>
                </div>
                <div className="rounded-xl border bg-card p-3 text-center">
                  <div className="text-2xl font-bold text-amber-500">{Math.max(...habits.map(h => h.streakCurrent), 0)}</div>
                  <div className="text-xs text-muted-foreground">Best Streak</div>
                </div>
                <div className="rounded-xl border bg-card p-3 text-center">
                  <div className="text-2xl font-bold text-green-500">{todayHabitsCompleted}</div>
                  <div className="text-xs text-muted-foreground">Done Today</div>
                </div>
              </div>
            )}

            {/* Add button */}
            <Button className="w-full gap-2" onClick={() => { setEditHabit(null); setHabitModalOpen(true); }}>
              <Plus size={15} /> New Habit
            </Button>

            {habitsLoading && <div className="text-sm text-muted-foreground py-4 text-center">Loading habits…</div>}

            {!habitsLoading && habits.length === 0 && (
              <div className="rounded-xl border border-dashed p-10 text-center">
                <Sparkles size={32} className="mx-auto text-muted-foreground mb-3" />
                <p className="font-semibold">Build your habit stack</p>
                <p className="text-sm text-muted-foreground mt-1">Track anything — water intake, meditation, reading, exercise…</p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {habits.map((h) => (
                <HabitManageCard
                  key={h.id}
                  habit={h}
                  onEdit={() => { setEditHabit(h); setHabitModalOpen(true); }}
                  onDelete={() => {
                    if (confirm(`Delete "${h.title}"?`)) deleteMut.mutate(h.id);
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── WEEKLY TAB ── */}
        {tab === "weekly" && (
          <div className="space-y-6">
            {/* Habit weekly grid */}
            <div className="space-y-3">
              <h2 className="font-semibold text-sm flex items-center gap-1.5">
                <TrendingUp size={14} className="text-primary" />
                Habit Completion Grid
              </h2>
              <WeeklyHabitGrid habits={habits} />
            </div>

            {/* Workout log section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-sm flex items-center gap-1.5">
                  <Dumbbell size={14} className="text-primary" />
                  Workout Log
                </h2>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                  onClick={() => { setEditWorkoutLog(null); setWorkoutLogOpen(true); }}>
                  <Plus size={11} /> Log Workout
                </Button>
              </div>

              {workoutLogs.length === 0 && (
                <div className="rounded-xl border border-dashed p-6 text-center">
                  <Dumbbell size={24} className="mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm font-medium">No workouts logged yet</p>
                  <p className="text-xs text-muted-foreground mt-1 mb-3">Log your first workout to start tracking progress</p>
                  <Button size="sm" onClick={() => { setEditWorkoutLog(null); setWorkoutLogOpen(true); }}>
                    <Plus size={13} className="mr-1" /> Log Workout
                  </Button>
                </div>
              )}

              <div className="space-y-2">
                {[...workoutLogs]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .slice(0, 20)
                  .map((log) => {
                    let exercises: any[] = [];
                    try { exercises = JSON.parse(log.exercisesJson ?? "[]"); } catch {}
                    return (
                      <div key={log.id} className="rounded-xl border bg-card p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                              <Dumbbell size={15} className="text-primary" />
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium text-sm truncate">{log.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {format(parseISO(log.date), "EEE, MMM d")}
                                {log.durationMinutes && <span className="ml-1.5">· {log.durationMinutes} min</span>}
                              </div>
                            </div>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0"><MoreHorizontal size={13} /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => { setEditWorkoutLog(log); setWorkoutLogOpen(true); }}>
                                <Pencil size={13} className="mr-2" />Edit
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        {exercises.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {exercises.slice(0, 5).map((ex, i) => (
                              <Badge key={i} variant="secondary" className="text-xs">{ex.name}</Badge>
                            ))}
                            {exercises.length > 5 && <Badge variant="secondary" className="text-xs">+{exercises.length - 5}</Badge>}
                          </div>
                        )}
                        {log.notes && <p className="text-xs text-muted-foreground mt-1.5 line-clamp-1">{log.notes}</p>}
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <HabitModal
        open={habitModalOpen}
        onClose={() => { setHabitModalOpen(false); setEditHabit(null); }}
        edit={editHabit}
      />

      <WorkoutLogModal
        open={workoutLogOpen}
        onClose={() => { setWorkoutLogOpen(false); setEditWorkoutLog(null); }}
        templates={workoutTemplates}
        editLog={editWorkoutLog}
      />
    </div>
  );
}
