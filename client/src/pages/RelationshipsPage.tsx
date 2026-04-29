import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format, parseISO } from "date-fns";
import {
  Plus, Users, Pencil, Trash2, MoreHorizontal, Heart,
  Baby, Cake, StickyNote, ChevronDown, ChevronUp,
  UserPlus, FolderPlus, X, Check, Search, UserCheck, Clock,
  UserX, Send, Loader2, ChevronRight, Link,
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

// Parse childrenJson — supports both new (number[]) and legacy ({name,birthday}[]) formats
function parseChildIds(json: string | null | undefined): number[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    // New format: array of numbers
    if (parsed.length === 0 || typeof parsed[0] === "number") return parsed as number[];
    // Legacy format: array of {name, birthday} objects — can't convert without IDs, ignore
    return [];
  } catch { return []; }
}

function fullName(p: Person | PersonWithSpouse): string {
  return [p.firstName, p.lastName].filter(Boolean).join(" ");
}

// ── Multi-select children picker ──────────────────────────────────────────────
function ChildrenPicker({ value, onChange, candidates, currentPersonId }: {
  value: number[];
  onChange: (ids: number[]) => void;
  candidates: PersonWithSpouse[];
  currentPersonId?: number;
}) {
  // Candidates are people who are NOT this person, NOT already someone's spouse
  const options = candidates.filter((p) => p.id !== currentPersonId);
  const [open, setOpen] = useState(false);

  const toggle = (id: number) => {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };

  const selectedPeople = options.filter((p) => value.includes(p.id));

  return (
    <div className="space-y-2">
      {/* Selected chips */}
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
      {/* Dropdown trigger */}
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
            <p className="text-xs text-muted-foreground p-3">No other people added yet. Add them first, then link as children.</p>
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
function PersonFormModal({ open, onClose, editPerson, groups, allPeople }: {
  open: boolean; onClose: () => void;
  editPerson: Person | null;
  groups: RelationshipGroup[];
  allPeople: PersonWithSpouse[];
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
      setFirstName(editPerson?.firstName ?? "");
      setLastName(editPerson?.lastName ?? "");
      setGroupId(editPerson?.groupId?.toString() ?? "__none__");
      setBirthday(editPerson?.birthday ?? "");
      setNotes(editPerson?.notes ?? "");
      setSpouseId(editPerson?.spouseId?.toString() ?? "__none__");
      setChildIds(parseChildIds(editPerson?.childrenJson));
    }
  }, [open, editPerson]);

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

      // Bidirectional spouse link via dedicated endpoint
      const sid = spouseId && spouseId !== "__none__" ? parseInt(spouseId) : null;
      if (personId) {
        await apiRequest("POST", `/api/people/${personId}/link-spouse`, { spouseId: sid });
      }

      return personId;
    },
    onSuccess: () => { invAll(); toast({ title: editPerson ? "Person updated" : "Person added" }); onClose(); },
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
    });
  };

  // Spouse options: exclude self and people already married to someone else (unless to this person)
  const spouseOptions = allPeople.filter((p) => {
    if (p.id === editPerson?.id) return false;
    if (p.spouseId && p.spouseId !== editPerson?.id) return false;
    return true;
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editPerson ? "Edit Person" : "Add Person"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
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

          {/* Group + Birthday */}
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

          {/* Spouse */}
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
                    {fullName(p)}
                    {p.spouseId === editPerson?.id ? " (linked)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Selecting a spouse automatically links both people to each other.</p>
          </div>

          {/* Children */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Baby size={13} className="text-sky-500" /> Children
            </Label>
            <ChildrenPicker
              value={childIds}
              onChange={setChildIds}
              candidates={allPeople}
              currentPersonId={editPerson?.id}
            />
            <p className="text-xs text-muted-foreground">Select existing people. Add them as a Person first if they aren't in the list yet.</p>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
              placeholder="How you know them, things to remember..." />
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={saveMut.isPending} className="flex-1">
              {saveMut.isPending ? "Saving..." : editPerson ? "Save Changes" : "Add Person"}
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

// ── Child Row (nested visual style) ──────────────────────────────────────────
function ChildRow({ child, color }: { child: PersonWithSpouse; color?: string }) {
  const bdayInfo = child.birthday ? nextBirthday(child.birthday) : null;
  return (
    <div className="flex items-center gap-2.5 py-1.5">
      {/* Connecting line + avatar */}
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
              <span className={`ml-1 font-semibold ${bdayInfo.daysAway === 0 ? "text-amber-600 dark:text-amber-400" : bdayInfo.daysAway <= 7 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
                {bdayInfo.label}
              </span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Quick Add Child (inline in tile) ─────────────────────────────────────────
function QuickAddChild({ person, allPeople, onSave }: {
  person: Person;
  allPeople: PersonWithSpouse[];
  onSave: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"link" | "create">("link");
  // Link existing
  const [selectedId, setSelectedId] = useState("__none__");
  // Create new
  const [newFirst, setNewFirst] = useState("");
  const [newLast, setNewLast] = useState("");
  const [newBday, setNewBday] = useState("");

  const existingChildIds = parseChildIds(person.childrenJson);
  // Available to link: not already a child, not self
  const available = allPeople.filter(
    (p) => p.id !== person.id && !existingChildIds.includes(p.id)
  );

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
    // Create the child person
    const child: any = await apiRequest("POST", "/api/people", {
      firstName: newFirst.trim(),
      lastName: newLast.trim() || null,
      groupId: person.groupId,
      birthday: newBday || null,
      childrenJson: "[]",
      sortOrder: 0,
    });
    // Link to parent
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
      {/* Mode toggle */}
      <div className="flex gap-1">
        <button type="button" onClick={() => setMode("link")}
          className={`text-xs px-2 py-1 rounded-lg border transition-colors ${mode === "link" ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-secondary"}`}>
          Link existing
        </button>
        <button type="button" onClick={() => setMode("create")}
          className={`text-xs px-2 py-1 rounded-lg border transition-colors ${mode === "create" ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-secondary"}`}>
          Create new
        </button>
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
            <Input value={newFirst} onChange={(e) => setNewFirst(e.target.value)}
              placeholder="First name" className="h-7 text-xs" autoFocus />
            <Input value={newLast} onChange={(e) => setNewLast(e.target.value)}
              placeholder="Last name" className="h-7 text-xs" />
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

// ── Quick Link Spouse (inline in tile) ────────────────────────────────────────
function QuickLinkSpouse({ person, allPeople, onSave }: {
  person: Person;
  allPeople: PersonWithSpouse[];
  onSave: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState("__none__");

  const available = allPeople.filter(
    (p) => p.id !== person.id && (!p.spouseId || p.spouseId === person.id)
  );

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
function PersonTile({ person, allPeople, onEdit, onDelete, color }: {
  person: PersonWithSpouse;
  allPeople: PersonWithSpouse[];
  onEdit: (p: Person) => void;
  onDelete: (id: number) => void;
  color?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [, forceUpdate] = useState(0); // trigger re-render after inline actions

  const spouse = person.spouseId ? allPeople.find((p) => p.id === person.spouseId) : null;
  const childIds = parseChildIds(person.childrenJson);
  const children = allPeople.filter((p) => childIds.includes(p.id));
  const bdayInfo = person.birthday ? nextBirthday(person.birthday) : null;

  return (
    <div className="bg-card border rounded-xl overflow-hidden hover:shadow-sm transition-shadow">
      {/* Color accent bar */}
      <div className="h-1.5" style={{ backgroundColor: color || "#1e3a5f" }} />

      <div className="p-4">
        {/* ── Main person row ── */}
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 select-none"
            style={{ backgroundColor: color || "#1e3a5f" }}>
            {initials(person.firstName, person.lastName)}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-sm leading-tight">{fullName(person)}</p>
                {/* Spouse pill */}
                {spouse ? (
                  <p className="text-xs text-rose-500 dark:text-rose-400 flex items-center gap-1 mt-0.5">
                    <Heart size={10} className="shrink-0" fill="currentColor" />{fullName(spouse)}
                  </p>
                ) : (
                  <QuickLinkSpouse person={person} allPeople={allPeople} onSave={() => forceUpdate((n) => n + 1)} />
                )}
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

            {/* Birthday */}
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

        {/* ── Expanded section ── */}
        {expanded && (
          <div className="mt-3 pt-3 border-t space-y-3">

            {/* Notes */}
            {person.notes && (
              <div className="flex items-start gap-1.5">
                <StickyNote size={12} className="text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-xs text-muted-foreground leading-relaxed">{person.notes}</p>
              </div>
            )}

            {/* ── Children nest ── */}
            <div>
              {children.length > 0 && (
                <div className="mb-1">
                  <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1 mb-0.5">
                    <Baby size={11} /> Children
                  </p>
                  {/* Tree connector */}
                  <div className="ml-1 pl-2 border-l-2 border-border space-y-0">
                    {children.map((child) => (
                      <ChildRow key={child.id} child={child} color={color} />
                    ))}
                  </div>
                </div>
              )}
              <div className="ml-3">
                <QuickAddChild
                  person={person}
                  allPeople={allPeople}
                  onSave={() => forceUpdate((n) => n + 1)}
                />
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
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

// ── Friends Tab ─────────────────────────────────────────────────────────────────
function FriendsTab({ onBadgeClear }: { onBadgeClear: () => void }) {
  const { toast } = useToast();
  const [subTab, setSubTab] = useState<"friends" | "requests" | "search">("friends");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<(PublicUser & { relationshipStatus: string; incomingRequestId: number | null })[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: friends = [], refetch: refetchFriends } = useQuery<PublicUser[]>({
    queryKey: ["/api/friends"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/friends"); return r.json(); },
  });

  const { data: requests = { incoming: [], outgoing: [] }, refetch: refetchRequests } = useQuery<{ incoming: FriendRequestWithUser[]; outgoing: FriendRequestWithUser[] }>({
    queryKey: ["/api/friend-requests"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/friend-requests"); return r.json(); },
  });

  // Clear badge on mount
  useEffect(() => { onBadgeClear(); }, []);

  const sendMut = useMutation({
    mutationFn: (toUserId: number) => apiRequest("POST", "/api/friend-requests", { toUserId }),
    onSuccess: () => {
      refetchRequests();
      doSearch(searchQuery); // refresh status chips in search results
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
      doSearch(searchQuery);
      queryClient.invalidateQueries({ queryKey: ["/api/friend-requests/count"] });
    },
  });

  const cancelMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/friend-requests/${id}`),
    onSuccess: () => { refetchRequests(); doSearch(searchQuery); },
  });

  const unfriendMut = useMutation({
    mutationFn: (friendId: number) => apiRequest("DELETE", `/api/friends/${friendId}`),
    onSuccess: () => { refetchFriends(); doSearch(searchQuery); toast({ title: "Removed from friends" }); },
  });

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    setSearchLoading(true);
    try {
      const r = await apiRequest("GET", `/api/users/search?q=${encodeURIComponent(q)}`);
      setSearchResults(await r.json());
    } catch { setSearchResults([]); }
    finally { setSearchLoading(false); }
  }, []);

  function handleSearchChange(val: string) {
    setSearchQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 400);
  }

  const incomingCount = requests.incoming.length;

  function StatusBadge({ status }: { status: string }) {
    if (status === "friends") return <span className="text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1"><UserCheck size={11} />Friends</span>;
    if (status === "outgoing_pending") return <span className="text-xs text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1"><Clock size={11} />Pending</span>;
    if (status === "incoming") return <span className="text-xs text-blue-600 dark:text-blue-400 font-medium flex items-center gap-1"><Send size={11} />Sent you a request</span>;
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-1 bg-muted rounded-lg p-1">
        {([
          ["friends", "Friends", friends.length],
          ["requests", "Requests", incomingCount],
          ["search", "Search Users", null],
        ] as const).map(([key, label, count]) => (
          <button key={key} onClick={() => setSubTab(key)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${subTab === key ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {label}
            {count != null && count > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${key === "requests" ? "bg-red-500 text-white" : "bg-secondary text-muted-foreground"}`}>{count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Friends list */}
      {subTab === "friends" && (
        <div>
          {friends.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users size={36} className="mx-auto mb-3 opacity-20" />
              <p className="text-sm">No friends yet</p>
              <p className="text-xs mt-1">Search for other users to send friend requests</p>
              <button onClick={() => setSubTab("search")} className="mt-3 text-xs text-primary hover:underline">Search users →</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {friends.map((f) => (
                <div key={f.id} className="flex items-center gap-3 p-3 rounded-xl border bg-card hover:bg-secondary/40 transition-colors group">
                  <button
                    className="flex items-center gap-3 flex-1 min-w-0 text-left"
                    onClick={() => window.location.hash = `#/profile/${f.id}`}
                  >
                    <Avatar user={f} size={40} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate group-hover:text-primary transition-colors">{f.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{f.email}</p>
                    </div>
                    <ChevronRight size={14} className="text-muted-foreground/40 group-hover:text-muted-foreground shrink-0" />
                  </button>
                  <button
                    onClick={() => unfriendMut.mutate(f.id)}
                    title="Remove friend"
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                  >
                    <UserX size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Requests */}
      {subTab === "requests" && (
        <div className="space-y-5">
          {/* Incoming */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Incoming Requests {incomingCount > 0 && <span className="ml-1 text-red-500">{incomingCount}</span>}
            </p>
            {requests.incoming.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No incoming requests</p>
            ) : (
              <div className="space-y-2">
                {requests.incoming.map((req) => (
                  <div key={req.id} className="flex items-center gap-3 p-3 rounded-xl border bg-card">
                    <Avatar user={req.otherUser} size={38} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{req.otherUser.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{req.otherUser.email}</p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        onClick={() => respondMut.mutate({ id: req.id, status: "accepted" })}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
                      >
                        <Check size={12} /> Accept
                      </button>
                      <button
                        onClick={() => respondMut.mutate({ id: req.id, status: "declined" })}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-colors"
                      >
                        <X size={12} /> Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Outgoing */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Sent</p>
            {requests.outgoing.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No outgoing requests</p>
            ) : (
              <div className="space-y-2">
                {requests.outgoing.map((req) => (
                  <div key={req.id} className="flex items-center gap-3 p-3 rounded-xl border bg-card">
                    <Avatar user={req.otherUser} size={38} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{req.otherUser.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{req.otherUser.email}</p>
                    </div>
                    <button
                      onClick={() => cancelMut.mutate(req.id)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-colors shrink-0"
                    >
                      <X size={12} /> Cancel
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Search */}
      {subTab === "search" && (
        <div className="space-y-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            {searchLoading && <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />}
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search by name or email…"
              className="w-full pl-9 pr-8 py-2.5 text-sm border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {searchQuery.trim() && !searchLoading && searchResults.length === 0 && (
            <div className="text-center py-6 space-y-3">
              <p className="text-sm text-muted-foreground">No users found for "{searchQuery}"</p>
              <p className="text-xs text-muted-foreground/70">They may not have signed up yet. Send them an invite!</p>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(window.location.origin).then(() =>
                    toast({ title: "Link copied!", description: "Share this link so they can sign up." })
                  );
                }}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-primary/30 text-primary hover:bg-primary/10 transition-colors"
              >
                <Link size={12} />
                Copy invite link
              </button>
            </div>
          )}

          {!searchQuery.trim() && (
            <p className="text-sm text-muted-foreground text-center py-6">Type a name or email to find users</p>
          )}

          <div className="space-y-2">
            {searchResults.map((u) => (
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
                      onClick={() => sendMut.mutate(u.id)}
                      disabled={sendMut.isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      <UserPlus size={12} /> Add Friend
                    </button>
                  )}
                  {u.relationshipStatus === "incoming" && u.incomingRequestId && (
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => respondMut.mutate({ id: u.incomingRequestId!, status: "accepted" })}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90"
                      >
                        <Check size={11} /> Accept
                      </button>
                      <button
                        onClick={() => respondMut.mutate({ id: u.incomingRequestId!, status: "declined" })}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs text-muted-foreground hover:text-destructive"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  )}
                  {u.relationshipStatus === "friends" && (
                    <button
                      onClick={() => unfriendMut.mutate(u.id)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs text-muted-foreground hover:text-destructive hover:border-destructive/30"
                    >
                      <UserX size={12} /> Unfriend
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function RelationshipsPage() {
  const { toast } = useToast();
  const [mainTab, setMainTab] = useState<"people" | "friends">("people");
  const [personModal, setPersonModal] = useState(false);
  const [groupModal, setGroupModal] = useState(false);
  const [editPerson, setEditPerson] = useState<Person | null>(null);
  const [editGroup, setEditGroup] = useState<RelationshipGroup | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<number | "all" | "none">("all");
  const [search, setSearch] = useState("");

  const { data: groups = [] } = useQuery<RelationshipGroup[]>({ queryKey: ["/api/groups"] });
  const { data: allPeople = [] } = useQuery<PersonWithSpouse[]>({ queryKey: ["/api/people"] });

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

  // Upcoming birthdays (people + their children) within 30 days
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

  const filtered = useMemo(() => {
    let list = allPeople;
    if (selectedGroupId === "none") list = list.filter((p) => !p.groupId);
    else if (selectedGroupId !== "all") list = list.filter((p) => p.groupId === selectedGroupId);
    if (search) list = list.filter((p) => fullName(p).toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [allPeople, selectedGroupId, search]);

  const groupColor = (id: number | null | undefined) => groups.find((g) => g.id === id)?.color;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Relationships</h1>
        </div>
        {mainTab === "people" && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => { setEditGroup(null); setGroupModal(true); }} className="gap-1.5">
              <Plus size={13} /><FolderPlus size={13} />Group
            </Button>
            <Button size="sm" onClick={() => { setEditPerson(null); setPersonModal(true); }} className="gap-1.5">
              <Plus size={13} /><UserPlus size={13} />Person
            </Button>
          </div>
        )}
      </div>

      {/* Main tabs: People / Friends */}
      <div className="flex gap-1 border-b">
        <button
          onClick={() => setMainTab("people")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${mainTab === "people" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          <span className="flex items-center gap-1.5"><Users size={14} />People ({allPeople.length})</span>
        </button>
        <button
          onClick={() => setMainTab("friends")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${mainTab === "friends" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          <span className="flex items-center gap-1.5"><UserCheck size={14} />Friends</span>
        </button>
      </div>

      {/* Friends tab */}
      {mainTab === "friends" && (
        <FriendsTab onBadgeClear={() => queryClient.invalidateQueries({ queryKey: ["/api/friend-requests/count"] })} />
      )}

      {/* People tab content below — only shown when mainTab === "people" */}
      {mainTab === "people" && (<>

      {/* Upcoming birthdays strip */}
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

      {/* Search + group tabs */}
      <div className="flex items-center gap-3 flex-wrap">
        <Input placeholder="Search people..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-52" />
        <div className="flex gap-1.5 flex-wrap">
          <button onClick={() => setSelectedGroupId("all")}
            className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${selectedGroupId === "all" ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-secondary"}`}>
            All
          </button>
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
          <button onClick={() => setSelectedGroupId("none")}
            className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${selectedGroupId === "none" ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-secondary"}`}>
            Ungrouped
          </button>
        </div>
      </div>

      {/* People grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Users size={40} className="mx-auto mb-4 opacity-20" />
          <p className="font-medium">No people yet</p>
          <p className="text-sm mt-1">Add someone to get started</p>
        </div>
      ) : selectedGroupId !== "all" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((p) => (
            <PersonTile key={p.id} person={p} allPeople={allPeople}
              onEdit={(person) => { setEditPerson(person); setPersonModal(true); }}
              onDelete={(id) => deletePersonMut.mutate(id)}
              color={groupColor(p.groupId)}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map((g) => {
            const members = filtered.filter((p) => p.groupId === g.id);
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
                      onEdit={(person) => { setEditPerson(person); setPersonModal(true); }}
                      onDelete={(id) => deletePersonMut.mutate(id)}
                      color={g.color ?? undefined}
                    />
                  ))}
                </div>
              </section>
            );
          })}
          {(() => {
            const ungrouped = filtered.filter((p) => !p.groupId);
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
                      onEdit={(person) => { setEditPerson(person); setPersonModal(true); }}
                      onDelete={(id) => deletePersonMut.mutate(id)}
                      color={undefined}
                    />
                  ))}
                </div>
              </section>
            );
          })()}
        </div>
      )}

      </> )} {/* end mainTab === "people" */}

      <PersonFormModal
        open={personModal}
        onClose={() => { setPersonModal(false); setEditPerson(null); }}
        editPerson={editPerson}
        groups={groups}
        allPeople={allPeople}
      />
      <GroupFormModal
        open={groupModal}
        onClose={() => { setGroupModal(false); setEditGroup(null); }}
        editGroup={editGroup}
      />
    </div>
  );
}
