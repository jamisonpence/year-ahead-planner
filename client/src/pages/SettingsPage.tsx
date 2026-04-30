import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  KeyRound, Eye, EyeOff, Trash2, CheckCircle2, Loader2, Sparkles,
  Lock, Users, LayoutDashboard, Calendar, Target, BookOpen, Dumbbell,
  ChefHat, Film, Wallet, Leaf, Music2, Home, MapPin, Baby, Quote, Palette,
  Link2, Check, X, UserCheck, Send,
} from "lucide-react";
import type { TabPrivacySetting, TabCollaborationWithUser, PublicUser } from "@shared/schema";

// ── Types ────────────────────────────────────────────────────────────────────

type ApiKeyStatus = { hasKey: boolean; encryptionConfigured: boolean };

const PRIVACY_TABS = [
  { path: "/",              label: "Dashboard",          icon: LayoutDashboard },
  { path: "/calendar",      label: "Calendar",           icon: Calendar        },
  { path: "/goals",         label: "Goals & Projects",   icon: Target          },
  { path: "/reading",       label: "Reading",            icon: BookOpen        },
  { path: "/workouts",      label: "Workouts",           icon: Dumbbell        },
  { path: "/recipes",       label: "Recipes",            icon: ChefHat         },
  { path: "/movies",        label: "Movies & Shows",     icon: Film            },
  { path: "/music",         label: "Music",              icon: Music2          },
  { path: "/budget",        label: "Budget",             icon: Wallet          },
  { path: "/plants",        label: "Plants",             icon: Leaf            },
  { path: "/housekeeping",  label: "Housekeeping",       icon: Home            },
  { path: "/spots",         label: "Spots",              icon: MapPin          },
  { path: "/kids",          label: "Kids",               icon: Baby            },
  { path: "/quotes",        label: "Quotes",             icon: Quote           },
  { path: "/art",           label: "Art",                icon: Palette         },
  { path: "/hobbies",       label: "Hobbies",            icon: Sparkles        },
];

// ── Tab Privacy Section ───────────────────────────────────────────────────────

