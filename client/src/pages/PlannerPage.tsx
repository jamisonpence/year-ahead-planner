import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  format, parseISO, differenceInDays, startOfDay, startOfMonth, endOfMonth,
  eachDayOfInterval, getDay, isSameMonth, isToday, addYears, addMonths, addWeeks,
} from "date-fns";
import {
  Plus, Sun, Moon, Calendar, List, Cake, Plane, Briefcase, Target,
  MoreHorizontal, Pencil, Trash2, ChevronLeft, ChevronRight, X,
  AlertTriangle, CheckCircle2, Circle, ChevronDown, ChevronUp,
  LayoutGrid, Check, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/components/ThemeProvider";
import type { Event, Task, EventWithTasks, InsertEvent, InsertTask } from "@shared/schema";

// ── Constants ──────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { value: "birthday", label: "Birthday", icon: Cake,      cls: "cat-birthday" },
  { value: "travel",   label: "Travel",   icon: Plane,     cls: "cat-travel"   },
  { value: "project",  label: "Project",  icon: Briefcase, cls: "cat-project"  },
  { value: "goal",     label: "Goal",     icon: Target,    cls: "cat-goal"     },
  { value: "other",    label: "Other",    icon: Calendar,  cls: "cat-other"    },
];

const RECURRENCE = [
  { value: "none",    label: "One-time"          },
  { value: "yearly",  label: "Every year"         },
  { value: "monthly", label: "Every month"        },
  { value: "weekly",  label: "Every week"         },
];

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const getCat = (c: string) => CATEGORIES.find((x) => x.value === c) ?? CATEGORIES[4];

function daysUntil(dateStr: string) {
  return differenceInDays(startOfDay(parseISO(dateStr)), startOfDay(new Date()));
}

function taskProg(tasks: Task[]) {
  const total = tasks.length, done = tasks.filter((t) => t.completed).length;
  return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
}

// ── Recurring helpers ─────────────────────────────────────────────────────────
// For a recurring event, compute the NEXT occurrence on/after today

function nextOccurrence(event: Event): string {
  if (event.recurring === "none") return event.date;
  const today = startOfDay(new Date());
  const base = parseISO(event.date);
  let candidate = base;
  // Advance until >= today
  for (let i = 0; i < 5000; i++) {
    if (startOfDay(candidate) >= today) return format(candidate, "yyyy-MM-dd");
    if (event.recurring === "yearly")  candidate = addYears(candidate, 1);
    else if (event.recurring === "monthly") candidate = addMonths(candidate, 1);
    else if (event.recurring === "weekly")  candidate = addWeeks(candidate, 1);
    else break;
  }
  return format(candidate, "yyyy-MM-dd");
}

// For display list: inject virtual next-occurrence date into recurring events
function withNextDate(events: EventWithTasks[]): EventWithTasks[] {
  return events.map((e) => ({
    ...e,
    date: e.recurring !== "none" ? nextOccurrence(e) : e.date,
  }));
}

const recurLabel = (r: string) => RECURRENCE.find((x) => x.value === r)?.label ?? "";

// ── TaskItem ───────────────────────────────────────────────────────────────────

