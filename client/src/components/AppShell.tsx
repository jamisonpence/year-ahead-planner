import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useTheme } from "@/components/ThemeProvider";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { NavPref } from "@shared/schema";
import { useAuth } from "@/hooks/useAuth";
import GetStartedWidget from "@/components/GetStartedWidget";
import QuickAddModal from "@/components/QuickAddModal";
import CommandPalette from "@/components/CommandPalette";
import { syncPushSubscription } from "@/lib/push";
import {
  LayoutDashboard, Calendar, Target, Library, Dumbbell,
  Users, ChefHat, UtensilsCrossed, Sun, Moon, X, Film, Wallet, Music2, Home, MapPin, Plane,
  Eye, EyeOff, GripVertical, Settings, LogOut, Baby, Palette, KeyRound,
  Bell, ChevronRight, Sparkles, Flame, Activity, Landmark, Lock,
  Search, Plus, MessageSquare, PenLine, CalendarCheck, ClipboardList, Archive,
  History, BookOpen, Quote,
} from "lucide-react";

// ── Per-tab custom "shared" descriptions ─────────────────────────────────────
const TAB_SHARED_DESCRIPTIONS: Record<string, string> = {
  "/":              "Your Today summary is visible to friends",
  "/calendar":      "Your schedule events are visible to friends",
  "/goals":         "Your goals are visible to friends",
  "/tasks":         "Your projects and tasks are visible to friends",
  "/reading":       "Your reading list and progress are visible to friends",
  "/workouts":      "Your workouts and fitness logs are visible to friends",
  "/recipes":       "Your saved recipes are visible to friends",
  "/movies":        "Your movies and shows list is visible to friends",
  "/music":         "Your music collection is visible to friends",
  "/budget":        "Your budget overview is visible to friends",
  "/plants":        "Your plant collection is visible to friends",
  "/housekeeping":  "Your housekeeping lists are visible to friends",
  "/spots":         "Your saved spots are visible to friends",
  "/travel":        "Your trips and travel plans are visible to friends",
  "/kids":          "Your kids section is visible to friends",
  "/quotes":        "Your saved quotes are visible to friends",
  "/art":           "Your art collection is visible to friends",
  "/hobbies":       "Your hobbies are visible to friends",
  "/beliefs":       "Your Faith and Civic Life content is visible to friends (Prayer List is always private)",
  "/faith":         "Sacred Texts, Practices, and Teachings are visible to friends (Prayer List is always private)",
  "/politics":      "Your political notes are visible to friends",
};

const PRIVACY_PATHS = new Set(Object.keys(TAB_SHARED_DESCRIPTIONS));

// ── Notification feed (persistent, itemized) ─────────────────────────────────
type NotificationItem = {
  id: number; type: string; title: string; body: string | null;
  href: string | null; isRead: boolean; createdAt: string;
  actor: { id: number; name: string; avatarUrl: string | null } | null;
};

const NOTIF_EMOJI: Record<string, string> = {
  friend_request: "👋", recommendation: "⭐", share: "🎁",
  comment: "💬", reaction: "❤️", daily_digest: "☀️", system: "🔔",
};

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function NotificationFeed({ onNavigate }: { onNavigate: () => void }) {
  const qc = useQueryClient();
  const { data: notifs = [] } = useQuery<NotificationItem[]>({
    queryKey: ["/api/notifications"],
    queryFn: () => apiRequest("GET", "/api/notifications?limit=15").then(r => r.json()),
  });

  // Opening the feed marks everything read
  useEffect(() => {
    apiRequest("POST", "/api/notifications/mark-read")
      .then(() => qc.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] }))
      .catch(() => {});
  }, [qc]);

  if (notifs.length === 0) return null;
  return (
    <>
      <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider px-4 pt-3 pb-1">Recent</p>
      {notifs.map((n) => {
        const inner = (
          <div onClick={onNavigate}
            className={`flex items-start gap-3 px-4 py-2.5 hover:bg-secondary/60 cursor-pointer transition-colors ${n.isRead ? "" : "bg-primary/5"}`}>
            {n.actor?.avatarUrl ? (
              <img src={n.actor.avatarUrl} alt="" className="w-7 h-7 rounded-full shrink-0 mt-0.5" />
            ) : (
              <span className="text-lg leading-none mt-0.5">{NOTIF_EMOJI[n.type] ?? "🔔"}</span>
            )}
            <div className="flex-1 min-w-0">
              <p className={`text-xs leading-snug ${n.isRead ? "" : "font-medium"}`}>{n.title}</p>
              {n.body && <p className="text-[11px] text-muted-foreground truncate">{n.body}</p>}
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">{timeAgo(n.createdAt)}</p>
            </div>
            {!n.isRead && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" />}
          </div>
        );
        return n.href
          ? <Link key={n.id} href={n.href}>{inner}</Link>
          : <div key={n.id}>{inner}</div>;
      })}
    </>
  );
}

