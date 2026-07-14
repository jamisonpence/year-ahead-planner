// TasksPage.tsx — execution-focused Projects & Tasks page
// Structure: summary row → 4 tabs (Projects | Tasks | Recurring | Completed)
// Goals appear only as small linked badges on projects/tasks.

import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format, parseISO } from "date-fns";
import {
  Plus, Pencil, Trash2, MoreHorizontal, Check,
  Circle, CheckCircle2, Folder, ClipboardList, Flag, X,
  ChevronDown, ChevronUp, Home, Target, RefreshCw,
  AlertTriangle, CheckSquare, Layers, ArrowRight, PlayCircle,
  Ban, Clock, Leaf, ShoppingCart, ExternalLink, Tag,
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
import { ToastAction } from "@/components/ui/toast";
import { daysUntil } from "@/lib/plannerUtils";
import type {
  GoalWithProjects, ProjectWithTasks,
  InsertProject, InsertProjectTask,
  GeneralTask, InsertGeneralTask, Chore, InsertChore, HouseProjectWithTasks, PurchaseItem,
} from "@shared/schema";
import { Link } from "wouter";

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

const CHORE_CATEGORIES = [
  { value: "cleaning",    label: "Cleaning"     },
  { value: "yard",        label: "Yard"         },
  { value: "maintenance", label: "Maintenance"  },
  { value: "laundry",     label: "Laundry"      },
  { value: "cooking",     label: "Cooking"      },
  { value: "other",       label: "Other"        },
];

const CHORE_FREQUENCIES = [
  { value: "daily",     label: "Daily"         },
  { value: "weekly",    label: "Weekly"        },
  { value: "biweekly",  label: "Every 2 weeks" },
  { value: "monthly",   label: "Monthly"       },
  { value: "quarterly", label: "Quarterly"     },
  { value: "yearly",    label: "Yearly"        },
  { value: "as_needed", label: "As Needed"     },
];

const CHORE_PRIORITIES = [
  { value: "low",    label: "Low"    },
  { value: "medium", label: "Medium" },
  { value: "high",   label: "High"   },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function tasksPct(tasks: { completed: boolean }[]): number {
  if (!tasks.length) return 0;
  return Math.round((tasks.filter(t => t.completed).length / tasks.length) * 100);
}

function freqLabel(chore: Chore): string {
  const map: Record<string, string> = {
    daily: "Daily", weekly: "Weekly", biweekly: "Every 2 wks",
    monthly: "Monthly", quarterly: "Quarterly", yearly: "Yearly", as_needed: "As needed",
  };
  if (chore.frequency === "custom" && chore.customFrequencyDays) return `Every ${chore.customFrequencyDays}d`;
  return map[chore.frequency] ?? chore.frequency;
}

// Unified project shape for rendering
type DisplayProject = {
  id: number;
  title: string;
  status: string;
  description?: string | null;
  dueDate?: string | null;
  tasks: { id: number; title: string; completed: boolean; priority?: string | null; dueDate?: string | null; notes?: string | null }[];
  goalTitle?: string;
  goalId?: number;
  source: "standalone" | "goal" | "house";
};

// ── Task Row ──────────────────────────────────────────────────────────────────

function TaskRow({
  task,
  onToggle,
  onDelete,
  onUpdate,
}: {
  task: { id: number; title: string; completed: boolean; priority?: string | null; dueDate?: string | null; notes?: string | null };
  onToggle: (id: number, v: boolean) => void;
  onDelete: (id: number) => void;
  onUpdate: (id: number, data: Record<string, any>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editDue, setEditDue] = useState(task.dueDate ?? "");
  const [editPriority, setEditPriority] = useState(task.priority ?? "medium");

  const save = () => {
    if (!editTitle.trim()) return;
    onUpdate(task.id, { title: editTitle.trim(), dueDate: editDue || null, priority: editPriority });
    setEditing(false);
  };

  const d = task.dueDate ? daysUntil(task.dueDate) : null;
  const overdue = d !== null && d < 0;
  const soon    = d !== null && d >= 0 && d <= 7;

  if (editing) return (
    <div className="bg-secondary/40 rounded-xl p-3 mb-1 space-y-2">
      <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
        className="h-7 text-sm" autoFocus />
      <div className="flex gap-2">
        <Input type="date" value={editDue} onChange={(e) => setEditDue(e.target.value)} className="h-7 text-xs flex-1" />
        <Select value={editPriority} onValueChange={setEditPriority}>
          <SelectTrigger className="h-7 text-xs w-28"><SelectValue /></SelectTrigger>
          <SelectContent>{TASK_PRIORITIES.map(p => <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>)}</SelectContent>
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
          {task.priority && task.priority !== "medium" && (
            <span className={`text-xs flex items-center gap-0.5 ${PRIORITY_COLORS[task.priority]}`}>
              <Flag size={10} />{task.priority}
            </span>
          )}
          {task.dueDate && (
            <span className={`text-xs ${overdue ? "text-destructive font-medium" : soon ? "text-amber-600 dark:text-amber-400 font-medium" : "text-muted-foreground"}`}>
              {overdue ? `Overdue · ${format(parseISO(task.dueDate), "MMM d")}` : `Due ${format(parseISO(task.dueDate), "MMM d")}`}
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

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, {
  label: string;
  icon: React.ReactNode;
  pill: string;
  cardBorder: string;
  cardBg: string;
}> = {
  in_progress: {
    label: "In Progress",
    icon: <PlayCircle size={11} />,
    pill: "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
    cardBorder: "border-l-4 border-l-blue-500",
    cardBg: "bg-blue-50/40 dark:bg-blue-950/15",
  },
  blocked: {
    label: "Blocked",
    icon: <Ban size={11} />,
    pill: "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800",
    cardBorder: "border-l-4 border-l-red-500",
    cardBg: "bg-red-50/30 dark:bg-red-950/15",
  },
  not_started: {
    label: "Not Started",
    icon: <Circle size={11} />,
    pill: "bg-secondary text-muted-foreground border-border",
    cardBorder: "border-l-4 border-l-border/50",
    cardBg: "",
  },
  done: {
    label: "Done",
    icon: <CheckCircle2 size={11} />,
    pill: "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
    cardBorder: "border-l-4 border-l-emerald-500",
    cardBg: "bg-emerald-50/20 dark:bg-emerald-950/10",
  },
};

// ── Project Card (expandable) ─────────────────────────────────────────────────

function ProjectCard({
  project,
  expanded,
  onToggleExpand,
  onToggleTask,
  onDeleteTask,
  onUpdateTask,
  onAddTask,
  onEdit,
  onDelete,
}: {
  project: DisplayProject;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleTask: (taskId: number, done: boolean) => void;
  onDeleteTask: (taskId: number) => void;
  onUpdateTask: (taskId: number, data: Record<string, any>) => void;
  onAddTask: (title: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [addingTask, setAddingTask] = useState(false);
  const [newTask, setNewTask] = useState("");

  const activeTasks = project.tasks.filter(t => !t.completed);
  const doneTasks   = project.tasks.filter(t => t.completed);
  const pct = tasksPct(project.tasks);
  const nextTask = activeTasks[0] ?? null;

  const d = project.dueDate ? daysUntil(project.dueDate) : null;
  const overdue = d !== null && d < 0;
  const soon    = d !== null && d >= 0 && d <= 14;

  const sc = STATUS_CONFIG[project.status] ?? STATUS_CONFIG.not_started;

  const submitTask = () => {
    if (!newTask.trim()) return;
    onAddTask(newTask.trim());
    setNewTask("");
    setAddingTask(false);
  };

  return (
    <div className={`rounded-xl border bg-card overflow-hidden ${sc.cardBorder} ${sc.cardBg} ${expanded ? "" : "hover:shadow-sm"} transition-shadow`}>
      <div className="p-3">
        {/* Title + status + menu */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              {project.source === "house"
                ? <Home size={12} className="text-orange-400 shrink-0" />
                : <Folder size={12} className="text-muted-foreground/40 shrink-0" />}
              <p className="font-semibold text-sm leading-snug truncate">{project.title}</p>
            </div>
            {project.goalTitle && (
              <Link href="/goals">
                <a className="inline-flex items-center gap-1 text-[10px] text-primary/80 bg-primary/8 border border-primary/20 px-1.5 py-0.5 rounded-full mt-1 hover:bg-primary/15 transition-colors">
                  <Target size={9} /> {project.goalTitle}
                </a>
              </Link>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${sc.pill}`}>
              {sc.icon} {sc.label}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6"><MoreHorizontal size={12} /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onEdit}><Pencil size={13} className="mr-2" />Edit</DropdownMenuItem>
                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
                  <Trash2 size={13} className="mr-2" />Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Progress + open count + due date */}
        {(project.tasks.length > 0 || project.dueDate) && (
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {project.tasks.length > 0 && (
              <>
                <Progress value={pct} className="h-1 flex-1 max-w-[5rem]" />
                <span className="text-xs text-muted-foreground shrink-0">
                  {activeTasks.length} open · {doneTasks.length}/{project.tasks.length}
                </span>
              </>
            )}
            {project.dueDate && (
              <span className={`text-xs shrink-0 ml-auto ${overdue ? "text-destructive font-medium" : soon ? "text-amber-600 dark:text-amber-400 font-medium" : "text-muted-foreground"}`}>
                {overdue
                  ? `Overdue · ${format(parseISO(project.dueDate), "MMM d")}`
                  : d === 0 ? "Due today"
                  : `Due ${format(parseISO(project.dueDate), "MMM d")}`}
              </span>
            )}
          </div>
        )}

        {/* Next action preview - visible only when collapsed */}
        {!expanded && nextTask && (
          <div className="flex items-center gap-1.5 mt-2 px-2 py-1.5 rounded-lg bg-background/70 border border-border/50">
            <ArrowRight size={11} className="text-muted-foreground shrink-0" />
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide shrink-0">Next Action</span>
            <span className="text-xs text-muted-foreground truncate">{nextTask.title}</span>
            {nextTask.priority === "high" && <Flag size={9} className="text-red-500 shrink-0 ml-auto" />}
          </div>
        )}

        {/* Expand toggle */}
        <button
          onClick={onToggleExpand}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-2 transition-colors"
        >
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          {expanded
            ? "Hide tasks"
            : project.tasks.length === 0
              ? "Add next action"
              : `${activeTasks.length} task${activeTasks.length !== 1 ? "s" : ""} open`}
        </button>
      </div>

      {/* Expanded task list */}
      {expanded && (
        <div className="border-t px-3 pb-3 pt-2.5 space-y-0.5 bg-background/50">
          {project.description && (
            <p className="text-xs text-muted-foreground mb-2.5">{project.description}</p>
          )}

          {project.tasks.length === 0 && !addingTask && (
            <button
              onClick={() => window.dispatchEvent(new CustomEvent("open-quick-add", { detail: { section: "task" } }))}
              className="text-xs text-muted-foreground hover:text-primary py-2 text-center w-full hover:underline transition-colors"
            >
              No tasks yet — quick add one
            </button>
          )}

          {activeTasks.map(t => (
            <TaskRow
              key={t.id}
              task={t}
              onToggle={onToggleTask}
              onDelete={onDeleteTask}
              onUpdate={onUpdateTask}
            />
          ))}

          {doneTasks.length > 0 && (
            <details className="mt-1">
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground py-1 list-none flex items-center gap-1">
                <CheckSquare size={11} /> {doneTasks.length} completed
              </summary>
              <div className="mt-1 space-y-0.5">
                {doneTasks.map(t => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    onToggle={onToggleTask}
                    onDelete={onDeleteTask}
                    onUpdate={onUpdateTask}
                  />
                ))}
              </div>
            </details>
          )}

          {addingTask ? (
            <div className="flex gap-1.5 mt-2">
              <Input
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitTask(); if (e.key === "Escape") { setAddingTask(false); setNewTask(""); } }}
                placeholder="Task title…"
                className="h-7 text-xs flex-1"
                autoFocus
              />
              <Button size="sm" className="h-7 px-2" onClick={submitTask}><Check size={12} /></Button>
              <Button size="sm" variant="ghost" className="h-7 px-1" onClick={() => { setAddingTask(false); setNewTask(""); }}><X size={12} /></Button>
            </div>
          ) : (
            <button
              onClick={() => setAddingTask(true)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-2 py-1"
            >
              <Plus size={12} /> Add task
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Chore Card ────────────────────────────────────────────────────────────────

function ChoreCard({
  chore,
  onComplete,
  onEdit,
  onDelete,
}: {
  chore: Chore;
  onComplete: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const isDue = chore.nextDue && chore.nextDue <= today;
  const d = chore.nextDue ? daysUntil(chore.nextDue) : null;
  const overdue = d !== null && d < 0;
  const soon    = d !== null && d >= 0 && d <= 7;

  return (
    <div className={`rounded-xl border bg-card p-3.5 transition-shadow hover:shadow-sm ${overdue ? "border-amber-300 dark:border-amber-700" : ""}`}>
      <div className="flex items-start gap-3">
        <button
          onClick={onComplete}
          title="Mark done"
          className={`mt-0.5 shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
            isDue ? "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 hover:bg-emerald-100 hover:text-emerald-600" : "bg-secondary hover:bg-emerald-100 hover:text-emerald-600 text-muted-foreground"
          }`}
        >
          <RefreshCw size={14} />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="font-medium text-sm leading-snug">{chore.title}</p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0"><MoreHorizontal size={12} /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onEdit}><Pencil size={13} className="mr-2" />Edit</DropdownMenuItem>
                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
                  <Trash2 size={13} className="mr-2" />Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground border border-border">
              {freqLabel(chore)}
            </span>
            {chore.category !== "other" && (
              <span className="text-xs text-muted-foreground capitalize">{chore.category}</span>
            )}
            {chore.nextDue && (
              <span className={`text-xs ${overdue ? "text-amber-600 dark:text-amber-400 font-medium" : soon ? "text-amber-500 font-medium" : "text-muted-foreground"}`}>
                {overdue
                  ? `Due ${format(parseISO(chore.nextDue), "MMM d")}`
                  : d === 0 ? "Due today"
                  : `Next ${format(parseISO(chore.nextDue), "MMM d")}`}
              </span>
            )}
            {chore.assignee && <span className="text-xs text-muted-foreground">· {chore.assignee}</span>}
          </div>

          {chore.notes && (
            <p className="text-xs text-muted-foreground mt-1 italic line-clamp-1">{chore.notes}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── New Project Modal ─────────────────────────────────────────────────────────

function NewProjectModal({
  open,
  onClose,
  goals,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  goals: GoalWithProjects[];
  onSave: (title: string, status: string, dueDate: string | null, description: string | null, goalId: number | null, area: "general" | "home") => void;
}) {
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("not_started");
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");
  const [linkedGoalId, setLinkedGoalId] = useState<string>("none");
  const [area, setArea] = useState<"general" | "home">("general");

  const reset = () => { setTitle(""); setStatus("not_started"); setDueDate(""); setDescription(""); setLinkedGoalId("none"); setArea("general"); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave(
      title.trim(),
      status,
      dueDate || null,
      description.trim() || null,
      linkedGoalId !== "none" ? Number(linkedGoalId) : null,
      area,
    );
    reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-md flex flex-col max-h-[90vh] p-0 gap-0">
        <DialogHeader className="px-5 pt-4 pb-3 shrink-0 border-b"><DialogTitle>New Project</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <div className="space-y-1.5">
            <Label>Project Name *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Build Deck, Clean Garage" required autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROJECT_STATUSES.map(s => (
                    <SelectItem key={s.value} value={s.value}>
                      <span className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${s.dot}`} />{s.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Area</Label>
              <Select value={area} onValueChange={(v) => setArea(v as "general" | "home")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="general"><span className="flex items-center gap-1.5"><Folder size={12} /> General</span></SelectItem>
                  <SelectItem value="home"><span className="flex items-center gap-1.5"><Home size={12} /> Home</span></SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Due Date <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          {goals.length > 0 && (
            <div className="space-y-1.5">
              <Label>Linked Goal <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Select value={linkedGoalId} onValueChange={setLinkedGoalId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {goals.map(g => <SelectItem key={g.id} value={String(g.id)}>{g.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Description <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="What is this project about?" />
          </div>
          </div>
          <div className="flex gap-2 px-5 py-4 border-t shrink-0">
            <Button type="submit" className="flex-1" disabled={!title.trim()}>Create Project</Button>
            <Button type="button" variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── New Task Modal ────────────────────────────────────────────────────────────

function NewTaskModal({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (title: string, priority: string, dueDate: string | null, notes: string | null) => void;
}) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("medium");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");

  const reset = () => { setTitle(""); setPriority("medium"); setDueDate(""); setNotes(""); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave(title.trim(), priority, dueDate || null, notes.trim() || null);
    reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-sm flex flex-col max-h-[90vh] p-0 gap-0">
        <DialogHeader className="px-5 pt-4 pb-3 shrink-0 border-b"><DialogTitle>New Task</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <div className="space-y-1.5">
            <Label>Task *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs to get done?" required autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TASK_PRIORITIES.map(p => <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Due Date</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any context?" />
          </div>
          </div>
          <div className="flex gap-2 px-5 py-4 border-t shrink-0">
            <Button type="submit" className="flex-1" disabled={!title.trim()}>Add Task</Button>
            <Button type="button" variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── New Chore Modal ───────────────────────────────────────────────────────────

function NewChoreModal({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: Partial<InsertChore>) => void;
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("cleaning");
  const [frequency, setFrequency] = useState("weekly");
  const [priority, setPriority] = useState("medium");
  const [nextDue, setNextDue] = useState("");
  const [assignee, setAssignee] = useState("");
  const [notes, setNotes] = useState("");

  const reset = () => { setTitle(""); setCategory("cleaning"); setFrequency("weekly"); setPriority("medium"); setNextDue(""); setAssignee(""); setNotes(""); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({ title: title.trim(), category, frequency, priority, nextDue: nextDue || null, assignee: assignee.trim() || null, notes: notes.trim() || null, isActive: true });
    reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-md flex flex-col max-h-[90vh] p-0 gap-0">
        <DialogHeader className="px-5 pt-4 pb-3 shrink-0 border-b"><DialogTitle>New Recurring Chore</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <div className="space-y-1.5">
            <Label>Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Vacuum living room" required autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CHORE_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CHORE_PRIORITIES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Frequency</Label>
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CHORE_FREQUENCIES.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>First Due Date</Label>
              <Input type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Assignee <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="e.g. Jamison" />
          </div>
          <div className="space-y-1.5">
            <Label>Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          </div>
          <div className="flex gap-2 px-5 py-4 border-t shrink-0">
            <Button type="submit" className="flex-1" disabled={!title.trim()}>Add Chore</Button>
            <Button type="button" variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Project Edit Modal ────────────────────────────────────────────────────────

function ProjectEditModal({ open, onClose, project, onSave, goals }: {
  open: boolean;
  onClose: () => void;
  project: DisplayProject | null;
  onSave: (id: number, data: Partial<InsertProject>) => void;
  goals: GoalWithProjects[];
}) {
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("not_started");
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");
  const [goalId, setGoalId] = useState<string>("none");

  useEffect(() => {
    if (open && project) {
      setTitle(project.title);
      setStatus(project.status);
      setDueDate(project.dueDate ?? "");
      setDescription(project.description ?? "");
      setGoalId(project.goalId != null ? String(project.goalId) : "none");
    }
  }, [open, project]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!project || !title.trim()) return;
    const linkedGoalId = goalId !== "none" ? Number(goalId) : null;
    onSave(project.id, {
      title: title.trim(),
      status,
      dueDate: dueDate || null,
      description: description.trim() || null,
      goalId: linkedGoalId,
    });
    onClose();
  };

  const isStandalone = project?.source === "standalone";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md flex flex-col max-h-[90vh] p-0 gap-0">
        <DialogHeader className="px-5 pt-4 pb-3 shrink-0 border-b"><DialogTitle>Edit Project</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="space-y-1.5">
            <Label>Project Name *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROJECT_STATUSES.map(s => (
                    <SelectItem key={s.value} value={s.value}>
                      <span className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${s.dot}`} />{s.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Due Date <span className="text-xs text-muted-foreground">(opt)</span></Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          {isStandalone && goals.length > 0 && (
            <div className="space-y-1.5">
              <Label>Link to Goal <span className="text-xs text-muted-foreground">(opt)</span></Label>
              <Select value={goalId} onValueChange={setGoalId}>
                <SelectTrigger><SelectValue placeholder="No goal" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No goal</SelectItem>
                  {goals.map(g => (
                    <SelectItem key={g.id} value={String(g.id)}>{g.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {goalId !== "none" && (
                <p className="text-xs text-muted-foreground">This project will move under the selected goal.</p>
              )}
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Description <span className="text-xs text-muted-foreground">(opt)</span></Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          </div>
          <div className="flex gap-2 px-5 py-4 border-t shrink-0">
            <Button type="submit" className="flex-1">Save Changes</Button>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Chore Edit Modal ──────────────────────────────────────────────────────────

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
      <DialogContent className="sm:max-w-md flex flex-col max-h-[90vh] p-0 gap-0">
        <DialogHeader className="px-5 pt-4 pb-3 shrink-0 border-b"><DialogTitle>Edit Chore</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <div className="space-y-1.5">
            <Label>Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CHORE_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CHORE_PRIORITIES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Frequency</Label>
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CHORE_FREQUENCIES.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Next Due</Label>
              <Input type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Assignee <span className="text-xs text-muted-foreground">(opt)</span></Label>
            <Input value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="e.g. Jamison" />
          </div>
          <div className="space-y-1.5">
            <Label>Notes <span className="text-xs text-muted-foreground">(opt)</span></Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          </div>
          <div className="flex gap-2 px-5 py-4 border-t shrink-0">
            <Button type="submit" className="flex-1" disabled={!title.trim()}>Save Changes</Button>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type ActiveView = "projects" | "tasks" | "recurring" | "completed" | "purchases";

export default function TasksPage() {
  const { toast } = useToast();

  // ── View state ──────────────────────────────────────────────────────────────
  const [activeView, setActiveView] = useState<ActiveView>("projects");
  // Per-group manual expand/collapse overrides (defaults are computed)
  const [toggledGroups, setToggledGroups] = useState<Record<string, boolean>>({});
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null); // "source:id"
  const [newProjectModal, setNewProjectModal] = useState(false);
  const [newTaskModal, setNewTaskModal] = useState(false);
  const [newChoreModal, setNewChoreModal] = useState(false);
  const [projectEditModal, setProjectEditModal] = useState(false);
  const [editingDisplayProject, setEditingDisplayProject] = useState<DisplayProject | null>(null);
  const [choreEditModal, setChoreEditModal] = useState(false);
  const [editingChore, setEditingChore] = useState<Chore | null>(null);
  const [taskFilter, setTaskFilter] = useState<"all" | "due_today" | "overdue" | "high_priority">("all");

  // ── Data queries ────────────────────────────────────────────────────────────
  const { data: goals = [] }              = useQuery<GoalWithProjects[]>({ queryKey: ["/api/goals"] });
  const { data: standaloneProjects = [] } = useQuery<ProjectWithTasks[]>({ queryKey: ["/api/projects/standalone"] });
  const { data: generalTasksData = [] }   = useQuery<GeneralTask[]>({ queryKey: ["/api/general-tasks"] });
  const { data: chores = [] }             = useQuery<Chore[]>({ queryKey: ["/api/chores"] });
  const { data: plants = [] }             = useQuery<any[]>({ queryKey: ["/api/plants"] });
  const { data: houseProjects = [] }      = useQuery<HouseProjectWithTasks[]>({ queryKey: ["/api/house-projects"] });
  const { data: purchaseItems = [] }     = useQuery<PurchaseItem[]>({ queryKey: ["/api/purchase-items"], queryFn: () => apiRequest("GET", "/api/purchase-items").then(r => r.json()) });
  const [showPurchaseForm, setShowPurchaseForm] = useState(false);
  const [purchaseForm, setPurchaseForm] = useState({ name: "", notes: "", price: "", url: "", priority: "medium", category: "", linkedTaskId: "" });
  const [editingPurchase, setEditingPurchase] = useState<PurchaseItem | null>(null);
  const invPurchase = () => queryClient.invalidateQueries({ queryKey: ["/api/purchase-items"] });
  const addPurchase = useMutation({ mutationFn: (d: any) => apiRequest("POST", "/api/purchase-items", d), onSuccess: () => { invPurchase(); setShowPurchaseForm(false); setPurchaseForm({ name:"",notes:"",price:"",url:"",priority:"medium",category:"",linkedTaskId:"" }); } });
  const togglePurchase = useMutation({ mutationFn: ({ id, purchased }: { id:number; purchased:boolean }) => apiRequest("PATCH", `/api/purchase-items/${id}`, { purchased }), onSuccess: invPurchase });
  const deletePurchase = useMutation({ mutationFn: (id:number) => apiRequest("DELETE", `/api/purchase-items/${id}`), onSuccess: invPurchase });
  const updatePurchase = useMutation({ mutationFn: ({ id, ...d }: any) => apiRequest("PATCH", `/api/purchase-items/${id}`, d), onSuccess: () => { invPurchase(); setEditingPurchase(null); } });

  const inv     = () => { queryClient.invalidateQueries({ queryKey: ["/api/goals"] }); queryClient.invalidateQueries({ queryKey: ["/api/projects/standalone"] }); queryClient.invalidateQueries({ queryKey: ["/api/general-tasks"] }); };
  const invHouse = () => queryClient.invalidateQueries({ queryKey: ["/api/house-projects"] });
  const invChores = () => queryClient.invalidateQueries({ queryKey: ["/api/chores"] });

  // ── Mutations ────────────────────────────────────────────────────────────────

  // Standalone project creation
  const addStandaloneProject = useMutation({
    mutationFn: (data: Partial<InsertProject> & { title: string }) =>
      apiRequest("POST", "/api/projects/standalone", { ...data, status: data.status ?? "not_started", sortOrder: 0 }),
    onSuccess: inv,
  });

  // Goal-linked project creation
  const addGoalProject = useMutation({
    mutationFn: ({ goalId, data }: { goalId: number; data: Partial<InsertProject> & { title: string } }) =>
      apiRequest("POST", `/api/goals/${goalId}/projects`, { ...data, status: data.status ?? "not_started", sortOrder: 0 }),
    onSuccess: inv,
  });

  // House project creation
  const addHouseProject = useMutation({
    mutationFn: (data: Partial<InsertProject> & { title: string }) =>
      apiRequest("POST", "/api/house-projects", { ...data, status: data.status ?? "not_started", priority: "medium", category: "other" }),
    onSuccess: invHouse,
  });

  // Project update (standalone & goal-linked)
  const updateProject = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<InsertProject> }) =>
      apiRequest("PATCH", `/api/projects/${id}`, data),
    onSuccess: inv,
  });
  const deleteProject = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/projects/${id}`),
    onSuccess: () => { inv(); setExpandedProjectId(null); },
  });

  // House project update
  const updateHouseProject = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<InsertProject> }) =>
      apiRequest("PATCH", `/api/house-projects/${id}`, data),
    onSuccess: invHouse,
  });
  const deleteHouseProject = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/house-projects/${id}`),
    onSuccess: () => { invHouse(); setExpandedProjectId(null); },
  });

  // Tasks in standalone/goal-linked projects
  const addProjectTask = useMutation({
    mutationFn: ({ projectId, title }: { projectId: number; title: string }) =>
      apiRequest("POST", `/api/projects/${projectId}/tasks`, { title, completed: false, priority: "medium", sortOrder: 0 }),
    onSuccess: inv,
  });
  const toggleProjectTask = useMutation({
    mutationFn: ({ id, completed }: { id: number; completed: boolean }) =>
      apiRequest("PATCH", `/api/project-tasks/${id}`, { completed }),
    onSuccess: inv,
  });
  const updateProjectTask = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<InsertProjectTask> }) =>
      apiRequest("PATCH", `/api/project-tasks/${id}`, data),
    onSuccess: inv,
  });
  const deleteProjectTask = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/project-tasks/${id}`),
    onSuccess: inv,
  });

  // Tasks in house projects
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
  const updateHouseProjectTask = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiRequest("PATCH", `/api/house-project-tasks/${id}`, data),
    onSuccess: invHouse,
  });
  const deleteHouseProjectTask = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/house-project-tasks/${id}`),
    onSuccess: invHouse,
  });

  // General tasks
  const addGeneralTask = useMutation({
    mutationFn: (data: Partial<InsertGeneralTask> & { title: string }) =>
      apiRequest("POST", "/api/general-tasks", { ...data, completed: false, priority: data.priority ?? "medium", sortOrder: generalTasksData.length }),
    onSuccess: inv,
  });
  const toggleGeneralTask = useMutation({
    mutationFn: ({ id, completed }: { id: number; completed: boolean }) =>
      apiRequest("PATCH", `/api/general-tasks/${id}`, { completed }),
    onSuccess: inv,
  });
  const updateGeneralTask = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<InsertGeneralTask> }) =>
      apiRequest("PATCH", `/api/general-tasks/${id}`, data),
    onSuccess: inv,
  });
  const deleteGeneralTask = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/general-tasks/${id}`),
    onSuccess: inv,
  });
  // Delete with a 5s undo window instead of permanence
  function deleteGeneralTaskWithUndo(id: number) {
    const t = generalTasksData.find((x: any) => x.id === id);
    deleteGeneralTask.mutate(id, {
      onSuccess: () => {
        inv();
        if (!t) return;
        toast({
          title: "Task deleted",
          description: t.title,
          action: (
            <ToastAction
              altText="Undo delete"
              onClick={() =>
                apiRequest("POST", "/api/general-tasks", {
                  title: t.title, priority: t.priority ?? "medium",
                  dueDate: (t as any).dueDate ?? null, notes: (t as any).notes ?? null,
                  completed: t.completed ?? false, sortOrder: (t as any).sortOrder ?? 0,
                }).then(inv)
              }
            >
              Undo
            </ToastAction>
          ),
        });
      },
    });
  }

  // Chores
  const createChore = useMutation({
    mutationFn: (data: Partial<InsertChore>) => apiRequest("POST", "/api/chores", data),
    onSuccess: () => { invChores(); toast({ title: "Chore added!" }); },
  });
  const updateChore = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<InsertChore> }) =>
      apiRequest("PATCH", `/api/chores/${id}`, data),
    onSuccess: invChores,
  });
  const deleteChore = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/chores/${id}`),
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

  const waterPlant = useMutation({
    mutationFn: (id: number) => {
      const today = new Date().toISOString().slice(0, 10);
      return apiRequest("PATCH", `/api/plants/${id}`, { lastWatered: today });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plants"] });
      toast({ title: "Plant watered 💧" });
    },
  });

  // ── Derived / merged data ─────────────────────────────────────────────────

  const allDisplayProjects = useMemo((): DisplayProject[] => {
    const result: DisplayProject[] = [];

    for (const p of standaloneProjects) {
      result.push({
        id: p.id, title: p.title, status: p.status,
        description: (p as any).description, dueDate: (p as any).dueDate,
        tasks: p.tasks.map(t => ({ id: t.id, title: t.title, completed: t.completed, priority: t.priority, dueDate: (t as any).dueDate, notes: (t as any).notes })),
        source: "standalone",
      });
    }

    for (const g of goals) {
      for (const p of g.projects) {
        result.push({
          id: p.id, title: p.title, status: p.status,
          description: (p as any).description, dueDate: (p as any).dueDate,
          tasks: p.tasks.map(t => ({ id: t.id, title: t.title, completed: t.completed, priority: t.priority, dueDate: (t as any).dueDate, notes: (t as any).notes })),
          goalTitle: g.title, goalId: g.id,
          source: "goal",
        });
      }
    }

    for (const p of houseProjects) {
      result.push({
        id: p.id, title: p.title, status: p.status,
        description: (p as any).description, dueDate: (p as any).dueDate,
        tasks: (p.tasks ?? []).map((t: any) => ({ id: t.id, title: t.title, completed: t.completed, priority: t.priority, dueDate: t.dueDate, notes: t.notes })),
        source: "house",
      });
    }

    return result;
  }, [standaloneProjects, goals, houseProjects]);

  const activeProjects   = useMemo(() => allDisplayProjects.filter(p => p.status !== "done"), [allDisplayProjects]);
  const completedProjects = useMemo(() => allDisplayProjects.filter(p => p.status === "done"), [allDisplayProjects]);

  const today = new Date().toISOString().slice(0, 10);
  const openTasks     = generalTasksData.filter(t => !t.completed);
  const completedTasks = generalTasksData.filter(t => t.completed);

  // Weekly wins — tasks completed since this Sunday midnight
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay()); weekStart.setHours(0, 0, 0, 0);
  const completedThisWeek = completedTasks.filter(t => (t as any).completedAt && new Date((t as any).completedAt) >= weekStart).length;

  const choresDueSoon = useMemo(() =>
    chores.filter(c => c.isActive && c.nextDue && c.nextDue <= today),
    [chores, today]
  );

  const filteredTasks = useMemo(() => {
    if (taskFilter === "all")           return openTasks;
    if (taskFilter === "due_today")     return openTasks.filter(t => (t as any).dueDate === today);
    if (taskFilter === "overdue")       return openTasks.filter(t => (t as any).dueDate && (t as any).dueDate < today);
    if (taskFilter === "high_priority") return openTasks.filter(t => t.priority === "high");
    return openTasks;
  }, [openTasks, taskFilter, today]);

  // Status sort order: active work first, stalled next, untouched after
  const statusOrder: Record<string, number> = { in_progress: 0, not_started: 1, blocked: 2, done: 3 };
  const sortedActiveProjects = useMemo(() =>
    [...activeProjects].sort((a, b) => (statusOrder[a.status] ?? 4) - (statusOrder[b.status] ?? 4)),
    [activeProjects]
  );

  // Active chores sorted by next due
  const activeChores = useMemo(() =>
    chores.filter(c => c.isActive).sort((a, b) => {
      if (!a.nextDue && !b.nextDue) return 0;
      if (!a.nextDue) return 1;
      if (!b.nextDue) return -1;
      return a.nextDue.localeCompare(b.nextDue);
    }),
    [chores]
  );

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleCreateProject(
    title: string, status: string, dueDate: string | null,
    description: string | null, goalId: number | null, area: "general" | "home"
  ) {
    const data = { title, status, dueDate, description };
    if (area === "home") {
      addHouseProject.mutate(data as any);
    } else if (goalId) {
      addGoalProject.mutate({ goalId, data: data as any });
    } else {
      addStandaloneProject.mutate(data as any);
    }
    toast({ title: "Project created!" });
  }

  function handleUpdateProject(id: number, data: Partial<InsertProject>) {
    const proj = allDisplayProjects.find(p => p.id === id);
    if (proj?.source === "house") updateHouseProject.mutate({ id, data });
    else updateProject.mutate({ id, data });
  }

  function handleDeleteProject(proj: DisplayProject) {
    if (!confirm(`Delete "${proj.title}" and all its tasks?`)) return;
    if (proj.source === "house") deleteHouseProject.mutate(proj.id);
    else deleteProject.mutate(proj.id);
    toast({ title: "Project deleted" });
  }

  function handleAddProjectTask(proj: DisplayProject, title: string) {
    if (proj.source === "house") addHouseProjectTask.mutate({ projectId: proj.id, title });
    else addProjectTask.mutate({ projectId: proj.id, title });
  }

  function handleToggleProjectTask(proj: DisplayProject, taskId: number, done: boolean) {
    if (proj.source === "house") toggleHouseProjectTask.mutate({ id: taskId, completed: done });
    else toggleProjectTask.mutate({ id: taskId, completed: done });
  }

  function handleUpdateProjectTask(proj: DisplayProject, taskId: number, data: Record<string, any>) {
    if (proj.source === "house") updateHouseProjectTask.mutate({ id: taskId, data });
    else updateProjectTask.mutate({ id: taskId, data: data as any });
  }

  function handleDeleteProjectTask(proj: DisplayProject, taskId: number) {
    if (proj.source === "house") deleteHouseProjectTask.mutate(taskId);
    else deleteProjectTask.mutate(taskId);
  }

  function projKey(p: DisplayProject) { return `${p.source}:${p.id}`; }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="px-5 py-4 border-b flex items-center justify-between gap-3 flex-wrap shrink-0">
        <h1 className="text-xl font-bold">Tasks</h1>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setNewProjectModal(true)} className="gap-1.5">
            <Plus size={13} /><Folder size={13} /><span className="hidden sm:inline">Project</span>
          </Button>
          <Button size="sm" onClick={() => setNewTaskModal(true)} className="gap-1.5">
            <Plus size={13} /><ClipboardList size={13} /><span className="hidden sm:inline">Task</span>
          </Button>
          <Button size="sm" variant="outline" onClick={() => setNewChoreModal(true)} className="gap-1.5">
            <Plus size={13} /><RefreshCw size={13} /><span className="hidden sm:inline">Chore</span>
          </Button>
        </div>
      </div>

      {/* ── Summary row ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x border-b shrink-0">
        {[
          { label: "Active Projects", value: activeProjects.length,  icon: <Layers size={14} className="text-primary" />, onClick: () => setActiveView("projects") },
          { label: "Open Tasks",      value: openTasks.length,       icon: <ClipboardList size={14} className="text-violet-500" />, onClick: () => setActiveView("tasks") },
          { label: "Chores Due",      value: choresDueSoon.length,   icon: <AlertTriangle size={14} className="text-amber-500" />, onClick: () => setActiveView("recurring") },
          { label: "Completed",       value: completedTasks.length + completedProjects.length, icon: <CheckSquare size={14} className="text-emerald-500" />, onClick: () => setActiveView("completed") },
        ].map(({ label, value, icon, onClick }) => (
          <button key={label} onClick={onClick} className="flex flex-col items-center justify-center py-3 px-2 hover:bg-secondary/50 transition-colors text-center">
            <div className="flex items-center gap-1.5 mb-0.5">{icon}<span className="text-xl font-bold">{value}</span></div>
            <p className="text-xs text-muted-foreground">{label}</p>
          </button>
        ))}
      </div>

      {/* ── Tab bar ─────────────────────────────────────────────────────── */}
      <div className="px-4 pt-3 pb-1 shrink-0 overflow-x-auto">
        <div className="flex gap-1 w-max">
          {([
            { value: "projects",  label: `Projects (${activeProjects.length})` },
            { value: "tasks",     label: `Tasks (${openTasks.length})` },
            { value: "recurring", label: `Recurring (${activeChores.length})` },
            { value: "purchases", label: `Purchases (${purchaseItems.filter((p:any)=>!p.purchased).length})` },
            { value: "completed", label: "Completed" },
          ] as { value: ActiveView; label: string }[]).map(tab => (
            <button
              key={tab.value}
              onClick={() => setActiveView(tab.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                activeView === tab.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-4">

        {/* ── Projects view ─────────────────────────────────────────── */}
        {activeView === "projects" && (
          <div className="space-y-3">
            {sortedActiveProjects.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Folder size={36} className="mx-auto mb-3 opacity-20" />
                <p className="font-semibold text-foreground">No active projects</p>
                <p className="text-sm mt-1">Finite work like "Build Deck" or "Clean Garage" lives here.</p>
                <Button size="sm" variant="outline" className="mt-4 gap-1.5" onClick={() => setNewProjectModal(true)}>
                  <Plus size={13} /> New Project
                </Button>
              </div>
            ) : (
              (() => {
                // Group projects by their parent goal (standalone and house
                // projects get their own groups) so 50 job-application shells
                // don't bury the one project that matters.
                const groups = new Map<string, typeof sortedActiveProjects>();
                for (const p of sortedActiveProjects) {
                  const label = (p as any).goalTitle
                    ? `🎯 ${(p as any).goalTitle}`
                    : (p as any).source === "house" ? "🏠 Home Projects" : "📁 Standalone";
                  if (!groups.has(label)) groups.set(label, [] as any);
                  groups.get(label)!.push(p);
                }
                const groupList = [...groups.entries()];
                const single = groupList.length === 1;

                const renderGrid = (items: typeof sortedActiveProjects) => (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {items.map(p => {
                      const key = projKey(p);
                      return (
                        <ProjectCard
                          key={key}
                          project={p}
                          expanded={expandedProjectId === key}
                          onToggleExpand={() => setExpandedProjectId(expandedProjectId === key ? null : key)}
                          onToggleTask={(taskId, done) => handleToggleProjectTask(p, taskId, done)}
                          onDeleteTask={(taskId) => handleDeleteProjectTask(p, taskId)}
                          onUpdateTask={(taskId, data) => handleUpdateProjectTask(p, taskId, data)}
                          onAddTask={(title) => handleAddProjectTask(p, title)}
                          onEdit={() => { setEditingDisplayProject(p); setProjectEditModal(true); }}
                          onDelete={() => handleDeleteProject(p)}
                        />
                      );
                    })}
                  </div>
                );

                if (single) return renderGrid(groupList[0][1]);

                return (
                  <div className="space-y-4">
                    {groupList.map(([label, items]) => {
                      const inProgress = items.filter(p => p.status === "in_progress").length;
                      // Big, untouched groups start collapsed
                      const defaultCollapsed = items.length > 6 && inProgress === 0;
                      const collapsed = toggledGroups[label] ?? defaultCollapsed;
                      return (
                        <div key={label}>
                          <button
                            onClick={() => setToggledGroups(g => ({ ...g, [label]: !collapsed }))}
                            aria-label={`${collapsed ? "Expand" : "Collapse"} ${label}`}
                            className="w-full flex items-center gap-2 py-1.5 px-1 text-left"
                          >
                            {collapsed ? <ChevronDown size={14} className="text-muted-foreground shrink-0" /> : <ChevronUp size={14} className="text-muted-foreground shrink-0" />}
                            <span className="text-sm font-semibold">{label}</span>
                            <span className="text-xs text-muted-foreground">
                              {items.length} project{items.length === 1 ? "" : "s"}
                              {inProgress > 0 ? ` · ${inProgress} in progress` : ""}
                            </span>
                            <span className="flex-1 border-t border-border/60 ml-2" />
                          </button>
                          {!collapsed && <div className="mt-2">{renderGrid(items)}</div>}
                        </div>
                      );
                    })}
                  </div>
                );
              })()
            )}
          </div>
        )}

        {/* ── Tasks view ────────────────────────────────────────────── */}
        {activeView === "tasks" && (
          <div className="space-y-6">
            {/* Project task groups */}
            {sortedActiveProjects.filter(p => (p.tasks ?? []).some((t: any) => !t.completed)).map(p => {
              const openProjectTasks = (p.tasks ?? []).filter((t: any) => !t.completed);
              return (
                <div key={p.id}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-base">{p.emoji ?? "📁"}</span>
                    <span className="text-sm font-semibold text-foreground">{p.title}</span>
                    <span className="text-xs text-muted-foreground">({openProjectTasks.length})</span>
                  </div>
                  <div className="space-y-0.5 pl-2 border-l-2 border-border">
                    {openProjectTasks.map((t: any) => (
                      <TaskRow
                        key={t.id}
                        task={{ id: t.id, title: t.title, completed: t.completed, priority: t.priority, dueDate: t.dueDate, notes: t.notes }}
                        onToggle={(id, v) => handleToggleProjectTask(p, id, v)}
                        onDelete={(id) => handleDeleteProjectTask(p, id)}
                        onUpdate={(id, data) => handleUpdateProjectTask(p, id, data)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Standalone tasks */}
            <div>
              {openTasks.length > 0 && (
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-base">📋</span>
                  <span className="text-sm font-semibold text-foreground">Standalone Tasks</span>
                  <span className="text-xs text-muted-foreground">({openTasks.length})</span>
                </div>
              )}
              {/* Filter chips */}
              {openTasks.length > 0 && (
                <div className="flex gap-2 mb-3 flex-wrap pl-2">
                  {([
                    { value: "all",            label: `All (${openTasks.length})` },
                    { value: "due_today",      label: "Due Today" },
                    { value: "overdue",        label: "Overdue" },
                    { value: "high_priority",  label: "High Priority" },
                  ] as { value: typeof taskFilter; label: string }[]).map(f => (
                    <button
                      key={f.value}
                      onClick={() => setTaskFilter(f.value)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        taskFilter === f.value
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border text-muted-foreground hover:text-foreground hover:bg-secondary"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              )}
              {filteredTasks.length === 0 && openTasks.length === 0 && sortedActiveProjects.filter(p => (p.tasks ?? []).some((t: any) => !t.completed)).length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <ClipboardList size={36} className="mx-auto mb-3 opacity-20" />
                  <p className="font-semibold text-foreground">No open tasks</p>
                  <p className="text-sm mt-1">Capture every to-do here — errands, action items, anything you need to get done.</p>
                  <Button size="sm" variant="outline" className="mt-4 gap-1.5" onClick={() => setNewTaskModal(true)}>
                    <Plus size={13} /> Add First Task
                  </Button>
                </div>
              ) : filteredTasks.length > 0 ? (
                <div className="space-y-0.5 border-l-2 border-border pl-2">
                  {filteredTasks.map(t => (
                    <TaskRow
                      key={t.id}
                      task={{ id: t.id, title: t.title, completed: t.completed, priority: t.priority, dueDate: (t as any).dueDate, notes: (t as any).notes }}
                      onToggle={(id, v) => toggleGeneralTask.mutate({ id, completed: v })}
                      onDelete={(id) => deleteGeneralTaskWithUndo(id)}
                      onUpdate={(id, data) => updateGeneralTask.mutate({ id, data: data as any })}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        )}

        {/* ── Recurring view ────────────────────────────────────────── */}
        {activeView === "recurring" && (
          <div>
            {activeChores.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <RefreshCw size={36} className="mx-auto mb-3 opacity-20" />
                <p className="font-semibold text-foreground">No recurring chores</p>
                <p className="text-sm mt-1">Repeating maintenance like vacuuming, yard work, and filter replacements live here.</p>
                <Button size="sm" variant="outline" className="mt-4 gap-1.5" onClick={() => setNewChoreModal(true)}>
                  <Plus size={13} /> New Chore
                </Button>
              </div>
            ) : (() => {
              const soon7 = new Date(); soon7.setDate(soon7.getDate() + 7);
              const soon7str = soon7.toISOString().slice(0, 10);

              const dueNow     = activeChores.filter(c => c.frequency !== "as_needed" && c.nextDue && c.nextDue <= today);
              const comingUp   = activeChores.filter(c => c.frequency !== "as_needed" && c.nextDue && c.nextDue > today && c.nextDue <= soon7str);
              const later      = activeChores.filter(c => c.frequency !== "as_needed" && (!c.nextDue || c.nextDue > soon7str));
              const asNeeded   = activeChores.filter(c => c.frequency === "as_needed");

              const choreSection = (
                title: string,
                icon: React.ReactNode,
                items: Chore[],
                grid = false
              ) => items.length === 0 ? null : (
                <div className="mb-5">
                  <h3 className="font-semibold text-sm flex items-center gap-2 mb-2">
                    {icon} {title}
                    <span className="text-xs text-muted-foreground font-normal">{items.length}</span>
                  </h3>
                  <div className={grid ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2" : "space-y-2"}>
                    {items.map(c => (
                      <ChoreCard
                        key={c.id}
                        chore={c}
                        onComplete={() => completeChore.mutate(c)}
                        onEdit={() => { setEditingChore(c); setChoreEditModal(true); }}
                        onDelete={() => { if (confirm(`Delete "${c.title}"?`)) deleteChore.mutate(c.id); }}
                      />
                    ))}
                  </div>
                </div>
              );

              // Plant watering helpers
              const plantWateringStatus = (plant: any): { label: string; daysUntil: number | null; color: string } => {
                if (!plant.lastWatered) return { label: "Never watered", daysUntil: null, color: "text-muted-foreground" };
                const last = new Date(plant.lastWatered);
                const next = new Date(last.getTime() + plant.waterFrequencyDays * 86400000);
                const now = new Date(); now.setHours(0,0,0,0);
                const d = Math.round((next.getTime() - now.getTime()) / 86400000);
                if (d < 0) return { label: `Overdue by ${Math.abs(d)}d`, daysUntil: d, color: "text-red-600" };
                if (d === 0) return { label: "Water today!", daysUntil: d, color: "text-amber-600" };
                if (d <= 2) return { label: `In ${d}d`, daysUntil: d, color: "text-amber-500" };
                return { label: `In ${d}d`, daysUntil: d, color: "text-green-600" };
              };

              const activePlants = plants.filter((p: any) => !p.archived);
              const plantsDueNow   = activePlants.filter((p: any) => { const s = plantWateringStatus(p); return s.daysUntil !== null && s.daysUntil <= 0; });
              const plantsComingUp = activePlants.filter((p: any) => { const s = plantWateringStatus(p); return s.daysUntil !== null && s.daysUntil > 0 && s.daysUntil <= 7; });
              const plantsLater    = activePlants.filter((p: any) => { const s = plantWateringStatus(p); return s.daysUntil === null || s.daysUntil > 7; });

              const plantSection = (title: string, icon: React.ReactNode, items: any[]) => items.length === 0 ? null : (
                <div className="mb-5">
                  <h3 className="font-semibold text-sm flex items-center gap-2 mb-2">
                    {icon} {title}
                    <span className="text-xs text-muted-foreground font-normal">{items.length}</span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {items.map((p: any) => {
                      const ws = plantWateringStatus(p);
                      return (
                        <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl border bg-card">
                          {p.imageUrl ? (
                            <img src={p.imageUrl} alt={p.name} className="w-9 h-9 rounded-lg object-cover shrink-0" />
                          ) : (
                            <div className="w-9 h-9 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
                              <Leaf size={16} className="text-green-600" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{p.name}</p>
                            <p className={`text-xs ${ws.color}`}>{ws.label}</p>
                          </div>
                          <button
                            onClick={() => waterPlant.mutate(p.id)}
                            disabled={waterPlant.isPending}
                            title="Log watering"
                            className="text-lg hover:scale-125 transition-transform active:scale-95 disabled:opacity-50"
                          >💧</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );

              return (
                <>
                  {choreSection("Due Now",     <AlertTriangle size={14} className="text-amber-500" />, dueNow)}
                  {choreSection("Coming Up",   <Clock size={14} className="text-primary" />,           comingUp, true)}
                  {choreSection("Later",       <RefreshCw size={14} className="text-muted-foreground" />, later, true)}
                  {choreSection("As Needed",   <RefreshCw size={14} className="text-muted-foreground/60" />, asNeeded, true)}
                  {activePlants.length > 0 && (
                    <div className="mt-6">
                      <h3 className="font-semibold text-sm flex items-center gap-2 mb-3 border-t pt-4">
                        <Leaf size={14} className="text-green-500" /> Plant Watering
                        <span className="text-xs text-muted-foreground font-normal">{activePlants.length} plants</span>
                      </h3>
                      {plantSection("Needs Water", <AlertTriangle size={14} className="text-amber-500" />, plantsDueNow)}
                      {plantSection("Coming Up",   <Clock size={14} className="text-primary" />,           plantsComingUp)}
                      {plantSection("Later",       <RefreshCw size={14} className="text-muted-foreground" />, plantsLater)}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* ── Completed view ─────────────────────────────────────────── */}
        {activeView === "purchases" && (
          <div className="space-y-4">
            {/* Add form */}
            {showPurchaseForm ? (
              <div className="rounded-xl border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">New Purchase Item</span>
                  <button onClick={() => setShowPurchaseForm(false)}><X size={14} /></button>
                </div>
                <Input placeholder="Item name *" value={purchaseForm.name} onChange={e => setPurchaseForm(f => ({...f, name: e.target.value}))} className="h-8 text-sm" />
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Category (e.g. Tech, Home)" value={purchaseForm.category} onChange={e => setPurchaseForm(f => ({...f, category: e.target.value}))} className="h-8 text-sm" />
                  <Input placeholder="Est. price ($)" type="number" value={purchaseForm.price} onChange={e => setPurchaseForm(f => ({...f, price: e.target.value}))} className="h-8 text-sm" />
                </div>
                <Input placeholder="Link (URL)" value={purchaseForm.url} onChange={e => setPurchaseForm(f => ({...f, url: e.target.value}))} className="h-8 text-sm" />
                <Input placeholder="Notes" value={purchaseForm.notes} onChange={e => setPurchaseForm(f => ({...f, notes: e.target.value}))} className="h-8 text-sm" />
                <div className="grid grid-cols-2 gap-2">
                  <Select value={purchaseForm.priority} onValueChange={v => setPurchaseForm(f => ({...f, priority: v}))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low priority</SelectItem>
                      <SelectItem value="medium">Medium priority</SelectItem>
                      <SelectItem value="high">High priority</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={purchaseForm.linkedTaskId || "__none__"} onValueChange={v => setPurchaseForm(f => ({...f, linkedTaskId: v === "__none__" ? "" : v}))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Link to task…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No linked task</SelectItem>
                      {generalTasksData.filter(t => !t.completed).map(t => (
                        <SelectItem key={t.id} value={String(t.id)}>{t.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1" disabled={!purchaseForm.name.trim() || addPurchase.isPending}
                    onClick={() => addPurchase.mutate({ ...purchaseForm, price: purchaseForm.price ? parseFloat(purchaseForm.price) : null, linkedTaskId: purchaseForm.linkedTaskId ? parseInt(purchaseForm.linkedTaskId) : null })}>
                    Add Item
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowPurchaseForm(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <Button size="sm" variant="outline" className="gap-1.5 w-full" onClick={() => setShowPurchaseForm(true)}>
                <Plus size={13} /> Add Purchase Item
              </Button>
            )}

            {/* Items */}
            {purchaseItems.length === 0 && !showPurchaseForm ? (
              <div className="text-center py-16 text-muted-foreground">
                <ShoppingCart size={36} className="mx-auto mb-3 opacity-20" />
                <p className="font-semibold text-foreground">Nothing on your list yet</p>
                <p className="text-sm mt-1">Add items you want to buy.</p>
              </div>
            ) : (
              <div>
                {/* Active items */}
                {purchaseItems.filter((p: any) => !p.purchased).length > 0 && (
                  <div className="space-y-1.5 mb-4">
                    {purchaseItems.filter((p: any) => !p.purchased).map((item: any) => {
                      const linkedTask = item.linkedTaskId ? generalTasksData.find(t => t.id === item.linkedTaskId) : null;
                      const priorityColor = item.priority === "high" ? "text-red-500" : item.priority === "low" ? "text-muted-foreground" : "text-amber-500";
                      return (
                        <div key={item.id} className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl border bg-card group hover:shadow-sm transition-shadow">
                          <button onClick={() => togglePurchase.mutate({ id: item.id, purchased: true })}
                            className="mt-0.5 shrink-0 text-muted-foreground hover:text-emerald-500 transition-colors">
                            <Circle size={16} />
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium">{item.name}</span>
                              {item.price && <span className="text-xs text-muted-foreground">${item.price}</span>}
                              {item.category && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground flex items-center gap-1"><Tag size={9}/>{item.category}</span>}
                              <Flag size={11} className={`shrink-0 ${priorityColor}`} />
                            </div>
                            {item.notes && <p className="text-xs text-muted-foreground mt-0.5">{item.notes}</p>}
                            {linkedTask && (
                              <p className="text-[11px] text-primary mt-0.5 flex items-center gap-1">
                                <ClipboardList size={10}/> Linked: {linkedTask.title}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            {item.url && <a href={item.url} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-primary transition-colors"><ExternalLink size={12}/></a>}
                            <button onClick={() => { setEditingPurchase(item); setPurchaseForm({ name:item.name, notes:item.notes||"", price:item.price?String(item.price):"", url:item.url||"", priority:item.priority, category:item.category||"", linkedTaskId:item.linkedTaskId?String(item.linkedTaskId):"" }); setShowPurchaseForm(true); }}
                              className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"><Pencil size={12}/></button>
                            <button onClick={() => deletePurchase.mutate(item.id)} className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-destructive transition-colors"><Trash2 size={12}/></button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {/* Purchased items */}
                {purchaseItems.filter((p: any) => p.purchased).length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Purchased</p>
                    <div className="space-y-1">
                      {purchaseItems.filter((p: any) => p.purchased).map((item: any) => (
                        <div key={item.id} className="flex items-center gap-2.5 px-3 py-2 rounded-xl border bg-secondary/30 group">
                          <button onClick={() => togglePurchase.mutate({ id: item.id, purchased: false })}
                            className="shrink-0 text-emerald-500 hover:text-muted-foreground transition-colors">
                            <CheckCircle2 size={16} />
                          </button>
                          <span className="flex-1 text-sm line-through text-muted-foreground">{item.name}</span>
                          <button onClick={() => deletePurchase.mutate(item.id)} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-secondary text-muted-foreground hover:text-destructive transition-all"><Trash2 size={11}/></button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeView === "completed" && (
          <div className="space-y-5">
            {/* Weekly wins banner */}
            {completedThisWeek > 0 ? (
              <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/20 px-4 py-4 text-center">
                <div className="text-2xl mb-1">🎉</div>
                <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
                  You knocked out {completedThisWeek} task{completedThisWeek !== 1 ? "s" : ""} this week
                </p>
                <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">Keep the momentum going</p>
              </div>
            ) : (
              completedTasks.length === 0 && completedProjects.length === 0 ? null : (
                <div className="rounded-xl border border-border bg-secondary/30 px-4 py-3 text-center">
                  <p className="text-sm font-semibold text-foreground">Nothing completed yet this week</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Your older wins are listed below</p>
                </div>
              )
            )}

            {/* Completed projects */}
            {completedProjects.length > 0 && (
              <div>
                <h3 className="font-semibold text-sm flex items-center gap-2 mb-2">
                  <CheckSquare size={14} className="text-emerald-500" /> Completed Projects
                  <span className="text-xs text-muted-foreground font-normal">{completedProjects.length}</span>
                </h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                  {completedProjects.map(p => {
                    const key = projKey(p);
                    return (
                      <div key={key}>
                        <ProjectCard
                          project={p}
                          expanded={expandedProjectId === key}
                          onToggleExpand={() => setExpandedProjectId(expandedProjectId === key ? null : key)}
                          onToggleTask={(taskId, done) => handleToggleProjectTask(p, taskId, done)}
                          onDeleteTask={(taskId) => handleDeleteProjectTask(p, taskId)}
                          onUpdateTask={(taskId, data) => handleUpdateProjectTask(p, taskId, data)}
                          onAddTask={(title) => handleAddProjectTask(p, title)}
                          onEdit={() => { setEditingDisplayProject(p); setProjectEditModal(true); }}
                          onDelete={() => handleDeleteProject(p)}
                        />
                        <div className="flex items-center gap-2 px-2 pt-1 pb-1 flex-wrap">
                          <span className="text-[10px] text-muted-foreground/60 bg-secondary px-1.5 py-0.5 rounded">Project</span>
                          {p.source === "house" && <span className="text-[10px] text-muted-foreground/60 bg-secondary px-1.5 py-0.5 rounded">Home</span>}
                          {p.goalTitle && (
                            <span className="text-[10px] text-primary/60 bg-primary/8 border border-primary/15 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                              <Target size={8} /> {p.goalTitle}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Completed tasks */}
            {completedTasks.length > 0 && (
              <div>
                <h3 className="font-semibold text-sm flex items-center gap-2 mb-2">
                  <CheckCircle2 size={14} className="text-emerald-500" /> Completed Tasks
                  <span className="text-xs text-muted-foreground font-normal">{completedTasks.length}</span>
                </h3>
                <div className="space-y-0.5">
                  {completedTasks.map(t => (
                    <div key={t.id}>
                      <TaskRow
                        task={{ id: t.id, title: t.title, completed: t.completed, priority: t.priority, dueDate: (t as any).dueDate, notes: (t as any).notes }}
                        onToggle={(id, v) => toggleGeneralTask.mutate({ id, completed: v })}
                        onDelete={(id) => deleteGeneralTaskWithUndo(id)}
                        onUpdate={(id, data) => updateGeneralTask.mutate({ id, data: data as any })}
                      />
                      {/* Context row */}
                      <div className="flex items-center gap-2 pl-7 pb-1 flex-wrap">
                        <span className="text-[10px] text-muted-foreground/60 bg-secondary px-1.5 py-0.5 rounded">Task</span>
                        {(t as any).completedAt && (
                          <span className="text-[10px] text-muted-foreground/60">
                            {format(parseISO((t as any).completedAt), "MMM d")}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {completedProjects.length === 0 && completedTasks.length === 0 && (
              <div className="text-center py-16 text-muted-foreground">
                <CheckSquare size={36} className="mx-auto mb-3 opacity-20" />
                <p className="font-semibold text-foreground">Nothing completed yet</p>
                <p className="text-sm mt-1">Finished projects and tasks will appear here.</p>
              </div>
            )}
          </div>
        )}

      </div>

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      <NewProjectModal
        open={newProjectModal}
        onClose={() => setNewProjectModal(false)}
        goals={goals}
        onSave={handleCreateProject}
      />
      <NewTaskModal
        open={newTaskModal}
        onClose={() => setNewTaskModal(false)}
        onSave={(title, priority, dueDate, notes) =>
          addGeneralTask.mutate({ title, priority, dueDate, notes } as any)
        }
      />
      <NewChoreModal
        open={newChoreModal}
        onClose={() => setNewChoreModal(false)}
        onSave={(data) => createChore.mutate(data)}
      />
      <ProjectEditModal
        open={projectEditModal}
        onClose={() => { setProjectEditModal(false); setEditingDisplayProject(null); }}
        project={editingDisplayProject}
        onSave={handleUpdateProject}
        goals={goals}
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