function TaskItem({ task, onToggle, onDelete, onUpdate }: {
  task: Task;
  onToggle: (id: number, v: boolean) => void;
  onDelete: (id: number) => void;
  onUpdate: (id: number, data: Partial<InsertTask>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [due, setDue] = useState(task.dueDate ?? "");
  const [notes, setNotes] = useState(task.notes ?? "");

  const save = () => {
    if (!title.trim()) return;
    onUpdate(task.id, { title: title.trim(), dueDate: due || null, notes: notes.trim() || null });
    setEditing(false);
  };

  const d = task.dueDate ? daysUntil(task.dueDate) : null;
  const overdue = d !== null && d < 0, soon = d !== null && d >= 0 && d <= 7;

  if (editing) return (
    <div className="bg-secondary/40 rounded-lg p-3 space-y-2">
      <Input value={title} onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
        className="h-8 text-sm" autoFocus />
      <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="h-7 text-xs" placeholder="Due date (optional)" />
      <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="h-7 text-xs" placeholder="Notes (optional)" />
      <div className="flex gap-1.5">
        <Button size="sm" className="h-6 text-xs px-2" onClick={save}>Save</Button>
        <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setEditing(false)}>Cancel</Button>
      </div>
    </div>
  );

  return (
    <div className={`group flex items-start gap-2.5 py-1.5 px-1 rounded-lg hover:bg-secondary/40 transition-colors ${task.completed ? "opacity-60" : ""}`}>
      <button onClick={() => onToggle(task.id, !task.completed)} className="mt-0.5 shrink-0 text-muted-foreground hover:text-primary transition-colors">
        {task.completed ? <CheckCircle2 size={16} className="text-primary" /> : <Circle size={16} />}
      </button>
      <div className="flex-1 min-w-0">
        <span className={`text-sm leading-snug ${task.completed ? "line-through text-muted-foreground" : ""}`}>{task.title}</span>
        {task.dueDate && (
          <span className={`ml-2 text-xs font-medium ${overdue ? "text-destructive" : soon ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
            {overdue ? `overdue ${format(parseISO(task.dueDate), "MMM d")}` : `due ${format(parseISO(task.dueDate), "MMM d")}`}
          </span>
        )}
        {task.notes && <p className="text-xs text-muted-foreground mt-0.5 truncate">{task.notes}</p>}
      </div>
      <div className="opacity-0 group-hover:opacity-100 flex gap-0.5 shrink-0 transition-opacity">
        <button onClick={() => setEditing(true)} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"><Pencil size={11} /></button>
        <button onClick={() => onDelete(task.id)} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-destructive transition-colors"><Trash2 size={11} /></button>
      </div>
    </div>
  );
}

// ── TaskList ───────────────────────────────────────────────────────────────────

function TaskList({ eventId, tasks }: { eventId: number; tasks: Task[] }) {
  const { toast } = useToast();
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/events"] });

  const addTask = useMutation({
    mutationFn: (d: Omit<InsertTask, "eventId">) => apiRequest("POST", `/api/events/${eventId}/tasks`, { ...d, eventId }),
    onSuccess: () => { invalidate(); setNewTitle(""); setAdding(false); },
    onError: () => toast({ title: "Error adding task", variant: "destructive" }),
  });
  const toggleTask = useMutation({
    mutationFn: ({ id, completed }: { id: number; completed: boolean }) => apiRequest("PATCH", `/api/tasks/${id}`, { completed }),
    onSuccess: invalidate,
  });
  const updateTask = useMutation({
    mutationFn: ({ id, ...data }: { id: number } & Partial<InsertTask>) => apiRequest("PATCH", `/api/tasks/${id}`, data),
    onSuccess: invalidate,
  });
  const deleteTask = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/tasks/${id}`),
    onSuccess: invalidate,
  });

  const prog = taskProg(tasks);
  const submit = () => {
    if (!newTitle.trim()) return;
    addTask.mutate({ title: newTitle.trim(), completed: false, dueDate: null, notes: null, sortOrder: tasks.length });
  };

  return (
    <div className="mt-3 space-y-1">
      {tasks.length > 0 && (
        <div className="flex items-center gap-2 mb-2">
          <Progress value={prog.pct} className="h-1.5 flex-1" />
          <span className="text-xs text-muted-foreground shrink-0">{prog.done}/{prog.total}</span>
        </div>
      )}
      {tasks.map((t) => (
        <TaskItem key={t.id} task={t}
          onToggle={(id, v) => toggleTask.mutate({ id, completed: v })}
          onDelete={(id) => deleteTask.mutate(id)}
          onUpdate={(id, data) => updateTask.mutate({ id, ...data })}
        />
      ))}
      {adding ? (
        <div className="flex gap-1.5 mt-1">
          <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") { setAdding(false); setNewTitle(""); } }}
            placeholder="Task name..." className="h-7 text-xs flex-1" autoFocus />
          <Button size="sm" className="h-7 text-xs px-2" onClick={submit} disabled={addTask.isPending}><Check size={12} /></Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs px-1" onClick={() => { setAdding(false); setNewTitle(""); }}><X size={12} /></Button>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1 px-1">
          <Plus size={12} /> Add task
        </button>
      )}
    </div>
  );
}

// ── Event Form Modal ───────────────────────────────────────────────────────────

function EventFormModal({ open, onClose, editEvent }: {
  open: boolean; onClose: () => void; editEvent: Event | null;
}) {
  const { toast } = useToast();
  const [title, setTitle]           = useState("");
  const [date, setDate]             = useState("");
  const [endDate, setEndDate]       = useState("");
  const [category, setCategory]     = useState("other");
  const [recurring, setRecurring]   = useState("none");
  const [description, setDesc]      = useState("");

  useEffect(() => {
    if (open) {
      setTitle(editEvent?.title ?? "");
      setDate(editEvent?.date ?? "");
      setEndDate(editEvent?.endDate ?? "");
      setCategory(editEvent?.category ?? "other");
      setRecurring(editEvent?.recurring ?? "none");
      setDesc(editEvent?.description ?? "");
    }
  }, [open, editEvent]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/events"] });

  const createMut = useMutation({
    mutationFn: (d: InsertEvent) => apiRequest("POST", "/api/events", d),
    onSuccess: () => { invalidate(); toast({ title: "Event added" }); onClose(); },
    onError: () => toast({ title: "Error saving event", variant: "destructive" }),
  });
  const updateMut = useMutation({
    mutationFn: (d: Partial<InsertEvent>) => apiRequest("PATCH", `/api/events/${editEvent?.id}`, d),
    onSuccess: () => { invalidate(); toast({ title: "Event updated" }); onClose(); },
    onError: () => toast({ title: "Error saving event", variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !date) return;
    const payload: InsertEvent = {
      title: title.trim(), date, endDate: endDate || null,
      category, recurring, description: description.trim() || null, color: null,
    };
    editEvent ? updateMut.mutate(payload) : createMut.mutate(payload);
  };

  const isPending = createMut.isPending || updateMut.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">{editEvent ? "Edit Event" : "Add Event"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Mom's Birthday, NYC Trip, Q3 Goal" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>End Date <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      <span className="flex items-center gap-2"><c.icon size={14} />{c.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Repeats</Label>
              <Select value={recurring} onValueChange={setRecurring}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RECURRENCE.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Textarea value={description} onChange={(e) => setDesc(e.target.value)} placeholder="Any notes, reminders, or details..." rows={3} />
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="submit" disabled={isPending} className="flex-1">{isPending ? "Saving..." : editEvent ? "Save Changes" : "Add Event"}</Button>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Upcoming Alert ─────────────────────────────────────────────────────────────

function UpcomingAlert({ events }: { events: EventWithTasks[] }) {
  const upcoming = useMemo(() => {
    return withNextDate(events)
      .filter((e) => { const d = daysUntil(e.date); return d >= 0 && d <= 21; })
      .sort((a, b) => daysUntil(a.date) - daysUntil(b.date));
  }, [events]);

  if (!upcoming.length) return null;
  return (
    <div className="alert-upcoming border rounded-xl p-4 mb-6">
      <div className="flex items-start gap-3">
        <AlertTriangle size={18} className="text-amber-500 dark:text-amber-400 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold mb-2">{upcoming.length} event{upcoming.length > 1 ? "s" : ""} in the next 3 weeks</p>
          <div className="flex flex-wrap gap-2">
            {upcoming.map((e) => {
              const d = daysUntil(e.date); const cat = getCat(e.category);
              return (
                <span key={e.id} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${cat.cls}`}>
                  {e.recurring !== "none" && <RefreshCw size={9} className="opacity-60" />}
                  <cat.icon size={11} />{e.title}
                  <span className="opacity-70">{d === 0 ? "today" : d === 1 ? "tomorrow" : `${d}d`}</span>
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Mini Calendar ──────────────────────────────────────────────────────────────

function MiniCalendar({ events, selectedDate, onSelectDate }: {
  events: EventWithTasks[]; selectedDate: Date | null; onSelectDate: (d: Date) => void;
}) {
  const [viewMonth, setViewMonth] = useState(() => new Date());
  const today = startOfDay(new Date());
  const days = eachDayOfInterval({ start: startOfMonth(viewMonth), end: endOfMonth(viewMonth) });
  const startPad = getDay(startOfMonth(viewMonth));

  // Build event map including recurring occurrences for the current view month
  const eventMap = useMemo(() => {
    const m: Record<string, string[]> = {};
    const monthStr = format(viewMonth, "yyyy-MM");
    withNextDate(events).forEach((e) => {
      // Show recurring in calendar month if next occurrence falls this month
      if (e.date.startsWith(monthStr) || events.find(x => x.id === e.id)?.date.startsWith(monthStr)) {
        if (!m[e.date]) m[e.date] = [];
        m[e.date].push(e.category);
      }
    });
    // Also show original dates for non-recurring
    events.filter(e => e.recurring === "none" && e.date.startsWith(monthStr)).forEach(e => {
      if (!m[e.date]) m[e.date] = [];
      if (!m[e.date].includes(e.category)) m[e.date].push(e.category);
    });
    return m;
  }, [events, viewMonth]);

  return (
    <div className="bg-card rounded-xl border p-4">
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1))} className="p-1 rounded hover:bg-secondary transition-colors"><ChevronLeft size={16} /></button>
        <span className="text-sm font-semibold">{MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}</span>
        <button onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1))} className="p-1 rounded hover:bg-secondary transition-colors"><ChevronRight size={16} /></button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {["Su","Mo","Tu","We","Th","Fr","Sa"].map((d) => (
          <div key={d} className="text-center text-xs text-muted-foreground font-medium py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {Array(startPad).fill(null).map((_, i) => <div key={`p${i}`} />)}
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const cats = eventMap[key] ?? [];
          const isSel = selectedDate && format(selectedDate, "yyyy-MM-dd") === key;
          return (
            <button key={key} onClick={() => onSelectDate(day)}
              className={["relative flex flex-col items-center pt-1 pb-1.5 rounded-md text-xs transition-colors min-h-[42px]",
                isSel ? "bg-primary text-primary-foreground" : isToday(day) ? "bg-secondary font-bold" : "hover:bg-secondary",
                !isSameMonth(day, viewMonth) ? "opacity-30" : ""].join(" ")}>
              <span>{day.getDate()}</span>
              {cats.length > 0 && (
                <div className="flex gap-0.5 flex-wrap justify-center mt-0.5">
                  {[...new Set(cats)].slice(0, 3).map((cat, i) => (
                    <span key={i} className={`w-1.5 h-1.5 rounded-full dot-${cat} ${isSel ? "opacity-70" : ""}`} />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
      <button onClick={() => { setViewMonth(today); onSelectDate(today); }}
        className="mt-3 w-full text-xs text-muted-foreground hover:text-foreground transition-colors text-center">
        Jump to today
      </button>
    </div>
  );
}

// ── Event Card ─────────────────────────────────────────────────────────────────

function EventCard({ event, onEdit, onDelete, defaultExpanded }: {
  event: EventWithTasks; onEdit: (e: Event) => void; onDelete: (id: number) => void; defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? false);
  const cat = getCat(event.category);
  const displayDate = event.recurring !== "none" ? nextOccurrence(event) : event.date;
  const d = daysUntil(displayDate);
  const prog = taskProg(event.tasks);
  const hasTrackable = event.category === "goal" || event.category === "project";

  return (
    <div className="bg-card border rounded-xl overflow-hidden hover:shadow-sm transition-shadow">
      <div className="flex items-start gap-3 p-4">
        <div className={`mt-0.5 shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${cat.cls}`}>
          <cat.icon size={15} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="font-semibold text-sm leading-tight">{event.title}</p>
            {event.recurring !== "none" && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-secondary px-1.5 py-0.5 rounded-full">
                <RefreshCw size={9} />{recurLabel(event.recurring)}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {format(parseISO(displayDate), "MMM d, yyyy")}
            {event.endDate && event.endDate !== event.date && <> — {format(parseISO(event.endDate), "MMM d, yyyy")}</>}
          </p>
          {event.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{event.description}</p>}
          {event.tasks.length > 0 && !expanded && (
            <div className="flex items-center gap-2 mt-2">
              <Progress value={prog.pct} className="h-1.5 flex-1 max-w-[120px]" />
              <span className="text-xs text-muted-foreground">{prog.done}/{prog.total} tasks</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {d >= 0 && d <= 21 && (
            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">
              {d === 0 ? "Today" : d === 1 ? "Tomorrow" : `${d}d`}
            </span>
          )}
          {d < 0 && event.recurring === "none" && (
            <span className="text-xs font-semibold text-muted-foreground px-2 py-0.5 rounded-full border">Past</span>
          )}
          {(hasTrackable || event.tasks.length > 0) && (
            <button onClick={() => setExpanded((x) => !x)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground">
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal size={15} /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(event)}><Pencil size={14} className="mr-2" />Edit</DropdownMenuItem>
              {(hasTrackable || event.tasks.length > 0) && (
                <DropdownMenuItem onClick={() => setExpanded(true)}><Check size={14} className="mr-2" />View tasks</DropdownMenuItem>
              )}
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onDelete(event.id)}>
                <Trash2 size={14} className="mr-2" />Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {expanded && (
        <div className="border-t px-4 pb-4 pt-3 bg-secondary/20">
          <TaskList eventId={event.id} tasks={event.tasks} />
        </div>
      )}
    </div>
  );
}

// ── Goals & Projects View ──────────────────────────────────────────────────────

function GoalsProjectsView({ events, onEdit, onDelete }: {
  events: EventWithTasks[]; onEdit: (e: Event) => void; onDelete: (id: number) => void;
}) {
  const goals    = useMemo(() => events.filter((e) => e.category === "goal"),    [events]);
  const projects = useMemo(() => events.filter((e) => e.category === "project"), [events]);

  const empty = (label: string, icon: React.ReactNode) => (
    <div className="text-center py-8 text-muted-foreground bg-card rounded-xl border">
      {icon}<p className="font-medium mt-3">No {label.toLowerCase()} yet</p>
      <p className="text-sm mt-1">Add one with the + button above</p>
    </div>
  );

  const section = (items: EventWithTasks[], label: string, headerIcon: React.ReactNode, emptyIcon: React.ReactNode) => (
    <section>
      <div className="flex items-center gap-2 mb-3">
        {headerIcon}
        <h2 className="font-bold text-base">{label}</h2>
        <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">{items.length}</span>
      </div>
      {items.length === 0 ? empty(label, emptyIcon) : (
        <div className="space-y-3">
          {items.map((e) => <EventCard key={e.id} event={e} onEdit={onEdit} onDelete={onDelete} defaultExpanded />)}
        </div>
      )}
    </section>
  );

  return (
    <div className="space-y-8">
      {section(goals,    "Goals",    <Target   size={16} className="text-[hsl(var(--cat-goal))]"    />, <Target   size={32} className="mx-auto opacity-20" />)}
      {section(projects, "Projects", <Briefcase size={16} className="text-[hsl(var(--cat-project))]" />, <Briefcase size={32} className="mx-auto opacity-20" />)}
    </div>
  );
}

// ── Calendar View ──────────────────────────────────────────────────────────────

function CalendarView({ events, onEdit, onDelete }: {
  events: EventWithTasks[]; onEdit: (e: Event) => void; onDelete: (id: number) => void;
}) {
  const [viewMonth, setViewMonth] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const days = eachDayOfInterval({ start: startOfMonth(viewMonth), end: endOfMonth(viewMonth) });
  const startPad = getDay(startOfMonth(viewMonth));

  const eventMap = useMemo(() => {
    const m: Record<string, EventWithTasks[]> = {};
    // Include recurring events that fall in this month
    const monthStr = format(viewMonth, "yyyy-MM");
    withNextDate(events).forEach((e) => {
      if (e.date.startsWith(monthStr)) {
        if (!m[e.date]) m[e.date] = [];
        m[e.date].push(e);
      }
    });
    // Also non-recurring events already in this month
    events.filter(e => e.recurring === "none" && e.date.startsWith(monthStr)).forEach(e => {
      if (!m[e.date]) m[e.date] = [];
      if (!m[e.date].find(x => x.id === e.id)) m[e.date].push(e);
    });
    return m;
  }, [events, viewMonth]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1))} className="p-2 rounded-lg hover:bg-secondary transition-colors"><ChevronLeft size={18} /></button>
        <h2 className="text-lg font-bold">{MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}</h2>
        <button onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1))} className="p-2 rounded-lg hover:bg-secondary transition-colors"><ChevronRight size={18} /></button>
      </div>
      <div className="bg-card rounded-xl border overflow-hidden">
        <div className="grid grid-cols-7 border-b">
          {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => (
            <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-2.5 px-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array(startPad).fill(null).map((_, i) => <div key={`p${i}`} className="min-h-[80px] border-b border-r bg-secondary/20" />)}
          {days.map((day, idx) => {
            const key = format(day, "yyyy-MM-dd");
            const dayEvts = eventMap[key] ?? [];
            const isSel = selectedDay === key;
            const col = (startPad + idx) % 7;
            return (
              <div key={key} onClick={() => setSelectedDay((p) => p === key ? null : key)}
                className={["min-h-[80px] border-b p-1.5 cursor-pointer transition-colors", col < 6 ? "border-r" : "", isSel ? "bg-primary/5" : "hover:bg-secondary/50"].join(" ")}>
                <span className={["text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full mb-1", isToday(day) ? "bg-primary text-primary-foreground font-bold" : ""].join(" ")}>
                  {day.getDate()}
                </span>
                <div className="space-y-0.5">
                  {dayEvts.slice(0, 3).map((e) => (
                    <div key={e.id} className={`text-xs px-1.5 py-0.5 rounded truncate cat-${e.category} border flex items-center gap-1`} title={e.title}>
                      {e.recurring !== "none" && <RefreshCw size={8} className="shrink-0 opacity-60" />}
                      <span className="truncate">{e.title}</span>
                    </div>
                  ))}
                  {dayEvts.length > 3 && <div className="text-xs text-muted-foreground px-1">+{dayEvts.length - 3}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {selectedDay && (
        <div className="bg-card rounded-xl border p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="font-semibold">{format(parseISO(selectedDay), "EEEE, MMMM d, yyyy")}</p>
            <button onClick={() => setSelectedDay(null)} className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
          </div>
          {(eventMap[selectedDay] ?? []).length === 0
            ? <p className="text-sm text-muted-foreground">No events on this day</p>
            : <div className="space-y-3">{(eventMap[selectedDay] ?? []).map((e) => <EventCard key={e.id} event={e} onEdit={onEdit} onDelete={onDelete} />)}</div>
          }
        </div>
      )}
    </div>
  );
}

// ── List View ──────────────────────────────────────────────────────────────────

function ListView({ events, onEdit, onDelete }: {
  events: EventWithTasks[]; onEdit: (e: Event) => void; onDelete: (id: number) => void;
}) {
  // Sort by next occurrence date
  const sorted = useMemo(() => withNextDate(events).sort((a, b) => a.date.localeCompare(b.date)), [events]);

  const grouped = useMemo(() => {
    const m: Record<string, EventWithTasks[]> = {};
    sorted.forEach((e) => {
      const k = format(parseISO(e.date), "yyyy-MM");
      if (!m[k]) m[k] = [];
      m[k].push(e);
    });
    return Object.entries(m).sort(([a], [b]) => a.localeCompare(b));
  }, [sorted]);

  if (!grouped.length) return (
    <div className="text-center py-16 text-muted-foreground">
      <Calendar size={40} className="mx-auto mb-4 opacity-30" />
      <p className="font-medium">No events found</p>
      <p className="text-sm mt-1">Try changing your filter or adding a new event</p>
    </div>
  );

  return (
    <div className="space-y-6">
      {grouped.map(([k, evts]) => {
        const [yr, mo] = k.split("-");
        return (
          <div key={k}>
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2 px-1">
              {MONTHS[parseInt(mo) - 1]} {yr}
            </h3>
            <div className="space-y-2">
              {evts.map((e) => {
                // Find original event (with original date) for the card
                const orig = events.find((x) => x.id === e.id) ?? e;
                return <EventCard key={e.id} event={orig} onEdit={onEdit} onDelete={onDelete} />;
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

type ViewMode = "list" | "goals" | "calendar";

export default function PlannerPage() {
  const { theme, toggle } = useTheme();
  const { toast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [view, setView] = useState<ViewMode>("list");
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [filterCat, setFilterCat] = useState("all");
  const [search, setSearch] = useState("");

  const { data: events = [], isLoading } = useQuery<EventWithTasks[]>({
    queryKey: ["/api/events"],
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/events/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/events"] }); toast({ title: "Event deleted" }); },
  });

  const filtered = useMemo(() => events.filter((e) => {
    if (filterCat !== "all" && e.category !== filterCat) return false;
    if (search && !e.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [events, filterCat, search]);

  const selectedDateEvts = useMemo(() => {
    if (!selectedDate) return [];
    const k = format(selectedDate, "yyyy-MM-dd");
    return events.filter((e) => {
      const disp = e.recurring !== "none" ? nextOccurrence(e) : e.date;
      return disp === k || (e.endDate && e.date <= k && e.endDate >= k);
    });
  }, [events, selectedDate]);

  const upcomingCount = useMemo(() =>
    withNextDate(events).filter((e) => { const d = daysUntil(e.date); return d >= 0 && d <= 21; }).length,
    [events]
  );

  const navItems: { id: ViewMode; icon: React.ReactNode; label: string }[] = [
    { id: "list",     icon: <List size={14} />,       label: "All" },
    { id: "goals",    icon: <LayoutGrid size={14} />,  label: "Goals & Projects" },
    { id: "calendar", icon: <Calendar size={14} />,    label: "Calendar" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 shrink-0">
            <svg aria-label="Year Ahead" viewBox="0 0 32 32" width="28" height="28" fill="none">
              <rect x="2" y="6" width="28" height="24" rx="4" stroke="currentColor" strokeWidth="2" />
              <path d="M2 12h28" stroke="currentColor" strokeWidth="2" />
              <rect x="8" y="2" width="2" height="6" rx="1" fill="currentColor" />
              <rect x="22" y="2" width="2" height="6" rx="1" fill="currentColor" />
              <circle cx="10" cy="20" r="1.5" fill="hsl(var(--cat-birthday))" />
              <circle cx="16" cy="20" r="1.5" fill="hsl(var(--cat-goal))" />
              <circle cx="22" cy="20" r="1.5" fill="hsl(var(--cat-travel))" />
            </svg>
            <span className="font-bold text-base tracking-tight">Year Ahead</span>
            {upcomingCount > 0 && (
              <span className="bg-amber-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full leading-none">{upcomingCount}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center bg-secondary rounded-lg p-0.5">
              {navItems.map((b) => (
                <button key={b.id} onClick={() => setView(b.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors whitespace-nowrap ${view === b.id ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}>
                  {b.icon} {b.label}
                </button>
              ))}
            </div>
            <button onClick={toggle} className="p-2 rounded-lg hover:bg-secondary transition-colors" aria-label="Toggle theme">
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <Button onClick={() => { setEditingEvent(null); setModalOpen(true); }} size="sm" className="gap-1.5">
              <Plus size={15} /> Add Event
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <UpcomingAlert events={events} />

        {view === "goals" && <GoalsProjectsView events={events} onEdit={(e) => { setEditingEvent(e); setModalOpen(true); }} onDelete={(id) => deleteMut.mutate(id)} />}

        {view === "list" && (
          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
            <aside className="space-y-4">
              <MiniCalendar events={events} selectedDate={selectedDate} onSelectDate={(d) => {
                const k = format(d, "yyyy-MM-dd");
                setSelectedDate(selectedDate && format(selectedDate, "yyyy-MM-dd") === k ? null : d);
              }} />
              <div className="bg-card rounded-xl border p-4">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Filter</p>
                <div className="space-y-1">
                  <button onClick={() => setFilterCat("all")} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors ${filterCat === "all" ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}>
                    <Calendar size={13} /> All Events <span className="ml-auto text-xs opacity-70">{events.length}</span>
                  </button>
                  {CATEGORIES.map((c) => (
                    <button key={c.value} onClick={() => setFilterCat(c.value)} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors ${filterCat === c.value ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}>
                      <c.icon size={13} /> {c.label} <span className="ml-auto text-xs opacity-70">{events.filter((e) => e.category === c.value).length}</span>
                    </button>
                  ))}
                </div>
              </div>
            </aside>

            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="relative flex-1">
                  <Input placeholder="Search events..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-4" />
                  {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X size={14} /></button>}
                </div>
              </div>

              {selectedDate && (
                <div className="bg-card border rounded-xl p-4 mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold">{format(selectedDate, "EEEE, MMMM d")}</p>
                    <button onClick={() => setSelectedDate(null)} className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
                  </div>
                  {selectedDateEvts.length === 0
                    ? <p className="text-sm text-muted-foreground">No events on this day</p>
                    : <div className="space-y-2">{selectedDateEvts.map((e) => <EventCard key={e.id} event={e} onEdit={(ev) => { setEditingEvent(ev); setModalOpen(true); }} onDelete={(id) => deleteMut.mutate(id)} />)}</div>
                  }
                </div>
              )}

              {isLoading
                ? <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="bg-card border rounded-xl p-4 h-20 animate-pulse" />)}</div>
                : <ListView events={filtered} onEdit={(e) => { setEditingEvent(e); setModalOpen(true); }} onDelete={(id) => deleteMut.mutate(id)} />
              }
            </div>
          </div>
        )}

        {view === "calendar" && <CalendarView events={filtered} onEdit={(e) => { setEditingEvent(e); setModalOpen(true); }} onDelete={(id) => deleteMut.mutate(id)} />}
      </main>

      <EventFormModal open={modalOpen} onClose={() => { setModalOpen(false); setEditingEvent(null); }} editEvent={editingEvent} />
    </div>
  );
}
