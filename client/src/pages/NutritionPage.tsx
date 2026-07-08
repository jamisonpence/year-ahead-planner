import { useState } from "react";
import PageShell from "@/components/PageShell";
import { NutritionTab } from "@/pages/HealthPage";
import {
  UtensilsCrossed, CalendarDays, Target, BarChart2,
} from "lucide-react";

type Section = "today" | "plan" | "targets" | "insights";

const TABS: { id: Section; label: string; icon: React.ElementType }[] = [
  { id: "today",   label: "Today",   icon: UtensilsCrossed },
  { id: "plan",    label: "Plan",    icon: CalendarDays    },
  { id: "targets", label: "Targets", icon: Target          },
  { id: "insights", label: "Insights", icon: BarChart2     },
];

export default function NutritionPage() {
  const [activeSection, setActiveSection] = useState<Section>("today");

  return (
    <PageShell
      size="sm"
      title="Nutrition"
      subtitle="Today's food decisions, meal planning, targets, and weekly insights"
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
