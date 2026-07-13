import { useState, useEffect, useRef } from "react";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { ArrowRight, Check, Loader2, X, Search, Plus } from "lucide-react";
import PlannerSetup from "@/pages/planner/Setup";

// ── Persona definitions ───────────────────────────────────────────────────────

type PersonaKey = "momentum" | "health" | "explore_life" | "connect";

// Legacy keys from v1 onboarding — mapped forward for any existing stored values
const LEGACY_PERSONA_MAP: Record<string, PersonaKey> = {
  healthy:    "health",
  explore:    "explore_life",
  organized:  "momentum",
};

const HUBS: {
  key: PersonaKey;
  emoji: string;
  bgClass: string;
  title: string;
  tagline: string;
  features: string[];
}[] = [
  {
    key: "momentum",
    emoji: "⚡",
    bgClass: "bg-blue-100 dark:bg-blue-950/50",
    title: "Momentum",
    tagline: "Turn goals into action and build the habits that stick",
    features: ["Goals", "Tasks", "Habits", "Weekly Review"],
  },
  {
    key: "health",
    emoji: "🌿",
    bgClass: "bg-green-100 dark:bg-green-950/50",
    title: "Wellbeing",
    tagline: "Train, eat well, and track what matters for your body",
    features: ["Workouts", "Training Plans", "Nutrition", "Health Goals"],
  },
  {
    key: "explore_life",
    emoji: "✨",
    bgClass: "bg-amber-100 dark:bg-amber-950/50",
    title: "Life",
    tagline: "Collect books, places, recipes, and everything worth remembering",
    features: ["Library", "Places", "Recipes", "Hobbies & Interests"],
  },
];

// ── Intention definitions (kept for export compat) ───────────────────────────

export type IntentionKey =
  | "goal" | "habit" | "plan_week" | "save_recs"
  | "track_workouts" | "organize_places" | "connect_friends" | "private_notes";

export const INTENTIONS: { key: IntentionKey; emoji: string; label: string }[] = [
  { key: "goal",            emoji: "🎯", label: "Hit a goal"            },
  { key: "habit",           emoji: "✅", label: "Build a habit"         },
  { key: "plan_week",       emoji: "📅", label: "Plan my week"          },
  { key: "save_recs",       emoji: "⭐", label: "Save recommendations"  },
  { key: "track_workouts",  emoji: "💪", label: "Track workouts"        },
  { key: "organize_places", emoji: "📍", label: "Organize places/trips" },
  { key: "connect_friends", emoji: "👥", label: "Connect with friends"  },
  { key: "private_notes",   emoji: "📝", label: "Keep a journal"        },
];

// ── Page catalog for sidebar builder (Step 2) ────────────────────────────────

const PAGE_CATALOG: { path: string; emoji: string; name: string; desc: string }[] = [
  { path: "/dashboard",emoji: "🏠", name: "Home",          desc: "Manage household chores, appliance maintenance, and home projects" },
  { path: "/goals",    emoji: "🎯", name: "Goals",         desc: "Track what you want to achieve this year" },
  { path: "/tasks",    emoji: "✅", name: "Tasks",         desc: "Daily to-dos and one-off action items" },
  { path: "/habits",   emoji: "🔥", name: "Habits",        desc: "Build daily routines that stick" },
  { path: "/review",   emoji: "📅", name: "Weekly Review", desc: "Reflect on your week and plan ahead" },
  { path: "/calendar", emoji: "🗓️", name: "Calendar",      desc: "Events and schedule at a glance" },
  { path: "/journal",  emoji: "📝", name: "Journal",       desc: "Private notes and daily reflections" },
  { path: "/health",   emoji: "💪", name: "Health",        desc: "Workouts, training plans, and body metrics" },
  { path: "/recipes",  emoji: "🍽️", name: "Recipes",       desc: "Browse 1,600+ recipes or save your own" },
  { path: "/library",  emoji: "📚", name: "Library",       desc: "Books, movies, shows, and music to track" },
  { path: "/places",   emoji: "📍", name: "Places",        desc: "Restaurants, destinations, and trips" },
  { path: "/hobbies",  emoji: "✨", name: "Hobbies",       desc: "Interests and passions worth exploring" },
  { path: "/people",   emoji: "👤", name: "People",        desc: "Track friends, family, and important contacts" },
  { path: "/messenger",emoji: "💬", name: "Messenger",     desc: "Chat and share with your connections" },
  { path: "/mylifos",  emoji: "🌐", name: "MyLifos Feed",  desc: "See what the people you follow are saving" },
];

const HUB_DEFAULT_PATHS: Record<PersonaKey, string[]> = {
  momentum:     ["/dashboard", "/goals", "/tasks", "/habits", "/review", "/people", "/messenger"],
  health:       ["/health", "/habits", "/recipes", "/goals", "/people", "/messenger"],
  explore_life: ["/library", "/places", "/recipes", "/hobbies", "/people", "/messenger"],
  connect:      ["/people", "/messenger", "/library", "/hobbies"],
};

// ── First-item creation config ────────────────────────────────────────────────

type CreateOptionKey =
  | "goal" | "task" | "habit" | "review_task"
  | "workout_log" | "health_goal" | "fitness_habit" | "training_plan" | "meal_plan"
  | "book" | "place" | "recipe" | "movie_show"
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
    { key: "book",       emoji: "📚", label: "Save a book",         sub: "Search by title or author",                          href: "/library"              },
    { key: "movie_show", emoji: "🎬", label: "Add a Movie/Show",    sub: "Search 1M+ titles and save to your watchlist",       href: "/library?tab=watching" },
    { key: "recipe",     emoji: "🍽️", label: "Save a recipe",       sub: "Browse 1,600+ recipes or import from a link",        href: "/recipes"              },
    { key: "place",      emoji: "📍", label: "Save a place",         sub: "A restaurant, venue, or city worth remembering",     href: "/places"               },
    { key: "interest",   emoji: "✨", label: "Start a hobby",        sub: "An interest or passion worth exploring",             href: "/hobbies"              },
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

function buildNavPrefs(persona: PersonaKey, selectedPaths: string[]) {
  const visible = new Set<string>(["/dashboard", ...selectedPaths]);
  const ordered = ["/dashboard", ...selectedPaths, ...NAV_PATHS]
    .filter((path, idx, arr) => NAV_PATHS.includes(path) && arr.indexOf(path) === idx);
  return ordered.map(path => ({ path, hidden: !visible.has(path) }));
}

function saveFirstRunDashboardDefaults(persona: PersonaKey, selectedPaths: string[]) {
  try {
    if (localStorage.getItem(DASHBOARD_SECTIONS_KEY)) return;
    const social = selectedPaths.some(p => ["/people", "/messenger", "/mylifos"].includes(p));
    const progress = selectedPaths.some(p => ["/goals", "/health"].includes(p));
    const recent = selectedPaths.some(p => ["/library", "/journal", "/recipes"].includes(p));
    localStorage.setItem(DASHBOARD_SECTIONS_KEY, JSON.stringify({
      today: true, focus: true, up_next: true, progress,
      social_feed: social, needs_attention: false,
      events: selectedPaths.includes("/calendar"),
      recent_activity: recent, quick_jump: false, day_planner: false,
      memories: persona === "explore_life",
      quote: persona === "explore_life",
    }));
  } catch {}
}

