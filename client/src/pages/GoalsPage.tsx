import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format, parseISO } from "date-fns";
import {
  Plus, Target, Pencil, Trash2, MoreHorizontal, Check,
  Circle, CheckCircle2, ChevronRight, RefreshCw, Folder,
  ClipboardList, Flag, X, Inbox,
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
  ProjectTask, InsertProject, InsertProjectTask,
  GeneralTask, InsertGeneralTask, Chore, HouseProjectWithTasks,
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

export default function GoalsPage() {
  const { toast } = useToast();
  const [goalModal, setGoalModal] = useState(false);
  const [editGoal, setEditGoal] = useState<Goal | null>(null);
  const [projectEditModal, setProjectEditModal] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectWithTasks | null>(null);
  // selectedGoalId = null (nothing), a real goalId, or STANDALONE_ID (-1)
  const [selectedGoalId, setSelectedGoalId] = useState<number | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);

  const { data: goals = [] } = useQuery<GoalWithProjects[]>({ queryKey: ["/api/goals"] });
  const { data: standaloneProjects = [] } = useQuery<ProjectWithTasks[]>({ queryKey: ["/api/projects/standalone"] });
  const { data: generalTasksData = [] } = useQuery<GeneralTask[]>({ queryKey: ["/api/general-tasks"] });
  const { data: chores = [] } = useQuery<Chore[]>({ queryKey: ["/api/chores"] });
  const { data: houseProjects = [] } = useQuery<HouseProjectWithTasks[]>({ queryKey: ["/api/house-projects"] });

  const inv = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/goals"] });
    queryClient.invalidateQueries({ queryKey: ["/api/projects/standalone"] });
    queryClient.invalidateQueries({ queryKey: ["/api/general-tasks"] });
  };
  const invHouse = () => queryClient.invalidateQueries({ queryKey: ["/api/house-projects"] });

  // ── Goal mutations ───────────────────────────────────────────────────────
  const deleteGoal = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/goals/${id}`),
    onSuccess: () => { inv(); toast({ title: "Goal deleted" }); setSelectedGoalId(null); setSelectedProjectId(null); },
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

      {/* 3-column layout */}
      <div className="flex flex-1 min-h-0 divide-x">

        {/* ── Column 1: Goals ───────────────────────────────────────────── */}
        <div className="w-72 shrink-0 flex flex-col min-h-0">
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
              return (
                <div key={g.id}
                  onClick={() => { setSelectedGoalId(isSelected ? null : g.id); setSelectedProjectId(null); }}
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
        <div className="w-72 shrink-0 flex flex-col min-h-0">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              {isAllTasksSelected ? "Overview" : isHousekeepingSelected ? "House Projects" : isStandaloneSelected ? "General Projects" : selectedGoal ? `Projects — ${selectedGoal.title}` : "Projects"}
            </span>
            {(selectedGoal || isStandaloneSelected || isHousekeepingSelected) && !isAllTasksSelected && (
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
            ) : (
              <>
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
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              {(() => {
                const selectedHouseProject = isHousekeepingSelected ? houseProjects.find((p) => p.id === selectedProjectId) ?? null : null;
                return (
                  <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    {isAllTasksSelected ? "All Tasks"
                      : isHousekeepingSelected && selectedHouseProject ? `Tasks — ${selectedHouseProject.title}`
                      : isHousekeepingSelected ? "Chores"
                      : (selectedProject || standaloneSelectedProject) ? `Tasks — ${(selectedProject || standaloneSelectedProject)!.title}`
                      : isStandaloneSelected ? "General Tasks"
                      : selectedGoal ? "All Tasks" : "Tasks"}
                  </span>
                );
              })()}
              {!isHousekeepingSelected && !isAllTasksSelected && totalTasks > 0 && (
                <span className="text-xs text-muted-foreground">
                  {doneTasks}/{totalTasks} done
                </span>
              )}
              {isHousekeepingSelected && !houseProjects.find((p) => p.id === selectedProjectId) && (
                <span className="text-xs text-muted-foreground">{chores.filter(c => c.isActive).length} active</span>
              )}
            </div>
            {!isHousekeepingSelected && !isAllTasksSelected && totalTasks > 0 && (
              <Progress value={totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0} className="h-1.5 w-24" />
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
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
                      <div key={chore.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-secondary/40 transition-colors ${overdue ? "border border-red-200 dark:border-red-900 bg-red-50/30 dark:bg-red-950/10" : ""}`}>
                        <Home size={13} className={overdue ? "text-red-500 shrink-0" : soon ? "text-orange-500 shrink-0" : "text-muted-foreground shrink-0"} />
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
                      </div>
                    );
                  })}
                  <p className="text-xs text-muted-foreground px-1 mt-2">Select a project above to view and add tasks</p>
                  <Link href="/housekeeping"><a className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1 px-1"><Home size={11} /> Manage in Housekeeping</a></Link>
                </div>
              );
            })() : null}

            {/* Due Chores section (only shown in non-housekeeping modes) */}
            {!isHousekeepingSelected && (() => {
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
              const hasAnyTasks =
                goals.some((g) => g.projects.some((p) => p.tasks.length > 0)) ||
                standaloneProjects.some((p) => p.tasks.length > 0) ||
                generalTasksData.length > 0 ||
                houseProjects.some((p) => p.tasks.length > 0);
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

            {!isAllTasksSelected && !isHousekeepingSelected && !selectedGoal && !isStandaloneSelected ? (
              <div className="text-center py-16 text-muted-foreground">
                <ClipboardList size={36} className="mx-auto mb-4 opacity-20" />
                <p className="font-medium text-sm">Select a goal to see tasks</p>
                <p className="text-xs mt-1">Or use General for tasks not linked to a goal</p>
              </div>
            ) : !isHousekeepingSelected && isStandaloneSelected && !standaloneSelectedProject ? (
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
            ) : !isAllTasksSelected && !isHousekeepingSelected && tasksToShow.length === 0 && !selectedProject && !standaloneSelectedProject ? (
              <div className="text-center py-12 text-muted-foreground">
                <ClipboardList size={28} className="mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium">No tasks yet</p>
                <p className="text-xs mt-1">Add a project and tasks to track your work</p>
              </div>
            ) : !isAllTasksSelected && !isHousekeepingSelected ? (
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
