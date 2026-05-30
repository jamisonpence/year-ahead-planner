import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format, parseISO } from "date-fns";
import {
  Plus, Target, Pencil, Trash2, MoreHorizontal, Check,
  Circle, CheckCircle2, ChevronRight, RefreshCw, Folder,
  ClipboardList, Flag, X,
  Leaf, Droplets, Heart, Dumbbell, Apple, BookOpen, Calendar,
  Users, Search, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageShell";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { daysUntil, PROGRESS_TYPES } from "@/lib/plannerUtils";
import GoalFormModal from "@/components/modals/GoalFormModal";
import PlannerSetup from "@/pages/planner/Setup";
import type {
  GoalWithProjects, Goal, ProjectWithTasks,
  InsertGoal,
  NutritionGoal, WorkoutPlan, ReadingGoal, BookWithSessions, Hobby, PublicUser,
} from "@shared/schema";
import { Link, useLocation } from "wouter";

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

const INLINE_PRIORITIES = ["low", "medium", "high"] as const;

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
        <div className="absolute z-50 w-full mt-1 bg-popover border rounded-lg shadow-lg overflow-hidden">
          {filtered.slice(0, 5).map((f) => (
            <button
              key={f.id}
              type="button"
              onMouseDown={() => { onChange(f.id); setQuery(""); setOpen(false); }}
              className="flex items-center gap-2.5 w-full px-2.5 py-2 hover:bg-secondary text-left transition-colors"
            >
              <BuddyAvatarSm user={f} size={22} />
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">{f.name}</p>
                <p className="text-[10px] text-muted-foreground truncate">{f.email}</p>
              </div>
            </button>
          ))}
        </div>
      )}
      {open && filtered.length === 0 && query && (
        <div className="absolute z-50 w-full mt-1 bg-popover border rounded-lg shadow-sm px-3 py-2">
          <p className="text-xs text-muted-foreground text-center">No friends found</p>
        </div>
      )}
    </div>
  );
}

