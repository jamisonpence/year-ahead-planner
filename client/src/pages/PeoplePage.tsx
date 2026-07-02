import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Users, Baby } from "lucide-react";
import RelationshipsPage from "./RelationshipsPage";
import KidsPage from "./KidsPage";

type PeopleTab = "friends" | "family";

const TABS: { id: PeopleTab; label: string; icon: React.ElementType }[] = [
  { id: "friends", label: "Friends", icon: Users },
  { id: "family",  label: "Family",  icon: Baby  },
];

function getTabFromSearch(): PeopleTab {
  const p = new URLSearchParams(window.location.search).get("tab") as PeopleTab | null;
  return p === "family" ? "family" : "friends";
}

export default function PeoplePage() {
  const [active, setActive] = useState<PeopleTab>(getTabFromSearch);
  const [, navigate] = useLocation();

  // Re-sync if the URL changes externally (e.g. back/forward navigation)
  useEffect(() => {
    function onPop() { setActive(getTabFromSearch()); }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function switchTab(tab: PeopleTab) {
    setActive(tab);
    navigate(`/people?tab=${tab}`, { replace: true });
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

      {/* ── Both pages kept mounted so state is preserved on tab switch ─────── */}
      <div className={active === "friends" ? "" : "hidden"}><RelationshipsPage /></div>
      <div className={active === "family"  ? "" : "hidden"}><KidsPage /></div>
    </div>
  );
}
