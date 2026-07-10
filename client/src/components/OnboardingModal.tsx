import { useState, useEffect } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { ArrowRight, Check, Loader2, X } from "lucide-react";
import PlannerSetup from "@/pages/planner/Setup";

// ── Persona definitions ───────────────────────────────────────────────────────

type PersonaKey = "momentum" | "health" | "explore_life" | "connect";

// Legacy keys from v1 onboarding — mapped forward for any existing stored values
const LEGACY_PERSONA_MAP: Record<string, PersonaKey> = {
  healthy:    "health",
  explore:    "explore_life",
  organized:  "momentum",
};

const PERSONAS: { key: PersonaKey; emoji: string; title: string; sub: string }[] = [
  {
    key: "momentum",
    emoji: "🎯",
    title: "Get things done",
    sub:   "Goals, tasks, habits, and weekly reviews that keep you moving forward",
  },
  {
    key: "health",
    emoji: "💪",
    title: "Health & Energy",
    sub:   "Workouts, nutrition, habits, and body metrics — all in one place",
  },
  {
    key: "explore_life",
    emoji: "⭐",
    title: "Save my life library",
    sub:   "Books, music, recipes, places, trips, and interests worth remembering",
  },
  {
    key: "connect",
    emoji: "👥",
    title: "Share with people",
    sub:   "Friends, family, shared interests, and recommendations that matter",
  },
];

// ── Intention definitions ─────────────────────────────────────────────────────

export type IntentionKey =
  | "goal"
  | "habit"
  | "plan_week"
  | "save_recs"
  | "track_workouts"
  | "organize_places"
  | "connect_friends"
  | "private_notes";

export const INTENTIONS: { key: IntentionKey; emoji: string; label: string }[] = [
  { key: "goal",            emoji: "🎯", label: "Hit a goal"            },
  { key: "habit",           emoji: "✅", label: "Build a habit"         },
  { key: "plan_week",       emoji: "📅", label: "Plan my week"          },
  { key: "save_recs",       emoji: "⭐", label: "Save recommendations"  },
  { key: "track_workouts",  emoji: "💪", label: "Track workouts"        },
  { key: "organize_places", emoji: "📍", label: "Organize places/trips" },
  { key: "connect_friends", emoji: "👥", label: "Connect with friends"  },
  { key: "private_notes",   emoji: "📝", label: "Keep private notes"    },
];

// ── First-item creation config ────────────────────────────────────────────────

type CreateOptionKey =
  | "goal" | "task" | "habit"
  | "workout_log" | "health_goal" | "fitness_habit" | "training_plan" | "meal_plan"
  | "book" | "place" | "recipe"
  | "person" | "interest" | "book_share";

interface CreateOption {
  key: CreateOptionKey;
  emoji: string;
  label: string;
  sub: string;
  /** Where to navigate after successful creation */
  href: string;
}

const CREATE_OPTIONS: Record<PersonaKey, CreateOption[]> = {
  momentum: [
    { key: "goal",  emoji: "🎯", label: "Set a goal",    sub: "Something you want to achieve this year",    href: "/goals"  },
    { key: "task",  emoji: "✅", label: "Add a task",    sub: "One thing you want to get done",              href: "/tasks"  },
    { key: "habit", emoji: "🔥", label: "Build a habit", sub: "A daily action you want to lock in",          href: "/habits" },
  ],
  health: [
    { key: "training_plan", emoji: "🏋️", label: "Build a Training Plan", sub: "Get an AI-generated workout schedule",  href: "/health"              },
    { key: "meal_plan",     emoji: "🍽️", label: "Create a Meal Plan",    sub: "AI meal plan tailored to your goals",  href: "/health?tab=nutrition" },
    { key: "health_goal",   emoji: "🎯", label: "Set a health goal",     sub: "A fitness or wellness target",          href: "/goals"                },
    { key: "fitness_habit", emoji: "🔥", label: "Create a fitness habit", sub: "A daily movement or wellness habit",   href: "/habits"               },
  ],
  explore_life: [
    { key: "book",   emoji: "📚", label: "Save a book",   sub: "Something you want to read",          href: "/library" },
    { key: "place",  emoji: "📍", label: "Add a place",   sub: "A spot worth saving",                 href: "/places"  },
    { key: "recipe", emoji: "🍽️", label: "Save a recipe", sub: "A dish you want to make",             href: "/health?tab=recipes" },
  ],
  connect: [
    { key: "person",     emoji: "👤", label: "Add a person",   sub: "Someone important to you",           href: "/people"  },
    { key: "interest",   emoji: "✨", label: "Save an interest", sub: "A hobby or passion",               href: "/hobbies" },
    { key: "book_share", emoji: "📚", label: "Save a book",    sub: "Something worth recommending",       href: "/library" },
  ],
};

// ── Storage helpers ───────────────────────────────────────────────────────────

export const ONBOARDING_PERSONA_KEY    = "mylifos_onboarding_persona";
export const ONBOARDING_CHECKLIST_KEY  = "mylifos_onboarding_checklist";
export const ONBOARDING_INTENTIONS_KEY = "mylifos_onboarding_intentions";

function normalisePersona(raw: string): PersonaKey {
  if (raw in LEGACY_PERSONA_MAP) return LEGACY_PERSONA_MAP[raw as keyof typeof LEGACY_PERSONA_MAP];
  if (raw in CREATE_OPTIONS) return raw as PersonaKey;
  return "momentum";
}

