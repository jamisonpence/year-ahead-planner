import { format, parseISO, differenceInDays, startOfDay, addYears, addMonths, addWeeks, startOfMonth, endOfMonth, eachDayOfInterval } from "date-fns";
import type { Event, Book, ReadingSession, WorkoutLog, WorkoutTemplate } from "@shared/schema";

export const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export const EVENT_CATEGORIES = [
  { value: "birthday", label: "Birthday",   color: "cat-birthday", dot: "dot-birthday" },
  { value: "travel",   label: "Travel",     color: "cat-travel",   dot: "dot-travel"   },
  { value: "project",  label: "Project",    color: "cat-project",  dot: "dot-project"  },
  { value: "goal",     label: "Goal",       color: "cat-goal",     dot: "dot-goal"     },
  { value: "other",    label: "Other",      color: "cat-other",    dot: "dot-other"    },
];

export const WORKOUT_TYPES = [
  "full_body","upper","lower","push","pull","legs","strength","cardio","custom"
] as const;

export const WORKOUT_TYPE_LABELS: Record<string, string> = {
  full_body: "Full Body", upper: "Upper", lower: "Lower",
  push: "Push", pull: "Pull", legs: "Legs", strength: "Strength", cardio: "Cardio", custom: "Custom",
};

export const GENRE_TAGS = ["Biography","History","Personal Growth","Religion","Fiction","Business","Science","Psychology","Other"];

export const RECURRENCE_OPTIONS = [
  { value: "none",    label: "One-time"   },
  { value: "weekly",  label: "Every week" },
  { value: "monthly", label: "Every month"},
  { value: "yearly",  label: "Every year" },
];

export const GOAL_CATEGORIES = [
  "general","reading","fitness","career","finance","health","personal","house","other"
];

export const PROGRESS_TYPES = [
  { value: "percent",  label: "Percentage" },
  { value: "count",    label: "Count"      },
  { value: "sessions", label: "Sessions"   },
  { value: "pages",    label: "Pages"      },
  { value: "books",    label: "Books"      },
  { value: "weight",   label: "Weight (lb)"},
  { value: "boolean",  label: "Done / Not done" },
];

export const BOOK_STATUSES = [
  { value: "backlog",  label: "Backlog"  },
  { value: "current",  label: "Reading"  },
  { value: "paused",   label: "Paused"   },
  { value: "finished", label: "Finished" },
];

export const COVER_COLORS = [
  "#1e3a5f","#2d4a22","#4a1e2d","#2d2a4a","#4a3a1e",
  "#1e4a4a","#4a1e1e","#3a4a1e","#1e3a1e","#4a2d1e",
];

// ── Date helpers ──────────────────────────────────────────────────────────────

export function daysUntil(dateStr: string): number {
  return differenceInDays(startOfDay(parseISO(dateStr)), startOfDay(new Date()));
}

export function nextOccurrence(date: string, recurring: string): string {
  if (recurring === "none") return date;
  const today = startOfDay(new Date());
  let candidate = parseISO(date);
  for (let i = 0; i < 5000; i++) {
    if (startOfDay(candidate) >= today) return format(candidate, "yyyy-MM-dd");
    if (recurring === "yearly")  candidate = addYears(candidate, 1);
    else if (recurring === "monthly") candidate = addMonths(candidate, 1);
    else if (recurring === "weekly")  candidate = addWeeks(candidate, 1);
    else break;
  }
  return format(candidate, "yyyy-MM-dd");
}

export function thisMonthStr(): string { return format(new Date(), "yyyy-MM"); }
export function todayStr(): string { return format(new Date(), "yyyy-MM-dd"); }
export function thisWeekDates(): string[] {
  const today = new Date();
  const day = today.getDay();
  const mon = new Date(today); mon.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon); d.setDate(mon.getDate() + i);
    return format(d, "yyyy-MM-dd");
  });
}

// ── Reading helpers ────────────────────────────────────────────────────────────

export function bookProgress(book: Book): number {
  if (!book.totalPages || book.totalPages === 0) return 0;
  return Math.min(100, Math.round((book.pagesRead / book.totalPages) * 100));
}

export function readingStreak(sessions: ReadingSession[]): number {
  const completed = sessions.filter((s) => s.completed).map((s) => s.date).sort().reverse();
  if (!completed.length) return 0;
  let streak = 0, d = startOfDay(new Date());
  for (const date of completed) {
    const sd = startOfDay(parseISO(date));
    if (differenceInDays(d, sd) <= 1) { streak++; d = sd; }
    else break;
  }
  return streak;
}

export function monthlyReadingStats(sessions: ReadingSession[], books: Book[]) {
  const monthStr = thisMonthStr();
  const monthSessions = sessions.filter((s) => s.completed && s.date.startsWith(monthStr));
  const pagesRead = monthSessions.reduce((sum, s) => sum + s.pagesRead, 0);
  const booksFinished = books.filter((b) => b.finishDate?.startsWith(monthStr)).length;
  return { pagesRead, booksFinished };
}

// ── Workout helpers ────────────────────────────────────────────────────────────

export function workoutStreak(logs: WorkoutLog[]): number {
  const completed = logs.filter((l) => l.completed).map((l) => l.date).sort().reverse();
  if (!completed.length) return 0;
  const seen = new Set<string>();
  const unique = completed.filter((d) => { if (seen.has(d)) return false; seen.add(d); return true; });
  let streak = 0, d = startOfDay(new Date());
  for (const date of unique) {
    const ld = startOfDay(parseISO(date));
    if (differenceInDays(d, ld) <= 1) { streak++; d = ld; }
    else break;
  }
  return streak;
}

export function weeklyWorkoutStats(logs: WorkoutLog[], templates: WorkoutTemplate[]) {
  const week = thisWeekDates();
  const completed = logs.filter((l) => l.completed && week.includes(l.date)).length;
  // Planned = templates with scheduled days this week
  const planned = templates.filter((t) => t.recurring !== "none").length;
  return { completed, planned };
}

export function getRecentPRs(logs: WorkoutLog[]): { exercise: string; weight: number; date: string }[] {
  const prs: { exercise: string; weight: number; date: string }[] = [];
  for (const log of logs) {
    try {
      const exercises = JSON.parse(log.exercisesJson) as any[];
      for (const ex of exercises) {
        if (ex.isPR) {
          const maxWeight = Math.max(...(ex.sets || []).map((s: any) => s.weight || 0));
          prs.push({ exercise: ex.name, weight: maxWeight, date: log.date });
        }
      }
    } catch {}
  }
  return prs.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
}

// ── Calendar unification ──────────────────────────────────────────────────────
// Normalize everything into a CalendarItem for unified calendar view

export type CalendarItemType = "event" | "reading" | "workout_planned" | "workout_done" | "book_milestone";

export interface CalendarItem {
  id: string; // prefixed: "e:1", "r:2", "wl:3", "wt:4", "bm:5"
  type: CalendarItemType;
  title: string;
  date: string;
  completed?: boolean;
  category?: string;
  color?: string;
  sourceId: number;
}
