import { useState } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { ArrowRight, Check, Loader2 } from "lucide-react";

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
    title: "Build Momentum",
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
    title: "Save & Explore Life",
    sub:   "Books, music, recipes, places, trips, and interests worth remembering",
  },
  {
    key: "connect",
    emoji: "👥",
    title: "Connect with People",
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
  | "workout_log" | "health_goal" | "fitness_habit"
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
    { key: "workout_log",   emoji: "💪", label: "Log a workout",       sub: "Record your first session",             href: "/health"  },
    { key: "health_goal",   emoji: "🎯", label: "Set a health goal",   sub: "A fitness or wellness target",          href: "/goals"   },
    { key: "fitness_habit", emoji: "🔥", label: "Create a fitness habit", sub: "A daily movement or wellness habit", href: "/habits"  },
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

function GoalForm({ onDone }: { onDone: (label: string) => void }) {
  const [title, setTitle] = useState("");
  const mut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/goals", { title, horizon: "this_year", progressType: "boolean" }),
    onSuccess: () => onDone(title),
  });
  return (
    <form onSubmit={e => { e.preventDefault(); if (title.trim()) mut.mutate(); }} className="space-y-4">
      <FieldInput label="Goal" value={title} onChange={setTitle} placeholder="e.g. Run a 5K" required />
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
  const EMOJIS = ["🍽️","🍕","🍜","🥗","🍝","🥘","🍛","🍣","🍔","🥞"];
  const [emoji, setEmoji] = useState("🍽️");
  const mut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/recipes", { name, emoji }),
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

function CreateForm({ optionKey, onDone }: { optionKey: CreateOptionKey; onDone: (label: string) => void }) {
  switch (optionKey) {
    case "goal":          return <GoalForm onDone={onDone} />;
    case "task":          return <TaskForm onDone={onDone} />;
    case "habit":         return <HabitForm onDone={onDone} />;
    case "workout_log":   return <WorkoutLogForm onDone={onDone} />;
    case "health_goal":   return <GoalForm onDone={onDone} />;
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
    setScreen(2);
  }

  function toggleIntention(k: IntentionKey) {
    setIntentions(prev => {
      if (prev.includes(k)) return prev.filter(x => x !== k);
      if (prev.length >= 2) return prev;
      return [...prev, k];
    });
  }

  function handleCreated(label: string) {
    setCreatedLabel(label);
    setCreatedHref(selectedOption?.href ?? null);
    // Brief pause to show success, then advance
    setTimeout(() => setScreen(4), 900);
  }

  function finish() {
    if (persona) saveOnboardingData(persona);
    saveIntentions(intentions);
    prefsMut.mutate({ intentions, persona: persona ?? "momentum" });
    completeMut.mutate();
    // Navigate to the page for what was created, or default to dashboard
    const dest = createdHref ?? "/dashboard";
    navigate(dest);
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
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
                <h1 className="text-2xl font-bold leading-tight">What do you want to get out of MyLifos?</h1>
                <p className="text-sm text-muted-foreground mt-1">Pick the outcome that fits best — you can explore everything later.</p>
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
                <h1 className="text-2xl font-bold leading-tight">What do you want to do first?</h1>
                <p className="text-sm text-muted-foreground mt-1">Pick up to 2 — we'll highlight these to help you get started fast.</p>
              </div>

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

              {intentions.length === 2 && (
                <p className="text-xs text-center text-muted-foreground">You've picked 2 — deselect one to change your choice.</p>
              )}

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
                    <h1 className="text-2xl font-bold leading-tight">Create your first item</h1>
                    <p className="text-sm text-muted-foreground mt-1">Pick one to add right now — takes 10 seconds.</p>
                  </div>

                  <div className="space-y-2.5">
                    {options.map(opt => (
                      <button
                        key={opt.key}
                        onClick={() => setSelectedOption(opt)}
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
                      Skip for now →
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
                    ? `"${createdLabel}" is saved and ready. Let's take you there.`
                    : "Everything is ready. Let's go."}
                </p>
              </div>

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
                  A <strong>Get Started</strong> checklist will appear in your sidebar to track your progress. You can dismiss it anytime.
                </p>
              </div>

              <button
                onClick={finish}
                disabled={completeMut.isPending}
                className="w-full bg-primary text-primary-foreground py-3 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
              >
                {completeMut.isPending
                  ? "Saving…"
                  : <>{createdLabel ? `Go to ${PERSONAS.find(p => p.key === persona)?.title}` : "Enter MyLifos"} <ArrowRight size={15} /></>
                }
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
