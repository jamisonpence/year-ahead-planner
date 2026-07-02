import { useState } from "react";
import { BookOpen, Film, Music2, Palette } from "lucide-react";
import ReadingPage from "./ReadingPage";
import MoviesPage from "./MoviesPage";
import MusicPage from "./MusicPage";
import ArtPage from "./ArtPage";

type LibraryTab = "books" | "watching" | "music" | "art";

const TABS: { id: LibraryTab; label: string; icon: React.ElementType }[] = [
  { id: "books",    label: "Books",    icon: BookOpen },
  { id: "watching", label: "Watching", icon: Film     },
  { id: "music",    label: "Music",    icon: Music2   },
  { id: "art",      label: "Art",      icon: Palette  },
];

function getInitialTab(): LibraryTab {
  const p = new URLSearchParams(window.location.search).get("tab") as LibraryTab | null;
  return TABS.find((t) => t.id === p) ? p! : "books";
}

export default function LibraryPage() {
  const [active, setActive] = useState<LibraryTab>(getInitialTab);

  function switchTab(tab: LibraryTab) {
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

      {/* ── All four pages kept mounted so state is preserved on tab switch ── */}
      <div className={active === "books"    ? "" : "hidden"}><ReadingPage /></div>
      <div className={active === "watching" ? "" : "hidden"}><MoviesPage /></div>
      <div className={active === "music"    ? "" : "hidden"}><MusicPage /></div>
      <div className={active === "art"      ? "" : "hidden"}><ArtPage /></div>
    </div>
  );
}
