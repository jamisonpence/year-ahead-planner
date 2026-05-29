import { useState } from "react";
import PageShell from "@/components/PageShell";
import { NutritionTab } from "@/pages/HealthPage";
import {
  UtensilsCrossed, CalendarDays, Target, Layers, BarChart2,
} from "lucide-react";

type Section = "meal-planner" | "log" | "goals" | "plans" | "weekly";

const TABS: { id: Section; label: string; icon: React.ElementType }[] = [
  { id: "meal-planner", label: "Meal Planner", icon: CalendarDays      },
  { id: "log",          label: "Food Log",     icon: UtensilsCrossed   },
  { id: "goals",        label: "Goals",        icon: Target            },
  { id: "plans",        label: "Plans",        icon: Layers            },
  { id: "weekly",       label: "Weekly",       icon: BarChart2         },
];

export default function NutritionPage() {
  const [activeSection, setActiveSection] = useState<Section>("log");

  return (
    <PageShell
      size="sm"
      title="Nutrition"
      subtitle="Food log, macros, meal plans, and nutrition goals"
      controls={
        <div className="flex gap-1.5 flex-wrap">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeSection === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSection(tab.id)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium transition-all ${
                  isActive
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                <Icon size={13} />
                {tab.label}
              </button>
            );
          })}
        </div>
      }
    >
      <NutritionTab section={activeSection} onSection={setActiveSection} />
    </PageShell>
  );
}
