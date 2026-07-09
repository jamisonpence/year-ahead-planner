import { useEffect, useState } from "react";
import { Dumbbell, UtensilsCrossed, Activity, ChefHat } from "lucide-react";
import WorkoutsPage from "./WorkoutsPage";
import NutritionPage from "./NutritionPage";
import HealthPage from "./HealthPage";
import RecipesPage from "./RecipesPage";

type HealthTab = "workouts" | "nutrition" | "vitals" | "recipes";
const HEALTH_TAB_INTENT_KEY = "mylifos_health_tab_intent";

const TABS: { id: HealthTab; label: string; icon: React.ElementType; beta?: boolean }[] = [
  { id: "workouts",  label: "Workouts",  icon: Dumbbell        },
  { id: "nutrition", label: "Nutrition", icon: UtensilsCrossed },
  { id: "vitals",    label: "Vitals",    icon: Activity,       beta: true },
  { id: "recipes",   label: "Recipes",   icon: ChefHat         },
];

function getInitialTab(): HealthTab {
  const storedTab = localStorage.getItem(HEALTH_TAB_INTENT_KEY) as HealthTab | null;
  if (storedTab) {
    localStorage.removeItem(HEALTH_TAB_INTENT_KEY);
    if (storedTab === "workouts" || storedTab === "nutrition" || storedTab === "vitals" || storedTab === "recipes") return storedTab;
  }
  const hashQuery = window.location.hash.includes("?") ? window.location.hash.split("?")[1] : "";
  const p = new URLSearchParams(hashQuery || window.location.search).get("tab") as HealthTab | null;
  if (p === "nutrition") return "nutrition";
  if (p === "vitals")    return "vitals";
  if (p === "recipes")   return "recipes";
  return "workouts";
}

export default function HealthHubPage() {
  const [active, setActive] = useState<HealthTab>(getInitialTab);

  useEffect(() => {
    function handleOpenHealthTab(event: Event) {
      const tab = (event as CustomEvent<{ tab?: HealthTab }>).detail?.tab;
      if (tab === "workouts" || tab === "nutrition" || tab === "vitals" || tab === "recipes") setActive(tab);
    }
    window.addEventListener("mylifos-open-health-tab", handleOpenHealthTab);
    return () => window.removeEventListener("mylifos-open-health-tab", handleOpenHealthTab);
  }, []);

  function switchTab(tab: HealthTab) {
    setActive(tab);
  }

  return (
    <div className="w-full max-w-full overflow-x-hidden">
      {/* ── Sub-tab bar ─────────────────────────────────────────────────────── */}
      <div className="border-b bg-background sticky top-0 z-10 w-full max-w-full overflow-x-hidden">
        <div className="max-w-5xl mx-auto px-3 sm:px-6 flex gap-1 overflow-x-auto overscroll-x-contain scrollbar-none">
          {TABS.map(({ id, label, icon: Icon, beta }) => (
            <button
              key={id}
              onClick={() => switchTab(id)}
              className={`flex shrink-0 items-center gap-1.5 px-3 sm:px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
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
