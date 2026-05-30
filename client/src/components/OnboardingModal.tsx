import { useState } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { ArrowRight, Check } from "lucide-react";

// ── Persona definitions ───────────────────────────────────────────────────────

type PersonaKey = "healthy" | "explore" | "organized";

const PERSONAS: { key: PersonaKey; emoji: string; title: string; sub: string }[] = [
  { key: "healthy",    emoji: "💪", title: "Get healthier",        sub: "Workouts, nutrition, and habits that stick"          },
  { key: "explore",   emoji: "⭐", title: "Explore and enjoy life", sub: "Books, films, recipes, hobbies, and places"          },
  { key: "organized", emoji: "📋", title: "Get organized",          sub: "Goals, tasks, habits, and your calendar — connected" },
];

// ── Path definitions ──────────────────────────────────────────────────────────

interface PathStep { section: string; description: string; highlight: string; href: string }

const PATHS: Record<PersonaKey, PathStep[]> = {
  healthy: [
    { section: "Workouts",   description: "Log sessions, track PRs, and follow a plan.",           highlight: "💪 Build a streak that motivates you",           href: "/workouts"  },
    { section: "Nutrition",  description: "Set calorie and macro goals, log meals and water.",      highlight: "🥗 Fuel your body intentionally",                href: "/nutrition" },
    { section: "Habits",     description: "Track daily actions that compound over time.",           highlight: "✅ Small steps, big change",                     href: "/habits"    },
    { section: "Goals",      description: "Set targets and track progress across all your plans.",  highlight: "🎯 See the big picture, not just the day",       href: "/goals"     },
  ],
  explore: [
    { section: "Reading",        description: "Track books, log sessions, and hit your reading goal.",       highlight: "📚 Read more, remember more",              href: "/reading" },
    { section: "Movies & Shows", description: "Build your watchlist and track what you've seen.",            highlight: "🎬 Never forget a great watch",            href: "/movies"  },
    { section: "Recipes",        description: "Save recipes, plan meals, and build your cookbook.",          highlight: "🍽️ Cook something new every week",          href: "/recipes" },
    { section: "Hobbies",        description: "Log your hobbies, set goals, and track your progress.",      highlight: "✨ Make time for what you love",            href: "/hobbies" },
  ],
  organized: [
    { section: "Goals",    description: "Create annual goals and link projects and tasks to them.",  highlight: "🎯 Everything connected to a bigger purpose",  href: "/goals"    },
    { section: "Tasks",    description: "Manage projects, tasks, and recurring chores.",             highlight: "📋 See what needs doing today",                href: "/tasks"    },
    { section: "Habits",   description: "Build the daily habits that make everything easier.",       highlight: "✅ Consistency is the system",                 href: "/habits"   },
    { section: "Calendar", description: "View all events, tasks, and plans in one place.",           highlight: "📅 Your life, in one view",                   href: "/calendar" },
  ],
};

// ── Storage helpers ───────────────────────────────────────────────────────────

export const ONBOARDING_PERSONA_KEY = "mylifos_onboarding_persona";
export const ONBOARDING_CHECKLIST_KEY = "mylifos_onboarding_checklist";

export function saveOnboardingData(persona: PersonaKey) {
  try {
    localStorage.setItem(ONBOARDING_PERSONA_KEY, persona);
    const steps = PATHS[persona].map(s => ({ section: s.section, href: s.href, done: false }));
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

// ── Main Modal ────────────────────────────────────────────────────────────────

export default function OnboardingModal({ userName }: { userName: string }) {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [screen, setScreen] = useState<1 | 2 | 3>(1);
  const [persona, setPersona] = useState<PersonaKey | null>(null);
  const [pathStep, setPathStep] = useState(0);

  const completeMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/me/complete-onboarding"),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/me"] }); },
  });

  const firstName = userName.split(" ")[0];
  const steps = persona ? PATHS[persona] : [];
  const currentStep = steps[pathStep];
  const progressPct = screen === 1 ? 5 : screen === 2 ? Math.round(((pathStep + 1) / 4) * 70) + 5 : 100;

  function pickPersona(p: PersonaKey) {
    setPersona(p);
    setPathStep(0);
    setScreen(2);
  }

  function nextStep() {
    if (pathStep < steps.length - 1) {
      setPathStep(i => i + 1);
    } else {
      setScreen(3);
    }
  }

  function goToSection() {
    if (currentStep) navigate(currentStep.href);
  }

  function finish() {
    if (persona) saveOnboardingData(persona);
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
              <h1 className="text-2xl font-bold leading-tight">What brings you to MyLifos?</h1>
              <p className="text-sm text-muted-foreground mt-1">Pick the one that fits best — you can explore everything later.</p>
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

        {/* ── Screen 2: Path walkthrough ─────────────────────────────────── */}
        {screen === 2 && persona && currentStep && (
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
                <p className="text-xs font-semibold text-primary uppercase tracking-wider">Step {pathStep + 1} of {steps.length}</p>
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
                onClick={() => pathStep === 0 ? setScreen(1) : setPathStep(i => i - 1)}
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

        {/* ── Screen 3: Confirm ──────────────────────────────────────────── */}
        {screen === 3 && persona && (
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

            <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-3">
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
