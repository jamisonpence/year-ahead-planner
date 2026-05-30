import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageShell from "@/components/PageShell";
import { apiRequest } from "@/lib/queryClient";
import type { Hobby, InsertHobby, PublicUser } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus, Pencil, Trash2, Search, Heart, Star,
  Camera, Palette, Mountain, Gamepad2, Cpu, Mic2,
  Archive, Trees, BookOpen, Music2, ChevronDown, ChevronUp,
  Layers, X, ImagePlus, Target, CheckCircle2, Circle, Calendar,
  TrendingUp, Flag, ListChecks, ChevronRight, ChevronLeft,
  Trophy, Flame, BarChart3, RefreshCw, Check, Zap, Power, PowerOff, ClipboardList,
  Play, Pause, ClipboardCheck, Timer, CalendarDays, CalendarCheck2,
  MoreHorizontal, CalendarClock,
} from "lucide-react";
import { format, parseISO } from "date-fns";

// ── Hiking types ──────────────────────────────────────────────────────────────

interface HikeWishlistEntry {
  id: string;
  trailId?: number;
  name: string;
  location: string;
  lengthMiles: number;
  elevationGainFt: number;
  difficulty: string;
  stars?: number;
  url?: string;
  imgUrl?: string;
  notes?: string;
  plannedDate?: string;
  addedAt: string;
}

interface HikeLogEntry {
  id: string;
  trailId?: number;
  name: string;
  date: string;
  distanceMiles: number;
  elevationGainFt?: number;
  durationMins?: number;
  difficulty?: string;
  rating?: number;
  notes?: string;
  url?: string;
}

function parseHikeWishlist(extraJson: string): HikeWishlistEntry[] {
  try { const o = JSON.parse(extraJson || "{}"); return Array.isArray(o.hikeWishlist) ? o.hikeWishlist : []; } catch { return []; }
}
function parseHikeLog(extraJson: string): HikeLogEntry[] {
  try { const o = JSON.parse(extraJson || "{}"); return Array.isArray(o.hikeLog) ? o.hikeLog : []; } catch { return []; }
}
function setHikingInExtra(extraJson: string, wishlist: HikeWishlistEntry[], log: HikeLogEntry[]): string {
  try { const o = JSON.parse(extraJson || "{}"); return JSON.stringify({ ...o, hikeWishlist: wishlist, hikeLog: log }); }
  catch { return JSON.stringify({ hikeWishlist: wishlist, hikeLog: log }); }
}

const DIFF_COLOR: Record<string, string> = {
  "Green":     "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200",
  "Blue":      "text-blue-600 bg-blue-50 dark:bg-blue-950/30 border-blue-200",
  "Black":     "text-gray-800 bg-gray-100 dark:bg-gray-800/50 border-gray-300 dark:text-gray-200",
  "Dbl Black": "text-gray-900 bg-gray-200 dark:bg-gray-700 border-gray-400 dark:text-white",
  "Terrifying":"text-red-700 bg-red-50 dark:bg-red-950/30 border-red-300",
};

// ── Hobby type constants ───────────────────────────────────────────────────────

export type HobbyType = "creative" | "collection" | "outdoor" | "games" | "learning" | "performance";

export const HOBBY_TYPES: { value: HobbyType; label: string; icon: React.ElementType; color: string; bg: string; emoji: string }[] = [
  { value: "creative",    label: "Creative",          icon: Palette,   color: "#ec4899", bg: "bg-pink-50 dark:bg-pink-950/20",    emoji: "🎨" },
  { value: "collection",  label: "Collection",        icon: Archive,   color: "#f97316", bg: "bg-orange-50 dark:bg-orange-950/20", emoji: "🪙" },
  { value: "outdoor",     label: "Outdoor & Active",  icon: Mountain,  color: "#10b981", bg: "bg-emerald-50 dark:bg-emerald-950/20", emoji: "🏔️" },
  { value: "games",       label: "Games & Mind",      icon: Gamepad2,  color: "#6366f1", bg: "bg-indigo-50 dark:bg-indigo-950/20", emoji: "🎮" },
  { value: "learning",    label: "Learning & Making", icon: Cpu,       color: "#3b82f6", bg: "bg-blue-50 dark:bg-blue-950/20",     emoji: "🔬" },
  { value: "performance", label: "Performance",       icon: Mic2,      color: "#8b5cf6", bg: "bg-violet-50 dark:bg-violet-950/20", emoji: "🎭" },
];

export const HOBBY_TYPE_MAP = Object.fromEntries(HOBBY_TYPES.map(t => [t.value, t]));

export const PRESET_HOBBIES: Record<HobbyType, string[]> = {
  creative:    ["Photography", "Painting", "Drawing", "Pottery", "Knitting/Crochet", "Woodworking", "Jewelry Making", "Sculpting"],
  collection:  ["Coins", "Stamps", "Vinyl Records", "Trading Cards", "Sneakers", "Watches", "Comic Books", "Antiques"],
  outdoor:     ["Hiking", "Cycling", "Fishing", "Gardening", "Rock Climbing", "Bird Watching", "Surfing", "Running"],
  games:       ["Chess", "Board Games", "Video Games", "Puzzles", "Poker", "Dungeons & Dragons"],
  learning:    ["Coding", "Electronics", "3D Printing", "Brewing/Winemaking", "Cooking", "Language Learning"],
  performance: ["Playing an Instrument", "Singing", "Acting", "Dancing", "Comedy"],
};

export const SKILL_LEVELS = [
  { value: "beginner",     label: "Beginner",     color: "bg-green-500/15 text-green-700 dark:text-green-400" },
  { value: "intermediate", label: "Intermediate", color: "bg-blue-500/15 text-blue-700 dark:text-blue-400" },
  { value: "advanced",     label: "Advanced",     color: "bg-purple-500/15 text-purple-700 dark:text-purple-400" },
  { value: "expert",       label: "Expert",       color: "bg-orange-500/15 text-orange-700 dark:text-orange-400" },
];

export const STATUS_OPTIONS = [
  { value: "active",    label: "Active",    color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  { value: "on_pause",  label: "On Pause",  color: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400" },
  { value: "retired",   label: "Retired",   color: "bg-slate-500/15 text-slate-500" },
];

export const SKILL_MAP = Object.fromEntries(SKILL_LEVELS.map(s => [s.value, s]));
export const STATUS_MAP = Object.fromEntries(STATUS_OPTIONS.map(s => [s.value, s]));

// ── Goal / Plan types ──────────────────────────────────────────────────────────

export type GoalType = "count" | "milestone" | "frequency" | "plan";

export interface GoalStep {
  id: string;
  text: string;
  done: boolean;
  dueDate?: string;
}

export interface HobbyGoal {
  id: string;
  title: string;
  description?: string;
  goalType: GoalType;
  // count
  targetValue?: number;
  currentValue?: number;
  unit?: string;
  // frequency
  freqTimes?: number;
  freqPeriod?: "week" | "month";
  durationWeeks?: number;
  // plan
  steps?: GoalStep[];
  // shared
  targetDate?: string;
  status: "active" | "completed" | "paused";
  createdAt: string;
  // accountability
  buddyUserId?: number;
  // link back to the plan that auto-created this goal
  linkedPlanId?: string;
  // link to a system goal from /api/goals
  linkedSystemGoalId?: number;
}

interface GoalTemplate {
  id: string;
  emoji: string;
  label: string;
  description: string;
  goalType: GoalType;
  defaults: Partial<HobbyGoal>;
}

// ── Language-learning hobby detector (used across components) ─────────────────

function isLanguageLearningHobby(hobby: Hobby | null | undefined): boolean {
  if (!hobby) return false;
  const n = hobby.name.toLowerCase();
  return n.includes("language") || n.includes("spanish") || n.includes("french") ||
    n.includes("german") || n.includes("japanese") || n.includes("mandarin") ||
    n.includes("italian") || n.includes("portuguese") || n.includes("korean") ||
    n.includes("arabic") || n.includes("russian") || n.includes("chinese");
}

// ── Shared buddy helpers ──────────────────────────────────────────────────────

function useFriends() {
  return useQuery<PublicUser[]>({
    queryKey: ["/api/friends"],
    queryFn: async () => (await apiRequest("GET", "/api/friends")).json(),
    staleTime: 60_000,
  });
}

function BuddyPickerInline({
  value,
  onChange,
  friends,
}: {
  value: number | null | undefined;
  onChange: (id: number | null) => void;
  friends: PublicUser[];
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = friends.find((f) => f.id === value) ?? null;
  const filtered = query
    ? friends.filter((f) => f.name.toLowerCase().includes(query.toLowerCase()) || f.email.toLowerCase().includes(query.toLowerCase()))
    : friends;

  function avatar(f: PublicUser, size = 22) {
    const initials = f.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
    if (f.avatarUrl)
      return <img src={f.avatarUrl} alt={f.name} className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />;
    return (
      <div className="rounded-full bg-primary/15 text-primary font-bold flex items-center justify-center shrink-0"
        style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}>
        {initials}
      </div>
    );
  }

  if (friends.length === 0) {
    return <p className="text-[11px] text-muted-foreground">Add friends to assign an Accountabilibuddy.</p>;
  }

  if (selected) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-primary/5 border-primary/30 px-2.5 py-1.5">
        {avatar(selected, 24)}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium leading-tight truncate">{selected.name}</p>
          <p className="text-[10px] text-muted-foreground">Accountabilibuddy</p>
        </div>
        <button type="button" onClick={() => onChange(null)} className="p-0.5 rounded hover:bg-muted transition-colors">
          <X size={11} className="text-muted-foreground" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search friends…"
          className="h-8 text-xs pl-7"
        />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-20 top-full mt-1 w-full rounded-lg border bg-popover shadow-md overflow-hidden">
          {filtered.map((f) => (
            <button
              key={f.id}
              type="button"
              onMouseDown={() => { onChange(f.id); setQuery(""); setOpen(false); }}
              className="flex items-center gap-2 w-full px-3 py-2 hover:bg-accent text-left transition-colors"
            >
              {avatar(f, 22)}
              <div className="min-w-0">
                <p className="text-xs font-medium leading-tight">{f.name}</p>
                <p className="text-[10px] text-muted-foreground truncate">{f.email}</p>
              </div>
            </button>
          ))}
        </div>
      )}
      {open && query && filtered.length === 0 && (
        <div className="absolute z-20 top-full mt-1 w-full rounded-lg border bg-popover shadow-md p-3 text-center">
          <p className="text-xs text-muted-foreground">No friends found</p>
        </div>
      )}
    </div>
  );
}

// ── Goal templates per hobby type ─────────────────────────────────────────────

export const GOAL_TEMPLATES: Record<HobbyType, GoalTemplate[]> = {
  creative: [
    { id: "c1", emoji: "🖼️", label: "Complete a project",   description: "Finish a specific work with a deadline",    goalType: "milestone",  defaults: { title: "Complete a project" } },
    { id: "c2", emoji: "📅", label: "Weekly practice",       description: "Stay consistent with regular sessions",     goalType: "frequency",  defaults: { title: "Practice weekly", freqTimes: 3, freqPeriod: "week", durationWeeks: 12 } },
    { id: "c3", emoji: "🎯", label: "Create X works",        description: "Hit a volume target over time",             goalType: "count",      defaults: { title: "Create 12 works", targetValue: 12, currentValue: 0, unit: "works" } },
    { id: "c4", emoji: "📋", label: "Learn a new technique", description: "Step-by-step path to master something new", goalType: "plan",       defaults: { title: "Master a new technique", steps: [] } },
  ],
  collection: [
    { id: "col1", emoji: "📦", label: "Grow the collection", description: "Reach a target number of items",             goalType: "count",     defaults: { title: "Reach 100 items", targetValue: 100, currentValue: 0, unit: "items" } },
    { id: "col2", emoji: "🔍", label: "Find a specific piece", description: "Track the hunt for one prized item",      goalType: "milestone", defaults: { title: "Find a specific piece" } },
    { id: "col3", emoji: "✅", label: "Complete a set/series", description: "Collect everything in a defined set",     goalType: "plan",      defaults: { title: "Complete a set", steps: [] } },
    { id: "col4", emoji: "💰", label: "Reach a value target", description: "Build toward an estimated collection value", goalType: "count",   defaults: { title: "Collection value goal", targetValue: 5000, currentValue: 0, unit: "$" } },
  ],
  outdoor: [
    { id: "o1", emoji: "🏃", label: "Distance challenge",   description: "Log miles, km, or laps toward a big total",  goalType: "count",     defaults: { title: "Log 500 miles", targetValue: 500, currentValue: 0, unit: "miles" } },
    { id: "o2", emoji: "⛰️", label: "Summit challenge",     description: "Bag a number of peaks or trails",           goalType: "count",     defaults: { title: "Summit 10 peaks", targetValue: 10, currentValue: 0, unit: "peaks" } },
    { id: "o3", emoji: "🗺️", label: "Explore new locations", description: "Visit a set number of new spots",         goalType: "count",     defaults: { title: "Visit 20 new locations", targetValue: 20, currentValue: 0, unit: "locations" } },
    { id: "o4", emoji: "🏅", label: "Beat a personal best", description: "Multi-step training plan toward a PR",       goalType: "plan",      defaults: { title: "Beat my personal best", steps: [] } },
  ],
  games: [
    { id: "g1", emoji: "⚡", label: "Reach a rating/rank",   description: "Hit a specific ELO, rank, or level",        goalType: "milestone", defaults: { title: "Reach rating X" } },
    { id: "g2", emoji: "🎮", label: "Complete a game",       description: "Finish a campaign, story, or playthrough",  goalType: "milestone", defaults: { title: "Complete the game" } },
    { id: "g3", emoji: "🎲", label: "Play X sessions",       description: "Track your play frequency over time",       goalType: "count",     defaults: { title: "Play 50 sessions", targetValue: 50, currentValue: 0, unit: "sessions" } },
    { id: "g4", emoji: "📚", label: "Learn a new game",      description: "Step-by-step path to learning a new game",  goalType: "plan",      defaults: { title: "Learn a new game", steps: [] } },
  ],
  learning: [
    { id: "l1", emoji: "🎓", label: "Complete a course",     description: "Work through a specific course or book",    goalType: "plan",      defaults: { title: "Complete a course", steps: [] } },
    { id: "l2", emoji: "🔨", label: "Build a project",       description: "Step-by-step plan to ship something",       goalType: "plan",      defaults: { title: "Build a project", steps: [] } },
    { id: "l3", emoji: "🌍", label: "Reach a proficiency",   description: "Hit a specific skill level or certification", goalType: "milestone", defaults: { title: "Reach an advanced level" } },
    { id: "l4", emoji: "📆", label: "Daily/weekly practice", description: "Build a consistent practice habit",         goalType: "frequency", defaults: { title: "Practice consistently", freqTimes: 5, freqPeriod: "week", durationWeeks: 16 } },
  ],
  performance: [
    { id: "p1", emoji: "🎵", label: "Learn a piece/song",   description: "Master a specific piece from start to finish", goalType: "plan",     defaults: { title: "Learn a specific piece", steps: [] } },
    { id: "p2", emoji: "🎤", label: "Perform publicly",     description: "Work toward your first or next performance",  goalType: "milestone", defaults: { title: "Perform at an open event" } },
    { id: "p3", emoji: "⏱️", label: "Weekly practice",     description: "Track hours and build a regular habit",        goalType: "frequency", defaults: { title: "Practice weekly", freqTimes: 4, freqPeriod: "week", durationWeeks: 12 } },
    { id: "p4", emoji: "🎬", label: "Record / create",      description: "Plan a recording, video, or performance project", goalType: "plan",  defaults: { title: "Record or create something", steps: [] } },
  ],
};

const CUSTOM_TEMPLATE: GoalTemplate = {
  id: "custom", emoji: "✏️", label: "Custom goal", description: "Define your own goal or plan from scratch",
  goalType: "milestone", defaults: {},
};

// ── Helpers ────────────────────────────────────────────────────────────────────

export function genId(): string {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

export function parseExtra(json: string): Record<string, any> {
  try { return JSON.parse(json || "{}"); } catch { return {}; }
}

export function parseGoals(extraJson: string): HobbyGoal[] {
  try {
    const obj = JSON.parse(extraJson || "{}");
    return Array.isArray(obj.goals) ? obj.goals : [];
  } catch { return []; }
}

export function setGoalsInExtra(extraJson: string, goals: HobbyGoal[]): string {
  try {
    const obj = JSON.parse(extraJson || "{}");
    return JSON.stringify({ ...obj, goals });
  } catch { return JSON.stringify({ goals }); }
}

function goalProgress(goal: HobbyGoal): { pct: number; label: string } {
  if (goal.goalType === "count") {
    const cur = goal.currentValue ?? 0;
    const tgt = goal.targetValue ?? 1;
    const pct = Math.min(100, Math.round((cur / tgt) * 100));
    return { pct, label: `${cur} / ${tgt} ${goal.unit ?? ""}` };
  }
  if (goal.goalType === "plan") {
    const steps = goal.steps ?? [];
    const done = steps.filter(s => s.done).length;
    const pct = steps.length ? Math.round((done / steps.length) * 100) : 0;
    return { pct, label: `${done} / ${steps.length} steps` };
  }
  if (goal.goalType === "milestone") {
    return { pct: goal.status === "completed" ? 100 : 0, label: goal.status === "completed" ? "Completed!" : "In progress" };
  }
  if (goal.goalType === "frequency") {
    return { pct: goal.status === "completed" ? 100 : 50, label: `${goal.freqTimes}× / ${goal.freqPeriod}` };
  }
  return { pct: 0, label: "" };
}

function daysUntilDate(date: string): number | null {
  try {
    const d = new Date(date); d.setHours(0, 0, 0, 0);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Math.round((d.getTime() - today.getTime()) / 86400000);
  } catch { return null; }
}

const GOAL_TYPE_META: Record<GoalType, { icon: React.ElementType; label: string; color: string }> = {
  count:     { icon: BarChart3,  label: "Count",     color: "text-blue-500" },
  milestone: { icon: Flag,       label: "Milestone", color: "text-amber-500" },
  frequency: { icon: RefreshCw,  label: "Frequency", color: "text-emerald-500" },
  plan:      { icon: ListChecks, label: "Plan",      color: "text-violet-500" },
};

// ── HobbyPlan type (separate from HobbyGoal) ──────────────────────────────────

interface SessionLog {
  id: string;
  date: string;        // YYYY-MM-DD
  dayOfWeek?: string;  // "Mon" | "Tue" | … | "Sun"
  durationMins?: number;
  notes?: string;
  planId: string;
}

interface PlanMilestone {
  id: string;
  title: string;         // e.g. "Hit 1300 ELO"
  description?: string;
  completedAt?: string;  // ISO date string when achieved
  order: number;
}

export interface HobbyPlan {
  id: string;
  title: string;
  description?: string;
  durationWeeks?: number;
  startDate?: string;
  isActive: boolean;
  isPaused?: boolean;    // paused = !isActive && isPaused && !completedAt
  steps: GoalStep[];
  milestones?: PlanMilestone[];
  createdAt: string;
  completedAt?: string;
  scheduleDays?: string[];
  sessions?: SessionLog[];
  dayLabels?: Record<string, string>; // Maps "Mon" → custom session label for that day
  dayNotes?: Record<string, string>;  // Maps "Mon" → detailed task description for that day
  weeklyPlan?: WeekPlanEntry[];       // Week-by-week schedule (overrides dayLabels/dayNotes per week)
  activities?: Activity[];
  estimatedTotalHours?: number;
  commitmentDaysPerWeek?: number;
  minutesPerSession?: number;
  taskCompletions?: TaskCompletion[];
}

interface WeekPlanEntry {
  week: number;
  day: string; // "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun"
  theme: string;
  whiteOpenings: string;
  blackOpenings: string;
  tasks: string;
}

interface Activity {
  id: string;
  name: string;
  weight: number;   // 1–10, higher = more session time allocated
  description: string;
}

interface TaskCompletion {
  taskKey: string;
  completedAt: number; // ms timestamp
}

interface DailyActivityBlock {
  taskKey: string;
  activityId: string;
  activityName: string;
  minutes: number;
  description: string;
  originalDate: string;    // ISO date it was originally scheduled
  scheduledDate: string;   // ISO date it will actually appear (may shift)
  completed: boolean;
  carriedForward: boolean;
}

interface ComputedWeekDay {
  date: string;
  dayName: string;
  isToday: boolean;
  isTrainingDay: boolean;
  status: "today" | "upcoming" | "rest" | "complete";
  originalDate: string | null;
  blocks: DailyActivityBlock[];
}

interface ComputedHobbyPlan {
  assumptions: {
    totalHours: number;
    weeklyHours: number;
    weeklyMinutes: number;
    sessionsPerWeek: number;
    minutesPerSession: number;
    weeksToGoal: number;
    completionDate: string;
    progressPct: number;
    hoursCompleted: number;
    notes: string[];
  };
  weeklyAllocation: Array<{
    activityId: string;
    activityName: string;
    description: string;
    weight: number;
    weeklyMinutes: number;
  }>;
  todayPlan: DailyActivityBlock[];
  weeklySchedule: ComputedWeekDay[];
  weeklyFocus: { title: string; detail: string };
  monthlyFocus: { title: string; detail: string };
  isRestDay: boolean;
}

interface PlanTemplate {
  id: string;
  emoji: string;
  label: string;
  description: string;
  defaultSteps: string[];
  durationWeeks?: number;
}

export const PLAN_TEMPLATES: Record<HobbyType, PlanTemplate[]> = {
  creative: [
    { id: "cp1", emoji: "🖼️", label: "Complete a project", description: "Step through a specific creative work to completion", durationWeeks: 4, defaultSteps: ["Gather materials & references", "Sketch / plan the composition", "Begin main work", "Refine and add detail", "Finishing touches", "Photograph & archive"] },
    { id: "cp2", emoji: "🎓", label: "Learn a technique", description: "Break down mastering a new skill into sessions", durationWeeks: 8, defaultSteps: ["Research the technique", "Watch / read tutorials", "Practice basics", "Apply to a small project", "Seek feedback", "Create a showcase piece"] },
    { id: "cp3", emoji: "📚", label: "Build a portfolio", description: "Create a body of work to share or exhibit", durationWeeks: 12, defaultSteps: ["Define theme and style", "Create first 3 pieces", "Create 3 more pieces", "Edit and curate", "Build online presence", "Share or exhibit"] },
    { id: "cp4", emoji: "🏫", label: "Take a class", description: "Work through a structured class or workshop", durationWeeks: 6, defaultSteps: ["Enroll and get materials", "Complete weeks 1–2", "Complete weeks 3–4", "Midpoint review", "Complete final lessons", "Final project"] },
  ],
  collection: [
    { id: "colp1", emoji: "🗂️", label: "Catalog & organize", description: "Document and sort your entire collection", durationWeeks: 4, defaultSteps: ["Gather everything in one place", "Research and identify pieces", "Photograph each item", "Enter into a spreadsheet or app", "Add valuations", "Organize storage"] },
    { id: "colp2", emoji: "🔍", label: "Complete a set", description: "Track down the missing pieces in a defined set", durationWeeks: 12, defaultSteps: ["List all missing pieces", "Research sources and prices", "Set a budget", "Acquire top 3 most wanted", "Continue filling gaps", "Celebrate completion"] },
    { id: "colp3", emoji: "🛒", label: "Sourcing expedition", description: "Plan and execute a major sourcing trip or haul", defaultSteps: ["Research locations and events", "Set a budget and want list", "Plan logistics", "Execute the trip", "Process and clean your haul", "Update collection records"] },
    { id: "colp4", emoji: "📖", label: "Become an expert", description: "Deep dive into the history and value of your collection", durationWeeks: 8, defaultSteps: ["Get reference books or guides", "Join collector communities", "Research your top 10 pieces", "Learn grading standards", "Attend a show or event", "Write about your collection"] },
  ],
  outdoor: [
    { id: "op1", emoji: "🏃", label: "Train for an event", description: "Progressive plan to prepare for a race, hike, or challenge", durationWeeks: 12, defaultSteps: ["Set baseline fitness", "Build base fitness (weeks 1–4)", "Increase intensity (weeks 5–8)", "Peak week", "Taper", "Race / event day"] },
    { id: "op2", emoji: "⛰️", label: "Plan an expedition", description: "Prepare for a multi-day adventure in depth", durationWeeks: 8, defaultSteps: ["Choose destination and dates", "Research route and conditions", "Gear check and acquisition", "Training hikes", "Logistics — permits, transport", "Execute the trip"] },
    { id: "op3", emoji: "🎯", label: "Skill progression", description: "Systematically improve a specific outdoor skill", durationWeeks: 10, defaultSteps: ["Assess current level", "Find instruction — course, guide, videos", "Practice fundamentals", "Apply in the field", "Advanced practice", "Lead or teach others"] },
    { id: "op4", emoji: "🗺️", label: "Explore a region", description: "Systematically discover and document a new area", durationWeeks: 8, defaultSteps: ["Research the region", "Map key locations", "First visit — scout", "Return for top spots", "Off-the-beaten-path trip", "Document favorites"] },
  ],
  games: [
    { id: "gp1", emoji: "🎮", label: "Complete a game", description: "Play through a game from start to finish", durationWeeks: 4, defaultSteps: ["Start / set up", "Complete act 1", "Complete act 2", "Complete main story", "Optional content", "100% / achievement run"] },
    { id: "gp2", emoji: "📚", label: "Learn a new game", description: "Go from beginner to competent in a game you've never played", durationWeeks: 6, defaultSteps: ["Read rules or watch intro", "Play first session", "Identify weak spots", "Study strategy", "Practice regularly", "Play a competitive session"] },
    { id: "gp3", emoji: "⚡", label: "Improve your rating", description: "Structured path to reach a new skill level", durationWeeks: 12, defaultSteps: ["Establish baseline rating", "Identify key weaknesses", "Study and practice", "Play rated games", "Analyze losses", "Hit target rating"] },
    { id: "gp4", emoji: "🎲", label: "Run a campaign", description: "Plan and run a full tabletop or story campaign", durationWeeks: 16, defaultSteps: ["Plan setting and story arc", "Build characters with players", "Session 1 — intro arc", "Mid-campaign arc", "Final arc", "Epilogue session"] },
  ],
  learning: [
    { id: "lp1", emoji: "🎓", label: "Complete a course", description: "Work through a structured course from start to finish", durationWeeks: 8, defaultSteps: ["Enroll and set up environment", "Complete module 1", "Complete modules 2–3", "Midpoint project", "Complete final modules", "Final exam or capstone"] },
    { id: "lp2", emoji: "🔨", label: "Build a project", description: "Plan and ship a complete project from scratch", durationWeeks: 6, defaultSteps: ["Define scope and requirements", "Design / architecture", "Build core features", "Add secondary features", "Test and fix bugs", "Deploy or share"] },
    { id: "lp3", emoji: "🌍", label: "Reach a skill level", description: "Systematic path to a specific proficiency or certification", durationWeeks: 16, defaultSteps: ["Assess current level", "Study fundamentals", "Practice daily", "Reach intermediate milestone", "Advanced study", "Test or certify"] },
    { id: "lp4", emoji: "📖", label: "Read & implement", description: "Work through a technical book with hands-on practice", durationWeeks: 6, defaultSteps: ["Acquire the book or resource", "Read and do chapters 1–3", "Implement exercises 1–3", "Read chapters 4–6", "Implement exercises 4–6", "Final implementation project"] },
  ],
  performance: [
    { id: "pp1", emoji: "🎵", label: "Learn a piece", description: "Work through a specific song, piece, or routine start to finish", durationWeeks: 4, defaultSteps: ["Listen and analyze", "Break into sections", "Learn section A", "Learn section B", "Combine all sections", "Performance-ready run-through"] },
    { id: "pp2", emoji: "🎤", label: "Prepare for a performance", description: "Ready yourself for a recital, show, gig, or audition", durationWeeks: 8, defaultSteps: ["Set performance date", "Finalize setlist or material", "Polish each piece", "Full run-throughs", "Final dress rehearsal", "Perform"] },
    { id: "pp3", emoji: "🎬", label: "Record / create", description: "Plan and complete a recording or creative project", durationWeeks: 6, defaultSteps: ["Finalize the material", "Pre-production setup", "Record rough takes", "Select and polish best takes", "Mix and master", "Release or share"] },
    { id: "pp4", emoji: "📋", label: "Practice curriculum", description: "Build a structured practice routine to improve fundamentals", durationWeeks: 12, defaultSteps: ["Assess current skills", "Design practice schedule", "Weeks 1–4: fundamentals", "Weeks 5–8: intermediate exercises", "Weeks 9–12: advanced exercises", "Evaluate and adjust"] },
  ],
};

// ── Chess weekly schedule data (from CSV, by rating band) ─────────────────────

interface ChessWeeklyBand {
  minElo: number;
  maxElo: number;
  bandLabel: string;
  highLevelFocus: string;
  days: Record<string, { dayLabel: string; taskDetail: string }>;
}

const CHESS_WEEKLY_SCHEDULES: ChessWeeklyBand[] = [
  {
    minElo: 0, maxElo: 800, bandLabel: "Beginner",
    highLevelFocus: "Tactics pattern recognition & blunder avoidance; basic opening principles; simple endgames",
    days: {
      Mon: { dayLabel: "Tactics + rapid games",    taskDetail: "30 min puzzles (forks, pins, mates 1–2); 2 rapid 10+0 games focusing on not hanging pieces; review blunders and write 1 takeaway rule" },
      Tue: { dayLabel: "Opening principles",        taskDetail: "20 min on opening principles (control center, develop knights/bishops, castle); watch 1 beginner lesson; 1 slow 15+10 game applying principles" },
      Wed: { dayLabel: "Tactics + rapid games",    taskDetail: "30 min puzzles slightly above comfort level; 2 rapid games; after each, find 3 better moves without engine" },
      Thu: { dayLabel: "Endgame drills",           taskDetail: "30 min studying K+P vs K and rook ladder mates; practice against engine or drills; 1 training game from a winning endgame position" },
      Fri: { dayLabel: "Tactics + blunder check",  taskDetail: "20 min puzzles (mates 2–3); 2 rapid games; practice blunder-check before every move (look for loose pieces and checks)" },
      Sat: { dayLabel: "Long game + analysis",     taskDetail: "2 long games (15+10 or slower); take notes during critical moments; 45–60 min replaying games, compare with engine after self-analysis" },
      Sun: { dayLabel: "Light review",             taskDetail: "Review your notes for the week; replay 5 key positions from your own games; 15-min puzzle rush or streak" },
    },
  },
  {
    minElo: 800, maxElo: 1200, bandLabel: "Developing",
    highLevelFocus: "Deeper tactics; consistent opening repertoire; fundamental endgames; game analysis habits",
    days: {
      Mon: { dayLabel: "Tactics + rapid games",    taskDetail: "40 min tactics (pins, skewers, discovered attacks, combos); 2 rapid 10+5 games focusing on piece activity; quick review" },
      Tue: { dayLabel: "Opening repertoire",        taskDetail: "30 min on 1 main opening as White (ideas, not memorization); build a mini-repertoire card; 1 slow 15+10 game from that opening" },
      Wed: { dayLabel: "Tactics + defense",        taskDetail: "40 min tactics including defensive puzzles; 2 rapid games; mark every move where you spent <5 seconds and blundered" },
      Thu: { dayLabel: "Endgames",                 taskDetail: "30–40 min basic rook and minor-piece endgames; solve 5 endgame studies; 1 training game starting from equal rook endgame" },
      Fri: { dayLabel: "Tactics + CCT check",      taskDetail: "30 min mixed tactics; 2–3 rapid games; structured blunder check every move (checks, captures, threats)" },
      Sat: { dayLabel: "Long game + analysis",     taskDetail: "1–2 long games (15+10 or 30+0); 60–90 min analysis focusing on opening mistakes and missed tactics; update repertoire notes" },
      Sun: { dayLabel: "Master game + review",     taskDetail: "Replay 1 annotated master game in your openings; review best and worst game of the week; light puzzle session 15–20 min" },
    },
  },
  {
    minElo: 1200, maxElo: 1600, bandLabel: "Intermediate",
    highLevelFocus: "Calculation depth; strategic planning; typical middlegame structures; more complex endgames",
    days: {
      Mon: { dayLabel: "Calculation + long game",  taskDetail: "45 min tactics (set 3–5 min/puzzle, write candidate moves); 1 long 30+0 game and deep self-review" },
      Tue: { dayLabel: "Opening study",            taskDetail: "60 min structured opening study (one line each as White and Black); build a file with model games; no blitz" },
      Wed: { dayLabel: "Tactics + rapid games",    taskDetail: "45 min complex motifs (deflection, interference, decoy, quiet moves); 2 rapid 15+10 games focusing on time management" },
      Thu: { dayLabel: "Positional study",         taskDetail: "45–60 min positional study (weak squares, open files, good vs bad bishops) via book/video; pause and guess moves" },
      Fri: { dayLabel: "Tactics + middlegame",     taskDetail: "30 min tactics + 1 training game from an instructive middlegame; analyze plans, not just tactics" },
      Sat: { dayLabel: "Tournament session",       taskDetail: "1–2 classical games or long match; 90 min analysis including critical positions and alternative plans" },
      Sun: { dayLabel: "Endgame clinic",           taskDetail: "60 min on technical endings (R+P vs R, opposite-colored bishops); review all notes from the week" },
    },
  },
  {
    minElo: 1600, maxElo: 2000, bandLabel: "Advanced",
    highLevelFocus: "Advanced calculation; positional nuances; opening prep; practical endgames; serious game review",
    days: {
      Mon: { dayLabel: "Advanced calculation",     taskDetail: "60 min advanced tactics (3–4 tough puzzles, full variation trees); 1 serious 30+0 game; annotate without engine" },
      Tue: { dayLabel: "Opening prep",             taskDetail: "90 min opening prep in main repertoire using a database; update files, note novelties; spar training positions" },
      Wed: { dayLabel: "Strategy + training",      taskDetail: "60 min middlegame strategy (classic GM game collection, guess moves and compare plans); 1 rapid training game" },
      Thu: { dayLabel: "Practical endgames",       taskDetail: "60 min practical endgames (rook and minor-piece endings from recent GM games); convert advantageous positions vs engine" },
      Fri: { dayLabel: "Tactics + rapid games",    taskDetail: "30–45 min mixed tactics; 1–2 rapid games focusing on practical decision-making under time; post-game blunder review" },
      Sat: { dayLabel: "Tournament simulation",    taskDetail: "1–2 classical games with full pre- and post-game routine; 2–3 hours total analysis" },
      Sun: { dayLabel: "Global review",            taskDetail: "Summarize recurring weaknesses; adjust next week's plan; replay 3 instructive games from top-level play" },
    },
  },
];

function getChessWeeklyBand(currentElo: number): ChessWeeklyBand {
  return CHESS_WEEKLY_SCHEDULES.find(b => currentElo >= b.minElo && currentElo < b.maxElo)
    ?? CHESS_WEEKLY_SCHEDULES[CHESS_WEEKLY_SCHEDULES.length - 1];
}

// ── Chess Opening Repertoire — 4-week weekly plan ─────────────────────────────

const CHESS_OPENING_WEEKLY_PLAN: WeekPlanEntry[] = [
  // Week 1 — White openings vs 1...e5
  { week: 1, day: "Mon", theme: "Italian Game — introduction",
    whiteOpenings: "1.e4 e5 2.Nf3 Nc6 3.Bc4 (Italian Game)",
    blackOpenings: "—",
    tasks: "Watch 1 Italian Game intro video; learn the basic pawn structure and key ideas; play through 3 illustrative master games as White" },
  { week: 1, day: "Tue", theme: "Giuoco Piano — main line",
    whiteOpenings: "4.c3 d5 — Giuoco Piano main line",
    blackOpenings: "—",
    tasks: "Study the Giuoco Piano main line and the key c3-d4 break idea; replay 2 master games from this variation; note key squares and targets" },
  { week: 1, day: "Wed", theme: "Italian sidelines — Two Knights & Evans",
    whiteOpenings: "Two Knights Defense (3...Nf6); Evans Gambit intro",
    blackOpenings: "—",
    tasks: "Learn how to handle 3...Nf6 (Two Knights); understand the Evans Gambit concept; play 2 rapid games as White aiming for the Italian" },
  { week: 1, day: "Thu", theme: "Ruy Lopez — the Spanish Gun",
    whiteOpenings: "1.e4 e5 2.Nf3 Nc6 3.Bb5 (Ruy Lopez) — basic ideas",
    blackOpenings: "—",
    tasks: "Compare Italian vs Spanish — choose your preferred White weapon; study the Ruy Lopez pin concept; annotate 1 game from each opening" },
  { week: 1, day: "Fri", theme: "Practice — White vs 1...e5",
    whiteOpenings: "Practice your chosen 1.e4 e5 system",
    blackOpenings: "—",
    tasks: "Play 3 rapid games as White from 1.e4; focus on reaching your opening preparation; review each game and find one improvement per game" },
  { week: 1, day: "Sat", theme: "Long game session — White openings",
    whiteOpenings: "Full game using e4 system",
    blackOpenings: "—",
    tasks: "Play 2 long games (15+10) as White using your 1.e4 system; deep analysis focusing on the opening phase and transition to middlegame" },
  { week: 1, day: "Sun", theme: "Review & build opening notes",
    whiteOpenings: "Update repertoire notes",
    blackOpenings: "—",
    tasks: "Write a 1-page summary of your White 1.e4 system: key moves, ideas, and what to avoid; replay your 2 favorite games from the week" },

  // Week 2 — White openings vs other Black responses
  { week: 2, day: "Mon", theme: "White vs Sicilian Defense",
    whiteOpenings: "Anti-Sicilian: Alapin (2.c3) or Grand Prix Attack (2.Nc3 + 3.f4)",
    blackOpenings: "—",
    tasks: "Choose an anti-Sicilian system; study the Alapin (2.c3 d5 3.exd5 Qxd5 4.d4) key ideas; watch 1 instructional video on your chosen line" },
  { week: 2, day: "Tue", theme: "White vs French Defense",
    whiteOpenings: "vs 1...e6: Advance Variation (3.e5) or Exchange (3.exd5)",
    blackOpenings: "—",
    tasks: "Study Advance Variation key plan (f4, c3, Nf3 setup); learn the Exchange for simplicity; play 2 rapid games handling the French as White" },
  { week: 2, day: "Wed", theme: "White vs Caro-Kann Defense",
    whiteOpenings: "vs 1...c6: Classical (3.Nc3) or Advance (3.e5)",
    blackOpenings: "—",
    tasks: "Understand the Caro-Kann pawn structure; learn key plans for White; play 2 games against engine set to play 1...c6; annotate each" },
  { week: 2, day: "Thu", theme: "White vs minor defenses",
    whiteOpenings: "vs 1...d5 (Scandinavian); vs 1...Nf6 (Alekhine's Defense)",
    blackOpenings: "—",
    tasks: "Build brief notes on rare Black defenses; know the key White response to each; play 1 rapid game dealing with an unusual Black reply" },
  { week: 2, day: "Fri", theme: "White full repertoire review",
    whiteOpenings: "Full White 1.e4 repertoire recap",
    blackOpenings: "—",
    tasks: "Cover the board — can you recall all your White lines from memory? Identify gaps; play 2 rapid games as White using the full repertoire" },
  { week: 2, day: "Sat", theme: "White full repertoire long session",
    whiteOpenings: "All White lines in long games",
    blackOpenings: "—",
    tasks: "2 long games as White targeting your preparation; 90 min post-game analysis focusing on opening transitions; update your repertoire notes" },
  { week: 2, day: "Sun", theme: "Consolidate White repertoire",
    whiteOpenings: "Finalize White notes",
    blackOpenings: "—",
    tasks: "Finalize White repertoire document; note 3 critical positions you must know by heart; test with a 10-question position quiz or Chessable drills" },

  // Week 3 — Black openings vs 1.e4
  { week: 3, day: "Mon", theme: "Choose your Black defense vs 1.e4",
    whiteOpenings: "—",
    blackOpenings: "Survey: 1...e5 (Open), Sicilian (1...c5), French (1...e6), Caro-Kann (1...c6)",
    tasks: "Decide your Black defense vs 1.e4; watch a 'choose your defense' overview; read about the pawn structure and character of each option" },
  { week: 3, day: "Tue", theme: "Black main line — your chosen defense",
    whiteOpenings: "—",
    blackOpenings: "Main line of your chosen Black defense vs 1.e4",
    tasks: "Study the mainline of your Black defense deeply; learn key pawn structures and typical Black plans; play through 3 master games as Black" },
  { week: 3, day: "Wed", theme: "Black sidelines — handling White's alternatives",
    whiteOpenings: "—",
    blackOpenings: "Key White sidelines and traps vs your defense",
    tasks: "Study White's tricky alternatives; learn how to handle the most critical early deviations; play 2 rapid games as Black reaching your defense" },
  { week: 3, day: "Thu", theme: "Black backup defense",
    whiteOpenings: "—",
    blackOpenings: "Secondary Black defense for variety (e.g. Caro-Kann if main is Sicilian)",
    tasks: "Add a secondary Black defense for variety and surprise value; study its key ideas; play 2 games trying the backup defense vs 1.e4" },
  { week: 3, day: "Fri", theme: "Black vs 1.e4 — consolidation",
    whiteOpenings: "—",
    blackOpenings: "Test your full Black vs 1.e4 preparation",
    tasks: "Play 3 rapid games as Black vs 1.e4; focus on reaching your prepared lines; analyze what went right or wrong in the opening phase" },
  { week: 3, day: "Sat", theme: "Long session — Black vs 1.e4",
    whiteOpenings: "—",
    blackOpenings: "Full Black game practice vs 1.e4",
    tasks: "2 long games as Black vs 1.e4; deep analysis of the opening phase; compare to your preparation notes and update where needed" },
  { week: 3, day: "Sun", theme: "Review — Black vs 1.e4 notes",
    whiteOpenings: "—",
    blackOpenings: "Update and finalize Black vs 1.e4 repertoire",
    tasks: "Write your Black vs 1.e4 repertoire summary; key ideas and critical positions; quiz yourself on 5 key positions without looking at notes" },

  // Week 4 — Black openings vs 1.d4 + full repertoire consolidation
  { week: 4, day: "Mon", theme: "Choose Black defense vs 1.d4",
    whiteOpenings: "—",
    blackOpenings: "Survey: QGD (1...d5), King's Indian (1...Nf6 + g6), Nimzo-Indian, Slav",
    tasks: "Decide your Black weapon vs 1.d4; watch an intro video; study the mainline and key ideas for your chosen defense" },
  { week: 4, day: "Tue", theme: "Black vs 1.d4 — main line deep dive",
    whiteOpenings: "—",
    blackOpenings: "Main line of your chosen d4 defense",
    tasks: "Learn the mainline deeply; key plans for both sides; play through 3 master games as Black; note 3 critical positions to memorize" },
  { week: 4, day: "Wed", theme: "Black vs English (1.c4) and Reti (1.Nf3)",
    whiteOpenings: "—",
    blackOpenings: "Universal setup or specific response to 1.c4 and 1.Nf3",
    tasks: "Develop a solid response to English and Reti; keep it simple (mirror or transpose); play 2 practice games handling these openings as Black" },
  { week: 4, day: "Thu", theme: "Full repertoire integration — both colors",
    whiteOpenings: "Practice White 1.e4 system",
    blackOpenings: "Practice Black defenses vs 1.e4 and 1.d4",
    tasks: "Alternate playing White and Black; aim to reach your prepared lines in every game; annotate each game with a focus on opening accuracy" },
  { week: 4, day: "Fri", theme: "Pressure test — rated games with full repertoire",
    whiteOpenings: "Full White repertoire test",
    blackOpenings: "Full Black repertoire test",
    tasks: "Play 3+ rated games using your complete repertoire; note every deviation from preparation; record your rating before and after the session" },
  { week: 4, day: "Sat", theme: "Long repertoire showcase session",
    whiteOpenings: "White system in full-length game",
    blackOpenings: "Black defenses in full-length game",
    tasks: "2 long games with full pre-game repertoire review; 2+ hours post-game analysis of the opening phases only; find moments to improve" },
  { week: 4, day: "Sun", theme: "Repertoire completion & next steps",
    whiteOpenings: "Finalize White notes & key positions",
    blackOpenings: "Finalize Black notes & key positions",
    tasks: "Complete your full repertoire document; identify the 5 most important positions to memorize; plan your next 4 weeks of continued opening study" },
];

// ── Plan day info helper (week-aware, falls back to static labels/notes) ───────

function getPlanDayInfo(
  plan: HobbyPlan,
  dayLabel: string, // "Mon" | "Tue" | etc.
): { label: string; notes: string } {
  if (plan.weeklyPlan && plan.weeklyPlan.length > 0) {
    // Compute current week number (1-indexed) from plan start date
    let currentWeek = 1;
    if (plan.startDate) {
      const start = new Date(plan.startDate);
      const today = new Date();
      const daysDiff = Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      currentWeek = Math.max(1, Math.floor(daysDiff / 7) + 1);
    }
    // Cap to max available week
    const maxWeek = Math.max(...plan.weeklyPlan.map(e => e.week));
    const week = Math.min(currentWeek, maxWeek);
    const entry = plan.weeklyPlan.find(e => e.week === week && e.day === dayLabel);
    if (entry) {
      const noteParts = [
        entry.whiteOpenings && entry.whiteOpenings !== "—" ? `White: ${entry.whiteOpenings}` : "",
        entry.blackOpenings && entry.blackOpenings !== "—" ? `Black: ${entry.blackOpenings}` : "",
        entry.tasks,
      ].filter(Boolean);
      return { label: entry.theme, notes: noteParts.join(" · ") };
    }
  }
  // Fall back to static dayLabels/dayNotes
  return {
    label: plan.dayLabels?.[dayLabel] ?? "",
    notes: plan.dayNotes?.[dayLabel] ?? "",
  };
}

// ── Activity libraries (from Cadence reference) ─────────────────────────────

// Chess
const CHESS_RATING_ACTIVITIES: Activity[] = [
  { id: "tactics", name: "Tactics & Puzzles", weight: 8, description: "Pattern recognition drills on Lichess/Chess.com puzzle rush. Mix mate-in-2 with calculation sets." },
  { id: "game-review", name: "Game Review", weight: 6, description: "Analyze your last rated game move-by-move. Note one critical mistake and the principle behind it." },
  { id: "openings", name: "Openings", weight: 4, description: "Study one repertoire line. Focus on ideas and pawn structures, not memorization past move 10." },
  { id: "endgames", name: "Endgames", weight: 5, description: "King + pawn, rook endgames, opposition drills. Silman or Lichess endgame trainer." },
  { id: "rated-play", name: "Rated Games", weight: 7, description: "Play 1–2 rated games at 15+10 or longer. No bullet. Take 30 seconds before each candidate move." },
  { id: "analysis", name: "Deep Analysis", weight: 3, description: "Pick one master game in your opening. Cover the moves and predict before checking." },
];
const CHESS_STUDY_HABIT_ACTIVITIES: Activity[] = [
  { id: "tactics-routine", name: "Tactics Routine", weight: 8, description: "Complete a short tactics set. Review every missed puzzle until the forcing idea is clear." },
  { id: "mini-review", name: "Mini Game Review", weight: 5, description: "Review one recent game or one critical position. Write down one repeatable lesson." },
  { id: "study-streak", name: "Habit Streak", weight: 6, description: "Protect the daily routine. Keep the session small enough to finish even on busy days." },
];
const CHESS_OPENINGS_ACTIVITIES: Activity[] = [
  { id: "white-system-e5", name: "White vs 1...e5", weight: 7, description: "Learn your main line, common traps, and the pawn structure plans against 1...e5." },
  { id: "white-system-c5", name: "White vs 1...c5", weight: 7, description: "Build a practical response to the Sicilian. Focus on typical middlegame plans, not long memorization." },
  { id: "model-games", name: "Model Games", weight: 5, description: "Study one model game for each opening branch and summarize the plan in plain English." },
  { id: "repertoire-review", name: "Repertoire Review", weight: 4, description: "Use spaced repetition to review the first 8–10 moves and the purpose behind each move." },
];
const CHESS_ENDGAME_ACTIVITIES: Activity[] = [
  { id: "king-pawn", name: "King & Pawn Basics", weight: 8, description: "Practice opposition, key squares, outside passers, and basic pawn races until they feel automatic." },
  { id: "conversion-drills", name: "Conversion Drills", weight: 6, description: "Play winning pawn endings against an engine or trainer and convert without hints." },
  { id: "defensive-holds", name: "Defensive Holds", weight: 5, description: "Practice drawing techniques: opposition, stalemate tricks, and active king defense." },
];
const CHESS_TOURNAMENT_ACTIVITIES: Activity[] = [
  { id: "classical-games", name: "Serious Practice Games", weight: 8, description: "Play longer time-control games that mimic the event. No blitz-only preparation." },
  { id: "post-game-analysis", name: "Post-game Analysis", weight: 7, description: "Annotate each practice game before using an engine. Identify opening, calculation, and time-use mistakes." },
  { id: "opening-refresh", name: "Opening Refresh", weight: 5, description: "Review only the lines you are likely to play. Keep a one-page prep sheet." },
  { id: "event-readiness", name: "Event Readiness", weight: 4, description: "Prepare time controls, notation habits, warmups, sleep, and a between-round reset routine." },
];
const CHESS_CUSTOM_ACTIVITIES: Activity[] = [
  { id: "core-practice", name: "Core Practice", weight: 7, description: "Spend most sessions on the chess sub-skill that creates the biggest bottleneck." },
  { id: "tactics-custom", name: "Tactics", weight: 6, description: "Daily tactics puzzles to build pattern recognition and calculation." },
  { id: "review-loop", name: "Review Loop", weight: 5, description: "Review results weekly and adjust activities, weights, or commitment if progress stalls." },
];

// Language
const LANG_COMMUNICATION_ACTIVITIES: Activity[] = [
  { id: "speaking-reps", name: "Speaking Reps", weight: 8, description: "Practice 5–10 minute conversations around daily life. Stay in the language and use simple sentences when stuck." },
  { id: "conversation-scripts", name: "Conversation Scripts", weight: 6, description: "Prepare reusable phrases for introductions, work, food, travel, fitness, and small talk." },
  { id: "listening-response", name: "Listen & Respond", weight: 6, description: "Listen to short learner audio, pause, and answer out loud in your own words." },
  { id: "pronunciation", name: "Pronunciation", weight: 4, description: "Shadow native audio for rhythm, stress, and confidence. Record yourself once per week." },
];
const LANG_EXAM_ACTIVITIES: Activity[] = [
  { id: "exam-speaking", name: "Speaking Tasks", weight: 7, description: "Practice structured exam prompts and timed oral answers with feedback." },
  { id: "exam-listening", name: "Listening Practice", weight: 7, description: "Work through level-appropriate listening sections and summarize the main idea plus details." },
  { id: "exam-reading", name: "Reading Practice", weight: 6, description: "Read B1/B2 passages, answer comprehension questions, and extract reusable expressions." },
  { id: "exam-writing", name: "Writing Practice", weight: 6, description: "Write short essays, emails, and summaries. Track recurring grammar and vocabulary gaps." },
  { id: "mock-exams", name: "Mock Exams", weight: 5, description: "Take timed practice sections monthly, then convert mistakes into the next study block." },
];
const LANG_ROUTINE_ACTIVITIES: Activity[] = [
  { id: "daily-study", name: "Daily Study Block", weight: 8, description: "Complete a focused 30-minute study session without overcomplicating it." },
  { id: "weekly-words", name: "Vocabulary Building", weight: 7, description: "Learn useful words or phrases each week, then use them in original sentences." },
  { id: "srs-review", name: "Spaced Repetition", weight: 5, description: "Review flashcards and retire words you can already use naturally." },
  { id: "weekly-checkin", name: "Weekly Check-in", weight: 4, description: "Review minutes studied, words retained, and one practical situation you can now handle." },
];
const LANG_TRAVEL_ACTIVITIES: Activity[] = [
  { id: "survival-scenarios", name: "Survival Scenarios", weight: 8, description: "Practice restaurants, directions, stores, transportation, hotels, and basic problem-solving." },
  { id: "roleplay", name: "Roleplay Sessions", weight: 7, description: "Simulate real interactions with a tutor, exchange partner, or AI voice partner." },
  { id: "local-listening", name: "Local Listening", weight: 5, description: "Listen to announcements, menus, short videos, and everyday speech from the target country." },
  { id: "travel-vocabulary", name: "Travel Vocabulary", weight: 5, description: "Build practical phrase banks for money, time, emergencies, plans, food, and transportation." },
];
const LANG_CUSTOM_ACTIVITIES: Activity[] = [
  { id: "input", name: "Input", weight: 6, description: "Get regular listening and reading exposure slightly above your current level." },
  { id: "output", name: "Output", weight: 7, description: "Speak or write every week and use corrections to decide the next practice focus." },
  { id: "vocab-custom", name: "Vocabulary", weight: 5, description: "Build vocabulary systematically through spaced repetition and real-use examples." },
  { id: "review-lang", name: "Review Loop", weight: 4, description: "Track what you can now understand or say, then adjust the plan every two weeks." },
];

// Instrument
const INSTR_CORE_ACTIVITIES: Activity[] = [
  { id: "rhythm", name: "Steady Rhythm", weight: 8, description: "Practice with a metronome or backing track. Keep the pulse steady before increasing speed." },
  { id: "tone", name: "Tone & Touch", weight: 6, description: "Focus on clean sound, relaxed posture, and consistent dynamics across the whole piece." },
  { id: "simple-song", name: "Simple Song", weight: 7, description: "Work section-by-section until you can play one simple song from start to finish." },
  { id: "slow-reps", name: "Slow Reps", weight: 5, description: "Repeat hard transitions slowly, then chain them into the full song without stopping." },
];
const INSTR_REPERTOIRE_ACTIVITIES: Activity[] = [
  { id: "song-learning", name: "Song Learning", weight: 8, description: "Learn one favorite song at a time. Break it into intro, verse, chorus, bridge, and ending." },
  { id: "memory", name: "Memory Work", weight: 6, description: "Play without looking at notes or tabs. Use small chunks and recall before repeating." },
  { id: "transitions", name: "Transitions", weight: 6, description: "Practice the parts where songs fall apart: chord changes, fingering shifts, and entrances." },
  { id: "setlist-run", name: "Setlist Run", weight: 5, description: "Run through all learned songs weekly and mark which ones are performance-ready." },
];
const INSTR_TECHNIQUE_ACTIVITIES: Activity[] = [
  { id: "scales", name: "Scales", weight: 8, description: "Practice major/minor scales slowly with accuracy first, then gradually build speed." },
  { id: "chords", name: "Chords", weight: 7, description: "Drill common chord shapes, voicings, inversions, or hand positions for your instrument." },
  { id: "speed-accuracy", name: "Speed & Accuracy", weight: 6, description: "Use a metronome ladder. Only increase tempo when the passage is clean three times in a row." },
  { id: "basic-theory", name: "Basic Theory", weight: 4, description: "Connect scales, chords, and songs so the instrument starts making musical sense." },
];
const INSTR_PERFORMANCE_ACTIVITIES: Activity[] = [
  { id: "fun-play", name: "Play for Fun", weight: 7, description: "Play at least twice a week purely for enjoyment, without stopping to over-correct." },
  { id: "performance-run", name: "Performance Run", weight: 7, description: "Play a full song as if someone is listening. Recover from mistakes instead of restarting." },
  { id: "recording", name: "Record Yourself", weight: 5, description: "Record one take weekly, listen back, and pick one improvement for the next session." },
  { id: "mini-audience", name: "Mini Audience", weight: 4, description: "Perform for a friend, family member, or camera to build comfort under light pressure." },
];
const INSTR_CUSTOM_ACTIVITIES: Activity[] = [
  { id: "fundamentals-instr", name: "Fundamentals", weight: 6, description: "Practice the core mechanics that make everything else easier: posture, timing, tone, and control." },
  { id: "repertoire-instr", name: "Repertoire", weight: 6, description: "Apply fundamentals to songs or pieces you actually want to play." },
  { id: "feedback-instr", name: "Feedback Loop", weight: 4, description: "Record, review, or get feedback weekly so practice stays deliberate." },
];

// Gardening
const GARDEN_FOOD_ACTIVITIES: Activity[] = [
  { id: "crop-plan", name: "Crop Plan", weight: 6, description: "Choose varieties, planting dates, containers or beds, and expected harvest windows." },
  { id: "soil-feeding", name: "Soil & Feeding", weight: 7, description: "Prepare soil, compost, mulch, and a simple feeding routine so plants have steady nutrition." },
  { id: "watering", name: "Watering Rhythm", weight: 7, description: "Check moisture, water deeply, and adjust frequency as heat and plant size increase." },
  { id: "harvest-care", name: "Harvest Care", weight: 5, description: "Prune, support, inspect for pests, and harvest regularly so plants keep producing." },
];
const GARDEN_AESTHETICS_ACTIVITIES: Activity[] = [
  { id: "bed-design", name: "Bed Design", weight: 7, description: "Map the flower bed by height, color, bloom season, sun exposure, and viewing angles." },
  { id: "succession-blooms", name: "Succession Blooms", weight: 8, description: "Choose plants so something is blooming from early spring through fall." },
  { id: "planting-maintenance", name: "Planting & Maintenance", weight: 6, description: "Plant, deadhead, mulch, divide, and tidy beds on a recurring schedule." },
  { id: "seasonal-refresh", name: "Seasonal Refresh", weight: 5, description: "Add seasonal color, replace underperformers, and update the bed as conditions change." },
];
const GARDEN_LEARNING_ACTIVITIES: Activity[] = [
  { id: "seed-starting", name: "Seed Starting", weight: 8, description: "Start varieties indoors with correct depth, moisture, light, labeling, and temperature." },
  { id: "hardening-off", name: "Hardening Off", weight: 6, description: "Gradually acclimate seedlings outdoors so they survive sun, wind, and temperature swings." },
  { id: "transplanting", name: "Transplanting", weight: 7, description: "Transplant at the right spacing and depth, then water in and protect young plants." },
  { id: "garden-journal", name: "Garden Journal", weight: 4, description: "Track germination, failures, transplant dates, weather, pests, and what you would change next season." },
];
const GARDEN_RELAXATION_ACTIVITIES: Activity[] = [
  { id: "tending", name: "Tending", weight: 7, description: "Spend 15–20 minutes watering, pruning, weeding, or checking plants without turning it into a chore." },
  { id: "relaxation", name: "Relaxation", weight: 7, description: "Use part of each garden session to slow down, observe growth, and enjoy being outside." },
  { id: "light-maintenance", name: "Light Maintenance", weight: 5, description: "Keep the space peaceful with small cleanup tasks: deadheading, sweeping, and tidying." },
  { id: "seasonal-notes", name: "Seasonal Notes", weight: 3, description: "Capture what feels good in the garden and what would make it more enjoyable next week." },
];
const GARDEN_CUSTOM_ACTIVITIES: Activity[] = [
  { id: "setup-garden", name: "Setup", weight: 6, description: "Prepare beds, containers, soil, tools, water access, seeds, or starter plants." },
  { id: "care-routine", name: "Care Routine", weight: 7, description: "Build a recurring care rhythm for watering, feeding, pruning, weeding, and observation." },
  { id: "review-garden", name: "Review & Adjust", weight: 4, description: "Review progress monthly and adapt plant choices, care routines, or layout." },
];

// Poker
const POKER_VOLUME_ACTIVITIES: Activity[] = [
  { id: "hand-volume", name: "Hand Volume", weight: 8, description: "Play focused online sessions toward the monthly hand target. Stop when quality drops." },
  { id: "session-planning", name: "Session Planning", weight: 5, description: "Plan table count, session length, breaks, and daily hand targets before playing." },
  { id: "marked-hands", name: "Marked Hands", weight: 6, description: "Mark uncertain hands in-game for later review instead of trying to solve every spot live." },
  { id: "tilt-control", name: "Tilt Control", weight: 5, description: "Use stop-loss, cooldown, and focus checks so volume does not turn into autopilot." },
];
const POKER_STUDY_ACTIVITIES: Activity[] = [
  { id: "marked-hand-review", name: "Marked Hand Review", weight: 8, description: "Review marked hands and tag the leak: preflop, c-bet, turn probe, river value, bluff, or call-down." },
  { id: "solver-review", name: "Solver / Range Review", weight: 6, description: "Study one recurring spot with ranges or a solver, then write the practical takeaway." },
  { id: "database-review", name: "Database Review", weight: 6, description: "Check stats and filters weekly to find the biggest leak or population exploit." },
  { id: "concept-notes", name: "Concept Notes", weight: 4, description: "Turn study into short rules, heuristics, and examples you can recall while playing." },
];
const POKER_WIN_RATE_ACTIVITIES: Activity[] = [
  { id: "quality-volume", name: "Quality Volume", weight: 7, description: "Play tracked hands with fewer tables and higher decision quality." },
  { id: "leak-fixing", name: "Leak Fixing", weight: 8, description: "Pick one major leak each week and measure whether the stat or spot improves." },
  { id: "line-review", name: "Line Review", weight: 6, description: "Review redline/showdown patterns and identify where value, bluffs, or calls are leaking." },
  { id: "weekly-scorecard", name: "Weekly Scorecard", weight: 5, description: "Track bb/100, EV bb/100, volume, tilt incidents, and the top lesson from the week." },
];
const POKER_BANKROLL_ACTIVITIES: Activity[] = [
  { id: "bankroll-tracking", name: "Bankroll Tracking", weight: 8, description: "Update bankroll, buy-ins, rakeback, withdrawals, and shot-taking readiness each week." },
  { id: "game-selection", name: "Game Selection", weight: 7, description: "Prioritize soft tables and formats where your edge is clearest before increasing stakes." },
  { id: "shot-rules", name: "Shot Rules", weight: 6, description: "Define move-up, move-down, stop-loss, and table-count rules before taking a shot." },
  { id: "mental-game", name: "Mental Game", weight: 5, description: "Practice discipline around variance so bankroll decisions stay rule-based, not emotional." },
];
const POKER_TOURNAMENT_ACTIVITIES: Activity[] = [
  { id: "tournament-schedule", name: "Tournament Schedule", weight: 6, description: "Choose target events, satellites, bankroll rules, and study blocks leading into the event." },
  { id: "icm-final-table", name: "ICM & Final Table", weight: 8, description: "Study bubble, pay-jump, and final-table spots with ICM pressure and stack-depth awareness." },
  { id: "mtt-spots", name: "MTT Spots", weight: 7, description: "Review push/fold, 3-bet jam, blind-vs-blind, and short-stack decisions." },
  { id: "event-review", name: "Event Review", weight: 5, description: "After each tournament, review bustout hands, key decisions, and preparation gaps." },
];
const POKER_CUSTOM_ACTIVITIES: Activity[] = [
  { id: "play-poker", name: "Play", weight: 7, description: "Schedule focused volume that matches the goal without sacrificing decision quality." },
  { id: "study-poker", name: "Study", weight: 6, description: "Review hands, ranges, spots, or database leaks that directly affect the target metric." },
  { id: "track-poker", name: "Track & Adjust", weight: 5, description: "Review results weekly and adjust volume, study focus, bankroll rules, or mental game habits." },
];

// Hobby groups — generic activity sets
function makeHobbyActivities(hobby: string, group: string): Activity[] {
  if (group === "Collecting" || group === "collection") return [
    { id: "research", name: "Market & Item Research", weight: 7, description: `Study eras, makers, editions, condition signals, pricing, and authenticity markers for ${hobby}.` },
    { id: "catalog", name: "Catalog & Grading", weight: 7, description: `Document each item with photos, notes, condition, acquisition cost, current value, and source.` },
    { id: "sourcing", name: "Sourcing", weight: 6, description: `Use a clear wish list and budget before buying, trading, or bidding on ${hobby}.` },
    { id: "care-display", name: "Care & Display", weight: 5, description: `Protect, store, clean, insure, or display the collection so condition and enjoyment improve over time.` },
  ];
  if (group === "Outdoor" || group === "outdoor") return [
    { id: "sessions", name: "Practice Sessions", weight: 8, description: `Schedule consistent ${hobby} sessions with the right intensity, route, location, or conditions.` },
    { id: "technique-outdoor", name: "Technique & Safety", weight: 6, description: `Improve form, gear choices, safety checks, and decision-making before pushing harder.` },
    { id: "planning-outdoor", name: "Planning", weight: 5, description: `Plan routes, weather, logistics, equipment, and recovery so each outing is repeatable.` },
    { id: "logbook", name: "Logbook", weight: 4, description: `Track distance, time, conditions, sightings, catches, routes, or notes that show progress.` },
  ];
  if (group === "Games" || group === "games") return [
    { id: "focused-play", name: "Focused Play", weight: 8, description: `Play intentional ${hobby} sessions with one skill, strategy, or objective in mind.` },
    { id: "strategy-games", name: "Strategy Study", weight: 6, description: `Study rules, strategy guides, decision patterns, builds, or scenarios that improve play quality.` },
    { id: "review-games", name: "Review Loop", weight: 6, description: `Review sessions, wins, losses, or campaign notes and identify one lesson to apply next time.` },
    { id: "event-prep", name: "Event Prep", weight: 4, description: `Prepare for a tournament, game night, campaign session, or completion milestone.` },
  ];
  if (group === "Maker" || group === "learning") return [
    { id: "fundamentals-maker", name: "Fundamentals", weight: 7, description: `Practice the core concepts, tools, materials, safety, or recipes behind ${hobby}.` },
    { id: "build-sessions", name: "Build Sessions", weight: 7, description: `Make progress on a concrete ${hobby} project, recipe, batch, prototype, or working build.` },
    { id: "troubleshoot", name: "Troubleshooting", weight: 6, description: `Debug mistakes, tune settings, adjust ingredients, and document what changed.` },
    { id: "workflow", name: "Workflow & Notes", weight: 4, description: `Create repeatable checklists, setup notes, or cleanup routines.` },
  ];
  if (group === "Performance" || group === "performance") return [
    { id: "fundamentals-perf", name: "Fundamentals", weight: 7, description: `Practice the core technique, warmups, timing, and body awareness behind ${hobby}.` },
    { id: "rehearsal", name: "Rehearsal", weight: 8, description: `Run focused ${hobby} reps, scenes, sets, or exercises with a clear standard for improvement.` },
    { id: "feedback-perf", name: "Feedback", weight: 6, description: `Record, review, coach, or rehearse with others so the next session has one specific correction.` },
    { id: "showcase-prep", name: "Showcase Prep", weight: 4, description: `Prepare a performance, audition, open mic, recital, or filmed take.` },
  ];
  // Creative Arts (default)
  return [
    { id: "technique-creative", name: "Technique Practice", weight: 7, description: `Practice the core techniques, tools, references, and creative constraints behind ${hobby}.` },
    { id: "project-work", name: "Project Work", weight: 7, description: `Advance one concrete ${hobby} piece from idea to finished work.` },
    { id: "reference", name: "Reference & Inspiration", weight: 5, description: `Collect references, study examples, sketch ideas, or identify design choices worth borrowing.` },
    { id: "finish-feedback", name: "Finish & Feedback", weight: 5, description: `Finish, photograph, share, critique, or revise the work so progress is visible.` },
  ];
}

// ── Computed plan engine (ported from Cadence planner.ts) ─────────────────────

function clampNum(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }

function hpStartOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
function hpToIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}
function hpParseDate(s: string, fallback: Date): Date {
  const parts = s.split("-").map(Number);
  const d = parts.length === 3 ? new Date(parts[0], parts[1]-1, parts[2]) : new Date(s);
  return isNaN(d.getTime()) ? fallback : d;
}
function hpIsoWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
function hpPickTrainingDays(days: number): number[] {
  const out: number[] = [];
  const step = 7 / days;
  for (let i = 0; i < days; i++) out.push(Math.round(i * step) % 7);
  return Array.from(new Set(out)).sort((a, b) => a - b);
}

function computeHobbyPlan(plan: HobbyPlan, now: Date = new Date()): ComputedHobbyPlan | null {
  const activities = plan.activities;
  if (!activities || activities.length === 0) return null;
  const estimatedTotalHours = plan.estimatedTotalHours ?? 20;
  const sessionsPerWeek = clampNum(plan.commitmentDaysPerWeek ?? 3, 1, 7);
  const minutesPerSession = Math.max(plan.minutesPerSession ?? 45, 5);
  const weeklyMinutes = sessionsPerWeek * minutesPerSession;
  const weeklyHours = weeklyMinutes / 60;
  const totalHours = Math.max(estimatedTotalHours, 0.1);
  const weeksToGoal = Math.max(1, Math.ceil(totalHours / Math.max(weeklyHours, 0.1)));
  const start = plan.startDate ? hpParseDate(plan.startDate, now) : now;
  const completionDate = new Date(start.getTime() + weeksToGoal * 7 * 24 * 60 * 60 * 1000);

  const notes: string[] = [
    `${sessionsPerWeek} day${sessionsPerWeek===1?"":"s"} × ${minutesPerSession} min = ${weeklyMinutes} min/week (${weeklyHours.toFixed(1)} h).`,
    `Goal needs ~${Math.round(totalHours)} focused training hours.`,
    `${Math.round(totalHours)} h ÷ ${weeklyHours.toFixed(1)} h/week ≈ ${weeksToGoal} week${weeksToGoal===1?"":"s"}.`,
  ];

  // Weekly allocation by weight
  const totalWeight = activities.reduce((acc, a) => acc + a.weight, 0) || 1;
  const weeklyAllocation = activities.map(a => ({
    activityId: a.id,
    activityName: a.name,
    description: a.description,
    weight: a.weight,
    weeklyMinutes: Math.round(weeklyMinutes * (a.weight / totalWeight)),
  }));

  // Build scheduled sessions
  const completedTaskKeys = new Set((plan.taskCompletions ?? []).map(c => c.taskKey));
  const totalMinutes = Math.ceil(totalHours * 60);
  const totalSessions = Math.max(1, Math.ceil(totalMinutes / minutesPerSession));
  const horizonSessions = totalSessions + sessionsPerWeek * 3;
  const trainingDays = hpPickTrainingDays(sessionsPerWeek);
  const sortedActs = [...activities].sort((a, b) => b.weight - a.weight);

  type ScheduledSession = { sessionIndex: number; originalDate: string; blocks: DailyActivityBlock[] };
  const sessions: ScheduledSession[] = [];
  const cursor = hpStartOfDay(start);
  const today = hpStartOfDay(now);
  let guardDays = 0;
  while (sessions.length < horizonSessions && guardDays < horizonSessions * 14 + 30) {
    const dayIdx = (cursor.getDay() + 6) % 7;
    if (trainingDays.includes(dayIdx)) {
      const sessionIndex = sessions.length;
      const originalDate = hpToIsoDate(cursor);
      const blockCount = minutesPerSession >= 40 ? 2 : 1;
      const blocks: DailyActivityBlock[] = [];
      for (let b = 0; b < blockCount; b++) {
        const act = sortedActs[(sessionIndex + b) % sortedActs.length];
        const baseMinutes = Math.floor(minutesPerSession / blockCount);
        const mins = Math.max(10, baseMinutes + (b < (minutesPerSession % blockCount) ? 1 : 0));
        const taskKey = `session-${sessionIndex}-block-${b}`;
        blocks.push({
          taskKey, activityId: act.id, activityName: act.name, minutes: mins,
          description: act.description, originalDate, scheduledDate: originalDate,
          completed: completedTaskKeys.has(taskKey), carriedForward: false,
        });
      }
      sessions.push({ sessionIndex, originalDate, blocks });
    }
    cursor.setDate(cursor.getDate() + 1);
    guardDays++;
    if (cursor.getTime() > today.getTime() + 370 * 24 * 60 * 60 * 1000 && sessions.length >= totalSessions) break;
  }

  // Compute progress
  const completedMinutes = sessions.flatMap(s => s.blocks).filter(b => b.completed).reduce((a, b) => a + b.minutes, 0);
  const hoursCompleted = Math.min(totalHours, completedMinutes / 60);
  const progressPct = clampNum((hoursCompleted / totalHours) * 100, 0, 100);

  // Build shifted schedule (today's plan + 7-day view)
  const todayIso = hpToIsoDate(today);
  const pendingSessions = sessions
    .map(s => ({ ...s, blocks: s.blocks.filter(b => !b.completed) }))
    .filter(s => s.blocks.length > 0);
  const eligiblePending = pendingSessions.filter(s => s.originalDate <= todayIso);
  const queueCopy = [...pendingSessions];
  const weeklySchedule: ComputedWeekDay[] = [];
  let todayPlan: DailyActivityBlock[] = [];

  for (let offset = 0; offset < 7; offset++) {
    const date = new Date(today);
    date.setDate(today.getDate() + offset);
    const dateIso = hpToIsoDate(date);
    const dayIdx = (date.getDay() + 6) % 7;
    const isToday = offset === 0;
    const isTrainingDay = trainingDays.includes(dayIdx);
    let session: ScheduledSession | undefined;
    if (isToday) {
      session = eligiblePending.length > 0 ? queueCopy.shift() : undefined;
    } else if (isTrainingDay && queueCopy.length > 0 && queueCopy[0].originalDate <= dateIso) {
      session = queueCopy.shift();
    }
    const blocks = session ? session.blocks.map(block => ({
      ...block, scheduledDate: dateIso, carriedForward: block.originalDate < dateIso,
    })) : [];
    if (isToday) todayPlan = blocks;
    const daySession = sessions.find(s => s.originalDate === dateIso);
    const allBlocksDone = daySession ? daySession.blocks.every(b => b.completed) : false;
    weeklySchedule.push({
      date: dateIso,
      dayName: date.toLocaleDateString(undefined, { weekday: "short" }),
      isToday, isTrainingDay,
      status: isToday && blocks.length > 0 ? "today"
        : blocks.length > 0 ? "upcoming"
        : isTrainingDay && allBlocksDone ? "complete"
        : isTrainingDay ? "complete"
        : "rest",
      originalDate: session?.originalDate ?? null,
      blocks,
    });
  }

  // Weekly / monthly focus
  const week = hpIsoWeek(now);
  const top = sortedActs[0];
  const weeklyFocus = top
    ? { title: `${top.name} this week`, detail: `${top.name} carries the highest leverage right now. Dedicate ~${Math.round((top.weight/totalWeight)*weeklyMinutes)} min across your ${sessionsPerWeek} session${sessionsPerWeek===1?"":"s"}.` }
    : { title: "Plan your week", detail: "Add activities to your plan to see focus." };
  const monthCycle = sortedActs.slice(0, Math.min(3, sortedActs.length));
  const monthFocus = monthCycle[(now.getMonth() + week) % Math.max(monthCycle.length, 1)] ?? top;
  const monthlyFocus = monthFocus
    ? { title: `Month theme — Master ${monthFocus.name}`, detail: `Spend this month building durability in ${monthFocus.name.toLowerCase()}. Track one measurable signal so progress is visible.` }
    : { title: "Set a monthly theme", detail: "Pick a focus area for the month." };

  return {
    assumptions: { totalHours, weeklyHours, weeklyMinutes, sessionsPerWeek, minutesPerSession, weeksToGoal, completionDate: completionDate.toISOString().slice(0,10), progressPct, hoursCompleted, notes },
    weeklyAllocation, todayPlan, weeklySchedule, weeklyFocus, monthlyFocus, isRestDay: !trainingDays.includes((now.getDay()+6)%7),
  };
}

// ── Chess ELO helpers ──────────────────────────────────────────────────────────

// 400 ELO gain = 12 months baseline; 1000 ELO gain = 30 months.
// Linear interpolation between the two anchors; scale down for smaller gaps.
function calcChessDuration(gap: number): { months: number; weeks: number; monthlyGain: number } {
  const g = Math.max(1, gap);
  let months: number;
  if (g <= 400) {
    months = Math.max(2, Math.round((g / 400) * 12));
  } else {
    months = Math.round(12 + ((Math.min(g, 1000) - 400) / 600) * 18);
    months = Math.min(months, 30);
  }
  return { months, weeks: months * 4, monthlyGain: Math.round(g / months) };
}

const CHESS_PHASES = [
  { name: "Blunder reduction & basic tactics",      secondary: "Opening principles",           activities: "Daily tactics puzzles (30–45 min) · Learn basic 1.e4/1.d4 principles · Play 3–5 rapid games/week and review blunders" },
  { name: "Intermediate tactics & simple endgames", secondary: "Opening repertoire",           activities: "Intermediate puzzles daily · Rook & pawn endgames · Build a 2–3 line opening repertoire for each color" },
  { name: "Middlegame planning & endgames",         secondary: "Tactics maintenance",          activities: "Strategic planning study · Complex endgames (R+K, Q endings) · Analyze 1 master game/week for ideas" },
  { name: "Game analysis & consistency",            secondary: "Advanced openings/endgames",   activities: "Deep analysis of your own games · Advanced endgame technique · Play in rated tournaments or events" },
];

function generateChessEloSteps(currentElo: number, targetElo: number, months: number): GoalStep[] {
  const gap = targetElo - currentElo;
  const steps: GoalStep[] = [];
  const mpPhase = months / 4;

  steps.push({ id: genId(), done: false,
    text: `Setup — record starting rating (${currentElo}), choose platform (Lichess or Chess.com), and schedule weekly study time`,
  });

  for (let i = 0; i < 4; i++) {
    const startMonth = Math.round(i * mpPhase) + 1;
    const endMonth   = Math.round((i + 1) * mpPhase);
    const endRating  = Math.round(currentElo + (gap / 4) * (i + 1));
    const ph = CHESS_PHASES[i];
    steps.push({ id: genId(), done: false,
      text: `Month${startMonth === endMonth ? ` ${startMonth}` : `s ${startMonth}–${endMonth}`}: ${ph.name} + ${ph.secondary} — ${ph.activities}`,
    });
    steps.push({ id: genId(), done: false,
      text: `Month ${endMonth} checkpoint: Target ~${endRating} rating · Analyze 5 recent losses for recurring patterns`,
    });
  }

  steps.push({ id: genId(), done: false,
    text: `Month ${months}: Final push — reach ${targetElo} ELO target · Play a tournament or official rated event to lock in the gain`,
  });

  return steps;
}

// ── Chess plan helpers ─────────────────────────────────────────────────────────

type ChessGoalType = "rating" | "study" | "openings" | "endgames" | "tournament";

const CHESS_PLAN_TEMPLATES: PlanTemplate[] = [
  { id: "ch-rating",     emoji: "⚡",  label: "Rating goal",         description: "Reach a target rating on Chess.com or Lichess",                durationWeeks: 12, defaultSteps: [] },
  { id: "ch-study",      emoji: "📚",  label: "Daily study habit",   description: "Build a consistent tactics or study routine — e.g. 30 min/day", durationWeeks: 8,  defaultSteps: [] },
  { id: "ch-openings",   emoji: "♟️", label: "Opening repertoire",  description: "Learn one White system vs 1…e5 and 1…c5",                      durationWeeks: 6,  defaultSteps: [] },
  { id: "ch-endgames",   emoji: "👑",  label: "Endgame mastery",     description: "Master basic king and pawn endings this month",                 durationWeeks: 4,  defaultSteps: [] },
  { id: "ch-tournament", emoji: "🏆",  label: "Tournament prep",     description: "Prepare for and play your first OTB or online event",           durationWeeks: 8,  defaultSteps: [] },
];

const CHESS_GOAL_TYPE_MAP: Record<string, ChessGoalType> = {
  "ch-rating": "rating", "ch-study": "study", "ch-openings": "openings",
  "ch-endgames": "endgames", "ch-tournament": "tournament",
};

function generateChessGoalSteps(
  goalType: ChessGoalType,
  opts: {
    currentElo?: string; targetElo?: string; months?: number;
    studyMins?: string; studyDays?: string; studyFocus?: string;
    openingColor?: string; vsResponse?: string; openingSystem?: string;
    endgameTopics?: string[];
    tournamentType?: string; tournamentDate?: string;
  },
): GoalStep[] {
  const g = (s: string) => ({ id: genId(), done: false, text: s });
  switch (goalType) {
    case "rating":
      return generateChessEloSteps(Number(opts.currentElo ?? 0), Number(opts.targetElo ?? 0), opts.months ?? 12);
    case "study": {
      const mins = opts.studyMins ?? "30"; const days = opts.studyDays ?? "5"; const focus = opts.studyFocus ?? "Tactics";
      return [
        g(`Set up your ${focus} resource — Lichess Puzzles, Chess.com, or Chessable`),
        g(`Week 1–2: Build the habit — ${mins} min of ${focus.toLowerCase()}, ${days} days/week`),
        g(`Week 3–4: Track streak and consistency — aim for 90%+ days completed`),
        g(`Month 2: Check progress — are your puzzle ratings and accuracy improving?`),
        g(`Month 2: Add a second element — game review or opening mini-study`),
        g(`Final weeks: Maintain routine, review blunders from recent games`),
      ];
    }
    case "openings": {
      const color = opts.openingColor ?? "White"; const vsR = opts.vsResponse ?? "1...e5"; const sys = opts.openingSystem?.trim() || "";
      return [
        g(`Choose your ${color} system${sys ? ` — ${sys}` : ""} vs ${vsR} · get a reference (book, Chessable course, or video series)`),
        g(`Study the main line — key ideas, typical pawn structure, key squares`),
        g(`Learn the 2–3 most common sidelines and how to handle them`),
        g(`Play 10 games as ${color} using your new opening · annotate each game`),
        g(`Identify recurring uncomfortable positions — study those specifically`),
        g(`Play 10 more games to consolidate · review and build a personal repertoire doc`),
      ];
    }
    case "endgames": {
      const topics = opts.endgameTopics?.length ? opts.endgameTopics : ["King and pawn endings"];
      return [
        g(`Get study material on: ${topics.join(", ")} (Silman's Complete Endgame Course recommended)`),
        g(`Week 1: Learn the theoretical positions and key rules for each topic`),
        g(`Week 2: Drill endgame puzzles — 20 puzzles per session on target topics`),
        g(`Week 3: Practice positions against a computer or training partner`),
        g(`Week 4: Play games and review every endgame that arises, win or lose`),
        g(`Final check: explain each key position from memory without notes`),
      ];
    }
    case "tournament": {
      const etype = opts.tournamentType ?? "OTB";
      return [
        g(`Find a ${etype} event and register · note the time control and format`),
        g(`Solidify openings — 2–3 lines for White and Black you feel confident playing`),
        g(`Practice at classical or rapid time controls — slow down and calculate`),
        g(`Drill tactical motifs: pins, forks, skewers, discovered attacks, back-rank mates`),
        g(`Play 2–3 practice games at the event time control · review with engine after`),
        g(`Event day — focus on process over result · review all games the same evening`),
      ];
    }
  }
}

// ── Poker helpers ──────────────────────────────────────────────────────────────

// Stakes ordered lowest → highest. Each level jump = 12 months baseline, max 36.
const POKER_STAKES = ["NL2", "NL5", "NL10", "NL25", "NL50", "NL100", "NL200", "NL500+"] as const;
type PokerStake = typeof POKER_STAKES[number];

function calcPokerDuration(jumps: number): { months: number; weeks: number } {
  const months = Math.min(jumps * 12, 36);
  return { months, weeks: months * 4 };
}

const POKER_PHASES = [
  {
    name: "Fundamentals & discipline",
    secondary: "Basic preflop ranges",
    milestone: "Beat lowest stake consistently with a positive win rate",
    activities: "Study preflop charts daily · 2–3 sessions/week with hand review · Focus on c-betting basics and avoiding basic leaks",
  },
  {
    name: "Postflop basics",
    secondary: "Value betting & bluffing",
    milestone: "Solid micro-stakes reg — tracking results and basic leak awareness",
    activities: "Postflop fundamentals (bet sizing, board textures) · Alternate study/play days · Regular hand review in a tracker (PokerTracker/HEM)",
  },
  {
    name: "Hand reading & ranges",
    secondary: "Exploit vs population",
    milestone: "Confident at your main stake with deeper postflop understanding",
    activities: "Hand reading drills · Build population notes · 3–5 focused grind sessions/week · Mark and review 5–10 key hands weekly",
  },
  {
    name: "Advanced concepts & review",
    secondary: "Mental game & bankroll",
    milestone: "Ready to take a disciplined shot at the next stake level",
    activities: "Advanced concepts (3-bet pots, check-raises, blockers) · Mental game work · Review big pots and leaks · Strict bankroll rules for shot-taking",
  },
];

function generatePokerSteps(currentStake: PokerStake, targetStake: PokerStake, months: number): GoalStep[] {
  const steps: GoalStep[] = [];
  const mpPhase = months / 4;

  steps.push({ id: genId(), done: false,
    text: `Setup — install a hand tracker (PokerTracker 4 or Hold'em Manager 3), verify bankroll meets 20–30 buy-in rule for ${currentStake}, and schedule weekly study sessions`,
  });

  for (let i = 0; i < 4; i++) {
    const startMonth = Math.round(i * mpPhase) + 1;
    const endMonth   = Math.round((i + 1) * mpPhase);
    const ph = POKER_PHASES[i];
    steps.push({ id: genId(), done: false,
      text: `Month${startMonth === endMonth ? ` ${startMonth}` : `s ${startMonth}–${endMonth}`}: ${ph.name} + ${ph.secondary} — ${ph.activities}`,
    });
    steps.push({ id: genId(), done: false,
      text: `Month ${endMonth} checkpoint: ${ph.milestone} · Review tracker stats for red-line, WTSD%, and biggest leaks`,
    });
  }

  steps.push({ id: genId(), done: false,
    text: `Month ${months}: Take your shot at ${targetStake} — enter with 20+ buy-ins, set a stop-loss rule, and track results over a meaningful sample (10k+ hands)`,
  });

  return steps;
}

// ── Poker plan helpers (5-goal wizard) ────────────────────────────────────────

type PokerGoalType = "volume" | "study" | "winrate" | "stakes" | "tournament";

const POKER_PLAN_TEMPLATES: PlanTemplate[] = [
  { id: "pk-volume",  emoji: "🃏", label: "Volume goal",         description: "Play 50,000 online hands per month",                              durationWeeks: 12, defaultSteps: [] },
  { id: "pk-study",   emoji: "📖", label: "Study routine",        description: "Study 5 hours/week and review marked hands",                      durationWeeks: 8,  defaultSteps: [] },
  { id: "pk-winrate", emoji: "📈", label: "Win rate goal",        description: "Achieve 8 bb/100 at NL25 over 100k hands",                        durationWeeks: 16, defaultSteps: [] },
  { id: "pk-stakes",  emoji: "💰", label: "Stakes / bankroll",    description: "Move up when 40 buy-ins are saved at the next stake",             durationWeeks: 12, defaultSteps: [] },
  { id: "pk-tourney", emoji: "🏆", label: "Tournament result",    description: "Cash in a WSOP event or final-table a local major",               durationWeeks: 16, defaultSteps: [] },
];

const POKER_GOAL_TYPE_MAP: Record<string, PokerGoalType> = {
  "pk-volume": "volume", "pk-study": "study", "pk-winrate": "winrate",
  "pk-stakes": "stakes", "pk-tourney": "tournament",
};

function generatePokerGoalSteps(
  goalType: PokerGoalType,
  opts: {
    handsTarget?: string; period?: string;
    studyHours?: string; studyMethods?: string[];
    wrTarget?: string; wrStake?: string; wrHandSample?: string;
    stakeFrom?: string; stakeTo?: string; buyins?: string;
    tourneyType?: string; tourneyTarget?: string;
    // stakes progression (existing)
    currentStake?: PokerStake | ""; targetStake?: PokerStake | ""; months?: number;
  },
): GoalStep[] {
  const g = (s: string) => ({ id: genId(), done: false, text: s });
  const fmt = (n: number) => n.toLocaleString();

  switch (goalType) {
    case "volume": {
      const t = Number(opts.handsTarget ?? "50000");
      const per = opts.period ?? "month";
      return [
        g("Set up hand tracking — PokerTracker 4, Hand2Note, or Hold'em Manager 3"),
        g(`Build the routine: log ${fmt(Math.round(t / 4))} hands — establish daily session targets`),
        g(`${fmt(Math.round(t / 2))} hands reached — review win rate and session timing`),
        g(`${fmt(Math.round(t * 3 / 4))} hands — check quality vs quantity; adjust if win rate is dipping`),
        g(`Complete ${fmt(t)} hands per ${per} — analyse full stats and set next period target`),
      ];
    }
    case "study": {
      const hrs = opts.studyHours ?? "5";
      const methods = opts.studyMethods?.length ? opts.studyMethods : ["Hand review", "Solver work"];
      return [
        g(`Set up study system: ${methods.join(", ")} — schedule fixed weekly study blocks`),
        g(`Week 1–2: ${Math.round(Number(hrs) / 2)} hrs/week — preflop charts + mark and review 3 hands per session`),
        g(`Week 3–4: Full ${hrs} hrs/week — add postflop spot study and range analysis`),
        g(`Month 2: Pull tracker stats — identify your top 3 red-line leaks (WTSD%, fold-to-cbet, etc.)`),
        g(`Month 2: Targeted leak study — run solver for 3–5 recurring problem spots`),
        g(`Month 3+: Maintain ${hrs}-hr study habit; track how win rate changes each month`),
      ];
    }
    case "winrate": {
      const bb = opts.wrTarget ?? "8"; const stake = opts.wrStake ?? "NL25";
      const hands = Number(opts.wrHandSample ?? "100000");
      return [
        g(`Install PokerTracker 4 / HM3 · set correct filters for ${stake} (6-max or full ring)`),
        g(`Baseline: play 10,000 hands · record current bb/100, VPIP, PFR, AF, WTSD%`),
        g(`Identify the 2–3 biggest leaks dragging win rate below ${bb} bb/100 · build study plan around them`),
        g(`${fmt(Math.round(hands / 4))} hands reached · review stats, confirm leaks are shrinking`),
        g(`${fmt(Math.round(hands / 2))} hands · win rate should be trending toward ${bb} bb/100 · adjust if not`),
        g(`Complete ${fmt(hands)}-hand sample at ${stake} · evaluate true win rate and decide next step`),
      ];
    }
    case "stakes": {
      if (opts.currentStake && opts.targetStake && opts.months) {
        // reuse the existing phased progression generator
        return generatePokerSteps(opts.currentStake as PokerStake, opts.targetStake as PokerStake, opts.months);
      }
      const from = opts.stakeFrom ?? "1/2"; const to = opts.stakeTo ?? "2/5"; const bui = opts.buyins ?? "40";
      return [
        g(`Document current bankroll and win rate at ${from} — confirm ${bui} buy-ins rule is your threshold`),
        g(`Set up a dedicated poker bankroll tracker (separate from living expenses)`),
        g(`Study ${to} game: player pool tendencies, pot geometry, 3-bet frequency adjustments`),
        g(`Reach ${bui} buy-ins confirmed in tracker at ${from} — do NOT move up before this milestone`),
        g(`Trial period at ${to}: 20 sessions or 10k hands — track separately`),
        g(`Evaluate: sustain at ${to} or move back down and repeat the process`),
      ];
    }
    case "tournament": {
      const type = opts.tourneyType ?? "Live MTT"; const target = opts.tourneyTarget?.trim() || "cash in a major event";
      return [
        g(`Define target: ${target} — research schedule, buy-ins, and registration`),
        g(`Study MTT-specific strategy: ICM, push/fold ranges, bubble play, final-table dynamics`),
        g(`Play 10 online MTTs or SNGs for volume reps — review all deep-run and bust-out hands`),
        g(`Study short-stack play, 3-bet/4-bet spots, and heads-up adjustments`),
        g(`Warm-up event: ${type === "Live MTT" ? "local league or series" : "online qualifier"} — treat as full prep run`),
        g(`Target event day — play your A-game; review all key hands the same evening`),
      ];
    }
  }
}

// ── Hiking plan helpers ────────────────────────────────────────────────────────

type HikingGoalType = "frequency" | "distance" | "elevation" | "peak" | "trails";

const HIKING_PLAN_TEMPLATES: PlanTemplate[] = [
  { id: "hk-freq",  emoji: "🥾", label: "Annual hike count",    description: "Commit to a number of hikes — e.g. 52 hikes in a year",           durationWeeks: 52, defaultSteps: [] },
  { id: "hk-dist",  emoji: "📏", label: "Annual distance",       description: "Set a total mileage goal for the year — e.g. 300 miles",          durationWeeks: 52, defaultSteps: [] },
  { id: "hk-elev",  emoji: "📈", label: "Annual elevation gain", description: "Rack up a total elevation goal — e.g. 50,000 ft of gain",         durationWeeks: 52, defaultSteps: [] },
  { id: "hk-peak",  emoji: "🏔️", label: "Peak / altitude goal", description: "Chase a specific summit — e.g. first 14,000-foot summit",          durationWeeks: 16, defaultSteps: [] },
  { id: "hk-list",  emoji: "📋", label: "Trail list / challenge", description: "Work through a named list — e.g. local \"52 with a view\" list",  durationWeeks: 52, defaultSteps: [] },
];

const HIKING_GOAL_TYPE_MAP: Record<string, HikingGoalType> = {
  "hk-freq": "frequency", "hk-dist": "distance", "hk-elev": "elevation",
  "hk-peak": "peak", "hk-list": "trails",
};

function generateHikingSteps(
  goalType: HikingGoalType,
  opts: { count?: string; miles?: string; feet?: string; altitude?: string; peakName?: string; listName?: string; listCount?: string; planTrails?: any[] },
): GoalStep[] {
  const g = (s: string) => ({ id: genId(), done: false, text: s });
  const n = (s: string) => Number(s) || 0;
  const fmt = (v: number) => v.toLocaleString();

  switch (goalType) {
    case "frequency": {
      const c = n(opts.count ?? "52");
      return [
        g("Research and map local trails, parks, and hiking areas"),
        g(`Complete first ${Math.round(c / 4)} hikes — Q1 milestone`),
        g(`Reach ${Math.round(c / 2)} hikes — halfway mark`),
        g(`Log ${Math.round(c * 3 / 4)} hikes — Q3 milestone`),
        g(`Complete all ${c} hikes — celebrate!`),
      ];
    }
    case "distance": {
      const m = n(opts.miles ?? "300");
      return [
        g(`Plan a mix of short and long hikes to hit ${fmt(m)} miles over the year`),
        g(`Log first ${Math.round(m / 4)} miles — Q1 milestone`),
        g(`Reach ${Math.round(m / 2)} miles — halfway mark`),
        g(`Log ${Math.round(m * 3 / 4)} miles — Q3 milestone`),
        g(`Complete ${fmt(m)} miles — goal achieved!`),
      ];
    }
    case "elevation": {
      const f = n(opts.feet ?? "50000");
      return [
        g(`Identify hikes with significant elevation gain to accumulate ${fmt(f)} ft`),
        g(`Log first ${fmt(Math.round(f / 4))} ft — Q1 milestone`),
        g(`Reach ${fmt(Math.round(f / 2))} ft — halfway mark`),
        g(`Log ${fmt(Math.round(f * 3 / 4))} ft — Q3 milestone`),
        g(`Complete ${fmt(f)} ft of total elevation gain`),
      ];
    }
    case "peak": {
      const alt = n(opts.altitude ?? "14000");
      const name = opts.peakName?.trim() || `a ${fmt(alt)}-foot peak`;
      return [
        g(`Research the route, permits, and conditions for ${name}`),
        g("Build base fitness — 3 hikes per week for 4 weeks"),
        g("Training hike with significant elevation gain (5,000+ ft)"),
        g("Overnight backpacking trip — altitude and fitness test"),
        g("Gear check — footwear, layers, navigation, emergency kit"),
        g(`Summit day — top of ${name}!`),
      ];
    }
    case "trails": {
      const trails = opts.planTrails ?? [];
      const lc = n(opts.listCount ?? "52");
      const listLabel = opts.listName?.trim() || "the trail list";
      if (trails.length > 0) {
        return trails.map(t => g(`Hike: ${t.name}${t.length > 0 ? ` (${t.length} mi)` : ""}`));
      }
      return [
        g(`Research all trails on ${listLabel}`),
        g(`Complete first ${Math.round(lc / 4)} trails — Q1 milestone`),
        g(`Halfway milestone — ${Math.round(lc / 2)} trails done`),
        g(`Three-quarters complete — ${Math.round(lc * 3 / 4)} trails done`),
        g(`Complete all ${lc} trails on ${listLabel} — challenge complete!`),
      ];
    }
  }
}

// ── Playing an Instrument plan helpers ───────────────────────────────────────

const INSTRUMENT_LIST = [
  // Strings
  "Acoustic Guitar", "Electric Guitar", "Bass Guitar", "Classical Guitar",
  "Violin", "Viola", "Cello", "Double Bass", "Ukulele", "Banjo", "Mandolin", "Harp",
  // Keys
  "Piano", "Keyboard / Synth", "Organ", "Accordion",
  // Wind – woodwind
  "Flute", "Clarinet", "Alto Saxophone", "Tenor Saxophone", "Soprano Saxophone",
  "Oboe", "Bassoon", "Recorder",
  // Wind – brass
  "Trumpet", "Trombone", "French Horn", "Tuba", "Flugelhorn",
  // Percussion
  "Drum Kit", "Cajon", "Djembe", "Hand Pan", "Xylophone / Marimba",
  // Other
  "Harmonica", "Bagpipes", "Sitar", "Oud", "Erhu", "Vocals / Singing",
] as const;

type InstrumentGoalType = "core" | "repertoire" | "technique" | "performance";

const INSTRUMENT_PLAN_TEMPLATES: PlanTemplate[] = [
  { id: "inst-core",    emoji: "🎵", label: "Core playing ability",    description: "Play a simple song start to finish with good tone and steady rhythm",                   durationWeeks: 8,  defaultSteps: [] },
  { id: "inst-rep",     emoji: "🎼", label: "Songs / repertoire",      description: "Learn 5–10 favourite songs you can play confidently from memory",                        durationWeeks: 16, defaultSteps: [] },
  { id: "inst-tech",    emoji: "🎹", label: "Technique / musicianship", description: "Practice scales and chords daily for finger speed, accuracy, and basic theory",         durationWeeks: 12, defaultSteps: [] },
  { id: "inst-perf",    emoji: "🎤", label: "Performance / enjoyment",  description: "Perform for friends or family and play at least twice a week for fun",                  durationWeeks: 12, defaultSteps: [] },
];

const SINGING_PLAN_TEMPLATES: PlanTemplate[] = [
  { id: "inst-core",  emoji: "🎤", label: "Core vocal ability",       description: "Develop consistent pitch, breath control, and sing a song cleanly start to finish", durationWeeks: 8,  defaultSteps: [] },
  { id: "inst-rep",   emoji: "🎵", label: "Song repertoire",          description: "Build a set of 5–10 songs you can perform confidently from memory",                  durationWeeks: 16, defaultSteps: [] },
  { id: "inst-tech",  emoji: "🎼", label: "Vocal technique",          description: "Daily warm-ups, breath support, and resonance exercises to expand your range",        durationWeeks: 12, defaultSteps: [] },
  { id: "inst-perf",  emoji: "🎭", label: "Perform for an audience",  description: "Prepare and deliver a live performance — open mic, recital, or informal show",       durationWeeks: 12, defaultSteps: [] },
];

const ACTING_PLAN_TEMPLATES: PlanTemplate[] = [
  { id: "inst-core",  emoji: "🎭", label: "Foundational skills",      description: "Work through core acting techniques: presence, listening, and scene work",           durationWeeks: 8,  defaultSteps: [] },
  { id: "inst-rep",   emoji: "📜", label: "Monologue / scene prep",   description: "Prepare 2–3 contrasting pieces you can perform confidently at an audition",           durationWeeks: 10, defaultSteps: [] },
  { id: "inst-tech",  emoji: "🧠", label: "Method & technique",       description: "Study a specific acting method (Stanislavski, Meisner, etc.) through daily exercises", durationWeeks: 12, defaultSteps: [] },
  { id: "inst-perf",  emoji: "🎬", label: "Audition / performance",   description: "Prepare for a specific role, audition, or showcase and nail the performance",        durationWeeks: 8,  defaultSteps: [] },
];

const COMEDY_PLAN_TEMPLATES: PlanTemplate[] = [
  { id: "inst-core",  emoji: "😂", label: "Find your voice",          description: "Develop your comedic persona and write your first 5-minute set",                      durationWeeks: 8,  defaultSteps: [] },
  { id: "inst-rep",   emoji: "📝", label: "Build a set",              description: "Write and refine a polished 10–15 minute set of reliable material",                   durationWeeks: 12, defaultSteps: [] },
  { id: "inst-tech",  emoji: "🎙️", label: "Craft & delivery",         description: "Focus on timing, callbacks, crowd work, and making material sharper and funnier",     durationWeeks: 10, defaultSteps: [] },
  { id: "inst-perf",  emoji: "🎤", label: "Perform at an open mic",   description: "Get stage time regularly — prepare and perform at open mics or shows",                durationWeeks: 8,  defaultSteps: [] },
];

const DANCING_PLAN_TEMPLATES: PlanTemplate[] = [
  { id: "inst-core",  emoji: "🕺", label: "Learn the fundamentals",   description: "Build body awareness, basic steps, and rhythm across your chosen dance style",       durationWeeks: 8,  defaultSteps: [] },
  { id: "inst-rep",   emoji: "💃", label: "Learn a routine",          description: "Choreograph and perfect a specific routine or combination from start to finish",       durationWeeks: 10, defaultSteps: [] },
  { id: "inst-tech",  emoji: "🎯", label: "Technique & conditioning", description: "Daily drills for flexibility, footwork, balance, and style-specific technique",        durationWeeks: 12, defaultSteps: [] },
  { id: "inst-perf",  emoji: "🌟", label: "Perform / showcase",       description: "Prepare and deliver a polished performance at a recital, showcase, or social dance",  durationWeeks: 10, defaultSteps: [] },
];

const INSTRUMENT_GOAL_TYPE_MAP: Record<string, InstrumentGoalType> = {
  "inst-core": "core", "inst-rep": "repertoire", "inst-tech": "technique", "inst-perf": "performance",
};

function generateInstrumentSteps(
  goalType: InstrumentGoalType,
  opts: {
    instrument: string;
    song?: string;
    songCount?: string;
    practiceMinutes?: string;
    practiceDays?: string;
    performanceSong?: string;
    sessionsPerWeek?: string;
  },
): GoalStep[] {
  const g = (s: string) => ({ id: genId(), done: false, text: s });
  const inst = opts.instrument || "your instrument";
  switch (goalType) {
    case "core": {
      const song = opts.song?.trim() || "a simple song";
      return [
        g(`Get comfortable holding and producing sound on the ${inst} — posture, grip, and basic technique`),
        g(`Learn the notes / chords needed for "${song}"`),
        g(`Practice the first half slowly with a metronome — focus on tone quality`),
        g(`Practice the second half and connect both sections at slow tempo`),
        g(`Gradually bring the tempo up — aim for a steady, even rhythm throughout`),
        g(`Play "${song}" from start to finish in one take — celebrate!`),
      ];
    }
    case "repertoire": {
      const n = Math.max(1, Number(opts.songCount ?? "7"));
      return [
        g(`Create your target list of ${n} songs — mix easy wins and stretch goals`),
        g(`Learn songs 1–${Math.ceil(n / 3)}: focus on clean changes and basic dynamics`),
        g(`Learn songs ${Math.ceil(n / 3) + 1}–${Math.ceil(2 * n / 3)}: introduce more variety in style or key`),
        g(`Learn final songs ${Math.ceil(2 * n / 3) + 1}–${n}: choose at least one that challenges you`),
        g(`Run through all ${n} songs without stopping — identify weak spots to polish`),
        g(`Play all ${n} songs fully from memory — your repertoire is ready!`),
      ];
    }
    case "technique": {
      const mins = opts.practiceMinutes ?? "20";
      const days = opts.practiceDays ?? "5";
      return [
        g(`Set up a daily practice block: ${mins} min warm-up + focused technique, ${days} days/week`),
        g(`Week 1–2: Master your major scales in at least 3 keys — slow and precise`),
        g(`Week 3–4: Add core chords / arpeggios — practice transitions until smooth`),
        g(`Month 2: Increase tempo with a metronome — track BPM improvements weekly`),
        g(`Month 3: Apply technique to a real piece — notice the improvement in tone and control`),
        g(`End-of-month test: record yourself playing a scale run and a chord progression, compare to week 1`),
      ];
    }
    case "performance": {
      const song = opts.performanceSong?.trim() || "a piece";
      const sessions = opts.sessionsPerWeek ?? "2";
      return [
        g(`Choose the piece for your performance: "${song || "your chosen song"}"`),
        g(`Build a regular playing habit — ${sessions} casual sessions per week for enjoyment`),
        g(`Polish "${song || "the piece"}" — smooth transitions, dynamics, and expression`),
        g(`Informal run-through for yourself: play it as if an audience is watching`),
        g(`Schedule the performance — tell a friend or family member the date`),
        g(`Perform "${song || "the piece"}" live — enjoy the moment!`),
      ];
    }
  }
}

// ── Language Learning plan helpers ────────────────────────────────────────────

const WORLD_LANGUAGES = [
  "Arabic", "Bengali", "Cantonese", "Czech", "Danish", "Dutch", "Finnish",
  "French", "German", "Greek", "Hebrew", "Hindi", "Hungarian", "Indonesian",
  "Italian", "Japanese", "Korean", "Malay", "Mandarin Chinese", "Norwegian",
  "Persian (Farsi)", "Polish", "Portuguese", "Romanian", "Russian", "Spanish",
  "Swahili", "Swedish", "Thai", "Turkish", "Ukrainian", "Urdu", "Vietnamese",
] as const;

const LANGUAGE_EXAM_MAP: Record<string, string> = {
  "Spanish": "DELE", "French": "DELF/DALF", "German": "Goethe-Zertifikat / TestDaF",
  "Italian": "CILS / CELI", "Portuguese": "CELPE-Bras / CAPLE", "Japanese": "JLPT",
  "Mandarin Chinese": "HSK", "Korean": "TOPIK", "Arabic": "CEFR-aligned test",
  "Dutch": "NT2 / CNaVT", "Russian": "TORFL", "Greek": "KPG",
};

type LanguageGoalType = "communication" | "exam" | "routine" | "reallife";

const LANGUAGE_PLAN_TEMPLATES: PlanTemplate[] = [
  { id: "ll-comm",    emoji: "💬", label: "Communication skills",  description: "Hold a 5–10 min conversation in the language without switching back",       durationWeeks: 16, defaultSteps: [] },
  { id: "ll-exam",    emoji: "📋", label: "Exam / proficiency",    description: "Reach B2 level and pass an official exam within 12 months",                  durationWeeks: 52, defaultSteps: [] },
  { id: "ll-routine", emoji: "📅", label: "Routine & habits",      description: "Study 30 min/day, 5 days/week, and learn 50 new words each week",            durationWeeks: 52, defaultSteps: [] },
  { id: "ll-real",    emoji: "✈️", label: "Real-life usage",       description: "Handle all basic interactions in a country where the language is spoken",     durationWeeks: 26, defaultSteps: [] },
];

const LANGUAGE_GOAL_TYPE_MAP: Record<string, LanguageGoalType> = {
  "ll-comm": "communication", "ll-exam": "exam", "ll-routine": "routine", "ll-real": "reallife",
};

function generateLanguageSteps(
  goalType: LanguageGoalType,
  opts: {
    language: string;
    convMinutes?: string;
    examName?: string; examLevel?: string; examMonths?: string;
    studyMins?: string; studyDays?: string; wordsPerWeek?: string;
    travelCountry?: string;
  },
): GoalStep[] {
  const g = (s: string) => ({ id: genId(), done: false, text: s });
  const lang = opts.language || "the language";
  switch (goalType) {
    case "communication": {
      const mins = opts.convMinutes ?? "10";
      return [
        g(`Set up ${lang} practice: find a language exchange partner or tutor (iTalki, Tandem, or HelloTalk)`),
        g("Month 1: Build core vocabulary — 500–800 most-common words + greetings and introductions"),
        g("Month 2: First short conversations — 2–3 minutes on familiar topics (name, work, hobbies)"),
        g(`Month 3: Extend conversations to ${Math.round(Number(mins) / 2)} minutes — talk about daily routines and preferences`),
        g(`Month 4: Full ${mins}-minute conversation about daily life without switching to English`),
        g("Celebrate: record yourself having a real conversation and watch it back"),
      ];
    }
    case "exam": {
      const exam = opts.examName ?? (LANGUAGE_EXAM_MAP[lang] ?? "official language exam");
      const level = opts.examLevel ?? "B2";
      const months = Number(opts.examMonths ?? "12");
      return [
        g(`Research the ${exam} ${level} exam format, syllabus, and test dates — register your target date`),
        g(`Month 1–2: Assess current level with a practice test · focus on vocabulary and grammar gaps`),
        g(`Month 3–${Math.round(months * 0.5)}: Structured study — grammar workbook, listening practice, reading texts`),
        g(`Month ${Math.round(months * 0.5)}–${Math.round(months * 0.75)}: Speaking practice with a tutor 2×/week · writing timed essays`),
        g(`Month ${Math.round(months * 0.75)}–${months - 1}: Full mock exams under timed conditions — identify remaining weaknesses`),
        g(`Month ${months}: Final review and exam day — pass ${exam} ${level}!`),
      ];
    }
    case "routine": {
      const mins = opts.studyMins ?? "30";
      const days = opts.studyDays ?? "5";
      const words = opts.wordsPerWeek ?? "50";
      return [
        g(`Choose your tools: Anki or Duolingo for vocabulary, a grammar course, and a podcast (e.g. Pimsleur, LanguageTransfer)`),
        g(`Week 1–2: Build the habit — ${mins} min/day for ${days} days/week · Learn first ${words} words`),
        g(`Month 1: ${words} words + core grammar basics · track your streak`),
        g(`Month 2–3: ${words} new words/week · add one conversation session per week`),
        g(`Month 6: Review vocab retention — 90%+ recall on Anki deck milestones`),
        g(`Year end: Celebrate consistency — log total study hours and test your level`),
      ];
    }
    case "reallife": {
      const country = opts.travelCountry?.trim() || `a ${lang}-speaking country`;
      return [
        g(`Plan the trip to ${country} — book flights, accommodation, and set a travel date`),
        g("Learn survival phrases: greetings, numbers, ordering food, asking for directions, transport vocab"),
        g("Practice real scenarios: role-play at a restaurant, checking into a hotel, buying tickets"),
        g("Month before trip: intensive speaking practice — 30 min/day with a tutor"),
        g(`In ${country}: handle check-in, order all meals, ask locals for directions — in ${lang} only`),
        g(`Debrief: which interactions were easy? Which were hard? Set next language goal`),
      ];
    }
  }
}

// ── Bird watching plan helpers ────────────────────────────────────────────────

type BirdGoalType = "species" | "local" | "skills" | "lifestyle";

const BIRD_PLAN_TEMPLATES: PlanTemplate[] = [
  { id: "bw-species",   emoji: "🦅", label: "Species / life list",   description: "Add 50 new species to your life list this year",                  durationWeeks: 52, defaultSteps: [] },
  { id: "bw-local",     emoji: "📍", label: "Local annual total",    description: "Record 150 species in your county this calendar year",            durationWeeks: 52, defaultSteps: [] },
  { id: "bw-skills",    emoji: "🔭", label: "ID & field skills",     description: "Learn to recognise 30 common local birds by song and sight",     durationWeeks: 16, defaultSteps: [] },
  { id: "bw-lifestyle", emoji: "🌿", label: "Lifestyle / wellbeing", description: "Go birding at least once a week for an hour for stress relief",   durationWeeks: 52, defaultSteps: [] },
];

const BIRD_GOAL_TYPE_MAP: Record<string, BirdGoalType> = {
  "bw-species": "species", "bw-local": "local", "bw-skills": "skills", "bw-lifestyle": "lifestyle",
};

function generateBirdSteps(
  goalType: BirdGoalType,
  opts: {
    speciesTarget?: string; county?: string;
    localTarget?: string;
    skillTarget?: string; skillFocus?: string;
    freqHours?: string; lifestyleReason?: string;
    planBirds?: { name: string; sciName?: string }[];
  },
): GoalStep[] {
  const g = (s: string) => ({ id: genId(), done: false, text: s });
  const n = (s: string) => Number(s) || 0;
  switch (goalType) {
    case "species": {
      const target = n(opts.speciesTarget ?? "50");
      const birds = opts.planBirds ?? [];
      if (birds.length > 0) {
        return birds.map(b => g(`Find and ID: ${b.name}${b.sciName ? ` (${b.sciName})` : ""}`));
      }
      return [
        g("Set up an eBird or Merlin account to log sightings"),
        g(`Log first ${Math.round(target / 4)} new species — Q1 milestone`),
        g(`Reach ${Math.round(target / 2)} new species — halfway mark`),
        g(`Log ${Math.round(target * 3 / 4)} new species — Q3 milestone`),
        g(`Complete all ${target} new species added to your life list`),
      ];
    }
    case "local": {
      const target = n(opts.localTarget ?? "150");
      const county = opts.county?.trim() || "your county";
      return [
        g(`Set up eBird county list for ${county} and review your current total`),
        g("Visit top local hotspots — compile a list of must-visit patches"),
        g(`Log ${Math.round(target / 4)} species — Q1 milestone`),
        g(`Reach ${Math.round(target / 2)} species — halfway`),
        g(`Log ${Math.round(target * 3 / 4)} species — Q3 milestone`),
        g(`Complete ${target} species in ${county} for the year`),
      ];
    }
    case "skills": {
      const target = n(opts.skillTarget ?? "30");
      const focus = opts.skillFocus ?? "song and sight";
      const third = Math.round(target / 3);
      return [
        g("Download Merlin Bird ID and explore the Sound ID feature"),
        g(`Learn first ${third} birds — master their songs and key field marks`),
        g(`Learn next ${third} birds — expand to a second habitat type`),
        g(`Learn final ${target - 2 * third} birds — complete the target set`),
        g(`Field test: spend a day identifying by ${focus} alone`),
        g("Teach someone else: take a beginner friend birding as a final test"),
      ];
    }
    case "lifestyle": {
      const hours = opts.freqHours ?? "1";
      const reason = opts.lifestyleReason?.trim() || "stress relief and mindfulness";
      return [
        g("Identify 2–3 local spots within 15 minutes of home for regular sessions"),
        g(`Week 1–4: Build the habit — ${hours}h birding session each week`),
        g("Month 2: Keep the streak — log sessions in eBird or a journal"),
        g("Month 3: Expand — try a new location once this month"),
        g(`Month 6: Reflect on how birding has contributed to ${reason}`),
        g("Year end: Review sessions logged and celebrate the habit"),
      ];
    }
  }
}

// ── Cycling plan helpers ──────────────────────────────────────────────────────

interface CycleWishlistEntry {
  id: string;
  routeId?: number;
  name: string;
  location: string;
  lengthMiles: number;
  url?: string;
  notes?: string;
  plannedDate?: string;
  addedAt: string;
}

interface RideLogEntry {
  id: string;
  routeId?: number;
  name: string;
  date: string;
  distanceMiles: number;
  elevationGainFt?: number;
  durationMins?: number;
  avgSpeedMph?: number;
  rideType?: string;
  rating?: number;
  notes?: string;
}

function parseCycleWishlist(extraJson: string): CycleWishlistEntry[] {
  try { const o = JSON.parse(extraJson || "{}"); return Array.isArray(o.cycleWishlist) ? o.cycleWishlist : []; } catch { return []; }
}
function parseRideLog(extraJson: string): RideLogEntry[] {
  try { const o = JSON.parse(extraJson || "{}"); return Array.isArray(o.rideLog) ? o.rideLog : []; } catch { return []; }
}
function setCyclingInExtra(extraJson: string, wishlist: CycleWishlistEntry[], log: RideLogEntry[]): string {
  try { const o = JSON.parse(extraJson || "{}"); return JSON.stringify({ ...o, cycleWishlist: wishlist, rideLog: log }); }
  catch { return JSON.stringify({ cycleWishlist: wishlist, rideLog: log }); }
}

const RIDE_TYPES = ["Road", "MTB", "Gravel", "Commute", "Indoor / Zwift", "Touring", "BMX / Trick"] as const;

type CyclingGoalType = "frequency" | "distance" | "elevation" | "event" | "routes";

const CYCLING_PLAN_TEMPLATES: PlanTemplate[] = [
  { id: "cy-freq",   emoji: "🚲", label: "Annual ride count",     description: "Commit to a number of rides — e.g. 150 rides in a year",                durationWeeks: 52, defaultSteps: [] },
  { id: "cy-dist",   emoji: "📏", label: "Annual distance",        description: "Set a total distance goal for the year — e.g. 2,000 miles",             durationWeeks: 52, defaultSteps: [] },
  { id: "cy-elev",   emoji: "📈", label: "Annual elevation gain",  description: "Rack up a total elevation gain goal — e.g. 100,000 ft",                 durationWeeks: 52, defaultSteps: [] },
  { id: "cy-event",  emoji: "🏅", label: "Event / sportive goal",  description: "Train for a century ride, gran fondo, or charity event",                durationWeeks: 16, defaultSteps: [] },
  { id: "cy-routes", emoji: "📋", label: "Route list / challenge", description: "Work through a local club list, Strava challenge, or route bucket list", durationWeeks: 52, defaultSteps: [] },
];

const CYCLING_GOAL_TYPE_MAP: Record<string, CyclingGoalType> = {
  "cy-freq": "frequency", "cy-dist": "distance", "cy-elev": "elevation",
  "cy-event": "event", "cy-routes": "routes",
};

function generateCyclingSteps(
  goalType: CyclingGoalType,
  opts: {
    count?: string; miles?: string; feet?: string;
    eventName?: string; eventDistance?: string; eventDate?: string;
    listName?: string; listCount?: string; planRoutes?: any[];
  },
): GoalStep[] {
  const g = (s: string) => ({ id: genId(), done: false, text: s });
  const n = (s: string) => Number(s) || 0;
  const fmt = (v: number) => v.toLocaleString();

  switch (goalType) {
    case "frequency": {
      const c = n(opts.count ?? "150");
      return [
        g("Set up ride tracking — Strava, Garmin Connect, or a training log"),
        g(`Complete first ${Math.round(c / 4)} rides — Q1 milestone`),
        g(`Reach ${Math.round(c / 2)} rides — halfway mark`),
        g(`Log ${Math.round(c * 3 / 4)} rides — Q3 milestone`),
        g(`Complete all ${c} rides — celebrate!`),
      ];
    }
    case "distance": {
      const m = n(opts.miles ?? "2000");
      return [
        g(`Plan a mix of short and long rides to hit ${fmt(m)} miles over the year`),
        g(`Log first ${fmt(Math.round(m / 4))} miles — Q1 milestone`),
        g(`Reach ${fmt(Math.round(m / 2))} miles — halfway mark`),
        g(`Log ${fmt(Math.round(m * 3 / 4))} miles — Q3 milestone`),
        g(`Complete ${fmt(m)} miles — goal achieved!`),
      ];
    }
    case "elevation": {
      const f = n(opts.feet ?? "100000");
      return [
        g(`Identify hilly routes to accumulate ${fmt(f)} ft of elevation gain this year`),
        g(`Log first ${fmt(Math.round(f / 4))} ft — Q1 milestone`),
        g(`Reach ${fmt(Math.round(f / 2))} ft — halfway mark`),
        g(`Log ${fmt(Math.round(f * 3 / 4))} ft — Q3 milestone`),
        g(`Complete ${fmt(f)} ft of total elevation gain`),
      ];
    }
    case "event": {
      const event = opts.eventName?.trim() || "the event";
      const dist = Number(opts.eventDistance ?? "100");
      return [
        g(`Register for ${event}${opts.eventDate ? ` on ${opts.eventDate}` : ""} — confirm the route, kit, and logistics`),
        g("Build base fitness — 3 rides per week for 4 weeks at a comfortable pace"),
        g(`Long-ride progression: complete a ${Math.round(dist * 0.5)}-mile ride`),
        g(`Long-ride progression: complete a ${Math.round(dist * 0.75)}-mile ride — simulate event conditions`),
        g("Taper week — short, easy rides so you arrive fresh on event day"),
        g(`Event day — complete ${event}!`),
      ];
    }
    case "routes": {
      const routes = opts.planRoutes ?? [];
      const lc = n(opts.listCount ?? "20");
      const listLabel = opts.listName?.trim() || "the route list";
      if (routes.length > 0) {
        return routes.map(r => g(`Ride: ${r.name}${r.length > 0 ? ` (${r.length} mi)` : ""}`));
      }
      return [
        g(`Research all routes on ${listLabel}`),
        g(`Complete first ${Math.round(lc / 4)} routes — Q1 milestone`),
        g(`Halfway milestone — ${Math.round(lc / 2)} routes done`),
        g(`Three-quarters complete — ${Math.round(lc * 3 / 4)} routes done`),
        g(`Complete all ${lc} routes on ${listLabel} — challenge complete!`),
      ];
    }
  }
}

// ── Fishing plan helpers ──────────────────────────────────────────────────────

interface FishCatchEntry {
  id: string;
  speciesId?: number;
  speciesName: string;
  sciName?: string;
  photoUrl?: string;
  userPhotoUrl?: string;
  date: string;
  weightLbs?: number;
  lengthIn?: number;
  location?: string;
  lure?: string;
  notes?: string;
  isPersonalBest?: boolean;
}

interface FishBucketEntry {
  id: string;
  speciesId?: number;
  speciesName: string;
  sciName?: string;
  photoUrl?: string;
  addedAt: string;
}

function parseFishCatches(extraJson: string): FishCatchEntry[] {
  try { const o = JSON.parse(extraJson || "{}"); return Array.isArray(o.fishCatches) ? o.fishCatches : []; } catch { return []; }
}
function parseFishBucket(extraJson: string): FishBucketEntry[] {
  try { const o = JSON.parse(extraJson || "{}"); return Array.isArray(o.fishBucket) ? o.fishBucket : []; } catch { return []; }
}
function setFishingInExtra(extraJson: string, catches: FishCatchEntry[], bucket: FishBucketEntry[]): string {
  try { const o = JSON.parse(extraJson || "{}"); return JSON.stringify({ ...o, fishCatches: catches, fishBucket: bucket }); }
  catch { return JSON.stringify({ fishCatches: catches, fishBucket: bucket }); }
}

type FishingGoalType = "catch" | "skill" | "exploration" | "social";

const FISHING_PLAN_TEMPLATES: PlanTemplate[] = [
  { id: "fs-catch",   emoji: "🎣", label: "Catch / species goal",     description: "Land a new personal-best — e.g. bass over 5 lbs or catfish over 20 lbs",      durationWeeks: 26, defaultSteps: [] },
  { id: "fs-skill",   emoji: "🧠", label: "Skill / knowledge",         description: "Learn seasonal patterns on your home lake and consistently find fish each season", durationWeeks: 52, defaultSteps: [] },
  { id: "fs-explore", emoji: "🗺️", label: "Exploration / experience", description: "Fish 5 new lakes or rivers this year you've never tried before",                  durationWeeks: 52, defaultSteps: [] },
  { id: "fs-social",  emoji: "🤝", label: "Social / enjoyment",        description: "Plan one relaxed fishing outing each month with friends or family",               durationWeeks: 52, defaultSteps: [] },
];

const FISHING_GOAL_TYPE_MAP: Record<string, FishingGoalType> = {
  "fs-catch": "catch", "fs-skill": "skill", "fs-explore": "exploration", "fs-social": "social",
};

function generateFishingSteps(
  goalType: FishingGoalType,
  opts: {
    targetSpecies?: string; targetWeight?: string; targetLength?: string;
    homeLake?: string;
    waterCount?: string; specificWaters?: string[];
    outingPartner?: string;
  },
): GoalStep[] {
  const g = (s: string) => ({ id: genId(), done: false, text: s });
  switch (goalType) {
    case "catch": {
      const species = opts.targetSpecies?.trim() || "your target species";
      const weight  = opts.targetWeight?.trim();
      const length  = opts.targetLength?.trim();
      const sizeStr = weight ? `${weight} lbs` : length ? `${length}"` : "personal-best size";
      return [
        g(`Research the best times, locations, and conditions for ${species}`),
        g(`Study the habitat — cover types, depth ranges, and feeding patterns`),
        g(`Refine your tackle: select rods, reels, line, and lures suited to ${species}`),
        g(`Spend 4+ focused sessions targeting ${species} and recording observations`),
        g(`Identify the most productive water/spot based on your sessions`),
        g(`Land ${species} at ${sizeStr} — new personal best!`),
      ];
    }
    case "skill": {
      const lake = opts.homeLake?.trim() || "your home water";
      return [
        g(`Map ${lake} — identify structure, drop-offs, weed beds, and known hotspots`),
        g(`Winter/early spring: study fish behaviour in cold water — slow presentations, deep structure`),
        g(`Spring: learn spawning patterns and shallow-water opportunities`),
        g(`Summer: follow fish to cooler, deeper water and adjust timing to early/late day`),
        g(`Fall: capitalise on feeding frenzies as fish bulk up before winter`),
        g(`Season review: log which patterns worked, which spots produced, and set next year's plan`),
      ];
    }
    case "exploration": {
      const count  = Number(opts.waterCount ?? "5");
      const waters = opts.specificWaters?.filter(Boolean) ?? [];
      if (waters.length > 0) {
        return waters.map(w => g(`Fish: ${w} — research access, regulations, and target species`));
      }
      return [
        g(`Research ${count} new waters — check regulations, access points, and target species`),
        g(`First new water: scout and fish — note conditions and what worked`),
        g(`Second and third new waters — compare to your home water`),
        g(`Fourth new water — try somewhere further afield or a different habitat type`),
        g(`Fifth new water — celebrate reaching the exploration goal`),
        g(`Write up your favourite discovery and plan a return trip`),
      ];
    }
    case "social": {
      const partner = opts.outingPartner?.trim() || "friends or family";
      return [
        g(`Plan and confirm January outing with ${partner} — keep it relaxed and low pressure`),
        g(`February–March: two more outings — try a different spot or technique together`),
        g(`Spring outing — great time for beginners with active fish`),
        g(`Summer: evening or early-morning session to beat the heat`),
        g(`Autumn: take advantage of the fall feeding season together`),
        g(`December: final outing of the year — reflect on the shared experiences`),
      ];
    }
  }
}

// ── Gardening types ───────────────────────────────────────────────────────────

interface GardenPlantEntry {
  id: string;
  perenualId?: number;
  commonName: string;
  sciName?: string;
  photoUrl?: string;
  plantedDate: string;
  location?: string;
  quantity?: string;
  notes?: string;
  isHarvested?: boolean;
}

interface GardenWishlistEntry {
  id: string;
  perenualId?: number;
  commonName: string;
  sciName?: string;
  photoUrl?: string;
  addedAt: string;
}

function parseGardenPlants(extraJson: string): GardenPlantEntry[] {
  try { const o = JSON.parse(extraJson || "{}"); return Array.isArray(o.gardenPlants) ? o.gardenPlants : []; } catch { return []; }
}
function parseGardenWishlist(extraJson: string): GardenWishlistEntry[] {
  try { const o = JSON.parse(extraJson || "{}"); return Array.isArray(o.gardenWishlist) ? o.gardenWishlist : []; } catch { return []; }
}
function setGardeningInExtra(extraJson: string, plants: GardenPlantEntry[], wishlist: GardenWishlistEntry[]): string {
  try { const o = JSON.parse(extraJson || "{}"); return JSON.stringify({ ...o, gardenPlants: plants, gardenWishlist: wishlist }); }
  catch { return JSON.stringify({ gardenPlants: plants, gardenWishlist: wishlist }); }
}

type GardeningGoalType = "harvest" | "aesthetics" | "skills" | "relaxation";

const GARDENING_PLAN_TEMPLATES: PlanTemplate[] = [
  { id: "gd-harvest",    emoji: "🍅", label: "Food & harvest",         description: "Grow enough tomatoes and herbs to use fresh all summer",                                durationWeeks: 26, defaultSteps: [] },
  { id: "gd-aesthetics", emoji: "🌸", label: "Aesthetics & design",    description: "Create a flower bed with something blooming from early spring through fall",            durationWeeks: 52, defaultSteps: [] },
  { id: "gd-skills",     emoji: "🌱", label: "Learning & skills",      description: "Successfully start 10+ varieties from seed and transplant outdoors",                    durationWeeks: 26, defaultSteps: [] },
  { id: "gd-relaxation", emoji: "🧘", label: "Relaxation & enjoyment", description: "Spend 15–20 minutes in the garden 3 days a week, tending and relaxing",                 durationWeeks: 52, defaultSteps: [] },
];

const GARDENING_GOAL_TYPE_MAP: Record<string, GardeningGoalType> = {
  "gd-harvest": "harvest", "gd-aesthetics": "aesthetics", "gd-skills": "skills", "gd-relaxation": "relaxation",
};

function generateGardeningSteps(
  goalType: GardeningGoalType,
  opts: {
    targetCrops?: string;
    seedVarieties?: string;
    gardenMinutes?: string;
    gardenDays?: string;
  },
): GoalStep[] {
  const g = (s: string) => ({ id: genId(), done: false, text: s });
  switch (goalType) {
    case "harvest": {
      const crops = opts.targetCrops?.trim() || "tomatoes, herbs, and vegetables";
      return [
        g(`Plan your harvest garden: choose varieties of ${crops} suited to your climate and space`),
        g(`Start seeds indoors 6–8 weeks before last frost, or source quality seedlings`),
        g(`Prepare beds: amend soil with compost, set up stakes and cages as needed`),
        g(`Transplant and establish — water consistently and mulch to retain moisture`),
        g(`First harvest! Begin picking ${crops} at peak ripeness throughout the season`),
        g(`End-of-season harvest, seed saving, and soil prep for next year`),
      ];
    }
    case "aesthetics": {
      return [
        g(`Design your bloom calendar: choose plants for early spring, late spring, summer, and fall`),
        g(`Prepare the bed — clear, edge, amend soil, and plan layout for height and colour flow`),
        g(`Plant spring bulbs (tulips, daffodils) and early-season perennials`),
        g(`Add summer bloomers — rudbeckia, coneflower, salvia, zinnias`),
        g(`Install fall colour: asters, sedums, ornamental grasses, and late dahlias`),
        g(`Evaluate the full-season result, photograph key moments, and plan next year's tweaks`),
      ];
    }
    case "skills": {
      const count = opts.seedVarieties?.trim() || "10";
      return [
        g(`Research and select ${count} varieties to start from seed — mix vegetables, herbs, and flowers`),
        g(`Set up seed-starting station: trays, grow lights or a bright window, heat mats`),
        g(`Sow seeds and track germination rates for each variety`),
        g(`Care for seedlings: thin, fertilise, and harden off outdoors over 1–2 weeks`),
        g(`Transplant all ${count} varieties into the garden`),
        g(`Document results: which germinated well, which transplanted easily, what to try next year`),
      ];
    }
    case "relaxation": {
      const mins = opts.gardenMinutes?.trim() || "15–20";
      const days = opts.gardenDays?.trim() || "3";
      return [
        g(`Identify your garden's current state — what needs regular tending each visit`),
        g(`Establish a weekly routine: schedule ${days} days a week for ${mins}-minute sessions`),
        g(`Month 1–3: build the habit — note how the garden changes week to week`),
        g(`Month 4–6: experiment with one new plant or technique each month`),
        g(`Month 7–9: enjoy peak season — share harvests or simply sit and observe`),
        g(`Year-end reflection: how did your time in the garden affect your wellbeing?`),
      ];
    }
  }
}

// ── Rock Climbing types ───────────────────────────────────────────────────────

interface ClimbLogEntry {
  id: string;
  routeId?: string;
  routeName: string;
  grade?: string;
  climbType?: string;
  date: string;
  ascentType?: "Onsight" | "Flash" | "Redpoint" | "Attempt";
  location?: string;
  notes?: string;
}

interface ClimbProjectEntry {
  id: string;
  routeId?: string;
  routeName: string;
  grade?: string;
  climbType?: string;
  location?: string;
  description?: string;
  addedAt: string;
}

function parseClimbLog(extraJson: string): ClimbLogEntry[] {
  try { const o = JSON.parse(extraJson || "{}"); return Array.isArray(o.climbLog) ? o.climbLog : []; } catch { return []; }
}
function parseClimbProjects(extraJson: string): ClimbProjectEntry[] {
  try { const o = JSON.parse(extraJson || "{}"); return Array.isArray(o.climbProjects) ? o.climbProjects : []; } catch { return []; }
}
function setClimbingInExtra(extraJson: string, log: ClimbLogEntry[], projects: ClimbProjectEntry[]): string {
  try { const o = JSON.parse(extraJson || "{}"); return JSON.stringify({ ...o, climbLog: log, climbProjects: projects }); }
  catch { return JSON.stringify({ climbLog: log, climbProjects: projects }); }
}

type ClimbingGoalType = "grade" | "volume" | "strength" | "safety";

const CLIMBING_PLAN_TEMPLATES: PlanTemplate[] = [
  { id: "rc-grade",    emoji: "🧗", label: "Grade / performance",      description: "Send your first 5.11a sport route or V5 boulder this year",                              durationWeeks: 26, defaultSteps: [] },
  { id: "rc-volume",   emoji: "📅", label: "Volume / experience",       description: "Climb at least twice a week and get outside on real rock once a month",                  durationWeeks: 52, defaultSteps: [] },
  { id: "rc-strength", emoji: "💪", label: "Strength / technique",      description: "Do 10 strict pull-ups and complete a structured hangboard cycle",                        durationWeeks: 16, defaultSteps: [] },
  { id: "rc-safety",   emoji: "🪢", label: "Safety / confidence",       description: "Lead 10 new routes without unsafe falls and feel calm placing clips or gear",            durationWeeks: 26, defaultSteps: [] },
];

const CLIMBING_GOAL_TYPE_MAP: Record<string, ClimbingGoalType> = {
  "rc-grade": "grade", "rc-volume": "volume", "rc-strength": "strength", "rc-safety": "safety",
};

function generateClimbingSteps(
  goalType: ClimbingGoalType,
  opts: {
    targetGrade?: string;
    climbStyle?: string;
    weeklyFreq?: string;
    outdoorFreq?: string;
    pullUpTarget?: string;
    hangboard?: boolean;
    leadRoutes?: string;
  },
): GoalStep[] {
  const g = (s: string) => ({ id: genId(), done: false, text: s });
  switch (goalType) {
    case "grade": {
      const grade = opts.targetGrade?.trim() || "your target grade";
      const style = opts.climbStyle?.trim() || "sport";
      return [
        g(`Research the technique demands of ${grade} ${style} climbing — watch beta videos, study crux patterns`),
        g(`Identify and project 3–5 routes at ${grade} — work each one section by section`),
        g(`Build specific strength: finger boarding 2×/week, antagonist training, core`),
        g(`Refine your sequence on your main project — link sections and practise the crux`),
        g(`Send ${grade} — clean ascent, trust your training`),
        g(`Reflect on what clicked, identify your next project and set a new grade goal`),
      ];
    }
    case "volume": {
      const freq  = opts.weeklyFreq?.trim()  || "2";
      const outdoor = opts.outdoorFreq?.trim() || "monthly";
      return [
        g(`Establish your baseline: log your current gym schedule and nearest outdoor crags`),
        g(`Month 1–2: hit ${freq} sessions per week consistently — mix grades, work weaknesses`),
        g(`Book your first outdoor day: research crag access, grades, and safety considerations`),
        g(`Month 3–5: ${outdoor} outdoor session — log every session with grade and notes`),
        g(`Try a new crag or area each outdoor day — build route-reading on real rock`),
        g(`Year-end review: total sessions, crags visited, new grades ticked, skills gained`),
      ];
    }
    case "strength": {
      const pullUps = opts.pullUpTarget?.trim() || "10";
      const hangboard = opts.hangboard !== false;
      return [
        g(`Benchmark: test max pull-ups, max hang (20mm edge, 10 sec), and on-wall feel`),
        hangboard
          ? g(`Start a 4-week hangboard cycle: 7-3 repeaters on 20mm edge, twice a week`)
          : g(`Begin a pull-up progression: 3×5 weighted or 5×3 max-effort sets, twice a week`),
        g(`Technique focus: dedicate one session per week to footwork, slab, and precise movement`),
        g(`Hangboard deload week, then start cycle 2 with increased load or smaller edge`),
        g(`Achieve ${pullUps} strict pull-ups — track weekly, film reps for form check`),
        g(`On-wall benchmark: climb your warm-up circuit feeling strong and precise — note the difference`),
      ];
    }
    case "safety": {
      const routes = opts.leadRoutes?.trim() || "10";
      return [
        g(`Review lead technique: correct clipping positions, body positioning, and fall zones`),
        g(`Practise falling intentionally at comfortable grades — build trust in the system`),
        g(`Lead 2–3 routes per session at 2–3 grades below your limit, focusing on calm clipping`),
        g(`Progress to routes with more sustained sections or longer runouts — stay deliberate`),
        g(`Lead ${routes} new routes without taking unsafe falls — log each one`),
        g(`Reflect on confidence growth: where did you hesitate? Where did you feel solid?`),
      ];
    }
  }
}

// ── Running types ────────────────────────────────────────────────────────────

interface RunLogEntry {
  id: string;
  stravaId?: string;
  name: string;
  date: string;
  distanceKm: number;
  durationSec?: number;
  elevationGain?: number;
  isTrail?: boolean;
  stravaUrl?: string;
  notes?: string;
  addedAt: string;
}

function parseRunLog(extraJson: string): RunLogEntry[] {
  try { const o = JSON.parse(extraJson || "{}"); return Array.isArray(o.runLog) ? o.runLog : []; } catch { return []; }
}
function setRunningInExtra(extraJson: string, log: RunLogEntry[]): string {
  try { const o = JSON.parse(extraJson || "{}"); return JSON.stringify({ ...o, runLog: log }); }
  catch { return JSON.stringify({ runLog: log }); }
}

type RunningGoalType = "consistency" | "distance" | "time" | "enjoyment";

const RUNNING_PLAN_TEMPLATES: PlanTemplate[] = [
  { id: "rn-consistency", emoji: "🗓️", label: "Consistency / habit",     description: "Run at least 3 times per week for the whole year — build the habit before speed",  durationWeeks: 52, defaultSteps: [] },
  { id: "rn-distance",    emoji: "📏", label: "Distance / milestone",    description: "Hit a milestone distance — 5K, 10K, half marathon, or full marathon this year",     durationWeeks: 26, defaultSteps: [] },
  { id: "rn-time",        emoji: "⏱️", label: "Time / performance",      description: "Hit a target time — e.g. sub-25 5K, sub-2:00 half, or sub-4:00 marathon",           durationWeeks: 16, defaultSteps: [] },
  { id: "rn-enjoyment",   emoji: "😊", label: "Enjoyment / experience",  description: "Try trail running, parkruns, or fun-runs — run for joy, not just numbers",          durationWeeks: 52, defaultSteps: [] },
];

const RUNNING_GOAL_TYPE_MAP: Record<string, RunningGoalType> = {
  "rn-consistency": "consistency", "rn-distance": "distance", "rn-time": "time", "rn-enjoyment": "enjoyment",
};

function generateRunningSteps(
  goalType: RunningGoalType,
  opts: {
    runsPerWeek?: string;
    distanceTarget?: string;
    raceType?: string;
    targetTime?: string;
    currentTime?: string;
    funRunCount?: string;
    trailRuns?: string;
  }
): PlanStep[] {
  const g = (text: string): PlanStep => ({ id: genId(), text, done: false });
  switch (goalType) {
    case "consistency": {
      const freq = opts.runsPerWeek?.trim() || "3";
      return [
        g(`Set a non-negotiable schedule: ${freq} run days per week — block them in your calendar`),
        g(`Week 1–4: short easy runs (20–30 min), focus on showing up, not pace`),
        g(`Add a slightly longer run on weekends — comfortable conversational pace`),
        g(`Track your runs for 30 days — celebrate the streak, not the speed`),
        g(`If you miss a day, run the next — consistency over perfection`),
        g(`Month 3: you're a runner — review your log and see how far you've come`),
      ];
    }
    case "distance": {
      const race = opts.raceType?.trim() || "5K";
      const isMarathon = race.toLowerCase().includes("marathon") && !race.toLowerCase().includes("half");
      const isHalf = race.toLowerCase().includes("half");
      const weeks = isMarathon ? 18 : isHalf ? 12 : 8;
      return [
        g(`Choose a target ${race} race — register early for motivation`),
        g(`Build your base: ${weeks >= 16 ? "3–4" : "3"} easy runs per week for the first month`),
        g(`Add one longer run each week, increasing distance by no more than 10% per week`),
        g(`Midpoint check: run a time trial at half the target distance — feel your progress`),
        g(`Practice race-day nutrition and gear on your long run`),
        g(`Taper week: reduce mileage, stay relaxed, trust the training`),
        g(`Race day: run your ${race} — enjoy every step of it`),
      ];
    }
    case "time": {
      const race = opts.raceType?.trim() || "5K";
      const target = opts.targetTime?.trim() || "goal time";
      const current = opts.currentTime?.trim() || "";
      return [
        g(`Establish your current ${race} baseline — run a time trial at full effort`),
        g(`${current ? `Starting from ${current}, plan a path to ${target}` : `Set your target: ${target} — break it into monthly pace milestones`}`),
        g(`Add 1 tempo run per week (comfortably hard pace — you can talk in short sentences)`),
        g(`Add 1 interval session per week — e.g. 6 × 400m at target pace with 90s rest`),
        g(`Long easy run on weekends to build aerobic base`),
        g(`Week before race: reduce intensity, stay loose, trust your preparation`),
        g(`Race: execute your pace strategy — hit ${target}`),
      ];
    }
    case "enjoyment": {
      const funRuns = opts.funRunCount?.trim() || "6";
      const trailRuns = opts.trailRuns?.trim() || "3";
      return [
        g(`Sign up for your first parkrun (free, friendly, 5K every Saturday)`),
        g(`Try a trail run in nature — even a short one changes everything`),
        g(`Join a local running club for one session — community makes it fun`),
        g(`Sign up for a themed fun run or colour run — something with a smile factor`),
        g(`Log ${trailRuns} trail runs this year — explore somewhere new each time`),
        g(`Complete ${funRuns} fun-run events or parkruns — make it social`),
        g(`Reflect: what kind of running do you love? Lean into that for next year`),
      ];
    }
  }
}

// ── Surfing types ────────────────────────────────────────────────────────────

interface SurfSessionEntry {
  id: string;
  stravaId?: string;
  name: string;
  date: string;
  break?: string;
  conditions?: string;
  durationSec?: number;
  waveHeight?: string;
  notes?: string;
  addedAt: string;
}

function parseSurfLog(extraJson: string): SurfSessionEntry[] {
  try { const o = JSON.parse(extraJson || "{}"); return Array.isArray(o.surfLog) ? o.surfLog : []; } catch { return []; }
}
function setSurfingInExtra(extraJson: string, log: SurfSessionEntry[]): string {
  try { const o = JSON.parse(extraJson || "{}"); return JSON.stringify({ ...o, surfLog: log }); }
  catch { return JSON.stringify({ surfLog: log }); }
}

type SurfingGoalType = "consistency" | "skill" | "technique" | "exploration";

const SURFING_PLAN_TEMPLATES: PlanTemplate[] = [
  { id: "sf-consistency", emoji: "🗓️", label: "Consistency / sessions",   description: "Log 30 surf sessions by end of summer — about 2–3 sessions per week",           durationWeeks: 16, defaultSteps: [] },
  { id: "sf-skill",       emoji: "🌊", label: "Wave & skill level",        description: "Progress from whitewater to consistently catching clean green waves down the line", durationWeeks: 26, defaultSteps: [] },
  { id: "sf-technique",   emoji: "🏄", label: "Technique & fitness",       description: "Dial in your pop-up and paddle strength for smooth sessions every time",            durationWeeks: 12, defaultSteps: [] },
  { id: "sf-exploration", emoji: "🗺️", label: "Exploration / experience",  description: "Surf a new break and paddle out in a bigger-than-usual but safe swell this season", durationWeeks: 26, defaultSteps: [] },
];

const SURFING_GOAL_TYPE_MAP: Record<string, SurfingGoalType> = {
  "sf-consistency": "consistency", "sf-skill": "skill", "sf-technique": "technique", "sf-exploration": "exploration",
};

function generateSurfingSteps(
  goalType: SurfingGoalType,
  opts: {
    sessionTarget?: string;
    currentLevel?: string;
    popUpTarget?: string;
    newBreakTarget?: string;
    swellTarget?: string;
  }
): PlanStep[] {
  const g = (text: string): PlanStep => ({ id: genId(), text, done: false });
  switch (goalType) {
    case "consistency": {
      const target = opts.sessionTarget?.trim() || "30";
      return [
        g(`Set a regular surf schedule — aim for ${Math.round(Number(target) / 16)} sessions per week`),
        g(`Log every session, even short ones — building the habit matters more than conditions`),
        g(`Month 1: focus on getting in the water consistently, not on performance`),
        g(`Find a reliable local break you can reach easily for weekday sessions`),
        g(`Month 3: review your log — how many sessions in? Adjust if needed`),
        g(`Hit ${target} sessions logged — celebrate the commitment to the ocean`),
      ];
    }
    case "skill": {
      const current = opts.currentLevel?.trim() || "whitewater";
      return [
        g(`Assess your current level: can you consistently catch and ride ${current}?`),
        g(`Whiteboard session: study how green waves peel and where to position for them`),
        g(`Practice paddle technique — good paddling is 80% of catching unbroken waves`),
        g(`Work on reading the lineup: watch where locals sit and how they time their takeoffs`),
        g(`First green wave goal: catch and ride one clean unbroken wave down the line`),
        g(`Build consistency: aim to catch 3+ green waves in a session before moving on`),
        g(`Celebrate the progression — riding down the line is a genuinely big milestone`),
      ];
    }
    case "technique": {
      const popUp = opts.popUpTarget || "smooth";
      return [
        g(`Film your pop-up on land — check hand placement, back foot position, and head height`),
        g(`Practice pop-ups on land daily (10 reps) until the movement is fully automatic`),
        g(`Paddle fitness: 3× per week out-of-water paddling (SUP, outrigger, or swim)`),
        g(`In the water: focus exclusively on pop-up mechanics for 2 weeks — ignore wave selection`),
        g(`Progress check: can you pop up ${popUp} without hesitation or stumbling?`),
        g(`Combine good pop-up with correct foot placement — front foot over fins, toes angled`),
        g(`Benchmark session: paddle out, pop up 5 times cleanly — that's your new baseline`),
      ];
    }
    case "exploration": {
      const newBreak = opts.newBreakTarget || "a new break";
      const swell = opts.swellTarget || "overhead";
      return [
        g(`Research ${newBreak}: check surf reports, watch videos, talk to locals about etiquette`),
        g(`Visit ${newBreak} first on a small day — learn the paddle-out, rips, and lineup`),
        g(`Build up your paddle fitness specifically for new, potentially longer paddle-outs`),
        g(`Track swell forecasts with Surfline or Magicseaweed — learn to read forecast charts`),
        g(`Identify a "stretch swell" target: ${swell} but manageable — pick a day with friends`),
        g(`Paddle out in that bigger swell — commit to the experience even if you don't catch much`),
        g(`Reflect: what did ${newBreak} and the bigger swell teach you about your surfing?`),
      ];
    }
  }
}

// ── Plan helpers ───────────────────────────────────────────────────────────────

export function parsePlans(extraJson: string): HobbyPlan[] {
  try {
    const obj = JSON.parse(extraJson || "{}");
    return Array.isArray(obj.plans) ? obj.plans : [];
  } catch { return []; }
}

/**
 * Backfill: for each plan that lacks a linked goal, auto-create one.
 * Returns null if nothing needed adding (no write needed).
 */
function backfillGoalsForPlans(extraJson: string): string | null {
  const plans = parsePlans(extraJson);
  const goals = parseGoals(extraJson);
  if (plans.length === 0) return null;

  const linkedIds = new Set(goals.map(g => g.linkedPlanId).filter(Boolean));
  const missing = plans.filter(p => !linkedIds.has(p.id));
  if (missing.length === 0) return null;

  const newGoals: HobbyGoal[] = missing.map(plan => ({
    id: genId(),
    title: plan.title,
    description: plan.description || undefined,
    goalType: "milestone" as const,
    durationWeeks: plan.durationWeeks,
    status: (plan.completedAt ? "completed" : plan.isActive ? "active" : "paused") as HobbyGoal["status"],
    createdAt: plan.createdAt,
    linkedPlanId: plan.id,
  }));

  return setGoalsInExtra(extraJson, [...goals, ...newGoals]);
}

export function setPlansInExtra(extraJson: string, plans: HobbyPlan[]): string {
  try {
    const obj = JSON.parse(extraJson || "{}");
    return JSON.stringify({ ...obj, plans });
  } catch { return JSON.stringify({ plans }); }
}

export function setPlansAndGoalsInExtra(extraJson: string, plans: HobbyPlan[], goals: HobbyGoal[]): string {
  try {
    const obj = JSON.parse(extraJson || "{}");
    return JSON.stringify({ ...obj, plans, goals });
  } catch { return JSON.stringify({ plans, goals }); }
}

function planProgress(plan: HobbyPlan): { pct: number; done: number; total: number } {
  const total = plan.steps.length;
  const done = plan.steps.filter(s => s.done).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  return { pct, done, total };
}

// ── ExtraFields (unchanged) ────────────────────────────────────────────────────

export function ExtraFields({ hobbyType, extra, onChange }: { hobbyType: HobbyType; extra: Record<string, any>; onChange: (key: string, value: any) => void }) {
  const field = (label: string, key: string, placeholder?: string, type: "input" | "textarea" = "input") => (
    <div key={key}>
      <label className="text-xs font-medium text-muted-foreground mb-1 block">{label}</label>
      {type === "textarea" ? (
        <Textarea className="text-sm min-h-[70px]" placeholder={placeholder} value={extra[key] ?? ""} onChange={e => onChange(key, e.target.value)} />
      ) : (
        <Input className="text-sm" placeholder={placeholder} value={extra[key] ?? ""} onChange={e => onChange(key, e.target.value)} />
      )}
    </div>
  );
  if (hobbyType === "collection") return <div className="space-y-3">{field("Items in Collection (count)", "itemCount", "e.g. 142")}{field("Estimated Value", "estimatedValue", "e.g. ~$2,400")}{field("Most Prized Item", "mostPrizedItem", "Describe your favorite piece")}</div>;
  if (hobbyType === "outdoor") return <div className="space-y-3">{field("Favorite Locations", "favoriteLocations", "e.g. Yosemite, Blue Ridge Trail…", "textarea")}{field("Gear List", "gearList", "Key gear you use or want", "textarea")}{field("Personal Bests", "personalBests", "e.g. 26.2 mi marathon, 14,000 ft summit")}</div>;
  if (hobbyType === "creative") return <div className="space-y-3">{field("Materials / Tools Used", "materialsTools", "e.g. Nikon Z6, watercolor, lathe…")}{field("Works in Progress", "worksInProgress", "What are you working on right now?", "textarea")}</div>;
  if (hobbyType === "games") return <div className="space-y-3">{field("Favorite Games / Titles", "favoriteGames", "e.g. Catan, Elden Ring, Blitz Chess", "textarea")}{field("Rating / ELO", "ratingElo", "e.g. Chess.com 1450, BGG 8/10")}{field("Play Frequency", "playFrequency", "e.g. Weekly with friends")}</div>;
  if (hobbyType === "learning") return <div className="space-y-3">{field("Current Level", "currentLevel", "e.g. B2 Spanish, built 3 circuits")}{field("Goals", "goals", "What are you working toward?", "textarea")}{field("Resources / Courses", "resources", "Books, courses, links you're using", "textarea")}</div>;
  if (hobbyType === "performance") return <div className="space-y-3">{field("Instrument / Style", "instrumentStyle", "e.g. Acoustic guitar, jazz improv")}<div><label className="text-xs font-medium text-muted-foreground mb-1 block">Years Playing</label><Input type="number" className="text-sm" placeholder="e.g. 7" value={extra["yearsPlaying"] ?? ""} onChange={e => onChange("yearsPlaying", e.target.value ? Number(e.target.value) : "")} /></div>{field("Favorite Pieces / Sets", "favoritePieces", "Favorite songs, plays, performances", "textarea")}</div>;
  return null;
}

export function ExtraDisplay({ hobbyType, extra }: { hobbyType: HobbyType; extra: Record<string, any> }) {
  const row = (label: string, value: any) => value ? <div key={label} className="flex gap-2 text-sm"><span className="text-muted-foreground min-w-[120px] shrink-0">{label}</span><span className="text-foreground">{String(value)}</span></div> : null;
  if (hobbyType === "collection") return <>{row("Items", extra.itemCount)}{row("Est. Value", extra.estimatedValue)}{row("Prized Item", extra.mostPrizedItem)}</>;
  if (hobbyType === "outdoor") return <>{row("Locations", extra.favoriteLocations)}{row("Gear", extra.gearList)}{row("Personal Bests", extra.personalBests)}</>;
  if (hobbyType === "creative") return <>{row("Materials / Tools", extra.materialsTools)}{row("WIP", extra.worksInProgress)}</>;
  if (hobbyType === "games") return <>{row("Favorites", extra.favoriteGames)}{row("Rating / ELO", extra.ratingElo)}{row("Play Freq.", extra.playFrequency)}</>;
  if (hobbyType === "learning") return <>{row("Current Level", extra.currentLevel)}{row("Goals", extra.goals)}{row("Resources", extra.resources)}</>;
  if (hobbyType === "performance") return <>{row("Instrument / Style", extra.instrumentStyle)}{row("Years Playing", extra.yearsPlaying)}{row("Favorites", extra.favoritePieces)}</>;
  return null;
}

// ── Goal Progress Card ─────────────────────────────────────────────────────────

function GoalCard({
  goal,
  hobbyName,
  hobbyColor,
  onUpdateCount,
  onToggleStep,
  onComplete,
  onDelete,
  onEdit,
}: {
  goal: HobbyGoal;
  hobbyName: string;
  hobbyColor: string;
  onUpdateCount?: (val: number) => void;
  onToggleStep?: (stepId: string, done: boolean) => void;
  onComplete?: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
}) {
  const [editingCount, setEditingCount] = useState(false);
  const [countInput, setCountInput] = useState(String(goal.currentValue ?? 0));
  const { data: friends = [] } = useFriends();
  const buddy = goal.buddyUserId ? friends.find((f) => f.id === goal.buddyUserId) : null;
  const meta = GOAL_TYPE_META[goal.goalType];
  const GoalIcon = meta.icon;
  const { pct, label } = goalProgress(goal);
  const days = goal.targetDate ? daysUntilDate(goal.targetDate) : null;
  const isCompleted = goal.status === "completed";

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${isCompleted ? "bg-secondary/30 opacity-75" : "bg-card"}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: hobbyColor + "22" }}>
            <GoalIcon size={13} style={{ color: hobbyColor }} />
          </div>
          <div className="min-w-0">
            <p className={`text-sm font-semibold leading-tight ${isCompleted ? "line-through text-muted-foreground" : ""}`}>{goal.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{hobbyName} · <span className={meta.color}>{meta.label}</span></p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!isCompleted && onEdit && (
            <button onClick={onEdit} title="Edit goal" className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
              <Pencil size={13} />
            </button>
          )}
          {!isCompleted && onComplete && (
            <button onClick={onComplete} title="Mark complete" className="p-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-muted-foreground hover:text-emerald-600 transition-colors">
              <CheckCircle2 size={14} />
            </button>
          )}
          {onDelete && (
            <button onClick={onDelete} title="Delete" className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Progress / steps */}
      {goal.goalType === "count" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-semibold">{pct}%</span>
          </div>
          <Progress value={pct} className="h-1.5" />
          {!isCompleted && onUpdateCount && (
            <div className="flex items-center gap-2 pt-1">
              {editingCount ? (
                <>
                  <Input
                    type="number" value={countInput} onChange={e => setCountInput(e.target.value)}
                    className="h-7 text-xs w-24" min={0} max={goal.targetValue}
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === "Enter") { onUpdateCount(Number(countInput)); setEditingCount(false); }
                      if (e.key === "Escape") setEditingCount(false);
                    }}
                  />
                  <button onClick={() => { onUpdateCount(Number(countInput)); setEditingCount(false); }} className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/80 transition-colors">Save</button>
                  <button onClick={() => setEditingCount(false)} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                </>
              ) : (
                <button onClick={() => { setCountInput(String(goal.currentValue ?? 0)); setEditingCount(true); }} className="text-xs text-primary hover:underline">Update progress</button>
              )}
            </div>
          )}
        </div>
      )}

      {goal.goalType === "plan" && (goal.steps?.length ?? 0) > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>{label}</span>
            <span>{pct}%</span>
          </div>
          <Progress value={pct} className="h-1" />
          <div className="space-y-1 mt-2 max-h-40 overflow-y-auto">
            {(goal.steps ?? []).map((step) => (
              <button
                key={step.id}
                onClick={() => onToggleStep?.(step.id, !step.done)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-secondary/50 transition-colors text-left"
                disabled={isCompleted}
              >
                {step.done
                  ? <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                  : <Circle size={13} className="text-muted-foreground/40 shrink-0" />}
                <span className={`text-xs flex-1 ${step.done ? "line-through text-muted-foreground" : ""}`}>{step.text}</span>
                {step.dueDate && (
                  <span className={`text-[10px] shrink-0 ${(() => { const d = daysUntilDate(step.dueDate); return d !== null && d < 0 ? "text-destructive" : d !== null && d <= 3 ? "text-amber-500" : "text-muted-foreground"; })()}`}>
                    {format(parseISO(step.dueDate), "MMM d")}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {goal.goalType === "frequency" && (
        <div className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{goal.freqTimes}×</span> per {goal.freqPeriod}
          {goal.durationWeeks && <span> · {goal.durationWeeks} week{goal.durationWeeks !== 1 ? "s" : ""}</span>}
        </div>
      )}

      {/* Deadline */}
      {goal.targetDate && !isCompleted && (
        <div className={`flex items-center gap-1 text-xs ${(() => { const d = daysUntilDate(goal.targetDate); return d !== null && d < 0 ? "text-destructive" : d !== null && d <= 7 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"; })()}`}>
          <Calendar size={10} />
          {(() => {
            const d = daysUntilDate(goal.targetDate);
            if (d === null) return format(parseISO(goal.targetDate), "MMM d, yyyy");
            if (d < 0) return `${Math.abs(d)}d overdue`;
            if (d === 0) return "Due today";
            if (d === 1) return "Due tomorrow";
            return `Due ${format(parseISO(goal.targetDate), "MMM d")} · ${d}d`;
          })()}
        </div>
      )}
      {isCompleted && (
        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
          <CheckCircle2 size={11} /> Completed
        </span>
      )}

      {/* Accountabilibuddy chip */}
      {buddy && (
        <div className="flex items-center gap-1.5 pt-0.5">
          {buddy.avatarUrl ? (
            <img src={buddy.avatarUrl} alt={buddy.name} className="w-4 h-4 rounded-full object-cover border border-background shrink-0" />
          ) : (
            <div className="w-4 h-4 rounded-full bg-primary/20 text-primary text-[8px] font-bold flex items-center justify-center border border-background shrink-0">
              {buddy.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
            </div>
          )}
          <span className="text-xs text-muted-foreground">
            <span className="font-medium" style={{ color: hobbyColor }}>{buddy.name.split(" ")[0]}</span>
            {" "}is your buddy
          </span>
        </div>
      )}
    </div>
  );
}

// ── Plan Card ─────────────────────────────────────────────────────────────────

function PlanCard({
  plan,
  hobbyName,
  hobbyColor,
  onToggleStep,
  onToggleMilestone,
  onToggleActive,
  onPause,
  onResume,
  onComplete,
  onDelete,
  onEdit,
}: {
  plan: HobbyPlan;
  hobbyName: string;
  hobbyColor: string;
  onToggleStep?: (stepId: string, done: boolean) => void;
  onToggleMilestone?: (milestoneId: string, completed: boolean) => void;
  onToggleActive?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onComplete?: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
}) {
  const [stepsOpen, setStepsOpen] = useState(false);
  const { pct, done, total } = planProgress(plan);
  const isCompleted = !!plan.completedAt;
  const isPaused = !plan.isActive && !!plan.isPaused && !plan.completedAt;
  const milestones = plan.milestones ?? [];
  const milestoneDone = milestones.filter(m => !!m.completedAt).length;
  const days = plan.startDate && plan.durationWeeks
    ? Math.round((new Date(plan.startDate).getTime() + plan.durationWeeks * 7 * 86400000 - Date.now()) / 86400000)
    : null;

  const borderClass = isCompleted
    ? "bg-secondary/30 opacity-75"
    : plan.isActive
      ? "bg-blue-50/50 dark:bg-blue-950/10 border-blue-200 dark:border-blue-800"
      : isPaused
        ? "bg-amber-50/40 dark:bg-amber-950/10 border-amber-200 dark:border-amber-800"
        : "bg-card";

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${borderClass}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: hobbyColor + "22" }}>
            <ClipboardList size={13} style={{ color: hobbyColor }} />
          </div>
          <div className="min-w-0">
            <p className={`text-sm font-semibold leading-tight ${isCompleted ? "line-through text-muted-foreground" : ""}`}>{plan.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{hobbyName}
              {plan.durationWeeks && <span> · {plan.durationWeeks}w plan</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {plan.isActive && (
            <span className="flex items-center gap-0.5 text-[10px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 rounded-full border border-blue-200 dark:border-blue-800">
              <Zap size={9} /> Active
            </span>
          )}
          {isPaused && (
            <span className="flex items-center gap-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">
              ⏸ Paused
            </span>
          )}
          {!isCompleted && onEdit && (
            <button onClick={onEdit} title="Edit plan" className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
              <Pencil size={13} />
            </button>
          )}
          {!isCompleted && onComplete && (
            <button onClick={onComplete} title="Mark complete" className="p-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-muted-foreground hover:text-emerald-600 transition-colors">
              <CheckCircle2 size={14} />
            </button>
          )}
          {onDelete && (
            <button onClick={onDelete} title="Delete" className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {/* ── Milestones ── */}
      {milestones.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Trophy size={9} /> Milestones
            </p>
            <span className="text-[10px] text-muted-foreground">{milestoneDone}/{milestones.length}</span>
          </div>
          <div className="space-y-1">
            {milestones.map(m => (
              <button
                key={m.id}
                type="button"
                onClick={() => onToggleMilestone?.(m.id, !m.completedAt)}
                disabled={isCompleted || !onToggleMilestone}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-secondary/50 transition-colors text-left group"
              >
                {m.completedAt
                  ? <Trophy size={12} className="text-amber-500 shrink-0" />
                  : <Circle size={12} className="text-muted-foreground/40 shrink-0" />}
                <span className={`text-xs flex-1 ${m.completedAt ? "line-through text-muted-foreground" : "font-medium"}`}>{m.title}</span>
                {m.completedAt && (
                  <span className="text-[10px] text-muted-foreground shrink-0">{format(parseISO(m.completedAt), "MMM d")}</span>
                )}
              </button>
            ))}
          </div>
          {milestones.length > 1 && (
            <div className="h-1 bg-secondary rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.round((milestoneDone / milestones.length) * 100)}%`, backgroundColor: hobbyColor }} />
            </div>
          )}
        </div>
      )}

      {/* ── Plan Overview (steps) — collapsible ── */}
      {total > 0 && (
        <div className="space-y-1.5">
          <button type="button"
            onClick={() => setStepsOpen(o => !o)}
            className="w-full flex items-center justify-between text-left hover:opacity-80 transition-opacity">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <ListChecks size={9} /> Plan Overview
              <span className="font-normal ml-1 text-muted-foreground/60">{done}/{total} steps · {pct}%</span>
            </p>
            {stepsOpen ? <ChevronUp size={12} className="text-muted-foreground" /> : <ChevronDown size={12} className="text-muted-foreground" />}
          </button>

          <Progress value={pct} className="h-1" />

          {stepsOpen && (
            <div className="space-y-0.5 max-h-52 overflow-y-auto mt-1">
              {plan.steps.map((step) => (
                <button
                  key={step.id}
                  onClick={() => onToggleStep?.(step.id, !step.done)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-secondary/50 transition-colors text-left"
                  disabled={isCompleted || !onToggleStep}
                >
                  {step.done
                    ? <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                    : <Circle size={13} className="text-muted-foreground/40 shrink-0" />}
                  <span className={`text-xs flex-1 ${step.done ? "line-through text-muted-foreground" : ""}`}>{step.text}</span>
                  {step.dueDate && (
                    <span className={`text-[10px] shrink-0 ${(() => { const d = daysUntilDate(step.dueDate); return d !== null && d < 0 ? "text-destructive" : d !== null && d <= 3 ? "text-amber-500" : "text-muted-foreground"; })()}`}>
                      {format(parseISO(step.dueDate), "MMM d")}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Duration / deadline */}
      {plan.startDate && days !== null && !isCompleted && (
        <div className={`flex items-center gap-1 text-xs ${days < 0 ? "text-destructive" : days <= 7 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
          <Calendar size={10} />
          {days < 0 ? `${Math.abs(days)}d past end date` : days === 0 ? "Ends today" : `${days}d remaining`}
        </div>
      )}

      {isCompleted && (
        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
          <CheckCircle2 size={11} /> Completed
        </span>
      )}

      {/* Action bar: Activate / Pause / Resume / Deactivate */}
      {!isCompleted && (onToggleActive || onPause || onResume) && (
        <div className="pt-1 border-t flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {plan.isActive ? "Active" : isPaused ? "Paused" : "Inactive"}
          </span>
          <div className="flex items-center gap-1">
            {plan.isActive && onPause && (
              <button onClick={onPause}
                className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-all bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 hover:bg-amber-100">
                ⏸ Pause
              </button>
            )}
            {isPaused && onResume && (
              <button onClick={onResume}
                className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-all bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-100">
                <Play size={10} /> Resume
              </button>
            )}
            {plan.isActive && onToggleActive && (
              <button onClick={onToggleActive}
                className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-all bg-secondary border-border text-muted-foreground hover:bg-primary/5 hover:border-primary/30 hover:text-primary">
                <PowerOff size={10} /> Deactivate
              </button>
            )}
            {!plan.isActive && !isPaused && onToggleActive && (
              <button onClick={onToggleActive}
                className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-all bg-secondary border-border text-muted-foreground hover:bg-primary/5 hover:border-primary/30 hover:text-primary">
                <Power size={10} /> Activate
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Hobby Plan Rich Card (Workouts-style) ─────────────────────────────────────

export function HobbyPlanRichCard({
  plan, hobbyColor, hobbyTypeLabel,
  onToggleStep, onToggleMilestone,
  onToggleActive, onPause, onResume, onComplete, onDelete, onEdit,
  onLogSession, onEditSession,
}: {
  plan: HobbyPlan;
  hobbyColor: string;
  hobbyTypeLabel: string;
  onToggleStep?: (stepId: string, done: boolean) => void;
  onToggleMilestone?: (milestoneId: string, completed: boolean) => void;
  onToggleActive?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onComplete?: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  onLogSession?: (dayLabel: string, defaultDate: string) => void;
  onEditSession?: (dayLabel: string, session: SessionLog) => void;
}) {
  const today = new Date();
  const todayDow = today.getDay(); // 0=Sun
  const _DAYS_SHORT_LOCAL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const todayDowLabel = _DAYS_SHORT_LOCAL[todayDow];

  const [stepsOpen, setStepsOpen] = useState(false);

  const isCompleted = !!plan.completedAt;
  const isPaused = !plan.isActive && !!plan.isPaused && !isCompleted;

  const startDateObj = plan.startDate ? new Date(plan.startDate) : null;
  const weeksElapsed = startDateObj
    ? Math.max(0, Math.floor((today.getTime() - startDateObj.getTime()) / (7 * 24 * 60 * 60 * 1000)))
    : 0;
  const totalWeeks = plan.durationWeeks ?? null;
  const currentWeek = totalWeeks ? Math.min(weeksElapsed + 1, totalWeeks) : null;
  const progressPct = totalWeeks ? Math.min(100, Math.round((weeksElapsed / totalWeeks) * 100)) : 0;
  const { pct: stepPct, done: doneSteps, total: totalSteps } = planProgress(plan);
  const displayPct = totalWeeks ? Math.max(progressPct, stepPct) : stepPct;

  const milestones = plan.milestones ?? [];
  const milestoneDone = milestones.filter(m => !!m.completedAt).length;
  const nextMilestone = milestones.find(m => !m.completedAt);

  // Determine scheduled days
  function calcScheduledDays(): string[] {
    if (plan.scheduleDays && plan.scheduleDays.length > 0) return plan.scheduleDays;
    const _SPREAD: Record<number, string[]> = {
      1: ["Wed"], 2: ["Tue", "Fri"], 3: ["Mon", "Wed", "Fri"],
      4: ["Mon", "Tue", "Thu", "Fri"], 5: ["Mon", "Tue", "Wed", "Thu", "Fri"],
      6: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
      7: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    };
    const stepsPerWeek = Math.ceil(plan.steps.length / (plan.durationWeeks ?? 1)) || 3;
    return _SPREAD[Math.min(stepsPerWeek, 7)] ?? ["Mon", "Wed", "Fri"];
  }
  const scheduledDays = new Set(calcScheduledDays());

  // This week's sessions map: dayOfWeek → SessionLog
  const thisWeekStart = new Date(today);
  thisWeekStart.setDate(today.getDate() - todayDow);
  const thisWeekEnd = new Date(thisWeekStart);
  thisWeekEnd.setDate(thisWeekStart.getDate() + 6);
  const startStr = thisWeekStart.toISOString().slice(0, 10);
  const endStr = thisWeekEnd.toISOString().slice(0, 10);
  const thisWeekSessionByDay = new Map<string, SessionLog>(
    (plan.sessions ?? [])
      .filter(s => s.date >= startStr && s.date <= endStr && !!s.dayOfWeek)
      .map(s => [s.dayOfWeek!, s])
  );

  function dateForDay(dayLabel: string): string {
    const _DAY_TO_IDX_LOCAL: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const diff = (_DAY_TO_IDX_LOCAL[dayLabel] ?? 1) - todayDow;
    const d = new Date(today);
    d.setDate(d.getDate() + diff);
    return d.toISOString().slice(0, 10);
  }

  const _DAYS_ORDERED_LOCAL = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const borderStyle = isCompleted ? "opacity-70" : plan.isActive ? "border-blue-200 dark:border-blue-800" : isPaused ? "border-amber-200 dark:border-amber-800" : "";

  return (
    <div className={`rounded-xl border overflow-hidden ${borderStyle}`}>
      {/* ── Status header bar ── */}
      <div className="px-4 py-2.5 flex items-center justify-between gap-2"
        style={{ background: plan.isActive ? `${hobbyColor}18` : isPaused ? "#f59e0b18" : "#6b728018" }}>
        <span className="text-xs font-semibold flex items-center gap-1.5" style={{ color: plan.isActive ? hobbyColor : isPaused ? "#d97706" : undefined }}>
          {plan.isActive ? <Zap size={10} /> : isPaused ? <span>⏸</span> : <Power size={10} />}
          {plan.isActive ? "Active Plan" : isPaused ? "Paused" : "Inactive"}
          {currentWeek && totalWeeks ? ` — Week ${currentWeek} of ${totalWeeks}` : ""}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {plan.isActive && onPause && (
            <button onClick={onPause} title="Pause" className="p-1 rounded hover:bg-amber-100 dark:hover:bg-amber-900/30 text-amber-500 transition-colors">
              <span className="text-[11px] leading-none">⏸</span>
            </button>
          )}
          {isPaused && onResume && (
            <button onClick={onResume} title="Resume" className="p-1 rounded hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors" style={{ color: hobbyColor }}>
              <Play size={11} />
            </button>
          )}
          {!isCompleted && onEdit && (
            <button onClick={onEdit} title="Edit plan" className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
              <Pencil size={11} />
            </button>
          )}
          {onDelete && (
            <button onClick={onDelete} title="Delete" className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
              <Trash2 size={11} />
            </button>
          )}
        </div>
      </div>

      {/* ── Plan name + type tag + metadata ── */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className={`text-sm font-bold leading-tight ${isCompleted ? "line-through text-muted-foreground" : ""}`}>{plan.title}</p>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium border"
                style={{ background: `${hobbyColor}18`, color: hobbyColor, borderColor: `${hobbyColor}40` }}>
                {hobbyTypeLabel}
              </span>
              {totalWeeks && <span className="text-[10px] text-muted-foreground">{totalWeeks}w</span>}
              {scheduledDays.size > 0 && <span className="text-[10px] text-muted-foreground">{scheduledDays.size}d/wk</span>}
              {startDateObj && <span className="text-[10px] text-muted-foreground">{totalWeeks} wks planned</span>}
            </div>
          </div>
          {isCompleted && (
            <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium shrink-0">
              <CheckCircle2 size={12} /> Done
            </span>
          )}
        </div>
      </div>

      {/* ── Next milestone highlight ── */}
      {nextMilestone && (
        <div className="mx-4 mb-2 px-3 py-2 rounded-lg flex items-center gap-2"
          style={{ background: `${hobbyColor}10`, border: `1px solid ${hobbyColor}30` }}>
          <Trophy size={11} style={{ color: hobbyColor }} className="shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Next Milestone</p>
            <p className="text-xs font-semibold truncate">{nextMilestone.title}</p>
          </div>
          <span className="text-[10px] text-muted-foreground shrink-0">{milestoneDone}/{milestones.length}</span>
        </div>
      )}

      {/* ── Progress bar ── */}
      <div className="px-4 pb-3">
        <div className="flex justify-between text-[10px] text-muted-foreground mb-1.5">
          <span>{currentWeek && totalWeeks ? `Week ${currentWeek} of ${totalWeeks}` : "Progress"}{totalSteps > 0 ? ` · ${doneSteps}/${totalSteps} steps` : ""}</span>
          <span className="font-semibold" style={{ color: hobbyColor }}>{displayPct}% complete</span>
        </div>
        <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-300" style={{ width: `${displayPct}%`, backgroundColor: hobbyColor }} />
        </div>
      </div>

      {/* ── Milestone checklist ── */}
      {milestones.length > 0 && (
        <div className="px-4 pb-3 space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1 mb-1">
            <Trophy size={9} /> Milestones
            <span className="font-normal ml-1">{milestoneDone}/{milestones.length}</span>
          </p>
          {milestones.map(m => (
            <button key={m.id} type="button"
              onClick={() => onToggleMilestone?.(m.id, !m.completedAt)}
              disabled={isCompleted || !onToggleMilestone}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-secondary/50 transition-colors text-left">
              {m.completedAt
                ? <CheckCircle2 size={12} className="text-amber-500 shrink-0" />
                : <Circle size={12} className="text-muted-foreground/40 shrink-0" />}
              <span className={`text-xs flex-1 ${m.completedAt ? "line-through text-muted-foreground" : "font-medium"}`}>{m.title}</span>
              {m.completedAt && <span className="text-[10px] text-muted-foreground shrink-0">{format(parseISO(m.completedAt), "MMM d")}</span>}
            </button>
          ))}
        </div>
      )}

      {/* ── Weekly schedule (vertical list with task detail) ── */}
      <div className="border-t">
        <div className="px-4 py-2 flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {currentWeek && totalWeeks ? `Week ${currentWeek} schedule` : "Weekly Schedule"}
          </p>
          {onEdit && (
            <button onClick={onEdit} className="text-[10px] flex items-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors">
              <Pencil size={9} /> Edit schedule
            </button>
          )}
        </div>
        <div className="divide-y">
          {_DAYS_ORDERED_LOCAL.map(dayLabel => {
            const isToday = dayLabel === todayDowLabel;
            const hasActivity = scheduledDays.has(dayLabel);
            const session = thisWeekSessionByDay.get(dayLabel);
            const isLogged = !!session;

            return (
              <div key={dayLabel}
                className={`flex items-start gap-3 px-4 py-2.5 ${isToday ? "bg-primary/5" : ""} ${!hasActivity ? "opacity-35" : ""}`}>
                {/* Day column */}
                <div className="w-9 shrink-0 pt-0.5">
                  <p className={`text-xs font-bold uppercase ${isToday ? "text-primary" : "text-muted-foreground"}`}>{dayLabel}</p>
                  {isToday && <div className="w-1 h-1 rounded-full bg-primary mt-0.5" />}
                </div>
                {/* Content */}
                {hasActivity ? (
                  <button type="button"
                    className="flex-1 flex items-start gap-2 text-left rounded-lg px-2 py-1.5 hover:bg-muted/60 active:bg-muted transition-colors group/row -mx-2"
                    onClick={() => {
                      if (session) onEditSession?.(dayLabel, session);
                      else onLogSession?.(dayLabel, dateForDay(dayLabel));
                    }}
                  >
                    <div className="w-2 h-2 rounded-full shrink-0 mt-1.5" style={{ background: isLogged ? hobbyColor : `${hobbyColor}60` }} />
                    <div className="flex-1 min-w-0">
                      {(() => {
                        const dayInfo = getPlanDayInfo(plan, dayLabel);
                        if (isLogged && session.notes) {
                          return (
                            <>
                              <p className="text-xs font-semibold leading-tight">{dayInfo.label || plan.title}</p>
                              <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">{session.notes}</p>
                            </>
                          );
                        } else if (dayInfo.label) {
                          return (
                            <>
                              <p className="text-xs font-semibold leading-tight">{dayInfo.label}</p>
                              {dayInfo.notes && (
                                <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">{dayInfo.notes}</p>
                              )}
                            </>
                          );
                        } else {
                          return <p className="text-xs font-medium">{plan.title}</p>;
                        }
                      })()}
                    </div>
                    {isLogged ? (
                      <span className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 mt-0.5"
                        style={{ background: `${hobbyColor}20`, color: hobbyColor }}>
                        <CheckCircle2 size={9} />
                        {session.durationMins ? `${session.durationMins}m` : "Logged"}
                        <Pencil size={8} className="ml-0.5 opacity-60" />
                      </span>
                    ) : isToday ? (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary text-primary-foreground shrink-0 mt-0.5">
                        Log Today
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground opacity-0 group-hover/row:opacity-100 shrink-0 mt-0.5 transition-opacity">
                        + Log
                      </span>
                    )}
                  </button>
                ) : (
                  <p className="text-xs text-muted-foreground flex-1 px-2 py-1.5">Rest</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Plan Overview (steps) — collapsible ── */}
      {totalSteps > 0 && (
        <div className="px-4 pb-3 border-t pt-3">
          <button type="button" onClick={() => setStepsOpen(o => !o)}
            className="w-full flex items-center justify-between text-left hover:opacity-80 transition-opacity">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <ListChecks size={9} /> Plan Overview
              <span className="font-normal ml-1 text-muted-foreground/60">{doneSteps}/{totalSteps} · {stepPct}%</span>
            </p>
            {stepsOpen ? <ChevronUp size={12} className="text-muted-foreground" /> : <ChevronDown size={12} className="text-muted-foreground" />}
          </button>
          {stepsOpen && (
            <div className="space-y-0.5 mt-1.5 max-h-40 overflow-y-auto">
              {plan.steps.map(step => (
                <button key={step.id} type="button"
                  onClick={() => onToggleStep?.(step.id, !step.done)}
                  disabled={isCompleted || !onToggleStep}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-secondary/50 transition-colors text-left">
                  {step.done
                    ? <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
                    : <Circle size={12} className="text-muted-foreground/40 shrink-0" />}
                  <span className={`text-xs flex-1 ${step.done ? "line-through text-muted-foreground" : ""}`}>{step.text}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Action bar ── */}
      {!isCompleted && (onToggleActive || onResume) && (
        <button type="button"
          onClick={plan.isActive ? onToggleActive : isPaused ? onResume : onToggleActive}
          className="w-full px-4 py-3 text-xs font-semibold flex items-center justify-center gap-1.5 border-t transition-colors hover:opacity-80"
          style={{
            background: plan.isActive ? `${hobbyColor}12` : isPaused ? "#f59e0b12" : "#6b728012",
            color: plan.isActive ? hobbyColor : isPaused ? "#d97706" : "#6b7280",
          }}
        >
          {plan.isActive ? <Zap size={10} /> : isPaused ? <Play size={10} /> : <Power size={10} />}
          {plan.isActive ? "Active — tap to deactivate" : isPaused ? "Paused — tap to resume" : "Inactive — tap to activate"}
        </button>
      )}
    </div>
  );
}

// ── Plan Wizard (2-step) ───────────────────────────────────────────────────────

export function PlanWizard({
  open,
  onClose,
  hobbies,
  defaultHobbyId,
  skipHobbyPicker = false,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  hobbies: Hobby[];
  defaultHobbyId?: number;
  skipHobbyPicker?: boolean;
  onSave: (hobbyId: number, plan: HobbyPlan) => void;
}) {
  const [step, setStep] = useState(1);
  const [selectedHobbyId, setSelectedHobbyId] = useState<number | null>(defaultHobbyId ?? null);
  const [selectedTemplate, setSelectedTemplate] = useState<PlanTemplate | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [durationWeeks, setDurationWeeks] = useState("");
  const [startDate, setStartDate] = useState("");
  const [activateNow, setActivateNow] = useState(true);
  const [scheduleDays, setScheduleDays] = useState<string[]>([]);
  const [steps, setSteps] = useState<GoalStep[]>([]);
  const [stepInput, setStepInput] = useState("");
  const [stepDate, setStepDate] = useState("");
  // Auto-generated schedule metadata (set by specialty wizards like chess ELO)
  const [planDayLabels, setPlanDayLabels] = useState<Record<string, string>>({});
  const [planDayNotes, setPlanDayNotes] = useState<Record<string, string>>({});
  const [planMilestones, setPlanMilestones] = useState<PlanMilestone[]>([]);
  const [planWeeklyPlan, setPlanWeeklyPlan] = useState<WeekPlanEntry[]>([]);
  // Activity-based plan metadata (for computeHobbyPlan scheduling)
  const [planActivities, setPlanActivities] = useState<Activity[]>([]);
  const [planEstimatedHours, setPlanEstimatedHours] = useState<number | undefined>(undefined);
  const [planCommitmentDays, setPlanCommitmentDays] = useState<number | undefined>(undefined);
  const [planMinutesPerSession, setPlanMinutesPerSession] = useState<number | undefined>(undefined);

  // Chess wizard state
  const [chessMode, setChessMode] = useState(false);
  const [chessGoalType, setChessGoalType] = useState<ChessGoalType | "">("");
  // Rating sub-state (reuses ELO calculator)
  const [chessEloMode, setChessEloMode] = useState(false);
  const [currentElo, setCurrentElo] = useState("");
  const [targetElo, setTargetElo] = useState("");
  // Study habit
  const [studyMins, setStudyMins] = useState("30");
  const [studyDays, setStudyDays] = useState("5");
  const [studyFocus, setStudyFocus] = useState("Tactics");
  // Openings
  const [openingColor, setOpeningColor] = useState("White");
  const [openingVsResponse, setOpeningVsResponse] = useState("1...e5");
  const [openingSystem, setOpeningSystem] = useState("");
  // Endgames
  const [endgameTopics, setEndgameTopics] = useState<string[]>(["King and pawn endings"]);
  // Tournament
  const [tournamentType, setTournamentType] = useState("OTB");
  const [tournamentDate, setTournamentDate] = useState("");

  // Poker wizard state
  const [pokerMode, setPokerMode] = useState(false);
  const [currentStake, setCurrentStake] = useState<PokerStake | "">("");
  const [targetStake, setTargetStake] = useState<PokerStake | "">("");
  // Poker goal wizard (non-stakes types)
  const [pokerGoalMode, setPokerGoalMode] = useState(false);
  const [pokerGoalType, setPokerGoalType] = useState<PokerGoalType | "">("");
  const [pkHandsTarget,   setPkHandsTarget]   = useState("50000");
  const [pkPeriod,        setPkPeriod]        = useState("month");
  const [pkStudyHours,    setPkStudyHours]    = useState("5");
  const [pkStudyMethods,  setPkStudyMethods]  = useState<string[]>(["Hand review", "GTO solver"]);
  const [pkWrTarget,      setPkWrTarget]      = useState("8");
  const [pkWrStake,       setPkWrStake]       = useState("NL25");
  const [pkWrHandSample,  setPkWrHandSample]  = useState("100000");
  const [pkStakeFrom,     setPkStakeFrom]     = useState("");
  const [pkStakeTo,       setPkStakeTo]       = useState("");
  const [pkBuyins,        setPkBuyins]        = useState("40");
  const [pkTourneyType,   setPkTourneyType]   = useState("Live MTT");
  const [pkTourneyTarget, setPkTourneyTarget] = useState("");

  // Hiking wizard state
  const [hikingMode, setHikingMode] = useState(false);
  const [hikingGoalType, setHikingGoalType] = useState<HikingGoalType | "">("");
  const [hikeCount,    setHikeCount]    = useState("52");
  const [hikeMiles,    setHikeMiles]    = useState("300");
  const [hikeFeet,     setHikeFeet]     = useState("50000");
  const [peakAltitude, setPeakAltitude] = useState("14000");
  const [peakName,     setPeakName]     = useState("");
  const [trailListName,  setTrailListName]  = useState("");
  const [trailListCount, setTrailListCount] = useState("52");
  const [planTrails, setPlanTrails] = useState<any[]>([]);
  const hikingTrailSearch = useTrailSearch();

  // Bird wizard state
  const [birdMode, setBirdMode] = useState(false);
  const [birdGoalType, setBirdGoalType] = useState<BirdGoalType | "">("");
  const [bwSpeciesTarget, setBwSpeciesTarget] = useState("50");
  const [bwLocalTarget,   setBwLocalTarget]   = useState("150");
  const [bwCounty,        setBwCounty]        = useState("");
  const [bwSkillTarget,   setBwSkillTarget]   = useState("30");
  const [bwSkillFocus,    setBwSkillFocus]    = useState("song and sight");
  const [bwFreqHours,     setBwFreqHours]     = useState("1");
  const [bwLifestyleReason, setBwLifestyleReason] = useState("stress relief");
  const [planBirds, setPlanBirds] = useState<any[]>([]);
  const birdWizardSearch = useBirdSearch();

  // Language wizard state
  const [langMode, setLangMode] = useState(false);
  const [langGoalType, setLangGoalType] = useState<LanguageGoalType | "">("");
  const [llLanguage,    setLlLanguage]    = useState("");
  const [llConvMins,    setLlConvMins]    = useState("10");
  const [llExamName,    setLlExamName]    = useState("");
  const [llExamLevel,   setLlExamLevel]   = useState("B2");
  const [llExamMonths,  setLlExamMonths]  = useState("12");
  const [llStudyMins,   setLlStudyMins]   = useState("30");
  const [llStudyDays,   setLlStudyDays]   = useState("5");
  const [llWordsWeek,   setLlWordsWeek]   = useState("50");
  const [llTravelCountry, setLlTravelCountry] = useState("");

  // Instrument wizard state
  const [instrMode, setInstrMode] = useState(false);
  const [instrGoalType, setInstrGoalType] = useState<InstrumentGoalType | "">("");
  const [instrInstrument,    setInstrInstrument]    = useState("");
  const [instrSong,          setInstrSong]          = useState("");
  const [instrSongCount,     setInstrSongCount]     = useState("7");
  const [instrPracticeMins,  setInstrPracticeMins]  = useState("20");
  const [instrPracticeDays,  setInstrPracticeDays]  = useState("5");
  const [instrScheduleDays, setInstrScheduleDays] = useState<string[]>(["Mon", "Wed", "Fri"]);
  const [instrPerfSong,      setInstrPerfSong]      = useState("");
  const [instrSessions,      setInstrSessions]      = useState("2");

  // Cycling wizard state
  const [cyclingMode, setCyclingMode] = useState(false);
  const [cyclingGoalType, setCyclingGoalType] = useState<CyclingGoalType | "">("");
  const [cyCount,         setCyCount]         = useState("150");
  const [cyMiles,         setCyMiles]         = useState("2000");
  const [cyFeet,          setCyFeet]          = useState("100000");
  const [cyEventName,     setCyEventName]     = useState("");
  const [cyEventDist,     setCyEventDist]     = useState("100");
  const [cyEventDate,     setCyEventDate]     = useState("");
  const [cyListName,      setCyListName]      = useState("");
  const [cyListCount,     setCyListCount]     = useState("20");
  const [planRoutes,      setPlanRoutes]      = useState<any[]>([]);
  const cycleRouteSearch = useCycleRouteSearch();

  // Fishing wizard state
  const [fishingMode, setFishingMode] = useState(false);
  const [fishingGoalType, setFishingGoalType] = useState<FishingGoalType | "">("");
  const [fsTargetSpecies,  setFsTargetSpecies]  = useState("");
  const [fsTargetWeight,   setFsTargetWeight]   = useState("");
  const [fsTargetLength,   setFsTargetLength]   = useState("");
  const [fsHomeLake,       setFsHomeLake]       = useState("");
  const [fsWaterCount,     setFsWaterCount]     = useState("5");
  const [fsWaters,         setFsWaters]         = useState<string[]>(["", "", "", "", ""]);
  const [fsPartner,        setFsPartner]        = useState("");
  const fishWizardSearch = useFishSearch();

  // Gardening wizard state
  const [gardeningMode,     setGardeningMode]     = useState(false);
  const [gardeningGoalType, setGardeningGoalType] = useState<GardeningGoalType | "">("");
  const [gdTargetCrops,     setGdTargetCrops]     = useState("");
  const [gdSeedVarieties,   setGdSeedVarieties]   = useState("10");
  const [gdMinutes,         setGdMinutes]         = useState("15");
  const [gdDays,            setGdDays]            = useState("3");
  const gardenWizardSearch = usePerenualSearch();

  // Rock climbing wizard state
  const [climbingMode,     setClimbingMode]     = useState(false);
  const [climbingGoalType, setClimbingGoalType] = useState<ClimbingGoalType | "">("");
  const [rcTargetGrade,    setRcTargetGrade]    = useState("");
  const [rcClimbStyle,     setRcClimbStyle]     = useState("Sport");
  const [rcWeeklyFreq,     setRcWeeklyFreq]     = useState("2");
  const [rcOutdoorFreq,    setRcOutdoorFreq]    = useState("monthly");
  const [rcPullUpTarget,   setRcPullUpTarget]   = useState("10");
  const [rcHangboard,      setRcHangboard]      = useState(true);
  const [rcLeadRoutes,     setRcLeadRoutes]     = useState("10");
  const climbWizardSearch = useOpenBetaSearch();

  // Running wizard state
  const [runningMode,     setRunningMode]     = useState(false);
  const [runningGoalType, setRunningGoalType] = useState<RunningGoalType | "">("");
  const [rnRunsPerWeek,   setRnRunsPerWeek]   = useState("3");
  const [rnDistanceTarget,setRnDistanceTarget]= useState("");
  const [rnRaceType,      setRnRaceType]      = useState("5K");
  const [rnTargetTime,    setRnTargetTime]    = useState("");
  const [rnCurrentTime,   setRnCurrentTime]   = useState("");
  const [rnFunRunCount,   setRnFunRunCount]   = useState("6");
  const [rnTrailRuns,     setRnTrailRuns]     = useState("3");

  // Surfing wizard state
  const [surfingMode,      setSurfingMode]      = useState(false);
  const [surfingGoalType,  setSurfingGoalType]  = useState<SurfingGoalType | "">("");
  const [sfSessionTarget,  setSfSessionTarget]  = useState("30");
  const [sfCurrentLevel,   setSfCurrentLevel]   = useState("whitewater");
  const [sfPopUpTarget,    setSfPopUpTarget]    = useState("smooth");
  const [sfNewBreak,       setSfNewBreak]       = useState("");
  const [sfSwellTarget,    setSfSwellTarget]    = useState("overhead");

  const selectedHobby = hobbies.find(h => h.id === selectedHobbyId) ?? null;
  const hobbyType = (selectedHobby?.hobbyType as HobbyType) ?? "creative";
  const typeInfo = HOBBY_TYPE_MAP[hobbyType];
  const isHikingHobby  = selectedHobby?.name?.toLowerCase().includes("hiking") ?? false;
  const isChessHobby   = selectedHobby?.name?.toLowerCase().includes("chess")  ?? false;
  const isPokerHobby   = selectedHobby?.name?.toLowerCase().includes("poker")  ?? false;
  const isBirdHobby    = (selectedHobby?.name?.toLowerCase().includes("bird") || selectedHobby?.name?.toLowerCase().includes("birding")) ?? false;
  const isCyclingHobby = (() => { const n = selectedHobby?.name?.toLowerCase() ?? ""; return n.includes("cycling") || n.includes("cycle") || n.includes("bike") || n.includes("biking") || n.includes("mtb") || n.includes("gravel riding"); })();
  const isFishingHobby   = (() => { const n = selectedHobby?.name?.toLowerCase() ?? ""; return n.includes("fishing") || n.includes("angling") || n.includes("fly fishing") || n.includes("bass fishing"); })();
  const isGardeningHobby = (() => { const n = selectedHobby?.name?.toLowerCase() ?? ""; return n.includes("garden") || n.includes("gardening") || n.includes("horticulture"); })();
  const isClimbingHobby  = (() => { const n = selectedHobby?.name?.toLowerCase() ?? ""; return n.includes("climb") || n.includes("climbing") || n.includes("bouldering") || n.includes("crag") || n.includes("sport climbing") || n.includes("trad climbing"); })();
  const isRunningHobby   = (() => { const n = selectedHobby?.name?.toLowerCase() ?? ""; return n === "running" || n.includes("running") || n.includes("marathon") || n.includes("5k") || n.includes("10k") || n.includes("trail run"); })();
  const isSurfingHobby   = (() => { const n = selectedHobby?.name?.toLowerCase() ?? ""; return n === "surfing" || n.includes("surfing") || n.includes("surf") || n.includes("longboard") || n.includes("shortboard"); })();
  const isLangHobby    = isLanguageLearningHobby(selectedHobby);
  // Match any performance hobby (Playing an Instrument, Guitar, Piano, Singing, etc.)
  const isInstrHobby   = hobbyType === "performance";
  const perfName = selectedHobby?.name?.toLowerCase() ?? "";
  const isSingingHobby = perfName.includes("sing") || perfName.includes("vocal") || perfName.includes("choir") || perfName.includes("voice");
  const isActingHobby  = perfName.includes("acting") || perfName.includes("theatre") || perfName.includes("theater") || perfName.includes("drama") || perfName.includes("improv");
  const isComedyHobby  = perfName.includes("comedy") || perfName.includes("stand-up") || perfName.includes("standup") || perfName.includes("stand up");
  const isDancingHobby = perfName.includes("danc") || perfName.includes("ballet") || perfName.includes("salsa") || perfName.includes("hip hop") || perfName.includes("breakdance") || perfName.includes("ballroom");
  const isInstrumentHobby = isInstrHobby && !isSingingHobby && !isActingHobby && !isComedyHobby && !isDancingHobby;
  const templates = isHikingHobby    ? HIKING_PLAN_TEMPLATES
                  : isCyclingHobby   ? CYCLING_PLAN_TEMPLATES
                  : isFishingHobby   ? FISHING_PLAN_TEMPLATES
                  : isGardeningHobby  ? GARDENING_PLAN_TEMPLATES
                  : isClimbingHobby  ? CLIMBING_PLAN_TEMPLATES
                  : isRunningHobby   ? RUNNING_PLAN_TEMPLATES
                  : isSurfingHobby   ? SURFING_PLAN_TEMPLATES
                  : isChessHobby     ? CHESS_PLAN_TEMPLATES
                  : isPokerHobby   ? POKER_PLAN_TEMPLATES
                  : isBirdHobby    ? BIRD_PLAN_TEMPLATES
                  : isLangHobby    ? LANGUAGE_PLAN_TEMPLATES
                  : isSingingHobby ? SINGING_PLAN_TEMPLATES
                  : isActingHobby  ? ACTING_PLAN_TEMPLATES
                  : isComedyHobby  ? COMEDY_PLAN_TEMPLATES
                  : isDancingHobby ? DANCING_PLAN_TEMPLATES
                  : isInstrHobby   ? INSTRUMENT_PLAN_TEMPLATES
                  : (PLAN_TEMPLATES[hobbyType] ?? []);

  // Chess ELO preview
  const eloGap = Math.max(0, Number(targetElo) - Number(currentElo));
  const eloDuration = eloGap > 0 ? calcChessDuration(eloGap) : null;

  // Poker preview
  const pokerJumps = (currentStake && targetStake)
    ? Math.max(0, POKER_STAKES.indexOf(targetStake as PokerStake) - POKER_STAKES.indexOf(currentStake as PokerStake))
    : 0;
  const pokerDuration = pokerJumps > 0 ? calcPokerDuration(pokerJumps) : null;

  function reset() {
    setStep(1); setSelectedHobbyId(defaultHobbyId ?? null); setSelectedTemplate(null);
    setTitle(""); setDescription(""); setDurationWeeks(""); setStartDate("");
    setActivateNow(true); setScheduleDays([]); setSteps([]); setStepInput(""); setStepDate("");
    setPlanDayLabels({}); setPlanDayNotes({}); setPlanMilestones([]); setPlanWeeklyPlan([]);
    setPlanActivities([]); setPlanEstimatedHours(undefined); setPlanCommitmentDays(undefined); setPlanMinutesPerSession(undefined);
    setChessMode(false); setChessGoalType(""); setChessEloMode(false); setCurrentElo(""); setTargetElo("");
    setStudyMins("30"); setStudyDays("5"); setStudyFocus("Tactics");
    setOpeningColor("White"); setOpeningVsResponse("1...e5"); setOpeningSystem("");
    setEndgameTopics(["King and pawn endings"]); setTournamentType("OTB"); setTournamentDate("");
    setPokerMode(false); setCurrentStake(""); setTargetStake("");
    setPokerGoalMode(false); setPokerGoalType(""); setPkHandsTarget("50000"); setPkPeriod("month");
    setPkStudyHours("5"); setPkStudyMethods(["Hand review", "GTO solver"]);
    setPkWrTarget("8"); setPkWrStake("NL25"); setPkWrHandSample("100000");
    setPkStakeFrom(""); setPkStakeTo(""); setPkBuyins("40");
    setPkTourneyType("Live MTT"); setPkTourneyTarget("");
    setHikingMode(false); setHikingGoalType(""); setHikeCount("52"); setHikeMiles("300");
    setHikeFeet("50000"); setPeakAltitude("14000"); setPeakName(""); setTrailListName("");
    setTrailListCount("52"); setPlanTrails([]);
    setBirdMode(false); setBirdGoalType(""); setBwSpeciesTarget("50"); setBwLocalTarget("150");
    setBwCounty(""); setBwSkillTarget("30"); setBwSkillFocus("song and sight");
    setBwFreqHours("1"); setBwLifestyleReason("stress relief"); setPlanBirds([]);
    setLangMode(false); setLangGoalType(""); setLlLanguage(""); setLlConvMins("10");
    setLlExamName(""); setLlExamLevel("B2"); setLlExamMonths("12");
    setLlStudyMins("30"); setLlStudyDays("5"); setLlWordsWeek("50"); setLlTravelCountry("");
    setInstrMode(false); setInstrGoalType(""); setInstrInstrument(""); setInstrSong(""); setInstrScheduleDays(["Mon", "Wed", "Fri"]);
    setInstrSongCount("7"); setInstrPracticeMins("20"); setInstrPracticeDays("5");
    setInstrPerfSong(""); setInstrSessions("2");
    setCyclingMode(false); setCyclingGoalType(""); setCyCount("150"); setCyMiles("2000");
    setCyFeet("100000"); setCyEventName(""); setCyEventDist("100"); setCyEventDate("");
    setCyListName(""); setCyListCount("20"); setPlanRoutes([]);
    setFishingMode(false); setFishingGoalType(""); setFsTargetSpecies(""); setFsTargetWeight("");
    setFsTargetLength(""); setFsHomeLake(""); setFsWaterCount("5");
    setFsWaters(["", "", "", "", ""]); setFsPartner("");
    setGardeningMode(false); setGardeningGoalType(""); setGdTargetCrops(""); setGdSeedVarieties("10");
    setGdMinutes("15"); setGdDays("3");
    setClimbingMode(false); setClimbingGoalType(""); setRcTargetGrade(""); setRcClimbStyle("Sport");
    setRcWeeklyFreq("2"); setRcOutdoorFreq("monthly"); setRcPullUpTarget("10"); setRcHangboard(true); setRcLeadRoutes("10");
    setRunningMode(false); setRunningGoalType(""); setRnRunsPerWeek("3"); setRnDistanceTarget("");
    setRnRaceType("5K"); setRnTargetTime(""); setRnCurrentTime(""); setRnFunRunCount("6"); setRnTrailRuns("3");
    setSurfingMode(false); setSurfingGoalType(""); setSfSessionTarget("30"); setSfCurrentLevel("whitewater");
    setSfPopUpTarget("smooth"); setSfNewBreak(""); setSfSwellTarget("overhead");
  }
  function handleClose() { reset(); onClose(); }

  // Sync defaultHobbyId into selectedHobbyId when wizard opens
  useEffect(() => {
    if (open && defaultHobbyId != null) {
      setSelectedHobbyId(defaultHobbyId);
    }
  }, [open, defaultHobbyId]);

  function pickTemplate(t: PlanTemplate) {
    const hobbyName = selectedHobby?.name?.toLowerCase() ?? "";
    const isPokerRating = t.id === "gp3" && hobbyName.includes("poker");
    const chessType  = CHESS_GOAL_TYPE_MAP[t.id];
    const hikingType = HIKING_GOAL_TYPE_MAP[t.id];
    setSelectedTemplate(t);
    if (isPokerRating) { setPokerMode(true); return; }
    const pkType = POKER_GOAL_TYPE_MAP[t.id];
    if (pkType) {
      if (pkType === "stakes") { setPokerMode(true); return; } // reuse existing stakes wizard
      setPokerGoalMode(true); setPokerGoalType(pkType); return;
    }
    if (chessType) {
      setChessMode(true); setChessGoalType(chessType);
      if (chessType === "rating") setChessEloMode(true);
      return;
    }
    if (hikingType) { setHikingMode(true); setHikingGoalType(hikingType); return; }
    const birdType = BIRD_GOAL_TYPE_MAP[t.id];
    if (birdType) { setBirdMode(true); setBirdGoalType(birdType); return; }
    const langType = LANGUAGE_GOAL_TYPE_MAP[t.id];
    if (langType) { setLangMode(true); setLangGoalType(langType); return; }
    const instrType = INSTRUMENT_GOAL_TYPE_MAP[t.id];
    if (instrType) { setInstrMode(true); setInstrGoalType(instrType); return; }
    const cyclingType = CYCLING_GOAL_TYPE_MAP[t.id];
    if (cyclingType) { setCyclingMode(true); setCyclingGoalType(cyclingType); return; }
    const fishingType = FISHING_GOAL_TYPE_MAP[t.id];
    if (fishingType) { setFishingMode(true); setFishingGoalType(fishingType); return; }
    const gardeningType = GARDENING_GOAL_TYPE_MAP[t.id];
    if (gardeningType) { setGardeningMode(true); setGardeningGoalType(gardeningType); return; }
    const climbingType = CLIMBING_GOAL_TYPE_MAP[t.id];
    if (climbingType) { setClimbingMode(true); setClimbingGoalType(climbingType); return; }
    const runningType = RUNNING_GOAL_TYPE_MAP[t.id];
    if (runningType) { setRunningMode(true); setRunningGoalType(runningType); return; }
    const surfingType = SURFING_GOAL_TYPE_MAP[t.id];
    if (surfingType) { setSurfingMode(true); setSurfingGoalType(surfingType); return; }
    setTitle(t.label);
    setDurationWeeks(t.durationWeeks ? String(t.durationWeeks) : "");
    setSteps(t.defaultSteps.map(text => ({ id: genId(), text, done: false })));
    setStep(2);
  }

  function applyChessSettings() {
    if (!chessGoalType || chessGoalType === "rating") return;
    const generatedSteps = generateChessGoalSteps(chessGoalType, {
      studyMins, studyDays, studyFocus,
      openingColor, vsResponse: openingVsResponse, openingSystem,
      endgameTopics, tournamentType, tournamentDate,
    });
    let planTitle = "", desc = "", weeks = 8;
    switch (chessGoalType) {
      case "study":      planTitle = `${studyMins} min ${studyFocus} daily, ${studyDays}×/week`;        desc = `Build a consistent ${studyFocus.toLowerCase()} study habit over ${weeks} weeks.`; break;
      case "openings":   planTitle = `${openingColor} opening vs ${openingVsResponse}${openingSystem ? ` — ${openingSystem}` : ""}`;  desc = `Learn a solid ${openingColor} system vs ${openingVsResponse}.`; weeks = 6; break;
      case "endgames":   planTitle = `Endgame mastery: ${endgameTopics.join(", ")}`;                     desc = `Master ${endgameTopics.join(" and ")} positions.`; weeks = 4; break;
      case "tournament": planTitle = `${tournamentType} tournament prep${tournamentDate ? ` — ${tournamentDate}` : ""}`;  desc = `Prepare for and compete in a ${tournamentType} event.`; break;
    }
    setTitle(planTitle); setDescription(desc); setDurationWeeks(String(weeks));
    setSteps(generatedSteps);
    // Opening repertoire — wire up the 4-week weekly plan and milestones
    if (chessGoalType === "openings") {
      setScheduleDays(["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]);
      setPlanWeeklyPlan(CHESS_OPENING_WEEKLY_PLAN);
      setPlanMilestones([
        { id: genId(), title: "Week 1 — White vs 1...e5 repertoire mapped", order: 1 },
        { id: genId(), title: "Week 2 — White vs all Black responses covered", order: 2 },
        { id: genId(), title: "Week 3 — Black vs 1.e4 repertoire built", order: 3 },
        { id: genId(), title: "Week 4 — Full repertoire ready to play", order: 4 },
      ]);
    }
    applyHobbyActivities("chess", 8, 5, 45);
    setChessMode(false); setChessGoalType(""); setStep(2);
  }

  // ── Per-category default activities for activity-based scheduling ─────────────
  const HOBBY_ACTIVITIES_MAP: Record<string, Activity[]> = {
    hiking: [
      { id: "trail-day", name: "Trail Day", weight: 8, description: "Hit the trail! Focus on pacing, foot placement, and enjoying the scenery." },
      { id: "fitness", name: "Fitness Training", weight: 6, description: "Running, stair climbing, or strength work to build hiking fitness." },
      { id: "gear-nav", name: "Gear & Navigation", weight: 4, description: "Review gear, study maps, plan upcoming routes." },
    ],
    cycling: [
      { id: "base-ride", name: "Base Ride", weight: 7, description: "Aerobic zone-2 ride to build endurance. Comfortable pace, hold form." },
      { id: "interval", name: "Interval / Tempo", weight: 6, description: "Threshold or VO2 intervals to build power and speed." },
      { id: "strength", name: "Strength & Recovery", weight: 4, description: "Core and leg strength work, followed by gentle recovery stretching." },
      { id: "route-plan", name: "Route Planning", weight: 3, description: "Plan new routes, track milage, review performance data." },
    ],
    running: [
      { id: "easy-run", name: "Easy Run", weight: 7, description: "Conversational-pace run. Build aerobic base and enjoy the run." },
      { id: "workout", name: "Speed / Tempo Workout", weight: 6, description: "Intervals, tempo run, or fartlek to build speed and lactate threshold." },
      { id: "long-run", name: "Long Run", weight: 5, description: "Weekly long run — time on feet, building endurance gradually." },
    ],
    fishing: [
      { id: "fishing-trip", name: "Fishing Session", weight: 8, description: "Hit the water. Focus on technique, reading conditions, and patience." },
      { id: "skills", name: "Skills Practice", weight: 5, description: "Practice casting, knot tying, or lure rigging at home or on the water." },
      { id: "research", name: "Research & Scouting", weight: 4, description: "Study maps, conditions, species behavior, and new spots to fish." },
    ],
    gardening: [
      { id: "tending", name: "Garden Tending", weight: 8, description: "Water, weed, deadhead, and observe what's growing. Daily mindful care." },
      { id: "planting", name: "Planting & Propagation", weight: 6, description: "Seed starting, transplanting, or cuttings — growing new plants." },
      { id: "design", name: "Design & Research", weight: 4, description: "Plan new beds, research plants, review what's working and what isn't." },
    ],
    climbing: [
      { id: "climbing-session", name: "Climbing Session", weight: 8, description: "Climb! Focus on technique, footwork, and reading the route." },
      { id: "strength-training", name: "Strength Training", weight: 6, description: "Pull-ups, hangboard, core work to build climbing-specific strength." },
      { id: "technique-study", name: "Technique Study", weight: 4, description: "Watch climbing videos, practice movement drills, work beta on problem areas." },
    ],
    surfing: [
      { id: "surf-session", name: "Surf Session", weight: 9, description: "Get in the water. Focus on wave selection, pop-up timing, and flow." },
      { id: "fitness-cross", name: "Cross-Training", weight: 5, description: "Swimming, yoga, or core work to build surf fitness and balance." },
      { id: "ocean-study", name: "Ocean Study", weight: 3, description: "Study wave patterns, tides, and forecasts to surf smarter." },
    ],
    birding: [
      { id: "field-trip", name: "Birding Field Trip", weight: 8, description: "Get outside! Focus on habitat, behavior, and careful observation." },
      { id: "id-study", name: "ID Study", weight: 6, description: "Review field guides, eBird, or Merlin to sharpen identification skills." },
      { id: "list-mgmt", name: "List & Log", weight: 3, description: "Update life list, eBird checklists, and note rare or interesting sightings." },
    ],
    language: [
      { id: "speaking", name: "Speaking Practice", weight: 8, description: "Conversation practice — italki session, language exchange, or shadowing." },
      { id: "vocabulary", name: "Vocabulary", weight: 7, description: "Anki flashcards or Duolingo. Target 20–50 new words per session." },
      { id: "listening", name: "Listening / Input", weight: 6, description: "Podcast, Netflix, or YouTube in target language. Aim for comprehensible input." },
      { id: "grammar", name: "Grammar Study", weight: 4, description: "Work through grammar rules with exercises to solidify structure." },
    ],
    instrument: [
      { id: "technique", name: "Technique & Scales", weight: 7, description: "Warm-up with scales, arpeggios, or technical exercises. Build muscle memory." },
      { id: "repertoire", name: "Repertoire Practice", weight: 8, description: "Work through your current piece or song — section by section." },
      { id: "ear-training", name: "Ear Training", weight: 4, description: "Interval recognition, chord ID, or sight-reading practice." },
      { id: "performance", name: "Performance / Play-through", weight: 4, description: "Play the full piece from memory. Record yourself occasionally to hear progress." },
    ],
    poker: [
      { id: "play-sessions", name: "Play Sessions", weight: 7, description: "Focused play with deliberate decision-making. Avoid autopilot — mark hands for review." },
      { id: "hand-review", name: "Hand Review", weight: 8, description: "Review marked hands with a solver or study group. Extract one principle per session." },
      { id: "theory", name: "Theory Study", weight: 5, description: "GTO concepts, ranges, bet sizing — one topic per session to go deep." },
    ],
    chess: [
      { id: "tactics", name: "Tactics & Puzzles", weight: 8, description: "Pattern recognition drills — puzzle rush, mate-in-2 combos, and calculation sets." },
      { id: "rated-play", name: "Rated Games", weight: 7, description: "Play 1–2 rated games at 15+10 or longer. Take 30 seconds before each candidate move." },
      { id: "game-review", name: "Game Review", weight: 6, description: "Analyze your last rated game. Note one critical mistake and the principle behind it." },
      { id: "endgames", name: "Endgames", weight: 5, description: "King+pawn, rook endgames, opposition drills. Lichess endgame trainer or Silman." },
      { id: "openings", name: "Openings", weight: 4, description: "Study one repertoire line. Focus on ideas and pawn structures, not memorization." },
    ],
  };

  function applyHobbyActivities(category: string, durationWeeks: number, daysPerWeek = 3, minsPerSession = 45) {
    const acts = HOBBY_ACTIVITIES_MAP[category] ?? [];
    if (acts.length === 0) return;
    // rough estimate: daysPerWeek × minsPerSession × weeks / 60
    const estimatedHours = Math.round(daysPerWeek * minsPerSession * durationWeeks / 60);
    setPlanActivities(acts);
    setPlanEstimatedHours(estimatedHours);
    setPlanCommitmentDays(daysPerWeek);
    setPlanMinutesPerSession(minsPerSession);
  }

  function applyHikingSettings() {
    if (!hikingGoalType) return;
    const generatedSteps = generateHikingSteps(hikingGoalType, {
      count: hikeCount, miles: hikeMiles, feet: hikeFeet,
      altitude: peakAltitude, peakName, listName: trailListName,
      listCount: trailListCount, planTrails,
    });
    let title = "";
    let desc  = "";
    let weeks = 52;
    switch (hikingGoalType) {
      case "frequency": title = `${hikeCount} Hikes This Year`;                   desc = `Complete ${hikeCount} hikes over the year — roughly ${(Number(hikeCount)/52).toFixed(1)} per week.`; break;
      case "distance":  title = `Hike ${hikeMiles} Miles This Year`;               desc = `Cover ${hikeMiles} miles on trail over the year — about ${Math.round(Number(hikeMiles)/52)} miles per week.`; break;
      case "elevation": title = `${Number(hikeFeet).toLocaleString()} Feet of Gain This Year`; desc = `Accumulate ${Number(hikeFeet).toLocaleString()} feet of elevation gain on trail.`; break;
      case "peak":      title = peakName ? `Summit ${peakName}` : `First ${Number(peakAltitude).toLocaleString()}ft Summit`; desc = `Train and summit ${peakName || `a ${Number(peakAltitude).toLocaleString()}-foot peak`}.`; weeks = 16; break;
      case "trails":    title = trailListName ? `Complete: ${trailListName}` : `Trail List (${trailListCount} trails)`; desc = `Work through the "${trailListName || "trail list"}" — ${planTrails.length > 0 ? planTrails.length : trailListCount} trails to complete.`; break;
    }
    setTitle(title); setDescription(desc); setDurationWeeks(String(weeks));
    setSteps(generatedSteps); applyHobbyActivities("hiking", weeks, 2, 120); setHikingMode(false); setStep(2);
  }

  function applyCyclingSettings() {
    if (!cyclingGoalType) return;
    const generatedSteps = generateCyclingSteps(cyclingGoalType, {
      count: cyCount, miles: cyMiles, feet: cyFeet,
      eventName: cyEventName, eventDistance: cyEventDist, eventDate: cyEventDate,
      listName: cyListName, listCount: cyListCount, planRoutes,
    });
    let title = "", desc = "", weeks = 52;
    switch (cyclingGoalType) {
      case "frequency": title = `${cyCount} Rides This Year`;                          desc = `Complete ${cyCount} rides over the year — roughly ${(Number(cyCount)/52).toFixed(1)} per week.`; break;
      case "distance":  title = `Ride ${Number(cyMiles).toLocaleString()} Miles This Year`; desc = `Cover ${Number(cyMiles).toLocaleString()} miles on the bike over the year.`; break;
      case "elevation": title = `${Number(cyFeet).toLocaleString()} Feet of Climbing This Year`; desc = `Accumulate ${Number(cyFeet).toLocaleString()} ft of elevation gain on the bike.`; break;
      case "event":     title = cyEventName ? `Complete: ${cyEventName}` : `${cyEventDist}-Mile Event`; desc = `Train for and complete ${cyEventName || "the event"}${cyEventDate ? ` on ${cyEventDate}` : ""}.`; weeks = 16; break;
      case "routes":    title = cyListName ? `Complete: ${cyListName}` : `Route List (${cyListCount} routes)`; desc = `Work through the "${cyListName || "route list"}" — ${planRoutes.length > 0 ? planRoutes.length : cyListCount} routes to complete.`; break;
    }
    setTitle(title); setDescription(desc); setDurationWeeks(String(weeks));
    setSteps(generatedSteps); applyHobbyActivities("cycling", weeks, 3, 60); setCyclingMode(false); setStep(2);
  }

  function applyFishingSettings() {
    if (!fishingGoalType) return;
    const specificWaters = fsWaters.filter(Boolean);
    const generatedSteps = generateFishingSteps(fishingGoalType, {
      targetSpecies: fsTargetSpecies, targetWeight: fsTargetWeight, targetLength: fsTargetLength,
      homeLake: fsHomeLake, waterCount: fsWaterCount, specificWaters,
      outingPartner: fsPartner,
    });
    let title = "", desc = "", weeks = 52;
    switch (fishingGoalType) {
      case "catch":
        title = fsTargetSpecies
          ? `Land a Personal-Best ${fsTargetSpecies}${fsTargetWeight ? ` (${fsTargetWeight} lbs)` : ""}`
          : "Land a Personal-Best Catch";
        desc = `Work toward catching${fsTargetSpecies ? ` a ${fsTargetSpecies}` : ""} at personal-best size.`;
        weeks = 26;
        break;
      case "skill":
        title = fsHomeLake ? `Master Seasonal Patterns on ${fsHomeLake}` : "Master Seasonal Fishing Patterns";
        desc = `Learn to find fish in every season on${fsHomeLake ? ` ${fsHomeLake}` : " your home water"}.`;
        break;
      case "exploration":
        title = `Fish ${fsWaterCount} New Waters This Year`;
        desc = `Explore ${fsWaterCount} lakes or rivers you've never fished before.`;
        break;
      case "social":
        title = `Monthly Fishing Outings${fsPartner ? ` with ${fsPartner}` : ""}`;
        desc = `One relaxed fishing trip per month${fsPartner ? ` with ${fsPartner}` : " with friends or family"}, all year long.`;
        break;
    }
    setTitle(title); setDescription(desc); setDurationWeeks(String(weeks));
    setSteps(generatedSteps); applyHobbyActivities("fishing", weeks, 2, 120); setFishingMode(false); setStep(2);
  }

  function applyGardeningSettings() {
    if (!gardeningGoalType) return;
    const generatedSteps = generateGardeningSteps(gardeningGoalType, {
      targetCrops: gdTargetCrops, seedVarieties: gdSeedVarieties,
      gardenMinutes: gdMinutes, gardenDays: gdDays,
    });
    let title = "", desc = "", weeks = 52;
    switch (gardeningGoalType) {
      case "harvest":
        title = gdTargetCrops ? `Grow & Harvest ${gdTargetCrops}` : "Food Garden: Fresh Harvest All Summer";
        desc = `Grow${gdTargetCrops ? ` ${gdTargetCrops}` : " vegetables and herbs"} for fresh use all season long.`;
        weeks = 26; break;
      case "aesthetics":
        title = "Four-Season Flower Garden";
        desc = "Design and plant a bed with continuous blooms from early spring through fall.";
        weeks = 52; break;
      case "skills":
        title = `Start ${gdSeedVarieties} Varieties from Seed`;
        desc = `Learn to germinate and transplant ${gdSeedVarieties} plant varieties successfully.`;
        weeks = 26; break;
      case "relaxation":
        title = `Garden ${gdDays}× a Week for Mindful Tending`;
        desc = `Spend ${gdMinutes} minutes in the garden ${gdDays} days a week — tending, observing, and relaxing.`;
        weeks = 52; break;
    }
    setTitle(title); setDescription(desc); setDurationWeeks(String(weeks));
    setSteps(generatedSteps); applyHobbyActivities("gardening", weeks, 3, 20); setGardeningMode(false); setStep(2);
  }

  function applyClimbingSettings() {
    if (!climbingGoalType) return;
    const generatedSteps = generateClimbingSteps(climbingGoalType, {
      targetGrade: rcTargetGrade, climbStyle: rcClimbStyle,
      weeklyFreq: rcWeeklyFreq, outdoorFreq: rcOutdoorFreq,
      pullUpTarget: rcPullUpTarget, hangboard: rcHangboard,
      leadRoutes: rcLeadRoutes,
    });
    let title = "", desc = "", weeks = 26;
    switch (climbingGoalType) {
      case "grade":
        title = rcTargetGrade ? `Send ${rcTargetGrade} ${rcClimbStyle}` : "Reach Your Next Grade";
        desc = `Work systematically toward${rcTargetGrade ? ` ${rcTargetGrade} ${rcClimbStyle.toLowerCase()}` : " your goal grade"}.`;
        weeks = 26; break;
      case "volume":
        title = `Climb ${rcWeeklyFreq}×/Week + ${rcOutdoorFreq === "monthly" ? "Monthly" : rcOutdoorFreq} Outdoor Days`;
        desc = `Build a consistent climbing habit with regular outdoor sessions on real rock.`;
        weeks = 52; break;
      case "strength":
        title = `${rcPullUpTarget} Pull-Ups${rcHangboard ? " + Hangboard Cycle" : ""}`;
        desc = `Structured strength training to reach ${rcPullUpTarget} strict pull-ups${rcHangboard ? " and complete a full hangboard protocol" : ""}.`;
        weeks = 16; break;
      case "safety":
        title = `Lead ${rcLeadRoutes} New Routes with Confidence`;
        desc = `Develop calm, competent lead climbing technique across ${rcLeadRoutes} new routes.`;
        weeks = 26; break;
    }
    setTitle(title); setDescription(desc); setDurationWeeks(String(weeks));
    setSteps(generatedSteps); applyHobbyActivities("climbing", weeks, 3, 90); setClimbingMode(false); setStep(2);
  }

  function applyRunningSettings() {
    if (!runningGoalType) return;
    const generatedSteps = generateRunningSteps(runningGoalType, {
      runsPerWeek: rnRunsPerWeek, distanceTarget: rnDistanceTarget,
      raceType: rnRaceType, targetTime: rnTargetTime, currentTime: rnCurrentTime,
      funRunCount: rnFunRunCount, trailRuns: rnTrailRuns,
    });
    let title = "", desc = "", weeks = 26;
    switch (runningGoalType) {
      case "consistency":
        title = `Run ${rnRunsPerWeek}×/Week All Year`;
        desc = `Build a lasting running habit — ${rnRunsPerWeek} runs per week, every week.`;
        weeks = 52; break;
      case "distance":
        title = rnRaceType ? `Complete a ${rnRaceType}` : "Hit Your Distance Milestone";
        desc = `Train consistently to complete ${rnRaceType || "your target distance"}.`;
        weeks = rnRaceType.toLowerCase().includes("marathon") && !rnRaceType.toLowerCase().includes("half") ? 18 : rnRaceType.toLowerCase().includes("half") ? 12 : 8;
        break;
      case "time":
        title = rnTargetTime ? `${rnRaceType} in ${rnTargetTime}` : `${rnRaceType} Time Goal`;
        desc = `${rnCurrentTime ? `Improve from ${rnCurrentTime} to ${rnTargetTime}` : `Hit ${rnTargetTime || "your target time"}`} in the ${rnRaceType}.`;
        weeks = 16; break;
      case "enjoyment":
        title = `${rnFunRunCount} Fun Runs + ${rnTrailRuns} Trail Runs`;
        desc = `Run for joy — explore trails, join parkruns, and make running social.`;
        weeks = 52; break;
    }
    setTitle(title); setDescription(desc); setDurationWeeks(String(weeks));
    setSteps(generatedSteps); applyHobbyActivities("running", weeks, 3, 40); setRunningMode(false); setStep(2);
  }

  function applySurfingSettings() {
    if (!surfingGoalType) return;
    const generatedSteps = generateSurfingSteps(surfingGoalType, {
      sessionTarget: sfSessionTarget, currentLevel: sfCurrentLevel,
      popUpTarget: sfPopUpTarget, newBreakTarget: sfNewBreak, swellTarget: sfSwellTarget,
    });
    let title = "", desc = "", weeks = 16;
    switch (surfingGoalType) {
      case "consistency":
        title = `Log ${sfSessionTarget} Surf Sessions`;
        desc = `Build a regular surf habit — hit ${sfSessionTarget} sessions in the water.`;
        weeks = 16; break;
      case "skill":
        title = "Catch Clean Green Waves Down the Line";
        desc = `Progress from ${sfCurrentLevel} to consistently riding unbroken waves.`;
        weeks = 26; break;
      case "technique":
        title = "Dial In Pop-Up & Paddle Strength";
        desc = `Build the physical foundation — smooth pop-up and strong paddling every session.`;
        weeks = 12; break;
      case "exploration":
        title = `New Break${sfNewBreak ? ` — ${sfNewBreak}` : ""} + Bigger Swell`;
        desc = `Push your comfort zone: surf somewhere new and paddle out in a ${sfSwellTarget} swell.`;
        weeks = 26; break;
    }
    setTitle(title); setDescription(desc); setDurationWeeks(String(weeks));
    setSteps(generatedSteps); applyHobbyActivities("surfing", weeks, 3, 90); setSurfingMode(false); setStep(2);
  }

  function applyEloSettings() {
    if (!eloDuration) return;
    const cur = Number(currentElo);
    const tgt = Number(targetElo);
    const generatedSteps = generateChessEloSteps(cur, tgt, eloDuration.months);
    setTitle(`Chess: ${cur} → ${tgt} ELO (${eloDuration.months}-month plan)`);
    setDescription(`Structured improvement plan to gain ${eloGap} ELO rating points over ${eloDuration.months} months.`);
    setDurationWeeks(String(eloDuration.weeks));
    setSteps(generatedSteps);

    // ── Auto-populate weekly schedule from CSV data ──
    const band = getChessWeeklyBand(cur);
    setScheduleDays(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    setPlanDayLabels(Object.fromEntries(
      Object.entries(band.days).map(([day, d]) => [day, d.dayLabel])
    ));
    setPlanDayNotes(Object.fromEntries(
      Object.entries(band.days).map(([day, d]) => [day, d.taskDetail])
    ));

    // ── Auto-generate ELO milestone checkpoints ──
    const gap = tgt - cur;
    const numMilestones = Math.min(Math.max(Math.floor(gap / 100), 1), 8);
    const step = Math.round(gap / numMilestones / 50) * 50 || 100;
    const autoMilestones: PlanMilestone[] = [];
    for (let i = 1; i <= numMilestones; i++) {
      const rating = Math.min(Math.round(cur + step * i), tgt);
      autoMilestones.push({ id: genId(), title: `Reach ${rating} ELO`, order: i });
      if (rating >= tgt) break;
    }
    if (autoMilestones.length === 0 || autoMilestones[autoMilestones.length - 1].title !== `Reach ${tgt} ELO`) {
      autoMilestones.push({ id: genId(), title: `Reach ${tgt} ELO`, order: autoMilestones.length + 1 });
    }
    setPlanMilestones(autoMilestones);

    // ── Activity-based scheduling (computeHobbyPlan) ──
    setPlanActivities([
      { id: "tactics", name: "Tactics & Puzzles", weight: 8, description: "Pattern recognition drills — puzzle rush, mate-in-2 combos, and calculation sets." },
      { id: "rated-play", name: "Rated Games", weight: 7, description: "Play 1–2 rated games at 15+10 or longer. Take 30 seconds before each candidate move." },
      { id: "game-review", name: "Game Review", weight: 6, description: "Analyze your last rated game. Note one critical mistake and the principle behind it." },
      { id: "endgames", name: "Endgames", weight: 5, description: "King+pawn, rook endgames, opposition drills. Lichess endgame trainer or Silman." },
      { id: "openings", name: "Openings", weight: 4, description: "Study one repertoire line. Focus on ideas and pawn structures, not memorization past move 10." },
    ]);
    // Estimate total hours from ELO gap (approx 1 hr/point above 1000, 0.5 hr/point below)
    const hoursEst = Math.round(Math.max(20, gap * (cur >= 1000 ? 1 : 0.5)));
    setPlanEstimatedHours(hoursEst);
    setPlanCommitmentDays(5);
    setPlanMinutesPerSession(45);

    setChessEloMode(false); setChessMode(false); setChessGoalType("");
    setStep(2);
  }

  function applyPokerSettings() {
    if (!pokerDuration || !currentStake || !targetStake) return;
    const generatedSteps = generatePokerSteps(currentStake as PokerStake, targetStake as PokerStake, pokerDuration.months);
    setTitle(`Poker: ${currentStake} → ${targetStake} (${pokerDuration.months}-month plan)`);
    setDescription(`Structured improvement plan to move from ${currentStake} to ${targetStake} over ${pokerDuration.months} months (${pokerJumps} stake level${pokerJumps !== 1 ? "s" : ""}).`);
    setDurationWeeks(String(pokerDuration.weeks));
    setSteps(generatedSteps);
    applyHobbyActivities("poker", pokerDuration.weeks, 4, 60);
    setPokerMode(false);
    setStep(2);
  }

  function applyPokerGoalSettings() {
    if (!pokerGoalType) return;
    const generatedSteps = generatePokerGoalSteps(pokerGoalType, {
      handsTarget: pkHandsTarget, period: pkPeriod,
      studyHours: pkStudyHours, studyMethods: pkStudyMethods,
      wrTarget: pkWrTarget, wrStake: pkWrStake, wrHandSample: pkWrHandSample,
      stakeFrom: pkStakeFrom, stakeTo: pkStakeTo, buyins: pkBuyins,
      tourneyType: pkTourneyType, tourneyTarget: pkTourneyTarget,
    });
    let planTitle = "", desc = "", weeks = 12;
    switch (pokerGoalType) {
      case "volume":     planTitle = `${Number(pkHandsTarget).toLocaleString()} hands per ${pkPeriod}`; desc = `Build volume to ${Number(pkHandsTarget).toLocaleString()} hands per ${pkPeriod}.`; break;
      case "study":      planTitle = `${pkStudyHours} hrs/week study routine`; desc = `Structured study: ${pkStudyMethods.join(", ")} each week.`; weeks = 8; break;
      case "winrate":    planTitle = `${pkWrTarget} bb/100 at ${pkWrStake} over ${Number(pkWrHandSample).toLocaleString()} hands`; desc = `Achieve ${pkWrTarget} bb/100 win rate at ${pkWrStake}.`; weeks = 16; break;
      case "tournament": planTitle = pkTourneyTarget || `${pkTourneyType} result goal`; desc = `Prepare for and achieve: ${pkTourneyTarget || "major tournament result"}.`; weeks = 16; break;
    }
    setTitle(planTitle); setDescription(desc); setDurationWeeks(String(weeks));
    setSteps(generatedSteps); applyHobbyActivities("poker", weeks, 4, 60); setPokerGoalMode(false); setPokerGoalType(""); setStep(2);
  }

  function applyBirdSettings() {
    if (!birdGoalType) return;
    const generatedSteps = generateBirdSteps(birdGoalType, {
      speciesTarget: bwSpeciesTarget, county: bwCounty,
      localTarget: bwLocalTarget,
      skillTarget: bwSkillTarget, skillFocus: bwSkillFocus,
      freqHours: bwFreqHours, lifestyleReason: bwLifestyleReason,
      planBirds,
    });
    let planTitle = "", desc = "", weeks = 52;
    switch (birdGoalType) {
      case "species":   planTitle = planBirds.length > 0 ? `Target ${planBirds.length} species` : `Add ${bwSpeciesTarget} species to life list`; desc = `Work toward ${planBirds.length > 0 ? planBirds.length : bwSpeciesTarget} new species.`; break;
      case "local":     planTitle = `${bwLocalTarget} species in ${bwCounty || "county"} this year`; desc = `Record ${bwLocalTarget} species in ${bwCounty || "your county"} over the calendar year.`; break;
      case "skills":    planTitle = `Learn ${bwSkillTarget} birds by ${bwSkillFocus}`; desc = `Build ID skills to recognise ${bwSkillTarget} birds by ${bwSkillFocus}.`; weeks = 16; break;
      case "lifestyle": planTitle = `Weekly birding habit — ${bwFreqHours}h/week`; desc = `Go birding ${bwFreqHours}h per week for ${bwLifestyleReason}.`; break;
    }
    setTitle(planTitle); setDescription(desc); setDurationWeeks(String(weeks));
    setSteps(generatedSteps); applyHobbyActivities("birding", weeks, 3, 60); setBirdMode(false); setBirdGoalType(""); setStep(2);
  }

  function applyLanguageSettings() {
    if (!langGoalType || !llLanguage) return;
    const autoExam = LANGUAGE_EXAM_MAP[llLanguage] ?? "official language exam";
    const examName = llExamName.trim() || autoExam;
    const generatedSteps = generateLanguageSteps(langGoalType, {
      language: llLanguage, convMinutes: llConvMins,
      examName, examLevel: llExamLevel, examMonths: llExamMonths,
      studyMins: llStudyMins, studyDays: llStudyDays, wordsPerWeek: llWordsWeek,
      travelCountry: llTravelCountry,
    });
    let planTitle = "", desc = "", weeks = 16;
    switch (langGoalType) {
      case "communication": planTitle = `Hold a ${llConvMins}-min ${llLanguage} conversation`; desc = `Build ${llLanguage} to hold a ${llConvMins}-minute conversation about daily life.`; break;
      case "exam":          planTitle = `${llLanguage} — ${examName} ${llExamLevel}`; desc = `Reach ${llExamLevel} level and pass the ${examName} exam.`; weeks = Number(llExamMonths) * 4; break;
      case "routine":       planTitle = `${llLanguage} — ${llStudyMins} min/day, ${llWordsWeek} words/week`; desc = `Build a consistent ${llLanguage} study routine.`; weeks = 52; break;
      case "reallife":      planTitle = `${llLanguage} in real life${llTravelCountry ? ` — ${llTravelCountry}` : ""}`; desc = `Handle real-life interactions in ${llLanguage}.`; weeks = 26; break;
    }
    setTitle(planTitle); setDescription(desc); setDurationWeeks(String(weeks));
    setSteps(generatedSteps); applyHobbyActivities("language", weeks, 5, 30); setLangMode(false); setLangGoalType(""); setStep(2);
  }

  function applyInstrumentSettings() {
    if (!instrGoalType || !instrInstrument) return;
    const generatedSteps = generateInstrumentSteps(instrGoalType, {
      instrument: instrInstrument, song: instrSong, songCount: instrSongCount,
      practiceMinutes: instrPracticeMins, practiceDays: instrPracticeDays,
      performanceSong: instrPerfSong, sessionsPerWeek: instrSessions,
    });
    let planTitle = "", desc = "", weeks = 8;
    const inst = instrInstrument;
    switch (instrGoalType) {
      case "core":        planTitle = instrSong ? `Play "${instrSong}" on ${inst}` : `Core playing ability — ${inst}`; desc = `Play a song from start to finish with good tone and rhythm.`; break;
      case "repertoire":  planTitle = `${instrSongCount}-song repertoire on ${inst}`; desc = `Learn ${instrSongCount} songs you can play confidently from memory.`; weeks = 16; break;
      case "technique":   planTitle = `${inst} technique — ${instrPracticeMins} min/day, ${instrPracticeDays}×/week`; desc = `Build daily practice for scales, chords, and music theory.`; weeks = 12; break;
      case "performance": planTitle = instrPerfSong ? `Perform "${instrPerfSong}" on ${inst}` : `First performance on ${inst}`; desc = `Perform for friends or family and play ${instrSessions}×/week for fun.`; weeks = 12; break;
    }
    setTitle(planTitle); setDescription(desc); setDurationWeeks(String(weeks));
    setSteps(generatedSteps); applyHobbyActivities("instrument", weeks, 5, 30); setInstrMode(false); setInstrGoalType(""); setStep(2);
  }

  function addStep() {
    if (!stepInput.trim()) return;
    setSteps(s => [...s, { id: genId(), text: stepInput.trim(), done: false, dueDate: stepDate || undefined }]);
    setStepInput(""); setStepDate("");
  }

  function handleSave() {
    if (!selectedHobbyId || !title.trim()) return;
    const plan: HobbyPlan = {
      id: genId(), title: title.trim(), description: description.trim() || undefined,
      durationWeeks: durationWeeks ? Number(durationWeeks) : undefined,
      startDate: startDate || (activateNow ? new Date().toISOString().slice(0, 10) : undefined),
      isActive: activateNow, steps, createdAt: new Date().toISOString(),
      ...(scheduleDays.length > 0 ? { scheduleDays } : {}),
      ...(Object.keys(planDayLabels).length > 0 ? { dayLabels: planDayLabels } : {}),
      ...(Object.keys(planDayNotes).length > 0 ? { dayNotes: planDayNotes } : {}),
      ...(planMilestones.length > 0 ? { milestones: planMilestones } : {}),
      ...(planWeeklyPlan.length > 0 ? { weeklyPlan: planWeeklyPlan } : {}),
      ...(planActivities.length > 0 ? { activities: planActivities } : {}),
      ...(planEstimatedHours !== undefined ? { estimatedTotalHours: planEstimatedHours } : {}),
      ...(planCommitmentDays !== undefined ? { commitmentDaysPerWeek: planCommitmentDays } : {}),
      ...(planMinutesPerSession !== undefined ? { minutesPerSession: planMinutesPerSession } : {}),
    };
    onSave(selectedHobbyId, plan);
    handleClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col overflow-hidden p-0">
        <div className="px-5 pt-5 pb-3 border-b shrink-0">
          <div className="flex items-center gap-2 mb-3">
            {(step === 2 || chessEloMode || (chessMode && !chessEloMode) || pokerMode || pokerGoalMode || hikingMode || birdMode || langMode || instrMode || cyclingMode || fishingMode || gardeningMode || climbingMode || runningMode || surfingMode) && (
              <button onClick={() => {
                if (chessEloMode) { setChessEloMode(false); setChessMode(false); setChessGoalType(""); setSelectedTemplate(null); }
                else if (chessMode) { setChessMode(false); setChessGoalType(""); setSelectedTemplate(null); }
                else if (pokerGoalMode) { setPokerGoalMode(false); setPokerGoalType(""); setSelectedTemplate(null); }
                else if (pokerMode) { setPokerMode(false); setSelectedTemplate(null); }
                else if (hikingMode) { setHikingMode(false); setSelectedTemplate(null); }
                else if (cyclingMode) { setCyclingMode(false); setCyclingGoalType(""); setSelectedTemplate(null); }
                else if (fishingMode) { setFishingMode(false); setFishingGoalType(""); setSelectedTemplate(null); }
                else if (gardeningMode) { setGardeningMode(false); setGardeningGoalType(""); setSelectedTemplate(null); }
                else if (climbingMode) { setClimbingMode(false); setClimbingGoalType(""); setSelectedTemplate(null); }
                else if (runningMode) { setRunningMode(false); setRunningGoalType(""); setSelectedTemplate(null); }
                else if (surfingMode) { setSurfingMode(false); setSurfingGoalType(""); setSelectedTemplate(null); }
                else if (birdMode) { setBirdMode(false); setBirdGoalType(""); setSelectedTemplate(null); }
                else if (langMode) { setLangMode(false); setLangGoalType(""); setSelectedTemplate(null); }
                else if (instrMode) { setInstrMode(false); setInstrGoalType(""); setSelectedTemplate(null); }
                else setStep(1);
              }} className="p-1 rounded-lg hover:bg-secondary transition-colors text-muted-foreground">
                <ChevronLeft size={15} />
              </button>
            )}
            <div className="flex-1">
              <DialogTitle className="text-base flex items-center gap-2">
                <ClipboardList size={15} className="text-primary" />
                {step === 1 && !chessEloMode && !chessMode && !pokerMode && !pokerGoalMode && !hikingMode && !cyclingMode && !fishingMode && !gardeningMode && !climbingMode && !runningMode && !surfingMode && !birdMode && !langMode && !instrMode ? "New Plan"
                  : chessEloMode ? "Chess: Rating Goal"
                  : chessMode ? `Chess: ${CHESS_PLAN_TEMPLATES.find(t => CHESS_GOAL_TYPE_MAP[t.id] === chessGoalType)?.label ?? "Goal"}`
                  : pokerMode ? "Poker: Stakes Plan"
                  : pokerGoalMode ? `Poker: ${POKER_PLAN_TEMPLATES.find(t => POKER_GOAL_TYPE_MAP[t.id] === pokerGoalType)?.label ?? "Goal"}`
                  : hikingMode ? "Hiking Goal"
                  : cyclingMode ? `Cycling: ${CYCLING_PLAN_TEMPLATES.find(t => CYCLING_GOAL_TYPE_MAP[t.id] === cyclingGoalType)?.label ?? "Goal"}`
                  : fishingMode ? `Fishing: ${FISHING_PLAN_TEMPLATES.find(t => FISHING_GOAL_TYPE_MAP[t.id] === fishingGoalType)?.label ?? "Goal"}`
                  : gardeningMode ? `Gardening: ${GARDENING_PLAN_TEMPLATES.find(t => GARDENING_GOAL_TYPE_MAP[t.id] === gardeningGoalType)?.label ?? "Goal"}`
                  : climbingMode ? `Climbing: ${CLIMBING_PLAN_TEMPLATES.find(t => CLIMBING_GOAL_TYPE_MAP[t.id] === climbingGoalType)?.label ?? "Goal"}`
                  : runningMode ? `Running: ${RUNNING_PLAN_TEMPLATES.find(t => RUNNING_GOAL_TYPE_MAP[t.id] === runningGoalType)?.label ?? "Goal"}`
                  : surfingMode ? `Surfing: ${SURFING_PLAN_TEMPLATES.find(t => SURFING_GOAL_TYPE_MAP[t.id] === surfingGoalType)?.label ?? "Goal"}`
                  : birdMode ? `Birding: ${BIRD_PLAN_TEMPLATES.find(t => BIRD_GOAL_TYPE_MAP[t.id] === birdGoalType)?.label ?? "Goal"}`
                  : langMode ? `Language: ${LANGUAGE_PLAN_TEMPLATES.find(t => LANGUAGE_GOAL_TYPE_MAP[t.id] === langGoalType)?.label ?? "Goal"}`
                  : instrMode ? (() => {
                    const templates = isSingingHobby ? SINGING_PLAN_TEMPLATES : isActingHobby ? ACTING_PLAN_TEMPLATES : isComedyHobby ? COMEDY_PLAN_TEMPLATES : isDancingHobby ? DANCING_PLAN_TEMPLATES : INSTRUMENT_PLAN_TEMPLATES;
                    const label = templates.find(t => INSTRUMENT_GOAL_TYPE_MAP[t.id] === instrGoalType)?.label ?? "Goal";
                    const prefix = isSingingHobby ? "Singing" : isActingHobby ? "Acting" : isComedyHobby ? "Comedy" : isDancingHobby ? "Dancing" : "Instrument";
                    return `${prefix}: ${label}`;
                  })()
                  : "Configure Your Plan"}
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {step === 1 && !chessEloMode && !chessMode && !pokerMode && !pokerGoalMode && !hikingMode && !cyclingMode && !fishingMode && !gardeningMode && !climbingMode && !runningMode && !surfingMode && !birdMode && !langMode && !instrMode ? "Pick a hobby and choose a template"
                  : chessEloMode ? "Set your current and target ELO to generate a personalised plan"
                  : chessMode ? "Configure your goal to generate a personalised plan"
                  : pokerMode ? "Set your current and target stake to generate a personalised plan"
                  : pokerGoalMode ? "Configure your poker goal to generate a personalised plan"
                  : hikingMode ? "Configure your hiking goal and optionally add specific trails"
                  : cyclingMode ? "Configure your cycling goal and optionally add specific routes"
                  : fishingMode ? "Configure your fishing goal"
                  : gardeningMode ? "Configure your gardening goal"
                  : climbingMode ? "Configure your climbing goal and optionally search for routes"
                  : runningMode ? "Configure your running goal"
                  : surfingMode ? "Configure your surfing goal"
                  : birdMode ? "Configure your birding goal and optionally search for target species"
                  : langMode ? "Choose your language and configure your goal"
                  : instrMode ? (isSingingHobby ? "Choose your vocal style and configure your goal" : isActingHobby ? "Choose your focus area and configure your goal" : isComedyHobby ? "Choose your comedy style and configure your goal" : isDancingHobby ? "Choose your dance style and configure your goal" : "Choose your instrument and configure your goal")
                  : "Name, schedule, and build out your steps"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {((chessEloMode || chessMode || pokerMode || pokerGoalMode || hikingMode || cyclingMode || fishingMode || gardeningMode || climbingMode || runningMode || surfingMode || birdMode || langMode || instrMode) ? [1, 2, 3] : [1, 2]).map((n, idx) => {
              const filled = (chessEloMode || chessMode || pokerMode || pokerGoalMode || hikingMode || cyclingMode || fishingMode || gardeningMode || climbingMode || runningMode || surfingMode || birdMode || langMode || instrMode) ? idx <= 1 : n <= step;
              return <div key={n} className={`h-1 rounded-full flex-1 transition-colors ${filled ? "bg-primary" : "bg-secondary"}`} />;
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* ── HIKING GOAL WIZARD ── */}
          {hikingMode && (() => {
            const meta: Record<HikingGoalType, { emoji: string; example: string }> = {
              frequency: { emoji: "🥾", example: "e.g. 52 hikes this year (1 per week)" },
              distance:  { emoji: "📏", example: "e.g. Hike 300 miles this year" },
              elevation: { emoji: "📈", example: "e.g. 50,000 feet of gain this year" },
              peak:      { emoji: "🏔️", example: "e.g. First 14,000-foot summit" },
              trails:    { emoji: "📋", example: "e.g. Finish local \"52 with a view\" list" },
            };
            const m = hikingGoalType ? meta[hikingGoalType] : null;
            return (
              <div className="space-y-4">
                {/* Header card */}
                <div className="flex items-center gap-3 p-3 rounded-xl border bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800">
                  <span className="text-2xl">{m?.emoji ?? "🥾"}</span>
                  <div>
                    <p className="text-sm font-semibold">{selectedTemplate?.label}</p>
                    <p className="text-xs text-muted-foreground">{m?.example}</p>
                  </div>
                </div>

                {/* FREQUENCY */}
                {hikingGoalType === "frequency" && (
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Target hike count *</label>
                    <Input type="number" min={1} max={365} placeholder="e.g. 52" value={hikeCount} onChange={e => setHikeCount(e.target.value)} className="text-sm" />
                    {Number(hikeCount) > 0 && <p className="text-[10px] text-muted-foreground mt-1">≈ {(Number(hikeCount) / 52).toFixed(1)} hikes per week over a year</p>}
                  </div>
                )}

                {/* DISTANCE */}
                {hikingGoalType === "distance" && (
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Target miles *</label>
                    <Input type="number" min={1} placeholder="e.g. 300" value={hikeMiles} onChange={e => setHikeMiles(e.target.value)} className="text-sm" />
                    {Number(hikeMiles) > 0 && <p className="text-[10px] text-muted-foreground mt-1">≈ {Math.round(Number(hikeMiles) / 52)} miles per week over a year</p>}
                  </div>
                )}

                {/* ELEVATION */}
                {hikingGoalType === "elevation" && (
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Target elevation gain (feet) *</label>
                    <Input type="number" min={1000} step={1000} placeholder="e.g. 50000" value={hikeFeet} onChange={e => setHikeFeet(e.target.value)} className="text-sm" />
                    {Number(hikeFeet) > 0 && <p className="text-[10px] text-muted-foreground mt-1">≈ {Math.round(Number(hikeFeet) / 52).toLocaleString()} ft/week over a year</p>}
                  </div>
                )}

                {/* PEAK */}
                {hikingGoalType === "peak" && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Target altitude (feet) *</label>
                      <Input type="number" min={1000} step={100} placeholder="e.g. 14000" value={peakAltitude} onChange={e => setPeakAltitude(e.target.value)} className="text-sm" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Peak name (optional)</label>
                      <Input placeholder="e.g. Mount Elbert, Longs Peak…" value={peakName} onChange={e => setPeakName(e.target.value)} className="text-sm" />
                    </div>
                    {/* Trail search for finding the peak */}
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Find trail via search (optional)</label>
                      <div className="flex gap-2">
                        <Input placeholder="Search trail near… (e.g. Rocky Mountain NP)"
                          value={hikingTrailSearch.locationInput} onChange={e => hikingTrailSearch.setLocationInput(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") hikingTrailSearch.runSearch(); }}
                          className="text-sm h-8 flex-1" />
                        <Button size="sm" variant="outline" onClick={() => hikingTrailSearch.runSearch()} disabled={hikingTrailSearch.searching || !hikingTrailSearch.locationInput.trim()} className="h-8 gap-1 shrink-0">
                          {hikingTrailSearch.searching ? <RefreshCw size={11} className="animate-spin" /> : <Search size={11} />}
                        </Button>
                      </div>
                      {hikingTrailSearch.searchError && <p className="text-xs text-destructive mt-1">{hikingTrailSearch.searchError}</p>}
                      {hikingTrailSearch.searchResults.length > 0 && (
                        <div className="mt-1.5 space-y-1 max-h-36 overflow-y-auto">
                          {hikingTrailSearch.searchResults.map((t: any) => (
                            <button key={t.id} onClick={() => { setPeakName(t.name); hikingTrailSearch.setSearchResults([]); }}
                              className="w-full text-left p-2 rounded border text-xs hover:bg-emerald-50 dark:hover:bg-emerald-950/20 transition-colors">
                              <span className="font-medium">{t.name}</span>{t.length > 0 ? <span className="text-muted-foreground ml-1">({t.length} mi)</span> : ""}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* TRAIL LIST */}
                {hikingGoalType === "trails" && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">List / challenge name</label>
                        <Input placeholder='e.g. "52 with a View"' value={trailListName} onChange={e => setTrailListName(e.target.value)} className="text-sm" />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Total trail count</label>
                        <Input type="number" min={1} placeholder="e.g. 52" value={trailListCount} onChange={e => setTrailListCount(e.target.value)} className="text-sm" />
                      </div>
                    </div>
                    {/* Trail search */}
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                        Add specific trails to the plan{planTrails.length > 0 ? ` (${planTrails.length} added)` : " (optional)"}
                      </label>
                      <div className="flex gap-2">
                        <Input placeholder="Search trail name or location…"
                          value={hikingTrailSearch.locationInput} onChange={e => hikingTrailSearch.setLocationInput(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") hikingTrailSearch.runSearch(); }}
                          className="text-sm h-8 flex-1" />
                        <Button size="sm" variant="outline" onClick={() => hikingTrailSearch.runSearch()} disabled={hikingTrailSearch.searching || !hikingTrailSearch.locationInput.trim()} className="h-8 gap-1 shrink-0">
                          {hikingTrailSearch.searching ? <RefreshCw size={11} className="animate-spin" /> : <Search size={11} />}
                          {hikingTrailSearch.searching ? "…" : "Search"}
                        </Button>
                      </div>
                      {hikingTrailSearch.searchError && <p className="text-xs text-destructive mt-1">{hikingTrailSearch.searchError}</p>}
                      {hikingTrailSearch.searchResults.length > 0 && (
                        <div className="mt-1.5 space-y-1 max-h-40 overflow-y-auto">
                          <p className="text-[10px] text-muted-foreground">{hikingTrailSearch.searchResults.length} routes found — click to add</p>
                          {hikingTrailSearch.searchResults.map((t: any) => {
                            const added = planTrails.some(p => p.id === t.id);
                            return (
                              <button key={t.id} disabled={added} onClick={() => { setPlanTrails(p => [...p, t]); }}
                                className={`w-full text-left flex items-center justify-between p-2 rounded border text-xs transition-colors ${added ? "opacity-50 cursor-not-allowed bg-secondary" : "hover:bg-emerald-50 dark:hover:bg-emerald-950/20"}`}>
                                <span><span className="font-medium">{t.name}</span>{t.length > 0 ? <span className="text-muted-foreground ml-1">({t.length} mi)</span> : ""}</span>
                                {added ? <Check size={11} className="text-emerald-600 shrink-0" /> : <Plus size={11} className="text-muted-foreground shrink-0" />}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      {/* Added trails list */}
                      {planTrails.length > 0 && (
                        <div className="mt-2 space-y-1">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Added to plan ({planTrails.length})</p>
                          {planTrails.map((t, i) => (
                            <div key={t.id} className="flex items-center justify-between text-xs p-1.5 rounded bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800">
                              <span className="truncate">{i + 1}. {t.name}{t.length > 0 ? <span className="text-muted-foreground ml-1">({t.length} mi)</span> : ""}</span>
                              <button onClick={() => setPlanTrails(p => p.filter(x => x.id !== t.id))} className="ml-2 text-muted-foreground hover:text-destructive shrink-0"><X size={11} /></button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <Button
                  onClick={applyHikingSettings}
                  disabled={
                    (hikingGoalType === "frequency" && !hikeCount) ||
                    (hikingGoalType === "distance"  && !hikeMiles) ||
                    (hikingGoalType === "elevation" && !hikeFeet)  ||
                    (hikingGoalType === "peak"      && !peakAltitude)
                  }
                  className="w-full gap-2"
                >
                  Build My Plan <ChevronRight size={14} />
                </Button>
              </div>
            );
          })()}

          {/* ── BIRD GOAL WIZARD ── */}
          {birdMode && (() => {
            const tplMeta = BIRD_PLAN_TEMPLATES.find(t => BIRD_GOAL_TYPE_MAP[t.id] === birdGoalType);
            return (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 rounded-xl border bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800">
                  <span className="text-2xl">{tplMeta?.emoji ?? "🦅"}</span>
                  <div>
                    <p className="text-sm font-semibold">{tplMeta?.label}</p>
                    <p className="text-xs text-muted-foreground">{tplMeta?.description}</p>
                  </div>
                </div>

                {/* Species / life list */}
                {birdGoalType === "species" && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium mb-1 block">Target species to add</label>
                      <Input type="number" value={bwSpeciesTarget} onChange={e => setBwSpeciesTarget(e.target.value)} className="text-sm" placeholder="e.g. 50" min={1} />
                      <p className="text-[11px] text-muted-foreground mt-1">How many new species do you want to add to your life list?</p>
                    </div>
                    {/* Bird search for species list */}
                    <div>
                      <label className="text-xs font-medium mb-1 block">Search & add specific target species (optional)</label>
                      <div className="flex gap-2">
                        <Input value={birdWizardSearch.query} onChange={e => birdWizardSearch.setQuery(e.target.value)} placeholder="e.g. warbler, eagle…" className="text-sm h-8 flex-1"
                          onKeyDown={e => e.key === "Enter" && birdWizardSearch.runSearch()} />
                        <button onClick={() => birdWizardSearch.runSearch()} disabled={birdWizardSearch.searching}
                          className="px-3 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/80 disabled:opacity-50 transition-colors shrink-0">
                          {birdWizardSearch.searching ? "…" : "Search"}
                        </button>
                      </div>
                      {birdWizardSearch.error && <p className="text-xs text-destructive mt-1">{birdWizardSearch.error}</p>}
                      {birdWizardSearch.results.length > 0 && (
                        <div className="grid grid-cols-2 gap-2 mt-2 max-h-52 overflow-y-auto">
                          {birdWizardSearch.results.map((b: any) => {
                            const added = planBirds.some(pb => pb.name === b.name);
                            return (
                              <div key={b.id} className="rounded-lg border bg-card overflow-hidden flex flex-col">
                                {b.image && <img src={b.image} alt={b.name} className="w-full h-20 object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />}
                                {!b.image && <div className="w-full h-20 bg-secondary flex items-center justify-center text-2xl">🐦</div>}
                                <div className="p-1.5 flex items-center justify-between gap-1">
                                  <div className="min-w-0">
                                    <p className="text-[11px] font-semibold leading-tight truncate">{b.name}</p>
                                    {b.sciName && <p className="text-[10px] italic text-muted-foreground truncate">{b.sciName}</p>}
                                  </div>
                                  <button onClick={() => {
                                    if (added) { setPlanBirds(pb => pb.filter(x => x.name !== b.name)); }
                                    else { setPlanBirds(pb => [...pb, { name: b.name, sciName: b.sciName, image: b.image }]); }
                                  }} className={`text-[10px] px-2 py-0.5 rounded font-medium shrink-0 transition-colors ${added ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-secondary hover:bg-secondary/80"}`}>
                                    {added ? "✓ Added" : "+ Add"}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {planBirds.length > 0 && (
                        <div className="mt-2 space-y-1">
                          <p className="text-[11px] font-medium text-muted-foreground">{planBirds.length} target species added</p>
                          <div className="flex flex-wrap gap-1">
                            {planBirds.map(b => (
                              <span key={b.name} className="flex items-center gap-1 text-[10px] bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 px-2 py-0.5 rounded-full">
                                {b.name}
                                <button onClick={() => setPlanBirds(pb => pb.filter(x => x.name !== b.name))} className="hover:text-destructive transition-colors">×</button>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Local / annual total */}
                {birdGoalType === "local" && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium mb-1 block">Target species count</label>
                      <Input type="number" value={bwLocalTarget} onChange={e => setBwLocalTarget(e.target.value)} className="text-sm" placeholder="e.g. 150" min={1} />
                    </div>
                    <div>
                      <label className="text-xs font-medium mb-1 block">County / area name</label>
                      <Input value={bwCounty} onChange={e => setBwCounty(e.target.value)} className="text-sm" placeholder="e.g. Boulder County" />
                    </div>
                  </div>
                )}

                {/* ID & field skills */}
                {birdGoalType === "skills" && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium mb-1 block">Number of birds to learn</label>
                      <Input type="number" value={bwSkillTarget} onChange={e => setBwSkillTarget(e.target.value)} className="text-sm" placeholder="e.g. 30" min={1} />
                    </div>
                    <div>
                      <label className="text-xs font-medium mb-1 block">Identification method focus</label>
                      <div className="flex flex-wrap gap-2">
                        {["song and sight", "song only", "flight pattern", "habitat cues"].map(opt => (
                          <button key={opt} onClick={() => setBwSkillFocus(opt)}
                            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${bwSkillFocus === opt ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}>
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Lifestyle / wellbeing */}
                {birdGoalType === "lifestyle" && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium mb-1 block">Hours per session</label>
                      <div className="flex gap-2">
                        {["0.5", "1", "1.5", "2", "3"].map(h => (
                          <button key={h} onClick={() => setBwFreqHours(h)}
                            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${bwFreqHours === h ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}>
                            {h}h
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium mb-1 block">Why do you want this habit?</label>
                      <Input value={bwLifestyleReason} onChange={e => setBwLifestyleReason(e.target.value)} className="text-sm" placeholder="e.g. stress relief, mindfulness, connecting with nature" />
                    </div>
                  </div>
                )}

                <Button onClick={applyBirdSettings} disabled={!birdGoalType} className="w-full">
                  Build My Plan <ChevronRight size={14} />
                </Button>
              </div>
            );
          })()}

          {/* ── LANGUAGE GOAL WIZARD ── */}
          {langMode && (() => {
            const tplMeta = LANGUAGE_PLAN_TEMPLATES.find(t => LANGUAGE_GOAL_TYPE_MAP[t.id] === langGoalType);
            const autoExam = llLanguage ? (LANGUAGE_EXAM_MAP[llLanguage] ?? "official exam") : "official exam";
            return (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 rounded-xl border bg-blue-50/60 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                  <span className="text-2xl">{tplMeta?.emoji ?? "🌍"}</span>
                  <div>
                    <p className="text-sm font-semibold">{tplMeta?.label}</p>
                    <p className="text-xs text-muted-foreground">{tplMeta?.description}</p>
                  </div>
                </div>

                {/* Language picker — always shown first */}
                <div>
                  <label className="text-xs font-medium mb-1 block">Which language are you learning? *</label>
                  <select value={llLanguage} onChange={e => { setLlLanguage(e.target.value); setLlExamName(""); }}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring">
                    <option value="">Select a language…</option>
                    {WORLD_LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                    <option value="Other">Other</option>
                  </select>
                  {llLanguage === "Other" && (
                    <Input className="text-sm mt-2" placeholder="Type your language…" value={llExamName === "" ? "" : undefined}
                      onChange={e => setLlLanguage(e.target.value)} />
                  )}
                </div>

                {/* Communication skills */}
                {langGoalType === "communication" && (
                  <div>
                    <label className="text-xs font-medium mb-1 block">Target conversation length</label>
                    <div className="flex flex-wrap gap-2">
                      {["5", "10", "15", "20", "30"].map(m => (
                        <button key={m} onClick={() => setLlConvMins(m)}
                          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${llConvMins === m ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}>
                          {m} min
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Exam / proficiency */}
                {langGoalType === "exam" && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium mb-1 block">
                        Exam name {llLanguage && autoExam !== "official exam" && <span className="text-muted-foreground font-normal">(suggested: {autoExam})</span>}
                      </label>
                      <Input value={llExamName} onChange={e => setLlExamName(e.target.value)} placeholder={autoExam} className="text-sm" />
                    </div>
                    <div>
                      <label className="text-xs font-medium mb-1 block">Target level</label>
                      <div className="flex flex-wrap gap-2">
                        {["A1", "A2", "B1", "B2", "C1", "C2", "N5", "N4", "N3", "N2", "N1", "HSK 4", "HSK 5", "TOPIK II"].map(lvl => (
                          <button key={lvl} onClick={() => setLlExamLevel(lvl)}
                            className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${llExamLevel === lvl ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}>
                            {lvl}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium mb-1 block">Timeline (months)</label>
                      <div className="flex gap-2">
                        {["6", "9", "12", "18", "24"].map(m => (
                          <button key={m} onClick={() => setLlExamMonths(m)}
                            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${llExamMonths === m ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}>
                            {m} mo
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Routine & habits */}
                {langGoalType === "routine" && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium mb-1 block">Daily study time</label>
                      <div className="flex gap-2">
                        {["15", "30", "45", "60", "90"].map(m => (
                          <button key={m} onClick={() => setLlStudyMins(m)}
                            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${llStudyMins === m ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}>
                            {m} min
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium mb-1 block">Days per week</label>
                      <div className="flex gap-2">
                        {["3", "4", "5", "6", "7"].map(d => (
                          <button key={d} onClick={() => setLlStudyDays(d)}
                            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${llStudyDays === d ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}>
                            {d}×/wk
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium mb-1 block">New words per week</label>
                      <Input type="number" value={llWordsWeek} onChange={e => setLlWordsWeek(e.target.value)} className="text-sm" placeholder="e.g. 50" min={1} />
                    </div>
                  </div>
                )}

                {/* Real-life usage */}
                {langGoalType === "reallife" && (
                  <div>
                    <label className="text-xs font-medium mb-1 block">Country you plan to visit</label>
                    <Input value={llTravelCountry} onChange={e => setLlTravelCountry(e.target.value)} className="text-sm" placeholder={llLanguage ? `e.g. a ${llLanguage}-speaking country` : "e.g. Mexico, France, Japan…"} />
                  </div>
                )}

                <Button onClick={applyLanguageSettings} disabled={!langGoalType || !llLanguage} className="w-full">
                  Build My Plan <ChevronRight size={14} />
                </Button>
              </div>
            );
          })()}

          {/* ── INSTRUMENT GOAL WIZARD ── */}
          {instrMode && (() => {
            const activeTpls = isSingingHobby ? SINGING_PLAN_TEMPLATES : isActingHobby ? ACTING_PLAN_TEMPLATES : isComedyHobby ? COMEDY_PLAN_TEMPLATES : isDancingHobby ? DANCING_PLAN_TEMPLATES : INSTRUMENT_PLAN_TEMPLATES;
            const tplMeta = activeTpls.find(t => INSTRUMENT_GOAL_TYPE_MAP[t.id] === instrGoalType);
            return (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 rounded-xl border bg-violet-50/60 dark:bg-violet-950/20 border-violet-200 dark:border-violet-800">
                  <span className="text-2xl">{tplMeta?.emoji ?? "🎵"}</span>
                  <div>
                    <p className="text-sm font-semibold">{tplMeta?.label}</p>
                    <p className="text-xs text-muted-foreground">{tplMeta?.description}</p>
                  </div>
                </div>

                {/* Instrument picker — only for Playing an Instrument */}
                {isInstrumentHobby && (
                  <div>
                    <label className="text-xs font-medium mb-1 block">Which instrument? *</label>
                    <select value={instrInstrument} onChange={e => setInstrInstrument(e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring">
                      <option value="">Select an instrument…</option>
                      {INSTRUMENT_LIST.map(i => <option key={i} value={i}>{i}</option>)}
                      <option value="Other">Other…</option>
                    </select>
                    {instrInstrument === "Other" && (
                      <Input className="text-sm mt-2" placeholder="Type your instrument…" onChange={e => setInstrInstrument(e.target.value)} />
                    )}
                  </div>
                )}

                {/* Singing — vocal style */}
                {isSingingHobby && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium mb-1 block">Vocal style / genre (optional)</label>
                      <Input value={instrInstrument || ""} onChange={e => setInstrInstrument(e.target.value)} className="text-sm" placeholder='e.g. Pop, Classical, R&B, Musical Theatre…' />
                    </div>
                    {instrGoalType === "core" && (
                      <div>
                        <label className="text-xs font-medium mb-1 block">Song to learn (optional)</label>
                        <Input value={instrSong} onChange={e => setInstrSong(e.target.value)} className="text-sm" placeholder='e.g. "Someone Like You", "Bohemian Rhapsody"' />
                      </div>
                    )}
                    {instrGoalType === "technique" && (
                      <div className="space-y-3">
                        <div>
                          <label className="text-xs font-medium mb-1 block">Daily practice time</label>
                          <div className="flex flex-wrap gap-2">
                            {["10","20","30","45","60"].map(m => (
                              <button key={m} onClick={() => setInstrPracticeMins(m)}
                                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${instrPracticeMins === m ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}>
                                {m} min
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-medium mb-1 block">Practice days</label>
                          <div className="flex flex-wrap gap-1.5">
                            {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(day => (
                              <button key={day} type="button" onClick={() => setInstrScheduleDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day])}
                                className={`text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-colors ${instrScheduleDays.includes(day) ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}>
                                {day}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                    {instrGoalType === "performance" && (
                      <div>
                        <label className="text-xs font-medium mb-1 block">Song to perform (optional)</label>
                        <Input value={instrPerfSong} onChange={e => setInstrPerfSong(e.target.value)} className="text-sm" placeholder='e.g. "Hallelujah", "Ave Maria"' />
                      </div>
                    )}
                  </div>
                )}

                {/* Acting — scene / role focus */}
                {isActingHobby && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium mb-1 block">Focus area (optional)</label>
                      <Input value={instrInstrument || ""} onChange={e => setInstrInstrument(e.target.value)} className="text-sm" placeholder='e.g. Film, Stage, Improv, Commercial…' />
                    </div>
                    {instrGoalType === "core" && (
                      <div>
                        <label className="text-xs font-medium mb-1 block">Scene or monologue to work on (optional)</label>
                        <Input value={instrSong} onChange={e => setInstrSong(e.target.value)} className="text-sm" placeholder='e.g. "Hamlet Act 3", "Meisner exercise"' />
                      </div>
                    )}
                    {instrGoalType === "performance" && (
                      <div>
                        <label className="text-xs font-medium mb-1 block">Role or production to prepare for (optional)</label>
                        <Input value={instrPerfSong} onChange={e => setInstrPerfSong(e.target.value)} className="text-sm" placeholder='e.g. "Romeo & Juliet", "Audition monologue"' />
                      </div>
                    )}
                  </div>
                )}

                {/* Comedy — style focus */}
                {isComedyHobby && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium mb-1 block">Comedy style (optional)</label>
                      <Input value={instrInstrument || ""} onChange={e => setInstrInstrument(e.target.value)} className="text-sm" placeholder='e.g. Stand-up, Sketch, Improv, Roast…' />
                    </div>
                    {instrGoalType === "core" && (
                      <div>
                        <label className="text-xs font-medium mb-1 block">Set or bit to develop (optional)</label>
                        <Input value={instrSong} onChange={e => setInstrSong(e.target.value)} className="text-sm" placeholder='e.g. "5-minute open mic set", "office jokes"' />
                      </div>
                    )}
                    {instrGoalType === "performance" && (
                      <div>
                        <label className="text-xs font-medium mb-1 block">Performance target (optional)</label>
                        <Input value={instrPerfSong} onChange={e => setInstrPerfSong(e.target.value)} className="text-sm" placeholder='e.g. "Open mic at Comedy Store"' />
                      </div>
                    )}
                  </div>
                )}

                {/* Dancing — style focus */}
                {isDancingHobby && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium mb-1 block">Dance style (optional)</label>
                      <Input value={instrInstrument || ""} onChange={e => setInstrInstrument(e.target.value)} className="text-sm" placeholder='e.g. Ballet, Salsa, Hip-Hop, Contemporary…' />
                    </div>
                    {instrGoalType === "core" && (
                      <div>
                        <label className="text-xs font-medium mb-1 block">Routine or move to learn (optional)</label>
                        <Input value={instrSong} onChange={e => setInstrSong(e.target.value)} className="text-sm" placeholder='e.g. "Basic salsa footwork", "pirouette"' />
                      </div>
                    )}
                    {instrGoalType === "technique" && (
                      <div className="space-y-3">
                        <div>
                          <label className="text-xs font-medium mb-1 block">Daily practice time</label>
                          <div className="flex flex-wrap gap-2">
                            {["15","20","30","45","60"].map(m => (
                              <button key={m} onClick={() => setInstrPracticeMins(m)}
                                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${instrPracticeMins === m ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}>
                                {m} min
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-medium mb-1 block">Practice days</label>
                          <div className="flex flex-wrap gap-1.5">
                            {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(day => (
                              <button key={day} type="button" onClick={() => setInstrScheduleDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day])}
                                className={`text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-colors ${instrScheduleDays.includes(day) ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}>
                                {day}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                    {instrGoalType === "performance" && (
                      <div>
                        <label className="text-xs font-medium mb-1 block">Performance to work toward (optional)</label>
                        <Input value={instrPerfSong} onChange={e => setInstrPerfSong(e.target.value)} className="text-sm" placeholder='e.g. "Recital in June", "Dance showcase"' />
                      </div>
                    )}
                  </div>
                )}

                {isInstrumentHobby && instrGoalType === "core" && (
                  <div>
                    <label className="text-xs font-medium mb-1 block">Which song will you learn? (optional)</label>
                    <Input value={instrSong} onChange={e => setInstrSong(e.target.value)} className="text-sm" placeholder='e.g. "Wonderwall", "Für Elise", "Hallelujah"' />
                    <p className="text-[11px] text-muted-foreground mt-1">Leave blank for a general beginner-song plan.</p>
                  </div>
                )}

                {isInstrumentHobby && instrGoalType === "repertoire" && (
                  <div>
                    <label className="text-xs font-medium mb-1 block">How many songs in your repertoire?</label>
                    <div className="flex flex-wrap gap-2">
                      {["3", "5", "7", "10", "12", "15"].map(n => (
                        <button key={n} onClick={() => setInstrSongCount(n)}
                          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${instrSongCount === n ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}>
                          {n} songs
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {isInstrumentHobby && instrGoalType === "technique" && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium mb-1 block">Daily practice time</label>
                      <div className="flex flex-wrap gap-2">
                        {["10", "20", "30", "45", "60"].map(m => (
                          <button key={m} onClick={() => setInstrPracticeMins(m)}
                            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${instrPracticeMins === m ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}>
                            {m} min
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium mb-1 block">Practice days</label>
                      <div className="flex flex-wrap gap-1.5">
                        {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(day => (
                          <button key={day} type="button" onClick={() => setInstrScheduleDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day])}
                            className={`text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-colors ${instrScheduleDays.includes(day) ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}>
                            {day}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {isInstrumentHobby && instrGoalType === "performance" && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium mb-1 block">Song to perform (optional)</label>
                      <Input value={instrPerfSong} onChange={e => setInstrPerfSong(e.target.value)} className="text-sm" placeholder='e.g. "Blackbird", "Canon in D"' />
                    </div>
                    <div>
                      <label className="text-xs font-medium mb-1 block">Casual play sessions per week</label>
                      <div className="flex gap-2">
                        {["1", "2", "3", "4", "5"].map(s => (
                          <button key={s} onClick={() => setInstrSessions(s)}
                            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${instrSessions === s ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}>
                            {s}×/wk
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <Button onClick={applyInstrumentSettings} disabled={!instrGoalType || (isInstrumentHobby && !instrInstrument)} className="w-full">
                  Build My Plan <ChevronRight size={14} />
                </Button>
              </div>
            );
          })()}

          {/* ── FISHING GOAL WIZARD ── */}
          {fishingMode && (() => {
            const tplMeta = FISHING_PLAN_TEMPLATES.find(t => FISHING_GOAL_TYPE_MAP[t.id] === fishingGoalType);
            return (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 rounded-xl border bg-teal-50/60 dark:bg-teal-950/20 border-teal-200 dark:border-teal-800">
                  <span className="text-2xl">{tplMeta?.emoji ?? "🎣"}</span>
                  <div>
                    <p className="text-sm font-semibold">{tplMeta?.label}</p>
                    <p className="text-xs text-muted-foreground">{tplMeta?.description}</p>
                  </div>
                </div>

                {/* CATCH / SPECIES */}
                {fishingGoalType === "catch" && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Target species *</label>
                      {fsTargetSpecies ? (
                        <div className="flex items-center gap-2 p-2 rounded-lg bg-teal-50/60 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-800">
                          <p className="text-sm font-medium flex-1">{fsTargetSpecies}</p>
                          <button onClick={() => { setFsTargetSpecies(""); fishWizardSearch.setResults([]); }} className="text-muted-foreground hover:text-destructive"><X size={12} /></button>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          <div className="flex gap-2">
                            <Input placeholder="Search (e.g. largemouth bass, catfish)…"
                              value={fishWizardSearch.query} onChange={e => fishWizardSearch.setQuery(e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter") fishWizardSearch.runSearch(); }}
                              className="text-sm h-8 flex-1" />
                            <Button size="sm" variant="outline" onClick={() => fishWizardSearch.runSearch()} disabled={fishWizardSearch.searching || !fishWizardSearch.query.trim()} className="h-8 gap-1 shrink-0">
                              {fishWizardSearch.searching ? <RefreshCw size={11} className="animate-spin" /> : <Search size={11} />}
                            </Button>
                          </div>
                          {fishWizardSearch.error && <p className="text-xs text-destructive">{fishWizardSearch.error}</p>}
                          {fishWizardSearch.results.length > 0 && (
                            <div className="space-y-1 max-h-44 overflow-y-auto">
                              <p className="text-[10px] text-muted-foreground">Powered by iNaturalist — click to select</p>
                              {fishWizardSearch.results.map((fish: any) => (
                                <button key={fish.id} onClick={() => { setFsTargetSpecies(fish.name); fishWizardSearch.setResults([]); }}
                                  className="w-full text-left flex items-center gap-2 p-2 rounded-lg border bg-card hover:bg-teal-50 dark:hover:bg-teal-950/20 transition-colors">
                                  {fish.photoUrl
                                    ? <img src={fish.photoUrl} alt={fish.name} className="w-8 h-8 rounded object-cover shrink-0" />
                                    : <div className="w-8 h-8 rounded bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center shrink-0 text-sm">🐟</div>}
                                  <div className="min-w-0">
                                    <p className="text-xs font-medium truncate">{fish.name}</p>
                                    <p className="text-[10px] text-muted-foreground italic truncate">{fish.sciName}</p>
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                          <Input placeholder="Or type species name manually…"
                            value={fsTargetSpecies} onChange={e => setFsTargetSpecies(e.target.value)} className="text-sm h-8" />
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Target weight (lbs)</label>
                        <Input type="number" min={0} step={0.5} placeholder="e.g. 5" value={fsTargetWeight} onChange={e => setFsTargetWeight(e.target.value)} className="text-sm" />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Target length (inches)</label>
                        <Input type="number" min={0} step={0.5} placeholder="e.g. 24" value={fsTargetLength} onChange={e => setFsTargetLength(e.target.value)} className="text-sm" />
                      </div>
                    </div>
                  </div>
                )}

                {/* SKILL / KNOWLEDGE */}
                {fishingGoalType === "skill" && (
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Home lake / river (optional)</label>
                    <Input placeholder="e.g. Lake Cumberland, the local reservoir…" value={fsHomeLake} onChange={e => setFsHomeLake(e.target.value)} className="text-sm" />
                    <p className="text-[10px] text-muted-foreground mt-1">Your plan will be built around mastering all four seasons on this water.</p>
                  </div>
                )}

                {/* EXPLORATION */}
                {fishingGoalType === "exploration" && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">How many new waters? *</label>
                      <div className="flex gap-2 flex-wrap">
                        {["3", "5", "8", "10", "12"].map(n => (
                          <button key={n} onClick={() => { setFsWaterCount(n); setFsWaters(Array(Number(n)).fill("")); }}
                            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${fsWaterCount === n ? "bg-teal-600 text-white border-teal-600" : "border-border hover:border-teal-400"}`}>
                            {n} waters
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Name the waters (optional)</label>
                      <div className="space-y-1.5">
                        {fsWaters.slice(0, Number(fsWaterCount)).map((w, i) => (
                          <Input key={i} placeholder={`Water ${i + 1} — e.g. Green River, Barren River Lake…`}
                            value={w} onChange={e => setFsWaters(waters => { const next = [...waters]; next[i] = e.target.value; return next; })}
                            className="text-sm h-8" />
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* SOCIAL */}
                {fishingGoalType === "social" && (
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Who will you fish with? (optional)</label>
                    <Input placeholder="e.g. my dad, the family, fishing buddies…" value={fsPartner} onChange={e => setFsPartner(e.target.value)} className="text-sm" />
                    <p className="text-[10px] text-muted-foreground mt-1">Your plan will include one outing per month — no pressure on results, just time on the water.</p>
                  </div>
                )}

                <Button
                  onClick={applyFishingSettings}
                  disabled={fishingGoalType === "catch" && !fsTargetSpecies}
                  className="w-full gap-2"
                >
                  Build My Plan <ChevronRight size={14} />
                </Button>
              </div>
            );
          })()}

          {/* ── GARDENING GOAL WIZARD ── */}
          {gardeningMode && (() => {
            const tplMeta = GARDENING_PLAN_TEMPLATES.find(t => GARDENING_GOAL_TYPE_MAP[t.id] === gardeningGoalType);
            const meta: Record<GardeningGoalType, { emoji: string; example: string }> = {
              harvest:    { emoji: "🍅", example: "e.g. Tomatoes, cucumbers, basil, and mint" },
              aesthetics: { emoji: "🌸", example: "e.g. Bulbs in spring, perennials in summer, asters in fall" },
              skills:     { emoji: "🌱", example: "e.g. 10 varieties started from seed indoors" },
              relaxation: { emoji: "🧘", example: "e.g. 20 minutes of tending 3 days a week" },
            };
            const m = gardeningGoalType ? meta[gardeningGoalType] : null;
            return (
              <div className="space-y-4">
                {/* Header card */}
                <div className="flex items-center gap-3 p-3 rounded-xl border bg-green-50/60 dark:bg-green-950/20 border-green-200 dark:border-green-800">
                  <span className="text-2xl">{m?.emoji ?? "🌿"}</span>
                  <div>
                    <p className="text-sm font-semibold">{tplMeta?.label}</p>
                    <p className="text-xs text-muted-foreground">{m?.example}</p>
                  </div>
                </div>

                {/* harvest: target crops */}
                {gardeningGoalType === "harvest" && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium block mb-1">What do you want to grow? *</label>
                      <Input
                        placeholder="e.g. tomatoes, basil, cucumbers, zucchini"
                        value={gdTargetCrops}
                        onChange={e => setGdTargetCrops(e.target.value)}
                        className="text-sm"
                      />
                      <p className="text-[10px] text-muted-foreground mt-1">Your plan will cover planning, planting, tending, and harvesting these crops through the growing season.</p>
                    </div>
                    <div>
                      <label className="text-xs font-medium block mb-1.5">Search for plants to add to your garden</label>
                      <div className="flex gap-2">
                        <Input
                          placeholder="Search by name (e.g. tomato, basil…)"
                          value={gardenWizardSearch.query}
                          onChange={e => gardenWizardSearch.setQuery(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") gardenWizardSearch.runSearch(); }}
                          className="text-sm flex-1"
                        />
                        <Button size="sm" variant="outline" onClick={() => gardenWizardSearch.runSearch()} disabled={gardenWizardSearch.searching || !gardenWizardSearch.query.trim()} className="gap-1 shrink-0">
                          {gardenWizardSearch.searching ? <RefreshCw size={11} className="animate-spin" /> : <Search size={11} />}
                        </Button>
                      </div>
                      {gardenWizardSearch.error && <p className="text-xs text-destructive mt-1">{gardenWizardSearch.error}</p>}
                      {gardenWizardSearch.results.length > 0 && (
                        <div className="space-y-1 mt-2 max-h-44 overflow-y-auto">
                          <p className="text-[10px] text-muted-foreground">Powered by Perenual — results are for inspiration</p>
                          {gardenWizardSearch.results.map((p: any) => (
                            <div key={p.id} className="flex items-center gap-2 p-2 rounded-lg border bg-card">
                              <PlantImg src={p.default_image?.small_url} alt={p.common_name} className="w-8 h-8 rounded object-cover" />
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-medium truncate">{p.common_name}</p>
                                <p className="text-[10px] text-muted-foreground italic truncate">{Array.isArray(p.scientific_name) ? p.scientific_name[0] : p.scientific_name}</p>
                              </div>
                              <button onClick={() => setGdTargetCrops(prev => prev ? `${prev}, ${p.common_name}` : p.common_name)}
                                className="text-[10px] px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700 transition-colors shrink-0">+ Add</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* aesthetics: no extra inputs, just descriptive */}
                {gardeningGoalType === "aesthetics" && (
                  <div className="p-3 rounded-xl bg-secondary/50 text-xs text-muted-foreground space-y-1">
                    <p className="font-medium text-foreground">Your plan will include:</p>
                    <p>• Designing a bloom-succession calendar for all four seasons</p>
                    <p>• Selecting and planting spring bulbs, summer perennials, and fall colour</p>
                    <p>• A year-end review with photos and notes for next season</p>
                  </div>
                )}

                {/* skills: seed varieties count */}
                {gardeningGoalType === "skills" && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium block mb-1">How many varieties do you want to start from seed?</label>
                      <div className="flex gap-2 flex-wrap">
                        {["5", "10", "15", "20"].map(n => (
                          <button key={n} onClick={() => setGdSeedVarieties(n)}
                            className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${gdSeedVarieties === n ? "bg-green-600 text-white border-green-600" : "bg-card hover:bg-secondary border-border"}`}>
                            {n} varieties
                          </button>
                        ))}
                        <Input type="number" min={1} max={50} value={gdSeedVarieties} onChange={e => setGdSeedVarieties(e.target.value)} className="w-20 text-sm h-8" />
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">Your plan will cover seed starting setup, germination tracking, hardening off, and transplanting.</p>
                    </div>
                  </div>
                )}

                {/* relaxation: time per session and days per week */}
                {gardeningGoalType === "relaxation" && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium block mb-1">Minutes per session</label>
                      <div className="flex gap-2 flex-wrap">
                        {["10", "15", "20", "30"].map(n => (
                          <button key={n} onClick={() => setGdMinutes(n)}
                            className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${gdMinutes === n ? "bg-green-600 text-white border-green-600" : "bg-card hover:bg-secondary border-border"}`}>
                            {n} min
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium block mb-1">Days per week</label>
                      <div className="flex gap-2 flex-wrap">
                        {["2", "3", "4", "5"].map(n => (
                          <button key={n} onClick={() => setGdDays(n)}
                            className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${gdDays === n ? "bg-green-600 text-white border-green-600" : "bg-card hover:bg-secondary border-border"}`}>
                            {n}×/week
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">Your plan will help you build a consistent garden routine and track how it affects your sense of calm and wellbeing.</p>
                    </div>
                  </div>
                )}

                <Button onClick={applyGardeningSettings} className="w-full gap-2">
                  Build My Plan <ChevronRight size={14} />
                </Button>
              </div>
            );
          })()}

          {/* ── CLIMBING GOAL WIZARD ── */}
          {climbingMode && (() => {
            const tplMeta = CLIMBING_PLAN_TEMPLATES.find(t => CLIMBING_GOAL_TYPE_MAP[t.id] === climbingGoalType);
            const meta: Record<ClimbingGoalType, { emoji: string; example: string }> = {
              grade:    { emoji: "🧗", example: "e.g. 5.11a sport, V5 boulder, 5.10d trad" },
              volume:   { emoji: "📅", example: "e.g. 2× gym/week + outdoor day each month" },
              strength: { emoji: "💪", example: "e.g. 10 strict pull-ups + 8-week hangboard cycle" },
              safety:   { emoji: "🪢", example: "e.g. Lead 10 new routes, practise falling" },
            };
            const m = climbingGoalType ? meta[climbingGoalType] : null;
            return (
              <div className="space-y-4">
                {/* Header card */}
                <div className="flex items-center gap-3 p-3 rounded-xl border bg-orange-50/60 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800">
                  <span className="text-2xl">{m?.emoji ?? "🧗"}</span>
                  <div>
                    <p className="text-sm font-semibold">{tplMeta?.label}</p>
                    <p className="text-xs text-muted-foreground">{m?.example}</p>
                  </div>
                </div>

                {/* grade: target grade + style + route search */}
                {climbingGoalType === "grade" && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-medium block mb-1">Target grade</label>
                        <Input placeholder="e.g. 5.11a or V5" value={rcTargetGrade} onChange={e => setRcTargetGrade(e.target.value)} className="text-sm" />
                      </div>
                      <div>
                        <label className="text-xs font-medium block mb-1">Style</label>
                        <div className="flex gap-1 flex-wrap">
                          {["Sport", "Boulder", "Trad", "Top Rope"].map(s => (
                            <button key={s} onClick={() => setRcClimbStyle(s)}
                              className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${rcClimbStyle === s ? "bg-orange-600 text-white border-orange-600" : "bg-card hover:bg-secondary border-border"}`}>
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium block mb-1.5">Search for a specific route to project</label>
                      <div className="flex gap-2">
                        <Input placeholder="Search OpenBeta (e.g. 'The Nose', 'Sport Climbing Area')…"
                          value={climbWizardSearch.query} onChange={e => climbWizardSearch.setQuery(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") climbWizardSearch.runSearch(); }}
                          className="text-sm flex-1" />
                        <Button size="sm" variant="outline" onClick={() => climbWizardSearch.runSearch()} disabled={climbWizardSearch.searching || !climbWizardSearch.query.trim()} className="gap-1 shrink-0">
                          {climbWizardSearch.searching ? <RefreshCw size={11} className="animate-spin" /> : <Search size={11} />}
                        </Button>
                      </div>
                      {climbWizardSearch.error && <p className="text-xs text-destructive mt-1">{climbWizardSearch.error}</p>}
                      {climbWizardSearch.results.length > 0 && (
                        <div className="space-y-1 mt-2 max-h-44 overflow-y-auto">
                          <p className="text-[10px] text-muted-foreground">Powered by OpenBeta — click to set as target grade</p>
                          {climbWizardSearch.results.map((r: any) => (
                            <div key={r.id} className="flex items-center gap-2 p-2 rounded-lg border bg-card">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium truncate">{r.name}</p>
                                <p className="text-[10px] text-muted-foreground">{r.climbType}{r.grade ? ` · ${r.grade}` : ""}{r.location ? ` · ${r.location}` : ""}</p>
                              </div>
                              <button onClick={() => { setRcTargetGrade(r.grade || rcTargetGrade); setRcClimbStyle(r.climbType || rcClimbStyle); climbWizardSearch.setResults([]); climbWizardSearch.setQuery(""); }}
                                className="text-[10px] px-2 py-1 rounded bg-orange-600 text-white hover:bg-orange-700 transition-colors shrink-0">Use</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* volume: weekly frequency + outdoor frequency */}
                {climbingGoalType === "volume" && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium block mb-1">Sessions per week</label>
                      <div className="flex gap-2 flex-wrap">
                        {["1", "2", "3", "4"].map(n => (
                          <button key={n} onClick={() => setRcWeeklyFreq(n)}
                            className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${rcWeeklyFreq === n ? "bg-orange-600 text-white border-orange-600" : "bg-card hover:bg-secondary border-border"}`}>
                            {n}×/week
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium block mb-1">Outdoor climbing frequency</label>
                      <div className="flex gap-2 flex-wrap">
                        {[["monthly", "Once a month"], ["bi-monthly", "Every 2 months"], ["quarterly", "Quarterly"], ["seasonal", "Each season"]].map(([val, label]) => (
                          <button key={val} onClick={() => setRcOutdoorFreq(val)}
                            className={`px-2.5 py-1.5 rounded-lg text-xs border transition-colors ${rcOutdoorFreq === val ? "bg-orange-600 text-white border-orange-600" : "bg-card hover:bg-secondary border-border"}`}>
                            {label}
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">Your plan will include gym sessions, technique work, and regular outdoor crag days.</p>
                    </div>
                  </div>
                )}

                {/* strength: pull-up target + hangboard toggle */}
                {climbingGoalType === "strength" && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium block mb-1">Pull-up target (strict reps)</label>
                      <div className="flex gap-2 flex-wrap items-center">
                        {["5", "8", "10", "15", "20"].map(n => (
                          <button key={n} onClick={() => setRcPullUpTarget(n)}
                            className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${rcPullUpTarget === n ? "bg-orange-600 text-white border-orange-600" : "bg-card hover:bg-secondary border-border"}`}>
                            {n} reps
                          </button>
                        ))}
                        <Input type="number" min={1} max={50} value={rcPullUpTarget} onChange={e => setRcPullUpTarget(e.target.value)} className="w-16 text-sm h-8" />
                      </div>
                    </div>
                    <label className="flex items-center gap-2.5 text-xs cursor-pointer select-none p-3 rounded-xl border bg-card">
                      <input type="checkbox" checked={rcHangboard} onChange={e => setRcHangboard(e.target.checked)} className="rounded" />
                      <div>
                        <p className="font-medium">Include a structured hangboard cycle</p>
                        <p className="text-muted-foreground">7-3 repeaters, 4 weeks on / 1 deload — builds finger strength and contact strength</p>
                      </div>
                    </label>
                  </div>
                )}

                {/* safety: lead routes target */}
                {climbingGoalType === "safety" && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium block mb-1">Lead routes target</label>
                      <div className="flex gap-2 flex-wrap">
                        {["5", "10", "15", "20"].map(n => (
                          <button key={n} onClick={() => setRcLeadRoutes(n)}
                            className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${rcLeadRoutes === n ? "bg-orange-600 text-white border-orange-600" : "bg-card hover:bg-secondary border-border"}`}>
                            {n} routes
                          </button>
                        ))}
                        <Input type="number" min={1} max={100} value={rcLeadRoutes} onChange={e => setRcLeadRoutes(e.target.value)} className="w-20 text-sm h-8" />
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">Your plan covers fall practice, progressive clipping, and tracking clean leads.</p>
                    </div>
                  </div>
                )}

                <Button onClick={applyClimbingSettings} className="w-full gap-2">
                  Build My Plan <ChevronRight size={14} />
                </Button>
              </div>
            );
          })()}

          {/* ── SURFING GOAL WIZARD ── */}
          {surfingMode && (() => {
            const tplMeta = SURFING_PLAN_TEMPLATES.find(t => SURFING_GOAL_TYPE_MAP[t.id] === surfingGoalType);
            const meta: Record<SurfingGoalType, { emoji: string; example: string }> = {
              consistency: { emoji: "🗓️", example: "e.g. 30 sessions by end of summer" },
              skill:       { emoji: "🌊", example: "e.g. Whitewater → catching green waves" },
              technique:   { emoji: "🏄", example: "e.g. Smooth pop-up every session" },
              exploration: { emoji: "🗺️", example: "e.g. New break + a bigger swell day" },
            };
            const m = surfingGoalType ? meta[surfingGoalType] : null;
            return (
              <div className="space-y-4">
                {/* Header card */}
                <div className="flex items-center gap-3 p-3 rounded-xl border bg-cyan-50/60 dark:bg-cyan-950/20 border-cyan-200 dark:border-cyan-800">
                  <span className="text-2xl">{m?.emoji ?? "🏄"}</span>
                  <div>
                    <p className="text-sm font-semibold">{tplMeta?.label}</p>
                    <p className="text-xs text-muted-foreground">{m?.example}</p>
                  </div>
                </div>

                {/* consistency: session target */}
                {surfingGoalType === "consistency" && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium block mb-1">Session target</label>
                      <div className="flex gap-2 flex-wrap">
                        {["20", "30", "40", "52"].map(n => (
                          <button key={n} onClick={() => setSfSessionTarget(n)}
                            className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${sfSessionTarget === n ? "bg-cyan-600 text-white border-cyan-600" : "bg-card hover:bg-secondary border-border"}`}>
                            {n} sessions
                          </button>
                        ))}
                        <Input type="number" min={1} max={365} value={sfSessionTarget} onChange={e => setSfSessionTarget(e.target.value)} className="w-20 text-sm h-8" />
                      </div>
                      {Number(sfSessionTarget) > 0 && (
                        <p className="text-[10px] text-muted-foreground mt-1">≈ {(Number(sfSessionTarget) / 16).toFixed(1)} sessions per week over 16 weeks</p>
                      )}
                    </div>
                  </div>
                )}

                {/* skill: current level */}
                {surfingGoalType === "skill" && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium block mb-1">Current level</label>
                      <div className="flex gap-2 flex-wrap">
                        {["whitewater", "foamball only", "catching some green waves", "riding down the line"].map(lvl => (
                          <button key={lvl} onClick={() => setSfCurrentLevel(lvl)}
                            className={`px-2.5 py-1.5 rounded-lg text-xs border transition-colors ${sfCurrentLevel === lvl ? "bg-cyan-600 text-white border-cyan-600" : "bg-card hover:bg-secondary border-border"}`}>
                            {lvl}
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">Your plan will bridge from your current level to consistently catching unbroken green waves.</p>
                    </div>
                  </div>
                )}

                {/* technique: pop-up target + note */}
                {surfingGoalType === "technique" && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium block mb-1">Pop-up goal</label>
                      <div className="flex gap-2 flex-wrap">
                        {["smooth and automatic", "consistent every time", "no hesitation or stumble"].map(g => (
                          <button key={g} onClick={() => setSfPopUpTarget(g)}
                            className={`px-2.5 py-1.5 rounded-lg text-xs border transition-colors ${sfPopUpTarget === g ? "bg-cyan-600 text-white border-cyan-600" : "bg-card hover:bg-secondary border-border"}`}>
                            {g}
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">Your plan includes land drills, paddle fitness, and in-water technique work.</p>
                    </div>
                  </div>
                )}

                {/* exploration: new break + swell target */}
                {surfingGoalType === "exploration" && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium block mb-1">New break to surf (optional)</label>
                      <Input placeholder="e.g. Rincon, Pipeline, your local point break" value={sfNewBreak}
                        onChange={e => setSfNewBreak(e.target.value)} className="text-sm" />
                    </div>
                    <div>
                      <label className="text-xs font-medium block mb-1">Stretch swell target</label>
                      <div className="flex gap-2 flex-wrap">
                        {["waist-high", "shoulder-high", "overhead", "overhead+"].map(s => (
                          <button key={s} onClick={() => setSfSwellTarget(s)}
                            className={`px-2.5 py-1.5 rounded-lg text-xs border transition-colors ${sfSwellTarget === s ? "bg-cyan-600 text-white border-cyan-600" : "bg-card hover:bg-secondary border-border"}`}>
                            {s}
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">Pick a swell that's bigger than you'd normally paddle out in — but still safe for your level.</p>
                    </div>
                  </div>
                )}

                <Button onClick={applySurfingSettings} className="w-full gap-2">
                  Build My Plan <ChevronRight size={14} />
                </Button>
              </div>
            );
          })()}

          {/* ── RUNNING GOAL WIZARD ── */}
          {runningMode && (() => {
            const tplMeta = RUNNING_PLAN_TEMPLATES.find(t => RUNNING_GOAL_TYPE_MAP[t.id] === runningGoalType);
            const meta: Record<RunningGoalType, { emoji: string; example: string }> = {
              consistency: { emoji: "🗓️", example: "e.g. Run 3×/week every week this year" },
              distance:    { emoji: "📏", example: "e.g. Complete a half marathon in October" },
              time:        { emoji: "⏱️", example: "e.g. Sub-25 5K, sub-2:00 half marathon" },
              enjoyment:   { emoji: "😊", example: "e.g. 6 parkruns + 3 trail runs this year" },
            };
            const m = runningGoalType ? meta[runningGoalType] : null;
            return (
              <div className="space-y-4">
                {/* Header card */}
                <div className="flex items-center gap-3 p-3 rounded-xl border bg-sky-50/60 dark:bg-sky-950/20 border-sky-200 dark:border-sky-800">
                  <span className="text-2xl">{m?.emoji ?? "🏃"}</span>
                  <div>
                    <p className="text-sm font-semibold">{tplMeta?.label}</p>
                    <p className="text-xs text-muted-foreground">{m?.example}</p>
                  </div>
                </div>

                {/* consistency: runs per week */}
                {runningGoalType === "consistency" && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium block mb-1">Runs per week</label>
                      <div className="flex gap-2 flex-wrap">
                        {["2", "3", "4", "5"].map(n => (
                          <button key={n} onClick={() => setRnRunsPerWeek(n)}
                            className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${rnRunsPerWeek === n ? "bg-sky-600 text-white border-sky-600" : "bg-card hover:bg-secondary border-border"}`}>
                            {n}×/week
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">That's {Math.round(Number(rnRunsPerWeek) * 52)} runs over the year. Consistency over intensity.</p>
                    </div>
                  </div>
                )}

                {/* distance: race type + distance target */}
                {runningGoalType === "distance" && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium block mb-1">Race type / target</label>
                      <div className="flex gap-2 flex-wrap">
                        {["5K", "10K", "Half Marathon", "Marathon"].map(r => (
                          <button key={r} onClick={() => setRnRaceType(r)}
                            className={`px-2.5 py-1.5 rounded-lg text-xs border transition-colors ${rnRaceType === r ? "bg-sky-600 text-white border-sky-600" : "bg-card hover:bg-secondary border-border"}`}>
                            {r}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium block mb-1">Specific race or event name (optional)</label>
                      <Input placeholder="e.g. Chicago Marathon, local parkrun" value={rnDistanceTarget}
                        onChange={e => setRnDistanceTarget(e.target.value)} className="text-sm" />
                    </div>
                  </div>
                )}

                {/* time: race type + target time + current time */}
                {runningGoalType === "time" && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium block mb-1">Race distance</label>
                      <div className="flex gap-2 flex-wrap">
                        {["5K", "10K", "Half Marathon", "Marathon"].map(r => (
                          <button key={r} onClick={() => setRnRaceType(r)}
                            className={`px-2.5 py-1.5 rounded-lg text-xs border transition-colors ${rnRaceType === r ? "bg-sky-600 text-white border-sky-600" : "bg-card hover:bg-secondary border-border"}`}>
                            {r}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-medium block mb-1">Target time *</label>
                        <Input placeholder="e.g. 25:00" value={rnTargetTime}
                          onChange={e => setRnTargetTime(e.target.value)} className="text-sm" />
                      </div>
                      <div>
                        <label className="text-xs font-medium block mb-1">Current best (optional)</label>
                        <Input placeholder="e.g. 28:30" value={rnCurrentTime}
                          onChange={e => setRnCurrentTime(e.target.value)} className="text-sm" />
                      </div>
                    </div>
                  </div>
                )}

                {/* enjoyment: fun run count + trail run count */}
                {runningGoalType === "enjoyment" && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium block mb-1">Fun-run / parkrun target</label>
                      <div className="flex gap-2 flex-wrap">
                        {["4", "6", "8", "12"].map(n => (
                          <button key={n} onClick={() => setRnFunRunCount(n)}
                            className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${rnFunRunCount === n ? "bg-sky-600 text-white border-sky-600" : "bg-card hover:bg-secondary border-border"}`}>
                            {n} events
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium block mb-1">Trail runs target</label>
                      <div className="flex gap-2 flex-wrap">
                        {["1", "3", "6", "12"].map(n => (
                          <button key={n} onClick={() => setRnTrailRuns(n)}
                            className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${rnTrailRuns === n ? "bg-sky-600 text-white border-sky-600" : "bg-card hover:bg-secondary border-border"}`}>
                            {n} trail runs
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">Trail running is the gateway drug — beautiful views, soft ground, and no pace pressure.</p>
                    </div>
                  </div>
                )}

                <Button onClick={applyRunningSettings} className="w-full gap-2">
                  Build My Plan <ChevronRight size={14} />
                </Button>
              </div>
            );
          })()}

          {/* ── CYCLING GOAL WIZARD ── */}
          {cyclingMode && (() => {
            const tplMeta = CYCLING_PLAN_TEMPLATES.find(t => CYCLING_GOAL_TYPE_MAP[t.id] === cyclingGoalType);
            const meta: Record<CyclingGoalType, { emoji: string; example: string }> = {
              frequency: { emoji: "🚲", example: "e.g. 150 rides this year (~3 per week)" },
              distance:  { emoji: "📏", example: "e.g. Ride 2,000 miles this year" },
              elevation: { emoji: "📈", example: "e.g. 100,000 feet of climbing this year" },
              event:     { emoji: "🏅", example: "e.g. First century ride, Gran Fondo" },
              routes:    { emoji: "📋", example: "e.g. Finish local club's 20 classic routes" },
            };
            const m = cyclingGoalType ? meta[cyclingGoalType] : null;
            return (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 rounded-xl border bg-blue-50/60 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                  <span className="text-2xl">{m?.emoji ?? "🚲"}</span>
                  <div>
                    <p className="text-sm font-semibold">{tplMeta?.label}</p>
                    <p className="text-xs text-muted-foreground">{m?.example}</p>
                  </div>
                </div>

                {/* FREQUENCY */}
                {cyclingGoalType === "frequency" && (
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Target ride count *</label>
                    <Input type="number" min={1} max={365} placeholder="e.g. 150" value={cyCount} onChange={e => setCyCount(e.target.value)} className="text-sm" />
                    {Number(cyCount) > 0 && <p className="text-[10px] text-muted-foreground mt-1">≈ {(Number(cyCount) / 52).toFixed(1)} rides per week over a year</p>}
                  </div>
                )}

                {/* DISTANCE */}
                {cyclingGoalType === "distance" && (
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Target miles *</label>
                    <Input type="number" min={1} placeholder="e.g. 2000" value={cyMiles} onChange={e => setCyMiles(e.target.value)} className="text-sm" />
                    {Number(cyMiles) > 0 && <p className="text-[10px] text-muted-foreground mt-1">≈ {Math.round(Number(cyMiles) / 52)} miles per week over a year</p>}
                  </div>
                )}

                {/* ELEVATION */}
                {cyclingGoalType === "elevation" && (
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Target elevation gain (feet) *</label>
                    <Input type="number" min={1000} step={1000} placeholder="e.g. 100000" value={cyFeet} onChange={e => setCyFeet(e.target.value)} className="text-sm" />
                    {Number(cyFeet) > 0 && <p className="text-[10px] text-muted-foreground mt-1">≈ {Math.round(Number(cyFeet) / 52).toLocaleString()} ft/week over a year</p>}
                  </div>
                )}

                {/* EVENT */}
                {cyclingGoalType === "event" && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Event name (optional)</label>
                      <Input placeholder="e.g. L'Étape du Tour, Ride London, local century…" value={cyEventName} onChange={e => setCyEventName(e.target.value)} className="text-sm" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Event distance (miles) *</label>
                        <Input type="number" min={1} placeholder="e.g. 100" value={cyEventDist} onChange={e => setCyEventDist(e.target.value)} className="text-sm" />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Event date (optional)</label>
                        <Input type="date" value={cyEventDate} onChange={e => setCyEventDate(e.target.value)} className="text-sm" />
                      </div>
                    </div>
                    {/* Route search for the event */}
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Find route via search (optional)</label>
                      <div className="flex gap-2">
                        <Input placeholder="Search near… (e.g. London, Bristol)"
                          value={cycleRouteSearch.locationInput} onChange={e => cycleRouteSearch.setLocationInput(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") cycleRouteSearch.runSearch(); }}
                          className="text-sm h-8 flex-1" />
                        <Button size="sm" variant="outline" onClick={() => cycleRouteSearch.runSearch()} disabled={cycleRouteSearch.searching || !cycleRouteSearch.locationInput.trim()} className="h-8 gap-1 shrink-0">
                          {cycleRouteSearch.searching ? <RefreshCw size={11} className="animate-spin" /> : <Search size={11} />}
                        </Button>
                      </div>
                      {cycleRouteSearch.searchError && <p className="text-xs text-destructive mt-1">{cycleRouteSearch.searchError}</p>}
                      {cycleRouteSearch.searchResults.length > 0 && (
                        <div className="mt-1.5 space-y-1 max-h-36 overflow-y-auto">
                          {cycleRouteSearch.searchResults.map((r: any) => (
                            <button key={r.id} onClick={() => { setCyEventName(r.name); if (r.length > 0) setCyEventDist(String(r.length)); cycleRouteSearch.setSearchResults([]); }}
                              className="w-full text-left p-2 rounded border text-xs hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-colors">
                              <span className="font-medium">{r.name}</span>{r.length > 0 ? <span className="text-muted-foreground ml-1">({r.length} mi)</span> : ""}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ROUTE LIST */}
                {cyclingGoalType === "routes" && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">List / challenge name</label>
                        <Input placeholder='e.g. "Club 20 Classics"' value={cyListName} onChange={e => setCyListName(e.target.value)} className="text-sm" />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Total route count</label>
                        <Input type="number" min={1} placeholder="e.g. 20" value={cyListCount} onChange={e => setCyListCount(e.target.value)} className="text-sm" />
                      </div>
                    </div>
                    {/* Route search */}
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                        Add specific routes to the plan{planRoutes.length > 0 ? ` (${planRoutes.length} added)` : " (optional)"}
                      </label>
                      <div className="flex gap-2">
                        <Input placeholder="Search route name or location…"
                          value={cycleRouteSearch.locationInput} onChange={e => cycleRouteSearch.setLocationInput(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") cycleRouteSearch.runSearch(); }}
                          className="text-sm h-8 flex-1" />
                        <Button size="sm" variant="outline" onClick={() => cycleRouteSearch.runSearch()} disabled={cycleRouteSearch.searching || !cycleRouteSearch.locationInput.trim()} className="h-8 gap-1 shrink-0">
                          {cycleRouteSearch.searching ? <RefreshCw size={11} className="animate-spin" /> : <Search size={11} />}
                          {cycleRouteSearch.searching ? "…" : "Search"}
                        </Button>
                      </div>
                      {cycleRouteSearch.searchError && <p className="text-xs text-destructive mt-1">{cycleRouteSearch.searchError}</p>}
                      {cycleRouteSearch.searchResults.length > 0 && (
                        <div className="mt-1.5 space-y-1 max-h-40 overflow-y-auto">
                          <p className="text-[10px] text-muted-foreground">{cycleRouteSearch.searchResults.length} routes found — click to add</p>
                          {cycleRouteSearch.searchResults.map((r: any) => {
                            const added = planRoutes.some(p => p.id === r.id);
                            return (
                              <button key={r.id} disabled={added} onClick={() => setPlanRoutes(p => [...p, r])}
                                className={`w-full text-left flex items-center justify-between p-2 rounded border text-xs transition-colors ${added ? "opacity-50 cursor-not-allowed bg-secondary" : "hover:bg-blue-50 dark:hover:bg-blue-950/20"}`}>
                                <span><span className="font-medium">{r.name}</span>{r.length > 0 ? <span className="text-muted-foreground ml-1">({r.length} mi)</span> : ""}</span>
                                {added ? <Check size={11} className="text-blue-600 shrink-0" /> : <Plus size={11} className="text-muted-foreground shrink-0" />}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      {planRoutes.length > 0 && (
                        <div className="mt-2 space-y-1">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Added to plan ({planRoutes.length})</p>
                          {planRoutes.map((r, i) => (
                            <div key={r.id} className="flex items-center justify-between text-xs p-1.5 rounded bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                              <span className="truncate">{i + 1}. {r.name}{r.length > 0 ? <span className="text-muted-foreground ml-1">({r.length} mi)</span> : ""}</span>
                              <button onClick={() => setPlanRoutes(p => p.filter(x => x.id !== r.id))} className="ml-2 text-muted-foreground hover:text-destructive shrink-0"><X size={11} /></button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <Button
                  onClick={applyCyclingSettings}
                  disabled={
                    (cyclingGoalType === "frequency" && !cyCount) ||
                    (cyclingGoalType === "distance"  && !cyMiles) ||
                    (cyclingGoalType === "elevation" && !cyFeet)  ||
                    (cyclingGoalType === "event"     && !cyEventDist)
                  }
                  className="w-full gap-2"
                >
                  Build My Plan <ChevronRight size={14} />
                </Button>
              </div>
            );
          })()}

          {/* ── CHESS GOAL WIZARD (non-rating types) ── */}
          {chessMode && !chessEloMode && (() => {
            const tplMeta = CHESS_PLAN_TEMPLATES.find(t => CHESS_GOAL_TYPE_MAP[t.id] === chessGoalType);
            const ENDGAME_OPTIONS = ["King and pawn endings", "Rook endings", "Queen endings", "Bishop endings", "Knight endings", "Pawn structure"];
            return (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 rounded-xl border bg-indigo-50/60 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-800">
                  <span className="text-2xl">{tplMeta?.emoji ?? "♟️"}</span>
                  <div>
                    <p className="text-sm font-semibold">{tplMeta?.label}</p>
                    <p className="text-xs text-muted-foreground">{tplMeta?.description}</p>
                  </div>
                </div>

                {/* STUDY HABIT */}
                {chessGoalType === "study" && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Minutes per session *</label>
                        <Input type="number" min={5} max={180} placeholder="e.g. 30" value={studyMins} onChange={e => setStudyMins(e.target.value)} className="text-sm" />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Days per week *</label>
                        <Input type="number" min={1} max={7} placeholder="e.g. 5" value={studyDays} onChange={e => setStudyDays(e.target.value)} className="text-sm" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Primary focus</label>
                      <div className="flex gap-2 flex-wrap">
                        {["Tactics", "Openings", "Endgames", "All-around"].map(f => (
                          <button key={f} onClick={() => setStudyFocus(f)}
                            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${studyFocus === f ? "bg-indigo-600 text-white border-indigo-600" : "bg-card hover:bg-secondary"}`}>
                            {f}
                          </button>
                        ))}
                      </div>
                    </div>
                    {studyMins && studyDays && (
                      <p className="text-[10px] text-muted-foreground bg-secondary/50 rounded-lg px-3 py-2">
                        ≈ {Math.round(Number(studyMins) * Number(studyDays) / 60 * 10) / 10} hrs/week · {Math.round(Number(studyMins) * Number(studyDays) * 8 / 60)} hrs over 8 weeks
                      </p>
                    )}
                  </div>
                )}

                {/* OPENINGS */}
                {chessGoalType === "openings" && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">You are playing as</label>
                      <div className="flex gap-2">
                        {["White", "Black"].map(c => (
                          <button key={c} onClick={() => setOpeningColor(c)}
                            className={`flex-1 text-sm py-2 rounded-lg border font-medium transition-colors ${openingColor === c ? "bg-indigo-600 text-white border-indigo-600" : "bg-card hover:bg-secondary"}`}>
                            {c === "White" ? "♔ White" : "♚ Black"}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Main opponent response to address</label>
                      <div className="flex gap-2 flex-wrap">
                        {(openingColor === "White"
                          ? ["1...e5", "1...c5", "1...d5", "1...e6", "Other"]
                          : ["1.e4", "1.d4", "1.c4", "1.Nf3", "Other"]
                        ).map(r => (
                          <button key={r} onClick={() => setOpeningVsResponse(r)}
                            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors font-mono ${openingVsResponse === r ? "bg-indigo-600 text-white border-indigo-600" : "bg-card hover:bg-secondary"}`}>
                            {r}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">System name (optional)</label>
                      <Input placeholder="e.g. Italian Game, Sicilian Najdorf, London System…" value={openingSystem} onChange={e => setOpeningSystem(e.target.value)} className="text-sm" />
                    </div>
                  </div>
                )}

                {/* ENDGAMES */}
                {chessGoalType === "endgames" && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Topics to cover (select all that apply)</label>
                      <div className="flex gap-2 flex-wrap">
                        {ENDGAME_OPTIONS.map(topic => {
                          const active = endgameTopics.includes(topic);
                          return (
                            <button key={topic} onClick={() => setEndgameTopics(t => active ? t.filter(x => x !== topic) : [...t, topic])}
                              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${active ? "bg-indigo-600 text-white border-indigo-600" : "bg-card hover:bg-secondary"}`}>
                              {topic}
                            </button>
                          );
                        })}
                      </div>
                      {endgameTopics.length === 0 && <p className="text-[10px] text-destructive mt-1">Select at least one topic</p>}
                    </div>
                    <p className="text-[10px] text-muted-foreground">Recommended resource: <em>Silman's Complete Endgame Course</em> or Lichess Endgame Practice</p>
                  </div>
                )}

                {/* TOURNAMENT */}
                {chessGoalType === "tournament" && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Event type</label>
                      <div className="flex gap-2">
                        {["OTB", "Online"].map(et => (
                          <button key={et} onClick={() => setTournamentType(et)}
                            className={`flex-1 text-sm py-2 rounded-lg border font-medium transition-colors ${tournamentType === et ? "bg-indigo-600 text-white border-indigo-600" : "bg-card hover:bg-secondary"}`}>
                            {et === "OTB" ? "🏛️ Over the Board" : "💻 Online"}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Target event date (optional)</label>
                      <Input type="date" value={tournamentDate} onChange={e => setTournamentDate(e.target.value)} className="text-sm" />
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {tournamentType === "OTB" ? "Find local clubs and events at uschess.org or your national federation." : "Chess.com and Lichess host rated tournaments daily."}
                    </p>
                  </div>
                )}

                <Button
                  onClick={applyChessSettings}
                  disabled={chessGoalType === "endgames" && endgameTopics.length === 0}
                  className="w-full gap-2"
                >
                  Build My Plan <ChevronRight size={14} />
                </Button>
              </div>
            );
          })()}

          {/* CHESS ELO STEP */}
          {chessEloMode && (
            <>
              <div className="flex items-center gap-3 p-3 rounded-xl border bg-indigo-50/60 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-800">
                <span className="text-2xl">⚡</span>
                <div>
                  <p className="text-sm font-semibold">Improve your rating</p>
                  <p className="text-xs text-muted-foreground">{selectedHobby?.name} · Games & Mind</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Current ELO *</label>
                  <Input type="number" min={100} max={3500} placeholder="e.g. 800"
                    value={currentElo} onChange={e => setCurrentElo(e.target.value)} className="text-sm" />
                  <p className="text-[10px] text-muted-foreground mt-1">Your Chess.com / Lichess rating</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Target ELO *</label>
                  <Input type="number" min={100} max={3500} placeholder="e.g. 1200"
                    value={targetElo} onChange={e => setTargetElo(e.target.value)} className="text-sm" />
                  <p className="text-[10px] text-muted-foreground mt-1">The rating you want to reach</p>
                </div>
              </div>
              {eloDuration && Number(targetElo) > Number(currentElo) && (
                <div className="rounded-xl border bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">Your Plan Preview</p>
                    <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">+{eloGap} ELO</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-secondary/50 rounded-lg py-2 px-1">
                      <p className="text-base font-bold">{eloDuration.months}</p>
                      <p className="text-[10px] text-muted-foreground">months</p>
                    </div>
                    <div className="bg-secondary/50 rounded-lg py-2 px-1">
                      <p className="text-base font-bold">~{eloDuration.monthlyGain}</p>
                      <p className="text-[10px] text-muted-foreground">ELO / month</p>
                    </div>
                    <div className="bg-secondary/50 rounded-lg py-2 px-1">
                      <p className="text-base font-bold">4</p>
                      <p className="text-[10px] text-muted-foreground">phases</p>
                    </div>
                  </div>
                  <div className="space-y-1.5 pt-1 border-t">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Phase breakdown</p>
                    {CHESS_PHASES.map((ph, i) => {
                      const phaseMonths = Math.round(eloDuration.months / 4);
                      const startM = i * phaseMonths + 1;
                      const endM = Math.min((i + 1) * phaseMonths, eloDuration.months);
                      const targetAtEnd = Math.round(Number(currentElo) + (eloGap / 4) * (i + 1));
                      return (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <span className="w-16 shrink-0 text-muted-foreground font-medium">Mo {startM}–{endM}</span>
                          <div className="flex-1 min-w-0">
                            <span className="font-medium">{ph.name}</span>
                            <span className="text-muted-foreground"> · target ~{targetAtEnd}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Weekly schedule preview */}
                  {(() => {
                    const band = getChessWeeklyBand(Number(currentElo));
                    const _DAYS_WK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
                    return (
                      <div className="space-y-2 pt-1 border-t">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                          <span>Auto-generated daily schedule</span>
                          <span className="text-indigo-500 font-semibold">{band.bandLabel} Band</span>
                        </p>
                        <p className="text-[10px] text-muted-foreground italic">{band.highLevelFocus}</p>
                        <div className="space-y-1">
                          {_DAYS_WK.map(d => {
                            const entry = band.days[d];
                            return (
                              <div key={d} className="flex items-start gap-2 text-[10px]">
                                <span className="w-7 shrink-0 font-bold text-muted-foreground">{d}</span>
                                <div className="flex-1 min-w-0">
                                  <span className="font-semibold">{entry.dayLabel}</span>
                                  <span className="text-muted-foreground"> — {entry.taskDetail}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                  <p className="text-[10px] text-muted-foreground border-t pt-2">Recommended: 3–10 hrs/week · daily tactics puzzles + rated game play</p>
                </div>
              )}
              {Number(targetElo) > 0 && Number(currentElo) > 0 && Number(targetElo) <= Number(currentElo) && (
                <p className="text-xs text-destructive text-center py-1">Target ELO must be higher than your current rating</p>
              )}
            </>
          )}

          {/* ── POKER GOAL WIZARD (non-stakes types) ── */}
          {pokerGoalMode && (() => {
            const tplMeta = POKER_PLAN_TEMPLATES.find(t => POKER_GOAL_TYPE_MAP[t.id] === pokerGoalType);
            const STUDY_METHODS = ["Hand review", "GTO solver", "Video courses", "Coaching", "Database analysis"];
            return (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 rounded-xl border bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800">
                  <span className="text-2xl">{tplMeta?.emoji ?? "♠️"}</span>
                  <div>
                    <p className="text-sm font-semibold">{tplMeta?.label}</p>
                    <p className="text-xs text-muted-foreground">{tplMeta?.description}</p>
                  </div>
                </div>

                {/* VOLUME */}
                {pokerGoalType === "volume" && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Target hands *</label>
                      <Input type="number" min={1000} step={1000} placeholder="e.g. 50000" value={pkHandsTarget} onChange={e => setPkHandsTarget(e.target.value)} className="text-sm" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Per</label>
                      <div className="flex gap-2">
                        {["day", "week", "month"].map(p => (
                          <button key={p} onClick={() => setPkPeriod(p)}
                            className={`flex-1 text-sm py-2 rounded-lg border font-medium capitalize transition-colors ${pkPeriod === p ? "bg-emerald-600 text-white border-emerald-600" : "bg-card hover:bg-secondary"}`}>
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>
                    {pkHandsTarget && <p className="text-[10px] text-muted-foreground bg-secondary/50 rounded-lg px-3 py-2">
                      ≈ {Math.round(Number(pkHandsTarget) / (pkPeriod === "day" ? 1 : pkPeriod === "week" ? 7 : 30))} hands/day session target
                    </p>}
                  </div>
                )}

                {/* STUDY */}
                {pokerGoalType === "study" && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Study hours per week *</label>
                      <Input type="number" min={1} max={40} step={0.5} placeholder="e.g. 5" value={pkStudyHours} onChange={e => setPkStudyHours(e.target.value)} className="text-sm" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Study methods (select all)</label>
                      <div className="flex gap-2 flex-wrap">
                        {STUDY_METHODS.map(m => {
                          const active = pkStudyMethods.includes(m);
                          return (
                            <button key={m} onClick={() => setPkStudyMethods(s => active ? s.filter(x => x !== m) : [...s, m])}
                              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${active ? "bg-emerald-600 text-white border-emerald-600" : "bg-card hover:bg-secondary"}`}>
                              {m}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    {pkStudyHours && <p className="text-[10px] text-muted-foreground bg-secondary/50 rounded-lg px-3 py-2">
                      ≈ {Math.round(Number(pkStudyHours) * 8)} hrs over 8 weeks · {Number(pkStudyHours) >= 5 ? "strong improvement expected" : "solid foundation building"}
                    </p>}
                  </div>
                )}

                {/* WIN RATE */}
                {pokerGoalType === "winrate" && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Target bb/100 *</label>
                        <Input type="number" min={1} max={30} step={0.5} placeholder="e.g. 8" value={pkWrTarget} onChange={e => setPkWrTarget(e.target.value)} className="text-sm" />
                        <p className="text-[10px] text-muted-foreground mt-1">Good reg: 5–8 bb/100; elite: 10+</p>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Stake *</label>
                        <Select value={pkWrStake} onValueChange={setPkWrStake}>
                          <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {POKER_STAKES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Hand sample target *</label>
                      <div className="flex gap-2 flex-wrap">
                        {["50000", "100000", "200000"].map(h => (
                          <button key={h} onClick={() => setPkWrHandSample(h)}
                            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${pkWrHandSample === h ? "bg-emerald-600 text-white border-emerald-600" : "bg-card hover:bg-secondary"}`}>
                            {Number(h).toLocaleString()} hands
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">100k+ is statistically meaningful</p>
                    </div>
                  </div>
                )}

                {/* TOURNAMENT */}
                {pokerGoalType === "tournament" && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Event type</label>
                      <div className="flex gap-2 flex-wrap">
                        {["Live MTT", "Online MTT", "Live Series (WSOP/WPT)", "Satellite"].map(et => (
                          <button key={et} onClick={() => setPkTourneyType(et)}
                            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${pkTourneyType === et ? "bg-emerald-600 text-white border-emerald-600" : "bg-card hover:bg-secondary"}`}>
                            {et}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Specific goal (optional)</label>
                      <Input placeholder='e.g. "Cash in a WSOP event", "Final table local major"…' value={pkTourneyTarget} onChange={e => setPkTourneyTarget(e.target.value)} className="text-sm" />
                    </div>
                  </div>
                )}

                <Button
                  onClick={applyPokerGoalSettings}
                  disabled={
                    (pokerGoalType === "volume"  && !pkHandsTarget) ||
                    (pokerGoalType === "study"   && (!pkStudyHours || pkStudyMethods.length === 0)) ||
                    (pokerGoalType === "winrate" && (!pkWrTarget || !pkWrStake))
                  }
                  className="w-full gap-2"
                >
                  Build My Plan <ChevronRight size={14} />
                </Button>
              </div>
            );
          })()}

          {/* POKER STEP */}
          {pokerMode && (
            <>
              <div className="flex items-center gap-3 p-3 rounded-xl border bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800">
                <span className="text-2xl">♠️</span>
                <div>
                  <p className="text-sm font-semibold">Improve your game</p>
                  <p className="text-xs text-muted-foreground">{selectedHobby?.name} · Games & Mind</p>
                </div>
              </div>

              {/* Stake selectors */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Current Stake *</label>
                  <Select value={currentStake} onValueChange={v => { setCurrentStake(v as PokerStake); setTargetStake(""); }}>
                    <SelectTrigger className="text-sm"><SelectValue placeholder="Select stake…" /></SelectTrigger>
                    <SelectContent>
                      {POKER_STAKES.slice(0, -1).map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground mt-1">The stake you play now</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Target Stake *</label>
                  <Select value={targetStake} onValueChange={v => setTargetStake(v as PokerStake)} disabled={!currentStake}>
                    <SelectTrigger className="text-sm"><SelectValue placeholder="Select target…" /></SelectTrigger>
                    <SelectContent>
                      {POKER_STAKES.filter((_, i) => i > POKER_STAKES.indexOf(currentStake as PokerStake)).map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground mt-1">The stake you want to beat</p>
                </div>
              </div>

              {/* Dynamic plan preview */}
              {pokerDuration && pokerJumps > 0 && (
                <div className="rounded-xl border bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">Your Plan Preview</p>
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      {currentStake} → {targetStake}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-secondary/50 rounded-lg py-2 px-1">
                      <p className="text-base font-bold">{pokerDuration.months}</p>
                      <p className="text-[10px] text-muted-foreground">months</p>
                    </div>
                    <div className="bg-secondary/50 rounded-lg py-2 px-1">
                      <p className="text-base font-bold">{pokerJumps}</p>
                      <p className="text-[10px] text-muted-foreground">stake jump{pokerJumps !== 1 ? "s" : ""}</p>
                    </div>
                    <div className="bg-secondary/50 rounded-lg py-2 px-1">
                      <p className="text-base font-bold">4</p>
                      <p className="text-[10px] text-muted-foreground">phases</p>
                    </div>
                  </div>
                  <div className="space-y-1.5 pt-1 border-t">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Phase breakdown</p>
                    {POKER_PHASES.map((ph, i) => {
                      const phaseMonths = Math.round(pokerDuration.months / 4);
                      const startM = i * phaseMonths + 1;
                      const endM = Math.min((i + 1) * phaseMonths, pokerDuration.months);
                      return (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <span className="w-16 shrink-0 text-muted-foreground font-medium">Mo {startM}–{endM}</span>
                          <div className="flex-1 min-w-0">
                            <span className="font-medium">{ph.name}</span>
                            <span className="text-muted-foreground"> · {ph.milestone}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-muted-foreground border-t pt-2">Recommended: 3–10 hrs/week · track every session · 20+ buy-in bankroll rule</p>
                </div>
              )}
            </>
          )}

          {/* STEP 1 */}
          {step === 1 && !chessEloMode && !chessMode && !pokerMode && !pokerGoalMode && !hikingMode && !cyclingMode && !fishingMode && !gardeningMode && !climbingMode && !birdMode && !langMode && !instrMode && (
            <>
              {!skipHobbyPicker && (
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Which hobby?</label>
                {hobbies.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4 border rounded-lg border-dashed">Add a hobby first</p>
                ) : (
                  <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto">
                    {hobbies.filter(h => h.status !== "retired").map(h => {
                      const ti = HOBBY_TYPE_MAP[h.hobbyType as HobbyType];
                      const HIcon = ti?.icon ?? Palette;
                      const sel = h.id === selectedHobbyId;
                      return (
                        <button key={h.id} onClick={() => { setSelectedHobbyId(h.id); setSelectedTemplate(null); }}
                          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left transition-all ${sel ? "border-2" : "border hover:bg-secondary/50"}`}
                          style={sel ? { borderColor: ti?.color, backgroundColor: (ti?.color ?? "#888") + "15" } : {}}
                        >
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: (ti?.color ?? "#888") + "22" }}>
                            <HIcon size={13} style={{ color: ti?.color }} />
                          </div>
                          <span className="text-xs font-medium truncate">{h.name}</span>
                          {sel && <Check size={12} className="shrink-0 ml-auto" style={{ color: ti?.color }} />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              )}
              {selectedHobby && isLangHobby && (
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Which language? 🌍</label>
                  <select value={llLanguage} onChange={e => setLlLanguage(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring">
                    <option value="">Select a language…</option>
                    {WORLD_LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                    <option value="Other">Other…</option>
                  </select>
                  {llLanguage === "Other" && (
                    <Input className="text-sm mt-2" placeholder="Type your language…" onChange={e => setLlLanguage(e.target.value)} />
                  )}
                </div>
              )}
              {selectedHobby && isInstrumentHobby && (
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Which instrument? 🎵</label>
                  <select value={instrInstrument} onChange={e => setInstrInstrument(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring">
                    <option value="">Select an instrument…</option>
                    {INSTRUMENT_LIST.map(i => <option key={i} value={i}>{i}</option>)}
                    <option value="Other">Other…</option>
                  </select>
                  {instrInstrument === "Other" && (
                    <Input className="text-sm mt-2" placeholder="Type your instrument…" onChange={e => setInstrInstrument(e.target.value)} />
                  )}
                </div>
              )}
              {selectedHobby && (
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                    Plan template — <span style={{ color: typeInfo?.color }}>{typeInfo?.emoji} {typeInfo?.label}</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {templates.map(t => (
                      <button key={t.id} onClick={() => pickTemplate(t)}
                        className="flex flex-col items-start gap-1.5 p-3 rounded-xl border hover:shadow-sm transition-all hover:border-primary/40 text-left">
                        <span className="text-xl">{t.emoji}</span>
                        <span className="text-xs font-semibold leading-tight">{t.label}</span>
                        <span className="text-[10px] text-muted-foreground leading-tight">{t.description}</span>
                        {t.durationWeeks && <span className="text-[10px] text-primary font-medium">{t.durationWeeks}w</span>}
                      </button>
                    ))}
                    <button onClick={() => { setSelectedTemplate({ id: "custom", emoji: "✏️", label: "Custom plan", description: "Start from scratch", defaultSteps: [], }); setTitle(""); setSteps([]); setStep(2); }}
                      className="flex flex-col items-start gap-1.5 p-3 rounded-xl border border-dashed hover:border-primary/40 text-left">
                      <span className="text-xl">✏️</span>
                      <span className="text-xs font-semibold">Custom plan</span>
                      <span className="text-[10px] text-muted-foreground">Start from scratch</span>
                    </button>
                  </div>
                </div>
              )}
              {!selectedHobby && hobbies.length > 0 && (
                <p className="text-xs text-muted-foreground text-center">↑ Select a hobby to see plan templates</p>
              )}
            </>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <>
              {selectedTemplate && (
                <div className="flex items-center gap-3 p-3 rounded-xl border" style={{ backgroundColor: (typeInfo?.color ?? "#888") + "10", borderColor: (typeInfo?.color ?? "#888") + "40" }}>
                  <span className="text-2xl">{selectedTemplate.emoji}</span>
                  <div>
                    <p className="text-sm font-semibold">{selectedTemplate.label}</p>
                    <p className="text-xs text-muted-foreground">{selectedHobby?.name}</p>
                  </div>
                </div>
              )}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Plan Title *</label>
                <Input placeholder="Name your plan…" value={title} onChange={e => setTitle(e.target.value)} className="text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Description (optional)</label>
                <Textarea placeholder="What is this plan for?" value={description} onChange={e => setDescription(e.target.value)} className="text-sm min-h-[60px]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Duration (weeks)</label>
                  <Input type="number" min={1} value={durationWeeks} onChange={e => setDurationWeeks(e.target.value)} className="text-sm" placeholder="e.g. 8" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Start date</label>
                  <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Steps / Milestones</label>
                {steps.length > 0 && (
                  <div className="space-y-1 mb-3 max-h-36 overflow-y-auto">
                    {steps.map((s, i) => (
                      <div key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-secondary/40">
                        <span className="text-xs font-bold text-muted-foreground w-4 text-right shrink-0">{i + 1}</span>
                        <span className="text-xs flex-1 truncate">{s.text}</span>
                        {s.dueDate && <span className="text-[10px] text-muted-foreground shrink-0">{format(parseISO(s.dueDate), "MMM d")}</span>}
                        <button onClick={() => setSteps(ss => ss.filter(x => x.id !== s.id))} className="text-muted-foreground hover:text-destructive transition-colors shrink-0"><X size={11} /></button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Input placeholder="Add a step…" value={stepInput} onChange={e => setStepInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") addStep(); }} className="text-xs h-8 flex-1" />
                  <Input type="date" value={stepDate} onChange={e => setStepDate(e.target.value)} className="text-xs h-8 w-32" />
                  <button onClick={addStep} disabled={!stepInput.trim()} className="h-8 px-2.5 rounded-md bg-primary text-primary-foreground text-xs disabled:opacity-40 hover:bg-primary/80 transition-colors shrink-0">
                    <Plus size={12} />
                  </button>
                </div>
              </div>
              {/* ── Weekly schedule day picker ── */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Practice Days (optional)</label>
                <p className="text-[11px] text-muted-foreground mb-2">Select which days of the week you'll practice. This will populate the Active Plan schedule.</p>
                <div className="grid grid-cols-7 gap-1">
                  {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(day => {
                    const active = scheduleDays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => setScheduleDays(prev =>
                          active ? prev.filter(d => d !== day) : [...prev, day]
                        )}
                        className={`flex flex-col items-center py-2 rounded-lg border text-[10px] font-bold transition-all ${
                          active
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                        }`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
                {scheduleDays.length > 0 && (
                  <p className="text-[11px] text-primary mt-1.5">{scheduleDays.length}×/week: {scheduleDays.join(", ")}</p>
                )}
              </div>

              <button
                onClick={() => setActivateNow(v => !v)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${activateNow ? "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800" : "border-border hover:border-primary/30"}`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${activateNow ? "bg-blue-100 dark:bg-blue-900/40" : "bg-secondary"}`}>
                  {activateNow ? <Power size={15} className="text-blue-600 dark:text-blue-400" /> : <PowerOff size={15} className="text-muted-foreground" />}
                </div>
                <div className="text-left">
                  <p className={`text-sm font-medium ${activateNow ? "text-blue-700 dark:text-blue-300" : ""}`}>
                    {activateNow ? "Activate this plan now" : "Save as inactive"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {activateNow ? "Will appear in Goals & Dashboard" : "Activate later when ready"}
                  </p>
                </div>
                <div className={`ml-auto w-9 h-5 rounded-full transition-colors shrink-0 ${activateNow ? "bg-blue-500" : "bg-secondary border border-border"}`}>
                  <span className={`block w-4 h-4 rounded-full bg-white shadow-sm mt-0.5 transition-transform ${activateNow ? "translate-x-4" : "translate-x-0.5"}`} />
                </div>
              </button>
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t shrink-0 flex justify-between items-center">
          <Button variant="ghost" size="sm" onClick={handleClose}>Cancel</Button>
          {chessEloMode && (
            <Button size="sm"
              disabled={!eloDuration || Number(targetElo) <= Number(currentElo) || !currentElo || !targetElo}
              onClick={applyEloSettings} className="gap-1.5">
              <Check size={13} /> Generate Plan
            </Button>
          )}
          {pokerMode && (
            <Button size="sm"
              disabled={!pokerDuration || !currentStake || !targetStake || pokerJumps <= 0}
              onClick={applyPokerSettings} className="gap-1.5">
              <Check size={13} /> Generate Plan
            </Button>
          )}
          {step === 2 && !chessEloMode && !pokerMode && (
            <Button size="sm" disabled={!title.trim() || !selectedHobbyId} onClick={handleSave} className="gap-1.5">
              <Check size={13} /> Create Plan
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Goal Wizard (2-step) ───────────────────────────────────────────────────────

export function GoalWizard({
  open,
  onClose,
  hobbies,
  defaultHobbyId,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  hobbies: Hobby[];
  defaultHobbyId?: number;
  onSave: (hobbyId: number, goal: HobbyGoal) => void;
}) {
  const [step, setStep] = useState(1);
  const [selectedHobbyId, setSelectedHobbyId] = useState<number | null>(defaultHobbyId ?? null);
  const [selectedTemplate, setSelectedTemplate] = useState<GoalTemplate | null>(null);
  const [goalType, setGoalType] = useState<GoalType>("milestone");

  // Step 2 form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetValue, setTargetValue] = useState("");
  const [currentValue, setCurrentValue] = useState("0");
  const [unit, setUnit] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [freqTimes, setFreqTimes] = useState("3");
  const [freqPeriod, setFreqPeriod] = useState<"week" | "month">("week");
  const [durationWeeks, setDurationWeeks] = useState("12");
  const [steps, setSteps] = useState<GoalStep[]>([]);
  const [stepInput, setStepInput] = useState("");
  const [stepDate, setStepDate] = useState("");
  const [buddyUserId, setBuddyUserId] = useState<number | null>(null);

  const { data: friends = [] } = useFriends();
  const selectedHobby = hobbies.find(h => h.id === selectedHobbyId) ?? null;
  const hobbyType = (selectedHobby?.hobbyType as HobbyType) ?? "creative";
  const templates = [...(GOAL_TEMPLATES[hobbyType] ?? []), CUSTOM_TEMPLATE];
  const typeInfo = HOBBY_TYPE_MAP[hobbyType];

  function reset() {
    setStep(1);
    setSelectedHobbyId(defaultHobbyId ?? null);
    setSelectedTemplate(null);
    setTitle(""); setDescription(""); setTargetValue(""); setCurrentValue("0");
    setUnit(""); setTargetDate(""); setFreqTimes("3"); setFreqPeriod("week");
    setDurationWeeks("12"); setSteps([]); setStepInput(""); setStepDate("");
    setBuddyUserId(null);
  }

  function handleClose() { reset(); onClose(); }

  function pickTemplate(t: GoalTemplate) {
    setSelectedTemplate(t);
    setGoalType(t.goalType);
    setTitle(t.defaults.title ?? "");
    if (t.defaults.targetValue !== undefined) setTargetValue(String(t.defaults.targetValue));
    if (t.defaults.unit) setUnit(t.defaults.unit);
    if (t.defaults.freqTimes) setFreqTimes(String(t.defaults.freqTimes));
    if (t.defaults.freqPeriod) setFreqPeriod(t.defaults.freqPeriod);
    if (t.defaults.durationWeeks) setDurationWeeks(String(t.defaults.durationWeeks));
    if (t.defaults.steps) setSteps(t.defaults.steps);
    setStep(2);
  }

  function addStep() {
    if (!stepInput.trim()) return;
    setSteps(s => [...s, { id: genId(), text: stepInput.trim(), done: false, dueDate: stepDate || undefined }]);
    setStepInput(""); setStepDate("");
  }

  function handleSave() {
    if (!selectedHobbyId || !title.trim()) return;
    const goal: HobbyGoal = {
      id: genId(), title: title.trim(), description: description.trim() || undefined,
      goalType, status: "active", createdAt: new Date().toISOString(),
      targetDate: targetDate || undefined,
      ...(goalType === "count" ? {
        targetValue: Number(targetValue) || 10, currentValue: Number(currentValue) || 0, unit: unit.trim() || undefined
      } : {}),
      ...(goalType === "frequency" ? {
        freqTimes: Number(freqTimes) || 3, freqPeriod, durationWeeks: Number(durationWeeks) || 12
      } : {}),
      ...(goalType === "plan" ? { steps } : {}),
      ...(buddyUserId ? { buddyUserId } : {}),
    };
    onSave(selectedHobbyId, goal);
    handleClose();
  }

  const canProceed = !!selectedHobbyId;
  const canSave = !!title.trim() && !!selectedHobbyId;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col overflow-hidden p-0">
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b shrink-0">
          <div className="flex items-center gap-2 mb-3">
            {step === 2 && (
              <button onClick={() => setStep(1)} className="p-1 rounded-lg hover:bg-secondary transition-colors text-muted-foreground">
                <ChevronLeft size={15} />
              </button>
            )}
            <div className="flex-1">
              <DialogTitle className="text-base flex items-center gap-2">
                <Target size={15} className="text-primary" />
                {step === 1 ? "New Goal" : "Configure Your Goal"}
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">{step === 1 ? "Pick a hobby and choose a goal type" : "Set your target and details"}</p>
            </div>
          </div>
          {/* Step indicator */}
          <div className="flex items-center gap-2">
            {[1, 2].map(n => (
              <div key={n} className={`h-1 rounded-full flex-1 transition-colors ${n <= step ? "bg-primary" : "bg-secondary"}`} />
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* STEP 1 */}
          {step === 1 && (
            <>
              {/* Hobby picker */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Which hobby?</label>
                {hobbies.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4 border rounded-lg border-dashed">Add a hobby first to create goals for it</p>
                ) : (
                  <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto">
                    {hobbies.filter(h => h.status !== "retired").map(h => {
                      const ti = HOBBY_TYPE_MAP[h.hobbyType as HobbyType];
                      const HIcon = ti?.icon ?? Palette;
                      const sel = h.id === selectedHobbyId;
                      return (
                        <button key={h.id} onClick={() => { setSelectedHobbyId(h.id); setSelectedTemplate(null); }}
                          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left transition-all ${sel ? "border-2" : "border hover:bg-secondary/50"}`}
                          style={sel ? { borderColor: ti?.color, backgroundColor: (ti?.color ?? "#888") + "15" } : {}}
                        >
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: (ti?.color ?? "#888") + "22" }}>
                            <HIcon size={13} style={{ color: ti?.color }} />
                          </div>
                          <span className="text-xs font-medium truncate">{h.name}</span>
                          {sel && <Check size={12} className="shrink-0 ml-auto" style={{ color: ti?.color }} />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Template picker */}
              {selectedHobby && (
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                    What kind of goal? <span style={{ color: typeInfo?.color }}>{typeInfo?.emoji} {typeInfo?.label}</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {templates.map(t => (
                      <button key={t.id} onClick={() => pickTemplate(t)}
                        className="flex flex-col items-start gap-1.5 p-3 rounded-xl border hover:shadow-sm transition-all hover:border-primary/40 text-left group"
                      >
                        <span className="text-xl">{t.emoji}</span>
                        <span className="text-xs font-semibold leading-tight">{t.label}</span>
                        <span className="text-[10px] text-muted-foreground leading-tight">{t.description}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!selectedHobby && hobbies.length > 0 && (
                <p className="text-xs text-muted-foreground text-center">↑ Select a hobby to see goal templates</p>
              )}
            </>
          )}

          {/* STEP 2 */}
          {step === 2 && selectedTemplate && (
            <>
              {/* Template identity */}
              <div className="flex items-center gap-3 p-3 rounded-xl border" style={{ backgroundColor: (typeInfo?.color ?? "#888") + "10", borderColor: (typeInfo?.color ?? "#888") + "40" }}>
                <span className="text-2xl">{selectedTemplate.emoji}</span>
                <div>
                  <p className="text-sm font-semibold">{selectedTemplate.label}</p>
                  <p className="text-xs text-muted-foreground">{selectedHobby?.name} · {GOAL_TYPE_META[goalType].label}</p>
                </div>
              </div>

              {/* Goal title */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Goal Title *</label>
                <Input placeholder="Name your goal…" value={title} onChange={e => setTitle(e.target.value)} className="text-sm" />
              </div>

              {/* Description */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Description (optional)</label>
                <Textarea placeholder="Add context, motivation, or notes…" value={description} onChange={e => setDescription(e.target.value)} className="text-sm min-h-[60px]" />
              </div>

              {/* Count-specific */}
              {goalType === "count" && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Target</label>
                    <Input type="number" min={1} value={targetValue} onChange={e => setTargetValue(e.target.value)} className="text-sm" placeholder="e.g. 100" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Unit</label>
                    <Input value={unit} onChange={e => setUnit(e.target.value)} className="text-sm" placeholder="miles" />
                  </div>
                  <div className="col-span-3">
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Current progress</label>
                    <Input type="number" min={0} value={currentValue} onChange={e => setCurrentValue(e.target.value)} className="text-sm" />
                  </div>
                </div>
              )}

              {/* Frequency-specific */}
              {goalType === "frequency" && (
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Times</label>
                    <Input type="number" min={1} value={freqTimes} onChange={e => setFreqTimes(e.target.value)} className="text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Per</label>
                    <Select value={freqPeriod} onValueChange={(v) => setFreqPeriod(v as "week" | "month")}>
                      <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="week">Week</SelectItem><SelectItem value="month">Month</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">For (weeks)</label>
                    <Input type="number" min={1} value={durationWeeks} onChange={e => setDurationWeeks(e.target.value)} className="text-sm" />
                  </div>
                </div>
              )}

              {/* Plan-specific: steps */}
              {goalType === "plan" && (
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Steps / Milestones</label>
                  {steps.length > 0 && (
                    <div className="space-y-1 mb-3 max-h-32 overflow-y-auto">
                      {steps.map((s, i) => (
                        <div key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-secondary/40">
                          <span className="text-xs font-bold text-muted-foreground w-4 text-right shrink-0">{i + 1}</span>
                          <span className="text-xs flex-1 truncate">{s.text}</span>
                          {s.dueDate && <span className="text-[10px] text-muted-foreground shrink-0">{format(parseISO(s.dueDate), "MMM d")}</span>}
                          <button onClick={() => setSteps(ss => ss.filter(x => x.id !== s.id))} className="text-muted-foreground hover:text-destructive transition-colors shrink-0">
                            <X size={11} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Input placeholder="Add a step…" value={stepInput} onChange={e => setStepInput(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") addStep(); }} className="text-xs h-8 flex-1" />
                    <Input type="date" value={stepDate} onChange={e => setStepDate(e.target.value)} className="text-xs h-8 w-32" />
                    <button onClick={addStep} disabled={!stepInput.trim()}
                      className="h-8 px-2.5 rounded-md bg-primary text-primary-foreground text-xs disabled:opacity-40 hover:bg-primary/80 transition-colors shrink-0">
                      <Plus size={12} />
                    </button>
                  </div>
                </div>
              )}

              {/* Target date */}
              {(goalType === "milestone" || goalType === "count" || goalType === "plan") && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Target date (optional)</label>
                  <Input type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} className="text-sm" />
                </div>
              )}

              {/* Accountabilibuddy */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block flex items-center gap-1.5">
                  👥 Accountabilibuddy <span className="normal-case font-normal">(optional)</span>
                </label>
                <BuddyPickerInline value={buddyUserId} onChange={setBuddyUserId} friends={friends} />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t shrink-0 flex justify-between items-center">
          <Button variant="ghost" size="sm" onClick={handleClose}>Cancel</Button>
          {step === 1 && (
            <Button size="sm" disabled={!canProceed || !selectedTemplate} onClick={() => {}}>
              Choose template to continue <ChevronRight size={13} className="ml-1" />
            </Button>
          )}
          {step === 2 && (
            <Button size="sm" disabled={!canSave} onClick={handleSave} className="gap-1.5">
              <Check size={13} /> Create Goal
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Hobby Card (updated with goal badge) ──────────────────────────────────────

function HobbyCard({
  hobby, onEdit, onDelete, onToggleFavorite, onClick,
}: {
  hobby: Hobby; onEdit: () => void; onDelete: () => void; onToggleFavorite: () => void; onClick: () => void;
}) {
  const typeInfo = HOBBY_TYPE_MAP[hobby.hobbyType as HobbyType] ?? HOBBY_TYPES[0];
  const skillInfo = SKILL_MAP[hobby.skillLevel ?? "beginner"];
  const TypeIcon = typeInfo.icon;
  const goals = parseGoals(hobby.extraJson ?? "{}");
  const plans = parsePlans(hobby.extraJson ?? "{}");
  const activeGoals = goals.filter(g => g.status === "active");
  const activePlans = plans.filter(p => p.isActive && !p.completedAt);
  const activePlansCount = activePlans.length;

  // Find next scheduled session label from active plans
  const today = new Date();
  const todayDowIdx = today.getDay();
  const DAYS_ORDERED_CARD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const todayShort = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][todayDowIdx];
  let nextSessionLabel: string | null = null;
  for (const plan of activePlans) {
    const days = plan.scheduleDays ?? [];
    if (days.length > 0) {
      const todayIdx = DAYS_ORDERED_CARD.indexOf(todayShort);
      const nextDay = [...days].sort((a, b) => {
        const ai = (DAYS_ORDERED_CARD.indexOf(a) - todayIdx + 7) % 7;
        const bi = (DAYS_ORDERED_CARD.indexOf(b) - todayIdx + 7) % 7;
        return ai - bi;
      })[0];
      if (nextDay) { nextSessionLabel = nextDay === todayShort ? "Today" : nextDay; break; }
    }
  }

  return (
    <div
      className="group relative bg-card border rounded-xl overflow-hidden cursor-pointer hover:shadow-md hover:border-primary/30 transition-all duration-200 flex flex-col"
      onClick={onClick}
    >
      {/* Color accent bar */}
      <div className="h-1 w-full" style={{ backgroundColor: typeInfo.color }} />

      <div className="p-4 flex-1 flex flex-col gap-3">
        {/* Row 1: Icon + Name + Overflow menu */}
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0" style={{ backgroundColor: typeInfo.color }}>
            <TypeIcon size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm leading-snug truncate">{hobby.name}</h3>
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {hobby.category || typeInfo.label}
            </p>
          </div>
          {/* Overflow menu — always visible, no hover gymnastics */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="shrink-0 p-1 rounded-md hover:bg-muted transition-colors -mr-1 -mt-0.5"
                onClick={e => e.stopPropagation()}
              >
                <MoreHorizontal size={15} className="text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onSelect={() => onToggleFavorite()}>
                <Heart size={13} className={`mr-2 ${hobby.isFavorite ? "fill-pink-500 text-pink-500" : ""}`} />
                {hobby.isFavorite ? "Unfavorite" : "Favorite"}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onEdit()}>
                <Pencil size={13} className="mr-2" /> Edit hobby
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={(e) => { e.stopPropagation(); onDelete(); }} className="text-destructive focus:text-destructive">
                <Trash2 size={13} className="mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Row 2: Skill level + status chips */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {skillInfo && (
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${skillInfo.color}`}>
              {skillInfo.label}
            </span>
          )}
          {hobby.status !== "active" && (
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_MAP[hobby.status ?? "active"]?.color ?? ""}`}>
              {STATUS_MAP[hobby.status ?? "active"]?.label ?? hobby.status}
            </span>
          )}
          {hobby.isFavorite && (
            <Heart size={11} className="fill-pink-500 text-pink-500 ml-auto" />
          )}
        </div>

        {/* Row 3: Plans · Goals count + next session */}
        <div className="flex items-center justify-between mt-auto pt-1 border-t border-border/50">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            {activePlansCount > 0 ? (
              <span className="flex items-center gap-1 text-primary font-medium">
                <ClipboardList size={10} />
                {activePlansCount} active plan{activePlansCount !== 1 ? "s" : ""}
              </span>
            ) : (
              <span className="text-muted-foreground/60">No active plan</span>
            )}
            {activeGoals.length > 0 && (
              <span className="flex items-center gap-1">
                <Target size={10} />
                {activeGoals.length} goal{activeGoals.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          {nextSessionLabel && (
            <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">
              <CalendarClock size={9} />
              {nextSessionLabel}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Hobby Detail Dialog (with Goals section) ───────────────────────────────────

// ── BirdSection ───────────────────────────────────────────────────────────────

function useBirdSearch() {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [error, setError] = useState("");

  async function runSearch(q?: string) {
    const term = (q ?? query).trim();
    if (!term) return;
    setSearching(true); setResults([]); setError("");
    try {
      const r = await fetch(`/api/birds/search?name=${encodeURIComponent(term)}`);
      const data = await r.json();
      if (!r.ok) { setError(data.error ?? "Bird search failed."); setSearching(false); return; }
      if (!data.birds?.length) { setError("No birds found. Try a common name like 'robin' or 'warbler'."); setSearching(false); return; }
      setResults(data.birds);
    } catch { setError("Search failed. Check your connection."); }
    setSearching(false);
  }

  return { query, setQuery, searching, results, setResults, error, runSearch };
}

function BirdSection({ hobby, onUpdateExtra }: { hobby: Hobby; onUpdateExtra: (newJson: string) => void }) {
  const { toast } = useToast();
  const [tab, setTab] = useState<"sightings" | "wishlist">("sightings");
  const [showLogForm, setShowLogForm] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const birdSearch = useBirdSearch();

  // Persist data inside extraJson.birdData
  function parseBirdData(json: string) {
    try { const o = JSON.parse(json || "{}"); return { sightings: Array.isArray(o.birdData?.sightings) ? o.birdData.sightings : [], wishlist: Array.isArray(o.birdData?.wishlist) ? o.birdData.wishlist : [] }; }
    catch { return { sightings: [], wishlist: [] }; }
  }
  function setBirdData(json: string, data: { sightings: any[]; wishlist: any[] }) {
    try { const o = JSON.parse(json || "{}"); return JSON.stringify({ ...o, birdData: data }); }
    catch { return JSON.stringify({ birdData: data }); }
  }

  const birdData = parseBirdData(hobby.extraJson ?? "{}");
  const { sightings, wishlist } = birdData;

  // Log form
  const [logBirdName, setLogBirdName] = useState("");
  const [logSciName, setLogSciName] = useState("");
  const [logImage, setLogImage] = useState("");
  const [logDate, setLogDate] = useState(new Date().toISOString().slice(0, 10));
  const [logLocation, setLogLocation] = useState("");
  const [logNotes, setLogNotes] = useState("");

  function prefillFromResult(b: any) {
    setLogBirdName(b.name); setLogSciName(b.sciName ?? ""); setLogImage(b.image ?? "");
    setShowSearch(false); setShowLogForm(true);
  }

  function addToWishlist(b: any) {
    if (wishlist.find((w: any) => w.name === b.name)) { toast({ title: "Already on wishlist" }); return; }
    const updated = { sightings, wishlist: [...wishlist, { name: b.name, sciName: b.sciName ?? "", image: b.image ?? "", addedAt: new Date().toISOString() }] };
    onUpdateExtra(setBirdData(hobby.extraJson ?? "{}", updated));
    toast({ title: "Added to wishlist", description: b.name });
  }

  function removeWishlist(name: string) {
    onUpdateExtra(setBirdData(hobby.extraJson ?? "{}", { sightings, wishlist: wishlist.filter((w: any) => w.name !== name) }));
  }

  function submitLog(e: React.FormEvent) {
    e.preventDefault();
    if (!logBirdName.trim()) return;
    const entry = { id: genId(), name: logBirdName.trim(), sciName: logSciName.trim(), image: logImage, date: logDate, location: logLocation.trim(), notes: logNotes.trim(), loggedAt: new Date().toISOString() };
    onUpdateExtra(setBirdData(hobby.extraJson ?? "{}", { sightings: [entry, ...sightings], wishlist }));
    toast({ title: "Sighting logged!", description: entry.name });
    setLogBirdName(""); setLogSciName(""); setLogImage(""); setLogLocation(""); setLogNotes(""); setLogDate(new Date().toISOString().slice(0, 10));
    setShowLogForm(false);
  }

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {(["sightings", "wishlist"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`text-xs px-3 py-1 rounded-full font-medium transition-colors capitalize ${tab === t ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:bg-secondary/80"}`}>
              {t} {t === "sightings" ? `(${sightings.length})` : `(${wishlist.length})`}
            </button>
          ))}
        </div>
        <button onClick={() => { setShowLogForm(true); setShowSearch(false); }}
          className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 transition-colors font-medium">
          <Plus size={12} /> Log sighting
        </button>
      </div>

      {/* Bird search (for pre-filling log or wishlist) */}
      {tab === "wishlist" && (
        <button onClick={() => setShowSearch(v => !v)}
          className="w-full text-xs text-left px-3 py-2 rounded-lg border border-dashed border-muted-foreground/30 hover:border-primary/50 text-muted-foreground hover:text-primary transition-colors">
          {showSearch ? "▲ Hide bird search" : "🔍 Search birds to add to wishlist"}
        </button>
      )}
      {tab === "sightings" && showLogForm && !showSearch && (
        <button onClick={() => setShowSearch(true)}
          className="text-xs text-primary hover:underline">
          🔍 Search birds to pre-fill
        </button>
      )}

      {/* Search panel */}
      {showSearch && (
        <div className="rounded-xl border bg-secondary/30 p-3 space-y-3">
          <p className="text-xs font-medium text-muted-foreground">Search birds (Nuthatch API)</p>
          <div className="flex gap-2">
            <Input value={birdSearch.query} onChange={e => birdSearch.setQuery(e.target.value)} placeholder="e.g. robin, warbler, eagle…" className="text-sm h-8 flex-1"
              onKeyDown={e => e.key === "Enter" && birdSearch.runSearch()} />
            <button onClick={() => birdSearch.runSearch()} disabled={birdSearch.searching}
              className="px-3 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/80 disabled:opacity-50 transition-colors shrink-0">
              {birdSearch.searching ? "…" : "Search"}
            </button>
          </div>
          {birdSearch.error && <p className="text-xs text-destructive">{birdSearch.error}</p>}
          {birdSearch.results.length > 0 && (
            <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
              {birdSearch.results.map((b: any) => (
                <div key={b.id} className="rounded-lg border bg-card overflow-hidden flex flex-col">
                  {b.image && <img src={b.image} alt={b.name} className="w-full h-24 object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />}
                  {!b.image && <div className="w-full h-24 bg-secondary flex items-center justify-center text-2xl">🐦</div>}
                  <div className="p-2 flex-1 flex flex-col gap-1">
                    <p className="text-xs font-semibold leading-tight">{b.name}</p>
                    {b.sciName && <p className="text-[10px] italic text-muted-foreground leading-tight">{b.sciName}</p>}
                    <div className="flex gap-1 mt-auto pt-1">
                      <button onClick={() => prefillFromResult(b)} className="flex-1 text-[10px] py-1 rounded bg-primary text-primary-foreground hover:bg-primary/80 transition-colors font-medium">Log</button>
                      <button onClick={() => addToWishlist(b)} className="flex-1 text-[10px] py-1 rounded bg-secondary hover:bg-secondary/80 transition-colors font-medium">Wishlist</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Log form */}
      {showLogForm && (
        <form onSubmit={submitLog} className="rounded-xl border bg-secondary/30 p-3 space-y-2">
          <p className="text-xs font-semibold">Log a sighting</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground mb-1 block">Bird name *</label>
              <Input value={logBirdName} onChange={e => setLogBirdName(e.target.value)} placeholder="e.g. American Robin" className="text-xs h-8" required />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground mb-1 block">Scientific name</label>
              <Input value={logSciName} onChange={e => setLogSciName(e.target.value)} placeholder="e.g. Turdus migratorius" className="text-xs h-8 italic" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground mb-1 block">Date</label>
              <Input type="date" value={logDate} onChange={e => setLogDate(e.target.value)} className="text-xs h-8" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground mb-1 block">Location</label>
              <Input value={logLocation} onChange={e => setLogLocation(e.target.value)} placeholder="e.g. City Park" className="text-xs h-8" />
            </div>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">Notes</label>
            <Input value={logNotes} onChange={e => setLogNotes(e.target.value)} placeholder="Behaviour, plumage notes…" className="text-xs h-8" />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="submit" className="flex-1 text-xs py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 font-medium transition-colors">Save sighting</button>
            <button type="button" onClick={() => setShowLogForm(false)} className="flex-1 text-xs py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 font-medium transition-colors">Cancel</button>
          </div>
        </form>
      )}

      {/* Sightings tab */}
      {tab === "sightings" && !showLogForm && (
        sightings.length === 0
          ? <p className="text-xs text-muted-foreground text-center py-4">No sightings logged yet. Press "Log sighting" to start your list!</p>
          : <div className="space-y-2">
              {sightings.map((s: any) => (
                <div key={s.id} className="flex items-center gap-3 rounded-xl border bg-card p-2">
                  {s.image
                    ? <img src={s.image} alt={s.name} className="w-12 h-12 rounded-lg object-cover shrink-0" onError={e => { (e.target as HTMLImageElement).src = ""; (e.target as HTMLImageElement).style.display = "none"; }} />
                    : <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center text-xl shrink-0">🐦</div>}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{s.name}</p>
                    {s.sciName && <p className="text-[11px] italic text-muted-foreground truncate">{s.sciName}</p>}
                    <p className="text-[11px] text-muted-foreground">{s.date}{s.location ? ` · ${s.location}` : ""}</p>
                  </div>
                  <button onClick={() => onUpdateExtra(setBirdData(hobby.extraJson ?? "{}", { sightings: sightings.filter((x: any) => x.id !== s.id), wishlist }))}
                    className="p-1 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0"><Trash2 size={11} /></button>
                </div>
              ))}
            </div>
      )}

      {/* Wishlist tab */}
      {tab === "wishlist" && !showSearch && (
        wishlist.length === 0
          ? <p className="text-xs text-muted-foreground text-center py-4">No birds on your wishlist yet. Search for birds above to add them!</p>
          : <div className="grid grid-cols-2 gap-2">
              {wishlist.map((b: any) => (
                <div key={b.name} className="rounded-lg border bg-card overflow-hidden flex flex-col">
                  {b.image && <img src={b.image} alt={b.name} className="w-full h-24 object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />}
                  {!b.image && <div className="w-full h-24 bg-secondary flex items-center justify-center text-2xl">🐦</div>}
                  <div className="p-2 flex items-start justify-between gap-1">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold leading-tight truncate">{b.name}</p>
                      {b.sciName && <p className="text-[10px] italic text-muted-foreground leading-tight truncate">{b.sciName}</p>}
                    </div>
                    <button onClick={() => removeWishlist(b.name)} className="p-0.5 hover:text-destructive text-muted-foreground transition-colors shrink-0"><Trash2 size={10} /></button>
                  </div>
                </div>
              ))}
            </div>
      )}
    </div>
  );
}

// ── HikingSection ─────────────────────────────────────────────────────────────

/** Shared hook: geocode + Waymarked Trails route search. Pass apiPath = "hiking" or "cycling". */
function useWaymarkedSearch(apiPath: "hiking" | "cycling") {
  const [locationInput, setLocationInput] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchError, setSearchError] = useState("");

  async function runSearch(query?: string) {
    const q = (query ?? locationInput).trim();
    if (!q) return;
    setSearching(true); setSearchResults([]); setSearchError("");
    try {
      let latLonParams = "";
      try {
        const geoRes = await fetch(`/api/hiking/geocode?q=${encodeURIComponent(q)}`);
        const geoData = await geoRes.json();
        if (geoData?.length) {
          const { lat, lon } = geoData[0];
          latLonParams = `&lat=${lat}&lon=${lon}&maxDistance=25`;
        }
      } catch { /* non-fatal */ }

      const res = await fetch(`/api/${apiPath}/search?locationName=${encodeURIComponent(q)}&maxResults=30${latLonParams}`);
      const data = await res.json();
      if (!data.trails?.length) {
        setSearchError(apiPath === "hiking"
          ? "No hiking routes found. Try a trail name (e.g. 'Colorado Trail') or a city/park name."
          : "No cycling routes found. Try a route name or a city/region name.");
        setSearching(false); return;
      }
      setSearchResults(data.trails);
    } catch {
      setSearchError("Search failed. Check your connection and try again.");
    }
    setSearching(false);
  }

  return { locationInput, setLocationInput, searching, searchResults, setSearchResults, searchError, runSearch };
}

/** Convenience wrappers */
function useTrailSearch()      { return useWaymarkedSearch("hiking"); }
function useCycleRouteSearch() { return useWaymarkedSearch("cycling"); }

function HikingSection({ hobby, onUpdateExtra }: {
  hobby: Hobby;
  onUpdateExtra: (newExtraJson: string) => void;
}) {
  const { toast } = useToast();
  const [tab, setTab] = useState<"wishlist" | "log">("wishlist");
  const [showLogForm, setShowLogForm] = useState(false);
  const [showLogSearch, setShowLogSearch] = useState(false);

  // Separate search state for each tab
  const wishlistSearch = useTrailSearch();
  const logSearch      = useTrailSearch();

  // Log form state
  const [logName, setLogName] = useState("");
  const [logDate, setLogDate] = useState(new Date().toISOString().slice(0, 10));
  const [logDist, setLogDist] = useState("");
  const [logElev, setLogElev] = useState("");
  const [logDur, setLogDur] = useState("");
  const [logDiff, setLogDiff] = useState("");
  const [logRating, setLogRating] = useState("");
  const [logNotes, setLogNotes] = useState("");

  const wishlist = parseHikeWishlist(hobby.extraJson ?? "{}");
  const hikeLog  = parseHikeLog(hobby.extraJson ?? "{}");

  function saveHiking(w: HikeWishlistEntry[], l: HikeLogEntry[]) {
    onUpdateExtra(setHikingInExtra(hobby.extraJson ?? "{}", w, l));
  }

  function addToWishlist(trail: any) {
    if (wishlist.some(w => w.trailId === trail.id)) { toast({ title: "Already on wishlist" }); return; }
    const entry: HikeWishlistEntry = {
      id: genId(), trailId: trail.id, name: trail.name, location: trail.location,
      lengthMiles: trail.length, elevationGainFt: trail.ascent,
      difficulty: trail.difficulty, stars: trail.stars, url: trail.url,
      imgUrl: trail.imgSqSmall, addedAt: new Date().toISOString(),
    };
    saveHiking([...wishlist, entry], hikeLog);
    toast({ title: `"${trail.name}" added to wishlist` });
  }

  function removeWishlist(id: string) { saveHiking(wishlist.filter(w => w.id !== id), hikeLog); }

  function prefillLog(name: string, dist: number, elev: number, diff: string) {
    setLogName(name);
    setLogDist(dist > 0 ? String(dist) : "");
    setLogElev(elev > 0 ? String(elev) : "");
    setLogDiff(diff || "");
  }

  function logHike(fromTrail?: HikeWishlistEntry) {
    if (fromTrail) prefillLog(fromTrail.name, fromTrail.lengthMiles, fromTrail.elevationGainFt ?? 0, fromTrail.difficulty ?? "");
    setTab("log"); setShowLogForm(true);
  }

  function logFromSearchResult(trail: any) {
    prefillLog(trail.name, trail.length ?? 0, trail.ascent ?? 0, trail.difficulty ?? "");
    logSearch.setSearchResults([]);
    setShowLogSearch(false);
    setShowLogForm(true);
    toast({ title: `"${trail.name}" pre-filled in log` });
  }

  function saveLog() {
    if (!logName.trim() || !logDate) return;
    const entry: HikeLogEntry = {
      id: genId(), name: logName.trim(), date: logDate,
      distanceMiles: Number(logDist) || 0,
      elevationGainFt: logElev ? Number(logElev) : undefined,
      durationMins: logDur ? Number(logDur) : undefined,
      difficulty: logDiff || undefined,
      rating: logRating ? Number(logRating) : undefined,
      notes: logNotes.trim() || undefined,
    };
    saveHiking(wishlist, [...hikeLog, entry]);
    setShowLogForm(false); setLogName(""); setLogDate(new Date().toISOString().slice(0,10));
    setLogDist(""); setLogElev(""); setLogDur(""); setLogDiff(""); setLogRating(""); setLogNotes("");
    toast({ title: "Hike logged!" });
  }

  function deleteLog(id: string) { saveHiking(wishlist, hikeLog.filter(l => l.id !== id)); }

  const diffBadge = (d?: string) => d
    ? <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${DIFF_COLOR[d] ?? "text-muted-foreground bg-secondary border-border"}`}>{d}</span>
    : null;

  return (
    <div className="border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-emerald-50/60 dark:bg-emerald-950/20 border-b border-emerald-200 dark:border-emerald-800">
        <div className="flex items-center gap-2">
          <Trees size={15} className="text-emerald-600" />
          <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Trails</span>
          <span className="text-xs text-muted-foreground">{wishlist.length} wishlist · {hikeLog.length} logged</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setTab("wishlist")} className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${tab === "wishlist" ? "bg-emerald-600 text-white" : "text-muted-foreground hover:bg-secondary"}`}>Wishlist</button>
          <button onClick={() => setTab("log")} className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${tab === "log" ? "bg-emerald-600 text-white" : "text-muted-foreground hover:bg-secondary"}`}>Log</button>
        </div>
      </div>

      <div className="p-3 space-y-3">
        {/* WISHLIST TAB */}
        {tab === "wishlist" && (
          <>
            {/* Wishlist search bar */}
            <div className="flex gap-2">
              <Input
                placeholder="Search trails near… (e.g. Boulder, CO)"
                value={wishlistSearch.locationInput}
                onChange={e => wishlistSearch.setLocationInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") wishlistSearch.runSearch(); }}
                className="text-sm h-8 flex-1"
              />
              <Button size="sm" variant="outline" onClick={() => wishlistSearch.runSearch()} disabled={wishlistSearch.searching || !wishlistSearch.locationInput.trim()} className="h-8 gap-1.5 shrink-0">
                {wishlistSearch.searching ? <RefreshCw size={12} className="animate-spin" /> : <Search size={12} />}
                {wishlistSearch.searching ? "Searching…" : "Search"}
              </Button>
            </div>

            {wishlistSearch.searchError && <p className="text-xs text-destructive">{wishlistSearch.searchError}</p>}

            {/* Search results */}
            {wishlistSearch.searchResults.length > 0 && (
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{wishlistSearch.searchResults.length} routes found via Waymarked Trails</p>
                {wishlistSearch.searchResults.map((trail: any) => (
                  <div key={trail.id} className="flex items-start gap-2 p-2 rounded-lg border bg-card hover:bg-secondary/30 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <p className="text-xs font-semibold truncate">{trail.name}</p>
                        {trail.ref && <span className="text-[10px] text-muted-foreground shrink-0">({trail.ref})</span>}
                      </div>
                      {trail.description && <p className="text-[10px] text-muted-foreground truncate italic">{trail.description}</p>}
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {diffBadge(trail.difficulty)}
                        {trail.length > 0 && <span className="text-[10px] text-muted-foreground">{trail.length} mi</span>}
                        {trail.network && <span className="text-[10px] text-muted-foreground capitalize">{trail.network}</span>}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <button onClick={() => addToWishlist(trail)} className="text-[10px] px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
                        + Wishlist
                      </button>
                      {trail.url && <a href={trail.url} target="_blank" rel="noopener noreferrer" className="text-[10px] px-2 py-1 rounded border hover:bg-secondary transition-colors text-center">View ↗</a>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Wishlist */}
            {wishlist.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Your Wishlist</p>
                {wishlist.map(w => (
                  <div key={w.id} className="flex items-start gap-2 p-2.5 rounded-lg border bg-card">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{w.name}</p>
                      {w.location && <p className="text-[10px] text-muted-foreground truncate">{w.location}</p>}
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {diffBadge(w.difficulty)}
                        {w.lengthMiles > 0 && <span className="text-[10px] text-muted-foreground">{w.lengthMiles} mi{w.elevationGainFt ? ` · +${w.elevationGainFt}ft` : ""}</span>}
                        {w.plannedDate && <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Calendar size={9}/>{format(parseISO(w.plannedDate), "MMM d")}</span>}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <button onClick={() => logHike(w)} className="text-[10px] px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors">Log it</button>
                      <button onClick={() => removeWishlist(w.id)} className="text-[10px] px-2 py-1 rounded border hover:bg-destructive/10 hover:text-destructive transition-colors">Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {wishlist.length === 0 && wishlistSearch.searchResults.length === 0 && (
              <div className="text-center py-6 text-muted-foreground">
                <Trees size={24} className="mx-auto mb-2 opacity-20" />
                <p className="text-xs">Search for trails above to build your wishlist</p>
              </div>
            )}
          </>
        )}

        {/* LOG TAB */}
        {tab === "log" && (
          <>
            {/* Trail search to pre-fill log */}
            <div className="border rounded-xl overflow-hidden">
              <button
                onClick={() => { setShowLogSearch(s => !s); logSearch.setSearchResults([]); }}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/20 hover:bg-emerald-100/60 transition-colors"
              >
                <span className="flex items-center gap-1.5"><Search size={11} /> Find a trail to pre-fill</span>
                {showLogSearch ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
              {showLogSearch && (
                <div className="p-2.5 space-y-2 border-t">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Search near… (e.g. Rocky Mountain NP)"
                      value={logSearch.locationInput}
                      onChange={e => logSearch.setLocationInput(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") logSearch.runSearch(); }}
                      className="text-sm h-8 flex-1"
                    />
                    <Button size="sm" variant="outline" onClick={() => logSearch.runSearch()} disabled={logSearch.searching || !logSearch.locationInput.trim()} className="h-8 gap-1 shrink-0">
                      {logSearch.searching ? <RefreshCw size={11} className="animate-spin" /> : <Search size={11} />}
                      {logSearch.searching ? "…" : "Search"}
                    </Button>
                  </div>
                  {logSearch.searchError && <p className="text-xs text-destructive">{logSearch.searchError}</p>}
                  {logSearch.searchResults.length > 0 && (
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      <p className="text-[10px] text-muted-foreground">{logSearch.searchResults.length} routes — click one to pre-fill</p>
                      {logSearch.searchResults.map((trail: any) => (
                        <button
                          key={trail.id}
                          onClick={() => logFromSearchResult(trail)}
                          className="w-full text-left flex items-center justify-between gap-2 p-2 rounded-lg border bg-card hover:bg-emerald-50 dark:hover:bg-emerald-950/20 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{trail.name}{trail.ref ? ` (${trail.ref})` : ""}</p>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              {diffBadge(trail.difficulty)}
                              {trail.length > 0 && <span className="text-[10px] text-muted-foreground">{trail.length} mi</span>}
                            </div>
                          </div>
                          <ChevronRight size={12} className="text-muted-foreground shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {!showLogForm ? (
              <Button size="sm" variant="outline" onClick={() => setShowLogForm(true)} className="gap-1.5 w-full">
                <Plus size={13} /> Log a Hike
              </Button>
            ) : (
              <div className="space-y-2.5 border rounded-xl p-3">
                <p className="text-xs font-semibold">Log a Hike</p>
                <Input placeholder="Trail / hike name *" value={logName} onChange={e => setLogName(e.target.value)} className="text-sm h-8" />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground font-medium block mb-0.5">Date *</label>
                    <Input type="date" value={logDate} onChange={e => setLogDate(e.target.value)} className="text-sm h-8" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground font-medium block mb-0.5">Distance (miles)</label>
                    <Input type="number" min={0} step={0.1} placeholder="e.g. 5.2" value={logDist} onChange={e => setLogDist(e.target.value)} className="text-sm h-8" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground font-medium block mb-0.5">Elevation gain (ft)</label>
                    <Input type="number" min={0} placeholder="e.g. 1200" value={logElev} onChange={e => setLogElev(e.target.value)} className="text-sm h-8" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground font-medium block mb-0.5">Duration (mins)</label>
                    <Input type="number" min={0} placeholder="e.g. 180" value={logDur} onChange={e => setLogDur(e.target.value)} className="text-sm h-8" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground font-medium block mb-0.5">Difficulty</label>
                    <Select value={logDiff} onValueChange={setLogDiff}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
                      <SelectContent>
                        {["Green", "Blue", "Black", "Dbl Black", "Terrifying"].map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground font-medium block mb-0.5">Rating (1–5)</label>
                    <Select value={logRating} onValueChange={setLogRating}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Stars…" /></SelectTrigger>
                      <SelectContent>
                        {[5,4,3,2,1].map(n => <SelectItem key={n} value={String(n)}>{"★".repeat(n)}{"☆".repeat(5-n)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Textarea placeholder="Notes (optional)" value={logNotes} onChange={e => setLogNotes(e.target.value)} className="text-sm min-h-[50px]" />
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="ghost" onClick={() => setShowLogForm(false)}>Cancel</Button>
                  <Button size="sm" disabled={!logName.trim() || !logDate} onClick={saveLog} className="gap-1.5"><Check size={12} /> Save</Button>
                </div>
              </div>
            )}

            {/* Log list */}
            {hikeLog.length > 0 ? (
              <div className="space-y-2">
                {[...hikeLog].sort((a, b) => b.date.localeCompare(a.date)).map(entry => (
                  <div key={entry.id} className="p-3 rounded-xl border bg-card space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{entry.name}</p>
                        <p className="text-xs text-muted-foreground">{format(parseISO(entry.date), "MMM d, yyyy")}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {entry.rating && <span className="text-xs text-amber-500">{"★".repeat(entry.rating)}</span>}
                        <button onClick={() => deleteLog(entry.id)} className="p-1 text-muted-foreground hover:text-destructive transition-colors"><Trash2 size={12} /></button>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      {entry.distanceMiles > 0 && <span className="flex items-center gap-0.5"><Mountain size={10}/> {entry.distanceMiles} mi</span>}
                      {entry.elevationGainFt && <span>+{entry.elevationGainFt}ft</span>}
                      {entry.durationMins && <span>{Math.floor(entry.durationMins / 60)}h {entry.durationMins % 60}m</span>}
                      {diffBadge(entry.difficulty)}
                    </div>
                    {entry.notes && <p className="text-xs text-muted-foreground">{entry.notes}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <Mountain size={24} className="mx-auto mb-2 opacity-20" />
                <p className="text-xs">No hikes logged yet — click "Log a Hike" to add your first</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── CyclingSection ────────────────────────────────────────────────────────────

function CyclingSection({ hobby, onUpdateExtra }: {
  hobby: Hobby;
  onUpdateExtra: (newExtraJson: string) => void;
}) {
  const { toast } = useToast();
  const [tab, setTab] = useState<"wishlist" | "log">("wishlist");
  const [showLogForm, setShowLogForm] = useState(false);
  const [showLogSearch, setShowLogSearch] = useState(false);

  const wishlistSearch = useCycleRouteSearch();
  const logSearch      = useCycleRouteSearch();

  // Log form state
  const [logName,     setLogName]     = useState("");
  const [logDate,     setLogDate]     = useState(new Date().toISOString().slice(0, 10));
  const [logDist,     setLogDist]     = useState("");
  const [logElev,     setLogElev]     = useState("");
  const [logDur,      setLogDur]      = useState("");
  const [logSpeed,    setLogSpeed]    = useState("");
  const [logType,     setLogType]     = useState("");
  const [logRating,   setLogRating]   = useState("");
  const [logNotes,    setLogNotes]    = useState("");

  const wishlist = parseCycleWishlist(hobby.extraJson ?? "{}");
  const rideLog  = parseRideLog(hobby.extraJson ?? "{}");

  function saveCycling(w: CycleWishlistEntry[], l: RideLogEntry[]) {
    onUpdateExtra(setCyclingInExtra(hobby.extraJson ?? "{}", w, l));
  }

  function addToWishlist(route: any) {
    if (wishlist.some(w => w.routeId === route.id)) { toast({ title: "Already on wishlist" }); return; }
    const entry: CycleWishlistEntry = {
      id: genId(), routeId: route.id, name: route.name,
      location: route.location ?? "", lengthMiles: route.length ?? 0,
      url: route.url, addedAt: new Date().toISOString(),
    };
    saveCycling([...wishlist, entry], rideLog);
    toast({ title: `"${route.name}" added to wishlist` });
  }

  function removeWishlist(id: string) { saveCycling(wishlist.filter(w => w.id !== id), rideLog); }

  function prefillLog(name: string, dist: number) {
    setLogName(name);
    setLogDist(dist > 0 ? String(dist) : "");
  }

  function logFromWishlist(w: CycleWishlistEntry) {
    prefillLog(w.name, w.lengthMiles);
    setTab("log"); setShowLogForm(true);
  }

  function logFromSearchResult(route: any) {
    prefillLog(route.name, route.length ?? 0);
    logSearch.setSearchResults([]);
    setShowLogSearch(false);
    setShowLogForm(true);
    toast({ title: `"${route.name}" pre-filled in log` });
  }

  function saveLog() {
    if (!logName.trim() || !logDate) return;
    const entry: RideLogEntry = {
      id: genId(), name: logName.trim(), date: logDate,
      distanceMiles: Number(logDist) || 0,
      elevationGainFt: logElev ? Number(logElev) : undefined,
      durationMins: logDur ? Number(logDur) : undefined,
      avgSpeedMph: logSpeed ? Number(logSpeed) : undefined,
      rideType: logType || undefined,
      rating: logRating ? Number(logRating) : undefined,
      notes: logNotes.trim() || undefined,
    };
    saveCycling(wishlist, [...rideLog, entry]);
    setShowLogForm(false);
    setLogName(""); setLogDate(new Date().toISOString().slice(0, 10));
    setLogDist(""); setLogElev(""); setLogDur(""); setLogSpeed(""); setLogType(""); setLogRating(""); setLogNotes("");
    toast({ title: "Ride logged!" });
  }

  function deleteLog(id: string) { saveCycling(wishlist, rideLog.filter(l => l.id !== id)); }

  return (
    <div className="border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-blue-50/60 dark:bg-blue-950/20 border-b border-blue-200 dark:border-blue-800">
        <div className="flex items-center gap-2">
          <span className="text-sm">🚲</span>
          <span className="text-sm font-semibold text-blue-800 dark:text-blue-300">Routes & Rides</span>
          <span className="text-xs text-muted-foreground">{wishlist.length} wishlist · {rideLog.length} logged</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setTab("wishlist")} className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${tab === "wishlist" ? "bg-blue-600 text-white" : "text-muted-foreground hover:bg-secondary"}`}>Wishlist</button>
          <button onClick={() => setTab("log")}      className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${tab === "log"      ? "bg-blue-600 text-white" : "text-muted-foreground hover:bg-secondary"}`}>Log</button>
        </div>
      </div>

      <div className="p-3 space-y-3">
        {/* WISHLIST TAB */}
        {tab === "wishlist" && (
          <>
            <div className="flex gap-2">
              <Input
                placeholder="Search cycling routes near… (e.g. Bristol, UK)"
                value={wishlistSearch.locationInput}
                onChange={e => wishlistSearch.setLocationInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") wishlistSearch.runSearch(); }}
                className="text-sm h-8 flex-1"
              />
              <Button size="sm" variant="outline" onClick={() => wishlistSearch.runSearch()} disabled={wishlistSearch.searching || !wishlistSearch.locationInput.trim()} className="h-8 gap-1.5 shrink-0">
                {wishlistSearch.searching ? <RefreshCw size={12} className="animate-spin" /> : <Search size={12} />}
                {wishlistSearch.searching ? "Searching…" : "Search"}
              </Button>
            </div>

            {wishlistSearch.searchError && <p className="text-xs text-destructive">{wishlistSearch.searchError}</p>}

            {wishlistSearch.searchResults.length > 0 && (
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{wishlistSearch.searchResults.length} routes found via Waymarked Trails</p>
                {wishlistSearch.searchResults.map((route: any) => (
                  <div key={route.id} className="flex items-start gap-2 p-2 rounded-lg border bg-card hover:bg-secondary/30 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <p className="text-xs font-semibold truncate">{route.name}</p>
                        {route.ref && <span className="text-[10px] text-muted-foreground shrink-0">({route.ref})</span>}
                      </div>
                      {route.description && <p className="text-[10px] text-muted-foreground truncate italic">{route.description}</p>}
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {route.length > 0 && <span className="text-[10px] text-muted-foreground">{route.length} mi</span>}
                        {route.network && <span className="text-[10px] text-muted-foreground capitalize">{route.network}</span>}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <button onClick={() => addToWishlist(route)} className="text-[10px] px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                        + Wishlist
                      </button>
                      {route.url && <a href={route.url} target="_blank" rel="noopener noreferrer" className="text-[10px] px-2 py-1 rounded border hover:bg-secondary transition-colors text-center">View ↗</a>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {wishlist.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Your Wishlist</p>
                {wishlist.map(w => (
                  <div key={w.id} className="flex items-start gap-2 p-2.5 rounded-lg border bg-card">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{w.name}</p>
                      {w.location && <p className="text-[10px] text-muted-foreground truncate">{w.location}</p>}
                      {w.lengthMiles > 0 && <span className="text-[10px] text-muted-foreground">{w.lengthMiles} mi</span>}
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <button onClick={() => logFromWishlist(w)} className="text-[10px] px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors">Log it</button>
                      <button onClick={() => removeWishlist(w.id)} className="text-[10px] px-2 py-1 rounded border hover:bg-destructive/10 hover:text-destructive transition-colors">Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {wishlist.length === 0 && wishlistSearch.searchResults.length === 0 && (
              <div className="text-center py-6 text-muted-foreground">
                <span className="text-2xl block mb-2 opacity-30">🚲</span>
                <p className="text-xs">Search for cycling routes above to build your wishlist</p>
              </div>
            )}
          </>
        )}

        {/* LOG TAB */}
        {tab === "log" && (
          <>
            {/* Route search to pre-fill log */}
            <div className="border rounded-xl overflow-hidden">
              <button
                onClick={() => { setShowLogSearch(s => !s); logSearch.setSearchResults([]); }}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-blue-700 dark:text-blue-400 bg-blue-50/60 dark:bg-blue-950/20 hover:bg-blue-100/60 transition-colors"
              >
                <span className="flex items-center gap-1.5"><Search size={11} /> Find a route to pre-fill</span>
                {showLogSearch ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
              {showLogSearch && (
                <div className="p-2.5 space-y-2 border-t">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Search near… (e.g. Manchester, UK)"
                      value={logSearch.locationInput}
                      onChange={e => logSearch.setLocationInput(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") logSearch.runSearch(); }}
                      className="text-sm h-8 flex-1"
                    />
                    <Button size="sm" variant="outline" onClick={() => logSearch.runSearch()} disabled={logSearch.searching || !logSearch.locationInput.trim()} className="h-8 gap-1 shrink-0">
                      {logSearch.searching ? <RefreshCw size={11} className="animate-spin" /> : <Search size={11} />}
                      {logSearch.searching ? "…" : "Search"}
                    </Button>
                  </div>
                  {logSearch.searchError && <p className="text-xs text-destructive">{logSearch.searchError}</p>}
                  {logSearch.searchResults.length > 0 && (
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      <p className="text-[10px] text-muted-foreground">{logSearch.searchResults.length} routes — click one to pre-fill</p>
                      {logSearch.searchResults.map((route: any) => (
                        <button
                          key={route.id}
                          onClick={() => logFromSearchResult(route)}
                          className="w-full text-left flex items-center justify-between gap-2 p-2 rounded-lg border bg-card hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{route.name}{route.ref ? ` (${route.ref})` : ""}</p>
                            {route.length > 0 && <span className="text-[10px] text-muted-foreground">{route.length} mi</span>}
                          </div>
                          <ChevronRight size={12} className="text-muted-foreground shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {!showLogForm ? (
              <Button size="sm" variant="outline" onClick={() => setShowLogForm(true)} className="gap-1.5 w-full">
                <Plus size={13} /> Log a Ride
              </Button>
            ) : (
              <div className="space-y-2.5 border rounded-xl p-3">
                <p className="text-xs font-semibold">Log a Ride</p>
                <Input placeholder="Route / ride name *" value={logName} onChange={e => setLogName(e.target.value)} className="text-sm h-8" />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground font-medium block mb-0.5">Date *</label>
                    <Input type="date" value={logDate} onChange={e => setLogDate(e.target.value)} className="text-sm h-8" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground font-medium block mb-0.5">Distance (miles)</label>
                    <Input type="number" min={0} step={0.1} placeholder="e.g. 32.5" value={logDist} onChange={e => setLogDist(e.target.value)} className="text-sm h-8" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground font-medium block mb-0.5">Elevation gain (ft)</label>
                    <Input type="number" min={0} placeholder="e.g. 1800" value={logElev} onChange={e => setLogElev(e.target.value)} className="text-sm h-8" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground font-medium block mb-0.5">Duration (mins)</label>
                    <Input type="number" min={0} placeholder="e.g. 120" value={logDur} onChange={e => setLogDur(e.target.value)} className="text-sm h-8" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground font-medium block mb-0.5">Avg speed (mph)</label>
                    <Input type="number" min={0} step={0.1} placeholder="e.g. 16.2" value={logSpeed} onChange={e => setLogSpeed(e.target.value)} className="text-sm h-8" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground font-medium block mb-0.5">Ride type</label>
                    <Select value={logType} onValueChange={setLogType}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
                      <SelectContent>
                        {RIDE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground font-medium block mb-0.5">Rating (1–5)</label>
                  <Select value={logRating} onValueChange={setLogRating}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Stars…" /></SelectTrigger>
                    <SelectContent>
                      {[5,4,3,2,1].map(n => <SelectItem key={n} value={String(n)}>{"★".repeat(n)}{"☆".repeat(5-n)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Textarea placeholder="Notes (optional)" value={logNotes} onChange={e => setLogNotes(e.target.value)} className="text-sm min-h-[50px]" />
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="ghost" onClick={() => setShowLogForm(false)}>Cancel</Button>
                  <Button size="sm" disabled={!logName.trim() || !logDate} onClick={saveLog} className="gap-1.5"><Check size={12} /> Save</Button>
                </div>
              </div>
            )}

            {/* Ride log list */}
            {rideLog.length > 0 ? (
              <div className="space-y-2">
                {[...rideLog].sort((a, b) => b.date.localeCompare(a.date)).map(entry => (
                  <div key={entry.id} className="p-3 rounded-xl border bg-card space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{entry.name}</p>
                        <p className="text-xs text-muted-foreground">{format(parseISO(entry.date), "MMM d, yyyy")}{entry.rideType ? ` · ${entry.rideType}` : ""}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {entry.rating && <span className="text-xs text-amber-500">{"★".repeat(entry.rating)}</span>}
                        <button onClick={() => deleteLog(entry.id)} className="p-1 text-muted-foreground hover:text-destructive transition-colors"><Trash2 size={12} /></button>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      {entry.distanceMiles > 0 && <span>🚲 {entry.distanceMiles} mi</span>}
                      {entry.elevationGainFt && <span>↑ {entry.elevationGainFt}ft</span>}
                      {entry.durationMins && <span>⏱ {Math.floor(entry.durationMins / 60)}h {entry.durationMins % 60}m</span>}
                      {entry.avgSpeedMph && <span>⚡ {entry.avgSpeedMph} mph</span>}
                    </div>
                    {entry.notes && <p className="text-xs text-muted-foreground">{entry.notes}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <span className="text-2xl block mb-2 opacity-20">🚲</span>
                <p className="text-xs">No rides logged yet — click "Log a Ride" to add your first</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── FishingSection ────────────────────────────────────────────────────────────

function useFishSearch() {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [error, setError] = useState("");

  async function runSearch(q?: string) {
    const s = (q ?? query).trim();
    if (!s) return;
    setSearching(true); setResults([]); setError("");
    try {
      const r = await fetch(`/api/fish/search?q=${encodeURIComponent(s)}`);
      const data = await r.json();
      if (!data.results?.length) { setError("No fish found. Try a common name like 'bass', 'trout', or 'perch'."); }
      else { setResults(data.results); }
    } catch { setError("Search failed."); }
    setSearching(false);
  }

  return { query, setQuery, searching, results, setResults, error, runSearch };
}

function FishingSection({ hobby, onUpdateExtra }: {
  hobby: Hobby;
  onUpdateExtra: (newExtraJson: string) => void;
}) {
  const { toast } = useToast();
  const [tab, setTab] = useState<"log" | "bucket">("log");
  const [showLogForm, setShowLogForm] = useState(false);

  // Species search for the log form
  const logSearch   = useFishSearch();
  // Bucket list species search
  const bucketSearch = useFishSearch();

  // Log form state
  const [logSpeciesName,  setLogSpeciesName]  = useState("");
  const [logSciName,      setLogSciName]      = useState("");
  const [logSpeciesId,    setLogSpeciesId]    = useState<number | undefined>();
  const [logSpeciesPhoto, setLogSpeciesPhoto] = useState("");
  const [logDate,         setLogDate]         = useState(new Date().toISOString().slice(0, 10));
  const [logWeight,       setLogWeight]       = useState("");
  const [logLength,       setLogLength]       = useState("");
  const [logLocation,     setLogLocation]     = useState("");
  const [logLure,         setLogLure]         = useState("");
  const [logNotes,        setLogNotes]        = useState("");
  const [logPhotoUrl,     setLogPhotoUrl]     = useState("");
  const [logIsPB,         setLogIsPB]         = useState(false);

  const catches = parseFishCatches(hobby.extraJson ?? "{}");
  const bucket  = parseFishBucket(hobby.extraJson ?? "{}");

  function saveFishing(c: FishCatchEntry[], b: FishBucketEntry[]) {
    onUpdateExtra(setFishingInExtra(hobby.extraJson ?? "{}", c, b));
  }

  function selectLogSpecies(fish: any) {
    setLogSpeciesName(fish.name);
    setLogSciName(fish.sciName ?? "");
    setLogSpeciesId(fish.id);
    setLogSpeciesPhoto(fish.photoUrl ?? "");
    logSearch.setResults([]);
    logSearch.setQuery("");
  }

  function saveLog() {
    if (!logSpeciesName.trim() || !logDate) return;
    const entry: FishCatchEntry = {
      id: genId(),
      speciesId:  logSpeciesId,
      speciesName: logSpeciesName.trim(),
      sciName:    logSciName || undefined,
      photoUrl:   logSpeciesPhoto || undefined,
      userPhotoUrl: logPhotoUrl.trim() || undefined,
      date:       logDate,
      weightLbs:  logWeight ? Number(logWeight) : undefined,
      lengthIn:   logLength ? Number(logLength) : undefined,
      location:   logLocation.trim() || undefined,
      lure:       logLure.trim() || undefined,
      notes:      logNotes.trim() || undefined,
      isPersonalBest: logIsPB || undefined,
    };
    saveFishing([...catches, entry], bucket);
    setShowLogForm(false);
    setLogSpeciesName(""); setLogSciName(""); setLogSpeciesId(undefined); setLogSpeciesPhoto("");
    setLogDate(new Date().toISOString().slice(0,10));
    setLogWeight(""); setLogLength(""); setLogLocation(""); setLogLure(""); setLogNotes(""); setLogPhotoUrl(""); setLogIsPB(false);
    toast({ title: "Catch logged!" });
  }

  function deleteCatch(id: string) { saveFishing(catches.filter(c => c.id !== id), bucket); }

  function addToBucket(fish: any) {
    if (bucket.some(b => b.speciesId === fish.id)) { toast({ title: "Already on bucket list" }); return; }
    const entry: FishBucketEntry = {
      id: genId(), speciesId: fish.id, speciesName: fish.name,
      sciName: fish.sciName ?? undefined, photoUrl: fish.photoUrl ?? undefined,
      addedAt: new Date().toISOString(),
    };
    saveFishing(catches, [...bucket, entry]);
    toast({ title: `"${fish.name}" added to bucket list` });
  }

  function removeFromBucket(id: string) { saveFishing(catches, bucket.filter(b => b.id !== id)); }

  return (
    <div className="border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-teal-50/60 dark:bg-teal-950/20 border-b border-teal-200 dark:border-teal-800">
        <div className="flex items-center gap-2">
          <span className="text-sm">🎣</span>
          <span className="text-sm font-semibold text-teal-800 dark:text-teal-300">Catches & Bucket List</span>
          <span className="text-xs text-muted-foreground">{catches.length} caught · {bucket.length} to catch</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setTab("log")}    className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${tab === "log"    ? "bg-teal-600 text-white" : "text-muted-foreground hover:bg-secondary"}`}>Catch Log</button>
          <button onClick={() => setTab("bucket")} className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${tab === "bucket" ? "bg-teal-600 text-white" : "text-muted-foreground hover:bg-secondary"}`}>Bucket List</button>
        </div>
      </div>

      <div className="p-3 space-y-3">

        {/* ── CATCH LOG TAB ── */}
        {tab === "log" && (
          <>
            {!showLogForm ? (
              <Button size="sm" variant="outline" onClick={() => setShowLogForm(true)} className="gap-1.5 w-full">
                <Plus size={13} /> Log a Catch
              </Button>
            ) : (
              <div className="space-y-2.5 border rounded-xl p-3">
                <p className="text-xs font-semibold">Log a Catch</p>

                {/* Species search */}
                <div>
                  <label className="text-[10px] text-muted-foreground font-medium block mb-0.5">Species *</label>
                  {logSpeciesName ? (
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-teal-50/60 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-800">
                      {logSpeciesPhoto && <img src={logSpeciesPhoto} alt={logSpeciesName} className="w-8 h-8 rounded object-cover shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold truncate">{logSpeciesName}</p>
                        {logSciName && <p className="text-[10px] text-muted-foreground italic truncate">{logSciName}</p>}
                      </div>
                      <button onClick={() => { setLogSpeciesName(""); setLogSciName(""); setLogSpeciesId(undefined); setLogSpeciesPhoto(""); }} className="text-[10px] text-muted-foreground hover:text-destructive shrink-0"><X size={12} /></button>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="flex gap-2">
                        <Input placeholder="Search species (e.g. largemouth bass, rainbow trout)…"
                          value={logSearch.query} onChange={e => logSearch.setQuery(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") logSearch.runSearch(); }}
                          className="text-sm h-8 flex-1" />
                        <Button size="sm" variant="outline" onClick={() => logSearch.runSearch()} disabled={logSearch.searching || !logSearch.query.trim()} className="h-8 gap-1 shrink-0">
                          {logSearch.searching ? <RefreshCw size={11} className="animate-spin" /> : <Search size={11} />}
                        </Button>
                      </div>
                      {logSearch.error && <p className="text-xs text-destructive">{logSearch.error}</p>}
                      {logSearch.results.length > 0 && (
                        <div className="space-y-1 max-h-44 overflow-y-auto">
                          <p className="text-[10px] text-muted-foreground">Powered by iNaturalist — click to select</p>
                          {logSearch.results.map((fish: any) => (
                            <button key={fish.id} onClick={() => selectLogSpecies(fish)}
                              className="w-full text-left flex items-center gap-2 p-2 rounded-lg border bg-card hover:bg-teal-50 dark:hover:bg-teal-950/20 transition-colors">
                              {fish.photoUrl
                                ? <img src={fish.photoUrl} alt={fish.name} className="w-8 h-8 rounded object-cover shrink-0" />
                                : <div className="w-8 h-8 rounded bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center shrink-0 text-sm">🐟</div>}
                              <div className="min-w-0">
                                <p className="text-xs font-medium truncate">{fish.name}</p>
                                <p className="text-[10px] text-muted-foreground italic truncate">{fish.sciName}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                      {/* Manual entry if search doesn't find it */}
                      <Input placeholder="Or type species name manually…"
                        value={logSpeciesName} onChange={e => setLogSpeciesName(e.target.value)}
                        className="text-sm h-8" />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground font-medium block mb-0.5">Date *</label>
                    <Input type="date" value={logDate} onChange={e => setLogDate(e.target.value)} className="text-sm h-8" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground font-medium block mb-0.5">Weight (lbs)</label>
                    <Input type="number" min={0} step={0.1} placeholder="e.g. 4.5" value={logWeight} onChange={e => setLogWeight(e.target.value)} className="text-sm h-8" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground font-medium block mb-0.5">Length (inches)</label>
                    <Input type="number" min={0} step={0.25} placeholder="e.g. 18.5" value={logLength} onChange={e => setLogLength(e.target.value)} className="text-sm h-8" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground font-medium block mb-0.5">Location</label>
                    <Input placeholder="e.g. Lake Cumberland" value={logLocation} onChange={e => setLogLocation(e.target.value)} className="text-sm h-8" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground font-medium block mb-0.5">Lure / bait</label>
                  <Input placeholder={'e.g. 5" Senko, Texas-rigged'} value={logLure} onChange={e => setLogLure(e.target.value)} className="text-sm h-8" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground font-medium block mb-0.5">Photo URL (optional)</label>
                  <Input placeholder="Paste an image URL for your catch photo…" value={logPhotoUrl} onChange={e => setLogPhotoUrl(e.target.value)} className="text-sm h-8" />
                </div>
                <Textarea placeholder="Notes (optional)" value={logNotes} onChange={e => setLogNotes(e.target.value)} className="text-sm min-h-[50px]" />
                <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                  <input type="checkbox" checked={logIsPB} onChange={e => setLogIsPB(e.target.checked)} className="rounded" />
                  <span className="font-medium">🏆 Mark as personal best</span>
                </label>
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="ghost" onClick={() => setShowLogForm(false)}>Cancel</Button>
                  <Button size="sm" disabled={!logSpeciesName.trim() || !logDate} onClick={saveLog} className="gap-1.5"><Check size={12} /> Save</Button>
                </div>
              </div>
            )}

            {/* Catch list */}
            {catches.length > 0 ? (
              <div className="space-y-2">
                {[...catches].sort((a, b) => b.date.localeCompare(a.date)).map(entry => (
                  <div key={entry.id} className="p-3 rounded-xl border bg-card space-y-2">
                    <div className="flex items-start gap-2.5">
                      {(entry.userPhotoUrl || entry.photoUrl) && (
                        <img src={entry.userPhotoUrl || entry.photoUrl} alt={entry.speciesName}
                          className="w-14 h-14 rounded-lg object-cover shrink-0 border" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm font-semibold truncate">{entry.speciesName}</p>
                          {entry.isPersonalBest && <span className="text-[10px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/30 px-1.5 py-0.5 rounded-full border border-amber-200">🏆 PB</span>}
                        </div>
                        {entry.sciName && <p className="text-[10px] text-muted-foreground italic">{entry.sciName}</p>}
                        <p className="text-xs text-muted-foreground">{format(parseISO(entry.date), "MMM d, yyyy")}{entry.location ? ` · ${entry.location}` : ""}</p>
                      </div>
                      <button onClick={() => deleteCatch(entry.id)} className="p-1 text-muted-foreground hover:text-destructive transition-colors shrink-0"><Trash2 size={12} /></button>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      {entry.weightLbs && <span>⚖️ {entry.weightLbs} lbs</span>}
                      {entry.lengthIn && <span>📏 {entry.lengthIn}"</span>}
                      {entry.lure && <span>🪝 {entry.lure}</span>}
                    </div>
                    {entry.notes && <p className="text-xs text-muted-foreground">{entry.notes}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <span className="text-2xl block mb-2 opacity-20">🎣</span>
                <p className="text-xs">No catches logged yet — click "Log a Catch" above</p>
              </div>
            )}
          </>
        )}

        {/* ── BUCKET LIST TAB ── */}
        {tab === "bucket" && (
          <>
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input placeholder="Search species to add (e.g. muskie, steelhead)…"
                  value={bucketSearch.query} onChange={e => bucketSearch.setQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") bucketSearch.runSearch(); }}
                  className="text-sm h-8 flex-1" />
                <Button size="sm" variant="outline" onClick={() => bucketSearch.runSearch()} disabled={bucketSearch.searching || !bucketSearch.query.trim()} className="h-8 gap-1.5 shrink-0">
                  {bucketSearch.searching ? <RefreshCw size={12} className="animate-spin" /> : <Search size={12} />}
                  {bucketSearch.searching ? "Searching…" : "Search"}
                </Button>
              </div>
              {bucketSearch.error && <p className="text-xs text-destructive">{bucketSearch.error}</p>}
              {bucketSearch.results.length > 0 && (
                <div className="space-y-1.5 max-h-60 overflow-y-auto">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">iNaturalist results</p>
                  {bucketSearch.results.map((fish: any) => {
                    const already = bucket.some(b => b.speciesId === fish.id);
                    const caught  = catches.some(c => c.speciesId === fish.id);
                    return (
                      <div key={fish.id} className="flex items-center gap-2 p-2 rounded-lg border bg-card hover:bg-secondary/30 transition-colors">
                        {fish.photoUrl
                          ? <img src={fish.photoUrl} alt={fish.name} className="w-9 h-9 rounded object-cover shrink-0" />
                          : <div className="w-9 h-9 rounded bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center shrink-0 text-base">🐟</div>}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold truncate">{fish.name}</p>
                          <p className="text-[10px] text-muted-foreground italic truncate">{fish.sciName}</p>
                        </div>
                        <div className="shrink-0">
                          {caught
                            ? <span className="text-[10px] px-2 py-1 rounded bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 font-medium">✓ Caught</span>
                            : already
                            ? <span className="text-[10px] px-2 py-1 rounded bg-secondary text-muted-foreground">Added</span>
                            : <button onClick={() => addToBucket(fish)} className="text-[10px] px-2 py-1 rounded bg-teal-600 text-white hover:bg-teal-700 transition-colors">+ Add</button>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {bucket.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Your bucket list</p>
                {bucket.map(b => {
                  const caught = catches.some(c => c.speciesId === b.speciesId || c.speciesName.toLowerCase() === b.speciesName.toLowerCase());
                  return (
                    <div key={b.id} className={`flex items-center gap-2.5 p-2.5 rounded-lg border bg-card ${caught ? "opacity-60" : ""}`}>
                      {b.photoUrl
                        ? <img src={b.photoUrl} alt={b.speciesName} className="w-9 h-9 rounded object-cover shrink-0" />
                        : <div className="w-9 h-9 rounded bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center shrink-0 text-base">🐟</div>}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className={`text-xs font-semibold truncate ${caught ? "line-through text-muted-foreground" : ""}`}>{b.speciesName}</p>
                          {caught && <span className="text-[10px] text-teal-600 font-medium shrink-0">✓</span>}
                        </div>
                        {b.sciName && <p className="text-[10px] text-muted-foreground italic truncate">{b.sciName}</p>}
                      </div>
                      <button onClick={() => removeFromBucket(b.id)} className="p-1 text-muted-foreground hover:text-destructive transition-colors shrink-0"><X size={12} /></button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <span className="text-2xl block mb-2 opacity-20">🐟</span>
                <p className="text-xs">Search for species above to build your fishing bucket list</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── useOpenBetaSearch hook ────────────────────────────────────────────────────

function useOpenBetaSearch() {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [error, setError] = useState("");

  async function runSearch(q?: string) {
    const s = (q ?? query).trim();
    if (!s) return;
    setSearching(true); setResults([]); setError("");
    try {
      const r = await fetch(`/api/climbing/search?q=${encodeURIComponent(s)}`);
      const data = await r.json();
      if (data.error) { setError(data.error); }
      else if (!data.results?.length) { setError("No routes found. Try a route name or area (e.g. 'Yosemite', 'sport 5.11')."); }
      else { setResults(data.results); }
    } catch { setError("Search failed."); }
    setSearching(false);
  }

  return { query, setQuery, searching, results, setResults, error, runSearch };
}

// ── ClimbingSection ───────────────────────────────────────────────────────────

function ClimbingSection({ hobby, onUpdateExtra }: {
  hobby: Hobby;
  onUpdateExtra: (newExtraJson: string) => void;
}) {
  const { toast } = useToast();
  const [tab, setTab] = useState<"log" | "projects">("log");
  const [showLogForm, setShowLogForm] = useState(false);

  const logSearch      = useOpenBetaSearch();
  const projectSearch  = useOpenBetaSearch();

  // Log form state
  const [logRouteName,  setLogRouteName]  = useState("");
  const [logGrade,      setLogGrade]      = useState("");
  const [logClimbType,  setLogClimbType]  = useState("Sport");
  const [logDate,       setLogDate]       = useState(new Date().toISOString().slice(0, 10));
  const [logAscentType, setLogAscentType] = useState<"Onsight" | "Flash" | "Redpoint" | "Attempt">("Redpoint");
  const [logLocation,   setLogLocation]   = useState("");
  const [logNotes,      setLogNotes]      = useState("");
  const [logRouteId,    setLogRouteId]    = useState<string | undefined>();

  const climbLog = parseClimbLog(hobby.extraJson ?? "{}");
  const projects = parseClimbProjects(hobby.extraJson ?? "{}");

  function saveClimbing(l: ClimbLogEntry[], p: ClimbProjectEntry[]) {
    onUpdateExtra(setClimbingInExtra(hobby.extraJson ?? "{}", l, p));
  }

  function selectLogRoute(r: any) {
    setLogRouteName(r.name ?? "");
    setLogGrade(r.grade ?? "");
    setLogClimbType(r.climbType ?? "Sport");
    setLogRouteId(r.id);
    logSearch.setResults([]);
    logSearch.setQuery("");
  }

  function saveLog() {
    if (!logRouteName.trim() || !logDate) return;
    const entry: ClimbLogEntry = {
      id: genId(), routeId: logRouteId, routeName: logRouteName.trim(),
      grade: logGrade.trim() || undefined, climbType: logClimbType || undefined,
      date: logDate, ascentType: logAscentType,
      location: logLocation.trim() || undefined, notes: logNotes.trim() || undefined,
    };
    saveClimbing([...climbLog, entry], projects);
    setShowLogForm(false);
    setLogRouteName(""); setLogGrade(""); setLogClimbType("Sport"); setLogRouteId(undefined);
    setLogDate(new Date().toISOString().slice(0, 10));
    setLogAscentType("Redpoint"); setLogLocation(""); setLogNotes("");
    toast({ title: "Ascent logged!" });
  }

  function deleteLog(id: string) { saveClimbing(climbLog.filter(e => e.id !== id), projects); }

  function addToProjects(r: any) {
    if (projects.some(p => p.routeId === r.id)) { toast({ title: "Already in project list" }); return; }
    const entry: ClimbProjectEntry = {
      id: genId(), routeId: r.id, routeName: r.name, grade: r.grade || undefined,
      climbType: r.climbType || undefined, location: r.location || undefined,
      description: r.description || undefined, addedAt: new Date().toISOString(),
    };
    saveClimbing(climbLog, [...projects, entry]);
    toast({ title: `"${r.name}" added to projects` });
  }

  function removeProject(id: string) { saveClimbing(climbLog, projects.filter(p => p.id !== id)); }

  const ASCENT_COLORS: Record<string, string> = {
    Onsight: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
    Flash:   "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
    Redpoint:"bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400",
    Attempt: "bg-secondary text-muted-foreground",
  };

  return (
    <div className="border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-orange-50/60 dark:bg-orange-950/20 border-b border-orange-200 dark:border-orange-800">
        <div className="flex items-center gap-2">
          <span className="text-sm">🧗</span>
          <span className="text-sm font-semibold text-orange-800 dark:text-orange-300">Send Log & Projects</span>
          <span className="text-xs text-muted-foreground">{climbLog.filter(e => e.ascentType !== "Attempt").length} sends · {projects.length} projects</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setTab("log")}      className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${tab === "log"      ? "bg-orange-600 text-white" : "text-muted-foreground hover:bg-secondary"}`}>Send Log</button>
          <button onClick={() => setTab("projects")} className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${tab === "projects" ? "bg-orange-600 text-white" : "text-muted-foreground hover:bg-secondary"}`}>Projects</button>
        </div>
      </div>

      <div className="p-3 space-y-3">

        {/* ── SEND LOG TAB ── */}
        {tab === "log" && (
          <>
            {!showLogForm ? (
              <Button size="sm" variant="outline" onClick={() => setShowLogForm(true)} className="gap-1.5 w-full">
                <Plus size={13} /> Log an Ascent
              </Button>
            ) : (
              <div className="space-y-2.5 border rounded-xl p-3">
                <p className="text-xs font-semibold">Log an Ascent</p>

                {/* Route search */}
                <div>
                  <label className="text-[10px] text-muted-foreground font-medium block mb-0.5">Route *</label>
                  {logRouteName ? (
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-orange-50/60 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold truncate">{logRouteName}</p>
                        {(logGrade || logClimbType) && <p className="text-[10px] text-muted-foreground">{logClimbType}{logGrade ? ` · ${logGrade}` : ""}</p>}
                      </div>
                      <button onClick={() => { setLogRouteName(""); setLogGrade(""); setLogRouteId(undefined); }} className="text-[10px] text-muted-foreground hover:text-destructive shrink-0"><X size={12} /></button>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="flex gap-2">
                        <Input placeholder="Search OpenBeta for a route or area…"
                          value={logSearch.query} onChange={e => logSearch.setQuery(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") logSearch.runSearch(); }}
                          className="text-sm h-8 flex-1" />
                        <Button size="sm" variant="outline" onClick={() => logSearch.runSearch()} disabled={logSearch.searching || !logSearch.query.trim()} className="h-8 gap-1 shrink-0">
                          {logSearch.searching ? <RefreshCw size={11} className="animate-spin" /> : <Search size={11} />}
                        </Button>
                      </div>
                      {logSearch.error && <p className="text-xs text-destructive">{logSearch.error}</p>}
                      {logSearch.results.length > 0 && (
                        <div className="space-y-1 max-h-44 overflow-y-auto">
                          <p className="text-[10px] text-muted-foreground">Powered by OpenBeta — click to select</p>
                          {logSearch.results.map((r: any) => (
                            <button key={r.id} onClick={() => selectLogRoute(r)}
                              className="w-full text-left flex items-center gap-2 p-2 rounded-lg border bg-card hover:bg-orange-50 dark:hover:bg-orange-950/20 transition-colors">
                              <div className="w-8 h-8 rounded bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center shrink-0 text-sm">🪨</div>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-medium truncate">{r.name}</p>
                                <p className="text-[10px] text-muted-foreground">{r.climbType}{r.grade ? ` · ${r.grade}` : ""}{r.location ? ` · ${r.location}` : ""}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                      <Input placeholder="Or type route name manually…"
                        value={logRouteName} onChange={e => setLogRouteName(e.target.value)}
                        className="text-sm h-8" />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground font-medium block mb-0.5">Grade</label>
                    <Input placeholder="e.g. 5.11a or V5" value={logGrade} onChange={e => setLogGrade(e.target.value)} className="text-sm h-8" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground font-medium block mb-0.5">Style</label>
                    <select value={logClimbType} onChange={e => setLogClimbType(e.target.value)} className="text-sm h-8 w-full rounded-md border border-input bg-background px-2">
                      {["Sport", "Boulder", "Trad", "Top Rope", "Multi-pitch", "Aid", "Ice"].map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground font-medium block mb-0.5">Date *</label>
                    <Input type="date" value={logDate} onChange={e => setLogDate(e.target.value)} className="text-sm h-8" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground font-medium block mb-0.5">Ascent type</label>
                    <select value={logAscentType} onChange={e => setLogAscentType(e.target.value as any)} className="text-sm h-8 w-full rounded-md border border-input bg-background px-2">
                      {["Onsight", "Flash", "Redpoint", "Attempt"].map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px] text-muted-foreground font-medium block mb-0.5">Location / Crag</label>
                    <Input placeholder="e.g. Red River Gorge, Smith Rock" value={logLocation} onChange={e => setLogLocation(e.target.value)} className="text-sm h-8" />
                  </div>
                </div>
                <Textarea placeholder="Notes (beta, conditions, what clicked, what to work…)" value={logNotes} onChange={e => setLogNotes(e.target.value)} className="text-sm min-h-[50px]" />
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="ghost" onClick={() => setShowLogForm(false)}>Cancel</Button>
                  <Button size="sm" disabled={!logRouteName.trim() || !logDate} onClick={saveLog} className="gap-1.5"><Check size={12} /> Save</Button>
                </div>
              </div>
            )}

            {/* Log list */}
            {climbLog.length > 0 ? (
              <div className="space-y-2">
                {[...climbLog].sort((a, b) => b.date.localeCompare(a.date)).map(entry => (
                  <div key={entry.id} className="p-3 rounded-xl border bg-card space-y-1.5">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm font-semibold truncate">{entry.routeName}</p>
                          {entry.grade && <span className="text-[10px] font-bold text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 px-1.5 py-0.5 rounded-full border border-orange-200 shrink-0">{entry.grade}</span>}
                          {entry.ascentType && <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${ASCENT_COLORS[entry.ascentType]}`}>{entry.ascentType}</span>}
                        </div>
                        <p className="text-xs text-muted-foreground">{format(parseISO(entry.date), "MMM d, yyyy")}{entry.climbType ? ` · ${entry.climbType}` : ""}{entry.location ? ` · ${entry.location}` : ""}</p>
                      </div>
                      <button onClick={() => deleteLog(entry.id)} className="p-1 text-muted-foreground hover:text-destructive transition-colors shrink-0"><Trash2 size={12} /></button>
                    </div>
                    {entry.notes && <p className="text-xs text-muted-foreground">{entry.notes}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <span className="text-2xl block mb-2 opacity-20">🧗</span>
                <p className="text-xs">No ascents logged yet — click "Log an Ascent" above</p>
              </div>
            )}
          </>
        )}

        {/* ── PROJECTS TAB ── */}
        {tab === "projects" && (
          <>
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input placeholder="Search OpenBeta for a route to project…"
                  value={projectSearch.query} onChange={e => projectSearch.setQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") projectSearch.runSearch(); }}
                  className="text-sm h-8 flex-1" />
                <Button size="sm" variant="outline" onClick={() => projectSearch.runSearch()} disabled={projectSearch.searching || !projectSearch.query.trim()} className="h-8 gap-1.5 shrink-0">
                  {projectSearch.searching ? <RefreshCw size={12} className="animate-spin" /> : <Search size={12} />}
                  {projectSearch.searching ? "Searching…" : "Search"}
                </Button>
              </div>
              {projectSearch.error && <p className="text-xs text-destructive">{projectSearch.error}</p>}
              {projectSearch.results.length > 0 && (
                <div className="space-y-1.5 max-h-60 overflow-y-auto">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">OpenBeta results</p>
                  {projectSearch.results.map((r: any) => {
                    const alreadyProject = projects.some(p => p.routeId === r.id);
                    const alreadySent    = climbLog.some(e => e.routeId === r.id && e.ascentType !== "Attempt");
                    return (
                      <div key={r.id} className="flex items-center gap-2 p-2 rounded-lg border bg-card hover:bg-secondary/30 transition-colors">
                        <div className="w-9 h-9 rounded bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center shrink-0 text-base">🪨</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold truncate">{r.name}</p>
                          <p className="text-[10px] text-muted-foreground">{r.climbType}{r.grade ? ` · ${r.grade}` : ""}{r.location ? ` · ${r.location}` : ""}</p>
                        </div>
                        <div className="shrink-0">
                          {alreadySent
                            ? <span className="text-[10px] px-2 py-1 rounded bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 font-medium">✓ Sent</span>
                            : alreadyProject
                            ? <span className="text-[10px] px-2 py-1 rounded bg-secondary text-muted-foreground">Added</span>
                            : <button onClick={() => addToProjects(r)} className="text-[10px] px-2 py-1 rounded bg-orange-600 text-white hover:bg-orange-700 transition-colors">+ Project</button>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {projects.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Your project list</p>
                {projects.map(p => {
                  const sent = climbLog.some(e => e.routeId === p.routeId && e.ascentType !== "Attempt");
                  return (
                    <div key={p.id} className={`flex items-center gap-2.5 p-2.5 rounded-lg border bg-card ${sent ? "opacity-60" : ""}`}>
                      <div className="w-9 h-9 rounded bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center shrink-0 text-base">🪨</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className={`text-xs font-semibold truncate ${sent ? "line-through text-muted-foreground" : ""}`}>{p.routeName}</p>
                          {sent && <span className="text-[10px] text-orange-600 font-medium shrink-0">✓</span>}
                          {p.grade && <span className="text-[10px] text-muted-foreground shrink-0">{p.grade}</span>}
                        </div>
                        {(p.climbType || p.location) && <p className="text-[10px] text-muted-foreground">{p.climbType}{p.location ? ` · ${p.location}` : ""}</p>}
                        {p.description && <p className="text-[10px] text-muted-foreground line-clamp-2">{p.description}</p>}
                      </div>
                      <button onClick={() => removeProject(p.id)} className="p-1 text-muted-foreground hover:text-destructive transition-colors shrink-0"><X size={12} /></button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <span className="text-2xl block mb-2 opacity-20">🪨</span>
                <p className="text-xs">Search for routes above to build your project list</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── PlantImg — handles Perenual CDN images that 403 on free tier ─────────────

function PlantImg({ src, alt, className, fallbackSize = "text-sm" }: {
  src: string | undefined | null;
  alt: string;
  className: string;
  fallbackSize?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed || !src) {
    return (
      <div className={`${className} bg-green-100 dark:bg-green-900/40 flex items-center justify-center shrink-0 ${fallbackSize}`}>
        🌿
      </div>
    );
  }
  return <img src={src} alt={alt} className={`${className} shrink-0`} onError={() => setFailed(true)} />;
}

// ── usePerenualSearch hook ─────────────────────────────────────────────────────

function usePerenualSearch() {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [error, setError] = useState("");

  async function runSearch(q?: string) {
    const s = (q ?? query).trim();
    if (!s) return;
    setSearching(true); setResults([]); setError("");
    try {
      const r = await fetch(`/api/perenual/search?q=${encodeURIComponent(s)}`);
      const data = await r.json();
      if (data.error) { setError(data.error); }
      else if (!Array.isArray(data) || !data.length) { setError("No plants found. Try a common name like 'tomato', 'rose', or 'lavender'."); }
      else { setResults(data); }
    } catch { setError("Search failed."); }
    setSearching(false);
  }

  return { query, setQuery, searching, results, setResults, error, runSearch };
}

// ── GardeningSection ──────────────────────────────────────────────────────────

function GardeningSection({ hobby, onUpdateExtra }: {
  hobby: Hobby;
  onUpdateExtra: (newExtraJson: string) => void;
}) {
  const { toast } = useToast();
  const [tab, setTab] = useState<"plants" | "wishlist">("plants");
  const [showLogForm, setShowLogForm] = useState(false);

  const plantSearch   = usePerenualSearch();
  const wishlistSearch = usePerenualSearch();

  // Log form state
  const [logCommonName,  setLogCommonName]  = useState("");
  const [logSciName,     setLogSciName]     = useState("");
  const [logPerenualId,  setLogPerenualId]  = useState<number | undefined>();
  const [logPhotoUrl,    setLogPhotoUrl]    = useState("");
  const [logPlantedDate, setLogPlantedDate] = useState(new Date().toISOString().slice(0, 10));
  const [logLocation,    setLogLocation]    = useState("");
  const [logQuantity,    setLogQuantity]    = useState("");
  const [logNotes,       setLogNotes]       = useState("");

  const plants   = parseGardenPlants(hobby.extraJson ?? "{}");
  const wishlist = parseGardenWishlist(hobby.extraJson ?? "{}");

  function saveGardening(p: GardenPlantEntry[], w: GardenWishlistEntry[]) {
    onUpdateExtra(setGardeningInExtra(hobby.extraJson ?? "{}", p, w));
  }

  function selectPlant(p: any) {
    setLogCommonName(p.common_name ?? "");
    setLogSciName(Array.isArray(p.scientific_name) ? p.scientific_name[0] : (p.scientific_name ?? ""));
    setLogPerenualId(p.id);
    setLogPhotoUrl(p.default_image?.small_url ?? "");
    plantSearch.setResults([]);
    plantSearch.setQuery("");
  }

  function savePlant() {
    if (!logCommonName.trim() || !logPlantedDate) return;
    const entry: GardenPlantEntry = {
      id: genId(),
      perenualId:  logPerenualId,
      commonName:  logCommonName.trim(),
      sciName:     logSciName || undefined,
      photoUrl:    logPhotoUrl || undefined,
      plantedDate: logPlantedDate,
      location:    logLocation.trim() || undefined,
      quantity:    logQuantity.trim() || undefined,
      notes:       logNotes.trim() || undefined,
    };
    saveGardening([...plants, entry], wishlist);
    setShowLogForm(false);
    setLogCommonName(""); setLogSciName(""); setLogPerenualId(undefined); setLogPhotoUrl("");
    setLogPlantedDate(new Date().toISOString().slice(0, 10));
    setLogLocation(""); setLogQuantity(""); setLogNotes("");
    toast({ title: "Plant logged!" });
  }

  function deletePlant(id: string) { saveGardening(plants.filter(p => p.id !== id), wishlist); }
  function toggleHarvested(id: string) {
    saveGardening(plants.map(p => p.id === id ? { ...p, isHarvested: !p.isHarvested } : p), wishlist);
  }

  function addToWishlist(p: any) {
    const cn = p.common_name ?? "";
    if (wishlist.some(w => w.perenualId === p.id)) { toast({ title: "Already on wishlist" }); return; }
    const entry: GardenWishlistEntry = {
      id: genId(), perenualId: p.id, commonName: cn,
      sciName: Array.isArray(p.scientific_name) ? p.scientific_name[0] : (p.scientific_name ?? undefined),
      photoUrl: p.default_image?.small_url ?? undefined,
      addedAt: new Date().toISOString(),
    };
    saveGardening(plants, [...wishlist, entry]);
    toast({ title: `"${cn}" added to wishlist` });
  }

  function removeFromWishlist(id: string) { saveGardening(plants, wishlist.filter(w => w.id !== id)); }

  return (
    <div className="border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-green-50/60 dark:bg-green-950/20 border-b border-green-200 dark:border-green-800">
        <div className="flex items-center gap-2">
          <span className="text-sm">🌿</span>
          <span className="text-sm font-semibold text-green-800 dark:text-green-300">Garden Log & Wishlist</span>
          <span className="text-xs text-muted-foreground">{plants.length} planted · {wishlist.length} wanted</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setTab("plants")}   className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${tab === "plants"   ? "bg-green-600 text-white" : "text-muted-foreground hover:bg-secondary"}`}>My Garden</button>
          <button onClick={() => setTab("wishlist")} className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${tab === "wishlist" ? "bg-green-600 text-white" : "text-muted-foreground hover:bg-secondary"}`}>Wishlist</button>
        </div>
      </div>

      <div className="p-3 space-y-3">

        {/* ── MY GARDEN TAB ── */}
        {tab === "plants" && (
          <>
            {!showLogForm ? (
              <Button size="sm" variant="outline" onClick={() => setShowLogForm(true)} className="gap-1.5 w-full">
                <Plus size={13} /> Log a Plant
              </Button>
            ) : (
              <div className="space-y-2.5 border rounded-xl p-3">
                <p className="text-xs font-semibold">Log a Plant</p>

                {/* Plant search */}
                <div>
                  <label className="text-[10px] text-muted-foreground font-medium block mb-0.5">Plant *</label>
                  {logCommonName ? (
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-green-50/60 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
                      <PlantImg src={logPhotoUrl} alt={logCommonName} className="w-8 h-8 rounded object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold truncate">{logCommonName}</p>
                        {logSciName && <p className="text-[10px] text-muted-foreground italic truncate">{logSciName}</p>}
                      </div>
                      <button onClick={() => { setLogCommonName(""); setLogSciName(""); setLogPerenualId(undefined); setLogPhotoUrl(""); }} className="text-[10px] text-muted-foreground hover:text-destructive shrink-0"><X size={12} /></button>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="flex gap-2">
                        <Input placeholder="Search plants (e.g. tomato, lavender, rose)…"
                          value={plantSearch.query} onChange={e => plantSearch.setQuery(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") plantSearch.runSearch(); }}
                          className="text-sm h-8 flex-1" />
                        <Button size="sm" variant="outline" onClick={() => plantSearch.runSearch()} disabled={plantSearch.searching || !plantSearch.query.trim()} className="h-8 gap-1 shrink-0">
                          {plantSearch.searching ? <RefreshCw size={11} className="animate-spin" /> : <Search size={11} />}
                        </Button>
                      </div>
                      {plantSearch.error && <p className="text-xs text-destructive">{plantSearch.error}</p>}
                      {plantSearch.results.length > 0 && (
                        <div className="space-y-1 max-h-44 overflow-y-auto">
                          <p className="text-[10px] text-muted-foreground">Powered by Perenual — click to select</p>
                          {plantSearch.results.map((p: any) => (
                            <button key={p.id} onClick={() => selectPlant(p)}
                              className="w-full text-left flex items-center gap-2 p-2 rounded-lg border bg-card hover:bg-green-50 dark:hover:bg-green-950/20 transition-colors">
                              <PlantImg src={p.default_image?.small_url} alt={p.common_name} className="w-8 h-8 rounded object-cover" />
                              <div className="min-w-0">
                                <p className="text-xs font-medium truncate">{p.common_name}</p>
                                <p className="text-[10px] text-muted-foreground italic truncate">{Array.isArray(p.scientific_name) ? p.scientific_name[0] : p.scientific_name}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                      <Input placeholder="Or type plant name manually…"
                        value={logCommonName} onChange={e => setLogCommonName(e.target.value)}
                        className="text-sm h-8" />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground font-medium block mb-0.5">Date planted *</label>
                    <Input type="date" value={logPlantedDate} onChange={e => setLogPlantedDate(e.target.value)} className="text-sm h-8" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground font-medium block mb-0.5">Quantity</label>
                    <Input placeholder="e.g. 4 plants" value={logQuantity} onChange={e => setLogQuantity(e.target.value)} className="text-sm h-8" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px] text-muted-foreground font-medium block mb-0.5">Location</label>
                    <Input placeholder="e.g. Raised bed 1, Container, Back border" value={logLocation} onChange={e => setLogLocation(e.target.value)} className="text-sm h-8" />
                  </div>
                </div>
                <Textarea placeholder="Notes (optional — soil prep, variety notes, observations…)" value={logNotes} onChange={e => setLogNotes(e.target.value)} className="text-sm min-h-[50px]" />
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="ghost" onClick={() => setShowLogForm(false)}>Cancel</Button>
                  <Button size="sm" disabled={!logCommonName.trim() || !logPlantedDate} onClick={savePlant} className="gap-1.5"><Check size={12} /> Save</Button>
                </div>
              </div>
            )}

            {/* Plant list */}
            {plants.length > 0 ? (
              <div className="space-y-2">
                {[...plants].sort((a, b) => b.plantedDate.localeCompare(a.plantedDate)).map(entry => (
                  <div key={entry.id} className={`p-3 rounded-xl border bg-card space-y-1.5 ${entry.isHarvested ? "opacity-60" : ""}`}>
                    <div className="flex items-start gap-2.5">
                      <PlantImg src={entry.photoUrl} alt={entry.commonName} className="w-12 h-12 rounded-lg object-cover border" fallbackSize="text-xl" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className={`text-sm font-semibold truncate ${entry.isHarvested ? "line-through text-muted-foreground" : ""}`}>{entry.commonName}</p>
                          {entry.isHarvested && <span className="text-[10px] font-bold text-green-600 bg-green-50 dark:bg-green-950/30 px-1.5 py-0.5 rounded-full border border-green-200">✓ Harvested</span>}
                        </div>
                        {entry.sciName && <p className="text-[10px] text-muted-foreground italic">{entry.sciName}</p>}
                        <p className="text-xs text-muted-foreground">Planted {format(parseISO(entry.plantedDate), "MMM d, yyyy")}{entry.location ? ` · ${entry.location}` : ""}{entry.quantity ? ` · ${entry.quantity}` : ""}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => toggleHarvested(entry.id)} title={entry.isHarvested ? "Mark as growing" : "Mark as harvested"}
                          className="p-1 text-muted-foreground hover:text-green-600 transition-colors"><Check size={12} /></button>
                        <button onClick={() => deletePlant(entry.id)} className="p-1 text-muted-foreground hover:text-destructive transition-colors"><Trash2 size={12} /></button>
                      </div>
                    </div>
                    {entry.notes && <p className="text-xs text-muted-foreground">{entry.notes}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <span className="text-2xl block mb-2 opacity-20">🌱</span>
                <p className="text-xs">Nothing logged yet — click "Log a Plant" above</p>
              </div>
            )}
          </>
        )}

        {/* ── WISHLIST TAB ── */}
        {tab === "wishlist" && (
          <>
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input placeholder="Search plants to add (e.g. peony, fig, lemon balm)…"
                  value={wishlistSearch.query} onChange={e => wishlistSearch.setQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") wishlistSearch.runSearch(); }}
                  className="text-sm h-8 flex-1" />
                <Button size="sm" variant="outline" onClick={() => wishlistSearch.runSearch()} disabled={wishlistSearch.searching || !wishlistSearch.query.trim()} className="h-8 gap-1.5 shrink-0">
                  {wishlistSearch.searching ? <RefreshCw size={12} className="animate-spin" /> : <Search size={12} />}
                  {wishlistSearch.searching ? "Searching…" : "Search"}
                </Button>
              </div>
              {wishlistSearch.error && <p className="text-xs text-destructive">{wishlistSearch.error}</p>}
              {wishlistSearch.results.length > 0 && (
                <div className="space-y-1.5 max-h-60 overflow-y-auto">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Perenual results</p>
                  {wishlistSearch.results.map((p: any) => {
                    const alreadyWished = wishlist.some(w => w.perenualId === p.id);
                    const alreadyPlanted = plants.some(pl => pl.perenualId === p.id);
                    return (
                      <div key={p.id} className="flex items-center gap-2 p-2 rounded-lg border bg-card hover:bg-secondary/30 transition-colors">
                        <PlantImg src={p.default_image?.small_url} alt={p.common_name} className="w-9 h-9 rounded object-cover" fallbackSize="text-base" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold truncate">{p.common_name}</p>
                          <p className="text-[10px] text-muted-foreground italic truncate">{Array.isArray(p.scientific_name) ? p.scientific_name[0] : p.scientific_name}</p>
                        </div>
                        <div className="shrink-0">
                          {alreadyPlanted
                            ? <span className="text-[10px] px-2 py-1 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium">✓ Planted</span>
                            : alreadyWished
                            ? <span className="text-[10px] px-2 py-1 rounded bg-secondary text-muted-foreground">Added</span>
                            : <button onClick={() => addToWishlist(p)} className="text-[10px] px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700 transition-colors">+ Add</button>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {wishlist.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Your wishlist</p>
                {wishlist.map(w => {
                  const planted = plants.some(p => p.perenualId === w.perenualId || p.commonName.toLowerCase() === w.commonName.toLowerCase());
                  return (
                    <div key={w.id} className={`flex items-center gap-2.5 p-2.5 rounded-lg border bg-card ${planted ? "opacity-60" : ""}`}>
                      <PlantImg src={w.photoUrl} alt={w.commonName} className="w-9 h-9 rounded object-cover" fallbackSize="text-base" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className={`text-xs font-semibold truncate ${planted ? "line-through text-muted-foreground" : ""}`}>{w.commonName}</p>
                          {planted && <span className="text-[10px] text-green-600 font-medium shrink-0">✓</span>}
                        </div>
                        {w.sciName && <p className="text-[10px] text-muted-foreground italic truncate">{w.sciName}</p>}
                      </div>
                      <button onClick={() => removeFromWishlist(w.id)} className="p-1 text-muted-foreground hover:text-destructive transition-colors shrink-0"><X size={12} /></button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <span className="text-2xl block mb-2 opacity-20">🌸</span>
                <p className="text-xs">Search for plants above to build your garden wishlist</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── SurfingSection ────────────────────────────────────────────────────────────

function SurfingSection({ hobby, onUpdateExtra }: {
  hobby: Hobby;
  onUpdateExtra: (newExtraJson: string) => void;
}) {
  const { toast } = useToast();
  const [tab, setTab] = useState<"log" | "strava">("log");
  const [showLogForm, setShowLogForm] = useState(false);
  const [stravaActivities, setStravaActivities] = useState<any[]>([]);
  const [stravaLoading, setStravaLoading] = useState(false);
  const [stravaConnected, setStravaConnected] = useState<boolean | null>(null);
  const [stravaAthlete, setStravaAthlete] = useState<any>(null);

  // Manual log form
  const [logName,    setLogName]    = useState("");
  const [logDate,    setLogDate]    = useState(new Date().toISOString().slice(0, 10));
  const [logBreak,   setLogBreak]   = useState("");
  const [logDurMin,  setLogDurMin]  = useState("");
  const [logWave,    setLogWave]    = useState("");
  const [logCond,    setLogCond]    = useState("");
  const [logNotes,   setLogNotes]   = useState("");

  const surfLog = parseSurfLog(hobby.extraJson ?? "{}");

  function saveLog(newLog: SurfSessionEntry[]) {
    onUpdateExtra(setSurfingInExtra(hobby.extraJson ?? "{}", newLog));
  }

  useEffect(() => {
    apiRequest("GET", "/api/strava/status")
      .then(r => r.json())
      .then(d => { setStravaConnected(d.connected); setStravaAthlete(d.athlete ?? null); })
      .catch(() => setStravaConnected(false));
  }, []);

  function loadStravaSessions() {
    setStravaLoading(true);
    apiRequest("GET", "/api/strava/activities?sport=surf&per_page=20")
      .then(r => r.json())
      .then(d => { setStravaActivities(d.sessions ?? []); setStravaLoading(false); })
      .catch(() => { setStravaLoading(false); toast({ title: "Could not load Strava activities", variant: "destructive" }); });
  }

  function importStravaSession(s: any) {
    if (surfLog.some(r => r.stravaId === String(s.id))) { toast({ title: "Already imported" }); return; }
    const entry: SurfSessionEntry = {
      id: genId(), stravaId: String(s.id), name: s.name, date: s.date,
      durationSec: s.durationSec, stravaUrl: s.stravaUrl,
      addedAt: new Date().toISOString(),
    };
    saveLog([...surfLog, entry]);
    toast({ title: `"${s.name}" imported!` });
  }

  function addManualSession() {
    if (!logName.trim() || !logDate) return;
    const entry: SurfSessionEntry = {
      id: genId(), name: logName.trim(), date: logDate,
      break: logBreak.trim() || undefined,
      durationSec: logDurMin ? Math.round(parseFloat(logDurMin) * 60) : undefined,
      waveHeight: logWave.trim() || undefined,
      conditions: logCond.trim() || undefined,
      notes: logNotes.trim() || undefined,
      addedAt: new Date().toISOString(),
    };
    saveLog([...surfLog, entry]);
    setShowLogForm(false);
    setLogName(""); setLogDate(new Date().toISOString().slice(0, 10));
    setLogBreak(""); setLogDurMin(""); setLogWave(""); setLogCond(""); setLogNotes("");
    toast({ title: "Session logged! 🤙" });
  }

  function deleteSession(id: string) { saveLog(surfLog.filter(s => s.id !== id)); }

  function formatDuration(sec?: number) {
    if (!sec) return "";
    const h = Math.floor(sec / 3600); const m = Math.floor((sec % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m} min`;
  }

  return (
    <div className="border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-cyan-50/60 dark:bg-cyan-950/20 border-b border-cyan-200 dark:border-cyan-800">
        <div className="flex items-center gap-2">
          <span className="text-sm">🏄</span>
          <span className="text-sm font-semibold text-cyan-800 dark:text-cyan-300">Session Log</span>
          <span className="text-xs text-muted-foreground">{surfLog.length} sessions</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setTab("log")} className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${tab === "log" ? "bg-cyan-600 text-white" : "text-muted-foreground hover:bg-secondary"}`}>My Sessions</button>
          <button onClick={() => { setTab("strava"); if (stravaConnected && stravaActivities.length === 0) loadStravaSessions(); }}
            className={`text-xs px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 ${tab === "strava" ? "bg-cyan-600 text-white" : "text-muted-foreground hover:bg-secondary"}`}>
            <Zap size={10} /> Strava
          </button>
        </div>
      </div>

      <div className="p-3 space-y-3">
        {tab === "log" && (
          <>
            {!showLogForm ? (
              <Button size="sm" variant="outline" onClick={() => setShowLogForm(true)} className="gap-1.5 w-full">
                <Plus size={13} /> Log a Session
              </Button>
            ) : (
              <div className="space-y-2 p-3 rounded-xl border bg-cyan-50/40 dark:bg-cyan-950/10">
                <p className="text-xs font-semibold text-cyan-800 dark:text-cyan-300">Log a Session</p>
                <Input placeholder="Session name (e.g. 'Dawn patrol at Blacks')" value={logName} onChange={e => setLogName(e.target.value)} className="text-sm" />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-0.5">Date</label>
                    <Input type="date" value={logDate} onChange={e => setLogDate(e.target.value)} className="text-sm" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-0.5">Duration (min)</label>
                    <Input type="number" placeholder="e.g. 90" value={logDurMin} onChange={e => setLogDurMin(e.target.value)} className="text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-0.5">Break / spot</label>
                    <Input placeholder="e.g. Huntington, local beach" value={logBreak} onChange={e => setLogBreak(e.target.value)} className="text-sm" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-0.5">Wave height</label>
                    <Input placeholder="e.g. waist-high, 3ft" value={logWave} onChange={e => setLogWave(e.target.value)} className="text-sm" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5">Conditions</label>
                  <Input placeholder="e.g. offshore, glassy, choppy" value={logCond} onChange={e => setLogCond(e.target.value)} className="text-sm" />
                </div>
                <Textarea placeholder="Notes (optional)" value={logNotes} onChange={e => setLogNotes(e.target.value)} className="text-sm resize-none" rows={2} />
                <div className="flex gap-2">
                  <Button size="sm" onClick={addManualSession} disabled={!logName.trim()} className="flex-1 bg-cyan-600 hover:bg-cyan-700 text-white gap-1">
                    <Check size={12} /> Save Session
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowLogForm(false)}>Cancel</Button>
                </div>
              </div>
            )}

            {surfLog.length > 0 ? (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {[...surfLog].sort((a, b) => b.date.localeCompare(a.date)).map(s => (
                  <div key={s.id} className="flex items-start gap-2.5 p-2.5 rounded-lg border bg-card">
                    <div className="text-lg leading-none mt-0.5">🏄</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{s.name}</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                        <span className="text-[10px] text-muted-foreground">{s.date}</span>
                        {s.break && <span className="text-[10px] text-cyan-700 dark:text-cyan-400">{s.break}</span>}
                        {s.durationSec && <span className="text-[10px] text-muted-foreground">{formatDuration(s.durationSec)}</span>}
                        {s.waveHeight && <span className="text-[10px] text-muted-foreground">🌊 {s.waveHeight}</span>}
                        {s.conditions && <span className="text-[10px] text-muted-foreground">{s.conditions}</span>}
                        {s.stravaUrl && <a href={s.stravaUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-orange-600 hover:underline flex items-center gap-0.5"><Zap size={9} />Strava</a>}
                      </div>
                      {s.notes && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{s.notes}</p>}
                    </div>
                    <button onClick={() => deleteSession(s.id)} className="text-muted-foreground hover:text-destructive transition-colors p-0.5 mt-0.5">
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <span className="text-2xl block mb-2 opacity-20">🏄</span>
                <p className="text-xs">No sessions yet — log your first surf or connect Strava</p>
              </div>
            )}
          </>
        )}

        {tab === "strava" && (
          <div className="space-y-3">
            {stravaConnected === null && <p className="text-xs text-muted-foreground text-center py-4">Checking Strava connection…</p>}

            {stravaConnected === false && (
              <div className="text-center space-y-3 py-4">
                <div className="w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-950/30 flex items-center justify-center mx-auto">
                  <Zap size={22} className="text-orange-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Connect Strava</p>
                  <p className="text-xs text-muted-foreground mt-1">Import your surf sessions recorded in Strava</p>
                  <p className="text-[10px] text-muted-foreground mt-1">Log your surfs in Strava as <span className="font-medium">Surfing</span> activities</p>
                </div>
                <Button size="sm" onClick={() => window.location.href = "/api/strava/connect"}
                  className="gap-2 bg-orange-600 hover:bg-orange-700 text-white">
                  <Power size={13} /> Connect Strava
                </Button>
              </div>
            )}

            {stravaConnected === true && (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-orange-100 dark:bg-orange-950/30 flex items-center justify-center">
                      <Zap size={13} className="text-orange-600" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold">{stravaAthlete?.name ?? "Strava"}</p>
                      <p className="text-[10px] text-emerald-600">Connected</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="outline" onClick={loadStravaSessions} disabled={stravaLoading} className="gap-1 h-7 text-xs">
                      {stravaLoading ? <RefreshCw size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                      Refresh
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => {
                      apiRequest("DELETE", "/api/strava/disconnect").then(() => {
                        setStravaConnected(false); setStravaAthlete(null); setStravaActivities([]);
                        toast({ title: "Strava disconnected" });
                      });
                    }} className="h-7 text-xs text-muted-foreground gap-1"><PowerOff size={11} /></Button>
                  </div>
                </div>

                {stravaActivities.length === 0 && !stravaLoading && (
                  <div className="space-y-2">
                    <Button size="sm" variant="outline" onClick={loadStravaSessions} className="w-full gap-1.5">
                      <RefreshCw size={12} /> Load Recent Surf Sessions
                    </Button>
                    <p className="text-[10px] text-muted-foreground text-center">Make sure your surfs are logged in Strava as <span className="font-medium">Surfing</span> activities</p>
                  </div>
                )}

                {stravaActivities.length > 0 && (
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    <p className="text-[10px] text-muted-foreground">Click Import to add a session to your log</p>
                    {stravaActivities.map((s: any) => {
                      const alreadyImported = surfLog.some(r => r.stravaId === String(s.id));
                      return (
                        <div key={s.id} className="flex items-start gap-2.5 p-2.5 rounded-lg border bg-card">
                          <div className="text-lg leading-none mt-0.5">🏄</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{s.name}</p>
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                              <span className="text-[10px] text-muted-foreground">{s.date}</span>
                              {s.durationSec && <span className="text-[10px] text-muted-foreground">{formatDuration(s.durationSec)}</span>}
                            </div>
                          </div>
                          {alreadyImported ? (
                            <span className="text-[10px] text-emerald-600 px-1.5 py-0.5 shrink-0 flex items-center gap-0.5"><Check size={9} /> Logged</span>
                          ) : (
                            <button onClick={() => importStravaSession(s)}
                              className="text-[10px] px-2 py-1 rounded bg-cyan-600 text-white hover:bg-cyan-700 transition-colors shrink-0">Import</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── RunningSection ────────────────────────────────────────────────────────────

function RunningSection({ hobby, onUpdateExtra }: {
  hobby: Hobby;
  onUpdateExtra: (newExtraJson: string) => void;
}) {
  const { toast } = useToast();

  // Strava state
  const [tab, setTab] = useState<"log" | "strava">("log");
  const [showLogForm, setShowLogForm] = useState(false);
  const [stravaActivities, setStravaActivities] = useState<any[]>([]);
  const [stravaLoading, setStravaLoading] = useState(false);
  const [stravaConnected, setStravaConnected] = useState<boolean | null>(null);
  const [stravaAthlete, setStravaAthlete] = useState<any>(null);

  // Manual log form state
  const [logName,     setLogName]     = useState("");
  const [logDate,     setLogDate]     = useState(new Date().toISOString().slice(0, 10));
  const [logDistKm,   setLogDistKm]   = useState("");
  const [logDurMin,   setLogDurMin]   = useState("");
  const [logElev,     setLogElev]     = useState("");
  const [logIsTrail,  setLogIsTrail]  = useState(false);
  const [logNotes,    setLogNotes]    = useState("");

  const runLog = parseRunLog(hobby.extraJson ?? "{}");

  function saveLog(newLog: RunLogEntry[]) {
    onUpdateExtra(setRunningInExtra(hobby.extraJson ?? "{}", newLog));
  }

  // Check Strava connection on mount
  useEffect(() => {
    apiRequest("GET", "/api/strava/status")
      .then(r => r.json())
      .then(d => { setStravaConnected(d.connected); setStravaAthlete(d.athlete ?? null); })
      .catch(() => setStravaConnected(false));
  }, []);

  function loadStravaRuns() {
    setStravaLoading(true);
    apiRequest("GET", "/api/strava/activities?per_page=20")
      .then(r => r.json())
      .then(d => { setStravaActivities(d.runs ?? []); setStravaLoading(false); })
      .catch(() => { setStravaLoading(false); toast({ title: "Could not load Strava activities", variant: "destructive" }); });
  }

  function importStravaRun(run: any) {
    if (runLog.some(r => r.stravaId === String(run.id))) {
      toast({ title: "Already imported" }); return;
    }
    const entry: RunLogEntry = {
      id: genId(), stravaId: String(run.id), name: run.name,
      date: run.date, distanceKm: run.distanceKm,
      durationSec: run.durationSec, elevationGain: run.elevationGain,
      isTrail: run.isTrail, stravaUrl: run.stravaUrl,
      addedAt: new Date().toISOString(),
    };
    saveLog([...runLog, entry]);
    toast({ title: `"${run.name}" imported!` });
  }

  function addManualRun() {
    if (!logName.trim() || !logDate || !logDistKm) return;
    const entry: RunLogEntry = {
      id: genId(), name: logName.trim(), date: logDate,
      distanceKm: parseFloat(logDistKm) || 0,
      durationSec: logDurMin ? Math.round(parseFloat(logDurMin) * 60) : undefined,
      elevationGain: logElev ? parseFloat(logElev) : undefined,
      isTrail: logIsTrail, notes: logNotes.trim() || undefined,
      addedAt: new Date().toISOString(),
    };
    saveLog([...runLog, entry]);
    setShowLogForm(false);
    setLogName(""); setLogDate(new Date().toISOString().slice(0, 10));
    setLogDistKm(""); setLogDurMin(""); setLogElev(""); setLogIsTrail(false); setLogNotes("");
    toast({ title: "Run logged!" });
  }

  function deleteRun(id: string) { saveLog(runLog.filter(r => r.id !== id)); }

  // Stats
  const totalKm = runLog.reduce((sum, r) => sum + (r.distanceKm ?? 0), 0);
  const totalRuns = runLog.length;
  const trailRuns = runLog.filter(r => r.isTrail).length;

  function formatDuration(sec?: number) {
    if (!sec) return "";
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  return (
    <div className="border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-sky-50/60 dark:bg-sky-950/20 border-b border-sky-200 dark:border-sky-800">
        <div className="flex items-center gap-2">
          <span className="text-sm">🏃</span>
          <span className="text-sm font-semibold text-sky-800 dark:text-sky-300">Run Log</span>
          <span className="text-xs text-muted-foreground">{totalRuns} runs · {totalKm.toFixed(1)} km{trailRuns > 0 ? ` · ${trailRuns} trail` : ""}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setTab("log")}    className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${tab === "log"    ? "bg-sky-600 text-white" : "text-muted-foreground hover:bg-secondary"}`}>My Runs</button>
          <button onClick={() => { setTab("strava"); if (stravaConnected && stravaActivities.length === 0) loadStravaRuns(); }}
            className={`text-xs px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 ${tab === "strava" ? "bg-sky-600 text-white" : "text-muted-foreground hover:bg-secondary"}`}>
            <Zap size={10} /> Strava
          </button>
        </div>
      </div>

      <div className="p-3 space-y-3">

        {/* ── MY RUNS TAB ── */}
        {tab === "log" && (
          <>
            {!showLogForm ? (
              <Button size="sm" variant="outline" onClick={() => setShowLogForm(true)} className="gap-1.5 w-full">
                <Plus size={13} /> Log a Run
              </Button>
            ) : (
              <div className="space-y-2 p-3 rounded-xl border bg-sky-50/40 dark:bg-sky-950/10">
                <p className="text-xs font-semibold text-sky-800 dark:text-sky-300">Log a Run</p>
                <Input placeholder="Run name" value={logName} onChange={e => setLogName(e.target.value)} className="text-sm" />
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-0.5">Date</label>
                    <Input type="date" value={logDate} onChange={e => setLogDate(e.target.value)} className="text-sm" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-0.5">Distance (km) *</label>
                    <Input type="number" step="0.01" placeholder="e.g. 5.2" value={logDistKm} onChange={e => setLogDistKm(e.target.value)} className="text-sm" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-0.5">Duration (min)</label>
                    <Input type="number" step="0.5" placeholder="e.g. 28" value={logDurMin} onChange={e => setLogDurMin(e.target.value)} className="text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-0.5">Elevation gain (m)</label>
                    <Input type="number" placeholder="e.g. 120" value={logElev} onChange={e => setLogElev(e.target.value)} className="text-sm" />
                  </div>
                  <label className="flex items-center gap-2 text-xs cursor-pointer self-end pb-1">
                    <input type="checkbox" checked={logIsTrail} onChange={e => setLogIsTrail(e.target.checked)} className="rounded" />
                    Trail run
                  </label>
                </div>
                <Textarea placeholder="Notes (optional)" value={logNotes} onChange={e => setLogNotes(e.target.value)} className="text-sm resize-none" rows={2} />
                <div className="flex gap-2">
                  <Button size="sm" onClick={addManualRun} disabled={!logName.trim() || !logDistKm} className="flex-1 bg-sky-600 hover:bg-sky-700 text-white gap-1">
                    <Check size={12} /> Save Run
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowLogForm(false)}>Cancel</Button>
                </div>
              </div>
            )}

            {/* Run log list */}
            {runLog.length > 0 ? (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {[...runLog].sort((a, b) => b.date.localeCompare(a.date)).map(run => (
                  <div key={run.id} className="flex items-start gap-2.5 p-2.5 rounded-lg border bg-card">
                    <div className="text-lg leading-none mt-0.5">{run.isTrail ? "🌲" : "🏃"}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{run.name}</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                        <span className="text-[10px] text-muted-foreground">{run.date}</span>
                        <span className="text-[10px] font-semibold text-sky-700 dark:text-sky-400">{run.distanceKm.toFixed(2)} km</span>
                        {run.durationSec && <span className="text-[10px] text-muted-foreground">{formatDuration(run.durationSec)}</span>}
                        {run.elevationGain != null && run.elevationGain > 0 && <span className="text-[10px] text-muted-foreground">↑{run.elevationGain}m</span>}
                        {run.stravaUrl && <a href={run.stravaUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-orange-600 hover:underline flex items-center gap-0.5"><Zap size={9} />Strava</a>}
                      </div>
                      {run.notes && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{run.notes}</p>}
                    </div>
                    <button onClick={() => deleteRun(run.id)} className="text-muted-foreground hover:text-destructive transition-colors p-0.5 mt-0.5">
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <span className="text-2xl block mb-2 opacity-20">🏃</span>
                <p className="text-xs">No runs logged yet — log your first run or connect Strava</p>
              </div>
            )}
          </>
        )}

        {/* ── STRAVA TAB ── */}
        {tab === "strava" && (
          <div className="space-y-3">
            {stravaConnected === null && (
              <p className="text-xs text-muted-foreground text-center py-4">Checking Strava connection…</p>
            )}

            {stravaConnected === false && (
              <div className="text-center space-y-3 py-4">
                <div className="w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-950/30 flex items-center justify-center mx-auto">
                  <Zap size={22} className="text-orange-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Connect Strava</p>
                  <p className="text-xs text-muted-foreground mt-1">Import your runs automatically from Strava</p>
                </div>
                <Button size="sm" onClick={() => window.location.href = "/api/strava/connect"}
                  className="gap-2 bg-orange-600 hover:bg-orange-700 text-white">
                  <Power size={13} /> Connect Strava
                </Button>
              </div>
            )}

            {stravaConnected === true && (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-orange-100 dark:bg-orange-950/30 flex items-center justify-center">
                      <Zap size={13} className="text-orange-600" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold">{stravaAthlete?.name ?? "Strava"}</p>
                      <p className="text-[10px] text-emerald-600">Connected</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="outline" onClick={loadStravaRuns} disabled={stravaLoading} className="gap-1 h-7 text-xs">
                      {stravaLoading ? <RefreshCw size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                      Refresh
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => {
                      apiRequest("DELETE", "/api/strava/disconnect").then(() => {
                        setStravaConnected(false); setStravaAthlete(null); setStravaActivities([]);
                        toast({ title: "Strava disconnected" });
                      });
                    }} className="h-7 text-xs text-muted-foreground gap-1">
                      <PowerOff size={11} />
                    </Button>
                  </div>
                </div>

                {stravaActivities.length === 0 && !stravaLoading && (
                  <Button size="sm" variant="outline" onClick={loadStravaRuns} className="w-full gap-1.5">
                    <RefreshCw size={12} /> Load Recent Runs
                  </Button>
                )}

                {stravaActivities.length > 0 && (
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    <p className="text-[10px] text-muted-foreground">Click Import to add a run to your log</p>
                    {stravaActivities.map((run: any) => {
                      const alreadyImported = runLog.some(r => r.stravaId === String(run.id));
                      return (
                        <div key={run.id} className="flex items-start gap-2.5 p-2.5 rounded-lg border bg-card">
                          <div className="text-lg leading-none mt-0.5">{run.isTrail ? "🌲" : "🏃"}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{run.name}</p>
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                              <span className="text-[10px] text-muted-foreground">{run.date}</span>
                              <span className="text-[10px] font-semibold text-sky-700 dark:text-sky-400">{Number(run.distanceKm).toFixed(2)} km</span>
                              {run.durationSec && <span className="text-[10px] text-muted-foreground">{formatDuration(run.durationSec)}</span>}
                              {run.elevationGain > 0 && <span className="text-[10px] text-muted-foreground">↑{run.elevationGain}m</span>}
                            </div>
                          </div>
                          {alreadyImported ? (
                            <span className="text-[10px] text-emerald-600 px-1.5 py-0.5 shrink-0 flex items-center gap-0.5"><Check size={9} /> Logged</span>
                          ) : (
                            <button onClick={() => importStravaRun(run)}
                              className="text-[10px] px-2 py-1 rounded bg-sky-600 text-white hover:bg-sky-700 transition-colors shrink-0">Import</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Plan Edit Dialog ───────────────────────────────────────────────────────────

function PlanEditDialog({
  plan,
  open,
  onClose,
  onSave,
}: {
  plan: HobbyPlan | null;
  open: boolean;
  onClose: () => void;
  onSave: (updated: HobbyPlan) => void;
}) {
  const [tab, setTab] = useState<"info" | "steps" | "milestones">("info");
  const [title, setTitle] = useState(plan?.title ?? "");
  const [description, setDescription] = useState(plan?.description ?? "");
  const [durationWeeks, setDurationWeeks] = useState(plan?.durationWeeks ? String(plan.durationWeeks) : "");
  const [startDate, setStartDate] = useState(plan?.startDate ?? "");
  const [scheduleDays, setScheduleDays] = useState<string[]>(plan?.scheduleDays ?? []);
  const [steps, setSteps] = useState<GoalStep[]>(plan?.steps ?? []);
  const [newStep, setNewStep] = useState("");
  const [milestones, setMilestones] = useState<PlanMilestone[]>(plan?.milestones ?? []);
  const [newMilestone, setNewMilestone] = useState("");

  useEffect(() => {
    if (plan && open) {
      setTab("info");
      setTitle(plan.title);
      setDescription(plan.description ?? "");
      setDurationWeeks(plan.durationWeeks ? String(plan.durationWeeks) : "");
      setStartDate(plan.startDate ?? "");
      setScheduleDays(plan.scheduleDays ?? []);
      setSteps(plan.steps ?? []);
      setMilestones(plan.milestones ?? []);
      setNewStep(""); setNewMilestone("");
    }
  }, [plan, open]);

  if (!plan) return null;

  function handleSave() {
    if (!title.trim() || !plan) return;
    onSave({
      ...plan,
      title: title.trim(),
      description: description.trim() || undefined,
      durationWeeks: durationWeeks ? Number(durationWeeks) : undefined,
      startDate: startDate || undefined,
      scheduleDays: scheduleDays.length > 0 ? scheduleDays : undefined,
      steps,
      milestones: milestones.length > 0 ? milestones : undefined,
    });
    onClose();
  }

  function addStep() {
    if (!newStep.trim()) return;
    setSteps(prev => [...prev, { id: genId(), text: newStep.trim(), done: false }]);
    setNewStep("");
  }
  function updateStepText(id: string, text: string) {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, text } : s));
  }
  function removeStep(id: string) { setSteps(prev => prev.filter(s => s.id !== id)); }
  function moveStep(idx: number, dir: -1 | 1) {
    setSteps(prev => {
      const arr = [...prev];
      const swap = idx + dir;
      if (swap < 0 || swap >= arr.length) return arr;
      [arr[idx], arr[swap]] = [arr[swap], arr[idx]];
      return arr;
    });
  }

  function addMilestone() {
    if (!newMilestone.trim()) return;
    setMilestones(prev => [...prev, { id: genId(), title: newMilestone.trim(), order: prev.length }]);
    setNewMilestone("");
  }
  function updateMilestoneTitle(id: string, title: string) {
    setMilestones(prev => prev.map(m => m.id === id ? { ...m, title } : m));
  }
  function removeMilestone(id: string) { setMilestones(prev => prev.filter(m => m.id !== id)); }
  function moveMilestone(idx: number, dir: -1 | 1) {
    setMilestones(prev => {
      const arr = [...prev];
      const swap = idx + dir;
      if (swap < 0 || swap >= arr.length) return arr;
      [arr[idx], arr[swap]] = [arr[swap], arr[idx]];
      return arr.map((m, i) => ({ ...m, order: i }));
    });
  }

  const tabs = [
    { id: "info" as const, label: "Info" },
    { id: "steps" as const, label: `Steps${steps.length > 0 ? ` (${steps.length})` : ""}` },
    { id: "milestones" as const, label: `Milestones${milestones.length > 0 ? ` (${milestones.length})` : ""}` },
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[88vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>Edit Plan</DialogTitle>
        </DialogHeader>

        {/* Tab bar */}
        <div className="flex gap-1 p-1 rounded-lg bg-muted/50 shrink-0">
          {tabs.map(t => (
            <button key={t.id} type="button"
              onClick={() => setTab(t.id)}
              className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${
                tab === t.id ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1 min-h-0">
          {/* ── Info tab ── */}
          {tab === "info" && (
            <div className="space-y-3 pt-1">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Title *</label>
                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Plan title…" className="text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
                <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What is this plan for?" className="text-sm min-h-[60px]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Duration (weeks)</label>
                  <Input type="number" min={1} value={durationWeeks} onChange={e => setDurationWeeks(e.target.value)} className="text-sm" placeholder="e.g. 8" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Start date</label>
                  <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Practice Days</label>
                <div className="grid grid-cols-7 gap-1">
                  {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(day => {
                    const active = scheduleDays.includes(day);
                    return (
                      <button key={day} type="button"
                        onClick={() => setScheduleDays(prev => active ? prev.filter(d => d !== day) : [...prev, day])}
                        className={`flex flex-col items-center py-2 rounded-lg border text-[10px] font-bold transition-all ${
                          active ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                        }`}>
                        {day}
                      </button>
                    );
                  })}
                </div>
                {scheduleDays.length > 0 && (
                  <p className="text-[11px] text-primary mt-1.5">{scheduleDays.length}×/week: {scheduleDays.join(", ")}</p>
                )}
              </div>
            </div>
          )}

          {/* ── Steps tab ── */}
          {tab === "steps" && (
            <div className="space-y-2 pt-1">
              <p className="text-xs text-muted-foreground">Edit the step-by-step breakdown of this plan.</p>
              {steps.length === 0 && (
                <p className="text-xs text-muted-foreground italic py-3 text-center">No steps yet — add some below.</p>
              )}
              {steps.map((step, idx) => (
                <div key={step.id} className="flex items-center gap-1.5 group">
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <button type="button" onClick={() => moveStep(idx, -1)} disabled={idx === 0}
                      className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors">
                      <ChevronUp size={11} />
                    </button>
                    <button type="button" onClick={() => moveStep(idx, 1)} disabled={idx === steps.length - 1}
                      className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors">
                      <ChevronDown size={11} />
                    </button>
                  </div>
                  <div className={`w-4 h-4 rounded-full shrink-0 flex items-center justify-center text-[9px] font-bold ${step.done ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                    {step.done ? <Check size={8} /> : idx + 1}
                  </div>
                  <Input
                    value={step.text}
                    onChange={e => updateStepText(step.id, e.target.value)}
                    className="text-xs h-8 flex-1"
                    placeholder={`Step ${idx + 1}`}
                  />
                  <button type="button" onClick={() => removeStep(step.id)}
                    className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0">
                    <X size={12} />
                  </button>
                </div>
              ))}
              <div className="flex gap-1.5 pt-1">
                <Input value={newStep} onChange={e => setNewStep(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addStep()}
                  placeholder="Add a step…" className="text-xs h-8" />
                <Button size="sm" variant="outline" onClick={addStep} disabled={!newStep.trim()} className="shrink-0 h-8 px-2.5">
                  <Plus size={13} />
                </Button>
              </div>
            </div>
          )}

          {/* ── Milestones tab ── */}
          {tab === "milestones" && (
            <div className="space-y-2 pt-1">
              <p className="text-xs text-muted-foreground">Key checkpoints to hit along the way — e.g. "Hit 1300 ELO" or "Learn Song #2".</p>
              {milestones.length === 0 && (
                <p className="text-xs text-muted-foreground italic py-3 text-center">No milestones yet — add some below.</p>
              )}
              {milestones.map((m, idx) => (
                <div key={m.id} className="flex items-center gap-1.5 group">
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <button type="button" onClick={() => moveMilestone(idx, -1)} disabled={idx === 0}
                      className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors">
                      <ChevronUp size={11} />
                    </button>
                    <button type="button" onClick={() => moveMilestone(idx, 1)} disabled={idx === milestones.length - 1}
                      className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors">
                      <ChevronDown size={11} />
                    </button>
                  </div>
                  <div className={`w-5 h-5 rounded-full shrink-0 flex items-center justify-center ${m.completedAt ? "bg-amber-100 text-amber-600" : "bg-muted text-muted-foreground"}`}>
                    <Trophy size={10} />
                  </div>
                  <Input
                    value={m.title}
                    onChange={e => updateMilestoneTitle(m.id, e.target.value)}
                    className="text-xs h-8 flex-1"
                    placeholder={`Milestone ${idx + 1}`}
                  />
                  <button type="button" onClick={() => removeMilestone(m.id)}
                    className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0">
                    <X size={12} />
                  </button>
                </div>
              ))}
              <div className="flex gap-1.5 pt-1">
                <Input value={newMilestone} onChange={e => setNewMilestone(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addMilestone()}
                  placeholder="Add a milestone…" className="text-xs h-8" />
                <Button size="sm" variant="outline" onClick={addMilestone} disabled={!newMilestone.trim()} className="shrink-0 h-8 px-2.5">
                  <Plus size={13} />
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-between pt-3 shrink-0 border-t mt-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={!title.trim()} onClick={handleSave} className="gap-1.5">
            <Check size={13} /> Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Goal Edit Dialog ───────────────────────────────────────────────────────────

function GoalEditDialog({
  goal,
  open,
  onClose,
  onSave,
}: {
  goal: HobbyGoal | null;
  open: boolean;
  onClose: () => void;
  onSave: (updated: HobbyGoal) => void;
}) {
  const [title, setTitle] = useState(goal?.title ?? "");
  const [description, setDescription] = useState(goal?.description ?? "");
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? "");
  const [targetValue, setTargetValue] = useState(goal?.targetValue != null ? String(goal.targetValue) : "");
  const [unit, setUnit] = useState(goal?.unit ?? "");
  const [freqTimes, setFreqTimes] = useState(goal?.freqTimes != null ? String(goal.freqTimes) : "3");
  const [freqPeriod, setFreqPeriod] = useState<"week" | "month">(goal?.freqPeriod ?? "week");
  const [durationWeeks, setDurationWeeks] = useState(goal?.durationWeeks != null ? String(goal.durationWeeks) : "");

  useEffect(() => {
    if (goal) {
      setTitle(goal.title);
      setDescription(goal.description ?? "");
      setTargetDate(goal.targetDate ?? "");
      setTargetValue(goal.targetValue != null ? String(goal.targetValue) : "");
      setUnit(goal.unit ?? "");
      setFreqTimes(goal.freqTimes != null ? String(goal.freqTimes) : "3");
      setFreqPeriod(goal.freqPeriod ?? "week");
      setDurationWeeks(goal.durationWeeks != null ? String(goal.durationWeeks) : "");
    }
  }, [goal]);

  if (!goal) return null;

  function handleSave() {
    if (!title.trim() || !goal) return;
    onSave({
      ...goal,
      title: title.trim(),
      description: description.trim() || undefined,
      targetDate: targetDate || undefined,
      targetValue: targetValue ? Number(targetValue) : undefined,
      unit: unit || undefined,
      freqTimes: freqTimes ? Number(freqTimes) : undefined,
      freqPeriod,
      durationWeeks: durationWeeks ? Number(durationWeeks) : undefined,
    });
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit Goal</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Title *</label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Goal title…" className="text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What does success look like?" className="text-sm min-h-[55px]" />
          </div>
          {(goal.goalType === "count") && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Target value</label>
                <Input type="number" min={0} value={targetValue} onChange={e => setTargetValue(e.target.value)} className="text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Unit</label>
                <Input value={unit} onChange={e => setUnit(e.target.value)} placeholder="miles, items…" className="text-sm" />
              </div>
            </div>
          )}
          {goal.goalType === "frequency" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Times per period</label>
                <Input type="number" min={1} value={freqTimes} onChange={e => setFreqTimes(e.target.value)} className="text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Period</label>
                <Select value={freqPeriod} onValueChange={v => setFreqPeriod(v as "week" | "month")}>
                  <SelectTrigger className="text-sm h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="week">Week</SelectItem>
                    <SelectItem value="month">Month</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          {(goal.goalType === "frequency" || goal.goalType === "plan") && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Duration (weeks)</label>
              <Input type="number" min={1} value={durationWeeks} onChange={e => setDurationWeeks(e.target.value)} placeholder="e.g. 12" className="text-sm" />
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Target date (optional)</label>
            <Input type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} className="text-sm" />
          </div>
        </div>
        <div className="flex justify-between pt-3">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={!title.trim()} onClick={handleSave} className="gap-1.5">
            <Check size={13} /> Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Active Plan Section ────────────────────────────────────────────────────────

const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS_ORDERED = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]; // display order
const DAY_TO_IDX: Record<string, number> = {
  "Sun": 0, "Mon": 1, "Tue": 2, "Wed": 3, "Thu": 4, "Fri": 5, "Sat": 6,
};
export const SPREAD_PATTERNS: Record<number, string[]> = {
  1: ["Wed"], 2: ["Tue", "Fri"], 3: ["Mon", "Wed", "Fri"],
  4: ["Mon", "Tue", "Thu", "Fri"], 5: ["Mon", "Tue", "Wed", "Thu", "Fri"],
  6: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  7: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
};

// ── Log Session Dialog ─────────────────────────────────────────────────────────

function LogSessionDialog({
  open, onClose, onSave, onDelete,
  planTitle, dayLabel, defaultDate,
  existingSession,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (session: Omit<SessionLog, "id" | "planId">) => void;
  onDelete?: () => void;
  planTitle: string;
  dayLabel: string;
  defaultDate: string;
  existingSession?: SessionLog | null;
}) {
  const isEditing = !!existingSession;
  const [date, setDate] = useState(defaultDate);
  const [durationMins, setDurationMins] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      if (existingSession) {
        setDate(existingSession.date);
        setDurationMins(existingSession.durationMins ? String(existingSession.durationMins) : "");
        setNotes(existingSession.notes ?? "");
      } else {
        setDate(defaultDate);
        setDurationMins("");
        setNotes("");
      }
    }
  }, [open, defaultDate, existingSession]);

  function handleSave() {
    onSave({ date, dayOfWeek: dayLabel, durationMins: durationMins ? Number(durationMins) : undefined, notes: notes.trim() || undefined });
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck size={16} className="text-primary" />
            {isEditing ? "Edit Session" : "Log Session"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-1">
          <div className="p-2.5 rounded-lg bg-primary/5 border border-primary/20">
            <p className="text-xs font-semibold text-primary">{planTitle}</p>
            <p className="text-xs text-muted-foreground">{dayLabel} session</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Date</label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Duration (mins)</label>
              <Input type="number" min={1} value={durationMins} onChange={e => setDurationMins(e.target.value)} placeholder="e.g. 30" className="text-sm" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes (what did you practice?)</label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Practiced past tense conjugations…" className="text-sm min-h-[70px]" />
          </div>
        </div>
        <div className="flex justify-between pt-2">
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            {isEditing && onDelete && (
              <Button variant="ghost" size="sm" onClick={() => { onDelete(); onClose(); }}
                className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1">
                <Trash2 size={12} /> Delete
              </Button>
            )}
          </div>
          <Button size="sm" onClick={handleSave} className="gap-1.5" disabled={!date}>
            <ClipboardCheck size={13} /> {isEditing ? "Save Changes" : "Log Session"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Day Label Dialog ────────────────────────────────────────────────────────────

function DayLabelDialog({
  open, onClose, onSave,
  planTitle, dayLabel, currentLabel,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (label: string) => void;
  planTitle: string;
  dayLabel: string;
  currentLabel: string;
}) {
  const [label, setLabel] = useState(currentLabel);

  useEffect(() => {
    if (open) setLabel(currentLabel);
  }, [open, currentLabel]);

  function handleSave() {
    onSave(label.trim());
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil size={15} className="text-primary" />
            {dayLabel} Session Label
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-1">
          <div className="p-2.5 rounded-lg bg-muted/50 border">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Plan</p>
            <p className="text-xs font-semibold">{planTitle}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              What will you work on {dayLabel}?
            </label>
            <Input
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder={planTitle}
              className="text-sm"
              autoFocus
              onKeyDown={e => e.key === "Enter" && handleSave()}
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Leave blank to use the plan name. This replaces the pill label for this day only.
            </p>
          </div>
        </div>
        <div className="flex justify-between pt-2">
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            {currentLabel && (
              <Button variant="ghost" size="sm" onClick={() => { onSave(""); onClose(); }}
                className="text-muted-foreground hover:text-foreground">
                Clear
              </Button>
            )}
          </div>
          <Button size="sm" onClick={handleSave} className="gap-1.5">
            <Check size={13} /> Set Label
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── ScheduleTab — clean weekly view across all active plans ──────────────────

const DAYS_ORDERED_SCHED = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_TO_IDX_SCHED: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 };

export function ScheduleTab({ hobbies, onUpdateHobby }: { hobbies: Hobby[]; onUpdateHobby: (id: number, extraJson: string) => void }) {
  const today = new Date();
  const todayDowIdx = today.getDay(); // 0=Sun
  const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const todayShort = DOW_LABELS[todayDowIdx];

  const [logTarget, setLogTarget] = useState<{ hobby: Hobby; plan: HobbyPlan; dayLabel: string; defaultDate: string } | null>(null);
  const [editSessionTarget, setEditSessionTarget] = useState<{ hobby: Hobby; plan: HobbyPlan; session: SessionLog; dayLabel: string } | null>(null);

  function dateForDay(dayLabel: string): string {
    const targetIdx = DAY_TO_IDX_SCHED[dayLabel] ?? 1;
    const diff = ((targetIdx - todayDowIdx) + 7) % 7;
    const d = new Date(today); d.setDate(today.getDate() + diff);
    return d.toISOString().slice(0, 10);
  }

  function savePlanUpdate(hobby: Hobby, updatedPlan: HobbyPlan) {
    const plans = parsePlans(hobby.extraJson ?? "{}").map(p => p.id === updatedPlan.id ? updatedPlan : p);
    onUpdateHobby(hobby.id, setPlansInExtra(hobby.extraJson ?? "{}", plans));
  }

  function logSession(session: Omit<SessionLog, "id" | "planId">) {
    if (!logTarget) return;
    const { hobby, plan } = logTarget;
    const newSession: SessionLog = { ...session, id: genId(), planId: plan.id };
    savePlanUpdate(hobby, { ...plan, sessions: [...(plan.sessions ?? []), newSession] });
    setLogTarget(null);
  }

  function updateSession(updatedData: Omit<SessionLog, "id" | "planId">) {
    if (!editSessionTarget) return;
    const { hobby, plan, session } = editSessionTarget;
    savePlanUpdate(hobby, {
      ...plan,
      sessions: (plan.sessions ?? []).map(s => s.id === session.id ? { ...updatedData, id: session.id, planId: plan.id } : s),
    });
    setEditSessionTarget(null);
  }

  function deleteEditSession() {
    if (!editSessionTarget) return;
    const { hobby, plan, session } = editSessionTarget;
    savePlanUpdate(hobby, { ...plan, sessions: (plan.sessions ?? []).filter(s => s.id !== session.id) });
    setEditSessionTarget(null);
  }

  // Collect all active plans
  const activePlanEntries = useMemo(() => {
    const entries: { hobby: Hobby; plan: HobbyPlan; color: string }[] = [];
    const PLAN_COLORS = ["#3b82f6","#f97316","#10b981","#8b5cf6","#ec4899","#06b6d4","#f59e0b","#84cc16","#ef4444"];
    let idx = 0;
    for (const h of hobbies) {
      const plans = parsePlans(h.extraJson ?? "{}");
      for (const p of plans) {
        if (p.isActive && !p.completedAt) {
          entries.push({ hobby: h, plan: p, color: PLAN_COLORS[idx % PLAN_COLORS.length] });
          idx++;
        }
      }
    }
    return entries;
  }, [hobbies]);

  // Build merged day map (including logged sessions this week)
  const mergedByDay = useMemo((): Record<string, { hobby: Hobby; plan: HobbyPlan; color: string; label: string; notes: string; loggedSession?: SessionLog }[]> => {
    const weekStart = new Date(today); weekStart.setDate(today.getDate() - todayDowIdx);
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
    const startStr = weekStart.toISOString().slice(0, 10);
    const endStr = weekEnd.toISOString().slice(0, 10);

    const map: Record<string, { hobby: Hobby; plan: HobbyPlan; color: string; label: string; notes: string; loggedSession?: SessionLog }[]> = {};
    DAYS_ORDERED_SCHED.forEach(d => { map[d] = []; });
    for (const { hobby, plan, color } of activePlanEntries) {
      const computed = (plan.activities && plan.activities.length > 0) ? computeHobbyPlan(plan, today) : null;
      const scheduledDays = computed
        ? computed.weeklySchedule.filter(d => d.isTrainingDay).map(d => d.dayName)
        : (plan.scheduleDays && plan.scheduleDays.length > 0)
          ? plan.scheduleDays
          : ["Mon", "Wed", "Fri"];
      for (const day of scheduledDays) {
        if (!map[day]) continue;
        const di = getPlanDayInfo(plan, day);
        const loggedSession = (plan.sessions ?? []).find(s =>
          s.dayOfWeek === day && s.date >= startStr && s.date <= endStr
        );
        map[day].push({ hobby, plan, color, label: di.label || plan.title, notes: di.notes, loggedSession });
      }
    }
    return map;
  }, [activePlanEntries, today]);

  // Week date labels
  const weekDates = useMemo(() => {
    return DAYS_ORDERED_SCHED.map(d => {
      const targetIdx = DAY_TO_IDX_SCHED[d] ?? 1;
      const diff = ((targetIdx - todayDowIdx) + 7) % 7;
      const dt = new Date(today); dt.setDate(today.getDate() + diff);
      return { day: d, date: dt.toISOString().slice(0, 10), dateLabel: dt.toLocaleDateString(undefined, { month: "short", day: "numeric" }) };
    });
  }, [today]);

  const hasAnyActivePlans = activePlanEntries.length > 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-sm">This Week</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {hasAnyActivePlans
              ? `${activePlanEntries.length} active plan${activePlanEntries.length !== 1 ? "s" : ""} merged`
              : "No active plans yet"}
          </p>
        </div>
        {hasAnyActivePlans && (
          <div className="flex gap-1.5 flex-wrap justify-end">
            {activePlanEntries.map(({ hobby, color }) => (
              <span key={hobby.id} className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border"
                style={{ background: `${color}18`, color, borderColor: `${color}40` }}>
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                {hobby.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {!hasAnyActivePlans && (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <CalendarDays size={32} className="mx-auto text-muted-foreground mb-3" />
          <p className="font-semibold">No active plans</p>
          <p className="text-sm text-muted-foreground mt-1">Activate a plan in the Plans tab to see your weekly schedule here.</p>
        </div>
      )}

      {/* Day-by-day schedule */}
      {hasAnyActivePlans && (
        <div className="rounded-xl border bg-card overflow-hidden divide-y">
          {weekDates.map(({ day, date, dateLabel }) => {
            const entries = mergedByDay[day] ?? [];
            const isToday = day === todayShort;
            const isPast = new Date(date + "T23:59:59") < today && !isToday;
            return (
              <div key={day} className={`flex items-start gap-4 px-4 py-3 ${isToday ? "bg-primary/5" : ""}`}>
                {/* Day column */}
                <div className="w-14 shrink-0 pt-0.5">
                  <p className={`text-xs font-bold uppercase tracking-wide ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                    {day}
                  </p>
                  <p className={`text-[10px] ${isToday ? "text-primary/70" : "text-muted-foreground/60"}`}>{dateLabel}</p>
                  {isToday && <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1" />}
                </div>

                {/* Sessions */}
                {entries.length > 0 ? (
                  <div className="flex-1 min-w-0 space-y-2 py-0.5">
                    {entries.map(({ hobby, plan, color, label, notes, loggedSession }, i) => (
                      <button
                        key={`${plan.id}-${i}`}
                        type="button"
                        className={`w-full text-left rounded-lg border px-3 py-2 transition-colors hover:brightness-95 group ${isPast ? "opacity-50" : ""}`}
                        style={{ borderColor: `${color}40`, background: `${color}0a` }}
                        onClick={() => {
                          if (loggedSession) {
                            setEditSessionTarget({ hobby, plan, session: loggedSession, dayLabel: day });
                          } else {
                            setLogTarget({ hobby, plan, dayLabel: day, defaultDate: date });
                          }
                        }}
                      >
                        <div className="flex items-center gap-2 mb-0.5">
                          <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
                          <span className="text-xs font-semibold truncate" style={{ color }}>{hobby.name}</span>
                          {loggedSession ? (
                            <span className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ml-auto shrink-0"
                              style={{ background: `${color}20`, color }}>
                              <CheckCircle2 size={9} />
                              {loggedSession.durationMins ? `${loggedSession.durationMins}m` : "Logged"}
                              <Pencil size={8} className="ml-0.5 opacity-60" />
                            </span>
                          ) : isToday ? (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground ml-auto shrink-0">
                              Log today
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                              + Log
                            </span>
                          )}
                          {!loggedSession && plan.minutesPerSession && (
                            <span className="text-[10px] text-muted-foreground shrink-0">{plan.minutesPerSession} min</span>
                          )}
                        </div>
                        {label && label !== plan.title && (
                          <p className="text-sm font-medium text-foreground ml-3.5">{label}</p>
                        )}
                        {loggedSession?.notes ? (
                          <p className="text-[10px] text-muted-foreground mt-1 ml-3.5 line-clamp-2 leading-relaxed">{loggedSession.notes}</p>
                        ) : notes ? (
                          <p className="text-[10px] text-muted-foreground mt-1 ml-3.5 line-clamp-2 leading-relaxed">{notes}</p>
                        ) : null}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex-1 py-0.5">
                    <span className="text-xs text-muted-foreground/50 italic">Rest day</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Log Session Dialog */}
      <LogSessionDialog
        open={!!logTarget}
        onClose={() => setLogTarget(null)}
        onSave={logSession}
        planTitle={logTarget?.plan.title ?? ""}
        dayLabel={logTarget?.dayLabel ?? ""}
        defaultDate={logTarget?.defaultDate ?? today.toISOString().slice(0, 10)}
      />

      {/* Edit Session Dialog */}
      <LogSessionDialog
        open={!!editSessionTarget}
        onClose={() => setEditSessionTarget(null)}
        onSave={updateSession}
        onDelete={deleteEditSession}
        planTitle={editSessionTarget?.plan.title ?? ""}
        dayLabel={editSessionTarget?.dayLabel ?? ""}
        defaultDate={editSessionTarget?.session.date ?? today.toISOString().slice(0, 10)}
        existingSession={editSessionTarget?.session ?? null}
      />
    </div>
  );
}

// ── HobbyActivePlanSection ─────────────────────────────────────────────────────

function HobbyActivePlanSection({
  hobbies,
  onUpdateHobby,
  onGoToPlans,
  hideWeeklySchedule = false,
}: {
  hobbies: Hobby[];
  onUpdateHobby: (id: number, extraJson: string) => void;
  onGoToPlans: () => void;
  hideWeeklySchedule?: boolean;
}) {
  const [logTarget, setLogTarget] = useState<{
    hobby: Hobby; plan: HobbyPlan; dayLabel: string; defaultDate: string;
  } | null>(null);
  const [editTarget, setEditTarget] = useState<{ hobby: Hobby; plan: HobbyPlan } | null>(null);
  const [editSessionTarget, setEditSessionTarget] = useState<{
    hobby: Hobby; plan: HobbyPlan; session: SessionLog; dayLabel: string;
  } | null>(null);
  const [editDayLabel, setEditDayLabel] = useState<{
    hobby: Hobby; plan: HobbyPlan; dayLabel: string;
  } | null>(null);

  const today = new Date();
  const todayDowIdx = today.getDay(); // 0=Sun
  const todayDowLabel = DAYS_SHORT[todayDowIdx]; // "Mon" etc.

  // Collect all active + paused plans across hobbies
  const activePlanEntries = useMemo(() => {
    const entries: { hobby: Hobby; plan: HobbyPlan }[] = [];
    for (const h of hobbies) {
      const plans = parsePlans(h.extraJson ?? "{}");
      for (const p of plans) {
        if (!p.completedAt) entries.push({ hobby: h, plan: p });
      }
    }
    return entries;
  }, [hobbies]);

  if (activePlanEntries.length === 0) return null;

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function savePlanUpdate(hobby: Hobby, updatedPlan: HobbyPlan) {
    const plans = parsePlans(hobby.extraJson ?? "{}").map(p => p.id === updatedPlan.id ? updatedPlan : p);
    onUpdateHobby(hobby.id, setPlansInExtra(hobby.extraJson ?? "{}", plans));
  }

  function logSession(session: Omit<SessionLog, "id" | "planId">) {
    if (!logTarget) return;
    const { hobby, plan } = logTarget;
    const newSession: SessionLog = { ...session, id: genId(), planId: plan.id };
    const updatedPlan: HobbyPlan = { ...plan, sessions: [...(plan.sessions ?? []), newSession] };
    savePlanUpdate(hobby, updatedPlan);
  }

  function deleteSession(hobby: Hobby, plan: HobbyPlan, sessionId: string) {
    const updatedPlan: HobbyPlan = { ...plan, sessions: (plan.sessions ?? []).filter(s => s.id !== sessionId) };
    savePlanUpdate(hobby, updatedPlan);
  }

  function saveScheduleEdit(updatedPlan: HobbyPlan) {
    if (!editTarget) return;
    savePlanUpdate(editTarget.hobby, updatedPlan);
    setEditTarget(null);
  }

  function markComplete(hobby: Hobby, plan: HobbyPlan) {
    savePlanUpdate(hobby, { ...plan, completedAt: new Date().toISOString(), isActive: false });
  }

  function pausePlan(hobby: Hobby, plan: HobbyPlan) {
    savePlanUpdate(hobby, { ...plan, isActive: false, isPaused: true });
  }

  function resumePlan(hobby: Hobby, plan: HobbyPlan) {
    savePlanUpdate(hobby, { ...plan, isActive: true, isPaused: false });
  }

  function deletePlan(hobby: Hobby, planId: string) {
    const plans = parsePlans(hobby.extraJson ?? "{}").filter(p => p.id !== planId);
    onUpdateHobby(hobby.id, setPlansInExtra(hobby.extraJson ?? "{}", plans));
    setDeleteConfirmId(null);
  }

  function toggleTaskCompletion(hobby: Hobby, plan: HobbyPlan, taskKey: string) {
    const completions = plan.taskCompletions ?? [];
    const isCompleted = completions.some(c => c.taskKey === taskKey);
    const updated = isCompleted
      ? completions.filter(c => c.taskKey !== taskKey)
      : [...completions, { taskKey, completedAt: Date.now() }];
    savePlanUpdate(hobby, { ...plan, taskCompletions: updated });
  }

  function updateSession(updatedData: Omit<SessionLog, "id" | "planId">) {
    if (!editSessionTarget) return;
    const { hobby, plan, session } = editSessionTarget;
    const updatedSession: SessionLog = { ...updatedData, id: session.id, planId: plan.id };
    savePlanUpdate(hobby, {
      ...plan,
      sessions: (plan.sessions ?? []).map(s => s.id === session.id ? updatedSession : s),
    });
  }

  function deleteEditSession() {
    if (!editSessionTarget) return;
    deleteSession(editSessionTarget.hobby, editSessionTarget.plan, editSessionTarget.session.id);
    setEditSessionTarget(null);
  }

  function saveDayLabel(dayLabel: string, label: string) {
    if (!editDayLabel) return;
    const { hobby, plan } = editDayLabel;
    const updatedDayLabels = { ...(plan.dayLabels ?? {}) };
    if (label) {
      updatedDayLabels[dayLabel] = label;
    } else {
      delete updatedDayLabels[dayLabel];
    }
    savePlanUpdate(hobby, { ...plan, dayLabels: Object.keys(updatedDayLabels).length > 0 ? updatedDayLabels : undefined });
    setEditDayLabel(null);
  }

  // ── Determine scheduled days for a plan ──────────────────────────────────────
  function getScheduledDays(plan: HobbyPlan): string[] {
    if (plan.scheduleDays && plan.scheduleDays.length > 0) return plan.scheduleDays;
    const totalSteps = plan.steps.length;
    const totalWeeks = plan.durationWeeks ?? 1;
    const stepsPerWeek = Math.ceil(totalSteps / totalWeeks) || 3;
    return SPREAD_PATTERNS[Math.min(stepsPerWeek, 7)] ?? ["Mon", "Wed", "Fri"];
  }

  // ── Get ISO date for a given dayOfWeek label this week ────────────────────────
  function dateForDayThisWeek(dayLabel: string): string {
    const targetIdx = DAY_TO_IDX[dayLabel] ?? 1;
    const diff = targetIdx - todayDowIdx;
    const d = new Date(today);
    d.setDate(d.getDate() + diff);
    return d.toISOString().slice(0, 10);
  }

  // ── Build merged day map (all plans → all their scheduled days) ─────────────

  // Collect plan colors (one per plan, cycling through palette)
  const PLAN_COLORS = [
    "#3b82f6", "#f97316", "#10b981", "#8b5cf6", "#ec4899",
    "#06b6d4", "#f59e0b", "#84cc16", "#6366f1", "#ef4444",
  ];

  type MergedEntry = {
    hobby: Hobby; plan: HobbyPlan; typeInfo: typeof HOBBY_TYPES[0];
    color: string; loggedSession?: SessionLog;
  };
  // Only active (not paused) plans appear in the weekly schedule
  const activeOnlyEntries = useMemo(() => activePlanEntries.filter(e => e.plan.isActive && !e.plan.isPaused), [activePlanEntries]);

  const mergedByDay = useMemo((): Record<string, MergedEntry[]> => {
    const map: Record<string, MergedEntry[]> = {};
    DAYS_ORDERED.forEach(d => { map[d] = []; });
    activeOnlyEntries.forEach(({ hobby, plan }, idx) => {
      const typeInfo = HOBBY_TYPE_MAP[hobby.hobbyType as HobbyType] ?? HOBBY_TYPES[0];
      const color = PLAN_COLORS[idx % PLAN_COLORS.length];
      // For activity-based plans, use computed weekly schedule days
      const computedForMerge = (plan.activities && plan.activities.length > 0) ? computeHobbyPlan(plan, today) : null;
      const scheduledDays = computedForMerge
        ? computedForMerge.weeklySchedule.filter(d => d.isTrainingDay).map(d => d.dayName)
        : getScheduledDays(plan);
      // week boundary
      const weekStart = new Date(today); weekStart.setDate(today.getDate() - todayDowIdx);
      const weekEnd   = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
      const sessions = plan.sessions ?? [];
      scheduledDays.forEach(day => {
        const loggedSession = sessions.find(s =>
          s.dayOfWeek === day &&
          s.date >= weekStart.toISOString().slice(0, 10) &&
          s.date <= weekEnd.toISOString().slice(0, 10)
        );
        map[day]?.push({ hobby, plan, typeInfo, color, loggedSession });
      });
    });
    return map;
  }, [activeOnlyEntries, today]);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── This Week's Schedule (merged) ── */}
      {!hideWeeklySchedule && <div className="bg-card border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between">
          <p className="text-sm font-semibold">This Week's Schedule</p>
          <span className="text-xs text-muted-foreground">
            {activeOnlyEntries.length > 1 ? `${activeOnlyEntries.length} plans merged` : activeOnlyEntries[0]?.plan.title}
          </span>
        </div>
        <div className="divide-y">
          {DAYS_ORDERED.map(dayLabel => {
            const entries = mergedByDay[dayLabel] ?? [];
            const dayIdx = DAY_TO_IDX[dayLabel];
            const isToday = dayLabel === todayDowLabel;
            return (
              <div
                key={dayLabel}
                className={`flex items-start gap-3 px-4 py-3 ${isToday ? "bg-primary/5" : ""} ${entries.length === 0 ? "opacity-40" : ""}`}
              >
                {/* Day column */}
                <div className="w-10 shrink-0 pt-0.5">
                  <p className={`text-xs font-bold uppercase ${isToday ? "text-primary" : "text-muted-foreground"}`}>{dayLabel}</p>
                  {isToday && <div className="w-1.5 h-1.5 rounded-full bg-primary mt-0.5" />}
                </div>

                {/* Activities */}
                {entries.length > 0 ? (
                  <div className="flex-1 min-w-0 space-y-2">
                    {entries.map(({ hobby, plan, typeInfo, color, loggedSession }, i) => {
                      const dayInfo = getPlanDayInfo(plan, dayLabel);
                      const pillLabel = dayInfo.label || plan.title;
                      return (
                        <div key={`${plan.id}-${i}`} className="flex items-start gap-1.5 group/entry">
                          <button
                            type="button"
                            className="flex-1 min-w-0 text-left rounded-lg px-2.5 py-2 hover:bg-muted/60 active:bg-muted transition-colors group"
                            onClick={() => {
                              if (loggedSession) {
                                setEditSessionTarget({ hobby, plan, session: loggedSession, dayLabel });
                              } else {
                                setLogTarget({ hobby, plan, dayLabel, defaultDate: dateForDayThisWeek(dayLabel) });
                              }
                            }}
                          >
                            {/* Plan name tag (colored pill) */}
                            <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                              <div className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                                style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}>
                                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
                                {pillLabel}
                              </div>
                              {isToday && i === 0 && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground">Today</span>
                              )}
                            </div>
                            {/* Activity label + task detail */}
                            <div className="flex items-start gap-2">
                              <div className="flex-1 min-w-0">
                                <span className="text-sm font-medium">{hobby.name}</span>
                                {loggedSession?.notes ? (
                                  <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">{loggedSession.notes}</p>
                                ) : dayInfo.notes ? (
                                  <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">{dayInfo.notes}</p>
                                ) : null}
                              </div>
                              {loggedSession ? (
                                <span className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 mt-0.5"
                                  style={{ background: `${color}20`, color }}>
                                  <CheckCircle2 size={9} /> Logged
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5">
                                  + Log
                                </span>
                              )}
                            </div>
                          </button>
                          {/* Edit day label pencil */}
                          <button
                            type="button"
                            title={`Edit ${dayLabel} session name`}
                            className="mt-2 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors shrink-0 opacity-0 group-hover/entry:opacity-100"
                            style={{ color }}
                            onClick={e => { e.stopPropagation(); setEditDayLabel({ hobby, plan, dayLabel }); }}
                          >
                            <Pencil size={11} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground flex-1 pt-0.5">Rest</p>
                )}
              </div>
            );
          })}
        </div>
      </div>}

      {/* ── Per-plan progress cards ── */}
      <div className="space-y-4">
        {activePlanEntries.map(({ hobby, plan }, planIdx) => {
        const typeInfo = HOBBY_TYPE_MAP[hobby.hobbyType as HobbyType] ?? HOBBY_TYPES[0];
        const startDate = plan.startDate ? new Date(plan.startDate) : null;
        const weeksElapsed = startDate
          ? Math.max(0, Math.floor((today.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000)))
          : 0;
        const totalWeeks = plan.durationWeeks ?? 1;
        const currentWeek = Math.min(weeksElapsed + 1, totalWeeks);
        const progressPct = plan.durationWeeks
          ? Math.min(100, Math.round((weeksElapsed / plan.durationWeeks) * 100))
          : 0;
        const totalSteps = plan.steps.length;
        const doneSteps = plan.steps.filter(s => s.done).length;
        const stepPct = totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 0;
        const displayPct = plan.durationWeeks ? Math.max(progressPct, stepPct) : stepPct;

        const scheduledDays = new Set(getScheduledDays(plan));
        const allDone = totalSteps > 0 && doneSteps === totalSteps;

        // Sessions for this plan, sorted most recent first
        const sessions = (plan.sessions ?? []).slice().sort((a, b) => b.date.localeCompare(a.date));
        // Check which days this week already have a session logged
        const thisWeekStart = new Date(today);
        thisWeekStart.setDate(today.getDate() - todayDowIdx); // start of week (Sun)
        const thisWeekEnd = new Date(thisWeekStart);
        thisWeekEnd.setDate(thisWeekStart.getDate() + 6);
        const thisWeekSessionDays = new Set(
          sessions
            .filter(s => s.date >= thisWeekStart.toISOString().slice(0,10) && s.date <= thisWeekEnd.toISOString().slice(0,10))
            .map(s => s.dayOfWeek)
        );
        // Map dayOfWeek → session for editing
        const thisWeekSessionByDay = new Map<string, SessionLog>(
          sessions
            .filter(s => s.date >= thisWeekStart.toISOString().slice(0,10) && s.date <= thisWeekEnd.toISOString().slice(0,10))
            .filter(s => !!s.dayOfWeek)
            .map(s => [s.dayOfWeek!, s])
        );

        // Activity-based computed plan (new flow)
        const computedPlan = (plan.activities && plan.activities.length > 0)
          ? computeHobbyPlan(plan, today)
          : null;
        const activityBasedProgressPct = computedPlan ? Math.round(computedPlan.assumptions.progressPct) : null;
        const finalDisplayPct = activityBasedProgressPct !== null ? activityBasedProgressPct : displayPct;

        return (
          <div key={`${hobby.id}-${plan.id}`} className={`bg-card border rounded-xl overflow-hidden ${plan.isPaused && !plan.isActive ? "opacity-75" : ""}`}>
            {/* ── Plan Header ── */}
            <div className="px-4 py-3 border-b flex items-center justify-between gap-2"
              style={{ background: `${typeInfo.color}10`, borderBottomColor: `${typeInfo.color}30` }}>
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="relative shrink-0">
                  <span className="text-lg">{typeInfo.emoji}</span>
                  <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card"
                    style={{ background: PLAN_COLORS[planIdx % PLAN_COLORS.length] }} />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-muted-foreground truncate">{hobby.name}</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-semibold truncate">{plan.title}</p>
                    {plan.isPaused && !plan.isActive && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 shrink-0">
                        Paused
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {allDone && plan.isActive && (
                  <button
                    onClick={() => markComplete(hobby, plan)}
                    className="text-[10px] px-2.5 py-1 rounded-full font-semibold border transition-colors"
                    style={{ borderColor: `${typeInfo.color}60`, color: typeInfo.color, background: `${typeInfo.color}15` }}
                  >
                    ✓ Done
                  </button>
                )}
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: `${typeInfo.color}20`, color: typeInfo.color }}>
                  {computedPlan ? `${finalDisplayPct}%` : plan.durationWeeks ? `Wk ${currentWeek}/${totalWeeks}` : `${stepPct}%`}
                </span>
                {/* ── 3-dot menu ── */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground">
                      <MoreHorizontal size={14} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onClick={() => setEditTarget({ hobby, plan })}>
                      <Pencil size={13} className="mr-2" /> Edit plan
                    </DropdownMenuItem>
                    {plan.isActive ? (
                      <DropdownMenuItem onClick={() => pausePlan(hobby, plan)}>
                        <Pause size={13} className="mr-2 text-yellow-600" />
                        <span className="text-yellow-700 dark:text-yellow-400">Pause plan</span>
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onClick={() => resumePlan(hobby, plan)}>
                        <Play size={13} className="mr-2 text-emerald-600" />
                        <span className="text-emerald-700 dark:text-emerald-400">Resume plan</span>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => deletePlan(hobby, plan.id)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 size={13} className="mr-2" /> Delete plan
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div className="p-4 space-y-4">
              {/* ── Paused banner ── */}
              {plan.isPaused && !plan.isActive && (
                <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/25">
                  <div className="flex items-center gap-2 text-xs text-yellow-700 dark:text-yellow-400">
                    <Pause size={12} />
                    <span className="font-medium">Plan is paused</span>
                    <span className="opacity-70">— sessions won't appear in your schedule</span>
                  </div>
                  <button
                    onClick={() => resumePlan(hobby, plan)}
                    className="text-[10px] font-semibold px-2.5 py-1 rounded-full border border-emerald-500/40 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors shrink-0"
                  >
                    <Play size={9} className="inline mr-1" />Resume
                  </button>
                </div>
              )}

              {/* ── Progress bar ── */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    {computedPlan
                      ? `${computedPlan.assumptions.sessionsPerWeek}×/week · ${computedPlan.assumptions.minutesPerSession} min`
                      : plan.durationWeeks ? `Week ${currentWeek} of ${totalWeeks}` : "Progress"}
                    {!computedPlan && totalSteps > 0 && ` · ${doneSteps}/${totalSteps} steps`}
                    {computedPlan && computedPlan.assumptions.hoursCompleted > 0 && ` · ${computedPlan.assumptions.hoursCompleted.toFixed(1)}h completed`}
                  </span>
                  <span>{finalDisplayPct}%</span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${finalDisplayPct}%`, background: typeInfo.color }} />
                </div>
                {startDate && (
                  <p className="text-xs text-muted-foreground">
                    Started {format(startDate, "MMM d, yyyy")}
                    {computedPlan
                      ? ` · ~${computedPlan.assumptions.weeksToGoal} weeks to goal`
                      : plan.durationWeeks && (() => {
                          const end = new Date(startDate); end.setDate(end.getDate() + plan.durationWeeks * 7);
                          return ` · ends ${format(end, "MMM d, yyyy")}`;
                        })()}
                  </p>
                )}
              </div>

              {/* ── Activity-based: Today's Plan ── */}
              {computedPlan && computedPlan.todayPlan.length > 0 && (
                <div className="bg-card border rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 border-b flex items-center justify-between"
                    style={{ background: `${typeInfo.color}10` }}>
                    <div className="flex items-center gap-1.5">
                      <CalendarDays size={12} style={{ color: typeInfo.color }} />
                      <p className="text-xs font-semibold" style={{ color: typeInfo.color }}>Today's Plan</p>
                      {computedPlan.todayPlan.some(b => b.carriedForward) && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 font-medium">
                          carried forward
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {computedPlan.todayPlan.filter(b => b.completed).length}/{computedPlan.todayPlan.length} done
                    </span>
                  </div>
                  <div className="divide-y">
                    {computedPlan.todayPlan.map(block => (
                      <button
                        key={block.taskKey}
                        type="button"
                        onClick={() => toggleTaskCompletion(hobby, plan, block.taskKey)}
                        className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors ${block.completed ? "opacity-60" : ""}`}
                      >
                        <div className="shrink-0 mt-0.5">
                          {block.completed
                            ? <CheckCircle2 size={16} style={{ color: typeInfo.color }} />
                            : <Circle size={16} className="text-muted-foreground" />
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`text-sm font-medium ${block.completed ? "line-through text-muted-foreground" : ""}`}>
                              {block.activityName}
                            </span>
                            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                              <Timer size={9} />{block.minutes} min
                            </span>
                            {block.carriedForward && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                from {block.originalDate}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{block.description}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Activity-based: Rest day message ── */}
              {computedPlan && computedPlan.isRestDay && computedPlan.todayPlan.length === 0 && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl border bg-muted/20">
                  <span className="text-base">😌</span>
                  <div>
                    <p className="text-sm font-medium">Rest day</p>
                    <p className="text-[11px] text-muted-foreground">{computedPlan.weeklyFocus.title}</p>
                  </div>
                </div>
              )}

              {/* ── Activity-based: Weekly Schedule ── */}
              {computedPlan && (
                <div className="bg-card border rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 border-b bg-muted/30 flex items-center justify-between">
                    <p className="text-xs font-semibold">This Week</p>
                    <span className="text-[10px] text-muted-foreground">
                      {computedPlan.assumptions.sessionsPerWeek}×/week · {computedPlan.assumptions.minutesPerSession} min/session
                    </span>
                  </div>
                  <div className="divide-y">
                    {computedPlan.weeklySchedule.map(day => {
                      const isComplete = day.status === "complete";
                      const isRest = day.status === "rest";
                      const allBlocksDoneToday = day.isToday && day.blocks.length > 0 && day.blocks.every(b => b.completed);
                      return (
                        <div
                          key={day.date}
                          className={`flex items-start gap-3 px-4 py-2.5 ${day.isToday ? "bg-primary/5" : ""} ${isRest ? "opacity-40" : ""}`}
                        >
                          <div className="w-10 shrink-0 pt-0.5">
                            <p className={`text-xs font-bold uppercase ${day.isToday ? "text-primary" : "text-muted-foreground"}`}>
                              {day.dayName}
                            </p>
                            {day.isToday && <div className="w-1.5 h-1.5 rounded-full bg-primary mt-0.5" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            {isRest ? (
                              <p className="text-xs text-muted-foreground pt-0.5">Rest</p>
                            ) : day.blocks.length > 0 ? (
                              <div className="space-y-1">
                                {day.blocks.map(block => (
                                  <div key={block.taskKey} className="flex items-center gap-1.5">
                                    {block.completed
                                      ? <CheckCircle2 size={11} style={{ color: typeInfo.color }} />
                                      : <Circle size={11} className="text-muted-foreground/50" />
                                    }
                                    <span className={`text-xs ${block.completed ? "line-through text-muted-foreground" : ""}`}>
                                      {block.activityName}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground">{block.minutes}m</span>
                                    {block.carriedForward && (
                                      <span className="text-[9px] px-1 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">↑</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : isComplete || allBlocksDoneToday ? (
                              <div className="flex items-center gap-1">
                                <CheckCircle2 size={11} style={{ color: typeInfo.color }} />
                                <span className="text-xs font-medium" style={{ color: typeInfo.color }}>Done</span>
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground pt-0.5">Scheduled</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Session-log based: This Week's Schedule ── */}
              {!computedPlan && (
                <div className="bg-card border rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 border-b bg-muted/30 flex items-center justify-between">
                    <p className="text-xs font-semibold">This Week's Schedule</p>
                    <span className="text-[10px] text-muted-foreground">
                      {plan.durationWeeks
                        ? `Week ${currentWeek} of ${totalWeeks}`
                        : `${scheduledDays.size}×/week`}
                    </span>
                  </div>
                  <div className="divide-y">
                    {DAYS_ORDERED.map(dayLabel => {
                      const isToday = dayLabel === todayDowLabel;
                      const hasActivity = scheduledDays.has(dayLabel);
                      const existingSession = thisWeekSessionByDay.get(dayLabel);
                      const isLogged = !!existingSession;

                      return (
                        <div
                          key={dayLabel}
                          className={`flex items-center gap-3 px-4 py-3 ${isToday ? "bg-primary/5" : ""} ${!hasActivity ? "opacity-40" : ""}`}
                        >
                          <div className="w-10 shrink-0">
                            <p className={`text-xs font-bold uppercase ${isToday ? "text-primary" : "text-muted-foreground"}`}>{dayLabel}</p>
                            {isToday && <div className="w-1.5 h-1.5 rounded-full bg-primary mt-0.5" />}
                          </div>
                          {hasActivity ? (
                            <button
                              type="button"
                              className="flex-1 flex items-center gap-2 text-left rounded-lg px-2.5 py-2 hover:bg-muted/60 active:bg-muted transition-colors group"
                              onClick={() => {
                                if (existingSession) {
                                  setEditSessionTarget({ hobby, plan, session: existingSession, dayLabel });
                                } else {
                                  setLogTarget({ hobby, plan, dayLabel, defaultDate: dateForDayThisWeek(dayLabel) });
                                }
                              }}
                            >
                              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: isLogged ? typeInfo.color : `${typeInfo.color}60` }} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">
                                  {plan.dayLabels?.[dayLabel] || plan.title}
                                </p>
                                {isLogged && existingSession.notes ? (
                                  <p className="text-[10px] text-muted-foreground truncate">{existingSession.notes}</p>
                                ) : plan.dayNotes?.[dayLabel] ? (
                                  <p className="text-[10px] text-muted-foreground line-clamp-2 leading-relaxed">{plan.dayNotes[dayLabel]}</p>
                                ) : null}
                              </div>
                              {isLogged ? (
                                <span className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
                                  style={{ background: `${typeInfo.color}20`, color: typeInfo.color }}>
                                  <CheckCircle2 size={9} />
                                  {existingSession.durationMins ? `${existingSession.durationMins}m` : "Logged"}
                                  <Pencil size={8} className="ml-0.5 opacity-60" />
                                </span>
                              ) : isToday ? (
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary text-primary-foreground shrink-0">
                                  Log Today
                                </span>
                              ) : (
                                <span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0 transition-opacity">
                                  + Log
                                </span>
                              )}
                            </button>
                          ) : (
                            <p className="text-sm text-muted-foreground flex-1 px-2.5">Rest</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Recent Sessions (session-log plans only) ── */}
              {!computedPlan && sessions.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Recent Sessions ({sessions.length})
                  </p>
                  <div className="space-y-1.5">
                    {sessions.slice(0, 3).map(session => (
                      <div key={session.id} className="flex items-start gap-2.5 rounded-lg border bg-muted/20 px-3 py-2">
                        <ClipboardCheck size={13} className="shrink-0 mt-0.5" style={{ color: typeInfo.color }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-medium">{format(parseISO(session.date), "EEE, MMM d")}</span>
                            {session.durationMins && (
                              <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                                <Timer size={9} />{session.durationMins} min
                              </span>
                            )}
                          </div>
                          {session.notes && <p className="text-[11px] text-muted-foreground truncate">{session.notes}</p>}
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            onClick={() => setEditSessionTarget({ hobby, plan, session, dayLabel: session.dayOfWeek ?? todayDowLabel })}
                            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            title="Edit session"
                          >
                            <Pencil size={10} />
                          </button>
                          <button
                            onClick={() => deleteSession(hobby, plan, session.id)}
                            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                            title="Delete session"
                          >
                            <X size={10} />
                          </button>
                        </div>
                      </div>
                    ))}
                    {sessions.length > 3 && (
                      <p className="text-xs text-muted-foreground px-1">+{sessions.length - 3} more sessions</p>
                    )}
                  </div>
                </div>
              )}

              {/* ── Log button for today (session-log plans only) ── */}
              {!computedPlan && scheduledDays.has(todayDowLabel) && !thisWeekSessionDays.has(todayDowLabel) && (
                <button
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed transition-colors hover:border-primary/40 hover:bg-primary/5"
                  style={{ borderColor: `${typeInfo.color}40` }}
                  onClick={() => setLogTarget({ hobby, plan, dayLabel: todayDowLabel, defaultDate: today.toISOString().slice(0, 10) })}
                >
                  <Play size={13} style={{ color: typeInfo.color }} />
                  <span className="text-sm font-medium" style={{ color: typeInfo.color }}>Log Today's Session</span>
                </button>
              )}

              {/* ── Activity-based: Weekly Focus ── */}
              {computedPlan && (
                <div className="rounded-lg border bg-muted/20 px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">Weekly Focus</p>
                  <p className="text-xs font-medium">{computedPlan.weeklyFocus.title}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{computedPlan.weeklyFocus.detail}</p>
                </div>
              )}
            </div>
          </div>
        );
      })}
      </div>

      {/* Log Session Dialog */}
      <LogSessionDialog
        open={!!logTarget}
        onClose={() => setLogTarget(null)}
        onSave={logSession}
        planTitle={logTarget?.plan.title ?? ""}
        dayLabel={logTarget?.dayLabel ?? ""}
        defaultDate={logTarget?.defaultDate ?? today.toISOString().slice(0, 10)}
      />

      {/* Day Label Dialog */}
      <DayLabelDialog
        open={!!editDayLabel}
        onClose={() => setEditDayLabel(null)}
        onSave={(label) => saveDayLabel(editDayLabel?.dayLabel ?? "", label)}
        planTitle={editDayLabel?.plan.title ?? ""}
        dayLabel={editDayLabel?.dayLabel ?? ""}
        currentLabel={editDayLabel ? (editDayLabel.plan.dayLabels?.[editDayLabel.dayLabel] ?? "") : ""}
      />

      {/* Edit Session Dialog */}
      <LogSessionDialog
        open={!!editSessionTarget}
        onClose={() => setEditSessionTarget(null)}
        onSave={updateSession}
        onDelete={deleteEditSession}
        planTitle={editSessionTarget?.plan.title ?? ""}
        dayLabel={editSessionTarget?.dayLabel ?? ""}
        defaultDate={editSessionTarget?.session.date ?? today.toISOString().slice(0, 10)}
        existingSession={editSessionTarget?.session ?? null}
      />

      {/* Edit Plan Dialog (reuse PlanEditDialog for schedule days + title/desc/duration) */}
      <PlanEditDialog
        plan={editTarget?.plan ?? null}
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        onSave={saveScheduleEdit}
      />
    </div>
  );
}

function HobbyDetailDialog({
  hobby, open, onClose, onEdit, onUpdateGoals, onUpdatePlans, onUpdateExtra, onCreateSystemGoal,
}: {
  hobby: Hobby | null; open: boolean; onClose: () => void; onEdit: () => void;
  onUpdateGoals: (goals: HobbyGoal[]) => void;
  onUpdatePlans: (plans: HobbyPlan[]) => void;
  onUpdateExtra: (newExtraJson: string) => void;
  onCreateSystemGoal?: (hobby: Hobby, plan: HobbyPlan) => void;
}) {
  const [addingGoal, setAddingGoal] = useState(false);
  const [addingPlan, setAddingPlan] = useState(false);
  const [editingPlan, setEditingPlan] = useState<HobbyPlan | null>(null);
  const [editingGoal, setEditingGoal] = useState<HobbyGoal | null>(null);
  const [logSessionTarget, setLogSessionTarget] = useState<{ plan: HobbyPlan; dayLabel: string; defaultDate: string } | null>(null);
  const [editSessionTarget, setEditSessionTarget] = useState<{ plan: HobbyPlan; dayLabel: string; session: SessionLog } | null>(null);
  if (!hobby) return null;
  const typeInfo = HOBBY_TYPE_MAP[hobby.hobbyType as HobbyType] ?? HOBBY_TYPES[0];
  const TypeIcon = typeInfo.icon;
  const skillInfo = SKILL_MAP[hobby.skillLevel ?? "beginner"];
  const statusInfo = STATUS_MAP[hobby.status ?? "active"];
  const extra = parseExtra(hobby.extraJson ?? "{}");
  const goals = parseGoals(hobby.extraJson ?? "{}");
  const plans = parsePlans(hobby.extraJson ?? "{}");
  const activeGoals = goals.filter(g => g.status === "active");
  const completedGoals = goals.filter(g => g.status === "completed");
  const activePlans = plans.filter(p => p.isActive && !p.completedAt);
  const inactivePlans = plans.filter(p => !p.isActive && !p.completedAt);
  const completedPlans = plans.filter(p => !!p.completedAt);

  function updateGoal(updatedGoal: HobbyGoal) { onUpdateGoals(goals.map(g => g.id === updatedGoal.id ? updatedGoal : g)); }
  function deleteGoal(id: string) { onUpdateGoals(goals.filter(g => g.id !== id)); }
  function completeGoal(id: string) { updateGoal({ ...goals.find(g => g.id === id)!, status: "completed" }); }
  function updateCount(id: string, val: number) { updateGoal({ ...goals.find(g => g.id === id)!, currentValue: val }); }
  function toggleGoalStep(goalId: string, stepId: string, done: boolean) {
    const goal = goals.find(g => g.id === goalId); if (!goal) return;
    const steps = (goal.steps ?? []).map(s => s.id === stepId ? { ...s, done } : s);
    updateGoal({ ...goal, steps, status: steps.every(s => s.done) ? "completed" : goal.status });
  }
  function togglePlanActive(planId: string) {
    const plan = plans.find(p => p.id === planId); if (!plan) return;
    onUpdatePlans(plans.map(p => p.id === planId ? { ...p, isActive: !p.isActive, startDate: (!p.isActive && !p.startDate) ? new Date().toISOString().slice(0, 10) : p.startDate } : p));
  }
  function togglePlanStep(planId: string, stepId: string, done: boolean) {
    const plan = plans.find(p => p.id === planId); if (!plan) return;
    onUpdatePlans(plans.map(p => p.id === planId ? { ...p, steps: p.steps.map(s => s.id === stepId ? { ...s, done } : s) } : p));
  }
  function completePlan(planId: string) { onUpdatePlans(plans.map(p => p.id === planId ? { ...p, isActive: false, isPaused: false, completedAt: new Date().toISOString() } : p)); }
  function pausePlan(planId: string) { onUpdatePlans(plans.map(p => p.id === planId ? { ...p, isActive: false, isPaused: true } : p)); }
  function resumePlan(planId: string) { onUpdatePlans(plans.map(p => p.id === planId ? { ...p, isActive: true, isPaused: false } : p)); }
  function toggleMilestone(planId: string, milestoneId: string, completed: boolean) {
    onUpdatePlans(plans.map(p => p.id === planId
      ? { ...p, milestones: (p.milestones ?? []).map(m => m.id === milestoneId ? { ...m, completedAt: completed ? new Date().toISOString() : undefined } : m) }
      : p));
  }
  function deletePlan(planId: string) { onUpdatePlans(plans.filter(p => p.id !== planId)); }
  function savePlanEdit(updated: HobbyPlan) {
    // Sync linked goal title/description/status alongside the plan edit
    const updatedGoals = goals.map(g =>
      g.linkedPlanId === updated.id
        ? { ...g, title: updated.title, description: updated.description, durationWeeks: updated.durationWeeks,
            status: updated.completedAt ? "completed" as const : updated.isActive ? "active" as const : g.status }
        : g
    );
    onUpdateExtra(setPlansAndGoalsInExtra(hobby?.extraJson ?? "{}", plans.map(p => p.id === updated.id ? updated : p), updatedGoals));
    setEditingPlan(null);
  }
  function saveGoalEdit(updated: HobbyGoal) { updateGoal(updated); setEditingGoal(null); }

  function saveNewSession(plan: HobbyPlan, sessionData: Omit<SessionLog, "id" | "planId">) {
    const newSession: SessionLog = { ...sessionData, id: genId(), planId: plan.id };
    onUpdatePlans(plans.map(p => p.id === plan.id ? { ...p, sessions: [...(p.sessions ?? []), newSession] } : p));
  }
  function saveEditedSession(plan: HobbyPlan, session: SessionLog, sessionData: Omit<SessionLog, "id" | "planId">) {
    const updated: SessionLog = { ...sessionData, id: session.id, planId: plan.id };
    onUpdatePlans(plans.map(p => p.id === plan.id ? { ...p, sessions: (p.sessions ?? []).map(s => s.id === session.id ? updated : s) } : p));
  }
  function deleteSession(plan: HobbyPlan, sessionId: string) {
    onUpdatePlans(plans.map(p => p.id === plan.id ? { ...p, sessions: (p.sessions ?? []).filter(s => s.id !== sessionId) } : p));
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="absolute top-0 left-0 right-0 h-1.5 rounded-t-lg" style={{ backgroundColor: typeInfo.color }} />
        <DialogHeader className="mt-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white" style={{ backgroundColor: typeInfo.color }}>
              <TypeIcon size={18} />
            </div>
            <div>
              <DialogTitle className="text-lg leading-tight">{hobby.name}</DialogTitle>
              <p className="text-xs text-muted-foreground">{typeInfo.label}{hobby.category ? ` · ${hobby.category}` : ""}</p>
            </div>
            {hobby.isFavorite && <Heart size={16} className="ml-auto fill-pink-500 text-pink-500" />}
          </div>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="flex flex-wrap gap-2">
            {skillInfo && <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${skillInfo.color}`}>{skillInfo.label}</span>}
            {statusInfo && <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusInfo.color}`}>{statusInfo.label}</span>}
            {hobby.dateStarted && <span className="text-xs text-muted-foreground px-2.5 py-1 rounded-full bg-muted">Started {hobby.dateStarted}</span>}
          </div>

          {/* ── Active Plan(s) — shown first if any exist ── */}
          {activePlans.length > 0 && (
            <div className="space-y-3">
              {activePlans.map(p => (
                <HobbyPlanRichCard key={p.id} plan={p} hobbyColor={typeInfo.color} hobbyTypeLabel={typeInfo.label}
                  onToggleStep={(sid, done) => togglePlanStep(p.id, sid, done)}
                  onToggleMilestone={(mid, done) => toggleMilestone(p.id, mid, done)}
                  onToggleActive={() => togglePlanActive(p.id)}
                  onPause={() => pausePlan(p.id)}
                  onResume={() => resumePlan(p.id)}
                  onComplete={() => completePlan(p.id)}
                  onDelete={() => deletePlan(p.id)}
                  onEdit={() => setEditingPlan(p)}
                  onLogSession={(dayLabel, defaultDate) => setLogSessionTarget({ plan: p, dayLabel, defaultDate })}
                  onEditSession={(dayLabel, session) => setEditSessionTarget({ plan: p, dayLabel, session })}
                />
              ))}
            </div>
          )}

          {hobby.coverUrl && <img src={hobby.coverUrl} alt={hobby.name} className="w-full h-48 object-cover rounded-lg" />}
          {Object.values(extra).some(v => v !== "" && v != null && !Array.isArray(v)) && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Details</h4>
              <div className="space-y-1.5"><ExtraDisplay hobbyType={hobby.hobbyType as HobbyType} extra={extra} /></div>
            </div>
          )}

          {/* ── Get started banner (shown only when no plans + no goals yet) ── */}
          {plans.length === 0 && goals.length === 0 && (
            <div className="rounded-xl border-2 border-dashed p-4 text-center space-y-3" style={{ borderColor: typeInfo.color + "55", backgroundColor: typeInfo.color + "08" }}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center mx-auto" style={{ backgroundColor: typeInfo.color + "20" }}>
                <TypeIcon size={18} style={{ color: typeInfo.color }} />
              </div>
              <div>
                <p className="text-sm font-semibold">Make the most of {hobby.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Add a plan with step-by-step milestones, or set a goal to track your progress.</p>
              </div>
              <div className="flex gap-2 justify-center">
                <Button size="sm" onClick={() => setAddingPlan(true)} className="gap-1.5" style={{ backgroundColor: typeInfo.color }}>
                  <ClipboardList size={13} /> Add a Plan
                </Button>
                <Button size="sm" variant="outline" onClick={() => setAddingGoal(true)} className="gap-1.5">
                  <Target size={13} /> Add a Goal
                </Button>
              </div>
            </div>
          )}

          {/* ── Plans section — inactive/paused + add button ── */}
          {(plans.length > 0 || goals.length > 0) && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <ClipboardList size={11} className="text-blue-500" /> Plans
                {activePlans.length > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-bold">{activePlans.length} active</span>}
              </h4>
              <button onClick={() => setAddingPlan(true)} className="text-xs text-blue-600 dark:text-blue-400 hover:opacity-80 flex items-center gap-0.5 transition-opacity">
                <Plus size={11} /> Add plan
              </button>
            </div>
            {plans.length === 0 ? (
              <button onClick={() => setAddingPlan(true)} className="w-full rounded-xl border-2 border-dashed border-muted-foreground/20 hover:border-blue-300 transition-colors p-3 text-center text-muted-foreground hover:text-foreground">
                <ClipboardList size={16} className="mx-auto mb-1 opacity-30" />
                <p className="text-xs">No plans yet — add one</p>
              </button>
            ) : (
              <div className="space-y-3">
                {/* Paused plans (not shown at top) */}
                {inactivePlans.filter(p => p.isPaused).map(p => (
                  <HobbyPlanRichCard key={p.id} plan={p} hobbyColor={typeInfo.color} hobbyTypeLabel={typeInfo.label}
                    onToggleStep={(sid, done) => togglePlanStep(p.id, sid, done)}
                    onToggleMilestone={(mid, done) => toggleMilestone(p.id, mid, done)}
                    onToggleActive={() => togglePlanActive(p.id)}
                    onPause={() => pausePlan(p.id)}
                    onResume={() => resumePlan(p.id)}
                    onComplete={() => completePlan(p.id)}
                    onDelete={() => deletePlan(p.id)}
                    onEdit={() => setEditingPlan(p)}
                    onLogSession={(dayLabel, defaultDate) => setLogSessionTarget({ plan: p, dayLabel, defaultDate })}
                    onEditSession={(dayLabel, session) => setEditSessionTarget({ plan: p, dayLabel, session })}
                  />
                ))}
                {/* Inactive (not paused) plans */}
                {inactivePlans.filter(p => !p.isPaused).map(p => (
                  <HobbyPlanRichCard key={p.id} plan={p} hobbyColor={typeInfo.color} hobbyTypeLabel={typeInfo.label}
                    onToggleStep={(sid, done) => togglePlanStep(p.id, sid, done)}
                    onToggleMilestone={(mid, done) => toggleMilestone(p.id, mid, done)}
                    onToggleActive={() => togglePlanActive(p.id)}
                    onPause={() => pausePlan(p.id)}
                    onResume={() => resumePlan(p.id)}
                    onComplete={() => completePlan(p.id)}
                    onDelete={() => deletePlan(p.id)}
                    onEdit={() => setEditingPlan(p)}
                    onLogSession={(dayLabel, defaultDate) => setLogSessionTarget({ plan: p, dayLabel, defaultDate })}
                    onEditSession={(dayLabel, session) => setEditSessionTarget({ plan: p, dayLabel, session })}
                  />
                ))}
                {completedPlans.length > 0 && (
                  <details className="group">
                    <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground list-none flex items-center gap-1 px-1 py-1">
                      <ChevronRight size={11} className="group-open:rotate-90 transition-transform" />
                      {completedPlans.length} completed plan{completedPlans.length !== 1 ? "s" : ""}
                    </summary>
                    <div className="space-y-2 mt-1">
                      {completedPlans.map(p => (
                        <PlanCard key={p.id} plan={p} hobbyName={hobby.name} hobbyColor={typeInfo.color} onDelete={() => deletePlan(p.id)} />
                      ))}
                    </div>
                  </details>
                )}
                {/* If no inactive/paused/completed, show hint */}
                {inactivePlans.length === 0 && completedPlans.length === 0 && activePlans.length > 0 && (
                  <p className="text-xs text-muted-foreground px-1 py-1">All plans are active ↑</p>
                )}
              </div>
            )}
          </div>
          )}

          {/* ── Goals section ── */}
          {(plans.length > 0 || goals.length > 0) && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Target size={11} className="text-amber-500" /> Goals
                {activeGoals.length > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 font-bold">{activeGoals.length}</span>}
              </h4>
              <button onClick={() => setAddingGoal(true)} className="text-xs text-amber-600 dark:text-amber-400 hover:opacity-80 flex items-center gap-0.5 transition-opacity">
                <Plus size={11} /> Add goal
              </button>
            </div>
            {goals.length === 0 ? (
              <button onClick={() => setAddingGoal(true)} className="w-full rounded-xl border-2 border-dashed border-muted-foreground/20 hover:border-amber-300 transition-colors p-3 text-center text-muted-foreground hover:text-foreground">
                <Target size={16} className="mx-auto mb-1 opacity-30" />
                <p className="text-xs">No goals yet — add one</p>
              </button>
            ) : (
              <div className="space-y-2">
                {activeGoals.map(g => (
                  <GoalCard key={g.id} goal={g} hobbyName={hobby.name} hobbyColor={typeInfo.color}
                    onUpdateCount={(val) => updateCount(g.id, val)}
                    onToggleStep={(sid, done) => toggleGoalStep(g.id, sid, done)}
                    onComplete={() => completeGoal(g.id)}
                    onDelete={() => deleteGoal(g.id)}
                    onEdit={() => setEditingGoal(g)}
                  />
                ))}
                {completedGoals.length > 0 && (
                  <details className="group">
                    <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground list-none flex items-center gap-1 px-1 py-1">
                      <ChevronRight size={11} className="group-open:rotate-90 transition-transform" />
                      {completedGoals.length} completed
                    </summary>
                    <div className="space-y-2 mt-1">
                      {completedGoals.map(g => (
                        <GoalCard key={g.id} goal={g} hobbyName={hobby.name} hobbyColor={typeInfo.color} onDelete={() => deleteGoal(g.id)} />
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}
          </div>
          )}

          {hobby.notes && <div><h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Notes</h4><p className="text-sm text-muted-foreground">{hobby.notes}</p></div>}
          <div className="flex justify-end pt-2">
            <Button size="sm" variant="outline" onClick={onEdit}><Pencil size={13} className="mr-1.5" /> Edit</Button>
          </div>
        </div>

        {addingPlan && (
          <PlanWizard open={addingPlan} onClose={() => setAddingPlan(false)} hobbies={[hobby]} defaultHobbyId={hobby.id}
            onSave={(_, plan) => {
              // Single atomic write so plan + auto-goal land together and neither overwrites the other
              const autoGoal: HobbyGoal = {
                id: genId(),
                title: plan.title,
                description: plan.description || undefined,
                goalType: "milestone",
                durationWeeks: plan.durationWeeks,
                status: plan.isActive ? "active" : "paused",
                createdAt: plan.createdAt,
                linkedPlanId: plan.id,
              };
              onUpdateExtra(setPlansAndGoalsInExtra(hobby.extraJson ?? "{}", [...plans, plan], [...goals, autoGoal]));
              if (isLanguageLearningHobby(hobby)) onCreateSystemGoal?.(hobby, plan);
              setAddingPlan(false);
            }}
          />
        )}
        {addingGoal && (
          <GoalWizard open={addingGoal} onClose={() => setAddingGoal(false)} hobbies={[hobby]} defaultHobbyId={hobby.id}
            onSave={(_, goal) => { onUpdateGoals([...goals, goal]); setAddingGoal(false); }}
          />
        )}

        <PlanEditDialog
          plan={editingPlan}
          open={!!editingPlan}
          onClose={() => setEditingPlan(null)}
          onSave={savePlanEdit}
        />
        <GoalEditDialog
          goal={editingGoal}
          open={!!editingGoal}
          onClose={() => setEditingGoal(null)}
          onSave={saveGoalEdit}
        />
        {/* ── Log new session from rich card ── */}
        <LogSessionDialog
          open={!!logSessionTarget}
          onClose={() => setLogSessionTarget(null)}
          planTitle={logSessionTarget?.plan.title ?? ""}
          dayLabel={logSessionTarget?.dayLabel ?? ""}
          defaultDate={logSessionTarget?.defaultDate ?? ""}
          onSave={(sessionData) => {
            if (logSessionTarget) saveNewSession(logSessionTarget.plan, sessionData);
            setLogSessionTarget(null);
          }}
        />
        {/* ── Edit existing session from rich card ── */}
        <LogSessionDialog
          open={!!editSessionTarget}
          onClose={() => setEditSessionTarget(null)}
          planTitle={editSessionTarget?.plan.title ?? ""}
          dayLabel={editSessionTarget?.dayLabel ?? ""}
          defaultDate={editSessionTarget?.session.date ?? ""}
          existingSession={editSessionTarget?.session}
          onSave={(sessionData) => {
            if (editSessionTarget) saveEditedSession(editSessionTarget.plan, editSessionTarget.session, sessionData);
            setEditSessionTarget(null);
          }}
          onDelete={() => {
            if (editSessionTarget) deleteSession(editSessionTarget.plan, editSessionTarget.session.id);
            setEditSessionTarget(null);
          }}
        />

        {/* ── Hiking section (only for hiking hobbies) ── */}
        {hobby.name.toLowerCase().includes("hiking") && (
          <div className="mt-4 border-t pt-4">
            <HikingSection hobby={hobby} onUpdateExtra={onUpdateExtra} />
          </div>
        )}

        {/* ── Cycling section ── */}
        {(() => { const n = hobby.name.toLowerCase(); return n.includes("cycling") || n.includes("cycle") || n.includes("bike") || n.includes("biking") || n.includes("mtb") || n.includes("gravel riding"); })() && (
          <div className="mt-4 border-t pt-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-base">🚲</span>
              <p className="text-sm font-semibold">Routes & Rides</p>
            </div>
            <CyclingSection hobby={hobby} onUpdateExtra={onUpdateExtra} />
          </div>
        )}

        {/* ── Bird watching section ── */}
        {(hobby.name.toLowerCase().includes("bird") || hobby.name.toLowerCase().includes("birding")) && (
          <div className="mt-4 border-t pt-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-base">🦅</span>
              <p className="text-sm font-semibold">Sightings & Wishlist</p>
            </div>
            <BirdSection hobby={hobby} onUpdateExtra={onUpdateExtra} />
          </div>
        )}

        {/* ── Fishing section ── */}
        {(() => { const n = hobby.name.toLowerCase(); return n.includes("fishing") || n.includes("angling") || n.includes("fly fishing") || n.includes("bass fishing"); })() && (
          <div className="mt-4 border-t pt-4">
            <FishingSection hobby={hobby} onUpdateExtra={onUpdateExtra} />
          </div>
        )}

        {/* ── Gardening section ── */}
        {(() => { const n = hobby.name.toLowerCase(); return n.includes("garden") || n.includes("gardening") || n.includes("horticulture"); })() && (
          <div className="mt-4 border-t pt-4">
            <GardeningSection hobby={hobby} onUpdateExtra={onUpdateExtra} />
          </div>
        )}

        {/* ── Rock climbing section ── */}
        {(() => { const n = hobby.name.toLowerCase(); return n.includes("climb") || n.includes("bouldering") || n.includes("crag") || n.includes("sport climbing") || n.includes("trad climbing"); })() && (
          <div className="mt-4 border-t pt-4">
            <ClimbingSection hobby={hobby} onUpdateExtra={onUpdateExtra} />
          </div>
        )}

        {/* ── Running section ── */}
        {(() => { const n = hobby.name.toLowerCase(); return n === "running" || n.includes("running") || n.includes("marathon") || n.includes("trail run"); })() && (
          <div className="mt-4 border-t pt-4">
            <RunningSection hobby={hobby} onUpdateExtra={onUpdateExtra} />
          </div>
        )}

        {/* ── Surfing section ── */}
        {(() => { const n = hobby.name.toLowerCase(); return n === "surfing" || n.includes("surfing") || n.includes("surf") || n.includes("longboard") || n.includes("shortboard"); })() && (
          <div className="mt-4 border-t pt-4">
            <SurfingSection hobby={hobby} onUpdateExtra={onUpdateExtra} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Plans & Goals Tab ──────────────────────────────────────────────────────────

function PlansGoalsTab({
  hobbies,
  onUpdateHobby,
  onCreateSystemGoal,
}: {
  hobbies: Hobby[];
  onUpdateHobby: (id: number, extraJson: string) => void;
  onCreateSystemGoal?: (hobby: Hobby, plan: HobbyPlan) => void;
}) {
  const [planWizardOpen, setPlanWizardOpen] = useState(false);
  const [goalWizardOpen, setGoalWizardOpen] = useState(false);
  const [filterType, setFilterType] = useState<HobbyType | "all">("all");
  const [showCompletedPlans, setShowCompletedPlans] = useState(false);
  const [showCompletedGoals, setShowCompletedGoals] = useState(false);
  const [editingPlan, setEditingPlan] = useState<(HobbyPlan & { hobby: Hobby }) | null>(null);
  const [editingGoal, setEditingGoal] = useState<(HobbyGoal & { hobby: Hobby }) | null>(null);

  type FlatPlan = HobbyPlan & { hobby: Hobby };
  type FlatGoal = HobbyGoal & { hobby: Hobby };

  const allPlans: FlatPlan[] = useMemo(() =>
    hobbies.flatMap(h => parsePlans(h.extraJson ?? "{}").map(p => ({ ...p, hobby: h }))),
    [hobbies]);

  const allGoals: FlatGoal[] = useMemo(() =>
    hobbies.flatMap(h => parseGoals(h.extraJson ?? "{}").map(g => ({ ...g, hobby: h }))),
    [hobbies]);

  const activePlans = allPlans.filter(p => p.isActive && !p.completedAt);
  const inactivePlans = allPlans.filter(p => !p.isActive && !p.completedAt);
  const completedPlans = allPlans.filter(p => !!p.completedAt);
  const activeGoals = allGoals.filter(g => g.status === "active");
  const completedGoals = allGoals.filter(g => g.status === "completed");

  const filteredActivePlans = filterType === "all" ? activePlans : activePlans.filter(p => p.hobby.hobbyType === filterType);
  const filteredInactivePlans = filterType === "all" ? inactivePlans : inactivePlans.filter(p => p.hobby.hobbyType === filterType);
  const filteredActiveGoals = filterType === "all" ? activeGoals : activeGoals.filter(g => g.hobby.hobbyType === filterType);

  // ── Plan mutations ─────────────────────────────────────────────────────────
  function updatePlan(hobby: Hobby, updated: HobbyPlan) {
    const plans = parsePlans(hobby.extraJson ?? "{}").map(p => p.id === updated.id ? updated : p);
    onUpdateHobby(hobby.id, setPlansInExtra(hobby.extraJson ?? "{}", plans));
  }
  function savePlanEdit(updated: HobbyPlan & { hobby: Hobby }) {
    // Sync linked goal title/description/status alongside the plan edit
    const existingGoals = parseGoals(updated.hobby.extraJson ?? "{}");
    const syncedGoals = existingGoals.map(g =>
      g.linkedPlanId === updated.id
        ? { ...g, title: updated.title, description: updated.description, durationWeeks: updated.durationWeeks,
            status: updated.completedAt ? "completed" as const : updated.isActive ? "active" as const : g.status }
        : g
    );
    const newExtra = setPlansAndGoalsInExtra(
      updated.hobby.extraJson ?? "{}",
      parsePlans(updated.hobby.extraJson ?? "{}").map(p => p.id === updated.id ? updated : p),
      syncedGoals,
    );
    onUpdateHobby(updated.hobby.id, newExtra);
    setEditingPlan(null);
  }
  function saveGoalEdit(updated: HobbyGoal & { hobby: Hobby }) {
    updateGoal(updated.hobby, updated);
    setEditingGoal(null);
  }
  function deletePlan(hobby: Hobby, planId: string) {
    const plans = parsePlans(hobby.extraJson ?? "{}").filter(p => p.id !== planId);
    onUpdateHobby(hobby.id, setPlansInExtra(hobby.extraJson ?? "{}", plans));
  }
  function syncGoalStatus(hobby: Hobby, planId: string, planIsActive: boolean, planCompleted: boolean) {
    const goals = parseGoals(hobby.extraJson ?? "{}");
    return goals.map(g =>
      g.linkedPlanId === planId
        ? { ...g, status: planCompleted ? "completed" as const : planIsActive ? "active" as const : "paused" as const }
        : g
    );
  }
  function togglePlanActive(hobby: Hobby, planId: string) {
    const plans = parsePlans(hobby.extraJson ?? "{}");
    const plan = plans.find(p => p.id === planId);
    if (!plan) return;
    const nowActive = !plan.isActive;
    const updated = { ...plan, isActive: nowActive, startDate: (nowActive && !plan.startDate) ? new Date().toISOString().slice(0, 10) : plan.startDate };
    const syncedGoals = syncGoalStatus(hobby, planId, nowActive, false);
    onUpdateHobby(hobby.id, setPlansAndGoalsInExtra(hobby.extraJson ?? "{}", plans.map(p => p.id === planId ? updated : p), syncedGoals));
  }
  function togglePlanStep(hobby: Hobby, planId: string, stepId: string, done: boolean) {
    const plans = parsePlans(hobby.extraJson ?? "{}");
    const plan = plans.find(p => p.id === planId);
    if (!plan) return;
    const steps = plan.steps.map(s => s.id === stepId ? { ...s, done } : s);
    onUpdateHobby(hobby.id, setPlansInExtra(hobby.extraJson ?? "{}", plans.map(p => p.id === planId ? { ...p, steps } : p)));
  }
  function completePlan(hobby: Hobby, planId: string) {
    const plans = parsePlans(hobby.extraJson ?? "{}");
    const syncedGoals = syncGoalStatus(hobby, planId, false, true);
    onUpdateHobby(hobby.id, setPlansAndGoalsInExtra(hobby.extraJson ?? "{}", plans.map(p => p.id === planId ? { ...p, isActive: false, isPaused: false, completedAt: new Date().toISOString() } : p), syncedGoals));
  }
  function pausePlan(hobby: Hobby, planId: string) {
    const plans = parsePlans(hobby.extraJson ?? "{}");
    const syncedGoals = syncGoalStatus(hobby, planId, false, false);
    onUpdateHobby(hobby.id, setPlansAndGoalsInExtra(hobby.extraJson ?? "{}", plans.map(p => p.id === planId ? { ...p, isActive: false, isPaused: true } : p), syncedGoals));
  }
  function resumePlan(hobby: Hobby, planId: string) {
    const plans = parsePlans(hobby.extraJson ?? "{}");
    const syncedGoals = syncGoalStatus(hobby, planId, true, false);
    onUpdateHobby(hobby.id, setPlansAndGoalsInExtra(hobby.extraJson ?? "{}", plans.map(p => p.id === planId ? { ...p, isActive: true, isPaused: false } : p), syncedGoals));
  }
  function toggleMilestone(hobby: Hobby, planId: string, milestoneId: string, completed: boolean) {
    const plans = parsePlans(hobby.extraJson ?? "{}");
    onUpdateHobby(hobby.id, setPlansInExtra(hobby.extraJson ?? "{}", plans.map(p =>
      p.id === planId
        ? { ...p, milestones: (p.milestones ?? []).map(m => m.id === milestoneId ? { ...m, completedAt: completed ? new Date().toISOString() : undefined } : m) }
        : p
    )));
  }

  // ── Goal mutations ─────────────────────────────────────────────────────────
  function updateGoal(hobby: Hobby, updatedGoal: HobbyGoal) {
    const goals = parseGoals(hobby.extraJson ?? "{}").map(g => g.id === updatedGoal.id ? updatedGoal : g);
    onUpdateHobby(hobby.id, setGoalsInExtra(hobby.extraJson ?? "{}", goals));
  }
  function deleteGoal(hobby: Hobby, goalId: string) {
    const goals = parseGoals(hobby.extraJson ?? "{}").filter(g => g.id !== goalId);
    onUpdateHobby(hobby.id, setGoalsInExtra(hobby.extraJson ?? "{}", goals));
  }
  function completeGoal(hobby: Hobby, goalId: string) {
    const goals = parseGoals(hobby.extraJson ?? "{}").map(g => g.id === goalId ? { ...g, status: "completed" as const } : g);
    onUpdateHobby(hobby.id, setGoalsInExtra(hobby.extraJson ?? "{}", goals));
  }
  function toggleGoalStep(hobby: Hobby, goalId: string, stepId: string, done: boolean) {
    const goals = parseGoals(hobby.extraJson ?? "{}");
    const goal = goals.find(g => g.id === goalId);
    if (!goal) return;
    const steps = (goal.steps ?? []).map(s => s.id === stepId ? { ...s, done } : s);
    const allDone = steps.every(s => s.done);
    onUpdateHobby(hobby.id, setGoalsInExtra(hobby.extraJson ?? "{}", goals.map(g => g.id === goalId ? { ...g, steps, status: allDone ? "completed" as const : g.status } : g)));
  }
  function updateCount(hobby: Hobby, goalId: string, val: number) {
    const goals = parseGoals(hobby.extraJson ?? "{}").map(g => g.id === goalId ? { ...g, currentValue: val } : g);
    onUpdateHobby(hobby.id, setGoalsInExtra(hobby.extraJson ?? "{}", goals));
  }

  const typeFilterBar = (
    <div className="flex items-center gap-1 flex-wrap">
      <button onClick={() => setFilterType("all")} className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${filterType === "all" ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-secondary"}`}>All</button>
      {HOBBY_TYPES.map(t => (
        <button key={t.value} onClick={() => setFilterType(filterType === t.value ? "all" : t.value)}
          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${filterType === t.value ? "text-white border-transparent" : "border-border hover:bg-secondary text-muted-foreground"}`}
          style={filterType === t.value ? { backgroundColor: t.color } : {}}>
          {t.emoji} {t.label.split(" ")[0]}
        </button>
      ))}
    </div>
  );

  if (hobbies.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Target size={36} className="mx-auto mb-4 opacity-20" />
        <p className="font-medium text-sm">No hobbies yet</p>
        <p className="text-xs mt-1">Add a hobby first, then create plans and goals</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ── Type filter ── */}
      {typeFilterBar}

      {/* ══════════════════ GOALS SECTION (top) ══════════════════ */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <Target size={14} className="text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold">Goals</h2>
              <p className="text-xs text-muted-foreground">Outcome-focused targets — count, milestone, or frequency</p>
            </div>
            {activeGoals.length > 0 && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 ml-1">
                {activeGoals.length} active
              </span>
            )}
          </div>
          <Button size="sm" onClick={() => setGoalWizardOpen(true)} variant="outline" className="gap-1.5 border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30">
            <Plus size={12} /> New Goal
          </Button>
        </div>

        {allGoals.length === 0 && (
          <div className="text-center py-8 border-2 border-dashed rounded-xl text-muted-foreground">
            <Target size={28} className="mx-auto mb-2 opacity-20" />
            <p className="text-xs font-medium">No goals yet</p>
            <p className="text-xs mt-1 mb-3">Set a count, milestone, or frequency goal</p>
            <Button size="sm" variant="outline" onClick={() => setGoalWizardOpen(true)} className="gap-1.5">
              <Plus size={12} /> Create first goal
            </Button>
          </div>
        )}

        {filteredActiveGoals.length > 0 && (
          <div className="space-y-3">
            {filteredActiveGoals.map(g => {
              const ti = HOBBY_TYPE_MAP[g.hobby.hobbyType as HobbyType];
              return (
                <GoalCard key={g.id} goal={g} hobbyName={g.hobby.name} hobbyColor={ti?.color ?? "#888"}
                  onUpdateCount={(val) => updateCount(g.hobby, g.id, val)}
                  onToggleStep={(sid, done) => toggleGoalStep(g.hobby, g.id, sid, done)}
                  onComplete={() => completeGoal(g.hobby, g.id)}
                  onDelete={() => deleteGoal(g.hobby, g.id)}
                  onEdit={() => setEditingGoal(g)}
                />
              );
            })}
          </div>
        )}

        {filteredActiveGoals.length === 0 && allGoals.length > 0 && (
          <p className="text-center text-xs text-muted-foreground py-4">No active goals match this filter.</p>
        )}

        {completedGoals.length > 0 && (
          <details open={showCompletedGoals} onToggle={e => setShowCompletedGoals((e.target as HTMLDetailsElement).open)} className="group">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground list-none flex items-center gap-1 px-1 py-1">
              <ChevronRight size={11} className="group-open:rotate-90 transition-transform" />
              {completedGoals.length} completed goal{completedGoals.length !== 1 ? "s" : ""}
            </summary>
            <div className="space-y-2 mt-1">
              {completedGoals.map(g => {
                const ti = HOBBY_TYPE_MAP[g.hobby.hobbyType as HobbyType];
                return (
                  <GoalCard key={g.id} goal={g} hobbyName={g.hobby.name} hobbyColor={ti?.color ?? "#888"} onDelete={() => deleteGoal(g.hobby, g.id)} />
                );
              })}
            </div>
          </details>
        )}
      </section>

      {/* Divider */}
      <div className="h-px bg-border" />

      {/* ══════════════════ PLANS SECTION ══════════════════ */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <ClipboardList size={14} className="text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold">Plans</h2>
              <p className="text-xs text-muted-foreground">Create and organize structured plans for your hobbies</p>
            </div>
            {activePlans.length > 0 && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 ml-1">
                {activePlans.length} active
              </span>
            )}
          </div>
          <Button size="sm" onClick={() => setPlanWizardOpen(true)} variant="outline" className="gap-1.5 border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30">
            <Plus size={12} /> New Plan
          </Button>
        </div>

        {allPlans.length === 0 && (
          <div className="text-center py-8 border-2 border-dashed rounded-xl text-muted-foreground">
            <ClipboardList size={28} className="mx-auto mb-2 opacity-20" />
            <p className="text-xs font-medium">No plans yet</p>
            <p className="text-xs mt-1 mb-3">Build a step-by-step plan for a hobby</p>
            <Button size="sm" variant="outline" onClick={() => setPlanWizardOpen(true)} className="gap-1.5">
              <Plus size={12} /> Create first plan
            </Button>
          </div>
        )}

        {/* Active plans */}
        {filteredActivePlans.length > 0 && (
          <div className="space-y-3">
            {filteredActivePlans.map(p => {
              const ti = HOBBY_TYPE_MAP[p.hobby.hobbyType as HobbyType];
              return (
                <PlanCard key={p.id} plan={p} hobbyName={p.hobby.name} hobbyColor={ti?.color ?? "#888"}
                  onToggleStep={(sid, done) => togglePlanStep(p.hobby, p.id, sid, done)}
                  onToggleMilestone={(mid, done) => toggleMilestone(p.hobby, p.id, mid, done)}
                  onToggleActive={() => togglePlanActive(p.hobby, p.id)}
                  onPause={() => pausePlan(p.hobby, p.id)}
                  onComplete={() => completePlan(p.hobby, p.id)}
                  onDelete={() => deletePlan(p.hobby, p.id)}
                  onEdit={() => setEditingPlan(p)}
                />
              );
            })}
          </div>
        )}

        {/* Paused plans */}
        {filteredInactivePlans.filter(p => p.isPaused).length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 flex items-center gap-1.5">
              ⏸ Paused
            </p>
            {filteredInactivePlans.filter(p => p.isPaused).map(p => {
              const ti = HOBBY_TYPE_MAP[p.hobby.hobbyType as HobbyType];
              return (
                <PlanCard key={p.id} plan={p} hobbyName={p.hobby.name} hobbyColor={ti?.color ?? "#888"}
                  onToggleStep={(sid, done) => togglePlanStep(p.hobby, p.id, sid, done)}
                  onToggleMilestone={(mid, done) => toggleMilestone(p.hobby, p.id, mid, done)}
                  onToggleActive={() => togglePlanActive(p.hobby, p.id)}
                  onResume={() => resumePlan(p.hobby, p.id)}
                  onComplete={() => completePlan(p.hobby, p.id)}
                  onDelete={() => deletePlan(p.hobby, p.id)}
                  onEdit={() => setEditingPlan(p)}
                />
              );
            })}
          </div>
        )}

        {/* Inactive plans (not paused) */}
        {filteredInactivePlans.filter(p => !p.isPaused).length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">Inactive</p>
            {filteredInactivePlans.filter(p => !p.isPaused).map(p => {
              const ti = HOBBY_TYPE_MAP[p.hobby.hobbyType as HobbyType];
              return (
                <PlanCard key={p.id} plan={p} hobbyName={p.hobby.name} hobbyColor={ti?.color ?? "#888"}
                  onToggleStep={(sid, done) => togglePlanStep(p.hobby, p.id, sid, done)}
                  onToggleMilestone={(mid, done) => toggleMilestone(p.hobby, p.id, mid, done)}
                  onToggleActive={() => togglePlanActive(p.hobby, p.id)}
                  onComplete={() => completePlan(p.hobby, p.id)}
                  onDelete={() => deletePlan(p.hobby, p.id)}
                  onEdit={() => setEditingPlan(p)}
                />
              );
            })}
          </div>
        )}

        {/* Completed plans */}
        {completedPlans.length > 0 && (
          <details open={showCompletedPlans} onToggle={e => setShowCompletedPlans((e.target as HTMLDetailsElement).open)} className="group">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground list-none flex items-center gap-1 px-1 py-1">
              <ChevronRight size={11} className="group-open:rotate-90 transition-transform" />
              {completedPlans.length} completed plan{completedPlans.length !== 1 ? "s" : ""}
            </summary>
            <div className="space-y-2 mt-1">
              {completedPlans.map(p => {
                const ti = HOBBY_TYPE_MAP[p.hobby.hobbyType as HobbyType];
                return (
                  <PlanCard key={p.id} plan={p} hobbyName={p.hobby.name} hobbyColor={ti?.color ?? "#888"}
                    onDelete={() => deletePlan(p.hobby, p.id)}
                  />
                );
              })}
            </div>
          </details>
        )}
      </section>

      {/* Wizards */}
      <PlanWizard
        open={planWizardOpen}
        onClose={() => setPlanWizardOpen(false)}
        hobbies={hobbies.filter(h => h.status !== "retired")}
        onSave={(hobbyId, plan) => {
          const hobby = hobbies.find(h => h.id === hobbyId);
          if (!hobby) return;
          const existingPlans = parsePlans(hobby.extraJson ?? "{}");
          const existingGoals = parseGoals(hobby.extraJson ?? "{}");
          // Auto-generate a milestone goal that mirrors this plan's objective
          const autoGoal: HobbyGoal = {
            id: genId(),
            title: plan.title,
            description: plan.description || undefined,
            goalType: "milestone",
            durationWeeks: plan.durationWeeks,
            status: plan.isActive ? "active" : "paused",
            createdAt: plan.createdAt,
            linkedPlanId: plan.id,
          };
          const newExtra = setPlansAndGoalsInExtra(
            hobby.extraJson ?? "{}",
            [...existingPlans, plan],
            [...existingGoals, autoGoal],
          );
          onUpdateHobby(hobbyId, newExtra);
          if (isLanguageLearningHobby(hobby)) onCreateSystemGoal?.(hobby, plan);
        }}
      />
      <GoalWizard
        open={goalWizardOpen}
        onClose={() => setGoalWizardOpen(false)}
        hobbies={hobbies.filter(h => h.status !== "retired")}
        onSave={(hobbyId, goal) => {
          const hobby = hobbies.find(h => h.id === hobbyId);
          if (!hobby) return;
          onUpdateHobby(hobbyId, setGoalsInExtra(hobby.extraJson ?? "{}", [...parseGoals(hobby.extraJson ?? "{}"), goal]));
        }}
      />

      {/* Edit dialogs */}
      <PlanEditDialog
        plan={editingPlan}
        open={!!editingPlan}
        onClose={() => setEditingPlan(null)}
        onSave={updated => savePlanEdit({ ...updated, hobby: editingPlan!.hobby })}
      />
      <GoalEditDialog
        goal={editingGoal}
        open={!!editingGoal}
        onClose={() => setEditingGoal(null)}
        onSave={updated => saveGoalEdit({ ...updated, hobby: editingGoal!.hobby })}
      />
    </div>
  );
}

// ── Helper: pick template list based on hobby name + type ─────────────────────
function getPlanTemplatesForHobby(hobbyType: HobbyType, hobbyName: string): PlanTemplate[] {
  const n = hobbyName.toLowerCase();
  if (n.includes("hiking"))                                                                      return HIKING_PLAN_TEMPLATES;
  if (n.includes("cycling") || n.includes("cycle") || n.includes("bike") || n.includes("mtb")) return CYCLING_PLAN_TEMPLATES;
  if (n.includes("fishing") || n.includes("angling"))                                           return FISHING_PLAN_TEMPLATES;
  if (n.includes("garden") || n.includes("gardening"))                                          return GARDENING_PLAN_TEMPLATES;
  if (n.includes("climb") || n.includes("bouldering"))                                          return CLIMBING_PLAN_TEMPLATES;
  if (n.includes("running") || n.includes("marathon") || n.includes("5k") || n.includes("10k")) return RUNNING_PLAN_TEMPLATES;
  if (n.includes("surfing") || n.includes("surf"))                                              return SURFING_PLAN_TEMPLATES;
  if (n.includes("chess"))                                                                       return CHESS_PLAN_TEMPLATES;
  if (n.includes("poker"))                                                                       return POKER_PLAN_TEMPLATES;
  if (n.includes("bird") || n.includes("birding"))                                              return BIRD_PLAN_TEMPLATES;
  if (isLanguageLearningHobby({ name: hobbyName } as any))                                      return LANGUAGE_PLAN_TEMPLATES;
  if (hobbyType === "performance")                                                               return INSTRUMENT_PLAN_TEMPLATES;
  return PLAN_TEMPLATES[hobbyType] ?? [];
}

// ── Add/Edit Hobby Form Dialog ─────────────────────────────────────────────────

export const EMPTY_FORM: Partial<InsertHobby> = {
  name: "", hobbyType: "creative", category: "", description: "",
  skillLevel: "beginner", dateStarted: "", status: "active", notes: "", extraJson: "{}", isFavorite: false, coverUrl: "",
};

// ── Simplified 3-step Add Hobby wizard ───────────────────────────────────────

export function HobbyFormDialog({ open, onClose, initial, onSave, onSaveAndPlan, isEdit = false, titleOverride, onBack }: {
  open: boolean; onClose: () => void; initial: Partial<InsertHobby>;
  onSave: (data: Partial<InsertHobby>) => void;
  onSaveAndPlan?: (data: Partial<InsertHobby>) => void;
  isEdit?: boolean;
  titleOverride?: string;
  onBack?: () => void;
}) {
  const [step, setStep] = useState(isEdit ? 3 : 1); // edit mode = jump to full form
  const [form, setForm] = useState<Partial<InsertHobby>>(initial);
  const [extra, setExtra] = useState<Record<string, any>>(() => parseExtra(initial.extraJson ?? "{}"));
  const [showPresets, setShowPresets] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Inline plan state (new hobby only)
  const [showAddPlan, setShowAddPlan] = useState(false);
  const [selectedPlanTemplate, setSelectedPlanTemplate] = useState<PlanTemplate | null>(null);
  const [planTitle, setPlanTitle] = useState("");
  const [planWeeks, setPlanWeeks] = useState("");
  const [planDaysPerWeek, setPlanDaysPerWeek] = useState(3);
  const [planMins, setPlanMins] = useState("");
  const set = (key: keyof InsertHobby, val: any) => setForm(f => ({ ...f, [key]: val }));
  const setExtraKey = (key: string, val: any) => setExtra(e => ({ ...e, [key]: val }));

  // Reset when modal opens
  useMemo(() => {
    if (open) {
      setStep(isEdit ? 3 : 1);
      setForm(initial);
      setExtra(parseExtra(initial.extraJson ?? "{}"));
      setShowPresets(false);
      setShowAdvanced(false);
      setShowAddPlan(false);
      setSelectedPlanTemplate(null);
      setPlanTitle("");
      setPlanWeeks("");
      setPlanDaysPerWeek(3);
      setPlanMins("");
    }
  }, [open]);

  const handleSave = () => {
    if (!form.name?.trim()) return;
    let extraJson = JSON.stringify({ ...extra, ...parseExtra(initial.extraJson ?? "{}"), ...extra });
    if (!isEdit && showAddPlan && (planTitle.trim() || selectedPlanTemplate)) {
      const tmpl = selectedPlanTemplate;
      const title = planTitle.trim() || tmpl?.label || form.name!;
      const weeks  = planWeeks ? parseInt(planWeeks) || undefined : tmpl?.durationWeeks ?? undefined;
      const mins   = planMins  ? parseInt(planMins)  || undefined : undefined;
      const days   = SPREAD_PATTERNS[Math.min(planDaysPerWeek, 7)] ?? ["Mon", "Wed", "Fri"];
      const newPlan: HobbyPlan = {
        id: genId(), title,
        description: tmpl?.description ?? undefined,
        durationWeeks: weeks, minutesPerSession: mins,
        commitmentDaysPerWeek: planDaysPerWeek, scheduleDays: days,
        isActive: true, startDate: new Date().toISOString().slice(0, 10),
        steps: (tmpl?.defaultSteps ?? []).map(text => ({ id: genId(), text, done: false })),
        sessions: [], createdAt: new Date().toISOString(),
      };
      extraJson = setPlansInExtra(extraJson, [newPlan]);
    }
    onSave({ ...form, extraJson });
  };

  const typeInfo = HOBBY_TYPE_MAP[(form.hobbyType as HobbyType) ?? "creative"];
  const presets = PRESET_HOBBIES[(form.hobbyType as HobbyType) ?? "creative"] ?? [];
  const canProceed1 = !!form.name?.trim();

  // Step indicators
  const StepDots = () => (
    !isEdit ? (
      <div className="flex items-center justify-center gap-1.5 pb-1">
        {[1, 2, 3].map(s => (
          <div key={s} className={`rounded-full transition-all ${s === step ? "w-5 h-1.5 bg-primary" : s < step ? "w-1.5 h-1.5 bg-primary/50" : "w-1.5 h-1.5 bg-muted-foreground/20"}`} />
        ))}
      </div>
    ) : null
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{titleOverride ?? (isEdit ? "Edit Hobby" : "Add a Hobby")}</DialogTitle>
          <StepDots />
        </DialogHeader>

        {/* ── Step 1: Type + Name ── */}
        {step === 1 && (
          <div className="space-y-4 mt-1">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-2 block">What kind of hobby?</label>
              <div className="grid grid-cols-3 gap-2">
                {HOBBY_TYPES.map(t => {
                  const Icon = t.icon; const selected = form.hobbyType === t.value;
                  return (
                    <button key={t.value} type="button" onClick={() => { set("hobbyType", t.value); set("category", ""); }}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-medium transition-all ${selected ? "border-2" : "border hover:border-muted-foreground/50 text-muted-foreground"}`}
                      style={selected ? { borderColor: t.color, backgroundColor: t.color + "18", color: t.color } : {}}>
                      <span className="text-xl">{t.emoji}</span>
                      <span className="leading-tight text-center">{t.label.split(" ")[0]}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Hobby name *</label>
              <div className="flex gap-2">
                <Input
                  className="text-sm flex-1"
                  placeholder={`e.g. ${presets[0] ?? "Photography"}`}
                  value={form.name ?? ""}
                  onChange={e => set("name", e.target.value)}
                  onKeyDown={e => e.key === "Enter" && canProceed1 && setStep(2)}
                  autoFocus
                />
                <button type="button" onClick={() => setShowPresets(p => !p)}
                  className="px-2.5 py-2 rounded-lg border text-xs text-muted-foreground hover:bg-muted transition-colors flex items-center gap-1">
                  <Layers size={13} />
                </button>
              </div>
              {showPresets && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {presets.map(p => (
                    <button key={p} type="button"
                      onClick={() => { set("name", p); set("category", p); setShowPresets(false); }}
                      className="text-xs px-2.5 py-1 rounded-full border hover:bg-muted transition-colors">{p}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={onBack ?? onClose} className="flex-1">{onBack ? <><ChevronLeft size={13} className="mr-1" />Back</> : "Cancel"}</Button>
              <Button size="sm" onClick={() => setStep(2)} disabled={!canProceed1} className="flex-1">
                Next <ChevronRight size={13} className="ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 2: Skill level + Status ── */}
        {step === 2 && (
          <div className="space-y-4 mt-1">
            <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/40">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white" style={{ backgroundColor: typeInfo?.color }}>
                {typeInfo && <typeInfo.icon size={15} />}
              </div>
              <span className="font-semibold text-sm">{form.name}</span>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-2 block">Your current skill level</label>
              <div className="grid grid-cols-2 gap-2">
                {SKILL_LEVELS.map(s => (
                  <button key={s.value} type="button" onClick={() => set("skillLevel", s.value)}
                    className={`p-3 rounded-xl border text-sm font-medium transition-all text-left ${form.skillLevel === s.value ? "border-primary bg-primary/5 text-primary" : "border-border hover:bg-muted"}`}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-2 block">Status</label>
              <div className="flex gap-2">
                {STATUS_OPTIONS.map(s => (
                  <button key={s.value} type="button" onClick={() => set("status", s.value)}
                    className={`flex-1 py-2 rounded-xl border text-xs font-medium transition-all ${form.status === s.value ? "border-primary bg-primary/5 text-primary" : "border-border hover:bg-muted text-muted-foreground"}`}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setStep(1)} className="flex-1">
                <ChevronLeft size={13} className="mr-1" /> Back
              </Button>
              <Button size="sm" onClick={() => setStep(3)} className="flex-1">
                Next <ChevronRight size={13} className="ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 3: Confirm + Advanced (optional) ── */}
        {step === 3 && (
          <div className="space-y-4 mt-1">
            {/* Identity summary */}
            {!isEdit && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/40">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0" style={{ backgroundColor: typeInfo?.color }}>
                  {typeInfo && <typeInfo.icon size={18} />}
                </div>
                <div>
                  <p className="font-semibold text-sm">{form.name}</p>
                  <p className="text-xs text-muted-foreground">{typeInfo?.label} · {SKILL_MAP[form.skillLevel ?? "beginner"]?.label}</p>
                </div>
              </div>
            )}

            {/* Sub-type */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Sub-type or focus area <span className="text-muted-foreground/60">(optional)</span></label>
              <Input className="text-sm" placeholder="e.g. Landscape Photography, Fly Fishing, Spanish…" value={form.category ?? ""} onChange={e => set("category", e.target.value)} />
            </div>

            {/* Quick note */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Quick note <span className="text-muted-foreground/60">(optional)</span></label>
              <Textarea className="text-sm min-h-[60px]" placeholder="Why you love this, what you're working toward…" value={form.notes ?? ""} onChange={e => set("notes", e.target.value)} />
            </div>

            {/* Advanced options — collapsed by default */}
            <button type="button" onClick={() => setShowAdvanced(a => !a)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full">
              {showAdvanced ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              Advanced options
            </button>

            {showAdvanced && (
              <div className="space-y-3 rounded-xl border bg-muted/20 p-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Date started</label>
                  <Input type="date" className="text-sm" value={form.dateStarted ?? ""} onChange={e => set("dateStarted", e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Cover photo URL</label>
                  <Input className="text-sm" placeholder="https://…" value={form.coverUrl ?? ""} onChange={e => set("coverUrl", e.target.value)} />
                </div>
                {isEdit && (
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <p className="text-xs font-semibold mb-3 flex items-center gap-1.5" style={{ color: typeInfo?.color }}>
                      {typeInfo && <typeInfo.icon size={13} />}{typeInfo?.label} Details
                    </p>
                    <ExtraFields hobbyType={(form.hobbyType as HobbyType) ?? "creative"} extra={extra} onChange={setExtraKey} />
                  </div>
                )}
                <button type="button" onClick={() => set("isFavorite", !form.isFavorite)}
                  className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg border transition-colors w-full ${form.isFavorite ? "bg-pink-50 dark:bg-pink-950/20 border-pink-200 text-pink-600" : "hover:bg-muted"}`}>
                  <Heart size={14} className={form.isFavorite ? "fill-pink-500 text-pink-500" : ""} />
                  {form.isFavorite ? "Marked as favorite" : "Add to favorites"}
                </button>
              </div>
            )}

            {/* Add a plan button (non-edit only) */}
            {!isEdit && onSaveAndPlan && (
              <button
                type="button"
                disabled={!form.name?.trim()}
                onClick={() => onSaveAndPlan({ ...form, extraJson: JSON.stringify({ ...extra, ...parseExtra(initial.extraJson ?? "{}"), ...extra }) })}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border hover:bg-muted/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-2 text-sm font-medium">
                  <ClipboardList size={14} className="text-primary shrink-0" />
                  Add a plan
                  <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                </div>
                <ChevronRight size={14} className="text-muted-foreground" />
              </button>
            )}

            <div className="flex gap-2 pt-1">
              {!isEdit && (
                <Button variant="outline" size="sm" onClick={() => setStep(2)} className="flex-1">
                  <ChevronLeft size={13} className="mr-1" /> Back
                </Button>
              )}
              {isEdit && (
                <Button variant="outline" size="sm" onClick={onBack ?? onClose} className="flex-1">{onBack ? <><ChevronLeft size={13} className="mr-1" />Back</> : "Cancel"}</Button>
              )}
              <Button size="sm" onClick={handleSave} disabled={!form.name?.trim()} className="flex-1">
                {isEdit ? "Save Changes" : "Add Hobby"}
              </Button>
            </div>
          </div>
        )}

      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function HobbiesPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<"library" | "plans" | "schedule">("library");

  const { data: hobbies = [], isLoading } = useQuery<Hobby[]>({
    queryKey: ["/api/hobbies"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/hobbies"); return r.json(); },
  });

  const createMut = useMutation({
    mutationFn: async (data: Partial<InsertHobby>) => { const r = await apiRequest("POST", "/api/hobbies", data); return r.json() as Promise<Hobby>; },
    onSuccess: (created) => { qc.setQueryData<Hobby[]>(["/api/hobbies"], (old = []) => [...old, created]); },
  });
  const updateMut = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<InsertHobby> }) => { const r = await apiRequest("PATCH", `/api/hobbies/${id}`, data); return r.json() as Promise<Hobby>; },
    onSuccess: (updated) => { qc.setQueryData<Hobby[]>(["/api/hobbies"], (old = []) => old.map(h => h.id === updated.id ? updated : h)); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/hobbies/${id}`),
    onSuccess: (_, id) => { qc.setQueryData<Hobby[]>(["/api/hobbies"], (old = []) => old.filter(h => h.id !== id)); },
  });

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<HobbyType | "all">("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showForm, setShowForm] = useState(false);
  const [formTitleOverride, setFormTitleOverride] = useState<string | undefined>(undefined);
  const [editHobby, setEditHobby] = useState<Hobby | null>(null);
  const [detailHobby, setDetailHobby] = useState<Hobby | null>(null);
  const [formInitial, setFormInitial] = useState<Partial<InsertHobby>>(EMPTY_FORM);
  const [formKey, setFormKey] = useState(0);
  const [planWizardOpen, setPlanWizardOpen] = useState(false);
  const [planWizardDefaultHobbyId, setPlanWizardDefaultHobbyId] = useState<number | undefined>(undefined);

  const filtered = useMemo(() => {
    return hobbies.filter(h => {
      if (filterType !== "all" && h.hobbyType !== filterType) return false;
      if (filterStatus !== "all" && h.status !== filterStatus) return false;
      if (search) { const q = search.toLowerCase(); if (!h.name.toLowerCase().includes(q) && !(h.category ?? "").toLowerCase().includes(q) && !(h.description ?? "").toLowerCase().includes(q)) return false; }
      return true;
    });
  }, [hobbies, filterType, filterStatus, search]);

  const openAdd = (type?: HobbyType) => { setFormInitial({ ...EMPTY_FORM, hobbyType: type ?? "creative" }); setEditHobby(null); setFormKey(k => k + 1); setShowForm(true); };

  // Auto-open add hobby dialog if navigated here with ?addHobby=1
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("addHobby") === "1") {
      setFormTitleOverride("Select a Skill");
      openAdd();
      const url = new URL(window.location.href);
      url.searchParams.delete("addHobby");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);
  const openEdit = (h: Hobby) => {
    setFormInitial({ name: h.name, hobbyType: h.hobbyType as HobbyType, category: h.category ?? "", description: h.description ?? "", skillLevel: h.skillLevel, dateStarted: h.dateStarted ?? "", status: h.status, notes: h.notes ?? "", extraJson: h.extraJson ?? "{}", isFavorite: h.isFavorite, coverUrl: h.coverUrl ?? "" });
    setEditHobby(h); setFormKey(k => k + 1); setShowForm(true);
  };

  const handleSave = async (data: Partial<InsertHobby>) => {
    try {
      if (editHobby) { await updateMut.mutateAsync({ id: editHobby.id, data }); toast({ title: "Hobby updated" }); }
      else { await createMut.mutateAsync(data); toast({ title: "Hobby added!" }); }
      setShowForm(false); setEditHobby(null);
    } catch { toast({ title: "Something went wrong", variant: "destructive" }); }
  };

  // Save hobby first, then open PlanWizard pre-seeded with the new hobby
  const handleSaveAndPlan = async (data: Partial<InsertHobby>) => {
    try {
      const created = await createMut.mutateAsync(data);
      setShowForm(false); setEditHobby(null);
      setPlanWizardDefaultHobbyId(created.id);
      setPlanWizardOpen(true);
    } catch { toast({ title: "Something went wrong", variant: "destructive" }); }
  };

  const handleDelete = async (h: Hobby) => {
    try { await deleteMut.mutateAsync(h.id); toast({ title: "Hobby removed" }); }
    catch { toast({ title: "Error deleting hobby", variant: "destructive" }); }
  };

  const handleToggleFavorite = async (h: Hobby) => { await updateMut.mutateAsync({ id: h.id, data: { isFavorite: !h.isFavorite } }); };

  // ── Create a real Goal in the Goals section when a Language Learning plan is saved ──
  const createSystemGoalFromPlan = async (hobby: Hobby, plan: HobbyPlan) => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const startDate = plan.startDate || today;
      let targetDate: string | undefined;
      if (plan.durationWeeks) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + plan.durationWeeks * 7);
        targetDate = d.toISOString().slice(0, 10);
      }
      await apiRequest("POST", "/api/goals", {
        title: plan.title,
        description: plan.description || `Language learning plan for ${hobby.name}`,
        category: "learning",
        progressType: "percent",
        progressCurrent: 0,
        progressTarget: 100,
        priority: "medium",
        startDate,
        targetDate,
        recurring: "none",
      });
      qc.invalidateQueries({ queryKey: ["/api/goals"] });
      toast({ title: "🗺️ Goal created!", description: `"${plan.title}" added to your Goals` });
    } catch {
      // non-fatal — don't block the plan save
      console.warn("[createSystemGoalFromPlan] goal creation failed");
    }
  };

  const handleUpdateGoals = async (hobby: Hobby, goals: HobbyGoal[]) => {
    const newExtraJson = setGoalsInExtra(hobby.extraJson ?? "{}", goals);
    await updateMut.mutateAsync({ id: hobby.id, data: { extraJson: newExtraJson } });
    if (detailHobby?.id === hobby.id) setDetailHobby(h => h ? { ...h, extraJson: newExtraJson } : h);
  };

  const handleUpdatePlans = async (hobby: Hobby, plans: HobbyPlan[]) => {
    const newExtraJson = setPlansInExtra(hobby.extraJson ?? "{}", plans);
    await updateMut.mutateAsync({ id: hobby.id, data: { extraJson: newExtraJson } });
    if (detailHobby?.id === hobby.id) setDetailHobby(h => h ? { ...h, extraJson: newExtraJson } : h);
  };

  const handleSavePlan = (hobbyId: number, plan: HobbyPlan) => {
    const hobby = hobbies.find(h => h.id === hobbyId);
    if (!hobby) return;
    const existingPlans = parsePlans(hobby.extraJson ?? "{}");
    const existingGoals = parseGoals(hobby.extraJson ?? "{}");
    const autoGoal: HobbyGoal = {
      id: genId(), title: plan.title, description: plan.description || undefined,
      goalType: "milestone", durationWeeks: plan.durationWeeks,
      status: plan.isActive ? "active" : "paused", createdAt: plan.createdAt, linkedPlanId: plan.id,
    };
    const newExtra = setPlansAndGoalsInExtra(hobby.extraJson ?? "{}", [...existingPlans, plan], [...existingGoals, autoGoal]);
    handleUpdateHobbyExtra(hobbyId, newExtra);
    if (isLanguageLearningHobby(hobby)) createSystemGoalFromPlan(hobby, plan);
  };

  const handleUpdateHobbyExtra = async (hobbyId: number, extraJson: string) => {
    await updateMut.mutateAsync({ id: hobbyId, data: { extraJson } });
    // Keep detailHobby in sync so BirdSection/HikingSection re-render with the new data immediately
    if (detailHobby?.id === hobbyId) setDetailHobby(h => h ? { ...h, extraJson } : h);
  };

  const counts = useMemo(() => { const c: Record<string, number> = {}; for (const h of hobbies) c[h.hobbyType] = (c[h.hobbyType] ?? 0) + 1; return c; }, [hobbies]);
  const activeGoalCount = useMemo(() => hobbies.reduce((sum, h) => sum + parseGoals(h.extraJson ?? "{}").filter(g => g.status === "active").length, 0), [hobbies]);
  const activePlanCount = useMemo(() => hobbies.reduce((sum, h) => sum + parsePlans(h.extraJson ?? "{}").filter(p => p.isActive && !p.completedAt).length, 0), [hobbies]);
  const managedPlanCount = useMemo(() => hobbies.reduce((sum, h) => sum + parsePlans(h.extraJson ?? "{}").filter(p => !p.completedAt).length, 0), [hobbies]);
  const activeCount = hobbies.filter(h => h.status === "active").length;
  const favCount = hobbies.filter(h => h.isFavorite).length;

  // Backfill: ensure every plan has a linked goal (handles data created before auto-goal was added)
  useEffect(() => {
    if (isLoading || hobbies.length === 0) return;
    const updates: { id: number; extraJson: string }[] = [];
    for (const hobby of hobbies) {
      const backfilled = backfillGoalsForPlans(hobby.extraJson ?? "{}");
      if (backfilled !== null) updates.push({ id: hobby.id, extraJson: backfilled });
    }
    if (updates.length === 0) return;
    // Fire-and-forget: write each hobby that needed backfilling
    Promise.all(updates.map(u => updateMut.mutateAsync({ id: u.id, data: { extraJson: u.extraJson } })))
      .catch(() => {}); // non-fatal
  }, [isLoading]); // runs once after data loads

  return (
    <PageShell
      title="Hobbies"
      subtitle={[
        `${hobbies.length} ${hobbies.length === 1 ? "hobby" : "hobbies"}`,
        activeCount > 0 && `${activeCount} active`,
        activePlanCount > 0 && `${activePlanCount} active plan${activePlanCount !== 1 ? "s" : ""}`,
      ].filter(Boolean).join(" · ")}
      action={
        activeTab === "library" ? (
          <Button size="sm" onClick={() => openAdd()}>
            <Plus size={15} className="mr-1.5" /> Add Hobby
          </Button>
        ) : activeTab === "plans" ? (
          <Button size="sm" onClick={() => setPlanWizardOpen(true)} disabled={hobbies.length === 0}>
            <Plus size={15} className="mr-1.5" /> Add Plan
          </Button>
        ) : undefined
      }
      controls={
        <div className="flex items-center gap-1 bg-secondary rounded-lg p-1 w-fit">
          <button onClick={() => setActiveTab("library")}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === "library" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            <Heart size={13} /> Library
            {hobbies.length > 0 && <span className="text-xs opacity-60">{hobbies.length}</span>}
          </button>
          <button onClick={() => setActiveTab("plans")}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === "plans" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            <Target size={13} /> Planning
            {(activePlanCount + activeGoalCount) > 0 && <span className="text-xs opacity-60">{activePlanCount + activeGoalCount}</span>}
          </button>
          <button onClick={() => setActiveTab("schedule")}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === "schedule" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            <CalendarClock size={13} /> Schedule
            {activePlanCount > 0 && <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${activeTab === "schedule" ? "bg-primary/15 text-primary" : "opacity-60"}`}>{activePlanCount}</span>}
          </button>
        </div>
      }
    >

      {/* ── Planning tab ── */}
      {activeTab === "plans" && (
        <div className="space-y-4">
          {/* Empty state — no hobbies yet */}
          {hobbies.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <ClipboardList size={36} className="mx-auto mb-4 opacity-20" />
              <p className="font-medium text-sm">No hobbies yet</p>
              <p className="text-xs mt-1">Add a hobby from the Library tab first</p>
            </div>
          )}

          {/* Empty state — hobbies exist but no plans */}
          {hobbies.length > 0 && managedPlanCount === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <ClipboardList size={36} className="mx-auto mb-4 opacity-20" />
              <p className="font-medium text-sm">No plans yet</p>
              <p className="text-xs mt-1 mb-4">Create a plan to start tracking your sessions</p>
              <Button size="sm" variant="outline" onClick={() => setPlanWizardOpen(true)}>
                <Plus size={14} className="mr-1.5" /> Create your first plan
              </Button>
            </div>
          )}

          {/* Plan execution cards */}
          {managedPlanCount > 0 && (
            <HobbyActivePlanSection hobbies={hobbies} onUpdateHobby={handleUpdateHobbyExtra} onGoToPlans={() => {}} hideWeeklySchedule />
          )}
        </div>
      )}

      {/* ── Schedule tab ── */}
      {activeTab === "schedule" && (
        <ScheduleTab hobbies={hobbies} onUpdateHobby={handleUpdateHobbyExtra} />
      )}

      {/* ── Library tab ── */}
      {activeTab === "library" && (
        <>
          {/* Category filter pills */}
          {hobbies.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setFilterType("all")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${filterType === "all" ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"}`}
              >
                All
                <span className="opacity-70">{hobbies.length}</span>
              </button>
              {HOBBY_TYPES.map(t => {
                const cnt = counts[t.value] ?? 0;
                if (cnt === 0) return null;
                const isActive = filterType === t.value;
                return (
                  <button key={t.value}
                    onClick={() => setFilterType(isActive ? "all" : t.value)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all`}
                    style={isActive
                      ? { backgroundColor: t.color, borderColor: t.color, color: "#fff" }
                      : { borderColor: t.color + "44", color: t.color }}>
                    <span>{t.emoji}</span>
                    {t.label.split(" ")[0]}
                    <span className="opacity-70">{cnt}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Search + status filter */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-8 text-sm" placeholder="Search hobbies…" value={search} onChange={e => setSearch(e.target.value)} />
              {search && <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setSearch("")}><X size={13} className="text-muted-foreground" /></button>}
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full sm:w-36 text-sm"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {(filterType !== "all" || filterStatus !== "all" || search) && (
              <Button variant="ghost" size="sm" onClick={() => { setFilterType("all"); setFilterStatus("all"); setSearch(""); }}>Clear</Button>
            )}
          </div>

          {/* Empty state */}
          {!isLoading && hobbies.length === 0 && (
            <div className="text-center py-16">
              <div className="text-5xl mb-4">🎯</div>
              <h2 className="text-lg font-semibold mb-1">What do you love to do?</h2>
              <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">Track your hobbies, skills, and passions in one place.</p>
              <div className="flex flex-wrap gap-2 justify-center mb-6">
                {HOBBY_TYPES.map(t => (<button key={t.value} onClick={() => openAdd(t.value)} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-full border hover:bg-muted transition-colors"><span>{t.emoji}</span> {t.label}</button>))}
              </div>
              <Button onClick={() => openAdd()}><Plus size={15} className="mr-1.5" /> Add Your First Hobby</Button>
            </div>
          )}

          {/* No results */}
          {!isLoading && hobbies.length > 0 && filtered.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <p className="mb-2">No hobbies match your filters.</p>
              <Button variant="ghost" size="sm" onClick={() => { setFilterType("all"); setFilterStatus("all"); setSearch(""); }}>Clear filters</Button>
            </div>
          )}

          {/* Flat grid */}
          {filtered.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered.map(h => (
                <HobbyCard key={h.id} hobby={h}
                  onEdit={() => openEdit(h)} onDelete={() => handleDelete(h)}
                  onToggleFavorite={() => handleToggleFavorite(h)}
                  onClick={() => navigate(`/hobbies/${h.id}`)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Dialogs */}
      <PlanWizard
        open={planWizardOpen}
        onClose={() => { setPlanWizardOpen(false); setPlanWizardDefaultHobbyId(undefined); }}
        hobbies={hobbies.filter(h => h.status !== "retired")}
        defaultHobbyId={planWizardDefaultHobbyId}
        skipHobbyPicker={!!planWizardDefaultHobbyId}
        onSave={handleSavePlan}
      />
      <HobbyFormDialog key={formKey} open={showForm} onClose={() => { setShowForm(false); setEditHobby(null); setFormTitleOverride(undefined); }} initial={formInitial} onSave={handleSave} onSaveAndPlan={handleSaveAndPlan} isEdit={!!editHobby} titleOverride={editHobby ? undefined : formTitleOverride} />

      <HobbyDetailDialog
        hobby={detailHobby}
        open={!!detailHobby}
        onClose={() => setDetailHobby(null)}
        onEdit={() => { if (detailHobby) { setDetailHobby(null); openEdit(detailHobby); } }}
        onUpdateGoals={(goals) => { if (detailHobby) handleUpdateGoals(detailHobby, goals); }}
        onUpdatePlans={(plans) => { if (detailHobby) handleUpdatePlans(detailHobby, plans); }}
        onUpdateExtra={(newJson) => { if (detailHobby) handleUpdateHobbyExtra(detailHobby.id, newJson); }}
        onCreateSystemGoal={createSystemGoalFromPlan}
      />
    </PageShell>
  );
}
