import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import PageShell from "@/components/PageShell";
import BodyCompositionPlanSection from "@/components/BodyCompositionPlanSection";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format, parseISO } from "date-fns";
import { useLocation } from "wouter";
import {
  Plus, Dumbbell, Flame, Star, Pencil, Trash2, MoreHorizontal,
  LayoutTemplate, ClipboardList, Zap, Package, Search, Loader2,
  Sparkles, ChevronRight, CheckCircle2, X, Info, ExternalLink,
  CalendarDays, Share2, Users, Send, CheckCheck, Trophy, Target,
  TrendingUp, Heart, Play, CheckSquare, UtensilsCrossed,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { workoutStreak, weeklyWorkoutStats, getRecentPRs, WORKOUT_TYPE_LABELS, WORKOUT_TYPES } from "@/lib/plannerUtils";
import WorkoutLogModal from "@/components/modals/WorkoutLogModal";
import WorkoutTemplateModal from "@/components/modals/WorkoutTemplateModal";
import GeneralFitnessWizard from "@/components/modals/GeneralFitnessWizard";
import type { WorkoutLog, WorkoutTemplate, Equipment, GoalWithProjects, WorkoutPlan, WorkoutShareWithUser, WorkoutPlanMilestone } from "@shared/schema";

// Legacy flat format (kept for backward compat reading)
type PlanDayEntry = { dayOfWeek: string; templateId?: number | null; templateName?: string; label?: string; notes?: string };
// New per-week format
type PlanDayEntryV2 = { dayOfWeek: string; label: string; notes?: string; templateId?: number | null; wizardSession?: any };
type WeekScheduleV2 = { week: number; days: PlanDayEntryV2[] };
type PublicUser = { id: number; name: string; avatarUrl: string | null; email: string };

// Parse scheduleJson — handles both old flat format and new week-by-week format
function parseSchedule(json: string): { isV2: boolean; weeks: WeekScheduleV2[]; flatDays: PlanDayEntry[] } {
  try {
    const raw = JSON.parse(json);
    if (!Array.isArray(raw)) return { isV2: false, weeks: [], flatDays: [] };
    if (raw.length === 0) return { isV2: true, weeks: [], flatDays: [] };
    if ("week" in raw[0]) return { isV2: true, weeks: raw as WeekScheduleV2[], flatDays: [] };
    // Old format
    return { isV2: false, weeks: [], flatDays: raw as PlanDayEntry[] };
  } catch { return { isV2: false, weeks: [], flatDays: [] }; }
}

// ── Built-in Starter Plans ─────────────────────────────────────────────────────

// Helper to build a Mon/Wed/Fri/Sun endurance schedule from row data
function buildEndurancePlan(rows: [number, number, number, number][], sunLabel = "Long Run"): WeekScheduleV2[] {
  const fmt = (n: number) => `${n} mile${n !== 1 ? "s" : ""}`;
  return rows.map(([week, mon, fri, sun]) => ({
    week,
    days: [
      { dayOfWeek: "monday", label: "Easy Run", notes: fmt(mon) },
      { dayOfWeek: "wednesday", label: "Rest or Cross-Train" },
      { dayOfWeek: "friday", label: "Easy Run", notes: fmt(fri) },
      { dayOfWeek: "sunday", label: sunLabel, notes: fmt(sun) },
    ],
  }));
}

// Couch-to-Marathon 24-week plan
const MARATHON_COUCH_TO_PLAN: WeekScheduleV2[] = buildEndurancePlan([
  [1, 1, 1, 1.5], [2, 1, 1.5, 2], [3, 1.5, 1.5, 2.5], [4, 1, 1.5, 2],
  [5, 1.5, 2, 3], [6, 2, 2, 4], [7, 2, 2.5, 5], [8, 1.5, 2, 3.5],
  [9, 2, 3, 6], [10, 2.5, 3, 7], [11, 3, 3, 8], [12, 2, 3, 6],
  [13, 3, 4, 9], [14, 3, 4, 10], [15, 3, 4, 12], [16, 2.5, 3, 8],
  [17, 3, 5, 14], [18, 4, 5, 16], [19, 4, 5, 18], [20, 3, 4, 12],
  [21, 3, 4, 14], [22, 3, 3, 10], [23, 2, 3, 8], [24, 2, 2, 6],
]);

// Builder for Tue/Thu/Sun 3-day plans (e.g. 10K)
function buildTueThuSunPlan(rows: [number, number, number, number][], sunLabel = "Long Run"): WeekScheduleV2[] {
  const fmt = (n: number) => `${n} mile${n !== 1 ? "s" : ""}`;
  return rows.map(([week, tue, thu, sun]) => ({
    week,
    days: [
      { dayOfWeek: "tuesday", label: "Easy Run", notes: fmt(tue) },
      { dayOfWeek: "thursday", label: "Easy Run", notes: fmt(thu) },
      { dayOfWeek: "sunday", label: sunLabel, notes: fmt(sun) },
    ],
  }));
}

// Couch-to-50K Ultra 24-week plan (Tue easy, Thu rest/cross-train, Sat long run, Sun long run)
// Sat2 = back-to-back Saturday second run; when > 0 it's appended to Saturday notes
const FIFTY_K_COUCH_TO_PLAN: WeekScheduleV2[] = (() => {
  // [week, tue, sat, sat2, sun]
  const rows: [number, number, number, number, number][] = [
    [1, 3, 4, 0, 5],   [2, 3, 4, 0, 6],   [3, 3, 5, 0, 7],   [4, 2.5, 4, 0, 5],
    [5, 3.5, 6, 3, 8], [6, 4, 6, 4, 10],  [7, 4, 7, 4, 12],  [8, 3, 5, 3, 8],
    [9, 4, 8, 5, 14],  [10, 4, 8, 6, 16], [11, 4, 8, 6, 18], [12, 3, 6, 4, 12],
    [13, 4, 9, 6, 18], [14, 4, 9, 7, 20], [15, 4, 10, 8, 22],[16, 3, 7, 5, 14],
    [17, 4, 10, 8, 22],[18, 4, 10, 8, 20],[19, 3, 8, 6, 18], [20, 3, 6, 4, 14],
    [21, 2.5, 5, 3, 10],[22, 2, 4, 0, 8], [23, 2, 3, 0, 6],  [24, 1.5, 2, 0, 4],
  ];
  const fmt = (n: number) => `${n} mile${n !== 1 ? "s" : ""}`;
  return rows.map(([week, tue, sat, sat2, sun]) => ({
    week,
    days: [
      { dayOfWeek: "tuesday", label: "Easy Run", notes: fmt(tue) },
      { dayOfWeek: "thursday", label: "Rest or Cross-Train" },
      {
        dayOfWeek: "saturday",
        label: sat2 > 0 ? "Long Run + Back-to-Back" : "Long Run",
        notes: sat2 > 0 ? `${fmt(sat)} · back-to-back ${fmt(sat2)}` : fmt(sat),
      },
      { dayOfWeek: "sunday", label: "Long Run", notes: fmt(sun) },
    ],
  }));
})();

// Couch-to-Sprint Triathlon 12-week plan (Swim/Bike/Run/Brick, duration-based)
const SPRINT_TRI_COUCH_TO_PLAN: WeekScheduleV2[] = (() => {
  // [week, monSwimMin, monNote, tueBikeMin, tueNote, wedRunMin, wedNote, friSwimMin, friNote, satMin, satNote, satLabel]
  type Row = [number, number, string, number, string, number, string, number, string, number, string, string];
  const rows: Row[] = [
    [1,  20,"Easy technique swim",   25,"Easy spin",                 15,"Easy run/walk",       20,"Easy swim",          30,"20 min bike + 10 min run","Brick Workout"],
    [2,  20,"Easy swim",             30,"Easy spin",                 20,"Easy run/walk",       25,"Drills + easy",      35,"25 min bike + 10 min run","Brick Workout"],
    [3,  25,"Easy continuous",       30,"Easy spin",                 20,"Easy run",            25,"Drills + easy",      40,"30 min bike + 10 min run","Brick Workout"],
    [4,  25,"Cutback: easy",         25,"Cutback: easy",             20,"Cutback: easy",       20,"Easy",               30,"Short brick",              "Brick Workout"],
    [5,  30,"Steady",                35,"Steady",                    25,"Easy run",            30,"Drills + steady",    45,"35 min bike + 10 min run","Brick Workout"],
    [6,  30,"Continuous",            40,"Steady",                    25,"Easy with strides",   30,"Drills + easy",      50,"40 min bike + 10 min run","Brick Workout"],
    [7,  30,"Steady",                40,"Include moderate efforts",  30,"Easy run",            30,"Drills + steady",    55,"45 min bike + 10 min run","Brick Workout"],
    [8,  25,"Cutback swim",          35,"Cutback ride",              25,"Cutback run",         25,"Easy",               40,"Short brick",              "Brick Workout"],
    [9,  35,"Steady",                45,"Steady",                    30,"Easy run",            30,"Drills + steady",    60,"45 min bike + 15 min run","Brick Workout"],
    [10, 35,"Continuous",            50,"Steady, some race-pace",    30,"Easy",                30,"Drills + easy",      65,"50 min bike + 15 min run","Brick Workout"],
    [11, 30,"Taper: easy",           40,"Taper: steady",             25,"Taper: easy",         25,"Easy",               45,"35 min bike + 10 min run","Brick Workout"],
    [12, 20,"Easy",                  30,"Easy",                      20,"Easy",                0, "",                   0, "Race day!",                "Race Day 🏁"],
  ];
  const fmt = (min: number) => min > 0 ? `${min} min` : "";
  return rows.map(([week, monMin, monNote, tueMin, tueNote, wedMin, wedNote, friMin, friNote, satMin, satNote, satLabel]) => {
    const days: PlanDayEntryV2[] = [
      { dayOfWeek: "monday",    label: "Swim", notes: [fmt(monMin), monNote].filter(Boolean).join(" · ") },
      { dayOfWeek: "tuesday",   label: "Bike", notes: [fmt(tueMin), tueNote].filter(Boolean).join(" · ") },
      { dayOfWeek: "wednesday", label: "Run",  notes: [fmt(wedMin), wedNote].filter(Boolean).join(" · ") },
    ];
    if (friMin > 0) days.push({ dayOfWeek: "friday", label: "Swim", notes: [fmt(friMin), friNote].filter(Boolean).join(" · ") });
    days.push({ dayOfWeek: "saturday", label: satLabel, notes: satMin > 0 ? [fmt(satMin), satNote].filter(Boolean).join(" · ") : satNote });
    return { week, days };
  });
})();

// Couch-to-Olympic Triathlon 16-week plan
// Mon swim, Tue bike, Wed run, Thu swim (most weeks), Fri rest/run, Sat brick/race, Sun run/rest
const OLYMPIC_TRI_COUCH_TO_PLAN: WeekScheduleV2[] = (() => {
  const fmt = (min: number) => `${min} min`;
  // [week, monMin,monNote, tueMin,tueNote, wedMin,wedNote, thuMin,thuNote, friMin,friLabel,friNote, satMin,satNote,satLabel, sunMin,sunNote]
  type Row = [number, number,string, number,string, number,string, number,string, number,string,string, number,string,string, number,string];
  const rows: Row[] = [
    // Weeks 1-4: base building
    [1,  25,"Easy technique", 40,"Easy ride",            25,"Easy run",     25,"Drills",          0, "","",   45,"35 min bike + 10 min run","Brick Workout", 30,"Easy/long run"],
    [2,  25,"Easy technique", 40,"Easy ride",            25,"Easy run",     25,"Drills",          0, "","",   45,"35 min bike + 10 min run","Brick Workout", 30,"Easy/long run"],
    [3,  25,"Easy technique", 40,"Easy ride",            25,"Easy run",     25,"Drills",          0, "","",   45,"35 min bike + 10 min run","Brick Workout", 30,"Easy/long run"],
    [4,  25,"Easy technique", 40,"Easy ride",            25,"Easy run",     25,"Drills",          0, "","",   45,"35 min bike + 10 min run","Brick Workout", 30,"Easy/long run"],
    // Weeks 5-8: build
    [5,  30,"Steady",         45,"Steady",               30,"Easy",         30,"Drills + steady", 0, "","",   55,"40 min bike + 15 min run","Brick Workout", 35,"Easy/long run"],
    [6,  30,"Steady",         45,"Steady",               30,"Easy",         30,"Drills + steady", 0, "","",   55,"40 min bike + 15 min run","Brick Workout", 35,"Easy/long run"],
    [7,  30,"Steady",         45,"Steady",               30,"Easy",         30,"Drills + steady", 0, "","",   55,"40 min bike + 15 min run","Brick Workout", 35,"Easy/long run"],
    [8,  30,"Steady",         45,"Steady",               30,"Easy",         30,"Drills + steady", 0, "","",   55,"40 min bike + 15 min run","Brick Workout", 35,"Easy/long run"],
    // Weeks 9-12: peak (Friday becomes a short run)
    [9,  35,"Steady",         60,"Steady with tempo",    35,"Easy/steady",  35,"Drills + steady", 25,"Run","Short easy run", 70,"55 min bike + 15 min run","Brick Workout", 40,"Long run"],
    [10, 35,"Steady",         60,"Steady with tempo",    35,"Easy/steady",  35,"Drills + steady", 25,"Run","Short easy run", 70,"55 min bike + 15 min run","Brick Workout", 40,"Long run"],
    [11, 35,"Steady",         60,"Steady with tempo",    35,"Easy/steady",  35,"Drills + steady", 25,"Run","Short easy run", 70,"55 min bike + 15 min run","Brick Workout", 40,"Long run"],
    [12, 35,"Steady",         60,"Steady with tempo",    35,"Easy/steady",  35,"Drills + steady", 25,"Run","Short easy run", 70,"55 min bike + 15 min run","Brick Workout", 40,"Long run"],
    // Weeks 13-14: taper begins
    [13, 30,"Taper: easy",    50,"Taper: steady",        30,"Easy",         30,"Easy",            0, "","",   55,"40 min bike + 15 min run","Brick Workout", 35,"Easy long run"],
    [14, 30,"Taper: easy",    50,"Taper: steady",        30,"Easy",         30,"Easy",            0, "","",   55,"40 min bike + 15 min run","Brick Workout", 35,"Easy long run"],
    // Week 15: deep taper
    [15, 25,"Easy",           40,"Easy",                 25,"Easy",         25,"Easy",            0, "","",   45,"Short brick",             "Brick Workout", 0, ""],
    // Week 16: race week
    [16, 20,"Easy",           30,"Easy",                 20,"Easy",         0, "",                0, "","",   0, "Race day!",                "Race Day 🏁",  0, ""],
  ];
  return rows.map(([week, monMin,monNote, tueMin,tueNote, wedMin,wedNote, thuMin,thuNote, friMin,friLabel,friNote, satMin,satNote,satLabel, sunMin,sunNote]) => {
    const days: PlanDayEntryV2[] = [
      { dayOfWeek: "monday",    label: "Swim", notes: `${fmt(monMin)} · ${monNote}` },
      { dayOfWeek: "tuesday",   label: "Bike", notes: `${fmt(tueMin)} · ${tueNote}` },
      { dayOfWeek: "wednesday", label: "Run",  notes: `${fmt(wedMin)} · ${wedNote}` },
    ];
    if (thuMin > 0) days.push({ dayOfWeek: "thursday", label: "Swim", notes: `${fmt(thuMin)} · ${thuNote}` });
    if (friMin > 0) days.push({ dayOfWeek: "friday",   label: friLabel, notes: `${fmt(friMin)} · ${friNote}` });
    if (satMin > 0 || satLabel === "Race Day 🏁") days.push({ dayOfWeek: "saturday", label: satLabel, notes: satMin > 0 ? `${fmt(satMin)} · ${satNote}` : satNote });
    if (sunMin > 0) days.push({ dayOfWeek: "sunday", label: "Run", notes: `${fmt(sunMin)} · ${sunNote}` });
    return { week, days };
  });
})();

// Couch-to-5K 8-week plan (Mon/Wed/Sat, 3 days/week)
const FIVE_K_COUCH_TO_PLAN: WeekScheduleV2[] = (() => {
  // [week, mon label, mon miles, wed label, wed miles, sat miles, sat label]
  const rows: [number, string, number, string, number, number, string][] = [
    [1, "Easy run/walk", 0.5,  "Easy run/walk", 0.5,  0.75, "Easy run/walk"],
    [2, "Easy run/walk", 0.75, "Easy run/walk", 0.75, 1,    "Easy run/walk"],
    [3, "Easy run/walk", 1,    "Easy run/walk", 1,    1.5,  "Easy run"],
    [4, "Easy run/walk", 1,    "Easy run",      1.25, 1.75, "Easy run"],
    [5, "Easy run",      1.25, "Easy run",      1.5,  2,    "Easy run"],
    [6, "Easy run",      1.5,  "Easy run",      1.5,  2.25, "Easy run"],
    [7, "Easy run",      1.5,  "Easy run",      2,    2.5,  "Easy run"],
    [8, "Easy run",      1.5,  "Easy run",      2,    3.1,  "5K Race / Simulation"],
  ];
  const fmt = (n: number) => `${n} mile${n !== 1 ? "s" : ""}`;
  return rows.map(([week, monLabel, mon, wedLabel, wed, sat, satLabel]) => ({
    week,
    days: [
      { dayOfWeek: "monday",    label: monLabel, notes: fmt(mon) },
      { dayOfWeek: "wednesday", label: wedLabel, notes: fmt(wed) },
      { dayOfWeek: "saturday",  label: satLabel, notes: fmt(sat) },
    ],
  }));
})();

// Couch-to-50 Mile Ultra 28-week plan (same Tue/Thu/Sat+Sat2/Sun structure as 50K)
const FIFTY_MILE_COUCH_TO_PLAN: WeekScheduleV2[] = (() => {
  // [week, tue, sat, sat2, sun]
  const rows: [number, number, number, number, number][] = [
    [1, 3, 4, 0, 5],   [2, 3, 4, 0, 6],    [3, 3.5, 5, 0, 7],  [4, 3, 4, 0, 5],
    [5, 4, 6, 3, 8],   [6, 4, 6, 4, 10],   [7, 4.5, 7, 4, 12], [8, 3.5, 5, 3, 8],
    [9, 4.5, 8, 5, 14],[10, 5, 8, 6, 16],  [11, 5, 9, 6, 18],  [12, 4, 6, 4, 12],
    [13, 5, 10, 7, 18],[14, 5, 10, 8, 20], [15, 5, 11, 8, 22], [16, 4, 7, 5, 14],
    [17, 5, 11, 8, 22],[18, 5, 12, 8, 24], [19, 4, 8, 6, 18],  [20, 4, 8, 6, 20],
    [21, 4, 9, 7, 22], [22, 3.5, 7, 5, 16],[23, 3, 6, 4, 14],  [24, 3, 5, 3, 12],
    [25, 2.5, 4, 0, 10],[26, 2, 4, 0, 8],  [27, 2, 3, 0, 6],   [28, 1.5, 2, 0, 4],
  ];
  const fmt = (n: number) => `${n} mile${n !== 1 ? "s" : ""}`;
  return rows.map(([week, tue, sat, sat2, sun]) => ({
    week,
    days: [
      { dayOfWeek: "tuesday", label: "Easy Run", notes: fmt(tue) },
      { dayOfWeek: "thursday", label: "Rest or Cross-Train" },
      {
        dayOfWeek: "saturday",
        label: sat2 > 0 ? "Long Run + Back-to-Back" : "Long Run",
        notes: sat2 > 0 ? `${fmt(sat)} · back-to-back ${fmt(sat2)}` : fmt(sat),
      },
      { dayOfWeek: "sunday", label: "Long Run", notes: fmt(sun) },
    ],
  }));
})();

// Couch-to-10K 10-week plan
const TEN_K_COUCH_TO_PLAN: WeekScheduleV2[] = buildTueThuSunPlan([
  [1, 2, 2, 3], [2, 2, 2.5, 3.5], [3, 2.5, 2.5, 4], [4, 2, 2.5, 3],
  [5, 2.5, 3, 4.5], [6, 3, 3, 5], [7, 3, 3.5, 5.5], [8, 2.5, 3, 4.5],
  [9, 3, 3.5, 5.5], [10, 3, 3, 6.2],
], "Long Run / Race Sim");

// Couch-to-Half Marathon 16-week plan
const HALF_MARATHON_COUCH_TO_PLAN: WeekScheduleV2[] = buildEndurancePlan([
  [1, 1, 1, 2], [2, 1, 1.5, 2.5], [3, 1.5, 1.5, 3], [4, 1, 1.5, 2.5],
  [5, 1.5, 2, 3.5], [6, 2, 2, 4], [7, 2, 2.5, 5], [8, 1.5, 2, 4],
  [9, 2, 3, 6], [10, 2.5, 3, 7], [11, 3, 3, 8], [12, 2, 3, 6],
  [13, 3, 4, 9], [14, 3, 4, 10], [15, 3, 3, 8], [16, 2, 2, 6],
], "Long Run / Race Sim");

type StarterPlan = {
  id: string;
  name: string;
  description: string;
  weeks: number;
  daysPerWeek: number;
  schedule: WeekScheduleV2[];
};

const ENDURANCE_STARTER_PLANS: Record<string, StarterPlan[]> = {
  "Triathlon (Olympic)": [
    {
      id: "olympic_tri_couch_16wk",
      name: "Couch to Olympic Triathlon",
      description: "16-week plan · 5–6 days/week · Mon/Thu swim, Tue bike, Wed/Fri run, Sat brick · peak 55 min bike + 15 min run · taper Weeks 13–15 · race Week 16",
      weeks: 16,
      daysPerWeek: 6,
      schedule: OLYMPIC_TRI_COUCH_TO_PLAN,
    },
  ],
  "Triathlon (Sprint)": [
    {
      id: "sprint_tri_couch_12wk",
      name: "Couch to Sprint Triathlon",
      description: "12-week beginner plan · 5–6 days/week · swim/bike/run + weekly brick sessions · taper Week 11 · race Week 12",
      weeks: 12,
      daysPerWeek: 5,
      schedule: SPRINT_TRI_COUCH_TO_PLAN,
    },
  ],
  "5K": [
    {
      id: "5k_couch_8wk",
      name: "Couch to 5K",
      description: "8-week beginner plan · 3 days/week (Mon/Wed/Sat) · starts with run/walk intervals · race sim in Week 8",
      weeks: 8,
      daysPerWeek: 3,
      schedule: FIVE_K_COUCH_TO_PLAN,
    },
  ],
  Marathon: [
    {
      id: "marathon_couch_24wk",
      name: "Couch to Marathon",
      description: "24-week beginner plan · 4 days/week · builds from 1 → 18 miles · includes taper",
      weeks: 24,
      daysPerWeek: 4,
      schedule: MARATHON_COUCH_TO_PLAN,
    },
  ],
  "Half Marathon": [
    {
      id: "half_marathon_couch_16wk",
      name: "Couch to Half Marathon",
      description: "16-week beginner plan · 4 days/week · builds from 1 → 10 miles · race sim in Week 16",
      weeks: 16,
      daysPerWeek: 4,
      schedule: HALF_MARATHON_COUCH_TO_PLAN,
    },
  ],
  "10K": [
    {
      id: "10k_couch_10wk",
      name: "Couch to 10K",
      description: "10-week beginner plan · 3 days/week (Tue/Thu/Sun) · builds from 2 → 6.2 miles · race sim in Week 10",
      weeks: 10,
      daysPerWeek: 3,
      schedule: TEN_K_COUCH_TO_PLAN,
    },
  ],
  "50 Mile Ultra": [
    {
      id: "50mile_couch_28wk",
      name: "Couch to 50 Mile Ultra",
      description: "28-week plan · 4 days/week · Tue easy + Sat/Sun long runs · back-to-back weekends peak at 12+24 miles · taper Weeks 25–28",
      weeks: 28,
      daysPerWeek: 4,
      schedule: FIFTY_MILE_COUCH_TO_PLAN,
    },
  ],
  "50K Ultra": [
    {
      id: "50k_couch_24wk",
      name: "Couch to 50K Ultra",
      description: "24-week plan · 4 days/week · Tue easy + Sat/Sun long runs · back-to-back weekends peak at 10+22 miles · taper Weeks 20–24",
      weeks: 24,
      daysPerWeek: 4,
      schedule: FIFTY_K_COUCH_TO_PLAN,
    },
  ],
};

// ── Strength PR Plan Generator ────────────────────────────────────────────────

function generateStrengthPRPlan(exercise: string, currentMax: number, unit: string, totalWeeks: number): WeekScheduleV2[] {
  const r5 = (n: number) => Math.round(n / 5) * 5;

  function getPhase(w: number, total: number): 1 | 2 | 3 | 4 | 5 {
    if (w === total) return 5;                                    // last week = max test
    if (w === total - 1 && total >= 7) return 4;                 // penultimate (≥7w) = peak/deload
    const activeWeeks = total >= 7 ? total - 2 : total - 1;
    if (w <= Math.ceil(activeWeeks / 3)) return 1;
    if (w <= Math.ceil(activeWeeks * 2 / 3)) return 2;
    return 3;
  }

  // Per-exercise accessory blocks: each phase returns lines formatted as "Exercise — Sets×Reps @ Weight"
  // Weights are derived from % of current max or fixed values for isolation work.
  type AccBlock = { a: string[]; b: string[] }; // Day A (heavy) and Day B (volume) accessories

  function getAccessories(phase: 1|2|3|4|5): AccBlock {
    const w = (pct: number) => `${r5(currentMax * pct)}${unit}`;

    if (exercise === "Bench Press") {
      const tricepWt  = unit === "kg" ? r5(currentMax * 0.25) : r5(currentMax * 0.25);
      const inclineWt = (phase: number) => w(phase <= 2 ? 0.45 : 0.50);
      const cableRow  = unit === "kg" ? 30 : 65;
      if (phase === 1) return {
        a: [`Close-Grip Bench Press — 3×8 @ ${w(0.55)} · tricep emphasis`, `Dumbbell Flye — 3×12 @ ${r5(currentMax * 0.15)}${unit} per hand`, `Cable Tricep Pushdown — 3×12 @ ${unit === "kg" ? 15 : 35}${unit}`],
        b: [`Incline Dumbbell Press — 3×10 @ ${inclineWt(1)} per hand`, `Cable Row — 3×10 @ ${cableRow}${unit}`, `Dumbbell Lateral Raise — 3×15 @ ${unit === "kg" ? 8 : 15}${unit} per hand`],
      };
      if (phase === 2) return {
        a: [`Close-Grip Bench Press — 4×6 @ ${w(0.60)}`, `Dumbbell Flye — 3×12 @ ${r5(currentMax * 0.15)}${unit} per hand`, `Cable Tricep Pushdown — 3×12 @ ${unit === "kg" ? 18 : 40}${unit}`],
        b: [`Incline Dumbbell Press — 4×8 @ ${inclineWt(2)} per hand`, `Cable Row — 4×10 @ ${cableRow}${unit}`, `Face Pull — 3×15 @ ${unit === "kg" ? 15 : 30}${unit}`],
      };
      if (phase === 3) return {
        a: [`Close-Grip Bench Press — 4×5 @ ${w(0.65)}`, `Weighted Dip — 3×8 @ ${r5(currentMax * 0.10)}${unit} added`, `Cable Tricep Pushdown — 4×10 @ ${unit === "kg" ? 20 : 45}${unit}`],
        b: [`Incline Dumbbell Press — 4×8 @ ${inclineWt(3)} per hand`, `Cable Row — 4×10 @ ${r5(cableRow * 1.1)}${unit}`, `Face Pull — 3×15 @ ${unit === "kg" ? 15 : 30}${unit}`],
      };
      return { a: [], b: [] }; // phase 4/5 — no accessories needed
    }

    if (exercise === "Squat") {
      if (phase === 1) return {
        a: [`Leg Press — 3×10 @ ${w(0.80)}`, `Romanian Deadlift — 3×10 @ ${w(0.45)}`, `Leg Curl (machine) — 3×12 @ ${unit === "kg" ? 30 : 65}${unit}`],
        b: [`Bulgarian Split Squat — 3×10 each @ ${w(0.25)} per hand`, `Leg Extension — 3×15 @ ${unit === "kg" ? 25 : 55}${unit}`, `Standing Calf Raise — 4×15 @ ${w(0.40)}`],
      };
      if (phase === 2) return {
        a: [`Leg Press — 4×8 @ ${w(0.85)}`, `Romanian Deadlift — 4×8 @ ${w(0.50)}`, `Leg Curl (machine) — 3×12 @ ${unit === "kg" ? 35 : 75}${unit}`],
        b: [`Bulgarian Split Squat — 4×8 each @ ${w(0.28)} per hand`, `Leg Extension — 3×15 @ ${unit === "kg" ? 30 : 65}${unit}`, `Standing Calf Raise — 4×15 @ ${w(0.45)}`],
      };
      if (phase === 3) return {
        a: [`Leg Press — 4×6 @ ${w(0.90)}`, `Romanian Deadlift — 4×6 @ ${w(0.55)}`, `Leg Curl (machine) — 4×10 @ ${unit === "kg" ? 40 : 85}${unit}`],
        b: [`Bulgarian Split Squat — 4×6 each @ ${w(0.30)} per hand`, `Leg Extension — 4×12 @ ${unit === "kg" ? 35 : 75}${unit}`, `Standing Calf Raise — 4×15 @ ${w(0.50)}`],
      };
      return { a: [], b: [] };
    }

    if (exercise === "Deadlift") {
      if (phase === 1) return {
        a: [`Rack Pull (just below knee) — 3×5 @ ${w(0.85)}`, `Barbell Row — 3×8 @ ${w(0.45)}`, `Lat Pulldown — 3×12 @ ${unit === "kg" ? 45 : 100}${unit}`],
        b: [`Romanian Deadlift — 3×10 @ ${w(0.55)}`, `Cable Row — 3×12 @ ${unit === "kg" ? 45 : 100}${unit}`, `Hyperextension — 3×15 @ bodyweight`],
      };
      if (phase === 2) return {
        a: [`Rack Pull (just below knee) — 4×4 @ ${w(0.90)}`, `Barbell Row — 4×6 @ ${w(0.50)}`, `Lat Pulldown — 4×10 @ ${unit === "kg" ? 50 : 110}${unit}`],
        b: [`Romanian Deadlift — 4×8 @ ${w(0.60)}`, `Cable Row — 4×10 @ ${unit === "kg" ? 50 : 110}${unit}`, `Hyperextension — 3×15 @ ${unit === "kg" ? 10 : 25}${unit} added`],
      };
      if (phase === 3) return {
        a: [`Rack Pull (just below knee) — 4×3 @ ${w(0.95)}`, `Barbell Row — 4×5 @ ${w(0.55)}`, `Lat Pulldown — 4×10 @ ${unit === "kg" ? 55 : 120}${unit}`],
        b: [`Romanian Deadlift — 4×6 @ ${w(0.65)}`, `Cable Row — 4×10 @ ${unit === "kg" ? 55 : 120}${unit}`, `Hyperextension — 4×12 @ ${unit === "kg" ? 15 : 35}${unit} added`],
      };
      return { a: [], b: [] };
    }

    if (exercise === "Overhead Press") {
      if (phase === 1) return {
        a: [`Push Press — 3×5 @ ${w(0.75)} · explosive drive`, `Dumbbell Lateral Raise — 3×15 @ ${unit === "kg" ? 8 : 15}${unit} per hand`, `Face Pull — 3×15 @ ${unit === "kg" ? 15 : 30}${unit}`],
        b: [`Arnold Press — 3×10 @ ${w(0.35)} per hand`, `Cable Lateral Raise — 3×15 @ ${unit === "kg" ? 5 : 10}${unit} per side`, `Tricep Pushdown — 3×12 @ ${unit === "kg" ? 18 : 40}${unit}`],
      };
      if (phase === 2) return {
        a: [`Push Press — 4×4 @ ${w(0.80)}`, `Dumbbell Lateral Raise — 4×12 @ ${unit === "kg" ? 10 : 20}${unit} per hand`, `Face Pull — 4×15 @ ${unit === "kg" ? 18 : 35}${unit}`],
        b: [`Arnold Press — 4×8 @ ${w(0.38)} per hand`, `Cable Lateral Raise — 3×15 @ ${unit === "kg" ? 7 : 12}${unit} per side`, `Tricep Pushdown — 4×10 @ ${unit === "kg" ? 20 : 45}${unit}`],
      };
      if (phase === 3) return {
        a: [`Push Press — 4×3 @ ${w(0.85)}`, `Dumbbell Lateral Raise — 4×12 @ ${unit === "kg" ? 12 : 25}${unit} per hand`, `Face Pull — 4×15 @ ${unit === "kg" ? 20 : 40}${unit}`],
        b: [`Arnold Press — 4×6 @ ${w(0.40)} per hand`, `Cable Lateral Raise — 4×12 @ ${unit === "kg" ? 8 : 15}${unit} per side`, `Tricep Pushdown — 4×10 @ ${unit === "kg" ? 22 : 50}${unit}`],
      };
      return { a: [], b: [] };
    }

    // Generic fallback for custom exercises
    if (phase === 1) return {
      a: [`Accessory A1 — 3×10 @ ${w(0.50)}`, `Accessory A2 — 3×12 @ ${w(0.35)}`, `Core — 3×15 reps`],
      b: [`Accessory B1 — 3×10 @ ${w(0.45)}`, `Accessory B2 — 3×12 @ ${w(0.30)}`, `Core — 3×15 reps`],
    };
    if (phase === 2) return {
      a: [`Accessory A1 — 4×8 @ ${w(0.55)}`, `Accessory A2 — 3×12 @ ${w(0.38)}`, `Core — 3×15 reps`],
      b: [`Accessory B1 — 4×8 @ ${w(0.50)}`, `Accessory B2 — 3×12 @ ${w(0.33)}`, `Core — 3×15 reps`],
    };
    if (phase === 3) return {
      a: [`Accessory A1 — 4×6 @ ${w(0.60)}`, `Accessory A2 — 4×10 @ ${w(0.40)}`, `Core — 4×12 reps`],
      b: [`Accessory B1 — 4×6 @ ${w(0.55)}`, `Accessory B2 — 4×10 @ ${w(0.35)}`, `Core — 4×12 reps`],
    };
    return { a: [], b: [] };
  }

  return Array.from({ length: totalWeeks }, (_, i) => {
    const w = i + 1;
    const phase = getPhase(w, totalWeeks);
    const acc = getAccessories(phase as 1|2|3|4|5);

    const fmtNotes = (mainLine: string, rest: string, extras: string[]) =>
      [mainLine, `Rest: ${rest}`, ...extras].join("\n");

    let dayA: PlanDayEntryV2;
    let dayB: PlanDayEntryV2;

    if (phase === 1) {
      dayA = {
        dayOfWeek: "monday",
        label: `Heavy ${exercise} — Phase 1`,
        notes: fmtNotes(`${exercise} — 4×3 @ ${r5(currentMax * 0.80)}${unit} (80% 1RM)`, "2–3 min · leave 1–2 reps in tank", acc.a),
      };
      dayB = {
        dayOfWeek: "thursday",
        label: `Volume ${exercise} — Phase 1`,
        notes: fmtNotes(`${exercise} — 3×6 @ ${r5(currentMax * 0.70)}${unit} (70% 1RM)`, "60–90 sec", acc.b),
      };
    } else if (phase === 2) {
      dayA = {
        dayOfWeek: "monday",
        label: `Heavy ${exercise} — Phase 2`,
        notes: fmtNotes(`${exercise} — 5×3 @ ${r5(currentMax * 0.825)}${unit} (82.5% 1RM)`, `2–3 min · add 5${unit} once all reps clean`, acc.a),
      };
      dayB = {
        dayOfWeek: "thursday",
        label: `Volume ${exercise} — Phase 2`,
        notes: fmtNotes(`${exercise} — 4×6 @ ${r5(currentMax * 0.725)}${unit} (72.5% 1RM)`, "60–90 sec", acc.b),
      };
    } else if (phase === 3) {
      dayA = {
        dayOfWeek: "monday",
        label: `Heavy ${exercise} — Phase 3`,
        notes: fmtNotes(`${exercise} — 4×4 @ ${r5(currentMax * 0.85)}${unit} (85% 1RM)`, "3 min · avoid grinding to failure", acc.a),
      };
      dayB = {
        dayOfWeek: "thursday",
        label: `Volume ${exercise} — Phase 3`,
        notes: fmtNotes(`${exercise} — 4×8 @ ${r5(currentMax * 0.75)}${unit} (75% 1RM)`, "90 sec", acc.b),
      };
    } else if (phase === 4) {
      dayA = {
        dayOfWeek: "monday",
        label: `Peak ${exercise}`,
        notes: fmtNotes(`${exercise} — 3–4 singles @ ${r5(currentMax * 0.90)}${unit} (90% 1RM)`, "3–4 min full rest · dial in technique", []),
      };
      dayB = {
        dayOfWeek: "thursday",
        label: `Deload ${exercise}`,
        notes: fmtNotes(`${exercise} — 2×5 @ ${r5(currentMax * 0.60)}${unit} (60% 1RM)`, "as needed · stay fresh", []),
      };
    } else {
      dayA = {
        dayOfWeek: "monday",
        label: `Max Test — ${exercise} 🏆`,
        notes: `${exercise} — Work up to 1RM\nRest 3–4 days before · warm up thoroughly · attempt new PR!`,
      };
      dayB = {
        dayOfWeek: "thursday",
        label: "Recovery Day",
        notes: "Light mobility · no heavy pressing · rest up",
      };
    }

    return { week: w, days: [dayA, dayB] };
  });
}

const DAYS_OF_WEEK = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];
const DAY_LABELS: Record<string,string> = { monday:"Mon", tuesday:"Tue", wednesday:"Wed", thursday:"Thu", friday:"Fri", saturday:"Sat", sunday:"Sun" };

