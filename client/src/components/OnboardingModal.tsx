import { useState, useCallback } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  LayoutDashboard, Calendar, Target, BookOpen, Dumbbell,
  Users, ChefHat, Film, Wallet, Leaf, Music2, Home, MapPin, Plane,
  Baby, Quote, Palette, Sparkles, Flame, Activity, Landmark,
  Search, Check, Clock, UserPlus, ArrowRight, X,
} from "lucide-react";

// ── Tab definitions (mirror AppShell's ALL_TABS) ──────────────────────────────

const ALL_TABS = [
  { path: "/",              label: "Dashboard",               icon: LayoutDashboard, emoji: "🏠" },
  { path: "/calendar",      label: "Calendar",                icon: Calendar,        emoji: "📅" },
  { path: "/goals",         label: "Goals",                   icon: Target,          emoji: "🎯" },
  { path: "/habits",        label: "Habits",                  icon: Check,           emoji: "✅" },
  { path: "/journal",       label: "Journal",                 icon: BookOpen,        emoji: "📖" },
  { path: "/relationships", label: "Friends",                 icon: Users,           emoji: "👥" },
  { path: "/kids",          label: "Family",                  icon: Baby,            emoji: "👨‍👩‍👧" },
  { path: "/workouts",      label: "Workouts",                icon: Dumbbell,        emoji: "🏋️" },
  { path: "/health",        label: "Health",                  icon: Activity,        emoji: "❤️" },
  { path: "/reading",       label: "Reading",                 icon: BookOpen,        emoji: "📚" },
  { path: "/recipes",       label: "Recipes",                 icon: ChefHat,         emoji: "🍽️" },
  { path: "/movies",        label: "Movies & Shows",          icon: Film,            emoji: "🎬" },
  { path: "/music",         label: "Music",                   icon: Music2,          emoji: "🎵" },
  { path: "/art",           label: "Art",                     icon: Palette,         emoji: "🎨" },
  { path: "/hobbies",       label: "Hobbies",                 icon: Sparkles,        emoji: "✨" },
  { path: "/spots",         label: "Places",                  icon: MapPin,          emoji: "📍" },
  { path: "/travel",        label: "Trips",                   icon: Plane,           emoji: "✈️" },
  { path: "/budget",        label: "Budget",                  icon: Wallet,          emoji: "💰" },
  { path: "/housekeeping",  label: "Housekeeping",            icon: Home,            emoji: "🏡" },
  { path: "/faith",         label: "Faith & Spirituality",    icon: Flame,           emoji: "🕊️" },
  { path: "/politics",      label: "Politics & Civic Life",   icon: Landmark,        emoji: "🏛️" },
  { path: "/plants",        label: "Plants",                  icon: Leaf,            emoji: "🌱" },
  { path: "/quotes",        label: "Quotes",                  icon: Quote,           emoji: "💬" },
];

