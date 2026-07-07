import { useState } from "react";
import { Flame, Landmark } from "lucide-react";
import FaithPage from "@/pages/FaithPage";
import PoliticsPage from "@/pages/PoliticsPage";

type BeliefTab = "faith" | "civic";

const TABS: { id: BeliefTab; label: string; icon: React.ReactNode }[] = [
  { id: "faith", label: "Faith & Spirituality", icon: <Flame size={14} /> },
  { id: "civic", label: "Civic Life",           icon: <Landmark size={14} /> },
];

export default function BeliefsPage() {
  const [tab, setTab] = useState<BeliefTab>("faith");

  return (
    <div>
      {/* Tab strip */}
      <div className="sticky top-0 z-10 bg-background border-b px-4 sm:px-6">
        <div className="flex gap-0">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
                tab === t.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sub-pages — both mounted; inactive one is visually hidden */}
      <div className={tab !== "faith" ? "hidden" : ""}>
        <FaithPage />
      </div>
      <div className={tab !== "civic" ? "hidden" : ""}>
        <PoliticsPage />
      </div>
    </div>
  );
}