function persistOnboardingSetup(persona: PersonaKey | null, selectedPaths: string[]) {
  const key = persona ?? "momentum";
  saveOnboardingData(key);
  saveIntentions([]); // kept for compat — intentions replaced by selectedPaths
  saveFirstRunDashboardDefaults(key, selectedPaths);
  try { localStorage.setItem("mylifos_onboarding_completed_at", Date.now().toString()); } catch {}
  apiRequest("POST", "/api/nav-prefs", buildNavPrefs(key, selectedPaths)).catch(() => {});
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

const INTEREST_PRESETS: { cat: string; emoji: string; type: string; hobbies: string[] }[] = [
  { cat: "Creative",    emoji: "🎨", type: "creative",    hobbies: ["Photography", "Painting", "Drawing", "Pottery", "Knitting / Crochet", "Woodworking", "Jewelry Making", "Sculpting"] },
  { cat: "Outdoor",     emoji: "🏔️", type: "outdoor",     hobbies: ["Hiking", "Cycling", "Fishing", "Gardening", "Rock Climbing", "Bird Watching", "Surfing", "Running"] },
  { cat: "Games",       emoji: "🎮", type: "games",       hobbies: ["Chess", "Board Games", "Video Games", "Puzzles", "Poker", "Dungeons & Dragons"] },
  { cat: "Learning",    emoji: "🔬", type: "learning",    hobbies: ["Coding", "Electronics", "3D Printing", "Brewing / Winemaking", "Cooking", "Language Learning"] },
  { cat: "Performance", emoji: "🎭", type: "performance", hobbies: ["Playing an Instrument", "Singing", "Acting", "Dancing", "Comedy"] },
  { cat: "Collection",  emoji: "🪙", type: "collection",  hobbies: ["Coins", "Stamps", "Vinyl Records", "Trading Cards", "Sneakers", "Watches", "Comic Books", "Antiques"] },
];

interface OnboardingPlanTpl { id: string; emoji: string; label: string; description: string; defaultSteps: string[]; durationWeeks?: number; }
type CreateMeta = { hobbyId?: number; hobbyType?: string; planAlreadyCreated?: boolean };

function mkPlanId() { return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4); }

function buildHobbyPlan(tpl: OnboardingPlanTpl) {
  return {
    id: mkPlanId(),
    title: tpl.label,
    description: tpl.description,
    durationWeeks: tpl.durationWeeks,
    isActive: true,
    startDate: new Date().toISOString().slice(0, 10),
    steps: tpl.defaultSteps.map(text => ({ id: mkPlanId(), text, done: false })),
    sessions: [],
    createdAt: new Date().toISOString(),
    scheduleDays: ["Mon", "Wed", "Fri"],
    commitmentDaysPerWeek: 3,
  };
}

const PERSONA_FIRST_STEPS: Record<PersonaKey, { emoji: string; text: string; href: string }[]> = {
  momentum: [
    { emoji: "🎯", text: "Add your first goal",           href: "/goals"   },
    { emoji: "✅", text: "Create a task for this week",   href: "/tasks"   },
    { emoji: "🔥", text: "Set up a daily habit",          href: "/habits"  },
    { emoji: "📅", text: "Block time for a weekly review", href: "/review" },
  ],
  health: [
    { emoji: "🏋️", text: "Log your first workout",          href: "/health"   },
    { emoji: "🎯", text: "Set a fitness or wellness goal",  href: "/goals"    },
    { emoji: "🔥", text: "Create a daily movement habit",   href: "/habits"   },
    { emoji: "🍽️", text: "Set up a meal plan",              href: "/health"   },
  ],
  explore_life: [
    { emoji: "📚", text: "Save a book you're reading",      href: "/library"  },
    { emoji: "🍽️", text: "Browse and save a recipe",        href: "/recipes"  },
    { emoji: "📍", text: "Add a place you want to visit",   href: "/places"   },
    { emoji: "🎬", text: "Save a movie, show, or playlist", href: "/library"  },
  ],
  connect: [
    { emoji: "👤", text: "Add someone important to you",   href: "/people"   },
    { emoji: "📚", text: "Share a book recommendation",    href: "/library"  },
    { emoji: "✨", text: "Save an interest to bond over",  href: "/hobbies"  },
    { emoji: "💬", text: "Start a conversation",           href: "/messenger" },
  ],
};

const PATH_LABELS: Record<string, string> = {
  "/dashboard": "Home", "/goals": "Goals", "/tasks": "Tasks",
  "/habits": "Habits", "/review": "Weekly Review", "/health": "Health",
  "/library": "Library", "/hobbies": "Hobbies", "/places": "Places",
  "/recipes": "Recipes", "/people": "People", "/journal": "Journal",
  "/mylifos": "MyLifos", "/calendar": "Calendar", "/messenger": "Messenger",
};

const INTENTION_EXTRA_OPTIONS: Partial<Record<IntentionKey, CreateOption>> = {
  goal:            { key: "goal",        emoji: "🎯", label: "Set a goal",        sub: "Something you want to achieve this year",           href: "/goals"  },
  plan_week:       { key: "review_task", emoji: "📅", label: "Block review time", sub: "Add a task to schedule your first weekly review",   href: "/review" },
  track_workouts:  { key: "workout_log", emoji: "🏋️", label: "Log a workout",    sub: "Track your first session",                          href: "/health" },
  organize_places: { key: "place",       emoji: "📍", label: "Save a place",      sub: "A restaurant, venue, or city",                      href: "/places" },
  save_recs:       { key: "book",        emoji: "📚", label: "Save a book",       sub: "Search by title or author",                         href: "/library" },
  connect_friends: { key: "person",      emoji: "👤", label: "Add a person",      sub: "Someone important to you",                          href: "/people" },
};

// Persona-specific order for the Step 2 intention grid (private_notes always excluded)
const PERSONA_INTENTION_ORDER: Record<PersonaKey, IntentionKey[]> = {
  momentum:     ["goal", "habit", "plan_week", "track_workouts", "connect_friends", "save_recs", "organize_places"],
  health:       ["track_workouts", "goal", "habit", "plan_week", "connect_friends", "save_recs", "organize_places"],
  explore_life: ["save_recs", "organize_places", "connect_friends", "goal", "habit", "plan_week", "private_notes"],
  connect:      ["connect_friends", "save_recs", "organize_places", "goal", "habit", "plan_week", "private_notes"],
};

