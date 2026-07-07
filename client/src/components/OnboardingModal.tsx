import { useState } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { ArrowRight, Check } from "lucide-react";

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

// ── Path definitions ──────────────────────────────────────────────────────────

interface PathStep { section: string; description: string; highlight: string; href: string }

const PATHS: Record<PersonaKey, PathStep[]> = {
  momentum: [
    {
      section:     "Goals",
      description: "Set your year-ahead goals and connect every project and task to them.",
      highlight:   "🎯 One clear direction for the year",
      href:        "/goals",
    },
    {
      section:     "Tasks",
      description: "Break goals into projects and daily actions you can actually finish.",
      highlight:   "📋 See what needs doing — right now",
      href:        "/tasks",
    },
    {
      section:     "Habits",
      description: "Build the daily routines that make your goals inevitable.",
      highlight:   "✅ Small actions, compounding results",
      href:        "/habits",
    },
    {
      section:     "Review",
      description: "Run a weekly review to reflect, reset, and stay on track.",
      highlight:   "🪞 One hour a week changes everything",
      href:        "/review",
    },
  ],

  health: [
    {
      section:     "Workouts",
      description: "Log sessions, track personal records, and follow a training plan.",
      highlight:   "💪 Build a streak that actually motivates you",
      href:        "/health",
    },
    {
      section:     "Nutrition",
      description: "Set calorie and macro goals, log meals, and track hydration.",
      highlight:   "🥗 Fuel your body intentionally",
      href:        "/health?tab=nutrition",
    },
    {
      section:     "Habits",
      description: "Stack health habits — sleep, movement, mindfulness, and more.",
      highlight:   "✅ Small daily choices add up fast",
      href:        "/habits",
    },
    {
      section:     "Vitals",
      description: "Track body metrics and health trends over time.",
      highlight:   "📈 See the trend, not just today's number",
      href:        "/health?tab=vitals",
    },
  ],

  explore_life: [
    {
      section:     "Media",
      description: "Track books, films, music, and art — rate what you love and discover more.",
      highlight:   "📚 Build your personal taste profile",
      href:        "/library",
    },
    {
      section:     "Recipes",
      description: "Save recipes, plan meals, and build your own digital cookbook.",
      highlight:   "🍽️ Cook something new every week",
      href:        "/health?tab=recipes",
    },
    {
      section:     "Places & Trips",
      description: "Save spots you love, plan upcoming trips, and log where you've been.",
      highlight:   "📍 Never lose a place worth returning to",
      href:        "/places",
    },
    {
      section:     "Interests",
      description: "Log your hobbies, set goals, and track progress in the things you love.",
      highlight:   "✨ Make time for what lights you up",
      href:        "/hobbies",
    },
  ],

  connect: [
    {
      section:     "People",
      description: "Track your relationships — friends, family, and the contacts who matter most.",
      highlight:   "👥 Meaningful relationships, not just a contact list",
      href:        "/people",
    },
    {
      section:     "Messages",
      description: "Send and receive recommendations and stay in touch inside MyLifos.",
      highlight:   "💬 Real conversations about real things",
      href:        "/messenger",
    },
    {
      section:     "Library",
      description: "See what friends are saving and sharing with you across every category.",
      highlight:   "⭐ Good taste is worth sharing",
      href:        "/mylifos",
    },
    {
      section:     "Interests",
      description: "Connect over shared hobbies, films, books, and passions.",
      highlight:   "✨ Find your people through shared interests",
      href:        "/hobbies",
    },
  ],
};

// ── Storage helpers ───────────────────────────────────────────────────────────

export const ONBOARDING_PERSONA_KEY    = "mylifos_onboarding_persona";
export const ONBOARDING_CHECKLIST_KEY  = "mylifos_onboarding_checklist";
export const ONBOARDING_INTENTIONS_KEY = "mylifos_onboarding_intentions";

/** Normalise a raw stored persona string (including legacy v1 keys) to a current PersonaKey. */
function normalisePersona(raw: string): PersonaKey {
  if (raw in LEGACY_PERSONA_MAP) return LEGACY_PERSONA_MAP[raw as keyof typeof LEGACY_PERSONA_MAP];
  if (raw in PATHS) return raw as PersonaKey;
  return "momentum"; // safe fallback
}

