import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format, parseISO } from "date-fns";
import {
  Plus, Target, Pencil, Trash2, MoreHorizontal, Check,
  Circle, CheckCircle2, ChevronRight, RefreshCw, Folder,
  ClipboardList, Flag, X, Inbox, Leaf, Droplets, Heart, Dumbbell, Apple, BookOpen, Calendar,
  Users, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { daysUntil, PROGRESS_TYPES } from "@/lib/plannerUtils";
import GoalFormModal from "@/components/modals/GoalFormModal";
import type {
  GoalWithProjects, Goal, ProjectWithTasks, Project,
  ProjectTask, InsertProject, InsertProjectTask, InsertGoal,
  GeneralTask, InsertGeneralTask, Chore, InsertChore, HouseProjectWithTasks, Plant,
  NutritionGoal, WorkoutPlan, ReadingGoal, BookWithSessions, Hobby, PublicUser,
} from "@shared/schema";
import { Link } from "wouter";
import { Home } from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────
const PRIORITY_COLORS: Record<string, string> = {
  high:   "text-red-600 dark:text-red-400",
  medium: "text-amber-600 dark:text-amber-400",
  low:    "text-muted-foreground",
};

const PROJECT_STATUSES = [
  { value: "not_started", label: "Not Started", dot: "bg-muted-foreground" },
  { value: "in_progress", label: "In Progress", dot: "bg-blue-500"         },
  { value: "done",        label: "Done",         dot: "bg-emerald-500"     },
  { value: "blocked",     label: "Blocked",      dot: "bg-red-500"         },
];

const STATUS_PILL: Record<string, string> = {
  not_started: "bg-secondary text-muted-foreground border-border",
  in_progress: "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  done:        "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
  blocked:     "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800",
};

const TASK_PRIORITIES = ["high", "medium", "low"];

// ── Helpers ───────────────────────────────────────────────────────────────────
function goalPct(g: GoalWithProjects): number {
  if (g.progressType === "boolean") return g.progressCurrent >= g.progressTarget ? 100 : 0;
  return g.progressTarget > 0 ? Math.min(100, Math.round((g.progressCurrent / g.progressTarget) * 100)) : 0;
}

function projectPct(p: ProjectWithTasks): number {
  if (!p.tasks.length) return p.status === "done" ? 100 : 0;
  const done = p.tasks.filter((t) => t.completed).length;
  return Math.round((done / p.tasks.length) * 100);
}

// ── Buddy helpers ─────────────────────────────────────────────────────────────
const INLINE_PRIORITIES = ["low", "medium", "high"] as const;

function BuddyAvatarSm({ user, size = 24 }: { user: PublicUser; size?: number }) {
  const initials = user.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  if (user.avatarUrl) return <img src={user.avatarUrl} alt={user.name} className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />;
  return (
    <div className="rounded-full bg-primary/15 text-primary font-semibold flex items-center justify-center shrink-0" style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}>
      {initials}
    </div>
  );
}

function BuddySearchPicker({ value, onChange, friends }: {
  value: number | null;
  onChange: (id: number | null) => void;
  friends: PublicUser[];
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = friends.find((f) => f.id === value) ?? null;
  const filtered = query
    ? friends.filter((f) => f.name.toLowerCase().includes(query.toLowerCase()) || f.email.toLowerCase().includes(query.toLowerCase()))
    : friends;

  if (selected) {
    return (
      <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border bg-primary/5 border-primary/20">
        <BuddyAvatarSm user={selected} size={22} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium leading-tight">{selected.name}</p>
          <p className="text-[10px] text-muted-foreground">Accountabilibuddy</p>
        </div>
        <button type="button" onClick={() => onChange(null)} className="p-1 rounded hover:bg-muted transition-colors" aria-label="Remove buddy">
          <X size={12} className="text-muted-foreground" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search friends…"
          className="h-8 text-xs pl-7"
        />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-20 top-full mt-1 w-full rounded-lg border bg-popover shadow-md overflow-hidden">
          {filtered.map((f) => (
            <button
              key={f.id}
              type="button"
              onMouseDown={() => { onChange(f.id); setQuery(""); setOpen(false); }}
              className="flex items-center gap-2 w-full px-3 py-2 hover:bg-accent text-left transition-colors"
            >
              <BuddyAvatarSm user={f} size={22} />
              <div className="min-w-0">
                <p className="text-xs font-medium leading-tight">{f.name}</p>
                <p className="text-[10px] text-muted-foreground truncate">{f.email}</p>
              </div>
            </button>
          ))}
        </div>
      )}
      {open && query && filtered.length === 0 && (
        <div className="absolute z-20 top-full mt-1 w-full rounded-lg border bg-popover shadow-md p-3">
          <p className="text-xs text-muted-foreground text-center">No friends found</p>
        </div>
      )}
    </div>
  );
}

