import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval,
  getDay, isToday,
} from "date-fns";
import {
  ChevronLeft, ChevronRight, Plus, X, Calendar, BookOpen,
  Dumbbell, Target, RefreshCw, List, LayoutGrid, AlertTriangle,
  Pencil, Trash2, MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { MONTHS, nextOccurrence, daysUntil } from "@/lib/plannerUtils";
import EventFormModal from "@/components/modals/EventFormModal";
import type { EventWithTasks, Event, BookWithSessions, WorkoutLog, GoalWithProjects } from "@shared/schema";

type ModuleFilter = "all" | "events" | "reading" | "workouts" | "goals";

interface UnifiedItem {
  id: string;
  title: string;
  date: string;
  type: "event" | "reading" | "workout_done" | "goal";
  category?: string;
  completed?: boolean;
  recurring?: string;
  sourceId: number;
}

function useAllData() {
  const { data: events = [] } = useQuery<EventWithTasks[]>({ queryKey: ["/api/events"] });
  const { data: books = [] }  = useQuery<BookWithSessions[]>({ queryKey: ["/api/books"] });
  const { data: wLogs = [] }  = useQuery<WorkoutLog[]>({ queryKey: ["/api/workout-logs"] });
  const { data: goals = [] }  = useQuery<GoalWithTasks[]>({ queryKey: ["/api/goals"] });
  return { events, books, wLogs, goals };
}

function buildItems(
  filter: ModuleFilter,
  events: EventWithTasks[],
  books: BookWithSessions[],
  wLogs: WorkoutLog[],
  goals: GoalWithTasks[],
): UnifiedItem[] {
  const items: UnifiedItem[] = [];

  if (filter === "all" || filter === "events") {
    events.forEach((e) => {
      const date = e.recurring !== "none" ? nextOccurrence(e.date, e.recurring) : e.date;
      items.push({ id: `e:${e.id}`, title: e.title, date, type: "event", category: e.category, recurring: e.recurring, sourceId: e.id });
    });
  }

  if (filter === "all" || filter === "reading") {
    books.forEach((b) => {
      if (b.startDate) items.push({ id: `bs:${b.id}`, title: `Start: ${b.title}`, date: b.startDate, type: "reading", completed: false, sourceId: b.id });
      if (b.targetFinishDate && b.status !== "finished") items.push({ id: `bt:${b.id}`, title: `Finish: ${b.title}`, date: b.targetFinishDate, type: "reading", completed: false, sourceId: b.id });
      if (b.finishDate) items.push({ id: `bf:${b.id}`, title: `Finished: ${b.title}`, date: b.finishDate, type: "reading", completed: true, sourceId: b.id });
    });
    const allSessions = books.flatMap((b) => (b.sessions ?? []).map((s) => ({ ...s, bookTitle: b.title })));
    allSessions.forEach((s: any) => {
      items.push({ id: `rs:${s.id}`, title: `Read: ${s.bookTitle}${s.pagesRead ? ` (${s.pagesRead}p)` : ""}`, date: s.date, type: "reading", completed: s.completed, sourceId: s.id });
    });
  }

  if (filter === "all" || filter === "workouts") {
    wLogs.forEach((l) => {
      items.push({ id: `wl:${l.id}`, title: l.name, date: l.date, type: "workout_done", completed: l.completed, sourceId: l.id });
    });
  }

  if (filter === "all" || filter === "goals") {
    goals.forEach((g) => {
      if (g.targetDate) items.push({ id: `g:${g.id}`, title: g.title, date: g.targetDate, type: "goal", category: g.category, sourceId: g.id });
    });
  }

  return items;
}

function itemStyle(item: UnifiedItem): string {
  if (item.type === "event" && item.category) return `cat-${item.category}`;
  if (item.type === "reading") return "cat-reading";
  if (item.type === "workout_done") return "cat-workout";
  if (item.type === "goal") return "cat-goal";
  return "cat-other";
}

function itemIcon(type: string) {
  if (type === "reading") return <BookOpen size={9} className="shrink-0" />;
  if (type.startsWith("workout")) return <Dumbbell size={9} className="shrink-0" />;
  if (type === "goal") return <Target size={9} className="shrink-0" />;
  return <Calendar size={9} className="shrink-0" />;
}

// ── Event action row — shown in day panel + list view ──────────────────────────
function EventActionRow({
  item,
  event,
  onEdit,
  onDelete,
}: {
  item: UnifiedItem;
  event?: EventWithTasks;
  onEdit: (e: Event) => void;
  onDelete: (id: number) => void;
}) {
  const d = daysUntil(item.date);

  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border bg-card hover:shadow-sm transition-shadow ${item.completed ? "opacity-60" : ""}`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${itemStyle(item)}`}>
        {itemIcon(item.type)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className={`text-sm font-medium ${item.completed ? "line-through" : ""}`}>{item.title}</p>
          {item.recurring && item.recurring !== "none" && (
            <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground bg-secondary px-1.5 py-0.5 rounded-full">
              <RefreshCw size={9} />{item.recurring === "yearly" ? "Yearly" : item.recurring === "monthly" ? "Monthly" : "Weekly"}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {format(parseISO(item.date), "MMM d, yyyy")}
          {event?.endDate && event.endDate !== event.date && ` — ${format(parseISO(event.endDate), "MMM d, yyyy")}`}
          {" · "}<span className="capitalize">{item.type.replace("_", " ")}</span>
        </p>
        {event?.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{event.description}</p>}
      </div>

      {/* Countdown badge */}
      {d >= 0 && d <= 21 && !item.completed && (
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border shrink-0 ${d <= 3 ? "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800" : "text-muted-foreground border-border"}`}>
          {d === 0 ? "Today" : d === 1 ? "Tmr" : `${d}d`}
        </span>
      )}
      {item.completed && <span className="text-xs text-emerald-600 dark:text-emerald-400 shrink-0">Done</span>}

      {/* Edit/Delete — only for event items */}
      {item.type === "event" && event && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
              <MoreHorizontal size={14} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(event)}>
              <Pencil size={13} className="mr-2" /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => onDelete(event.id)}
            >
              <Trash2 size={13} className="mr-2" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

export default function CalendarPage() {
  const { toast } = useToast();
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [filter, setFilter] = useState<ModuleFilter>("all");
  const [viewMonth, setViewMonth] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);

  const { events, books, wLogs, goals } = useAllData();

  const items = useMemo(
    () => buildItems(filter, events, books, wLogs, goals),
    [filter, events, books, wLogs, goals]
  );

  // Quick lookup: sourceId → full Event object
  const eventById = useMemo(() => {
    const m: Record<number, EventWithTasks> = {};
    events.forEach((e) => { m[e.id] = e; });
    return m;
  }, [events]);

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/events/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      toast({ title: "Event deleted" });
    },
    onError: () => toast({ title: "Could not delete event", variant: "destructive" }),
  });

  const handleEdit = (e: Event) => {
    setEditingEvent(e);
    setEventModalOpen(true);
  };
  const handleDelete = (id: number) => deleteMut.mutate(id);
  const handleAdd = () => {
    setEditingEvent(null);
    setEventModalOpen(true);
  };

  // ── Upcoming alert ───────────────────────────────────────────────────────
  const upcoming21 = useMemo(() =>
    items.filter((i) => { const d = daysUntil(i.date); return d >= 0 && d <= 21; })
      .sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6),
    [items]
  );

  // ── Calendar grid ────────────────────────────────────────────────────────
  const days = eachDayOfInterval({ start: startOfMonth(viewMonth), end: endOfMonth(viewMonth) });
  const startPad = getDay(startOfMonth(viewMonth));

  const dayMap = useMemo(() => {
    const m: Record<string, UnifiedItem[]> = {};
    items.forEach((item) => {
      if (!m[item.date]) m[item.date] = [];
      m[item.date].push(item);
    });
    return m;
  }, [items]);

  const selectedItems = selectedDay ? (dayMap[selectedDay] ?? []) : [];

  // ── List view ────────────────────────────────────────────────────────────
  const listGrouped = useMemo(() => {
    const m: Record<string, UnifiedItem[]> = {};
    [...items].sort((a, b) => a.date.localeCompare(b.date)).forEach((i) => {
      const k = i.date.slice(0, 7);
      if (!m[k]) m[k] = [];
      m[k].push(i);
    });
    return Object.entries(m).sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  const FILTERS: { value: ModuleFilter; label: string; icon: React.ReactNode }[] = [
    { value: "all",      label: "All",      icon: <LayoutGrid size={13} /> },
    { value: "events",   label: "Events",   icon: <Calendar size={13} />   },
    { value: "reading",  label: "Reading",  icon: <BookOpen size={13} />   },
    { value: "workouts", label: "Workouts", icon: <Dumbbell size={13} />   },
    { value: "goals",    label: "Goals",    icon: <Target size={13} />     },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Calendar</h1>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-secondary rounded-lg p-0.5">
            <button onClick={() => setView("calendar")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${view === "calendar" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}>
              <LayoutGrid size={13} />Calendar
            </button>
            <button onClick={() => setView("list")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${view === "list" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}>
              <List size={13} />List
            </button>
          </div>
          <Button size="sm" onClick={handleAdd} className="gap-1.5"><Plus size={13} />Event</Button>
        </div>
      </div>

      {/* 21-day alert */}
      {upcoming21.length > 0 && (
        <div className="alert-upcoming border rounded-xl p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="text-amber-500 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold mb-1.5">Next 3 weeks</p>
              <div className="flex flex-wrap gap-1.5">
                {upcoming21.map((i) => {
                  const d = daysUntil(i.date);
                  return (
                    <span key={i.id} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${itemStyle(i)}`}>
                      {itemIcon(i.type)}{i.title}
                      <span className="opacity-70">{d === 0 ? "today" : d === 1 ? "tmr" : `${d}d`}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Module filters */}
      <div className="flex gap-1.5 flex-wrap">
        {FILTERS.map((f) => (
          <button key={f.value} onClick={() => setFilter(f.value)}
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${filter === f.value ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-secondary"}`}>
            {f.icon}{f.label}
          </button>
        ))}
      </div>

      {/* ── Calendar view ── */}
      {view === "calendar" && (
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
                const dayItems = dayMap[key] ?? [];
                const isSel = selectedDay === key;
                const col = (startPad + idx) % 7;
                return (
                  <div key={key} onClick={() => setSelectedDay((p) => p === key ? null : key)}
                    className={["min-h-[80px] border-b p-1.5 cursor-pointer transition-colors", col < 6 ? "border-r" : "", isSel ? "bg-primary/5" : "hover:bg-secondary/50"].join(" ")}>
                    <span className={["text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full mb-1", isToday(day) ? "bg-primary text-primary-foreground font-bold" : ""].join(" ")}>
                      {day.getDate()}
                    </span>
                    <div className="space-y-0.5">
                      {dayItems.slice(0, 3).map((item) => (
                        <div key={item.id} className={`text-xs px-1.5 py-0.5 rounded truncate border flex items-center gap-1 ${itemStyle(item)} ${item.completed ? "opacity-50 line-through" : ""}`}>
                          {item.recurring && item.recurring !== "none" && <RefreshCw size={7} className="shrink-0 opacity-60" />}
                          <span className="truncate">{item.title}</span>
                        </div>
                      ))}
                      {dayItems.length > 3 && <div className="text-xs text-muted-foreground px-1">+{dayItems.length - 3}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Selected day detail panel */}
          {selectedDay && (
            <div className="bg-card rounded-xl border p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="font-semibold">{format(parseISO(selectedDay), "EEEE, MMMM d, yyyy")}</p>
                <button onClick={() => setSelectedDay(null)} className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
              </div>
              {selectedItems.length === 0
                ? <p className="text-sm text-muted-foreground">Nothing scheduled on this day</p>
                : (
                  <div className="space-y-2">
                    {selectedItems.map((item) => (
                      <EventActionRow
                        key={item.id}
                        item={item}
                        event={item.type === "event" ? eventById[item.sourceId] : undefined}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                      />
                    ))}
                  </div>
                )
              }
            </div>
          )}
        </div>
      )}

      {/* ── List view ── */}
      {view === "list" && (
        <div className="space-y-6">
          {listGrouped.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Calendar size={40} className="mx-auto mb-4 opacity-20" />
              <p className="font-medium">Nothing scheduled</p>
            </div>
          ) : listGrouped.map(([month, monthItems]) => {
            const [yr, mo] = month.split("-");
            return (
              <div key={month}>
                <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2 px-1">
                  {MONTHS[parseInt(mo) - 1]} {yr}
                </h3>
                <div className="space-y-2">
                  {monthItems.map((item) => (
                    <EventActionRow
                      key={item.id}
                      item={item}
                      event={item.type === "event" ? eventById[item.sourceId] : undefined}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <EventFormModal
        open={eventModalOpen}
        onClose={() => { setEventModalOpen(false); setEditingEvent(null); }}
        editEvent={editingEvent}
      />
    </div>
  );
}
