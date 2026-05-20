import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Hobby, InsertHobby } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Pencil, Trash2, Search, Heart, Star,
  Camera, Palette, Mountain, Gamepad2, Cpu, Mic2,
  Archive, Trees, BookOpen, Music2, ChevronDown, ChevronUp,
  Layers, X, ImagePlus, Target, CheckCircle2, Circle, Calendar,
  TrendingUp, Flag, ListChecks, ChevronRight, ChevronLeft,
  Trophy, Flame, BarChart3, RefreshCw, Check, Zap, Power, PowerOff, ClipboardList,
} from "lucide-react";
import { format, parseISO } from "date-fns";

// ── Hobby type constants ───────────────────────────────────────────────────────

export type HobbyType = "creative" | "collection" | "outdoor" | "games" | "learning" | "performance";

const HOBBY_TYPES: { value: HobbyType; label: string; icon: React.ElementType; color: string; bg: string; emoji: string }[] = [
  { value: "creative",    label: "Creative",          icon: Palette,   color: "#ec4899", bg: "bg-pink-50 dark:bg-pink-950/20",    emoji: "🎨" },
  { value: "collection",  label: "Collection",        icon: Archive,   color: "#f97316", bg: "bg-orange-50 dark:bg-orange-950/20", emoji: "🪙" },
  { value: "outdoor",     label: "Outdoor & Active",  icon: Mountain,  color: "#10b981", bg: "bg-emerald-50 dark:bg-emerald-950/20", emoji: "🏔️" },
  { value: "games",       label: "Games & Mind",      icon: Gamepad2,  color: "#6366f1", bg: "bg-indigo-50 dark:bg-indigo-950/20", emoji: "🎮" },
  { value: "learning",    label: "Learning & Making", icon: Cpu,       color: "#3b82f6", bg: "bg-blue-50 dark:bg-blue-950/20",     emoji: "🔬" },
  { value: "performance", label: "Performance",       icon: Mic2,      color: "#8b5cf6", bg: "bg-violet-50 dark:bg-violet-950/20", emoji: "🎭" },
];

const HOBBY_TYPE_MAP = Object.fromEntries(HOBBY_TYPES.map(t => [t.value, t]));

const PRESET_HOBBIES: Record<HobbyType, string[]> = {
  creative:    ["Photography", "Painting", "Drawing", "Pottery", "Knitting/Crochet", "Woodworking", "Jewelry Making", "Sculpting"],
  collection:  ["Coins", "Stamps", "Vinyl Records", "Trading Cards", "Sneakers", "Watches", "Comic Books", "Antiques"],
  outdoor:     ["Hiking", "Cycling", "Fishing", "Gardening", "Rock Climbing", "Bird Watching", "Surfing", "Running"],
  games:       ["Chess", "Board Games", "Video Games", "Puzzles", "Poker", "Dungeons & Dragons"],
  learning:    ["Coding", "Electronics", "3D Printing", "Brewing/Winemaking", "Cooking", "Language Learning"],
  performance: ["Playing an Instrument", "Singing", "Acting", "Dancing", "Comedy"],
};

const SKILL_LEVELS = [
  { value: "beginner",     label: "Beginner",     color: "bg-green-500/15 text-green-700 dark:text-green-400" },
  { value: "intermediate", label: "Intermediate", color: "bg-blue-500/15 text-blue-700 dark:text-blue-400" },
  { value: "advanced",     label: "Advanced",     color: "bg-purple-500/15 text-purple-700 dark:text-purple-400" },
  { value: "expert",       label: "Expert",       color: "bg-orange-500/15 text-orange-700 dark:text-orange-400" },
];

