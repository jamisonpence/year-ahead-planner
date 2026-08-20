import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  KeyRound, Eye, EyeOff, Trash2, CheckCircle2, Loader2, Sparkles,
  Lock, Users, LayoutDashboard, Calendar, Target, BookOpen, Dumbbell,
  ChefHat, Film, Wallet, Music2, Home, MapPin, Baby, Palette, Plane, Globe,
  Link2, Check, X, UserCheck, Send, Flame, Landmark, AlertTriangle,
  Smartphone, Download,
  LogOut,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TabPrivacySetting, TabCollaborationWithUser, PublicUser } from "@shared/schema";
import { pushSupported, subscribeToPush, unsubscribeFromPush, isPushEnabled } from "@/lib/push";
import { clearToken } from "@/lib/nativeAuth";
import { signOut } from "@/lib/signOut";
import { nativePushSupported, enableNativePush, disableNativePush } from "@/lib/nativePush";

// ── Types ────────────────────────────────────────────────────────────────────

type ApiKeyStatus = { hasKey: boolean; encryptionConfigured: boolean };

// ── Personal Profile Section ──────────────────────────────────────────────────

type VisField = "birthday" | "location" | "relationship" | "family";
type Visibility = "friends" | "private";

type MyProfile = {
  birthday: string | null;
  locationCity: string | null;
  locationRegion: string | null;
  locationCountry: string | null;
  relationshipStatus: string | null;
  visibility: Record<VisField, Visibility>;
  family: {
    id: number; relation: string; name: string | null; birthday: string | null;
    status: string; relatedUserId: number | null; relatedAvatarUrl: string | null;
  }[];
  pendingRequests: { id: number; relation: string; fromName: string; fromUserId: number }[];
};

const RELATIONSHIP_LABELS: Record<string, string> = {
  single: "Single",
  in_a_relationship: "In a relationship",
  engaged: "Engaged",
  married: "Married",
  partnered: "Partnered",
  its_complicated: "It's complicated",
  prefer_not_to_say: "Prefer not to say",
};

const RELATION_LABELS: Record<string, string> = {
  partner: "Partner", child: "Child", parent: "Parent", sibling: "Sibling", other: "Other",
};

/** Friends / Private toggle for a single profile field. */
function VisibilityToggle({ value, onChange, disabled }: {
  value: Visibility; onChange: (v: Visibility) => void; disabled?: boolean;
}) {
  return (
    <div className="inline-flex rounded-lg border overflow-hidden shrink-0" role="group">
      {(["friends", "private"] as Visibility[]).map(v => (
        <button
          key={v}
          type="button"
          disabled={disabled}
          onClick={() => onChange(v)}
          className={`px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${
            value === v
              ? v === "friends" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"
              : "bg-background text-muted-foreground hover:bg-secondary/50"
          }`}
        >
          {v === "friends" ? <span className="flex items-center gap-1"><Users size={10} /> Friends</span>
                           : <span className="flex items-center gap-1"><Lock size={10} /> Private</span>}
        </button>
      ))}
    </div>
  );
}

