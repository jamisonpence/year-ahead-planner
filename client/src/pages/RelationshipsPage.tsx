import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import FriendsSocialHub from "@/components/FriendsSocialHub";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format, parseISO } from "date-fns";
import {
  Plus, Users, Pencil, Trash2, MoreHorizontal, Heart,
  Baby, Cake, StickyNote, ChevronDown, ChevronUp,
  UserPlus, FolderPlus, X, Check, Search, UserCheck, Clock,
  UserX, Send, Loader2, Link, Bell, GitMerge,
  Sparkles, LayoutGrid, Bot, Plug, CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import type {
  RelationshipGroup, InsertRelationshipGroup,
  PersonWithSpouse, Person, InsertPerson,
  FriendRequestWithUser, PublicUser,
} from "@shared/schema";

// ── Constants ─────────────────────────────────────────────────────────────────
const GROUP_COLORS = [
  "#1e3a5f","#2d4a22","#4a1e2d","#2d2a4a",
  "#1e4a4a","#4a2d1e","#3a1e4a","#1e3a2d",
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function nextBirthday(dateStr: string): { daysAway: number; label: string } {
  const today = new Date();
  const bday = parseISO(dateStr);
  const thisYear = new Date(today.getFullYear(), bday.getMonth(), bday.getDate());
  const nextYear = new Date(today.getFullYear() + 1, bday.getMonth(), bday.getDate());
  const target = thisYear >= today ? thisYear : nextYear;
  const days = Math.round((target.getTime() - today.getTime()) / 86400000);
  return { daysAway: days, label: days === 0 ? "🎂 Today!" : days === 1 ? "Tomorrow" : `${days}d` };
}

function formatBirthday(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  try { return format(parseISO(dateStr), "MMM d, yyyy"); } catch { return dateStr; }
}

function initials(first: string, last?: string | null): string {
  return [(first[0] ?? ""), (last?.[0] ?? "")].join("").toUpperCase();
}

function parseChildIds(json: string | null | undefined): number[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    if (parsed.length === 0 || typeof parsed[0] === "number") return parsed as number[];
    return [];
  } catch { return []; }
}

function fullName(p: Person | PersonWithSpouse): string {
  return [p.firstName, p.lastName].filter(Boolean).join(" ");
}

function splitName(name: string): { first: string; last: string } {
  const parts = name.trim().split(/\s+/);
  return { first: parts[0] ?? "", last: parts.slice(1).join(" ") };
}

// ── Avatar ─────────────────────────────────────────────────────────────────────
function Avatar({ user, size = 36 }: { user: { name: string; avatarUrl?: string | null }; size?: number }) {
  if (user.avatarUrl) {
    return <img src={user.avatarUrl} alt={user.name} className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />;
  }
  return (
    <div className="rounded-full bg-primary/15 flex items-center justify-center font-semibold text-primary shrink-0 select-none"
      style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {user.name.charAt(0).toUpperCase()}
    </div>
  );
}

// ── Multi-select children picker ──────────────────────────────────────────────
function ChildrenPicker({ value, onChange, candidates, currentPersonId }: {
  value: number[];
  onChange: (ids: number[]) => void;
  candidates: PersonWithSpouse[];
  currentPersonId?: number;
}) {
  const options = candidates.filter((p) => p.id !== currentPersonId);
  const [open, setOpen] = useState(false);

  const toggle = (id: number) => {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };

  const selectedPeople = options.filter((p) => value.includes(p.id));

  return (
    <div className="space-y-2">
      {selectedPeople.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedPeople.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1 text-xs bg-secondary px-2 py-1 rounded-full border">
              {fullName(p)}
              <button type="button" onClick={() => toggle(p.id)} className="text-muted-foreground hover:text-destructive">
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((x) => !x)}
        className="w-full flex items-center justify-between px-3 py-2 border rounded-lg text-sm text-left hover:bg-secondary transition-colors"
      >
        <span className="text-muted-foreground">{selectedPeople.length === 0 ? "Select children..." : `${selectedPeople.length} selected`}</span>
        <ChevronDown size={14} className="text-muted-foreground" />
      </button>
      {open && (
        <div className="border rounded-xl bg-popover shadow-md overflow-hidden">
          {options.length === 0 ? (
            <p className="text-xs text-muted-foreground p-3">No other people added yet.</p>
          ) : (
            <div className="max-h-48 overflow-y-auto">
              {options.map((p) => (
                <button key={p.id} type="button" onClick={() => toggle(p.id)}
                  className="w-full flex items-center justify-between px-3 py-2 hover:bg-secondary text-sm transition-colors">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-xs font-semibold">
                      {initials(p.firstName, p.lastName)}
                    </div>
                    <span>{fullName(p)}</span>
                    {p.birthday && <span className="text-xs text-muted-foreground">· {formatBirthday(p.birthday)}</span>}
                  </div>
                  {value.includes(p.id) && <Check size={14} className="text-primary shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Merge Contact Modal ───────────────────────────────────────────────────────
function MergeContactModal({ open, onClose, person, allPeople, friends }: {
  open: boolean;
  onClose: () => void;
  person: PersonWithSpouse | null;
  allPeople: PersonWithSpouse[];
  friends: PublicUser[];
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<"mylifos" | "contact">("mylifos");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  if (!open || !person) return null;

  const unlinkedFriendsForMerge = friends.filter(
    (f) => !allPeople.some((p) => (p as any).linkedUserId === f.id)
  );

  const otherPeople = allPeople.filter(
    (p) => p.id !== person.id && !(p as any).linkedUserId
  );

  const filteredFriends = search
    ? unlinkedFriendsForMerge.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()))
    : unlinkedFriendsForMerge;

  const filteredPeople = search
    ? otherPeople.filter((p) => fullName(p).toLowerCase().includes(search.toLowerCase()))
    : otherPeople;

  async function doMerge(body: Record<string, unknown>) {
    setLoading(true);
    try {
      const res = await fetch(`/api/people/${person!.id}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Merge failed");
      qc.invalidateQueries({ queryKey: ["/api/people"] });
      toast({ title: "Contacts merged successfully" });
      onClose();
    } catch {
      toast({ title: "Merge failed", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h2 className="font-bold text-base">Merge Contact</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Merging <span className="font-semibold text-foreground">{fullName(person)}</span> with…
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-3 border-b bg-secondary/30">
          <button
            onClick={() => { setTab("mylifos"); setSearch(""); }}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${tab === "mylifos" ? "bg-card shadow-sm text-violet-600" : "text-muted-foreground hover:text-foreground"}`}
          >
            <span className="flex items-center justify-center gap-1.5"><UserCheck size={12} /> MyLifos Friend</span>
          </button>
          <button
            onClick={() => { setTab("contact"); setSearch(""); }}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${tab === "contact" ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            <span className="flex items-center justify-center gap-1.5"><Users size={12} /> Another Contact</span>
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pt-3 pb-2">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              type="text"
              placeholder={tab === "mylifos" ? "Search friends…" : "Search contacts…"}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border bg-background outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
          {tab === "mylifos" ? (
            filteredFriends.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {search ? "No friends match your search" : "No unlinked MyLifos friends"}
              </p>
            ) : (
              filteredFriends.map((f) => (
                <div key={f.id} className="flex items-center gap-3 p-3 rounded-xl border bg-card/50 hover:bg-card transition-colors">
                  <div className="w-9 h-9 rounded-full bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center text-violet-600 dark:text-violet-400 text-sm font-bold shrink-0">
                    {f.name[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{f.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{f.email}</p>
                  </div>
                  <button
                    disabled={loading}
                    onClick={() => doMerge({ linkUserId: f.id })}
                    className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition-colors disabled:opacity-50"
                  >
                    Link
                  </button>
                </div>
              ))
            )
          ) : (
            filteredPeople.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {search ? "No contacts match your search" : "No other contacts to merge with"}
              </p>
            ) : (
              filteredPeople.map((p) => (
                <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl border bg-card/50 hover:bg-card transition-colors">
                  <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground shrink-0">
                    {initials(p.firstName, p.lastName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{fullName(p)}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {[p.company, p.birthday ? formatBirthday(p.birthday) : null].filter(Boolean).join(" · ") || "No extra info"}
                    </p>
                  </div>
                  <button
                    disabled={loading}
                    onClick={() => doMerge({ mergePersonId: p.id })}
                    className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    Merge
                  </button>
                </div>
              ))
            )
          )}
        </div>

        {/* Footer note */}
        <div className="px-5 py-3 border-t bg-muted/30">
          {tab === "mylifos" ? (
            <p className="text-[10px] text-muted-foreground">
              <strong>Link</strong> connects this contact to their MyLifos account. Their profile data stays intact and you'll see live updates.
            </p>
          ) : (
            <p className="text-[10px] text-muted-foreground">
              <strong>Merge</strong> keeps <em>{fullName(person)}</em> and folds the other contact's data into it. The duplicate will be deleted.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Person Form Modal ─────────────────────────────────────────────────────────
function PersonFormModal({ open, onClose, editPerson, groups, allPeople, linkedUserId, defaultFirstName, defaultLastName }: {
  open: boolean; onClose: () => void;
  editPerson: Person | null;
  groups: RelationshipGroup[];
  allPeople: PersonWithSpouse[];
  linkedUserId?: number | null;
  defaultFirstName?: string;
  defaultLastName?: string;
}) {
  const { toast } = useToast();
  const [firstName, setFirstName]   = useState("");
  const [lastName, setLastName]     = useState("");
  const [groupId, setGroupId]       = useState("__none__");
  const [birthday, setBirthday]     = useState("");
  const [notes, setNotes]           = useState("");
  const [spouseId, setSpouseId]     = useState("__none__");
  const [childIds, setChildIds]     = useState<number[]>([]);

  useEffect(() => {
    if (open) {
      setFirstName(editPerson?.firstName ?? defaultFirstName ?? "");
      setLastName(editPerson?.lastName ?? defaultLastName ?? "");
      setGroupId(editPerson?.groupId?.toString() ?? "__none__");
      setBirthday(editPerson?.birthday ?? "");
      setNotes(editPerson?.notes ?? "");
      setSpouseId(editPerson?.spouseId?.toString() ?? "__none__");
      setChildIds(parseChildIds(editPerson?.childrenJson));
    }
  }, [open, editPerson, defaultFirstName, defaultLastName]);

  const invAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/people"] });
    queryClient.invalidateQueries({ queryKey: ["/api/events"] });
  };

  const saveMut = useMutation({
    mutationFn: async (payload: InsertPerson) => {
      let personId = editPerson?.id;
      if (editPerson) {
        await apiRequest("PATCH", `/api/people/${editPerson.id}`, payload);
      } else {
        const created: any = await apiRequest("POST", "/api/people", payload);
        personId = created.id;
      }
      const sid = spouseId && spouseId !== "__none__" ? parseInt(spouseId) : null;
      if (personId) {
        await apiRequest("POST", `/api/people/${personId}/link-spouse`, { spouseId: sid });
      }
      return personId;
    },
    onSuccess: () => { invAll(); toast({ title: editPerson ? "Profile updated" : linkedUserId ? "Profile created" : "Person added" }); onClose(); },
    onError: () => toast({ title: "Error saving", variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim()) return;
    saveMut.mutate({
      firstName: firstName.trim(),
      lastName: lastName.trim() || null,
      groupId: groupId && groupId !== "__none__" ? parseInt(groupId) : null,
      birthday: birthday || null,
      notes: notes.trim() || null,
      spouseId: spouseId && spouseId !== "__none__" ? parseInt(spouseId) : null,
      childrenJson: JSON.stringify(childIds),
      birthdayEventId: editPerson?.birthdayEventId ?? null,
      sortOrder: editPerson?.sortOrder ?? 0,
      linkedUserId: linkedUserId ?? (editPerson as any)?.linkedUserId ?? null,
    });
  };

  const spouseOptions = allPeople.filter((p) => {
    if (p.id === editPerson?.id) return false;
    if (p.spouseId && p.spouseId !== editPerson?.id) return false;
    return true;
  });

  const isConnectedProfile = !!(linkedUserId || editPerson?.linkedUserId);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {editPerson ? "Edit Profile" : isConnectedProfile ? "Set Up Profile" : "Add Person"}
            {isConnectedProfile && (
              <span className="text-xs font-normal text-primary bg-primary/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                <UserCheck size={10} /> Connected user
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>First Name *</Label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First" required />
            </div>
            <div className="space-y-1.5">
              <Label>Last Name</Label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Group</Label>
              <Select value={groupId} onValueChange={setGroupId}>
                <SelectTrigger><SelectValue placeholder="No group" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No group</SelectItem>
                  {groups.map((g) => <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Birthday</Label>
              <Input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Heart size={13} className="text-rose-500" /> Spouse / Partner
            </Label>
            <Select value={spouseId} onValueChange={setSpouseId}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {spouseOptions.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {fullName(p)}{p.spouseId === editPerson?.id ? " (linked)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Selecting a spouse automatically links both people to each other.</p>
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Baby size={13} className="text-sky-500" /> Children
            </Label>
            <ChildrenPicker value={childIds} onChange={setChildIds} candidates={allPeople} currentPersonId={editPerson?.id} />
            <p className="text-xs text-muted-foreground">Add them as a Person first if they aren't in the list yet.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
              placeholder="How you know them, things to remember..." />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={saveMut.isPending} className="flex-1">
              {saveMut.isPending ? "Saving..." : editPerson ? "Save Changes" : isConnectedProfile ? "Create Profile" : "Add Person"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Group Form Modal ──────────────────────────────────────────────────────────
function GroupFormModal({ open, onClose, editGroup }: {
  open: boolean; onClose: () => void; editGroup: RelationshipGroup | null;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [color, setColor] = useState(GROUP_COLORS[0]);

  useEffect(() => {
    if (open) { setName(editGroup?.name ?? ""); setColor(editGroup?.color ?? GROUP_COLORS[0]); }
  }, [open, editGroup]);

  const inv = () => queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
  const createMut = useMutation({
    mutationFn: (d: InsertRelationshipGroup) => apiRequest("POST", "/api/groups", d),
    onSuccess: () => { inv(); toast({ title: "Group created" }); onClose(); },
  });
  const updateMut = useMutation({
    mutationFn: (d: Partial<InsertRelationshipGroup>) => apiRequest("PATCH", `/api/groups/${editGroup?.id}`, d),
    onSuccess: () => { inv(); toast({ title: "Group updated" }); onClose(); },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const p: InsertRelationshipGroup = { name: name.trim(), color, sortOrder: editGroup?.sortOrder ?? 0 };
    editGroup ? updateMut.mutate(p) : createMut.mutate(p);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>{editGroup ? "Edit Group" : "New Group"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Group Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Daycare, Hometown, Austin" required />
          </div>
          <div className="space-y-1.5">
            <Label>Color</Label>
            <div className="flex gap-2 flex-wrap">
              {GROUP_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-lg border-2 transition-all ${color === c ? "border-primary scale-110" : "border-transparent"}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={createMut.isPending || updateMut.isPending} className="flex-1">
              {editGroup ? "Save" : "Create Group"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Child Row ─────────────────────────────────────────────────────────────────
function ChildRow({ child, color }: { child: PersonWithSpouse; color?: string }) {
  const bdayInfo = child.birthday ? nextBirthday(child.birthday) : null;
  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <div className="flex items-center gap-0 shrink-0">
        <div className="w-4 h-px bg-border" />
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
          style={{ backgroundColor: color ? color + "cc" : "#4a6a8f" }}>
          {initials(child.firstName, child.lastName)}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold leading-tight">{fullName(child)}</p>
        {child.birthday && (
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
            <Cake size={9} />{formatBirthday(child.birthday)}
            {bdayInfo && bdayInfo.daysAway <= 30 && (
              <span className={`ml-1 font-semibold ${bdayInfo.daysAway <= 7 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
                {bdayInfo.label}
              </span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Family Cluster Card ───────────────────────────────────────────────────────
// Renders a household unit: adult(s) + their children, visually grouped together
function FamilyClusterCard({
  adults,
  children,
  color,
  onEdit,
  onMerge,
  friendPersonIds,
}: {
  adults: PersonWithSpouse[];
  children: PersonWithSpouse[];
  color?: string;
  onEdit: (p: PersonWithSpouse) => void;
  onMerge: (p: PersonWithSpouse) => void;
  friendPersonIds: Set<number>;
}) {
  const accentBg = color ? `${color}18` : "rgba(99,102,241,0.07)";
  const accentBorder = color ? `${color}40` : "rgba(99,102,241,0.2)";
  const dot = color || "#6366f1";

  const isFriend = (p: PersonWithSpouse) => friendPersonIds.has(p.id);

  const Avatar = ({ p, size = 36 }: { p: PersonWithSpouse; size?: number }) => (
    <div className="relative shrink-0">
      <div
        className="rounded-full flex items-center justify-center font-bold text-white select-none"
        style={{ width: size, height: size, backgroundColor: dot, fontSize: size * 0.38 }}
      >
        {initials(p.firstName, p.lastName)}
      </div>
      {isFriend(p) && (
        <div
          className="absolute -bottom-0.5 -right-0.5 rounded-full flex items-center justify-center"
          style={{ width: size * 0.42, height: size * 0.42, backgroundColor: "#8b5cf6", border: "1.5px solid white" }}
          title="MyLifos friend"
        >
          <UserCheck size={size * 0.22} className="text-white" strokeWidth={2.5} />
        </div>
      )}
    </div>
  );

  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{ backgroundColor: accentBg, borderColor: accentBorder }}
    >
      {/* Adults row */}
      <div className="flex items-start gap-2 p-3">
        {adults.map((adult, i) => (
          <div key={adult.id} className="flex items-center gap-2 flex-1 min-w-0">
            {i > 0 && (
              <div className="flex flex-col items-center shrink-0">
                <Heart size={13} className="text-rose-400" fill="currentColor" />
              </div>
            )}
            <Avatar p={adult} size={38} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <p className="text-sm font-semibold truncate leading-tight">{fullName(adult)}</p>
                {isFriend(adult) && (
                  <span className="shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-700">
                    MyLifos
                  </span>
                )}
              </div>
              {adult.birthday && (
                <p className="text-[10px] text-muted-foreground flex items-center gap-0.5 mt-0.5">
                  <Cake size={9} /> {formatBirthday(adult.birthday)}
                </p>
              )}
              {adult.notes && (
                <p className="text-[10px] text-muted-foreground truncate mt-0.5 italic">{adult.notes}</p>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {!isFriend(adult) && (
                <button
                  onClick={() => onMerge(adult)}
                  className="p-1 rounded-lg hover:bg-violet-100 dark:hover:bg-violet-900/30 text-violet-400 hover:text-violet-600 transition-colors"
                  title="Merge contact"
                >
                  <GitMerge size={11} />
                </button>
              )}
              <button
                onClick={() => onEdit(adult)}
                className="p-1 rounded-lg hover:bg-black/10 text-muted-foreground hover:text-foreground transition-colors"
                title="Edit"
              >
                <Pencil size={11} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Children row */}
      {children.length > 0 && (
        <div className="border-t px-3 pb-3 pt-2" style={{ borderColor: accentBorder }}>
          <div className="flex items-center gap-1 mb-2 ml-1">
            <div className="w-3 h-px" style={{ backgroundColor: dot + "80" }} />
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: dot }}>
              {children.length === 1 ? "Child" : "Children"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 ml-2">
            {children.map((child) => {
              const bdayInfo = child.birthday ? nextBirthday(child.birthday) : null;
              return (
                <button
                  key={child.id}
                  onClick={() => onEdit(child)}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl border bg-card/60 hover:bg-card transition-colors text-left"
                  style={{ borderColor: accentBorder }}
                >
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                    style={{ backgroundColor: dot + "cc" }}
                  >
                    {initials(child.firstName, child.lastName)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate leading-tight">{fullName(child)}</p>
                    {child.birthday && (
                      <p className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                        <Cake size={8} /> {formatBirthday(child.birthday)}
                        {bdayInfo && bdayInfo.daysAway <= 14 && (
                          <span className="ml-0.5 font-semibold text-amber-500">{bdayInfo.label}</span>
                        )}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Cluster people in a group into family units for display.
// members = people explicitly in the group; allPeople = full roster to look up children from
function clusterFamilies(members: PersonWithSpouse[], allPeople: PersonWithSpouse[]): {
  adults: PersonWithSpouse[];
  children: PersonWithSpouse[];
}[] {
  const memberIdSet = new Set(members.map((p) => p.id));
  const allPeopleMap = new Map(allPeople.map((p) => [p.id, p]));

  // Collect child IDs that belong to group members (children may be outside the group)
  const childOfMemberSet = new Set<number>();
  members.forEach((p) => {
    parseChildIds(p.childrenJson).forEach((cid) => childOfMemberSet.add(cid));
  });

  // Only treat someone as a "child row" (not a cluster head) if they are a member AND
  // their parent is also a member — avoids hiding solo children
  const suppressedAsChild = new Set<number>();
  members.forEach((p) => {
    parseChildIds(p.childrenJson).forEach((cid) => {
      if (memberIdSet.has(cid)) suppressedAsChild.add(cid);
    });
  });

  const visited = new Set<number>();
  const clusters: { adults: PersonWithSpouse[]; children: PersonWithSpouse[] }[] = [];

  members.forEach((p) => {
    if (visited.has(p.id) || suppressedAsChild.has(p.id)) return;
    visited.add(p.id);

    const adults: PersonWithSpouse[] = [p];
    // Add spouse if they're in the group and not already visited
    if (p.spouseId && memberIdSet.has(p.spouseId) && !visited.has(p.spouseId)) {
      const spouse = members.find((m) => m.id === p.spouseId);
      if (spouse) { adults.push(spouse); visited.add(spouse.id); }
    }

    // Gather children from both adults — look up from allPeople (not just group members)
    const childIds = new Set<number>();
    adults.forEach((a) => parseChildIds(a.childrenJson).forEach((cid) => childIds.add(cid)));
    const children = Array.from(childIds)
      .map((cid) => allPeopleMap.get(cid))
      .filter((c): c is PersonWithSpouse => c !== undefined);
    children.forEach((c) => visited.add(c.id));

    clusters.push({ adults, children });
  });

  return clusters;
}

// ── Quick Add Child ───────────────────────────────────────────────────────────
function QuickAddChild({ person, allPeople, onSave }: {
  person: Person; allPeople: PersonWithSpouse[]; onSave: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"link" | "create">("link");
  const [selectedId, setSelectedId] = useState("__none__");
  const [newFirst, setNewFirst] = useState("");
  const [newLast, setNewLast] = useState("");
  const [newBday, setNewBday] = useState("");

  const existingChildIds = parseChildIds(person.childrenJson);
  const available = allPeople.filter((p) => p.id !== person.id && !existingChildIds.includes(p.id));

  const invAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/people"] });
    queryClient.invalidateQueries({ queryKey: ["/api/events"] });
  };

  const handleLink = async () => {
    if (selectedId === "__none__") return;
    const newIds = [...existingChildIds, parseInt(selectedId)];
    await apiRequest("PATCH", `/api/people/${person.id}`, { childrenJson: JSON.stringify(newIds) });
    invAll(); setOpen(false); setSelectedId("__none__"); onSave();
  };

  const handleCreate = async () => {
    if (!newFirst.trim()) return;
    const child: any = await apiRequest("POST", "/api/people", {
      firstName: newFirst.trim(), lastName: newLast.trim() || null,
      groupId: person.groupId, birthday: newBday || null,
      childrenJson: "[]", sortOrder: 0,
    });
    const newIds = [...existingChildIds, child.id];
    await apiRequest("PATCH", `/api/people/${person.id}`, { childrenJson: JSON.stringify(newIds) });
    invAll(); setOpen(false); setNewFirst(""); setNewLast(""); setNewBday(""); onSave();
  };

  if (!open) return (
    <button onClick={() => setOpen(true)}
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1">
      <Plus size={11} /> Add child
    </button>
  );

  return (
    <div className="mt-2 bg-secondary/40 rounded-xl p-3 space-y-2">
      <div className="flex gap-1">
        {(["link", "create"] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)}
            className={`text-xs px-2 py-1 rounded-lg border transition-colors ${mode === m ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-secondary"}`}>
            {m === "link" ? "Link existing" : "Create new"}
          </button>
        ))}
      </div>
      {mode === "link" ? (
        <div className="space-y-1.5">
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select person..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Select person...</SelectItem>
              {available.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {fullName(p)}{p.birthday ? ` · ${formatBirthday(p.birthday)}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-1">
            <Button size="sm" className="h-6 text-xs px-2 flex-1" onClick={handleLink} disabled={selectedId === "__none__"}>Add</Button>
            <Button size="sm" variant="ghost" className="h-6 text-xs px-1" onClick={() => setOpen(false)}><X size={11} /></Button>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="grid grid-cols-2 gap-1">
            <Input value={newFirst} onChange={(e) => setNewFirst(e.target.value)} placeholder="First name" className="h-7 text-xs" autoFocus />
            <Input value={newLast} onChange={(e) => setNewLast(e.target.value)} placeholder="Last name" className="h-7 text-xs" />
          </div>
          <Input type="date" value={newBday} onChange={(e) => setNewBday(e.target.value)} className="h-7 text-xs" />
          <div className="flex gap-1">
            <Button size="sm" className="h-6 text-xs px-2 flex-1" onClick={handleCreate} disabled={!newFirst.trim()}>Create & Add</Button>
            <Button size="sm" variant="ghost" className="h-6 text-xs px-1" onClick={() => setOpen(false)}><X size={11} /></Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Quick Link Spouse ─────────────────────────────────────────────────────────
function QuickLinkSpouse({ person, allPeople, onSave }: {
  person: Person; allPeople: PersonWithSpouse[]; onSave: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState("__none__");

  const available = allPeople.filter((p) => p.id !== person.id && (!p.spouseId || p.spouseId === person.id));

  const handleLink = async () => {
    const sid = selectedId !== "__none__" ? parseInt(selectedId) : null;
    await apiRequest("POST", `/api/people/${person.id}/link-spouse`, { spouseId: sid });
    queryClient.invalidateQueries({ queryKey: ["/api/people"] });
    setOpen(false); setSelectedId("__none__"); onSave();
  };

  if (!open) return (
    <button onClick={() => setOpen(true)}
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-rose-500 transition-colors mt-1">
      <Heart size={11} /> Add spouse
    </button>
  );

  return (
    <div className="mt-2 bg-secondary/40 rounded-xl p-3 space-y-1.5">
      <Select value={selectedId} onValueChange={setSelectedId}>
        <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select person..." /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">None (remove link)</SelectItem>
          {available.map((p) => (
            <SelectItem key={p.id} value={String(p.id)}>{fullName(p)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex gap-1">
        <Button size="sm" className="h-6 text-xs px-2 flex-1" onClick={handleLink}>Save</Button>
        <Button size="sm" variant="ghost" className="h-6 text-xs px-1" onClick={() => setOpen(false)}><X size={11} /></Button>
      </div>
    </div>
  );
}

// ── Person Tile ───────────────────────────────────────────────────────────────
function PersonTile({ person, allPeople, onEdit, onDelete, color, friend }: {
  person: PersonWithSpouse;
  allPeople: PersonWithSpouse[];
  onEdit: (p: Person) => void;
  onDelete: (id: number) => void;
  color?: string;
  friend?: PublicUser | null;  // if this person is a connected app user
}) {
  const [expanded, setExpanded] = useState(false);
  const [, forceUpdate] = useState(0);
  const [, navigate] = useLocation();

  const spouse = person.spouseId ? allPeople.find((p) => p.id === person.spouseId) : null;
  const childIds = parseChildIds(person.childrenJson);
  const children = allPeople.filter((p) => childIds.includes(p.id));
  const bdayInfo = person.birthday ? nextBirthday(person.birthday) : null;

  return (
    <div className="bg-card border rounded-xl overflow-hidden hover:shadow-sm transition-shadow">
      <div className="h-1.5" style={{ backgroundColor: color || "#1e3a5f" }} />
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Avatar: use app avatar if connected, else initials */}
          {friend?.avatarUrl ? (
            <img src={friend.avatarUrl} alt={friend.name} className="w-11 h-11 rounded-full object-cover shrink-0" />
          ) : (
            <div className="w-11 h-11 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 select-none"
              style={{ backgroundColor: color || "#1e3a5f" }}>
              {initials(person.firstName, person.lastName)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="font-semibold text-sm leading-tight">{fullName(person)}</p>
                  {friend && (
                    <span className="shrink-0 flex items-center gap-0.5 text-[10px] font-medium text-primary/80 bg-primary/10 px-1.5 py-0.5 rounded-full">
                      <UserCheck size={9} /> Connected
                    </span>
                  )}
                </div>
                {friend && (
                  <>
                    <p className="text-xs text-muted-foreground truncate">{friend.email}</p>
                    <button
                      onClick={() => navigate(`/profile/${friend.id}`)}
                      className="mt-1 flex items-center gap-1 text-xs text-primary font-medium hover:underline"
                    >
                      <LayoutGrid size={10} /> View shared tabs
                    </button>
                  </>
                )}
                {!friend && (spouse ? (
                  <p className="text-xs text-rose-500 dark:text-rose-400 flex items-center gap-1 mt-0.5">
                    <Heart size={10} className="shrink-0" fill="currentColor" />{fullName(spouse)}
                  </p>
                ) : (
                  <QuickLinkSpouse person={person} allPeople={allPeople} onSave={() => forceUpdate((n) => n + 1)} />
                ))}
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <button onClick={() => setExpanded((x) => !x)}
                  className="p-1.5 rounded hover:bg-secondary text-muted-foreground transition-colors">
                  {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal size={13} /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {friend && (
                      <DropdownMenuItem onClick={() => navigate(`/profile/${friend.id}`)}>
                        <LayoutGrid size={13} className="mr-2" />View shared tabs
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => onEdit(person)}><Pencil size={13} className="mr-2" />Edit</DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onDelete(person.id)}>
                      <Trash2 size={13} className="mr-2" />Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            {person.birthday && bdayInfo && (
              <div className="flex items-center gap-1.5 mt-1.5">
                <Cake size={11} className="text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{formatBirthday(person.birthday)}</span>
                <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                  bdayInfo.daysAway === 0 ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"
                  : bdayInfo.daysAway <= 21 ? "bg-secondary text-foreground" : "text-muted-foreground"
                }`}>{bdayInfo.label}</span>
              </div>
            )}
          </div>
        </div>
        {expanded && (
          <div className="mt-3 pt-3 border-t space-y-3">
            {person.notes && (
              <div className="flex items-start gap-1.5">
                <StickyNote size={12} className="text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-xs text-muted-foreground leading-relaxed">{person.notes}</p>
              </div>
            )}
            {/* Spouse section (only show for non-connected people) */}
            {!friend && (
              <div>
                {children.length > 0 && (
                  <div className="mb-1">
                    <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1 mb-0.5">
                      <Baby size={11} /> Children
                    </p>
                    <div className="ml-1 pl-2 border-l-2 border-border space-y-0">
                      {children.map((child) => (
                        <ChildRow key={child.id} child={child} color={color} />
                      ))}
                    </div>
                  </div>
                )}
                <div className="ml-3">
                  <QuickAddChild person={person} allPeople={allPeople} onSave={() => forceUpdate((n) => n + 1)} />
                </div>
              </div>
            )}
            {/* Connected friend: show spouse and children too */}
            {friend && (
              <div>
                {spouse && (
                  <p className="text-xs text-rose-500 dark:text-rose-400 flex items-center gap-1">
                    <Heart size={10} fill="currentColor" /> {fullName(spouse)}
                  </p>
                )}
                {children.length > 0 && (
                  <div className="mt-1">
                    <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1 mb-0.5">
                      <Baby size={11} /> Children
                    </p>
                    <div className="ml-1 pl-2 border-l-2 border-border">
                      {children.map((child) => <ChildRow key={child.id} child={child} color={color} />)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Friend Card (app-connected user, no profile yet) ──────────────────────────
function FriendCard({
  friend,
  groups,
  onUnfriend,
  onEditProfile,
}: {
  friend: PublicUser;
  groups: RelationshipGroup[];
  onUnfriend: (id: number) => void;
  onEditProfile: (friend: PublicUser) => void;
}) {
  const [, navigate] = useLocation();
  return (
    <div className="bg-card border rounded-xl overflow-hidden hover:shadow-sm transition-shadow">
      <div className="h-1.5 bg-primary/20" />
      <div className="p-4">
        <div className="flex items-center gap-3">
          <Avatar user={friend} size={44} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="font-semibold text-sm truncate">{friend.name}</p>
              <span className="shrink-0 flex items-center gap-0.5 text-[10px] font-medium text-primary/80 bg-primary/10 px-1.5 py-0.5 rounded-full">
                <UserCheck size={9} /> Connected
              </span>
            </div>
            <p className="text-xs text-muted-foreground truncate">{friend.email}</p>
            <div className="mt-1.5 flex items-center gap-3 flex-wrap">
              <button
                onClick={() => navigate(`/profile/${friend.id}`)}
                className="flex items-center gap-1 text-xs text-primary font-medium hover:underline"
              >
                <LayoutGrid size={10} /> View shared tabs
              </button>
              <button
                onClick={() => onEditProfile(friend)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                <Pencil size={10} /> Add to group
              </button>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => navigate(`/profile/${friend.id}`)}
              className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
              title="View shared tabs"
            >
              <LayoutGrid size={14} />
            </button>
            <button
              onClick={() => onUnfriend(friend.id)}
              className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
              title="Remove friend"
            >
              <UserX size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Incoming Request Card ─────────────────────────────────────────────────────
function IncomingRequestCard({
  request,
  onAccept,
  onDecline,
}: {
  request: FriendRequestWithUser;
  onAccept: (id: number) => void;
  onDecline: (id: number) => void;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border bg-card">
      <Avatar user={request.otherUser} size={38} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{request.otherUser.name}</p>
        <p className="text-xs text-muted-foreground truncate">{request.otherUser.email}</p>
      </div>
      <div className="flex gap-1.5 shrink-0">
        <button
          onClick={() => onAccept(request.id)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
        >
          <Check size={11} /> Accept
        </button>
        <button
          onClick={() => onDecline(request.id)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-colors"
        >
          <X size={11} /> Decline
        </button>
      </div>
    </div>
  );
}

// ── User Search Panel ─────────────────────────────────────────────────────────
function UserSearchPanel({
  friends,
  requests,
  onSendRequest,
  onAccept,
  onDecline,
  onCancel,
  onUnfriend,
  sendPending,
}: {
  friends: PublicUser[];
  requests: { incoming: FriendRequestWithUser[]; outgoing: FriendRequestWithUser[] };
  onSendRequest: (id: number) => void;
  onAccept: (id: number) => void;
  onDecline: (id: number) => void;
  onCancel: (id: number) => void;
  onUnfriend: (id: number) => void;
  sendPending: boolean;
}) {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<(PublicUser & { relationshipStatus: string; incomingRequestId: number | null })[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const r = await apiRequest("GET", `/api/users/search?q=${encodeURIComponent(q)}`);
      setResults(await r.json());
    } catch { setResults([]); }
    finally { setLoading(false); }
  }, []);

  function handleChange(val: string) {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 350);
  }

  // Re-run search when mutation state changes (to refresh status chips)
  useEffect(() => {
    if (query.trim()) doSearch(query);
  }, [friends.length, requests.incoming.length, requests.outgoing.length]);

  function StatusBadge({ status }: { status: string }) {
    if (status === "friends") return <span className="text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1"><UserCheck size={11} />Friends</span>;
    if (status === "outgoing_pending") return <span className="text-xs text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1"><Clock size={11} />Request sent</span>;
    if (status === "incoming") return <span className="text-xs text-blue-600 dark:text-blue-400 font-medium flex items-center gap-1"><Send size={11} />Sent you a request</span>;
    return null;
  }

  return (
    <div className="space-y-3">
      {/* Search input */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        {loading && <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />}
        <input
          autoFocus
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Search by name or email…"
          className="w-full pl-9 pr-8 py-2.5 text-sm border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {/* Empty state */}
      {!query.trim() && (
        <p className="text-sm text-muted-foreground text-center py-4">Type a name or email to find users</p>
      )}

      {/* No results */}
      {query.trim() && !loading && results.length === 0 && (
        <div className="text-center py-5 space-y-2">
          <p className="text-sm text-muted-foreground">No users found for "{query}"</p>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(window.location.origin).then(() =>
                toast({ title: "Link copied!", description: "Share this link so they can sign up." })
              );
            }}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-primary/30 text-primary hover:bg-primary/10 transition-colors"
          >
            <Link size={12} /> Copy invite link
          </button>
        </div>
      )}

      {/* Results */}
      <div className="space-y-2">
        {results.map((u) => {
          const incomingReq = requests.incoming.find((r) => r.otherUser.id === u.id);
          const outgoingReq = requests.outgoing.find((r) => r.otherUser.id === u.id);
          return (
            <div key={u.id} className="flex items-center gap-3 p-3 rounded-xl border bg-card">
              <Avatar user={u} size={38} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{u.name}</p>
                <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                <div className="mt-0.5"><StatusBadge status={u.relationshipStatus} /></div>
              </div>
              <div className="shrink-0">
                {u.relationshipStatus === "none" && (
                  <button
                    onClick={() => onSendRequest(u.id)}
                    disabled={sendPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-50"
                  >
                    <UserPlus size={12} /> Add Friend
                  </button>
                )}
                {u.relationshipStatus === "incoming" && incomingReq && (
                  <div className="flex gap-1.5">
                    <button onClick={() => onAccept(incomingReq.id)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90">
                      <Check size={11} /> Accept
                    </button>
                    <button onClick={() => onDecline(incomingReq.id)}
                      className="flex items-center gap-1 px-2 py-1.5 rounded-lg border text-xs text-muted-foreground hover:text-destructive">
                      <X size={11} />
                    </button>
                  </div>
                )}
                {u.relationshipStatus === "outgoing_pending" && outgoingReq && (
                  <button onClick={() => onCancel(outgoingReq.id)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs text-muted-foreground hover:text-destructive hover:border-destructive/30">
                    <X size={11} /> Cancel
                  </button>
                )}
                {u.relationshipStatus === "friends" && (
                  <button onClick={() => onUnfriend(u.id)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs text-muted-foreground hover:text-destructive hover:border-destructive/30">
                    <UserX size={12} /> Unfriend
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Timeline Section ──────────────────────────────────────────────────────────

const INTERACTION_TYPES = [
  { key: "call",        label: "Call",           icon: "📞" },
  { key: "coffee",      label: "Coffee",         icon: "☕" },
  { key: "email",       label: "Email",          icon: "✉️" },
  { key: "meal",        label: "Meal",           icon: "🍔" },
  { key: "meeting",     label: "Meeting",        icon: "📅" },
  { key: "networking",  label: "Networking",     icon: "💼" },
  { key: "note",        label: "Note",           icon: "📝" },
  { key: "other",       label: "Other",          icon: "⚽" },
  { key: "party",       label: "Party/Social",   icon: "🙌" },
  { key: "text",        label: "Text/Messaging", icon: "💬" },
  { key: "custom",      label: "Custom",         icon: "+" },
] as const;

type InteractionType = typeof INTERACTION_TYPES[number]["key"];

interface TimelineEntry {
  id: number;
  personIdsJson: string;
  interactionType: string;
  customType: string | null;
  note: string | null;
  date: string;
  createdAt: string;
}

function groupEntriesByPeriod(entries: TimelineEntry[]): Array<{ label: string; entries: TimelineEntry[] }> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);

  const thisMonth: TimelineEntry[] = [];
  const lastMonth: TimelineEntry[] = [];
  const thisYear: TimelineEntry[] = [];
  const older: TimelineEntry[] = [];

  for (const e of entries) {
    const d = new Date(e.date);
    if (d >= startOfMonth) thisMonth.push(e);
    else if (d >= startOfLastMonth) lastMonth.push(e);
    else if (d >= startOfYear) thisYear.push(e);
    else older.push(e);
  }

  return [
    { label: "This Month", entries: thisMonth },
    { label: "Last Month", entries: lastMonth },
    { label: "This Year", entries: thisYear },
    { label: "Older", entries: older },
  ].filter(g => g.entries.length > 0);
}

function AddNoteModal({ people, onClose, onSaved, editEntry }: {
  people: PersonWithSpouse[];
  onClose: () => void;
  onSaved: () => void;
  editEntry?: TimelineEntry | null;
}) {
  const { toast } = useToast();
  const [selectedPeople, setSelectedPeople] = useState<PersonWithSpouse[]>(() => {
    if (!editEntry) return [];
    const ids: number[] = JSON.parse(editEntry.personIdsJson ?? "[]");
    return people.filter(p => ids.includes(p.id));
  });
  const [note, setNote] = useState(editEntry?.note ?? "");
  const [date, setDate] = useState(editEntry?.date ?? new Date().toISOString().slice(0, 10));
  const [interactionType, setInteractionType] = useState<InteractionType>((editEntry?.interactionType as InteractionType) ?? "note");
  const [customType, setCustomType] = useState(editEntry?.customType ?? "");
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [personSearch, setPersonSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const filteredPeople = personSearch
    ? people.filter(p => fullName(p).toLowerCase().includes(personSearch.toLowerCase()))
    : people;

  async function save() {
    setSaving(true);
    try {
      const body = {
        personIds: selectedPeople.map(p => p.id),
        interactionType,
        customType: interactionType === "custom" ? customType : null,
        note: note || null,
        date,
      };
      if (editEntry) {
        await fetch(`/api/timeline/${editEntry.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
      } else {
        await fetch("/api/timeline", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
      }
      onSaved();
      onClose();
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const selectedType = INTERACTION_TYPES.find(t => t.key === interactionType);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-card w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b">
          <div className="flex-1">
            <p className="text-xs font-semibold text-muted-foreground mb-1">Who did you meet?</p>
            <div className="flex flex-wrap gap-1.5 items-center min-h-[28px]">
              {selectedPeople.map(p => (
                <span key={p.id} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary text-sm font-medium">
                  <div className="w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center text-[9px] font-bold text-primary shrink-0">
                    {p.firstName[0]}
                  </div>
                  {fullName(p)}
                  <button onClick={() => setSelectedPeople(prev => prev.filter(x => x.id !== p.id))} className="text-muted-foreground hover:text-destructive ml-0.5">
                    <X size={10} />
                  </button>
                </span>
              ))}
              <input
                value={personSearch}
                onChange={e => setPersonSearch(e.target.value)}
                placeholder={selectedPeople.length === 0 ? "Add contacts..." : ""}
                className="flex-1 min-w-[100px] text-sm bg-transparent outline-none text-muted-foreground placeholder:text-muted-foreground/60"
              />
            </div>
            {personSearch && (
              <div className="absolute mt-1 z-10 bg-card border rounded-xl shadow-lg max-h-40 overflow-y-auto min-w-[200px]">
                {filteredPeople.slice(0, 8).map(p => (
                  <button key={p.id} onClick={() => { setSelectedPeople(prev => prev.find(x => x.id === p.id) ? prev : [...prev, p]); setPersonSearch(""); }}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/50 text-sm text-left">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">{p.firstName[0]}</div>
                    {fullName(p)}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground ml-3 shrink-0"><X size={18} /></button>
        </div>

        {/* Note area */}
        <div className="px-5 py-3 flex-1 overflow-y-auto">
          <p className="text-xs font-semibold text-muted-foreground mb-2">Note</p>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="What would you like to add?"
            rows={5}
            className="w-full bg-transparent text-sm resize-none outline-none placeholder:text-muted-foreground/50"
          />
        </div>

        {/* Footer toolbar */}
        <div className="border-t px-4 py-3 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Date */}
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium">
              <StickyNote size={12} className="text-muted-foreground" />
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="bg-transparent outline-none text-xs w-[100px]" />
            </div>

            {/* Interaction type */}
            <div className="relative">
              <button
                onClick={() => setShowTypeDropdown(v => !v)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium hover:bg-muted/40 transition-colors"
              >
                <span>{selectedType?.icon}</span>
                <span>{selectedType?.label}</span>
                <ChevronDown size={11} className="text-muted-foreground" />
              </button>
              {showTypeDropdown && (
                <div className="absolute bottom-full mb-1 left-0 z-20 bg-card border rounded-xl shadow-xl min-w-[160px] py-1 max-h-64 overflow-y-auto">
                  {INTERACTION_TYPES.map(t => (
                    <button key={t.key} onClick={() => { setInteractionType(t.key); setShowTypeDropdown(false); }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted/50 text-left ${interactionType === t.key ? "bg-muted/40 font-medium" : ""}`}>
                      <span className="text-base">{t.icon}</span> {t.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {interactionType === "custom" && (
              <input value={customType} onChange={e => setCustomType(e.target.value)}
                placeholder="Custom type..." className="px-2.5 py-1.5 rounded-lg border text-xs outline-none bg-transparent w-28" />
            )}
          </div>

          <div className="flex items-center justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
            <button onClick={save} disabled={saving}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity">
              {saving ? "Saving…" : editEntry ? "Save changes" : "Add note"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TimelineSection({ people }: { people: PersonWithSpouse[] }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showModal, setShowModal] = useState(false);
  const [editEntry, setEditEntry] = useState<TimelineEntry | null>(null);
  const [search, setSearch] = useState("");

  const { data: entries = [] } = useQuery<TimelineEntry[]>({
    queryKey: ["/api/timeline"],
    queryFn: () => fetch("/api/timeline").then(r => r.json()),
  });

  async function deleteEntry(id: number) {
    try {
      await fetch(`/api/timeline/${id}`, { method: "DELETE" });
      qc.invalidateQueries({ queryKey: ["/api/timeline"] });
      toast({ title: "Entry deleted" });
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  }

  const peopleById = useMemo(() => {
    const m = new Map<number, PersonWithSpouse>();
    people.forEach(p => m.set(p.id, p));
    return m;
  }, [people]);

  const filtered = useMemo(() => {
    if (!search) return entries;
    const q = search.toLowerCase();
    return entries.filter(e => {
      if (e.note?.toLowerCase().includes(q)) return true;
      const ids: number[] = JSON.parse(e.personIdsJson ?? "[]");
      return ids.some(id => fullName(peopleById.get(id) ?? { firstName: "", lastName: null } as any).toLowerCase().includes(q));
    });
  }, [entries, search, peopleById]);

  const groups = groupEntriesByPeriod(filtered);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold">Timeline</h3>
          <p className="text-xs text-muted-foreground">Meet someone recently? Add to your timeline to remember where you left off.</p>
        </div>
        <button
          onClick={() => { setEditEntry(null); setShowModal(true); }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity shrink-0"
        >
          <Plus size={14} /> Add note
        </button>
      </div>

      {/* Search */}
      {entries.length > 0 && (
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search timeline…"
            className="w-full pl-8 pr-3 py-2 rounded-xl border bg-card text-sm outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
      )}

      {/* Entries */}
      {groups.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm">
          <p className="text-2xl mb-2">📝</p>
          <p>No entries yet — log your first interaction above.</p>
        </div>
      ) : (
        groups.map(group => (
          <div key={group.label}>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">{group.label}</p>
            <div className="space-y-2">
              {group.entries.map(entry => {
                const ids: number[] = JSON.parse(entry.personIdsJson ?? "[]");
                const entryPeople = ids.map(id => peopleById.get(id)).filter(Boolean) as PersonWithSpouse[];
                const type = INTERACTION_TYPES.find(t => t.key === entry.interactionType) ?? INTERACTION_TYPES.find(t => t.key === "note")!;
                const typeLabel = entry.interactionType === "custom" && entry.customType ? entry.customType : type.label;
                return (
                  <div key={entry.id} className="rounded-xl border bg-card px-4 py-3 space-y-2 group">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{type.icon}</span>
                        <div>
                          <p className="text-sm font-semibold">{typeLabel}</p>
                          {entry.note && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{entry.note}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-muted-foreground">{format(new Date(entry.date), "MMM d, yyyy")}</span>
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                          <button onClick={() => { setEditEntry(entry); setShowModal(true); }}
                            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                            <Pencil size={12} />
                          </button>
                          <button onClick={() => deleteEntry(entry.id)}
                            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                    {entryPeople.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {entryPeople.map(p => (
                          <span key={p.id} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary text-xs font-medium">
                            <div className="w-4 h-4 rounded-full bg-primary/15 flex items-center justify-center text-[9px] font-bold text-primary shrink-0">
                              {p.firstName[0]}
                            </div>
                            {fullName(p)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      {(showModal || editEntry) && (
        <AddNoteModal
          people={people}
          onClose={() => { setShowModal(false); setEditEntry(null); }}
          onSaved={() => qc.invalidateQueries({ queryKey: ["/api/timeline"] })}
          editEntry={editEntry}
        />
      )}
    </div>
  );
}

// ── Keep in Touch Section ─────────────────────────────────────────────────────

const KIT_FREQUENCIES = [
  { key: "week",     label: "Every week",      days: 7   },
  { key: "2weeks",   label: "Every 2 weeks",   days: 14  },
  { key: "month",    label: "Every month",     days: 30  },
  { key: "6weeks",   label: "Every 6 weeks",   days: 42  },
  { key: "3months",  label: "Every 3 months",  days: 90  },
  { key: "6months",  label: "Every 6 months",  days: 182 },
  { key: "year",     label: "Every year",      days: 365 },
  { key: "never",    label: "Don't keep in touch", days: null },
] as const;

type KitFrequency = typeof KIT_FREQUENCIES[number]["key"];

function nextContactDate(lastContacted: string | null | undefined, days: number): Date {
  const base = lastContacted ? new Date(lastContacted) : new Date();
  return new Date(base.getTime() + days * 86400000);
}

function formatNextContact(d: Date): string {
  return format(d, "MMM d, yyyy");
}

function KeepInTouchSection({ people }: { people: PersonWithSpouse[] }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(["never"]));
  const [settingFreq, setSettingFreq] = useState<number | null>(null); // person id whose frequency is being changed
  const [addingToFreq, setAddingToFreq] = useState<string | null>(null); // freq key for "Add contact" picker
  const [pickerSearch, setPickerSearch] = useState("");

  async function setFrequency(personId: number, freq: KitFrequency | null) {
    try {
      await fetch(`/api/people/${personId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keepInTouchFrequency: freq }),
      });
      qc.invalidateQueries({ queryKey: ["/api/people"] });
      setSettingFreq(null);
      setAddingToFreq(null);
      setPickerSearch("");
    } catch {
      toast({ title: "Failed to update", variant: "destructive" });
    }
  }

  async function markContacted(personId: number) {
    try {
      await fetch(`/api/people/${personId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lastContactedAt: new Date().toISOString().slice(0, 10) }),
      });
      qc.invalidateQueries({ queryKey: ["/api/people"] });
      toast({ title: "Marked as contacted today" });
    } catch {
      toast({ title: "Failed to update", variant: "destructive" });
    }
  }

  function toggleSection(key: string) {
    setCollapsed(prev => {
      const n = new Set(prev);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
  }

  const categorized = KIT_FREQUENCIES.reduce<Record<string, PersonWithSpouse[]>>((acc, f) => {
    acc[f.key] = people.filter(p => (p as any).keepInTouchFrequency === f.key);
    return acc;
  }, {});

  return (
    <div className="space-y-1">
      {[...KIT_FREQUENCIES].map(freq => {
        const group = categorized[freq.key] ?? [];
        const isCollapsed = collapsed.has(freq.key);
        // People not already in this group, available to add
        const available = people.filter(p => (p as any).keepInTouchFrequency !== freq.key);
        const filteredAvailable = pickerSearch
          ? available.filter(p => fullName(p).toLowerCase().includes(pickerSearch.toLowerCase()))
          : available;

        return (
          <div key={freq.key}>
            <button
              onClick={() => toggleSection(freq.key)}
              className="w-full flex items-center justify-between py-2.5 px-1 hover:bg-muted/30 rounded-lg transition-colors group"
            >
              <span className="text-sm font-semibold">{freq.label}</span>
              <div className="flex items-center gap-3">
                {!isCollapsed && (
                  <button
                    onClick={e => { e.stopPropagation(); setAddingToFreq(addingToFreq === freq.key ? null : freq.key); setPickerSearch(""); }}
                    className="text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity hover:underline"
                  >
                    + Add contact
                  </button>
                )}
                <ChevronDown size={14} className={`text-muted-foreground transition-transform ${isCollapsed ? "" : "rotate-180"}`} />
              </div>
            </button>

            {!isCollapsed && (
              <div className="ml-1 mb-1">
                {group.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-1.5 px-2">No contacts — click "+ Add contact" to add someone</p>
                ) : (
                  <div className="divide-y divide-border rounded-xl border overflow-hidden">
                    {group.map(p => {
                      const freqDays = KIT_FREQUENCIES.find(f => f.key === freq.key)?.days ?? null;
                      const next = freqDays ? nextContactDate((p as any).lastContactedAt, freqDays) : null;
                      return (
                        <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 bg-card hover:bg-muted/20 transition-colors">
                          {(p as any).avatarUrl ? (
                            <img src={(p as any).avatarUrl} alt={fullName(p)} className="w-8 h-8 rounded-full object-cover shrink-0" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                              {initials(p.firstName, p.lastName)}
                            </div>
                          )}
                          <span className="flex-1 text-sm font-medium truncate">{fullName(p)}</span>
                          <div className="flex items-center gap-2 shrink-0">
                            {next && (
                              <span className={`text-xs ${next < new Date() ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                                {next < new Date() ? "Overdue" : formatNextContact(next)}
                              </span>
                            )}
                            <button
                              onClick={() => markContacted(p.id)}
                              title="Mark as contacted today"
                              className="text-xs px-2 py-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium"
                            >
                              ✓
                            </button>
                            <button
                              onClick={() => setSettingFreq(settingFreq === p.id ? null : p.id)}
                              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                              title="Change frequency"
                            >
                              ···
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Frequency change picker */}
            {group.map(p => settingFreq === p.id && (
              <div key={`picker-${p.id}`} className="ml-1 mb-2 rounded-xl border bg-card p-3 space-y-1">
                <p className="text-xs font-semibold text-muted-foreground mb-2">Keep in touch with {p.firstName}:</p>
                <div className="flex flex-wrap gap-1.5">
                  {KIT_FREQUENCIES.map(f => (
                    <button
                      key={f.key}
                      onClick={() => setFrequency(p.id, f.key)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${(p as any).keepInTouchFrequency === f.key ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted/50"}`}
                    >
                      {f.label}
                    </button>
                  ))}
                  {(p as any).keepInTouchFrequency && (
                    <button onClick={() => setFrequency(p.id, null as any)} className="text-xs px-2.5 py-1 rounded-full border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors">
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* Add contact picker */}
            {addingToFreq === freq.key && (
              <div className="ml-1 mb-2 rounded-xl border bg-card p-3">
                <p className="text-xs font-semibold text-muted-foreground mb-2">Add someone to "{freq.label}":</p>
                <input
                  autoFocus
                  type="text"
                  placeholder="Search contacts…"
                  value={pickerSearch}
                  onChange={e => setPickerSearch(e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 rounded-lg border bg-background mb-2 outline-none focus:ring-1 focus:ring-primary"
                />
                {filteredAvailable.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-2">No contacts found</p>
                ) : (
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {filteredAvailable.map(p => (
                      <button
                        key={p.id}
                        onClick={() => setFrequency(p.id, freq.key as KitFrequency)}
                        className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-muted/50 transition-colors text-left"
                      >
                        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary text-[10px] font-bold shrink-0">
                          {initials(p.firstName, p.lastName)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{fullName(p)}</p>
                          {(p as any).keepInTouchFrequency && (
                            <p className="text-[10px] text-muted-foreground">
                              Currently: {KIT_FREQUENCIES.find(f => f.key === (p as any).keepInTouchFrequency)?.label}
                            </p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => { setAddingToFreq(null); setPickerSearch(""); }}
                  className="mt-2 w-full text-xs text-muted-foreground hover:text-foreground text-center py-1"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Personal Assistant Section ────────────────────────────────────────────────

const ACCOUNT_GROUPS = [
  {
    label: "Contact Import",
    items: [
      { id: "linkedin", name: "LinkedIn",        icon: "in", color: "#0077b5", desc: "Import connections & work history" },
      { id: "google",   name: "Google Contacts", icon: "G",  color: "#4285f4", desc: "Sync your Google contacts & birthdays" },
    ],
  },
];

const STORAGE_KEY = "pa_connected_accounts";

function AccountIcon({ icon, color }: { icon: string; color: string }) {
  const isEmoji = /\p{Emoji}/u.test(icon) && icon.length <= 2;
  return (
    <div
      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-bold text-white text-sm shadow-sm"
      style={{ background: color }}
    >
      {isEmoji ? <span className="text-lg">{icon}</span> : icon}
    </div>
  );
}

function LinkedInPanel({ onDisconnect }: { onDisconnect: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: status, isLoading } = useQuery<{
    connected: boolean; configured: boolean;
    profile: { name: string; headline: string | null; avatarUrl: string | null; email: string | null } | null;
    contactCount: number;
  }>({
    queryKey: ["/api/linkedin/status"],
    queryFn: () => fetch("/api/linkedin/status").then(r => r.json()),
    refetchOnWindowFocus: true,
  });

  const { data: contacts = [] } = useQuery<Array<{ id: number; firstName: string; lastName: string | null; email: string | null; company: string | null; position: string | null }>>({
    queryKey: ["/api/linkedin/contacts"],
    queryFn: () => fetch("/api/linkedin/contacts").then(r => r.json()),
    enabled: (status?.contactCount ?? 0) > 0,
  });

  const disconnectMut = useMutation({
    mutationFn: () => fetch("/api/linkedin/disconnect", { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/linkedin/status"] });
      qc.invalidateQueries({ queryKey: ["/api/linkedin/contacts"] });
      onDisconnect();
      toast({ title: "LinkedIn disconnected" });
    },
  });

  const [csvText, setCsvText] = useState("");
  const [importing, setImporting] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleCsvFile(file: File) {
    const text = await file.text();
    setCsvText(text);
    setShowCsvImport(true);
  }

  async function importCsv() {
    if (!csvText) return;
    setImporting(true);
    try {
      const r = await fetch("/api/linkedin/import-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvText }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Import failed");
      toast({ title: `Imported ${d.imported} contacts` });
      qc.invalidateQueries({ queryKey: ["/api/linkedin/status"] });
      qc.invalidateQueries({ queryKey: ["/api/linkedin/contacts"] });
      setShowCsvImport(false);
      setCsvText("");
    } catch (e: any) {
      toast({ title: e.message ?? "Import failed", variant: "destructive" });
    } finally {
      setImporting(false);
    }
  }

  if (isLoading) return <div className="flex justify-center py-10"><div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  const profile = status?.profile;
  const hasContacts = (status?.contactCount ?? 0) > 0;

  return (
    <div className="space-y-4">
      {/* Profile card */}
      {profile && (
        <div className="flex items-center gap-3 p-3 rounded-xl border-2 border-[#0077b5]/30 bg-[#0077b5]/5">
          {profile.avatarUrl ? (
            <img src={profile.avatarUrl} alt={profile.name} className="w-10 h-10 rounded-full object-cover border-2 border-[#0077b5]/40 shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-[#0077b5] flex items-center justify-center text-white font-bold shrink-0">
              {profile.name[0]}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">{profile.name}</p>
            {profile.email && <p className="text-xs text-muted-foreground">{profile.email}</p>}
          </div>
          <CheckCircle2 className="text-green-500 shrink-0" size={16} />
        </div>
      )}

      {/* Import CTA — prominent when no contacts yet */}
      {!hasContacts && !showCsvImport && (
        <div className="rounded-xl border-2 border-[#0077b5]/30 bg-[#0077b5]/5 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#0077b5] flex items-center justify-center text-white font-bold text-sm shrink-0">in</div>
            <div>
              <p className="font-semibold text-sm">Import your LinkedIn network</p>
              <p className="text-xs text-muted-foreground mt-0.5">LinkedIn restricts direct API access to connections, but you can export them as a CSV in seconds.</p>
            </div>
          </div>
          <div className="space-y-2">
            {[
              { n: 1, text: "Go to LinkedIn → Me → Settings & Privacy" },
              { n: 2, text: 'Click "Data privacy" → "Get a copy of your data"' },
              { n: 3, text: 'Select "Connections" only and request the export' },
              { n: 4, text: "LinkedIn emails you a link — download Connections.csv" },
              { n: 5, text: "Upload it below" },
            ].map(s => (
              <div key={s.n} className="flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-full bg-[#0077b5] text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{s.n}</div>
                <p className="text-xs text-foreground/80">{s.text}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <a
              href="https://www.linkedin.com/mypreferences/d/download-my-data"
              target="_blank"
              rel="noreferrer"
              className="flex-1 py-2.5 rounded-lg bg-[#0077b5] text-white text-sm font-semibold hover:bg-[#006097] transition-colors text-center"
            >
              Open LinkedIn Export →
            </a>
            <button
              onClick={() => setShowCsvImport(true)}
              className="flex-1 py-2.5 rounded-lg border text-sm font-medium hover:bg-muted/40 transition-colors"
            >
              I have the CSV
            </button>
          </div>
        </div>
      )}

      {/* CSV upload area */}
      {(showCsvImport || hasContacts) && (
        <div className={`rounded-xl border bg-card p-4 space-y-3 ${!hasContacts ? "border-[#0077b5]/40" : ""}`}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">{hasContacts ? "Import more contacts" : "Upload your Connections.csv"}</p>
            {hasContacts && (
              <span className="text-xs text-[#0077b5] font-medium">{status?.contactCount} imported</span>
            )}
          </div>
          {!hasContacts && (
            <p className="text-xs text-muted-foreground">
              Upload the <strong>Connections.csv</strong> file from your LinkedIn data export.{" "}
              <a href="https://www.linkedin.com/mypreferences/d/download-my-data" target="_blank" rel="noreferrer" className="text-primary hover:underline">
                Request export →
              </a>
            </p>
          )}
          <input ref={fileRef} type="file" accept=".csv" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleCsvFile(f); }} />
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full py-2.5 rounded-lg border-2 border-dashed border-border hover:border-[#0077b5] hover:bg-[#0077b5]/5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {csvText ? "✓ File loaded — ready to import" : "Choose Connections.csv…"}
          </button>
          {csvText && (
            <button
              onClick={importCsv}
              disabled={importing}
              className="w-full py-2.5 rounded-lg bg-[#0077b5] text-white text-sm font-semibold hover:bg-[#006097] transition-colors disabled:opacity-50"
            >
              {importing ? "Importing…" : "Import Contacts"}
            </button>
          )}
        </div>
      )}

      {/* Contact list */}
      {contacts.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">Connections</p>
          <div className="rounded-xl border overflow-hidden divide-y divide-border max-h-64 overflow-y-auto">
            {contacts.slice(0, 50).map(c => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="w-8 h-8 rounded-full bg-[#0077b5]/15 flex items-center justify-center text-[#0077b5] font-semibold text-xs shrink-0">
                  {c.firstName[0]}{c.lastName?.[0] ?? ""}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{c.firstName} {c.lastName}</p>
                  {(c.position || c.company) && (
                    <p className="text-xs text-muted-foreground truncate">{[c.position, c.company].filter(Boolean).join(" · ")}</p>
                  )}
                </div>
              </div>
            ))}
            {contacts.length > 50 && (
              <div className="px-4 py-2 text-xs text-muted-foreground text-center">+{contacts.length - 50} more</div>
            )}
          </div>
        </div>
      )}

      {/* Disconnect */}
      <button
        onClick={() => disconnectMut.mutate()}
        disabled={disconnectMut.isPending}
        className="text-xs text-muted-foreground hover:text-destructive transition-colors"
      >
        Disconnect LinkedIn
      </button>
    </div>
  );
}

function FacebookPanel({ onDisconnect }: { onDisconnect: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: status, isLoading } = useQuery<{
    connected: boolean; configured: boolean;
    profile: { name: string; email: string | null; avatarUrl: string | null; birthday: string | null; lastSync: string | null } | null;
    friendCount: number; birthdayCount: number;
  }>({
    queryKey: ["/api/facebook/status"],
    queryFn: () => fetch("/api/facebook/status").then(r => r.json()),
    refetchOnWindowFocus: true,
  });

  const { data: friends = [] } = useQuery<Array<{ id: number; fbFriendId: string; name: string; birthday: string | null; avatarUrl: string | null; location: string | null }>>({
    queryKey: ["/api/facebook/friends"],
    queryFn: () => fetch("/api/facebook/friends").then(r => r.json()),
    enabled: (status?.friendCount ?? 0) > 0 || (status?.birthdayCount ?? 0) > 0,
  });

  const syncMut = useMutation({
    mutationFn: () => fetch("/api/facebook/sync", { method: "POST" }).then(r => r.json()),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["/api/facebook/status"] });
      qc.invalidateQueries({ queryKey: ["/api/facebook/friends"] });
      toast({ title: `Synced — ${d.friendCount + d.bdayCount} contacts updated` });
    },
    onError: () => toast({ title: "Sync failed", variant: "destructive" }),
  });

  const disconnectMut = useMutation({
    mutationFn: () => fetch("/api/facebook/disconnect", { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/facebook/status"] });
      qc.invalidateQueries({ queryKey: ["/api/facebook/friends"] });
      onDisconnect();
      toast({ title: "Facebook disconnected" });
    },
  });

  const [filter, setFilter] = useState<"all" | "birthday">("all");

  if (isLoading) return <div className="flex justify-center py-10"><div className="w-5 h-5 border-2 border-[#1877f2] border-t-transparent rounded-full animate-spin" /></div>;

  const profile = status?.profile;
  const displayed = filter === "birthday" ? friends.filter(f => f.birthday) : friends;

  // Group friends with birthdays by upcoming month
  const today = new Date();
  const upcomingBirthdays = friends
    .filter(f => f.birthday)
    .map(f => {
      const [mm, dd] = (f.birthday!).split("/").map(Number);
      const next = new Date(today.getFullYear(), mm - 1, dd);
      if (next < today) next.setFullYear(today.getFullYear() + 1);
      const daysAway = Math.round((next.getTime() - today.getTime()) / 86400000);
      return { ...f, daysAway, monthDay: `${String(mm).padStart(2,"0")}/${String(dd).padStart(2,"0")}` };
    })
    .sort((a, b) => a.daysAway - b.daysAway)
    .slice(0, 10);

  return (
    <div className="space-y-4">
      {/* Profile card */}
      {profile && (
        <div className="flex items-center gap-4 p-4 rounded-xl border-2 border-[#1877f2]/30 bg-[#1877f2]/5">
          {profile.avatarUrl ? (
            <img src={profile.avatarUrl} alt={profile.name} className="w-14 h-14 rounded-full object-cover border-2 border-[#1877f2]/40" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-[#1877f2] flex items-center justify-center text-white font-bold text-xl">{profile.name[0]}</div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-base">{profile.name}</p>
            {profile.email && <p className="text-xs text-muted-foreground">{profile.email}</p>}
            {profile.birthday && <p className="text-xs text-muted-foreground">🎂 Your birthday: {profile.birthday}</p>}
          </div>
          <CheckCircle2 className="text-green-500 shrink-0" size={20} />
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border bg-card p-3 text-center">
          <p className="text-2xl font-bold text-[#1877f2]">{status?.friendCount ?? 0}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Friends imported</p>
        </div>
        <div className="rounded-xl border bg-card p-3 text-center">
          <p className="text-2xl font-bold text-amber-500">🎂 {status?.birthdayCount ?? 0}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Birthdays found</p>
        </div>
      </div>

      {/* Upcoming birthdays */}
      {upcomingBirthdays.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">🎂 Upcoming Birthdays</p>
          <div className="rounded-xl border overflow-hidden divide-y divide-border">
            {upcomingBirthdays.map(f => (
              <div key={f.id} className="flex items-center gap-3 px-4 py-2.5">
                {f.avatarUrl ? (
                  <img src={f.avatarUrl} alt={f.name} className="w-9 h-9 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-[#1877f2]/15 flex items-center justify-center text-[#1877f2] font-semibold text-sm shrink-0">
                    {f.name[0]}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{f.name}</p>
                  <p className="text-xs text-muted-foreground">{f.birthday}</p>
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                  f.daysAway === 0 ? "bg-amber-100 text-amber-700" :
                  f.daysAway <= 7 ? "bg-orange-100 text-orange-700" :
                  "bg-muted text-muted-foreground"
                }`}>
                  {f.daysAway === 0 ? "Today! 🎉" : f.daysAway === 1 ? "Tomorrow" : `${f.daysAway}d`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All friends list with filter */}
      {friends.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">Friends</p>
            <div className="flex gap-1 p-0.5 bg-secondary rounded-lg">
              {(["all", "birthday"] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${filter === f ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
                  {f === "all" ? `All (${friends.length})` : `🎂 Birthdays (${friends.filter(x => x.birthday).length})`}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-xl border overflow-hidden divide-y divide-border max-h-72 overflow-y-auto">
            {displayed.slice(0, 50).map(f => (
              <div key={f.id} className="flex items-center gap-3 px-4 py-2.5">
                {f.avatarUrl ? (
                  <img src={f.avatarUrl} alt={f.name} className="w-8 h-8 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-[#1877f2]/10 flex items-center justify-center text-[#1877f2] text-xs font-bold shrink-0">{f.name[0]}</div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{f.name}</p>
                  {f.location && <p className="text-xs text-muted-foreground truncate">{f.location}</p>}
                </div>
                {f.birthday && <span className="text-xs text-amber-600 shrink-0">🎂 {f.birthday}</span>}
              </div>
            ))}
            {displayed.length > 50 && (
              <div className="px-4 py-2 text-xs text-muted-foreground text-center">+{displayed.length - 50} more</div>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-1">
        <button onClick={() => syncMut.mutate()} disabled={syncMut.isPending}
          className="text-xs text-primary font-medium hover:underline disabled:opacity-50">
          {syncMut.isPending ? "Syncing…" : "↻ Sync now"}
        </button>
        {status?.profile?.lastSync && (
          <span className="text-xs text-muted-foreground">Last sync: {new Date(status.profile.lastSync).toLocaleDateString()}</span>
        )}
        <button onClick={() => disconnectMut.mutate()} disabled={disconnectMut.isPending}
          className="text-xs text-muted-foreground hover:text-destructive transition-colors">
          Disconnect
        </button>
      </div>
    </div>
  );
}

function GoogleContactsPanel({ onDisconnect }: { onDisconnect: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: status, isLoading } = useQuery<{
    connected: boolean; configured: boolean;
    contactCount: number; birthdayCount: number; lastSync: string | null;
  }>({
    queryKey: ["/api/gcontacts/status"],
    queryFn: () => fetch("/api/gcontacts/status").then(r => r.json()),
    refetchOnWindowFocus: true,
  });

  const { data: contacts = [] } = useQuery<Array<{ id: number; firstName: string | null; lastName: string | null; email: string | null; phone: string | null; birthday: string | null; avatarUrl: string | null; company: string | null }>>({
    queryKey: ["/api/gcontacts/contacts"],
    queryFn: () => fetch("/api/gcontacts/contacts").then(r => r.json()),
    enabled: (status?.contactCount ?? 0) > 0,
  });

  const syncMut = useMutation({
    mutationFn: () => fetch("/api/gcontacts/sync", { method: "POST" }).then(r => r.json()),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["/api/gcontacts/status"] });
      qc.invalidateQueries({ queryKey: ["/api/gcontacts/contacts"] });
      toast({ title: `Synced — ${d.contactCount} contacts updated` });
    },
    onError: () => toast({ title: "Sync failed", variant: "destructive" }),
  });

  const disconnectMut = useMutation({
    mutationFn: () => fetch("/api/gcontacts/disconnect", { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/gcontacts/status"] });
      qc.invalidateQueries({ queryKey: ["/api/gcontacts/contacts"] });
      onDisconnect();
      toast({ title: "Google Contacts disconnected" });
    },
  });

  const [filter, setFilter] = useState<"all" | "birthday">("all");

  if (isLoading) return <div className="flex justify-center py-10"><div className="w-5 h-5 border-2 border-[#4285f4] border-t-transparent rounded-full animate-spin" /></div>;

  const today = new Date();
  const upcomingBirthdays = contacts
    .filter(c => c.birthday)
    .map(c => {
      const bday = c.birthday!;
      // Handle YYYY-MM-DD or MM-DD
      const parts = bday.split("-");
      let mm: number, dd: number;
      if (parts.length === 3) { mm = parseInt(parts[1]); dd = parseInt(parts[2]); }
      else { mm = parseInt(parts[0]); dd = parseInt(parts[1]); }
      const next = new Date(today.getFullYear(), mm - 1, dd);
      if (next < today) next.setFullYear(today.getFullYear() + 1);
      const daysAway = Math.round((next.getTime() - today.getTime()) / 86400000);
      return { ...c, daysAway, displayBday: `${String(mm).padStart(2,"0")}/${String(dd).padStart(2,"0")}` };
    })
    .sort((a, b) => a.daysAway - b.daysAway)
    .slice(0, 10);

  const displayed = filter === "birthday" ? contacts.filter(c => c.birthday) : contacts;

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border bg-card p-3 text-center">
          <p className="text-2xl font-bold text-[#4285f4]">{status?.contactCount ?? 0}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Contacts imported</p>
        </div>
        <div className="rounded-xl border bg-card p-3 text-center">
          <p className="text-2xl font-bold text-amber-500">🎂 {status?.birthdayCount ?? 0}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Birthdays found</p>
        </div>
      </div>

      {/* Upcoming birthdays */}
      {upcomingBirthdays.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">🎂 Upcoming Birthdays</p>
          <div className="rounded-xl border overflow-hidden divide-y divide-border">
            {upcomingBirthdays.map(c => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                {c.avatarUrl ? (
                  <img src={c.avatarUrl} alt={`${c.firstName}`} className="w-9 h-9 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-[#4285f4]/15 flex items-center justify-center text-[#4285f4] font-semibold text-sm shrink-0">
                    {c.firstName?.[0] ?? "?"}{c.lastName?.[0] ?? ""}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{[c.firstName, c.lastName].filter(Boolean).join(" ")}</p>
                  <p className="text-xs text-muted-foreground">{c.displayBday}</p>
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                  c.daysAway === 0 ? "bg-amber-100 text-amber-700" :
                  c.daysAway <= 7 ? "bg-orange-100 text-orange-700" :
                  "bg-muted text-muted-foreground"
                }`}>
                  {c.daysAway === 0 ? "Today! 🎉" : c.daysAway === 1 ? "Tomorrow" : `${c.daysAway}d`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contacts list */}
      {contacts.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">Contacts</p>
            <div className="flex gap-1 p-0.5 bg-secondary rounded-lg">
              {(["all", "birthday"] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${filter === f ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
                  {f === "all" ? `All (${contacts.length})` : `🎂 Birthdays (${contacts.filter(c => c.birthday).length})`}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-xl border overflow-hidden divide-y divide-border max-h-72 overflow-y-auto">
            {displayed.slice(0, 50).map(c => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                {c.avatarUrl ? (
                  <img src={c.avatarUrl} alt={`${c.firstName}`} className="w-8 h-8 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-[#4285f4]/10 flex items-center justify-center text-[#4285f4] text-xs font-bold shrink-0">
                    {c.firstName?.[0] ?? "?"}{c.lastName?.[0] ?? ""}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{[c.firstName, c.lastName].filter(Boolean).join(" ") || "Unknown"}</p>
                  {(c.email || c.company) && (
                    <p className="text-xs text-muted-foreground truncate">{[c.email, c.company].filter(Boolean).join(" · ")}</p>
                  )}
                </div>
                {c.birthday && <span className="text-xs text-amber-600 shrink-0">🎂</span>}
              </div>
            ))}
            {displayed.length > 50 && (
              <div className="px-4 py-2 text-xs text-muted-foreground text-center">+{displayed.length - 50} more</div>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-1">
        <button onClick={() => syncMut.mutate()} disabled={syncMut.isPending}
          className="text-xs text-primary font-medium hover:underline disabled:opacity-50">
          {syncMut.isPending ? "Syncing…" : "↻ Sync now"}
        </button>
        {status?.lastSync && (
          <span className="text-xs text-muted-foreground">Last sync: {new Date(status.lastSync).toLocaleDateString()}</span>
        )}
        <button onClick={() => disconnectMut.mutate()} disabled={disconnectMut.isPending}
          className="text-xs text-muted-foreground hover:text-destructive transition-colors">
          Disconnect
        </button>
      </div>
    </div>
  );
}

function PersonalAssistantSection() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [localConnected, setLocalConnected] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]")); }
    catch { return new Set(); }
  });
  const [screen, setScreen] = useState<"connect" | "assistant">("connect");
  const [linkedinExpanded, setLinkedinExpanded] = useState(false);
  const [facebookExpanded, setFacebookExpanded] = useState(false);
  const [googleExpanded, setGoogleExpanded] = useState(false);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  // Check real LinkedIn + Facebook + Google status on mount
  const { data: linkedinStatus } = useQuery<{ connected: boolean; contactCount: number }>({
    queryKey: ["/api/linkedin/status"],
    queryFn: () => fetch("/api/linkedin/status").then(r => r.json()),
    refetchOnWindowFocus: true,
  });

  const { data: facebookStatus } = useQuery<{ connected: boolean; friendCount: number; birthdayCount: number }>({
    queryKey: ["/api/facebook/status"],
    queryFn: () => fetch("/api/facebook/status").then(r => r.json()),
    refetchOnWindowFocus: true,
  });

  const { data: googleStatus } = useQuery<{ connected: boolean; contactCount: number; birthdayCount: number; lastSync: string | null }>({
    queryKey: ["/api/gcontacts/status"],
    queryFn: () => fetch("/api/gcontacts/status").then(r => r.json()),
    refetchOnWindowFocus: true,
  });

  // Sync real statuses into localConnected + handle redirect params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const liStatus = params.get("linkedin");
    if (liStatus === "connected") {
      setLocalConnected(prev => { const n = new Set(prev); n.add("linkedin"); localStorage.setItem(STORAGE_KEY, JSON.stringify([...n])); return n; });
      setScreen("assistant");
      setLinkedinExpanded(true);
      window.history.replaceState({}, "", window.location.pathname);
    } else if (params.get("facebook") === "connected") {
      setLocalConnected(prev => { const n = new Set(prev); n.add("facebook"); localStorage.setItem(STORAGE_KEY, JSON.stringify([...n])); return n; });
      setScreen("assistant");
      setFacebookExpanded(true);
      window.history.replaceState({}, "", window.location.pathname);
    } else if (params.get("google") === "connected") {
      setLocalConnected(prev => { const n = new Set(prev); n.add("google"); localStorage.setItem(STORAGE_KEY, JSON.stringify([...n])); return n; });
      setScreen("assistant");
      setGoogleExpanded(true);
      window.history.replaceState({}, "", window.location.pathname);
    } else if (liStatus === "error" || params.get("facebook") === "error" || params.get("google") === "error") {
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (linkedinStatus?.connected) {
      setLocalConnected(prev => { const n = new Set(prev); n.add("linkedin"); localStorage.setItem(STORAGE_KEY, JSON.stringify([...n])); return n; });
      // Auto-expand LinkedIn panel if connected but no contacts imported yet
      if (linkedinStatus.contactCount === 0) setLinkedinExpanded(true);
    }
    if (facebookStatus?.connected) {
      setLocalConnected(prev => { const n = new Set(prev); n.add("facebook"); localStorage.setItem(STORAGE_KEY, JSON.stringify([...n])); return n; });
    }
    if (googleStatus?.connected) {
      setLocalConnected(prev => { const n = new Set(prev); n.add("google"); localStorage.setItem(STORAGE_KEY, JSON.stringify([...n])); return n; });
    }
  }, [linkedinStatus, facebookStatus, googleStatus]);

  // If any real account is connected, start on assistant screen
  useEffect(() => {
    if (localConnected.size > 0) setScreen("assistant");
  }, []);

  function toggle(id: string) {
    if (id === "linkedin") { window.location.href = "/api/linkedin/connect"; return; }
    if (id === "facebook") { window.location.href = "/api/facebook/connect"; return; }
    if (id === "google") { window.location.href = "/api/gcontacts/connect"; return; }
    // Others: local toggle (UI placeholder)
    setLocalConnected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      return next;
    });
  }

  const isLinkedinConnected = linkedinStatus?.connected || localConnected.has("linkedin");
  const isFacebookConnected = facebookStatus?.connected || localConnected.has("facebook");
  const isGoogleConnected = googleStatus?.connected || localConnected.has("google");

  if (screen === "assistant") {
    const allItems = ACCOUNT_GROUPS.flatMap(g => g.items);
    const connectedItems = allItems.filter(a => {
      if (a.id === "linkedin") return isLinkedinConnected;
      if (a.id === "facebook") return isFacebookConnected;
      if (a.id === "google") return isGoogleConnected;
      return localConnected.has(a.id);
    });
    return (
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
              <Bot className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Personal Assistant</h2>
              <p className="text-xs text-muted-foreground">{connectedItems.length} account{connectedItems.length !== 1 ? "s" : ""} connected</p>
            </div>
          </div>
          <button onClick={() => setScreen("connect")}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 px-3 py-1.5 rounded-lg border hover:bg-secondary transition-colors">
            <Plug size={12} /> Manage
          </button>
        </div>

        {/* LinkedIn expanded panel */}
        {isLinkedinConnected && (
          <div className="rounded-xl border overflow-hidden">
            <button
              onClick={() => setLinkedinExpanded(v => !v)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
            >
              <div className="w-8 h-8 rounded-lg bg-[#0077b5] flex items-center justify-center text-white font-bold text-sm shrink-0">in</div>
              <div className="flex-1 text-left">
                <p className="text-sm font-semibold">LinkedIn</p>
                <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                  <CheckCircle2 size={10} /> Connected{linkedinStatus?.contactCount ? ` · ${linkedinStatus.contactCount} contacts` : ""}
                </p>
              </div>
              <ChevronDown size={14} className={`text-muted-foreground transition-transform ${linkedinExpanded ? "rotate-180" : ""}`} />
            </button>
            {linkedinExpanded && (
              <div className="px-4 pb-4 border-t">
                <div className="pt-4">
                  <LinkedInPanel onDisconnect={() => {
                    setLocalConnected(prev => { const n = new Set(prev); n.delete("linkedin"); localStorage.setItem(STORAGE_KEY, JSON.stringify([...n])); return n; });
                    if (connectedItems.length <= 1) setScreen("connect");
                  }} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Facebook expanded panel */}
        {isFacebookConnected && (
          <div className="rounded-xl border overflow-hidden">
            <button onClick={() => setFacebookExpanded(v => !v)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
              <div className="w-8 h-8 rounded-lg bg-[#1877f2] flex items-center justify-center text-white font-bold text-sm shrink-0">f</div>
              <div className="flex-1 text-left">
                <p className="text-sm font-semibold">Facebook</p>
                <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                  <CheckCircle2 size={10} /> Connected
                  {facebookStatus?.friendCount ? ` · ${facebookStatus.friendCount} friends` : ""}
                  {facebookStatus?.birthdayCount ? ` · 🎂 ${facebookStatus.birthdayCount} birthdays` : ""}
                </p>
              </div>
              <ChevronDown size={14} className={`text-muted-foreground transition-transform ${facebookExpanded ? "rotate-180" : ""}`} />
            </button>
            {facebookExpanded && (
              <div className="px-4 pb-4 border-t pt-4">
                <FacebookPanel onDisconnect={() => {
                  setLocalConnected(prev => { const n = new Set(prev); n.delete("facebook"); localStorage.setItem(STORAGE_KEY, JSON.stringify([...n])); return n; });
                  if (connectedItems.length <= 1) setScreen("connect");
                }} />
              </div>
            )}
          </div>
        )}

        {/* Google Contacts expanded panel */}
        {isGoogleConnected && (
          <div className="rounded-xl border overflow-hidden">
            <button onClick={() => setGoogleExpanded(v => !v)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
              <div className="w-8 h-8 rounded-lg bg-[#4285f4] flex items-center justify-center text-white font-bold text-sm shrink-0">G</div>
              <div className="flex-1 text-left">
                <p className="text-sm font-semibold">Google Contacts</p>
                <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                  <CheckCircle2 size={10} /> Connected
                  {googleStatus?.contactCount ? ` · ${googleStatus.contactCount} contacts` : ""}
                  {googleStatus?.birthdayCount ? ` · 🎂 ${googleStatus.birthdayCount} birthdays` : ""}
                </p>
              </div>
              <ChevronDown size={14} className={`text-muted-foreground transition-transform ${googleExpanded ? "rotate-180" : ""}`} />
            </button>
            {googleExpanded && (
              <div className="px-4 pb-4 border-t pt-4">
                <GoogleContactsPanel onDisconnect={() => {
                  setLocalConnected(prev => { const n = new Set(prev); n.delete("google"); localStorage.setItem(STORAGE_KEY, JSON.stringify([...n])); return n; });
                  if (connectedItems.length <= 1) setScreen("connect");
                }} />
              </div>
            )}
          </div>
        )}

        {/* Other connected accounts (non-real-API ones) */}
        {connectedItems.filter(a => !["linkedin", "facebook", "google"].includes(a.id)).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {connectedItems.filter(a => !["linkedin", "facebook", "google"].includes(a.id)).map(a => (
              <div key={a.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-full border bg-card text-xs font-medium">
                <div className="w-4 h-4 rounded-sm flex items-center justify-center text-white text-[8px] font-bold shrink-0" style={{ background: a.color }}>
                  {/\p{Emoji}/u.test(a.icon) ? a.icon : a.icon[0]}
                </div>
                {a.name}
                <CheckCircle2 size={11} className="text-green-500" />
              </div>
            ))}
          </div>
        )}

        {/* Coming soon placeholder */}
        <div className="rounded-2xl border-2 border-dashed border-border bg-muted/20 p-8 flex flex-col items-center gap-3 text-center">
          <div className="w-12 h-12 rounded-2xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-violet-500" />
          </div>
          <div>
            <p className="font-semibold">Your assistant is getting ready</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs">
              Smart suggestions, relationship insights, birthday reminders — coming soon.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Connect screen ──────────────────────────────────────────────────────────

  async function handleDisconnect(id: string) {
    setDisconnecting(id);
    try {
      if (id === "linkedin") {
        await fetch("/api/linkedin/disconnect", { method: "DELETE" });
        qc.invalidateQueries({ queryKey: ["/api/linkedin/status"] });
        qc.invalidateQueries({ queryKey: ["/api/linkedin/contacts"] });
        toast({ title: "LinkedIn disconnected" });
      } else if (id === "facebook") {
        await fetch("/api/facebook/disconnect", { method: "DELETE" });
        qc.invalidateQueries({ queryKey: ["/api/facebook/status"] });
        qc.invalidateQueries({ queryKey: ["/api/facebook/friends"] });
        toast({ title: "Facebook disconnected" });
      } else if (id === "google") {
        await fetch("/api/gcontacts/disconnect", { method: "DELETE" });
        qc.invalidateQueries({ queryKey: ["/api/gcontacts/status"] });
        qc.invalidateQueries({ queryKey: ["/api/gcontacts/contacts"] });
        toast({ title: "Google Contacts disconnected" });
      }
      setLocalConnected(prev => { const n = new Set(prev); n.delete(id); localStorage.setItem(STORAGE_KEY, JSON.stringify([...n])); return n; });
    } catch {
      toast({ title: "Failed to disconnect", variant: "destructive" });
    } finally {
      setDisconnecting(null);
    }
  }

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <div className="text-center pt-2">
        <div className="w-14 h-14 rounded-2xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center mx-auto mb-3">
          <Bot className="w-7 h-7 text-violet-600 dark:text-violet-400" />
        </div>
        <h2 className="text-xl font-bold">Connect your accounts</h2>
        <p className="text-sm text-muted-foreground mt-1">Sync your interactions and add all your contacts in one place</p>
      </div>

      <div className="space-y-5">
        {ACCOUNT_GROUPS.map(group => (
          <div key={group.label}>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">{group.label}</p>
            <div className="rounded-xl border overflow-hidden divide-y divide-border">
              {group.items.map(account => {
                const isConnected =
                  account.id === "linkedin" ? isLinkedinConnected :
                  account.id === "facebook" ? isFacebookConnected :
                  account.id === "google" ? isGoogleConnected :
                  localConnected.has(account.id);
                return (
                  <div key={account.id} className="flex items-center gap-3 px-4 py-3.5">
                    <AccountIcon icon={account.icon} color={account.color} />
                    <button
                      onClick={() => !isConnected && toggle(account.id)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <p className="text-sm font-medium">{account.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{account.desc}</p>
                    </button>
                    {isConnected ? (
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-semibold text-green-600 dark:text-green-400 flex items-center gap-1">
                          Connected <CheckCircle2 size={14} />
                        </span>
                        <button
                          onClick={() => handleDisconnect(account.id)}
                          disabled={disconnecting === account.id}
                          title="Disconnect account"
                          className="w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
                        >
                          {disconnecting === account.id
                            ? <Loader2 size={13} className="animate-spin" />
                            : <X size={13} />}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => toggle(account.id)}
                        className="text-sm font-medium text-primary hover:underline shrink-0"
                      >
                        Connect
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={() => setScreen("assistant")}
        disabled={!isLinkedinConnected && !isFacebookConnected && !isGoogleConnected && localConnected.size === 0}
        className="w-full py-3.5 rounded-xl font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed text-white bg-violet-600 hover:bg-violet-700"
      >
        Continue
      </button>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function RelationshipsPage() {
  const { toast } = useToast();

  // ── Data ──────────────────────────────────────────────────────────────────────
  const { data: groups = [] } = useQuery<RelationshipGroup[]>({ queryKey: ["/api/groups"] });
  const { data: allPeople = [] } = useQuery<PersonWithSpouse[]>({ queryKey: ["/api/people"] });

  const { data: friends = [], refetch: refetchFriends } = useQuery<PublicUser[]>({
    queryKey: ["/api/friends"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/friends"); return r.json(); },
  });

  const { data: requests = { incoming: [], outgoing: [] }, refetch: refetchRequests } = useQuery<{
    incoming: FriendRequestWithUser[]; outgoing: FriendRequestWithUser[];
  }>({
    queryKey: ["/api/friend-requests"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/friend-requests"); return r.json(); },
  });

  // ── UI State ──────────────────────────────────────────────────────────────────
  const [personModal, setPersonModal] = useState(false);
  const [groupModal, setGroupModal] = useState(false);
  const [mergeModal, setMergeModal] = useState(false);
  const [mergePerson, setMergePerson] = useState<PersonWithSpouse | null>(null);
  const [editPerson, setEditPerson] = useState<Person | null>(null);
  const [editGroup, setEditGroup] = useState<RelationshipGroup | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<number | "all" | "none" | "friends">("all");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(true);
  const [requestsOpen, setRequestsOpen] = useState(false);
  // For creating/editing a profile linked to a connected friend
  const [editFriendLinkedUserId, setEditFriendLinkedUserId] = useState<number | null>(null);
  const [editFriendDefaultFirst, setEditFriendDefaultFirst] = useState("");
  const [editFriendDefaultLast, setEditFriendDefaultLast] = useState("");

  // Auto-open requests panel when there are incoming requests
  useEffect(() => {
    if (requests.incoming.length > 0) setRequestsOpen(true);
  }, [requests.incoming.length]);

  // Clear badge on mount
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/friend-requests/count"] });
  }, []);

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const deletePersonMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/people/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/people"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      toast({ title: "Person removed" });
    },
  });

  const deleteGroupMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/groups/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/people"] });
    },
  });

  const sendMut = useMutation({
    mutationFn: (toUserId: number) => apiRequest("POST", "/api/friend-requests", { toUserId }),
    onSuccess: () => {
      refetchRequests();
      toast({ title: "Friend request sent" });
      queryClient.invalidateQueries({ queryKey: ["/api/friend-requests/count"] });
    },
    onError: () => toast({ title: "Couldn't send request", variant: "destructive" }),
  });

  const respondMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: "accepted" | "declined" }) =>
      apiRequest("PATCH", `/api/friend-requests/${id}`, { status }),
    onSuccess: () => {
      refetchFriends(); refetchRequests();
      queryClient.invalidateQueries({ queryKey: ["/api/friend-requests/count"] });
    },
  });

  const cancelMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/friend-requests/${id}`),
    onSuccess: () => refetchRequests(),
  });

  const unfriendMut = useMutation({
    mutationFn: (friendId: number) => apiRequest("DELETE", `/api/friends/${friendId}`),
    onSuccess: () => { refetchFriends(); toast({ title: "Removed from friends" }); },
  });

  // ── Derived data ──────────────────────────────────────────────────────────────

  // Map of linkedUserId → PersonWithSpouse for connected friends who have profiles
  const linkedPersonMap = useMemo(() => {
    const map = new Map<number, PersonWithSpouse>();
    allPeople.forEach((p) => { if ((p as any).linkedUserId) map.set((p as any).linkedUserId, p); });
    return map;
  }, [allPeople]);

  // Map of friendId → PublicUser
  const friendMap = useMemo(() => {
    const map = new Map<number, PublicUser>();
    friends.forEach((f) => map.set(f.id, f));
    return map;
  }, [friends]);

  // Friends WITHOUT a linked person record (shown in "Connected" section as FriendCards)
  const unlinkedFriends = useMemo(() => friends.filter((f) => !linkedPersonMap.has(f.id)), [friends, linkedPersonMap]);

  const upcomingBirthdays = useMemo(() => {
    const items: { name: string; days: number; label: string; color?: string }[] = [];
    allPeople.forEach((p) => {
      const g = groups.find((g) => g.id === p.groupId);
      if (p.birthday) {
        const info = nextBirthday(p.birthday);
        if (info.daysAway <= 30) items.push({ name: fullName(p), ...info, color: g?.color });
      }
    });
    return items.sort((a, b) => a.days - b.days);
  }, [allPeople, groups]);

  const filteredPeople = useMemo(() => {
    let list = allPeople;
    if (selectedGroupId === "friends") {
      // Only show people linked to a friend
      list = list.filter((p) => (p as any).linkedUserId && friendMap.has((p as any).linkedUserId));
    } else if (selectedGroupId === "none") {
      list = list.filter((p) => !p.groupId);
    } else if (typeof selectedGroupId === "number") {
      list = list.filter((p) => p.groupId === selectedGroupId);
    }
    // In "all" view, don't filter by group — show everyone
    if (search) list = list.filter((p) => fullName(p).toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [allPeople, selectedGroupId, search, friendMap]);

  const filteredUnlinkedFriends = useMemo(() => {
    if (!search) return unlinkedFriends;
    return unlinkedFriends.filter((f) =>
      f.name.toLowerCase().includes(search.toLowerCase()) || f.email.toLowerCase().includes(search.toLowerCase())
    );
  }, [unlinkedFriends, search]);

  const groupColor = (id: number | null | undefined) => groups.find((g) => g.id === id)?.color;

  const incomingCount = requests.incoming.length;
  const showFriends = selectedGroupId === "all" || selectedGroupId === "friends";
  const showPeople = selectedGroupId !== "friends";

  // Handler to open edit modal for a connected friend
  function openFriendProfile(friend: PublicUser) {
    const existing = linkedPersonMap.get(friend.id);
    if (existing) {
      // Edit existing linked person
      setEditPerson(existing);
      setEditFriendLinkedUserId(null);
      setPersonModal(true);
    } else {
      // Create new linked person pre-populated from friend's app profile
      const { first, last } = splitName(friend.name);
      setEditPerson(null);
      setEditFriendLinkedUserId(friend.id);
      setEditFriendDefaultFirst(first);
      setEditFriendDefaultLast(last);
      setPersonModal(true);
    }
  }

  const [socialTab, setSocialTab] = useState<"friends" | "contacts" | "keepintouch" | "timeline" | "assistant">("friends");

  // Contacts tab accordion open/close state
  const [contactSections, setContactSections] = useState<Record<string, boolean>>({
    lifosFriends: false,
    pending: false,
    manuallyAdded: false,
    googleContacts: false,
    linkedin: false,
  });
  const toggleContactSection = (key: string) =>
    setContactSections((prev) => ({ ...prev, [key]: !prev[key] }));

  const { data: googleContacts = [] } = useQuery<Array<{ id: number; firstName: string | null; lastName: string | null; email: string | null; phone: string | null; company: string | null; avatarUrl: string | null }>>({
    queryKey: ["/api/gcontacts/contacts"],
    queryFn: () => fetch("/api/gcontacts/contacts").then(r => r.json()),
  });

  const { data: linkedinContacts = [] } = useQuery<Array<{ id: number; firstName: string; lastName: string | null; email: string | null; company: string | null; position: string | null }>>({
    queryKey: ["/api/linkedin/contacts"],
    queryFn: () => fetch("/api/linkedin/contacts").then(r => r.json()),
  });

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-5">

      {/* ── Tab switcher ─────────────────────────────────────────────────────── */}
      <div className="flex gap-0.5 p-1 bg-secondary rounded-xl w-fit overflow-x-auto">
        {(["friends", "contacts", "keepintouch", "timeline", "assistant"] as const).map(tab => (
          <button key={tab}
            onClick={() => setSocialTab(tab)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${socialTab === tab ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            {tab === "friends" && "Friends"}
            {tab === "contacts" && "Contacts"}
            {tab === "keepintouch" && "Keep in Touch"}
            {tab === "timeline" && "Timeline"}
            {tab === "assistant" && <span className="flex items-center gap-1.5"><Bot size={13} /> Assistant</span>}
          </button>
        ))}
      </div>

      {/* ── Friends / Social Hub ─────────────────────────────────────────────── */}
      {socialTab === "friends" && <FriendsSocialHub />}

      {/* ── Keep in Touch ─────────────────────────────────────────────────────── */}
      {socialTab === "keepintouch" && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-base font-bold">Keep in Touch</h3>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{allPeople.length}</span>
          </div>
          <KeepInTouchSection people={allPeople} />
        </div>
      )}

      {/* ── Timeline ──────────────────────────────────────────────────────────── */}
      {socialTab === "timeline" && <TimelineSection people={allPeople} />}

      {/* ── Personal Assistant ────────────────────────────────────────────────── */}
      {socialTab === "assistant" && <PersonalAssistantSection />}

      {/* ── Contacts ─────────────────────────────────────────────────────────── */}
      {socialTab === "contacts" && (
      <div className="space-y-3">

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-base font-bold">Contacts</h2>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => { setEditGroup(null); setGroupModal(true); }} className="gap-1.5 text-muted-foreground h-8 text-xs">
            <FolderPlus size={12} /> Group
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setEditPerson(null); setEditFriendLinkedUserId(null); setPersonModal(true); }} className="gap-1.5 h-8 text-xs">
            <UserPlus size={12} /> Add Person
          </Button>
        </div>
      </div>

      {/* ── Accordion helper ─────────────────────────────────────────────────── */}
      {/* Find Friends ───────────────────────────────────────────────────────── */}
      <div className={`rounded-xl border-2 transition-all overflow-hidden ${searchOpen ? "border-primary bg-primary/5" : "border-primary/40 bg-gradient-to-r from-primary/5 to-blue-500/5 hover:border-primary/60 cursor-pointer"}`}
        onClick={!searchOpen ? () => setSearchOpen(true) : undefined}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
              <Search size={15} className="text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-primary">Find Friends</p>
              <p className="text-xs text-muted-foreground">Search for people on the app to send friend requests</p>
            </div>
          </div>
          {searchOpen && (
            <button
              onClick={(e) => { e.stopPropagation(); setSearchOpen(false); }}
              className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            >
              <X size={15} />
            </button>
          )}
        </div>
        {searchOpen && (
          <div className="px-4 pb-4">
            <UserSearchPanel
              friends={friends}
              requests={requests}
              onSendRequest={(id) => sendMut.mutate(id)}
              onAccept={(id) => respondMut.mutate({ id, status: "accepted" })}
              onDecline={(id) => respondMut.mutate({ id, status: "declined" })}
              onCancel={(id) => cancelMut.mutate(id)}
              onUnfriend={(id) => unfriendMut.mutate(id)}
              sendPending={sendMut.isPending}
            />
          </div>
        )}
      </div>

      {/* Lifos Friends ─────────────────────────────────────────────────────── */}
      {(() => {
        const linkedPersons = allPeople.filter((p) => (p as any).linkedUserId && friendMap.has((p as any).linkedUserId));
        const unlinked = unlinkedFriends;
        const count = linkedPersons.length + unlinked.length;
        const open = contactSections.lifosFriends;
        return (
          <div className="rounded-xl border overflow-hidden">
            <button
              onClick={() => toggleContactSection("lifosFriends")}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-secondary/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <UserCheck size={14} className="text-primary shrink-0" />
                <span className="text-sm font-semibold">Lifos Friends</span>
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{count}</span>
              </div>
              {open ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
            </button>
            {open && (
              <div className="px-4 pb-4 border-t">
                {count === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <UserCheck size={30} className="mx-auto mb-2 opacity-20" />
                    <p className="text-sm">No Lifos friends yet</p>
                    <p className="text-xs mt-1">Use Find Friends above to connect with people on the app</p>
                  </div>
                ) : (
                  <div className="pt-3 space-y-2">
                    {linkedPersons.map((p) => (
                      <div key={p.id} className="flex items-center gap-3 p-2.5 rounded-lg border bg-card/50">
                        <div className="h-8 w-8 rounded-full bg-primary/15 flex items-center justify-center text-sm font-semibold text-primary shrink-0">
                          {(p.firstName?.[0] ?? "?").toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{fullName(p)}</p>
                          {p.company && <p className="text-xs text-muted-foreground truncate">{p.company}</p>}
                        </div>
                        <button onClick={() => { setEditPerson(p); setEditFriendLinkedUserId(null); setPersonModal(true); }}
                          className="text-xs text-muted-foreground hover:text-foreground border px-2 py-1 rounded-lg hover:bg-secondary transition-colors">
                          Edit
                        </button>
                      </div>
                    ))}
                    {unlinked.map((f) => (
                      <div key={f.id} className="flex items-center gap-3 p-2.5 rounded-lg border bg-card/50">
                        <Avatar user={f} size={32} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{f.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{f.email}</p>
                        </div>
                        <button onClick={() => openFriendProfile(f)}
                          className="text-xs text-muted-foreground hover:text-foreground border px-2 py-1 rounded-lg hover:bg-secondary transition-colors">
                          Profile
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* Custom Groups ─────────────────────────────────────────────────────── */}
      {groups.map((g) => {
        const members = allPeople.filter((p) => p.groupId === g.id);
        const key = `group-${g.id}`;
        const open = !!contactSections[key];
        return (
          <div key={g.id} className="rounded-xl border overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 hover:bg-secondary/50 transition-colors">
              <button
                onClick={() => toggleContactSection(key)}
                className="flex items-center gap-2 flex-1 text-left"
              >
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: g.color || "#888" }} />
                <span className="text-sm font-semibold">{g.name}</span>
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{members.length}</span>
              </button>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => { setEditGroup(g); setGroupModal(true); }}
                  className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                  title="Edit group"
                >
                  <Pencil size={12} />
                </button>
                <button
                  onClick={() => deleteGroupMut.mutate(g.id)}
                  className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  title="Delete group"
                >
                  <Trash2 size={12} />
                </button>
                <button
                  onClick={() => toggleContactSection(key)}
                  className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground transition-colors"
                >
                  {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              </div>
            </div>
            {open && (
              <div className="px-4 pb-4 border-t">
                {members.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <p className="text-sm">No people in this group</p>
                    <button
                      onClick={() => { setEditPerson(null); setEditFriendLinkedUserId(null); setPersonModal(true); }}
                      className="mt-2 text-xs text-primary hover:underline"
                    >
                      + Add Person
                    </button>
                  </div>
                ) : (
                  <div className="pt-3 space-y-3">
                    {(() => {
                      // Build a set of person IDs that are linked to MyLifos friends
                      const friendPersonIds = new Set(
                        members
                          .filter((p) => (p as any).linkedUserId && friendMap.has((p as any).linkedUserId))
                          .map((p) => p.id)
                      );
                      return clusterFamilies(members, allPeople).map((cluster, ci) => (
                        <FamilyClusterCard
                          key={ci}
                          adults={cluster.adults}
                          children={cluster.children}
                          color={g.color ?? undefined}
                          onEdit={(p) => { setEditPerson(p); setEditFriendLinkedUserId(null); setPersonModal(true); }}
                          onMerge={(p) => { setMergePerson(p); setMergeModal(true); }}
                          friendPersonIds={friendPersonIds}
                        />
                      ));
                    })()}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Pending ───────────────────────────────────────────────────────────── */}
      {(() => {
        const pendingCount = requests.incoming.length + requests.outgoing.length;
        const open = contactSections.pending;
        return (
          <div className={`rounded-xl overflow-hidden ${pendingCount > 0 ? "border border-amber-200 dark:border-amber-800" : "border"}`}>
            <button
              onClick={() => toggleContactSection("pending")}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-secondary/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Clock size={14} className={pendingCount > 0 ? "text-amber-500 shrink-0" : "text-muted-foreground shrink-0"} />
                <span className="text-sm font-semibold">Pending</span>
                {pendingCount > 0 && (
                  <span className="text-xs bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full">{pendingCount}</span>
                )}
                {pendingCount === 0 && (
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">0</span>
                )}
              </div>
              {open ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
            </button>
            {open && (
              <div className="px-4 pb-4 border-t">
                {pendingCount === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">No pending requests</p>
                ) : (
                  <div className="pt-3 space-y-3">
                    {requests.incoming.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Incoming</p>
                        <div className="space-y-2">
                          {requests.incoming.map((req) => (
                            <IncomingRequestCard
                              key={req.id}
                              request={req}
                              onAccept={(id) => respondMut.mutate({ id, status: "accepted" })}
                              onDecline={(id) => respondMut.mutate({ id, status: "declined" })}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    {requests.outgoing.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Outgoing</p>
                        <div className="space-y-2">
                          {requests.outgoing.map((req) => (
                            <div key={req.id} className="flex items-center gap-3 p-2.5 rounded-lg border bg-card/50">
                              <Avatar user={req.otherUser} size={32} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{req.otherUser.name}</p>
                                <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1"><Clock size={10} /> Pending</p>
                              </div>
                              <button onClick={() => cancelMut.mutate(req.id)}
                                className="text-xs text-muted-foreground hover:text-destructive border px-2 py-1 rounded-lg hover:border-destructive/30 transition-colors">
                                Cancel
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* Manually Added ────────────────────────────────────────────────────── */}
      {(() => {
        const manualPeople = allPeople.filter((p) => !(p as any).linkedUserId);
        const count = manualPeople.length;
        const open = contactSections.manuallyAdded;
        return (
          <div className="rounded-xl border overflow-hidden">
            <button
              onClick={() => toggleContactSection("manuallyAdded")}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-secondary/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <UserPlus size={14} className="text-muted-foreground shrink-0" />
                <span className="text-sm font-semibold">Manually Added</span>
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{count}</span>
              </div>
              {open ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
            </button>
            {open && (
              <div className="px-4 pb-4 border-t">
                {count === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users size={30} className="mx-auto mb-2 opacity-20" />
                    <p className="text-sm">No manually added contacts</p>
                    <Button size="sm" variant="outline" className="mt-3 gap-1.5" onClick={() => { setEditPerson(null); setEditFriendLinkedUserId(null); setPersonModal(true); }}>
                      <UserPlus size={13} /> Add Person
                    </Button>
                  </div>
                ) : (
                  <div className="pt-3 space-y-2">
                    {manualPeople.map((p) => (
                      <div key={p.id} className="flex items-center gap-3 p-2.5 rounded-lg border bg-card/50">
                        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-sm font-semibold text-muted-foreground shrink-0">
                          {(p.firstName?.[0] ?? "?").toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{fullName(p)}</p>
                          {(p.company || p.email) && (
                            <p className="text-xs text-muted-foreground truncate">{p.company || p.email}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => { setMergePerson(p); setMergeModal(true); }}
                            className="text-xs text-violet-600 dark:text-violet-400 hover:text-violet-700 border border-violet-200 dark:border-violet-800 px-2 py-1 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors"
                            title="Merge with another contact"
                          >
                            Merge
                          </button>
                          <button onClick={() => { setEditPerson(p); setEditFriendLinkedUserId(null); setPersonModal(true); }}
                            className="text-xs text-muted-foreground hover:text-foreground border px-2 py-1 rounded-lg hover:bg-secondary transition-colors">
                            Edit
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* Google Contacts ────────────────────────────────────────────────────── */}
      {(() => {
        const count = googleContacts.length;
        const open = contactSections.googleContacts;
        return (
          <div className="rounded-xl border overflow-hidden">
            <button
              onClick={() => toggleContactSection("googleContacts")}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-secondary/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                <span className="text-sm font-semibold">Google Contacts</span>
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{count}</span>
              </div>
              {open ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
            </button>
            {open && (
              <div className="px-4 pb-4 border-t">
                {count === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p className="text-sm">No Google contacts synced</p>
                    <p className="text-xs mt-1">Connect your Google account in the Assistant tab</p>
                  </div>
                ) : (
                  <div className="pt-3 space-y-2">
                    {googleContacts.map((c) => (
                      <div key={c.id} className="flex items-center gap-3 p-2.5 rounded-lg border bg-card/50">
                        {c.avatarUrl ? (
                          <img src={c.avatarUrl} className="h-8 w-8 rounded-full object-cover shrink-0" alt="" />
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-sm font-semibold text-blue-600 dark:text-blue-400 shrink-0">
                            {((c.firstName || c.email || "?")[0]).toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {[c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || "Unknown"}
                          </p>
                          {(c.company || c.email) && (
                            <p className="text-xs text-muted-foreground truncate">{c.company || c.email}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* LinkedIn ───────────────────────────────────────────────────────────── */}
      {(() => {
        const count = linkedinContacts.length;
        const open = contactSections.linkedin;
        return (
          <div className="rounded-xl border overflow-hidden">
            <button
              onClick={() => toggleContactSection("linkedin")}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-secondary/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="#0A66C2">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                </svg>
                <span className="text-sm font-semibold">LinkedIn</span>
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{count}</span>
              </div>
              {open ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
            </button>
            {open && (
              <div className="px-4 pb-4 border-t">
                {count === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p className="text-sm">No LinkedIn contacts imported</p>
                    <p className="text-xs mt-1">Import your connections in the Assistant tab</p>
                  </div>
                ) : (
                  <div className="pt-3 space-y-2">
                    {linkedinContacts.map((c) => (
                      <div key={c.id} className="flex items-center gap-3 p-2.5 rounded-lg border bg-card/50">
                        <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-sm font-semibold text-blue-600 dark:text-blue-400 shrink-0">
                          {(c.firstName?.[0] ?? "?").toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {[c.firstName, c.lastName].filter(Boolean).join(" ") || "Unknown"}
                          </p>
                          {(c.position || c.company) && (
                            <p className="text-xs text-muted-foreground truncate">
                              {[c.position, c.company].filter(Boolean).join(" · ")}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Modals ────────────────────────────────────────────────────────────── */}
      <PersonFormModal
        open={personModal}
        onClose={() => {
          setPersonModal(false);
          setEditPerson(null);
          setEditFriendLinkedUserId(null);
          setEditFriendDefaultFirst("");
          setEditFriendDefaultLast("");
        }}
        editPerson={editPerson}
        groups={groups}
        allPeople={allPeople}
        linkedUserId={editFriendLinkedUserId}
        defaultFirstName={editFriendDefaultFirst}
        defaultLastName={editFriendDefaultLast}
      />
      <GroupFormModal
        open={groupModal}
        onClose={() => { setGroupModal(false); setEditGroup(null); }}
        editGroup={editGroup}
      />
      <MergeContactModal
        open={mergeModal}
        onClose={() => { setMergeModal(false); setMergePerson(null); }}
        person={mergePerson}
        allPeople={allPeople}
        friends={friends}
      />
      </div>
      )}
    </div>
  );
}