export function saveOnboardingData(persona: PersonaKey) {
  try {
    const key = normalisePersona(persona);
    localStorage.setItem(ONBOARDING_PERSONA_KEY, key);
    const steps = PATHS[key].map(s => ({ section: s.section, href: s.href, done: false }));
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

// ── Main Modal ────────────────────────────────────────────────────────────────

export default function OnboardingModal({ userName }: { userName: string }) {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [screen, setScreen] = useState<1 | 2 | 3 | 4>(1);
  const [persona, setPersona] = useState<PersonaKey | null>(null);
  const [intentions, setIntentions] = useState<IntentionKey[]>([]);
  const [pathStep, setPathStep] = useState(0);

  const completeMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/me/complete-onboarding"),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/me"] }); },
  });

  const prefsMut = useMutation({
    mutationFn: (data: object) => apiRequest("PUT", "/api/me/prefs", data),
  });

  const firstName = userName.split(" ")[0];
  const steps = persona ? PATHS[persona] : [];
  const currentStep = steps[pathStep];
  const totalSteps = steps.length;

  const progressPct =
    screen === 1 ? 5 :
    screen === 2 ? 28 :
    screen === 3 ? Math.round(((pathStep + 1) / totalSteps) * 57) + 28 :
    100;

  function pickPersona(p: PersonaKey) {
    setPersona(p);
    setPathStep(0);
    setScreen(2);
  }

  function toggleIntention(k: IntentionKey) {
    setIntentions(prev => {
      if (prev.includes(k)) return prev.filter(x => x !== k);
      if (prev.length >= 2) return prev; // max 2
      return [...prev, k];
    });
  }

  function nextStep() {
    if (pathStep < steps.length - 1) {
      setPathStep(i => i + 1);
    } else {
      setScreen(4);
    }
  }

  function goToSection() {
    if (currentStep) navigate(currentStep.href);
  }

  function finish() {
    if (persona) saveOnboardingData(persona);
    saveIntentions(intentions);
    // Persist to server (fire-and-forget — localStorage is the source of truth)
    prefsMut.mutate({ intentions, persona: persona ?? "momentum" });
    completeMut.mutate();
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden">

        {/* Progress bar */}
        <div className="h-1 bg-muted shrink-0">
          <div className="h-full bg-primary transition-all duration-500 ease-out" style={{ width: `${progressPct}%` }} />
        </div>

        {/* ── Screen 1: Persona picker ───────────────────────────────────── */}
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

        {/* ── Screen 2: Intentions picker ────────────────────────────────── */}
        {screen === 2 && (
          <div className="p-6 sm:p-8 space-y-6">
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Step 2 of 2</p>
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
              <button
                onClick={() => setScreen(1)}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
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

        {/* ── Screen 3: Path walkthrough ─────────────────────────────────── */}
        {screen === 3 && persona && currentStep && (
          <div className="p-6 sm:p-8 space-y-6">
            {/* Step indicators */}
            <div className="flex items-center gap-2">
              {steps.map((s, i) => (
                <div key={i} className="flex items-center gap-2 flex-1">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all shrink-0 ${
                    i < pathStep ? "bg-primary border-primary text-primary-foreground" :
                    i === pathStep ? "border-primary text-primary bg-primary/10" :
                    "border-border text-muted-foreground"
                  }`}>
                    {i < pathStep ? <Check size={13} /> : i + 1}
                  </div>
                  {i < steps.length - 1 && (
                    <div className={`h-0.5 flex-1 rounded-full transition-all ${i < pathStep ? "bg-primary" : "bg-border"}`} />
                  )}
                </div>
              ))}
            </div>

            {/* Section card */}
            <div className="rounded-2xl border-2 border-primary/20 bg-primary/5 p-5 space-y-3">
              <div>
                <p className="text-xs font-semibold text-primary uppercase tracking-wider">Step {pathStep + 1} of {totalSteps}</p>
                <h2 className="text-xl font-bold mt-1">{currentStep.section}</h2>
                <p className="text-sm text-muted-foreground mt-1">{currentStep.description}</p>
              </div>

              {/* Highlight callout */}
              <div className="bg-background rounded-xl px-4 py-3 border">
                <p className="text-sm font-medium">{currentStep.highlight}</p>
              </div>

              {/* Go to section button */}
              <button
                onClick={goToSection}
                className="text-xs text-primary hover:underline font-medium flex items-center gap-1"
              >
                Preview {currentStep.section} → <span className="text-muted-foreground">(opens in app)</span>
              </button>
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between gap-3">
              <button
                onClick={() => pathStep === 0 ? setScreen(2) : setPathStep(i => i - 1)}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={nextStep}
                className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors"
              >
                {pathStep < steps.length - 1 ? <>Next <ArrowRight size={15} /></> : <>See my path <ArrowRight size={15} /></>}
              </button>
            </div>
          </div>
        )}

        {/* ── Screen 4: Confirm ──────────────────────────────────────────── */}
        {screen === 4 && persona && (
          <div className="p-6 sm:p-8 space-y-6">
            <div>
              <p className="text-2xl mb-2">🎉</p>
              <h1 className="text-2xl font-bold">You're all set, {firstName}!</h1>
              <p className="text-sm text-muted-foreground mt-1">Here's your personalized path to get started:</p>
            </div>

            <div className="space-y-2">
              {steps.map((s, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-secondary/40">
                  <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{s.section}</p>
                    <p className="text-xs text-muted-foreground">{s.description}</p>
                  </div>
                </div>
              ))}
            </div>

            {intentions.length > 0 && (
              <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 flex items-center gap-2.5">
                <span className="text-base shrink-0">✨</span>
                <p className="text-xs text-muted-foreground">
                  Your Today page will highlight your focus areas:{" "}
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
              {completeMut.isPending ? "Saving…" : <>Enter MyLifos <ArrowRight size={15} /></>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