const ONBOARDING_PLAN_TEMPLATES: Record<string, OnboardingPlanTpl[]> = {
  creative: [
    { id: "cp1", emoji: "🖼️", label: "Complete a project",  description: "Step through a specific creative work to completion",  durationWeeks: 4,  defaultSteps: ["Gather materials & references","Sketch / plan the composition","Begin main work","Refine and add detail","Finishing touches","Photograph & archive"] },
    { id: "cp2", emoji: "🎓", label: "Learn a technique",   description: "Break down mastering a new skill into sessions",        durationWeeks: 8,  defaultSteps: ["Research the technique","Watch / read tutorials","Practice basics","Apply to a small project","Seek feedback","Create a showcase piece"] },
    { id: "cp3", emoji: "📚", label: "Build a portfolio",   description: "Create a body of work to share or exhibit",             durationWeeks: 12, defaultSteps: ["Define theme and style","Create first 3 pieces","Create 3 more pieces","Edit and curate","Build online presence","Share or exhibit"] },
    { id: "cp4", emoji: "🏫", label: "Take a class",        description: "Work through a structured class or workshop",           durationWeeks: 6,  defaultSteps: ["Enroll and get materials","Complete weeks 1–2","Complete weeks 3–4","Midpoint review","Complete final lessons","Final project"] },
  ],
  collection: [
    { id: "colp1", emoji: "🗂️", label: "Catalog & organize",  description: "Document and sort your entire collection",                durationWeeks: 4,  defaultSteps: ["Gather everything in one place","Research and identify pieces","Photograph each item","Enter into a spreadsheet or app","Add valuations","Organize storage"] },
    { id: "colp2", emoji: "🔍", label: "Complete a set",       description: "Track down the missing pieces in a defined set",          durationWeeks: 12, defaultSteps: ["List all missing pieces","Research sources and prices","Set a budget","Acquire top 3 most wanted","Continue filling gaps","Celebrate completion"] },
    { id: "colp3", emoji: "🛒", label: "Sourcing expedition",  description: "Plan and execute a major sourcing trip or haul",           defaultSteps: ["Research locations and events","Set a budget and want list","Plan logistics","Execute the trip","Process and clean your haul","Update collection records"] },
    { id: "colp4", emoji: "📖", label: "Become an expert",     description: "Deep dive into the history and value of your collection",  durationWeeks: 8,  defaultSteps: ["Get reference books or guides","Join collector communities","Research your top 10 pieces","Learn grading standards","Attend a show or event","Write about your collection"] },
  ],
  outdoor: [
    { id: "op1", emoji: "🏃", label: "Train for an event",   description: "Progressive plan to prepare for a race, hike, or challenge", durationWeeks: 12, defaultSteps: ["Set baseline fitness","Build base fitness (weeks 1–4)","Increase intensity (weeks 5–8)","Peak week","Taper","Race / event day"] },
    { id: "op2", emoji: "⛰️", label: "Plan an expedition",   description: "Prepare for a multi-day adventure in depth",                 durationWeeks: 8,  defaultSteps: ["Choose destination and dates","Research route and conditions","Gear check and acquisition","Training hikes","Logistics — permits, transport","Execute the trip"] },
    { id: "op3", emoji: "🎯", label: "Skill progression",    description: "Systematically improve a specific outdoor skill",            durationWeeks: 10, defaultSteps: ["Assess current level","Find instruction — course, guide, videos","Practice fundamentals","Apply in the field","Advanced practice","Lead or teach others"] },
    { id: "op4", emoji: "🗺️", label: "Explore a region",    description: "Systematically discover and document a new area",            durationWeeks: 8,  defaultSteps: ["Research the region","Map key locations","First visit — scout","Return for top spots","Off-the-beaten-path trip","Document favorites"] },
  ],
  games: [
    { id: "gp1", emoji: "🎮", label: "Complete a game",      description: "Play through a game from start to finish",                    durationWeeks: 4,  defaultSteps: ["Start / set up","Complete act 1","Complete act 2","Complete main story","Optional content","100% / achievement run"] },
    { id: "gp2", emoji: "📚", label: "Learn a new game",     description: "Go from beginner to competent in a game you've never played", durationWeeks: 6,  defaultSteps: ["Read rules or watch intro","Play first session","Identify weak spots","Study strategy","Practice regularly","Play a competitive session"] },
    { id: "gp3", emoji: "⚡", label: "Improve your rating",  description: "Structured path to reach a new skill level",                  durationWeeks: 12, defaultSteps: ["Establish baseline rating","Identify key weaknesses","Study and practice","Play rated games","Analyze losses","Hit target rating"] },
    { id: "gp4", emoji: "🎲", label: "Run a campaign",       description: "Plan and run a full tabletop or story campaign",              durationWeeks: 16, defaultSteps: ["Plan setting and story arc","Build characters with players","Session 1 — intro arc","Mid-campaign arc","Final arc","Epilogue session"] },
  ],
  learning: [
    { id: "lp1", emoji: "🎓", label: "Complete a course",    description: "Work through a structured course from start to finish",           durationWeeks: 8,  defaultSteps: ["Enroll and set up environment","Complete module 1","Complete modules 2–3","Midpoint project","Complete final modules","Final exam or capstone"] },
    { id: "lp2", emoji: "🔨", label: "Build a project",      description: "Plan and ship a complete project from scratch",                    durationWeeks: 6,  defaultSteps: ["Define scope and requirements","Design / architecture","Build core features","Add secondary features","Test and fix bugs","Deploy or share"] },
    { id: "lp3", emoji: "🌍", label: "Reach a skill level",  description: "Systematic path to a specific proficiency or certification",      durationWeeks: 16, defaultSteps: ["Assess current level","Study fundamentals","Practice daily","Reach intermediate milestone","Advanced study","Test or certify"] },
    { id: "lp4", emoji: "📖", label: "Read & implement",     description: "Work through a technical book with hands-on practice",            durationWeeks: 6,  defaultSteps: ["Acquire the book or resource","Read and do chapters 1–3","Implement exercises 1–3","Read chapters 4–6","Implement exercises 4–6","Final implementation project"] },
  ],
  performance: [
    { id: "pp1", emoji: "🎵", label: "Learn a piece",              description: "Work through a specific song, piece, or routine start to finish", durationWeeks: 4,  defaultSteps: ["Listen and analyze","Break into sections","Learn section A","Learn section B","Combine all sections","Performance-ready run-through"] },
    { id: "pp2", emoji: "🎤", label: "Prepare for a performance",  description: "Ready yourself for a recital, show, gig, or audition",           durationWeeks: 8,  defaultSteps: ["Set performance date","Finalize setlist or material","Polish each piece","Full run-throughs","Final dress rehearsal","Perform"] },
    { id: "pp3", emoji: "🎬", label: "Record / create",            description: "Plan and complete a recording or creative project",               durationWeeks: 6,  defaultSteps: ["Finalize the material","Pre-production setup","Record rough takes","Select and polish best takes","Mix and master","Release or share"] },
    { id: "pp4", emoji: "📋", label: "Practice curriculum",        description: "Build a structured practice routine to improve fundamentals",     durationWeeks: 12, defaultSteps: ["Assess current skills","Design practice schedule","Weeks 1–4: fundamentals","Weeks 5–8: intermediate exercises","Weeks 9–12: advanced exercises","Evaluate and adjust"] },
  ],
};