// ── Inline goal editor (shown at top of Projects column) ──────────────────────
function InlineGoalEditor({ goal, friends, onSave }: {
  goal: GoalWithProjects;
  friends: PublicUser[];
  onSave: (data: { id: number } & Partial<InsertGoal>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState(goal.title);
  const [priority, setPriority] = useState(goal.priority);
  const [current, setCurrent] = useState(goal.progressCurrent.toString());
  const [target, setTarget] = useState(goal.progressTarget.toString());
  const [targetDate, setTargetDate] = useState(goal.targetDate ?? "");
  const [buddyUserId, setBuddyUserId] = useState<number | null>((goal as any).buddyUserId ?? null);

  const reset = useCallback(() => {
    setTitle(goal.title);
    setPriority(goal.priority);
    setCurrent(goal.progressCurrent.toString());
    setTarget(goal.progressTarget.toString());
    setTargetDate(goal.targetDate ?? "");
    setBuddyUserId((goal as any).buddyUserId ?? null);
  }, [goal]);

  useEffect(() => { reset(); setExpanded(false); }, [goal.id]);

  const isDirty =
    title.trim() !== goal.title ||
    priority !== goal.priority ||
    parseFloat(current) !== goal.progressCurrent ||
    parseFloat(target) !== goal.progressTarget ||
    (targetDate || null) !== (goal.targetDate ?? null) ||
    (buddyUserId ?? null) !== ((goal as any).buddyUserId ?? null);

  const handleSave = () => {
    onSave({
      id: goal.id,
      title: title.trim() || goal.title,
      priority,
      progressCurrent: parseFloat(current) || 0,
      progressTarget: parseFloat(target) || goal.progressTarget,
      targetDate: targetDate || null,
      buddyUserId: buddyUserId ?? null,
    });
    setExpanded(false);
  };

  const buddy = friends.find((f) => f.id === ((goal as any).buddyUserId ?? null)) ?? null;

  if (!expanded) {
    return (
      <div className="rounded-xl border bg-secondary/30 p-3 mb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-tight truncate">{goal.title}</p>
            <p className="text-xs text-muted-foreground capitalize mt-0.5">
              {goal.category} · <span className={PRIORITY_COLORS[goal.priority]}>{goal.priority}</span>
            </p>
            {buddy && (
              <div className="flex items-center gap-1.5 mt-1.5">
                <BuddyAvatarSm user={buddy} size={16} />
                <span className="text-xs text-muted-foreground">
                  <span className="text-primary/80 font-medium">{buddy.name.split(" ")[0]}</span> is your buddy
                </span>
              </div>
            )}
          </div>
          <button
            onClick={() => setExpanded(true)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border rounded-lg px-2 py-1 hover:bg-muted transition-all shrink-0"
          >
            <Pencil size={10} /> Edit
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-secondary/30 p-3 mb-2 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Edit Goal</p>
        <button onClick={() => { setExpanded(false); reset(); }} className="p-1 hover:bg-muted rounded transition-colors">
          <X size={12} className="text-muted-foreground" />
        </button>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Title</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-8 text-xs" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Priority</Label>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {INLINE_PRIORITIES.map((p) => (
                <SelectItem key={p} value={p} className="text-xs">{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Target Date</Label>
          <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className="h-8 text-xs" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Current</Label>
          <Input type="number" value={current} onChange={(e) => setCurrent(e.target.value)} step="0.1" className="h-8 text-xs" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Target</Label>
          <Input type="number" value={target} onChange={(e) => setTarget(e.target.value)} step="0.1" className="h-8 text-xs" />
        </div>
      </div>

      {friends.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <Users size={11} className="text-muted-foreground" />
            <Label className="text-xs">Accountabilibuddy</Label>
          </div>
          <BuddySearchPicker value={buddyUserId} onChange={setBuddyUserId} friends={friends} />
        </div>
      )}

      <Button size="sm" className="w-full h-8 text-xs" onClick={handleSave} disabled={!isDirty}>
        Save Changes
      </Button>
    </div>
  );
}

// ── Inline quick-add row ──────────────────────────────────────────────────────
function QuickAdd({ placeholder, onAdd, className = "" }: {
  placeholder: string; onAdd: (title: string) => void; className?: string;
}) {
  const [val, setVal] = useState("");
  const [open, setOpen] = useState(false);
  const submit = () => { if (!val.trim()) return; onAdd(val.trim()); setVal(""); setOpen(false); };
  if (!open) return (
    <button onClick={() => setOpen(true)} className={`flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors ${className}`}>
      <Plus size={12} /> {placeholder}
    </button>
  );
  return (
    <div className="flex gap-1.5">
      <Input value={val} onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") { setOpen(false); setVal(""); } }}
        placeholder={placeholder} className="h-7 text-xs flex-1" autoFocus />
      <Button size="sm" className="h-7 px-2" onClick={submit}><Check size={12} /></Button>
      <Button size="sm" variant="ghost" className="h-7 px-1" onClick={() => { setOpen(false); setVal(""); }}><X size={12} /></Button>
    </div>
  );
}

// Sentinel values for pseudo-goal cards
const STANDALONE_ID = -1;
const HOUSEKEEPING_ID = -2;
const ALL_TASKS_ID = -3;
const PLANTS_ID = -4;
const NUTRITION_ID = -5;
const WORKOUT_GOALS_ID = -6;
const READING_GOAL_ID = -7;
const HOBBY_GOALS_ID = -8;

// Hobby plan/goal helpers (mirror of HobbiesPage logic)
function _parsePlans(extraJson: string): any[] {
  try { const o = JSON.parse(extraJson || "{}"); return Array.isArray(o.plans) ? o.plans : []; } catch { return []; }
}
function _parseGoals(extraJson: string): any[] {
  try { const o = JSON.parse(extraJson || "{}"); return Array.isArray(o.goals) ? o.goals : []; } catch { return []; }
}

// Plant watering helpers
function plantWateringDays(plant: Plant): number | null {
  if (!plant.lastWatered) return null;
  const next = new Date(plant.lastWatered).getTime() + plant.waterFrequencyDays * 86400000;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((next - today.getTime()) / 86400000);
}

export default function GoalsPage() {
  const { toast } = useToast();
  const [goalModal, setGoalModal] = useState(false);
  const [editGoal, setEditGoal] = useState<Goal | null>(null);
  const [projectEditModal, setProjectEditModal] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectWithTasks | null>(null);
  const [choreEditModal, setChoreEditModal] = useState(false);
  const [editingChore, setEditingChore] = useState<Chore | null>(null);
  // selectedGoalId = null (nothing), a real goalId, or STANDALONE_ID (-1)
  const [selectedGoalId, setSelectedGoalId] = useState<number | null>(null);
  const [selectedHobbyPlanKey, setSelectedHobbyPlanKey] = useState<string | null>(null); // "{hobbyId}_{planId}"
  const [mobileTab, setMobileTab] = useState<"goals" | "projects" | "tasks">("goals");
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);

  const { data: goals = [] } = useQuery<GoalWithProjects[]>({ queryKey: ["/api/goals"] });
  const { data: standaloneProjects = [] } = useQuery<ProjectWithTasks[]>({ queryKey: ["/api/projects/standalone"] });
  const { data: generalTasksData = [] } = useQuery<GeneralTask[]>({ queryKey: ["/api/general-tasks"] });
  const { data: chores = [] } = useQuery<Chore[]>({ queryKey: ["/api/chores"] });
  const { data: houseProjects = [] } = useQuery<HouseProjectWithTasks[]>({ queryKey: ["/api/house-projects"] });
  const { data: plants = [] } = useQuery<Plant[]>({ queryKey: ["/api/plants"] });
  const { data: nutritionGoal } = useQuery<NutritionGoal | null>({ queryKey: ["/api/nutrition/goals"] });
  const { data: workoutPlans = [] } = useQuery<WorkoutPlan[]>({ queryKey: ["/api/workout-plans"] });
  const { data: readingGoal } = useQuery<ReadingGoal | null>({ queryKey: ["/api/reading/goal"] });
  const { data: books = [] } = useQuery<BookWithSessions[]>({ queryKey: ["/api/books"] });
  const { data: hobbies = [] } = useQuery<Hobby[]>({ queryKey: ["/api/hobbies"] });
  const { data: friends = [] } = useQuery<PublicUser[]>({
    queryKey: ["/api/friends"],
    queryFn: async () => (await apiRequest("GET", "/api/friends")).json(),
  });

  const inv = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/goals"] });
    queryClient.invalidateQueries({ queryKey: ["/api/projects/standalone"] });
    queryClient.invalidateQueries({ queryKey: ["/api/general-tasks"] });
  };
  const invHouse = () => queryClient.invalidateQueries({ queryKey: ["/api/house-projects"] });
  const invChores = () => queryClient.invalidateQueries({ queryKey: ["/api/chores"] });
  const invPlants = () => queryClient.invalidateQueries({ queryKey: ["/api/plants"] });

  // ── Plant mutations ───────────────────────────────────────────────────────
  const waterPlant = useMutation({
    mutationFn: (plant: Plant) => apiRequest("PATCH", `/api/plants/${plant.id}`, {
      lastWatered: new Date().toISOString().slice(0, 10),
    }),
    onSuccess: () => { invPlants(); toast({ title: "Watered 💧" }); },
  });

  // ── Chore mutations ──────────────────────────────────────────────────────
  const updateChore = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<InsertChore> }) =>
      apiRequest("PATCH", `/api/chores/${id}`, data),
    onSuccess: invChores,
  });
  const completeChore = useMutation({
    mutationFn: (chore: Chore) => {
      const freqDays: Record<string, number> = { daily: 1, weekly: 7, biweekly: 14, monthly: 30, quarterly: 91, yearly: 365 };
      const days = chore.frequency === "custom" ? (chore.customFrequencyDays ?? 7) : (freqDays[chore.frequency] ?? 7);
      const next = new Date(); next.setHours(0,0,0,0); next.setDate(next.getDate() + days);
      return apiRequest("PATCH", `/api/chores/${chore.id}`, {
        lastCompleted: new Date().toISOString().slice(0, 10),
        nextDue: chore.frequency === "as_needed" ? chore.nextDue : next.toISOString().slice(0, 10),
      });
    },
    onSuccess: () => { invChores(); toast({ title: "Chore marked complete ✓" }); },
  });

  // ── Goal mutations ───────────────────────────────────────────────────────
  const deleteGoal = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/goals/${id}`),
    onSuccess: () => { inv(); toast({ title: "Goal deleted" }); setSelectedGoalId(null); setSelectedProjectId(null); },
  });
  const updateGoal = useMutation({
    mutationFn: ({ id, ...data }: { id: number } & Partial<InsertGoal>) =>
      apiRequest("PATCH", `/api/goals/${id}`, data),
    onSuccess: () => { inv(); toast({ title: "Goal updated" }); },
  });

  // ── Project mutations ────────────────────────────────────────────────────
  const addProject = useMutation({
    mutationFn: ({ goalId, title }: { goalId: number; title: string }) =>
      apiRequest("POST", `/api/goals/${goalId}/projects`, { title, status: "not_started", sortOrder: 0 }),
    onSuccess: inv,
  });
  const updateProject = useMutation({
    mutationFn: ({ id, ...data }: { id: number } & Partial<InsertProject>) =>
      apiRequest("PATCH", `/api/projects/${id}`, data),
    onSuccess: inv,
  });
  const deleteProject = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/projects/${id}`),
    onSuccess: () => { inv(); setSelectedProjectId(null); },
  });

  // ── Task mutations ────────────────────────────────────────────────────────
  const addTask = useMutation({
    mutationFn: ({ projectId, title }: { projectId: number; title: string }) =>
      apiRequest("POST", `/api/projects/${projectId}/tasks`, { title, completed: false, priority: "medium", sortOrder: 0 }),
    onSuccess: inv,
  });
  const toggleTask = useMutation({
    mutationFn: ({ id, completed }: { id: number; completed: boolean }) =>
      apiRequest("PATCH", `/api/project-tasks/${id}`, { completed }),
    onSuccess: inv,
  });
  const updateTask = useMutation({
    mutationFn: ({ id, ...data }: { id: number } & Partial<InsertProjectTask>) =>
      apiRequest("PATCH", `/api/project-tasks/${id}`, data),
    onSuccess: inv,
  });
  const deleteTask = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/project-tasks/${id}`),
    onSuccess: inv,
  });

  // ── Standalone project mutations ──────────────────────────────────────────
  const addStandaloneProject = useMutation({
    mutationFn: (title: string) => apiRequest("POST", "/api/projects/standalone", { title, status: "not_started", sortOrder: 0 }),
    onSuccess: inv,
  });

  // ── General task mutations ─────────────────────────────────────────────────
  const addGeneralTask = useMutation({
    mutationFn: (title: string) => apiRequest("POST", "/api/general-tasks", { title, completed: false, priority: "medium", sortOrder: generalTasksData.length }),
    onSuccess: inv,
  });
  const toggleGeneralTask = useMutation({
    mutationFn: ({ id, completed }: { id: number; completed: boolean }) => apiRequest("PATCH", `/api/general-tasks/${id}`, { completed }),
    onSuccess: inv,
  });
  const updateGeneralTask = useMutation({
    mutationFn: ({ id, ...data }: { id: number } & Partial<InsertGeneralTask>) => apiRequest("PATCH", `/api/general-tasks/${id}`, data),
    onSuccess: inv,
  });
  const deleteGeneralTask = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/general-tasks/${id}`),
    onSuccess: inv,
  });

  // ── House project mutations ───────────────────────────────────────────────
  const addHouseProject = useMutation({
    mutationFn: (title: string) => apiRequest("POST", "/api/house-projects", { title, status: "not_started", priority: "medium", category: "other" }),
    onSuccess: invHouse,
  });
  const addHouseProjectTask = useMutation({
    mutationFn: ({ projectId, title }: { projectId: number; title: string }) =>
      apiRequest("POST", `/api/house-projects/${projectId}/tasks`, { title, completed: false, priority: "medium", sortOrder: 0 }),
    onSuccess: invHouse,
  });
  const toggleHouseProjectTask = useMutation({
    mutationFn: ({ id, completed }: { id: number; completed: boolean }) =>
      apiRequest("PATCH", `/api/house-project-tasks/${id}`, { completed }),
    onSuccess: invHouse,
  });
  const deleteHouseProjectTask = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/house-project-tasks/${id}`),
    onSuccess: invHouse,
  });

  // ── Derived state ─────────────────────────────────────────────────────────
  const selectedGoal = goals.find((g) => g.id === selectedGoalId) ?? null;
  const isStandaloneSelected = selectedGoalId === STANDALONE_ID;
  const isHousekeepingSelected = selectedGoalId === HOUSEKEEPING_ID;
  const isAllTasksSelected = selectedGoalId === ALL_TASKS_ID;
  const isPlantsSelected = selectedGoalId === PLANTS_ID;
  const isNutritionSelected = selectedGoalId === NUTRITION_ID;
  const isWorkoutGoalsSelected = selectedGoalId === WORKOUT_GOALS_ID;
  const isReadingGoalSelected = selectedGoalId === READING_GOAL_ID;
  const isHobbyGoalsSelected = selectedGoalId === HOBBY_GOALS_ID;
  const activeHobbyPlans = useMemo(() =>
    hobbies.flatMap(h => _parsePlans(h.extraJson ?? "{}").filter((p: any) => p.isActive && !p.completedAt).map((p: any) => ({ ...p, hobby: h }))),
    [hobbies]);
  const activeHobbyGoals = useMemo(() =>
    hobbies.flatMap(h => _parseGoals(h.extraJson ?? "{}").filter((g: any) => g.status === "active").map((g: any) => ({ ...g, hobby: h }))),
    [hobbies]);
  const selectedHobbyPlan = useMemo(() => {
    if (!selectedHobbyPlanKey) return null;
    const [hIdStr, pId] = selectedHobbyPlanKey.split("_");
    const hobby = hobbies.find(h => h.id === Number(hIdStr));
    if (!hobby) return null;
    const plan = _parsePlans(hobby.extraJson ?? "{}").find((p: any) => p.id === pId);
    return plan ? { ...plan, hobby } : null;
  }, [selectedHobbyPlanKey, hobbies]);
  const currentYear = new Date().getFullYear();
  const goalStart = readingGoal?.startDate ?? `${currentYear}-01-01`;
  const goalEnd   = readingGoal?.endDate   ?? `${currentYear}-12-31`;
  const booksFinishedInGoal = useMemo(() =>
    books.filter((b) => {
      if (b.status !== "finished") return false;
      const fd = (b as any).finishDate as string | null;
      return fd && fd >= goalStart && fd <= goalEnd;
    }),
    [books, goalStart, goalEnd]);
  const booksFinishedThisYear = booksFinishedInGoal.length;
  const booksPlannedInGoal = useMemo(() =>
    books.filter((b) => {
      if (b.status === "finished") return false;
      const tfd = b.targetFinishDate;
      return tfd && tfd >= goalStart && tfd <= goalEnd;
    }),
    [books, goalStart, goalEnd]);
  const selectedProject = selectedGoal?.projects.find((p) => p.id === selectedProjectId) ?? null;

  // All tasks across selected goal's projects (for the Tasks column)
  const allTasksForGoal = useMemo(() => {
    if (!selectedGoal) return [];
    return selectedGoal.projects.flatMap((p) =>
      p.tasks.map((t) => ({ ...t, projectTitle: p.title, projectId: p.id }))
    );
  }, [selectedGoal]);

  // For standalone mode: selected project's tasks OR general tasks
  const standaloneProjectTasks = useMemo(() => {
    if (!isStandaloneSelected) return [];
    const sp = standaloneProjects.find((p) => p.id === selectedProjectId);
    if (sp) return sp.tasks.map((t) => ({ ...t, projectTitle: sp.title, projectId: sp.id }));
    // No project selected in standalone mode — show all standalone project tasks + general tasks
    return standaloneProjects.flatMap((p) => p.tasks.map((t) => ({ ...t, projectTitle: p.title, projectId: p.id })));
  }, [isStandaloneSelected, standaloneProjects, selectedProjectId]);

  const tasksToShow = isStandaloneSelected
    ? standaloneProjectTasks
    : selectedProject
      ? selectedProject.tasks.map((t) => ({ ...t, projectTitle: selectedProject.title, projectId: selectedProject.id }))
      : allTasksForGoal;

  const standaloneSelectedProject = isStandaloneSelected
    ? standaloneProjects.find((p) => p.id === selectedProjectId) ?? null
    : null;

  // ── Stat summary ──────────────────────────────────────────────────────────
  const totalTasks = tasksToShow.length;
  const doneTasks = tasksToShow.filter((t) => t.completed).length;

  return (
    <div className="h-[calc(100vh-0px)] flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b flex items-center justify-between gap-3 shrink-0 flex-wrap">
        <h1 className="text-2xl font-bold">Goals, Projects & Tasks</h1>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => { addStandaloneProject.mutate("New Project"); setSelectedGoalId(STANDALONE_ID); setSelectedProjectId(null); }} className="gap-1.5">
            <Plus size={13} /><Folder size={13} />Project
          </Button>
          <Button size="sm" variant="outline" onClick={() => { addGeneralTask.mutate("New Task"); setSelectedGoalId(STANDALONE_ID); setSelectedProjectId(null); }} className="gap-1.5">
            <Plus size={13} /><ClipboardList size={13} />Task
          </Button>
          <Button size="sm" onClick={() => { setEditGoal(null); setGoalModal(true); }} className="gap-1.5">
            <Plus size={13} /><Target size={13} />Goal
          </Button>
        </div>
      </div>

      {/* Mobile tab bar — only visible on small screens */}
      <div className="md:hidden flex border-b shrink-0">
        {(["goals", "projects", "tasks"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setMobileTab(tab)}
            className={`flex-1 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
              mobileTab === tab
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* 3-column layout */}
      <div className="flex flex-1 min-h-0 divide-x">

        {/* ── Column 1: Goals ───────────────────────────────────────────── */}
        <div className={`shrink-0 flex flex-col min-h-0 w-full md:w-72 ${mobileTab !== "goals" ? "hidden md:flex" : "flex"}`}>
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Goals</span>
            <span className="text-xs text-muted-foreground">{goals.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {goals.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Target size={28} className="mx-auto mb-3 opacity-20" />
                <p className="text-xs">No goals yet</p>
              </div>
            )}
            {goals.map((g) => {
              const pct = goalPct(g);
              const isSelected = g.id === selectedGoalId;
              const d = g.targetDate ? daysUntil(g.targetDate) : null;
              const buddy = g.buddyUserId ? friends.find((f) => f.id === g.buddyUserId) : null;
              return (
                <div key={g.id}
                  onClick={() => { setSelectedGoalId(isSelected ? null : g.id); setSelectedProjectId(null); if (!isSelected) setMobileTab("projects"); }}
                  className={`group rounded-xl border p-3 cursor-pointer transition-all hover:shadow-sm ${isSelected ? "border-primary bg-primary/5" : "bg-card hover:border-primary/30"}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-semibold leading-tight truncate">{g.title}</p>
                        {g.recurring !== "none" && <RefreshCw size={10} className="text-muted-foreground shrink-0" />}
                      </div>
                      <p className="text-xs text-muted-foreground capitalize mt-0.5">{g.category}</p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0">
                          <MoreHorizontal size={13} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setEditGoal(g); setGoalModal(true); }}>
                          <Pencil size={13} className="mr-2" />Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={(e) => { e.stopPropagation(); deleteGoal.mutate(g.id); }}
                        >
                          <Trash2 size={13} className="mr-2" />Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="flex items-center gap-2 mb-1.5">
                    <Progress value={pct} className="h-1.5 flex-1" />
                    <span className="text-xs text-muted-foreground shrink-0">{pct}%</span>
                  </div>

                  {/* Accountabilibuddy chip */}
                  {buddy && (
                    <div className="flex items-center gap-1.5 mb-1.5">
                      {buddy.avatarUrl ? (
                        <img src={buddy.avatarUrl} alt={buddy.name} className="w-4 h-4 rounded-full object-cover border border-background" />
                      ) : (
                        <div className="w-4 h-4 rounded-full bg-primary/20 text-primary text-[8px] font-bold flex items-center justify-center border border-background">
                          {buddy.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <span className="text-xs text-muted-foreground">
                        <span className="text-primary/80 font-medium">{buddy.name.split(" ")[0]}</span>
                        {" "}is your buddy
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-semibold ${PRIORITY_COLORS[g.priority]}`}>{g.priority}</span>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {d !== null && (
                        <span className={d < 0 ? "text-destructive font-medium" : d <= 7 ? "text-amber-600 dark:text-amber-400 font-medium" : ""}>
                          {d < 0 ? "overdue" : `${d}d`}
                        </span>
                      )}
                      <span>{g.projects.length} project{g.projects.length !== 1 ? "s" : ""}</span>
                      <ChevronRight size={12} className={`transition-transform ${isSelected ? "rotate-90" : ""}`} />
                    </div>
                  </div>
                </div>
              );
            })}
            {/* General (standalone) card */}
            <div
              onClick={() => { setSelectedGoalId(selectedGoalId === STANDALONE_ID ? null : STANDALONE_ID); setSelectedProjectId(null); }}
              className={`group rounded-xl border p-3 cursor-pointer transition-all hover:shadow-sm mt-2 ${
                selectedGoalId === STANDALONE_ID ? "border-primary bg-primary/5" : "bg-card border-dashed hover:border-primary/30"
              }`}
            >
              <div className="flex items-center gap-2">
                <Inbox size={15} className="text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">General</p>
                  <p className="text-xs text-muted-foreground">{standaloneProjects.length} project{standaloneProjects.length !== 1 ? "s" : ""} · {generalTasksData.length} task{generalTasksData.length !== 1 ? "s" : ""}</p>
                </div>
                <ChevronRight size={12} className={`text-muted-foreground transition-transform ${selectedGoalId === STANDALONE_ID ? "rotate-90" : ""}`} />
              </div>
            </div>

            {/* Housekeeping card */}
            <div
              onClick={() => { setSelectedGoalId(selectedGoalId === HOUSEKEEPING_ID ? null : HOUSEKEEPING_ID); setSelectedProjectId(null); }}
              className={`group rounded-xl border p-3 cursor-pointer transition-all hover:shadow-sm mt-1 ${
                selectedGoalId === HOUSEKEEPING_ID ? "border-orange-400 bg-orange-50 dark:bg-orange-950/20" : "bg-card border-dashed hover:border-orange-300"
              }`}
            >
              <div className="flex items-center gap-2">
                <Home size={15} className="text-orange-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">Housekeeping</p>
                  <p className="text-xs text-muted-foreground">{houseProjects.length} project{houseProjects.length !== 1 ? "s" : ""} · {chores.filter(c => c.isActive).length} chore{chores.filter(c => c.isActive).length !== 1 ? "s" : ""}</p>
                </div>
                <ChevronRight size={12} className={`text-muted-foreground transition-transform ${selectedGoalId === HOUSEKEEPING_ID ? "rotate-90" : ""}`} />
              </div>
            </div>

            {/* Plants card */}
            {plants.length > 0 && (() => {
              const needsWater = plants.filter(p => { const d = plantWateringDays(p); return d === null || d <= 0; }).length;
              return (
                <div
                  onClick={() => { setSelectedGoalId(selectedGoalId === PLANTS_ID ? null : PLANTS_ID); setSelectedProjectId(null); }}
                  className={`group rounded-xl border p-3 cursor-pointer transition-all hover:shadow-sm mt-1 ${
                    selectedGoalId === PLANTS_ID ? "border-green-400 bg-green-50 dark:bg-green-950/20" : "bg-card border-dashed hover:border-green-300"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Leaf size={15} className="text-green-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">Plants</p>
                      <p className="text-xs text-muted-foreground">
                        {plants.length} plant{plants.length !== 1 ? "s" : ""}
                        {needsWater > 0 && <span className="text-amber-600 font-medium"> · {needsWater} need water</span>}
                      </p>
                    </div>
                    <ChevronRight size={12} className={`text-muted-foreground transition-transform ${selectedGoalId === PLANTS_ID ? "rotate-90" : ""}`} />
                  </div>
                </div>
              );
            })()}

            {/* Nutrition Goals card */}
            {nutritionGoal && (
              <div
                onClick={() => { setSelectedGoalId(selectedGoalId === NUTRITION_ID ? null : NUTRITION_ID); setSelectedProjectId(null); }}
                className={`group rounded-xl border p-3 cursor-pointer transition-all hover:shadow-sm mt-1 ${
                  selectedGoalId === NUTRITION_ID ? "border-rose-400 bg-rose-50 dark:bg-rose-950/20" : "bg-card border-dashed hover:border-rose-300"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Apple size={15} className="text-rose-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">Nutrition Goals</p>
                    <p className="text-xs text-muted-foreground">{nutritionGoal.calories} cal · {nutritionGoal.protein}g protein</p>
                  </div>
                  <ChevronRight size={12} className={`text-muted-foreground transition-transform ${selectedGoalId === NUTRITION_ID ? "rotate-90" : ""}`} />
                </div>
              </div>
            )}

            {/* Active Workout Plan card — only shown when a plan is active */}
            {(() => {
              const activePlan = workoutPlans.find(p => p.isActive);
              if (!activePlan) return null;
              const weeksElapsed = activePlan.startDate
                ? Math.floor((Date.now() - new Date(activePlan.startDate).getTime()) / (7 * 86400000))
                : null;
              const pct = (weeksElapsed !== null && activePlan.durationWeeks > 0)
                ? Math.min(100, Math.round((weeksElapsed / activePlan.durationWeeks) * 100))
                : 0;
              const isSelected = selectedGoalId === WORKOUT_GOALS_ID;
              return (
                <div
                  onClick={() => { setSelectedGoalId(isSelected ? null : WORKOUT_GOALS_ID); setSelectedProjectId(null); }}
                  className={`group rounded-xl border p-3 cursor-pointer transition-all hover:shadow-sm mt-1 ${
                    isSelected ? "border-blue-400 bg-blue-50 dark:bg-blue-950/20" : "bg-card hover:border-blue-300"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <Dumbbell size={13} className="text-blue-500 shrink-0" />
                        <p className="text-sm font-semibold truncate">{activePlan.name}</p>
                      </div>
                      <p className="text-xs text-muted-foreground capitalize">{activePlan.goalType.replace(/_/g, " ")} · {activePlan.durationWeeks}w plan</p>
                    </div>
                    <ChevronRight size={12} className={`text-muted-foreground transition-transform shrink-0 mt-1 ${isSelected ? "rotate-90" : ""}`} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Progress value={pct} className="h-1.5 flex-1" />
                    <span className="text-xs text-muted-foreground shrink-0">{pct}%</span>
                  </div>
                  {weeksElapsed !== null && (
                    <p className="text-xs text-muted-foreground mt-1">Week {Math.min(weeksElapsed + 1, activePlan.durationWeeks)} of {activePlan.durationWeeks}</p>
                  )}
                </div>
              );
            })()}

            {/* Reading Goal card */}
            {readingGoal && (() => {
              const pct = Math.min(100, Math.round((booksFinishedThisYear / readingGoal.booksTarget) * 100));
              return (
                <div
                  onClick={() => { setSelectedGoalId(selectedGoalId === READING_GOAL_ID ? null : READING_GOAL_ID); setSelectedProjectId(null); }}
                  className={`group rounded-xl border p-3 cursor-pointer transition-all hover:shadow-sm mt-1 ${
                    selectedGoalId === READING_GOAL_ID ? "border-amber-400 bg-amber-50 dark:bg-amber-950/20" : "bg-card border-dashed hover:border-amber-300"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <BookOpen size={15} className="text-amber-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">Reading Goal</p>
                      <p className="text-xs text-muted-foreground">{booksFinishedThisYear} / {readingGoal.booksTarget} books in {currentYear}</p>
                    </div>
                    <ChevronRight size={12} className={`text-muted-foreground transition-transform ${selectedGoalId === READING_GOAL_ID ? "rotate-90" : ""}`} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Progress value={pct} className="h-1.5 flex-1" />
                    <span className="text-xs text-muted-foreground shrink-0">{pct}%</span>
                  </div>
                </div>
              );
            })()}

            {/* Individual active hobby plan cards */}
            {activeHobbyPlans.map((p: any) => {
              const key = `${p.hobby.id}_${p.id}`;
              const isSelected = selectedGoalId === HOBBY_GOALS_ID && selectedHobbyPlanKey === key;
              const done = (p.steps ?? []).filter((s: any) => s.done).length;
              const total = (p.steps ?? []).length;
              const pct = total ? Math.round((done / total) * 100) : 0;
              const typeColors: Record<string, string> = { creative: "#ec4899", collection: "#f97316", outdoor: "#10b981", games: "#6366f1", learning: "#3b82f6", performance: "#8b5cf6" };
              const color = typeColors[p.hobby.hobbyType] ?? "#6366f1";
              return (
                <div
                  key={key}
                  onClick={() => { setSelectedGoalId(HOBBY_GOALS_ID); setSelectedHobbyPlanKey(isSelected ? null : key); setSelectedProjectId(null); }}
                  className={`group rounded-xl border p-3 cursor-pointer transition-all hover:shadow-sm mt-1 ${
                    isSelected ? "border-blue-400 bg-blue-50 dark:bg-blue-950/20" : "bg-card hover:border-blue-300"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <ClipboardList size={13} style={{ color }} className="shrink-0" />
                        <p className="text-sm font-semibold truncate">{p.title}</p>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Heart size={10} style={{ color }} />
                        <span>{p.hobby.name}</span>
                        {p.durationWeeks && <span>· {p.durationWeeks}w</span>}
                        <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/40 px-1.5 py-0.5 rounded-full border border-blue-200 dark:border-blue-800 ml-auto">Active</span>
                      </div>
                    </div>
                    <ChevronRight size={12} className={`text-muted-foreground transition-transform shrink-0 mt-1 ${isSelected ? "rotate-90" : ""}`} />
                  </div>
                  {total > 0 && (
                    <div className="flex items-center gap-2">
                      <Progress value={pct} className="h-1.5 flex-1" />
                      <span className="text-xs text-muted-foreground shrink-0">{pct}%</span>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Active hobby goals (grouped) */}
            {activeHobbyGoals.length > 0 && (
              <div
                onClick={() => { setSelectedGoalId(selectedGoalId === HOBBY_GOALS_ID && !selectedHobbyPlanKey ? null : HOBBY_GOALS_ID); setSelectedHobbyPlanKey(null); setSelectedProjectId(null); }}
                className={`group rounded-xl border p-3 cursor-pointer transition-all hover:shadow-sm mt-1 ${
                  selectedGoalId === HOBBY_GOALS_ID && !selectedHobbyPlanKey ? "border-amber-400 bg-amber-50 dark:bg-amber-950/20" : "bg-card hover:border-amber-300"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Target size={13} className="text-amber-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">Hobby Goals</p>
                    <p className="text-xs text-muted-foreground">{activeHobbyGoals.length} active goal{activeHobbyGoals.length !== 1 ? "s" : ""}</p>
                  </div>
                  <ChevronRight size={12} className={`text-muted-foreground transition-transform shrink-0 ${selectedGoalId === HOBBY_GOALS_ID && !selectedHobbyPlanKey ? "rotate-90" : ""}`} />
                </div>
              </div>
            )}

            {/* All Tasks card */}
            <div
              onClick={() => { setSelectedGoalId(selectedGoalId === ALL_TASKS_ID ? null : ALL_TASKS_ID); setSelectedProjectId(null); }}
              className={`group rounded-xl border p-3 cursor-pointer transition-all hover:shadow-sm mt-1 ${
                selectedGoalId === ALL_TASKS_ID ? "border-violet-400 bg-violet-50 dark:bg-violet-950/20" : "bg-card border-dashed hover:border-violet-300"
              }`}
            >
              <div className="flex items-center gap-2">
                <ClipboardList size={15} className="text-violet-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">All Tasks</p>
                  <p className="text-xs text-muted-foreground">Every task across all goals &amp; projects</p>
                </div>
                <ChevronRight size={12} className={`text-muted-foreground transition-transform ${selectedGoalId === ALL_TASKS_ID ? "rotate-90" : ""}`} />
              </div>
            </div>

          </div>
        </div>

        {/* ── Column 2: Projects ─────────────────────────────────────────── */}
        <div className={`shrink-0 flex flex-col min-h-0 w-full md:w-72 ${mobileTab !== "projects" ? "hidden md:flex" : "flex"}`}>
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              {isAllTasksSelected ? "Overview"
                : isPlantsSelected ? "Overview"
                : isNutritionSelected ? "Overview"
                : isWorkoutGoalsSelected ? "Overview"
                : isReadingGoalSelected ? "Overview"
                : isHobbyGoalsSelected && selectedHobbyPlan ? "Plan Detail"
                : isHobbyGoalsSelected ? "Hobby Goals"
                : isHousekeepingSelected ? "House Projects"
                : isStandaloneSelected ? "General Projects"
                : selectedGoal ? `Projects — ${selectedGoal.title}` : "Projects"}
            </span>
            {(selectedGoal || isStandaloneSelected || isHousekeepingSelected) && !isAllTasksSelected && !isPlantsSelected && !isNutritionSelected && !isWorkoutGoalsSelected && !isReadingGoalSelected && (
              <span className="text-xs text-muted-foreground">
                {isHousekeepingSelected ? houseProjects.length : isStandaloneSelected ? standaloneProjects.length : selectedGoal?.projects.length}
              </span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {/* All Tasks mode: show summary info */}
            {isAllTasksSelected ? (
              <div className="text-center py-10 text-muted-foreground">
                <ClipboardList size={28} className="mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium">All Tasks View</p>
                <p className="text-xs mt-1 px-2">Tasks from every goal, project, and general list are shown in the Tasks column</p>
              </div>
            ) : /* Plants mode: show summary stats */
            isPlantsSelected ? (
              <div className="text-center py-10 text-muted-foreground">
                <Leaf size={28} className="mx-auto mb-3 opacity-20 text-green-500" />
                <p className="text-sm font-medium">Plant Watering</p>
                <p className="text-xs mt-1 px-2">All plants and their watering schedules are shown in the Tasks column</p>
              </div>
            ) : /* Nutrition Goals mode: show macro targets */
            isNutritionSelected ? (
              <div className="space-y-3">
                <div className="text-center pb-2">
                  <Apple size={24} className="mx-auto mb-2 text-rose-400" />
                  <p className="text-sm font-semibold">Daily Nutrition Targets</p>
                </div>
                {nutritionGoal && (
                  <div className="space-y-2.5">
                    {[
                      { label: "Calories", value: `${nutritionGoal.calories} kcal`, color: "bg-rose-500", pct: 100 },
                      { label: "Protein", value: `${nutritionGoal.protein}g`, color: "bg-blue-500", pct: Math.round((nutritionGoal.protein * 4 / nutritionGoal.calories) * 100) },
                      { label: "Carbs", value: `${nutritionGoal.carbs}g`, color: "bg-amber-500", pct: Math.round((nutritionGoal.carbs * 4 / nutritionGoal.calories) * 100) },
                      { label: "Fat", value: `${nutritionGoal.fat}g`, color: "bg-violet-500", pct: Math.round((nutritionGoal.fat * 9 / nutritionGoal.calories) * 100) },
                      { label: "Water", value: `${nutritionGoal.waterGlasses} glasses`, color: "bg-sky-500", pct: 100 },
                    ].map(({ label, value, color, pct }) => (
                      <div key={label} className="p-2.5 rounded-lg bg-secondary/40">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs font-medium text-muted-foreground">{label}</span>
                          <span className="text-sm font-semibold">{value}</span>
                        </div>
                        {label !== "Water" && label !== "Calories" && (
                          <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                            <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                          </div>
                        )}
                        {label !== "Water" && label !== "Calories" && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">{pct}% of calories</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <Link href="/health"><a className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1 px-1"><Heart size={11} /> Manage in Health</a></Link>
              </div>
            ) : /* Active Workout Plan: show goal overview with milestones as phases */
            isWorkoutGoalsSelected ? (() => {
              const activePlan = workoutPlans.find(p => p.isActive);
              if (!activePlan) return (
                <div className="text-center py-12 text-muted-foreground">
                  <Dumbbell size={28} className="mx-auto mb-3 opacity-20" />
                  <p className="text-xs">No active plan</p>
                  <Link href="/workouts"><a className="text-xs text-primary hover:underline mt-1 block">Set one in Workouts →</a></Link>
                </div>
              );
              let metric: { label: string; current?: number; target?: number; unit?: string } | null = null;
              let milestones: { week: number; description: string; targetValue?: number }[] = [];
              try { if (activePlan.goalMetricJson) metric = JSON.parse(activePlan.goalMetricJson); } catch {}
              try { if (activePlan.milestonesJson) milestones = JSON.parse(activePlan.milestonesJson); } catch {}
              const weeksElapsed = activePlan.startDate
                ? Math.floor((Date.now() - new Date(activePlan.startDate).getTime()) / (7 * 86400000))
                : null;
              const currentWeek = weeksElapsed !== null ? Math.min(weeksElapsed + 1, activePlan.durationWeeks) : null;
              const pct = (weeksElapsed !== null && activePlan.durationWeeks > 0)
                ? Math.min(100, Math.round((weeksElapsed / activePlan.durationWeeks) * 100))
                : 0;
              return (
                <div className="space-y-3">
                  {/* Progress hero */}
                  <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                    <div className="flex justify-between items-end mb-2">
                      <div>
                        {currentWeek !== null && (
                          <>
                            <p className="text-3xl font-bold text-blue-700 dark:text-blue-300">{currentWeek}</p>
                            <p className="text-xs text-muted-foreground">of {activePlan.durationWeeks} weeks</p>
                          </>
                        )}
                      </div>
                      <p className="text-xl font-bold text-blue-600 dark:text-blue-400">{pct}%</p>
                    </div>
                    <Progress value={pct} className="h-2" />
                    {activePlan.startDate && (
                      <p className="text-[10px] text-muted-foreground mt-1 capitalize">{activePlan.goalType.replace(/_/g, " ")}</p>
                    )}
                  </div>
                  {/* Goal metric */}
                  {metric?.target && (
                    <div className="p-2.5 rounded-lg bg-secondary/40">
                      <p className="text-xs text-muted-foreground mb-0.5">Goal Target</p>
                      <p className="text-sm font-semibold">{metric.target}{metric.unit ? ` ${metric.unit}` : ""}</p>
                      {metric.current !== undefined && (
                        <p className="text-xs text-muted-foreground">Currently: {metric.current}{metric.unit ? ` ${metric.unit}` : ""}</p>
                      )}
                    </div>
                  )}
                  {/* Milestones as phases */}
                  {milestones.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">Milestones</p>
                      <div className="space-y-1.5">
                        {milestones.map((m, i) => {
                          const done = currentWeek !== null && currentWeek > m.week;
                          const current = currentWeek !== null && (currentWeek === m.week || (i === 0 && currentWeek < m.week));
                          return (
                            <div key={i} className={`flex items-center gap-3 px-2.5 py-2.5 rounded-xl border transition-colors ${
                              done ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800"
                              : current ? "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800"
                              : "bg-card border-border"
                            }`}>
                              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                done ? "border-emerald-500 bg-emerald-500" : current ? "border-blue-500" : "border-muted-foreground/30"
                              }`}>
                                {done && <Check size={10} className="text-white" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium truncate">{m.description}</p>
                                {m.targetValue !== undefined && <p className="text-[10px] text-muted-foreground">Target: {m.targetValue}{metric?.unit ? ` ${metric.unit}` : ""}</p>}
                              </div>
                              <span className="text-[10px] text-muted-foreground shrink-0">Wk {m.week}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <Link href="/workouts"><a className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1 px-1"><Dumbbell size={11} /> Manage in Workouts</a></Link>
                </div>
              );
            })() : /* Reading Goal mode: show progress overview */
            isReadingGoalSelected ? (
              <div className="space-y-3">
                {readingGoal && (() => {
                  const finished = booksFinishedThisYear;
                  const planned  = booksPlannedInGoal.length;
                  const pct = Math.min(100, Math.round((finished / readingGoal.booksTarget) * 100));
                  const remaining = Math.max(0, readingGoal.booksTarget - finished);
                  const rangeStart = readingGoal.startDate ?? `${currentYear}-01-01`;
                  const rangeEnd   = readingGoal.endDate   ?? `${currentYear}-12-31`;
                  const windowMs = new Date(rangeEnd).getTime() - new Date(rangeStart).getTime();
                  const elapsedMs = Date.now() - new Date(rangeStart).getTime();
                  const windowPct = Math.min(100, Math.max(0, Math.round((elapsedMs / windowMs) * 100)));
                  const rangeLabel = `${format(parseISO(rangeStart), "MMM d")} – ${format(parseISO(rangeEnd), "MMM d, yyyy")}`;
                  return (
                    <div className="space-y-3">
                      {readingGoal.label && (
                        <p className="text-sm font-semibold text-center">{readingGoal.label}</p>
                      )}
                      <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                        <div className="flex justify-between items-end mb-2">
                          <div>
                            <p className="text-3xl font-bold text-amber-700 dark:text-amber-300">{finished}</p>
                            <p className="text-xs text-muted-foreground">of {readingGoal.booksTarget} books</p>
                          </div>
                          <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{pct}%</p>
                        </div>
                        <Progress value={pct} className="h-2" />
                        <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1"><Calendar size={9} />{rangeLabel}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="p-2.5 rounded-lg bg-secondary/40 text-center">
                          <p className="text-lg font-bold">{remaining}</p>
                          <p className="text-[10px] text-muted-foreground">left to read</p>
                        </div>
                        <div className="p-2.5 rounded-lg bg-secondary/40 text-center">
                          <p className={`text-lg font-bold ${pct >= windowPct ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                            {pct >= windowPct ? "On track" : "Behind"}
                          </p>
                          <p className="text-[10px] text-muted-foreground">{windowPct}% of period</p>
                        </div>
                      </div>
                      {planned > 0 && (
                        <div className="p-2.5 rounded-lg bg-secondary/40 text-center">
                          <p className="text-lg font-bold">{planned}</p>
                          <p className="text-[10px] text-muted-foreground">books planned</p>
                        </div>
                      )}
                      <Link href="/reading"><a className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-1"><BookOpen size={11} /> Edit goal in Reading</a></Link>
                    </div>
                  );
                })()}
              </div>
            ) : /* Hobby Plan detail mode */
            isHobbyGoalsSelected && selectedHobbyPlan ? (
              <div className="space-y-4">
                {/* Plan header */}
                <div className="rounded-xl border p-3 space-y-2 bg-blue-50/50 dark:bg-blue-950/10 border-blue-200 dark:border-blue-800">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{selectedHobbyPlan.title}</p>
                      <p className="text-xs text-muted-foreground">{selectedHobbyPlan.hobby.name}{selectedHobbyPlan.durationWeeks ? ` · ${selectedHobbyPlan.durationWeeks}w plan` : ""}</p>
                    </div>
                    <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/40 px-1.5 py-0.5 rounded-full border border-blue-200 dark:border-blue-800 shrink-0">Active</span>
                  </div>
                  {selectedHobbyPlan.description && (
                    <p className="text-xs text-muted-foreground">{selectedHobbyPlan.description}</p>
                  )}
                  {(() => {
                    const steps: any[] = selectedHobbyPlan.steps ?? [];
                    const done = steps.filter((s: any) => s.done).length;
                    const total = steps.length;
                    const pct = total ? Math.round((done / total) * 100) : 0;
                    if (!total) return null;
                    return (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{done} / {total} steps</span>
                          <span className="font-semibold">{pct}%</span>
                        </div>
                        <Progress value={pct} className="h-2" />
                      </div>
                    );
                  })()}
                </div>
                {/* All steps */}
                {(selectedHobbyPlan.steps ?? []).length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">Steps</p>
                    {(selectedHobbyPlan.steps ?? []).map((s: any) => (
                      <div key={s.id} className="flex items-start gap-2 px-2 py-2 rounded-lg bg-secondary/30">
                        {s.done
                          ? <CheckCircle2 size={13} className="text-emerald-500 shrink-0 mt-0.5" />
                          : <Circle size={13} className="text-muted-foreground/30 shrink-0 mt-0.5" />}
                        <span className={`text-xs flex-1 ${s.done ? "line-through text-muted-foreground" : ""}`}>{s.text}</span>
                      </div>
                    ))}
                  </div>
                )}
                <Link href="/hobbies">
                  <a className="flex items-center gap-1.5 text-xs text-primary hover:underline transition-colors px-1">
                    <ClipboardList size={11} /> Manage steps in Hobbies →
                  </a>
                </Link>
              </div>
            ) : /* Hobby Goals overview mode */
            isHobbyGoalsSelected && !selectedHobbyPlanKey ? (
              <div className="space-y-3">
                {activeHobbyGoals.map((g: any) => {
                  let pct = 0;
                  let sublabel = "";
                  if (g.goalType === "count") { const cur = g.currentValue ?? 0; const tgt = g.targetValue ?? 1; pct = Math.min(100, Math.round((cur / tgt) * 100)); sublabel = `${cur} / ${tgt} ${g.unit ?? ""}`; }
                  else if (g.goalType === "milestone") { pct = g.status === "completed" ? 100 : 0; sublabel = "Milestone"; }
                  else if (g.goalType === "frequency") { sublabel = `${g.freqTimes}× / ${g.freqPeriod}`; pct = 50; }
                  return (
                    <div key={g.id} className="rounded-xl border p-3 space-y-1.5 bg-card">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{g.title}</p>
                          <p className="text-xs text-muted-foreground">{g.hobby.name} · <span className="capitalize">{g.goalType}</span></p>
                        </div>
                      </div>
                      {g.goalType === "count" && <Progress value={pct} className="h-1.5" />}
                      <p className="text-xs text-muted-foreground">{sublabel}</p>
                    </div>
                  );
                })}
                {activeHobbyGoals.length === 0 && (
                  <div className="text-center py-10 text-muted-foreground">
                    <Target size={28} className="mx-auto mb-2 opacity-20" />
                    <p className="text-xs">No active hobby goals</p>
                  </div>
                )}
                <Link href="/hobbies"><a className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-1"><Target size={11} /> Manage in Hobbies →</a></Link>
              </div>
            ) : /* Housekeeping mode: show house projects (selectable + addable) */
            isHousekeepingSelected ? (
              <>
                {houseProjects.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Folder size={24} className="mx-auto mb-2 opacity-20" />
                    <p className="text-xs">No house projects yet</p>
                  </div>
                )}
                {houseProjects.map((p) => {
                  const statusInfo = PROJECT_STATUSES.find((s) => s.value === p.status) ?? PROJECT_STATUSES[0];
                  const d = p.dueDate ? daysUntil(p.dueDate) : null;
                  const isSelected = p.id === selectedProjectId;
                  const doneTasks = p.tasks.filter((t) => t.completed).length;
                  return (
                    <div key={p.id}
                      onClick={() => setSelectedProjectId(isSelected ? null : p.id)}
                      className={`group rounded-xl border p-3 cursor-pointer transition-all hover:shadow-sm ${isSelected ? "border-orange-400 bg-orange-50 dark:bg-orange-950/20" : "bg-card hover:border-orange-200"}`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <p className="text-sm font-medium leading-tight flex-1 truncate">{p.title}</p>
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs border shrink-0 ${STATUS_PILL[p.status]}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot}`} />
                          {statusInfo.label}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        {d !== null ? (
                          <span className={d < 0 ? "text-destructive font-medium" : d <= 7 ? "text-amber-600 dark:text-amber-400 font-medium" : ""}>
                            {d < 0 ? "Overdue" : `Due ${format(parseISO(p.dueDate!), "MMM d")}`}
                          </span>
                        ) : <span className="capitalize text-muted-foreground">{p.category}</span>}
                        <span className="flex items-center gap-1">
                          {p.tasks.length > 0 && <span>{doneTasks}/{p.tasks.length}</span>}
                          <ChevronRight size={11} className={`transition-transform ${isSelected ? "rotate-90" : ""}`} />
                        </span>
                      </div>
                    </div>
                  );
                })}
                <QuickAdd
                  placeholder="Add house project..."
                  onAdd={(title) => { addHouseProject.mutate(title); }}
                  className="mt-1 px-1"
                />
                <Link href="/housekeeping"><a className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1 px-1"><Home size={11} /> Manage in Housekeeping</a></Link>
              </>
            ) : !selectedGoal && !isStandaloneSelected ? (
              <div className="text-center py-12 text-muted-foreground">
                <Folder size={28} className="mx-auto mb-3 opacity-20" />
                <p className="text-xs">Select a goal to see projects</p>
              </div>
            ) : isPlantsSelected ? null : (
              <>
                {/* ── Inline goal editor ─────────────────────────────────── */}
                {selectedGoal && !isStandaloneSelected && (
                  <InlineGoalEditor
                    goal={selectedGoal}
                    friends={friends}
                    onSave={(data) => updateGoal.mutate(data)}
                  />
                )}

                {/* Resolve the projects list based on mode */}
                {(() => {
                  const projectList = isStandaloneSelected ? standaloneProjects : (selectedGoal?.projects ?? []);
                  return (
                    <>
                      {projectList.length === 0 && (
                        <div className="text-center py-8 text-muted-foreground">
                          <Folder size={24} className="mx-auto mb-2 opacity-20" />
                          <p className="text-xs">No projects yet</p>
                        </div>
                      )}
                      {projectList.map((p) => {
                  const pct = projectPct(p);
                  const isSelected = p.id === selectedProjectId;
                  const statusInfo = PROJECT_STATUSES.find((s) => s.value === p.status) ?? PROJECT_STATUSES[0];
                  const d = p.dueDate ? daysUntil(p.dueDate) : null;
                  return (
                    <div key={p.id}
                      onClick={() => setSelectedProjectId(isSelected ? null : p.id)}
                      className={`group rounded-xl border p-3 cursor-pointer transition-all hover:shadow-sm ${isSelected ? "border-[hsl(var(--cat-project))] bg-[hsl(var(--cat-project)/0.05)]" : "bg-card hover:border-[hsl(var(--cat-project)/0.4)]"}`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="text-sm font-medium leading-tight flex-1 truncate">{p.title}</p>
                        <div className="flex items-center gap-1 shrink-0">
                          <Select value={p.status} onValueChange={(v) => { updateProject.mutate({ id: p.id, status: v }); }} >
                            <SelectTrigger className="h-5 text-xs border-0 p-0 pr-4 w-auto bg-transparent focus:ring-0 shadow-none" onClick={(e) => e.stopPropagation()}>
                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs border ${STATUS_PILL[p.status]}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot}`} />
                                {statusInfo.label}
                              </span>
                            </SelectTrigger>
                            <SelectContent>
                              {PROJECT_STATUSES.map((s) => (
                                <SelectItem key={s.value} value={s.value}>
                                  <span className="flex items-center gap-1.5">
                                    <span className={`w-2 h-2 rounded-full ${s.dot}`} />{s.label}
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100">
                                <MoreHorizontal size={12} />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setEditingProject(p); setProjectEditModal(true); }}>
                                <Pencil size={13} className="mr-2" />Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={(e) => { e.stopPropagation(); deleteProject.mutate(p.id); }}
                              >
                                <Trash2 size={13} className="mr-2" />Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>

                      {p.tasks.length > 0 && (
                        <div className="flex items-center gap-2 mb-1.5">
                          <Progress value={pct} className="h-1.5 flex-1" />
                          <span className="text-xs text-muted-foreground shrink-0">
                            {p.tasks.filter((t) => t.completed).length}/{p.tasks.length}
                          </span>
                        </div>
                      )}

                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        {d !== null ? (
                          <span className={d < 0 ? "text-destructive font-medium" : d <= 7 ? "text-amber-600 dark:text-amber-400 font-medium" : ""}>
                            {d < 0 ? "Overdue" : `Due ${format(parseISO(p.dueDate!), "MMM d")}`}
                          </span>
                        ) : <span />}
                        <span className="flex items-center gap-0.5">
                          {p.tasks.length} task{p.tasks.length !== 1 ? "s" : ""}
                          <ChevronRight size={11} className={`transition-transform ${isSelected ? "rotate-90" : ""}`} />
                        </span>
                      </div>
                    </div>
                  );
                })}

                      </>
                    );
                  })()}

                <QuickAdd
                  placeholder="Add project..."
                  onAdd={(title) =>
                    isStandaloneSelected
                      ? addStandaloneProject.mutate(title)
                      : addProject.mutate({ goalId: selectedGoal!.id, title })
                  }
                  className="mt-1 px-1"
                />
              </>
            )}
          </div>
        </div>

        {/* ── Column 3: Tasks ────────────────────────────────────────────── */}
        <div className={`flex-1 flex flex-col min-h-0 min-w-0 ${mobileTab !== "tasks" ? "hidden md:flex" : "flex"}`}>
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              {(() => {
                const selectedHouseProject = isHousekeepingSelected ? houseProjects.find((p) => p.id === selectedProjectId) ?? null : null;
                return (
                  <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    {isAllTasksSelected ? "All Tasks"
                      : isPlantsSelected ? "Watering Schedule"
                      : isNutritionSelected ? "Nutrition Details"
                      : isWorkoutGoalsSelected ? "Weekly Schedule"
                      : isReadingGoalSelected ? "Books Finished"
                      : isHobbyGoalsSelected ? "Manage in Hobbies"
                      : isHousekeepingSelected && selectedHouseProject ? `Tasks — ${selectedHouseProject.title}`
                      : isHousekeepingSelected ? "Chores"
                      : (selectedProject || standaloneSelectedProject) ? `Tasks — ${(selectedProject || standaloneSelectedProject)!.title}`
                      : isStandaloneSelected ? "General Tasks"
                      : selectedGoal ? "All Tasks" : "Tasks"}
                  </span>
                );
              })()}
              {!isHousekeepingSelected && !isAllTasksSelected && !isPlantsSelected && !isNutritionSelected && !isWorkoutGoalsSelected && !isReadingGoalSelected && !isHobbyGoalsSelected && totalTasks > 0 && (
                <span className="text-xs text-muted-foreground">
                  {doneTasks}/{totalTasks} done
                </span>
              )}
              {isHousekeepingSelected && !houseProjects.find((p) => p.id === selectedProjectId) && (
                <span className="text-xs text-muted-foreground">{chores.filter(c => c.isActive).length} active</span>
              )}
              {isPlantsSelected && (
                <span className="text-xs text-muted-foreground">{plants.length} plant{plants.length !== 1 ? "s" : ""}</span>
              )}
              {isNutritionSelected && (
                <span className="text-xs text-muted-foreground">daily targets</span>
              )}
              {isWorkoutGoalsSelected && (
                <span className="text-xs text-muted-foreground">{workoutPlans.length} plan{workoutPlans.length !== 1 ? "s" : ""}</span>
              )}
              {isReadingGoalSelected && (
                <span className="text-xs text-muted-foreground">{booksFinishedThisYear} finished</span>
              )}
            </div>
            {!isHousekeepingSelected && !isAllTasksSelected && !isNutritionSelected && !isWorkoutGoalsSelected && !isReadingGoalSelected && !isHobbyGoalsSelected && totalTasks > 0 && (
              <Progress value={totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0} className="h-1.5 w-24" />
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {/* Hobby Goals mode: manage link */}
            {isHobbyGoalsSelected && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 text-center">
                    <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{activeHobbyPlans.length}</p>
                    <p className="text-xs text-muted-foreground">active plan{activeHobbyPlans.length !== 1 ? "s" : ""}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 text-center">
                    <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{activeHobbyGoals.length}</p>
                    <p className="text-xs text-muted-foreground">active goal{activeHobbyGoals.length !== 1 ? "s" : ""}</p>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-secondary/40 border space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Hobbies with active items</p>
                  {Array.from(new Set([...activeHobbyPlans.map((p: any) => p.hobby.name), ...activeHobbyGoals.map((g: any) => g.hobby.name)])).map((name: any) => (
                    <p key={name} className="text-sm">{name}</p>
                  ))}
                </div>
                <Link href="/hobbies">
                  <a className="flex items-center gap-2 p-3 rounded-xl border hover:border-violet-300 transition-colors text-sm font-medium text-violet-600 dark:text-violet-400">
                    <Target size={14} /> Manage plans & goals in Hobbies →
                  </a>
                </Link>
              </div>
            )}
            {/* Nutrition Goals mode: show nutrient breakdown guide */}
            {isNutritionSelected && nutritionGoal && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Daily Calories", value: `${nutritionGoal.calories}`, unit: "kcal", color: "text-rose-600 dark:text-rose-400", bg: "bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800" },
                    { label: "Protein", value: `${nutritionGoal.protein}`, unit: "g/day", color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800" },
                    { label: "Carbohydrates", value: `${nutritionGoal.carbs}`, unit: "g/day", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800" },
                    { label: "Fat", value: `${nutritionGoal.fat}`, unit: "g/day", color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-50 dark:bg-violet-950/20 border-violet-200 dark:border-violet-800" },
                    { label: "Water", value: `${nutritionGoal.waterGlasses}`, unit: "glasses/day", color: "text-sky-600 dark:text-sky-400", bg: "bg-sky-50 dark:bg-sky-950/20 border-sky-200 dark:border-sky-800" },
                  ].map(({ label, value, unit, color, bg }) => (
                    <div key={label} className={`p-3 rounded-xl border ${bg}`}>
                      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
                      <p className={`text-xl font-bold ${color}`}>{value}</p>
                      <p className="text-[10px] text-muted-foreground">{unit}</p>
                    </div>
                  ))}
                </div>
                <div className="p-3 rounded-xl bg-secondary/40 border">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Macro Split</p>
                  <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
                    <div className="bg-blue-500 rounded-l-full" style={{ width: `${Math.round((nutritionGoal.protein * 4 / nutritionGoal.calories) * 100)}%` }} title="Protein" />
                    <div className="bg-amber-500" style={{ width: `${Math.round((nutritionGoal.carbs * 4 / nutritionGoal.calories) * 100)}%` }} title="Carbs" />
                    <div className="bg-violet-500 rounded-r-full flex-1" title="Fat" />
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />Protein {Math.round((nutritionGoal.protein * 4 / nutritionGoal.calories) * 100)}%</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />Carbs {Math.round((nutritionGoal.carbs * 4 / nutritionGoal.calories) * 100)}%</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-violet-500 inline-block" />Fat {Math.round((nutritionGoal.fat * 9 / nutritionGoal.calories) * 100)}%</span>
                  </div>
                </div>
                <Link href="/health"><a className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-1"><Heart size={11} /> Edit in Health tab</a></Link>
              </div>
            )}

            {/* Reading Goal mode: show planned + finished books */}
            {isReadingGoalSelected && readingGoal && (() => {
              const finished = [...booksFinishedInGoal].sort((a, b) =>
                ((a as any).finishDate ?? "").localeCompare((b as any).finishDate ?? ""));
              const planned = [...booksPlannedInGoal].sort((a, b) =>
                (a.targetFinishDate ?? "").localeCompare(b.targetFinishDate ?? ""));
              const pct = Math.min(100, Math.round((finished.length / readingGoal.booksTarget) * 100));
              const hasAny = finished.length > 0 || planned.length > 0;
              return (
                <div className="space-y-4">
                  <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-sm font-semibold">{finished.length} of {readingGoal.booksTarget} finished</span>
                      <span className="text-sm font-bold text-amber-700 dark:text-amber-300">{pct}%</span>
                    </div>
                    <Progress value={pct} className="h-1.5" />
                  </div>

                  {/* Planned books */}
                  {planned.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">Up Next — {planned.length} planned</p>
                      <div className="space-y-1">
                        {planned.map((book) => {
                          const tfd = book.targetFinishDate;
                          const d = tfd ? daysUntil(tfd) : null;
                          const overdue = d !== null && d < 0;
                          return (
                            <div key={book.id} className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-secondary/40 transition-colors">
                              {(book as any).coverUrl ? (
                                <img src={(book as any).coverUrl} alt={book.title} className="w-7 h-9 object-cover rounded shrink-0" />
                              ) : (
                                <div className="w-7 h-9 rounded shrink-0 flex items-center justify-center" style={{ backgroundColor: (book as any).coverColor || "#1e3a5f" }}>
                                  <BookOpen size={11} className="text-white/60" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm truncate">{book.title}</p>
                                {book.author && <p className="text-xs text-muted-foreground truncate">{book.author}</p>}
                              </div>
                              {tfd && (
                                <span className={`text-xs shrink-0 font-medium ${overdue ? "text-destructive" : d !== null && d <= 7 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
                                  {overdue ? `${Math.abs(d!)}d late` : d === 0 ? "Today" : `by ${format(parseISO(tfd), "MMM d")}`}
                                </span>
                              )}
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full border capitalize shrink-0 ${book.status === "current" ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800" : "bg-secondary text-muted-foreground border-border"}`}>
                                {book.status === "backlog" ? "up next" : book.status}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Finished books */}
                  {finished.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">Finished — {finished.length}</p>
                      <div className="space-y-1">
                        {finished.map((book, i) => (
                          <div key={book.id} className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-secondary/40 transition-colors">
                            <span className="text-xs font-bold text-muted-foreground w-5 shrink-0 text-right">{i + 1}</span>
                            {(book as any).coverUrl ? (
                              <img src={(book as any).coverUrl} alt={book.title} className="w-7 h-9 object-cover rounded shrink-0" />
                            ) : (
                              <div className="w-7 h-9 rounded shrink-0 flex items-center justify-center" style={{ backgroundColor: (book as any).coverColor || "#1e3a5f" }}>
                                <BookOpen size={11} className="text-white/60" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm truncate">{book.title}</p>
                              {book.author && <p className="text-xs text-muted-foreground truncate">{book.author}</p>}
                            </div>
                            {(book as any).finishDate && (
                              <span className="text-xs text-muted-foreground shrink-0">{format(parseISO((book as any).finishDate), "MMM d")}</span>
                            )}
                            <Check size={13} className="text-emerald-500 shrink-0" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {!hasAny && (
                    <div className="text-center py-10 text-muted-foreground">
                      <BookOpen size={28} className="mx-auto mb-3 opacity-20" />
                      <p className="text-sm">No books assigned to this goal yet</p>
                      <Link href="/reading"><a className="text-xs text-primary hover:underline mt-1 block">Add books in Reading →</a></Link>
                    </div>
                  )}
                  <Link href="/reading"><a className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-1"><BookOpen size={11} /> Manage in Reading</a></Link>
                </div>
              );
            })()}

            {/* Active Workout Plan mode: show weekly schedule */}
            {isWorkoutGoalsSelected && (() => {
              const activePlan = workoutPlans.find(p => p.isActive);
              if (!activePlan) return (
                <div className="text-center py-16 text-muted-foreground">
                  <Dumbbell size={36} className="mx-auto mb-4 opacity-20" />
                  <p className="font-medium text-sm">No active plan</p>
                  <Link href="/workouts"><a className="text-xs text-primary hover:underline mt-1 block">Set one in Workouts →</a></Link>
                </div>
              );
              let schedule: { dayOfWeek: string; templateName: string }[] = [];
              let milestones: { week: number; description: string; targetValue?: number }[] = [];
              let metric: { label: string; current?: number; target?: number; unit?: string } | null = null;
              try { schedule = JSON.parse(activePlan.scheduleJson); } catch {}
              try { if (activePlan.milestonesJson) milestones = JSON.parse(activePlan.milestonesJson); } catch {}
              try { if (activePlan.goalMetricJson) metric = JSON.parse(activePlan.goalMetricJson); } catch {}
              const dayOrder = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];
              const sortedSchedule = [...schedule].sort((a, b) => dayOrder.indexOf(a.dayOfWeek) - dayOrder.indexOf(b.dayOfWeek));
              const weeksElapsed = activePlan.startDate
                ? Math.floor((Date.now() - new Date(activePlan.startDate).getTime()) / (7 * 86400000))
                : null;
              const currentWeek = weeksElapsed !== null ? Math.min(weeksElapsed + 1, activePlan.durationWeeks) : null;
              const todayDow = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"][new Date().getDay()];
              return (
                <div className="space-y-3">
                  {/* Weekly schedule */}
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">Weekly Schedule</p>
                  {sortedSchedule.length > 0 ? (
                    <div className="space-y-1">
                      {sortedSchedule.map((entry, i) => {
                        const isToday = entry.dayOfWeek === todayDow;
                        return (
                          <div key={i} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${isToday ? "bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800" : "hover:bg-secondary/40"}`}>
                            <span className={`text-xs font-semibold capitalize w-20 shrink-0 ${isToday ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"}`}>{entry.dayOfWeek}</span>
                            <span className="text-sm truncate">{entry.templateName}</span>
                            {isToday && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500 text-white font-semibold shrink-0">Today</span>}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground px-2">No schedule set</p>
                  )}
                  {/* Upcoming milestone */}
                  {milestones.length > 0 && currentWeek !== null && (() => {
                    const next = milestones.find(m => m.week >= currentWeek);
                    if (!next) return null;
                    return (
                      <div className="p-3 rounded-xl bg-secondary/40 border">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Next Milestone</p>
                        <p className="text-sm font-medium">{next.description}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Week {next.week} · {Math.max(0, next.week - currentWeek)} week{next.week - currentWeek !== 1 ? "s" : ""} away</p>
                        {next.targetValue !== undefined && <p className="text-xs text-muted-foreground">Target: {next.targetValue}{metric?.unit ? ` ${metric.unit}` : ""}</p>}
                      </div>
                    );
                  })()}
                  <Link href="/workouts"><a className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-1"><Dumbbell size={11} /> View in Workouts</a></Link>
                </div>
              );
            })()}

            {/* Housekeeping mode: show project tasks OR chores list */}
            {isHousekeepingSelected ? (() => {
              const selectedHouseProject = houseProjects.find((p) => p.id === selectedProjectId) ?? null;

              // If a house project is selected, show its tasks
              if (selectedHouseProject) {
                return (
                  <div className="space-y-1">
                    {selectedHouseProject.tasks.length === 0 && (
                      <div className="text-center py-10 text-muted-foreground">
                        <ClipboardList size={28} className="mx-auto mb-3 opacity-20" />
                        <p className="text-sm font-medium">No tasks yet</p>
                        <p className="text-xs mt-1">Add tasks below to track this project</p>
                      </div>
                    )}
                    {selectedHouseProject.tasks.map((task) => (
                      <TaskRow key={task.id} task={task as any}
                        onToggle={(id, v) => toggleHouseProjectTask.mutate({ id, completed: v })}
                        onDelete={(id) => deleteHouseProjectTask.mutate(id)}
                        onUpdate={() => {}}
                      />
                    ))}
                    <QuickAdd
                      placeholder="Add task..."
                      onAdd={(title) => addHouseProjectTask.mutate({ projectId: selectedHouseProject.id, title })}
                      className="mt-2 px-1"
                    />
                  </div>
                );
              }

              // Otherwise show active chores list
              const activeChores = chores.filter(c => c.isActive).sort((a, b) => (a.nextDue ?? "9999").localeCompare(b.nextDue ?? "9999"));
              if (activeChores.length === 0) return (
                <div className="text-center py-16 text-muted-foreground">
                  <ClipboardList size={36} className="mx-auto mb-4 opacity-20" />
                  <p className="font-medium text-sm">No active chores</p>
                  <Link href="/housekeeping"><a className="text-xs text-primary hover:underline mt-1 block">Add in Housekeeping →</a></Link>
                </div>
              );
              const today = new Date(); today.setHours(0, 0, 0, 0);
              return (
                <div className="space-y-1">
                  {activeChores.map((chore) => {
                    const due = chore.nextDue ? new Date(chore.nextDue) : null;
                    const days = due ? Math.round((due.getTime() - today.getTime()) / 86400000) : null;
                    const overdue = days !== null && days < 0;
                    const soon = days !== null && days >= 0 && days <= 3;
                    return (
                      <div key={chore.id} className={`group flex items-center gap-2.5 px-2 py-2.5 rounded-xl hover:bg-secondary/40 transition-colors ${overdue ? "border border-red-200 dark:border-red-900 bg-red-50/30 dark:bg-red-950/10" : ""}`}>
                        <button
                          onClick={() => completeChore.mutate(chore)}
                          className="shrink-0 w-7 h-7 rounded-full border flex items-center justify-center hover:border-green-500 hover:bg-green-50 transition-colors"
                          title="Mark complete"
                        >
                          <CheckCircle2 size={14} className="text-muted-foreground/40 hover:text-green-500" />
                        </button>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm">{chore.title}</span>
                          {chore.category && <span className="text-xs text-muted-foreground ml-2 capitalize">{chore.category}</span>}
                        </div>
                        {days !== null && (
                          <span className={`text-xs font-medium shrink-0 ${overdue ? "text-red-500" : soon ? "text-orange-500" : "text-muted-foreground"}`}>
                            {overdue ? `${Math.abs(days)}d overdue` : days === 0 ? "Today" : `${days}d`}
                          </span>
                        )}
                        {chore.frequency && <span className="text-xs text-muted-foreground shrink-0 capitalize hidden sm:block">{chore.frequency}</span>}
                        <button
                          onClick={() => { setEditingChore(chore); setChoreEditModal(true); }}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-all shrink-0"
                        >
                          <Pencil size={12} />
                        </button>
                      </div>
                    );
                  })}
                  <p className="text-xs text-muted-foreground px-1 mt-2">Select a project above to view and add tasks</p>
                  <Link href="/housekeeping"><a className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1 px-1"><Home size={11} /> Manage in Housekeeping</a></Link>
                </div>
              );
            })() : null}

            {/* Plants watering schedule */}
            {isPlantsSelected && (() => {
              const sorted = [...plants].sort((a, b) => {
                const da = plantWateringDays(a) ?? -999;
                const db = plantWateringDays(b) ?? -999;
                return da - db;
              });
              return (
                <div className="space-y-2">
                  {sorted.map((plant) => {
                    const days = plantWateringDays(plant);
                    const overdue = days !== null && days < 0;
                    const today = days === 0;
                    const soon = days !== null && days > 0 && days <= 2;
                    const neverWatered = days === null;
                    return (
                      <div key={plant.id} className={`flex items-center gap-3 px-3 py-3 rounded-xl border transition-colors ${overdue || neverWatered ? "border-red-200 dark:border-red-900 bg-red-50/40 dark:bg-red-950/10" : today || soon ? "border-amber-200 dark:border-amber-900 bg-amber-50/40 dark:bg-amber-950/10" : "bg-card hover:bg-accent/30"}`}>
                        <Leaf size={15} className={`shrink-0 ${overdue || neverWatered ? "text-red-500" : today || soon ? "text-amber-500" : "text-green-500"}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{plant.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {plant.species && <span className="italic">{plant.species} · </span>}
                            every {plant.waterFrequencyDays}d
                            {plant.location && <span> · {plant.location}</span>}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          {neverWatered ? (
                            <p className="text-xs font-medium text-red-500">Never watered</p>
                          ) : overdue ? (
                            <p className="text-xs font-medium text-red-500">{Math.abs(days!)}d overdue</p>
                          ) : today ? (
                            <p className="text-xs font-medium text-amber-600">Water today</p>
                          ) : soon ? (
                            <p className="text-xs font-medium text-amber-500">In {days}d</p>
                          ) : (
                            <p className="text-xs text-muted-foreground">In {days}d</p>
                          )}
                          {plant.lastWatered && (
                            <p className="text-[10px] text-muted-foreground">Last: {plant.lastWatered}</p>
                          )}
                        </div>
                        <button
                          onClick={() => waterPlant.mutate(plant)}
                          className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-950/30 dark:hover:bg-blue-950/60 dark:text-blue-400 transition-colors"
                          title="Mark as watered today"
                        >
                          <Droplets size={12} /> Water
                        </button>
                      </div>
                    );
                  })}
                  <Link href="/plants"><a className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1 px-1"><Leaf size={11} /> Manage in Plants</a></Link>
                </div>
              );
            })()}

            {/* Due Chores section (only shown in non-housekeeping modes) */}
            {!isHousekeepingSelected && !isPlantsSelected && !isNutritionSelected && !isWorkoutGoalsSelected && !isReadingGoalSelected && (() => {
              const dueChores = chores
                .filter((c) => c.isActive && c.nextDue)
                .filter((c) => {
                  const today = new Date(); today.setHours(0,0,0,0);
                  const due = new Date(c.nextDue!);
                  return due <= new Date(today.getTime() + 3 * 86400000);
                })
                .sort((a, b) => (a.nextDue ?? "").localeCompare(b.nextDue ?? ""));
              if (dueChores.length === 0) return null;
              return (
                <div className="mb-4 p-3 rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/30">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <Home size={13} className="text-orange-600" />
                      <span className="text-xs font-semibold text-orange-700 dark:text-orange-400">Chores Due Soon</span>
                    </div>
                    <Link href="/housekeeping"><a className="text-xs text-orange-600 hover:underline">View all →</a></Link>
                  </div>
                  <div className="space-y-1">
                    {dueChores.slice(0, 4).map((chore) => {
                      const today = new Date(); today.setHours(0,0,0,0);
                      const due = new Date(chore.nextDue!);
                      const days = Math.round((due.getTime() - today.getTime()) / 86400000);
                      return (
                        <div key={chore.id} className="flex items-center justify-between text-xs">
                          <span className="text-foreground truncate">{chore.title}</span>
                          <span className={`shrink-0 ml-2 font-medium ${days < 0 ? "text-red-600" : days === 0 ? "text-orange-600" : "text-yellow-600"}`}>
                            {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "Today" : `${days}d`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* All Tasks mode: aggregate every task */}
            {isAllTasksSelected && (() => {
              const activeChoresForAllTasks = chores.filter(c => c.isActive).sort((a, b) => (a.nextDue ?? "9999").localeCompare(b.nextDue ?? "9999"));
              const duePlants = [...plants].filter(p => { const d = plantWateringDays(p); return d === null || d <= 3; }).sort((a, b) => (plantWateringDays(a) ?? -999) - (plantWateringDays(b) ?? -999));
              const hasAnyTasks =
                goals.some((g) => g.projects.some((p) => p.tasks.length > 0)) ||
                standaloneProjects.some((p) => p.tasks.length > 0) ||
                generalTasksData.length > 0 ||
                houseProjects.some((p) => p.tasks.length > 0) ||
                activeChoresForAllTasks.length > 0 ||
                duePlants.length > 0;
              if (!hasAnyTasks) return (
                <div className="text-center py-16 text-muted-foreground">
                  <ClipboardList size={36} className="mx-auto mb-4 opacity-20" />
                  <p className="font-medium text-sm">No tasks yet</p>
                  <p className="text-xs mt-1">Add tasks to your goals or projects to see them here</p>
                </div>
              );
              return (
                <div className="space-y-1">
                  {/* Goal tasks grouped by goal → project */}
                  {goals.map((g) => {
                    const goalHasTasks = g.projects.some((p) => p.tasks.length > 0);
                    if (!goalHasTasks) return null;
                    return (
                      <div key={g.id} className="mb-5">
                        <div className="flex items-center gap-2 mb-2 px-1">
                          <Target size={13} className="text-primary shrink-0" />
                          <span className="text-xs font-bold uppercase tracking-wide text-primary truncate">{g.title}</span>
                        </div>
                        {g.projects.map((p) => {
                          if (p.tasks.length === 0) return null;
                          return (
                            <div key={p.id} className="ml-3 mb-3">
                              <div className="flex items-center gap-2 mb-1 px-1">
                                <Folder size={11} className="text-muted-foreground shrink-0" />
                                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide truncate">{p.title}</span>
                                <span className={`text-xs px-1 py-0.5 rounded-full border shrink-0 ${STATUS_PILL[p.status]}`}>
                                  {PROJECT_STATUSES.find((s) => s.value === p.status)?.label}
                                </span>
                              </div>
                              {p.tasks.map((t) => (
                                <TaskRow key={t.id} task={t}
                                  onToggle={(id, v) => toggleTask.mutate({ id, completed: v })}
                                  onDelete={(id) => deleteTask.mutate(id)}
                                  onUpdate={(id, data) => updateTask.mutate({ id, ...data })}
                                />
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                  {/* Standalone project tasks */}
                  {standaloneProjects.some((p) => p.tasks.length > 0) && (
                    <div className="mb-5">
                      <div className="flex items-center gap-2 mb-2 px-1">
                        <Inbox size={13} className="text-muted-foreground shrink-0" />
                        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">General Projects</span>
                      </div>
                      {standaloneProjects.map((p) => {
                        if (p.tasks.length === 0) return null;
                        return (
                          <div key={p.id} className="ml-3 mb-3">
                            <div className="flex items-center gap-2 mb-1 px-1">
                              <Folder size={11} className="text-muted-foreground shrink-0" />
                              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide truncate">{p.title}</span>
                              <span className={`text-xs px-1 py-0.5 rounded-full border shrink-0 ${STATUS_PILL[p.status]}`}>
                                {PROJECT_STATUSES.find((s) => s.value === p.status)?.label}
                              </span>
                            </div>
                            {p.tasks.map((t) => (
                              <TaskRow key={t.id} task={t}
                                onToggle={(id, v) => toggleTask.mutate({ id, completed: v })}
                                onDelete={(id) => deleteTask.mutate(id)}
                                onUpdate={(id, data) => updateTask.mutate({ id, ...data })}
                              />
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* General tasks */}
                  {generalTasksData.length > 0 && (
                    <div className="mb-4">
                      <div className="flex items-center gap-2 mb-2 px-1">
                        <Inbox size={13} className="text-muted-foreground shrink-0" />
                        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">General Tasks</span>
                      </div>
                      {generalTasksData.map((t) => (
                        <TaskRow key={t.id} task={t as unknown as ProjectTask}
                          onToggle={(id, v) => toggleGeneralTask.mutate({ id, completed: v })}
                          onDelete={(id) => deleteGeneralTask.mutate(id)}
                          onUpdate={(id, data) => updateGeneralTask.mutate({ id, ...data })}
                        />
                      ))}
                    </div>
                  )}
                  {/* Plants due soon */}
                  {duePlants.length > 0 && (
                    <div className="mb-5">
                      <div className="flex items-center gap-2 mb-2 px-1">
                        <Leaf size={13} className="text-green-500 shrink-0" />
                        <span className="text-xs font-bold uppercase tracking-wide text-green-600 dark:text-green-400">Plants Due for Water</span>
                      </div>
                      {duePlants.map((plant) => {
                        const days = plantWateringDays(plant);
                        const overdue = days !== null && days < 0;
                        const neverWatered = days === null;
                        return (
                          <div key={plant.id} className="group flex items-center gap-2.5 py-2 px-2 rounded-xl hover:bg-secondary/40 transition-colors">
                            <Leaf size={14} className={`shrink-0 ${overdue || neverWatered ? "text-red-500" : "text-amber-500"}`} />
                            <div className="flex-1 min-w-0">
                              <span className="text-sm">{plant.name}</span>
                              {plant.species && <span className="text-xs text-muted-foreground ml-2 italic">{plant.species}</span>}
                            </div>
                            <span className={`text-xs font-medium shrink-0 ${neverWatered || overdue ? "text-red-500" : days === 0 ? "text-amber-600" : "text-amber-500"}`}>
                              {neverWatered ? "Never watered" : overdue ? `${Math.abs(days!)}d overdue` : days === 0 ? "Today" : `In ${days}d`}
                            </span>
                            <button
                              onClick={() => waterPlant.mutate(plant)}
                              className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400 transition-colors"
                            >
                              <Droplets size={11} /> Water
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Chores */}
                  {activeChoresForAllTasks.length > 0 && (() => {
                    const todayMs = new Date().setHours(0,0,0,0);
                    return (
                      <div className="mb-5">
                        <div className="flex items-center gap-2 mb-2 px-1">
                          <Home size={13} className="text-orange-500 shrink-0" />
                          <span className="text-xs font-bold uppercase tracking-wide text-orange-600 dark:text-orange-400">Chores</span>
                        </div>
                        {activeChoresForAllTasks.map((chore) => {
                          const due = chore.nextDue ? new Date(chore.nextDue) : null;
                          const days = due ? Math.round((due.getTime() - todayMs) / 86400000) : null;
                          const overdue = days !== null && days < 0;
                          const soon = days !== null && days >= 0 && days <= 3;
                          return (
                            <div key={chore.id} className={`group flex items-center gap-2.5 py-2 px-2 rounded-xl hover:bg-secondary/40 transition-colors ${overdue ? "border border-red-200 dark:border-red-900 bg-red-50/30 dark:bg-red-950/10" : ""}`}>
                              <button
                                onClick={() => completeChore.mutate(chore)}
                                className="shrink-0 w-6 h-6 rounded-full border flex items-center justify-center hover:border-green-500 hover:bg-green-50 transition-colors"
                                title="Mark complete"
                              >
                                <CheckCircle2 size={13} className="text-muted-foreground/40 hover:text-green-500" />
                              </button>
                              <div className="flex-1 min-w-0">
                                <span className="text-sm">{chore.title}</span>
                                {chore.category && <span className="text-xs text-muted-foreground ml-2 capitalize">{chore.category}</span>}
                              </div>
                              {days !== null && (
                                <span className={`text-xs font-medium shrink-0 ${overdue ? "text-red-500" : soon ? "text-orange-500" : "text-muted-foreground"}`}>
                                  {overdue ? `${Math.abs(days)}d overdue` : days === 0 ? "Today" : `${days}d`}
                                </span>
                              )}
                              <button
                                onClick={() => { setEditingChore(chore); setChoreEditModal(true); }}
                                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-all shrink-0"
                              >
                                <Pencil size={12} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                  {/* Housekeeping project tasks */}
                  {houseProjects.some((p) => p.tasks.length > 0) && (
                    <div className="mb-5">
                      <div className="flex items-center gap-2 mb-2 px-1">
                        <Home size={13} className="text-orange-500 shrink-0" />
                        <span className="text-xs font-bold uppercase tracking-wide text-orange-600 dark:text-orange-400">Housekeeping</span>
                      </div>
                      {houseProjects.map((p) => {
                        if (p.tasks.length === 0) return null;
                        return (
                          <div key={p.id} className="ml-3 mb-3">
                            <div className="flex items-center gap-2 mb-1 px-1">
                              <Folder size={11} className="text-muted-foreground shrink-0" />
                              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide truncate">{p.title}</span>
                              <span className={`text-xs px-1 py-0.5 rounded-full border shrink-0 ${STATUS_PILL[p.status]}`}>
                                {PROJECT_STATUSES.find((s) => s.value === p.status)?.label}
                              </span>
                            </div>
                            {p.tasks.map((t) => (
                              <TaskRow key={t.id} task={t as any}
                                onToggle={(id, v) => toggleHouseProjectTask.mutate({ id, completed: v })}
                                onDelete={(id) => deleteHouseProjectTask.mutate(id)}
                                onUpdate={() => {}}
                              />
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

            {!isAllTasksSelected && !isHousekeepingSelected && !isPlantsSelected && !isNutritionSelected && !isWorkoutGoalsSelected && !isReadingGoalSelected && !selectedGoal && !isStandaloneSelected ? (
              <div className="text-center py-16 text-muted-foreground">
                <ClipboardList size={36} className="mx-auto mb-4 opacity-20" />
                <p className="font-medium text-sm">Select a goal to see tasks</p>
                <p className="text-xs mt-1">Or use General for tasks not linked to a goal</p>
              </div>
            ) : !isHousekeepingSelected && !isPlantsSelected && isStandaloneSelected && !standaloneSelectedProject ? (
              // Standalone mode — no project selected: show general tasks + quick-add
              <div className="space-y-1">
                {generalTasksData.length === 0 && standaloneProjects.every(p => p.tasks.length === 0) && (
                  <div className="text-center py-10 text-muted-foreground">
                    <ClipboardList size={28} className="mx-auto mb-3 opacity-20" />
                    <p className="text-sm font-medium">No general tasks yet</p>
                    <p className="text-xs mt-1">Use + Task in the header to add one</p>
                  </div>
                )}
                {/* Standalone project tasks grouped */}
                {standaloneProjects.map((p) => {
                  if (p.tasks.length === 0) return null;
                  return (
                    <div key={p.id} className="mb-4">
                      <div className="flex items-center gap-2 mb-2 px-1">
                        <Folder size={13} className="text-muted-foreground" />
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{p.title}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full border ${STATUS_PILL[p.status]}`}>
                          {PROJECT_STATUSES.find((s) => s.value === p.status)?.label}
                        </span>
                      </div>
                      {p.tasks.map((t) => (
                        <TaskRow key={t.id} task={t as ProjectTask}
                          onToggle={(id, v) => toggleTask.mutate({ id, completed: v })}
                          onDelete={(id) => deleteTask.mutate(id)}
                          onUpdate={(id, data) => updateTask.mutate({ id, ...data })}
                        />
                      ))}
                    </div>
                  );
                })}
                {/* General tasks (not linked to any project) */}
                {generalTasksData.length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-2 px-1">
                      <Inbox size={13} className="text-muted-foreground" />
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">General Tasks</span>
                    </div>
                    {generalTasksData.map((t) => (
                      <TaskRow key={t.id} task={t as unknown as ProjectTask}
                        onToggle={(id, v) => toggleGeneralTask.mutate({ id, completed: v })}
                        onDelete={(id) => deleteGeneralTask.mutate(id)}
                        onUpdate={(id, data) => updateGeneralTask.mutate({ id, ...data })}
                      />
                    ))}
                  </div>
                )}
                <QuickAdd placeholder="Add general task..." onAdd={(t) => addGeneralTask.mutate(t)} className="mt-2 px-1" />
              </div>
            ) : !isAllTasksSelected && !isHousekeepingSelected && !isPlantsSelected && !isNutritionSelected && !isWorkoutGoalsSelected && !isReadingGoalSelected && tasksToShow.length === 0 && !selectedProject && !standaloneSelectedProject ? (
              <div className="text-center py-12 text-muted-foreground">
                <ClipboardList size={28} className="mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium">No tasks yet</p>
                <p className="text-xs mt-1">Add a project and tasks to track your work</p>
              </div>
            ) : !isAllTasksSelected && !isHousekeepingSelected && !isPlantsSelected && !isNutritionSelected && !isWorkoutGoalsSelected && !isReadingGoalSelected ? (
              <div className="space-y-1">
                {/* Group tasks by project when showing all */}
                {!selectedProject && !standaloneSelectedProject && selectedGoal && selectedGoal.projects.map((p) => {
                  if (p.tasks.length === 0) return null;
                  return (
                    <div key={p.id} className="mb-4">
                      <div className="flex items-center gap-2 mb-2 px-1">
                        <Folder size={13} className="text-muted-foreground" />
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{p.title}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full border ${STATUS_PILL[p.status]}`}>
                          {PROJECT_STATUSES.find((s) => s.value === p.status)?.label}
                        </span>
                      </div>
                      {p.tasks.map((t) => (
                        <TaskRow key={t.id} task={t}
                          onToggle={(id, v) => toggleTask.mutate({ id, completed: v })}
                          onDelete={(id) => deleteTask.mutate(id)}
                          onUpdate={(id, data) => updateTask.mutate({ id, ...data })}
                        />
                      ))}
                    </div>
                  );
                })}

                {/* Single project tasks (goal-linked or standalone) */}
                {(selectedProject || standaloneSelectedProject) && (() => {
                  const proj = selectedProject || standaloneSelectedProject!;
                  const isStandaloneProj = !!standaloneSelectedProject;
                  return (
                    <>
                      {proj.tasks.length === 0 && (
                        <div className="text-center py-8 text-muted-foreground">
                          <ClipboardList size={24} className="mx-auto mb-2 opacity-20" />
                          <p className="text-xs">No tasks in this project</p>
                        </div>
                      )}
                      {proj.tasks.map((t) => (
                        <TaskRow key={t.id} task={t}
                          onToggle={(id, v) => toggleTask.mutate({ id, completed: v })}
                          onDelete={(id) => deleteTask.mutate(id)}
                          onUpdate={(id, data) => updateTask.mutate({ id, ...data })}
                        />
                      ))}
                      <QuickAdd
                        placeholder="Add task..."
                        onAdd={(title) => addTask.mutate({ projectId: proj.id, title })}
                        className="mt-2 px-1"
                      />
                    </>
                  );
                })()}
              </div>
            ) : null}
          </div>
        </div>

      </div>

      <GoalFormModal open={goalModal} onClose={() => { setGoalModal(false); setEditGoal(null); }} editGoal={editGoal} />
      <ProjectEditModal
        open={projectEditModal}
        onClose={() => { setProjectEditModal(false); setEditingProject(null); }}
        project={editingProject}
        onSave={(id, data) => updateProject.mutate({ id, ...data })}
      />
      <ChoreEditModal
        open={choreEditModal}
        onClose={() => { setChoreEditModal(false); setEditingChore(null); }}
        chore={editingChore}
        onSave={(id, data) => updateChore.mutate({ id, data })}
      />
    </div>
  );
}

// ── Task Row Component ────────────────────────────────────────────────────────
function TaskRow({
  task, onToggle, onDelete, onUpdate,
}: {
  task: ProjectTask;
  onToggle: (id: number, v: boolean) => void;
  onDelete: (id: number) => void;
  onUpdate: (id: number, data: Partial<InsertProjectTask>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editDue, setEditDue] = useState(task.dueDate ?? "");
  const [editPriority, setEditPriority] = useState(task.priority);

  const save = () => {
    if (!editTitle.trim()) return;
    onUpdate(task.id, { title: editTitle.trim(), dueDate: editDue || null, priority: editPriority });
    setEditing(false);
  };

  const d = task.dueDate ? daysUntil(task.dueDate) : null;
  const overdue = d !== null && d < 0;
  const soon = d !== null && d >= 0 && d <= 7;

  if (editing) return (
    <div className="bg-secondary/40 rounded-xl p-3 mb-1 space-y-2">
      <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
        className="h-7 text-sm" autoFocus />
      <div className="flex gap-2">
        <Input type="date" value={editDue} onChange={(e) => setEditDue(e.target.value)} className="h-7 text-xs flex-1" placeholder="Due date" />
        <Select value={editPriority} onValueChange={setEditPriority}>
          <SelectTrigger className="h-7 text-xs w-28"><SelectValue /></SelectTrigger>
          <SelectContent>{TASK_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="flex gap-1.5">
        <Button size="sm" className="h-6 text-xs px-2" onClick={save}>Save</Button>
        <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setEditing(false)}>Cancel</Button>
      </div>
    </div>
  );

  return (
    <div className={`group flex items-start gap-2.5 py-2 px-2 rounded-xl hover:bg-secondary/40 transition-colors ${task.completed ? "opacity-60" : ""}`}>
      <button onClick={() => onToggle(task.id, !task.completed)} className="mt-0.5 shrink-0 text-muted-foreground hover:text-primary transition-colors">
        {task.completed ? <CheckCircle2 size={16} className="text-primary" /> : <Circle size={16} />}
      </button>
      <div className="flex-1 min-w-0">
        <span className={`text-sm ${task.completed ? "line-through text-muted-foreground" : ""}`}>{task.title}</span>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {task.priority !== "medium" && (
            <span className={`text-xs flex items-center gap-0.5 ${PRIORITY_COLORS[task.priority]}`}>
              <Flag size={10} />{task.priority}
            </span>
          )}
          {task.dueDate && (
            <span className={`text-xs ${overdue ? "text-destructive font-medium" : soon ? "text-amber-600 dark:text-amber-400 font-medium" : "text-muted-foreground"}`}>
              {overdue ? `Overdue ${format(parseISO(task.dueDate), "MMM d")}` : `Due ${format(parseISO(task.dueDate), "MMM d")}`}
            </span>
          )}
          {task.notes && <span className="text-xs text-muted-foreground truncate">{task.notes}</span>}
        </div>
      </div>
      <div className="opacity-0 group-hover:opacity-100 flex gap-0.5 shrink-0 transition-opacity">
        <button onClick={() => setEditing(true)} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"><Pencil size={12} /></button>
        <button onClick={() => onDelete(task.id)} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-destructive transition-colors"><Trash2 size={12} /></button>
      </div>
    </div>
  );
}

// ── Project Edit Modal ────────────────────────────────────────────────────────
function ProjectEditModal({ open, onClose, project, onSave }: {
  open: boolean;
  onClose: () => void;
  project: ProjectWithTasks | null;
  onSave: (id: number, data: Partial<InsertProject>) => void;
}) {
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("not_started");
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (open && project) {
      setTitle(project.title);
      setStatus(project.status);
      setDueDate(project.dueDate ?? "");
      setDescription(project.description ?? "");
    }
  }, [open, project]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!project || !title.trim()) return;
    onSave(project.id, {
      title: title.trim(),
      status,
      dueDate: dueDate || null,
      description: description.trim() || null,
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Project</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Project Name *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Project name" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROJECT_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      <span className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${s.dot}`} />{s.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Due Date <span className="text-muted-foreground text-xs">(opt)</span></Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Description <span className="text-muted-foreground text-xs">(opt)</span></Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="What is this project about?" />
          </div>
          <div className="flex gap-2">
            <Button type="submit" className="flex-1">Save Changes</Button>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Chore Edit Modal ──────────────────────────────────────────────────────────
const CHORE_CATEGORIES = [
  { value: "cleaning", label: "Cleaning" }, { value: "yard", label: "Yard" },
  { value: "maintenance", label: "Maintenance" }, { value: "laundry", label: "Laundry" },
  { value: "cooking", label: "Cooking" }, { value: "other", label: "Other" },
];
const CHORE_FREQUENCIES = [
  { value: "daily", label: "Daily" }, { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 weeks" }, { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" }, { value: "yearly", label: "Yearly" },
  { value: "as_needed", label: "As Needed" },
];
const CHORE_PRIORITIES = [
  { value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" },
];

function ChoreEditModal({ open, onClose, chore, onSave }: {
  open: boolean;
  onClose: () => void;
  chore: Chore | null;
  onSave: (id: number, data: Partial<InsertChore>) => void;
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("cleaning");
  const [frequency, setFrequency] = useState("weekly");
  const [priority, setPriority] = useState("medium");
  const [nextDue, setNextDue] = useState("");
  const [assignee, setAssignee] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open && chore) {
      setTitle(chore.title);
      setCategory(chore.category);
      setFrequency(chore.frequency);
      setPriority(chore.priority);
      setNextDue(chore.nextDue ?? "");
      setAssignee(chore.assignee ?? "");
      setNotes(chore.notes ?? "");
    }
  }, [open, chore]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chore || !title.trim()) return;
    onSave(chore.id, { title: title.trim(), category, frequency, priority, nextDue: nextDue || null, assignee: assignee.trim() || null, notes: notes.trim() || null });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Edit Chore</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 pt-1">
          <div className="space-y-1.5">
            <Label>Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Vacuum living room" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CHORE_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CHORE_PRIORITIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Frequency</Label>
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CHORE_FREQUENCIES.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Next Due</Label>
              <Input type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Assignee <span className="text-muted-foreground text-xs">(opt)</span></Label>
            <Input value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="e.g. Jamison" />
          </div>
          <div className="space-y-1.5">
            <Label>Notes <span className="text-muted-foreground text-xs">(opt)</span></Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="submit" className="flex-1" disabled={!title.trim()}>Save Changes</Button>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
