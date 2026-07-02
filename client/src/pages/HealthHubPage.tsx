import { useState } from "react";
import { Dumbbell, UtensilsCrossed, Activity, ChefHat } from "lucide-react";
import WorkoutsPage from "./WorkoutsPage";
import NutritionPage from "./NutritionPage";
import HealthPage from "./HealthPage";
import RecipesPage from "./RecipesPage";

type HealthTab = "workouts" | "nutrition" | "vitals" | "recipes";

const TABS: { id: HealthTab; label: string; icon: React.ElementType; beta?: boolean }[] = [
  { id: "workouts",  label: "Workouts",  icon: Dumbbell        },
  { id: "nutrition", label: "Nutrition", icon: UtensilsCrossed },
  { id: "vitals",    label: "Vitals",    icon: Activity,       beta: true },
  { id: "recipes",   label: "Recipes",   icon: ChefHat         },
];

function getInitialTab(): HealthTab {
  const p = new URLSearchParams(window.location.search).get("tab") as HealthTab | null;
  if (p === "nutrition") return "nutrition";
  if (p === "vitals")    return "vitals";
  if (p === "recipes")   return "recipes";
  return "workouts";
}

export default function HealthHubPage() {
  const [active, setActive] = useState<HealthTab>(getInitialTab);

  function switchTab(tab: HealthTab) {
    setActive(tab);
  }

  return (
    <div>
      {/* ── Sub-tab bar ─────────────────────────────────────────────────────── */}
      <div className="border-b bg-background sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex">
          {TABS.map(({ id, label, icon: Icon, beta }) => (
            <button
              key={id}
              onClick={() => switchTab(id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                active === id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
              }`}
            >
              <Icon size={14} />
              {label}
              {beta && (
                <span className="ml-1 text-[9px] font-semibold uppercase tracking-wide bg-primary/10 text-primary px-1.5 py-0.5 rounded-full leading-none">
                  Beta
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── All pages mounted; inactive hidden so state is preserved ────────── */}
      <div className={active === "workouts"  ? "" : "hidden"}><WorkoutsPage /></div>
      <div className={active === "nutrition" ? "" : "hidden"}><NutritionPage /></div>
      <div className={active === "vitals"    ? "" : "hidden"}><HealthPage /></div>
      <div className={active === "recipes"   ? "" : "hidden"}><RecipesPage /></div>
    </div>
  );
}
