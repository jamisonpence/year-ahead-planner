import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Hobby } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import PageShell from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, ArrowLeft, Target, CheckCircle2, Circle, CalendarDays,
  BookOpen, Flame, ChevronRight, Trophy, Layers, Pencil, MoreHorizontal,
  Link as LinkIcon, Star, Play, Pause,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  HOBBY_TYPE_MAP, HOBBY_TYPES, SKILL_MAP, STATUS_MAP,
  HobbyGoal, HobbyPlan, GoalWizard, PlanWizard,
  parseGoals, parsePlans, setGoalsInExtra, setPlansInExtra,
  setPlansAndGoalsInExtra, parseExtra, genId,
} from "./HobbiesPage";

// ── Helpers ────────────────────────────────────────────────────────────────────

function goalProgress(goal: HobbyGoal): { pct: number; label: string } {
  if (goal.goalType === "count") {
    const cur = goal.currentValue ?? 0;
    const tgt = goal.targetValue ?? 1;
    return { pct: Math.min(100, Math.round((cur / tgt) * 100)), label: `${cur} / ${tgt} ${goal.unit ?? ""}`.trim() };
  }
  if (goal.goalType === "milestone") {
    const steps = goal.steps ?? [];
    const done = steps.filter(s => s.done).length;
    const pct = steps.length ? Math.round((done / steps.length) * 100) : 0;
    return { pct, label: steps.length ? `${done} / ${steps.length} milestones` : "Milestone goal" };
  }
  if (goal.goalType === "frequency") {
    return { pct: 0, label: `${goal.freqTimes ?? "?"} × / ${goal.freqPeriod ?? "week"}` };
  }
  return { pct: 0, label: "In progress" };
}

function planProgress(plan: HobbyPlan): { pct: number; done: number; total: number } {
  const total = plan.steps.length;
  const done = plan.steps.filter(s => s.done).length;
  return { pct: total ? Math.round((done / total) * 100) : 0, done, total };
}

// ── Goal card ─────────────────────────────────────────────────────────────────