// Minimal checklist for GetStartedWidget compat (no longer path-driven, just persona-based hints)
const PERSONA_CHECKLIST: Record<PersonaKey, { section: string; href: string }[]> = {
  momentum:     [{ section: "Goals",   href: "/goals"   }, { section: "Tasks",   href: "/tasks"   }, { section: "Habits",  href: "/habits"  }, { section: "Review",  href: "/review"  }],
  health:       [{ section: "Health",  href: "/health"  }, { section: "Habits",  href: "/habits"  }, { section: "Goals",   href: "/goals"   }],
  explore_life: [{ section: "Library", href: "/library" }, { section: "Places",  href: "/places"  }, { section: "Hobbies", href: "/hobbies" }],
  connect:      [{ section: "People",  href: "/people"  }, { section: "Library", href: "/library" }, { section: "Hobbies", href: "/hobbies" }],
};

export function saveOnboardingData(persona: PersonaKey) {
  try {
    const key = normalisePersona(persona);
    localStorage.setItem(ONBOARDING_PERSONA_KEY, key);
    const steps = PERSONA_CHECKLIST[key].map(s => ({ ...s, done: false }));
    localStorage.setItem(ONBOARDING_CHECKLIST_KEY, JSON.stringify(steps));
  } catch {}
}

export function loadChecklist(): { section: string; href: string; done: boolean }[] {
  try {
    const raw = localStorage.getItem(ONBOARDING_CHECKLIST_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveChecklist(items: { section: string; href: string; done: boolean }[]) {
  try { localStorage.setItem(ONBOARDING_CHECKLIST_KEY, JSON.stringify(items)); } catch {}
}

export function loadIntentions(): IntentionKey[] {
  try {
    const raw = localStorage.getItem(ONBOARDING_INTENTIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveIntentions(intentions: IntentionKey[]) {
  try { localStorage.setItem(ONBOARDING_INTENTIONS_KEY, JSON.stringify(intentions)); } catch {}
}

const DASHBOARD_SECTIONS_KEY = "dashboard_sections_v2";
const NAV_PATHS = [
  "/dashboard", "/calendar", "/goals", "/tasks", "/habits", "/journal", "/review",
  "/people", "/messenger", "/mylifos", "/health", "/recipes", "/library", "/hobbies",
  "/places", "/budget", "/housekeeping", "/beliefs",
];

const PERSONA_NAV_VISIBLE: Record<PersonaKey, string[]> = {
  momentum: ["/dashboard", "/goals", "/tasks", "/habits", "/review", "/mylifos", "/health", "/people", "/messenger"],
  health: ["/dashboard", "/health", "/habits", "/goals", "/tasks", "/review", "/mylifos", "/people", "/messenger"],
  explore_life: ["/dashboard", "/mylifos", "/library", "/hobbies", "/places", "/journal", "/people", "/messenger", "/health"],
  connect: ["/dashboard", "/people", "/messenger", "/mylifos", "/library", "/hobbies", "/places", "/goals", "/tasks"],
};

const INTENTION_NAV_BOOSTS: Partial<Record<IntentionKey, string[]>> = {
  goal: ["/goals", "/tasks"],
  habit: ["/habits"],
  plan_week: ["/review", "/calendar"],
  save_recs: ["/mylifos", "/library"],
  track_workouts: ["/health"],
  organize_places: ["/places"],
  connect_friends: ["/people", "/messenger"],
  private_notes: ["/journal"],
};

function buildNavPrefs(persona: PersonaKey, intentions: IntentionKey[], pinnedExtras: string[] = []) {
  const visible = new Set<string>(["/dashboard", ...(PERSONA_NAV_VISIBLE[persona] ?? [])]);
  intentions.forEach(intent => INTENTION_NAV_BOOSTS[intent]?.forEach(path => visible.add(path)));
  pinnedExtras.forEach(p => visible.add(p));
  const ordered = [
    "/dashboard",
    ...intentions.flatMap(intent => INTENTION_NAV_BOOSTS[intent] ?? []),
    ...(PERSONA_NAV_VISIBLE[persona] ?? []),
    ...NAV_PATHS,
  ].filter((path, idx, arr) => NAV_PATHS.includes(path) && arr.indexOf(path) === idx);
  return ordered.map(path => ({ path, hidden: !visible.has(path) }));
}

function saveFirstRunDashboardDefaults(persona: PersonaKey, intentions: IntentionKey[]) {
  try {
    if (localStorage.getItem(DASHBOARD_SECTIONS_KEY)) return;
    const social = persona === "connect" || intentions.includes("connect_friends") || intentions.includes("save_recs");
    const progress = persona === "momentum" || persona === "health" || intentions.includes("goal") || intentions.includes("track_workouts");
    const recent = persona === "explore_life" || intentions.includes("save_recs") || intentions.includes("private_notes");
    localStorage.setItem(DASHBOARD_SECTIONS_KEY, JSON.stringify({
      today: true,
      focus: true,
      up_next: true,
      progress,
      social_feed: social,
      needs_attention: false,
      events: false,
      recent_activity: recent,
      quick_jump: false,
      day_planner: false,
      memories: persona === "explore_life",
      quote: persona === "explore_life",
    }));
  } catch {}
}

function persistOnboardingSetup(persona: PersonaKey | null, intentions: IntentionKey[], pinnedExtras: string[] = []) {
  const key = persona ?? "momentum";
  saveOnboardingData(key);
  saveIntentions(intentions);
  saveFirstRunDashboardDefaults(key, intentions);
  try { localStorage.setItem("mylifos_onboarding_completed_at", Date.now().toString()); } catch {}
  apiRequest("POST", "/api/nav-prefs", buildNavPrefs(key, intentions, pinnedExtras)).catch(() => {});
}

// ── Minimal inline forms ──────────────────────────────────────────────────────

function FieldInput({ label, value, onChange, placeholder, required }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <input
        className="w-full px-3 py-2.5 rounded-xl border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60 transition-all"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function FieldTextarea({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <textarea
        className="w-full px-3 py-2.5 rounded-xl border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60 transition-all resize-none"
        rows={2}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function GoalForm({ onDone }: { onDone: (label: string) => void }) {
  const [title, setTitle] = useState("");
  const [why, setWhy] = useState("");
  const [nextAction, setNextAction] = useState("");
  const mut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/goals", {
      title,
      horizon: "this_year",
      progressType: "boolean",
      description: [
        why.trim() ? `Why it matters: ${why.trim()}` : "",
        nextAction.trim() ? `Next action: ${nextAction.trim()}` : "",
      ].filter(Boolean).join("\n\n") || undefined,
    }),
    onSuccess: () => onDone(title),
  });
  return (
    <form onSubmit={e => { e.preventDefault(); if (title.trim()) mut.mutate(); }} className="space-y-4">
      <FieldInput label="Goal" value={title} onChange={setTitle} placeholder="e.g. Run a 5K" required />
      <FieldTextarea label="Why it matters (optional)" value={why} onChange={setWhy} placeholder="What makes this meaningful?" />
      <FieldInput label="Next action (optional)" value={nextAction} onChange={setNextAction} placeholder="e.g. Pick a 5K race date" />
      <CreateButton loading={mut.isPending} disabled={!title.trim()} />
    </form>
  );
}

function TaskForm({ onDone }: { onDone: (label: string) => void }) {
  const [title, setTitle] = useState("");
  const mut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/general-tasks", { title, priority: "medium", completed: false }),
    onSuccess: () => onDone(title),
  });
  return (
    <form onSubmit={e => { e.preventDefault(); if (title.trim()) mut.mutate(); }} className="space-y-4">
      <FieldInput label="Task" value={title} onChange={setTitle} placeholder="e.g. Schedule a check-in" required />
      <CreateButton loading={mut.isPending} disabled={!title.trim()} />
    </form>
  );
}

function HabitForm({ onDone, defaultCategory }: { onDone: (label: string) => void; defaultCategory?: string }) {
  const [title, setTitle] = useState("");
  const EMOJIS = ["🔥","💪","🧘","📚","💧","🏃","🥗","😴","🎯","✅"];
  const [emoji, setEmoji] = useState("🔥");
  const mut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/habits", {
      title, emoji, frequency: "daily",
      category: defaultCategory ?? "personal", color: "#8b5cf6",
    }),
    onSuccess: () => onDone(title),
  });
  return (
    <form onSubmit={e => { e.preventDefault(); if (title.trim()) mut.mutate(); }} className="space-y-4">
      <FieldInput label="Habit name" value={title} onChange={setTitle} placeholder="e.g. Morning workout" required />
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Pick an emoji</label>
        <div className="flex gap-1.5 flex-wrap">
          {EMOJIS.map(e => (
            <button key={e} type="button" onClick={() => setEmoji(e)}
              className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center transition-colors
                ${emoji === e ? "bg-primary/20 ring-2 ring-primary/50" : "bg-secondary/50 hover:bg-secondary"}`}>
              {e}
            </button>
          ))}
        </div>
      </div>
      <CreateButton loading={mut.isPending} disabled={!title.trim()} />
    </form>
  );
}

function WorkoutLogForm({ onDone }: { onDone: (label: string) => void }) {
  const today = new Date().toISOString().split("T")[0];
  const TYPES = ["strength","cardio","yoga","hiit","sports","other"] as const;
  type WType = typeof TYPES[number];
  const [workoutType, setWorkoutType] = useState<WType>("strength");
  const mut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/workout-logs", { date: today, name: workoutType, workoutType }),
    onSuccess: () => onDone(workoutType),
  });
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Type of workout</label>
        <div className="flex gap-1.5 flex-wrap">
          {TYPES.map(t => (
            <button key={t} type="button" onClick={() => setWorkoutType(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors capitalize
                ${workoutType === t ? "bg-primary border-primary text-primary-foreground" : "bg-secondary/50 border-transparent hover:bg-secondary"}`}>
              {t}
            </button>
          ))}
        </div>
      </div>
      <CreateButton loading={mut.isPending} onClick={() => mut.mutate()} />
    </div>
  );
}

