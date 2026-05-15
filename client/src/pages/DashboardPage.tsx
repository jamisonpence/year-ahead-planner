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
  Film, Music, ChefHat, MessageCircle, Send, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type {
  EventWithTasks, BookWithSessions, WorkoutLog, WorkoutTemplate,
  GoalWithProjects, Chore, Spot, Quote, Subscription,
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

type SectionId = "day_planner" | "stats" | "events" | "goals" | "workouts" | "reading" | "quote" | "spots" | "due_soon" | "social_feed" | "my_activity";

const SECTION_LABELS: Record<SectionId, string> = {
  day_planner:  "AI Day Planner",
  stats:        "Stat Cards",
  events:       "Upcoming Events",
  goals:        "Active Goals",
  workouts:     "Weekly Workouts",
  reading:      "Currently Reading",
  quote:        "Featured Quote",
  spots:        "Places to Visit",
  due_soon:     "Due Soon",
  social_feed:  "Friends' Activity",
  my_activity:  "My Recent Activity",
};

const SECTION_ORDER: SectionId[] = ["social_feed", "my_activity", "day_planner", "stats", "events", "goals", "workouts", "reading", "quote", "spots", "due_soon"];

const ALL_ON: Record<SectionId, boolean> = {
  day_planner: true, stats: true, events: true, goals: true, workouts: true,
  reading: true, quote: true, spots: true, due_soon: true,
  social_feed: true, my_activity: true,
};

function loadVisibility(): Record<SectionId, boolean> {
  try {
    const raw = localStorage.getItem("dashboard_sections");
    if (raw) {
      const parsed = JSON.parse(raw);
      // Merge with defaults so new sections default to on
      return { ...ALL_ON, ...parsed };
    }
  } catch {}
  return { ...ALL_ON };
}

function saveVisibility(v: Record<SectionId, boolean>) {
  try { localStorage.setItem("dashboard_sections", JSON.stringify(v)); } catch {}
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

  // Close customize panel when clicking outside
  useEffect(() => {
    if (!customizing) return;
    function handle(e: MouseEvent) {
      if (customRef.current && !customRef.current.contains(e.target as Node)) {
        setCustomizing(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [customizing]);

  function toggleSection(id: SectionId) {
    setVisible(prev => {
      const next = { ...prev, [id]: !prev[id] };
      saveVisibility(next);
      return next;
    });
  }

  const { user: authUser } = useAuth();

  const { data: events = [] }     = useQuery<EventWithTasks[]>({ queryKey: ["/api/events"] });
  const { data: books = [] }      = useQuery<BookWithSessions[]>({ queryKey: ["/api/books"] });
  const { data: wLogs = [] }      = useQuery<WorkoutLog[]>({ queryKey: ["/api/workout-logs"] });
  const { data: wTemplates = [] } = useQuery<WorkoutTemplate[]>({ queryKey: ["/api/workout-templates"] });
  const { data: goals = [] }      = useQuery<GoalWithProjects[]>({ queryKey: ["/api/goals"] });
  const { data: chores = [] }     = useQuery<Chore[]>({ queryKey: ["/api/chores"] });
  const { data: spots = [] }      = useQuery<Spot[]>({ queryKey: ["/api/spots"] });
  const { data: quotes = [] }     = useQuery<Quote[]>({ queryKey: ["/api/quotes"] });
  const { data: subs = [] }       = useQuery<Subscription[]>({ queryKey: ["/api/budget/subscriptions"] });

  const today = todayStr();
  const allSessions = books.flatMap((b) => b.sessions ?? []);

  // ── Events ─────────────────────────────────────────────────────────────────
  const upcomingEvents = events
    .map((e) => ({ ...e, displayDate: e.recurring !== "none" ? nextOccurrence(e.date, e.recurring) : e.date }))
    .filter((e) => { const d = daysUntil(e.displayDate); return d >= 0 && d <= 14; })
    .sort((a, b) => a.displayDate.localeCompare(b.displayDate))
    .slice(0, 6);

  const todayEvents = upcomingEvents.filter((e) => e.displayDate === today);

  // ── Reading ────────────────────────────────────────────────────────────────
  const currentBooks = books.filter((b) => b.status === "current");
  const rStreak = readingStreak(allSessions);
  const { pagesRead: monthPages, booksFinished: monthBooks } = monthlyReadingStats(allSessions, books);

  // ── Workouts ───────────────────────────────────────────────────────────────
  const wStreak = workoutStreak(wLogs);
  const { completed: wCompleted, planned: wPlanned } = weeklyWorkoutStats(wLogs, wTemplates);
  const recentPRs = getRecentPRs(wLogs);
  const weekDates = thisWeekDates();
  const weekDone = new Set(wLogs.filter((l) => l.completed && weekDates.includes(l.date)).map((l) => l.date));

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
  const favoriteSpots = spots.filter((s) => s.isFavorite);

  // ── Quotes ─────────────────────────────────────────────────────────────────
  const favoriteQuotes = quotes.filter((q) => q.isFavorite);
  const quotePool = favoriteQuotes.length > 0 ? favoriteQuotes : quotes;
  const featuredQuote = quotePool.length > 0 ? quotePool[quoteIdx % quotePool.length] : null;

  // ── Subscriptions due ──────────────────────────────────────────────────────
  const dueSubs = (subs as Subscription[])
    .filter((s) => (s as any).isActive !== false && (s as any).nextRenewal)
    .map((s) => ({ ...s, daysLeft: daysUntil((s as any).nextRenewal) }))
    .filter((s) => s.daysLeft !== null && s.daysLeft <= 14 && s.daysLeft >= 0)
    .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0))
    .slice(0, 4);

  // ── Due soon ───────────────────────────────────────────────────────────────
  const dueSoon: { title: string; due: string; source: string; type: string }[] = [];
  events.forEach((e) => e.tasks?.filter((t) => !t.completed && t.dueDate && daysUntil(t.dueDate) <= 7 && daysUntil(t.dueDate) >= 0)
    .forEach((t) => dueSoon.push({ title: t.title, due: t.dueDate!, source: e.title, type: "task" })));
  goals.forEach((g) => g.tasks?.filter((t) => !t.completed && t.dueDate && daysUntil(t.dueDate) <= 7 && daysUntil(t.dueDate) >= 0)
    .forEach((t) => dueSoon.push({ title: t.title, due: t.dueDate!, source: g.title, type: "task" })));
  dueSoon.sort((a, b) => a.due.localeCompare(b.due));

  const dueChores = chores
    .filter((c) => c.isActive && c.nextDue)
    .map((c) => ({ ...c, daysLeft: daysUntil(c.nextDue!) }))
    .filter((c) => c.daysLeft !== null && c.daysLeft <= 3)
    .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0));

  const dayLabel = (d: number | null) => {
    if (d === null) return "";
    if (d < 0) return `${Math.abs(d)}d overdue`;
    if (d === 0) return "Today";
    if (d === 1) return "Tomorrow";
    return `${d}d`;
  };

  const SPOT_EMOJIS: Record<string, string> = {
    restaurant: "🍽️", bar: "🍺", cafe: "☕", park: "🌳", trail: "🥾",
    shop: "🛍️", service: "🔧", attraction: "🎡", hotel: "🏨", other: "📍",
  };

  const hiddenCount = SECTION_ORDER.filter(id => !visible[id]).length;

  return (
    <div className="p-3 sm:p-6 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">{format(new Date(), "EEEE, MMMM d, yyyy")}</p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <Button size="sm" variant="outline" onClick={() => setAddEvent(true)} className="gap-1.5"><Plus size={13} /><Calendar size={13} />Event</Button>
          <Button size="sm" variant="outline" onClick={() => setAddBook(true)} className="gap-1.5"><Plus size={13} /><BookOpen size={13} />Book</Button>
          <Button size="sm" variant="outline" onClick={() => setAddSession(true)} className="gap-1.5"><Plus size={13} /><BookMarked size={13} />Reading Log</Button>
          <Button size="sm" onClick={() => setAddWorkout(true)} className="gap-1.5"><Plus size={13} /><Dumbbell size={13} />Workout Log</Button>
          <div className="relative" ref={customRef}>
            <Button
              size="sm"
              variant={customizing ? "secondary" : "outline"}
              onClick={() => setCustomizing(v => !v)}
              className="gap-1.5"
              title="Customize dashboard"
            >
              <Settings2 size={13} />
              Customize
              {hiddenCount > 0 && (
                <span className="ml-0.5 bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                  {hiddenCount}
                </span>
              )}
            </Button>
            {customizing && (
              <div className="absolute right-0 top-full mt-2 z-50 w-64 bg-popover border rounded-xl shadow-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold">Dashboard Sections</span>
                  <button onClick={() => setCustomizing(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                    <X size={14} />
                  </button>
                </div>
                <div className="space-y-1">
                  {SECTION_ORDER.map((id) => (
                    <label key={id} className="flex items-center justify-between gap-3 py-1.5 px-2 rounded-lg hover:bg-secondary/60 cursor-pointer group">
                      <span className={`text-sm ${visible[id] ? "text-foreground" : "text-muted-foreground"}`}>
                        {SECTION_LABELS[id]}
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={visible[id]}
                        onClick={() => toggleSection(id)}
                        className={`relative shrink-0 w-9 h-5 rounded-full transition-colors ${visible[id] ? "bg-primary" : "bg-secondary border border-border"}`}
                      >
                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${visible[id] ? "translate-x-4" : "translate-x-0.5"}`} />
                      </button>
                    </label>
                  ))}
                </div>
                {hiddenCount > 0 && (
                  <button
                    onClick={() => {
                      const next = { ...ALL_ON };
                      saveVisibility(next);
                      setVisible(next);
                    }}
                    className="mt-3 text-xs text-muted-foreground hover:text-foreground w-full text-center transition-colors"
                  >
                    Show all sections
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Today strip — always shown */}
      {(todayEvents.length > 0 || dueChores.some((c) => (c.daysLeft ?? 1) <= 0)) && (
        <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 flex flex-wrap gap-4 items-center">
          <span className="text-xs font-semibold text-primary uppercase tracking-wider shrink-0">Today</span>
          {todayEvents.map((e) => (
            <span key={e.id} className="flex items-center gap-1.5 text-sm">
              <Calendar size={13} className="text-primary shrink-0" />
              <span className="font-medium">{e.title}</span>
            </span>
          ))}
          {dueChores.filter((c) => (c.daysLeft ?? 1) <= 0).map((c) => (
            <span key={c.id} className="flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-400">
              <RefreshCw size={13} className="shrink-0" />
              <span>{c.title} {(c.daysLeft ?? 0) < 0 ? `(${Math.abs(c.daysLeft!)}d overdue)` : "(due today)"}</span>
            </span>
          ))}
        </div>
      )}

      {/* Social Feed */}
      {visible.social_feed && <SocialFeed currentUserId={authUser?.id} />}

      {/* My Recent Activity */}
      {visible.my_activity && <MyRecentActivity />}

      {/* AI Day Planner */}
      {visible.day_planner && <AIDayPlanner />}

      {/* Stat cards */}
      {visible.stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            icon={<Target size={17} />} color="text-[hsl(var(--cat-goal))]"
            label="Goals" value={String(activeGoals.length)}
            sub={activeGoals.length ? `${avgGoalPct}% avg progress` : "none active"}
          />
          <StatCard
            icon={<Dumbbell size={17} />} color="text-[hsl(210_80%_48%)]"
            label="Workouts" value={`${wCompleted}/${wPlanned}`}
            sub={wStreak > 0 ? `${wStreak}d streak` : "this week"}
          />
          <StatCard
            icon={<BookOpen size={17} />} color="text-[hsl(25_85%_52%)]"
            label="Reading" value={String(currentBooks.length)}
            sub={rStreak > 0 ? `${rStreak}d streak · ${monthBooks} finished` : `${monthPages} pages this month`}
          />
          <StatCard
            icon={<MapPin size={17} />} color="text-emerald-500"
            label="Spots" value={String(spots.length)}
            sub={wantToVisit.length > 0 ? `${wantToVisit.length} want to visit` : `${favoriteSpots.length} favorites`}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* ── Left column ──────────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Upcoming Events */}
          {visible.events && (
            <Section title="Upcoming Events" icon={<Calendar size={14} className="text-[hsl(var(--cat-travel))]" />} linkHref="/calendar" linkLabel="Calendar">
              {upcomingEvents.length === 0 ? (
                <Empty icon={<Calendar size={26} />} text="No events in the next 2 weeks" />
              ) : (
                <div className="space-y-1.5">
                  {upcomingEvents.map((e) => {
                    const d = daysUntil(e.displayDate);
                    const isToday = d === 0;
                    return (
                      <div key={e.id} className={`flex items-center justify-between py-2 px-3 rounded-lg ${isToday ? "bg-primary/8 border border-primary/20" : "bg-secondary/40"}`}>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{e.title}</p>
                          <p className="text-xs text-muted-foreground">{format(parseISO(e.displayDate), "MMM d")}{e.location ? ` · ${e.location}` : ""}</p>
                        </div>
                        <span className={`text-xs font-semibold shrink-0 px-2 py-0.5 rounded-full border ml-3 ${
                          isToday ? "text-primary bg-primary/10 border-primary/20"
                          : d <= 3 ? "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800"
                          : "text-muted-foreground bg-secondary border-border"
                        }`}>
                          {dayLabel(d)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>
          )}

          {/* Active Goals */}
          {visible.goals && (
            <Section title="Active Goals" icon={<Target size={14} className="text-[hsl(var(--cat-goal))]" />} linkHref="/goals" linkLabel="Goals">
              {activeGoals.length === 0 ? (
                <Empty icon={<Target size={26} />} text="No active goals yet" />
              ) : (
                <div className="space-y-3">
                  {activeGoals.slice(0, 5).map((g) => {
                    const pct = g.progressType === "boolean"
                      ? (g.progressCurrent >= g.progressTarget ? 100 : 0)
                      : g.progressTarget > 0 ? Math.min(100, Math.round((g.progressCurrent / g.progressTarget) * 100)) : 0;
                    const openTasks = (g.tasks ?? []).filter((t: any) => !t.completed).length;
                    return (
                      <div key={g.id} className="p-3 rounded-lg bg-secondary/40 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium truncate">{g.title}</p>
                          <span className="text-xs text-muted-foreground shrink-0 font-semibold">{pct}%</span>
                        </div>
                        <Progress value={pct} className="h-1.5" />
                        {openTasks > 0 && (
                          <p className="text-xs text-muted-foreground">{openTasks} task{openTasks !== 1 ? "s" : ""} remaining</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>
          )}

          {/* Weekly Workouts */}
          {visible.workouts && (
            <Section title="This Week's Workouts" icon={<Dumbbell size={14} className="text-[hsl(210_80%_48%)]" />} linkHref="/workouts" linkLabel="Workouts">
              <div className="grid grid-cols-7 gap-1.5 mb-3">
                {weekDates.map((d) => {
                  const done = weekDone.has(d);
                  const isToday = d === today;
                  const label = format(parseISO(d), "EEE")[0];
                  return (
                    <div key={d} className={`flex flex-col items-center gap-1 p-2 rounded-lg border ${done ? "border-[hsl(210_80%_48%)] bg-[hsl(210_80%_48%/0.1)]" : isToday ? "border-primary bg-primary/5" : "border-border bg-secondary/30"}`}>
                      <span className="text-xs text-muted-foreground font-medium">{label}</span>
                      {done
                        ? <CheckCircle2 size={15} className="text-[hsl(210_80%_48%)]" />
                        : <div className={`w-3.5 h-3.5 rounded-full border-2 ${isToday ? "border-primary" : "border-border"}`} />}
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5"><Flame size={13} className="text-amber-500" />{wStreak}d streak</span>
                <span className="flex items-center gap-1.5"><TrendingUp size={13} />{wCompleted}/{wPlanned} this week</span>
              </div>
              {recentPRs.length > 0 && (
                <div className="mt-3 pt-3 border-t space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Recent PRs</p>
                  {recentPRs.slice(0, 3).map((pr, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400"><Zap size={12} />{pr.exercise}</span>
                      <span className="font-semibold">{pr.weight} lb</span>
                    </div>
                  ))}
                </div>
              )}
              {wLogs.filter((l) => l.completed).length === 0 && (
                <Empty icon={<Dumbbell size={26} />} text="No workouts logged yet this week" />
              )}
            </Section>
          )}

          {/* Empty state if everything in left column is hidden */}
          {!visible.events && !visible.goals && !visible.workouts && (
            <div className="bg-card border rounded-xl p-8 text-center text-muted-foreground">
              <Settings2 size={28} className="mx-auto mb-2 opacity-20" />
              <p className="text-sm">All sections hidden</p>
              <button
                onClick={() => setCustomizing(true)}
                className="text-xs text-primary hover:underline mt-1"
              >
                Customize dashboard
              </button>
            </div>
          )}
        </div>

        {/* ── Right column ──────────────────────────────────────────────── */}
        <div className="space-y-5">

          {/* Currently Reading */}
          {visible.reading && (
            <div className="bg-card border rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <BookOpen size={14} className="text-[hsl(25_85%_52%)]" />
                  <span className="text-sm font-semibold">Currently Reading</span>
                </div>
                <Link href="/reading"><a className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5">All <ChevronRight size={12} /></a></Link>
              </div>
              {currentBooks.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3">No books in progress</p>
              ) : (
                <div className="space-y-3">
                  {currentBooks.slice(0, 2).map((b) => {
                    const pct = bookProgress(b);
                    return (
                      <div key={b.id} className="flex items-start gap-2.5">
                        <div className="w-7 h-9 rounded shrink-0 flex items-center justify-center text-white text-[10px] font-bold" style={{ backgroundColor: b.coverColor || "#1e3a5f" }}>
                          {(b.title[0] || "?").toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate leading-snug">{b.title}</p>
                          {b.author && <p className="text-[10px] text-muted-foreground">{b.author}</p>}
                          <div className="flex items-center gap-1.5 mt-1">
                            <Progress value={pct} className="h-1 flex-1" />
                            <span className="text-[10px] text-muted-foreground shrink-0">{pct}%</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div className="grid grid-cols-3 gap-1.5 pt-1">
                    <MiniStat label="Streak" value={`${rStreak}d`} />
                    <MiniStat label="Pages" value={String(monthPages)} />
                    <MiniStat label="Finished" value={String(monthBooks)} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Featured Quote */}
          {visible.quote && (
            <div className="bg-card border rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <QuoteIcon size={14} className="text-purple-500" />
                  <span className="text-sm font-semibold">Quote</span>
                </div>
                <Link href="/quotes"><a className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5">All <ChevronRight size={12} /></a></Link>
              </div>
              {featuredQuote ? (
                <div className="space-y-2">
                  <p className="text-sm italic leading-relaxed text-foreground/80">
                    &ldquo;{featuredQuote.text}&rdquo;
                  </p>
                  {featuredQuote.author && (
                    <p className="text-xs text-muted-foreground font-medium">— {featuredQuote.author}</p>
                  )}
                  {quotePool.length > 1 && (
                    <button
                      onClick={() => setQuoteIdx((i) => (i + 1) % quotePool.length)}
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mt-1 transition-colors"
                    >
                      <RefreshCw size={10} /> Next quote
                    </button>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-3">No saved quotes yet</p>
              )}
            </div>
          )}

          {/* Spots to Visit */}
          {visible.spots && (wantToVisit.length > 0 || spots.length === 0) && (
            <div className="bg-card border rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <MapPin size={14} className="text-emerald-500" />
                  <span className="text-sm font-semibold">Places to Visit</span>
                </div>
                <Link href="/spots"><a className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5">All <ChevronRight size={12} /></a></Link>
              </div>
              {wantToVisit.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3">No places on your list yet</p>
              ) : (
                <div className="space-y-2">
                  {wantToVisit.slice(0, 4).map((s) => (
                    <div key={s.id} className="flex items-center gap-2.5 py-1">
                      <span className="text-base shrink-0">{SPOT_EMOJIS[s.type] ?? "📍"}</span>
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{s.name}</p>
                        {(s.neighborhood || s.city) && (
                          <p className="text-[10px] text-muted-foreground truncate">
                            {[s.neighborhood, s.city].filter(Boolean).join(", ")}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                  {wantToVisit.length > 4 && (
                    <p className="text-xs text-muted-foreground pt-1">+{wantToVisit.length - 4} more</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Due Soon */}
          {visible.due_soon && (dueSoon.length > 0 || dueChores.length > 0 || dueSubs.length > 0) && (
            <div className="bg-card border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle size={14} className="text-amber-500" />
                <span className="text-sm font-semibold">Due Soon</span>
              </div>
              <div className="space-y-2.5">
                {dueChores.map((c) => (
                  <div key={`chore-${c.id}`} className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Home size={11} className="text-muted-foreground shrink-0" />
                      <p className="text-xs font-medium truncate">{c.title}</p>
                    </div>
                    <span className={`text-xs font-semibold shrink-0 ${(c.daysLeft ?? 1) < 0 ? "text-red-500" : (c.daysLeft ?? 1) === 0 ? "text-orange-500" : "text-yellow-600 dark:text-yellow-400"}`}>
                      {dayLabel(c.daysLeft)}
                    </span>
                  </div>
                ))}
                {dueSoon.slice(0, 4).map((item, i) => (
                  <div key={`task-${i}`} className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <CheckCircle2 size={11} className="text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{item.title}</p>
                        <p className="text-[10px] text-muted-foreground">{item.source}</p>
                      </div>
                    </div>
                    <span className="text-xs text-amber-600 dark:text-amber-400 shrink-0">{dayLabel(daysUntil(item.due))}</span>
                  </div>
                ))}
                {dueSubs.map((s) => (
                  <div key={`sub-${s.id}`} className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <CreditCard size={11} className="text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{(s as any).name}</p>
                        <p className="text-[10px] text-muted-foreground">${(s as any).amount?.toFixed(2)}</p>
                      </div>
                    </div>
                    <span className="text-xs text-blue-600 dark:text-blue-400 shrink-0">{dayLabel(s.daysLeft)}</span>
                  </div>
                ))}
              </div>
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
      <div className="space-y-2">
        {items.map((item) => (
          <FeedCard key={item.id} item={item} currentUserId={currentUserId} />
        ))}
      </div>
      {hasMore && (
        <button
          onClick={() => setPage((p) => p + 1)}
          className="mt-3 w-full text-xs text-muted-foreground hover:text-foreground border rounded-lg py-1.5 hover:bg-secondary transition-colors"
        >
          Load more
        </button>
      )}
    </div>
  );
}

// ── MyRecentActivity component ────────────────────────────────────────────────

function MyRecentActivity() {
  const { data, isLoading } = useQuery<FeedItem[]>({
    queryKey: ["/api/feed/mine"],
    queryFn: () => fetch("/api/feed/mine").then((r) => r.json()),
  });

  return (
    <div className="bg-card border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Clock size={14} className="text-primary" />
        <span className="text-sm font-semibold">My Recent Activity</span>
      </div>
      {isLoading && <p className="text-xs text-muted-foreground">Loading...</p>}
      {!isLoading && (!data || data.length === 0) && (
        <p className="text-xs text-muted-foreground text-center py-4">No recent activity. Start adding items!</p>
      )}
      {data && data.length > 0 && (
        <div className="space-y-1.5">
          {data.map((item) => (
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
