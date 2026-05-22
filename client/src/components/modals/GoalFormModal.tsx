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
import { Users, X } from "lucide-react";

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
    };
    editGoal ? updateMut.mutate(p) : createMut.mutate(p);
  };

  const selectedBuddy = friends.find((f) => f.id === buddyUserId) ?? null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editGoal ? "Edit Goal" : "Create Goal"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5"><Label>Title *</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Read 5 books this month" required /></div>
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
            ) : selectedBuddy ? (
              /* ── Selected state ── */
              <div className="flex items-center gap-2.5 rounded-lg border bg-primary/5 border-primary/30 px-3 py-2">
                <BuddyAvatar user={selectedBuddy} size={30} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-tight">{selectedBuddy.name}</p>
                  <p className="text-xs text-muted-foreground">Accountabilibuddy</p>
                </div>
                <button
                  type="button"
                  onClick={() => setBuddyUserId(null)}
                  className="p-1 rounded hover:bg-muted transition-colors"
                  aria-label="Remove buddy"
                >
                  <X size={13} className="text-muted-foreground" />
                </button>
              </div>
            ) : (
              /* ── Unselected: friend avatar grid ── */
              <div className="flex flex-wrap gap-2">
                {friends.map((f) => (
                  <button
                    type="button"
                    key={f.id}
                    onClick={() => setBuddyUserId(f.id)}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-full border bg-card hover:bg-muted/50 hover:border-primary/40 transition-all text-xs"
                    title={`Set ${f.name} as buddy`}
                  >
                    <BuddyAvatar user={f} size={20} />
                    <span className="font-medium">{f.name.split(" ")[0]}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {books.length > 0 && (
            <div className="space-y-1.5"><Label>Linked Book <span className="text-muted-foreground text-xs">(opt)</span></Label>
              <Select value={linkedBookId} onValueChange={setLinkedBookId}><SelectTrigger><SelectValue placeholder="None" /></SelectTrigger><SelectContent><SelectItem value="__none__">None</SelectItem>{books.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.title}</SelectItem>)}</SelectContent></Select>
            </div>
          )}
          {templates.length > 0 && (
            <div className="space-y-1.5"><Label>Linked Workout Template <span className="text-muted-foreground text-xs">(opt)</span></Label>
              <Select value={linkedTemplateId} onValueChange={setLinkedTemplateId}><SelectTrigger><SelectValue placeholder="None" /></SelectTrigger><SelectContent><SelectItem value="__none__">None</SelectItem>{templates.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}</SelectContent></Select>
            </div>
          )}
          <div className="space-y-1.5"><Label>Notes</Label><Textarea value={description} onChange={(e) => setDesc(e.target.value)} rows={2} /></div>
          <div className="flex gap-2"><Button type="submit" disabled={createMut.isPending || updateMut.isPending} className="flex-1">{editGoal ? "Save" : "Create Goal"}</Button><Button type="button" variant="outline" onClick={onClose}>Cancel</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
