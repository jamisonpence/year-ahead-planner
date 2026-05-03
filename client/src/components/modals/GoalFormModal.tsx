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
import type { Goal, InsertGoal, BookWithSessions, WorkoutTemplate } from "@shared/schema";

const PRIORITIES = ["low","medium","high"];

export default function GoalFormModal({ open, onClose, editGoal }: {
  open: boolean; onClose: () => void; editGoal: Goal | null;
}) {
  const { toast } = useToast();
  const { data: books = [] } = useQuery<BookWithSessions[]>({ queryKey: ["/api/books"] });
  const { data: templates = [] } = useQuery<WorkoutTemplate[]>({ queryKey: ["/api/workout-templates"] });

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
    };
    editGoal ? updateMut.mutate(p) : createMut.mutate(p);
  };

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