// ── Inline goal editor ────────────────────────────────────────────────────────
function InlineGoalEditor({ goal, friends, onSave }: {
  goal: GoalWithProjects;
  friends: PublicUser[];
  onSave: (data: { id: number } & Partial<InsertGoal>) => void;
}) {
  const [expanded, setExpanded] = useState(true);
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

  useEffect(() => { reset(); setExpanded(true); }, [goal.id]);

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

// ── Sentinel values for domain goal cards ─────────────────────────────────────
const NUTRITION_ID = -5;
const WORKOUT_GOALS_ID = -6;
const READING_GOAL_ID = -7;
const HOBBY_GOALS_ID = -8;

// ── Hobby helpers ─────────────────────────────────────────────────────────────
function _parsePlans(extraJson: string): any[] {
  try { const o = JSON.parse(extraJson || "{}"); return Array.isArray(o.plans) ? o.plans : []; } catch { return []; }
}
function _parseGoals(extraJson: string): any[] {
  try { const o = JSON.parse(extraJson || "{}"); return Array.isArray(o.goals) ? o.goals : []; } catch { return []; }
}
function _setPlanInExtra(extraJson: string, planId: string, update: Record<string, any>): string {
  try {
    const o = JSON.parse(extraJson || "{}");
    const plans = Array.isArray(o.plans) ? o.plans : [];
    const idx = plans.findIndex((p: any) => p.id === planId);
    if (idx >= 0) plans[idx] = { ...plans[idx], ...update };
    return JSON.stringify({ ...o, plans });
  } catch { return extraJson; }
}
function _setGoalInExtra(extraJson: string, goalId: string, update: Record<string, any>): string {
  try {
    const o = JSON.parse(extraJson || "{}");
    const goals = Array.isArray(o.goals) ? o.goals : [];
    const idx = goals.findIndex((g: any) => g.id === goalId);
    if (idx >= 0) goals[idx] = { ...goals[idx], ...update };
    return JSON.stringify({ ...o, goals });
  } catch { return extraJson; }
}

// ── HobbyPlanEditor ───────────────────────────────────────────────────────────
function HobbyPlanEditor({ plan, hobby, friends, onSave }: {
  plan: any;
  hobby: any;
  friends: PublicUser[];
  onSave: (updates: Record<string, any>) => void;
}) {
  const [localSteps, setLocalSteps] = useState<any[]>(() => plan.steps ?? []);
  const [buddyUserId, setBuddyUserId] = useState<number | null>(plan.buddyUserId ?? null);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [newStepText, setNewStepText] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    setLocalSteps(plan.steps ?? []);
    setBuddyUserId(plan.buddyUserId ?? null);
  }, [plan.id]);

  const typeColors: Record<string, string> = { creative: "#ec4899", collection: "#f97316", outdoor: "#10b981", games: "#6366f1", learning: "#3b82f6", performance: "#8b5cf6" };
  const color = typeColors[hobby.hobbyType] ?? "#6366f1";
  const doneCount = localSteps.filter((s: any) => s.done).length;
  const pct = localSteps.length ? Math.round((doneCount / localSteps.length) * 100) : 0;
  const buddyDirty = (buddyUserId ?? null) !== (plan.buddyUserId ?? null);

  function saveSteps(steps: any[]) { setLocalSteps(steps); onSave({ steps }); }
  function toggleStep(id: string) { saveSteps(localSteps.map((s: any) => s.id === id ? { ...s, done: !s.done } : s)); }
  function deleteStep(id: string) { saveSteps(localSteps.filter((s: any) => s.id !== id)); }
  function startEdit(step: any) { setEditingStepId(step.id); setEditingText(step.text ?? step.title ?? ""); }
  function commitEdit(id: string) {
    if (!editingText.trim()) { setEditingStepId(null); return; }
    saveSteps(localSteps.map((s: any) => s.id === id ? { ...s, text: editingText.trim() } : s));
    setEditingStepId(null);
  }
  function addStep() {
    if (!newStepText.trim()) return;
    saveSteps([...localSteps, { id: `step_${Date.now()}`, text: newStepText.trim(), done: false }]);
    setNewStepText(""); setShowAdd(false);
  }

  return (
    <div className="space-y-3 p-1">
      <div className="p-3 rounded-xl border bg-secondary/30">
        <div className="flex items-center gap-2 mb-1.5">
          <ClipboardList size={14} style={{ color }} className="shrink-0" />
          <p className="text-sm font-semibold leading-tight flex-1 truncate">{plan.title}</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
          <Heart size={10} style={{ color }} />
          <span>{hobby.name}</span>
          {plan.durationWeeks && <span>· {plan.durationWeeks}w plan</span>}
        </div>
        {localSteps.length > 0 && (
          <div className="flex items-center gap-2">
            <Progress value={pct} className="h-1.5 flex-1" />
            <span className="text-xs text-muted-foreground shrink-0">{doneCount}/{localSteps.length} steps</span>
          </div>
        )}
      </div>
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">Steps</p>
        <div className="space-y-1">
          {localSteps.map((step: any) => (
            <div key={step.id} className={`group flex items-start gap-2.5 px-2 py-2 rounded-lg hover:bg-secondary/40 transition-colors ${step.done ? "opacity-60" : ""}`}>
              <button type="button" onClick={() => toggleStep(step.id)}
                className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${step.done ? "border-emerald-500 bg-emerald-500" : "border-muted-foreground/30 hover:border-emerald-400"}`}>
                {step.done && <Check size={10} className="text-white" />}
              </button>
              {editingStepId === step.id ? (
                <input autoFocus value={editingText} onChange={(e) => setEditingText(e.target.value)}
                  onBlur={() => commitEdit(step.id)}
                  onKeyDown={(e) => { if (e.key === "Enter") commitEdit(step.id); if (e.key === "Escape") setEditingStepId(null); }}
                  className="flex-1 text-sm bg-transparent border-b border-primary outline-none pb-0.5" />
              ) : (
                <p className={`text-sm flex-1 cursor-text ${step.done ? "line-through text-muted-foreground" : ""}`}
                  onClick={() => startEdit(step)}>{step.text ?? step.title}</p>
              )}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button type="button" onClick={() => startEdit(step)} className="p-1 rounded hover:bg-muted text-muted-foreground"><Pencil size={11} /></button>
                <button type="button" onClick={() => deleteStep(step.id)} className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-950/40 text-muted-foreground hover:text-red-500"><Trash2 size={11} /></button>
              </div>
            </div>
          ))}
          {showAdd ? (
            <div className="flex gap-1.5 px-2 pt-1">
              <input autoFocus value={newStepText} onChange={(e) => setNewStepText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addStep(); if (e.key === "Escape") { setShowAdd(false); setNewStepText(""); } }}
                placeholder="New step..." className="flex-1 h-8 text-sm bg-transparent border rounded-lg px-2 outline-none focus:border-primary" />
              <Button size="sm" className="h-8 px-2" onClick={addStep}><Check size={12} /></Button>
              <Button size="sm" variant="ghost" className="h-8 px-1" onClick={() => { setShowAdd(false); setNewStepText(""); }}><X size={12} /></Button>
            </div>
          ) : (
            <button type="button" onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 mt-0.5">
              <Plus size={12} /> Add step
            </button>
          )}
        </div>
      </div>
      {friends.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Users size={11} className="text-muted-foreground" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Accountabilibuddy</p>
          </div>
          <BuddySearchPicker value={buddyUserId} onChange={setBuddyUserId} friends={friends} />
        </div>
      )}
      {buddyDirty && (
        <Button size="sm" className="w-full h-8 text-xs" onClick={() => onSave({ buddyUserId })}>Save Buddy</Button>
      )}
      {plan.notes && (
        <div className="p-2.5 rounded-lg bg-secondary/40 text-xs text-muted-foreground">
          <p className="font-semibold mb-0.5">Notes</p>
          <p>{plan.notes}</p>
        </div>
      )}
    </div>
  );
}

// ── HobbyGoalInlineEditor ─────────────────────────────────────────────────────
function HobbyGoalInlineEditor({ goal, friends, onSave }: {
  goal: any;
  friends: PublicUser[];
  onSave: (updates: Record<string, any>) => void;
}) {
  const [title, setTitle] = useState(goal.title ?? "");
  const [currentValue, setCurrentValue] = useState(String(goal.currentValue ?? ""));
  const [buddyUserId, setBuddyUserId] = useState<number | null>(goal.buddyUserId ?? null);

  const isDirty =
    title.trim() !== (goal.title ?? "") ||
    (goal.goalType === "count" && parseFloat(currentValue) !== (goal.currentValue ?? 0)) ||
    (buddyUserId ?? null) !== (goal.buddyUserId ?? null);

  const handleSave = () => {
    const updates: Record<string, any> = { title: title.trim() || goal.title, buddyUserId: buddyUserId ?? null };
    if (goal.goalType === "count") updates.currentValue = parseFloat(currentValue) || 0;
    onSave(updates);
  };

  return (
    <div className="space-y-2.5 pt-1">
      <div className="space-y-1">
        <Label className="text-xs">Title</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-8 text-xs" />
      </div>
      {goal.goalType === "count" && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Current ({goal.unit || "count"})</Label>
            <Input type="number" value={currentValue} onChange={(e) => setCurrentValue(e.target.value)} step="1" min="0" className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Target</Label>
            <Input type="number" value={String(goal.targetValue ?? "")} readOnly className="h-8 text-xs bg-secondary/40" />
          </div>
        </div>
      )}
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

// ── GoalBuddyPicker ───────────────────────────────────────────────────────────
function GoalBuddyPicker({ currentBuddyId, friends, onSave, label = "Accountabilibuddy" }: {
  currentBuddyId: number | null;
  friends: PublicUser[];
  onSave: (buddyUserId: number | null) => void;
  label?: string;
}) {
  const [buddyUserId, setBuddyUserId] = useState<number | null>(currentBuddyId);
  const isDirty = (buddyUserId ?? null) !== (currentBuddyId ?? null);
  useEffect(() => { setBuddyUserId(currentBuddyId); }, [currentBuddyId]);
  return (
    <div className="space-y-1.5 p-3 rounded-xl border bg-secondary/20">
      <div className="flex items-center gap-1.5 mb-1">
        <Users size={11} className="text-muted-foreground" />
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
      </div>
      <BuddySearchPicker value={buddyUserId} onChange={setBuddyUserId} friends={friends} />
      {isDirty && (
        <Button size="sm" className="w-full h-8 text-xs mt-1" onClick={() => onSave(buddyUserId)}>
          Save Buddy
        </Button>
      )}
    </div>
  );
}

// ── WorkoutMilestonesEditor ───────────────────────────────────────────────────
function WorkoutMilestonesEditor({ plan, currentWeek, metric, onSave }: {
  plan: WorkoutPlan;
  currentWeek: number | null;
  metric: { label?: string; unit?: string } | null;
  onSave: (milestonesJson: string) => void;
}) {
  type Milestone = { week: number; description: string; targetValue?: number; done?: boolean };
  const [milestones, setMilestones] = useState<Milestone[]>(() => {
    try { return JSON.parse(plan.milestonesJson || "[]"); } catch { return []; }
  });
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editDesc, setEditDesc] = useState("");
  const [editWeek, setEditWeek] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newDesc, setNewDesc] = useState("");
  const [newWeek, setNewWeek] = useState("");

  useEffect(() => {
    try { setMilestones(JSON.parse(plan.milestonesJson || "[]")); } catch {}
  }, [plan.id]);

  function save(updated: Milestone[]) { setMilestones(updated); onSave(JSON.stringify(updated)); }
  function toggleDone(idx: number) {
    const autoComplete = currentWeek !== null && currentWeek > milestones[idx].week;
    const currentDone = milestones[idx].done ?? autoComplete;
    save(milestones.map((m, i) => i === idx ? { ...m, done: !currentDone } : m));
  }
  function startEdit(idx: number) { setEditingIdx(idx); setEditDesc(milestones[idx].description); setEditWeek(String(milestones[idx].week)); }
  function commitEdit() {
    if (editingIdx === null) return;
    if (!editDesc.trim()) { setEditingIdx(null); return; }
    save(milestones.map((m, i) => i === editingIdx ? { ...m, description: editDesc.trim(), week: parseInt(editWeek) || m.week } : m));
    setEditingIdx(null);
  }
  function deleteMilestone(idx: number) { save(milestones.filter((_, i) => i !== idx)); }
  function addMilestone() {
    if (!newDesc.trim() || !newWeek) return;
    const updated = [...milestones, { week: parseInt(newWeek), description: newDesc.trim() }].sort((a, b) => a.week - b.week);
    save(updated); setNewDesc(""); setNewWeek(""); setShowAdd(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2 px-1">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Milestones</p>
      </div>
      <div className="space-y-1.5">
        {milestones.map((m, i) => {
          const autoComplete = currentWeek !== null && currentWeek > m.week;
          const isDone = m.done ?? autoComplete;
          const isCurrent = !isDone && currentWeek !== null && (currentWeek === m.week || (i === 0 && currentWeek < m.week));
          const isEditing = editingIdx === i;
          return (
            <div key={i} className={`group flex items-start gap-3 px-2.5 py-2.5 rounded-xl border transition-colors ${isDone ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800" : isCurrent ? "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800" : "bg-card border-border hover:border-muted-foreground/30"}`}>
              <button type="button" onClick={() => toggleDone(i)}
                className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${isDone ? "border-emerald-500 bg-emerald-500" : isCurrent ? "border-blue-500 hover:border-blue-600" : "border-muted-foreground/30 hover:border-emerald-400"}`}>
                {isDone && <Check size={10} className="text-white" />}
              </button>
              <div className="flex-1 min-w-0">
                {isEditing ? (
                  <div className="space-y-1.5">
                    <input autoFocus value={editDesc} onChange={(e) => setEditDesc(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditingIdx(null); }}
                      className="w-full text-xs bg-transparent border-b border-primary outline-none pb-0.5" />
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground">Week:</span>
                      <input type="number" value={editWeek} onChange={(e) => setEditWeek(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); }}
                        className="w-12 text-xs bg-transparent border-b border-primary outline-none pb-0.5" min={1} />
                      <button type="button" onClick={commitEdit} className="text-[10px] text-primary font-medium hover:underline ml-1">Save</button>
                      <button type="button" onClick={() => setEditingIdx(null)} className="text-[10px] text-muted-foreground hover:underline">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className={`text-xs font-medium truncate ${isDone ? "line-through text-muted-foreground" : ""}`}
                      onClick={() => startEdit(i)} style={{ cursor: "text" }}>{m.description}</p>
                    {m.targetValue !== undefined && (
                      <p className="text-[10px] text-muted-foreground">Target: {m.targetValue}{metric?.unit ? ` ${metric.unit}` : ""}</p>
                    )}
                  </>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {!isEditing && <span className="text-[10px] text-muted-foreground">Wk {m.week}</span>}
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button type="button" onClick={() => startEdit(i)} className="p-1 rounded hover:bg-muted text-muted-foreground"><Pencil size={10} /></button>
                  <button type="button" onClick={() => deleteMilestone(i)} className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-950/40 text-muted-foreground hover:text-red-500"><Trash2 size={10} /></button>
                </div>
              </div>
            </div>
          );
        })}
        {showAdd ? (
          <div className="flex flex-col gap-1.5 px-1 pt-1">
            <input autoFocus value={newDesc} onChange={(e) => setNewDesc(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") { setShowAdd(false); setNewDesc(""); setNewWeek(""); } }}
              placeholder="Milestone description..."
              className="h-8 text-sm bg-transparent border rounded-lg px-2 outline-none focus:border-primary w-full" />
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground shrink-0">Week:</span>
              <input type="number" value={newWeek} onChange={(e) => setNewWeek(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addMilestone(); }}
                placeholder="e.g. 4" min={1}
                className="h-8 text-sm bg-transparent border rounded-lg px-2 outline-none focus:border-primary w-20" />
              <Button size="sm" className="h-8 px-3 text-xs flex-1" onClick={addMilestone} disabled={!newDesc.trim() || !newWeek}>
                <Check size={12} className="mr-1" /> Add
              </Button>
              <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => { setShowAdd(false); setNewDesc(""); setNewWeek(""); }}>
                <X size={12} />
              </Button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5">
            <Plus size={12} /> Add milestone
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function GoalsPage() {
  const { toast } = useToast();
  const [goalModal, setGoalModal] = useState(false);
  const [browseModal, setBrowseModal] = useState(false);
  const [mealPlanModal, setMealPlanModal] = useState(false);
  const [editGoal, setEditGoal] = useState<Goal | null>(null);
  const [selectedGoalId, setSelectedGoalId] = useState<number | null>(null);
  const [selectedHobbyPlanKey, setSelectedHobbyPlanKey] = useState<string | null>(null);
  const [editingHobbyGoalId, setEditingHobbyGoalId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"goals" | "detail">("goals");

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: goals = [] } = useQuery<GoalWithProjects[]>({ queryKey: ["/api/goals"] });
  const { data: nutritionGoal } = useQuery<NutritionGoal | null>({ queryKey: ["/api/nutrition/goals"] });
  const { data: workoutPlans = [] } = useQuery<WorkoutPlan[]>({ queryKey: ["/api/workout-plans"] });
  const { data: readingGoal } = useQuery<ReadingGoal | null>({ queryKey: ["/api/reading/goal"] });
  const { data: books = [] } = useQuery<BookWithSessions[]>({ queryKey: ["/api/books"] });
  const { data: hobbies = [] } = useQuery<Hobby[]>({ queryKey: ["/api/hobbies"] });
  const { data: friends = [] } = useQuery<PublicUser[]>({
    queryKey: ["/api/friends"],
    queryFn: async () => (await apiRequest("GET", "/api/friends")).json(),
  });

  // ── Mutations ────────────────────────────────────────────────────────────────
  const inv = () => queryClient.invalidateQueries({ queryKey: ["/api/goals"] });

  const deleteGoal = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/goals/${id}`),
    onSuccess: () => { inv(); toast({ title: "Goal deleted" }); setSelectedGoalId(null); },
  });
  const updateGoal = useMutation({
    mutationFn: ({ id, ...data }: { id: number } & Partial<InsertGoal>) => apiRequest("PATCH", `/api/goals/${id}`, data),
    onSuccess: () => { inv(); toast({ title: "Goal updated" }); },
  });
  const updateHobby = useMutation({
    mutationFn: ({ id, extraJson }: { id: number; extraJson: string }) => apiRequest("PATCH", `/api/hobbies/${id}`, { extraJson }),
    onSuccess: () => { inv(); toast({ title: "Updated" }); },
  });
  const updateReadingGoal = useMutation({
    mutationFn: (data: Record<string, any>) => apiRequest("PATCH", "/api/reading/goal", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/reading/goal"] }); toast({ title: "Reading goal updated" }); },
  });
  const updateNutritionGoal = useMutation({
    mutationFn: (data: Record<string, any>) => apiRequest("PATCH", "/api/nutrition/goals", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/nutrition/goals"] }); toast({ title: "Nutrition goal updated" }); },
  });
  const updateWorkoutPlan = useMutation({
    mutationFn: ({ id, ...data }: { id: number } & Record<string, any>) => apiRequest("PATCH", `/api/workout-plans/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/workout-plans"] }); toast({ title: "Workout plan updated" }); },
  });

  // ── Derived state ─────────────────────────────────────────────────────────────
  const selectedGoal = goals.find((g) => g.id === selectedGoalId) ?? null;
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

  // ── Detail column label ───────────────────────────────────────────────────────
  const detailLabel = isNutritionSelected ? "Nutrition Goal"
    : isWorkoutGoalsSelected ? "Workout Goal"
    : isReadingGoalSelected ? "Reading Goal"
    : isHobbyGoalsSelected && selectedHobbyPlan ? "Plan Detail"
    : isHobbyGoalsSelected ? "Hobby Goals"
    : selectedGoal ? "Goal Detail"
    : "Detail";

  return (
    <div className="h-[calc(100vh-0px)] flex flex-col">
      {/* Header */}
      <PageHeader
        title="Goals"
        subtitle="Long-term outcomes and progress"
        action={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setBrowseModal(true)} className="gap-1.5">
              <Sparkles size={13} /> Browse Goals & Plans
            </Button>
            <Button size="sm" onClick={() => { setEditGoal(null); setGoalModal(true); }} className="gap-1.5">
              <Plus size={13} /><Target size={13} />Goal
            </Button>
          </div>
        }
      />

      {/* Mobile tab bar */}
      <div className="md:hidden flex border-b shrink-0">
        {(["goals", "detail"] as const).map((tab) => (
          <button key={tab} onClick={() => setMobileView(tab)}
            className={`flex-1 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors ${mobileView === tab ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}>
            {tab}
          </button>
        ))}
      </div>

      {/* 2-column layout */}
      <div className="flex flex-1 min-h-0 divide-x">

        {/* ── Column 1: Goals ───────────────────────────────────────────── */}
        <div className={`shrink-0 flex flex-col min-h-0 w-full md:w-72 ${mobileView !== "goals" ? "hidden md:flex" : "flex"}`}>
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
                  onClick={() => { setSelectedGoalId(isSelected ? null : g.id); if (!isSelected) setMobileView("detail"); }}
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
                        <DropdownMenuItem className="text-destructive focus:text-destructive"
                          onClick={(e) => { e.stopPropagation(); deleteGoal.mutate(g.id); }}>
                          <Trash2 size={13} className="mr-2" />Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="flex items-center gap-2 mb-1.5">
                    <Progress value={pct} className="h-1.5 flex-1" />
                    <span className="text-xs text-muted-foreground shrink-0">{pct}%</span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className={`flex items-center gap-0.5 ${PRIORITY_COLORS[g.priority]}`}>
                      <Flag size={10} /> {g.priority}
                    </span>
                    <div className="flex items-center gap-2">
                      {buddy && <BuddyAvatarSm user={buddy} size={16} />}
                      {d !== null && (
                        <span className={d < 0 ? "text-destructive font-medium" : d <= 14 ? "text-amber-600 dark:text-amber-400 font-medium" : ""}>
                          {d < 0 ? `${Math.abs(d)}d overdue` : d === 0 ? "Due today" : `${d}d left`}
                        </span>
                      )}
                      {g.projects.length > 0 && (
                        <span className="flex items-center gap-0.5">
                          <Folder size={10} />{g.projects.length}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* ── Domain goal cards ──────────────────────────────────────── */}

            {/* Nutrition Goals */}
            {nutritionGoal && (
              <div
                onClick={() => { setSelectedGoalId(selectedGoalId === NUTRITION_ID ? null : NUTRITION_ID); if (selectedGoalId !== NUTRITION_ID) setMobileView("detail"); }}
                className={`group rounded-xl border p-3 cursor-pointer transition-all hover:shadow-sm mt-1 ${selectedGoalId === NUTRITION_ID ? "border-rose-400 bg-rose-50 dark:bg-rose-950/20" : "bg-card border-dashed hover:border-rose-300"}`}
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

            {/* Active Workout Plan */}
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
                  onClick={() => { setSelectedGoalId(isSelected ? null : WORKOUT_GOALS_ID); if (!isSelected) setMobileView("detail"); }}
                  className={`group rounded-xl border p-3 cursor-pointer transition-all hover:shadow-sm mt-1 ${isSelected ? "border-blue-400 bg-blue-50 dark:bg-blue-950/20" : "bg-card hover:border-blue-300"}`}
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

            {/* Reading Goal */}
            {readingGoal && (() => {
              const pct = Math.min(100, Math.round((booksFinishedThisYear / readingGoal.booksTarget) * 100));
              return (
                <div
                  onClick={() => { setSelectedGoalId(selectedGoalId === READING_GOAL_ID ? null : READING_GOAL_ID); if (selectedGoalId !== READING_GOAL_ID) setMobileView("detail"); }}
                  className={`group rounded-xl border p-3 cursor-pointer transition-all hover:shadow-sm mt-1 ${selectedGoalId === READING_GOAL_ID ? "border-amber-400 bg-amber-50 dark:bg-amber-950/20" : "bg-card border-dashed hover:border-amber-300"}`}
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

            {/* Active hobby plans */}
            {activeHobbyPlans.map((p: any) => {
              const key = `${p.hobby.id}_${p.id}`;
              const isSelected = selectedGoalId === HOBBY_GOALS_ID && selectedHobbyPlanKey === key;
              const done = (p.steps ?? []).filter((s: any) => s.done).length;
              const total = (p.steps ?? []).length;
              const pct = total ? Math.round((done / total) * 100) : 0;
              const typeColors: Record<string, string> = { creative: "#ec4899", collection: "#f97316", outdoor: "#10b981", games: "#6366f1", learning: "#3b82f6", performance: "#8b5cf6" };
              const color = typeColors[p.hobby.hobbyType] ?? "#6366f1";
              return (
                <div key={key}
                  onClick={() => { setSelectedGoalId(HOBBY_GOALS_ID); setSelectedHobbyPlanKey(isSelected ? null : key); if (!isSelected) setMobileView("detail"); }}
                  className={`group rounded-xl border p-3 cursor-pointer transition-all hover:shadow-sm mt-1 ${isSelected ? "border-blue-400 bg-blue-50 dark:bg-blue-950/20" : "bg-card hover:border-blue-300"}`}
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
                onClick={() => { setSelectedGoalId(selectedGoalId === HOBBY_GOALS_ID && !selectedHobbyPlanKey ? null : HOBBY_GOALS_ID); setSelectedHobbyPlanKey(null); if (!(selectedGoalId === HOBBY_GOALS_ID && !selectedHobbyPlanKey)) setMobileView("detail"); }}
                className={`group rounded-xl border p-3 cursor-pointer transition-all hover:shadow-sm mt-1 ${selectedGoalId === HOBBY_GOALS_ID && !selectedHobbyPlanKey ? "border-amber-400 bg-amber-50 dark:bg-amber-950/20" : "bg-card hover:border-amber-300"}`}
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

            {/* Cross-nav to Projects & Tasks */}
            <div className="pt-2 pb-1">
              <Link href="/tasks">
                <a className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors px-1">
                  <ClipboardList size={11} /> Projects & Tasks →
                </a>
              </Link>
            </div>
          </div>
        </div>

        {/* ── Column 2: Goal Detail ──────────────────────────────────────── */}
        <div className={`flex-1 flex flex-col min-h-0 min-w-0 ${mobileView !== "detail" ? "hidden md:flex" : "flex"}`}>
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground">{detailLabel}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4">

            {/* ── Regular goal detail ──────────────────────────────────── */}
            {selectedGoal && (
              <>
                <InlineGoalEditor
                  goal={selectedGoal}
                  friends={friends}
                  onSave={(data) => updateGoal.mutate(data)}
                />

                {/* Linked projects — read-only context */}
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <span className="text-sm font-semibold text-foreground flex items-center gap-1.5"><Folder size={14} className="text-primary" /> Linked Projects</span>
                    {selectedGoal.projects.length > 0 && (
                      <span className="text-xs text-muted-foreground">{selectedGoal.projects.length}</span>
                    )}
                  </div>
                  {selectedGoal.projects.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground">
                      <Folder size={24} className="mx-auto mb-2 opacity-20" />
                      <p className="text-xs">No linked projects yet</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {selectedGoal.projects.map((p) => {
                        const pct = projectPct(p);
                        const statusInfo = PROJECT_STATUSES.find((s) => s.value === p.status) ?? PROJECT_STATUSES[0];
                        const d = p.dueDate ? daysUntil(p.dueDate) : null;
                        return (
                          <div key={p.id} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border bg-card">
                            <Folder size={13} className="text-muted-foreground shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{p.title}</p>
                              {p.tasks.length > 0 && (
                                <div className="flex items-center gap-2 mt-0.5">
                                  <Progress value={pct} className="h-1 flex-1" />
                                  <span className="text-xs text-muted-foreground shrink-0">
                                    {p.tasks.filter(t => t.completed).length}/{p.tasks.length}
                                  </span>
                                </div>
                              )}
                              {d !== null && (
                                <p className={`text-xs mt-0.5 ${d < 0 ? "text-destructive font-medium" : d <= 7 ? "text-amber-600 dark:text-amber-400 font-medium" : "text-muted-foreground"}`}>
                                  {d < 0 ? "Overdue" : `Due ${format(parseISO(p.dueDate!), "MMM d")}`}
                                </p>
                              )}
                            </div>
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs border shrink-0 ${STATUS_PILL[p.status]}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot}`} />
                              {statusInfo.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <Link href="/tasks">
                    <a className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors mt-2 px-1">
                      <ClipboardList size={11} /> Manage in Projects & Tasks →
                    </a>
                  </Link>
                </div>
              </>
            )}

            {/* ── Nutrition detail ─────────────────────────────────────── */}
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
                    <div className="bg-blue-500 rounded-l-full" style={{ width: `${Math.round((nutritionGoal.protein * 4 / nutritionGoal.calories) * 100)}%` }} />
                    <div className="bg-amber-500" style={{ width: `${Math.round((nutritionGoal.carbs * 4 / nutritionGoal.calories) * 100)}%` }} />
                    <div className="bg-violet-500 rounded-r-full flex-1" />
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />Protein {Math.round((nutritionGoal.protein * 4 / nutritionGoal.calories) * 100)}%</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />Carbs {Math.round((nutritionGoal.carbs * 4 / nutritionGoal.calories) * 100)}%</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-violet-500 inline-block" />Fat {Math.round((nutritionGoal.fat * 9 / nutritionGoal.calories) * 100)}%</span>
                  </div>
                </div>
                {friends.length > 0 && (
                  <GoalBuddyPicker
                    currentBuddyId={(nutritionGoal as any)?.buddyUserId ?? null}
                    friends={friends}
                    onSave={(buddyUserId) => updateNutritionGoal.mutate({ buddyUserId })}
                  />
                )}
                <Link href="/health"><a className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-1"><Heart size={11} /> Edit in Health</a></Link>
              </div>
            )}

            {/* ── Workout goal detail ──────────────────────────────────── */}
            {isWorkoutGoalsSelected && (() => {
              const activePlan = workoutPlans.find(p => p.isActive);
              if (!activePlan) return (
                <div className="text-center py-12 text-muted-foreground">
                  <Dumbbell size={28} className="mx-auto mb-3 opacity-20" />
                  <p className="text-xs">No active plan</p>
                  <Link href="/workouts"><a className="text-xs text-primary hover:underline mt-1 block">Set one in Workouts →</a></Link>
                </div>
              );
              let metric: { label: string; current?: number; target?: number; unit?: string } | null = null;
              let schedule: { dayOfWeek: string; templateName: string }[] = [];
              try { if (activePlan.goalMetricJson) metric = JSON.parse(activePlan.goalMetricJson); } catch {}
              try { if ((activePlan as any).scheduleJson) schedule = JSON.parse((activePlan as any).scheduleJson); } catch {}
              const weeksElapsed = activePlan.startDate
                ? Math.floor((Date.now() - new Date(activePlan.startDate).getTime()) / (7 * 86400000))
                : null;
              const currentWeek = weeksElapsed !== null ? Math.min(weeksElapsed + 1, activePlan.durationWeeks) : null;
              const pct = (weeksElapsed !== null && activePlan.durationWeeks > 0)
                ? Math.min(100, Math.round((weeksElapsed / activePlan.durationWeeks) * 100))
                : 0;
              const dayOrder = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];
              const sortedSchedule = [...schedule].sort((a, b) => dayOrder.indexOf(a.dayOfWeek) - dayOrder.indexOf(b.dayOfWeek));
              const todayDow = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"][new Date().getDay()];
              return (
                <div className="space-y-3">
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
                  {metric?.target && (
                    <div className="p-2.5 rounded-lg bg-secondary/40">
                      <p className="text-xs text-muted-foreground mb-0.5">Goal Target</p>
                      <p className="text-sm font-semibold">{metric.target}{metric.unit ? ` ${metric.unit}` : ""}</p>
                      {metric.current !== undefined && (
                        <p className="text-xs text-muted-foreground">Currently: {metric.current}{metric.unit ? ` ${metric.unit}` : ""}</p>
                      )}
                    </div>
                  )}
                  {sortedSchedule.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-2">Weekly Schedule</p>
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
                    </div>
                  )}
                  <WorkoutMilestonesEditor
                    plan={activePlan}
                    currentWeek={currentWeek}
                    metric={metric}
                    onSave={(milestonesJson) => updateWorkoutPlan.mutate({ id: activePlan.id, milestonesJson })}
                  />
                  {friends.length > 0 && (
                    <GoalBuddyPicker
                      currentBuddyId={(activePlan as any).buddyUserId ?? null}
                      friends={friends}
                      onSave={(buddyUserId) => updateWorkoutPlan.mutate({ id: activePlan.id, buddyUserId })}
                    />
                  )}
                  <Link href="/workouts"><a className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1 px-1"><Dumbbell size={11} /> Manage in Workouts</a></Link>
                </div>
              );
            })()}

            {/* ── Reading goal detail ──────────────────────────────────── */}
            {isReadingGoalSelected && readingGoal && (() => {
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
                  {readingGoal.label && <p className="text-sm font-semibold text-center">{readingGoal.label}</p>}
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
                  {friends.length > 0 && (
                    <GoalBuddyPicker
                      currentBuddyId={(readingGoal as any).buddyUserId ?? null}
                      friends={friends}
                      onSave={(buddyUserId) => updateReadingGoal.mutate({ buddyUserId })}
                    />
                  )}
                  <Link href="/reading"><a className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-1"><BookOpen size={11} /> Edit goal in Reading</a></Link>
                </div>
              );
            })()}

            {/* ── Hobby plan detail ────────────────────────────────────── */}
            {isHobbyGoalsSelected && selectedHobbyPlan && (() => {
              const plan = selectedHobbyPlan;
              const hobby = plan.hobby;
              return (
                <HobbyPlanEditor
                  plan={plan}
                  hobby={hobby}
                  friends={friends}
                  onSave={(updates) => {
                    const newExtra = _setPlanInExtra(hobby.extraJson ?? "{}", plan.id, updates);
                    updateHobby.mutate({ id: hobby.id, extraJson: newExtra });
                  }}
                />
              );
            })()}

            {/* ── Hobby goals overview ─────────────────────────────────── */}
            {isHobbyGoalsSelected && !selectedHobbyPlanKey && (
              <div className="space-y-3">
                {activeHobbyGoals.map((g: any) => {
                  let pct = 0;
                  let sublabel = "";
                  if (g.goalType === "count") { const cur = g.currentValue ?? 0; const tgt = g.targetValue ?? 1; pct = Math.min(100, Math.round((cur / tgt) * 100)); sublabel = `${cur} / ${tgt} ${g.unit ?? ""}`; }
                  else if (g.goalType === "milestone") { pct = g.status === "completed" ? 100 : 0; sublabel = "Milestone"; }
                  else if (g.goalType === "frequency") { sublabel = `${g.freqTimes}× / ${g.freqPeriod}`; pct = 50; }
                  const isEditing = editingHobbyGoalId === g.id;
                  const currentBuddy = friends.find(f => f.id === g.buddyUserId) ?? null;
                  return (
                    <div key={g.id} className="rounded-xl border p-3 space-y-2 bg-card">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold truncate">{g.title}</p>
                          <p className="text-xs text-muted-foreground">{g.hobby.name} · <span className="capitalize">{g.goalType}</span></p>
                        </div>
                        <button
                          onClick={() => setEditingHobbyGoalId(isEditing ? null : g.id)}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border rounded-lg px-2 py-1 hover:bg-muted transition-all shrink-0"
                        >
                          {isEditing ? <X size={10} /> : <Pencil size={10} />}
                          {isEditing ? "Cancel" : "Edit"}
                        </button>
                      </div>
                      {!isEditing && (
                        <>
                          {g.goalType === "count" && <Progress value={pct} className="h-1.5" />}
                          <p className="text-xs text-muted-foreground">{sublabel}</p>
                          {currentBuddy && (
                            <div className="flex items-center gap-1.5">
                              <BuddyAvatarSm user={currentBuddy} size={16} />
                              <span className="text-xs text-muted-foreground">
                                <span className="text-primary/80 font-medium">{currentBuddy.name.split(" ")[0]}</span> is your buddy
                              </span>
                            </div>
                          )}
                        </>
                      )}
                      {isEditing && (
                        <HobbyGoalInlineEditor
                          goal={g}
                          friends={friends}
                          onSave={(updates) => {
                            const newExtra = _setGoalInExtra(g.hobby.extraJson ?? "{}", g.id, updates);
                            updateHobby.mutate({ id: g.hobby.id, extraJson: newExtra });
                            setEditingHobbyGoalId(null);
                          }}
                        />
                      )}
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
            )}

            {/* ── Empty state ──────────────────────────────────────────── */}
            {!selectedGoal && !isNutritionSelected && !isWorkoutGoalsSelected && !isReadingGoalSelected && !isHobbyGoalsSelected && (
              <div className="text-center py-16 text-muted-foreground">
                <Target size={36} className="mx-auto mb-4 opacity-20" />
                <p className="font-medium text-sm">Select a goal to see details</p>
                <p className="text-xs mt-1">Click any goal on the left to view progress and linked projects</p>
              </div>
            )}

          </div>
        </div>

      </div>

      <BrowseGoalsModal open={browseModal} onClose={() => setBrowseModal(false)} onOpenMealPlan={() => { setBrowseModal(false); setMealPlanModal(true); }} />
      <Dialog open={mealPlanModal} onOpenChange={(o) => !o && setMealPlanModal(false)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <PlannerSetup onClose={() => setMealPlanModal(false)} />
        </DialogContent>
      </Dialog>
      <GoalFormModal open={goalModal} onClose={() => { setGoalModal(false); setEditGoal(null); }} editGoal={editGoal} />
    </div>
  );
}

// ── Browse Goals & Plans Modal ────────────────────────────────────────────────

type BrowseCategory = "reading" | "workout" | "nutrition" | "skill" | null;

const BROWSE_CATEGORIES = [
  { key: "reading"   as const, emoji: "📚", label: "Reading",           sub: "Set a reading goal for the year or a custom period" },
  { key: "workout"   as const, emoji: "💪", label: "Workout",           sub: "Create a training plan with a goal type and duration"  },
  { key: "nutrition" as const, emoji: "🥗", label: "Nutrition",         sub: "Define your calorie and macro targets"                 },
  { key: "skill"     as const, emoji: "✨", label: "Skill Development", sub: "Add a hobby and start tracking your growth"            },
];

const HOBBY_TYPES = [
  { value: "creative",    label: "Creative",    emoji: "🎨" },
  { value: "physical",    label: "Physical",    emoji: "🏃" },
  { value: "intellectual",label: "Intellectual",emoji: "📖" },
  { value: "social",      label: "Social",      emoji: "👥" },
  { value: "outdoor",     label: "Outdoor",     emoji: "🌿" },
  { value: "culinary",    label: "Culinary",    emoji: "🍳" },
  { value: "musical",     label: "Musical",     emoji: "🎵" },
  { value: "technical",   label: "Technical",   emoji: "💻" },
  { value: "collecting",  label: "Collecting",  emoji: "🗂️" },
  { value: "gaming",      label: "Gaming",      emoji: "🎮" },
  { value: "other",       label: "Other",       emoji: "⭐" },
];

const GOAL_TYPES = [
  { value: "strength",     label: "Strength"       },
  { value: "muscle",       label: "Muscle Building"},
  { value: "weight_loss",  label: "Weight Loss"    },
  { value: "endurance",    label: "Endurance"      },
  { value: "athleticism",  label: "General Fitness"},
  { value: "flexibility",  label: "Flexibility"    },
  { value: "custom",       label: "Custom"         },
];

function getTimeframeDates(tf: "year" | "month" | "quarter" | "custom"): { start: string; end: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (tf === "year")    return { start: `${y}-01-01`, end: `${y}-12-31` };
  if (tf === "month") {
    const last = new Date(y, m + 1, 0).getDate();
    return { start: `${y}-${String(m+1).padStart(2,"0")}-01`, end: `${y}-${String(m+1).padStart(2,"0")}-${last}` };
  }
  if (tf === "quarter") {
    const q = Math.floor(m / 3);
    const qs = q * 3; const qe = qs + 2;
    const last = new Date(y, qe + 1, 0).getDate();
    return { start: `${y}-${String(qs+1).padStart(2,"0")}-01`, end: `${y}-${String(qe+1).padStart(2,"0")}-${last}` };
  }
  return { start: "", end: "" };
}

function BrowseGoalsModal({ open, onClose, onOpenMealPlan }: { open: boolean; onClose: () => void; onOpenMealPlan?: () => void }) {
  const { toast } = useToast();
  const qc = queryClient;
  const [, navigate] = useLocation();
  const [category, setCategory] = useState<BrowseCategory>(null);

  // Reading state
  const [rLabel, setRLabel]         = useState("");
  const [rTarget, setRTarget]       = useState("12");
  const [rTimeframe, setRTimeframe] = useState<"year" | "month" | "quarter" | "custom">("year");
  const [rStart, setRStart]         = useState(() => getTimeframeDates("year").start);
  const [rEnd, setREnd]             = useState(() => getTimeframeDates("year").end);
  const [bookSearch, setBookSearch] = useState("");
  const [addingBookId, setAddingBookId] = useState<number | null>(null);
  const [addingBookDate, setAddingBookDate] = useState("");

  // Workout state
  const [wName, setWName]         = useState("");
  const [wGoalType, setWGoalType] = useState("strength");
  const [wWeeks, setWWeeks]       = useState("12");

  // Nutrition state
  const [nCals, setNCals]   = useState("2000");
  const [nProt, setNProt]   = useState("150");
  const [nCarbs, setNCarbs] = useState("200");
  const [nFat, setNFat]     = useState("65");
  const [nWater, setNWater] = useState("8");

  const [nPreset, setNPreset] = useState<"maintain" | "cut" | "bulk" | "custom">("maintain");

  // Preset applier
  function applyNutritionPreset(preset: typeof nPreset) {
    setNPreset(preset);
    if (preset === "maintain") { setNCals("2000"); setNProt("150"); setNCarbs("200"); setNFat("65"); }
    else if (preset === "cut")     { setNCals("1600"); setNProt("170"); setNCarbs("130"); setNFat("55"); }
    else if (preset === "bulk")    { setNCals("2600"); setNProt("190"); setNCarbs("310"); setNFat("75"); }
  }

  // Hobby/skill state
  const [hName, setHName] = useState("");
  const [hType, setHType] = useState("creative");
  const [hDesc, setHDesc] = useState("");

  // Fetch books for Reading form
  const { data: books = [] } = useQuery<any[]>({ queryKey: ["/api/books"] });

  const updateBookDateMut = useMutation({
    mutationFn: ({ id, targetFinishDate }: { id: number; targetFinishDate: string | null }) =>
      apiRequest("PATCH", `/api/books/${id}`, { targetFinishDate }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/books"] }); setAddingBookId(null); setAddingBookDate(""); },
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      if (category === "reading") {
        const { start, end } = rTimeframe !== "custom" ? getTimeframeDates(rTimeframe) : { start: rStart, end: rEnd };
        return apiRequest("POST", "/api/reading/goals", {
          booksTarget: parseInt(rTarget) || 12,
          year: parseInt(start.slice(0, 4)),
          label: rLabel.trim() || null,
          startDate: start,
          endDate: end,
        });
      }
      if (category === "workout") {
        return apiRequest("POST", "/api/workout-plans", {
          name: wName.trim() || `${GOAL_TYPES.find(t => t.value === wGoalType)?.label} Plan`,
          goalType: wGoalType,
          durationWeeks: parseInt(wWeeks) || 12,
          isActive: true,
          startDate: new Date().toISOString().slice(0, 10),
        });
      }
      if (category === "nutrition") {
        return apiRequest("PATCH", "/api/nutrition/goals", {
          calories: parseInt(nCals) || 2000,
          protein: parseInt(nProt) || 150,
          carbs: parseInt(nCarbs) || 200,
          fat: parseInt(nFat) || 65,
          waterGlasses: parseInt(nWater) || 8,
        });
      }
      if (category === "skill") {
        return apiRequest("POST", "/api/hobbies", {
          name: hName.trim(), hobbyType: hType, description: hDesc.trim() || null,
          skillLevel: "beginner", status: "active", isFavorite: false, extraJson: "{}",
        });
      }
    },
    onSuccess: () => {
      const labels: Record<string, string> = { reading: "Reading goal created!", workout: "Training plan created!", nutrition: "Nutrition goals saved!", skill: "Hobby added!" };
      toast({ title: labels[category!] ?? "Saved!" });
      qc.invalidateQueries();
      onClose(); setCategory(null);
    },
    onError: () => toast({ title: "Something went wrong", variant: "destructive" }),
  });

  function handleClose() { setCategory(null); onClose(); }

  const modalStart = rTimeframe !== "custom" ? getTimeframeDates(rTimeframe).start : rStart;
  const modalEnd   = rTimeframe !== "custom" ? getTimeframeDates(rTimeframe).end   : rEnd;

  const assignedBooks = books.filter((b: any) => {
    if (b.status === "finished") {
      const fd = b.finishDate as string | null;
      return fd && fd >= (modalStart || "") && fd <= (modalEnd || "");
    }
    const tfd = b.targetFinishDate;
    return tfd && tfd >= (modalStart || "") && tfd <= (modalEnd || "");
  });
  const assignedIds = new Set(assignedBooks.map((b: any) => b.id));

  const canSave = category === "reading" ? (!!rTarget && parseInt(rTarget) >= 1 && (rTimeframe !== "custom" || (!!rStart && !!rEnd))) :
    category === "workout" ? true :
    category === "nutrition" ? !!nCals :
    category === "skill" ? !!hName.trim() : false;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col overflow-hidden p-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            {category && <button onClick={() => setCategory(null)} className="text-muted-foreground hover:text-foreground mr-1">←</button>}
            <Sparkles size={16} className="text-primary" />
            {category ? BROWSE_CATEGORIES.find(c => c.key === category)?.label : "Browse Goals & Plans"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4">

          {/* Category picker */}
          {!category && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Choose a category to set up a goal or plan:</p>
              {BROWSE_CATEGORIES.map(cat => (
                <button key={cat.key} onClick={() => {
                  if (cat.key === "workout") { onClose(); navigate("/workouts?newPlan=1"); return; }
                  if (cat.key === "nutrition") { if (onOpenMealPlan) onOpenMealPlan(); else { onClose(); navigate("/meal-planner/setup"); } return; }
                  if (cat.key === "skill") { onClose(); navigate("/hobbies?addHobby=1"); return; }
                  setCategory(cat.key);
                }}
                  className="w-full flex items-center gap-4 p-4 rounded-xl border hover:border-primary hover:bg-primary/5 transition-all text-left group">
                  <span className="text-2xl shrink-0">{cat.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{cat.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{cat.sub}</p>
                  </div>
                  <ChevronRight size={16} className="text-muted-foreground group-hover:text-primary shrink-0" />
                </button>
              ))}
            </div>
          )}

          {/* ── Reading Goal (full form) ─────────────────────────────── */}
          {category === "reading" && (
            <div className="space-y-5">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Goal Name (optional)</label>
                <Input placeholder="e.g. Summer Reading 2026, Q1 Challenge…" value={rLabel} onChange={e => setRLabel(e.target.value)} className="text-sm" />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Timeframe</label>
                <div className="grid grid-cols-4 gap-1.5 mb-3">
                  {(["year","month","quarter","custom"] as const).map(tf => {
                    const labels = { year:"This Year", month:"This Month", quarter:"This Quarter", custom:"Custom" };
                    return (
                      <button key={tf} onClick={() => { setRTimeframe(tf); if (tf !== "custom") { const d = getTimeframeDates(tf); setRStart(d.start); setREnd(d.end); } }}
                        className={`py-2 rounded-lg text-xs font-medium border transition-colors ${rTimeframe === tf ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-secondary border-border"}`}>
                        {labels[tf]}
                      </button>
                    );
                  })}
                </div>
                {rTimeframe === "custom" ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs text-muted-foreground mb-1 block">Start date</label><Input type="date" value={rStart} onChange={e => setRStart(e.target.value)} className="text-sm" /></div>
                    <div><label className="text-xs text-muted-foreground mb-1 block">End date</label><Input type="date" value={rEnd} onChange={e => setREnd(e.target.value)} className="text-sm" /></div>
                  </div>
                ) : (
                  modalStart && modalEnd && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar size={11} />
                      {format(parseISO(modalStart), "MMM d, yyyy")} – {format(parseISO(modalEnd), "MMM d, yyyy")}
                    </p>
                  )
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Books Target</label>
                <div className="flex items-center gap-3">
                  <div className="flex items-center border rounded-lg overflow-hidden">
                    <button onClick={() => setRTarget(String(Math.max(1, parseInt(rTarget||"1")-1)))} className="px-3 py-2 text-sm hover:bg-secondary transition-colors font-bold">−</button>
                    <Input type="number" min={1} max={500} value={rTarget} onChange={e => setRTarget(e.target.value)}
                      className="w-16 text-center text-lg font-bold border-0 focus-visible:ring-0 rounded-none" />
                    <button onClick={() => setRTarget(String(Math.min(500, parseInt(rTarget||"0")+1)))} className="px-3 py-2 text-sm hover:bg-secondary transition-colors font-bold">+</button>
                  </div>
                  <span className="text-sm text-muted-foreground">books to read</span>
                </div>
              </div>

              {/* Books in this goal */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Books in This Goal</label>
                  <span className="text-xs text-muted-foreground">{assignedBooks.length} assigned</span>
                </div>
                {assignedBooks.length > 0 && (
                  <div className="space-y-1 mb-3 max-h-40 overflow-y-auto">
                    {assignedBooks.map((book: any) => {
                      const isFinished = book.status === "finished";
                      const date = isFinished ? book.finishDate : book.targetFinishDate;
                      return (
                        <div key={book.id} className="flex items-center gap-2 px-2 py-2 rounded-lg bg-secondary/40">
                          {book.coverUrl ? <img src={book.coverUrl} alt={book.title} className="w-6 h-8 object-cover rounded shrink-0" /> :
                            <div className="w-6 h-8 rounded shrink-0 bg-muted flex items-center justify-center"><BookOpen size={10} className="opacity-40" /></div>}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{book.title}</p>
                            {book.author && <p className="text-[10px] text-muted-foreground truncate">{book.author}</p>}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {isFinished
                              ? <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded-full font-medium">Done</span>
                              : <span className="text-[10px] text-muted-foreground">by {date ? format(parseISO(date), "MMM d") : "—"}</span>}
                            {!isFinished && (
                              <button onClick={() => updateBookDateMut.mutate({ id: book.id, targetFinishDate: null })} className="text-muted-foreground hover:text-destructive transition-colors"><X size={12} /></button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Add a book */}
                <div className="border rounded-xl p-3 space-y-2 bg-secondary/20">
                  <p className="text-xs font-medium text-muted-foreground">Add a book with a target finish date</p>
                  <Input placeholder="Search your reading list…" value={bookSearch} onChange={e => setBookSearch(e.target.value)} className="text-xs h-8" />
                  {(() => {
                    const q = bookSearch.trim().toLowerCase();
                    const unassigned = books.filter((b: any) => {
                      if (b.status === "finished") return false;
                      if (assignedIds.has(b.id)) return false;
                      if (!q) return true;
                      return b.title.toLowerCase().includes(q) || (b.author ?? "").toLowerCase().includes(q);
                    }).slice(0, 5);
                    if (!unassigned.length && !q) return <p className="text-[10px] text-muted-foreground text-center py-1">All backlog/current books are already assigned</p>;
                    if (!unassigned.length) return <p className="text-[10px] text-muted-foreground text-center py-1">No books match "{bookSearch}"</p>;
                    return (
                      <div className="space-y-1">
                        {unassigned.map((book: any) => (
                          <div key={book.id}>
                            {addingBookId === book.id ? (
                              <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-primary/5 border border-primary/20">
                                <BookOpen size={11} className="text-primary shrink-0" />
                                <span className="text-xs flex-1 truncate">{book.title}</span>
                                <Input type="date" value={addingBookDate} min={modalStart||undefined} max={modalEnd||undefined}
                                  onChange={e => setAddingBookDate(e.target.value)} className="h-6 text-xs w-32 shrink-0" autoFocus />
                                <button onClick={() => { if (addingBookDate) updateBookDateMut.mutate({ id: book.id, targetFinishDate: addingBookDate }); }}
                                  disabled={!addingBookDate} className="shrink-0 p-1 rounded bg-primary text-primary-foreground disabled:opacity-40 hover:bg-primary/80 transition-colors"><Check size={11} /></button>
                                <button onClick={() => { setAddingBookId(null); setAddingBookDate(""); }} className="shrink-0 p-1 text-muted-foreground hover:text-foreground"><X size={11} /></button>
                              </div>
                            ) : (
                              <button onClick={() => { setAddingBookId(book.id); setAddingBookDate(modalEnd||""); setBookSearch(""); }}
                                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-secondary transition-colors text-left">
                                {book.coverUrl ? <img src={book.coverUrl} alt={book.title} className="w-5 h-7 object-cover rounded shrink-0" /> :
                                  <div className="w-5 h-7 rounded shrink-0 bg-muted flex items-center justify-center"><BookOpen size={9} className="opacity-40" /></div>}
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium truncate">{book.title}</p>
                                  {book.author && <p className="text-[10px] text-muted-foreground truncate">{book.author}</p>}
                                </div>
                                <span className="text-[10px] text-muted-foreground capitalize shrink-0">{book.status}</span>
                                <Plus size={11} className="text-primary shrink-0" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* ── Workout Training Plan ─────────────────────────────────── */}
          {category === "workout" && (
            <div className="space-y-4">
              <div>
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Plan Name (optional)</Label>
                <Input className="mt-1.5" placeholder="e.g. Summer Strength Block" value={wName} onChange={e => setWName(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Goal Type</Label>
                <Select value={wGoalType} onValueChange={setWGoalType}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>{GOAL_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Duration (weeks)</Label>
                <div className="flex gap-2 mt-1.5 flex-wrap">
                  {[4,8,12,16,20].map(w => (
                    <button key={w} onClick={() => setWWeeks(String(w))}
                      className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${wWeeks===String(w)?"bg-primary text-primary-foreground border-primary":"border-border hover:bg-secondary"}`}>{w}w</button>
                  ))}
                  <Input className="w-20" type="number" min="1" max="52" value={wWeeks} onChange={e => setWWeeks(e.target.value)} />
                </div>
              </div>
              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-xl p-3">
                <p className="text-xs text-blue-700 dark:text-blue-300">💪 Your plan will activate immediately. Log workouts in the Workouts page.</p>
              </div>
            </div>
          )}

          {/* ── Nutrition Goals ───────────────────────────────────────── */}
          {category === "nutrition" && (
            <div className="space-y-5">
              {/* Preset selector at top — like Reading's timeframe buttons */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Goal Type</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {([
                    { value: "maintain" as const, label: "Maintain" },
                    { value: "cut"      as const, label: "Cut"      },
                    { value: "bulk"     as const, label: "Bulk"     },
                    { value: "custom"   as const, label: "Custom"   },
                  ]).map(p => (
                    <button key={p.value} onClick={() => applyNutritionPreset(p.value)}
                      className={`py-2 rounded-lg text-xs font-medium border transition-colors ${nPreset === p.value ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-secondary border-border"}`}>
                      {p.label}
                    </button>
                  ))}
                </div>
                {nPreset !== "custom" && (
                  <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                    <Calendar size={11} />
                    {nPreset === "maintain" && "Balanced macros to maintain current weight"}
                    {nPreset === "cut"      && "Caloric deficit with high protein to preserve muscle"}
                    {nPreset === "bulk"     && "Caloric surplus with high carbs to support muscle gain"}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Calories (kcal)</Label><Input className="mt-1.5" type="number" value={nCals} onChange={e => { setNCals(e.target.value); setNPreset("custom"); }} /></div>
                <div><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Protein (g)</Label><Input className="mt-1.5" type="number" value={nProt} onChange={e => { setNProt(e.target.value); setNPreset("custom"); }} /></div>
                <div><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Carbs (g)</Label><Input className="mt-1.5" type="number" value={nCarbs} onChange={e => { setNCarbs(e.target.value); setNPreset("custom"); }} /></div>
                <div><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fat (g)</Label><Input className="mt-1.5" type="number" value={nFat} onChange={e => { setNFat(e.target.value); setNPreset("custom"); }} /></div>
              </div>
              <div><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Water (glasses/day)</Label><Input className="mt-1.5" type="number" min="1" max="20" value={nWater} onChange={e => setNWater(e.target.value)} /></div>
              <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-xl p-3">
                <p className="text-xs text-green-700 dark:text-green-300">🥗 These targets will appear in your Nutrition page and Dashboard.</p>
              </div>
            </div>
          )}

          {/* ── Skill Development / Hobby ─────────────────────────────── */}
          {category === "skill" && (
            <div className="space-y-4">
              <div>
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Hobby / Skill Name</Label>
                <Input className="mt-1.5" placeholder="e.g. Guitar, Photography, Spanish…" value={hName} onChange={e => setHName(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Type</Label>
                <div className="grid grid-cols-3 gap-1.5 mt-1.5">
                  {HOBBY_TYPES.map(t => (
                    <button key={t.value} onClick={() => setHType(t.value)}
                      className={`flex items-center gap-1.5 px-2 py-2 rounded-lg border text-xs font-medium transition-colors ${hType===t.value?"bg-primary text-primary-foreground border-primary":"border-border hover:bg-secondary"}`}>
                      <span>{t.emoji}</span>{t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Description (optional)</Label>
                <Textarea className="mt-1.5" rows={2} placeholder="What do you want to achieve?" value={hDesc} onChange={e => setHDesc(e.target.value)} />
              </div>
              <div className="bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800 rounded-xl p-3">
                <p className="text-xs text-violet-700 dark:text-violet-300">✨ Your hobby will appear in the Hobbies page where you can set plans and goals.</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {category && (
          <div className="px-5 py-4 border-t shrink-0 flex gap-2">
            <Button onClick={() => saveMut.mutate()} disabled={!canSave || saveMut.isPending} className="gap-1.5 w-full">
              <Check size={13} /> {saveMut.isPending ? "Saving…" : category === "reading" ? "Create Goal" : category === "workout" ? "Create Plan" : "Save"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
