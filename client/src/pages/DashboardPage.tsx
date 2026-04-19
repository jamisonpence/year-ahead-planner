import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { format, parseISO } from "date-fns";
import {
  Calendar, BookOpen, Dumbbell, Target, Plus, Flame,
  TrendingUp, CheckCircle2, Clock, AlertTriangle, ChevronRight,
  BookMarked, Zap, Home, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { EventWithTasks, BookWithSessions, WorkoutLog, WorkoutTemplate, GoalWithProjects, Chore } from "@shared/schema";
import {
  daysUntil, nextOccurrence, thisMonthStr, thisWeekDates, todayStr,
  bookProgress, readingStreak, monthlyReadingStats, workoutStreak,
  weeklyWorkoutStats, getRecentPRs, WORKOUT_TYPE_LABELS,
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

  const { data: events = [] } = useQuery<EventWithTasks[]>({ queryKey: ["/api/events"] });
  const { data: books = [] } = useQuery<BookWithSessions[]>({ queryKey: ["/api/books"] });
  const { data: wLogs = [] } = useQuery<WorkoutLog[]>({ queryKey: ["/api/workout-logs"] });
  const { data: wTemplates = [] } = useQuery<WorkoutTemplate[]>({ queryKey: ["/api/workout-templates"] });
  const { data: goals = [] } = useQuery<GoalWithProjects[]>({ queryKey: ["/api/goals"] });
  const { data: chores = [] } = useQuery<Chore[]>({ queryKey: ["/api/chores"] });

  const today = todayStr();
  const allSessions = books.flatMap((b) => b.sessions ?? []);

  // ── Upcoming events (next 21 days) ────────────────────────────────────────
  const upcomingEvents = events
    .map((e) => ({ ...e, displayDate: e.recurring !== "none" ? nextOccurrence(e.date, e.recurring) : e.date }))
    .filter((e) => { const d = daysUntil(e.displayDate); return d >= 0 && d <= 21; })
    .sort((a, b) => a.displayDate.localeCompare(b.displayDate))
    .slice(0, 6);

  // ── Reading stats ──────────────────────────────────────────────────────────
  const currentBooks = books.filter((b) => b.status === "current");
  const rStreak = readingStreak(allSessions);
  const { pagesRead: monthPages, booksFinished: monthBooks } = monthlyReadingStats(allSessions, books);

  // ── Workout stats ──────────────────────────────────────────────────────────
  const wStreak = workoutStreak(wLogs);
  const { completed: wCompleted, planned: wPlanned } = weeklyWorkoutStats(wLogs, wTemplates);
  const recentPRs = getRecentPRs(wLogs);
  const weekWorkouts = thisWeekDates();
  const weekCompletedDates = new Set(wLogs.filter((l) => l.completed && weekWorkouts.includes(l.date)).map((l) => l.date));

  // ── Due soon tasks across goals & events ──────────────────────────────────
  const dueSoon: { title: string; due: string; source: string }[] = [];
  events.forEach((e) => e.tasks?.filter((t) => !t.completed && t.dueDate && daysUntil(t.dueDate) <= 7 && daysUntil(t.dueDate) >= 0)
    .forEach((t) => dueSoon.push({ title: t.title, due: t.dueDate!, source: e.title })));
  goals.forEach((g) => g.tasks?.filter((t) => !t.completed && t.dueDate && daysUntil(t.dueDate) <= 7 && daysUntil(t.dueDate) >= 0)
    .forEach((t) => dueSoon.push({ title: t.title, due: t.dueDate!, source: g.title })));
  books.filter((b) => b.targetFinishDate && daysUntil(b.targetFinishDate) <= 14 && daysUntil(b.targetFinishDate) >= 0)
    .forEach((b) => dueSoon.push({ title: `Finish "${b.title}"`, due: b.targetFinishDate!, source: "Reading" }));
  dueSoon.sort((a, b) => a.due.localeCompare(b.due));

  const dayLabel = (d: number) => d === 0 ? "Today" : d === 1 ? "Tomorrow" : `${d}d`;

  // ── Due / overdue chores ──────────────────────────────────────────────────
  const dueChores = chores
    .filter((c) => c.isActive && c.nextDue)
    .map((c) => ({ ...c, daysLeft: daysUntil(c.nextDue!) }))
    .filter((c) => c.daysLeft !== null && c.daysLeft <= 3)
    .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0));

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
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

      {/* Top stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<Calendar size={18} />} label="Upcoming" value={String(upcomingEvents.length)} sub="next 21 days" color="text-[hsl(var(--cat-travel))]" />
        <StatCard icon={<BookOpen size={18} />} label="Reading" value={String(currentBooks.length)} sub={`${monthBooks} finished this month`} color="text-[hsl(25_85%_52%)]" />
        <StatCard icon={<Flame size={18} />} label="Streaks" value={`${rStreak}d / ${wStreak}d`} sub="reading / workouts" color="text-amber-500" />
        <StatCard icon={<Dumbbell size={18} />} label="This Week" value={`${wCompleted}/${wPlanned}`} sub="workouts done" color="text-[hsl(210_80%_48%)]" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-5">

          {/* Upcoming Events */}
          <Section title="Upcoming Events" icon={<Calendar size={15} />} linkHref="/calendar" linkLabel="Calendar">
            {upcomingEvents.length === 0 ? (
              <Empty icon={<Calendar size={28} />} text="No events in the next 3 weeks" />
            ) : (
              <div className="space-y-2">
                {upcomingEvents.map((e) => {
                  const d = daysUntil(e.displayDate);
                  return (
                    <div key={e.id} className="flex items-center justify-between py-2 px-3 bg-secondary/40 rounded-lg">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{e.title}</p>
                        <p className="text-xs text-muted-foreground">{format(parseISO(e.displayDate), "MMM d")}</p>
                      </div>
                      <span className={`text-xs font-semibold shrink-0 px-2 py-0.5 rounded-full border ${d <= 3 ? "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800" : "text-muted-foreground bg-secondary border-border"}`}>
                        {dayLabel(d)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          {/* Currently Reading */}
          <Section title="Currently Reading" icon={<BookOpen size={15} />} linkHref="/reading" linkLabel="Reading">
            {currentBooks.length === 0 ? (
              <Empty icon={<BookOpen size={28} />} text="No books in progress" />
            ) : (
              <div className="space-y-3">
                {currentBooks.slice(0, 3).map((b) => {
                  const pct = bookProgress(b);
                  const daysLeft = b.targetFinishDate ? daysUntil(b.targetFinishDate) : null;
                  return (
                    <div key={b.id} className="flex items-start gap-3 p-3 bg-secondary/40 rounded-lg">
                      <div className="w-8 h-11 rounded flex-shrink-0 flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: b.coverColor || "#1e3a5f" }}>
                        {(b.title[0] || "?").toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{b.title}</p>
                        {b.author && <p className="text-xs text-muted-foreground">{b.author}</p>}
                        <div className="flex items-center gap-2 mt-1.5">
                          <Progress value={pct} className="h-1.5 flex-1" />
                          <span className="text-xs text-muted-foreground shrink-0">{pct}%</span>
                        </div>
                        {b.totalPages && <p className="text-xs text-muted-foreground mt-0.5">{b.pagesRead} / {b.totalPages} pages{daysLeft !== null && daysLeft >= 0 ? ` · ${daysLeft}d to deadline` : ""}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          {/* Weekly Workout Grid */}
          <Section title="This Week's Workouts" icon={<Dumbbell size={15} />} linkHref="/workouts" linkLabel="Workouts">
            <div className="grid grid-cols-7 gap-1.5 mb-3">
              {thisWeekDates().map((d) => {
                const done = weekCompletedDates.has(d);
                const isToday = d === todayStr();
                const label = format(parseISO(d), "EEE")[0];
                return (
                  <div key={d} className={`flex flex-col items-center gap-1 p-2 rounded-lg border ${done ? "border-[hsl(210_80%_48%)] bg-[hsl(210_80%_48%/0.1)]" : isToday ? "border-primary bg-primary/5" : "border-border bg-secondary/30"}`}>
                    <span className="text-xs text-muted-foreground font-medium">{label}</span>
                    {done ? <CheckCircle2 size={16} className="text-[hsl(210_80%_48%)]" /> : <div className={`w-4 h-4 rounded-full border-2 ${isToday ? "border-primary" : "border-border"}`} />}
                  </div>
                );
              })}
            </div>
            {recentPRs.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Recent PRs</p>
                <div className="space-y-1">
                  {recentPRs.slice(0, 3).map((pr, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400"><Zap size={12} />{pr.exercise}</span>
                      <span className="font-semibold">{pr.weight} lb</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {wLogs.filter((l) => l.completed).length === 0 && recentPRs.length === 0 && (
              <Empty icon={<Dumbbell size={28} />} text="No workouts logged yet" />
            )}
          </Section>
        </div>

        {/* Right column */}
        <div className="space-y-5">

          {/* Reading Stats */}
          <div className="bg-card border rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <BookOpen size={15} className="text-[hsl(25_85%_52%)]" />
              <span className="text-sm font-semibold">Reading This Month</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <MiniStat label="Pages" value={String(monthPages)} />
              <MiniStat label="Finished" value={String(monthBooks)} />
              <MiniStat label="Streak" value={`${rStreak}d`} />
              <MiniStat label="In Progress" value={String(currentBooks.length)} />
            </div>
          </div>

          {/* Due Soon */}
          <div className="bg-card border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={15} className="text-amber-500" />
              <span className="text-sm font-semibold">Due Soon</span>
            </div>
            {dueSoon.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">Nothing due in the next week</p>
            ) : (
              <div className="space-y-2">
                {dueSoon.slice(0, 6).map((item, i) => (
                  <div key={i} className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{item.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{item.source}</p>
                    </div>
                    <span className="text-xs text-amber-600 dark:text-amber-400 shrink-0">{dayLabel(daysUntil(item.due))}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Due Chores */}
          {dueChores.length > 0 && (
            <div className="bg-card border rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Home size={15} className="text-primary" />
                  <span className="text-sm font-semibold">Chores Due</span>
                </div>
                <Link href="/housekeeping"><a className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5">All <ChevronRight size={12} /></a></Link>
              </div>
              <div className="space-y-2">
                {dueChores.slice(0, 5).map((chore) => (
                  <div key={chore.id} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <RefreshCw size={11} className="text-muted-foreground shrink-0" />
                      <p className="text-xs font-medium truncate">{chore.title}</p>
                    </div>
                    <span className={`text-xs font-semibold shrink-0 ${(chore.daysLeft ?? 1) < 0 ? "text-red-600" : (chore.daysLeft ?? 1) === 0 ? "text-orange-600" : "text-yellow-600"}`}>
                      {(chore.daysLeft ?? 0) < 0 ? `${Math.abs(chore.daysLeft!)}d overdue` : dayLabel(chore.daysLeft!)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Active Goals */}
          <div className="bg-card border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Target size={15} className="text-[hsl(var(--cat-goal))]" />
                <span className="text-sm font-semibold">Active Goals</span>
              </div>
              <Link href="/goals"><a className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5">All <ChevronRight size={12} /></a></Link>
            </div>
            {goals.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">No goals yet</p>
            ) : (
              <div className="space-y-3">
                {goals.slice(0, 4).map((g) => {
                  const pct = g.progressType === "boolean"
                    ? (g.progressCurrent >= g.progressTarget ? 100 : 0)
                    : g.progressTarget > 0 ? Math.min(100, Math.round((g.progressCurrent / g.progressTarget) * 100)) : 0;
                  return (
                    <div key={g.id}>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-medium truncate">{g.title}</p>
                        <span className="text-xs text-muted-foreground shrink-0">{pct}%</span>
                      </div>
                      <Progress value={pct} className="h-1.5" />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
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

function StatCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub: string; color: string }) {
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
    <div className="bg-secondary/40 rounded-lg p-2.5 text-center">
      <p className="text-base font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
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
    <div className="text-center py-6 text-muted-foreground">
      <div className="opacity-20 mb-2 flex justify-center">{icon}</div>
      <p className="text-xs">{text}</p>
    </div>
  );
}
