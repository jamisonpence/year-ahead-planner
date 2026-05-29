import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import {
  Calendar, BookOpen, Dumbbell, Target, Plus, Flame,
  CheckCircle2, AlertTriangle, ChevronRight,
  BookMarked, Zap, Home, RefreshCw, MapPin, Quote as QuoteIcon,
  CreditCard, TrendingUp, Heart, Settings2, X,
  Sparkles, Clock, Star, Coffee, Sun, Sunset, Check, BookCopy,
  Film, Music, ChefHat, MessageCircle, Send, Users, Apple,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type {
  EventWithTasks, BookWithSessions, WorkoutLog, WorkoutTemplate,
  GoalWithProjects, Chore, Spot, Quote, Subscription, NutritionGoal, WorkoutPlan, ReadingGoal,
} from "@shared/schema";
import {
  daysUntil, nextOccurrence, thisWeekDates, todayStr,
  bookProgress, readingStreak, monthlyReadingStats, workoutStreak,
  weeklyWorkoutStats, getRecentPRs,
} from "@/lib/plannerUtils";
import EventFormModal from "@/components/modals/EventFormModal";
import BookFormModal from "@/components/modals/BookFormModal";
import ReadingSessionModal from "@/components/modals/ReadingSessionModal";
import WorkoutLogModal from "@/components/modals/WorkoutLogModal";
import { useAuth } from "@/hooks/useAuth";

// ── Section config ─────────────────────────────────────────────────────────────

type SectionId = "today" | "up_next" | "needs_attention" | "progress" | "social_feed" | "events" | "recent_activity" | "quick_jump" | "day_planner";

const SECTION_LABELS: Record<SectionId, string> = {
  today:            "Today",
  up_next:          "Up Next",
  needs_attention:  "Needs Attention",
  progress:         "Progress",
  social_feed:      "Friends' Activity",
  events:           "Upcoming Events",
  recent_activity:  "Recent Activity",
  quick_jump:       "Quick Jump",
  day_planner:      "AI Day Planner",
};

const SECTION_ORDER: SectionId[] = ["today", "up_next", "needs_attention", "progress", "social_feed", "events", "recent_activity", "quick_jump", "day_planner"];

const ALL_ON: Record<SectionId, boolean> = {
  today: true, up_next: true, needs_attention: true, progress: true,
  social_feed: true, events: true, recent_activity: true, quick_jump: true, day_planner: false,
};

function loadVisibility(): Record<SectionId, boolean> {
  try {
    const raw = localStorage.getItem("dashboard_sections_v2");
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...ALL_ON, ...parsed };
    }
  } catch {}
  return { ...ALL_ON };
}

function saveVisibility(v: Record<SectionId, boolean>) {
  try { localStorage.setItem("dashboard_sections_v2", JSON.stringify(v)); } catch {}
}

// ── AI Day Planner Component ───────────────────────────────────────────────────

type DayItem = { title: string; type: string; duration: string; priority: string; goalLink: string | null; notes: string | null };
type DayBlock = { id: string; label: string; timeRange: string; theme: string; items: DayItem[] };
type DayPlan  = { greeting: string; highlights: string; blocks: DayBlock[]; tips: string[] };

const BLOCK_ICONS: Record<string, React.ReactNode> = {
  morning:   <Coffee size={13} />,
  midday:    <Sun size={13} />,
  afternoon: <Zap size={13} />,
  evening:   <Sunset size={13} />,
};
const BLOCK_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  morning:   { bg: "bg-amber-50 dark:bg-amber-950/20",   border: "border-amber-200 dark:border-amber-800",   text: "text-amber-700 dark:text-amber-300" },
  midday:    { bg: "bg-blue-50 dark:bg-blue-950/20",     border: "border-blue-200 dark:border-blue-800",     text: "text-blue-700 dark:text-blue-300" },
  afternoon: { bg: "bg-violet-50 dark:bg-violet-950/20", border: "border-violet-200 dark:border-violet-800", text: "text-violet-700 dark:text-violet-300" },
  evening:   { bg: "bg-emerald-50 dark:bg-emerald-950/20", border: "border-emerald-200 dark:border-emerald-800", text: "text-emerald-700 dark:text-emerald-300" },
};
const PRIORITY_DOT: Record<string, string> = { high: "bg-red-500", medium: "bg-amber-400", low: "bg-gray-300 dark:bg-gray-600" };
const TYPE_BADGE: Record<string, string> = {
  task:     "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  event:    "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  goal:     "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  habit:    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  planning: "bg-secondary text-muted-foreground",
};