function TabPrivacySection() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: savedSettings = [] } = useQuery<TabPrivacySetting[]>({
    queryKey: ["/api/tab-privacy"],
    queryFn: () => apiRequest("GET", "/api/tab-privacy").then(r => r.json()),
  });

  // Build effective settings map: default "private" for all tabs
  const settingsMap = Object.fromEntries(
    PRIVACY_TABS.map(t => [t.path, "private" as "private" | "friends"])
  );
  savedSettings.forEach(s => { settingsMap[s.path] = s.visibility; });

  const saveMut = useMutation({
    mutationFn: (settings: TabPrivacySetting[]) =>
      apiRequest("PUT", "/api/tab-privacy", settings),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/tab-privacy"] });
      toast({ title: "Privacy settings saved" });
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  function toggle(path: string) {
    const current = settingsMap[path] ?? "private";
    const next = current === "private" ? "friends" : "private";
    const newSettings: TabPrivacySetting[] = PRIVACY_TABS.map(t => ({
      path: t.path,
      visibility: t.path === path ? next : (settingsMap[t.path] ?? "private"),
    }));
    saveMut.mutate(newSettings);
  }

  function setAll(visibility: "private" | "friends") {
    const newSettings: TabPrivacySetting[] = PRIVACY_TABS.map(t => ({ path: t.path, visibility }));
    saveMut.mutate(newSettings);
  }

  const friendsCount = PRIVACY_TABS.filter(t => (settingsMap[t.path] ?? "private") === "friends").length;

  return (
    <section className="rounded-xl border bg-card p-6 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users size={18} className="text-blue-500" />
          <h2 className="font-semibold text-base">Profile Privacy</h2>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setAll("private")}
            className="text-xs px-2.5 py-1 rounded-md border hover:bg-secondary transition-colors text-muted-foreground"
          >
            All private
          </button>
          <button
            onClick={() => setAll("friends")}
            className="text-xs px-2.5 py-1 rounded-md border hover:bg-secondary transition-colors text-muted-foreground"
          >
            All friends
          </button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Choose which tabs friends can see when they view your profile.
        {friendsCount > 0
          ? ` ${friendsCount} tab${friendsCount === 1 ? " is" : "s are"} visible to friends.`
          : " All tabs are currently private."}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {PRIVACY_TABS.map(tab => {
          const Icon = tab.icon;
          const vis = settingsMap[tab.path] ?? "private";
          const isFriends = vis === "friends";
          return (
            <button
              key={tab.path}
              onClick={() => toggle(tab.path)}
              disabled={saveMut.isPending}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all ${
                isFriends
                  ? "border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800"
                  : "border-transparent bg-secondary/50 hover:bg-secondary"
              }`}
            >
              <Icon size={15} className={isFriends ? "text-blue-500" : "text-muted-foreground"} />
              <span className={`text-sm flex-1 ${isFriends ? "font-medium text-blue-700 dark:text-blue-300" : "text-muted-foreground"}`}>
                {tab.label}
              </span>
              {isFriends ? (
                <Users size={13} className="text-blue-500 shrink-0" />
              ) : (
                <Lock size={13} className="text-muted-foreground/50 shrink-0" />
              )}
            </button>
          );
        })}
      </div>
      {saveMut.isPending && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 size={12} className="animate-spin" /> Saving…
        </div>
      )}
    </section>
  );
}

// ── Collaboration Section ──────────────────────────────────────────────────────

const COLLAB_TABS = [
  { name: "kids",         label: "Kids",          icon: Baby },
  { name: "housekeeping", label: "Housekeeping",  icon: Home },
];

function CollaborationSection() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selectedTab, setSelectedTab] = useState<string>("kids");
  const [selectedFriendId, setSelectedFriendId] = useState<number | null>(null);
  const [friendSearch, setFriendSearch] = useState("");

  const { data: collabs = [], isLoading } = useQuery<TabCollaborationWithUser[]>({
    queryKey: ["/api/tab-collaborations"],
    queryFn: () => apiRequest("GET", "/api/tab-collaborations").then(r => r.json()),
  });

  const { data: friends = [] } = useQuery<PublicUser[]>({
    queryKey: ["/api/friends"],
    queryFn: () => apiRequest("GET", "/api/friends").then(r => r.json()),
  });

  const inviteMut = useMutation({
    mutationFn: (data: { collaboratorId: number; tabName: string }) =>
      apiRequest("POST", "/api/tab-collaborations", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/tab-collaborations"] });
      toast({ title: "Invite sent!" });
      setSelectedFriendId(null);
      setFriendSearch("");
    },
    onError: async (err: any) => {
      const text = await err?.response?.text?.() ?? "Failed to send invite";
      toast({ title: "Could not invite", description: text, variant: "destructive" });
    },
  });

  const respondMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest("PATCH", `/api/tab-collaborations/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/tab-collaborations"] }),
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/tab-collaborations/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/tab-collaborations"] });
      toast({ title: "Collaboration removed" });
    },
    onError: () => toast({ title: "Failed to remove", variant: "destructive" }),
  });

  const pendingIncoming = collabs.filter(c => c.status === "pending" && c.role === "collaborator");
  const activeCollabs = collabs.filter(c => c.status === "accepted");
  const pendingOutgoing = collabs.filter(c => c.status === "pending" && c.role === "owner");

  const filteredFriends = friends.filter(f =>
    f.name.toLowerCase().includes(friendSearch.toLowerCase()) ||
    f.email.toLowerCase().includes(friendSearch.toLowerCase())
  );

  // Friends already invited/active for the selected tab
  const busyFriendIds = new Set(
    collabs
      .filter(c => c.tabName === selectedTab && c.status !== "declined")
      .map(c => c.otherUser.id)
  );

  function handleInvite() {
    if (!selectedFriendId) return;
    inviteMut.mutate({ collaboratorId: selectedFriendId, tabName: selectedTab });
  }

  return (
    <section className="rounded-xl border bg-card p-6 space-y-5">
      <div className="flex items-center gap-2">
        <Link2 size={18} className="text-emerald-500" />
        <h2 className="font-semibold text-base">Tab Collaboration</h2>
      </div>

      <p className="text-sm text-muted-foreground">
        Share a tab with someone so you're both working off the same data.
        Currently supported for <strong>Kids</strong> and <strong>Housekeeping</strong>.
      </p>

      {/* Pending incoming invites */}
      {pendingIncoming.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Pending Invites</p>
          {pendingIncoming.map(c => {
            const TabIcon = COLLAB_TABS.find(t => t.name === c.tabName)?.icon ?? Home;
            return (
              <div key={c.id} className="flex items-center gap-3 rounded-lg border bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 px-3 py-2.5">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                  {c.otherUser.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{c.otherUser.name}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <TabIcon size={11} /> wants to collaborate on <strong>{COLLAB_TABS.find(t => t.name === c.tabName)?.label ?? c.tabName}</strong>
                  </p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => respondMut.mutate({ id: c.id, status: "accepted" })}
                    disabled={respondMut.isPending}
                    className="p-1.5 rounded-md bg-green-500 hover:bg-green-600 text-white transition-colors"
                    title="Accept"
                  >
                    <Check size={13} />
                  </button>
                  <button
                    onClick={() => respondMut.mutate({ id: c.id, status: "declined" })}
                    disabled={respondMut.isPending}
                    className="p-1.5 rounded-md bg-secondary hover:bg-secondary/80 text-muted-foreground transition-colors"
                    title="Decline"
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Active collaborations */}
      {activeCollabs.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Active</p>
          {activeCollabs.map(c => {
            const TabIcon = COLLAB_TABS.find(t => t.name === c.tabName)?.icon ?? Home;
            return (
              <div key={c.id} className="flex items-center gap-3 rounded-lg border bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 px-3 py-2.5">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                  {c.otherUser.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{c.otherUser.name}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <TabIcon size={11} />
                    <span>{COLLAB_TABS.find(t => t.name === c.tabName)?.label ?? c.tabName}</span>
                    <span className="text-emerald-600 dark:text-emerald-400">
                      · {c.role === "owner" ? "you own" : "on their data"}
                    </span>
                  </p>
                </div>
                <button
                  onClick={() => deleteMut.mutate(c.id)}
                  disabled={deleteMut.isPending}
                  className="p-1.5 rounded-md hover:bg-red-50 hover:text-red-600 text-muted-foreground transition-colors shrink-0"
                  title="Remove collaboration"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Pending outgoing */}
      {pendingOutgoing.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Awaiting Response</p>
          {pendingOutgoing.map(c => {
            const TabIcon = COLLAB_TABS.find(t => t.name === c.tabName)?.icon ?? Home;
            return (
              <div key={c.id} className="flex items-center gap-3 rounded-lg border bg-secondary/40 px-3 py-2.5">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                  {c.otherUser.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate text-muted-foreground">{c.otherUser.name}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <TabIcon size={11} /> {COLLAB_TABS.find(t => t.name === c.tabName)?.label ?? c.tabName} · waiting…
                  </p>
                </div>
                <button
                  onClick={() => deleteMut.mutate(c.id)}
                  disabled={deleteMut.isPending}
                  className="p-1.5 rounded-md hover:bg-red-50 hover:text-red-600 text-muted-foreground transition-colors shrink-0"
                  title="Cancel invite"
                >
                  <X size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Invite form */}
      <div className="space-y-3 pt-1 border-t">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide pt-2">Invite a Friend</p>

        {/* Tab picker */}
        <div className="flex gap-2">
          {COLLAB_TABS.map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.name}
                onClick={() => { setSelectedTab(t.name); setSelectedFriendId(null); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                  selectedTab === t.name
                    ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300 font-medium"
                    : "border-transparent bg-secondary/50 hover:bg-secondary text-muted-foreground"
                }`}
              >
                <Icon size={14} /> {t.label}
              </button>
            );
          })}
        </div>

        {/* Friend search */}
        {friends.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            Add friends in the <strong>Relationships</strong> tab to invite them to collaborate.
          </p>
        ) : (
          <>
            <Input
              placeholder="Search friends…"
              value={friendSearch}
              onChange={e => setFriendSearch(e.target.value)}
              className="text-sm"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-48 overflow-y-auto">
              {filteredFriends.map(f => {
                const isBusy = busyFriendIds.has(f.id);
                const isSelected = selectedFriendId === f.id;
                return (
                  <button
                    key={f.id}
                    onClick={() => !isBusy && setSelectedFriendId(isSelected ? null : f.id)}
                    disabled={isBusy}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left transition-all ${
                      isSelected
                        ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20"
                        : isBusy
                        ? "opacity-40 cursor-not-allowed border-transparent bg-secondary/30"
                        : "border-transparent bg-secondary/50 hover:bg-secondary"
                    }`}
                  >
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                      {f.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm truncate flex-1">{f.name}</span>
                    {isSelected && <UserCheck size={13} className="text-emerald-600 shrink-0" />}
                    {isBusy && <CheckCircle2 size={13} className="text-muted-foreground shrink-0" />}
                  </button>
                );
              })}
            </div>
            <Button
              size="sm"
              disabled={!selectedFriendId || inviteMut.isPending}
              onClick={handleInvite}
              className="gap-1.5"
            >
              {inviteMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              Send Invite
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

// ── Settings Page ─────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [inputKey, setInputKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [editing, setEditing] = useState(false);

  const { data: status, isLoading } = useQuery<ApiKeyStatus>({
    queryKey: ["/api/user/api-key/status"],
    queryFn: () => apiRequest("GET", "/api/user/api-key/status").then(r => r.json()),
  });

  const saveMut = useMutation({
    mutationFn: (apiKey: string) => apiRequest("PUT", "/api/user/api-key", { apiKey }),
    onSuccess: () => {
      toast({ title: "API key saved", description: "Your Anthropic API key is now active." });
      qc.invalidateQueries({ queryKey: ["/api/user/api-key/status"] });
      qc.invalidateQueries({ queryKey: ["/api/me"] });
      setInputKey("");
      setEditing(false);
    },
    onError: async (err: any) => {
      // apiRequest throws with the response text
      const msg = err?.message ?? "Failed to save key";
      // Try to extract the error detail
      const detail = msg.includes("validation failed") ? "Make sure you copied the full key." : msg;
      toast({ title: "Could not save API key", description: detail, variant: "destructive" });
    },
  });

  const removeMut = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/user/api-key"),
    onSuccess: () => {
      toast({ title: "API key removed" });
      qc.invalidateQueries({ queryKey: ["/api/user/api-key/status"] });
      qc.invalidateQueries({ queryKey: ["/api/me"] });
      setEditing(false);
    },
    onError: () => toast({ title: "Failed to remove key", variant: "destructive" }),
  });

  function handleSave() {
    if (!inputKey.trim()) return;
    saveMut.mutate(inputKey.trim());
  }

  const busy = saveMut.isPending || removeMut.isPending;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your account preferences and integrations.</p>
      </div>

      {/* Tab Privacy */}
      <TabPrivacySection />

      {/* Tab Collaboration */}
      <CollaborationSection />

      {/* Anthropic API Key */}
      <section className="rounded-xl border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound size={18} className="text-violet-500" />
          <h2 className="font-semibold text-base">Anthropic API Key</h2>
        </div>

        <div className="flex items-start gap-2 rounded-lg bg-violet-50 dark:bg-violet-950/20 border border-violet-100 dark:border-violet-900 p-3">
          <Sparkles size={15} className="text-violet-500 shrink-0 mt-0.5" />
          <p className="text-xs text-violet-800 dark:text-violet-300 leading-relaxed">
            Adding your Anthropic API key enables automatic plant care info, descriptions, and more when you add items.
            Claude runs on your key directly — <strong>your usage costs apply</strong>. The key is AES-256 encrypted before storage and never exposed to the browser.
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        ) : !status?.encryptionConfigured ? (
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3 text-sm text-amber-800 dark:text-amber-300">
            ⚠️ <strong>ENCRYPTION_KEY</strong> is not set on the server. Contact your admin or add it to Railway's environment variables before saving an API key.
          </div>
        ) : status?.hasKey && !editing ? (
          /* Key is saved — show masked display */
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
              <CheckCircle2 size={15} className="text-green-600 shrink-0" />
              <span className="text-sm font-mono tracking-widest text-muted-foreground flex-1">sk-ant-••••••••••••••••••••</span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                Update key
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-red-600 hover:bg-red-50 hover:text-red-700 border-red-200"
                onClick={() => removeMut.mutate()}
                disabled={busy}
              >
                {removeMut.isPending ? <Loader2 size={13} className="animate-spin mr-1.5" /> : <Trash2 size={13} className="mr-1.5" />}
                Remove
              </Button>
            </div>
          </div>
        ) : (
          /* No key or editing — show input */
          <div className="space-y-3">
            {editing && (
              <p className="text-xs text-muted-foreground">Saving a new key will replace the existing one.</p>
            )}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showKey ? "text" : "password"}
                  placeholder="sk-ant-api03-…"
                  value={inputKey}
                  onChange={e => setInputKey(e.target.value)}
                  className="pr-10 font-mono text-sm"
                  onKeyDown={e => e.key === "Enter" && handleSave()}
                />
                <button
                  type="button"
                  onClick={() => setShowKey(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <Button onClick={handleSave} disabled={!inputKey.trim() || busy} size="sm">
                {saveMut.isPending ? <Loader2 size={13} className="animate-spin mr-1.5" /> : null}
                {saveMut.isPending ? "Validating…" : "Save"}
              </Button>
              {editing && (
                <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setInputKey(""); }}>
                  Cancel
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Get your key at{" "}
              <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" className="underline hover:text-foreground">
                console.anthropic.com
              </a>. The key is validated before saving.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