function GoalCard({ goal, onComplete, onDelete }: {
  goal: HobbyGoal;
  onComplete: () => void;
  onDelete: () => void;
}) {
  const { pct, label } = goalProgress(goal);
  const isCompleted = goal.status === "completed";
  return (
    <div className={`rounded-xl border p-4 space-y-2 ${isCompleted ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {isCompleted
            ? <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
            : <Circle size={15} className="text-muted-foreground shrink-0" />}
          <span className="font-medium text-sm truncate">{goal.title}</span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-1 rounded hover:bg-muted shrink-0">
              <MoreHorizontal size={14} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {!isCompleted && <DropdownMenuItem onClick={onComplete}>Mark complete</DropdownMenuItem>}
            <DropdownMenuItem onClick={onDelete} className="text-destructive">Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {goal.description && <p className="text-xs text-muted-foreground">{goal.description}</p>}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{label}</span>
          <span>{pct}%</span>
        </div>
        <Progress value={pct} className="h-1.5" />
      </div>
    </div>
  );
}

// ── Plan summary card ──────────────────────────────────────────────────────────

function PlanSummaryCard({ plan, hobbyId, onToggleActive, onDelete }: {
  plan: HobbyPlan;
  hobbyId: number;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const [, navigate] = useLocation();
  const { pct, done, total } = planProgress(plan);
  const isCompleted = !!plan.completedAt;
  return (
    <div
      className={`rounded-xl border p-4 space-y-2 cursor-pointer hover:border-primary/40 transition-colors ${isCompleted ? "opacity-60" : ""}`}
      onClick={() => navigate(`/hobbies/${hobbyId}/plans/${plan.id}`)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {plan.isActive && !isCompleted && <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />}
            {plan.isPaused && <Pause size={12} className="text-amber-500 shrink-0" />}
            {isCompleted && <Trophy size={12} className="text-emerald-500 shrink-0" />}
            <span className="font-medium text-sm truncate">{plan.title}</span>
          </div>
          {plan.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{plan.description}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-1 rounded hover:bg-muted">
                <MoreHorizontal size={14} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {!isCompleted && (
                <DropdownMenuItem onClick={onToggleActive}>
                  {plan.isActive ? "Pause" : "Activate"}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={onDelete} className="text-destructive">Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{done} / {total} steps</span>
          <span>{pct}%</span>
        </div>
        <Progress value={pct} className="h-1.5" />
      </div>
      <div className="flex items-center justify-end">
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          View plan <ChevronRight size={11} />
        </span>
      </div>
    </div>
  );
}

// ── Link Existing Goal Modal ───────────────────────────────────────────────────

function LinkGoalModal({ open, onClose, hobbyId, existingGoals, onLink }: {
  open: boolean;
  onClose: () => void;
  hobbyId: number;
  existingGoals: HobbyGoal[];
  onLink: (goal: HobbyGoal) => void;
}) {
  // Fetch system goals for linking
  const { data: systemGoals = [] } = useQuery<any[]>({
    queryKey: ["/api/goals"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/goals"); return r.json(); },
    enabled: open,
  });

  const existingTitles = new Set(existingGoals.map(g => g.title.toLowerCase()));

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[70vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Link Existing Goal</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 mt-2">
          {systemGoals.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">No goals found. Create a goal first from the Goals page.</p>
          )}
          {systemGoals.map((g: any) => {
            const alreadyLinked = existingTitles.has(g.title?.toLowerCase());
            return (
              <button
                key={g.id}
                disabled={alreadyLinked}
                onClick={() => {
                  const linked: HobbyGoal = {
                    id: genId(),
                    title: g.title,
                    description: g.description,
                    goalType: "milestone",
                    status: g.status === "completed" ? "completed" : "active",
                    createdAt: g.createdAt ?? new Date().toISOString(),
                    linkedSystemGoalId: g.id,
                  };
                  onLink(linked);
                  onClose();
                }}
                className={`w-full text-left rounded-lg border px-4 py-3 text-sm transition-colors ${alreadyLinked ? "opacity-40 cursor-not-allowed" : "hover:border-primary/50 hover:bg-muted/40"}`}
              >
                <div className="font-medium">{g.title}</div>
                {g.description && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{g.description}</div>}
                {alreadyLinked && <div className="text-xs text-primary mt-0.5">Already linked</div>}
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Link Existing Plan Modal ───────────────────────────────────────────────────

function LinkPlanModal({ open, onClose, hobbies, currentHobbyId, existingPlans, onLink }: {
  open: boolean;
  onClose: () => void;
  hobbies: Hobby[];
  currentHobbyId: number;
  existingPlans: HobbyPlan[];
  onLink: (plan: HobbyPlan) => void;
}) {
  const existingIds = new Set(existingPlans.map(p => p.id));
  const otherPlans: { plan: HobbyPlan; hobbyName: string }[] = [];
  for (const h of hobbies) {
    if (h.id === currentHobbyId) continue;
    for (const p of parsePlans(h.extraJson ?? "{}")) {
      if (!existingIds.has(p.id)) otherPlans.push({ plan: p, hobbyName: h.name });
    }
  }

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[70vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Link Existing Plan</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 mt-2">
          {otherPlans.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">No other hobby plans found to link.</p>
          )}
          {otherPlans.map(({ plan, hobbyName }) => (
            <button
              key={plan.id}
              onClick={() => { onLink(plan); onClose(); }}
              className="w-full text-left rounded-lg border px-4 py-3 text-sm hover:border-primary/50 hover:bg-muted/40 transition-colors"
            >
              <div className="font-medium">{plan.title}</div>
              <div className="text-xs text-muted-foreground mt-0.5">From: {hobbyName}</div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── New Habit Modal ────────────────────────────────────────────────────────────

function NewHabitModal({ open, onClose, hobbyName }: {
  open: boolean;
  onClose: () => void;
  hobbyName: string;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [frequency, setFrequency] = useState<"daily" | "weekly">("daily");
  const [targetDays, setTargetDays] = useState("5");
  const [emoji, setEmoji] = useState("✨");

  const createHabit = useMutation({
    mutationFn: async (data: any) => { const r = await apiRequest("POST", "/api/habits", data); return r.json(); },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/habits"] });
      toast({ title: "Habit created!", description: `"${title}" added to your habits` });
      setTitle(""); setDescription(""); setFrequency("daily"); setTargetDays("5"); setEmoji("✨");
      onClose();
    },
    onError: () => toast({ title: "Failed to create habit", variant: "destructive" }),
  });

  useEffect(() => {
    if (open && hobbyName && !title) setTitle(hobbyName);
  }, [open, hobbyName]);

  const handleSave = () => {
    if (!title.trim()) return;
    createHabit.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      emoji,
      frequency,
      targetDaysPerWeek: frequency === "weekly" ? Number(targetDays) : 7,
      category: "hobby",
      color: "#6366f1",
    });
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New Habit</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div className="flex gap-2">
            <Input value={emoji} onChange={e => setEmoji(e.target.value)} className="w-14 text-center" maxLength={2} />
            <Input placeholder={`e.g. Practice ${hobbyName}`} value={title} onChange={e => setTitle(e.target.value)} className="flex-1" />
          </div>
          <Textarea placeholder="Description (optional)" value={description} onChange={e => setDescription(e.target.value)} rows={2} />
          <Select value={frequency} onValueChange={v => setFrequency(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly (set target days)</SelectItem>
            </SelectContent>
          </Select>
          {frequency === "weekly" && (
            <Input type="number" min={1} max={7} value={targetDays} onChange={e => setTargetDays(e.target.value)} placeholder="Target days per week" />
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={!title.trim() || createHabit.isPending}>
              {createHabit.isPending ? "Saving…" : "Create Habit"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── New Journal Entry Modal ────────────────────────────────────────────────────

function NewJournalEntryModal({ open, onClose, hobbyName }: {
  open: boolean;
  onClose: () => void;
  hobbyName: string;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [mood, setMood] = useState("😊");

  const createEntry = useMutation({
    mutationFn: async (data: any) => { const r = await apiRequest("POST", "/api/journal-entries", data); return r.json(); },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/journal-entries"] });
      toast({ title: "Journal entry saved!" });
      setTitle(""); setContent(""); setMood("😊");
      onClose();
    },
    onError: () => toast({ title: "Failed to save entry", variant: "destructive" }),
  });

  const handleSave = () => {
    if (!content.trim()) return;
    createEntry.mutate({
      title: title.trim() || `${hobbyName} – ${new Date().toLocaleDateString()}`,
      content: content.trim(),
      mood: mood,
      date: new Date().toISOString().slice(0, 10),
      tags: [hobbyName.toLowerCase()],
    });
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New Journal Entry</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <Input placeholder={`Title (e.g. ${hobbyName} session)`} value={title} onChange={e => setTitle(e.target.value)} />
          <Textarea placeholder={`What did you do? How did it go?`} value={content} onChange={e => setContent(e.target.value)} rows={4} />
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Mood:</span>
            {["😊", "😄", "😐", "😓", "🔥", "💪", "✨"].map(m => (
              <button key={m} onClick={() => setMood(m)}
                className={`text-lg rounded px-1.5 py-0.5 transition-colors ${mood === m ? "bg-primary/10" : "hover:bg-muted"}`}>
                {m}
              </button>
            ))}
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={!content.trim() || createEntry.isPending}>
              {createEntry.isPending ? "Saving…" : "Save Entry"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function HobbyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const hobbyId = Number(id);
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: hobbies = [], isLoading } = useQuery<Hobby[]>({
    queryKey: ["/api/hobbies"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/hobbies"); return r.json(); },
  });

  const hobby = hobbies.find(h => h.id === hobbyId) ?? null;

  const updateMut = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const r = await apiRequest("PATCH", `/api/hobbies/${id}`, data);
      return r.json() as Promise<Hobby>;
    },
    onSuccess: (updated) => {
      qc.setQueryData<Hobby[]>(["/api/hobbies"], (old = []) => old.map(h => h.id === updated.id ? updated : h));
    },
  });

  const updateExtra = async (newExtraJson: string) => {
    await updateMut.mutateAsync({ id: hobbyId, data: { extraJson: newExtraJson } });
  };

  // Modals
  const [goalWizardOpen, setGoalWizardOpen] = useState(false);
  const [planWizardOpen, setPlanWizardOpen] = useState(false);
  const [linkGoalOpen, setLinkGoalOpen] = useState(false);
  const [linkPlanOpen, setLinkPlanOpen] = useState(false);
  const [newHabitOpen, setNewHabitOpen] = useState(false);
  const [newJournalOpen, setNewJournalOpen] = useState(false);

  if (isLoading) {
    return (
      <PageShell title="Hobby" subtitle="Loading…">
        <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">Loading…</div>
      </PageShell>
    );
  }

  if (!hobby) {
    return (
      <PageShell title="Hobby not found" subtitle="">
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <p className="text-muted-foreground text-sm">This hobby doesn't exist or was deleted.</p>
          <Button variant="outline" size="sm" onClick={() => navigate("/hobbies")}>
            <ArrowLeft size={14} className="mr-1.5" /> Back to Hobbies
          </Button>
        </div>
      </PageShell>
    );
  }

  const typeInfo = HOBBY_TYPE_MAP[hobby.hobbyType as any] ?? HOBBY_TYPES[0];
  const TypeIcon = typeInfo.icon;
  const skillInfo = SKILL_MAP[hobby.skillLevel ?? "beginner"];
  const statusInfo = STATUS_MAP[hobby.status ?? "active"];

  const goals = parseGoals(hobby.extraJson ?? "{}");
  const plans = parsePlans(hobby.extraJson ?? "{}");
  const activeGoals = goals.filter(g => g.status === "active");
  const completedGoals = goals.filter(g => g.status === "completed");
  const activePlans = plans.filter(p => p.isActive && !p.completedAt);
  const inactivePlans = plans.filter(p => !p.isActive && !p.completedAt);
  const completedPlans = plans.filter(p => !!p.completedAt);

  // Handlers
  const handleSaveGoal = (_hobbyId: number, goal: HobbyGoal) => {
    const newExtraJson = setGoalsInExtra(hobby.extraJson ?? "{}", [...goals, goal]);
    updateExtra(newExtraJson);
  };

  const handleLinkGoal = (goal: HobbyGoal) => {
    const newExtraJson = setGoalsInExtra(hobby.extraJson ?? "{}", [...goals, goal]);
    updateExtra(newExtraJson);
    toast({ title: "Goal linked!" });
  };

  const handleCompleteGoal = (goalId: string) => {
    const updated = goals.map(g => g.id === goalId ? { ...g, status: "completed" as const } : g);
    updateExtra(setGoalsInExtra(hobby.extraJson ?? "{}", updated));
  };

  const handleDeleteGoal = (goalId: string) => {
    updateExtra(setGoalsInExtra(hobby.extraJson ?? "{}", goals.filter(g => g.id !== goalId)));
  };

  const handleSavePlan = (_hobbyId: number, plan: HobbyPlan) => {
    const autoGoal: HobbyGoal = {
      id: genId(), title: plan.title, description: plan.description,
      goalType: "milestone", durationWeeks: plan.durationWeeks,
      status: "active", createdAt: plan.createdAt, linkedPlanId: plan.id,
    };
    updateExtra(setPlansAndGoalsInExtra(hobby.extraJson ?? "{}", [...plans, plan], [...goals, autoGoal]));
  };

  const handleLinkPlan = (plan: HobbyPlan) => {
    updateExtra(setPlansInExtra(hobby.extraJson ?? "{}", [...plans, plan]));
    toast({ title: "Plan linked!" });
  };

  const handleTogglePlanActive = (planId: string) => {
    const updated = plans.map(p => p.id === planId
      ? { ...p, isActive: !p.isActive, startDate: (!p.isActive && !p.startDate) ? new Date().toISOString().slice(0, 10) : p.startDate }
      : p);
    updateExtra(setPlansInExtra(hobby.extraJson ?? "{}", updated));
  };

  const handleDeletePlan = (planId: string) => {
    updateExtra(setPlansInExtra(hobby.extraJson ?? "{}", plans.filter(p => p.id !== planId)));
  };

  return (
    <PageShell
      title={hobby.name}
      subtitle={[typeInfo.label, skillInfo?.label, statusInfo?.label].filter(Boolean).join(" · ")}
      action={
        <Button variant="outline" size="sm" onClick={() => navigate("/hobbies")}>
          <ArrowLeft size={14} className="mr-1.5" /> Hobbies
        </Button>
      }
    >
      {/* ── Overview card ── */}
      <div className="rounded-2xl border overflow-hidden mb-6">
        {hobby.coverUrl && (
          <div className="h-36 w-full overflow-hidden">
            <img src={hobby.coverUrl} alt={hobby.name} className="w-full h-full object-cover" />
          </div>
        )}
        <div className="p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-xl" style={{ background: typeInfo.color + "22" }}>
              {typeInfo.emoji}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-lg leading-tight">{hobby.name}</h2>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                <Badge variant="secondary" className="text-xs gap-1">
                  <TypeIcon size={10} /> {typeInfo.label}
                </Badge>
                {skillInfo && <Badge variant="outline" className="text-xs">{skillInfo.label}</Badge>}
                {statusInfo && (
                  <Badge variant="outline" className={`text-xs ${statusInfo.color ?? ""}`}>{statusInfo.label}</Badge>
                )}
                {hobby.isFavorite && <Badge variant="outline" className="text-xs text-yellow-500">⭐ Favorite</Badge>}
              </div>
            </div>
          </div>
          {hobby.description && <p className="text-sm text-muted-foreground">{hobby.description}</p>}
          {hobby.dateStarted && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays size={12} />
              Started {new Date(hobby.dateStarted).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            </div>
          )}
        </div>
      </div>

      {/* ── Contextual action strip ── */}
      <div className="flex flex-wrap gap-2 mb-6">
        <Button size="sm" variant="outline" onClick={() => setGoalWizardOpen(true)}>
          <Target size={13} className="mr-1.5" /> New Goal
        </Button>
        <Button size="sm" variant="outline" onClick={() => setLinkGoalOpen(true)}>
          <LinkIcon size={13} className="mr-1.5" /> Link Goal
        </Button>
        <Button size="sm" variant="outline" onClick={() => setPlanWizardOpen(true)}>
          <Layers size={13} className="mr-1.5" /> New Plan
        </Button>
        <Button size="sm" variant="outline" onClick={() => setLinkPlanOpen(true)}>
          <LinkIcon size={13} className="mr-1.5" /> Link Plan
        </Button>
        <Button size="sm" variant="outline" onClick={() => setNewHabitOpen(true)}>
          <Flame size={13} className="mr-1.5" /> New Habit
        </Button>
        <Button size="sm" variant="outline" onClick={() => setNewJournalOpen(true)}>
          <BookOpen size={13} className="mr-1.5" /> Journal Entry
        </Button>
      </div>

      {/* ── Goals section ── */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Target size={15} className="text-primary" /> Goals
            {goals.length > 0 && <span className="text-xs text-muted-foreground font-normal">{activeGoals.length} active</span>}
          </h3>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setGoalWizardOpen(true)}>
            <Plus size={12} className="mr-1" /> Add
          </Button>
        </div>

        {goals.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-center text-muted-foreground">
            <Target size={28} className="mx-auto mb-2 opacity-20" />
            <p className="text-sm font-medium">No goals yet</p>
            <p className="text-xs mt-1 mb-3">Track progress with goals for this hobby</p>
            <div className="flex justify-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setGoalWizardOpen(true)}>New Goal</Button>
              <Button size="sm" variant="outline" onClick={() => setLinkGoalOpen(true)}>Link Existing</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {activeGoals.map(g => (
              <GoalCard key={g.id} goal={g}
                onComplete={() => handleCompleteGoal(g.id)}
                onDelete={() => handleDeleteGoal(g.id)} />
            ))}
            {completedGoals.length > 0 && (
              <details className="group">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground py-1 list-none flex items-center gap-1">
                  <span>{completedGoals.length} completed</span>
                </summary>
                <div className="space-y-2 mt-2">
                  {completedGoals.map(g => (
                    <GoalCard key={g.id} goal={g}
                      onComplete={() => {}}
                      onDelete={() => handleDeleteGoal(g.id)} />
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </section>

      {/* ── Plans section ── */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Layers size={15} className="text-primary" /> Plans
            {plans.length > 0 && <span className="text-xs text-muted-foreground font-normal">{activePlans.length} active</span>}
          </h3>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setPlanWizardOpen(true)}>
            <Plus size={12} className="mr-1" /> Add
          </Button>
        </div>

        {plans.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-center text-muted-foreground">
            <Layers size={28} className="mx-auto mb-2 opacity-20" />
            <p className="text-sm font-medium">No plans yet</p>
            <p className="text-xs mt-1 mb-3">Create a structured plan to build this hobby</p>
            <div className="flex justify-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setPlanWizardOpen(true)}>New Plan</Button>
              <Button size="sm" variant="outline" onClick={() => setLinkPlanOpen(true)}>Link Existing</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {activePlans.map(p => (
              <PlanSummaryCard key={p.id} plan={p} hobbyId={hobbyId}
                onToggleActive={() => handleTogglePlanActive(p.id)}
                onDelete={() => handleDeletePlan(p.id)} />
            ))}
            {inactivePlans.map(p => (
              <PlanSummaryCard key={p.id} plan={p} hobbyId={hobbyId}
                onToggleActive={() => handleTogglePlanActive(p.id)}
                onDelete={() => handleDeletePlan(p.id)} />
            ))}
            {completedPlans.length > 0 && (
              <details className="group">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground py-1 list-none flex items-center gap-1">
                  <Trophy size={11} /> <span>{completedPlans.length} completed</span>
                </summary>
                <div className="space-y-2 mt-2">
                  {completedPlans.map(p => (
                    <PlanSummaryCard key={p.id} plan={p} hobbyId={hobbyId}
                      onToggleActive={() => {}}
                      onDelete={() => handleDeletePlan(p.id)} />
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </section>

      {/* ── Notes & reflection ── */}
      {hobby.notes && (
        <section className="mb-6">
          <h3 className="font-semibold text-sm flex items-center gap-2 mb-2">
            <BookOpen size={15} className="text-primary" /> Notes
          </h3>
          <div className="rounded-xl bg-muted/40 border px-4 py-3">
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{hobby.notes}</p>
          </div>
        </section>
      )}

      {/* ── Dialogs & Wizards ── */}
      <GoalWizard
        open={goalWizardOpen}
        onClose={() => setGoalWizardOpen(false)}
        hobbies={hobbies}
        defaultHobbyId={hobbyId}
        onSave={handleSaveGoal}
      />

      <PlanWizard
        open={planWizardOpen}
        onClose={() => setPlanWizardOpen(false)}
        hobbies={hobbies.filter(h => h.status !== "retired")}
        defaultHobbyId={hobbyId}
        skipHobbyPicker={true}
        onSave={handleSavePlan}
      />

      <LinkGoalModal
        open={linkGoalOpen}
        onClose={() => setLinkGoalOpen(false)}
        hobbyId={hobbyId}
        existingGoals={goals}
        onLink={handleLinkGoal}
      />

      <LinkPlanModal
        open={linkPlanOpen}
        onClose={() => setLinkPlanOpen(false)}
        hobbies={hobbies}
        currentHobbyId={hobbyId}
        existingPlans={plans}
        onLink={handleLinkPlan}
      />

      <NewHabitModal
        open={newHabitOpen}
        onClose={() => setNewHabitOpen(false)}
        hobbyName={hobby.name}
      />

      <NewJournalEntryModal
        open={newJournalOpen}
        onClose={() => setNewJournalOpen(false)}
        hobbyName={hobby.name}
      />
    </PageShell>
  );
}