// Proper component so useState is valid (rules of hooks)
function PlanWeekAccordion({ weeks, currentWeek, templates }: { weeks: WeekScheduleV2[]; currentWeek: number; templates: WorkoutTemplate[] }) {
  const [expandedWeeks, setExpandedWeeks] = useState<number[]>([currentWeek]);
  return (
    <div className="bg-card border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b bg-muted/30">
        <p className="text-sm font-semibold">Full Plan — All {weeks.length} Weeks</p>
      </div>
      <div className="divide-y">
        {weeks.map(wk => {
          const isCurrentWk = wk.week === currentWeek;
          const isPastWk = wk.week < currentWeek;
          const isOpen = expandedWeeks.includes(wk.week);
          return (
            <div key={wk.week}>
              <button
                type="button"
                className={`w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/30 transition-colors ${isCurrentWk ? "bg-primary/5" : ""}`}
                onClick={() => setExpandedWeeks(prev => prev.includes(wk.week) ? prev.filter(w => w !== wk.week) : [...prev, wk.week])}
              >
                <div className="flex items-center gap-2.5">
                  {isPastWk
                    ? <CheckCircle2 size={14} className="text-primary shrink-0" />
                    : isCurrentWk
                      ? <Play size={14} className="text-primary shrink-0" fill="currentColor" />
                      : <div className="w-3.5 h-3.5 rounded-full border-2 border-border shrink-0" />}
                  <span className={`text-sm font-medium ${isCurrentWk ? "text-primary" : isPastWk ? "text-muted-foreground" : ""}`}>
                    Week {wk.week}{isCurrentWk && " (current)"}
                  </span>
                  <span className="text-xs text-muted-foreground">{wk.days.length} workout{wk.days.length !== 1 ? "s" : ""}</span>
                </div>
                <ChevronRight size={14} className={`text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`} />
              </button>
              {isOpen && (
                <div className="divide-y bg-muted/10">
                  {DAYS_OF_WEEK.map(day => {
                    const e = wk.days.find(d => d.dayOfWeek === day);
                    if (!e) return null;
                    return (
                      <div key={day} className="flex items-start gap-3 px-6 py-2.5">
                        <span className="text-xs font-bold uppercase text-muted-foreground w-8 shrink-0 pt-0.5">{DAY_LABELS[day]}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{e.label}</p>
                          {e.notes && <p className="text-xs text-muted-foreground">{e.notes}</p>}
                          {e.templateId && (() => {
                            const tmpl = templates.find(t => t.id === e.templateId);
                            if (!tmpl) return null;
                            let exs: any[] = [];
                            try { exs = JSON.parse(tmpl.exercisesJson); } catch { return null; }
                            if (!exs.length) return null;
                            return (
                              <div className="mt-1 space-y-0.5">
                                {exs.map((ex: any, xi: number) => {
                                  const type = ex.type ?? "";
                                  const isCardioEx = ["Run","Bike","Swim"].includes(type);
                                  const isDurEx = ["Yoga","Stretch"].includes(type);
                                  let detail = "";
                                  if (isCardioEx) {
                                    const parts = [ex.distance, ex.duration].filter(Boolean);
                                    detail = parts.join(" · ");
                                  } else if (isDurEx) {
                                    detail = ex.duration ?? "";
                                  } else {
                                    const sets = Array.isArray(ex.sets) ? ex.sets : Array.from({ length: ex.sets || 3 }, () => ({ reps: ex.reps || 8, weight: ex.weight || 0 }));
                                    if (sets.length > 0) {
                                      const allSame = sets.every((s: any) => s.reps === sets[0].reps && s.weight === sets[0].weight);
                                      if (allSame) {
                                        detail = sets[0].weight > 0
                                          ? `${sets.length}×${sets[0].reps} @ ${sets[0].weight} lbs`
                                          : `${sets.length}×${sets[0].reps}`;
                                      } else {
                                        detail = sets.map((s: any) => s.weight > 0 ? `${s.reps}@${s.weight}` : `${s.reps}`).join(", ");
                                      }
                                    }
                                  }
                                  return (
                                    <p key={xi} className="text-xs text-muted-foreground">
                                      <span className="font-medium text-foreground/70">{ex.name}</span>
                                      {detail && <span className="ml-1">— {detail}</span>}
                                    </p>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────

const EQUIPMENT_CATEGORIES = [
  { value: "barbell",        label: "Barbell & Plates",    color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" },
  { value: "dumbbell",       label: "Dumbbells",           color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  { value: "kettlebell",     label: "Kettlebells",         color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" },
  { value: "cable",          label: "Cable Machine",       color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300" },
  { value: "machine",        label: "Weight Machine",      color: "bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300" },
  { value: "pullup_bar",     label: "Pull-up Bar",         color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
  { value: "bench",          label: "Bench / Box",         color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300" },
  { value: "resistance_band",label: "Resistance Bands",    color: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300" },
  { value: "cardio",         label: "Cardio Machine",      color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
  { value: "bodyweight",     label: "Bodyweight / Rings",  color: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300" },
  { value: "other",          label: "Other",               color: "bg-secondary text-muted-foreground" },
];

const GYM_MEMBERSHIP_EQUIPMENT = [
  { name: "Barbell",           category: "barbell"         },
  { name: "Dumbbells",         category: "dumbbell"        },
  { name: "Kettlebells",       category: "kettlebell"      },
  { name: "Cable Machine",     category: "cable"           },
  { name: "Weight Machines",   category: "machine"         },
  { name: "Pull-up Bar",       category: "pullup_bar"      },
  { name: "Adjustable Bench",  category: "bench"           },
  { name: "Resistance Bands",  category: "resistance_band" },
  { name: "Treadmill",         category: "cardio"          },
  { name: "Stationary Bike",   category: "cardio"          },
  { name: "Rowing Machine",    category: "cardio"          },
];

const EXERCISE_EQUIPMENT_MAP: Record<string, string> = {
  barbell: "barbell", dumbbell: "dumbbell", kettlebell: "kettle bells",
  cable: "cable", machine: "machine", resistance_band: "bands",
  bodyweight: "body only",
};

const MUSCLE_GROUPS = [
  "abdominals", "chest", "shoulders", "biceps", "triceps", "forearms",
  "lats", "middle back", "lower back", "traps",
  "quads", "hamstrings", "glutes", "calves", "adductors", "abductors",
];

const EXERCISE_CATEGORIES = ["strength", "cardio", "stretching", "plyometrics", "powerlifting", "olympic weightlifting"];

// ── Exercise Search Modal ─────────────────────────────────────────────────────

type ExerciseResult = {
  id: string; name: string; equipment: string; primaryMuscles: string[];
  secondaryMuscles: string[]; category: string; level: string;
  force: string; mechanic: string; image: string | null; instructions: string[];
};

function ExerciseSearchModal({ open, onClose, templates }: {
  open: boolean; onClose: () => void; templates: WorkoutTemplate[];
}) {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [draftQuery, setDraftQuery] = useState("");
  const [equipFilter, setEquipFilter] = useState("all");
  const [muscleFilter, setMuscleFilter] = useState("all");
  const [catFilter, setCatFilter] = useState("all");
  const [results, setResults] = useState<ExerciseResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<ExerciseResult | null>(null);
  const [addToTemplateId, setAddToTemplateId] = useState<string>("__none__");
  const [adding, setAdding] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery(""); setDraftQuery(""); setResults([]); setSelected(null);
      setEquipFilter("all"); setMuscleFilter("all"); setCatFilter("all");
    }
  }, [open]);

  async function doSearch(q = draftQuery, eq2 = equipFilter, mf = muscleFilter, cf = catFilter) {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (eq2 !== "all") params.set("equipment", EXERCISE_EQUIPMENT_MAP[eq2] ?? eq2);
    if (mf !== "all") params.set("muscle", mf);
    if (cf !== "all") params.set("category", cf);
    if (!params.toString()) return;
    setLoading(true); setResults([]); setSelected(null); setQuery(q);
    try {
      const res = await apiRequest("GET", `/api/exercises/search?${params.toString()}`);
      const data: ExerciseResult[] = await res.json();
      setResults(data);
      if (data.length > 0) setSelected(data[0]);
    } catch { /* ignore */ } finally { setLoading(false); }
  }

  async function handleAddToTemplate() {
    if (!selected || addToTemplateId === "__none__") return;
    setAdding(true);
    try {
      const exercise = {
        name: selected.name,
        type: "Lifting",
        sets: [{ reps: 10, weight: 0 }, { reps: 10, weight: 0 }, { reps: 10, weight: 0 }],
        restSeconds: 90,
        notes: selected.instructions[0]?.slice(0, 80) ?? "",
      };
      await apiRequest("POST", `/api/workout-templates/${addToTemplateId}/add-exercise`, exercise);
      queryClient.invalidateQueries({ queryKey: ["/api/workout-templates"] });
      const t = templates.find(t => t.id === +addToTemplateId);
      toast({ title: `Added to "${t?.name}"` });
    } catch { toast({ title: "Failed to add exercise", variant: "destructive" }); }
    finally { setAdding(false); }
  }

  const muscleTag = (m: string) => (
    <span key={m} className="text-xs bg-secondary px-1.5 py-0.5 rounded-full capitalize">{m}</span>
  );

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[88vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Search size={16} /> Exercise Library
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">800+ exercises — search by name, muscle, or equipment</p>
        </DialogHeader>

        {/* Search bar + filters */}
        <div className="px-4 py-3 border-b bg-muted/30 shrink-0 space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={inputRef}
                value={draftQuery}
                onChange={e => setDraftQuery(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") doSearch(); }}
                placeholder="Search exercises… (e.g. squat, bicep curl)"
                className="pl-8 h-8 text-sm"
              />
            </div>
            <Button size="sm" onClick={() => doSearch()} disabled={loading} className="h-8">
              {loading ? <Loader2 size={13} className="animate-spin" /> : "Search"}
            </Button>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Select value={equipFilter} onValueChange={v => { setEquipFilter(v); doSearch(draftQuery, v, muscleFilter, catFilter); }}>
              <SelectTrigger className="h-7 text-xs w-40"><SelectValue placeholder="Equipment" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All equipment</SelectItem>
                {EQUIPMENT_CATEGORIES.filter(c => EXERCISE_EQUIPMENT_MAP[c.value]).map(c => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
                <SelectItem value="bodyweight">Body only</SelectItem>
              </SelectContent>
            </Select>
            <Select value={muscleFilter} onValueChange={v => { setMuscleFilter(v); doSearch(draftQuery, equipFilter, v, catFilter); }}>
              <SelectTrigger className="h-7 text-xs w-40"><SelectValue placeholder="Muscle group" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All muscles</SelectItem>
                {MUSCLE_GROUPS.map(m => <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={catFilter} onValueChange={v => { setCatFilter(v); doSearch(draftQuery, equipFilter, muscleFilter, v); }}>
              <SelectTrigger className="h-7 text-xs w-36"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {EXERCISE_CATEGORIES.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
              </SelectContent>
            </Select>
            {(equipFilter !== "all" || muscleFilter !== "all" || catFilter !== "all" || draftQuery) && (
              <button onClick={() => { setEquipFilter("all"); setMuscleFilter("all"); setCatFilter("all"); setDraftQuery(""); setResults([]); setSelected(null); }}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                <X size={12} /> Clear
              </button>
            )}
          </div>
        </div>

        {/* Two-panel results */}
        <div className="flex flex-1 min-h-0">
          {/* Results list */}
          <div className="w-40 sm:w-64 shrink-0 border-r overflow-y-auto">
            {loading && (
              <div className="flex items-center justify-center h-20 text-muted-foreground"><Loader2 size={18} className="animate-spin" /></div>
            )}
            {!loading && results.length === 0 && (
              <div className="text-center py-10 px-4 text-muted-foreground">
                <Dumbbell size={28} className="mx-auto mb-2 opacity-20" />
                <p className="text-xs">Search or filter to browse exercises</p>
              </div>
            )}
            {results.map(r => (
              <button key={r.id} onClick={() => setSelected(r)}
                className={`w-full text-left p-3 border-b transition-colors flex gap-2.5 items-start ${selected?.id === r.id ? "bg-secondary" : "hover:bg-secondary/50"}`}>
                {r.image && (
                  <img src={r.image} alt={r.name} className="w-10 h-10 rounded object-cover shrink-0 bg-muted" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium leading-snug line-clamp-2">{r.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 capitalize">{r.equipment}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {r.primaryMuscles.slice(0, 2).map(m => (
                      <span key={m} className="text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1.5 rounded-full capitalize">{m}</span>
                    ))}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Preview panel */}
          <div className="flex-1 overflow-y-auto p-4 min-w-0">
            {selected ? (
              <div className="space-y-4">
                <div className="flex gap-4">
                  {selected.image && (
                    <img src={selected.image} alt={selected.name} className="w-28 h-28 rounded-lg object-cover bg-muted shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-base leading-tight">{selected.name}</h3>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <Badge variant="secondary" className="capitalize text-xs">{selected.equipment}</Badge>
                      <Badge variant="outline" className="capitalize text-xs">{selected.level}</Badge>
                      {selected.force && <Badge variant="outline" className="capitalize text-xs">{selected.force}</Badge>}
                      {selected.mechanic && <Badge variant="outline" className="capitalize text-xs">{selected.mechanic}</Badge>}
                    </div>
                  </div>
                </div>

                {selected.primaryMuscles.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Primary Muscles</p>
                    <div className="flex flex-wrap gap-1">{selected.primaryMuscles.map(muscleTag)}</div>
                  </div>
                )}
                {selected.secondaryMuscles.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Secondary Muscles</p>
                    <div className="flex flex-wrap gap-1">{selected.secondaryMuscles.map(muscleTag)}</div>
                  </div>
                )}
                {selected.instructions.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Instructions</p>
                    <ol className="space-y-1.5 list-none">
                      {selected.instructions.map((step, i) => (
                        <li key={i} className="flex gap-2 text-xs text-muted-foreground">
                          <span className="w-5 h-5 rounded-full bg-secondary text-foreground flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">{i + 1}</span>
                          <span className="leading-relaxed">{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {/* Add to template */}
                <div className="border rounded-xl p-3 bg-muted/30 space-y-2">
                  <p className="text-xs font-semibold">Add to a workout template</p>
                  <div className="flex gap-2">
                    <Select value={addToTemplateId} onValueChange={setAddToTemplateId}>
                      <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="Select template…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Select a template…</SelectItem>
                        {templates.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button size="sm" className="h-8 gap-1" disabled={addToTemplateId === "__none__" || adding} onClick={handleAddToTemplate}>
                      {adding ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Add
                    </Button>
                  </div>
                  {templates.length === 0 && (
                    <p className="text-xs text-muted-foreground">Create a template first to add exercises to it.</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center">
                  <ChevronRight size={24} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Select an exercise to see details</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Generate Workout Plan Modal ────────────────────────────────────────────────

type GeneratedDay = {
  dayLabel: string; name: string; workoutType: string;
  durationEstimate: string; exercises: any[];
};
type GeneratedPlan = {
  planName: string; description: string; days: GeneratedDay[];
};

function GenerateWorkoutPlanModal({ open, onClose, userEquipment, goals }: {
  open: boolean; onClose: () => void;
  userEquipment: Equipment[]; goals: GoalWithProjects[];
}) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selectedEquip, setSelectedEquip] = useState<string[]>([]);
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [daysPerWeek, setDaysPerWeek] = useState("3");
  const [focus, setFocus] = useState("general fitness");
  const [level, setLevel] = useState("intermediate");
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [generating, setGenerating] = useState(false);
  const [plan, setPlan] = useState<GeneratedPlan | null>(null);
  const [savingDay, setSavingDay] = useState<number | null>(null);
  const [savedDays, setSavedDays] = useState<Set<number>>(new Set());
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);

  useEffect(() => {
    if (open) {
      // Pre-select all user equipment
      setSelectedEquip(userEquipment.map(e => e.name));
      setPlan(null); setSavedDays(new Set());
      // Check if API key is set
      apiRequest("GET", "/api/user/api-key/status").then(r => r.json()).then((d: any) => setHasApiKey(!!d.hasKey));
    }
  }, [open, userEquipment]);

  async function handleGenerate() {
    setGenerating(true); setPlan(null);
    try {
      const res = await apiRequest("POST", "/api/workout/generate", {
        equipmentList: selectedEquip,
        goalsList: selectedGoals,
        daysPerWeek: parseInt(daysPerWeek),
        focus, level, additionalNotes,
      });
      if (!res.ok) {
        const err = await res.json() as any;
        if (err.error === "no_api_key") {
          toast({ title: "Anthropic API key required", description: "Add your API key in Settings to use AI features.", variant: "destructive" });
        } else {
          toast({ title: "Generation failed", description: err.message ?? "Try again", variant: "destructive" });
        }
        return;
      }
      const data: GeneratedPlan = await res.json();
      setPlan(data);
    } catch {
      toast({ title: "Generation failed", description: "Check your API key and try again.", variant: "destructive" });
    } finally { setGenerating(false); }
  }

  async function saveDay(day: GeneratedDay, index: number) {
    setSavingDay(index);
    try {
      // Convert AI exercises to our template format
      const exercises = day.exercises.map((ex: any) => {
        if (ex.distance || ex.duration && !ex.sets) {
          // Cardio / duration-only
          return { name: ex.name, type: ex.type ?? "Run", sets: [], distance: ex.distance ?? "", duration: ex.duration ?? "", restSeconds: 0, notes: ex.notes ?? "" };
        }
        return { name: ex.name, type: ex.type ?? "Lifting", sets: ex.sets ?? [{ reps: 10, weight: 0 }], restSeconds: ex.restSeconds ?? 90, notes: ex.notes ?? "" };
      });
      await apiRequest("POST", "/api/workout-templates", {
        name: day.name,
        workoutType: day.workoutType ?? "custom",
        scheduledDay: null,
        recurring: "none",
        notes: `Generated plan: ${plan?.planName}. Est. duration: ${day.durationEstimate}`,
        linkedGoalId: null,
        exercisesJson: JSON.stringify(exercises),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/workout-templates"] });
      setSavedDays(s => new Set([...s, index]));
      toast({ title: `"${day.name}" saved as template` });
    } catch {
      toast({ title: "Failed to save template", variant: "destructive" });
    } finally { setSavingDay(null); }
  }

  async function saveAllDays() {
    if (!plan) return;
    for (let i = 0; i < plan.days.length; i++) {
      if (!savedDays.has(i)) await saveDay(plan.days[i], i);
    }
  }

  const fitnessGoals = goals.filter(g => g.category === "fitness" || g.category === "health");

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles size={16} className="text-purple-500" /> Generate Workout Plan
          </DialogTitle>
        </DialogHeader>

        {hasApiKey === false && (
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm text-amber-800 dark:text-amber-300 flex gap-2 items-start">
            <Info size={14} className="shrink-0 mt-0.5" />
            <span>
              AI plan generation requires an Anthropic API key.{" "}
              <button className="underline font-medium" onClick={() => { onClose(); setLocation("/settings"); }}>Add it in Settings</button>.
            </span>
          </div>
        )}

        {!plan ? (
          <div className="space-y-5 pt-1">
            {/* Equipment selection */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Available Equipment</p>
              <p className="text-xs text-muted-foreground">Select what you'll be training with</p>
              {userEquipment.length === 0 ? (
                <p className="text-xs text-muted-foreground border rounded-lg p-3 bg-muted/30">
                  No equipment saved yet. Add equipment in the Equipment tab, or type custom equipment below.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {userEquipment.map(e => {
                    const active = selectedEquip.includes(e.name);
                    const cat = EQUIPMENT_CATEGORIES.find(c => c.value === e.category);
                    return (
                      <button key={e.id}
                        onClick={() => setSelectedEquip(p => active ? p.filter(n => n !== e.name) : [...p, e.name])}
                        className={`px-3 py-1.5 rounded-lg text-sm border transition-all flex items-center gap-1.5 ${active ? "border-primary bg-primary/10 text-primary" : "border-transparent bg-secondary text-muted-foreground hover:text-foreground"}`}>
                        {active && <CheckCircle2 size={12} />}
                        {e.name}
                        {cat && <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${cat.color}`}>{cat.label}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
              <Input
                value={selectedEquip.filter(e => !userEquipment.map(u => u.name).includes(e)).join(", ")}
                onChange={e => {
                  const custom = e.target.value.split(",").map(s => s.trim()).filter(Boolean);
                  const saved = userEquipment.map(u => u.name).filter(n => selectedEquip.includes(n));
                  setSelectedEquip([...saved, ...custom]);
                }}
                placeholder="Add custom equipment (comma-separated)…"
                className="h-8 text-sm"
              />
            </div>

            {/* Goals */}
            {fitnessGoals.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Fitness Goals <span className="text-muted-foreground font-normal text-xs">(optional)</span></p>
                <div className="flex flex-wrap gap-2">
                  {fitnessGoals.map(g => {
                    const active = selectedGoals.includes(g.title);
                    return (
                      <button key={g.id}
                        onClick={() => setSelectedGoals(p => active ? p.filter(t => t !== g.title) : [...p, g.title])}
                        className={`px-3 py-1.5 rounded-lg text-sm border transition-all flex items-center gap-1.5 ${active ? "border-primary bg-primary/10 text-primary" : "border-transparent bg-secondary text-muted-foreground hover:text-foreground"}`}>
                        {active && <CheckCircle2 size={12} />}
                        {g.title}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Preferences */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Days / Week</label>
                <Select value={daysPerWeek} onValueChange={setDaysPerWeek}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["2", "3", "4", "5", "6"].map(d => <SelectItem key={d} value={d}>{d} days</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Focus</label>
                <Select value={focus} onValueChange={setFocus}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["general fitness", "strength", "hypertrophy", "endurance", "weight loss", "mobility", "athletic"].map(f => (
                      <SelectItem key={f} value={f} className="capitalize">{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Level</label>
                <Select value={level} onValueChange={setLevel}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">Beginner</SelectItem>
                    <SelectItem value="intermediate">Intermediate</SelectItem>
                    <SelectItem value="advanced">Advanced</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Additional notes <span className="font-normal">(optional)</span></label>
              <Textarea
                value={additionalNotes}
                onChange={e => setAdditionalNotes(e.target.value)}
                rows={2}
                placeholder="e.g. bad knees, prefer compound movements, short on time…"
              />
            </div>

            <Button onClick={handleGenerate} disabled={generating || hasApiKey === false} className="w-full gap-2">
              {generating ? <><Loader2 size={14} className="animate-spin" /> Generating your plan…</> : <><Sparkles size={14} /> Generate Plan</>}
            </Button>
          </div>
        ) : (
          <div className="space-y-4 pt-1">
            {/* Plan overview */}
            <div className="bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950/20 dark:to-blue-950/20 border border-purple-200/50 dark:border-purple-800/50 rounded-xl p-4">
              <h3 className="font-semibold text-base">{plan.planName}</h3>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{plan.description}</p>
            </div>

            {/* Days */}
            <div className="space-y-3">
              {plan.days.map((day, i) => (
                <div key={i} className="border rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 bg-secondary/30 border-b">
                    <div>
                      <p className="font-semibold text-sm">{day.name}</p>
                      <p className="text-xs text-muted-foreground">{day.dayLabel} · {day.durationEstimate}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs bg-secondary px-2 py-0.5 rounded capitalize">{WORKOUT_TYPE_LABELS[day.workoutType] ?? day.workoutType}</span>
                      {savedDays.has(i) ? (
                        <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
                          <CheckCircle2 size={13} /> Saved
                        </span>
                      ) : (
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                          disabled={savingDay === i}
                          onClick={() => saveDay(day, i)}>
                          {savingDay === i ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                          Save as Template
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="p-3 space-y-1.5">
                    {day.exercises.map((ex: any, j: number) => (
                      <div key={j} className="flex items-start gap-2.5 text-xs py-1.5 border-b last:border-0">
                        <span className="w-5 h-5 rounded-full bg-secondary flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">{j + 1}</span>
                        <div className="flex-1 min-w-0">
                          <span className="font-medium">{ex.name}</span>
                          <span className="text-muted-foreground ml-2">
                            {ex.sets ? `${ex.sets.length} sets × ${ex.sets[0]?.reps} reps` : ""}
                            {ex.distance ? ex.distance : ""}
                            {ex.duration ? ` · ${ex.duration}` : ""}
                            {ex.restSeconds ? ` · ${ex.restSeconds}s rest` : ""}
                          </span>
                          {ex.notes && <p className="text-muted-foreground italic mt-0.5">{ex.notes}</p>}
                        </div>
                        <Badge variant="outline" className="text-[10px] py-0 shrink-0">{ex.type}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button className="flex-1 gap-1.5" onClick={saveAllDays}
                disabled={savedDays.size === plan.days.length}>
                {savedDays.size === plan.days.length ? <><CheckCircle2 size={14} /> All Saved!</> : <><Plus size={14} /> Save All as Templates</>}
              </Button>
              <Button variant="outline" onClick={() => setPlan(null)}>
                Regenerate
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Equipment Add/Edit Modal ───────────────────────────────────────────────────

function EquipmentModal({ open, onClose, editing }: {
  open: boolean; onClose: () => void; editing: Equipment | null;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("other");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? "");
      setCategory(editing?.category ?? "other");
      setNotes(editing?.notes ?? "");
    }
  }, [open, editing]);

  const createMut = useMutation({
    mutationFn: (d: any) => apiRequest("POST", "/api/equipment", d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/equipment"] }); onClose(); },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });
  const updateMut = useMutation({
    mutationFn: (d: any) => apiRequest("PATCH", `/api/equipment/${editing?.id}`, d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/equipment"] }); onClose(); },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  function handleSave() {
    if (!name.trim()) return;
    const payload = { name: name.trim(), category, notes: notes.trim() || null };
    editing ? updateMut.mutate(payload) : createMut.mutate(payload);
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Equipment" : "Add Equipment"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Name *</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. 45lb Barbell, 25lb Kettlebell" autoFocus />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Category</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EQUIPMENT_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Notes <span className="font-normal">(optional)</span></label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. adjustable, 5–50 lb" />
          </div>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={handleSave} disabled={!name.trim() || createMut.isPending || updateMut.isPending}>
              {editing ? "Save Changes" : "Add Equipment"}
            </Button>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Plan Builder Modal ────────────────────────────────────────────────────────

type GoalType = "strength_pr" | "endurance" | "body_composition" | "general";
type DayEditMode = "rest" | "template" | "custom";

const GOAL_TYPES: { value: GoalType; label: string; icon: React.ReactNode; desc: string; color: string }[] = [
  { value: "strength_pr", label: "Strength PR", icon: <Trophy size={18} />, desc: "Hit a new max on a lift", color: "border-orange-300 bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:border-orange-700 dark:text-orange-300" },
  { value: "endurance", label: "Endurance Race", icon: <TrendingUp size={18} />, desc: "Train for a run or race", color: "border-blue-300 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:border-blue-700 dark:text-blue-300" },
  { value: "body_composition", label: "Body Composition", icon: <Heart size={18} />, desc: "Weight, fat %, or muscle", color: "border-green-300 bg-green-50 text-green-700 dark:bg-green-950/30 dark:border-green-700 dark:text-green-300" },
  { value: "general", label: "General Fitness", icon: <Dumbbell size={18} />, desc: "Build habit & consistency", color: "border-purple-300 bg-purple-50 text-purple-700 dark:bg-purple-950/30 dark:border-purple-700 dark:text-purple-300" },
];

const RACE_DISTANCES = ["5K", "10K", "Half Marathon", "Marathon", "50K Ultra", "50 Mile Ultra", "Triathlon (Sprint)", "Triathlon (Olympic)", "Triathlon (Ironman)", "Custom"];

function PlanBuilderModal({ open, onClose, editing, templates, onBodyCompSelected, onGeneralFitnessSelected }: {
  open: boolean; onClose: () => void;
  editing: WorkoutPlan | null; templates: WorkoutTemplate[];
  onBodyCompSelected?: () => void;
  onGeneralFitnessSelected?: () => void;
}) {
  const { toast } = useToast();
  const [step, setStep] = useState<"goal" | "details" | "schedule">("goal");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [durationWeeks, setDurationWeeks] = useState("12");
  const [scheduleByWeek, setScheduleByWeek] = useState<WeekScheduleV2[]>([]);
  const [viewWeek, setViewWeek] = useState(1);
  const [editingDay, setEditingDay] = useState<string | null>(null);
  const [dayMode, setDayMode] = useState<DayEditMode>("rest");
  const [dayTemplateId, setDayTemplateId] = useState<number | null>(null);
  const [dayLabel, setDayLabel] = useState("");
  const [dayNotes, setDayNotes] = useState("");
  const [goalType, setGoalType] = useState<GoalType>("general");

  // Strength PR
  const [exercise, setExercise] = useState("");
  const [currentWeight, setCurrentWeight] = useState("");
  const [targetWeight, setTargetWeight] = useState("");
  const [weightUnit, setWeightUnit] = useState("lbs");

  // Endurance
  const [raceDistance, setRaceDistance] = useState("Marathon");
  const [raceDate, setRaceDate] = useState("");
  const [currentDistance, setCurrentDistance] = useState("");
  const [distanceUnit, setDistanceUnit] = useState("miles");

  // Body Composition
  const [bodyMetric, setBodyMetric] = useState("weight");
  const [bodyCurrentValue, setBodyCurrentValue] = useState("");
  const [bodyTargetValue, setBodyTargetValue] = useState("");
  const [bodyUnit, setBodyUnit] = useState("lbs");

  // Body Fat % calculator (Navy tape method)
  const [bfCalcOpen, setBfCalcOpen] = useState(false);
  const [bfSex, setBfSex] = useState<"male"|"female">("male");
  const [bfHeightIn, setBfHeightIn] = useState("");
  const [bfNeckIn, setBfNeckIn] = useState("");
  const [bfWaistIn, setBfWaistIn] = useState("");
  const [bfHipsIn, setBfHipsIn] = useState("");

  // Muscle Mass calculator (from weight + BF%)
  const [mmCalcOpen, setMmCalcOpen] = useState(false);
  const [mmWeightLbs, setMmWeightLbs] = useState("");
  const [mmBfPct, setMmBfPct] = useState("");

  // Milestones (auto-generated based on goal)
  const [milestones, setMilestones] = useState<WorkoutPlanMilestone[]>([]);

  // Schedule helpers
  function getWeekDays(week: number): PlanDayEntryV2[] {
    return scheduleByWeek.find(w => w.week === week)?.days ?? [];
  }
  function getDayEntry(week: number, day: string): PlanDayEntryV2 | null {
    return getWeekDays(week).find(d => d.dayOfWeek === day) ?? null;
  }
  function upsertDayEntry(week: number, dayOfWeek: string, entry: PlanDayEntryV2 | null) {
    setScheduleByWeek(prev => {
      const days = (prev.find(w => w.week === week)?.days ?? []).filter(d => d.dayOfWeek !== dayOfWeek);
      const newDays = entry ? [...days, entry] : days;
      const withoutWeek = prev.filter(w => w.week !== week);
      return [...withoutWeek, { week, days: newDays }].sort((a, b) => a.week - b.week);
    });
  }
  function copyWeekTo(fromWeek: number, toWeek: number) {
    setScheduleByWeek(prev => {
      const src = prev.find(w => w.week === fromWeek)?.days ?? [];
      const withoutTo = prev.filter(w => w.week !== toWeek);
      return [...withoutTo, { week: toWeek, days: src.map(d => ({ ...d })) }].sort((a, b) => a.week - b.week);
    });
  }

  function openDayEditor(day: string) {
    const entry = getDayEntry(viewWeek, day);
    setEditingDay(day);
    if (!entry) {
      setDayMode("rest"); setDayTemplateId(null); setDayLabel(""); setDayNotes("");
    } else if (entry.templateId) {
      setDayMode("template"); setDayTemplateId(entry.templateId); setDayLabel(""); setDayNotes(entry.notes ?? "");
    } else {
      setDayMode("custom"); setDayTemplateId(null); setDayLabel(entry.label); setDayNotes(entry.notes ?? "");
    }
  }

  function commitDayEdit() {
    if (!editingDay) return;
    if (dayMode === "rest") {
      upsertDayEntry(viewWeek, editingDay, null);
    } else if (dayMode === "template" && dayTemplateId) {
      const tmpl = templates.find(t => t.id === dayTemplateId);
      upsertDayEntry(viewWeek, editingDay, { dayOfWeek: editingDay, label: tmpl?.name ?? "Workout", templateId: dayTemplateId, notes: dayNotes || undefined });
    } else if (dayMode === "custom" && dayLabel.trim()) {
      upsertDayEntry(viewWeek, editingDay, { dayOfWeek: editingDay, label: dayLabel.trim(), templateId: null, notes: dayNotes.trim() || undefined });
    }
    setEditingDay(null);
  }

  useEffect(() => {
    if (!open) return;
    const dur = editing?.durationWeeks ?? 12;
    setName(editing?.name ?? "");
    setDescription(editing?.description ?? "");
    setDurationWeeks(String(dur));
    const preselected = !editing && sessionStorage.getItem("newPlanGoalType");
    if (preselected) {
      sessionStorage.removeItem("newPlanGoalType");
      setGoalType(preselected as GoalType);
      setStep("details");
    } else {
      setGoalType((editing?.goalType as GoalType) ?? "general");
      setStep(editing ? "details" : "goal");
    }
    setEditingDay(null);
    setViewWeek(1);

    // Parse schedule - handle both old and new formats
    try {
      const parsed = parseSchedule(editing?.scheduleJson ?? "[]");
      if (parsed.isV2) {
        setScheduleByWeek(parsed.weeks);
      } else {
        // Convert old flat format to week 1 of new format
        const days = parsed.flatDays.map(e => ({
          dayOfWeek: e.dayOfWeek,
          label: e.label ?? e.templateName ?? "Workout",
          templateId: e.templateId ?? null,
        }));
        setScheduleByWeek(days.length > 0 ? [{ week: 1, days }] : []);
      }
    } catch { setScheduleByWeek([]); }

    try { setMilestones(editing?.milestonesJson ? JSON.parse(editing.milestonesJson) : []); } catch { setMilestones([]); }

    // Parse existing goal metric
    try {
      const m = editing?.goalMetricJson ? JSON.parse(editing.goalMetricJson) : null;
      if (m) {
        if (editing?.goalType === "strength_pr") {
          setExercise(m.exercise ?? ""); setCurrentWeight(String(m.currentValue ?? "")); setTargetWeight(String(m.targetValue ?? "")); setWeightUnit(m.unit ?? "lbs");
        } else if (editing?.goalType === "endurance") {
          setRaceDistance(m.raceDistance ?? "Marathon"); setRaceDate(m.raceDate ?? ""); setCurrentDistance(String(m.currentDistance ?? "")); setDistanceUnit(m.unit ?? "miles");
        } else if (editing?.goalType === "body_composition") {
          setBodyMetric(m.metric ?? "weight"); setBodyCurrentValue(String(m.currentValue ?? "")); setBodyTargetValue(String(m.targetValue ?? "")); setBodyUnit(m.unit ?? "lbs");
        }
      }
    } catch {}
  }, [open, editing]);

  // Auto-generate milestones when goal type or duration changes
  function generateMilestones(type: GoalType, weeks: number): WorkoutPlanMilestone[] {
    const w = parseInt(String(weeks));
    if (type === "strength_pr") {
      const checkpoints = [Math.round(w * 0.25), Math.round(w * 0.5), Math.round(w * 0.75), w];
      return checkpoints.filter(c => c > 0).map((wk, i) => ({
        week: wk,
        description: i === 0 ? "Form check & baseline test" : i === 1 ? "Mid-program deload & retest" : i === 2 ? "Peak intensity week" : "Final PR attempt 🏆",
      }));
    } else if (type === "endurance") {
      const checkpoints = [Math.round(w * 0.2), Math.round(w * 0.4), Math.round(w * 0.6), Math.round(w * 0.8), w];
      const labels = ["Base building complete", "Long run milestone", "Peak training week", "Taper begins", "Race week 🏁"];
      return checkpoints.filter(c => c > 0).map((wk, i) => ({ week: wk, description: labels[i] ?? `Week ${wk} check-in` }));
    } else if (type === "body_composition") {
      const checkpoints = [4, 8, 12, w].filter(c => c <= w && c > 0);
      return [...new Set(checkpoints)].map(wk => ({ week: wk, description: `Week ${wk} progress check-in` }));
    }
    return [];
  }

  function calcStrengthWeeks(current: number, target: number): number {
    if (target > current) return Math.max(8, Math.ceil((target - current) / 5) * 4);
    return 8;
  }

  function handleSelectGoalType(type: GoalType) {
    if (type === "body_composition" && onBodyCompSelected) {
      onClose();
      onBodyCompSelected();
      return;
    }
    if (type === "general" && onGeneralFitnessSelected) {
      onClose();
      onGeneralFitnessSelected();
      return;
    }
    setGoalType(type);
    const dur = type === "endurance" ? "16" : type === "strength_pr" ? "8" : type === "body_composition" ? "12" : "8";
    setDurationWeeks(dur);
    setMilestones(generateMilestones(type, parseInt(dur)));
    setStep("details");
  }

  function buildGoalMetricJson(): string | null {
    if (goalType === "strength_pr") {
      if (!exercise) return null;
      return JSON.stringify({ exercise, currentValue: parseFloat(currentWeight) || 0, targetValue: parseFloat(targetWeight) || 0, unit: weightUnit });
    } else if (goalType === "endurance") {
      return JSON.stringify({ raceDistance, raceDate, currentDistance: parseFloat(currentDistance) || 0, unit: distanceUnit });
    } else if (goalType === "body_composition") {
      return JSON.stringify({ metric: bodyMetric, currentValue: parseFloat(bodyCurrentValue) || 0, targetValue: parseFloat(bodyTargetValue) || 0, unit: bodyUnit });
    }
    return null;
  }

  function autoName(): string {
    if (goalType === "strength_pr" && exercise) return `${exercise} PR Program`;
    if (goalType === "endurance" && raceDistance) return `${raceDistance} Training Plan`;
    if (goalType === "body_composition") return `Body Composition Plan`;
    return "My Training Plan";
  }

  const createMut = useMutation({
    mutationFn: (d: any) => apiRequest("POST", "/api/workout-plans", d).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/workout-plans"] }); toast({ title: "Plan created!" }); onClose(); },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });
  const updateMut = useMutation({
    mutationFn: (d: any) => apiRequest("PATCH", `/api/workout-plans/${editing?.id}`, d).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/workout-plans"] }); toast({ title: "Plan updated!" }); onClose(); },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  function handleSave() {
    const finalName = name.trim() || autoName();
    const payload = {
      name: finalName,
      description: description.trim() || null,
      durationWeeks: parseInt(durationWeeks),
      scheduleJson: JSON.stringify(scheduleByWeek),
      goalType,
      goalMetricJson: buildGoalMetricJson(),
      startDate: editing?.startDate ?? new Date().toISOString().slice(0, 10),
      milestonesJson: JSON.stringify(milestones),
    };
    editing ? updateMut.mutate(payload) : createMut.mutate(payload);
  }

  const totalWeeks = parseInt(durationWeeks);
  const currentWeekDays = getWeekDays(viewWeek).length;
  const isPending = createMut.isPending || updateMut.isPending;

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays size={16} /> {editing ? "Edit Plan" : "New Training Plan"}
          </DialogTitle>
        </DialogHeader>

        {/* Step: Goal Type */}
        {step === "goal" && (
          <div className="space-y-3 pt-1">
            <p className="text-sm text-muted-foreground">What's your main goal for this plan?</p>
            <div className="grid grid-cols-2 gap-3">
              {GOAL_TYPES.map(g => (
                <button
                  key={g.value}
                  onClick={() => handleSelectGoalType(g.value)}
                  className={`flex flex-col items-start gap-2 p-4 rounded-xl border-2 text-left transition-all hover:scale-[1.02] active:scale-[0.98] ${g.color}`}
                >
                  {g.icon}
                  <div>
                    <p className="font-semibold text-sm leading-tight">{g.label}</p>
                    <p className="text-xs opacity-70 mt-0.5">{g.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step: Details */}
        {step === "details" && (
          <div className="space-y-4 pt-1">
            {/* Goal type chip */}
            <div className="flex items-center gap-2">
              {!editing && (
                <button onClick={() => setStep("goal")} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                  ← Back
                </button>
              )}
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${GOAL_TYPES.find(g => g.value === goalType)?.color}`}>
                {GOAL_TYPES.find(g => g.value === goalType)?.label}
              </span>
            </div>

            {/* Goal-specific inputs */}
            {goalType === "strength_pr" && (
              <div className="space-y-3 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded-xl p-4">
                <p className="text-xs font-semibold text-orange-700 dark:text-orange-300 flex items-center gap-1.5"><Trophy size={13} /> Strength Goal</p>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Exercise (e.g. Bench Press, Squat, Deadlift)</label>
                  <Input value={exercise} onChange={e => setExercise(e.target.value)} placeholder="Bench Press" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Current max</label>
                    <Input type="number" value={currentWeight} onChange={e => {
                      setCurrentWeight(e.target.value);
                      const cur = parseFloat(e.target.value);
                      const tgt = parseFloat(targetWeight);
                      if (cur > 0 && tgt > cur) { const w = calcStrengthWeeks(cur, tgt); setDurationWeeks(String(w)); setMilestones(generateMilestones("strength_pr", w)); }
                    }} placeholder="185" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Target max</label>
                    <Input type="number" value={targetWeight} onChange={e => {
                      setTargetWeight(e.target.value);
                      const tgt = parseFloat(e.target.value);
                      const cur = parseFloat(currentWeight);
                      if (tgt > cur && cur > 0) { const w = calcStrengthWeeks(cur, tgt); setDurationWeeks(String(w)); setMilestones(generateMilestones("strength_pr", w)); }
                    }} placeholder="225" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Unit</label>
                    <Select value={weightUnit} onValueChange={setWeightUnit}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="lbs">lbs</SelectItem><SelectItem value="kg">kg</SelectItem></SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}

            {/* Suggested Strength Program card */}
            {goalType === "strength_pr" && exercise.trim() && parseFloat(currentWeight) > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <Sparkles size={12} className="text-orange-500" /> Suggested Program
                </p>
                {(() => {
                  const current = parseFloat(currentWeight);
                  const target = parseFloat(targetWeight);
                  const weeks = target > current && current > 0
                    ? calcStrengthWeeks(current, target)
                    : parseInt(durationWeeks) || 8;
                  const gap = target > current ? target - current : 0;
                  const isLoaded = scheduleByWeek.length === weeks &&
                    scheduleByWeek[0]?.days[0]?.label?.includes(exercise);
                  const phases = weeks >= 7 ? "5 phases (base → build → strength → peak → max test)" : "4 phases (base → build → strength → max test)";
                  return (
                    <div className={`flex items-start gap-3 rounded-xl border-2 p-3 transition-all ${isLoaded ? "border-orange-400 bg-orange-50 dark:bg-orange-950/30" : "border-border bg-card"}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">{weeks}-Week {exercise} Program</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          2 days/week (Mon heavy + Thu volume) · {phases}
                        </p>
                        {gap > 0 && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            +{gap}{weightUnit} goal → 4 weeks per 5{weightUnit} increase
                          </p>
                        )}
                        {isLoaded && (
                          <p className="text-xs text-orange-600 dark:text-orange-400 font-medium mt-1 flex items-center gap-1">
                            <CheckCircle2 size={11} /> Loaded — customize in the schedule builder
                          </p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant={isLoaded ? "outline" : "default"}
                        className="shrink-0 h-8 text-xs gap-1.5"
                        onClick={() => {
                          const plan = generateStrengthPRPlan(exercise, current, weightUnit, weeks);
                          setScheduleByWeek(plan);
                          setDurationWeeks(String(weeks));
                          setMilestones(generateMilestones("strength_pr", weeks));
                          if (!name.trim()) setName(`${exercise} PR Program`);
                        }}
                      >
                        {isLoaded ? "Regenerate" : <><Zap size={11} /> Generate Plan</>}
                      </Button>
                    </div>
                  );
                })()}
              </div>
            )}

            {goalType === "endurance" && (
              <div className="space-y-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 flex items-center gap-1.5"><TrendingUp size={13} /> Race Goal</p>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Race Distance</label>
                  <Select value={raceDistance} onValueChange={setRaceDistance}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>{RACE_DISTANCES.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Race Date</label>
                    <Input type="date" value={raceDate} onChange={e => setRaceDate(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Current longest run</label>
                    <div className="flex gap-1">
                      <Input type="number" value={currentDistance} onChange={e => setCurrentDistance(e.target.value)} placeholder="6" className="flex-1" />
                      <Select value={distanceUnit} onValueChange={setDistanceUnit}>
                        <SelectTrigger className="h-9 w-20"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="miles">mi</SelectItem><SelectItem value="km">km</SelectItem></SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Starter plan picker — shown when a matching race distance has built-in templates */}
            {goalType === "endurance" && ENDURANCE_STARTER_PLANS[raceDistance] && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <Sparkles size={12} className="text-blue-500" /> Starter Training Plans
                </p>
                {ENDURANCE_STARTER_PLANS[raceDistance].map(sp => {
                  const isLoaded = scheduleByWeek.length === sp.weeks && scheduleByWeek[0]?.days[0]?.label === sp.schedule[0]?.days[0]?.label;
                  return (
                    <div key={sp.id} className={`flex items-start gap-3 rounded-xl border-2 p-3 transition-all ${isLoaded ? "border-blue-400 bg-blue-50 dark:bg-blue-950/30" : "border-border bg-card"}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">{sp.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{sp.description}</p>
                        {isLoaded && (
                          <p className="text-xs text-blue-600 dark:text-blue-400 font-medium mt-1 flex items-center gap-1">
                            <CheckCircle2 size={11} /> Loaded — customize in the schedule builder
                          </p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant={isLoaded ? "outline" : "default"}
                        className="shrink-0 h-8 text-xs gap-1.5"
                        onClick={() => {
                          setScheduleByWeek(sp.schedule);
                          setDurationWeeks(String(sp.weeks));
                          setMilestones(generateMilestones("endurance", sp.weeks));
                          if (!name.trim()) setName(sp.name);
                        }}
                      >
                        {isLoaded ? "Reload" : <><Plus size={11} /> Use Plan</>}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            {goalType === "body_composition" && (
              <div className="space-y-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-xl p-4">
                <p className="text-xs font-semibold text-green-700 dark:text-green-300 flex items-center gap-1.5"><Heart size={13} /> Body Goal</p>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Metric</label>
                  <Select value={bodyMetric} onValueChange={v => {
                    setBodyMetric(v);
                    setBodyCurrentValue(""); setBodyTargetValue("");
                    if (v === "body_fat") setBodyUnit("%");
                    else setBodyUnit("lbs");
                    setBfCalcOpen(false); setMmCalcOpen(false);
                  }}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weight">Body Weight</SelectItem>
                      <SelectItem value="body_fat">Body Fat %</SelectItem>
                      <SelectItem value="muscle_mass">Muscle Mass</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Dynamic current / target / unit inputs per metric */}
                {bodyMetric === "weight" && (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Current weight</label>
                      <Input type="number" value={bodyCurrentValue} onChange={e => setBodyCurrentValue(e.target.value)} placeholder="185" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Goal weight</label>
                      <Input type="number" value={bodyTargetValue} onChange={e => setBodyTargetValue(e.target.value)} placeholder="170" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Unit</label>
                      <Select value={bodyUnit} onValueChange={setBodyUnit}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="lbs">lbs</SelectItem>
                          <SelectItem value="kg">kg</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {bodyMetric === "body_fat" && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">Current body fat %</label>
                        <Input type="number" value={bodyCurrentValue} onChange={e => setBodyCurrentValue(e.target.value)} placeholder="22" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">Goal body fat %</label>
                        <Input type="number" value={bodyTargetValue} onChange={e => setBodyTargetValue(e.target.value)} placeholder="15" />
                      </div>
                    </div>
                    {/* Body Fat % Calculator */}
                    <div className="border border-green-300 dark:border-green-700 rounded-lg overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setBfCalcOpen(o => !o)}
                        className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-green-700 dark:text-green-300 bg-green-100/60 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors"
                      >
                        <span className="flex items-center gap-1.5"><Sparkles size={11} /> Body Fat % Calculator (Navy Tape Method)</span>
                        <ChevronRight size={13} className={`transition-transform ${bfCalcOpen ? "rotate-90" : ""}`} />
                      </button>
                      {bfCalcOpen && (() => {
                        const h = parseFloat(bfHeightIn); const n = parseFloat(bfNeckIn); const w = parseFloat(bfWaistIn); const hip = parseFloat(bfHipsIn);
                        let result: number | null = null;
                        if (bfSex === "male" && h > 0 && n > 0 && w > n) {
                          result = Math.max(0, 86.010 * Math.log10(w - n) - 70.041 * Math.log10(h) + 36.76);
                        } else if (bfSex === "female" && h > 0 && n > 0 && w > 0 && hip > 0) {
                          result = Math.max(0, 163.205 * Math.log10(w + hip - n) - 97.684 * Math.log10(h) - 78.387);
                        }
                        const res = result !== null ? parseFloat(result.toFixed(1)) : null;
                        return (
                          <div className="p-3 space-y-3">
                            <p className="text-xs text-muted-foreground">All measurements in inches. Measure at the narrowest point (neck/waist) and widest point (hips).</p>
                            <div className="flex gap-2">
                              {(["male","female"] as const).map(s => (
                                <button key={s} type="button" onClick={() => setBfSex(s)}
                                  className={`flex-1 h-8 rounded-lg text-xs font-medium border-2 transition-all ${bfSex === s ? "border-green-500 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300" : "border-border bg-background text-muted-foreground"}`}>
                                  {s.charAt(0).toUpperCase() + s.slice(1)}
                                </button>
                              ))}
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <label className="text-xs text-muted-foreground">Height (in)</label>
                                <Input type="number" value={bfHeightIn} onChange={e => setBfHeightIn(e.target.value)} placeholder='70"' className="h-8 text-xs" />
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs text-muted-foreground">Neck (in)</label>
                                <Input type="number" value={bfNeckIn} onChange={e => setBfNeckIn(e.target.value)} placeholder='15"' className="h-8 text-xs" />
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs text-muted-foreground">Waist (in)</label>
                                <Input type="number" value={bfWaistIn} onChange={e => setBfWaistIn(e.target.value)} placeholder='34"' className="h-8 text-xs" />
                              </div>
                              {bfSex === "female" && (
                                <div className="space-y-1">
                                  <label className="text-xs text-muted-foreground">Hips (in)</label>
                                  <Input type="number" value={bfHipsIn} onChange={e => setBfHipsIn(e.target.value)} placeholder='38"' className="h-8 text-xs" />
                                </div>
                              )}
                            </div>
                            {res !== null && (
                              <div className="flex items-center justify-between bg-green-100 dark:bg-green-900/30 rounded-lg px-3 py-2">
                                <span className="text-sm font-bold text-green-700 dark:text-green-300">Estimated: {res}%</span>
                                <Button size="sm" variant="outline" className="h-7 text-xs"
                                  onClick={() => { setBodyCurrentValue(String(res)); setBfCalcOpen(false); }}>
                                  Use {res}% as current
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {bodyMetric === "muscle_mass" && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">Current muscle mass</label>
                        <Input type="number" value={bodyCurrentValue} onChange={e => setBodyCurrentValue(e.target.value)} placeholder="140" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">Goal muscle mass</label>
                        <Input type="number" value={bodyTargetValue} onChange={e => setBodyTargetValue(e.target.value)} placeholder="155" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">Unit</label>
                        <Select value={bodyUnit} onValueChange={setBodyUnit}>
                          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="lbs">lbs</SelectItem>
                            <SelectItem value="kg">kg</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    {/* Muscle Mass Calculator */}
                    <div className="border border-green-300 dark:border-green-700 rounded-lg overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setMmCalcOpen(o => !o)}
                        className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-green-700 dark:text-green-300 bg-green-100/60 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors"
                      >
                        <span className="flex items-center gap-1.5"><Sparkles size={11} /> Muscle Mass Estimator (from Body Fat %)</span>
                        <ChevronRight size={13} className={`transition-transform ${mmCalcOpen ? "rotate-90" : ""}`} />
                      </button>
                      {mmCalcOpen && (() => {
                        const wt = parseFloat(mmWeightLbs); const bf = parseFloat(mmBfPct);
                        let lbm: number | null = null; let muscle: number | null = null;
                        if (wt > 0 && bf > 0 && bf < 100) {
                          lbm = wt * (1 - bf / 100);
                          muscle = parseFloat((lbm * 0.56).toFixed(1)); // ~56% of LBM is skeletal muscle
                        }
                        const unitLabel = bodyUnit === "kg" ? "kg" : "lbs";
                        const convert = (v: number) => bodyUnit === "kg" ? parseFloat((v / 2.205).toFixed(1)) : v;
                        return (
                          <div className="p-3 space-y-3">
                            <p className="text-xs text-muted-foreground">Enter your total body weight and body fat % to estimate skeletal muscle mass (≈56% of lean body mass).</p>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <label className="text-xs text-muted-foreground">Body weight (lbs)</label>
                                <Input type="number" value={mmWeightLbs} onChange={e => setMmWeightLbs(e.target.value)} placeholder="185" className="h-8 text-xs" />
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs text-muted-foreground">Body fat %</label>
                                <Input type="number" value={mmBfPct} onChange={e => setMmBfPct(e.target.value)} placeholder="20" className="h-8 text-xs" />
                              </div>
                            </div>
                            {muscle !== null && lbm !== null && (
                              <div className="space-y-1.5">
                                <div className="bg-green-100 dark:bg-green-900/30 rounded-lg px-3 py-2 text-xs space-y-1">
                                  <div className="flex justify-between"><span className="text-muted-foreground">Lean Body Mass</span><span className="font-semibold">{convert(lbm)} {unitLabel}</span></div>
                                  <div className="flex justify-between"><span className="text-muted-foreground">Est. Skeletal Muscle</span><span className="font-bold text-green-700 dark:text-green-300">{convert(muscle)} {unitLabel}</span></div>
                                </div>
                                <Button size="sm" variant="outline" className="w-full h-7 text-xs"
                                  onClick={() => { setBodyCurrentValue(String(convert(muscle!))); setMmCalcOpen(false); }}>
                                  Use {convert(muscle)} {unitLabel} as current muscle mass
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            )}

            {goalType === "general" && (
              <div className="bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 rounded-xl p-4">
                <p className="text-xs text-purple-700 dark:text-purple-300">Build a consistent training habit. Set your schedule and track your progress week by week.</p>
              </div>
            )}

            {/* Plan details */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Plan Name</label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder={autoName()} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Duration</label>
                <Select value={durationWeeks} onValueChange={v => { setDurationWeeks(v); setMilestones(generateMilestones(goalType, parseInt(v))); }}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["4","6","8","10","12","16","20","24"].map(w => <SelectItem key={w} value={w}>{w} weeks</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Start Date</label>
                <Input type="date" defaultValue={editing?.startDate ?? new Date().toISOString().slice(0, 10)} onChange={() => {}} />
              </div>
            </div>

            {/* Milestones preview */}
            {milestones.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Milestones</p>
                <div className="space-y-1.5">
                  {milestones.map((m, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-muted-foreground w-14 shrink-0">Week {m.week}</span>
                      <Input
                        value={m.description}
                        onChange={e => setMilestones(ms => ms.map((mi, j) => j === i ? { ...mi, description: e.target.value } : mi))}
                        className="h-7 text-xs"
                      />
                      <button onClick={() => setMilestones(ms => ms.filter((_, j) => j !== i))} className="text-muted-foreground/40 hover:text-destructive shrink-0"><X size={12} /></button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setMilestones(ms => [...ms, { week: parseInt(durationWeeks), description: "Final check-in" }])}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  <Plus size={11} /> Add milestone
                </button>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button className="flex-1" onClick={() => { setStep("schedule"); setEditingDay(null); }}>
                {scheduleByWeek.length > 0
                  ? <><CalendarDays size={14} /> Review Schedule ({scheduleByWeek.length} weeks) →</>
                  : <>Build Schedule →</>}
              </Button>
              <Button variant="outline" onClick={handleSave} disabled={isPending}>
                {isPending ? <Loader2 size={14} className="animate-spin" /> : editing ? "Save" : "Save & Skip"}
              </Button>
            </div>
          </div>
        )}

        {/* Step: Schedule — week-by-week */}
        {step === "schedule" && (
          <div className="space-y-3 pt-1">
            {/* Week navigator */}
            <div className="flex items-center justify-between">
              <button onClick={() => setStep("details")} className="text-xs text-muted-foreground hover:text-foreground">← Back</button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setViewWeek(w => Math.max(1, w - 1)); setEditingDay(null); }}
                  disabled={viewWeek === 1}
                  className="w-7 h-7 rounded-full border flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30"
                >‹</button>
                <span className="text-sm font-semibold w-28 text-center">Week {viewWeek} of {totalWeeks}</span>
                <button
                  onClick={() => { setViewWeek(w => Math.min(totalWeeks, w + 1)); setEditingDay(null); }}
                  disabled={viewWeek === totalWeeks}
                  className="w-7 h-7 rounded-full border flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30"
                >›</button>
              </div>
              {viewWeek > 1 && (
                <button
                  onClick={() => { copyWeekTo(viewWeek - 1, viewWeek); setEditingDay(null); }}
                  className="text-xs text-primary hover:underline"
                >Copy Week {viewWeek - 1}</button>
              )}
              {viewWeek === 1 && <span className="w-16" />}
            </div>

            {/* Day grid */}
            <div className="grid grid-cols-7 gap-1">
              {DAYS_OF_WEEK.map(day => {
                const entry = getDayEntry(viewWeek, day);
                const isEditing = editingDay === day;
                return (
                  <button
                    key={day}
                    onClick={() => isEditing ? setEditingDay(null) : openDayEditor(day)}
                    className={`flex flex-col items-center gap-0.5 p-1.5 rounded-lg border-2 text-center transition-all min-h-[60px] justify-start ${
                      isEditing ? "border-primary bg-primary/5" :
                      entry ? "border-primary/30 bg-primary/5 hover:border-primary/50" :
                      "border-dashed border-muted-foreground/20 hover:border-muted-foreground/40 bg-transparent"
                    }`}
                  >
                    <span className="text-[9px] font-bold text-muted-foreground uppercase">{DAY_LABELS[day]}</span>
                    {entry ? (
                      <>
                        {entry.templateId ? <Dumbbell size={10} className="text-primary mt-0.5" /> : <TrendingUp size={10} className="text-primary mt-0.5" />}
                        <span className="text-[8px] leading-tight font-medium text-primary line-clamp-2 text-center">{entry.label}</span>
                        {entry.notes && <span className="text-[7px] text-muted-foreground line-clamp-1 text-center">{entry.notes}</span>}
                      </>
                    ) : (
                      <span className="text-[9px] text-muted-foreground/40 mt-1">Rest</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Day editor — inline below grid */}
            {editingDay && (
              <div className="border rounded-xl p-3 bg-muted/30 space-y-3">
                <p className="text-xs font-semibold capitalize">{editingDay}</p>

                {/* Mode tabs */}
                <div className="flex gap-1 bg-background rounded-lg p-0.5 border">
                  {([["rest","Rest"],["custom","Custom"],["template","From Library"]] as const).map(([m, lbl]) => (
                    <button key={m} onClick={() => setDayMode(m)} className={`flex-1 text-xs py-1 rounded-md font-medium transition-colors ${dayMode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                      {lbl}
                    </button>
                  ))}
                </div>

                {dayMode === "rest" && (
                  <p className="text-xs text-muted-foreground">This day will be a rest day.</p>
                )}

                {dayMode === "custom" && (
                  <div className="space-y-2">
                    <Input
                      value={dayLabel}
                      onChange={e => setDayLabel(e.target.value)}
                      placeholder="e.g. Long Run, Tempo Run, Easy 5 miles…"
                      className="h-8 text-sm"
                      autoFocus
                    />
                    <Input
                      value={dayNotes}
                      onChange={e => setDayNotes(e.target.value)}
                      placeholder="Notes (optional) — e.g. 14 miles, Zone 2, 70 min"
                      className="h-8 text-sm"
                    />
                  </div>
                )}

                {dayMode === "template" && (
                  <div className="space-y-2">
                    {templates.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No workout templates yet. Create some in "My Workouts" first.</p>
                    ) : (
                      <>
                        <Select value={dayTemplateId ? String(dayTemplateId) : ""} onValueChange={v => setDayTemplateId(parseInt(v))}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Pick a workout…" /></SelectTrigger>
                          <SelectContent>
                            {templates.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Input
                          value={dayNotes}
                          onChange={e => setDayNotes(e.target.value)}
                          placeholder="Notes (optional) — e.g. go easy today"
                          className="h-8 text-sm"
                        />
                      </>
                    )}
                  </div>
                )}

                <div className="flex gap-2 pt-0.5">
                  <Button size="sm" className="h-7 text-xs flex-1" onClick={commitDayEdit}
                    disabled={dayMode === "custom" && !dayLabel.trim() || dayMode === "template" && !dayTemplateId}>
                    Done
                  </Button>
                  {getDayEntry(viewWeek, editingDay) && (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { upsertDayEntry(viewWeek, editingDay, null); setEditingDay(null); }}>
                      Clear
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingDay(null)}>Cancel</Button>
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground text-center">
              {currentWeekDays > 0 ? `${currentWeekDays} workout${currentWeekDays !== 1 ? "s" : ""} this week` : "Tap a day to add a workout"}
              {" · "}{totalWeeks} week program
            </p>

            <div className="flex gap-2 pt-1">
              <Button className="flex-1" onClick={handleSave} disabled={isPending}>
                {isPending ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : editing ? "Save Changes" : "Create Plan"}
              </Button>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Share Modal ───────────────────────────────────────────────────────────────

function ShareWorkoutModal({ open, onClose, shareType, contentJson, itemName }: {
  open: boolean; onClose: () => void;
  shareType: "template" | "plan"; contentJson: string; itemName: string;
}) {
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [selectedFriendId, setSelectedFriendId] = useState<string>("");

  const { data: friends = [] } = useQuery<PublicUser[]>({
    queryKey: ["/api/friends"],
    queryFn: () => apiRequest("GET", "/api/friends").then(r => r.json()),
    enabled: open,
  });

  useEffect(() => { if (open) { setNote(""); setSelectedFriendId(""); } }, [open]);

  const shareMut = useMutation({
    mutationFn: (d: any) => apiRequest("POST", "/api/workout-shares", d).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shares/count"] });
      toast({ title: "Shared!", description: `${friends.find(f => f.id === parseInt(selectedFriendId))?.name ?? "Your friend"} will see it in their Workouts.` });
      onClose();
    },
    onError: () => toast({ title: "Failed to share", variant: "destructive" }),
  });

  function handleShare() {
    if (!selectedFriendId) return;
    shareMut.mutate({ toUserId: parseInt(selectedFriendId), shareType, contentJson, notes: note.trim() || null });
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Share2 size={15} /> Share {shareType === "plan" ? "Plan" : "Template"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="rounded-lg bg-secondary p-3">
            <p className="text-sm font-medium truncate">{itemName}</p>
            <p className="text-xs text-muted-foreground capitalize">{shareType}</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Send to</label>
            {friends.length === 0 ? (
              <p className="text-xs text-muted-foreground border rounded-lg p-3 bg-muted/30">No friends yet. Add friends in the Friends tab.</p>
            ) : (
              <Select value={selectedFriendId} onValueChange={setSelectedFriendId}>
                <SelectTrigger><SelectValue placeholder="Select a friend…" /></SelectTrigger>
                <SelectContent>
                  {friends.map(f => (
                    <SelectItem key={f.id} value={String(f.id)}>
                      <div className="flex items-center gap-2">
                        {f.avatarUrl
                          ? <img src={f.avatarUrl} className="w-5 h-5 rounded-full" />
                          : <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">{f.name[0]}</div>
                        }
                        {f.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Note <span className="font-normal">(optional)</span></label>
            <Input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. This is great for beginners!" />
          </div>
          <div className="flex gap-2">
            <Button className="flex-1 gap-1.5" onClick={handleShare} disabled={!selectedFriendId || shareMut.isPending || friends.length === 0}>
              {shareMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Share
            </Button>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function WorkoutsPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<"active" | "logs" | "templates" | "plans" | "shared" | "equipment">("plans");
  const [logModal, setLogModal] = useState(false);
  const [templateModal, setTemplateModal] = useState(false);
  const [templateModalFromPlan, setTemplateModalFromPlan] = useState(false);
  const [editLog, setEditLog] = useState<WorkoutLog | null>(null);
  const [editTemplate, setEditTemplate] = useState<WorkoutTemplate | null>(null);
  const [exerciseSearchOpen, setExerciseSearchOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [equipmentModal, setEquipmentModal] = useState(false);
  const [editEquipment, setEditEquipment] = useState<Equipment | null>(null);
  const [planModal, setPlanModal] = useState(false);
  const [generalFitnessWizardOpen, setGeneralFitnessWizardOpen] = useState(false);
  const [generalFitnessWizardGoal, setGeneralFitnessWizardGoal] = useState<string | undefined>(undefined);
  const [editPlan, setEditPlan] = useState<WorkoutPlan | null>(null);

  // Auto-open plan builder if navigated here with ?newPlan=1
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("newPlan") === "1") {
      setEditPlan(null); setPlanModal(true); setTab("plans");
      // Remove the param without a full reload
      const url = new URL(window.location.href);
      url.searchParams.delete("newPlan");
      // If a goalType was passed (e.g. from Browse Goals & Plans), store it to pre-select
      const gt = params.get("goalType");
      if (gt) {
        url.searchParams.delete("goalType");
        // Store in sessionStorage so PlanBuilderModal can read it on open
        sessionStorage.setItem("newPlanGoalType", gt);
      }
      window.history.replaceState({}, "", url.toString());
    }
  }, []);
  const [bodyCompWizardOpen, setBodyCompWizardOpen] = useState(false);
  const [bodyCompEditingPlan, setBodyCompEditingPlan] = useState<WorkoutPlan | null>(null);
  const [shareModal, setShareModal] = useState(false);
  const [sharePayload, setSharePayload] = useState<{ type: "template" | "plan"; contentJson: string; name: string } | null>(null);

  // Workout action menu (in Active Plan tab)
  type WorkoutActionTarget = { planId: number; week: number; dayOfWeek: string; entry: PlanDayEntryV2 } | null;
  const [workoutActionTarget, setWorkoutActionTarget] = useState<WorkoutActionTarget>(null);
  const [workoutActionMode, setWorkoutActionMode] = useState<"menu" | "edit">("menu");
  const [editEntryLabel, setEditEntryLabel] = useState("");
  const [editEntryNotes, setEditEntryNotes] = useState("");
  const [editWizardSession, setEditWizardSession] = useState<any>(null);
  const [logPrefillName, setLogPrefillName] = useState("");
  const [logPrefillTemplateId, setLogPrefillTemplateId] = useState<number | undefined>(undefined);

  const { data: logs = [] } = useQuery<WorkoutLog[]>({ queryKey: ["/api/workout-logs"] });
  const { data: templates = [] } = useQuery<WorkoutTemplate[]>({ queryKey: ["/api/workout-templates"] });
  const { data: plans = [] } = useQuery<WorkoutPlan[]>({ queryKey: ["/api/workout-plans"] });
  const { data: sharedItems = [] } = useQuery<WorkoutShareWithUser[]>({ queryKey: ["/api/workout-shares"] });
  const { data: equipmentList = [] } = useQuery<Equipment[]>({ queryKey: ["/api/equipment"] });
  const { data: goals = [] } = useQuery<GoalWithProjects[]>({ queryKey: ["/api/goals"] });

  const activePlansCount = plans.filter(p => p.isActive).length;

  // Auto-navigate to Active Plan tab when a plan is activated; fall back to Plans when all deactivated
  useEffect(() => {
    if (activePlansCount > 0 && tab !== "active") setTab("active");
    if (activePlansCount === 0 && tab === "active") setTab("plans");
  }, [activePlansCount]);

  // Auto-switch to shared tab from notification
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("shared") === "1") setTab("shared");
  }, []);
  useEffect(() => {
    if (tab !== "shared") return;
    apiRequest("POST", "/api/shares/mark-read", { type: "workouts" })
      .then(() => queryClient.invalidateQueries({ queryKey: ["/api/shares/count"] })).catch(() => {});
  }, [tab]);

  const streak = workoutStreak(logs);
  const { completed: wkCompleted, planned: wkPlanned } = weeklyWorkoutStats(logs, templates);
  const recentPRs = getRecentPRs(logs);

  const deleteLog = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/workout-logs/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/workout-logs"] }); toast({ title: "Log deleted" }); }
  });
  const deleteTemplate = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/workout-templates/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/workout-templates"] }); toast({ title: "Template deleted" }); }
  });
  const deletePlan = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/workout-plans/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/workout-plans"] }); toast({ title: "Plan deleted" }); }
  });
  const activatePlan = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/workout-plans/${id}/activate`),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["/api/workout-plans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/goals"] });
      const plan = plans.find(p => p.id === id);
      toast({ title: plan?.isActive ? "Plan deactivated" : "Plan activated!" });
    },
  });
  const deleteEquipment = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/equipment/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/equipment"] }),
  });

  // Patch a plan's scheduleJson (used by workout action menu to edit/delete day entries)
  const patchPlanSchedule = useMutation({
    mutationFn: ({ planId, scheduleJson }: { planId: number; scheduleJson: string }) =>
      apiRequest("PATCH", `/api/workout-plans/${planId}`, { scheduleJson }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workout-plans"] });
      setWorkoutActionTarget(null);
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  const [gymAdding, setGymAdding] = useState(false);
  async function addGymMembership() {
    setGymAdding(true);
    const existingNames = new Set(equipmentList.map(e => e.name.toLowerCase()));
    const toAdd = GYM_MEMBERSHIP_EQUIPMENT.filter(e => !existingNames.has(e.name.toLowerCase()));
    if (toAdd.length === 0) {
      toast({ title: "All gym equipment already added!" });
      setGymAdding(false);
      return;
    }
    try {
      await Promise.all(toAdd.map(e => apiRequest("POST", "/api/equipment", e)));
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      toast({ title: `Added ${toAdd.length} piece${toAdd.length === 1 ? "" : "s"} of gym equipment` });
    } catch {
      toast({ title: "Failed to add equipment", variant: "destructive" });
    } finally { setGymAdding(false); }
  }
  const dismissShare = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/workout-shares/${id}/dismiss`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workout-shares"] });
      queryClient.invalidateQueries({ queryKey: ["/api/shares/count"] });
    },
  });
  const saveSharedTemplate = useMutation({
    mutationFn: ({ content }: { content: any }) => apiRequest("POST", "/api/workout-templates", {
      name: content.name, workoutType: content.workoutType ?? "custom",
      exercisesJson: content.exercisesJson ?? "[]", notes: content.notes ?? null,
      scheduledDay: null, recurring: "none", linkedGoalId: null,
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/workout-templates"] }); toast({ title: "Template saved to your library!" }); },
    onError: () => toast({ title: "Failed to save template", variant: "destructive" }),
  });
  const saveSharedPlan = useMutation({
    mutationFn: async ({ content }: { content: any }) => {
      return apiRequest("POST", "/api/workout-plans", {
        name: content.name, description: content.description ?? null,
        durationWeeks: content.durationWeeks ?? 4,
        scheduleJson: content.scheduleJson ?? "[]",
        goalType: content.goalType ?? "general",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workout-plans"] });
      toast({ title: "Plan saved to your library!" });
    },
    onError: () => toast({ title: "Failed to save plan", variant: "destructive" }),
  });

  function openShareModal(type: "template" | "plan", item: WorkoutTemplate | WorkoutPlan) {
    let contentJson: string;
    if (type === "template") {
      const t = item as WorkoutTemplate;
      contentJson = JSON.stringify({ name: t.name, workoutType: t.workoutType, exercisesJson: t.exercisesJson, notes: t.notes });
    } else {
      const p = item as WorkoutPlan;
      // Pass raw scheduleJson through — receiver can parse it
      contentJson = JSON.stringify({ name: p.name, description: p.description, durationWeeks: p.durationWeeks, scheduleJson: p.scheduleJson, goalType: p.goalType });
    }
    setSharePayload({ type, contentJson, name: item.name });
    setShareModal(true);
  }

  // Group equipment by category
  const equipmentByCategory = useMemo(() => {
    const grouped: Record<string, Equipment[]> = {};
    for (const item of equipmentList) {
      if (!grouped[item.category]) grouped[item.category] = [];
      grouped[item.category].push(item);
    }
    return grouped;
  }, [equipmentList]);

  return (
    <PageShell
      title={
        <div className="flex items-center gap-2.5">
          <h1 className="text-xl font-semibold tracking-tight">Workouts</h1>
          {streak > 0 && (
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-[hsl(210_80%_48%)] bg-[hsl(210_80%_48%/0.1)] px-2.5 py-1 rounded-full border border-[hsl(210_80%_48%/0.3)]">
              <Flame size={13} />{streak}d streak
            </span>
          )}
        </div>
      }
      subtitle="Log workouts, build plans, and track your progress"
      action={
        <Button onClick={() => { setEditLog(null); setLogModal(true); }} className="gap-2">
          <Plus size={15} /> Log Workout
        </Button>
      }
      controls={
        <div className="overflow-x-auto scrollbar-hide -mx-1 px-1">
          <div className="flex gap-1 w-max pb-0.5">
            {[
              ...(activePlansCount > 0 ? [{ value: "active", label: "Active Plan", icon: Play, count: activePlansCount }] : []),
              { value: "plans", label: "Plans", icon: CalendarDays, count: plans.length },
              { value: "templates", label: "My Workouts", icon: LayoutTemplate, count: templates.length },
              { value: "shared", label: "Shared", icon: Users, count: sharedItems.length },

              { value: "logs", label: "History", icon: ClipboardList, count: logs.length },
            ].map(t => (
              <button
                key={t.value}
                onClick={() => setTab(t.value as any)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  tab === t.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                <t.icon size={13} />
                {t.label}
                {t.count > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    tab === t.value ? "bg-white/20 text-white" : "bg-secondary text-muted-foreground"
                  }`}>
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      }
    >
      <div className="space-y-5">

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-card border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold">{wkCompleted}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Completed this week</p>
        </div>
        <div className="bg-card border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold">{wkPlanned}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Planned this week</p>
        </div>
        <div className="bg-card border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold">{streak}d</p>
          <p className="text-xs text-muted-foreground mt-0.5">Current streak</p>
        </div>
        <div className="bg-card border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold">{logs.filter(l => l.completed).length}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Total workouts</p>
        </div>
      </div>

      {/* Recent PRs */}
      {recentPRs.length > 0 && (
        <div className="bg-card border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3"><Zap size={15} className="text-amber-500" /><span className="text-sm font-semibold">Recent PRs</span></div>
          <div className="flex gap-3 flex-wrap">
            {recentPRs.map((pr, i) => (
              <div key={i} className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                <Star size={12} className="text-amber-500" fill="currentColor" />
                <div>
                  <p className="text-xs font-semibold">{pr.exercise}</p>
                  <p className="text-xs text-muted-foreground">{pr.weight} lb · {format(parseISO(pr.date), "MMM d")}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Active Plans ───────────────────────────────────────────────── */}
      {tab === "active" && (() => {
        const activePlans = plans.filter(p => p.isActive);
        const today = new Date();
        const todayDow = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"][today.getDay()];

        if (activePlans.length === 0) return (
          <div className="text-center py-16 text-muted-foreground space-y-3">
            <Play size={40} className="mx-auto opacity-20" />
            <p className="font-medium">No active plans</p>
            <p className="text-sm">Go to Plans and activate one or more to see them here.</p>
            <Button size="sm" variant="outline" onClick={() => setTab("plans")}>
              <CalendarDays size={13} className="mr-1.5" /> View Plans
            </Button>
          </div>
        );

        // Colour palette — one colour per active plan
        const PLAN_COLORS = [
          { dot: "bg-blue-500",   tag: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700" },
          { dot: "bg-orange-500", tag: "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-700" },
          { dot: "bg-green-500",  tag: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-700" },
          { dot: "bg-purple-500", tag: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-700" },
          { dot: "bg-pink-500",   tag: "bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 border-pink-200 dark:border-pink-700" },
        ];

        // Build per-plan metadata
        type PlanMeta = {
          plan: WorkoutPlan;
          color: typeof PLAN_COLORS[0];
          currentWeek: number;
          progressPct: number;
          currentWeekDays: PlanDayEntryV2[];
          parsedSched: ReturnType<typeof parseSchedule>;
          goalMetric: any;
          milestones: WorkoutPlanMilestone[];
        };

        const planMetas: PlanMeta[] = activePlans.map((plan, idx) => {
          const parsedSched = parseSchedule(plan.scheduleJson ?? "[]");
          const startDate = plan.startDate ? new Date(plan.startDate) : null;
          const weeksElapsed = startDate
            ? Math.max(0, Math.floor((today.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000)))
            : 0;
          const currentWeek = Math.min(weeksElapsed + 1, plan.durationWeeks);
          const progressPct = Math.min(100, Math.round((weeksElapsed / plan.durationWeeks) * 100));
          let currentWeekDays: PlanDayEntryV2[] = [];
          if (parsedSched.isV2) {
            currentWeekDays = parsedSched.weeks.find(w => w.week === currentWeek)?.days ?? parsedSched.weeks[0]?.days ?? [];
          } else {
            currentWeekDays = parsedSched.flatDays.map(e => ({ dayOfWeek: e.dayOfWeek, label: e.label ?? e.templateName ?? "Workout", templateId: e.templateId }));
          }
          // Detect General Fitness Wizard format: { plan: { weeks: { A, B } } }
          if (currentWeekDays.length === 0 && plan.goalType === 'general') {
            try {
              const raw = JSON.parse(plan.scheduleJson ?? '{}');
              const wizardPlan = raw.plan ?? raw;
              if (wizardPlan?.weeks?.A) {
                const weekLabel = weeksElapsed % 2 === 0 ? 'A' : 'B';
                const sessions: any[] = wizardPlan.weeks[weekLabel] ?? wizardPlan.weeks.A ?? [];
                currentWeekDays = sessions.map((s: any) => ({
                  dayOfWeek: s.day.toLowerCase(),
                  label: `${s.session_type} · ${s.marker}`,
                  wizardSession: s,
                }));
              }
            } catch {}
          }
          let goalMetric: any = null;
          try { goalMetric = plan.goalMetricJson ? JSON.parse(plan.goalMetricJson) : null; } catch {}
          let milestones: WorkoutPlanMilestone[] = [];
          try { milestones = plan.milestonesJson ? JSON.parse(plan.milestonesJson) : []; } catch {}
          return { plan, color: PLAN_COLORS[idx % PLAN_COLORS.length], currentWeek, progressPct, currentWeekDays, parsedSched, goalMetric, milestones };
        });

        // Build merged day map: day → list of { entry, planName, color }
        type MergedEntry = { entry: PlanDayEntryV2; planName: string; color: typeof PLAN_COLORS[0] };
        const mergedDays: Record<string, MergedEntry[]> = {};
        DAYS_OF_WEEK.forEach(d => { mergedDays[d] = []; });
        planMetas.forEach(({ plan, currentWeekDays, color }) => {
          currentWeekDays.forEach(entry => {
            mergedDays[entry.dayOfWeek]?.push({ entry, planName: plan.name, color });
          });
        });

        return (
          <div className="space-y-5">

            {/* ── Legend (multi-plan only) */}
            {activePlans.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {planMetas.map(({ plan, color }) => (
                  <div key={plan.id} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${color.tag}`}>
                    <div className={`w-2 h-2 rounded-full ${color.dot}`} />
                    {plan.name}
                  </div>
                ))}
              </div>
            )}

            {/* ── Merged weekly schedule */}
            <div className="bg-card border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between">
                <p className="text-sm font-semibold">This Week's Schedule</p>
                <span className="text-xs text-muted-foreground">{activePlans.length > 1 ? `${activePlans.length} plans merged` : `Week ${planMetas[0].currentWeek} of ${planMetas[0].plan.durationWeeks}`}</span>
              </div>
              <div className="divide-y">
                {DAYS_OF_WEEK.map(day => {
                  const entries = mergedDays[day];
                  const isToday = day === todayDow;
                  return (
                    <div key={day} className={`flex items-start gap-3 px-4 py-3 ${isToday ? "bg-primary/5" : ""} ${entries.length === 0 ? "opacity-40" : ""}`}>
                      <div className="w-10 shrink-0 text-center pt-0.5">
                        <p className={`text-xs font-bold uppercase ${isToday ? "text-primary" : "text-muted-foreground"}`}>{DAY_LABELS[day]}</p>
                        {isToday && <div className="w-1.5 h-1.5 rounded-full bg-primary mx-auto mt-0.5" />}
                      </div>
                      {entries.length > 0 ? (
                        <div className="flex-1 min-w-0 space-y-1.5">
                          {entries.map(({ entry, planName, color }, i) => {
                            const meta = planMetas.find(m => m.plan.name === planName);
                            return (
                              <button
                                key={i}
                                type="button"
                                className="w-full text-left rounded-lg px-2.5 py-2 hover:bg-muted/60 active:bg-muted transition-colors group"
                                onClick={() => {
                                  const m = planMetas.find(pm => pm.plan.name === planName);
                                  if (!m) return;
                                  setWorkoutActionTarget({ planId: m.plan.id, week: m.currentWeek, dayOfWeek: day, entry });
                                  if (entry.templateId) {
                                    // Template entry: open the full template editor
                                    const tmpl = templates.find(t => t.id === entry.templateId);
                                    if (tmpl) { setEditTemplate(tmpl); setTemplateModalFromPlan(true); setTemplateModal(true); }
                                  } else if (entry.wizardSession) {
                                    setEditWizardSession(JSON.parse(JSON.stringify(entry.wizardSession)));
                                    setWorkoutActionMode("edit");
                                  } else {
                                    setEditEntryLabel(entry.label);
                                    setEditEntryNotes(entry.notes ?? "");
                                    setWorkoutActionMode("edit");
                                  }
                                }}
                              >
                                {activePlans.length > 1 && (
                                  <div className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border mb-0.5 ${color.tag}`}>
                                    <div className={`w-1.5 h-1.5 rounded-full ${color.dot}`} />
                                    {planName}
                                  </div>
                                )}
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {entry.templateId ? <Dumbbell size={12} className="text-primary shrink-0" /> : <TrendingUp size={12} className="text-primary shrink-0" />}
                                  <p className="text-sm font-medium">{entry.label}</p>
                                  {isToday && i === 0 && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground">Today</span>}
                                  <MoreHorizontal size={12} className="ml-auto opacity-0 group-hover:opacity-40 text-muted-foreground" />
                                </div>
                                {entry.notes && <p className="text-xs text-muted-foreground">{entry.notes}</p>}
                                {entry.wizardSession && (() => {
                                  const ws = entry.wizardSession;
                                  function fmtSets(sets: any[]) {
                                    if (!sets?.length) return "";
                                    const isCardio = sets[0]?.reps?.toString().includes("min");
                                    if (isCardio) return sets[0].reps + " — " + sets[0].weight;
                                    const allSame = sets.every((s: any) => s.reps === sets[0].reps && s.weight === sets[0].weight);
                                    if (allSame) return `${sets.length}×${sets[0].reps} @ ${sets[0].weight}`;
                                    return sets.map((s: any) => `${s.reps}@${s.weight}`).join(", ");
                                  }
                                  const allExs = [
                                    { name: ws.primary_lift?.name, sets: ws.primary_lift?.sets, isPrimary: true },
                                    ...(ws.accessories ?? []).map((a: any) => ({ name: a.name, sets: a.sets, isPrimary: false })),
                                  ].filter(e => e.name);
                                  return (
                                    <div className="mt-1 space-y-0.5">
                                      {allExs.map((ex: any, xi: number) => (
                                        <p key={xi} className="text-xs text-muted-foreground">
                                          <span className={`font-medium ${ex.isPrimary ? "text-foreground/80" : "text-foreground/60"}`}>{ex.name}</span>
                                          <span className="ml-1">— {fmtSets(ex.sets)}</span>
                                        </p>
                                      ))}
                                    </div>
                                  );
                                })()}
                                {entry.templateId && (() => {
                                  const tmpl = templates.find(t => t.id === entry.templateId);
                                  if (!tmpl) return null;
                                  let exs: any[] = [];
                                  try { exs = JSON.parse(tmpl.exercisesJson); } catch { return null; }
                                  if (!exs.length) return null;
                                  return (
                                    <div className="mt-1 space-y-0.5">
                                      {exs.map((ex: any, xi: number) => {
                                        const type = ex.type ?? "";
                                        const isCardioEx = ["Run","Bike","Swim"].includes(type);
                                        const isDurEx = ["Yoga","Stretch"].includes(type);
                                        let detail = "";
                                        if (isCardioEx) {
                                          const parts = [ex.distance, ex.duration].filter(Boolean);
                                          detail = parts.join(" · ");
                                        } else if (isDurEx) {
                                          detail = ex.duration ?? "";
                                        } else {
                                          const sets = Array.isArray(ex.sets) ? ex.sets : Array.from({ length: ex.sets || 3 }, () => ({ reps: ex.reps || 8, weight: ex.weight || 0 }));
                                          if (sets.length > 0) {
                                            const allSame = sets.every((s: any) => s.reps === sets[0].reps && s.weight === sets[0].weight);
                                            if (allSame) {
                                              detail = sets[0].weight > 0
                                                ? `${sets.length}×${sets[0].reps} @ ${sets[0].weight} lbs`
                                                : `${sets.length}×${sets[0].reps}`;
                                            } else {
                                              detail = sets.map((s: any) => s.weight > 0 ? `${s.reps}@${s.weight}` : `${s.reps}`).join(", ");
                                            }
                                          }
                                        }
                                        return (
                                          <p key={xi} className="text-xs text-muted-foreground">
                                            <span className="font-medium text-foreground/70">{ex.name}</span>
                                            {detail && <span className="ml-1">— {detail}</span>}
                                          </p>
                                        );
                                      })}
                                    </div>
                                  );
                                })()}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground flex-1">Rest</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Per-plan progress cards */}
            <div className="space-y-4">
              {planMetas.map(({ plan, color, currentWeek, progressPct, parsedSched, goalMetric, milestones }) => {
                const startDate = plan.startDate ? new Date(plan.startDate) : null;
                const goalInfo = GOAL_TYPES.find(g => g.value === plan.goalType);
                const nextMilestone = milestones.find(m => m.week >= currentWeek);
                return (
                  <div key={plan.id} className="bg-card border rounded-xl overflow-hidden">
                    {/* Plan header */}
                    <div className={`px-4 py-3 border-b flex items-center justify-between gap-2`}>
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${color.dot}`} />
                        <p className="font-semibold text-sm truncate">{plan.name}</p>
                        {goalInfo && <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${goalInfo.color}`}>{goalInfo.label}</span>}
                      </div>
                      <Button size="sm" variant="ghost" className="h-7 text-xs shrink-0 gap-1"
                        onClick={() => {
                          if (plan.goalType === "body_composition") {
                            setBodyCompEditingPlan(plan);
                            setBodyCompWizardOpen(true);
                          } else {
                            setEditPlan(plan); setPlanModal(true);
                          }
                        }}>
                        <Pencil size={10} /> Edit
                      </Button>
                    </div>

                    <div className="p-4 space-y-3">
                      {/* Progress bar */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Week {currentWeek} of {plan.durationWeeks}</span>
                          <span>{progressPct}%</span>
                        </div>
                        <div className="h-2 bg-secondary rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${color.dot}`} style={{ width: `${progressPct}%` }} />
                        </div>
                        {startDate && startDate > today ? (
                          <p className="text-xs font-medium text-primary">
                            🗓 Starts {startDate.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">Started {startDate ? startDate.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}</p>
                        )}
                      </div>

                      {/* Goal metric */}
                      {goalMetric && plan.goalType === "strength_pr" && (
                        <div className="flex items-center gap-3 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded-lg px-3 py-2">
                          <Trophy size={13} className="text-orange-500 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-orange-700 dark:text-orange-300">{goalMetric.exercise}</p>
                            <p className="text-xs text-muted-foreground">{goalMetric.currentValue} → {goalMetric.targetValue} {goalMetric.unit}</p>
                          </div>
                        </div>
                      )}
                      {goalMetric && plan.goalType === "endurance" && (
                        <div className="flex items-center gap-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2">
                          <TrendingUp size={13} className="text-blue-500 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">{goalMetric.raceDistance}</p>
                            {goalMetric.raceDate && <p className="text-xs text-muted-foreground">🗓 {new Date(goalMetric.raceDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>}
                          </div>
                        </div>
                      )}
                      {plan.goalType === "body_composition" && (
                        <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2 space-y-2">
                          <div className="flex items-center gap-3">
                            <Heart size={13} className="text-green-500 shrink-0" />
                            <div className="min-w-0 flex-1">
                              {goalMetric && (
                                <p className="text-xs font-semibold text-green-700 dark:text-green-300">
                                  {goalMetric.metric === "body_weight" || goalMetric.metric === "weight" ? "Body Weight" :
                                   goalMetric.metric === "body_fat" ? "Body Fat %" :
                                   goalMetric.metric === "muscle_mass" ? "Muscle Mass" : "Body Recomposition"}
                                </p>
                              )}
                              {goalMetric?.targetCalories && (
                                <p className="text-xs text-muted-foreground">{goalMetric.targetCalories} kcal · P {goalMetric.proteinGrams}g · C {goalMetric.carbsGrams}g · F {goalMetric.fatGrams}g</p>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => setLocation("/health")}
                            className="w-full flex items-center justify-center gap-1.5 text-[11px] font-medium text-green-700 dark:text-green-300 hover:text-green-800 dark:hover:text-green-200 bg-green-100 dark:bg-green-900/30 hover:bg-green-200 dark:hover:bg-green-900/50 rounded-md px-2 py-1.5 transition-colors"
                          >
                            <UtensilsCrossed size={11} />
                            Track nutrition in Health tab
                            <ChevronRight size={11} />
                          </button>
                        </div>
                      )}

                      {/* Milestones */}
                      {milestones.length > 0 && (
                        <div className="flex gap-1 overflow-x-auto pb-0.5">
                          {milestones.map(m => {
                            const done = m.week < currentWeek;
                            const isCurrent = m.week === currentWeek;
                            return (
                              <div key={m.week} className={`flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-xs border ${done ? "bg-primary/10 border-primary/30 text-primary" : isCurrent ? "bg-primary text-primary-foreground border-primary" : "bg-secondary/50 border-border text-muted-foreground"}`}>
                                {done ? <CheckCircle2 size={9} /> : <Target size={9} />}
                                <span className="font-medium">Wk {m.week}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {nextMilestone && (
                        <div className="flex items-center gap-2 text-xs bg-primary/5 border border-primary/20 rounded-lg px-3 py-2">
                          <CheckSquare size={11} className="text-primary shrink-0" />
                          <span><span className="font-semibold text-primary">Week {nextMilestone.week}:</span> {nextMilestone.description}</span>
                        </div>
                      )}

                      {/* Full plan accordion */}
                      {parsedSched.isV2 && parsedSched.weeks.length > 1 && (
                        <PlanWeekAccordion weeks={parsedSched.weeks} currentWeek={currentWeek} templates={templates} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Workout Logs */}
      {tab === "logs" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Your past workout sessions</p>
            <Button size="sm" onClick={() => { setEditLog(null); setLogModal(true); }} className="gap-1.5">
              <Plus size={13} /> Log Workout
            </Button>
          </div>
          {logs.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground"><Dumbbell size={40} className="mx-auto mb-4 opacity-20" /><p className="font-medium">No workouts logged yet</p></div>
          ) : logs.map(log => {
            let exercises: any[] = [];
            try { exercises = JSON.parse(log.exercisesJson); } catch {}
            const prs = exercises.filter(e => e.isPR);
            return (
              <div key={log.id} className="bg-card border rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[hsl(210_80%_48%/0.12)] text-[hsl(210_80%_48%)] flex items-center justify-center shrink-0">
                      <Dumbbell size={17} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm">{log.name}</p>
                        <span className="text-xs text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">{WORKOUT_TYPE_LABELS[log.workoutType] ?? log.workoutType}</span>
                        {prs.length > 0 && <span className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800 flex items-center gap-0.5"><Star size={9} fill="currentColor" />{prs.length} PR{prs.length > 1 ? "s" : ""}</span>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{format(parseISO(log.date), "EEE, MMM d, yyyy")}{log.durationMinutes ? ` · ${log.durationMinutes} min` : ""}</p>
                      {exercises.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {exercises.slice(0, 5).map((ex, i) => (
                            <span key={i} className="text-xs bg-secondary px-2 py-0.5 rounded-full text-muted-foreground">
                              {ex.name}{ex.isPR ? " ⭐" : ""}
                              {ex.sets?.length ? ` ${ex.sets.length}×` : ""}
                            </span>
                          ))}
                          {exercises.length > 5 && <span className="text-xs text-muted-foreground">+{exercises.length - 5}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"><MoreHorizontal size={14} /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => { setEditLog(log); setLogModal(true); }}><Pencil size={13} className="mr-2" />Edit</DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => deleteLog.mutate(log.id)}><Trash2 size={13} className="mr-2" />Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* My Workouts (Templates) */}
      {tab === "templates" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm text-muted-foreground">Reusable workout routines you can start any time</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setExerciseSearchOpen(true)} className="gap-1.5">
                <Search size={13} /> Exercise Library
              </Button>
              <Button size="sm" onClick={() => { setEditTemplate(null); setTemplateModal(true); }} className="gap-1.5">
                <Plus size={13} /> New Workout
              </Button>
            </div>
          </div>
          {templates.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <LayoutTemplate size={40} className="mx-auto mb-4 opacity-20" />
              <p className="font-medium">No workouts yet</p>
              <p className="text-sm mt-1">Create a workout or use <strong>Generate Plan</strong> to build one with AI</p>
              <div className="flex gap-2 justify-center mt-4">
                <Button variant="outline" size="sm" className="gap-1" onClick={() => { setEditTemplate(null); setTemplateModal(true); }}><Plus size={13} /> New Workout</Button>
                <Button variant="outline" size="sm" className="gap-1 border-purple-300 text-purple-700" onClick={() => setGenerateOpen(true)}><Sparkles size={13} /> Generate Plan</Button>
              </div>
            </div>
          ) : templates.map(t => {
            let exercises: any[] = [];
            try { exercises = JSON.parse(t.exercisesJson); } catch {}
            return (
              <div key={t.id} className="bg-card border rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="font-semibold text-sm">{t.name}</p>
                      <span className="text-xs bg-secondary px-1.5 py-0.5 rounded text-muted-foreground">{WORKOUT_TYPE_LABELS[t.workoutType] ?? t.workoutType}</span>
                      {t.scheduledDay && <span className="text-xs bg-secondary px-1.5 py-0.5 rounded text-muted-foreground capitalize">{t.scheduledDay}</span>}
                      {t.recurring !== "none" && <span className="text-xs border border-border px-1.5 py-0.5 rounded text-muted-foreground">{t.recurring === "weekly" ? "Weekly" : t.recurring}</span>}
                    </div>
                    {exercises.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {exercises.map((ex, i) => {
                          const setCount = Array.isArray(ex.sets) ? ex.sets.length : (ex.sets ?? 0);
                          const setsSummary = Array.isArray(ex.sets)
                            ? ex.sets.map((s: any) => `${s.reps}×${s.weight}lb`).join(", ")
                            : `${ex.sets}×${ex.reps} @ ${ex.weight}lb`;
                          return (
                            <span key={i} className="text-xs bg-secondary px-2 py-0.5 rounded-full text-muted-foreground" title={setsSummary}>
                              {ex.name} · {setCount} sets
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"><MoreHorizontal size={14} /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => { setEditTemplate(t); setTemplateModal(true); }}><Pencil size={13} className="mr-2" />Edit</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openShareModal("template", t)}><Share2 size={13} className="mr-2" />Share with friend</DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => deleteTemplate.mutate(t.id)}><Trash2 size={13} className="mr-2" />Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t">
                  <Button size="sm" className="gap-1.5 h-8 flex-1" onClick={() => { setEditLog(null); setLogModal(true); }}>
                    <Zap size={12} /> Start Workout
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 shrink-0"><MoreHorizontal size={14} /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => { setEditTemplate(t); setTemplateModal(true); }}><Pencil size={13} className="mr-2" />Edit</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openShareModal("template", t)}><Share2 size={13} className="mr-2" />Share with friend</DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => deleteTemplate.mutate(t.id)}><Trash2 size={13} className="mr-2" />Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Plans */}
      {tab === "plans" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm text-muted-foreground">Goal-oriented training programs</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setGenerateOpen(true)} className="gap-1.5 border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/30">
                <Sparkles size={13} /> Generate with AI
              </Button>
              <Button size="sm" onClick={() => { setEditPlan(null); setPlanModal(true); }} className="gap-1.5">
                <Plus size={13} /> New Plan
              </Button>
            </div>
          </div>
          {plans.filter(p => p.goalType !== "body_composition").length === 0 ? (
            <div className="text-center py-16 text-muted-foreground border rounded-xl border-dashed">
              <CalendarDays size={40} className="mx-auto mb-4 opacity-20" />
              <p className="font-medium">No training plans yet</p>
              <p className="text-sm mt-1">Create a goal-oriented plan — marathon, strength PR, body composition, or general fitness</p>
              <Button variant="outline" size="sm" className="mt-4 gap-1" onClick={() => { setEditPlan(null); setPlanModal(true); }}>
                <Target size={13} /> Create Your First Plan
              </Button>
            </div>
          ) : plans.filter(p => p.goalType !== "body_composition").map(plan => {
            const parsedSched = parseSchedule(plan.scheduleJson ?? "[]");

            // Determine which week's schedule to show on the card
            const startDate = plan.startDate ? new Date(plan.startDate) : null;
            const today = new Date();
            const weeksElapsed = startDate
              ? Math.max(0, Math.floor((today.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000)))
              : 0;
            const currentWeek = Math.min(weeksElapsed + 1, plan.durationWeeks);
            const progressPct = Math.min(100, Math.round((weeksElapsed / plan.durationWeeks) * 100));

            // Get the display week's day entries
            let displayDays: PlanDayEntryV2[] = [];
            if (parsedSched.isV2) {
              // Try to show the current week, fall back to week 1
              displayDays = parsedSched.weeks.find(w => w.week === currentWeek)?.days
                ?? parsedSched.weeks[0]?.days ?? [];
            } else {
              // Old format — convert
              displayDays = parsedSched.flatDays.map(e => ({
                dayOfWeek: e.dayOfWeek,
                label: e.label ?? e.templateName ?? "Workout",
                templateId: e.templateId,
              }));
            }
            const activeDaysCount = displayDays.length;
            const totalWeeksScheduled = parsedSched.isV2 ? parsedSched.weeks.length : 1;

            let goalMetric: any = null;
            try { goalMetric = plan.goalMetricJson ? JSON.parse(plan.goalMetricJson) : null; } catch {}
            let milestones: WorkoutPlanMilestone[] = [];
            try { milestones = plan.milestonesJson ? JSON.parse(plan.milestonesJson) : []; } catch {}

            // Goal progress bar
            const goalProgress = goalMetric?.currentValue && goalMetric?.targetValue
              ? Math.min(100, Math.round(((goalMetric.currentValue) / goalMetric.targetValue) * 100))
              : null;

            const goalInfo = GOAL_TYPES.find(g => g.value === plan.goalType);
            const nextMilestone = milestones.find(m => m.week >= currentWeek);

            return (
              <div key={plan.id} className={`bg-card border-2 rounded-xl overflow-hidden transition-all ${plan.isActive ? "border-primary shadow-sm shadow-primary/10" : "border-border"}`}>
                {/* Active banner */}
                {plan.isActive && (
                  <div className="bg-primary text-primary-foreground text-xs font-semibold px-4 py-1.5 flex items-center gap-1.5">
                    <Play size={10} fill="currentColor" /> Active Plan — Week {currentWeek} of {plan.durationWeeks}
                  </div>
                )}

                <div className="p-4 pb-3 space-y-3">
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <p className="font-semibold text-sm">{plan.name}</p>
                        {goalInfo && (
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${goalInfo.color}`}>
                            {goalInfo.label}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">{plan.durationWeeks}w · {activeDaysCount}d/wk{totalWeeksScheduled > 1 ? ` · ${totalWeeksScheduled} wks planned` : ""}</span>
                      </div>
                      {plan.description && <p className="text-xs text-muted-foreground line-clamp-1">{plan.description}</p>}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"><MoreHorizontal size={14} /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => {
                          if (plan.goalType === "body_composition") {
                            setBodyCompEditingPlan(plan);
                            setBodyCompWizardOpen(true);
                          } else {
                            setEditPlan(plan); setPlanModal(true);
                          }
                        }}><Pencil size={13} className="mr-2" />Edit Plan</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openShareModal("plan", plan)}><Share2 size={13} className="mr-2" />Share with friend</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => deletePlan.mutate(plan.id)}><Trash2 size={13} className="mr-2" />Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Goal metric display */}
                  {goalMetric && plan.goalType === "strength_pr" && (
                    <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded-lg px-3 py-2">
                      <p className="text-xs font-semibold text-orange-700 dark:text-orange-300 flex items-center gap-1.5 mb-1"><Trophy size={11} /> {goalMetric.exercise}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold">{goalMetric.currentValue}{goalMetric.unit}</span>
                        <div className="flex-1 h-1.5 bg-orange-100 dark:bg-orange-900/50 rounded-full overflow-hidden">
                          <div className="h-full bg-orange-500 rounded-full transition-all" style={{ width: `${goalProgress ?? 0}%` }} />
                        </div>
                        <span className="text-sm font-bold text-orange-600 dark:text-orange-400">{goalMetric.targetValue}{goalMetric.unit}</span>
                      </div>
                    </div>
                  )}

                  {goalMetric && plan.goalType === "endurance" && (
                    <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2">
                      <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 flex items-center gap-1.5 mb-1"><TrendingUp size={11} /> {goalMetric.raceDistance}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {goalMetric.raceDate && <span>🗓 Race: {new Date(goalMetric.raceDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>}
                        {goalMetric.currentDistance > 0 && <span>· Current long run: {goalMetric.currentDistance} {goalMetric.unit}</span>}
                      </div>
                    </div>
                  )}

                  {plan.goalType === "body_composition" && goalMetric && (
                    <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2 space-y-2">
                      <p className="text-xs font-semibold text-green-700 dark:text-green-300 flex items-center gap-1.5 mb-1">
                        <Heart size={11} />
                        {goalMetric.metric === "body_weight" || goalMetric.metric === "weight" ? "Body Weight" :
                         goalMetric.metric === "body_fat" ? "Body Fat %" :
                         goalMetric.metric === "muscle_mass" ? "Muscle Mass" : "Body Recomposition"}
                      </p>
                      {goalMetric.targetCalories ? (
                        <p className="text-xs text-muted-foreground">{goalMetric.targetCalories} kcal · P {goalMetric.proteinGrams}g · C {goalMetric.carbsGrams}g · F {goalMetric.fatGrams}g</p>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold">{goalMetric.currentValue}{goalMetric.unit}</span>
                          <span className="text-xs text-muted-foreground">→</span>
                          <span className="text-sm font-bold text-green-600 dark:text-green-400">{goalMetric.targetValue}{goalMetric.unit}</span>
                        </div>
                      )}
                      {plan.isActive && (
                        <button
                          onClick={() => setLocation("/health")}
                          className="w-full flex items-center justify-center gap-1.5 text-[11px] font-medium text-green-700 dark:text-green-300 hover:text-green-800 dark:hover:text-green-200 bg-green-100 dark:bg-green-900/30 hover:bg-green-200 dark:hover:bg-green-900/50 rounded-md px-2 py-1.5 transition-colors"
                        >
                          <UtensilsCrossed size={11} />
                          Track nutrition in Health tab
                          <ChevronRight size={11} />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Week progress bar */}
                  {plan.startDate && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Week {currentWeek} of {plan.durationWeeks}</span>
                        <span>{progressPct}% complete</span>
                      </div>
                      <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progressPct}%` }} />
                      </div>
                    </div>
                  )}

                  {/* Next milestone */}
                  {nextMilestone && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground border rounded-lg px-3 py-2 bg-muted/30">
                      <CheckSquare size={11} className="text-primary shrink-0" />
                      <span><span className="font-medium">Week {nextMilestone.week}:</span> {nextMilestone.description}</span>
                    </div>
                  )}

                  {/* Weekly schedule mini-grid */}
                  {displayDays.length > 0 && (
                    <>
                      {parsedSched.isV2 && (
                        <p className="text-[10px] text-muted-foreground">
                          Week {currentWeek} schedule{totalWeeksScheduled > 1 ? ` (${totalWeeksScheduled} unique weeks planned)` : ""}
                        </p>
                      )}
                      <div className="grid grid-cols-7 gap-1">
                        {DAYS_OF_WEEK.map(day => {
                          const entry = displayDays.find(e => e.dayOfWeek === day);
                          return (
                            <div key={day} className={`rounded-lg p-1.5 text-center flex flex-col items-center gap-0.5 ${entry ? "bg-primary/8 border border-primary/20" : "bg-secondary/40"}`}>
                              <span className="text-[9px] font-bold text-muted-foreground uppercase">{DAY_LABELS[day]}</span>
                              {entry ? (
                                <>
                                  {entry.templateId ? <Dumbbell size={10} className="text-primary" /> : <TrendingUp size={10} className="text-primary" />}
                                  <span className="text-[8px] leading-tight text-center line-clamp-2 font-medium">{entry.label}</span>
                                  {entry.notes && <span className="text-[7px] text-muted-foreground/70 line-clamp-1">{entry.notes}</span>}
                                </>
                              ) : (
                                <span className="text-[9px] text-muted-foreground/40 mt-0.5">—</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {/* Footer actions */}
                  <div className="flex items-center gap-2 pt-1 border-t">
                    <Button
                      size="sm"
                      variant={plan.isActive ? "outline" : "default"}
                      className={`gap-1.5 h-8 flex-1 ${plan.isActive ? "text-primary border-primary/40 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40" : ""}`}
                      onClick={() => activatePlan.mutate(plan.id)}
                      disabled={activatePlan.isPending}
                    >
                      {plan.isActive
                        ? <><CheckCircle2 size={12} /> Active — tap to deactivate</>
                        : <><Play size={12} /> Set as Active Plan</>}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Body Composition Plans section */}
          <BodyCompositionPlanSection
            externalWizardOpen={bodyCompWizardOpen}
            onAddWorkoutPlan={(goal) => { setGeneralFitnessWizardGoal(goal); setGeneralFitnessWizardOpen(true); }}
            externalEditingPlan={bodyCompEditingPlan}
            onExternalWizardClose={() => { setBodyCompWizardOpen(false); setBodyCompEditingPlan(null); }}
          />
        </div>
      )}

      {/* Shared */}
      {tab === "shared" && (
        <div className="space-y-3">
          {sharedItems.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Users size={40} className="mx-auto mb-4 opacity-20" />
              <p className="font-medium">No shared workouts yet</p>
              <p className="text-sm mt-1">When friends share templates or plans with you, they'll appear here</p>
            </div>
          ) : sharedItems.map(item => {
            let content: any = {};
            try { content = JSON.parse(item.contentJson); } catch {}
            const isPlan = item.shareType === "plan";
            return (
              <div key={item.id} className="bg-card border rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                      {item.fromUser.avatarUrl
                        ? <img src={item.fromUser.avatarUrl} className="w-9 h-9 rounded-full object-cover" />
                        : <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{item.fromUser.name[0]}</span>
                      }
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{content.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {isPlan ? <><CalendarDays size={10} className="inline mr-1" />Plan</> : <><LayoutTemplate size={10} className="inline mr-1" />Template</>}
                        {" · "}from <span className="font-medium">{item.fromUser.name}</span>
                      </p>
                      {item.notes && <p className="text-xs text-muted-foreground/80 italic mt-0.5">"{item.notes}"</p>}
                    </div>
                  </div>
                  <button type="button" onClick={() => dismissShare.mutate(item.id)} className="text-muted-foreground/40 hover:text-muted-foreground p-1 rounded shrink-0">
                    <X size={14} />
                  </button>
                </div>

                {/* Preview */}
                {!isPlan && content.exercisesJson && (() => {
                  let exs: any[] = [];
                  try { exs = JSON.parse(content.exercisesJson); } catch {}
                  return exs.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 pl-12">
                      {exs.slice(0, 5).map((ex: any, i: number) => (
                        <span key={i} className="text-xs bg-secondary px-2 py-0.5 rounded-full text-muted-foreground">{ex.name}</span>
                      ))}
                      {exs.length > 5 && <span className="text-xs text-muted-foreground">+{exs.length - 5}</span>}
                    </div>
                  ) : null;
                })()}

                {isPlan && content.schedule?.length > 0 && (
                  <div className="grid grid-cols-7 gap-1 pl-12">
                    {DAYS_OF_WEEK.map(day => {
                      const entry = content.schedule.find((e: any) => e.dayOfWeek === day);
                      return (
                        <div key={day} className={`rounded p-1 text-center ${entry ? "bg-primary/8 border border-primary/20" : "bg-secondary/40"}`}>
                          <span className="text-[9px] font-bold text-muted-foreground uppercase block">{DAY_LABELS[day]}</span>
                          {entry ? (
                            <span className="text-[8px] leading-tight line-clamp-2 font-medium">{entry.templateName}</span>
                          ) : (
                            <span className="text-[9px] text-muted-foreground/40">—</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="flex gap-2 pl-12">
                  <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs"
                    disabled={isPlan ? saveSharedPlan.isPending : saveSharedTemplate.isPending}
                    onClick={() => isPlan ? saveSharedPlan.mutate({ content }) : saveSharedTemplate.mutate({ content })}>
                    {(isPlan ? saveSharedPlan.isPending : saveSharedTemplate.isPending)
                      ? <Loader2 size={11} className="animate-spin" />
                      : <Plus size={11} />}
                    Save to my {isPlan ? "Plans" : "Templates"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Equipment */}
      {tab === "equipment" && (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <p className="text-sm text-muted-foreground">
              Track your gym equipment — it's used for exercise search and AI plan generation.
            </p>
            <div className="flex gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={addGymMembership}
                disabled={gymAdding}
                title="Adds barbells, dumbbells, cables, machines, cardio equipment, and more"
              >
                {gymAdding ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
                Gym Membership
              </Button>
              <Button size="sm" className="gap-1.5" onClick={() => { setEditEquipment(null); setEquipmentModal(true); }}>
                <Plus size={13} /> Add Equipment
              </Button>
            </div>
          </div>

          {equipmentList.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground border rounded-xl border-dashed">
              <Package size={40} className="mx-auto mb-4 opacity-20" />
              <p className="font-medium">No equipment added yet</p>
              <p className="text-sm mt-1">Add your gym equipment so AI can personalize your workout plans</p>
              <Button variant="outline" size="sm" className="mt-4 gap-1" onClick={() => { setEditEquipment(null); setEquipmentModal(true); }}>
                <Plus size={13} /> Add Equipment
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {EQUIPMENT_CATEGORIES.filter(cat => equipmentByCategory[cat.value]?.length > 0).map(cat => (
                <div key={cat.value}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{cat.label}</p>
                  <div className="flex flex-wrap gap-2">
                    {equipmentByCategory[cat.value].map(item => (
                      <div key={item.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${cat.color}`}>
                        <span className="text-sm font-medium">{item.name}</span>
                        {item.notes && <span className="text-xs opacity-70">({item.notes})</span>}
                        <div className="flex gap-0.5 ml-1">
                          <button onClick={() => { setEditEquipment(item); setEquipmentModal(true); }}
                            className="p-0.5 rounded opacity-60 hover:opacity-100 transition-opacity">
                            <Pencil size={11} />
                          </button>
                          <button onClick={() => deleteEquipment.mutate(item.id)}
                            className="p-0.5 rounded opacity-60 hover:opacity-100 hover:text-destructive transition-all">
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Quick-add common equipment */}
          {equipmentList.length === 0 && (
            <div className="border rounded-xl p-4 bg-muted/30">
              <p className="text-sm font-medium mb-3">Quick add common equipment:</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { name: "Barbell", category: "barbell" },
                  { name: "Dumbbells (pair)", category: "dumbbell" },
                  { name: "Kettlebell", category: "kettlebell" },
                  { name: "Pull-up Bar", category: "pullup_bar" },
                  { name: "Resistance Bands", category: "resistance_band" },
                  { name: "Flat Bench", category: "bench" },
                  { name: "Cable Machine", category: "cable" },
                  { name: "Treadmill", category: "cardio" },
                ].map(item => (
                  <button key={item.name}
                    className="px-3 py-1.5 text-sm rounded-lg bg-secondary hover:bg-secondary/80 border transition-colors"
                    onClick={async () => {
                      await apiRequest("POST", "/api/equipment", { name: item.name, category: item.category });
                      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
                    }}>
                    + {item.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      <WorkoutLogModal open={logModal} onClose={() => { setLogModal(false); setEditLog(null); setLogPrefillName(""); setLogPrefillTemplateId(undefined); }} templates={templates} editLog={editLog} prefillName={logPrefillName} prefillTemplateId={logPrefillTemplateId} />

      {/* Workout action dialog (Edit / Delete / Log from Active Plan) */}
      <Dialog open={!!workoutActionTarget} onOpenChange={open => { if (!open) { setWorkoutActionTarget(null); setWorkoutActionMode("menu"); setEditWizardSession(null); } }}>
        <DialogContent className={workoutActionMode === "edit" && workoutActionTarget?.entry.wizardSession ? "max-w-lg" : "max-w-sm"}>
          <DialogHeader>
            <DialogTitle className="text-base">
              {workoutActionTarget?.entry.label ?? "Workout"}
            </DialogTitle>
          </DialogHeader>

          {workoutActionMode === "edit" && workoutActionTarget && workoutActionTarget.entry.wizardSession && editWizardSession && (
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              {/* Primary lift */}
              {editWizardSession.primary_lift && (
                <div className="rounded-lg border p-3 space-y-2">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Primary — {editWizardSession.primary_lift.name}</p>
                  {editWizardSession.primary_lift.sets?.map((s: any, si: number) => (
                    <div key={si} className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground w-10 shrink-0">Set {s.set}</span>
                      <Input className="h-7 text-xs w-16" value={s.reps} onChange={e => {
                        const ws = JSON.parse(JSON.stringify(editWizardSession));
                        ws.primary_lift.sets[si].reps = e.target.value;
                        setEditWizardSession(ws);
                      }} />
                      <Input className="h-7 text-xs flex-1" value={s.weight} onChange={e => {
                        const ws = JSON.parse(JSON.stringify(editWizardSession));
                        ws.primary_lift.sets[si].weight = e.target.value;
                        setEditWizardSession(ws);
                      }} />
                    </div>
                  ))}
                </div>
              )}
              {/* Accessories */}
              {editWizardSession.accessories?.map((acc: any, ai: number) => (
                <div key={ai} className="rounded-lg border p-3 space-y-2">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{acc.name}</p>
                  {acc.sets?.map((s: any, si: number) => (
                    <div key={si} className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground w-10 shrink-0">Set {s.set}</span>
                      <Input className="h-7 text-xs w-16" value={s.reps} onChange={e => {
                        const ws = JSON.parse(JSON.stringify(editWizardSession));
                        ws.accessories[ai].sets[si].reps = e.target.value;
                        setEditWizardSession(ws);
                      }} />
                      <Input className="h-7 text-xs flex-1" value={s.weight} onChange={e => {
                        const ws = JSON.parse(JSON.stringify(editWizardSession));
                        ws.accessories[ai].sets[si].weight = e.target.value;
                        setEditWizardSession(ws);
                      }} />
                    </div>
                  ))}
                </div>
              ))}
              <div className="flex flex-col gap-2 pt-1">
                {/* Log with Saved Changes */}
                <Button className="w-full gap-2 justify-start" disabled={patchPlanSchedule.isPending} onClick={() => {
                  const target = workoutActionTarget;
                  const plan = plans.find(p => p.id === target.planId);
                  if (!plan) return;
                  let raw: any = {};
                  try { raw = JSON.parse(plan.scheduleJson ?? "{}"); } catch {}
                  const wizardPlan = raw.plan ?? raw;
                  if (wizardPlan?.weeks) {
                    ["A","B"].forEach(wl => {
                      if (!wizardPlan.weeks[wl]) return;
                      wizardPlan.weeks[wl] = wizardPlan.weeks[wl].map((s: any) =>
                        s.day.toLowerCase() === target.dayOfWeek ? { ...s, ...editWizardSession } : s
                      );
                    });
                    const newJson = JSON.stringify(raw.plan ? { ...raw, plan: wizardPlan } : wizardPlan);
                    patchPlanSchedule.mutate({ planId: target.planId, scheduleJson: newJson });
                  }
                  setEditWizardSession(null);
                  setLogPrefillName(target.entry.label);
                  if (target.entry.templateId) setLogPrefillTemplateId(target.entry.templateId);
                  setWorkoutActionTarget(null);
                  setEditLog(null);
                  setLogModal(true);
                }}>
                  <ClipboardList size={14} /> Log Workout with Saved Changes
                </Button>
                {/* Log without saving */}
                <Button variant="outline" className="w-full gap-2 justify-start" onClick={() => {
                  const target = workoutActionTarget;
                  setLogPrefillName(target.entry.label);
                  if (target.entry.templateId) setLogPrefillTemplateId(target.entry.templateId);
                  setWorkoutActionTarget(null);
                  setEditLog(null);
                  setLogModal(true);
                }}>
                  <ClipboardList size={14} /> Log Workout
                </Button>
                {/* Delete */}
                <Button variant="outline" className="w-full gap-2 justify-start text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30" onClick={() => {
                  const target = workoutActionTarget;
                  const plan = plans.find(p => p.id === target.planId);
                  if (!plan) return;
                  const parsed = parseSchedule(plan.scheduleJson ?? "[]");
                  let newWeeks: WeekScheduleV2[];
                  if (parsed.isV2) {
                    newWeeks = parsed.weeks.map(w =>
                      w.week === target.week
                        ? { ...w, days: w.days.filter(d => d.dayOfWeek !== target.dayOfWeek) }
                        : w
                    );
                  } else {
                    newWeeks = [{ week: 1, days: parsed.flatDays.filter(d => d.dayOfWeek !== target.dayOfWeek) }];
                  }
                  patchPlanSchedule.mutate({ planId: target.planId, scheduleJson: JSON.stringify(newWeeks) });
                  toast({ title: "Workout removed from plan" });
                }}>
                  <Trash2 size={14} /> Delete from Plan
                </Button>
              </div>
            </div>
          )}

          {workoutActionMode === "edit" && workoutActionTarget && !workoutActionTarget.entry.wizardSession && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Workout name</label>
                <Input value={editEntryLabel} onChange={e => setEditEntryLabel(e.target.value)} placeholder="e.g. Easy Run, Heavy Bench" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Notes (distance, sets, focus…)</label>
                <Textarea value={editEntryNotes} onChange={e => setEditEntryNotes(e.target.value)} placeholder="e.g. 8 miles · long run" rows={2} className="resize-none" />
              </div>
              <div className="flex flex-col gap-2 pt-1">
                {/* Log with Saved Changes */}
                <Button className="w-full gap-2 justify-start" disabled={!editEntryLabel.trim() || patchPlanSchedule.isPending} onClick={() => {
                  const target = workoutActionTarget;
                  const plan = plans.find(p => p.id === target.planId);
                  if (!plan) return;
                  const parsed = parseSchedule(plan.scheduleJson ?? "[]");
                  const updated: PlanDayEntryV2 = { ...target.entry, label: editEntryLabel.trim(), notes: editEntryNotes.trim() || undefined };
                  let newWeeks: WeekScheduleV2[];
                  if (parsed.isV2) {
                    newWeeks = parsed.weeks.map(w =>
                      w.week === target.week
                        ? { ...w, days: w.days.map(d => d.dayOfWeek === target.dayOfWeek ? updated : d) }
                        : w
                    );
                  } else {
                    newWeeks = [{ week: 1, days: parsed.flatDays.map(d => d.dayOfWeek === target.dayOfWeek ? { ...updated } : { dayOfWeek: d.dayOfWeek, label: d.label ?? d.templateName ?? "Workout" }) }];
                  }
                  patchPlanSchedule.mutate({ planId: target.planId, scheduleJson: JSON.stringify(newWeeks) });
                  setLogPrefillName(editEntryLabel.trim());
                  if (target.entry.templateId) setLogPrefillTemplateId(target.entry.templateId);
                  setWorkoutActionTarget(null);
                  setEditLog(null);
                  setLogModal(true);
                }}>
                  <ClipboardList size={14} /> Log Workout with Saved Changes
                </Button>
                {/* Log without saving */}
                <Button variant="outline" className="w-full gap-2 justify-start" onClick={() => {
                  const target = workoutActionTarget;
                  setLogPrefillName(target.entry.label);
                  if (target.entry.templateId) setLogPrefillTemplateId(target.entry.templateId);
                  setWorkoutActionTarget(null);
                  setEditLog(null);
                  setLogModal(true);
                }}>
                  <ClipboardList size={14} /> Log Workout
                </Button>
                {/* Delete */}
                <Button variant="outline" className="w-full gap-2 justify-start text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30" onClick={() => {
                  const target = workoutActionTarget;
                  const plan = plans.find(p => p.id === target.planId);
                  if (!plan) return;
                  const parsed = parseSchedule(plan.scheduleJson ?? "[]");
                  let newWeeks: WeekScheduleV2[];
                  if (parsed.isV2) {
                    newWeeks = parsed.weeks.map(w =>
                      w.week === target.week
                        ? { ...w, days: w.days.filter(d => d.dayOfWeek !== target.dayOfWeek) }
                        : w
                    );
                  } else {
                    newWeeks = [{ week: 1, days: parsed.flatDays.filter(d => d.dayOfWeek !== target.dayOfWeek) }];
                  }
                  patchPlanSchedule.mutate({ planId: target.planId, scheduleJson: JSON.stringify(newWeeks) });
                  toast({ title: "Workout removed from plan" });
                }}>
                  <Trash2 size={14} /> Delete from Plan
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <WorkoutTemplateModal
        open={templateModal}
        onClose={() => { setTemplateModal(false); setEditTemplate(null); setTemplateModalFromPlan(false); }}
        editTemplate={editTemplate}
        onLog={templateModalFromPlan ? () => {
          const target = workoutActionTarget;
          setTemplateModal(false); setEditTemplate(null); setTemplateModalFromPlan(false);
          if (target) {
            setLogPrefillName(target.entry.label);
            if (target.entry.templateId) setLogPrefillTemplateId(target.entry.templateId);
            setWorkoutActionTarget(null);
          }
          setEditLog(null); setLogModal(true);
        } : undefined}
        onDeleteFromPlan={templateModalFromPlan ? () => {
          const target = workoutActionTarget;
          setTemplateModal(false); setEditTemplate(null); setTemplateModalFromPlan(false); setWorkoutActionTarget(null);
          if (!target) return;
          const plan = plans.find(p => p.id === target.planId);
          if (!plan) return;
          const parsed = parseSchedule(plan.scheduleJson ?? "[]");
          let newWeeks: WeekScheduleV2[];
          if (parsed.isV2) {
            newWeeks = parsed.weeks.map(w =>
              w.week === target.week
                ? { ...w, days: w.days.filter(d => d.dayOfWeek !== target.dayOfWeek) }
                : w
            );
          } else {
            newWeeks = [{ week: 1, days: parsed.flatDays.filter(d => d.dayOfWeek !== target.dayOfWeek) }];
          }
          patchPlanSchedule.mutate({ planId: target.planId, scheduleJson: JSON.stringify(newWeeks) });
          toast({ title: "Workout removed from plan" });
        } : undefined}
      />
      <ExerciseSearchModal open={exerciseSearchOpen} onClose={() => setExerciseSearchOpen(false)} templates={templates} />
      <GenerateWorkoutPlanModal open={generateOpen} onClose={() => setGenerateOpen(false)} userEquipment={equipmentList} goals={goals} />
      <EquipmentModal open={equipmentModal} onClose={() => { setEquipmentModal(false); setEditEquipment(null); }} editing={editEquipment} />
      <PlanBuilderModal open={planModal} onClose={() => { setPlanModal(false); setEditPlan(null); }} editing={editPlan} templates={templates} onBodyCompSelected={() => setBodyCompWizardOpen(true)} onGeneralFitnessSelected={() => { setPlanModal(false); setGeneralFitnessWizardOpen(true); }} />
      <GeneralFitnessWizard open={generalFitnessWizardOpen} onClose={() => { setGeneralFitnessWizardOpen(false); setGeneralFitnessWizardGoal(undefined); }} defaultGoal={generalFitnessWizardGoal} />
      {sharePayload && (
        <ShareWorkoutModal
          open={shareModal} onClose={() => { setShareModal(false); setSharePayload(null); }}
          shareType={sharePayload.type} contentJson={sharePayload.contentJson} itemName={sharePayload.name}
        />
      )}
      </div>
    </PageShell>
  );
}