function BookForm({ onDone }: { onDone: (label: string) => void }) {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const mut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/books", { title, author: author || undefined, status: "want_to_read" }),
    onSuccess: () => onDone(title),
  });
  return (
    <form onSubmit={e => { e.preventDefault(); if (title.trim()) mut.mutate(); }} className="space-y-4">
      <FieldInput label="Book title" value={title} onChange={setTitle} placeholder="e.g. Atomic Habits" required />
      <FieldInput label="Author (optional)" value={author} onChange={setAuthor} placeholder="e.g. James Clear" />
      <CreateButton loading={mut.isPending} disabled={!title.trim()} />
    </form>
  );
}

function PlaceForm({ onDone }: { onDone: (label: string) => void }) {
  const [name, setName] = useState("");
  const TYPES = ["restaurant","bar","cafe","park","museum","other"] as const;
  type PType = typeof TYPES[number];
  const [type, setType] = useState<PType>("restaurant");
  const mut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/spots", { name, type }),
    onSuccess: () => onDone(name),
  });
  return (
    <form onSubmit={e => { e.preventDefault(); if (name.trim()) mut.mutate(); }} className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Type</label>
        <div className="flex gap-1.5 flex-wrap">
          {TYPES.map(t => (
            <button key={t} type="button" onClick={() => setType(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors capitalize
                ${type === t ? "bg-primary border-primary text-primary-foreground" : "bg-secondary/50 border-transparent hover:bg-secondary"}`}>
              {t}
            </button>
          ))}
        </div>
      </div>
      <FieldInput label="Name" value={name} onChange={setName} placeholder="e.g. Blue Bottle Coffee" required />
      <CreateButton loading={mut.isPending} disabled={!name.trim()} />
    </form>
  );
}

function RecipeForm({ onDone }: { onDone: (label: string) => void }) {
  const [name, setName] = useState("");
  const [ingredients, setIngredients] = useState("");
  const [instructions, setInstructions] = useState("");
  const EMOJIS = ["🍽️","🍕","🍜","🥗","🍝","🥘","🍛","🍣","🍔","🥞"];
  const [emoji, setEmoji] = useState("🍽️");
  const mut = useMutation({
    mutationFn: () => {
      const ingredientItems = ingredients
        .split(/\n|,/)
        .map(x => x.trim())
        .filter(Boolean)
        .map(name => ({ name, qty: "" }));
      return apiRequest("POST", "/api/recipes", {
        name,
        emoji,
        ingredientsJson: JSON.stringify(ingredientItems),
        instructions: instructions.trim() || undefined,
      });
    },
    onSuccess: () => onDone(name),
  });
  return (
    <form onSubmit={e => { e.preventDefault(); if (name.trim()) mut.mutate(); }} className="space-y-4">
      <FieldInput label="Recipe name" value={name} onChange={setName} placeholder="e.g. Lemon Pasta" required />
      <div className="flex gap-1.5 flex-wrap">
        {EMOJIS.map(e => (
          <button key={e} type="button" onClick={() => setEmoji(e)}
            className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center transition-colors
              ${emoji === e ? "bg-primary/20 ring-2 ring-primary/50" : "bg-secondary/50 hover:bg-secondary"}`}>
            {e}
          </button>
        ))}
      </div>
      <FieldTextarea label="Ingredients (optional)" value={ingredients} onChange={setIngredients} placeholder="Paste a few ingredients, one per line" />
      <FieldTextarea label="Instructions or source (optional)" value={instructions} onChange={setInstructions} placeholder="Add quick steps or where you found it" />
      <CreateButton loading={mut.isPending} disabled={!name.trim()} />
    </form>
  );
}

