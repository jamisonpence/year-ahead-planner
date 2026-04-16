import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useTheme } from "@/components/ThemeProvider";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { NavPref } from "@shared/schema";
import {
  LayoutDashboard, Calendar, Target, BookOpen, Dumbbell,
  Users, ChefHat, Sun, Moon, Menu, X, Film, Wallet,
  Eye, EyeOff, GripVertical, Settings,
} from "lucide-react";

const ALL_TABS = [
  { path: "/",              label: "Dashboard",               icon: LayoutDashboard },
  { path: "/calendar",      label: "Calendar",                icon: Calendar        },
  { path: "/goals",         label: "Goals, Projects & Tasks", icon: Target          },
  { path: "/reading",       label: "Reading",                 icon: BookOpen        },
  { path: "/workouts",      label: "Workouts",                icon: Dumbbell        },
  { path: "/relationships", label: "Relationships",           icon: Users           },
  { path: "/recipes",       label: "Recipes",                 icon: ChefHat         },
  { path: "/movies",        label: "Movies",                  icon: Film            },
  { path: "/budget",        label: "Budget",                  icon: Wallet          },
];

function useNavPrefs() {
  const qc = useQueryClient();
  const { data: savedPrefs = [] } = useQuery<NavPref[]>({
    queryKey: ["/api/nav-prefs"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/nav-prefs");
      return r.json();
    },
  });
  const saveMut = useMutation({
    mutationFn: (prefs: NavPref[]) => apiRequest("POST", "/api/nav-prefs", prefs),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/nav-prefs"] }),
  });

  // Merge saved prefs with ALL_TABS (handles new tabs added later)
  const prefs: NavPref[] = ALL_TABS.map((tab) => {
    const saved = savedPrefs.find((p) => p.path === tab.path);
    return { path: tab.path, hidden: saved?.hidden ?? false };
  });
  // Re-order by saved order
  if (savedPrefs.length > 0) {
    const savedPaths = savedPrefs.map((p) => p.path);
    prefs.sort((a, b) => {
      const ai = savedPaths.indexOf(a.path);
      const bi = savedPaths.indexOf(b.path);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }

  return { prefs, save: (next: NavPref[]) => saveMut.mutate(next) };
}

// ── Extracted nav components (must be top-level, not inside render) ───────────

function NavLink({ path, label, icon: Icon, active, onClick }: {
  path: string; label: string; icon: React.ElementType;
  active: boolean; onClick?: () => void;
}) {
  return (
    <Link href={path}>
      <div
        onClick={onClick}
        className={`sidebar-item cursor-pointer ${active ? "active" : ""}`}
      >
        <Icon size={17} />
        <span>{label}</span>
      </div>
    </Link>
  );
}

function ManageItem({ pref, tab, index, onDragStart, onDragOver, onDragEnd, onToggle }: {
  pref: NavPref;
  tab: typeof ALL_TABS[0];
  index: number;
  onDragStart: (i: number) => void;
  onDragOver: (e: React.DragEvent, i: number) => void;
  onDragEnd: () => void;
  onToggle: (path: string) => void;
}) {
  const Icon = tab.icon;
  return (
    <div
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDragEnd={onDragEnd}
      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/50 cursor-grab active:cursor-grabbing select-none"
    >
      <GripVertical size={14} className="text-muted-foreground shrink-0" />
      <Icon size={15} className={pref.hidden ? "text-muted-foreground/40" : "text-muted-foreground"} />
      <span className={`text-sm flex-1 ${pref.hidden ? "text-muted-foreground/40 line-through" : ""}`}>
        {tab.label}
      </span>
      <button
        type="button"
        onClick={() => onToggle(pref.path)}
        className="p-1 rounded hover:bg-background transition-colors"
        title={pref.hidden ? "Show tab" : "Hide tab"}
      >
        {pref.hidden
          ? <EyeOff size={13} className="text-muted-foreground/50" />
          : <Eye size={13} className="text-muted-foreground" />}
      </button>
    </div>
  );
}

// ── Main shell ────────────────────────────────────────────────────────────────

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { theme, toggle } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [manageMode, setManageMode] = useState(false);
  const { prefs, save } = useNavPrefs();

  // Local drag state
  const [localPrefs, setLocalPrefs] = useState<NavPref[]>([]);
  useEffect(() => { if (!manageMode) setLocalPrefs(prefs); }, [prefs, manageMode]);

  const dragIdx = useRef<number | null>(null);

  function handleDragStart(i: number) { dragIdx.current = i; }
  function handleDragOver(e: React.DragEvent, i: number) {
    e.preventDefault();
    if (dragIdx.current === null || dragIdx.current === i) return;
    const next = [...localPrefs];
    const [item] = next.splice(dragIdx.current, 1);
    next.splice(i, 0, item);
    dragIdx.current = i;
    setLocalPrefs(next);
  }
  function handleDragEnd() {
    dragIdx.current = null;
    save(localPrefs);
  }
  function handleToggleHidden(path: string) {
    const next = localPrefs.map((p) => p.path === path ? { ...p, hidden: !p.hidden } : p);
    setLocalPrefs(next);
    save(next);
  }

  const visibleTabs = prefs
    .filter((p) => !p.hidden)
    .map((p) => ALL_TABS.find((t) => t.path === p.path))
    .filter(Boolean) as typeof ALL_TABS;

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-56 shrink-0 border-r bg-card h-screen sticky top-0">
        <div className="p-4 border-b">
          <div className="flex items-center gap-2.5">
            <svg aria-label="Planner" viewBox="0 0 32 32" width="26" height="26" fill="none">
              <rect x="2" y="6" width="28" height="24" rx="4" stroke="currentColor" strokeWidth="2" />
              <path d="M2 12h28" stroke="currentColor" strokeWidth="2" />
              <rect x="8" y="2" width="2" height="6" rx="1" fill="currentColor" />
              <rect x="22" y="2" width="2" height="6" rx="1" fill="currentColor" />
              <circle cx="10" cy="21" r="2" fill="hsl(var(--cat-goal))" />
              <circle cx="16" cy="21" r="2" fill="hsl(25 85% 52%)" />
              <circle cx="22" cy="21" r="2" fill="hsl(210 80% 48%)" />
            </svg>
            <span className="font-bold text-sm tracking-tight">Year Ahead</span>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {manageMode ? (
            localPrefs.map((pref, i) => {
              const tab = ALL_TABS.find((t) => t.path === pref.path);
              if (!tab) return null;
              return (
                <ManageItem
                  key={pref.path}
                  pref={pref}
                  tab={tab}
                  index={i}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDragEnd={handleDragEnd}
                  onToggle={handleToggleHidden}
                />
              );
            })
          ) : (
            visibleTabs.map((tab) => (
              <NavLink
                key={tab.path}
                path={tab.path}
                label={tab.label}
                icon={tab.icon}
                active={location === tab.path}
              />
            ))
          )}
        </nav>

        <div className="p-3 border-t space-y-1">
          <button
            onClick={() => setManageMode(!manageMode)}
            className={`sidebar-item w-full ${manageMode ? "active" : ""}`}
          >
            <Settings size={15} />
            <span>{manageMode ? "Done" : "Manage tabs"}</span>
          </button>
          <button onClick={toggle} className="sidebar-item w-full">
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-card border-b h-14 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <svg aria-label="Planner" viewBox="0 0 32 32" width="22" height="22" fill="none">
            <rect x="2" y="6" width="28" height="24" rx="4" stroke="currentColor" strokeWidth="2" />
            <path d="M2 12h28" stroke="currentColor" strokeWidth="2" />
          </svg>
          <span className="font-bold text-sm">Year Ahead</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggle} className="p-2 rounded-lg hover:bg-secondary transition-colors">
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button onClick={() => setMobileOpen(!mobileOpen)} className="p-2 rounded-lg hover:bg-secondary transition-colors">
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {/* Mobile nav drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-background/80 backdrop-blur-sm" onClick={() => setMobileOpen(false)}>
          <div className="absolute left-0 top-14 bottom-0 w-56 bg-card border-r p-3 space-y-1 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {visibleTabs.map((tab) => (
              <NavLink
                key={tab.path}
                path={tab.path}
                label={tab.label}
                icon={tab.icon}
                active={location === tab.path}
                onClick={() => setMobileOpen(false)}
              />
            ))}
            <div className="border-t pt-2 mt-2">
              <button onClick={() => setManageMode(!manageMode)} className={`sidebar-item w-full ${manageMode ? "active" : ""}`}>
                <Settings size={15} /><span>{manageMode ? "Done" : "Manage tabs"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Page content */}
      <main className="flex-1 min-w-0 lg:pt-0 pt-14">
        {children}
      </main>
    </div>
  );
}
