import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval,
  getDay, isToday, addDays,
} from "date-fns";
import {
  ChevronLeft, ChevronRight, Plus, X, Calendar, BookOpen,
  Dumbbell, Target, RefreshCw, List, LayoutGrid, AlertTriangle,
  Pencil, Trash2, MoreHorizontal, Link2, Link2Off, Loader2, Check, Plane,
  ClipboardList,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { MONTHS, nextOccurrence, daysUntil, todayStr } from "@/lib/plannerUtils";
import EventFormModal from "@/components/modals/EventFormModal";
import type { EventWithTasks, Event, BookWithSessions, WorkoutLog, GoalWithProjects, Trip, GeneralTask, WorkoutPlan } from "@shared/schema";

type ModuleFilter = "all" | "events" | "gcal" | "reading" | "workouts" | "goals" | "trips";

interface UnifiedItem {
  id: string;
  title: string;
  date: string;
  type: "event" | "gcal" | "reading" | "workout_done" | "workout_planned" | "goal" | "trip";
  time?: string | null;
  category?: string;
  completed?: boolean;
  recurring?: string;
  sourceId: number;
  gcalEventId?: string;
  // trip-specific
  tripDay?: number;
  tripTotalDays?: number;
  tripDestination?: string;
  tripEndDate?: string;
}

// ── Planned workout helpers ───────────────────────────────────────────────────
const DAY_OFFSETS: Record<string, number> = {
  monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4, saturday: 5, sunday: 6,
};

function isRestLabel(label: string): boolean {
  const l = label.toLowerCase();
  return l.includes("rest") || l.includes("cross-train") || l.includes("cross train") || l === "off";
}

function parsePlanSched(json: string): { isV2: boolean; isWizard: boolean; weeks: any[]; flatDays: any[]; wizardWeeks: Record<string, any[]> } {
  const empty = { isV2: false, isWizard: false, weeks: [], flatDays: [], wizardWeeks: {} };
  try {
    const raw = JSON.parse(json);
    // General Fitness Wizard format: { plan: { weeks: { A: [...], B: [...] } } }
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const wizardPlan = raw.plan ?? raw;
      if (wizardPlan?.weeks && typeof wizardPlan.weeks === "object" && !Array.isArray(wizardPlan.weeks)) {
        return { isV2: false, isWizard: true, weeks: [], flatDays: [], wizardWeeks: wizardPlan.weeks };
      }
      return empty;
    }
    if (!Array.isArray(raw) || raw.length === 0) return { ...empty, isV2: true };
    if ("week" in raw[0]) return { isV2: true, isWizard: false, weeks: raw, flatDays: [], wizardWeeks: {} };
    return { isV2: false, isWizard: false, weeks: [], flatDays: raw, wizardWeeks: {} };
  } catch { return empty; }
}