interface SearchResult {
  id: number;
  name: string;
  email: string;
  avatarUrl: string | null;
  relationshipStatus: "none" | "friends" | "incoming" | "outgoing_pending";
  incomingRequestId: number | null;
}

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ name, avatarUrl, size = 32 }: { name: string; avatarUrl?: string | null; size?: number }) {
  if (avatarUrl) return <img src={avatarUrl} alt={name} style={{ width: size, height: size }} className="rounded-full object-cover shrink-0" />;
  return (
    <div style={{ width: size, height: size }} className="rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

// ── OnboardingModal ───────────────────────────────────────────────────────────
export default function OnboardingModal({ userName }: { userName: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [step, setStep] = useState<1 | 2>(1);

  // Step 1: tab selection — all on by default
  const [selected, setSelected] = useState<Set<string>>(() => new Set(ALL_TABS.map((t) => t.path)));

  // Step 2: friend search
  const [friendQuery, setFriendQuery] = useState("");
  const [friendResults, setFriendResults] = useState<SearchResult[]>([]);
  const [friendLoading, setFriendLoading] = useState(false);
  const [sentIds, setSentIds] = useState<Set<number>>(new Set());

  // ── Save nav prefs ──────────────────────────────────────────────────────────
  const saveNavMut = useMutation({
    mutationFn: (prefs: { path: string; hidden: boolean }[]) =>
      apiRequest("POST", "/api/nav-prefs", prefs),
  });

  // ── Complete onboarding ─────────────────────────────────────────────────────
  const completeMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/me/complete-onboarding"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/me"] });
    },
  });

  // ── Friend requests ─────────────────────────────────────────────────────────
  const sendRequestMut = useMutation({
    mutationFn: (toUserId: number) => apiRequest("POST", "/api/friend-requests", { toUserId }),
    onSuccess: (_, toUserId) => {
      setSentIds((prev) => new Set([...prev, toUserId]));
      toast({ title: "Friend request sent!" });
      qc.invalidateQueries({ queryKey: ["/api/friend-requests"] });
    },
    onError: () => toast({ title: "Couldn't send request", variant: "destructive" }),
  });

  async function searchFriends(q: string) {
    if (!q.trim()) { setFriendResults([]); return; }
    setFriendLoading(true);
    try {
      const res = await apiRequest("GET", `/api/users/search?q=${encodeURIComponent(q.trim())}`);
      const data = await res.json();
      setFriendResults(Array.isArray(data) ? data : []);
    } catch {
      setFriendResults([]);
    } finally {
      setFriendLoading(false);
    }
  }

  function toggleTab(path: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function goToStep2() {
    // Save nav prefs (hidden = not selected)
    const prefs = ALL_TABS.map((t) => ({ path: t.path, hidden: !selected.has(t.path) }));
    saveNavMut.mutate(prefs);
    setStep(2);
  }

  function finish() {
    completeMut.mutate();
  }

  // First name only for greeting
  const firstName = userName.split(" ")[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Progress bar */}
        <div className="h-1 bg-muted shrink-0">
          <div
            className="h-full bg-primary transition-all duration-500"
            style={{ width: step === 1 ? "50%" : "100%" }}
          />
        </div>

        {/* ── STEP 1: Tab selection ──────────────────────────────────────── */}
        {step === 1 && (
          <>
            <div className="px-7 pt-7 pb-4 shrink-0">
              <div className="text-3xl mb-2">👋</div>
              <h1 className="text-2xl font-bold">Welcome, {firstName}!</h1>
              <p className="text-muted-foreground mt-1 text-sm">
                MyLifos has sections for every part of life. Pick the ones that matter to you — you can always change this later in Settings.
              </p>
            </div>

            <div className="flex-1 overflow-y-auto px-7 pb-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {ALL_TABS.map((tab) => {
                  const Icon = tab.icon;
                  const on = selected.has(tab.path);
                  return (
                    <button
                      key={tab.path}
                      type="button"
                      onClick={() => toggleTab(tab.path)}
                      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all ${
                        on
                          ? "border-primary bg-primary/5 text-foreground"
                          : "border-border bg-muted/30 text-muted-foreground"
                      }`}
                    >
                      <div className={`p-1.5 rounded-lg shrink-0 transition-colors ${on ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground/50"}`}>
                        <Icon size={14} />
                      </div>
                      <span className="text-xs font-medium leading-tight line-clamp-2">{tab.label}</span>
                      {on && (
                        <Check size={12} className="ml-auto shrink-0 text-primary" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Select all / None shortcuts */}
              <div className="flex gap-3 mt-3 text-xs text-muted-foreground">
                <button onClick={() => setSelected(new Set(ALL_TABS.map((t) => t.path)))} className="hover:text-foreground transition-colors underline underline-offset-2">
                  Select all
                </button>
                <span>·</span>
                <button onClick={() => setSelected(new Set())} className="hover:text-foreground transition-colors underline underline-offset-2">
                  Clear all
                </button>
                <span className="ml-auto">{selected.size} of {ALL_TABS.length} selected</span>
              </div>
            </div>

            <div className="px-7 py-4 border-t shrink-0">
              <Button onClick={goToStep2} className="w-full gap-2">
                Next: Find Friends <ArrowRight size={15} />
              </Button>
            </div>
          </>
        )}

        {/* ── STEP 2: Add friends ────────────────────────────────────────── */}
        {step === 2 && (
          <>
            <div className="px-7 pt-7 pb-4 shrink-0">
              <div className="text-3xl mb-2">👥</div>
              <h1 className="text-2xl font-bold">Find friends</h1>
              <p className="text-muted-foreground mt-1 text-sm">
                Search by name or email to connect with people you know on MyLifos.
              </p>
            </div>

            <div className="flex-1 overflow-y-auto px-7 pb-4 space-y-4">
              {/* Search input */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={friendQuery}
                  onChange={(e) => {
                    setFriendQuery(e.target.value);
                    searchFriends(e.target.value);
                  }}
                  placeholder="Search by name or email…"
                  className="pl-9"
                />
              </div>

              {/* Results */}
              {friendLoading && (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  <Clock size={20} className="mx-auto mb-2 animate-spin opacity-40" />
                  Searching…
                </div>
              )}

              {!friendLoading && friendResults.length > 0 && (
                <div className="space-y-2">
                  {friendResults.map((u) => {
                    const alreadySent = sentIds.has(u.id) || u.relationshipStatus === "outgoing_pending";
                    const isFriend = u.relationshipStatus === "friends";
                    return (
                      <div key={u.id} className="flex items-center gap-3 p-3 rounded-xl border bg-card">
                        <Avatar name={u.name} avatarUrl={u.avatarUrl} size={36} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{u.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                        </div>
                        {isFriend ? (
                          <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1 shrink-0">
                            <Check size={12} /> Friends
                          </span>
                        ) : alreadySent ? (
                          <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                            <Clock size={12} /> Pending
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 shrink-0"
                            onClick={() => sendRequestMut.mutate(u.id)}
                            disabled={sendRequestMut.isPending}
                          >
                            <UserPlus size={13} /> Add
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {!friendLoading && friendQuery && friendResults.length === 0 && (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  No users found for "{friendQuery}"
                </div>
              )}

              {!friendLoading && !friendQuery && (
                <div className="text-center py-10 text-muted-foreground">
                  <Users size={36} className="mx-auto mb-2 opacity-20" />
                  <p className="text-sm">Type a name or email to search</p>
                </div>
              )}
            </div>

            <div className="px-7 py-4 border-t shrink-0 flex gap-3">
              <Button variant="ghost" size="sm" onClick={finish} disabled={completeMut.isPending} className="gap-1 text-muted-foreground">
                <X size={14} /> Skip for now
              </Button>
              <Button onClick={finish} disabled={completeMut.isPending} className="flex-1 gap-2">
                {completeMut.isPending ? "Saving…" : <>Get started <ArrowRight size={15} /></>}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
