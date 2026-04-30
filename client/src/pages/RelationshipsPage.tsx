import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format, parseISO } from "date-fns";
import {
  Plus, Users, Pencil, Trash2, MoreHorizontal, Heart,
  Baby, Cake, StickyNote, ChevronDown, ChevronUp,
  UserPlus, FolderPlus, X, Check, Search, UserCheck, Clock,
  UserX, Send, Loader2, Link, Bell,
  Sparkles,
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
                  <p className="text-xs text-muted-foreground truncate">{friend.email}</p>
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
            <button
              onClick={() => onEditProfile(friend)}
              className="mt-1 flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <Pencil size={10} /> Add to a group & set up profile
            </button>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => onEditProfile(friend)}
              className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-primary transition-colors"
              title="Edit profile"
            >
              <Pencil size={14} />
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
  const [editPerson, setEditPerson] = useState<Person | null>(null);
  const [editGroup, setEditGroup] = useState<RelationshipGroup | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<number | "all" | "none" | "friends">("all");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
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

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5">

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Relationships</h1>
            <p className="text-xs text-muted-foreground">
              {allPeople.length} {allPeople.length === 1 ? "person" : "people"} · {friends.length} connected
            </p>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => { setEditGroup(null); setGroupModal(true); }} className="gap-1.5">
            <FolderPlus size={13} /> Group
          </Button>
          <Button size="sm" onClick={() => { setEditPerson(null); setEditFriendLinkedUserId(null); setPersonModal(true); }} className="gap-1.5">
            <UserPlus size={13} /> Add Person
          </Button>
        </div>
      </div>

      {/* ── Find Users Banner ─────────────────────────────────────────────────── */}
      <div
        className={`rounded-xl border-2 transition-all overflow-hidden ${
          searchOpen
            ? "border-primary bg-primary/5"
            : "border-primary/40 bg-gradient-to-r from-primary/5 to-blue-500/5 hover:border-primary/60 cursor-pointer"
        }`}
        onClick={!searchOpen ? () => setSearchOpen(true) : undefined}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
              <Sparkles size={15} className="text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-primary">Find & Connect with Users</p>
              <p className="text-xs text-muted-foreground">Search for people on the app to send friend requests</p>
            </div>
          </div>
          {searchOpen ? (
            <button
              onClick={(e) => { e.stopPropagation(); setSearchOpen(false); }}
              className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            >
              <X size={15} />
            </button>
          ) : (
            <div className="flex items-center gap-1.5 text-xs font-medium text-primary border border-primary/30 bg-primary/10 px-3 py-1.5 rounded-lg">
              <Search size={12} /> Search Users
            </div>
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

            {/* Outgoing requests summary */}
            {requests.outgoing.length > 0 && (
              <div className="pt-3 border-t mt-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Sent Requests</p>
                <div className="space-y-1.5">
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

      {/* ── Incoming requests banner ──────────────────────────────────────────── */}
      {incomingCount > 0 && (
        <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 overflow-hidden">
          <button
            onClick={() => setRequestsOpen((x) => !x)}
            className="w-full flex items-center justify-between px-4 py-3 text-left"
          >
            <div className="flex items-center gap-2">
              <Bell size={14} className="text-blue-600 dark:text-blue-400 shrink-0" />
              <span className="text-sm font-semibold text-blue-800 dark:text-blue-200">
                {incomingCount} friend {incomingCount === 1 ? "request" : "requests"} waiting
              </span>
            </div>
            {requestsOpen ? <ChevronUp size={14} className="text-blue-600" /> : <ChevronDown size={14} className="text-blue-600" />}
          </button>
          {requestsOpen && (
            <div className="px-4 pb-4 space-y-2">
              {requests.incoming.map((req) => (
                <IncomingRequestCard
                  key={req.id}
                  request={req}
                  onAccept={(id) => respondMut.mutate({ id, status: "accepted" })}
                  onDecline={(id) => respondMut.mutate({ id, status: "declined" })}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Upcoming birthdays ────────────────────────────────────────────────── */}
      {upcomingBirthdays.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-2 flex items-center gap-1.5">
            <Cake size={13} /> Upcoming birthdays — next 30 days
          </p>
          <div className="flex flex-wrap gap-2">
            {upcomingBirthdays.map((b, i) => (
              <span key={i} className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium border ${b.days === 0 ? "bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700" : "bg-background border-border text-foreground"}`}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: b.color || "#888" }} />
                {b.name}
                <span className="opacity-70">{b.label}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Search + Group filter row ─────────────────────────────────────────── */}
      <div className="flex items-start gap-3 flex-wrap">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search people & friends…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm w-52"
          />
        </div>

        <div className="flex gap-1.5 flex-wrap">
          {/* All */}
          <button onClick={() => setSelectedGroupId("all")}
            className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${selectedGroupId === "all" ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-secondary"}`}>
            All
          </button>

          {/* Custom groups */}
          {groups.map((g) => (
            <div key={g.id} className="flex items-center">
              <button onClick={() => setSelectedGroupId(g.id)}
                className={`text-xs px-2.5 py-1.5 rounded-l-lg border-y border-l transition-colors flex items-center gap-1.5 ${selectedGroupId === g.id ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-secondary"}`}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: g.color || "#888" }} />
                {g.name}
                <span className="opacity-60">{allPeople.filter((p) => p.groupId === g.id).length}</span>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className={`text-xs px-1.5 py-1.5 rounded-r-lg border transition-colors ${selectedGroupId === g.id ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-secondary"}`}>
                    <MoreHorizontal size={11} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => { setEditGroup(g); setGroupModal(true); }}><Pencil size={13} className="mr-2" />Edit</DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => deleteGroupMut.mutate(g.id)}><Trash2 size={13} className="mr-2" />Delete</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}

          {/* Ungrouped */}
          <button onClick={() => setSelectedGroupId("none")}
            className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${selectedGroupId === "none" ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-secondary"}`}>
            Ungrouped
          </button>

          {/* Connected Friends */}
          <button
            onClick={() => setSelectedGroupId("friends")}
            className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 ${selectedGroupId === "friends" ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-secondary"}`}
          >
            <UserCheck size={11} /> Connected
            {friends.length > 0 && <span className="opacity-70">{friends.length}</span>}
          </button>
        </div>
      </div>

      {/* ── People Grid (for normal + "Connected" filter) ─────────────────────── */}
      {selectedGroupId === "friends" ? (
        /* Connected filter: show linked-friend PersonTiles + unlinked FriendCards */
        <div className="space-y-6">
          {/* Linked-friend persons, grouped */}
          {(() => {
            if (filteredPeople.length === 0 && filteredUnlinkedFriends.length === 0) {
              return (
                <div className="text-center py-12 text-muted-foreground">
                  <UserCheck size={36} className="mx-auto mb-3 opacity-20" />
                  <p className="text-sm font-medium">No connected users yet</p>
                  <p className="text-xs mt-1">Use "Find & Connect" above to send friend requests</p>
                </div>
              );
            }

            // Group linked persons by their group
            const groupedLinked: Record<string, PersonWithSpouse[]> = {};
            const ungroupedLinked: PersonWithSpouse[] = [];
            filteredPeople.forEach((p) => {
              if (p.groupId) {
                const key = String(p.groupId);
                if (!groupedLinked[key]) groupedLinked[key] = [];
                groupedLinked[key].push(p);
              } else {
                ungroupedLinked.push(p);
              }
            });

            return (
              <>
                {groups.map((g) => {
                  const members = groupedLinked[String(g.id)] ?? [];
                  if (!members.length) return null;
                  return (
                    <section key={g.id}>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: g.color || "#888" }} />
                        <h2 className="font-bold text-base">{g.name}</h2>
                        <span className="text-xs text-muted-foreground">{members.length}</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {members.map((p) => (
                          <PersonTile key={p.id} person={p} allPeople={allPeople}
                            onEdit={(person) => { setEditPerson(person); setEditFriendLinkedUserId(null); setPersonModal(true); }}
                            onDelete={(id) => deletePersonMut.mutate(id)}
                            color={g.color ?? undefined}
                            friend={friendMap.get((p as any).linkedUserId) ?? null}
                          />
                        ))}
                      </div>
                    </section>
                  );
                })}
                {ungroupedLinked.length > 0 && (
                  <section>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-3 h-3 rounded-full bg-muted-foreground/40" />
                      <h2 className="font-bold text-base">No Group</h2>
                      <span className="text-xs text-muted-foreground">{ungroupedLinked.length}</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {ungroupedLinked.map((p) => (
                        <PersonTile key={p.id} person={p} allPeople={allPeople}
                          onEdit={(person) => { setEditPerson(person); setEditFriendLinkedUserId(null); setPersonModal(true); }}
                          onDelete={(id) => deletePersonMut.mutate(id)}
                          color={undefined}
                          friend={friendMap.get((p as any).linkedUserId) ?? null}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {/* Unlinked friends at the bottom of "Connected" view */}
                {filteredUnlinkedFriends.length > 0 && (
                  <section>
                    <div className="flex items-center gap-2 mb-3">
                      <UserCheck size={13} className="text-muted-foreground" />
                      <h2 className="font-bold text-base">No Profile Yet</h2>
                      <span className="text-xs text-muted-foreground">{filteredUnlinkedFriends.length}</span>
                      <span className="text-xs text-muted-foreground">· click Edit to add to a group</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {filteredUnlinkedFriends.map((f) => (
                        <FriendCard key={f.id} friend={f} groups={groups}
                          onUnfriend={(id) => unfriendMut.mutate(id)}
                          onEditProfile={openFriendProfile}
                        />
                      ))}
                    </div>
                  </section>
                )}
              </>
            );
          })()}
        </div>
      ) : (
        /* Normal view: people sections */
        showPeople && (
          <>
            {filteredPeople.length === 0 && allPeople.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Users size={36} className="mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium">No people yet</p>
                <p className="text-xs mt-1">Add someone to get started, or connect with users above</p>
                <Button size="sm" variant="outline" className="mt-3 gap-1.5" onClick={() => { setEditPerson(null); setEditFriendLinkedUserId(null); setPersonModal(true); }}>
                  <UserPlus size={13} /> Add your first person
                </Button>
              </div>
            ) : selectedGroupId !== "all" ? (
              // Single group or ungrouped view
              filteredPeople.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No people in this group</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {filteredPeople.map((p) => (
                    <PersonTile key={p.id} person={p} allPeople={allPeople}
                      onEdit={(person) => { setEditPerson(person); setEditFriendLinkedUserId(null); setPersonModal(true); }}
                      onDelete={(id) => deletePersonMut.mutate(id)}
                      color={groupColor(p.groupId)}
                      friend={(p as any).linkedUserId ? (friendMap.get((p as any).linkedUserId) ?? null) : null}
                    />
                  ))}
                </div>
              )
            ) : (
              // "All" view — grouped sections
              <div className="space-y-8">
                {groups.map((g) => {
                  const members = filteredPeople.filter((p) => p.groupId === g.id);
                  if (members.length === 0) return null;
                  return (
                    <section key={g.id}>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: g.color || "#888" }} />
                        <h2 className="font-bold text-base">{g.name}</h2>
                        <span className="text-xs text-muted-foreground">{members.length}</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {members.map((p) => (
                          <PersonTile key={p.id} person={p} allPeople={allPeople}
                            onEdit={(person) => { setEditPerson(person); setEditFriendLinkedUserId(null); setPersonModal(true); }}
                            onDelete={(id) => deletePersonMut.mutate(id)}
                            color={g.color ?? undefined}
                            friend={(p as any).linkedUserId ? (friendMap.get((p as any).linkedUserId) ?? null) : null}
                          />
                        ))}
                      </div>
                    </section>
                  );
                })}

                {/* Ungrouped people */}
                {(() => {
                  const ungrouped = filteredPeople.filter((p) => !p.groupId);
                  if (!ungrouped.length) return null;
                  return (
                    <section>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="w-3 h-3 rounded-full bg-muted-foreground/40" />
                        <h2 className="font-bold text-base">Other</h2>
                        <span className="text-xs text-muted-foreground">{ungrouped.length}</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {ungrouped.map((p) => (
                          <PersonTile key={p.id} person={p} allPeople={allPeople}
                            onEdit={(person) => { setEditPerson(person); setEditFriendLinkedUserId(null); setPersonModal(true); }}
                            onDelete={(id) => deletePersonMut.mutate(id)}
                            color={undefined}
                            friend={(p as any).linkedUserId ? (friendMap.get((p as any).linkedUserId) ?? null) : null}
                          />
                        ))}
                      </div>
                    </section>
                  );
                })()}
              </div>
            )}
          </>
        )
      )}

      {/* ── Unlinked Connected Friends (in All view) ──────────────────────────── */}
      {selectedGroupId === "all" && filteredUnlinkedFriends.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <UserCheck size={13} className="text-primary" />
            <h2 className="font-bold text-base">Connected — No Profile Yet</h2>
            <span className="text-xs text-muted-foreground">{filteredUnlinkedFriends.length}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredUnlinkedFriends.map((f) => (
              <FriendCard key={f.id} friend={f} groups={groups}
                onUnfriend={(id) => unfriendMut.mutate(id)}
                onEditProfile={openFriendProfile}
              />
            ))}
          </div>
        </section>
      )}

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
    </div>
  );
}
