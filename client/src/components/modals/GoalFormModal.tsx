import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { GOAL_CATEGORIES, PROGRESS_TYPES, RECURRENCE_OPTIONS } from "@/lib/plannerUtils";
import type { Goal, InsertGoal, BookWithSessions, WorkoutTemplate, PublicUser } from "@shared/schema";
import { Users, X, Search } from "lucide-react";

const PRIORITIES = ["low","medium","high"];

function BuddyAvatar({ user, size = 32 }: { user: PublicUser; size?: number }) {
  const initials = user.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  if (user.avatarUrl) {
    return (
      <img
        src={user.avatarUrl}
        alt={user.name}
        className="rounded-full object-cover shrink-0 border-2 border-background"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-full bg-primary/15 text-primary font-semibold flex items-center justify-center shrink-0 border-2 border-background"
      style={{ width: size, height: size, fontSize: size * 0.35 }}
    >
      {initials}
    </div>
  );
}

function BuddySearchPickerModal({ value, onChange, friends }: {
  value: number | null;
  onChange: (id: number | null) => void;
  friends: PublicUser[];
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = friends.find((f) => f.id === value) ?? null;
  const filtered = query
    ? friends.filter((f) => f.name.toLowerCase().includes(query.toLowerCase()) || f.email.toLowerCase().includes(query.toLowerCase()))
    : friends;

  if (selected) {
    return (
      <div className="flex items-center gap-2.5 rounded-lg border bg-primary/5 border-primary/30 px-3 py-2">
        <BuddyAvatar user={selected} size={30} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-tight">{selected.name}</p>
          <p className="text-xs text-muted-foreground">Accountabilibuddy</p>
        </div>
        <button type="button" onClick={() => onChange(null)} className="p-1 rounded hover:bg-muted transition-colors" aria-label="Remove buddy">
          <X size={13} className="text-muted-foreground" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search friends…"
          className="pl-8"
        />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-full rounded-lg border bg-popover shadow-md overflow-hidden">
          {filtered.map((f) => (
            <button
              key={f.id}
              type="button"
              onMouseDown={() => { onChange(f.id); setQuery(""); setOpen(false); }}
              className="flex items-center gap-2.5 w-full px-3 py-2 hover:bg-accent text-left transition-colors"
            >
              <BuddyAvatar user={f} size={28} />
              <div className="min-w-0">
                <p className="text-sm font-medium leading-tight">{f.name}</p>
                <p className="text-xs text-muted-foreground truncate">{f.email}</p>
              </div>
            </button>
          ))}
        </div>
      )}
      {open && query && filtered.length === 0 && (
        <div className="absolute z-50 top-full mt-1 w-full rounded-lg border bg-popover shadow-md p-3 text-center">
          <p className="text-xs text-muted-foreground">No friends found</p>
        </div>
      )}
    </div>
  );
}

export default function GoalFormModal({ open, onClose, editGoal }: {
  open: boolean; onClose: () => void; editGoal: Goal | null;
}) {
  const { toast } = useToast();
  const { data: books = [] } = useQuery<BookWithSessions[]>({ queryKey: ["/api/books"] });
  const { data: templates = [] } = useQuery<WorkoutTemplate[]>({ queryKey: ["/api/workout-templates"] });
  const { data: friends = [] } = useQuery<PublicUser[]>({
    queryKey: ["/api/friends"],
    queryFn: async () => (await apiRequest("GET", "/api/friends")).json(),
  });

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("general");
  const [progressType, setProgressType] = useState("percent");
  const [target, setTarget] = useState("100");
  const [current, setCurrent] = useState("0");
  const [priority, setPriority] = useState("medium");
  const [startDate, setStartDate] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [recurring, setRecurring] = useState("none");
  const [description, setDesc] = useState("");
  const [linkedBookId, setLinkedBookId] = useState("__none__");
  const [linkedTemplateId, setLinkedTemplateId] = useState("__none__");
  const [buddyUserId, setBuddyUserId] = useState<number | null>(null);
  const [horizon, setHorizon] = useState<string>("this_year");

  useEffect(() => {
    if (open) {
      setTitle(editGoal?.title ?? ""); setCategory(editGoal?.category ?? "general");
      setProgressType(editGoal?.progressType ?? "percent");
      setTarget(editGoal?.progressTarget?.toString() ?? "100");
      setCurrent(editGoal?.progressCurrent?.toString() ?? "0");
      setPriority(editGoal?.priority ?? "medium");
      setStartDate(editGoal?.startDate ?? ""); setTargetDate(editGoal?.targetDate ?? "");
      setRecurring(editGoal?.recurring ?? "none"); setDesc(editGoal?.description ?? "");
      setLinkedBookId(editGoal?.linkedBookId?.toString() ?? "__none__");
      setLinkedTemplateId(editGoal?.linkedTemplateId?.toString() ?? "__none__");
      setBuddyUserId(editGoal?.buddyUserId ?? null);
      setHorizon((editGoal as any)?.horizon ?? "this_year");
    }
  }, [open, editGoal]);

  const inv = () => queryClient.invalidateQueries({ queryKey: ["/api/goals"] });
  const createMut = useMutation({ mutationFn: (d: InsertGoal) => apiRequest("POST", "/api/goals", d), onSuccess: () => { inv(); toast({ title: "Goal created" }); onClose(); } });
  const updateMut = useMutation({ mutationFn: (d: Partial<InsertGoal>) => apiRequest("PATCH", `/api/goals/${editGoal?.id}`, d), onSuccess: () => { inv(); toast({ title: "Goal updated" }); onClose(); } });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const p: InsertGoal = {
      title: title.trim(), category, progressType,
      progressCurrent: parseFloat(current) || 0,
      progressTarget: parseFloat(target) || 100,
      priority, startDate: startDate || null, targetDate: targetDate || null,
      recurring, description: description.trim() || null,
      linkedBookId: (linkedBookId && linkedBookId !== "__none__") ? parseInt(linkedBookId) : null,
      linkedTemplateId: (linkedTemplateId && linkedTemplateId !== "__none__") ? parseInt(linkedTemplateId) : null,
      buddyUserId: buddyUserId ?? null,
      horizon,
    };
    editGoal ? updateMut.mutate(p) : createMut.mutate(p);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg flex flex-col max-h-[90vh] p-0 gap-0">
        <DialogHeader className="px-5 pt-4 pb-3 shrink-0 border-b"><DialogTitle>{editGoal ? "Edit Goal" : "Create Goal"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="space-y-1.5"><Label>Title *</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Read 5 books this month" required /></div>
          <div className="space-y-1.5">
            <Label>Horizon</Label>
            <Select value={horizon} onValueChange={setHorizon}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="this_year">📅 This Year</SelectItem>
                <SelectItem value="next_year">📆 Next Year</SelectItem>
                <SelectItem value="3_years">🗓️ 3 Years</SelectItem>
                <SelectItem value="5_years">🏔️ 5 Years</SelectItem>
                <SelectItem value="someday">💭 Someday / Vision</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Category</Label>
              <Select value={category} onValueChange={setCategory}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{GOAL_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="space-y-1.5"><Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</SelectItem>)}</SelectContent></Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label>Progress</Label>
              <Select value={progressType} onValueChange={setProgressType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PROGRESS_TYPES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="space-y-1.5"><Label>Current</Label><Input type="number" value={current} onChange={(e) => setCurrent(e.target.value)} step="0.1" /></div>
            <div className="space-y-1.5"><Label>Target</Label><Input type="number" value={target} onChange={(e) => setTarget(e.target.value)} step="0.1" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Start Date</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Target Date</Label><Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label>Repeats</Label>
            <Select value={recurring} onValueChange={setRecurring}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{RECURRENCE_OPTIONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent></Select>
          </div>

          {/* ── Accountabilibuddy ── */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Users size={13} className="text-muted-foreground" />
              <Label>Accountabilibuddy <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
            </div>
            {friends.length === 0 ? (
              <p className="text-xs text-muted-foreground border rounded-lg px-3 py-2.5 bg-muted/30">
                Add friends to assign an accountabilibuddy to this goal.
              </p>
            ) : (
              <BuddySearchPickerModal value={buddyUserId} onChange={setBuddyUserId} friends={friends} />
            )}
          </div>


          <div className="space-y-1.5"><Label>Notes</Label><Textarea value={description} onChange={(e) => setDesc(e.target.value)} rows={2} /></div>
          </div>
          <div className="flex gap-2 px-5 py-4 border-t shrink-0"><Button type="submit" disabled={createMut.isPending || updateMut.isPending} className="flex-1">{editGoal ? "Save" : "Create Goal"}</Button><Button type="button" variant="outline" onClick={onClose}>Cancel</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