function PersonForm({ onDone }: { onDone: (label: string) => void }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const mut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/people", { firstName, lastName: lastName || undefined }),
    onSuccess: () => onDone([firstName, lastName].filter(Boolean).join(" ")),
  });
  return (
    <form onSubmit={e => { e.preventDefault(); if (firstName.trim()) mut.mutate(); }} className="space-y-4">
      <FieldInput label="First name" value={firstName} onChange={setFirstName} placeholder="e.g. Alex" required />
      <FieldInput label="Last name (optional)" value={lastName} onChange={setLastName} placeholder="e.g. Johnson" />
      <CreateButton loading={mut.isPending} disabled={!firstName.trim()} />
    </form>
  );
}

function InterestForm({ onDone }: { onDone: (label: string) => void }) {
  const [name, setName] = useState("");
  const mut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/hobbies", { name, hobbyType: "other", skillLevel: "beginner", status: "active" }),
    onSuccess: () => onDone(name),
  });
  return (
    <form onSubmit={e => { e.preventDefault(); if (name.trim()) mut.mutate(); }} className="space-y-4">
      <FieldInput label="Interest or hobby" value={name} onChange={setName} placeholder="e.g. Photography" required />
      <CreateButton loading={mut.isPending} disabled={!name.trim()} />
    </form>
  );
}

// ── Health Goal quick-start config ────────────────────────────────────────────

const QUICK_START_GOALS = [
  // Running
  { value: "run_5k",       label: "Run a 5K",                       planType: "endurance" as const, raceDistance: "5K",                    title: "Run a 5K" },
  { value: "run_10k",      label: "Run a 10K",                      planType: "endurance" as const, raceDistance: "10K",                   title: "Run a 10K" },
  { value: "run_half",     label: "Run a Half Marathon",            planType: "endurance" as const, raceDistance: "Half Marathon",          title: "Run a Half Marathon" },
  { value: "run_marathon", label: "Run a Marathon",                 planType: "endurance" as const, raceDistance: "Marathon",              title: "Run a Marathon" },
  { value: "run_50k",      label: "Run a 50K Ultra",                planType: "endurance" as const, raceDistance: "50K Ultra",             title: "Run a 50K Ultra" },
  { value: "run_50mi",     label: "Run a 50 Mile Ultra",            planType: "endurance" as const, raceDistance: "50 Mile Ultra",         title: "Run a 50 Mile Ultra" },
  // Triathlon
  { value: "tri_sprint",   label: "Complete a Triathlon (Sprint)",  planType: "endurance" as const, raceDistance: "Triathlon (Sprint)",    title: "Complete a Sprint Triathlon" },
  { value: "tri_olympic",  label: "Complete a Triathlon (Olympic)", planType: "endurance" as const, raceDistance: "Triathlon (Olympic)",   title: "Complete an Olympic Triathlon" },
  { value: "tri_ironman",  label: "Complete a Triathlon (Ironman)", planType: "endurance" as const, raceDistance: "Triathlon (Ironman)",   title: "Complete an Ironman" },
  // Strength PR
  { value: "str_bench",    label: "Strength PR (Bench Press)",      planType: "strength_pr" as const, exercise: "Bench Press",             title: "Bench Press PR" },
  { value: "str_squat",    label: "Strength PR (Squat)",            planType: "strength_pr" as const, exercise: "Squat",                  title: "Squat PR" },
  { value: "str_dead",     label: "Strength PR (Deadlift)",         planType: "strength_pr" as const, exercise: "Deadlift",               title: "Deadlift PR" },
  // Body Composition
  { value: "body_weight",  label: "Body weight",                    planType: "body_composition" as const, metric: "weight",              title: "Reach My Goal Weight" },
  { value: "body_fat",     label: "Body fat %",                     planType: "body_composition" as const, metric: "body_fat",            title: "Reduce Body Fat %" },
  { value: "muscle_mass",  label: "Muscle Mass",                    planType: "body_composition" as const, metric: "muscle_mass",         title: "Build Muscle Mass" },
  { value: "body_comp",    label: "Body composition",               planType: "body_composition" as const, metric: "weight",              title: "Improve Body Composition" },
];

