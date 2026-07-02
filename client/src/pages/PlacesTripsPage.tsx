import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { MapPin, Plane } from "lucide-react";
import SpotsPage from "./SpotsPage";

type PlacesTab = "places" | "trips";

const TABS: { id: PlacesTab; label: string; icon: React.ElementType }[] = [
  { id: "places", label: "Places", icon: MapPin },
  { id: "trips",  label: "Trips",  icon: Plane  },
];

function getTabFromSearch(): PlacesTab {
  const p = new URLSearchParams(window.location.search).get("tab") as PlacesTab | null;
  return p === "trips" ? "trips" : "places";
}

export default function PlacesTripsPage() {
  const [active, setActive] = useState<PlacesTab>(getTabFromSearch);
  const [, navigate] = useLocation();

  // Re-sync if the URL changes externally (e.g. back/forward navigation)
  useEffect(() => {
    function onPop() { setActive(getTabFromSearch()); }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function switchTab(tab: PlacesTab) {
    setActive(tab);
    navigate(`/places?tab=${tab}`, { replace: true });
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

      {/* ── Single SpotsPage instance, driven by activeView prop ─────────── */}
      <SpotsPage activeView={active} />
    </div>
  );
}