function ProfileSection() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Partial<MyProfile>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [newRel, setNewRel] = useState({ relation: "child", displayName: "", birthday: "", relatedUserId: "" });

  const { data, isLoading } = useQuery<MyProfile>({
    queryKey: ["/api/profile/me"],
    queryFn: () => apiRequest("GET", "/api/profile/me").then(r => r.json()),
  });
  const { data: friends = [] } = useQuery<PublicUser[]>({
    queryKey: ["/api/friends"],
    queryFn: () => apiRequest("GET", "/api/friends").then(r => r.json()).catch(() => []),
  });

  const save = useMutation({
    mutationFn: (patch: Record<string, any>) => apiRequest("PATCH", "/api/profile/me", patch).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/profile/me"] }); qc.invalidateQueries({ queryKey: ["/api/friends/directory"] }); },
    onError: (e: any) => toast({ title: "Couldn't save", description: String(e.message ?? e), variant: "destructive" }),
  });

  const addRel = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/profile/relations", body).then(r => r.json()),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ["/api/profile/me"] });
      setAddOpen(false);
      setNewRel({ relation: "child", displayName: "", birthday: "", relatedUserId: "" });
      toast({
        title: r.status === "pending" ? "Request sent" : "Added",
        description: r.status === "pending" ? "They'll appear once they confirm the link." : undefined,
      });
    },
    onError: (e: any) => toast({ title: "Couldn't add", description: String(e.message ?? e).replace(/^\d{3}:\s*/, ""), variant: "destructive" }),
  });

  const answer = useMutation({
    mutationFn: ({ id, action }: { id: number; action: string }) =>
      apiRequest("PATCH", `/api/profile/relations/${id}`, { action }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/profile/me"] }),
  });

  const removeRel = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/profile/relations/${id}`).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/profile/me"] }),
  });

  const v = (f: VisField): Visibility => data?.visibility?.[f] ?? "private";
  const setVis = (f: VisField, val: Visibility) => save.mutate({ visibility: { [f]: val } });
  const val = <K extends keyof MyProfile>(k: K) => (draft[k] !== undefined ? draft[k] : data?.[k]) as any;
  const commit = (k: string, value: any) => { setDraft(d => ({ ...d, [k]: value })); save.mutate({ [k]: value || null }); };

  if (isLoading) {
    return (
      <section className="rounded-xl border bg-card p-6">
        <Loader2 size={16} className="animate-spin text-muted-foreground" />
      </section>
    );
  }

  return (
    <section className="rounded-xl border bg-card p-6 space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <UserCheck size={18} className="text-primary" />
          <h2 className="font-semibold text-base">Profile</h2>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Fill this in once and your friends stop having to. Each field is separately controlled —
          nothing marked Private ever leaves your account.
        </p>
      </div>

      {/* Pending link requests */}
      {(data?.pendingRequests?.length ?? 0) > 0 && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Waiting on you</p>
          {data!.pendingRequests.map(p => (
            <div key={p.id} className="flex items-center justify-between gap-3">
              <p className="text-sm">
                <span className="font-medium">{p.fromName}</span> listed you as their{" "}
                {RELATION_LABELS[p.relation]?.toLowerCase() ?? p.relation}.
              </p>
              <div className="flex gap-1.5 shrink-0">
                <button onClick={() => answer.mutate({ id: p.id, action: "confirm" })}
                        className="px-2.5 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-medium">
                  Confirm
                </button>
                <button onClick={() => answer.mutate({ id: p.id, action: "decline" })}
                        className="px-2.5 py-1 rounded-lg border text-xs">
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Birthday */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-[200px] flex-1">
          <label className="text-sm font-medium">Birthday</label>
          <p className="text-xs text-muted-foreground mb-1.5">Friends see this on their calendar automatically.</p>
          <Input type="date" value={val("birthday") ?? ""} max={new Date().toISOString().slice(0, 10)}
                 onChange={e => setDraft(d => ({ ...d, birthday: e.target.value }))}
                 onBlur={e => commit("birthday", e.target.value)} className="max-w-[200px]" />
        </div>
        <div className="pt-6"><VisibilityToggle value={v("birthday")} onChange={x => setVis("birthday", x)} /></div>
      </div>

      {/* Location */}
      <div className="flex items-start justify-between gap-3 flex-wrap border-t pt-5">
        <div className="min-w-[200px] flex-1">
          <label className="text-sm font-medium">Location</label>
          <p className="text-xs text-muted-foreground mb-1.5">City only — this groups friends by area. Never a street address.</p>
          <div className="flex gap-2 flex-wrap">
            <Input placeholder="City" value={val("locationCity") ?? ""}
                   onChange={e => setDraft(d => ({ ...d, locationCity: e.target.value }))}
                   onBlur={e => commit("locationCity", e.target.value)} className="max-w-[160px]" />
            <Input placeholder="State / region" value={val("locationRegion") ?? ""}
                   onChange={e => setDraft(d => ({ ...d, locationRegion: e.target.value }))}
                   onBlur={e => commit("locationRegion", e.target.value)} className="max-w-[160px]" />
            <Input placeholder="Country" value={val("locationCountry") ?? ""}
                   onChange={e => setDraft(d => ({ ...d, locationCountry: e.target.value }))}
                   onBlur={e => commit("locationCountry", e.target.value)} className="max-w-[140px]" />
          </div>
        </div>
        <div className="pt-6"><VisibilityToggle value={v("location")} onChange={x => setVis("location", x)} /></div>
      </div>

      {/* Relationship status */}
      <div className="flex items-start justify-between gap-3 flex-wrap border-t pt-5">
        <div className="min-w-[200px] flex-1">
          <label className="text-sm font-medium">Relationship status</label>
          <p className="text-xs text-muted-foreground mb-1.5">Private by default.</p>
          <Select value={val("relationshipStatus") ?? ""} onValueChange={x => commit("relationshipStatus", x)}>
            <SelectTrigger className="max-w-[220px]"><SelectValue placeholder="Not set" /></SelectTrigger>
            <SelectContent>
              {Object.entries(RELATIONSHIP_LABELS).map(([k, label]) => (
                <SelectItem key={k} value={k}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="pt-6"><VisibilityToggle value={v("relationship")} onChange={x => setVis("relationship", x)} /></div>
      </div>

      {/* Family */}
      <div className="border-t pt-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <label className="text-sm font-medium">Family</label>
            <p className="text-xs text-muted-foreground mb-2">
              Add names, or link to a friend's account. Linked people have to confirm before it shows anywhere.
            </p>
          </div>
          <div className="pt-1"><VisibilityToggle value={v("family")} onChange={x => setVis("family", x)} /></div>
        </div>

        <div className="space-y-1.5 mt-2">
          {(data?.family ?? []).map(f => (
            <div key={f.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-background">
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary font-medium shrink-0">
                {RELATION_LABELS[f.relation] ?? f.relation}
              </span>
              <span className="text-sm truncate flex-1">{f.name ?? "—"}</span>
              {f.status === "pending" && (
                <span className="text-[10px] text-amber-600 dark:text-amber-500 shrink-0">awaiting confirmation</span>
              )}
              {f.status === "declined" && (
                <span className="text-[10px] text-muted-foreground shrink-0">declined</span>
              )}
              {f.birthday && <span className="text-[11px] text-muted-foreground shrink-0">{f.birthday}</span>}
              <button onClick={() => removeRel.mutate(f.id)} className="text-muted-foreground hover:text-destructive shrink-0" aria-label="Remove">
                <X size={13} />
              </button>
            </div>
          ))}
          {(data?.family ?? []).length === 0 && (
            <p className="text-xs text-muted-foreground py-1">No family members added yet.</p>
          )}
        </div>

        <Button variant="outline" size="sm" className="mt-2" onClick={() => setAddOpen(true)}>
          Add family member
        </Button>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add a family member</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium">Relationship</label>
              <Select value={newRel.relation} onValueChange={x => setNewRel(s => ({ ...s, relation: x }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(RELATION_LABELS).map(([k, label]) => (
                    <SelectItem key={k} value={k}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium">Link to a friend's account</label>
              <Select value={newRel.relatedUserId || "none"}
                      onValueChange={x => setNewRel(s => ({ ...s, relatedUserId: x === "none" ? "" : x }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Not linked" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not linked — just a name</SelectItem>
                  {friends.map((f: any) => (
                    <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1">
                Linking sends them a request. Nothing shows until they confirm.
              </p>
            </div>

            {!newRel.relatedUserId && (
              <>
                <div>
                  <label className="text-xs font-medium">Name</label>
                  <Input className="mt-1" value={newRel.displayName} placeholder="e.g. Maya"
                         onChange={e => setNewRel(s => ({ ...s, displayName: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium">Birthday (optional)</label>
                  <Input className="mt-1" type="date" value={newRel.birthday}
                         onChange={e => setNewRel(s => ({ ...s, birthday: e.target.value }))} />
                </div>
              </>
            )}

            <Button
              className="w-full"
              disabled={addRel.isPending || (!newRel.relatedUserId && !newRel.displayName.trim())}
              onClick={() => addRel.mutate({
                relation: newRel.relation,
                displayName: newRel.relatedUserId ? undefined : newRel.displayName.trim(),
                birthday: newRel.relatedUserId ? undefined : (newRel.birthday || undefined),
                relatedUserId: newRel.relatedUserId ? Number(newRel.relatedUserId) : undefined,
              })}
            >
              {addRel.isPending ? <Loader2 size={14} className="animate-spin" /> : newRel.relatedUserId ? "Send link request" : "Add"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

const PRIVACY_TABS = [
  { path: "/",              label: "Today",                   icon: LayoutDashboard },
  { path: "/calendar",      label: "Schedule",                icon: Calendar        },
  { path: "/goals",         label: "Goals",                   icon: Target          },
  { path: "/reading",       label: "Reading",                 icon: BookOpen        },
  { path: "/workouts",      label: "Workouts",                icon: Dumbbell        },
  { path: "/recipes",       label: "Recipes",                 icon: ChefHat         },
  { path: "/movies",        label: "Movies & Shows",          icon: Film            },
  { path: "/music",         label: "Music",                   icon: Music2          },
  { path: "/budget",        label: "Budget",                  icon: Wallet          },
  { path: "/housekeeping",  label: "Home",                    icon: Home            },
  { path: "/spots",         label: "Places",                  icon: MapPin          },
  { path: "/travel",        label: "Trips",                   icon: Plane           },
  { path: "/kids",          label: "Family",                  icon: Baby            },
  { path: "/art",           label: "Art",                     icon: Palette         },
  { path: "/hobbies",       label: "Hobbies",                 icon: Sparkles        },
  { path: "/faith",         label: "Faith & Spirituality",    icon: Flame           },
  { path: "/politics",      label: "Politics & Civic Life",   icon: Landmark        },
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
  { name: "kids",         label: "Kids",          icon: Baby     },
  { name: "housekeeping", label: "Home",          icon: Home     },
  { name: "politics",     label: "Politics",      icon: Landmark },
  { name: "health",       label: "Health",        icon: Flame    },
  { name: "places",       label: "Places",        icon: MapPin   },
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
    onSuccess: () => {
      // Accepting a share changes which user's rows every endpoint on that tab
      // returns, but the query cache is staleTime: Infinity with no refetch on
      // focus — so anything already fetched keeps serving its pre-share result
      // (usually empty) until something happens to invalidate it. That's why a
      // shared Home could show projects but an empty chore list: the chores
      // query had been cached empty and never refetched, and only reappeared
      // once adding a chore invalidated that one key.
      //
      // Clearing the whole cache is the right hammer here — accepting a share is
      // rare and it genuinely changes what the entire session can see.
      qc.invalidateQueries();
    },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/tab-collaborations/${id}`),
    onSuccess: () => {
      // Same reasoning in reverse: revoking a share must drop the owner's rows
      // from this session's cache, or they linger until a manual reload.
      qc.invalidateQueries();
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
    <section className="rounded-xl border bg-card p-4 sm:p-6 space-y-4 sm:space-y-5">
      <div className="flex items-center gap-2">
        <Link2 size={18} className="text-emerald-500" />
        <h2 className="font-semibold text-base">Tab Collaboration</h2>
      </div>

      <p className="text-sm text-muted-foreground">
        Share a tab with someone so you're both working off the same data.
        Currently supported for <strong>Kids</strong> and <strong>Home</strong>.
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
        <div className="flex flex-wrap gap-2">
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
            Add friends in the <strong>Friends</strong> tab to invite them to collaborate.
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

// ── Timezone Section ─────────────────────────────────────────────────────────────

const TIMEZONE_KEY = "mylifos_timezone";
const DEFAULT_TZ = "America/New_York";

const COMMON_TIMEZONES = [
  { value: "America/New_York",    label: "Eastern (EST/EDT)"         },
  { value: "America/Chicago",     label: "Central (CST/CDT)"         },
  { value: "America/Denver",      label: "Mountain (MST/MDT)"        },
  { value: "America/Los_Angeles", label: "Pacific (PST/PDT)"         },
  { value: "America/Anchorage",   label: "Alaska (AKST/AKDT)"        },
  { value: "Pacific/Honolulu",    label: "Hawaii (HST)"              },
  { value: "America/Phoenix",     label: "Arizona (MST, no DST)"     },
  { value: "America/Puerto_Rico", label: "Atlantic (AST)"            },
  { value: "Europe/London",       label: "London (GMT/BST)"          },
  { value: "Europe/Paris",        label: "Central Europe (CET/CEST)" },
  { value: "Europe/Athens",       label: "Eastern Europe (EET/EEST)" },
  { value: "Asia/Dubai",          label: "Gulf (GST)"                },
  { value: "Asia/Kolkata",        label: "India (IST)"               },
  { value: "Asia/Bangkok",        label: "Indochina (ICT)"           },
  { value: "Asia/Shanghai",       label: "China (CST)"               },
  { value: "Asia/Tokyo",          label: "Japan (JST)"               },
  { value: "Australia/Sydney",    label: "Sydney (AEST/AEDT)"        },
  { value: "Pacific/Auckland",    label: "New Zealand (NZST/NZDT)"   },
  { value: "UTC",                 label: "UTC"                       },
];

function detectBrowserTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && COMMON_TIMEZONES.some(t => t.value === tz)) return tz;
    // Try to match a close one by offset
    const offset = -new Date().getTimezoneOffset();
    const byOffset: Record<number, string> = {
      "-300": "America/New_York",
      "-360": "America/Chicago",
      "-420": "America/Denver",
      "-480": "America/Los_Angeles",
      "0":    "UTC",
      "60":   "Europe/London",
      "120":  "Europe/Paris",
      "330":  "Asia/Kolkata",
      "540":  "Asia/Tokyo",
      "600":  "Australia/Sydney",
    };
    return byOffset[String(offset)] ?? DEFAULT_TZ;
  } catch {
    return DEFAULT_TZ;
  }
}