function PrivacyBanner({ path }: { path: string }) {
  const { data: settings = [] } = useQuery<{ path: string; visibility: string }[]>({
    queryKey: ["/api/tab-privacy"],
    queryFn: () => apiRequest("GET", "/api/tab-privacy").then(r => r.json()),
  });

  if (!PRIVACY_PATHS.has(path)) return null;

  const visibility = settings.find(s => s.path === path)?.visibility ?? "private";
  const isPublic = visibility === "friends";

  return (
    <div className={`mx-4 md:mx-6 mt-4 flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-xs border ${
      isPublic
        ? "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300"
        : "bg-stone-100 dark:bg-stone-800/60 border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400"
    }`}>
      <div className="flex items-center gap-1.5">
        {isPublic
          ? <Users size={12} className="shrink-0" />
          : <Lock size={12} className="shrink-0" />}
        <span>
          {isPublic
            ? TAB_SHARED_DESCRIPTIONS[path]
            : "Private — only visible to you"}
        </span>
      </div>
      <Link href="/settings">
        <a className="flex items-center gap-1 font-medium hover:underline shrink-0 whitespace-nowrap">
          <Settings size={11} />
          Change in Settings
        </a>
      </Link>
    </div>
  );
}

const ALL_TABS: { path: string; label: string; icon: React.ElementType; beta?: boolean; matchPaths?: string[] }[] = [
  // ── Top-level ──
  { path: "/dashboard",     label: "Today",                   icon: LayoutDashboard },
  { path: "/messenger",     label: "Messages",                icon: MessageSquare   },
  // ── Plan ──
  { path: "/calendar",      label: "Calendar",                icon: Calendar        },
  { path: "/goals",         label: "Goals",                   icon: Target          },
  { path: "/tasks",         label: "Tasks",                   icon: ClipboardList   },
  { path: "/habits",        label: "Habits",                  icon: CalendarCheck   },
  { path: "/journal",       label: "Journal",                 icon: PenLine         },
  { path: "/review",        label: "Review",                  icon: History         },
  // ── People ──
  { path: "/people",        label: "People",                  icon: Users,          matchPaths: ["/relationships", "/kids", "/discover"] },
  // ── Repository ──
  { path: "/mylifos",       label: "Library",                 icon: Archive         },
  // ── Wellness ──
  { path: "/health",        label: "Health",                  icon: Activity,       matchPaths: ["/workouts", "/nutrition", "/recipes"] },
  // ── Culture ──
  { path: "/library",       label: "Media",                   icon: Library,        matchPaths: ["/reading", "/movies", "/music", "/art"] },
  { path: "/quotes",        label: "Quotes",                  icon: Quote           },
  { path: "/hobbies",       label: "Interests",               icon: Sparkles        },
  // ── Places ──
  { path: "/places",        label: "Places & Trips",          icon: MapPin,         matchPaths: ["/spots", "/travel"] },
  // ── Home ──
  { path: "/budget",        label: "Finance",                 icon: Wallet          },
  { path: "/housekeeping",  label: "Home",                    icon: Home            },
  // ── Beliefs ──
  { path: "/beliefs",       label: "Beliefs",                 icon: Flame,          matchPaths: ["/faith", "/politics"] },
];

// ── Desktop sidebar groupings ─────────────────────────────────────────────────
const SIDEBAR_GROUPS: { key: string; label: string | null; paths: string[] }[] = [
  { key: "today",     label: null,                paths: ["/dashboard"] },
  { key: "do",        label: "Do",                paths: ["/calendar", "/tasks", "/habits"] },
  { key: "plan",      label: "Plan",              paths: ["/goals", "/journal"] },
  { key: "people",    label: "People",            paths: ["/people"] },
  { key: "mylifos",   label: "Library",           paths: ["/mylifos", "/library", "/quotes", "/hobbies", "/health", "/places", "/housekeeping", "/budget", "/beliefs"] },
  { key: "messages",  label: null,                paths: ["/messenger"] },
];