function HealthGoalForm({ onDone }: { onDone: (label: string, href?: string) => void }) {
  const [quickStart, setQuickStart] = useState("");
  const [title, setTitle] = useState("");
  const [raceDate, setRaceDate] = useState("");
  const [currentVal, setCurrentVal] = useState("");
  const [targetVal, setTargetVal] = useState("");
  const [unit, setUnit] = useState("lbs");
  const [withPlan, setWithPlan] = useState(false);

  const selected = QUICK_START_GOALS.find(g => g.value === quickStart);

  useEffect(() => {
    if (selected) {
      setTitle(selected.title);
      setCurrentVal(""); setTargetVal(""); setRaceDate(""); setWithPlan(false);
      setUnit("metric" in selected && selected.metric === "body_fat" ? "%" : "lbs");
    }
  }, [quickStart]);

  const effectiveTitle = title.trim() || selected?.title || "";
  const isEndurance = selected?.planType === "endurance";
  const isStrength  = selected?.planType === "strength_pr";
  const isBodyComp  = selected?.planType === "body_composition";
  const bodyFatMode = isBodyComp && "metric" in (selected ?? {}) && (selected as any).metric === "body_fat";
  const unitOptions = bodyFatMode ? ["%"] : (isStrength || isBodyComp) ? ["lbs", "kg"] : [];

  const mut = useMutation({
    mutationFn: () => {
      const progressType = (isStrength || isBodyComp) ? "numeric" : "boolean";
      const metricObj: Record<string, any> = {};
      if (isEndurance && selected && "raceDistance" in selected) {
        metricObj.raceDistance = selected.raceDistance;
        if (raceDate) metricObj.raceDate = raceDate;
      } else if (isStrength && selected && "exercise" in selected) {
        metricObj.exercise = selected.exercise;
        if (currentVal) metricObj.currentValue = parseFloat(currentVal);
        if (targetVal)  metricObj.targetValue  = parseFloat(targetVal);
        metricObj.unit = unit;
      } else if (isBodyComp && selected && "metric" in selected) {
        metricObj.metric = (selected as any).metric;
        if (currentVal) metricObj.currentValue = parseFloat(currentVal);
        if (targetVal)  metricObj.targetValue  = parseFloat(targetVal);
        metricObj.unit = unit;
      }
      return apiRequest("POST", "/api/goals", {
        title: effectiveTitle,
        horizon: "this_year",
        progressType,
        ...(Object.keys(metricObj).length ? { goalMetricJson: JSON.stringify(metricObj) } : {}),
      });
    },
    onSuccess: () => {
      if (withPlan && selected) {
        sessionStorage.setItem("openPlanBuilder", "1");
        sessionStorage.setItem("newPlanGoalType", selected.planType);
        if (isEndurance && "raceDistance" in selected) {
          sessionStorage.setItem("newPlanRaceDistance", (selected as any).raceDistance);
          if (raceDate) sessionStorage.setItem("newPlanRaceDate", raceDate);
        } else if (isStrength && "exercise" in selected) {
          sessionStorage.setItem("newPlanExercise", (selected as any).exercise);
          if (currentVal) sessionStorage.setItem("newPlanCurrentWeight", currentVal);
          if (targetVal)  sessionStorage.setItem("newPlanTargetWeight",  targetVal);
          sessionStorage.setItem("newPlanWeightUnit", unit);
        } else if (isBodyComp && "metric" in selected) {
          sessionStorage.setItem("newPlanBodyMetric", (selected as any).metric);
          if (currentVal) sessionStorage.setItem("newPlanBodyCurrentValue", currentVal);
          if (targetVal)  sessionStorage.setItem("newPlanBodyTargetValue",  targetVal);
          sessionStorage.setItem("newPlanBodyUnit", unit);
        }
        onDone(effectiveTitle, "/health");
      } else {
        onDone(effectiveTitle, "/goals");
      }
    },
  });

  return (
    <form onSubmit={e => { e.preventDefault(); if (effectiveTitle) mut.mutate(); }} className="space-y-4">
      {/* Quick start selector */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Quick start (optional)</label>
        <select
          value={quickStart}
          onChange={e => setQuickStart(e.target.value)}
          className="w-full px-3 py-2.5 rounded-xl border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60 transition-all"
        >
          <option value="">— Choose a goal template —</option>
          <optgroup label="Endurance Running">
            <option value="run_5k">Run a 5K</option>
            <option value="run_10k">Run a 10K</option>
            <option value="run_half">Run a Half Marathon</option>
            <option value="run_marathon">Run a Marathon</option>
            <option value="run_50k">Run a 50K Ultra</option>
            <option value="run_50mi">Run a 50 Mile Ultra</option>
          </optgroup>
          <optgroup label="Triathlon">
            <option value="tri_sprint">Complete a Triathlon (Sprint)</option>
            <option value="tri_olympic">Complete a Triathlon (Olympic)</option>
            <option value="tri_ironman">Complete a Triathlon (Ironman)</option>
          </optgroup>
          <optgroup label="Strength PR">
            <option value="str_bench">Strength PR (Bench Press)</option>
            <option value="str_squat">Strength PR (Squat)</option>
            <option value="str_dead">Strength PR (Deadlift)</option>
          </optgroup>
          <optgroup label="Body Composition">
            <option value="body_weight">Body weight</option>
            <option value="body_fat">Body fat %</option>
            <option value="muscle_mass">Muscle Mass</option>
            <option value="body_comp">Body composition</option>
          </optgroup>
        </select>
      </div>

      {/* Goal name — always editable, pre-filled from quick start */}
      <FieldInput
        label="Goal name"
        value={title}
        onChange={setTitle}
        placeholder={selected ? selected.title : "e.g. Run a 5K, Lose 20 lbs…"}
        required={!selected}
      />

      {/* Dynamic fields */}
      {isEndurance && (
        <FieldInput label="Target race date (optional)" value={raceDate} onChange={setRaceDate} placeholder="e.g. 2025-10-05" />
      )}
      {(isStrength || isBodyComp) && (
        <div className="grid grid-cols-2 gap-3">
          <FieldInput
            label={isStrength ? "Current max (optional)" : "Current value (optional)"}
            value={currentVal} onChange={setCurrentVal}
            placeholder={isStrength ? "e.g. 185" : "e.g. 200"}
          />
          <FieldInput
            label={isStrength ? "Target max (optional)" : "Target value (optional)"}
            value={targetVal} onChange={setTargetVal}
            placeholder={isStrength ? "e.g. 225" : "e.g. 180"}
          />
        </div>
      )}
      {unitOptions.length > 1 && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Unit</label>
          <div className="flex gap-2">
            {unitOptions.map(u => (
              <button key={u} type="button" onClick={() => setUnit(u)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors
                  ${unit === u ? "bg-primary border-primary text-primary-foreground" : "bg-secondary/50 border-transparent hover:bg-secondary"}`}
              >{u}</button>
            ))}
          </div>
        </div>
      )}

      {/* Starter training plan toggle */}
      {selected && (
        <button
          type="button"
          onClick={() => setWithPlan(p => !p)}
          className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 text-left transition-all ${
            withPlan ? "border-primary bg-primary/8 text-foreground" : "border-border hover:border-primary/50 hover:bg-primary/5"
          }`}
        >
          <span className="text-xl shrink-0">📋</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Also create a Starter Training Plan</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Open the {isEndurance ? "Endurance" : isStrength ? "Strength PR" : "Body Composition"} plan builder pre-configured for this goal
            </p>
          </div>
          <div className={`w-5 h-5 rounded-full shrink-0 border-2 flex items-center justify-center transition-colors ${withPlan ? "border-primary bg-primary" : "border-border"}`}>
            {withPlan && <Check size={10} className="text-primary-foreground" />}
          </div>
        </button>
      )}

      <CreateButton loading={mut.isPending} disabled={!effectiveTitle} />
    </form>
  );
}

// Generic create button (works as submit OR with onClick for non-form flows)
function CreateButton({ loading, disabled, onClick }: { loading: boolean; disabled?: boolean; onClick?: () => void }) {
  const props = onClick ? { type: "button" as const, onClick } : { type: "submit" as const };
  return (
    <button
      {...props}
      disabled={loading || disabled}
      className="w-full py-3 rounded-xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-semibold text-sm
        hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all shadow-sm"
    >
      {loading ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
      {loading ? "Creating…" : "Create & Continue"}
    </button>
  );
}

// ── Form router ───────────────────────────────────────────────────────────────

function CreateForm({ optionKey, onDone }: { optionKey: CreateOptionKey; onDone: (label: string, href?: string) => void }) {
  switch (optionKey) {
    case "goal":          return <GoalForm onDone={onDone} />;
    case "task":          return <TaskForm onDone={onDone} />;
    case "habit":         return <HabitForm onDone={onDone} />;
    case "workout_log":   return <WorkoutLogForm onDone={onDone} />;
    case "health_goal":   return <HealthGoalForm onDone={onDone} />;
    case "fitness_habit": return <HabitForm onDone={onDone} defaultCategory="fitness" />;
    case "book":          return <BookForm onDone={onDone} />;
    case "place":         return <PlaceForm onDone={onDone} />;
    case "recipe":        return <RecipeForm onDone={onDone} />;
    case "person":        return <PersonForm onDone={onDone} />;
    case "interest":      return <InterestForm onDone={onDone} />;
    case "book_share":    return <BookForm onDone={onDone} />;
    default:              return null;
  }
}

// ── Main Modal ────────────────────────────────────────────────────────────────

export default function OnboardingModal({ userName }: { userName: string }) {
  const qc = useQueryClient();
  const [, navigate] = useLocation();

  // Screens: 1=persona, 2=intentions, 3=create-first-item, 4=done
  const [screen, setScreen] = useState<1 | 2 | 3 | 4>(1);
  const [persona, setPersona] = useState<PersonaKey | null>(null);
  const [intentions, setIntentions] = useState<IntentionKey[]>([]);

  // Screen 3 state
  const [selectedOption, setSelectedOption] = useState<CreateOption | null>(null);
  const [createdLabel, setCreatedLabel] = useState<string | null>(null);
  const [createdHref, setCreatedHref] = useState<string | null>(null);
  const [mealWizardOpen, setMealWizardOpen] = useState(false);

  // Screen 4 feature opt-ins
  const [browseRecipes, setBrowseRecipes] = useState(false);

  const completeMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/me/complete-onboarding"),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/me"] }); },
  });

  const prefsMut = useMutation({
    mutationFn: (data: object) => apiRequest("PUT", "/api/me/prefs", data),
  });

  const firstName = userName.split(" ")[0];

  const progressPct =
    screen === 1 ? 5 :
    screen === 2 ? 30 :
    screen === 3 ? (createdLabel ? 90 : 60) :
    100;

  const options = persona ? CREATE_OPTIONS[persona] : [];
  const primaryIntention = intentions[0] ? INTENTIONS.find(i => i.key === intentions[0]) : null;
  const secondaryIntention = intentions[1] ? INTENTIONS.find(i => i.key === intentions[1]) : null;

  function pickPersona(p: PersonaKey) {
    setPersona(p);
    setScreen(2);
  }

  function toggleIntention(k: IntentionKey) {
    setIntentions(prev => {
      if (prev.includes(k)) return prev.filter(x => x !== k);
      if (prev.length >= 2) return prev;
      return [...prev, k];
    });
  }

  function handleCreated(label: string, href?: string) {
    setCreatedLabel(label);
    setCreatedHref(href ?? selectedOption?.href ?? null);
    // Brief pause to show success, then advance
    setTimeout(() => setScreen(4), 900);
  }

  function finish() {
    persistOnboardingSetup(persona, intentions, browseRecipes ? ["/recipes"] : []);
    prefsMut.mutate({ intentions, persona: persona ?? "momentum" });
    completeMut.mutate();
    navigate(browseRecipes ? "/recipes" : "/dashboard");
  }

  /** Complete onboarding and navigate immediately — used when an action opens its own UI (e.g. plan builder). */
  function finishImmediate(href: string) {
    persistOnboardingSetup(persona, intentions);
    prefsMut.mutate({ intentions, persona: persona ?? "momentum" });
    completeMut.mutate();
    navigate(href);
  }

  return (
    <>
    {mealWizardOpen && (
      <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
        <div className="bg-background rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden max-h-[92vh]">
          <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
            <div>
              <h2 className="font-semibold flex items-center gap-2">🍽️ Meal Plan Setup</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Four quick steps to build your plan</p>
            </div>
            <button onClick={() => setMealWizardOpen(false)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
              <X size={16} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-5">
            <PlannerSetup
              onClose={() => setMealWizardOpen(false)}
              onSaved={() => { setMealWizardOpen(false); handleCreated("Meal Plan", "/health"); }}
            />
          </div>
        </div>
      </div>
    )}
    <div className={`fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 ${mealWizardOpen ? "hidden" : ""}`}>
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden max-h-[92vh]">

        {/* Progress bar */}
        <div className="h-1 bg-muted shrink-0">
          <div className="h-full bg-primary transition-all duration-500 ease-out" style={{ width: `${progressPct}%` }} />
        </div>

        <div className="overflow-y-auto flex-1">

          {/* ── Screen 1: Persona picker ─────────────────────────────────── */}
          {screen === 1 && (
            <div className="p-6 sm:p-8 space-y-6">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Welcome, {firstName} 👋</p>
                <h1 className="text-2xl font-bold leading-tight">What should MyLifos help with first?</h1>
                <p className="text-sm text-muted-foreground mt-1">Pick the outcome that fits best. MyLifos will shape Today and your sidebar around it.</p>
              </div>

              <div className="space-y-3">
                {PERSONAS.map(p => (
                  <button
                    key={p.key}
                    onClick={() => pickPersona(p.key)}
                    className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all text-left group"
                  >
                    <span className="text-3xl shrink-0">{p.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground">{p.title}</p>
                      <p className="text-sm text-muted-foreground mt-0.5">{p.sub}</p>
                    </div>
                    <ArrowRight size={18} className="text-muted-foreground group-hover:text-primary shrink-0 transition-colors" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Screen 2: Intentions picker ──────────────────────────────── */}
          {screen === 2 && (
            <div className="p-6 sm:p-8 space-y-6">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Step 2 of 3</p>
                <h1 className="text-2xl font-bold leading-tight">Pick your main focus</h1>
                <p className="text-sm text-muted-foreground mt-1">Choose one primary focus and, optionally, one secondary focus.</p>
              </div>

              {intentions.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-primary/10 border border-primary/20 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-primary font-semibold">Main</p>
                    <p className="text-xs font-medium mt-0.5">{primaryIntention?.label}</p>
                  </div>
                  <div className="rounded-xl bg-secondary/40 border px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Also</p>
                    <p className="text-xs font-medium mt-0.5">{secondaryIntention?.label ?? "Optional"}</p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2.5">
                {INTENTIONS.map(item => {
                  const selected = intentions.includes(item.key);
                  const disabled = !selected && intentions.length >= 2;
                  return (
                    <button
                      key={item.key}
                      onClick={() => toggleIntention(item.key)}
                      disabled={disabled}
                      className={`flex items-center gap-3 p-3.5 rounded-2xl border-2 text-left transition-all
                        ${selected
                          ? "border-primary bg-primary/8 text-foreground"
                          : disabled
                          ? "border-border/40 text-muted-foreground/40 cursor-not-allowed"
                          : "border-border hover:border-primary/50 hover:bg-primary/5"
                        }`}
                    >
                      <span className="text-xl leading-none shrink-0">{item.emoji}</span>
                      <span className="text-sm font-medium leading-snug">{item.label}</span>
                      {selected && (
                        <div className="ml-auto shrink-0 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                          <Check size={11} className="text-primary-foreground" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              <p className="text-xs text-center text-muted-foreground">
                {intentions.length === 0
                  ? "You can skip this and personalize later."
                  : intentions.length === 1
                    ? "Pick one more if there is a secondary focus."
                    : "You've picked a main and secondary focus — deselect one to change it."}
              </p>

              <div className="flex items-center justify-between gap-3">
                <button onClick={() => setScreen(1)} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  ← Back
                </button>
                <button
                  onClick={() => setScreen(3)}
                  className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors"
                >
                  {intentions.length === 0 ? "Skip" : "Next"} <ArrowRight size={15} />
                </button>
              </div>
            </div>
          )}

          {/* ── Screen 3: Create first item ──────────────────────────────── */}
          {screen === 3 && persona && (
            <div className="p-6 sm:p-8 space-y-5">
              {/* Success flash */}
              {createdLabel ? (
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg">
                    <Check size={28} className="text-primary-foreground" strokeWidth={2.5} />
                  </div>
                  <div className="text-center">
                    <p className="text-base font-bold">Created! 🎉</p>
                    <p className="text-sm text-muted-foreground mt-0.5">"{createdLabel}" has been saved.</p>
                  </div>
                </div>
              ) : selectedOption ? (
                /* Active form */
                <>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedOption(null)}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      ← Back
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-3xl leading-none">{selectedOption.emoji}</span>
                    <div>
                      <p className="font-bold text-lg leading-tight">{selectedOption.label}</p>
                      <p className="text-xs text-muted-foreground">{selectedOption.sub}</p>
                    </div>
                  </div>
                  <CreateForm optionKey={selectedOption.key} onDone={handleCreated} />
                </>
              ) : (
                /* Option picker */
                <>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Step 3 of 3</p>
                    <h1 className="text-2xl font-bold leading-tight">Create the first useful thing</h1>
                    <p className="text-sm text-muted-foreground mt-1">This makes Today useful immediately. You can skip and set it up later.</p>
                  </div>

                  <div className="space-y-2.5">
                    {options.map(opt => (
                      <button
                        key={opt.key}
                        onClick={() => {
                          if (opt.key === "training_plan") {
                            // Set flag so WorkoutsPage opens the plan builder after navigation
                            sessionStorage.setItem("openPlanBuilder", "1");
                            finishImmediate("/health");
                          } else if (opt.key === "meal_plan") {
                            setMealWizardOpen(true);
                          } else {
                            setSelectedOption(opt);
                          }
                        }}
                        className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all text-left group"
                      >
                        <span className="text-2xl shrink-0">{opt.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-foreground">{opt.label}</p>
                          <p className="text-sm text-muted-foreground mt-0.5">{opt.sub}</p>
                        </div>
                        <ArrowRight size={16} className="text-muted-foreground group-hover:text-primary shrink-0 transition-colors" />
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center justify-between gap-3 pt-1">
                    <button onClick={() => setScreen(2)} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                      ← Back
                    </button>
                    <button
                      onClick={() => setScreen(4)}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Skip, set up later →
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Screen 4: Done ───────────────────────────────────────────── */}
          {screen === 4 && persona && (
            <div className="p-6 sm:p-8 space-y-6">
              <div>
                <p className="text-2xl mb-2">🎉</p>
                <h1 className="text-2xl font-bold">You're all set, {firstName}!</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {createdLabel
                    ? `"${createdLabel}" is saved. Today is ready to turn it into action.`
                    : "Today is ready. You can personalize more anytime."}
                </p>
              </div>

              <div className="rounded-xl border bg-card px-4 py-3 space-y-2">
                <p className="text-xs font-semibold">What MyLifos set up</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    "Today",
                    primaryIntention?.label ?? "First focus",
                    secondaryIntention?.label ?? "Sidebar tuned",
                    createdLabel ? "First item saved" : "Setup later",
                  ].map(item => (
                    <div key={item} className="rounded-lg bg-secondary/40 px-2 py-1.5 text-[11px] font-medium">{item}</div>
                  ))}
                </div>
              </div>

              {/* Recipe browser opt-in */}
              <button
                type="button"
                onClick={() => setBrowseRecipes(v => !v)}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all ${
                  browseRecipes
                    ? "border-primary bg-primary/8"
                    : "border-border hover:border-primary/50 hover:bg-primary/5"
                }`}
              >
                <span className="text-3xl shrink-0">🍽️</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">Browse 1,600+ recipes</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Pin the Recipes page to your sidebar for easy access
                  </p>
                </div>
                <div className={`w-5 h-5 rounded-full shrink-0 border-2 flex items-center justify-center transition-colors ${
                  browseRecipes ? "border-primary bg-primary" : "border-border"
                }`}>
                  {browseRecipes && <Check size={10} className="text-primary-foreground" />}
                </div>
              </button>

              {intentions.length > 0 && (
                <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 flex items-center gap-2.5">
                  <span className="text-base shrink-0">✨</span>
                  <p className="text-xs text-muted-foreground">
                    Your Today page will highlight:{" "}
                    <strong className="text-foreground">
                      {intentions.map(k => INTENTIONS.find(i => i.key === k)?.label).filter(Boolean).join(" & ")}
                    </strong>
                  </p>
                </div>
              )}

              <div className="bg-secondary/40 rounded-xl px-4 py-3">
                <p className="text-xs text-muted-foreground">
                  A guided <strong>first week</strong> checklist will appear on Today. You can dismiss it anytime.
                </p>
              </div>

              <button
                onClick={finish}
                disabled={completeMut.isPending}
                className="w-full bg-primary text-primary-foreground py-3 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
              >
                {completeMut.isPending
                  ? "Saving…"
                  : <>Go to Today <ArrowRight size={15} /></>
                }
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
    </>
  );
}
