import { useState } from "react";
import PageShell from "@/components/PageShell";
import { NutritionTab } from "@/pages/HealthPage";
import {
  UtensilsCrossed, CalendarDays, Target, Layers, BarChart2,
} from "lucide-react";

type Section = "today" | "meals" | "targets" | "plan" | "trends";

const TABS: { id: Section; label: string; icon: React.ElementType }[] = [
  { id: "today",   label: "Today",   icon: UtensilsCrossed },
  { id: "meals",   label: "Meals",   icon: Layers          },
  { id: "targets", label: "Targets", icon: Target          },
  { id: "plan",    label: "Plan",    icon: CalendarDays    },
  { id: "trends",  label: "Trends",  icon: BarChart2       },
];

export default function NutritionPage() {
  const [activeSection, setActiveSection] = useState<Section>("today");

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