function InterestForm({ onDone }: { onDone: (label: string, href?: string, meta?: CreateMeta) => void }) {
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [name, setName] = useState("");
  const preset = INTEREST_PRESETS.find(p => p.cat === selectedCat);
  const mut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/hobbies", {
      name,
      hobbyType: preset?.type ?? "creative",
      skillLevel: "beginner",
      status: "active",
    }).then(r => r.json()),
    onSuccess: (data: any) => onDone(name, "/hobbies", { hobbyId: data?.id, hobbyType: preset?.type ?? "creative" }),
  });
  return (
    <div className="space-y-4">
      {/* Category buttons */}
      <div className="flex flex-wrap gap-1.5">
        {INTEREST_PRESETS.map(p => (
          <button key={p.cat} type="button"
            onClick={() => { setSelectedCat(selectedCat === p.cat ? null : p.cat); setName(""); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors
              ${selectedCat === p.cat ? "bg-primary border-primary text-primary-foreground" : "bg-secondary/50 border-transparent hover:bg-secondary"}`}>
            {p.emoji} {p.cat}
          </button>
        ))}
      </div>
      {/* Preset hobby chips */}
      {preset && (
        <div className="flex flex-wrap gap-1.5">
          {preset.hobbies.map(h => (
            <button key={h} type="button" onClick={() => setName(h)}
              className={`px-3 py-1.5 rounded-xl text-xs border transition-colors
                ${name === h ? "bg-primary/15 border-primary/60 text-primary font-medium" : "bg-secondary/40 border-transparent hover:bg-secondary"}`}>
              {h}
            </button>
          ))}
        </div>
      )}
      {/* Custom name input */}
      <FieldInput
        label={selectedCat ? "Or type a custom interest" : "Interest or hobby"}
        value={name}
        onChange={setName}
        placeholder={selectedCat ? "Something else…" : "e.g. Photography, Hiking…"}
        required
      />
      <CreateButton loading={mut.isPending} disabled={!name.trim()} onClick={() => { if (name.trim()) mut.mutate(); }} />
    </div>
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

const STARTER_PLAN_CATALOG: Record<string, { id: string; name: string; description: string }[]> = {
  "5K":                  [{ id: "5k_couch_8wk",            name: "Couch to 5K",                description: "8-week beginner plan · 3 days/week · starts with run/walk intervals · race sim in Week 8" }],
  "10K":                 [{ id: "10k_couch_10wk",           name: "Couch to 10K",               description: "10-week beginner plan · 3 days/week · builds from 2 → 6.2 miles · race sim in Week 10" }],
  "Half Marathon":       [{ id: "half_marathon_couch_16wk", name: "Couch to Half Marathon",     description: "16-week beginner plan · 4 days/week · builds from 1 → 10 miles · race sim in Week 16" }],
  "Marathon":            [{ id: "marathon_couch_24wk",      name: "Couch to Marathon",          description: "24-week beginner plan · 4 days/week · builds from 1 → 18 miles · includes taper" }],
  "50K Ultra":           [{ id: "50k_couch_24wk",           name: "Couch to 50K Ultra",         description: "24-week plan · 4 days/week · back-to-back weekends peak at 10+22 miles · taper Weeks 20–24" }],
  "50 Mile Ultra":       [{ id: "50mile_couch_28wk",        name: "Couch to 50 Mile Ultra",     description: "28-week plan · 4 days/week · back-to-back weekends peak at 12+24 miles · taper Weeks 25–28" }],
  "Triathlon (Sprint)":  [{ id: "sprint_tri_couch_12wk",    name: "Couch to Sprint Triathlon",  description: "12-week beginner plan · 5–6 days/week · swim/bike/run + weekly brick · taper Week 11 · race Week 12" }],
  "Triathlon (Olympic)": [{ id: "olympic_tri_couch_16wk",   name: "Couch to Olympic Triathlon", description: "16-week plan · 5–6 days/week · swim/bike/run + weekly brick · taper Weeks 13–15 · race Week 16" }],
};

function HealthGoalForm({ onDone }: { onDone: (label: string, href?: string) => void }) {
  const [quickStart, setQuickStart] = useState("");
  const [title, setTitle] = useState("");
  const [raceDate, setRaceDate] = useState("");
  const [currentVal, setCurrentVal] = useState("");
  const [targetVal, setTargetVal] = useState("");
  const [unit, setUnit] = useState("lbs");
  const [selectedStarterPlanId, setSelectedStarterPlanId] = useState<string | null>(null);

  const selected = QUICK_START_GOALS.find(g => g.value === quickStart);

  useEffect(() => {
    if (selected) {
      setTitle(selected.title);
      setCurrentVal(""); setTargetVal(""); setRaceDate(""); setSelectedStarterPlanId(null);
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
      if (selectedStarterPlanId && selected && isEndurance) {
        sessionStorage.setItem("openPlanBuilder", "1");
        sessionStorage.setItem("newPlanGoalType", selected.planType);
        sessionStorage.setItem("newPlanRaceDistance", (selected as any).raceDistance);
        sessionStorage.setItem("newPlanStarterPlanId", selectedStarterPlanId);
        if (raceDate) sessionStorage.setItem("newPlanRaceDate", raceDate);
      }
      // Navigate to /health so health persona users stay in their home base
      onDone(effectiveTitle, "/health");
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

      {/* Starter training plan cards — endurance goals only */}
      {isEndurance && selected && "raceDistance" in selected && (STARTER_PLAN_CATALOG[(selected as any).raceDistance] ?? []).length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
            <span>📋</span> Starter Training Plans
          </p>
          {(STARTER_PLAN_CATALOG[(selected as any).raceDistance]).map(plan => (
            <div key={plan.id} className={`flex items-start gap-3 rounded-xl border-2 p-3 transition-all ${
              selectedStarterPlanId === plan.id ? "border-primary bg-primary/5" : "border-border bg-card"
            }`}>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{plan.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{plan.description}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedStarterPlanId(prev => prev === plan.id ? null : plan.id)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  selectedStarterPlanId === plan.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-secondary/50 text-foreground border-border hover:border-primary/50"
                }`}
              >
                <Plus size={11} /> {selectedStarterPlanId === plan.id ? "Selected" : "Use Plan"}
              </button>
            </div>
          ))}
        </div>
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

// ── Search-based forms for explore_life ──────────────────────────────────────

type BookResult = { id: string; title: string; author: string; year: string; coverUrl: string };

async function searchBooksApi(q: string): Promise<BookResult[]> {
  const trimmed = q.trim();
  if (!trimmed) return [];
  // Try Google Books first
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(trimmed)}&maxResults=8&printType=books`,
      { signal: ctrl.signal },
    );
    clearTimeout(t);
    if (res.ok) {
      const data = await res.json();
      return (data.items ?? []).map((v: any) => ({
        id: v.id,
        title: v.volumeInfo?.title ?? "Unknown Title",
        author: (v.volumeInfo?.authors ?? []).join(", "),
        year: v.volumeInfo?.publishedDate?.slice(0, 4) ?? "",
        coverUrl: (v.volumeInfo?.imageLinks?.thumbnail || v.volumeInfo?.imageLinks?.smallThumbnail || "").replace(/^http:\/\//, "https://"),
      }));
    }
  } catch { /* fall through to Open Library */ }
  // Open Library fallback
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(trimmed)}&limit=8`,
      { signal: ctrl.signal },
    );
    clearTimeout(t);
    if (res.ok) {
      const data = await res.json();
      return (data.docs ?? []).slice(0, 8).map((doc: any) => ({
        id: doc.key ?? String(Math.random()),
        title: doc.title ?? "Unknown Title",
        author: (doc.author_name ?? []).join(", "),
        year: doc.first_publish_year ? String(doc.first_publish_year) : "",
        coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : "",
      }));
    }
  } catch { /* ignore */ }
  return [];
}

function BookSearchForm({ onDone }: { onDone: (label: string, href?: string) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BookResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleSearch(val: string) {
    setQuery(val);
    setResults([]);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!val.trim()) return;
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const hits = await searchBooksApi(val);
        setResults(hits);
      } catch { /* ignore */ } finally { setLoading(false); }
    }, 400);
  }

  async function saveBook(book: { id: string; title: string; author: string; year: string; coverUrl: string }) {
    setAdding(book.id);
    try {
      await apiRequest("POST", "/api/books", {
        title: book.title,
        author: book.author || undefined,
        status: "want_to_read",
        coverUrl: book.coverUrl || undefined,
      });
      onDone(book.title, "/library");
    } catch { /* ignore */ } finally { setAdding(null); }
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search size={15} className="absolute left-3 top-3 text-muted-foreground" />
        <input
          autoFocus
          className="w-full pl-9 pr-9 py-2.5 rounded-xl border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60 transition-all"
          placeholder="Search by title or author…"
          value={query}
          onChange={e => handleSearch(e.target.value)}
        />
        {loading && <Loader2 size={14} className="absolute right-3 top-3 animate-spin text-muted-foreground" />}
      </div>
      {results.length > 0 && (
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {results.map(book => (
            <button key={book.id} onClick={() => saveBook(book)} disabled={!!adding}
              className="w-full flex items-center gap-3 p-3 rounded-xl border hover:border-primary hover:bg-primary/5 text-left transition-all">
              {book.coverUrl
                ? <img src={book.coverUrl} alt="" className="w-9 h-13 object-cover rounded shrink-0" style={{ height: "3.25rem" }} />
                : <div className="w-9 rounded shrink-0 flex items-center justify-center text-xl" style={{ height: "3.25rem" }}>📚</div>
              }
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm leading-snug truncate">{book.title}</p>
                {book.author && <p className="text-xs text-muted-foreground truncate">{book.author}</p>}
                {book.year && <p className="text-xs text-muted-foreground">{book.year}</p>}
              </div>
              {adding === book.id
                ? <Loader2 size={14} className="animate-spin shrink-0 text-muted-foreground" />
                : <Plus size={14} className="text-muted-foreground shrink-0" />
              }
            </button>
          ))}
        </div>
      )}
      {query && !loading && results.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">No results for "{query}"</p>
      )}
      {!query && (
        <p className="text-xs text-muted-foreground text-center py-2">Type a title or author to search</p>
      )}
    </div>
  );
}

