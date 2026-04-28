import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useTheme } from "@/components/ThemeProvider";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { NavPref } from "@shared/schema";
import { useAuth } from "@/hooks/useAuth";
import {
  LayoutDashboard, Calendar, Target, BookOpen, Dumbbell,
  Users, ChefHat, Sun, Moon, Menu, X, Film, Wallet, Leaf, Music2, Home, MapPin,
  Eye, EyeOff, GripVertical, Settings, LogOut, Baby, Quote, Palette, KeyRound,
  Bell, ChevronRight,
} from "lucide-react";

const ALL_TABS = [
  { path: "/",              label: "Dashboard",               icon: LayoutDashboard },
  { path: "/calendar",      label: "Calendar",                icon: Calendar        },
  { path: "/goals",         label: "Goals, Projects & Tasks", icon: Target          },
  { path: "/reading",       label: "Reading",                 icon: BookOpen        },
  { path: "/workouts",      label: "Workouts",                icon: Dumbbell        },
  { path: "/relationships", label: "Relationships",           icon: Users           },
  { path: "/recipes",       label: "Recipes",                 icon: ChefHat         },
  { path: "/movies",        label: "Movies & Shows",           icon: Film            },
  { path: "/music",         label: "Music",                   icon: Music2          },
  { path: "/budget",        label: "Budget",                  icon: Wallet          },
  { path: "/plants",        label: "Plants",                  icon: Leaf            },
  { path: "/housekeeping",  label: "Housekeeping",            icon: Home            },
  { path: "/spots",         label: "Spots",                   icon: MapPin          },
  { path: "/kids",          label: "Kids",                    icon: Baby            },
  { path: "/quotes",        label: "Quotes",                  icon: Quote           },
  { path: "/art",           label: "Art",                     icon: Palette         },
  { path: "/journal",       label: "Journal",                 icon: BookOpen        },
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

function NavLink({ path, label, icon: Icon, active, onClick, badge }: {
  path: string; label: string; icon: React.ElementType;
  active: boolean; onClick?: () => void; badge?: number;
}) {
  return (
    <Link href={path}>
      <div
        onClick={onClick}
        className={`sidebar-item cursor-pointer ${active ? "active" : ""}`}
      >
        <div className="relative shrink-0">
          <Icon size={17} />
          {badge != null && badge > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
              {badge > 9 ? "9+" : badge}
            </span>
          )}
        </div>
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
  const { user } = useAuth();
  const qc = useQueryClient();

  // Pending friend-request badge
  const { data: friendCountData } = useQuery<{ count: number }>({
    queryKey: ["/api/friend-requests/count"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/friend-requests/count");
      return r.json();
    },
    refetchInterval: 60_000,
    enabled: !!user,
  });
  const pendingFriendCount = friendCountData?.count ?? 0;

  // Unread shares count
  const { data: sharesCountData } = useQuery<{
    total: number; books: number; music: number; recipes: number;
    movies: number; spots: number; art: number; quotes: number;
  }>({
    queryKey: ["/api/shares/count"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/shares/count");
      return r.json();
    },
    refetchInterval: 60_000,
    enabled: !!user,
  });
  const unreadSharesTotal = sharesCountData?.total ?? 0;
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!notifOpen) return;
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [notifOpen]);

  async function handleLogout() {
    await fetch("/api/logout", { method: "POST" });
    qc.clear();
    window.location.href = "/";
  }

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
                badge={tab.path === "/relationships" ? pendingFriendCount : undefined}
              />
            ))
          )}
        </nav>

        <div className="p-3 border-t space-y-1">
          {/* Notifications bell */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setNotifOpen(!notifOpen)}
              className={`sidebar-item w-full ${notifOpen ? "active" : ""}`}
            >
              <div className="relative shrink-0">
                <Bell size={15} />
                {unreadSharesTotal > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
                    {unreadSharesTotal > 9 ? "9+" : unreadSharesTotal}
                  </span>
                )}
              </div>
              <span>Notifications</span>
            </button>
            {notifOpen && (
              <div className="absolute bottom-full left-0 mb-2 w-72 bg-card border rounded-xl shadow-xl z-50 overflow-hidden">
                <div className="px-4 py-3 border-b">
                  <h3 className="font-semibold text-sm">Shared with you</h3>
                  {unreadSharesTotal === 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5">You're all caught up!</p>
                  )}
                </div>
                <div className="divide-y max-h-80 overflow-y-auto">
                  {[
                    { label: "Books", count: sharesCountData?.books ?? 0, path: "/reading?shared=1", emoji: "📚" },
                    { label: "Music", count: sharesCountData?.music ?? 0, path: "/music?shared=1", emoji: "🎵" },
                    { label: "Recipes", count: sharesCountData?.recipes ?? 0, path: "/recipes?shared=1", emoji: "🍽️" },
                    { label: "Movies & Shows", count: sharesCountData?.movies ?? 0, path: "/movies?shared=1", emoji: "🎬" },
                    { label: "Spots", count: sharesCountData?.spots ?? 0, path: "/spots?shared=1", emoji: "📍" },
                    { label: "Art", count: sharesCountData?.art ?? 0, path: "/art?shared=1", emoji: "🎨" },
                    { label: "Quotes", count: sharesCountData?.quotes ?? 0, path: "/quotes?shared=1", emoji: "💬" },
                    { label: "Workouts", count: sharesCountData?.workouts ?? 0, path: "/workouts?shared=1", emoji: "🏋️" },
                  ]
                    .filter((item) => item.count > 0)
                    .map((item) => (
                      <Link key={item.path} href={item.path}>
                        <div
                          onClick={() => setNotifOpen(false)}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/60 cursor-pointer transition-colors"
                        >
                          <span className="text-lg leading-none">{item.emoji}</span>
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium">{item.label}</span>
                            <p className="text-xs text-muted-foreground">
                              {item.count} new {item.count === 1 ? "item" : "items"}
                            </p>
                          </div>
                          <ChevronRight size={14} className="text-muted-foreground shrink-0" />
                        </div>
                      </Link>
                    ))}
                  {unreadSharesTotal === 0 && (
                    <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                      Nothing new to see here
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <button
            onClick={() => setManageMode(!manageMode)}
            className={`sidebar-item w-full ${manageMode ? "active" : ""}`}
          >
            <Settings size={15} />
            <span>{manageMode ? "Done" : "Manage tabs"}</span>
          </button>
          <NavLink path="/settings" label="Settings" icon={KeyRound} active={location === "/settings"} />
          <button onClick={toggle} className="sidebar-item w-full">
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
          </button>
          {user && (
            <div className="pt-2 mt-1 border-t">
              <div className="flex items-center gap-2 px-2 py-1.5 mb-1">
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt={user.name} className="w-6 h-6 rounded-full shrink-0" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold shrink-0">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="text-xs text-muted-foreground truncate">{user.name}</span>
              </div>
              <button onClick={handleLogout} className="sidebar-item w-full text-muted-foreground hover:text-destructive">
                <LogOut size={14} />
                <span>Sign out</span>
              </button>
            </div>
          )}
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
          <button
            onClick={() => setNotifOpen(!notifOpen)}
            className="relative p-2 rounded-lg hover:bg-secondary transition-colors"
          >
            <Bell size={16} />
            {unreadSharesTotal > 0 && (
              <span className="absolute top-0.5 right-0.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
                {unreadSharesTotal > 9 ? "9+" : unreadSharesTotal}
              </span>
            )}
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
                badge={tab.path === "/relationships" ? pendingFriendCount : undefined}
              />
            ))}
            <div className="border-t pt-2 mt-2 space-y-1">
              <button onClick={() => setManageMode(!manageMode)} className={`sidebar-item w-full ${manageMode ? "active" : ""}`}>
                <Settings size={15} /><span>{manageMode ? "Done" : "Manage tabs"}</span>
              </button>
              <NavLink path="/settings" label="Settings" icon={KeyRound} active={location === "/settings"} onClick={() => setMobileOpen(false)} />
              {user && (
                <button onClick={handleLogout} className="sidebar-item w-full text-muted-foreground">
                  <LogOut size={14} /><span>Sign out</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mobile notifications panel */}
      {notifOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-background/80 backdrop-blur-sm" onClick={() => setNotifOpen(false)}>
          <div className="absolute right-4 top-16 w-72 bg-card border rounded-xl shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <h3 className="font-semibold text-sm">Shared with you</h3>
              <button onClick={() => setNotifOpen(false)} className="p-1 rounded hover:bg-secondary transition-colors">
                <X size={14} />
              </button>
            </div>
            <div className="divide-y max-h-80 overflow-y-auto">
              {[
                { label: "Books", count: sharesCountData?.books ?? 0, path: "/reading?shared=1", emoji: "📚" },
                { label: "Music", count: sharesCountData?.music ?? 0, path: "/music?shared=1", emoji: "🎵" },
                { label: "Recipes", count: sharesCountData?.recipes ?? 0, path: "/recipes?shared=1", emoji: "🍽️" },
                { label: "Movies & Shows", count: sharesCountData?.movies ?? 0, path: "/movies?shared=1", emoji: "🎬" },
                { label: "Spots", count: sharesCountData?.spots ?? 0, path: "/spots?shared=1", emoji: "📍" },
                { label: "Art", count: sharesCountData?.art ?? 0, path: "/art?shared=1", emoji: "🎨" },
                { label: "Quotes", count: sharesCountData?.quotes ?? 0, path: "/quotes?shared=1", emoji: "💬" },
                { label: "Workouts", count: sharesCountData?.workouts ?? 0, path: "/workouts?shared=1", emoji: "🏋️" },
              ]
                .filter((item) => item.count > 0)
                .map((item) => (
                  <Link key={item.path} href={item.path}>
                    <div
                      onClick={() => setNotifOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/60 cursor-pointer transition-colors"
                    >
                      <span className="text-lg leading-none">{item.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium">{item.label}</span>
                        <p className="text-xs text-muted-foreground">
                          {item.count} new {item.count === 1 ? "item" : "items"}
                        </p>
                      </div>
                      <ChevronRight size={14} className="text-muted-foreground shrink-0" />
                    </div>
                  </Link>
                ))}
              {unreadSharesTotal === 0 && (
                <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                  Nothing new to see here
                </div>
              )}
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
