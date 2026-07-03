import { useState } from "react";
import { Users, Baby, Sparkles } from "lucide-react";
import RelationshipsPage from "./RelationshipsPage";
import KidsPage from "./KidsPage";
import DiscoverPage from "./DiscoverPage";

type PeopleTab = "friends" | "family" | "taste";

const TABS: { id: PeopleTab; label: string; icon: React.ElementType }[] = [
  { id: "friends", label: "Friends",     icon: Users    },
  { id: "family",  label: "Family",      icon: Baby     },
  { id: "taste",   label: "Discover", icon: Sparkles },
];

function getInitialTab(): PeopleTab {
  const p = new URLSearchParams(window.location.search).get("tab") as PeopleTab | null;
  if (p === "family") return "family";
  if (p === "taste")  return "taste";
  return "friends";
}

export default function PeoplePage() {
  const [active, setActive] = useState<PeopleTab>(getInitialTab);

  function switchTab(tab: PeopleTab) {
    setActive(tab);
  }

  return (
    <div>
      {/* ── Sub-tab bar ─────────────────────────────────────────────────────── */}
      <div className="border-b bg-background sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex">
          {TABS.map(({ id, label, icon: Icon }) => (
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
            </button>
          ))}
        </div>
      </div>

      {/* ── All pages mounted; inactive hidden so state is preserved ────────── */}
      <div className={active === "friends" ? "" : "hidden"}><RelationshipsPage /></div>
      <div className={active === "family"  ? "" : "hidden"}><KidsPage /></div>
      <div className={active === "taste"   ? "" : "hidden"}><DiscoverPage /></div>
    </div>
  );
}
