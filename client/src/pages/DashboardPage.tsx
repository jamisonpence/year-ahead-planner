import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { format, parseISO } from "date-fns";
import {
  Calendar, BookOpen, Dumbbell, Target, Plus, Flame,
  CheckCircle2, AlertTriangle, ChevronRight,
  BookMarked, Zap, Home, RefreshCw, MapPin, Quote as QuoteIcon,
  CreditCard, TrendingUp, Heart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
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

export default function DashboardPage() {
  const [addEvent, setAddEvent] = useState(false);
  const [addBook, setAddBook] = useState(false);
  const [addSession, setAddSession] = useState(false);
  const [addWorkout, setAddWorkout] = useState(false);
  const [quoteIdx, setQuoteIdx] = useState(() => Math.floor(Math.random() * 1000));

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

  // ── Events ────────────────────────────────────────────────────────────────
  const upcomingEvents = events
    .map((e) => ({ ...e, displayDate: e.recurring !== "none" ? nextOccurrence(e.date, e.recurring) : e.date }))
    .filter((e) => { const d = daysUntil(e.displayDate); return d >= 0 && d <= 14; })
    .sort((a, b) => a.displayDate.localeCompare(b.displayDate))
    .slice(0, 6);

  const todayEvents = upcomingEvents.filter((e) => e.displayDate === today);

  // ── Reading ───────────────────────────────────────────────────────────────
  const currentBooks = books.filter((b) => b.status === "current");
  const rStreak = readingStreak(allSessions);
  const { pagesRead: monthPages, booksFinished: monthBooks } = monthlyReadingStats(allSessions, books);

  // ── Workouts ──────────────────────────────────────────────────────────────
  const wStreak = workoutStreak(wLogs);
  const { completed: wCompleted, planned: wPlanned } = weeklyWorkoutStats(wLogs, wTemplates);
  const recentPRs = getRecentPRs(wLogs);
  const weekDates = thisWeekDates();
  const weekDone = new Set(wLogs.filter((l) => l.completed && weekDates.includes(l.date)).map((l) => l.date));

  // ── Goals ─────────────────────────────────────────────────────────────────
  const activeGoals = goals.filter((g) => !g.completedDate);
  const avgGoalPct = activeGoals.length
    ? Math.round(activeGoals.reduce((sum, g) => {
        const pct = g.progressType === "boolean"
          ? (g.progressCurrent >= g.progressTarget ? 100 : 0)
          : g.progressTarget > 0 ? Math.min(100, Math.round((g.progressCurrent / g.progressTarget) * 100)) : 0;
        return sum + pct;
      }, 0) / activeGoals.length)
    : 0;

  // ── Spots ─────────────────────────────────────────────────────────────────
  const wantToVisit = spots.filter((s) => s.status === "want_to_visit");
  const favoriteSpots = spots.filter((s) => s.isFavorite);

  // ── Quotes ────────────────────────────────────────────────────────────────
  const favoriteQuotes = quotes.filter((q) => q.isFavorite);
  const quotePool = favoriteQuotes.length > 0 ? favoriteQuotes : quotes;
  const featuredQuote = quotePool.length > 0 ? quotePool[quoteIdx % quotePool.length] : null;

  // ── Subscriptions due ─────────────────────────────────────────────────────
  const dueSubs = (subs as Subscription[])
    .filter((s) => (s as any).isActive !== false && (s as any).nextRenewal)
    .map((s) => ({ ...s, daysLeft: daysUntil((s as any).nextRenewal) }))
    .filter((s) => s.daysLeft !== null && s.daysLeft <= 14 && s.daysLeft >= 0)
    .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0))
    .slice(0, 4);

  // ── Due soon ──────────────────────────────────────────────────────────────
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

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">{format(new Date(), "EEEE, MMMM d, yyyy")}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => setAddEvent(true)} className="gap-1.5"><Plus size={13} /><Calendar size={13} />Event</Button>
          <Button size="sm" variant="outline" onClick={() => setAddBook(true)} className="gap-1.5"><Plus size={13} /><BookOpen size={13} />Book</Button>
          <Button size="sm" variant="outline" onClick={() => setAddSession(true)} className="gap-1.5"><Plus size={13} /><BookMarked size={13} />Reading Log</Button>
          <Button size="sm" onClick={() => setAddWorkout(true)} className="gap-1.5"><Plus size={13} /><Dumbbell size={13} />Workout Log</Button>
        </div>
      </div>

      {/* Today strip */}
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

      {/* Stat cards */}
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* ── Left column ─────────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Upcoming Events */}
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

          {/* Active Goals */}
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

          {/* Weekly Workouts */}
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
        </div>

        {/* ── Right column ─────────────────────────────────────────────── */}
        <div className="space-y-5">

          {/* Currently Reading */}
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

          {/* Featured Quote */}
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

          {/* Spots to Visit */}
          {(wantToVisit.length > 0 || spots.length === 0) && (
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

          {/* Due Soon (tasks + chores + subscriptions) */}
          {(dueSoon.length > 0 || dueChores.length > 0 || dueSubs.length > 0) && (
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