function MovieShowForm({ onDone }: { onDone: (label: string, href?: string) => void }) {
  const [mediaType, setMediaType] = useState<"movie" | "tv">("movie");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const TMDB_IMG = "https://image.tmdb.org/t/p/w185";
  const POSTER_COLORS = ["hsl(210 80% 48%)", "hsl(25 85% 52%)", "hsl(340 75% 50%)", "hsl(160 60% 40%)", "hsl(270 60% 50%)"];

  function doSearch(val: string, type: "movie" | "tv") {
    setResults([]);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!val.trim()) return;
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await apiRequest("GET", `/api/tmdb/search?q=${encodeURIComponent(val.trim())}&type=${type}`);
        const data = await res.json();
        setResults(Array.isArray(data) ? data.slice(0, 6) : []);
      } catch { /* ignore */ } finally { setLoading(false); }
    }, 400);
  }

  function handleSearch(val: string) {
    setQuery(val);
    doSearch(val, mediaType);
  }

  function switchType(t: "movie" | "tv") {
    setMediaType(t);
    if (query.trim()) doSearch(query, t);
  }

  async function saveItem(item: any) {
    setAdding(item.id);
    const isTV = mediaType === "tv";
    try {
      const detail = await apiRequest("GET", `/api/tmdb/${mediaType}/${item.id}`).then(r => r.json());
      const title = detail.title || detail.name || "";
      await apiRequest("POST", "/api/movies", {
        mediaType: isTV ? "show" : "movie",
        title,
        year: parseInt((detail.release_date || detail.first_air_date || "").slice(0, 4)) || null,
        director: isTV
          ? (detail.credits?.created_by?.[0]?.name ?? null)
          : (detail.credits?.crew?.find((c: any) => c.job === "Director")?.name ?? null),
        genres: (detail.genres ?? []).map((g: any) => g.name).join(",") || null,
        status: "backlog",
        rating: null,
        notes: null,
        listsJson: "[]",
        isFavorite: false,
        posterColor: POSTER_COLORS[Math.floor(Math.random() * POSTER_COLORS.length)],
        streamingOn: null,
        totalSeasons: isTV ? (detail.number_of_seasons ?? null) : null,
        currentSeason: null,
        videoUrl: null,
        posterUrl: detail.poster_path ? `https://image.tmdb.org/t/p/w342${detail.poster_path}` : null,
      });
      onDone(title, "/library?tab=watching");
    } catch { /* ignore */ } finally { setAdding(null); }
  }

  return (
    <div className="space-y-4">
      {/* Movie / TV toggle */}
      <div className="flex gap-2">
        {(["movie", "tv"] as const).map(t => (
          <button key={t} type="button" onClick={() => switchType(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors
              ${mediaType === t ? "bg-primary border-primary text-primary-foreground" : "bg-secondary/50 border-transparent hover:bg-secondary"}`}>
            {t === "movie" ? "🎬 Movie" : "📺 TV Show"}
          </button>
        ))}
      </div>
      {/* Search input */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-3 text-muted-foreground" />
        <input
          autoFocus
          className="w-full pl-9 pr-9 py-2.5 rounded-xl border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60 transition-all"
          placeholder={`Search ${mediaType === "movie" ? "movies" : "TV shows"}…`}
          value={query}
          onChange={e => handleSearch(e.target.value)}
        />
        {loading && <Loader2 size={14} className="absolute right-3 top-3 animate-spin text-muted-foreground" />}
      </div>
      {results.length > 0 && (
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {results.map((item: any) => {
            const title = item.title || item.name;
            const year = (item.release_date || item.first_air_date || "").slice(0, 4);
            return (
              <button key={item.id} onClick={() => saveItem(item)} disabled={!!adding}
                className="w-full flex items-center gap-3 p-3 rounded-xl border hover:border-primary hover:bg-primary/5 text-left transition-all">
                {item.poster_path
                  ? <img src={`${TMDB_IMG}${item.poster_path}`} alt="" className="w-9 rounded object-cover shrink-0" style={{ height: "3.25rem" }} />
                  : <div className="w-9 rounded shrink-0 flex items-center justify-center text-xl bg-secondary/60" style={{ height: "3.25rem" }}>🎬</div>
                }
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm leading-snug truncate">{title}</p>
                  {year && <p className="text-xs text-muted-foreground">{year}</p>}
                  {item.overview && <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{item.overview}</p>}
                </div>
                {adding === item.id
                  ? <Loader2 size={14} className="animate-spin shrink-0 text-muted-foreground" />
                  : <Plus size={14} className="text-muted-foreground shrink-0" />
                }
              </button>
            );
          })}
        </div>
      )}
      {query && !loading && results.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">No results for "{query}"</p>
      )}
      {!query && (
        <p className="text-xs text-muted-foreground text-center py-2">Search any movie or show to add it</p>
      )}
    </div>
  );
}

const RECIPE_CAT_CHIPS = [
  { label: "All",       emoji: "🍽️" },
  { label: "Chicken",   emoji: "🍗" },
  { label: "Beef",      emoji: "🥩" },
  { label: "Seafood",   emoji: "🐟" },
  { label: "Pasta",     emoji: "🍝" },
  { label: "Vegetarian",emoji: "🥦" },
  { label: "Breakfast", emoji: "🍳" },
  { label: "Dessert",   emoji: "🍰" },
  { label: "Soup",      emoji: "🍲" },
  { label: "Salad",     emoji: "🥗" },
  { label: "Lamb",      emoji: "🍖" },
  { label: "Pork",      emoji: "🥓" },
];

function RecipeDiscoverForm({ onDone }: { onDone: (label: string, href?: string) => void }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"browse" | "url">("browse");
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("All");
  const [saving, setSaving] = useState<number | null>(null);
  const [url, setUrl] = useState("");
  const [importing, setImporting] = useState(false);

  const { data: allRecipes = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/recipes"] });
  const systemRecipes = useMemo(() => allRecipes.filter((r: any) => r.userId == null), [allRecipes]);

  const filtered = useMemo(() => {
    let list = systemRecipes;
    if (catFilter !== "All") {
      const cat = catFilter.toLowerCase();
      list = list.filter((r: any) => (r.category ?? "").toLowerCase().includes(cat));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r: any) =>
        r.name.toLowerCase().includes(q) || (r.category ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [systemRecipes, search, catFilter]);

  async function saveRecipe(recipe: any) {
    setSaving(recipe.id);
    try {
      await apiRequest("POST", "/api/recipes", {
        name: recipe.name, emoji: recipe.emoji, category: recipe.category,
        componentType: recipe.componentType, prepTime: recipe.prepTime,
        cookTime: recipe.cookTime, ingredientsJson: recipe.ingredientsJson,
        instructions: recipe.instructions, imageUrl: recipe.imageUrl,
        description: recipe.description, source: recipe.source,
      });
      qc.invalidateQueries({ queryKey: ["/api/recipes"] });
      onDone(recipe.name, "/recipes");
    } catch { /* ignore */ } finally { setSaving(null); }
  }

  async function importUrl() {
    if (!url.trim()) return;
    setImporting(true);
    try {
      const data = await apiRequest("POST", "/api/recipes/import-url", { url: url.trim() }).then(r => r.json());
      if (data?.name) {
        await apiRequest("POST", "/api/recipes", data);
        qc.invalidateQueries({ queryKey: ["/api/recipes"] });
        onDone(data.name, "/recipes");
      }
    } catch { /* ignore */ } finally { setImporting(false); }
  }

  return (
    <div className="space-y-3">
      {/* Browse / URL toggle */}
      <div className="flex gap-2">
        {(["browse", "url"] as const).map(m => (
          <button key={m} type="button" onClick={() => setMode(m)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors
              ${mode === m ? "bg-primary border-primary text-primary-foreground" : "bg-secondary/50 border-transparent hover:bg-secondary"}`}>
            {m === "browse" ? "🍽️ Browse Recipes" : "🔗 Import from Link"}
          </button>
        ))}
      </div>

      {mode === "browse" ? (
        <>
          {/* Category chips */}
          <div className="flex gap-1.5 flex-wrap">
            {RECIPE_CAT_CHIPS.map(chip => (
              <button key={chip.label} type="button" onClick={() => { setCatFilter(chip.label); setSearch(""); }}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors
                  ${catFilter === chip.label ? "bg-primary border-primary text-primary-foreground" : "bg-secondary/40 border-transparent hover:bg-secondary"}`}>
                {chip.emoji} {chip.label}
              </button>
            ))}
          </div>
          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-2.5 text-muted-foreground" />
            <input
              className="w-full pl-9 pr-3 py-2 rounded-xl border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60 transition-all"
              placeholder="Search by name…"
              value={search}
              onChange={e => { setSearch(e.target.value); if (e.target.value) setCatFilter("All"); }}
            />
          </div>
          {isLoading ? (
            <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {filtered.map((recipe: any) => (
                <button key={recipe.id} onClick={() => saveRecipe(recipe)} disabled={!!saving}
                  className="w-full flex items-center gap-3 p-2.5 rounded-xl border hover:border-primary hover:bg-primary/5 text-left transition-all">
                  {recipe.imageUrl
                    ? <img src={recipe.imageUrl} alt="" className="w-9 h-9 object-cover rounded shrink-0" />
                    : <span className="text-xl shrink-0 leading-none w-9 text-center">{recipe.emoji || "🍽️"}</span>
                  }
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{recipe.name}</p>
                    {recipe.category && <p className="text-[11px] text-muted-foreground">{recipe.category}</p>}
                  </div>
                  {saving === recipe.id
                    ? <Loader2 size={13} className="animate-spin shrink-0 text-muted-foreground" />
                    : <Plus size={13} className="text-muted-foreground shrink-0" />
                  }
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No recipes found</p>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-3">
          <input
            autoFocus
            className="w-full px-3 py-2.5 rounded-xl border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60 transition-all"
            placeholder="https://example.com/recipe"
            value={url}
            onChange={e => setUrl(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Paste any recipe URL and we'll import the ingredients and instructions automatically.
          </p>
          <button type="button" disabled={!url.trim() || importing} onClick={importUrl}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-semibold text-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all shadow-sm">
            {importing ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            {importing ? "Importing…" : "Import Recipe"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Goal picker form (momentum persona) ──────────────────────────────────────

function GoalPickerForm({ onDone }: { onDone: (label: string, href?: string, meta?: CreateMeta) => void }) {
  const [customTitle, setCustomTitle] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [customSaving, setCustomSaving] = useState(false);
  // Two-step: null = top-level list, otherwise show plans for that hobby
  const [selectedHobby, setSelectedHobby] = useState<{ name: string; type: string; emoji: string } | null>(null);

  async function saveGoal(id: string, title: string, payload: object) {
    setSaving(id);
    try {
      await apiRequest("POST", "/api/goals", { horizon: "this_year", ...payload });
      onDone(title, "/goals");
    } catch { /* ignore */ } finally { setSaving(null); }
  }

  async function saveCustomGoal() {
    const t = customTitle.trim();
    if (!t) return;
    setCustomSaving(true);
    try {
      await apiRequest("POST", "/api/goals", { title: t, horizon: "this_year", progressType: "boolean" });
      onDone(t, "/goals");
    } catch { /* ignore */ } finally { setCustomSaving(false); }
  }

  // For momentum persona: create a goal (not a hobby) from the selected plan template
  async function saveHobbyPlan(tpl: OnboardingPlanTpl) {
    if (!selectedHobby) return;
    setSaving(tpl.id);
    try {
      const title = `${selectedHobby.name} — ${tpl.label}`;
      await apiRequest("POST", "/api/goals", {
        title,
        horizon: "this_year",
        progressType: "boolean",
        description: tpl.description,
      });
      onDone(title, "/goals");
    } catch { /* ignore */ } finally { setSaving(null); }
  }

  const healthGroups = [
    { label: "Endurance", goals: QUICK_START_GOALS.filter(g => g.planType === "endurance") },
    { label: "Strength PR", goals: QUICK_START_GOALS.filter(g => g.planType === "strength_pr") },
    { label: "Body Composition", goals: QUICK_START_GOALS.filter(g => g.planType === "body_composition") },
  ];

  // Sub-view: plans for a selected hobby
  if (selectedHobby) {
    const plans = ONBOARDING_PLAN_TEMPLATES[selectedHobby.type] ?? [];
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setSelectedHobby(null)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowRight size={12} className="rotate-180" /> Back to all goals
        </button>
        <div className="flex items-center gap-2 px-1">
          <span className="text-xl">{selectedHobby.emoji}</span>
          <div>
            <p className="text-sm font-semibold">{selectedHobby.name}</p>
            <p className="text-xs text-muted-foreground">Choose a plan — it'll be saved as a goal</p>
          </div>
        </div>
        <div className="space-y-1.5">
          {plans.map(tpl => (
            <button key={tpl.id}
              onClick={() => saveHobbyPlan(tpl)}
              disabled={!!saving}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border hover:border-primary hover:bg-primary/5 text-left transition-all">
              <span className="text-xl shrink-0">{tpl.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{tpl.label}</p>
                <p className="text-xs text-muted-foreground">{tpl.description}{tpl.durationWeeks ? ` · ${tpl.durationWeeks}w` : ""}</p>
              </div>
              {saving === tpl.id
                ? <Loader2 size={13} className="animate-spin shrink-0 text-muted-foreground" />
                : <Plus size={13} className="text-muted-foreground shrink-0" />
              }
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Main view: custom + health + all hobbies
  return (
    <div className="space-y-4">
      {/* Custom goal */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">🎯 Custom Goal</p>
        <div className="flex gap-2">
          <input
            autoFocus
            className="flex-1 px-3 py-2.5 rounded-xl border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60 transition-all"
            placeholder="e.g. Write a book, Launch a project…"
            value={customTitle}
            onChange={e => setCustomTitle(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") saveCustomGoal(); }}
          />
          <button
            type="button"
            disabled={!customTitle.trim() || customSaving}
            onClick={saveCustomGoal}
            className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 flex items-center gap-1.5 shrink-0"
          >
            {customSaving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            Save
          </button>
        </div>
      </div>

      {/* Scrollable template list */}
      <div className="space-y-4 max-h-72 overflow-y-auto pr-1">
        {/* Health & Fitness */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">💪 Health &amp; Fitness</p>
          <div className="space-y-3">
            {healthGroups.map(group => (
              <div key={group.label}>
                <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-1.5 px-1">{group.label}</p>
                <div className="space-y-1">
                  {group.goals.map(g => (
                    <button key={g.value}
                      onClick={() => saveGoal(g.value, g.title, {
                        title: g.title,
                        progressType: g.planType === "endurance" ? "boolean" : "numeric",
                        goalMetricJson: JSON.stringify(
                          g.planType === "endurance"      ? { raceDistance: (g as any).raceDistance }
                          : g.planType === "strength_pr"  ? { exercise: (g as any).exercise }
                          : { metric: (g as any).metric }
                        ),
                      })}
                      disabled={!!saving || customSaving}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-xl border hover:border-primary hover:bg-primary/5 text-left transition-all">
                      <p className="flex-1 text-sm">{g.label}</p>
                      {saving === g.value
                        ? <Loader2 size={13} className="animate-spin shrink-0 text-muted-foreground" />
                        : <Plus size={13} className="text-muted-foreground shrink-0" />
                      }
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* All hobbies — each is a drill-down to pick a plan */}
        {INTEREST_PRESETS.map(preset => (
          <div key={preset.type}>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              {preset.emoji} {preset.cat}
            </p>
            <div className="space-y-1">
              {preset.hobbies.map(hobby => (
                <button key={hobby}
                  type="button"
                  onClick={() => setSelectedHobby({ name: hobby, type: preset.type, emoji: preset.emoji })}
                  disabled={!!saving || customSaving}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl border hover:border-primary hover:bg-primary/5 text-left transition-all">
                  <p className="flex-1 text-sm">{hobby}</p>
                  <ArrowRight size={13} className="text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Form router ───────────────────────────────────────────────────────────────

function CreateForm({ optionKey, onDone }: { optionKey: CreateOptionKey; onDone: (label: string, href?: string, meta?: CreateMeta) => void }) {
  switch (optionKey) {
    case "goal":          return <GoalPickerForm onDone={onDone} />;
    case "task":          return <TaskForm onDone={onDone} />;
    case "review_task":   return <TaskForm onDone={onDone} />;
    case "habit":         return <HabitForm onDone={onDone} />;
    case "workout_log":   return <WorkoutLogForm onDone={onDone} />;
    case "health_goal":   return <HealthGoalForm onDone={onDone} />;
    case "fitness_habit": return <HabitForm onDone={onDone} defaultCategory="fitness" />;
    case "book":          return <BookSearchForm onDone={onDone} />;
    case "movie_show":    return <MovieShowForm onDone={onDone} />;
    case "recipe":        return <RecipeDiscoverForm onDone={onDone} />;
    case "place":         return <PlaceForm onDone={onDone} />;
    case "person":        return <PersonForm onDone={onDone} />;
    case "interest":      return <InterestForm onDone={onDone} />;
    case "book_share":    return <BookSearchForm onDone={onDone} />;
    default:              return null;
  }
}

// ── Main Modal ────────────────────────────────────────────────────────────────

export default function OnboardingModal({ userName }: { userName: string }) {
  const qc = useQueryClient();
  const [, navigate] = useLocation();

  // Screens: 1=hub, 2=sidebar-builder, 3=create-first-item, 4=done
  const [screen, setScreen] = useState<1 | 2 | 3 | 4>(1);
  const [persona, setPersona] = useState<PersonaKey | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);

  // Screen 3 state
  const [selectedOption, setSelectedOption] = useState<CreateOption | null>(null);
  const [createdLabel, setCreatedLabel] = useState<string | null>(null);
  const [createdHref, setCreatedHref] = useState<string | null>(null);
  const [mealWizardOpen, setMealWizardOpen] = useState(false);

  // Screen 4 feature opt-ins
  const [createdHobbyMeta, setCreatedHobbyMeta] = useState<CreateMeta | null>(null);
  const [selectedPlanTpl, setSelectedPlanTpl] = useState<OnboardingPlanTpl | null>(null);

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

  function pickPersona(p: PersonaKey) {
    setPersona(p);
    setSelectedPaths(HUB_DEFAULT_PATHS[p] ?? []);
    setScreen(2);
  }

  function finishQuickStart(paths: string[], p: PersonaKey, dest: string) {
    const navPrefs = buildNavPrefs(p, paths);
    qc.setQueryData(["/api/nav-prefs"], navPrefs);
    persistOnboardingSetup(p, paths);
    prefsMut.mutate({ persona: p });
    completeMut.mutate();
    navigate(dest);
  }

  function togglePath(path: string) {
    setSelectedPaths(prev =>
      prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
    );
  }

  function handleCreated(label: string, href?: string, meta?: CreateMeta) {
    setCreatedLabel(label);
    setCreatedHref(href ?? selectedOption?.href ?? null);
    if (meta) setCreatedHobbyMeta(meta);
    // Brief pause to show success, then advance
    setTimeout(() => setScreen(4), 900);
  }

  function finish() {
    const allPaths = [...new Set([
      ...selectedPaths,
      ...(createdHobbyMeta?.hobbyId ? ["/hobbies"] : []),
    ])];
    const navPrefs = buildNavPrefs(persona ?? "momentum", allPaths);
    qc.setQueryData(["/api/nav-prefs"], navPrefs);
    persistOnboardingSetup(persona, allPaths);
    prefsMut.mutate({ persona: persona ?? "momentum" });
    // Attach the plan selected on Screen 4 (only when not already created in Step 3)
    if (selectedPlanTpl && createdHobbyMeta?.hobbyId && !createdHobbyMeta?.planAlreadyCreated) {
      apiRequest("PATCH", `/api/hobbies/${createdHobbyMeta.hobbyId}`, {
        extraJson: JSON.stringify({ plans: [buildHobbyPlan(selectedPlanTpl)] }),
      }).catch(() => {});
    }
    completeMut.mutate();
    const dest = createdHobbyMeta?.hobbyId ? "/hobbies" : createdHref ?? "/dashboard";
    navigate(dest);
  }

  // Computed destination and CTA label for Screen 4
  const finishDest = createdHobbyMeta?.hobbyId ? "/hobbies" : createdHref ?? "/dashboard";
  const finishLabel = (() => {
    if (finishDest === "/hobbies")  return "See your Hobbies";
    if (finishDest === "/recipes")  return "Explore Recipes";
    if (finishDest === "/goals")    return "See your Goals";
    if (finishDest === "/tasks")    return "See your Tasks";
    if (finishDest === "/habits")   return "See your Habits";
    if (finishDest === "/health")   return "Go to Health";
    if (finishDest === "/library" || finishDest.startsWith("/library?")) return "See your Library";
    if (finishDest === "/people")   return "See your People";
    return "Go to Today";
  })();

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

          {/* ── Screen 1: Hub picker ─────────────────────────────────────── */}
          {screen === 1 && (
            <div className="p-6 sm:p-8 space-y-6">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Step 1 of 3 · Welcome, {firstName} 👋</p>
                <h1 className="text-2xl font-bold leading-tight">Which Hub would you like to start with?</h1>
                <p className="text-sm text-muted-foreground mt-1">Your Hub shapes how MyLifos is organized. You can explore everything else later.</p>
              </div>

              <div className="space-y-3">
                {HUBS.map(hub => (
                  <button
                    key={hub.key}
                    onClick={() => pickPersona(hub.key)}
                    className="w-full flex items-start gap-4 p-5 rounded-2xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all text-left group"
                  >
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0 ${hub.bgClass}`}>
                      {hub.emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-lg text-foreground leading-tight">{hub.title}</p>
                      <p className="text-sm text-muted-foreground mt-0.5 mb-2.5 leading-snug">{hub.tagline}</p>
                      <div className="flex gap-1.5 flex-wrap">
                        {hub.features.map(f => (
                          <span key={f} className="text-[11px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground font-medium">
                            {f}
                          </span>
                        ))}
                      </div>
                    </div>
                    <ArrowRight size={18} className="text-muted-foreground group-hover:text-primary shrink-0 transition-colors mt-1" />
                  </button>
                ))}
              </div>

              {/* Quick Start */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Quick start</p>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { emoji: "🍽️", label: "Recipes",  sub: "Recipes · People · Messages", paths: ["/recipes", "/people", "/messenger"],  persona: "explore_life" as PersonaKey, dest: "/recipes"   },
                    { emoji: "🏠", label: "Home",     sub: "Home · People · Messages",    paths: ["/dashboard", "/people", "/messenger"], persona: "momentum"     as PersonaKey, dest: "/dashboard" },
                  ]).map(qs => (
                    <button
                      key={qs.label}
                      onClick={() => finishQuickStart(qs.paths, qs.persona, qs.dest)}
                      className="flex items-center gap-2.5 p-3 rounded-xl border border-border hover:border-primary/50 hover:bg-primary/5 transition-all text-left group"
                    >
                      <span className="text-lg shrink-0">{qs.emoji}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground leading-tight">{qs.label}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{qs.sub}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Screen 2: Sidebar builder ────────────────────────────────── */}
          {screen === 2 && (
            <div className="p-6 sm:p-8 space-y-5">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Step 2 of 3</p>
                <h1 className="text-2xl font-bold leading-tight">Build your sidebar</h1>
                <p className="text-sm text-muted-foreground mt-1">Your Hub's core pages are already selected. Add or remove anything you like.</p>
              </div>

              <div className="space-y-1.5 max-h-[55vh] overflow-y-auto pr-1">
                {PAGE_CATALOG.map(page => {
                  const isSelected = selectedPaths.includes(page.path);
                  const isDefault = (HUB_DEFAULT_PATHS[persona!] ?? []).includes(page.path);
                  return (
                    <button
                      key={page.path}
                      onClick={() => togglePath(page.path)}
                      className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl border-2 text-left transition-all
                        ${isSelected
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/40 hover:bg-primary/3"
                        }`}
                    >
                      <span className="text-xl shrink-0 leading-none w-6 text-center">{page.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-foreground">{page.name}</p>
                          {isDefault && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold leading-tight">
                              Hub default
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{page.desc}</p>
                      </div>
                      <div className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-all
                        ${isSelected ? "bg-primary border-primary" : "border-border"}`}>
                        {isSelected && <Check size={11} className="text-primary-foreground" />}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                <button onClick={() => setScreen(1)} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  ← Back
                </button>
                <button
                  onClick={() => setScreen(3)}
                  className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors"
                >
                  Next <ArrowRight size={15} />
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

                  {persona === "explore_life" ? (
                    /* 2-column grid for explore_life (5 options) to prevent overflow */
                    <div className="grid grid-cols-2 gap-2.5">
                      {options.map(opt => (
                        <button
                          key={opt.key}
                          onClick={() => setSelectedOption(opt)}
                          className="flex flex-col items-start gap-1.5 p-3.5 rounded-2xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all text-left group"
                        >
                          <span className="text-2xl">{opt.emoji}</span>
                          <p className="font-semibold text-sm text-foreground leading-snug">{opt.label}</p>
                          <p className="text-xs text-muted-foreground leading-snug">{opt.sub}</p>
                        </button>
                      ))}
                    </div>
                  ) : (
                    /* Stacked list for all other personas */
                    <div className="space-y-2.5">
                      {options.map(opt => (
                        <button
                          key={opt.key}
                          onClick={() => {
                            if (opt.key === "training_plan") {
                              sessionStorage.setItem("openPlanBuilder", "1");
                              handleCreated("Training Plan", "/health");
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
                  )}

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
                    ? persona === "explore_life"
                      ? `"${createdLabel}" is saved. Your library is ready to grow.`
                      : persona === "connect"
                      ? `"${createdLabel}" is saved. Your people feed is ready.`
                      : `"${createdLabel}" is saved. Today is ready to turn it into action.`
                    : "You're all set. You can personalize more anytime."}
                </p>
              </div>

              {/* Sidebar tabs that were pinned */}
              {(() => {
                const allPaths = [...new Set([
                  ...selectedPaths,
                  ...(createdHobbyMeta?.hobbyId ? ["/hobbies"] : []),
                ])];
                const prefs = buildNavPrefs(persona!, allPaths);
                const visiblePaths = prefs.filter((p: any) => !p.hidden).slice(0, 8).map((p: any) => p.path as string);
                return (
                  <div className="rounded-xl border bg-card px-4 py-3 space-y-2">
                    <p className="text-xs font-semibold">Your sidebar now shows</p>
                    <div className="flex flex-wrap gap-1.5">
                      {visiblePaths.map(path => (
                        <span key={path} className="rounded-lg bg-secondary/40 px-2 py-1.5 text-[11px] font-medium">
                          {PATH_LABELS[path] ?? path}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* First-week steps — completed step always floats to top */}
              {(() => {
                const rawSteps = PERSONA_FIRST_STEPS[persona!] ?? [];
                const isDone = (s: typeof rawSteps[0]) => !!createdLabel && (
                  finishDest === s.href ||
                  finishDest.startsWith(s.href + "?") ||
                  finishDest.startsWith(s.href + "/")
                );
                const steps = createdLabel
                  ? [...rawSteps].sort((a, b) => (isDone(b) ? 1 : 0) - (isDone(a) ? 1 : 0))
                  : rawSteps;
                return (
                  <div className="rounded-xl border px-4 py-3 space-y-2">
                    <p className="text-xs font-semibold">Suggested first steps</p>
                    <div className="space-y-2">
                      {steps.map((step, i) => {
                        const done = isDone(step);
                        return (
                          <div key={step.href + step.text} className="flex items-center gap-2.5">
                            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                              done ? "border-primary bg-primary" : "border-border"
                            }`}>
                              {done && <Check size={9} className="text-primary-foreground" />}
                            </div>
                            <span className={`text-xs ${done ? "text-foreground font-medium" : "text-muted-foreground"}`}>{step.emoji} {step.text}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Hobby plan opt-in — shown only when user created a hobby in Step 3 without a plan already attached */}
              {createdHobbyMeta?.hobbyType && !createdHobbyMeta?.planAlreadyCreated && (() => {
                const templates = ONBOARDING_PLAN_TEMPLATES[createdHobbyMeta.hobbyType!] ?? [];
                if (!templates.length) return null;
                return (
                  <div className="rounded-xl border p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-base">📋</span>
                      <p className="text-xs font-semibold">Start a plan for {createdLabel}</p>
                    </div>
                    <div className="space-y-2">
                      {templates.map(tpl => (
                        <button key={tpl.id} type="button"
                          onClick={() => setSelectedPlanTpl(selectedPlanTpl?.id === tpl.id ? null : tpl)}
                          className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                            selectedPlanTpl?.id === tpl.id
                              ? "border-primary bg-primary/8"
                              : "border-border hover:border-primary/50 hover:bg-primary/5"
                          }`}>
                          <span className="text-xl shrink-0">{tpl.emoji}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold">{tpl.label}</p>
                            <p className="text-xs text-muted-foreground leading-snug">{tpl.description}</p>
                            {tpl.durationWeeks && <p className="text-[11px] text-muted-foreground mt-0.5">{tpl.durationWeeks} weeks</p>}
                          </div>
                          <div className={`w-5 h-5 rounded-full shrink-0 border-2 flex items-center justify-center transition-colors ${
                            selectedPlanTpl?.id === tpl.id ? "border-primary bg-primary" : "border-border"
                          }`}>
                            {selectedPlanTpl?.id === tpl.id && <Check size={10} className="text-primary-foreground" />}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}

              <div className="flex items-center justify-between gap-3">
                <button
                  onClick={() => {
                    setCreatedLabel(null);
                    setCreatedHref(null);
                    setCreatedHobbyMeta(null);
                    setSelectedPlanTpl(null);
                    setSelectedOption(null);
                    setScreen(3);
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  ← Change my setup
                </button>
                <button
                  onClick={finish}
                  disabled={completeMut.isPending}
                  className="flex-1 bg-primary text-primary-foreground py-3 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                >
                  {completeMut.isPending
                    ? "Saving…"
                    : <>{finishLabel} <ArrowRight size={15} /></>
                  }
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
    </>
  );
}