function AIDayPlanner() {
  const { toast } = useToast();
  const [plan, setPlan] = useState<DayPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  async function generate() {
    setLoading(true); setError(null); setChecked(new Set());
    try {
      const res = await apiRequest("POST", "/api/ai/day-planner", {});
      if (!res.ok) {
        const err = await res.json();
        setError(err.error === "no_api_key"
          ? "Add your Anthropic API key in Settings → API Keys to use AI features."
          : (err.message ?? "Failed to generate. Try again."));
        return;
      }
      setPlan(await res.json());
    } catch { setError("Something went wrong. Please try again."); }
    finally { setLoading(false); }
  }

  function toggle(blockId: string, idx: number) {
    const key = `${blockId}-${idx}`;
    setChecked(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  const totalItems = plan?.blocks.reduce((s, b) => s + b.items.length, 0) ?? 0;
  const doneCount  = checked.size;

  return (
    <div className="bg-card border rounded-xl p-4">
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles size={15} className="text-amber-500" />
          <span className="text-sm font-semibold">AI Day Planner</span>
        </div>
        <div className="flex items-center gap-2">
          {plan && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mr-1">
              <span>{doneCount}/{totalItems}</span>
              <div className="w-16 h-1.5 bg-secondary rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${totalItems ? (doneCount/totalItems)*100 : 0}%` }} />
              </div>
            </div>
          )}
          <Button size="sm" variant={plan ? "outline" : "default"} onClick={generate} disabled={loading} className="gap-1.5 h-7 text-xs px-2.5">
            {loading ? <><RefreshCw size={11} className="animate-spin" /> Generating…</> : plan ? <><RefreshCw size={11} /> Regenerate</> : <><Sparkles size={11} /> Generate My Day</>}
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2 mb-3">{error}</p>}

      {/* Empty state */}
      {!plan && !loading && !error && (
        <div className="text-center py-6 text-muted-foreground">
          <Sparkles size={28} className="mx-auto mb-2 opacity-20" />
          <p className="text-xs">Get a personalized schedule built from your goals, tasks, and calendar.</p>
          <p className="text-[11px] mt-1 opacity-60">Requires Anthropic API key in Settings.</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-center py-6 text-muted-foreground">
          <Sparkles size={28} className="mx-auto mb-2 text-amber-400 animate-pulse" />
          <p className="text-xs animate-pulse">Building your day plan…</p>
        </div>
      )}

      {/* Plan */}
      {plan && !loading && (
        <div className="space-y-3">
          <p className="text-sm font-medium">{plan.greeting}</p>
          <p className="text-xs text-muted-foreground -mt-1">{plan.highlights}</p>

          {plan.blocks.filter(b => b.items.length > 0).map(block => {
            const col = BLOCK_COLORS[block.id] ?? BLOCK_COLORS.morning;
            const icon = BLOCK_ICONS[block.id] ?? <Zap size={13} />;
            return (
              <div key={block.id} className={`rounded-lg border p-3 ${col.bg} ${col.border}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className={`flex items-center gap-1.5 text-xs font-semibold ${col.text}`}>
                    {icon}{block.label}
                    <span className="font-normal text-muted-foreground ml-1">{block.timeRange}</span>
                  </span>
                  <span className="text-[11px] text-muted-foreground italic">{block.theme}</span>
                </div>
                <div className="space-y-1.5">
                  {block.items.map((item, idx) => {
                    const key = `${block.id}-${idx}`;
                    const done = checked.has(key);
                    return (
                      <div key={idx} onClick={() => toggle(block.id, idx)}
                        className={`flex items-start gap-2 p-2 rounded-lg bg-background/60 cursor-pointer hover:bg-background/90 transition-colors ${done ? "opacity-50" : ""}`}>
                        <div className={`mt-0.5 w-3.5 h-3.5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${done ? "bg-primary border-primary" : "border-muted-foreground/40"}`}>
                          {done && <Check size={8} className="text-primary-foreground" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`text-xs font-medium ${done ? "line-through text-muted-foreground" : ""}`}>{item.title}</span>
                            <span className={`text-[10px] px-1 py-0.5 rounded ${TYPE_BADGE[item.type] ?? TYPE_BADGE.task}`}>{item.type}</span>
                            {item.goalLink && <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Star size={8}/>{item.goalLink}</span>}
                          </div>
                          {item.notes && !done && <p className="text-[11px] text-muted-foreground mt-0.5">{item.notes}</p>}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <div className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[item.priority] ?? PRIORITY_DOT.medium}`} />
                          <span className="text-[11px] text-muted-foreground whitespace-nowrap flex items-center gap-0.5"><Clock size={9}/>{item.duration}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {plan.tips?.length > 0 && (
            <div className="pt-1 border-t">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1"><BookCopy size={10}/>Tips</p>
              {plan.tips.map((tip, i) => (
                <p key={i} className="text-xs text-muted-foreground flex items-start gap-1.5 mb-0.5"><span className="text-primary shrink-0">•</span>{tip}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [addEvent, setAddEvent] = useState(false);
  const [addBook, setAddBook] = useState(false);
  const [addSession, setAddSession] = useState(false);
  const [addWorkout, setAddWorkout] = useState(false);
  const [quoteIdx, setQuoteIdx] = useState(() => Math.floor(Math.random() * 1000));
  const [customizing, setCustomizing] = useState(false);
  const [visible, setVisible] = useState<Record<SectionId, boolean>>(loadVisibility);
  const customRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!customizing) return;
    function handle(e: MouseEvent) {
      if (customRef.current && !customRef.current.contains(e.target as Node)) setCustomizing(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [customizing]);

  function toggleSection(id: SectionId) {
    setVisible(prev => { const next = { ...prev, [id]: !prev[id] }; saveVisibility(next); return next; });
  }

  const { user: authUser } = useAuth();

  // ── Data queries (all existing, plus habits/tasks) ─────────────────────────
  const { data: events = [] }           = useQuery<EventWithTasks[]>({ queryKey: ["/api/events"] });
  const { data: books = [] }            = useQuery<BookWithSessions[]>({ queryKey: ["/api/books"] });
  const { data: wLogs = [] }            = useQuery<WorkoutLog[]>({ queryKey: ["/api/workout-logs"] });
  const { data: wTemplates = [] }       = useQuery<WorkoutTemplate[]>({ queryKey: ["/api/workout-templates"] });
  const { data: goals = [] }            = useQuery<GoalWithProjects[]>({ queryKey: ["/api/goals"] });
  const { data: chores = [] }           = useQuery<Chore[]>({ queryKey: ["/api/chores"] });
  const { data: nutritionGoal }         = useQuery<NutritionGoal | null>({ queryKey: ["/api/nutrition/goals"] });
  const { data: workoutPlans = [] }     = useQuery<WorkoutPlan[]>({ queryKey: ["/api/workout-plans"] });
  const { data: readingGoal }           = useQuery<ReadingGoal | null>({ queryKey: ["/api/reading/goal"] });
  const { data: hobbies = [] }          = useQuery<any[]>({ queryKey: ["/api/hobbies"] });
  const { data: spots = [] }            = useQuery<Spot[]>({ queryKey: ["/api/spots"] });
  const { data: quotes = [] }           = useQuery<Quote[]>({ queryKey: ["/api/quotes"] });
  const { data: subs = [] }             = useQuery<Subscription[]>({ queryKey: ["/api/budget/subscriptions"] });
  const { data: generalTasks = [] }     = useQuery<any[]>({ queryKey: ["/api/general-tasks"] });
  const { data: habits = [] }           = useQuery<any[]>({ queryKey: ["/api/habits"] });
  const { data: habitLogs = [] }        = useQuery<any[]>({ queryKey: ["/api/habit-logs"] });
  const { data: standaloneProjects = [] } = useQuery<any[]>({ queryKey: ["/api/projects/standalone"] });

  const today = todayStr();
  const allSessions = books.flatMap((b) => b.sessions ?? []);

  // ── Events ─────────────────────────────────────────────────────────────────
  const upcomingEvents = events
    .map((e) => ({ ...e, displayDate: e.recurring !== "none" ? nextOccurrence(e.date, e.recurring) : e.date }))
    .filter((e) => { const d = daysUntil(e.displayDate); return d >= 0 && d <= 14; })
    .sort((a, b) => a.displayDate.localeCompare(b.displayDate))
    .slice(0, 8);
  const todayEvents = upcomingEvents.filter((e) => e.displayDate === today);

  // ── Reading ────────────────────────────────────────────────────────────────
  const currentBooks = books.filter((b) => b.status === "current");
  const rStreak = readingStreak(allSessions);
  const { booksFinished: monthBooks } = monthlyReadingStats(allSessions, books);
  const currentYear = new Date().getFullYear();
  const booksFinishedThisYear = books.filter((b) => b.status === "finished" && (b as any).finishDate?.startsWith(String(currentYear))).length;

  // ── Workouts ───────────────────────────────────────────────────────────────
  const wStreak = workoutStreak(wLogs);
  const { completed: wCompleted, planned: wPlanned } = weeklyWorkoutStats(wLogs, wTemplates);
  const recentPRs = getRecentPRs(wLogs);
  const weekDates = thisWeekDates();
  const weekDone = new Set(wLogs.filter((l) => l.completed && weekDates.includes(l.date)).map((l) => l.date));
  const todayWorkoutDone = weekDone.has(today);

  // ── Goals ──────────────────────────────────────────────────────────────────
  const activeGoals = goals.filter((g) => !g.completedDate);
  const avgGoalPct = activeGoals.length
    ? Math.round(activeGoals.reduce((sum, g) => {
        const pct = g.progressType === "boolean"
          ? (g.progressCurrent >= g.progressTarget ? 100 : 0)
          : g.progressTarget > 0 ? Math.min(100, Math.round((g.progressCurrent / g.progressTarget) * 100)) : 0;
        return sum + pct;
      }, 0) / activeGoals.length)
    : 0;

  // ── Spots ──────────────────────────────────────────────────────────────────
  const wantToVisit = spots.filter((s) => s.status === "want_to_visit");

  // ── Quotes ─────────────────────────────────────────────────────────────────
  const favoriteQuotes = quotes.filter((q) => q.isFavorite);
  const quotePool = favoriteQuotes.length > 0 ? favoriteQuotes : quotes;
  const featuredQuote = quotePool.length > 0 ? quotePool[quoteIdx % quotePool.length] : null;

  // ── Chores ─────────────────────────────────────────────────────────────────
  const activeChores = chores.filter((c) => c.isActive && c.nextDue)
    .map((c) => ({ ...c, daysLeft: daysUntil(c.nextDue!) }));
  const choresToday   = activeChores.filter((c) => c.daysLeft !== null && c.daysLeft === 0);
  const choresOverdue = activeChores.filter((c) => c.daysLeft !== null && c.daysLeft < 0);
  const choresUpNext  = activeChores.filter((c) => c.daysLeft !== null && c.daysLeft > 0 && c.daysLeft <= 7);

  // ── Tasks ──────────────────────────────────────────────────────────────────
  const openGeneralTasks   = generalTasks.filter((t: any) => !t.completed);
  const tasksDueToday      = openGeneralTasks.filter((t: any) => (t as any).dueDate === today);
  const tasksOverdue       = openGeneralTasks.filter((t: any) => (t as any).dueDate && (t as any).dueDate < today);
  const tasksDueThisWeek   = openGeneralTasks.filter((t: any) => {
    const d = (t as any).dueDate;
    if (!d || d <= today) return false;
    const days = daysUntil(d);
    return days !== null && days <= 7;
  });

  // Goal tasks due today / overdue
  const goalTasksDueToday: any[] = [];
  const goalTasksOverdue: any[]  = [];
  goals.forEach((g) => {
    (g.tasks ?? []).forEach((t: any) => {
      if (t.completed || !t.dueDate) return;
      if (t.dueDate === today) goalTasksDueToday.push({ ...t, source: g.title });
      else if (t.dueDate < today) goalTasksOverdue.push({ ...t, source: g.title });
    });
  });

  const allTasksDueToday   = [...tasksDueToday, ...goalTasksDueToday];
  const allTasksOverdue    = [...tasksOverdue, ...goalTasksOverdue];

  // Tasks with no due date
  const generalTasksNoDueDate = openGeneralTasks.filter((t: any) => !(t as any).dueDate);

  // Open project tasks (from goals + standalone projects)
  const openProjectTasks: any[] = [];
  goals.forEach((g) => {
    (g.projects ?? []).forEach((p: any) => {
      (p.tasks ?? []).filter((t: any) => !t.completed).forEach((t: any) => {
        openProjectTasks.push({ ...t, source: p.title ?? g.title });
      });
    });
  });
  standaloneProjects.forEach((p: any) => {
    (p.tasks ?? []).filter((t: any) => !t.completed).forEach((t: any) => {
      openProjectTasks.push({ ...t, source: p.title });
    });
  });

  // ── Habits ─────────────────────────────────────────────────────────────────
  const todayHabitLogIds = new Set(
    habitLogs.filter((l: any) => l.date === today && l.completed).map((l: any) => l.habitId)
  );
  const habitsActiveToday = habits.filter((h: any) => h.isActive !== false);
  const habitsDueToday    = habitsActiveToday.filter((h: any) => !todayHabitLogIds.has(h.id));
  const habitsCompletedToday = habitsActiveToday.filter((h: any) => todayHabitLogIds.has(h.id));

  // Yesterday's missed habits
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);
  const yesterdayLogIds = new Set(
    habitLogs.filter((l: any) => l.date === yesterdayStr && l.completed).map((l: any) => l.habitId)
  );
  const habitsMissedYesterday = habitsActiveToday.filter((h: any) => !yesterdayLogIds.has(h.id));

  // ── Subscriptions ──────────────────────────────────────────────────────────
  const dueSubs = (subs as Subscription[])
    .filter((s) => (s as any).isActive !== false && (s as any).nextRenewal)
    .map((s) => ({ ...s, daysLeft: daysUntil((s as any).nextRenewal) }))
    .filter((s) => s.daysLeft !== null && s.daysLeft <= 7 && s.daysLeft >= 0)
    .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0))
    .slice(0, 3);

  // ── Projects ───────────────────────────────────────────────────────────────
  const activeProjects = standaloneProjects.filter((p: any) => p.status !== "done");
  const goalProjects   = goals.flatMap((g) => (g.projects ?? []).filter((p: any) => p.status !== "done"));
  const totalActiveProjects = activeProjects.length + goalProjects.length;

  // ── Hobby plans ────────────────────────────────────────────────────────────
  const activeHobbyPlans: Array<{ plan: any; hobby: any }> = [];
  for (const h of hobbies) {
    try {
      const o = JSON.parse(h.extraJson || "{}");
      if (Array.isArray(o.plans)) {
        for (const p of o.plans) { if (p.isActive && !p.completedAt) activeHobbyPlans.push({ plan: p, hobby: h }); }
      }
    } catch {}
  }

  // ── TODAY items (aggregated) ────────────────────────────────────────────────
  type TodayItem = { key: string; icon: React.ReactNode; label: string; sub?: string; href: string; urgent?: boolean; done?: boolean };
  const todayItems: TodayItem[] = [];
  todayEvents.forEach((e) => todayItems.push({
    key: `ev-${e.id}`, icon: <Calendar size={13} className="text-violet-500" />,
    label: e.title, sub: e.location ?? "Event today", href: "/calendar", urgent: true,
  }));
  allTasksDueToday.forEach((t) => todayItems.push({
    key: `task-${t.id}`, icon: <CheckCircle2 size={13} className="text-blue-500" />,
    label: t.title, sub: t.source ? `from ${t.source}` : "Task due today", href: "/tasks",
  }));
  habitsDueToday.slice(0, 3).forEach((h: any) => todayItems.push({
    key: `habit-${h.id}`, icon: <Zap size={13} className="text-emerald-500" />,
    label: h.name ?? h.title, sub: "Habit — not yet done", href: "/habits",
  }));
  choresToday.forEach((c) => todayItems.push({
    key: `chore-${c.id}`, icon: <Home size={13} className="text-amber-500" />,
    label: c.title, sub: "Chore due today", href: "/housekeeping",
  }));
  if (!todayWorkoutDone && wPlanned > 0) todayItems.push({
    key: "workout", icon: <Dumbbell size={13} className="text-blue-400" />,
    label: "Log today's workout", sub: `${wCompleted}/${wPlanned} this week`, href: "/workouts",
  });
  openProjectTasks.forEach((t) => todayItems.push({
    key: `proj-task-${t.id}`, icon: <CheckCircle2 size={13} className="text-indigo-500" />,
    label: t.title, sub: t.source ? `Project: ${t.source}` : "Project task", href: "/tasks",
  }));
  generalTasksNoDueDate.forEach((t: any) => todayItems.push({
    key: `no-date-task-${t.id}`, icon: <CheckCircle2 size={13} className="text-slate-400" />,
    label: t.title, sub: "No due date", href: "/tasks",
  }));

  // ── UP NEXT items ──────────────────────────────────────────────────────────
  const upNextEvents = upcomingEvents.filter((e) => e.displayDate > today).slice(0, 4);

  // ── NEEDS ATTENTION ────────────────────────────────────────────────────────
  const attentionItems: TodayItem[] = [];
  allTasksOverdue.slice(0, 4).forEach((t) => attentionItems.push({
    key: `ov-task-${t.id}`, icon: <AlertTriangle size={13} className="text-red-500" />,
    label: t.title, sub: t.source ? `from ${t.source} · overdue` : "Task overdue", href: "/tasks", urgent: true,
  }));
  choresOverdue.slice(0, 3).forEach((c) => attentionItems.push({
    key: `ov-chore-${c.id}`, icon: <RefreshCw size={13} className="text-red-500" />,
    label: c.title, sub: `${Math.abs(c.daysLeft!)}d overdue`, href: "/housekeeping", urgent: true,
  }));
  habitsMissedYesterday.slice(0, 2).forEach((h: any) => attentionItems.push({
    key: `miss-habit-${h.id}`, icon: <Zap size={13} className="text-amber-500" />,
    label: h.name ?? h.title, sub: "Missed yesterday", href: "/habits",
  }));

  const dayLabel = (d: number | null) => {
    if (d === null) return "";
    if (d < 0) return `${Math.abs(d)}d overdue`;
    if (d === 0) return "Today";
    if (d === 1) return "Tomorrow";
    return `${d}d`;
  };

  const hiddenCount = SECTION_ORDER.filter(id => !visible[id]).length;

  const QUICK_LINKS = [
    { href: "/goals",         label: "Goals",        icon: <Target size={15} />,       color: "text-amber-500" },
    { href: "/tasks",         label: "Tasks",        icon: <CheckCircle2 size={15} />,  color: "text-blue-500"  },
    { href: "/workouts",      label: "Workouts",     icon: <Dumbbell size={15} />,      color: "text-indigo-500"},
    { href: "/nutrition",     label: "Nutrition",    icon: <Apple size={15} />,         color: "text-rose-500"  },
    { href: "/spots",         label: "Places",       icon: <MapPin size={15} />,        color: "text-emerald-500"},
    { href: "/calendar",      label: "Events",       icon: <Calendar size={15} />,      color: "text-violet-500"},
    { href: "/messenger",     label: "Messenger",    icon: <MessageCircle size={15} />, color: "text-sky-500"   },
    { href: "/relationships", label: "Friends",      icon: <Users size={15} />,         color: "text-pink-500"  },
  ];

  return (
    <div className="p-3 sm:p-6 max-w-6xl mx-auto space-y-5">

      {/* ── 1. Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{format(new Date(), "EEEE, MMMM d, yyyy")}</p>
          <h1 className="text-2xl font-bold leading-tight">Dashboard</h1>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <div className="hidden sm:flex gap-2 items-center">
            <Button size="sm" variant="outline" onClick={() => setAddEvent(true)} className="gap-1.5 h-8 text-xs"><Plus size={12} /><Calendar size={12} />Event</Button>
            <Button size="sm" variant="outline" onClick={() => setAddWorkout(true)} className="gap-1.5 h-8 text-xs"><Plus size={12} /><Dumbbell size={12} />Workout</Button>
            <Button size="sm" variant="outline" onClick={() => setAddSession(true)} className="gap-1.5 h-8 text-xs"><Plus size={12} /><BookMarked size={12} />Reading</Button>
          </div>
          <div className="relative" ref={customRef}>
            <Button size="sm" variant={customizing ? "secondary" : "outline"} onClick={() => setCustomizing(v => !v)} className="gap-1.5 h-8 text-xs">
              <Settings2 size={12} /> Customize
              {hiddenCount > 0 && <span className="ml-0.5 bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">{hiddenCount}</span>}
            </Button>
            {customizing && (
              <div className="absolute right-0 top-full mt-2 z-50 w-60 bg-popover border rounded-xl shadow-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold">Sections</span>
                  <button onClick={() => setCustomizing(false)} className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
                </div>
                <div className="space-y-1">
                  {SECTION_ORDER.map((id) => (
                    <label key={id} className="flex items-center justify-between gap-3 py-1.5 px-2 rounded-lg hover:bg-secondary/60 cursor-pointer">
                      <span className={`text-sm ${visible[id] ? "text-foreground" : "text-muted-foreground"}`}>{SECTION_LABELS[id]}</span>
                      <button type="button" role="switch" aria-checked={visible[id]} onClick={() => toggleSection(id)}
                        className={`relative shrink-0 w-9 h-5 rounded-full transition-colors ${visible[id] ? "bg-primary" : "bg-secondary border border-border"}`}>
                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${visible[id] ? "translate-x-4" : "translate-x-0.5"}`} />
                      </button>
                    </label>
                  ))}
                </div>
                {hiddenCount > 0 && (
                  <button onClick={() => { const next = { ...ALL_ON }; saveVisibility(next); setVisible(next); }} className="mt-3 text-xs text-muted-foreground hover:text-foreground w-full text-center">Show all</button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 2-column layout ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">

        {/* ── Left column (primary — 2/3 width on desktop) ───────────────── */}
        <div className="lg:col-span-2 space-y-5">

          {/* ── TODAY (most prominent) ─────────────────────────────────────── */}
          {visible.today && (
            <div className="bg-card border-2 border-primary/30 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Sun size={15} className="text-amber-500" />
                  <span className="text-sm font-bold">Today</span>
                  {habitsCompletedToday.length > 0 && (
                    <span className="text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full font-medium">
                      {habitsCompletedToday.length} habit{habitsCompletedToday.length !== 1 ? "s" : ""} done
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">{todayItems.length} item{todayItems.length !== 1 ? "s" : ""}</span>
              </div>
              {todayItems.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle2 size={28} className="mx-auto mb-2 text-emerald-500 opacity-60" />
                  <p className="text-sm font-medium text-foreground">You're all caught up!</p>
                  <p className="text-xs mt-1">Nothing urgent on the schedule today.</p>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                  {todayItems.map((item) => (
                    <Link key={item.key} href={item.href}>
                      <a className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors hover:bg-secondary/60 ${item.urgent ? "bg-red-50/50 dark:bg-red-950/20 border border-red-200/50 dark:border-red-800/50" : "bg-secondary/30"}`}>
                        <span className="shrink-0">{item.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{item.label}</p>
                          {item.sub && <p className="text-xs text-muted-foreground">{item.sub}</p>}
                        </div>
                        <ChevronRight size={13} className="text-muted-foreground shrink-0" />
                      </a>
                    </Link>
                  ))}
                </div>
              )}
              {/* AI Day Planner inline if enabled */}
              {visible.day_planner && (
                <div className="mt-4 pt-4 border-t">
                  <AIDayPlanner />
                </div>
              )}
            </div>
          )}

          {/* ── UP NEXT ────────────────────────────────────────────────────── */}
          {visible.up_next && (
            <div className="bg-card border rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Clock size={14} className="text-blue-500" />
                  <span className="text-sm font-semibold">Up Next</span>
                </div>
                <Link href="/calendar"><a className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5">Calendar <ChevronRight size={12} /></a></Link>
              </div>
              {upNextEvents.length === 0 && tasksDueThisWeek.length === 0 && choresUpNext.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">Nothing coming up in the next 7 days.</p>
              ) : (
                <div className="space-y-1.5">
                  {upNextEvents.map((e) => {
                    const d = daysUntil(e.displayDate);
                    return (
                      <Link key={e.id} href="/calendar">
                        <a className="flex items-center gap-3 px-3 py-2 rounded-xl bg-secondary/30 hover:bg-secondary/60 transition-colors">
                          <Calendar size={13} className="text-violet-500 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{e.title}</p>
                            <p className="text-xs text-muted-foreground">{format(parseISO(e.displayDate), "EEE, MMM d")}{e.location ? ` · ${e.location}` : ""}</p>
                          </div>
                          <span className={`text-xs font-semibold shrink-0 px-2 py-0.5 rounded-full border ${d === 1 ? "text-amber-600 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800" : "text-muted-foreground bg-secondary border-border"}`}>
                            {dayLabel(d)}
                          </span>
                        </a>
                      </Link>
                    );
                  })}
                  {tasksDueThisWeek.slice(0, 3).map((t: any) => (
                    <Link key={t.id} href="/tasks">
                      <a className="flex items-center gap-3 px-3 py-2 rounded-xl bg-secondary/30 hover:bg-secondary/60 transition-colors">
                        <CheckCircle2 size={13} className="text-blue-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{t.title}</p>
                          <p className="text-xs text-muted-foreground">Task · {dayLabel(daysUntil(t.dueDate))}</p>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">{format(parseISO(t.dueDate), "MMM d")}</span>
                      </a>
                    </Link>
                  ))}
                  {choresUpNext.slice(0, 2).map((c) => (
                    <Link key={c.id} href="/housekeeping">
                      <a className="flex items-center gap-3 px-3 py-2 rounded-xl bg-secondary/30 hover:bg-secondary/60 transition-colors">
                        <RefreshCw size={13} className="text-amber-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{c.title}</p>
                          <p className="text-xs text-muted-foreground">Chore · {dayLabel(c.daysLeft)}</p>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">{dayLabel(c.daysLeft)}</span>
                      </a>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── NEEDS ATTENTION ────────────────────────────────────────────── */}
          {visible.needs_attention && attentionItems.length > 0 && (
            <div className="bg-card border border-amber-200 dark:border-amber-800/60 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle size={14} className="text-amber-500" />
                <span className="text-sm font-semibold">Needs Attention</span>
                <span className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full font-medium">{attentionItems.length}</span>
              </div>
              <div className="space-y-1.5">
                {attentionItems.map((item) => (
                  <Link key={item.key} href={item.href}>
                    <a className="flex items-center gap-3 px-3 py-2 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors">
                      <span className="shrink-0">{item.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.label}</p>
                        {item.sub && <p className="text-xs text-muted-foreground">{item.sub}</p>}
                      </div>
                      <ChevronRight size={13} className="text-muted-foreground shrink-0" />
                    </a>
                  </Link>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* ── Right column (secondary) ────────────────────────────────────── */}
        <div className="space-y-5">

          {/* ── PROGRESS ───────────────────────────────────────────────────── */}
          {visible.progress && (
            <div className="bg-card border rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <TrendingUp size={14} className="text-primary" />
                  <span className="text-sm font-semibold">Progress</span>
                </div>
                <Link href="/goals"><a className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5">Goals <ChevronRight size={12} /></a></Link>
              </div>
              <div className="space-y-3">
                {/* Goals summary */}
                {activeGoals.length > 0 && (
                  <Link href="/goals">
                    <a className="flex items-center justify-between py-1 hover:opacity-80 transition-opacity">
                      <div className="flex items-center gap-2 min-w-0">
                        <Target size={13} className="text-amber-500 shrink-0" />
                        <span className="text-xs font-medium">{activeGoals.length} active goal{activeGoals.length !== 1 ? "s" : ""}</span>
                      </div>
                      <span className="text-xs font-semibold text-muted-foreground">{avgGoalPct}% avg</span>
                    </a>
                  </Link>
                )}
                {/* Projects */}
                {totalActiveProjects > 0 && (
                  <Link href="/tasks">
                    <a className="flex items-center justify-between py-1 hover:opacity-80 transition-opacity">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 size={13} className="text-blue-500 shrink-0" />
                        <span className="text-xs font-medium">{totalActiveProjects} active project{totalActiveProjects !== 1 ? "s" : ""}</span>
                      </div>
                      <ChevronRight size={12} className="text-muted-foreground" />
                    </a>
                  </Link>
                )}
                {/* Workout streak */}
                <Link href="/workouts">
                  <a className="flex items-center justify-between py-1 hover:opacity-80 transition-opacity">
                    <div className="flex items-center gap-2">
                      <Flame size={13} className="text-amber-500 shrink-0" />
                      <span className="text-xs font-medium">{wStreak}d workout streak</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{wCompleted}/{wPlanned} wk</span>
                  </a>
                </Link>
                {/* Active workout plan */}
                {(() => {
                  const activePlan = workoutPlans.find(p => p.isActive);
                  if (!activePlan) return null;
                  const weeksElapsed = activePlan.startDate ? Math.floor((Date.now() - new Date(activePlan.startDate).getTime()) / (7 * 86400000)) : null;
                  const pct = (weeksElapsed !== null && activePlan.durationWeeks > 0) ? Math.min(100, Math.round((weeksElapsed / activePlan.durationWeeks) * 100)) : 0;
                  return (
                    <Link href="/workouts">
                      <a className="block space-y-1 py-1 hover:opacity-80 transition-opacity">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <Dumbbell size={13} className="text-blue-500 shrink-0" />
                            <span className="text-xs font-medium truncate">{activePlan.name}</span>
                          </div>
                          <span className="text-xs text-muted-foreground shrink-0">{pct}%</span>
                        </div>
                        <div className="h-1 bg-secondary rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </a>
                    </Link>
                  );
                })()}
                {/* Reading goal */}
                {readingGoal && (
                  <Link href="/reading">
                    <a className="block space-y-1 py-1 hover:opacity-80 transition-opacity">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <BookOpen size={13} className="text-amber-500 shrink-0" />
                          <span className="text-xs font-medium">{currentYear} Reading</span>
                        </div>
                        <span className="text-xs text-muted-foreground">{booksFinishedThisYear}/{readingGoal.booksTarget}</span>
                      </div>
                      <div className="h-1 bg-secondary rounded-full overflow-hidden">
                        <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min(100, Math.round((booksFinishedThisYear / readingGoal.booksTarget) * 100))}%` }} />
                      </div>
                    </a>
                  </Link>
                )}
                {/* Nutrition */}
                {nutritionGoal && (
                  <Link href="/nutrition">
                    <a className="flex items-center justify-between py-1 hover:opacity-80 transition-opacity">
                      <div className="flex items-center gap-2">
                        <Apple size={13} className="text-rose-500 shrink-0" />
                        <span className="text-xs font-medium">Nutrition goals set</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{nutritionGoal.calories} kcal</span>
                    </a>
                  </Link>
                )}
                {/* Hobby plans */}
                {activeHobbyPlans.length > 0 && (
                  <Link href="/hobbies">
                    <a className="flex items-center justify-between py-1 hover:opacity-80 transition-opacity">
                      <div className="flex items-center gap-2">
                        <Heart size={13} className="text-violet-500 shrink-0" />
                        <span className="text-xs font-medium">{activeHobbyPlans.length} hobby plan{activeHobbyPlans.length !== 1 ? "s" : ""}</span>
                      </div>
                      <ChevronRight size={12} className="text-muted-foreground" />
                    </a>
                  </Link>
                )}
                {/* Currently reading */}
                {currentBooks.length > 0 && (
                  <Link href="/reading">
                    <a className="flex items-center justify-between py-1 hover:opacity-80 transition-opacity">
                      <div className="flex items-center gap-2">
                        <BookOpen size={13} className="text-orange-500 shrink-0" />
                        <span className="text-xs font-medium truncate">{currentBooks[0].title}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{rStreak}d streak</span>
                    </a>
                  </Link>
                )}
              </div>
            </div>
          )}

          {/* ── FRIENDS ACTIVITY ───────────────────────────────────────────── */}
          {visible.social_feed && <SocialFeed currentUserId={authUser?.id} />}

          {/* ── UPCOMING EVENTS (compact) ──────────────────────────────────── */}
          {visible.events && upcomingEvents.length > 0 && (
            <div className="bg-card border rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Calendar size={14} className="text-violet-500" />
                  <span className="text-sm font-semibold">Upcoming Events</span>
                </div>
                <Link href="/calendar"><a className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5">All <ChevronRight size={12} /></a></Link>
              </div>
              <div className="space-y-1.5">
                {upcomingEvents.slice(0, 4).map((e) => {
                  const d = daysUntil(e.displayDate);
                  return (
                    <div key={e.id} className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium truncate">{e.title}</p>
                      <span className={`text-xs shrink-0 font-semibold ${d === 0 ? "text-primary" : d <= 3 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
                        {dayLabel(d)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── RECENT ACTIVITY ────────────────────────────────────────────── */}
          {visible.recent_activity && <MyRecentActivity />}

          {/* ── QUICK JUMP ─────────────────────────────────────────────────── */}
          {visible.quick_jump && (
            <div className="bg-card border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={14} className="text-primary" />
                <span className="text-sm font-semibold">Quick Jump</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {QUICK_LINKS.map((link) => (
                  <Link key={link.href} href={link.href}>
                    <a className="flex flex-col items-center gap-1.5 p-2 rounded-xl bg-secondary/40 hover:bg-secondary transition-colors">
                      <span className={link.color}>{link.icon}</span>
                      <span className="text-[10px] font-medium text-muted-foreground text-center leading-tight">{link.label}</span>
                    </a>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Featured quote */}
          {featuredQuote && (
            <div className="bg-card border rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Star size={13} className="text-amber-400" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Quote</span>
                </div>
                {quotePool.length > 1 && (
                  <button onClick={() => setQuoteIdx((i) => (i + 1) % quotePool.length)} className="text-muted-foreground hover:text-foreground transition-colors">
                    <RefreshCw size={11} />
                  </button>
                )}
              </div>
              <p className="text-xs italic text-foreground/80 leading-relaxed">&ldquo;{featuredQuote.text}&rdquo;</p>
              {featuredQuote.author && <p className="text-[10px] text-muted-foreground mt-1.5">— {featuredQuote.author}</p>}
            </div>
          )}

        </div>
      </div>

      {/* Modals */}
      <EventFormModal open={addEvent} onClose={() => setAddEvent(false)} editEvent={null} />
      <BookFormModal open={addBook} onClose={() => setAddBook(false)} editBook={null} />
      {addSession && <ReadingSessionModal open onClose={() => setAddSession(false)} books={books} editSession={null} />}
      {addWorkout && <WorkoutLogModal open onClose={() => setAddWorkout(false)} templates={wTemplates} editLog={null} />}
    </div>
  );
}

// ── Activity Feed helpers ─────────────────────────────────────────────────────

function timeAgo(date: string | Date) {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

const ACTIVITY_LABELS: Record<string, string> = {
  book_added:               "added a book",
  book_finished:            "finished reading",
  movie_added:              "added a movie",
  song_added:               "added a song",
  recipe_added:             "added a recipe",
  spot_added:               "saved a spot",
  quote_added:              "saved a quote",
  recommendation_received:  "recommended something to you",
};

const ITEM_TYPE_ICONS: Record<string, React.ReactNode> = {
  book:   <BookOpen size={14} />,
  movie:  <Film size={14} />,
  song:   <Music size={14} />,
  recipe: <ChefHat size={14} />,
  spot:   <MapPin size={14} />,
  quote:  <QuoteIcon size={14} />,
};

// ── FeedCard ─────────────────────────────────────────────────────────────────

type FeedItemUser = { id: number; name: string; avatarUrl: string | null };
type FeedReaction = { id: number; emoji: string; userId: number; userName: string };
type FeedComment = { id: number; content: string; userId: number; userName: string; createdAt: string };
type FeedItem = {
  id: number;
  activityType: string;
  itemId: number | null;
  itemType: string | null;
  itemTitle: string | null;
  itemImageUrl: string | null;
  itemSubtitle: string | null;
  itemExtra: string | null;
  createdAt: string;
  user: FeedItemUser;
  reactions: FeedReaction[];
  comments: FeedComment[];
};

function UserAvatar({ user }: { user: FeedItemUser }) {
  if (user.avatarUrl) {
    return <img src={user.avatarUrl} alt={user.name} className="w-8 h-8 rounded-full object-cover shrink-0" />;
  }
  const initials = user.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
      <span className="text-xs font-semibold text-primary">{initials}</span>
    </div>
  );
}

const REACTION_EMOJIS = ["👍", "❤️", "🔥"];

function FeedCard({ item, currentUserId }: { item: FeedItem; currentUserId?: number }) {
  const qc = useQueryClient();
  const [showCommentBox, setShowCommentBox] = useState(false);
  const [showAllComments, setShowAllComments] = useState(false);
  const [commentText, setCommentText] = useState("");

  const reactionCounts = REACTION_EMOJIS.reduce<Record<string, number>>((acc, e) => {
    acc[e] = item.reactions.filter((r) => r.emoji === e).length;
    return acc;
  }, {});

  const myReactions = new Set(item.reactions.filter((r) => r.userId === currentUserId).map((r) => r.emoji));

  const reactMutation = useMutation({
    mutationFn: async (emoji: string) => {
      await apiRequest("POST", `/api/feed/${item.id}/react`, { emoji });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/feed"] }); },
  });

  const commentMutation = useMutation({
    mutationFn: async (content: string) => {
      await apiRequest("POST", `/api/feed/${item.id}/comment`, { content });
    },
    onSuccess: () => {
      setCommentText("");
      setShowCommentBox(false);
      qc.invalidateQueries({ queryKey: ["/api/feed"] });
    },
  });

  const visibleComments = showAllComments ? item.comments : item.comments.slice(-2);

  return (
    <div className="bg-card border rounded-xl p-3 space-y-2">
      {/* Header */}
      <div className="flex items-start gap-2">
        <UserAvatar user={item.user} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-xs font-semibold">{item.user.name}</span>
            <span className="text-xs text-muted-foreground">{ACTIVITY_LABELS[item.activityType] ?? item.activityType}</span>
            {item.activityType === "recommendation_received" && (
              <span className="text-[10px] bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 rounded px-1 py-0.5 font-medium">Recommended to you</span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">{timeAgo(item.createdAt)}</p>
        </div>
      </div>

      {/* Item info */}
      {item.itemTitle && (
        <div className="flex items-center gap-2 pl-10">
          {item.itemImageUrl && (
            <img src={item.itemImageUrl} alt={item.itemTitle} className="w-12 h-12 rounded object-cover shrink-0" />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              {item.itemType && <span className="text-muted-foreground">{ITEM_TYPE_ICONS[item.itemType]}</span>}
              <p className="text-xs font-medium truncate">{item.itemTitle}</p>
            </div>
            {item.itemSubtitle && <p className="text-[10px] text-muted-foreground truncate">{item.itemSubtitle}</p>}
          </div>
        </div>
      )}

      {/* Reactions */}
      <div className="flex items-center gap-1 pl-10">
        {REACTION_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => reactMutation.mutate(emoji)}
            className={`flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full border transition-colors ${myReactions.has(emoji) ? "bg-primary/10 border-primary/30 text-primary" : "border-border hover:bg-secondary"}`}
          >
            <span>{emoji}</span>
            {reactionCounts[emoji] > 0 && <span className="font-medium">{reactionCounts[emoji]}</span>}
          </button>
        ))}
        <button
          onClick={() => setShowCommentBox((v) => !v)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded-full border border-border hover:bg-secondary transition-colors"
        >
          <MessageCircle size={11} />
          {item.comments.length > 0 && <span>{item.comments.length}</span>}
        </button>
      </div>

      {/* Comments */}
      {item.comments.length > 0 && (
        <div className="pl-10 space-y-1">
          {item.comments.length > 2 && !showAllComments && (
            <button onClick={() => setShowAllComments(true)} className="text-[10px] text-muted-foreground hover:text-foreground">
              View {item.comments.length - 2} more comment{item.comments.length - 2 !== 1 ? "s" : ""}
            </button>
          )}
          {visibleComments.map((c) => (
            <div key={c.id} className="text-xs">
              <span className="font-medium">{c.userName}</span>
              <span className="text-muted-foreground ml-1">{c.content}</span>
            </div>
          ))}
        </div>
      )}

      {/* Comment input */}
      {showCommentBox && (
        <div className="flex items-center gap-1 pl-10">
          <input
            className="flex-1 text-xs border rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="Add a comment..."
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && commentText.trim()) commentMutation.mutate(commentText.trim());
            }}
          />
          <button
            onClick={() => { if (commentText.trim()) commentMutation.mutate(commentText.trim()); }}
            disabled={!commentText.trim() || commentMutation.isPending}
            className="text-primary disabled:opacity-40"
          >
            <Send size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── SocialFeed component ──────────────────────────────────────────────────────

function SocialFeed({ currentUserId }: { currentUserId?: number }) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery<{ items: FeedItem[]; hasFriends: boolean; page: number; total: number } | { items: never[]; hasFriends: false }>({
    queryKey: ["/api/feed", page],
    queryFn: () => fetch(`/api/feed?page=${page}`).then((r) => r.json()),
  });
  const { data: mine } = useQuery<FeedItem[]>({
    queryKey: ["/api/feed/mine"],
    queryFn: () => fetch("/api/feed/mine").then((r) => r.json()),
    enabled: data != null && (data as any).hasFriends === true && (data as any).items?.length === 0,
  });

  if (isLoading) {
    return (
      <div className="bg-card border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Users size={14} className="text-primary" />
          <span className="text-sm font-semibold">Friends' Activity</span>
        </div>
        <p className="text-xs text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!data || !(data as any).hasFriends) {
    return (
      <div className="bg-card border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Users size={14} className="text-primary" />
          <span className="text-sm font-semibold">Friends' Activity</span>
        </div>
        <div className="text-center py-4 text-muted-foreground">
          <Users size={24} className="opacity-20 mx-auto mb-2" />
          <p className="text-xs mb-2">Add friends to see their activity</p>
          <Link href="/social"><a className="text-xs text-primary hover:underline">Go to Friends</a></Link>
        </div>
      </div>
    );
  }

  const items = (data as any).items as FeedItem[];
  const total: number = (data as any).total ?? 0;
  const pageSize = 20;
  const hasMore = page * pageSize < total;

  if (items.length === 0) {
    // Show own recent activity as fallback
    return (
      <div className="bg-card border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Users size={14} className="text-primary" />
          <span className="text-sm font-semibold">Friends' Activity</span>
        </div>
        {mine && mine.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground mb-2">No friends' activity yet. Here's your recent activity:</p>
            {mine.map((item) => (
              <FeedCard key={item.id} item={item} currentUserId={currentUserId} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-4">No activity yet. Start adding books, movies, and more!</p>
        )}
      </div>
    );
  }

  return (
    <div className="bg-card border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Users size={14} className="text-primary" />
        <span className="text-sm font-semibold">Friends' Activity</span>
      </div>
      <div className="space-y-2 overflow-y-auto max-h-72 pr-1">
        {items.map((item) => (
          <FeedCard key={item.id} item={item} currentUserId={currentUserId} />
        ))}
        {hasMore && (
          <button
            onClick={() => setPage((p) => p + 1)}
            className="mt-1 w-full text-xs text-muted-foreground hover:text-foreground border rounded-lg py-1.5 hover:bg-secondary transition-colors"
          >
            Load more
          </button>
        )}
      </div>
    </div>
  );
}

// ── MyRecentActivity component ────────────────────────────────────────────────

function MyRecentActivity() {
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading } = useQuery<FeedItem[]>({
    queryKey: ["/api/feed/mine"],
    queryFn: () => fetch("/api/feed/mine").then((r) => r.json()),
  });

  const items = data ?? [];
  const visible = expanded ? items : items.slice(0, 3);
  const hasMore = items.length > 3;

  return (
    <div className="bg-card border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Clock size={14} className="text-primary" />
          <span className="text-sm font-semibold">My Recent Activity</span>
        </div>
        {items.length > 0 && (
          <span className="text-xs text-muted-foreground">{items.length} item{items.length !== 1 ? "s" : ""}</span>
        )}
      </div>
      {isLoading && <p className="text-xs text-muted-foreground">Loading...</p>}
      {!isLoading && items.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-4">No recent activity. Start adding items!</p>
      )}
      {items.length > 0 && (
        <>
          <div className={`space-y-1.5 overflow-y-auto pr-1 transition-all ${expanded ? "max-h-72" : ""}`}>
            {visible.map((item) => (
              <div key={item.id} className="flex items-center gap-2 py-1">
                <div className="text-muted-foreground shrink-0">
                  {item.itemType ? ITEM_TYPE_ICONS[item.itemType] : <Clock size={14} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{item.itemTitle ?? item.activityType}</p>
                  <p className="text-[10px] text-muted-foreground">{ACTIVITY_LABELS[item.activityType] ?? item.activityType} · {timeAgo(item.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
          {hasMore && (
            <button
              onClick={() => setExpanded((e) => !e)}
              className="mt-2 w-full text-xs text-muted-foreground hover:text-foreground border rounded-lg py-1.5 hover:bg-secondary transition-colors"
            >
              {expanded ? "Show less" : `Show ${items.length - 3} more`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string; sub: string; color: string;
}) {
  return (
    <div className="bg-card border rounded-xl p-4">
      <div className={`mb-2 ${color}`}>{icon}</div>
      <p className="text-2xl font-bold leading-none mb-1">{value}</p>
      <p className="text-xs font-medium text-foreground">{label}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-secondary/40 rounded-lg p-2 text-center">
      <p className="text-sm font-bold">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

function Section({ title, icon, children, linkHref, linkLabel }: {
  title: string; icon: React.ReactNode; children: React.ReactNode; linkHref: string; linkLabel: string;
}) {
  return (
    <div className="bg-card border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">{icon}<span className="text-sm font-semibold">{title}</span></div>
        <Link href={linkHref}><a className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5">{linkLabel} <ChevronRight size={12} /></a></Link>
      </div>
      {children}
    </div>
  );
}

function Empty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="text-center py-5 text-muted-foreground">
      <div className="opacity-20 mb-2 flex justify-center">{icon}</div>
      <p className="text-xs">{text}</p>
    </div>
  );
}