const STATUS_OPTIONS = [
  { value: "active",    label: "Active",    color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  { value: "on_pause",  label: "On Pause",  color: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400" },
  { value: "retired",   label: "Retired",   color: "bg-slate-500/15 text-slate-500" },
];

const SKILL_MAP = Object.fromEntries(SKILL_LEVELS.map(s => [s.value, s]));
const STATUS_MAP = Object.fromEntries(STATUS_OPTIONS.map(s => [s.value, s]));

// ── Goal / Plan types ──────────────────────────────────────────────────────────

type GoalType = "count" | "milestone" | "frequency" | "plan";

interface GoalStep {
  id: string;
  text: string;
  done: boolean;
  dueDate?: string;
}

interface HobbyGoal {
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
}

interface GoalTemplate {
  id: string;
  emoji: string;
  label: string;
  description: string;
  goalType: GoalType;
  defaults: Partial<HobbyGoal>;
}

// ── Goal templates per hobby type ─────────────────────────────────────────────

const GOAL_TEMPLATES: Record<HobbyType, GoalTemplate[]> = {
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

function genId(): string {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

function parseExtra(json: string): Record<string, any> {
  try { return JSON.parse(json || "{}"); } catch { return {}; }
}

function parseGoals(extraJson: string): HobbyGoal[] {
  try {
    const obj = JSON.parse(extraJson || "{}");
    return Array.isArray(obj.goals) ? obj.goals : [];
  } catch { return []; }
}

function setGoalsInExtra(extraJson: string, goals: HobbyGoal[]): string {
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

interface HobbyPlan {
  id: string;
  title: string;
  description?: string;
  durationWeeks?: number;
  startDate?: string;
  isActive: boolean;
  steps: GoalStep[];
  createdAt: string;
  completedAt?: string;
}

interface PlanTemplate {
  id: string;
  emoji: string;
  label: string;
  description: string;
  defaultSteps: string[];
  durationWeeks?: number;
}

const PLAN_TEMPLATES: Record<HobbyType, PlanTemplate[]> = {
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

// ── Plan helpers ───────────────────────────────────────────────────────────────

function parsePlans(extraJson: string): HobbyPlan[] {
  try {
    const obj = JSON.parse(extraJson || "{}");
    return Array.isArray(obj.plans) ? obj.plans : [];
  } catch { return []; }
}

function setPlansInExtra(extraJson: string, plans: HobbyPlan[]): string {
  try {
    const obj = JSON.parse(extraJson || "{}");
    return JSON.stringify({ ...obj, plans });
  } catch { return JSON.stringify({ plans }); }
}

function setPlansAndGoalsInExtra(extraJson: string, plans: HobbyPlan[], goals: HobbyGoal[]): string {
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

function ExtraFields({ hobbyType, extra, onChange }: { hobbyType: HobbyType; extra: Record<string, any>; onChange: (key: string, value: any) => void }) {
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

function ExtraDisplay({ hobbyType, extra }: { hobbyType: HobbyType; extra: Record<string, any> }) {
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
}: {
  goal: HobbyGoal;
  hobbyName: string;
  hobbyColor: string;
  onUpdateCount?: (val: number) => void;
  onToggleStep?: (stepId: string, done: boolean) => void;
  onComplete?: () => void;
  onDelete?: () => void;
}) {
  const [editingCount, setEditingCount] = useState(false);
  const [countInput, setCountInput] = useState(String(goal.currentValue ?? 0));
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
    </div>
  );
}

// ── Plan Card ─────────────────────────────────────────────────────────────────

function PlanCard({
  plan,
  hobbyName,
  hobbyColor,
  onToggleStep,
  onToggleActive,
  onComplete,
  onDelete,
}: {
  plan: HobbyPlan;
  hobbyName: string;
  hobbyColor: string;
  onToggleStep?: (stepId: string, done: boolean) => void;
  onToggleActive?: () => void;
  onComplete?: () => void;
  onDelete?: () => void;
}) {
  const { pct, done, total } = planProgress(plan);
  const isCompleted = !!plan.completedAt;
  const days = plan.startDate && plan.durationWeeks
    ? Math.round((new Date(plan.startDate).getTime() + plan.durationWeeks * 7 * 86400000 - Date.now()) / 86400000)
    : null;

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${isCompleted ? "bg-secondary/30 opacity-75" : plan.isActive ? "bg-blue-50/50 dark:bg-blue-950/10 border-blue-200 dark:border-blue-800" : "bg-card"}`}>
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

      {/* Progress */}
      {total > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{done} / {total} steps</span>
            <span className="font-semibold">{pct}%</span>
          </div>
          <Progress value={pct} className="h-1.5" />
        </div>
      )}

      {/* Steps */}
      {plan.steps.length > 0 && (
        <div className="space-y-1 max-h-44 overflow-y-auto">
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

      {/* Activate / Deactivate toggle */}
      {!isCompleted && onToggleActive && (
        <div className="pt-1 border-t flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {plan.isActive ? "This plan is active" : "This plan is inactive"}
          </span>
          <button
            onClick={onToggleActive}
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-all ${
              plan.isActive
                ? "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-950/50"
                : "bg-secondary border-border text-muted-foreground hover:bg-primary/5 hover:border-primary/30 hover:text-primary"
            }`}
          >
            {plan.isActive ? <><PowerOff size={11} /> Deactivate</> : <><Power size={11} /> Activate</>}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Plan Wizard (2-step) ───────────────────────────────────────────────────────

function PlanWizard({
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
  const [steps, setSteps] = useState<GoalStep[]>([]);
  const [stepInput, setStepInput] = useState("");
  const [stepDate, setStepDate] = useState("");

  // Chess ELO wizard state
  const [chessEloMode, setChessEloMode] = useState(false);
  const [currentElo, setCurrentElo] = useState("");
  const [targetElo, setTargetElo] = useState("");

  const selectedHobby = hobbies.find(h => h.id === selectedHobbyId) ?? null;
  const hobbyType = (selectedHobby?.hobbyType as HobbyType) ?? "creative";
  const typeInfo = HOBBY_TYPE_MAP[hobbyType];
  const templates = PLAN_TEMPLATES[hobbyType] ?? [];

  // Chess ELO preview
  const eloGap = Math.max(0, Number(targetElo) - Number(currentElo));
  const eloDuration = eloGap > 0 ? calcChessDuration(eloGap) : null;

  function reset() {
    setStep(1); setSelectedHobbyId(defaultHobbyId ?? null); setSelectedTemplate(null);
    setTitle(""); setDescription(""); setDurationWeeks(""); setStartDate("");
    setActivateNow(true); setSteps([]); setStepInput(""); setStepDate("");
    setChessEloMode(false); setCurrentElo(""); setTargetElo("");
  }
  function handleClose() { reset(); onClose(); }

  function pickTemplate(t: PlanTemplate) {
    const isChessRating = t.id === "gp3" && selectedHobby?.name?.toLowerCase().includes("chess");
    setSelectedTemplate(t);
    if (isChessRating) {
      setChessEloMode(true);
      // Don't advance to step 2 yet — wait for ELO inputs
      return;
    }
    setTitle(t.label);
    setDurationWeeks(t.durationWeeks ? String(t.durationWeeks) : "");
    setSteps(t.defaultSteps.map(text => ({ id: genId(), text, done: false })));
    setStep(2);
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
    setChessEloMode(false);
    setStep(2);
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
    };
    onSave(selectedHobbyId, plan);
    handleClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col overflow-hidden p-0">
        <div className="px-5 pt-5 pb-3 border-b shrink-0">
          <div className="flex items-center gap-2 mb-3">
            {(step === 2 || chessEloMode) && (
              <button onClick={() => { if (chessEloMode) { setChessEloMode(false); setSelectedTemplate(null); } else setStep(1); }} className="p-1 rounded-lg hover:bg-secondary transition-colors text-muted-foreground">
                <ChevronLeft size={15} />
              </button>
            )}
            <div className="flex-1">
              <DialogTitle className="text-base flex items-center gap-2">
                <ClipboardList size={15} className="text-primary" />
                {step === 1 && !chessEloMode ? "New Plan" : chessEloMode ? "Chess Rating Goal" : "Configure Your Plan"}
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {step === 1 && !chessEloMode ? "Pick a hobby and choose a template" : chessEloMode ? "Set your current and target ELO to generate a personalised plan" : "Name, schedule, and build out your steps"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(chessEloMode ? [1, 2, 3] : [1, 2]).map((n, idx) => {
              // chess mode: step1=idx0 filled, eloStep=idx0+1 filled, step2=all filled
              const filled = chessEloMode ? idx <= 1 : n <= step;
              return <div key={n} className={`h-1 rounded-full flex-1 transition-colors ${filled ? "bg-primary" : "bg-secondary"}`} />;
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
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
                  <p className="text-[10px] text-muted-foreground border-t pt-2">Recommended: 3–10 hrs/week · daily tactics puzzles + rated game play</p>
                </div>
              )}
              {Number(targetElo) > 0 && Number(currentElo) > 0 && Number(targetElo) <= Number(currentElo) && (
                <p className="text-xs text-destructive text-center py-1">Target ELO must be higher than your current rating</p>
              )}
            </>
          )}

          {/* STEP 1 */}
          {step === 1 && !chessEloMode && (
            <>
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
            <Button
              size="sm"
              disabled={!eloDuration || Number(targetElo) <= Number(currentElo) || !currentElo || !targetElo}
              onClick={applyEloSettings}
              className="gap-1.5"
            >
              <Check size={13} /> Generate Plan
            </Button>
          )}
          {step === 2 && !chessEloMode && (
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

function GoalWizard({
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
  const statusInfo = STATUS_MAP[hobby.status ?? "active"];
  const TypeIcon = typeInfo.icon;
  const goals = parseGoals(hobby.extraJson ?? "{}");
  const plans = parsePlans(hobby.extraJson ?? "{}");
  const activeGoals = goals.filter(g => g.status === "active");
  const activePlansCount = plans.filter(p => p.isActive && !p.completedAt).length;

  return (
    <div className="group relative bg-card border rounded-xl overflow-hidden cursor-pointer hover:shadow-md transition-all duration-200" onClick={onClick}>
      <div className="h-1.5 w-full" style={{ backgroundColor: typeInfo.color }} />
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm" style={{ backgroundColor: typeInfo.color }}>
              <TypeIcon size={15} />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-sm leading-tight truncate">{hobby.name}</h3>
              {hobby.category && <p className="text-xs text-muted-foreground truncate">{hobby.category}</p>}
            </div>
          </div>
          <button className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => { e.stopPropagation(); onToggleFavorite(); }}>
            <Heart size={14} className={hobby.isFavorite ? "fill-pink-500 text-pink-500" : "text-muted-foreground"} />
          </button>
        </div>
        {hobby.description && <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{hobby.description}</p>}
        <div className="flex flex-wrap gap-1.5 items-center">
          {skillInfo && <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${skillInfo.color}`}>{skillInfo.label}</span>}
          {statusInfo && hobby.status !== "active" && <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statusInfo.color}`}>{statusInfo.label}</span>}
          {hobby.dateStarted && <span className="text-[10px] text-muted-foreground">Since {hobby.dateStarted.slice(0, 4)}</span>}
          {(activePlansCount > 0 || activeGoals.length > 0) && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary flex items-center gap-0.5 ml-auto">
              <Target size={9} />
              {activePlansCount > 0 && <>{activePlansCount} plan{activePlansCount !== 1 ? "s" : ""}</>}
              {activePlansCount > 0 && activeGoals.length > 0 && " · "}
              {activeGoals.length > 0 && <>{activeGoals.length} goal{activeGoals.length !== 1 ? "s" : ""}</>}
            </span>
          )}
        </div>
      </div>
      <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button className="p-1 rounded bg-background/80 border hover:bg-muted transition-colors" onClick={e => { e.stopPropagation(); onEdit(); }}><Pencil size={11} /></button>
        <button className="p-1 rounded bg-background/80 border hover:bg-destructive/10 text-destructive transition-colors" onClick={e => { e.stopPropagation(); onDelete(); }}><Trash2 size={11} /></button>
      </div>
    </div>
  );
}

// ── Hobby Detail Dialog (with Goals section) ───────────────────────────────────

function HobbyDetailDialog({
  hobby, open, onClose, onEdit, onUpdateGoals, onUpdatePlans,
}: {
  hobby: Hobby | null; open: boolean; onClose: () => void; onEdit: () => void;
  onUpdateGoals: (goals: HobbyGoal[]) => void;
  onUpdatePlans: (plans: HobbyPlan[]) => void;
}) {
  const [addingGoal, setAddingGoal] = useState(false);
  const [addingPlan, setAddingPlan] = useState(false);
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
  function completePlan(planId: string) { onUpdatePlans(plans.map(p => p.id === planId ? { ...p, isActive: false, completedAt: new Date().toISOString() } : p)); }
  function deletePlan(planId: string) { onUpdatePlans(plans.filter(p => p.id !== planId)); }

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

          {hobby.coverUrl && <img src={hobby.coverUrl} alt={hobby.name} className="w-full h-48 object-cover rounded-lg" />}
          {hobby.description && <div><h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Why I Love It</h4><p className="text-sm">{hobby.description}</p></div>}
          {Object.values(extra).some(v => v !== "" && v != null && !Array.isArray(v)) && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Details</h4>
              <div className="space-y-1.5"><ExtraDisplay hobbyType={hobby.hobbyType as HobbyType} extra={extra} /></div>
            </div>
          )}

          {/* ── Plans section ── */}
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
              <div className="space-y-2">
                {[...activePlans, ...inactivePlans].map(p => (
                  <PlanCard key={p.id} plan={p} hobbyName={hobby.name} hobbyColor={typeInfo.color}
                    onToggleStep={(sid, done) => togglePlanStep(p.id, sid, done)}
                    onToggleActive={() => togglePlanActive(p.id)}
                    onComplete={() => completePlan(p.id)}
                    onDelete={() => deletePlan(p.id)}
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
              </div>
            )}
          </div>

          {/* ── Goals section ── */}
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

          {hobby.notes && <div><h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Notes</h4><p className="text-sm text-muted-foreground">{hobby.notes}</p></div>}
          <div className="flex justify-end pt-2">
            <Button size="sm" variant="outline" onClick={onEdit}><Pencil size={13} className="mr-1.5" /> Edit</Button>
          </div>
        </div>

        {addingPlan && (
          <PlanWizard open={addingPlan} onClose={() => setAddingPlan(false)} hobbies={[hobby]} defaultHobbyId={hobby.id}
            onSave={(_, plan) => { onUpdatePlans([...plans, plan]); setAddingPlan(false); }}
          />
        )}
        {addingGoal && (
          <GoalWizard open={addingGoal} onClose={() => setAddingGoal(false)} hobbies={[hobby]} defaultHobbyId={hobby.id}
            onSave={(_, goal) => { onUpdateGoals([...goals, goal]); setAddingGoal(false); }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Plans & Goals Tab ──────────────────────────────────────────────────────────

function PlansGoalsTab({
  hobbies,
  onUpdateHobby,
}: {
  hobbies: Hobby[];
  onUpdateHobby: (id: number, extraJson: string) => void;
}) {
  const [planWizardOpen, setPlanWizardOpen] = useState(false);
  const [goalWizardOpen, setGoalWizardOpen] = useState(false);
  const [filterType, setFilterType] = useState<HobbyType | "all">("all");
  const [showCompletedPlans, setShowCompletedPlans] = useState(false);
  const [showCompletedGoals, setShowCompletedGoals] = useState(false);

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
  function deletePlan(hobby: Hobby, planId: string) {
    const plans = parsePlans(hobby.extraJson ?? "{}").filter(p => p.id !== planId);
    onUpdateHobby(hobby.id, setPlansInExtra(hobby.extraJson ?? "{}", plans));
  }
  function togglePlanActive(hobby: Hobby, planId: string) {
    const plans = parsePlans(hobby.extraJson ?? "{}");
    const plan = plans.find(p => p.id === planId);
    if (!plan) return;
    const updated = { ...plan, isActive: !plan.isActive, startDate: (!plan.isActive && !plan.startDate) ? new Date().toISOString().slice(0, 10) : plan.startDate };
    onUpdateHobby(hobby.id, setPlansInExtra(hobby.extraJson ?? "{}", plans.map(p => p.id === planId ? updated : p)));
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
    onUpdateHobby(hobby.id, setPlansInExtra(hobby.extraJson ?? "{}", plans.map(p => p.id === planId ? { ...p, isActive: false, completedAt: new Date().toISOString() } : p)));
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

      {/* ══════════════════ PLANS SECTION ══════════════════ */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <ClipboardList size={14} className="text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold">Plans</h2>
              <p className="text-xs text-muted-foreground">Structured, step-by-step plans with activate/deactivate</p>
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
                  onToggleActive={() => togglePlanActive(p.hobby, p.id)}
                  onComplete={() => completePlan(p.hobby, p.id)}
                  onDelete={() => deletePlan(p.hobby, p.id)}
                />
              );
            })}
          </div>
        )}

        {/* Inactive plans */}
        {filteredInactivePlans.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">Inactive</p>
            {filteredInactivePlans.map(p => {
              const ti = HOBBY_TYPE_MAP[p.hobby.hobbyType as HobbyType];
              return (
                <PlanCard key={p.id} plan={p} hobbyName={p.hobby.name} hobbyColor={ti?.color ?? "#888"}
                  onToggleStep={(sid, done) => togglePlanStep(p.hobby, p.id, sid, done)}
                  onToggleActive={() => togglePlanActive(p.hobby, p.id)}
                  onComplete={() => completePlan(p.hobby, p.id)}
                  onDelete={() => deletePlan(p.hobby, p.id)}
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

      {/* Divider */}
      <div className="h-px bg-border" />

      {/* ══════════════════ GOALS SECTION ══════════════════ */}
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

      {/* Wizards */}
      <PlanWizard
        open={planWizardOpen}
        onClose={() => setPlanWizardOpen(false)}
        hobbies={hobbies.filter(h => h.status !== "retired")}
        onSave={(hobbyId, plan) => {
          const hobby = hobbies.find(h => h.id === hobbyId);
          if (!hobby) return;
          onUpdateHobby(hobbyId, setPlansInExtra(hobby.extraJson ?? "{}", [...parsePlans(hobby.extraJson ?? "{}"), plan]));
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
    </div>
  );
}

// ── Add/Edit Hobby Form Dialog ─────────────────────────────────────────────────

const EMPTY_FORM: Partial<InsertHobby> = {
  name: "", hobbyType: "creative", category: "", description: "",
  skillLevel: "beginner", dateStarted: "", status: "active", notes: "", extraJson: "{}", isFavorite: false, coverUrl: "",
};

function HobbyFormDialog({ open, onClose, initial, onSave, isEdit = false }: {
  open: boolean; onClose: () => void; initial: Partial<InsertHobby>; onSave: (data: Partial<InsertHobby>) => void; isEdit?: boolean;
}) {
  const [form, setForm] = useState<Partial<InsertHobby>>(initial);
  const [extra, setExtra] = useState<Record<string, any>>(() => parseExtra(initial.extraJson ?? "{}"));
  const [showPresets, setShowPresets] = useState(false);
  const set = (key: keyof InsertHobby, val: any) => setForm(f => ({ ...f, [key]: val }));
  const setExtraKey = (key: string, val: any) => setExtra(e => ({ ...e, [key]: val }));
  const handleSave = () => {
    if (!form.name?.trim()) return;
    // Preserve existing goals and plans when saving extra fields
    const existingGoals = parseGoals(initial.extraJson ?? "{}");
    const existingPlans = parsePlans(initial.extraJson ?? "{}");
    const newExtra = { ...extra };
    if (existingGoals.length > 0) newExtra.goals = existingGoals;
    if (existingPlans.length > 0) newExtra.plans = existingPlans;
    onSave({ ...form, extraJson: JSON.stringify(newExtra) });
  };
  const typeInfo = HOBBY_TYPE_MAP[(form.hobbyType as HobbyType) ?? "creative"];
  const presets = PRESET_HOBBIES[(form.hobbyType as HobbyType) ?? "creative"] ?? [];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEdit ? "Edit Hobby" : "Add a Hobby"}</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">Hobby Type</label>
            <div className="grid grid-cols-3 gap-2">
              {HOBBY_TYPES.map(t => {
                const Icon = t.icon; const selected = form.hobbyType === t.value;
                return (
                  <button key={t.value} type="button" onClick={() => { set("hobbyType", t.value); set("category", ""); }}
                    className={`flex flex-col items-center gap-1 p-2.5 rounded-lg border text-xs font-medium transition-all ${selected ? "border-2" : "border hover:border-muted-foreground/50 text-muted-foreground"}`}
                    style={selected ? { borderColor: t.color, backgroundColor: t.color + "22", color: t.color } : {}}>
                    <Icon size={16} /><span className="leading-tight text-center">{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Hobby Name *</label>
            <div className="flex gap-2">
              <Input className="text-sm flex-1" placeholder={`e.g. ${presets[0] ?? "Photography"}`} value={form.name ?? ""} onChange={e => set("name", e.target.value)} />
              <button type="button" onClick={() => setShowPresets(p => !p)} className="px-3 py-2 rounded-lg border text-xs text-muted-foreground hover:bg-muted transition-colors flex items-center gap-1">
                <Layers size={13} />{showPresets ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
            </div>
            {showPresets && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {presets.map(p => (<button key={p} type="button" onClick={() => { set("name", p); set("category", p); setShowPresets(false); }} className="text-xs px-2.5 py-1 rounded-full border hover:bg-muted transition-colors">{p}</button>))}
              </div>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Specific Category / Sub-type</label>
            <Input className="text-sm" placeholder="e.g. Landscape Photography, Fly Fishing…" value={form.category ?? ""} onChange={e => set("category", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Skill Level</label>
              <Select value={form.skillLevel ?? "beginner"} onValueChange={v => set("skillLevel", v)}>
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{SKILL_LEVELS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
              <Select value={form.status ?? "active"} onValueChange={v => set("status", v)}>
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Date Started</label>
            <Input type="date" className="text-sm" value={form.dateStarted ?? ""} onChange={e => set("dateStarted", e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Why You Love It</label>
            <Textarea className="text-sm min-h-[70px]" placeholder="What drew you to this hobby? What do you enjoy about it?" value={form.description ?? ""} onChange={e => set("description", e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Cover Photo URL</label>
            <Input className="text-sm" placeholder="https://…" value={form.coverUrl ?? ""} onChange={e => set("coverUrl", e.target.value)} />
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs font-semibold mb-3 flex items-center gap-1.5" style={{ color: typeInfo?.color }}>
              {typeInfo && <typeInfo.icon size={13} />}{typeInfo?.label} Details
            </p>
            <ExtraFields hobbyType={(form.hobbyType as HobbyType) ?? "creative"} extra={extra} onChange={setExtraKey} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Personal Notes</label>
            <Textarea className="text-sm min-h-[60px]" placeholder="Goals, reminders, anything else…" value={form.notes ?? ""} onChange={e => set("notes", e.target.value)} />
          </div>
          <button type="button" onClick={() => set("isFavorite", !form.isFavorite)} className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg border transition-colors w-full ${form.isFavorite ? "bg-pink-50 dark:bg-pink-950/20 border-pink-200 text-pink-600" : "hover:bg-muted"}`}>
            <Heart size={14} className={form.isFavorite ? "fill-pink-500 text-pink-500" : ""} />
            {form.isFavorite ? "Marked as favorite" : "Mark as favorite"}
          </button>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={!form.name?.trim()}>{isEdit ? "Save Changes" : "Add"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function HobbiesPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"hobbies" | "plans">("hobbies");

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
  const [editHobby, setEditHobby] = useState<Hobby | null>(null);
  const [detailHobby, setDetailHobby] = useState<Hobby | null>(null);
  const [formInitial, setFormInitial] = useState<Partial<InsertHobby>>(EMPTY_FORM);
  const [formKey, setFormKey] = useState(0);

  const filtered = useMemo(() => {
    return hobbies.filter(h => {
      if (filterType !== "all" && h.hobbyType !== filterType) return false;
      if (filterStatus !== "all" && h.status !== filterStatus) return false;
      if (search) { const q = search.toLowerCase(); if (!h.name.toLowerCase().includes(q) && !(h.category ?? "").toLowerCase().includes(q) && !(h.description ?? "").toLowerCase().includes(q)) return false; }
      return true;
    });
  }, [hobbies, filterType, filterStatus, search]);

  const grouped = useMemo(() => {
    if (filterType !== "all") return { [filterType]: filtered };
    const g: Record<string, Hobby[]> = {};
    for (const h of filtered) { if (!g[h.hobbyType]) g[h.hobbyType] = []; g[h.hobbyType].push(h); }
    return g;
  }, [filtered, filterType]);

  const openAdd = (type?: HobbyType) => { setFormInitial({ ...EMPTY_FORM, hobbyType: type ?? "creative" }); setEditHobby(null); setFormKey(k => k + 1); setShowForm(true); };
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

  const handleDelete = async (h: Hobby) => {
    try { await deleteMut.mutateAsync(h.id); toast({ title: "Hobby removed" }); }
    catch { toast({ title: "Error deleting hobby", variant: "destructive" }); }
  };

  const handleToggleFavorite = async (h: Hobby) => { await updateMut.mutateAsync({ id: h.id, data: { isFavorite: !h.isFavorite } }); };

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

  const handleUpdateHobbyExtra = async (hobbyId: number, extraJson: string) => {
    await updateMut.mutateAsync({ id: hobbyId, data: { extraJson } });
  };

  const counts = useMemo(() => { const c: Record<string, number> = {}; for (const h of hobbies) c[h.hobbyType] = (c[h.hobbyType] ?? 0) + 1; return c; }, [hobbies]);
  const activeGoalCount = useMemo(() => hobbies.reduce((sum, h) => sum + parseGoals(h.extraJson ?? "{}").filter(g => g.status === "active").length, 0), [hobbies]);
  const activePlanCount = useMemo(() => hobbies.reduce((sum, h) => sum + parsePlans(h.extraJson ?? "{}").filter(p => p.isActive && !p.completedAt).length, 0), [hobbies]);
  const activeCount = hobbies.filter(h => h.status === "active").length;
  const favCount = hobbies.filter(h => h.isFavorite).length;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Hobbies</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {hobbies.length} {hobbies.length === 1 ? "hobby" : "hobbies"}
            {activeCount > 0 && ` · ${activeCount} active`}
            {favCount > 0 && ` · ${favCount} favorited`}
            {activePlanCount > 0 && ` · ${activePlanCount} active plan${activePlanCount !== 1 ? "s" : ""}`}
          {activeGoalCount > 0 && ` · ${activeGoalCount} active goal${activeGoalCount !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Button size="sm" onClick={() => activeTab === "plans" ? setActiveTab("plans") : openAdd()}>
          {activeTab === "plans" ? <><Target size={15} className="mr-1.5" /> New Goal</> : <><Plus size={15} className="mr-1.5" /> Add Hobby</>}
        </Button>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 bg-secondary rounded-lg p-1 w-fit">
        <button onClick={() => setActiveTab("hobbies")}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === "hobbies" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          <Heart size={13} /> Hobbies
          {hobbies.length > 0 && <span className="text-xs opacity-60">{hobbies.length}</span>}
        </button>
        <button onClick={() => setActiveTab("plans")}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === "plans" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          <Target size={13} /> Plans & Goals
          {(activePlanCount + activeGoalCount) > 0 && <span className="text-xs opacity-60">{activePlanCount + activeGoalCount}</span>}
        </button>
      </div>

      {/* ── Plans & Goals tab ── */}
      {activeTab === "plans" && (
        <PlansGoalsTab hobbies={hobbies} onUpdateHobby={handleUpdateHobbyExtra} />
      )}

      {/* ── Hobbies tab ── */}
      {activeTab === "hobbies" && (
        <>
          {/* Stats row */}
          {hobbies.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {HOBBY_TYPES.map(t => {
                const cnt = counts[t.value] ?? 0;
                if (cnt === 0 && filterType !== t.value) return null;
                const Icon = t.icon;
                return (
                  <button key={t.value} onClick={() => setFilterType(filterType === t.value ? "all" : t.value)}
                    className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border text-center transition-all ${filterType === t.value ? "ring-2 ring-offset-1" : "hover:bg-muted/50"}`}
                    style={filterType === t.value ? { ringColor: t.color, borderColor: t.color, backgroundColor: t.color + "15" } : {}}>
                    <Icon size={16} style={{ color: t.color }} />
                    <span className="text-[10px] font-medium leading-tight" style={{ color: t.color }}>{t.emoji} {t.label.split(" ")[0]}</span>
                    <span className="text-sm font-bold">{cnt}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Search + filters */}
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

          {/* Grouped grid */}
          {Object.entries(grouped).map(([type, items]) => {
            if (items.length === 0) return null;
            const typeInfo = HOBBY_TYPE_MAP[type as HobbyType];
            if (!typeInfo) return null;
            const TypeIcon = typeInfo.icon;
            return (
              <div key={type}>
                {filterType === "all" && (
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ backgroundColor: typeInfo.color + "22" }}>
                      <TypeIcon size={13} style={{ color: typeInfo.color }} />
                    </div>
                    <h2 className="text-sm font-semibold" style={{ color: typeInfo.color }}>{typeInfo.label}</h2>
                    <span className="text-xs text-muted-foreground">({items.length})</span>
                    <div className="flex-1 h-px bg-border" />
                    <button onClick={() => openAdd(type as HobbyType)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors">
                      <Plus size={11} /> Add
                    </button>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {items.map(h => (
                    <HobbyCard key={h.id} hobby={h}
                      onEdit={() => openEdit(h)} onDelete={() => handleDelete(h)}
                      onToggleFavorite={() => handleToggleFavorite(h)}
                      onClick={() => setDetailHobby(h)}
                    />
                  ))}
                  <button onClick={() => openAdd(type as HobbyType)}
                    className="rounded-xl border-2 border-dashed border-muted-foreground/20 hover:border-muted-foreground/40 transition-colors flex flex-col items-center justify-center gap-2 p-6 text-muted-foreground min-h-[100px]">
                    <Plus size={18} /><span className="text-xs">Add {typeInfo.label} hobby</span>
                  </button>
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* Dialogs */}
      <HobbyFormDialog key={formKey} open={showForm} onClose={() => { setShowForm(false); setEditHobby(null); }} initial={formInitial} onSave={handleSave} isEdit={!!editHobby} />

      <HobbyDetailDialog
        hobby={detailHobby}
        open={!!detailHobby}
        onClose={() => setDetailHobby(null)}
        onEdit={() => { if (detailHobby) { setDetailHobby(null); openEdit(detailHobby); } }}
        onUpdateGoals={(goals) => { if (detailHobby) handleUpdateGoals(detailHobby, goals); }}
        onUpdatePlans={(plans) => { if (detailHobby) handleUpdatePlans(detailHobby, plans); }}
      />
    </div>
  );
}