function loadTimezone(): string {
  try {
    return localStorage.getItem(TIMEZONE_KEY) || detectBrowserTimezone();
  } catch {
    return DEFAULT_TZ;
  }
}

function TimezoneSection() {
  const { toast } = useToast();
  const [tz, setTz] = useState(loadTimezone);
  const [saved, setSaved] = useState(true);

  function handleChange(value: string) {
    setTz(value);
    setSaved(false);
  }

  function save() {
    try {
      localStorage.setItem(TIMEZONE_KEY, tz);
      setSaved(true);
      toast({ title: "Timezone saved" });
    } catch {
      toast({ title: "Failed to save timezone", variant: "destructive" });
    }
  }

  const now = new Date().toLocaleTimeString("en-US", {
    timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true,
  });

  return (
    <section className="rounded-xl border bg-card p-4 sm:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Globe size={18} className="text-blue-500" />
        <h2 className="font-semibold text-base">Timezone</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Used for scheduling, reminders, and date display across the app.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
        <div className="flex-1 w-full space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Your Timezone</label>
          <Select value={tz} onValueChange={handleChange}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COMMON_TIMEZONES.map(t => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="text-sm text-muted-foreground shrink-0 pb-2">
          Current time: <span className="font-semibold text-foreground">{now}</span>
        </div>
      </div>
      {!saved && (
        <Button size="sm" onClick={save} className="gap-1.5">Save Timezone</Button>
      )}
    </section>
  );
}

// ── Push Notifications Section ────────────────────────────────────────────────

function PushNotificationsSection() {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  // In the iOS app the Web Push path below is inert — WKWebView doesn't implement it — so
  // this one control drives APNs instead. One toggle either way; the user should not have
  // to know which mechanism their device uses.
  const native = nativePushSupported();
  const supported = native || pushSupported();

  useEffect(() => { if (!native) isPushEnabled().then(setEnabled); }, [native]);

  async function toggle() {
    setBusy(true);
    try {
      if (enabled) {
        if (native) await disableNativePush(); else await unsubscribeFromPush();
        setEnabled(false);
        toast({ title: "Push notifications disabled" });
      } else if (native) {
        const { ok, reason } = await enableNativePush();
        setEnabled(ok);
        toast(ok
          ? { title: "Push notifications enabled!", description: "You'll get your daily digest and social updates on this device." }
          // iOS only prompts once. After a denial the toggle can't reopen it, so point at
          // the only place that can rather than letting the button look broken.
          : reason === "denied"
            ? { title: "Notifications are turned off", description: "Enable them in iOS Settings › MyLifos › Notifications.", variant: "destructive" }
            : { title: "Couldn't enable push", description: "Registration with Apple failed. Check the console for details.", variant: "destructive" });
      } else {
        const ok = await subscribeToPush();
        setEnabled(ok);
        toast(ok
          ? { title: "Push notifications enabled!", description: "You'll get your daily digest and social updates on this device." }
          : { title: "Permission not granted", description: "Allow notifications in your browser settings to enable push.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Couldn't update push settings", variant: "destructive" });
    } finally { setBusy(false); }
  }

  return (
    <section className="rounded-xl border bg-card p-4 sm:p-6 space-y-3">
      <h2 className="font-semibold text-base">Push notifications</h2>
      <p className="text-sm text-muted-foreground">
        Get your morning "day ahead" digest, friend requests, shares, and buddy nudges
        delivered to this device — even when the app is closed.
      </p>
      {supported ? (
        <Button variant={enabled ? "secondary" : "default"} size="sm" onClick={toggle} disabled={busy} className="gap-1.5">
          {enabled ? "Disable on this device" : "Enable push notifications"}
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">
          This browser doesn't support push notifications. On iOS, add MyLifos to your Home Screen first.
        </p>
      )}
    </section>
  );
}

// ── Export Data Section ───────────────────────────────────────────────────────

function ExportDataSection() {
  return (
    <section className="rounded-xl border bg-card p-4 sm:p-6 space-y-3">
      <h2 className="font-semibold text-base">Export your data</h2>
      <p className="text-sm text-muted-foreground">
        Download everything you've tracked — goals, tasks, books, recipes, journal entries,
        and all other modules — as a single JSON file. Your data is always yours.
      </p>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => { window.location.href = "/api/export"; }}
      >
        Download my data (JSON)
      </Button>
    </section>
  );
}

// ── Account Section ───────────────────────────────────────────────────────────

/**
 * Sign out.
 *
 * Settings previously offered account *deletion* but no way to sign out, and the only
 * sign-out in the app was the MyLifos sheet footer — which the bottom tab bar was
 * painting over, so on a phone there was effectively no way out of the app at all.
 * Settings is where people look for this, so it belongs here regardless.
 *
 * Deliberately its own section above Danger Zone rather than a button inside it: signing
 * out is routine and reversible, and sitting it next to "Delete account" invites a misclick
 * on exactly the one action that isn't.
 */
function SignOutSection() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  async function handle() {
    if (!window.confirm("Sign out of MyLifos?")) return;
    setBusy(true);
    try {
      await signOut();
      qc.clear();
      window.location.href = "/";
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border bg-card p-4 sm:p-6 space-y-3">
      <h2 className="font-semibold text-base">Account</h2>
      <p className="text-sm text-muted-foreground">
        Sign out on this device. Your data stays exactly as it is.
      </p>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={handle} disabled={busy}>
        <LogOut size={14} />
        {busy ? "Signing out…" : "Sign out"}
      </Button>
    </section>
  );
}

// ── Delete Account Section ────────────────────────────────────────────────────

function DeleteAccountSection() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const deleteMut = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/me"),
    onSuccess: () => {
      // Same reason as sign-out: the native bearer token is stateless and outlives the
      // server session. The account is gone so it can no longer authenticate, but leaving
      // a credential for a deleted account in device storage is not a good look for the
      // App Store 5.1.1(v) deletion flow.
      clearToken();
      qc.clear();
      // Hard redirect to landing — session is gone
      window.location.href = "/";
    },
    onError: () => toast({ title: "Failed to delete account", variant: "destructive" }),
  });

  function handleOpen() {
    setConfirmText("");
    setDialogOpen(true);
  }

  const confirmed = confirmText.trim().toUpperCase() === "DELETE";

  return (
    <>
      <section className="rounded-xl border border-destructive/30 bg-card p-4 sm:p-6 space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle size={18} className="text-destructive" />
          <h2 className="font-semibold text-base text-destructive">Danger Zone</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Permanently delete your account and all associated data. This action cannot be undone.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="border-destructive/40 text-destructive hover:bg-destructive hover:text-destructive-foreground gap-1.5"
          onClick={handleOpen}
        >
          <Trash2 size={13} /> Delete my account
        </Button>
      </section>

      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) setDialogOpen(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle size={16} /> Delete account
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="rounded-lg bg-destructive/5 border border-destructive/20 p-3 text-sm text-destructive space-y-1">
              <p className="font-medium">This will permanently delete:</p>
              <ul className="text-xs space-y-0.5 list-disc list-inside text-destructive/80">
                <li>All your entries across every tab</li>
                <li>Your friends list and shared items</li>
                <li>Your account and login credentials</li>
              </ul>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Type <span className="font-mono font-bold text-foreground">DELETE</span> to confirm
              </label>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="DELETE"
                className="font-mono"
                autoComplete="off"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                variant="destructive"
                className="flex-1 gap-1.5"
                disabled={!confirmed || deleteMut.isPending}
                onClick={() => deleteMut.mutate()}
              >
                {deleteMut.isPending
                  ? <><Loader2 size={13} className="animate-spin" /> Deleting…</>
                  : <><Trash2 size={13} /> Delete forever</>}
              </Button>
              <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={deleteMut.isPending}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Install App Section ───────────────────────────────────────────────────────

function InstallAppSection() {
  const [isInstallable, setIsInstallable] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showFallback, setShowFallback] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches
      || (navigator as any).standalone === true;
    setIsStandalone(standalone);
    if (standalone) return;

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as any).MSStream;
    const android = /android/i.test(navigator.userAgent);

    if (ios) { setIsIOS(true); setIsInstallable(true); return; }
    if (android) { setIsInstallable(true); }

    // Pick up deferred prompt if available
    const handler = () => {};
    window.addEventListener("pwaInstallReady", handler);
    return () => window.removeEventListener("pwaInstallReady", handler);
  }, []);

  async function handleInstall() {
    const prompt = (window as any).__pwaInstallPrompt as any;
    if (prompt) {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === "accepted") setInstalled(true);
      (window as any).__pwaInstallPrompt = null;
    } else {
      setShowFallback(true);
    }
  }

  // Don't show section if already running as installed PWA
  if (isStandalone || !isInstallable) return null;

  return (
    <section className="rounded-xl border bg-card p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Smartphone size={18} className="text-sky-500" />
        <h2 className="font-semibold text-base">Install App</h2>
      </div>

      {installed ? (
        <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
          <CheckCircle2 size={15} /> App installed successfully!
        </div>
      ) : isIOS ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Add MyLifos to your iPhone home screen for quick access.
          </p>
          <div className="rounded-lg bg-sky-50 dark:bg-sky-950/20 border border-sky-100 dark:border-sky-900 p-3 text-sm text-sky-800 dark:text-sky-300 space-y-1.5">
            <p className="font-semibold">How to install on iPhone:</p>
            <p>1. Tap the <strong>Share</strong> button (box with arrow) at the bottom of Safari</p>
            <p>2. Scroll down and tap <strong>"Add to Home Screen"</strong></p>
            <p>3. Tap <strong>Add</strong> in the top right</p>
          </div>
        </div>
      ) : showFallback ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Add MyLifos to your Android home screen for quick access.
          </p>
          <div className="rounded-lg bg-sky-50 dark:bg-sky-950/20 border border-sky-100 dark:border-sky-900 p-3 text-sm text-sky-800 dark:text-sky-300 space-y-1.5">
            <p className="font-semibold">How to install on Android:</p>
            <p>1. Look for a <strong>download icon</strong> (⊕) in Chrome's address bar — tap it</p>
            <p className="text-sky-600 dark:text-sky-400">— or —</p>
            <p>1. Tap the <strong>⋮ menu</strong> in Chrome</p>
            <p>2. Tap <strong>"Install app"</strong> or <strong>"Add to Home Screen"</strong></p>
            <p>3. Tap <strong>Install</strong></p>
            <p className="text-xs text-sky-600 dark:text-sky-500 pt-1">
              Note: the install option only appears after you've browsed the app for a moment. Try refreshing the page and checking again.
            </p>
          </div>
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setShowFallback(false)}>
            Try automatic install again
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Install MyLifos on your home screen for quick access — works offline too.
          </p>
          <Button size="sm" className="gap-1.5" onClick={handleInstall}>
            <Download size={13} /> Install App
          </Button>
          <p className="text-xs text-muted-foreground">
            If the button doesn't work, tap <strong>⋮</strong> in Chrome and look for <strong>"Install app"</strong>.
          </p>
        </div>
      )}
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
    <div className="max-w-2xl mx-auto px-3 sm:px-4 py-4 sm:py-8 space-y-5 sm:space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your account preferences and integrations.</p>
      </div>

      {/* Personal profile — birthday, location, relationship, family */}
      <ProfileSection />

      {/* Install App */}
      <InstallAppSection />

      {/* Timezone */}
      <TimezoneSection />

      {/* Tab Privacy */}
      <TabPrivacySection />

      {/* Tab Collaboration */}
      <CollaborationSection />

      {/* AI / Anthropic API Key */}
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

      {/* Danger Zone */}
      <PushNotificationsSection />
      <ExportDataSection />
      <SignOutSection />
      <DeleteAccountSection />
    </div>
  );
}