function buildPlannedItems(plans: WorkoutPlan[]): UnifiedItem[] {
  const items: UnifiedItem[] = [];
  plans.forEach(plan => {
    if (!plan.isActive || !plan.startDate) return;
    const start = parseISO(plan.startDate);
    // Anchor week 1 to the Monday of the week containing startDate
    const dow = start.getDay(); // 0=Sun
    const week1Mon = addDays(start, dow === 0 ? -6 : 1 - dow);
    const sched = parsePlanSched(plan.scheduleJson ?? "[]");

    if (sched.isWizard) {
      // A/B alternating microcycle — durationWeeks=2 is just the cycle length, plan repeats indefinitely.
      // Generate items out to 90 days from today so the full calendar shows upcoming sessions.
      const weekKeys = Object.keys(sched.wizardWeeks); // e.g. ["A", "B"]
      if (weekKeys.length === 0) return;
      const horizon = format(addDays(new Date(), 90), "yyyy-MM-dd");
      let w = 1;
      while (true) {
        const weekMon = addDays(week1Mon, (w - 1) * 7);
        if (format(weekMon, "yyyy-MM-dd") > horizon) break;
        const weekKey = weekKeys[(w - 1) % weekKeys.length];
        const sessions: any[] = sched.wizardWeeks[weekKey] ?? [];
        sessions.forEach((s: any) => {
          const dayOfWeek: string = (s.day ?? "").toLowerCase();
          if (!dayOfWeek || !(dayOfWeek in DAY_OFFSETS)) return;
          const label = s.name ?? [s.session_type, s.marker].filter(Boolean).join(" · ") ?? plan.name;
          if (isRestLabel(label)) return;
          const date = format(addDays(weekMon, DAY_OFFSETS[dayOfWeek]), "yyyy-MM-dd");
          items.push({ id: `wp:${plan.id}:${w}:${dayOfWeek}`, title: label, date, type: "workout_planned", completed: false, sourceId: plan.id });
        });
        w++;
      }
    } else if (sched.isV2) {
      sched.weeks.forEach((wk: any) => {
        const weekMon = addDays(week1Mon, (wk.week - 1) * 7);
        (wk.days ?? []).forEach((entry: any) => {
          const label: string = entry.label ?? "";
          if (!entry.dayOfWeek || isRestLabel(label)) return;
          const date = format(addDays(weekMon, DAY_OFFSETS[entry.dayOfWeek] ?? 0), "yyyy-MM-dd");
          items.push({ id: `wp:${plan.id}:${wk.week}:${entry.dayOfWeek}`, title: label || plan.name, date, type: "workout_planned", completed: false, sourceId: plan.id });
        });
      });
    } else {
      // Flat format: repeat every week for durationWeeks
      for (let w = 1; w <= plan.durationWeeks; w++) {
        const weekMon = addDays(week1Mon, (w - 1) * 7);
        sched.flatDays.forEach((entry: any) => {
          if (!entry.dayOfWeek) return;
          const label: string = entry.label ?? entry.templateName ?? plan.name;
          if (isRestLabel(label)) return;
          const date = format(addDays(weekMon, DAY_OFFSETS[entry.dayOfWeek] ?? 0), "yyyy-MM-dd");
          items.push({ id: `wp:${plan.id}:${w}:${entry.dayOfWeek}`, title: label, date, type: "workout_planned", completed: false, sourceId: plan.id });
        });
      }
    }
  });
  return items;
}

function useAllData() {
  const { data: events = [] } = useQuery<EventWithTasks[]>({ queryKey: ["/api/events"] });
  const { data: books = [] }  = useQuery<BookWithSessions[]>({ queryKey: ["/api/books"] });
  const { data: wLogs = [] }  = useQuery<WorkoutLog[]>({ queryKey: ["/api/workout-logs"] });
  const { data: goals = [] }  = useQuery<GoalWithTasks[]>({ queryKey: ["/api/goals"] });
  const { data: trips = [] }  = useQuery<Trip[]>({
    queryKey: ["/api/trips"],
    queryFn: () => apiRequest("GET", "/api/trips").then(r => r.json()),
  });
  const { data: wPlans = [] } = useQuery<WorkoutPlan[]>({
    queryKey: ["/api/workout-plans"],
    queryFn: () => apiRequest("GET", "/api/workout-plans").then(r => r.json()),
  });
  return { events, books, wLogs, goals, trips, wPlans };
}