const PLAN_PATHS = ["/calendar", "/goals", "/tasks", "/habits", "/journal", "/review"];
const PEOPLE_PATHS = ["/people", "/relationships", "/kids", "/discover"];
const MYLIFOS_PATHS = ["/mylifos", "/library", "/reading", "/movies", "/music", "/art", "/hobbies", "/health", "/workouts", "/nutrition", "/recipes", "/places", "/spots", "/travel", "/housekeeping", "/budget", "/beliefs", "/faith", "/politics", "/plants", "/quotes"];

function basePath(path: string) {
  return path.split("?")[0];
}

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
  // Beta tabs default to hidden unless the user has explicitly saved a pref for them.
  const prefs: NavPref[] = ALL_TABS.map((tab) => {
    const saved = savedPrefs.find((p) => p.path === tab.path);
    return { path: tab.path, hidden: saved?.hidden ?? tab.beta ?? false };
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

function NavLink({ path, label, icon: Icon, active, onClick, badge, beta }: {
  path: string; label: string; icon: React.ElementType;
  active: boolean; onClick?: () => void; badge?: number; beta?: boolean;
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
        <span className="flex-1">{label}</span>
        {beta && <BetaBadge />}
      </div>
    </Link>
  );
}

function BetaBadge() {
  return (
    <span className="text-[9px] font-bold uppercase tracking-wide bg-violet-500/15 text-violet-600 dark:text-violet-400 px-1.5 py-0.5 rounded-full leading-none">
      Beta
    </span>
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
      {tab.beta && <BetaBadge />}
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

// ── My Lifos sheet ────────────────────────────────────────────────────────────

interface UserSummary {
  totalItems: number;
  friendsCount: number;
  recommendationsSent: number;
  counts: Record<string, number>;
}

// Default visibility per path when no stored setting exists
const PATH_DEFAULT_VISIBILITY: Record<string, "friends" | "private"> = {
  "/reading":       "friends",
  "/movies":        "friends",
  "/music":         "friends",
  "/recipes":       "friends",
  "/spots":         "friends",
  "/quotes":        "friends",
  "/art":           "friends",
  "/hobbies":       "friends",
  "/workouts":      "friends",
  "/plants":        "friends",
  "/health":        "private",
  "/nutrition":     "private",
  "/goals":         "private",
  "/tasks":         "private",
  "/calendar":      "private",
  "/budget":        "private",
  "/relationships": "private",
  "/housekeeping":  "private",
  "/kids":          "private",
  "/journal":       "private",
  "/habits":        "private",
  "/faith":         "private",
  "/politics":      "private",
};

const SECTION_KEY: Record<string, string> = {
  "/reading":       "reading",
  "/movies":        "movies",
  "/music":         "music",
  "/recipes":       "recipes",
  "/spots":         "spots",
  "/events":        "events",
  "/quotes":        "quotes",
  "/art":           "art",
  "/hobbies":       "hobbies",
  "/workouts":      "workouts",
  "/plants":        "plants",
  "/health":        "health",
  "/nutrition":     "nutrition",
  "/goals":         "goals",
  "/tasks":         "goals",
  "/calendar":      "calendar",
  "/budget":        "budget",
  "/relationships": "relationships",
  "/housekeeping":  "housekeeping",
  "/kids":          "kids",
  "/journal":       "journal",
  "/habits":        "habits",
  "/faith":         "faith",
  "/politics":      "politics",
};

const COLLECTION_GROUPS = [
  {
    key: "library",
    label: "Media",
    subtitle: "Books, watching, music, and art",
    tiles: [
      { path: "/library",              emoji: "📚", label: "Books"    },
      { path: "/library?tab=watching", emoji: "🎬", label: "Watching" },
      { path: "/library?tab=music",    emoji: "🎵", label: "Music"    },
      { path: "/library?tab=art",      emoji: "🎨", label: "Art"      },
    ],
  },
  {
    key: "interests",
    label: "Interests & Places",
    subtitle: "Hobbies, saved places, and trips",
    tiles: [
      { path: "/hobbies",              emoji: "✨", label: "Interests" },
      { path: "/places",          emoji: "📍", label: "Places" },
      { path: "/places?tab=trips", emoji: "✈️", label: "Trips"  },
    ],
  },
  {
    key: "health",
    label: "Health",
    subtitle: "Fitness, nutrition, vitals, and recipes",
    tiles: [
      { path: "/health",              emoji: "💪", label: "Fitness"  },
      { path: "/health?tab=nutrition",emoji: "🥗", label: "Nutrition" },
      { path: "/health?tab=vitals",   emoji: "❤️", label: "Vitals"   },
      { path: "/health?tab=recipes",  emoji: "🍽️", label: "Recipes"  },
    ],
  },
  {
    key: "home",
    label: "Home",
    subtitle: "Budget and household",
    tiles: [
      { path: "/budget",       emoji: "💰", label: "Finance"       },
      { path: "/housekeeping", emoji: "🏠", label: "Home" },
    ],
  },
  {
    key: "keepsakes",
    label: "Values & Keepsakes",
    subtitle: "Faith, civic life, plants, and quotes",
    tiles: [
      { path: "/faith",    emoji: "🕊️", label: "Faith"          },
      { path: "/politics", emoji: "🏛️", label: "Politics & Civic" },
      { path: "/plants",   emoji: "🌿", label: "Plants" },
      { path: "/quotes",   emoji: "💬", label: "Quotes" },
    ],
  },
];

function MyLifosSheet({
  user,
  privacySettings,
  onClose,
  onLogout,
  onToggleTheme,
  theme,
  location,
}: {
  user: any;
  privacySettings: { path: string; visibility: string }[];
  onClose: () => void;
  onLogout: () => void;
  onToggleTheme: () => void;
  theme: string;
  location: string;
}) {
  const { data: summary } = useQuery<UserSummary>({
    queryKey: ["/api/user/summary"],
    queryFn: () => apiRequest("GET", "/api/user/summary").then(r => r.json()),
    enabled: !!user,
    staleTime: 30_000,
  });

  function getVisibility(path: string): "friends" | "private" {
    const stored = privacySettings.find(s => s.path === path)?.visibility;
    if (stored) return stored as "friends" | "private";
    return PATH_DEFAULT_VISIBILITY[path] ?? "private";
  }

  const handle = user?.email ? "@" + user.email.split("@")[0] : "";

  return (
    <div className="lg:hidden fixed inset-0 z-[60] bg-background/90 backdrop-blur-sm" onClick={onClose}>
      <div
        className="absolute bottom-0 left-0 right-0 bg-card rounded-t-3xl shadow-2xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>

        <div className="overflow-y-auto flex-1">
          {/* ── Profile hero ────────────────────────────────────────────── */}
          <div className="px-5 pt-3 pb-5">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                {user?.avatarUrl
                  ? <img src={user.avatarUrl} alt={user.name} className="w-16 h-16 rounded-full ring-2 ring-violet-400/40" />
                  : <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-2xl font-bold text-white">
                      {user?.name?.charAt(0) ?? "?"}
                    </div>
                }
                <div>
                  <p className="font-bold text-base leading-tight">{user?.name}</p>
                  <p className="text-xs text-muted-foreground">{handle}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link href="/settings">
                  <button onClick={onClose} className="text-xs border rounded-xl px-3 py-1.5 hover:bg-secondary transition-colors font-medium">
                    Edit Profile
                  </button>
                </Link>
                <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Items Saved", value: summary?.totalItems ?? "—" },
                { label: "Friends",     value: summary?.friendsCount ?? "—" },
                { label: "Recs Sent",   value: summary?.recommendationsSent ?? "—" },
              ].map(stat => (
                <div key={stat.label} className="bg-secondary/50 rounded-2xl p-3 text-center">
                  <p className="text-lg font-bold leading-none">{stat.value}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Privacy legend ───────────────────────────────────────────── */}
          <div className="px-5 mb-4 flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-violet-500 inline-block" />
              Visible to friends
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock size={11} className="text-muted-foreground" />
              Private
            </div>
          </div>

          {/* ── Collection groups ────────────────────────────────────────── */}
          <div className="px-5 space-y-6 pb-6">
            {COLLECTION_GROUPS.map(group => (
              <div key={group.key}>
                <div className="mb-2">
                  <h3 className="text-sm font-semibold">{group.label}</h3>
                  <p className="text-[11px] text-muted-foreground">{group.subtitle}</p>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {group.tiles.map(tile => {
                    const pathKey = basePath(tile.path);
                    const vis = getVisibility(pathKey);
                    const count = summary?.counts[SECTION_KEY[pathKey]] ?? 0;
                    const isActive = location === pathKey;
                    return (
                      <Link key={tile.path} href={tile.path}>
                        <button
                          onClick={onClose}
                          className={`relative w-full flex flex-col items-center gap-1 py-3 px-1 rounded-2xl border transition-colors
                            ${isActive
                              ? "bg-violet-500/10 border-violet-400/40"
                              : "bg-secondary/40 border-transparent hover:bg-secondary/80"
                            }`}
                        >
                          {/* Privacy indicator — only for sections that have privacy settings */}
                          {PRIVACY_PATHS.has(pathKey) && (
                            <div className="absolute top-1.5 right-1.5">
                              {vis === "friends"
                                ? <span className="w-2 h-2 rounded-full bg-violet-500 block" />
                                : <Lock size={8} className="text-muted-foreground/60" />
                              }
                            </div>
                          )}
                          <span className="text-xl leading-none">{tile.emoji}</span>
                          <span className="text-[10px] font-medium text-center leading-tight">{tile.label}</span>
                          <span className="text-[10px] text-muted-foreground">{count > 0 ? count : ""}</span>
                        </button>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div className="px-5 py-4 border-t flex gap-2 bg-card">
          <button onClick={onToggleTheme} className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border text-sm text-muted-foreground hover:bg-secondary transition-colors shrink-0">
            {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
            {theme === "dark" ? "Light" : "Dark"}
          </button>
          <button onClick={onLogout} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm text-muted-foreground hover:bg-secondary transition-colors">
            <LogOut size={14} />Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main shell ────────────────────────────────────────────────────────────────

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { theme, toggle } = useTheme();
  const [manageMode, setManageMode] = useState(false);
  const [myLifosOpen, setMyLifosOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const { prefs, save } = useNavPrefs();
  const { user } = useAuth();
  const qc = useQueryClient();

  // Close all overlay sheets whenever the route changes
  useEffect(() => {
    setMyLifosOpen(false);
    setQuickAddOpen(false);
  }, [location]);

  // Privacy settings (used by My Lifos sheet)
  const { data: privacySettings = [] } = useQuery<{ path: string; visibility: string }[]>({
    queryKey: ["/api/tab-privacy"],
    queryFn: () => apiRequest("GET", "/api/tab-privacy").then(r => r.json()),
    enabled: !!user,
  });

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

  // Pending collaboration requests
  const { data: collabCountData } = useQuery<{ count: number }>({
    queryKey: ["/api/tab-collaborations/pending-count"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/tab-collaborations/pending-count");
      return r.json();
    },
    refetchInterval: 60_000,
    enabled: !!user,
  });
  const pendingCollabCount = collabCountData?.count ?? 0;

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

  // Unread persistent notifications
  const { data: notifCountData } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    queryFn: async () => (await apiRequest("GET", "/api/notifications/unread-count")).json(),
    refetchInterval: 60_000,
    enabled: !!user,
  });
  const unreadNotifCount = notifCountData?.count ?? 0;
  const totalNotifCount = unreadSharesTotal + pendingFriendCount + pendingCollabCount + unreadNotifCount;

  // Unread messenger count
  const { data: messengerCountData } = useQuery<{ count: number }>({
    queryKey: ["/api/messenger/unread-count"],
    queryFn: async () => (await apiRequest("GET", "/api/messenger/unread-count")).json(),
    refetchInterval: 15_000,
    enabled: !!user,
  });
  const unreadMessengerCount = messengerCountData?.count ?? 0;
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  // Keep this device's push subscription registered with the server
  useEffect(() => { syncPushSubscription(); }, []);

  // Global search palette (Cmd/Ctrl+K)
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
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
      <aside className="hidden lg:flex flex-col w-60 shrink-0 border-r bg-card h-screen sticky top-0">
        <div className="p-4 border-b space-y-3">
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
            <span className="font-bold text-sm tracking-tight">Library</span>
          </div>
          <button
            onClick={() => setQuickAddOpen(true)}
            className="w-full flex items-center justify-center gap-1.5 bg-primary text-primary-foreground rounded-lg py-2 text-xs font-semibold hover:bg-primary/90 transition-colors"
          >
            <Plus size={13} />
            Quick Add
          </button>
          <button
            onClick={() => setSearchOpen(true)}
            className="w-full flex items-center gap-2 border rounded-lg py-2 px-3 text-xs text-muted-foreground hover:bg-secondary/60 transition-colors"
          >
            <Search size={13} />
            <span className="flex-1 text-left">Search…</span>
            <kbd className="text-[9px] font-mono border rounded px-1 py-0.5 bg-secondary/60">⌘K</kbd>
          </button>
        </div>

        <nav className="flex-1 p-3 overflow-y-auto">
          {manageMode ? (
            <div className="space-y-1">
              {localPrefs.map((pref, i) => {
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
              })}
            </div>
          ) : (
            <div>
              {SIDEBAR_GROUPS.map(group => {
                const groupTabs = visibleTabs.filter(t => group.paths.includes(t.path));
                if (groupTabs.length === 0) return null;
                return (
                  <div key={group.key} className={group.label ? "mt-4" : ""}>
                    {group.label && (
                      <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider px-2 pb-1">
                        {group.label}
                      </p>
                    )}
                    <div className="space-y-0.5">
                      {groupTabs.map((tab) => (
                        <NavLink
                          key={tab.path}
                          path={tab.path}
                          label={tab.label}
                          icon={tab.icon}
                          active={location === tab.path || (tab.path === "/dashboard" && location === "/") || (tab.matchPaths?.includes(location) ?? false)}
                          badge={tab.path === "/people" ? pendingFriendCount : tab.path === "/messenger" ? unreadMessengerCount : undefined}
                          beta={tab.beta}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </nav>

        <div className="p-3 border-t space-y-1">
          <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider px-2 pb-1">System</p>
          {/* Notifications bell */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setNotifOpen(!notifOpen)}
              className={`sidebar-item w-full ${notifOpen ? "active" : ""}`}
            >
              <div className="relative shrink-0">
                <Bell size={15} />
                {totalNotifCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
                    {totalNotifCount > 9 ? "9+" : totalNotifCount}
                  </span>
                )}
              </div>
              <span>Notifications</span>
            </button>
            {notifOpen && (
              <div className="absolute bottom-full left-0 mb-2 w-72 bg-card border rounded-xl shadow-xl z-50 overflow-hidden">
                <div className="px-4 py-3 border-b">
                  <h3 className="font-semibold text-sm">Notifications</h3>
                  {totalNotifCount === 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5">You're all caught up!</p>
                  )}
                </div>
                <div className="divide-y max-h-80 overflow-y-auto">
                  {/* Friend requests */}
                  {pendingFriendCount > 0 && (
                    <Link href="/people">
                      <div onClick={() => setNotifOpen(false)}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/60 cursor-pointer transition-colors">
                        <span className="text-lg leading-none">👋</span>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium">Friend Requests</span>
                          <p className="text-xs text-muted-foreground">
                            {pendingFriendCount} pending {pendingFriendCount === 1 ? "request" : "requests"}
                          </p>
                        </div>
                        <span className="min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none shrink-0">
                          {pendingFriendCount}
                        </span>
                      </div>
                    </Link>
                  )}
                  {/* Collaboration requests */}
                  {pendingCollabCount > 0 && (
                    <Link href="/settings">
                      <div onClick={() => setNotifOpen(false)}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/60 cursor-pointer transition-colors">
                        <span className="text-lg leading-none">🤝</span>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium">Collaboration Requests</span>
                          <p className="text-xs text-muted-foreground">
                            {pendingCollabCount} pending {pendingCollabCount === 1 ? "invite" : "invites"} — Family or Home
                          </p>
                        </div>
                        <span className="min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none shrink-0">
                          {pendingCollabCount}
                        </span>
                      </div>
                    </Link>
                  )}
                  {/* Shared items */}
                  {[
                    { label: "Books", count: sharesCountData?.books ?? 0, path: "/reading?shared=1", emoji: "📚" },
                    { label: "Music", count: sharesCountData?.music ?? 0, path: "/music?shared=1", emoji: "🎵" },
                    { label: "Recipes", count: sharesCountData?.recipes ?? 0, path: "/health?tab=recipes&shared=1", emoji: "🍽️" },
                    { label: "Movies & Shows", count: sharesCountData?.movies ?? 0, path: "/movies?shared=1", emoji: "🎬" },
                    { label: "Places", count: sharesCountData?.spots ?? 0, path: "/spots?shared=1", emoji: "📍" },
                    { label: "Art", count: sharesCountData?.art ?? 0, path: "/art?shared=1", emoji: "🎨" },
                    { label: "Quotes", count: sharesCountData?.quotes ?? 0, path: "/quotes?shared=1", emoji: "💬" },
                    { label: "Workouts", count: sharesCountData?.workouts ?? 0, path: "/health?shared=1", emoji: "🏋️" },
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
                  <NotificationFeed onNavigate={() => setNotifOpen(false)} />
                  {totalNotifCount === 0 && (
                    <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                      Nothing new to see here
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <GetStartedWidget />
          <div className="border-t my-1" />
          <button
            onClick={() => setManageMode(!manageMode)}
            className={`sidebar-item w-full ${manageMode ? "active" : ""}`}
          >
            <Settings size={15} />
            <span>{manageMode ? "Done" : "Customize Sidebar"}</span>
          </button>
          <NavLink path="/settings" label="Settings" icon={KeyRound} active={location === "/settings"} />
          <button onClick={toggle} className="sidebar-item w-full">
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
          </button>
          {user && (
            <div className="mt-1 pt-2 border-t">
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-secondary/60 transition-colors group">
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt={user.name} className="w-6 h-6 rounded-full shrink-0" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold shrink-0">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="text-xs text-muted-foreground truncate flex-1">{user.name}</span>
                <button
                  onClick={handleLogout}
                  title="Sign out"
                  className="p-1 rounded hover:bg-secondary hover:text-destructive transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                >
                  <LogOut size={13} className="text-muted-foreground" />
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-[70] bg-card border-b h-14 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <svg aria-label="Planner" viewBox="0 0 32 32" width="22" height="22" fill="none">
            <rect x="2" y="6" width="28" height="24" rx="4" stroke="currentColor" strokeWidth="2" />
            <path d="M2 12h28" stroke="currentColor" strokeWidth="2" />
          </svg>
          <span className="font-bold text-sm">Library</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setQuickAddOpen(true)}
            aria-label="Quick Add"
            className="p-2.5 rounded-lg hover:bg-secondary transition-colors"
          >
            <Plus size={16} />
          </button>
          <button
            onClick={() => setSearchOpen(true)}
            aria-label="Search"
            className="p-2.5 rounded-lg hover:bg-secondary transition-colors"
          >
            <Search size={16} />
          </button>
          <button
            onClick={() => setNotifOpen(!notifOpen)}
            aria-label="Notifications"
            className="relative p-2.5 rounded-lg hover:bg-secondary transition-colors"
          >
            <Bell size={16} />
            {totalNotifCount > 0 && (
              <span className="absolute top-0.5 right-0.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
                {totalNotifCount > 9 ? "9+" : totalNotifCount}
              </span>
            )}
          </button>
          <Link href="/settings">
            <button aria-label="Settings" className="p-2.5 rounded-lg hover:bg-secondary transition-colors">
              <Settings size={16} />
            </button>
          </Link>
        </div>
      </div>

      {/* ── Mobile 5-tab bottom nav bar ──────────────────────────────────────── */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-[70] bg-card border-t">
        <div className="flex items-end justify-around px-1 pt-2 pb-3">
          {/* Today */}
          <Link href="/dashboard">
            <button className="flex flex-col items-center gap-0.5 min-w-[56px] py-1">
              <LayoutDashboard size={22} className={(location === "/dashboard" || location === "/") && !myLifosOpen ? "text-violet-500" : "text-muted-foreground"} />
              <span className={`text-[10px] font-medium ${(location === "/dashboard" || location === "/") && !myLifosOpen ? "text-violet-500" : "text-muted-foreground"}`}>Today</span>
            </button>
          </Link>

          {/* Plan */}
          <Link href="/goals">
            <button className="flex flex-col items-center gap-0.5 min-w-[56px] py-1">
              <Target size={22} className={PLAN_PATHS.includes(location) && !myLifosOpen ? "text-violet-500" : "text-muted-foreground"} />
              <span className={`text-[10px] font-medium ${PLAN_PATHS.includes(location) && !myLifosOpen ? "text-violet-500" : "text-muted-foreground"}`}>Plan</span>
            </button>
          </Link>

          {/* MyLifos */}
          <Link href="/mylifos">
            <button
              onClick={() => setMyLifosOpen(false)}
              className="flex flex-col items-center gap-0.5 min-w-[56px] py-1"
            >
              <Archive size={22} className={(MYLIFOS_PATHS.includes(location)) && !myLifosOpen ? "text-violet-500" : "text-muted-foreground"} />
              <span className={`text-[10px] font-medium ${(MYLIFOS_PATHS.includes(location)) && !myLifosOpen ? "text-violet-500" : "text-muted-foreground"}`}>Library</span>
            </button>
          </Link>

          {/* People */}
          <Link href="/people">
            <button className="flex flex-col items-center gap-0.5 min-w-[56px] py-1">
              <Users size={22} className={PEOPLE_PATHS.includes(location) && !myLifosOpen ? "text-violet-500" : "text-muted-foreground"} />
              <span className={`text-[10px] font-medium ${PEOPLE_PATHS.includes(location) && !myLifosOpen ? "text-violet-500" : "text-muted-foreground"}`}>People</span>
            </button>
          </Link>

          {/* Messages — with unread badge */}
          <Link href="/messenger">
            <button className="relative flex flex-col items-center gap-0.5 min-w-[56px] py-1">
              <div className="relative">
                <MessageSquare size={22} className={location === "/messenger" && !myLifosOpen ? "text-violet-500" : "text-muted-foreground"} />
                {unreadMessengerCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-card" />
                )}
              </div>
              <span className={`text-[10px] font-medium ${location === "/messenger" && !myLifosOpen ? "text-violet-500" : "text-muted-foreground"}`}>Messages</span>
            </button>
          </Link>
        </div>
      </div>

{/* ── My Lifos sheet ───────────────────────────────────────────────────── */}
      {myLifosOpen && <MyLifosSheet
        user={user}
        privacySettings={privacySettings}
        onClose={() => setMyLifosOpen(false)}
        onLogout={handleLogout}
        onToggleTheme={toggle}
        theme={theme}
        location={location}
      />}

      {/* ── Quick-add modal ──────────────────────────────────────────────────── */}
      <QuickAddModal open={quickAddOpen} onClose={() => setQuickAddOpen(false)} />

      {/* ── Global search palette (Cmd/Ctrl+K) ──────────────────────────────── */}
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />

      {/* Mobile notifications panel */}
      {notifOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" onClick={() => setNotifOpen(false)}>
          <div className="absolute right-4 top-16 w-72 bg-card border rounded-xl shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <h3 className="font-semibold text-sm">Notifications</h3>
              <button onClick={() => setNotifOpen(false)} className="p-1 rounded hover:bg-secondary transition-colors">
                <X size={14} />
              </button>
            </div>
            <div className="divide-y max-h-80 overflow-y-auto">
              {/* Friend requests */}
              {pendingFriendCount > 0 && (
                <Link href="/people">
                  <div onClick={() => setNotifOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/60 cursor-pointer transition-colors">
                    <span className="text-lg leading-none">👋</span>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">Friend Requests</span>
                      <p className="text-xs text-muted-foreground">
                        {pendingFriendCount} pending {pendingFriendCount === 1 ? "request" : "requests"}
                      </p>
                    </div>
                    <span className="min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none shrink-0">
                      {pendingFriendCount}
                    </span>
                  </div>
                </Link>
              )}
              {/* Collaboration requests */}
              {pendingCollabCount > 0 && (
                <Link href="/settings">
                  <div onClick={() => setNotifOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/60 cursor-pointer transition-colors">
                    <span className="text-lg leading-none">🤝</span>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">Collaboration Requests</span>
                      <p className="text-xs text-muted-foreground">
                        {pendingCollabCount} pending {pendingCollabCount === 1 ? "invite" : "invites"} — Family or Home
                      </p>
                    </div>
                    <span className="min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none shrink-0">
                      {pendingCollabCount}
                    </span>
                  </div>
                </Link>
              )}
              {/* Shared items */}
              {[
                { label: "Books", count: sharesCountData?.books ?? 0, path: "/reading?shared=1", emoji: "📚" },
                { label: "Music", count: sharesCountData?.music ?? 0, path: "/music?shared=1", emoji: "🎵" },
                { label: "Recipes", count: sharesCountData?.recipes ?? 0, path: "/health?tab=recipes&shared=1", emoji: "🍽️" },
                { label: "Movies & Shows", count: sharesCountData?.movies ?? 0, path: "/movies?shared=1", emoji: "🎬" },
                { label: "Places", count: sharesCountData?.spots ?? 0, path: "/spots?shared=1", emoji: "📍" },
                { label: "Art", count: sharesCountData?.art ?? 0, path: "/art?shared=1", emoji: "🎨" },
                { label: "Quotes", count: sharesCountData?.quotes ?? 0, path: "/quotes?shared=1", emoji: "💬" },
                { label: "Workouts", count: sharesCountData?.workouts ?? 0, path: "/health?shared=1", emoji: "🏋️" },
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
              <NotificationFeed onNavigate={() => setNotifOpen(false)} />
              {totalNotifCount === 0 && (
                <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                  Nothing new to see here
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Page content */}
      <main className="flex-1 min-w-0 lg:pt-0 pt-14 lg:pb-0 pb-24">
        <PrivacyBanner path={location} />
        {children}
      </main>
    </div>
  );
}
