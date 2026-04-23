import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { ChildWithDetails, ChildMilestone, ChildMemory, ChildPrepItem } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Baby, Plus, Pencil, Trash2, Check,
} from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────

const ACCENT_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f97316",
  "#10b981", "#3b82f6", "#f59e0b", "#ef4444",
];

const MILESTONE_CATEGORIES = [
  { value: "first",    label: "First Moments", emoji: "🎉" },
  { value: "motor",    label: "Motor",          emoji: "🏃" },
  { value: "speech",   label: "Speech",         emoji: "💬" },
  { value: "social",   label: "Social",         emoji: "👫" },
  { value: "academic", label: "Academic",       emoji: "📚" },
  { value: "health",   label: "Health",         emoji: "❤️" },
  { value: "other",    label: "Other",          emoji: "⭐" },
];

const MEMORY_MOODS = [
  { value: "happy",       label: "Happy",       emoji: "😄" },
  { value: "funny",       label: "Funny",       emoji: "😂" },
  { value: "proud",       label: "Proud",       emoji: "🥹" },
  { value: "sweet",       label: "Sweet",       emoji: "🥰" },
  { value: "bittersweet", label: "Bittersweet", emoji: "😌" },
];

const PREP_CATEGORIES = [
  { value: "health",   label: "Health"   },
  { value: "school",   label: "School"   },
  { value: "activity", label: "Activity" },
  { value: "party",    label: "Party"    },
  { value: "safety",   label: "Safety"   },
  { value: "gear",     label: "Gear"     },
  { value: "other",    label: "Other"    },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcAge(birthDate: string | null | undefined, atDate?: string): string {
  if (!birthDate) return "";
  const birth = new Date(birthDate);
  const ref = atDate ? new Date(atDate) : new Date();
  if (isNaN(birth.getTime())) return "";
  let years = ref.getFullYear() - birth.getFullYear();
  let months = ref.getMonth() - birth.getMonth();
  if (months < 0) { years--; months += 12; }
  if (ref.getDate() < birth.getDate()) months--;
  if (months < 0) { years--; months += 12; }
  const totalMonths = years * 12 + months;
  if (totalMonths < 24) return `${totalMonths} mo`;
  if (months === 0) return `${years} yr`;
  return `${years} yr ${months} mo`;
}

function moodEmoji(mood: string) {
  return MEMORY_MOODS.find((m) => m.value === mood)?.emoji ?? "😄";
}

function catLabel(cat: string) {
  return MILESTONE_CATEGORIES.find((c) => c.value === cat)?.label ?? cat;
}
function catEmoji(cat: string) {
  return MILESTONE_CATEGORIES.find((c) => c.value === cat)?.emoji ?? "⭐";
}

// ── Milestone Dialog ──────────────────────────────────────────────────────────

function MilestoneDialog({
  open, onClose, childId, editing,
}: {
  open: boolean; onClose: () => void;
  childId: number; editing: ChildMilestone | null;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({
    title: editing?.title ?? "",
    category: editing?.category ?? "other",
    date: editing?.date ?? "",
    notes: editing?.notes ?? "",
  });

  useMemo(() => {
    setForm({
      title: editing?.title ?? "",
      category: editing?.category ?? "other",
      date: editing?.date ?? "",
      notes: editing?.notes ?? "",
    });
  }, [editing, open]);

  const createMut = useMutation({
    mutationFn: (d: any) => apiRequest("POST", `/api/children/${childId}/milestones`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/children"] }); onClose(); },
    onError: () => toast({ title: "Error saving", variant: "destructive" }),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: number; d: any }) => apiRequest("PATCH", `/api/child-milestones/${id}`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/children"] }); onClose(); },
    onError: () => toast({ title: "Error saving", variant: "destructive" }),
  });

  function save() {
    if (!form.title.trim()) { toast({ title: "Title required", variant: "destructive" }); return; }
    const payload = { ...form, title: form.title.trim(), notes: form.notes.trim() || null, date: form.date || null };
    if (editing) updateMut.mutate({ id: editing.id, d: payload });
    else createMut.mutate(payload);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{editing ? "Edit Milestone" : "Add Milestone"}</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Title *</label>
            <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="First steps!" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Category</label>
              <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MILESTONE_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.emoji} {c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Date</label>
              <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Notes</label>
            <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Any details…" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={save}>Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Memory Dialog ─────────────────────────────────────────────────────────────

function MemoryDialog({
  open, onClose, childId, editing,
}: {
  open: boolean; onClose: () => void;
  childId: number; editing: ChildMemory | null;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({
    title: editing?.title ?? "",
    description: editing?.description ?? "",
    date: editing?.date ?? "",
    tags: editing?.tags ?? "",
    mood: editing?.mood ?? "happy",
  });

  useMemo(() => {
    setForm({
      title: editing?.title ?? "",
      description: editing?.description ?? "",
      date: editing?.date ?? "",
      tags: editing?.tags ?? "",
      mood: editing?.mood ?? "happy",
    });
  }, [editing, open]);

  const createMut = useMutation({
    mutationFn: (d: any) => apiRequest("POST", `/api/children/${childId}/memories`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/children"] }); onClose(); },
    onError: () => toast({ title: "Error saving", variant: "destructive" }),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: number; d: any }) => apiRequest("PATCH", `/api/child-memories/${id}`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/children"] }); onClose(); },
    onError: () => toast({ title: "Error saving", variant: "destructive" }),
  });

  function save() {
    if (!form.title.trim()) { toast({ title: "Title required", variant: "destructive" }); return; }
    const payload = { ...form, title: form.title.trim(), description: form.description.trim() || null, tags: form.tags.trim() || null, date: form.date || null };
    if (editing) updateMut.mutate({ id: editing.id, d: payload });
    else createMut.mutate(payload);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{editing ? "Edit Memory" : "Add Memory"}</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Title *</label>
            <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="First day of school" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Mood</label>
              <Select value={form.mood} onValueChange={(v) => setForm((f) => ({ ...f, mood: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MEMORY_MOODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.emoji} {m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Date</label>
              <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} placeholder="Tell the story…" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Tags (comma-separated)</label>
            <Input value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} placeholder="funny, outdoors" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={save}>Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Prep Item Dialog ──────────────────────────────────────────────────────────

function PrepDialog({
  open, onClose, childId, editing,
}: {
  open: boolean; onClose: () => void;
  childId: number; editing: ChildPrepItem | null;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({
    title: editing?.title ?? "",
    category: editing?.category ?? "other",
    dueDate: editing?.dueDate ?? "",
    notes: editing?.notes ?? "",
  });

  useMemo(() => {
    setForm({
      title: editing?.title ?? "",
      category: editing?.category ?? "other",
      dueDate: editing?.dueDate ?? "",
      notes: editing?.notes ?? "",
    });
  }, [editing, open]);

  const createMut = useMutation({
    mutationFn: (d: any) => apiRequest("POST", `/api/children/${childId}/prep-items`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/children"] }); onClose(); },
    onError: () => toast({ title: "Error saving", variant: "destructive" }),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: number; d: any }) => apiRequest("PATCH", `/api/child-prep-items/${id}`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/children"] }); onClose(); },
    onError: () => toast({ title: "Error saving", variant: "destructive" }),
  });

  function save() {
    if (!form.title.trim()) { toast({ title: "Title required", variant: "destructive" }); return; }
    const payload = { ...form, title: form.title.trim(), notes: form.notes.trim() || null, dueDate: form.dueDate || null };
    if (editing) updateMut.mutate({ id: editing.id, d: payload });
    else createMut.mutate(payload);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{editing ? "Edit Prep Item" : "Add Prep Item"}</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Title *</label>
            <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Doctor checkup" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Category</label>
              <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PREP_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Due Date</label>
              <Input type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Notes</label>
            <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={save}>Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Child Detail ──────────────────────────────────────────────────────────────

function ChildDetail({ child }: { child: ChildWithDetails }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("milestones");
  const [milestoneDialog, setMilestoneDialog] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<ChildMilestone | null>(null);
  const [memoryDialog, setMemoryDialog] = useState(false);
  const [editingMemory, setEditingMemory] = useState<ChildMemory | null>(null);
  const [prepDialog, setPrepDialog] = useState(false);
  const [editingPrep, setEditingPrep] = useState<ChildPrepItem | null>(null);

  const deleteMilestoneMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/child-milestones/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/children"] }),
  });
  const deleteMemoryMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/child-memories/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/children"] }),
  });
  const togglePrepMut = useMutation({
    mutationFn: ({ id, completed }: { id: number; completed: boolean }) =>
      apiRequest("PATCH", `/api/child-prep-items/${id}`, { completed }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/children"] }),
  });
  const deletePrepMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/child-prep-items/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/children"] }),
  });

  // Group milestones by category
  const milestonesByCategory = useMemo(() => {
    const map: Record<string, ChildMilestone[]> = {};
    MILESTONE_CATEGORIES.forEach((c) => { map[c.value] = []; });
    child.milestones.forEach((m) => {
      if (!map[m.category]) map[m.category] = [];
      map[m.category].push(m);
    });
    return map;
  }, [child.milestones]);

  // Group prep items by category
  const prepByCategory = useMemo(() => {
    const map: Record<string, ChildPrepItem[]> = {};
    PREP_CATEGORIES.forEach((c) => { map[c.value] = []; });
    child.prepItems.forEach((p) => {
      if (!map[p.category]) map[p.category] = [];
      map[p.category].push(p);
    });
    return map;
  }, [child.prepItems]);

  const accentColor = child.accentColor ?? "#6366f1";

  return (
    <div>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="milestones">Milestones <span className="ml-1 text-xs opacity-60">{child.milestones.length}</span></TabsTrigger>
          <TabsTrigger value="memories">Memories <span className="ml-1 text-xs opacity-60">{child.memories.length}</span></TabsTrigger>
          <TabsTrigger value="prep">Prep <span className="ml-1 text-xs opacity-60">{child.prepItems.length}</span></TabsTrigger>
        </TabsList>

        {/* ── Milestones ── */}
        <TabsContent value="milestones">
          <div className="flex justify-end mb-4">
            <Button size="sm" className="gap-1.5" onClick={() => { setEditingMilestone(null); setMilestoneDialog(true); }}>
              <Plus size={14} /> Add Milestone
            </Button>
          </div>
          {child.milestones.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <span className="text-4xl block mb-3">🎯</span>
              <p className="text-sm">No milestones yet. Add the first one!</p>
            </div>
          ) : (
            <div className="space-y-6">
              {MILESTONE_CATEGORIES.map((cat) => {
                const items = milestonesByCategory[cat.value] ?? [];
                if (items.length === 0) return null;
                return (
                  <div key={cat.value}>
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      {cat.emoji} {cat.label}
                    </h3>
                    <div className="space-y-2">
                      {items.map((ms) => (
                        <div key={ms.id} className="rounded-lg border bg-card p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <p className="text-sm font-medium">{ms.title}</p>
                              {ms.date && (
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-xs text-muted-foreground">{ms.date}</span>
                                  {child.birthDate && (
                                    <span className="text-xs text-muted-foreground/70">
                                      · age {calcAge(child.birthDate, ms.date)}
                                    </span>
                                  )}
                                </div>
                              )}
                              {ms.notes && <p className="text-xs text-muted-foreground mt-1">{ms.notes}</p>}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button onClick={() => { setEditingMilestone(ms); setMilestoneDialog(true); }}
                                className="p-1.5 rounded hover:bg-secondary transition-colors">
                                <Pencil size={12} className="text-muted-foreground" />
                              </button>
                              <button onClick={() => deleteMilestoneMut.mutate(ms.id)}
                                className="p-1.5 rounded hover:bg-secondary transition-colors">
                                <Trash2 size={12} className="text-muted-foreground hover:text-destructive" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Memories ── */}
        <TabsContent value="memories">
          <div className="flex justify-end mb-4">
            <Button size="sm" className="gap-1.5" onClick={() => { setEditingMemory(null); setMemoryDialog(true); }}>
              <Plus size={14} /> Add Memory
            </Button>
          </div>
          {child.memories.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <span className="text-4xl block mb-3">📸</span>
              <p className="text-sm">No memories yet. Capture the first one!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {child.memories.map((mem) => (
                <div key={mem.id} className="rounded-xl border bg-card overflow-hidden">
                  <div className="h-1 w-full" style={{ background: accentColor }} />
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{moodEmoji(mem.mood)}</span>
                          <h3 className="font-medium text-sm">{mem.title}</h3>
                        </div>
                        {mem.date && (
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-muted-foreground">{mem.date}</span>
                            {child.birthDate && (
                              <span className="text-xs text-muted-foreground/70">· age {calcAge(child.birthDate, mem.date)}</span>
                            )}
                          </div>
                        )}
                        {mem.description && <p className="text-sm text-muted-foreground mt-1.5">{mem.description}</p>}
                        {mem.tags && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {mem.tags.split(",").map((t) => t.trim()).filter(Boolean).map((t) => (
                              <Badge key={t} variant="secondary" className="text-xs py-0 px-1.5">{t}</Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => { setEditingMemory(mem); setMemoryDialog(true); }}
                          className="p-1.5 rounded hover:bg-secondary transition-colors">
                          <Pencil size={12} className="text-muted-foreground" />
                        </button>
                        <button onClick={() => deleteMemoryMut.mutate(mem.id)}
                          className="p-1.5 rounded hover:bg-secondary transition-colors">
                          <Trash2 size={12} className="text-muted-foreground hover:text-destructive" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Prep ── */}
        <TabsContent value="prep">
          <div className="flex justify-end mb-4">
            <Button size="sm" className="gap-1.5" onClick={() => { setEditingPrep(null); setPrepDialog(true); }}>
              <Plus size={14} /> Add Prep Item
            </Button>
          </div>
          {child.prepItems.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <span className="text-4xl block mb-3">📋</span>
              <p className="text-sm">No prep items yet.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {PREP_CATEGORIES.map((cat) => {
                const items = prepByCategory[cat.value] ?? [];
                if (items.length === 0) return null;
                const done = items.filter((i) => i.completed).length;
                const pct = Math.round((done / items.length) * 100);
                return (
                  <div key={cat.value}>
                    <div className="flex items-center justify-between mb-1.5">
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{cat.label}</h3>
                      <span className="text-xs text-muted-foreground">{done}/{items.length}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted mb-3 overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: accentColor }} />
                    </div>
                    <div className="space-y-2">
                      {items.map((item) => (
                        <div key={item.id} className="flex items-center gap-3 rounded-lg border bg-card p-3">
                          <button
                            onClick={() => togglePrepMut.mutate({ id: item.id, completed: !item.completed })}
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                              item.completed ? "bg-primary border-primary" : "border-muted-foreground/40"
                            }`}
                          >
                            {item.completed && <Check size={11} className="text-primary-foreground" />}
                          </button>
                          <div className="flex-1">
                            <p className={`text-sm ${item.completed ? "line-through text-muted-foreground" : ""}`}>{item.title}</p>
                            {item.dueDate && <p className="text-xs text-muted-foreground">Due {item.dueDate}</p>}
                            {item.notes && <p className="text-xs text-muted-foreground">{item.notes}</p>}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => { setEditingPrep(item); setPrepDialog(true); }}
                              className="p-1.5 rounded hover:bg-secondary transition-colors">
                              <Pencil size={12} className="text-muted-foreground" />
                            </button>
                            <button onClick={() => deletePrepMut.mutate(item.id)}
                              className="p-1.5 rounded hover:bg-secondary transition-colors">
                              <Trash2 size={12} className="text-muted-foreground hover:text-destructive" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <MilestoneDialog
        open={milestoneDialog}
        onClose={() => { setMilestoneDialog(false); setEditingMilestone(null); }}
        childId={child.id}
        editing={editingMilestone}
      />
      <MemoryDialog
        open={memoryDialog}
        onClose={() => { setMemoryDialog(false); setEditingMemory(null); }}
        childId={child.id}
        editing={editingMemory}
      />
      <PrepDialog
        open={prepDialog}
        onClose={() => { setPrepDialog(false); setEditingPrep(null); }}
        childId={child.id}
        editing={editingPrep}
      />
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function KidsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selectedChildId, setSelectedChildId] = useState<number | null>(null);
  const [childDialog, setChildDialog] = useState(false);
  const [editingChild, setEditingChild] = useState<ChildWithDetails | null>(null);
  const [childForm, setChildForm] = useState({ name: "", birthDate: "", notes: "", accentColor: ACCENT_COLORS[0] });

  const { data: allChildren = [] } = useQuery<ChildWithDetails[]>({
    queryKey: ["/api/children"],
    queryFn: async () => (await apiRequest("GET", "/api/children")).json(),
  });

  const selectedChild = useMemo(
    () => allChildren.find((c) => c.id === selectedChildId) ?? allChildren[0] ?? null,
    [allChildren, selectedChildId],
  );

  const createChildMut = useMutation({
    mutationFn: (d: any) => apiRequest("POST", "/api/children", d),
    onSuccess: async (r) => {
      const created = await r.json();
      qc.invalidateQueries({ queryKey: ["/api/children"] });
      setSelectedChildId(created.id);
      closeChildDialog();
    },
    onError: () => toast({ title: "Error saving", variant: "destructive" }),
  });
  const updateChildMut = useMutation({
    mutationFn: ({ id, d }: { id: number; d: any }) => apiRequest("PATCH", `/api/children/${id}`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/children"] }); closeChildDialog(); },
    onError: () => toast({ title: "Error saving", variant: "destructive" }),
  });
  const deleteChildMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/children/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/children"] });
      setSelectedChildId(null);
    },
  });

  function openAddChild() {
    setEditingChild(null);
    setChildForm({ name: "", birthDate: "", notes: "", accentColor: ACCENT_COLORS[0] });
    setChildDialog(true);
  }
  function openEditChild(c: ChildWithDetails) {
    setEditingChild(c);
    setChildForm({ name: c.name, birthDate: c.birthDate ?? "", notes: c.notes ?? "", accentColor: c.accentColor ?? ACCENT_COLORS[0] });
    setChildDialog(true);
  }
  function closeChildDialog() { setChildDialog(false); setEditingChild(null); }

  function saveChild() {
    if (!childForm.name.trim()) { toast({ title: "Name required", variant: "destructive" }); return; }
    const payload = { ...childForm, name: childForm.name.trim(), notes: childForm.notes.trim() || null, birthDate: childForm.birthDate || null };
    if (editingChild) updateChildMut.mutate({ id: editingChild.id, d: payload });
    else createChildMut.mutate(payload);
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Baby size={22} /> Kids
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {allChildren.length} {allChildren.length === 1 ? "child" : "children"}
          </p>
        </div>
        <Button onClick={openAddChild} size="sm" className="gap-1.5">
          <Plus size={15} /> Add Child
        </Button>
      </div>

      {allChildren.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Baby size={48} className="mx-auto mb-4 opacity-20" />
          <p className="text-sm mb-4">Add a child to start tracking milestones, memories, and prep.</p>
          <Button variant="outline" onClick={openAddChild} className="gap-1.5">
            <Plus size={14} /> Add Child
          </Button>
        </div>
      ) : (
        <>
          {/* Child selector pills */}
          {allChildren.length > 1 && (
            <div className="flex flex-wrap gap-2 mb-5">
              {allChildren.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedChildId(c.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium transition-all ${
                    (selectedChild?.id === c.id) ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-secondary"
                  }`}
                >
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ background: c.accentColor ?? "#6366f1" }}
                  />
                  {c.name}
                  {c.birthDate && <span className="text-xs opacity-70">· {calcAge(c.birthDate)}</span>}
                </button>
              ))}
            </div>
          )}

          {/* Selected child details */}
          {selectedChild && (
            <div>
              {/* Child header card */}
              <div className="rounded-xl border bg-card overflow-hidden mb-5">
                <div className="h-1.5" style={{ background: selectedChild.accentColor ?? "#6366f1" }} />
                <div className="p-4 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold">{selectedChild.name}</h2>
                    {selectedChild.birthDate && (
                      <p className="text-sm text-muted-foreground">
                        Born {selectedChild.birthDate} · {calcAge(selectedChild.birthDate)} old
                      </p>
                    )}
                    {selectedChild.notes && <p className="text-xs text-muted-foreground mt-1">{selectedChild.notes}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => openEditChild(selectedChild)} className="p-2 rounded hover:bg-secondary transition-colors">
                      <Pencil size={14} className="text-muted-foreground" />
                    </button>
                    <button
                      onClick={() => { if (confirm("Delete this child and all their data?")) deleteChildMut.mutate(selectedChild.id); }}
                      className="p-2 rounded hover:bg-secondary transition-colors"
                    >
                      <Trash2 size={14} className="text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                </div>
              </div>

              <ChildDetail child={selectedChild} />
            </div>
          )}
        </>
      )}

      {/* Add/Edit Child Dialog */}
      <Dialog open={childDialog} onOpenChange={(o) => { if (!o) closeChildDialog(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingChild ? "Edit Child" : "Add Child"}</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Name *</label>
              <Input value={childForm.name} onChange={(e) => setChildForm((f) => ({ ...f, name: e.target.value }))} placeholder="Child's name" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Birth Date</label>
              <Input type="date" value={childForm.birthDate} onChange={(e) => setChildForm((f) => ({ ...f, birthDate: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Notes</label>
              <Textarea value={childForm.notes} onChange={(e) => setChildForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Accent Color</label>
              <div className="flex gap-2 flex-wrap">
                {ACCENT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setChildForm((f) => ({ ...f, accentColor: c }))}
                    className={`w-7 h-7 rounded-full border-2 transition-transform ${childForm.accentColor === c ? "border-foreground scale-110" : "border-transparent"}`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={closeChildDialog}>Cancel</Button>
              <Button size="sm" onClick={saveChild}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