function buildItems(
  filter: ModuleFilter,
  events: EventWithTasks[],
  books: BookWithSessions[],
  wLogs: WorkoutLog[],
  goals: GoalWithTasks[],
  trips: Trip[],
  wPlans: WorkoutPlan[],
  listView = false,
): UnifiedItem[] {
  const items: UnifiedItem[] = [];

  if (filter === "all" || filter === "events") {
    events.filter(e => e.category !== "gcal").forEach((e) => {
      const date = e.recurring !== "none" ? nextOccurrence(e.date, e.recurring) : e.date;
      items.push({ id: `e:${e.id}`, title: e.title, date, type: "event", category: e.category, recurring: e.recurring, sourceId: e.id, time: (e as any).time ?? null });
    });
  }

  if (filter === "all" || filter === "gcal") {
    events.filter(e => e.category === "gcal").forEach((e) => {
      items.push({ id: `gc:${e.id}`, title: e.title, date: e.date, type: "gcal", sourceId: e.id, gcalEventId: (e as any).gcalEventId });
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
    // Build set of dates already covered by completed logs so we can dim planned items
    const loggedDates = new Set(wLogs.map(l => l.date));
    buildPlannedItems(wPlans).forEach(item => {
      // Only show planned item if no workout was already logged that day
      if (!loggedDates.has(item.date)) items.push(item);
    });
  }

  if (filter === "all" || filter === "goals") {
    goals.forEach((g) => {
      if (g.targetDate) items.push({ id: `g:${g.id}`, title: g.title, date: g.targetDate, type: "goal", category: g.category, sourceId: g.id });
    });
  }

  if (filter === "all" || filter === "trips") {
    trips.forEach((trip) => {
      if (!trip.startDate) return;
      const start = parseISO(trip.startDate);
      const end   = trip.endDate ? parseISO(trip.endDate) : start;
      const totalDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
      // In list view show only day 1; in calendar view show each day so the trip spans the grid
      const daysToShow = listView ? 1 : totalDays;
      for (let i = 0; i < daysToShow; i++) {
        const d = addDays(start, i);
        items.push({
          id: `trip:${trip.id}:${i}`,
          title: trip.name,
          date: format(d, "yyyy-MM-dd"),
          type: "trip",
          sourceId: trip.id,
          tripDay: i + 1,
          tripTotalDays: totalDays,
          tripDestination: trip.destination ?? undefined,
          tripEndDate: trip.endDate ?? undefined,
        });
      }
    });
  }

  return items;
}

function itemStyle(item: UnifiedItem): string {
  if (item.type === "gcal") return "cat-gcal";
  if (item.type === "trip") return "cat-trip";
  if (item.type === "event" && item.category) return `cat-${item.category}`;
  if (item.type === "reading") return "cat-reading";
  if (item.type === "workout_done") return "cat-workout";
  if (item.type === "workout_planned") return "cat-workout opacity-60";
  if (item.type === "goal") return "cat-goal";
  return "cat-other";
}

function itemIcon(type: string) {
  if (type === "gcal") return <Calendar size={9} className="shrink-0" />;
  if (type === "trip") return <Plane size={9} className="shrink-0" />;
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
          <p className={`text-sm font-medium ${item.completed ? "line-through" : ""}`}>
            {item.time && <span className="text-xs text-violet-500 font-semibold mr-1.5">{item.time}</span>}
            {item.title}
          </p>
          {item.type === "trip" && item.tripTotalDays && item.tripTotalDays > 1 && (
            <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground bg-secondary px-1.5 py-0.5 rounded-full">
              {item.tripTotalDays} days
            </span>
          )}
          {item.recurring && item.recurring !== "none" && (
            <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground bg-secondary px-1.5 py-0.5 rounded-full">
              <RefreshCw size={9} />{item.recurring === "yearly" ? "Yearly" : item.recurring === "monthly" ? "Monthly" : "Weekly"}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {item.type === "trip"
            ? <>
                {item.tripDestination && <span>{item.tripDestination} · </span>}
                {format(parseISO(item.date), "MMM d")}
                {item.tripEndDate && item.tripEndDate !== item.date && ` — ${format(parseISO(item.tripEndDate), "MMM d, yyyy")}`}
                {!item.tripEndDate && format(parseISO(item.date), ", yyyy")}
              </>
            : <>
                {format(parseISO(item.date), "MMM d, yyyy")}
                {event?.endDate && event.endDate !== event.date && ` — ${format(parseISO(event.endDate), "MMM d, yyyy")}`}
                {" · "}<span className="capitalize">{item.type.replace("_", " ")}</span>
              </>
          }
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

      {/* Google Calendar badge */}
      {item.type === "gcal" && (
        <span className="text-xs font-medium text-blue-600 dark:text-blue-400 shrink-0 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-1.5 py-0.5 rounded-full">
          GCal
        </span>
      )}

      {/* Edit/Delete — only for non-gcal event items */}
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

  const { events, books, wLogs, goals, trips, wPlans } = useAllData();

  // ── General tasks (for "Unscheduled Today" panel) ────────────────────────────
  const { data: generalTasks = [] } = useQuery<GeneralTask[]>({
    queryKey: ["/api/general-tasks"],
    queryFn: () => apiRequest("GET", "/api/general-tasks").then(r => r.json()),
  });
  const today = todayStr();
  const unscheduledToday = generalTasks.filter(t => !t.completed && t.dueDate === today);

  // ── 21-day alert dismiss ─────────────────────────────────────────────────────
  const [alertDismissed, setAlertDismissed] = useState<boolean>(() => {
    try {
      const until = localStorage.getItem("cal_21day_dismissed_until");
      if (until && Date.now() < parseInt(until)) return true;
    } catch {}
    return false;
  });
  const dismiss21Alert = () => {
    try { localStorage.setItem("cal_21day_dismissed_until", String(Date.now() + 30 * 24 * 60 * 60 * 1000)); } catch {}
    setAlertDismissed(true);
  };

  // ── Task due-date dots ───────────────────────────────────────────────────────
  const tasksByDate = useMemo(() => {
    const m: Record<string, GeneralTask[]> = {};
    generalTasks.filter(t => !t.completed && t.dueDate).forEach(t => {
      if (!m[t.dueDate!]) m[t.dueDate!] = [];
      m[t.dueDate!].push(t);
    });
    return m;
  }, [generalTasks]);

  // ── Google Calendar ──────────────────────────────────────────────────────────
  const { data: gcalStatus, refetch: refetchGcalStatus } = useQuery<{ connected: boolean; lastSync: string | null; callbackUrl?: string }>({
    queryKey: ["/api/gcal/status"],
    queryFn: () => apiRequest("GET", "/api/gcal/status").then(r => r.json()),
  });

  const syncMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/gcal/sync"),
    onSuccess: async (r) => {
      const d = await r.json();
      toast({ title: `Synced ${d.synced} event${d.synced !== 1 ? "s" : ""} from Google Calendar` });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      refetchGcalStatus();
    },
    onError: () => toast({ title: "Sync failed", variant: "destructive" }),
  });

  const disconnectMut = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/gcal/disconnect"),
    onSuccess: () => {
      toast({ title: "Google Calendar disconnected" });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      refetchGcalStatus();
    },
    onError: () => toast({ title: "Failed to disconnect", variant: "destructive" }),
  });

  // Handle ?gcal= redirect from OAuth callback
  // Redirect lands as /?gcal=connected#/calendar so params are in window.location.search
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gcal = params.get("gcal");
    if (gcal === "connected") {
      toast({ title: "Google Calendar connected!", description: "Click Sync to import your events." });
      refetchGcalStatus();
      // Clean up the query param without disrupting the hash route
      window.history.replaceState({}, "", `/${window.location.hash}`);
    } else if (gcal === "error") {
      toast({ title: "Google Calendar connection failed", description: "Please check that the callback URL is registered in Google Cloud Console and try again.", variant: "destructive" });
      window.history.replaceState({}, "", `/${window.location.hash}`);
    }
  }, []);

  // Calendar view: trips span every day; list view: trips appear once on start date
  const items = useMemo(
    () => buildItems(filter, events, books, wLogs, goals, trips, wPlans, false),
    [filter, events, books, wLogs, goals, trips, wPlans]
  );
  const listItems = useMemo(
    () => buildItems(filter, events, books, wLogs, goals, trips, wPlans, true),
    [filter, events, books, wLogs, goals, trips, wPlans]
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

  // ── Upcoming alert — use listItems so trips appear once ─────────────────
  const upcoming21 = useMemo(() =>
    listItems.filter((i) => { const d = daysUntil(i.date); return d >= 0 && d <= 21; })
      .sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6),
    [listItems]
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
    [...listItems].sort((a, b) => a.date.localeCompare(b.date)).forEach((i) => {
      const k = i.date.slice(0, 7);
      if (!m[k]) m[k] = [];
      m[k].push(i);
    });
    return Object.entries(m).sort(([a], [b]) => a.localeCompare(b));
  }, [listItems]);

  const FILTERS: { value: ModuleFilter; label: string; icon: React.ReactNode; hidden?: boolean }[] = [
    { value: "all",      label: "All",            icon: <LayoutGrid size={13} /> },
    { value: "events",   label: "Events",         icon: <Calendar size={13} />   },
    { value: "gcal",     label: "Google Calendar",icon: <Calendar size={13} />, hidden: !gcalStatus?.connected },
    { value: "trips",    label: "Trips",          icon: <Plane size={13} />, hidden: trips.length === 0 },
    { value: "reading",  label: "Reading",        icon: <BookOpen size={13} />   },
    { value: "workouts", label: "Workouts",       icon: <Dumbbell size={13} />   },
    { value: "goals",    label: "Goals",          icon: <Target size={13} />     },
  ];

  return (
    <div className="p-3 sm:p-6 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Calendar</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-secondary rounded-lg p-0.5 border border-border/50">
            <button onClick={() => setView("calendar")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors font-medium ${view === "calendar" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-background/50"}`}>
              <LayoutGrid size={13} />Grid
            </button>
            <button onClick={() => setView("list")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors font-medium ${view === "list" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-background/50"}`}>
              <List size={13} />List
            </button>
          </div>
          <Button size="sm" onClick={handleAdd} className="gap-1.5"><Plus size={13} />Event</Button>
        </div>
      </div>
      {/* Google Calendar connection banner */}
      {gcalStatus && !gcalStatus.connected && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-full bg-white dark:bg-blue-950 border border-blue-200 dark:border-blue-700 flex items-center justify-center shrink-0">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
                <rect x="3" y="4" width="18" height="18" rx="2" stroke="#4285F4" strokeWidth="1.5"/>
                <path d="M3 9h18" stroke="#4285F4" strokeWidth="1.5"/>
                <rect x="8" y="2" width="1.5" height="5" rx=".75" fill="#4285F4"/>
                <rect x="14.5" y="2" width="1.5" height="5" rx=".75" fill="#4285F4"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100">Connect Google Calendar</p>
              <p className="text-xs text-blue-700 dark:text-blue-300">Sync your Google Calendar events directly into this view</p>
            </div>
          </div>
          <Button size="sm" variant="outline" className="shrink-0 border-blue-300 text-blue-700 hover:bg-blue-100 dark:text-blue-300 dark:border-blue-700 gap-1.5"
            onClick={() => { window.location.href = "/api/gcal/connect"; }}>
            <Link2 size={13} /> Connect
          </Button>
        </div>
      )}

      {/* Google Calendar sync bar (when connected) */}
      {gcalStatus?.connected && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20">
          <div className="flex items-center gap-2">
            <Check size={14} className="text-green-600 dark:text-green-400 shrink-0" />
            <span className="text-sm font-medium text-green-800 dark:text-green-200">Google Calendar connected</span>
            {gcalStatus.lastSync && (
              <span className="text-xs text-green-700 dark:text-green-400 hidden sm:block">
                · Last synced {format(parseISO(gcalStatus.lastSync), "MMM d 'at' h:mm a")}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-green-300 text-green-700 hover:bg-green-100 dark:text-green-300 dark:border-green-700"
              onClick={() => syncMut.mutate()} disabled={syncMut.isPending}>
              {syncMut.isPending ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
              Sync
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-muted-foreground hover:text-destructive"
              onClick={() => disconnectMut.mutate()} disabled={disconnectMut.isPending}>
              <Link2Off size={11} /> Disconnect
            </Button>
          </div>
        </div>
      )}

      {/* ── Unscheduled Today panel ── */}
      {unscheduledToday.length > 0 && (
        <div className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/20 p-3">
          <div className="flex items-center gap-2 mb-2">
            <ClipboardList size={14} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
            <p className="text-sm font-semibold text-indigo-900 dark:text-indigo-100">
              Unscheduled Today
            </p>
            <span className="text-xs text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-900/40 px-1.5 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-700 ml-auto">
              {unscheduledToday.length} task{unscheduledToday.length !== 1 ? "s" : ""} due
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {unscheduledToday.map(t => (
              <span key={t.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-200 text-xs border border-indigo-200 dark:border-indigo-700">
                {t.title}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 21-day alert */}
      {!alertDismissed && upcoming21.length > 0 && (
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
            <button
              onClick={dismiss21Alert}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground shrink-0 mt-0.5 px-2 py-1 rounded-lg hover:bg-secondary transition-colors"
              title="Dismiss for 30 days"
            >
              <X size={12} /><span className="hidden sm:inline">Dismiss</span>
            </button>
          </div>
        </div>
      )}

      {/* Module filters */}
      <div className="flex gap-1.5 flex-wrap">
        {FILTERS.filter(f => !f.hidden).map((f) => (
          <button key={f.value} onClick={() => setFilter(f.value)}
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
              filter === f.value
                ? f.value === "gcal"
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-primary text-primary-foreground border-primary"
                : "border-border hover:bg-secondary"
            }`}>
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
              {Array(startPad).fill(null).map((_, i) => <div key={`p${i}`} className="min-h-[56px] sm:min-h-[80px] border-b border-r bg-secondary/20" />)}
              {days.map((day, idx) => {
                const key = format(day, "yyyy-MM-dd");
                const dayItems = dayMap[key] ?? [];
                const isSel = selectedDay === key;
                const col = (startPad + idx) % 7;
                return (
                  <div key={key} onClick={() => setSelectedDay((p) => p === key ? null : key)}
                    className={["min-h-[56px] sm:min-h-[80px] border-b p-1.5 cursor-pointer transition-colors", col < 6 ? "border-r" : "", isSel ? "bg-primary/5" : "hover:bg-secondary/50"].join(" ")}>
                    <span className={["text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full mb-1", isToday(day) ? "bg-primary text-primary-foreground font-bold" : ""].join(" ")}>
                      {day.getDate()}
                    </span>
                    <div className="space-y-0.5">
                      {dayItems.slice(0, 3).map((item) => (
                        <div key={item.id} className={`text-xs px-1.5 py-0.5 rounded truncate border flex items-center gap-1 ${itemStyle(item)} ${item.completed ? "opacity-50 line-through" : ""}`}>
                          {item.recurring && item.recurring !== "none" && <RefreshCw size={7} className="shrink-0 opacity-60" />}
                          <span className="truncate">{item.time ? `${item.time} ` : ""}{item.title}</span>
                        </div>
                      ))}
                      {dayItems.length > 3 && <div className="text-xs text-muted-foreground px-1">+{dayItems.length - 3}</div>}
                      {/* Task due-date dots */}
                      {(tasksByDate[key] ?? []).length > 0 && (
                        <div className="flex items-center gap-0.5 pt-0.5 px-0.5">
                          {(tasksByDate[key] ?? []).slice(0, 5).map(t => (
                            <div key={t.id} title={t.title} className="w-1.5 h-1.5 rounded-full bg-indigo-400 dark:bg-indigo-500 shrink-0" />
                          ))}
                          {(tasksByDate[key] ?? []).length > 5 && (
                            <span className="text-[9px] text-muted-foreground leading-none">+{(tasksByDate[key] ?? []).length - 5}</span>
                          )}
                        </div>
                      )}
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
              {selectedItems.length === 0 && (tasksByDate[selectedDay] ?? []).length === 0
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
                    {/* Tasks due on this day */}
                    {(tasksByDate[selectedDay] ?? []).length > 0 && (
                      <div className={selectedItems.length > 0 ? "mt-3 pt-3 border-t" : ""}>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">Tasks Due</p>
                        <div className="space-y-1.5">
                          {(tasksByDate[selectedDay] ?? []).map(t => (
                            <div key={t.id} className="flex items-center gap-2.5 px-3 py-2 rounded-xl border bg-card">
                              <div className="w-2 h-2 rounded-full bg-indigo-400 dark:bg-indigo-500 shrink-0" />
                              <p className="text-sm flex-1">{t.title}</p>
                              <a href="#/tasks" className="text-xs text-muted-foreground hover:text-foreground">Tasks →</a>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
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
