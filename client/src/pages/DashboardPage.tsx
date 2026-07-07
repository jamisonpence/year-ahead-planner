import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import {
  Calendar, BookOpen, Dumbbell, Target, Plus, Flame,
  CheckCircle2, AlertTriangle, ChevronRight, ArrowRight,
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
  GoalWithProjects, Chore, Spot, Quote, Subscription, NutritionGoal, WorkoutPlan, ReadingGoal, Mantra,
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
import { confettiBurst } from "@/lib/confetti";
import { History } from "lucide-react";
import { loadIntentions, INTENTIONS, type IntentionKey } from "@/components/OnboardingModal";

// Intention → quick-link config
const INTENTION_LINKS: Record<IntentionKey, { emoji: string; label: string; href: string }> = {
  goal:            { emoji: "🎯", label: "Set a goal",       href: "/goals"    },
  habit:           { emoji: "✅", label: "Add a habit",      href: "/habits"   },
  plan_week:       { emoji: "📅", label: "Plan this week",   href: "/review"   },
  save_recs:       { emoji: "⭐", label: "Save something",   href: "/library"  },
  track_workouts:  { emoji: "💪", label: "Log a workout",    href: "/health"   },
  organize_places: { emoji: "📍", label: "Add a place",      href: "/places"   },
  connect_friends: { emoji: "👥", label: "Add someone",      href: "/people"   },
  private_notes:   { emoji: "📝", label: "Write an entry",   href: "/journal"  },
};

// ── Section config ─────────────────────────────────────────────────────────────

type SectionId = "today" | "focus" | "up_next" | "needs_attention" | "progress" | "social_feed" | "events" | "recent_activity" | "quick_jump" | "day_planner" | "memories" | "quote";

const SECTION_LABELS: Record<SectionId, string> = {
  today:            "Right Now",
  focus:            "Focus",
  up_next:          "Up Next",
  needs_attention:  "Needs Attention",
  progress:         "Progress",
  social_feed:      "Friend Highlights",
  events:           "Later This Month",
  recent_activity:  "Recent Activity",
  quick_jump:       "Quick Jump",
  day_planner:      "AI Day Planner",
  memories:         "On This Day",
  quote:            "Quote",
};
// (the "events" section shows only items beyond the Up Next 7-day window,
// so the two sections never duplicate each other)

const SECTION_ORDER: SectionId[] = ["today", "focus", "up_next", "progress", "social_feed", "needs_attention", "events", "recent_activity", "quick_jump", "day_planner", "memories", "quote"];

const ALL_ON: Record<SectionId, boolean> = {
  today: true, up_next: true, needs_attention: true, progress: true,
  social_feed: true, events: true, recent_activity: true, quick_jump: true, day_planner: false,
  memories: true, focus: true, quote: true,
};

const DEFAULT_VISIBLE: Record<SectionId, boolean> = {
  today: true, focus: true, up_next: true, progress: true, social_feed: true,
  needs_attention: false, events: false, recent_activity: false, quick_jump: false,
  day_planner: false, memories: false, quote: false,
};

// Persona-matched first-run defaults.
// Applied only when dashboard_sections_v2 is absent (user has never customized).
// Each entry is a full override of DEFAULT_VISIBLE.
const PERSONA_SECTION_DEFAULTS: Record<string, Record<SectionId, boolean>> = {
  // Build Momentum: Today tasks/habits, weekly focus, up next, goal progress
  momentum: {
    today: true, focus: true, up_next: true, progress: true,
    social_feed: false, needs_attention: false, events: false,
    recent_activity: false, quick_jump: false, day_planner: false, memories: false, quote: false,
  },
  // Health & Energy: Today (workout items), focus, habits + goal progress, recent activity for logs
  health: {
    today: true, focus: true, up_next: true, progress: true, recent_activity: true,
    social_feed: false, needs_attention: false, events: false,
    quick_jump: false, day_planner: false, memories: false, quote: false,
  },
  // Save & Explore Life: recent saves, friend highlights (sharing), up next, memories, a daily quote
  explore_life: {
    today: false, focus: false, social_feed: true, recent_activity: true,
    up_next: true, memories: true, quote: true,
    needs_attention: false, progress: false, events: false,
    quick_jump: false, day_planner: false,
  },
  // Connect with People: friend highlights, today (shared events), recent activity, quick jump
  connect: {
    today: true, social_feed: true, recent_activity: true, quick_jump: true,
    up_next: true, focus: false, progress: false,
    needs_attention: false, events: false, memories: false, quote: false, day_planner: false,
  },
};

// ── On This Day (memories resurfacing) ────────────────────────────────────────
function OnThisDay() {
  const { data } = useQuery<{ items: Array<{ type: string; emoji: string; href: string; id: number; title: string; sub: string | null; date: string; when: string }> }>({
    queryKey: ["/api/on-this-day"],
    queryFn: () => apiRequest("GET", "/api/on-this-day").then(r => r.json()),
  });
  if (!data || data.items.length === 0) return null;
  return (
    <div className="bg-card border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <History size={14} className="text-amber-500" />
        <span className="text-sm font-semibold">On This Day</span>
      </div>
      <div className="space-y-2">
        {data.items.map((it) => (
          <Link key={`${it.type}-${it.id}`} href={it.href}>
            <a className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-secondary/50 transition-colors">
              <span className="text-base leading-none mt-0.5">{it.emoji}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm truncate">{it.title}</span>
                <span className="block text-[11px] text-muted-foreground truncate">
                  {it.when}{it.sub ? ` · ${it.sub}` : ""}
                </span>
              </span>
            </a>
          </Link>
        ))}
      </div>
    </div>
  );
}

function loadVisibility(): Record<SectionId, boolean> {
  try {
    const raw = localStorage.getItem("dashboard_sections_v2");
    if (raw) {
      const parsed = JSON.parse(raw);
      // Migrate users who had the old all-on default saved before DEFAULT_VISIBLE was introduced
      const wasOldDefault =
        parsed &&
        typeof parsed === "object" &&
        !("focus" in parsed) &&
        Object.entries(parsed).every(([key, value]) => ALL_ON[key as SectionId] === value);
      if (wasOldDefault) return { ...DEFAULT_VISIBLE };
      return { ...DEFAULT_VISIBLE, ...parsed };
    }
    // No saved customization — apply persona-specific defaults for new users
    const persona = localStorage.getItem("mylifos_onboarding_persona") ?? "";
    if (persona in PERSONA_SECTION_DEFAULTS) {
      return { ...PERSONA_SECTION_DEFAULTS[persona] };
    }
  } catch {}
  return { ...DEFAULT_VISIBLE };
}

function saveVisibility(v: Record<SectionId, boolean>) {
  try { localStorage.setItem("dashboard_sections_v2", JSON.stringify(v)); } catch {}
}

function goalProgressPct(g: GoalWithProjects): number {
  if (g.progressType === "boolean") return g.progressCurrent >= g.progressTarget ? 100 : 0;
  return g.progressTarget > 0 ? Math.min(100, Math.round((g.progressCurrent / g.progressTarget) * 100)) : 0;
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
  const [completedMoment, setCompletedMoment] = useState<{ title: string; context: string; type: string } | null>(null);
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
  // (habit done-state comes from /api/habits completions — there is no habit-logs endpoint)
  const { data: standaloneProjects = [] } = useQuery<any[]>({ queryKey: ["/api/projects/standalone"] });

  const today = todayStr();
  const dayOfWeek = new Date().getDay(); // 0=Sun, 5=Fri
  const isReviewDay = dayOfWeek === 0 || dayOfWeek === 5;
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

  // ── Actionable Today: complete items inline (#6) ────────────────────────────
  const qcToday = useQueryClient();
  const { toast: todayToast } = useToast();
  function choreNextDue(frequency: string, customDays?: number | null): string {
    const daysMap: Record<string, number> = { daily: 1, weekly: 7, biweekly: 14, monthly: 30, quarterly: 91, yearly: 365 };
    const days = frequency === "custom" ? (customDays ?? 7) : (daysMap[frequency] ?? 7);
    const d = new Date(); d.setDate(d.getDate() + days);
    return d.toLocaleDateString("en-CA");
  }
  const completeItem = useMutation({
    mutationFn: async (action: { type: string; id: number; frequency?: string; customFrequencyDays?: number | null; title?: string; context?: string }) => {
      if (action.type === "habit") return apiRequest("POST", `/api/habits/${action.id}/complete/${today}`, {});
      if (action.type === "general") return apiRequest("PATCH", `/api/general-tasks/${action.id}`, { completed: true });
      if (action.type === "project") return apiRequest("PATCH", `/api/project-tasks/${action.id}`, { completed: true });
      if (action.type === "chore") {
        return apiRequest("PATCH", `/api/chores/${action.id}`, {
          lastCompleted: today,
          ...(action.frequency === "as_needed" ? {} : { nextDue: choreNextDue(action.frequency!, action.customFrequencyDays) }),
        });
      }
      throw new Error("unknown");
    },
    onSuccess: (_r, action) => {
      for (const key of ["/api/habits", "/api/general-tasks", "/api/chores", "/api/goals", "/api/projects/standalone"]) {
        qcToday.invalidateQueries({ queryKey: [key] });
      }
      confettiBurst({ particles: 28, originY: 0.3 });
      setCompletedMoment({
        title: action.title ?? (action.type === "habit" ? "Habit" : action.type === "chore" ? "Chore" : "Task"),
        context: action.context ?? (action.type === "project" ? "Project moved forward" : action.type === "habit" ? "Momentum kept" : "Progress made"),
        type: action.type,
      });
      todayToast({ title: action.type === "habit" ? "Habit done ⚡" : "Done ✓" });
    },
    onError: () => todayToast({ title: "Couldn't complete that", variant: "destructive" }),
  });

  // ── Weekly focus for the greeting (#11) ─────────────────────────────────────
  const { data: focusData } = useQuery<{ focus: string | null }>({
    queryKey: ["/api/review/focus"],
    queryFn: () => apiRequest("GET", "/api/review/focus").then(r => r.json()),
  });
  const [focusDraft, setFocusDraft] = useState("");
  const [editingFocus, setEditingFocus] = useState(false);
  useEffect(() => {
    setFocusDraft(focusData?.focus ?? "");
  }, [focusData?.focus]);
  const saveFocus = useMutation({
    mutationFn: (focus: string) => apiRequest("PUT", "/api/review/focus", { focus }),
    onSuccess: () => {
      qcToday.invalidateQueries({ queryKey: ["/api/review/focus"] });
      qcToday.invalidateQueries({ queryKey: ["/api/review/weekly"] });
      setEditingFocus(false);
      todayToast({ title: "Focus saved 🎯" });
    },
    onError: () => todayToast({ title: "Couldn't save focus", variant: "destructive" }),
  });
  const hour = new Date().getHours();
  const greeting = hour < 5 ? "Up late" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = authUser?.name?.split(" ")[0] ?? "";

  // ── Streak chips (#12) ──────────────────────────────────────────────────────
  const streakChips: Array<{ key: string; emoji: string; label: string; count: number }> = [
    ...habits
      .filter((h: any) => (h.streakCurrent ?? 0) >= 2)
      .sort((a: any, b: any) => (b.streakCurrent ?? 0) - (a.streakCurrent ?? 0))
      .slice(0, 3)
      .map((h: any) => ({ key: `h-${h.id}`, emoji: "🔥", label: h.title ?? h.name, count: h.streakCurrent })),
    ...(wStreak >= 2 ? [{ key: "workout", emoji: "💪", label: "Workouts", count: wStreak }] : []),
  ];
  const { completed: wCompleted, planned: wPlanned } = weeklyWorkoutStats(wLogs, wTemplates);
  const recentPRs = getRecentPRs(wLogs);
  const weekDates = thisWeekDates();
  const weekDone = new Set(wLogs.filter((l) => l.completed && weekDates.includes(l.date)).map((l) => l.date));
  const todayWorkoutDone = weekDone.has(today);

  // ── Goals ──────────────────────────────────────────────────────────────────
  const activeGoals = goals.filter((g) => !g.completedDate);
  // Rotating vision goal — pick one per day so it feels alive without being noisy
  const visionGoals = goals.filter((g) => (g as any).horizon === "someday" && !g.completedDate);
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  const featuredVision = visionGoals.length > 0 ? visionGoals[dayOfYear % visionGoals.length] : null;

  // ── Intentions (from onboarding) ─────────────────────────────────────────────
  const userIntentions = loadIntentions();

  // ── Mantras ─────────────────────────────────────────────────────────────────
  const { data: mantras = [] } = useQuery<Mantra[]>({
    queryKey: ["/api/mantras"],
    queryFn: () => apiRequest("GET", "/api/mantras").then(r => r.json()),
  });
  const activeMantras = mantras.filter((m) => m.isActive);
  const dailyMantra = activeMantras.length > 0 ? activeMantras[dayOfYear % activeMantras.length] : null;
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
  const goalNextActions: Array<{ goal: GoalWithProjects; project: any; task: any; daysLeft: number | null }> = [];
  goals.forEach((g) => {
    (g.projects ?? []).forEach((p: any) => {
      const openTasks = (p.tasks ?? []).filter((t: any) => !t.completed);
      openTasks.forEach((t: any) => openProjectTasks.push({ ...t, source: p.title ?? g.title }));
      const nextTask = [...openTasks].sort((a: any, b: any) => {
        const ad = a.dueDate ? daysUntil(a.dueDate) ?? 9999 : 9999;
        const bd = b.dueDate ? daysUntil(b.dueDate) ?? 9999 : 9999;
        if (ad !== bd) return ad - bd;
        const priorityRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
        return (priorityRank[a.priority] ?? 1) - (priorityRank[b.priority] ?? 1);
      })[0];
      if (nextTask && p.status !== "done" && p.status !== "blocked") {
        goalNextActions.push({ goal: g, project: p, task: nextTask, daysLeft: nextTask.dueDate ? daysUntil(nextTask.dueDate) : null });
      }
    });
  });
  const primaryNextAction = [...goalNextActions].sort((a, b) => {
    const priorityRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
    const ad = a.daysLeft ?? 9999;
    const bd = b.daysLeft ?? 9999;
    if (ad !== bd) return ad - bd;
    const ap = priorityRank[a.goal.priority] ?? 1;
    const bp = priorityRank[b.goal.priority] ?? 1;
    if (ap !== bp) return ap - bp;
    return goalProgressPct(b.goal) - goalProgressPct(a.goal);
  })[0] ?? null;
  standaloneProjects.forEach((p: any) => {
    (p.tasks ?? []).filter((t: any) => !t.completed).forEach((t: any) => {
      openProjectTasks.push({ ...t, source: p.title });
    });
  });

  // ── Habits ─────────────────────────────────────────────────────────────────
  // Habit done-state derived from the habits' own completions
  const habitDoneOn = (h: any, dateISO: string) =>
    Array.isArray(h.completions) && h.completions.some((c: any) => c.date === dateISO);
  const habitsActiveToday = habits.filter((h: any) => h.isArchived !== true && h.isActive !== false);
  const habitsDueToday    = habitsActiveToday.filter((h: any) => !habitDoneOn(h, today));
  const habitsCompletedToday = habitsActiveToday.filter((h: any) => habitDoneOn(h, today));

  // Yesterday's missed habits
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toLocaleDateString("en-CA");
  const habitsMissedYesterday = habitsActiveToday.filter((h: any) => !habitDoneOn(h, yesterdayStr));

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
  type TodayAction =
    | { type: "general" | "project" | "habit"; id: number; title?: string; context?: string }
    | { type: "chore"; id: number; frequency: string; customFrequencyDays?: number | null; title?: string; context?: string };
  type TodayItem = { key: string; icon: React.ReactNode; label: string; sub?: string; href: string; urgent?: boolean; done?: boolean; action?: TodayAction };
  const todayItems: TodayItem[] = [];
  todayEvents.forEach((e) => todayItems.push({
    key: `ev-${e.id}`, icon: <Calendar size={13} className="text-violet-500" />,
    label: e.title, sub: e.location ?? "Event today", href: "/calendar", urgent: true,
  }));
  allTasksDueToday.forEach((t) => todayItems.push({
    key: `task-${t.id}`, icon: <CheckCircle2 size={13} className="text-blue-500" />,
    label: t.title, sub: t.source ? `from ${t.source}` : "Task due today", href: "/tasks",
    action: t.source ? undefined : { type: "general", id: t.id, title: t.title, context: "Today task completed" },
  }));
  // Habits rendered separately as inline chip section (not in todayItems list)
  choresToday.forEach((c) => todayItems.push({
    key: `chore-${c.id}`, icon: <Home size={13} className="text-amber-500" />,
    label: c.title, sub: "Chore due today", href: "/housekeeping",
    action: { type: "chore", id: c.id, frequency: c.frequency, customFrequencyDays: c.customFrequencyDays, title: c.title, context: "Home moved forward" },
  }));
  // Overdue chores surface here so they're visible even when Needs Attention is off
  choresOverdue.slice(0, 3).forEach((c) => todayItems.push({
    key: `overdue-chore-${c.id}`, icon: <RefreshCw size={13} className="text-red-500" />,
    label: c.title, sub: `Recurring · ${Math.abs(c.daysLeft!)}d overdue`, href: "/housekeeping", urgent: true,
    action: { type: "chore", id: c.id, frequency: c.frequency, customFrequencyDays: c.customFrequencyDays, title: c.title, context: "Overdue chore cleared" },
  }));
  if (!todayWorkoutDone && wPlanned > 0) todayItems.push({
    key: "workout", icon: <Dumbbell size={13} className="text-blue-400" />,
    label: "Log today's workout", sub: `${wCompleted}/${wPlanned} this week`, href: "/workouts",
  });
  openProjectTasks.forEach((t) => todayItems.push({
    key: `proj-task-${t.id}`, icon: <CheckCircle2 size={13} className="text-indigo-500" />,
    label: t.title, sub: t.source ? `Project: ${t.source}` : "Project task", href: "/tasks",
    action: { type: "project", id: t.id, title: t.title, context: t.source ? `Project: ${t.source}` : "Project moved forward" },
  }));
  generalTasksNoDueDate.forEach((t: any) => todayItems.push({
    key: `no-date-task-${t.id}`, icon: <CheckCircle2 size={13} className="text-slate-400" />,
    label: t.title, sub: "No due date", href: "/tasks",
    action: { type: "general", id: t.id, title: t.title, context: "Task completed" },
  }));

  // ── UP NEXT items ──────────────────────────────────────────────────────────
  const upNextEvents = upcomingEvents.filter((e) => e.displayDate > today).slice(0, 4);

  // ── NEEDS ATTENTION ────────────────────────────────────────────────────────
  const attentionItems: TodayItem[] = [];
  allTasksOverdue.slice(0, 4).forEach((t) => attentionItems.push({
    key: `ov-task-${t.id}`, icon: <AlertTriangle size={13} className="text-red-500" />,
    label: t.title, sub: t.source ? `from ${t.source} · overdue` : "Task overdue", href: "/tasks", urgent: true,
    action: t.source ? undefined : { type: "general", id: t.id, title: t.title, context: "Overdue task cleared" },
  }));
  choresOverdue.slice(0, 3).forEach((c) => attentionItems.push({
    key: `ov-chore-${c.id}`, icon: <RefreshCw size={13} className="text-red-500" />,
    label: c.title, sub: `${Math.abs(c.daysLeft!)}d overdue`, href: "/housekeeping", urgent: true,
    action: { type: "chore", id: c.id, frequency: c.frequency, customFrequencyDays: c.customFrequencyDays, title: c.title, context: "Overdue chore cleared" },
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
    { href: "/messenger",     label: "Messages",     icon: <MessageCircle size={15} />, color: "text-sky-500"   },
    { href: "/relationships", label: "Friends",      icon: <Users size={15} />,         color: "text-pink-500"  },
  ];

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto space-y-5">

      {/* ── 1. Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{format(new Date(), "EEEE, MMMM d, yyyy")}</p>
          <h1 className="text-2xl font-bold leading-tight">{greeting}{firstName ? `, ${firstName}` : ""}</h1>
          {streakChips.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {streakChips.map((c) => (
                <span key={c.key} className="inline-flex items-center gap-1 text-xs font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-full px-2.5 py-1">
                  {c.emoji} {c.count}d <span className="font-normal text-muted-foreground">{c.label}</span>
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <div className="hidden sm:flex gap-2 items-center">
            <Link href="/journal">
              <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs">🪞 Review</Button>
            </Link>
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

      {/* ── Weekly review banner (Fri/Sun) ──────────────────────────────── */}
      {isReviewDay && (
        <Link href="/journal">
          <a className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/20 cursor-pointer hover:bg-violet-100 dark:hover:bg-violet-950/30 transition-colors">
            <div className="flex items-center gap-3">
              <span className="text-xl">🪞</span>
              <div>
                <p className="text-sm font-semibold text-violet-900 dark:text-violet-100">Time for your weekly review</p>
                <p className="text-xs text-violet-700 dark:text-violet-300">Reflect on the week, capture what you learned, set your focus.</p>
              </div>
            </div>
            <ChevronRight size={16} className="text-violet-500 shrink-0" />
          </a>
        </Link>
      )}

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
                  <span className="text-sm font-bold">Right Now</span>
                  {habitsCompletedToday.length > 0 && (
                    <span className="text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full font-medium">
                      {habitsCompletedToday.length} habit{habitsCompletedToday.length !== 1 ? "s" : ""} done
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">{todayItems.length} item{todayItems.length !== 1 ? "s" : ""}</span>
              </div>
              {primaryNextAction && (
                <div className="mb-3 rounded-xl border border-violet-200/70 dark:border-violet-800/60 bg-violet-50/70 dark:bg-violet-950/20 p-3">
                  <div className="flex items-start gap-3">
                    <button
                      aria-label={`Mark "${primaryNextAction.task.title}" done`}
                      disabled={completeItem.isPending}
                      onClick={() => completeItem.mutate({
                        type: "project",
                        id: primaryNextAction.task.id,
                        title: primaryNextAction.task.title,
                        context: `${primaryNextAction.goal.title} · ${primaryNextAction.project.title}`,
                      })}
                      className="mt-0.5 shrink-0 w-7 h-7 rounded-full border-2 border-violet-400/60 hover:border-emerald-500 hover:bg-emerald-500/15 flex items-center justify-center transition-colors group"
                    >
                      <CheckCircle2 size={15} className="text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <ArrowRight size={12} className="text-violet-500 shrink-0" />
                        <p className="text-xs font-semibold text-violet-600 dark:text-violet-300 uppercase tracking-wide">Next Action</p>
                      </div>
                      <p className="text-sm font-semibold leading-snug">{primaryNextAction.task.title}</p>
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {primaryNextAction.goal.title} · {primaryNextAction.project.title}
                      </p>
                      {primaryNextAction.goal.description?.trim() && (
                        <p className="text-xs text-violet-700/80 dark:text-violet-200/80 mt-2 line-clamp-2">
                          Why it matters: {primaryNextAction.goal.description.trim()}
                        </p>
                      )}
                    </div>
                    <Link href="/tasks">
                      <a className="shrink-0 text-xs font-medium text-violet-600 dark:text-violet-300 hover:underline">View</a>
                    </Link>
                  </div>
                </div>
              )}
              {completedMoment && (
                <div className="mb-3 rounded-xl border border-emerald-200/80 dark:border-emerald-800/60 bg-emerald-50/80 dark:bg-emerald-950/20 p-3">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 size={18} className="text-emerald-500 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-wide">Progress captured</p>
                      <p className="text-sm font-medium truncate mt-0.5">{completedMoment.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">{completedMoment.context}</p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <Link href="/journal"><a className="text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:underline">Write in Journal</a></Link>
                        <Link href="/goals"><a className="text-xs font-medium text-muted-foreground hover:text-foreground">View Progress</a></Link>
                        <Link href="/messenger"><a className="text-xs font-medium text-muted-foreground hover:text-foreground">Share a win</a></Link>
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label="Dismiss progress card"
                      onClick={() => setCompletedMoment(null)}
                      className="text-muted-foreground hover:text-foreground shrink-0"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              )}
              {todayItems.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle2 size={28} className="mx-auto mb-2 text-emerald-500 opacity-60" />
                  <p className="text-sm font-medium text-foreground">You're all caught up!</p>
                  <p className="text-xs mt-1">Nothing urgent on the schedule today.</p>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                  {todayItems.map((item) => (
                    <div key={item.key} className={`flex items-center gap-2.5 px-3 py-2 rounded-xl transition-colors hover:bg-secondary/60 ${item.urgent ? "bg-red-50/50 dark:bg-red-950/20 border border-red-200/50 dark:border-red-800/50" : "bg-secondary/30"}`}>
                      {item.action ? (
                        <button
                          aria-label={`Mark "${item.label}" done`}
                          disabled={completeItem.isPending}
                          onClick={() => completeItem.mutate(item.action!)}
                          className="shrink-0 w-6 h-6 -ml-0.5 rounded-full border-2 border-muted-foreground/40 hover:border-emerald-500 hover:bg-emerald-500/15 flex items-center justify-center transition-colors group"
                        >
                          <CheckCircle2 size={13} className="text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      ) : (
                        <span className="shrink-0 w-6 flex justify-center">{item.icon}</span>
                      )}
                      <Link href={item.href}>
                        <a className="flex-1 min-w-0 flex items-center gap-2">
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm font-medium truncate">{item.label}</span>
                            {item.sub && <span className="block text-xs text-muted-foreground">{item.sub}</span>}
                          </span>
                          <ChevronRight size={13} className="text-muted-foreground shrink-0" />
                        </a>
                      </Link>
                    </div>
                  ))}
                </div>
              )}
              {/* ── Inline habit completion ── */}
              {habitsActiveToday.length > 0 && (
                <div className={todayItems.length > 0 ? "mt-3 pt-3 border-t border-border/50" : ""}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Habits</span>
                    <span className="text-xs text-muted-foreground">
                      {habitsCompletedToday.length}/{habitsActiveToday.length} done
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {habitsDueToday.map((h: any) => (
                      <button
                        key={h.id}
                        onClick={() => completeItem.mutate({ type: "habit", id: h.id, title: h.name ?? h.title, context: "Habit momentum kept" })}
                        disabled={completeItem.isPending}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-border bg-secondary/40 hover:bg-emerald-50 hover:border-emerald-300 dark:hover:bg-emerald-950/30 dark:hover:border-emerald-700 text-xs font-medium transition-colors"
                      >
                        <span className="text-sm leading-none">{h.emoji || "✅"}</span>
                        <span className="text-foreground/80">{h.name ?? h.title}</span>
                      </button>
                    ))}
                    {habitsCompletedToday.map((h: any) => (
                      <div
                        key={h.id}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/20 text-xs"
                      >
                        <span className="text-sm leading-none">{h.emoji || "✅"}</span>
                        <span className="text-emerald-700 dark:text-emerald-300 line-through opacity-70">{h.name ?? h.title}</span>
                        <CheckCircle2 size={10} className="text-emerald-500 shrink-0" />
                      </div>
                    ))}
                  </div>
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

          {/* ── FOCUS ─────────────────────────────────────────────────────── */}
          {visible.focus && (
            <div className="bg-card border rounded-xl p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <Target size={14} className="text-violet-500" />
                  <span className="text-sm font-semibold">Focus</span>
                </div>
                <Link href="/journal"><a className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5">Journal <ChevronRight size={12} /></a></Link>
              </div>
              {focusData?.focus && !editingFocus ? (
                <div className="rounded-xl border border-violet-200/70 dark:border-violet-800/60 bg-violet-50/70 dark:bg-violet-950/20 px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-violet-600 dark:text-violet-300 uppercase tracking-wide mb-1">This week</p>
                      <p className="text-sm font-medium leading-snug">{focusData.focus}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingFocus(true)}
                      className="text-xs font-medium text-violet-600 dark:text-violet-300 hover:underline shrink-0"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl bg-secondary/30 px-3 py-3 space-y-2.5">
                  <div>
                    <p className="text-sm font-medium">Pick one thing to move forward this week.</p>
                    <p className="text-xs text-muted-foreground mt-1">Today will keep it visible while you plan and work.</p>
                  </div>
                  <textarea
                    value={focusDraft}
                    onChange={(e) => setFocusDraft(e.target.value)}
                    rows={2}
                    placeholder="e.g. Finish the first version of my workout plan"
                    className="w-full text-sm border rounded-lg bg-background p-2.5 focus:outline-none focus:ring-2 focus:ring-violet-400/30 resize-none"
                  />
                  <div className="flex items-center gap-2 justify-end">
                    {editingFocus && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setEditingFocus(false); setFocusDraft(focusData?.focus ?? ""); }}
                        className="h-8 text-xs"
                      >
                        Cancel
                      </Button>
                    )}
                    <Button
                      size="sm"
                      onClick={() => saveFocus.mutate(focusDraft)}
                      disabled={saveFocus.isPending || !focusDraft.trim()}
                      className="gap-1.5 h-8 text-xs"
                    >
                      <Check size={12} /> {saveFocus.isPending ? "Saving..." : "Save Focus"}
                    </Button>
                  </div>
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
                  <div key={item.key} className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors">
                    {item.action ? (
                      <button
                        aria-label={`Mark "${item.label}" done`}
                        disabled={completeItem.isPending}
                        onClick={() => completeItem.mutate(item.action!)}
                        className="shrink-0 w-6 h-6 -ml-0.5 rounded-full border-2 border-muted-foreground/40 hover:border-emerald-500 hover:bg-emerald-500/15 flex items-center justify-center transition-colors group"
                      >
                        <CheckCircle2 size={13} className="text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    ) : (
                      <span className="shrink-0 w-6 flex justify-center">{item.icon}</span>
                    )}
                    <Link href={item.href}>
                      <a className="flex-1 min-w-0 flex items-center gap-2">
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-medium truncate">{item.label}</span>
                          {item.sub && <span className="block text-xs text-muted-foreground">{item.sub}</span>}
                        </span>
                        <ChevronRight size={13} className="text-muted-foreground shrink-0" />
                      </a>
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* ── Right column (secondary) ────────────────────────────────────── */}
        <div className="space-y-5">

          {/* ── DREAM (rotating vision goal) ───────────────────────────────── */}
          {featuredVision && (
            <Link href="/goals">
              <a className="block bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/20 border border-violet-200 dark:border-violet-800 rounded-xl p-4 hover:shadow-sm transition-shadow">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles size={13} className="text-violet-500 shrink-0" />
                  <span className="text-[10px] font-semibold text-violet-500 uppercase tracking-wider">Dream</span>
                </div>
                <p className="text-sm font-semibold leading-snug text-foreground line-clamp-2">{featuredVision.title}</p>
                {(featuredVision as any).description && (
                  <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{(featuredVision as any).description}</p>
                )}
                <p className="text-xs text-violet-500 mt-2">Vision →</p>
              </a>
            </Link>
          )}

          {/* ── FOCUS (intentions-based quick links) ───────────────────────── */}
          {userIntentions.length > 0 && (
            <div className="bg-card border rounded-xl p-4 space-y-2.5">
              <p className="text-[10px] font-semibold text-primary uppercase tracking-wider">✨ Your Focus</p>
              <div className="space-y-1.5">
                {userIntentions.map(key => {
                  const link = INTENTION_LINKS[key];
                  if (!link) return null;
                  return (
                    <Link key={key} href={link.href}>
                      <a className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-secondary/50 hover:bg-primary/8 hover:text-primary transition-colors group">
                        <span className="text-base leading-none shrink-0">{link.emoji}</span>
                        <span className="text-sm font-medium flex-1">{link.label}</span>
                        <ChevronRight size={13} className="text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                      </a>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── MANTRA ─────────────────────────────────────────────────────── */}
          {dailyMantra && (
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/10 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
              <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-2">🔥 Today's Mantra</p>
              <p className="text-sm font-medium leading-relaxed text-foreground italic">"{dailyMantra.text}"</p>
              {dailyMantra.intention && (
                <p className="text-xs text-muted-foreground mt-1.5">{dailyMantra.intention}</p>
              )}
            </div>
          )}

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
                {/* Goals summary — momentum framing, not an average-shame stat */}
                {activeGoals.length > 0 && (() => {
                  const moving = activeGoals.filter((g: any) => (g.progressCurrent ?? 0) > 0).length;
                  return (
                    <Link href="/goals">
                      <a className="flex items-center justify-between py-1 hover:opacity-80 transition-opacity">
                        <div className="flex items-center gap-2 min-w-0">
                          <Target size={13} className="text-amber-500 shrink-0" />
                          <span className="text-xs font-medium">{activeGoals.length} goal{activeGoals.length !== 1 ? "s" : ""}</span>
                        </div>
                        <span className="text-xs font-semibold text-muted-foreground">
                          {moving > 0 ? `${moving} moving` : "pick one to start"}
                        </span>
                      </a>
                    </Link>
                  );
                })()}
                {/* Projects — surface the ones actually in motion */}
                {totalActiveProjects > 0 && (() => {
                  const inMotion = [...activeProjects, ...goalProjects].filter((p: any) => p.status === "in_progress").length;
                  return (
                    <Link href="/tasks">
                      <a className="flex items-center justify-between py-1 hover:opacity-80 transition-opacity">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 size={13} className="text-blue-500 shrink-0" />
                          <span className="text-xs font-medium">{inMotion > 0 ? `${inMotion} project${inMotion !== 1 ? "s" : ""} in progress` : `${totalActiveProjects} project${totalActiveProjects !== 1 ? "s" : ""}`}</span>
                        </div>
                        <ChevronRight size={12} className="text-muted-foreground" />
                      </a>
                    </Link>
                  );
                })()}
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

          {/* ── FRIEND HIGHLIGHTS ──────────────────────────────────────────── */}
          {visible.social_feed && <SocialFeed currentUserId={authUser?.id} />}

          {/* ── UPCOMING EVENTS (compact) ──────────────────────────────────── */}
          {visible.events && upcomingEvents.filter((e) => daysUntil(e.displayDate) > 7).length > 0 && (
            <div className="bg-card border rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Calendar size={14} className="text-violet-500" />
                  <span className="text-sm font-semibold">Later This Month</span>
                </div>
                <Link href="/calendar"><a className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5">All <ChevronRight size={12} /></a></Link>
              </div>
              <div className="space-y-1.5">
                {upcomingEvents.filter((ev) => daysUntil(ev.displayDate) > 7).slice(0, 4).map((e) => {
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
          {visible.memories && <OnThisDay />}

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
          {visible.quote && featuredQuote && (
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
  artist: <Music size={14} />,
  recipe: <ChefHat size={14} />,
  spot:   <MapPin size={14} />,
  quote:  <QuoteIcon size={14} />,
  workout:<Dumbbell size={14} />,
  goal:   <Target size={14} />,
};

const ITEM_TYPE_HREFS: Record<string, string> = {
  book: "/library",
  movie: "/library?tab=watching",
  song: "/library?tab=music",
  artist: "/library?tab=music",
  recipe: "/health?tab=recipes",
  spot: "/places",
  workout: "/health",
  goal: "/goals",
  quote: "/quotes",
};

function friendFirstName(name: string) {
  return name.split(" ")[0] || name;
}

function highlightContext(item: FeedItem): { badge: string; headline: string; prompt: string } {
  const friend = friendFirstName(item.user.name);
  const title = item.itemTitle ?? "something new";
  const type = item.itemType ?? "";

  if (item.activityType === "book_finished") {
    return {
      badge: "Progress",
      headline: `${friend} finished ${title}`,
      prompt: "A good moment to cheer them on or ask if it is worth saving.",
    };
  }
  if (item.activityType === "recommendation_received") {
    return {
      badge: "For you",
      headline: `${friend} recommended ${title}`,
      prompt: "Save it, ask why they picked it, or recommend something back.",
    };
  }
  if (type === "spot") {
    return {
      badge: "Shared place",
      headline: `${friend} saved ${title}`,
      prompt: "Places are better with context. Ask what they liked or save it for later.",
    };
  }
  if (type === "recipe") {
    return {
      badge: "Food idea",
      headline: `${friend} saved ${title}`,
      prompt: "Useful if it fits your meals. Save it or send a recipe back.",
    };
  }
  if (type === "song" || type === "artist") {
    return {
      badge: "Shared taste",
      headline: `${friend} likes ${title}`,
      prompt: "A light way to reconnect around music you may both enjoy.",
    };
  }
  if (type === "workout" || item.activityType.includes("workout")) {
    return {
      badge: "Healthy nudge",
      headline: `${friend} logged ${title}`,
      prompt: "Cheer the effort or ask what helped them get it done.",
    };
  }
  if (type === "goal" || item.activityType.includes("goal")) {
    return {
      badge: "Goal progress",
      headline: `${friend} made progress on ${title}`,
      prompt: "Support beats scrolling. Send a quick cheer or ask about the next step.",
    };
  }
  if (type === "book" || type === "movie") {
    return {
      badge: "Shared interest",
      headline: `${friend} saved ${title}`,
      prompt: "See if your taste overlaps, then save it or ask about it.",
    };
  }
  return {
    badge: "Friend update",
    headline: `${friend} added ${title}`,
    prompt: "Keep it lightweight: cheer, ask, save, or recommend something back.",
  };
}

function askPromptFor(item: FeedItem) {
  const type = item.itemType ?? "";
  if (type === "book") return "How was it?";
  if (type === "recipe") return "Would you make this again?";
  if (type === "spot") return "What did you like about this place?";
  if (type === "song" || type === "artist") return "What should I listen to first?";
  if (type === "workout" || item.activityType.includes("workout")) return "What helped you get this done?";
  if (type === "goal" || item.activityType.includes("goal")) return "What is your next step?";
  return "Tell me more about this.";
}

function isSupportiveHighlight(item: FeedItem) {
  const type = item.itemType ?? "";
  return [
    "book",
    "movie",
    "song",
    "artist",
    "recipe",
    "spot",
    "workout",
    "goal",
  ].includes(type)
    || item.activityType === "book_finished"
    || item.activityType === "recommendation_received"
    || item.activityType.includes("workout")
    || item.activityType.includes("goal");
}

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

const REACTION_EMOJIS = ["🎉", "❤️"];

function FeedCard({ item, currentUserId }: { item: FeedItem; currentUserId?: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showCommentBox, setShowCommentBox] = useState(false);
  const [showAllComments, setShowAllComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const context = highlightContext(item);
  const saveHref = ITEM_TYPE_HREFS[item.itemType ?? ""] ?? "/discover";

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

  const handleAsk = () => {
    const prompt = askPromptFor(item);
    commentMutation.mutate(prompt);
    toast({ title: "Asked about it" });
  };

  const visibleComments = showAllComments ? item.comments : item.comments.slice(-2);

  return (
    <div className="bg-background border rounded-xl p-3 space-y-3">
      <div className="flex items-start gap-2">
        <UserAvatar user={item.user} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold">{item.user.name}</span>
            <span className="text-[10px] bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 rounded px-1.5 py-0.5 font-medium">
              {context.badge}
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground">{timeAgo(item.createdAt)}</p>
        </div>
      </div>

      <div className="pl-10 space-y-2">
        <div className="flex items-center gap-2">
          {item.itemImageUrl ? (
            <img src={item.itemImageUrl} alt={item.itemTitle ?? context.headline} className="w-12 h-12 rounded-md object-cover shrink-0" />
          ) : (
            <div className="w-12 h-12 rounded-md bg-secondary flex items-center justify-center text-muted-foreground shrink-0">
              {item.itemType ? ITEM_TYPE_ICONS[item.itemType] ?? <Star size={14} /> : <Star size={14} />}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{context.headline}</p>
            <p className="text-[11px] text-muted-foreground line-clamp-2">{context.prompt}</p>
            {item.itemSubtitle && <p className="text-[10px] text-muted-foreground truncate mt-0.5">{item.itemSubtitle}</p>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => reactMutation.mutate("🎉")}
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border transition-colors ${myReactions.has("🎉") ? "bg-primary/10 border-primary/30 text-primary" : "border-border hover:bg-secondary"}`}
          >
            <span>🎉</span>
            <span>Cheer</span>
            {reactionCounts["🎉"] > 0 && <span className="font-medium">{reactionCounts["🎉"]}</span>}
          </button>
          <button
            onClick={handleAsk}
            disabled={commentMutation.isPending}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-full border border-border hover:bg-secondary disabled:opacity-50 transition-colors"
          >
            <MessageCircle size={11} />
            Ask about it
          </button>
          <Link href={saveHref}>
            <a className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-full border border-border hover:bg-secondary transition-colors">
              <BookMarked size={11} />
              Save this
            </a>
          </Link>
          <Link href={`/profile/${item.user.id}`}>
            <a className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-full border border-border hover:bg-secondary transition-colors">
              <Send size={11} />
              Recommend back
            </a>
          </Link>
        </div>
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

function InviteFriendCTA() {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <button
      onClick={async () => {
        setBusy(true);
        try {
          const { url } = await apiRequest("POST", "/api/invites").then((r) => r.json());
          await navigator.clipboard.writeText(url);
          toast({ title: "Invite link copied!", description: "Anyone who joins through it becomes your friend automatically." });
        } catch {
          toast({ title: "Couldn't create invite link", variant: "destructive" });
        } finally { setBusy(false); }
      }}
      disabled={busy}
      className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-violet-400/40 text-violet-500 text-xs font-medium hover:bg-violet-500/5 disabled:opacity-50 transition-colors"
    >
      🔗 Invite a friend — copy your link
    </button>
  );
}

function SocialFeed({ currentUserId }: { currentUserId?: number }) {
  const page = 1;
  const { data, isLoading } = useQuery<{ items: FeedItem[]; hasFriends: boolean; page: number; total: number } | { items: never[]; hasFriends: false }>({
    queryKey: ["/api/feed", page],
    queryFn: () => fetch(`/api/feed?page=${page}`).then((r) => r.json()),
  });
  void 0; // (own-activity fallback removed — friends' feed stays friends-only)

  if (isLoading) {
    return (
      <div className="bg-card border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Users size={14} className="text-primary" />
          <span className="text-sm font-semibold">Friend Highlights</span>
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
          <span className="text-sm font-semibold">Friend Highlights</span>
        </div>
        <div className="text-center py-4 text-muted-foreground">
          <Users size={24} className="opacity-20 mx-auto mb-2" />
          <p className="text-xs mb-2">Add friends to see their activity</p>
          <Link href="/relationships"><a className="text-xs text-primary hover:underline">Go to Friends</a></Link>
        </div>
      </div>
    );
  }

  // Friend Highlights should show friends — not yourself
  const items = ((data as any).items as FeedItem[])
    .filter((it: any) => (it.user?.id ?? it.userId) !== currentUserId)
    .filter(isSupportiveHighlight)
    .slice(0, 5);

  if (items.length === 0) {
    // Show own recent activity as fallback
    return (
      <div className="bg-card border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Users size={14} className="text-primary" />
          <span className="text-sm font-semibold">Friend Highlights</span>
        </div>
        <p className="text-xs text-muted-foreground text-center pt-2 pb-3">
          Your feed is quiet — activity from friends shows up here.
        </p>
        <InviteFriendCTA />
      </div>
    );
  }

  return (
    <div className="bg-card border rounded-xl p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-2">
          <Users size={14} className="text-primary mt-0.5" />
          <div>
            <span className="text-sm font-semibold">Friend Highlights</span>
            <p className="text-xs text-muted-foreground mt-0.5">Supportive updates based on interests, progress, and recommendations.</p>
          </div>
        </div>
        <Link href="/people?tab=discover">
          <a className="text-xs text-primary hover:underline shrink-0">Discover</a>
        </Link>
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <FeedCard key={item.id} item={item} currentUserId={currentUserId} />
        ))}
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
