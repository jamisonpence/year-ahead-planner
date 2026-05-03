import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Chore, HouseProjectWithTasks, HouseProjectTask, Appliance, TabCollaborationWithUser } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Home, Plus, Pencil, Trash2, Search, CheckCircle2, Clock, Check, X, Circle,
  AlertTriangle, Wrench, RefreshCw, Package, Tag, ChevronDown, ChevronRight, Users,
} from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────

const CHORE_CATEGORIES = [
  { value: "cleaning",    label: "Cleaning"    },
  { value: "yard",        label: "Yard"        },
  { value: "maintenance", label: "Maintenance" },
  { value: "laundry",     label: "Laundry"     },
  { value: "cooking",     label: "Cooking"     },
  { value: "other",       label: "Other"       },
];

const FREQUENCIES = [
  { value: "daily",     label: "Daily"          },
  { value: "weekly",    label: "Weekly"         },
  { value: "biweekly",  label: "Every 2 weeks"  },
  { value: "monthly",   label: "Monthly"        },
  { value: "quarterly", label: "Quarterly"      },
  { value: "yearly",    label: "Yearly"         },
  { value: "custom",    label: "Custom (days)"  },
  { value: "as_needed", label: "As Needed"      },
];

const PRIORITIES = [
  { value: "low",    label: "Low"    },
  { value: "medium", label: "Medium" },
  { value: "high",   label: "High"   },
];

const PROJECT_STATUSES = [
  { value: "not_started", label: "Not Started" },
  { value: "in_progress", label: "In Progress" },
  { value: "done",        label: "Done"        },
  { value: "blocked",     label: "Blocked"     },
];

const PROJECT_CATEGORIES = [
  { value: "repair",      label: "Repair"      },
  { value: "renovation",  label: "Renovation"  },
  { value: "improvement", label: "Improvement" },
  { value: "cleaning",    label: "Cleaning"    },
  { value: "other",       label: "Other"       },
];

const APPLIANCE_LOCATIONS = [
  { value: "kitchen",     label: "Kitchen"     },
  { value: "bathroom",    label: "Bathroom"    },
  { value: "laundry",     label: "Laundry"     },
  { value: "garage",      label: "Garage"      },
  { value: "bedroom",     label: "Bedroom"     },
  { value: "living_room", label: "Living Room" },
  { value: "other",       label: "Other"       },
];

const PRIORITY_COLORS: Record<string, string> = {
  low:    "bg-slate-100 text-slate-700",
  medium: "bg-yellow-100 text-yellow-700",
  high:   "bg-red-100 text-red-700",
};

const STATUS_COLORS: Record<string, string> = {
  not_started: "bg-slate-100 text-slate-700",
  in_progress: "bg-blue-100 text-blue-700",
  done:        "bg-green-100 text-green-700",
  blocked:     "bg-red-100 text-red-700",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function choreStatus(chore: Chore): { label: string; color: string; icon: React.ElementType } {
  if (!chore.isActive) return { label: "Inactive", color: "text-muted-foreground", icon: Clock };
  if (!chore.nextDue) return { label: "No due date", color: "text-muted-foreground", icon: Clock };
  const days = daysUntil(chore.nextDue);
  if (days === null) return { label: "No due date", color: "text-muted-foreground", icon: Clock };
  if (days < 0) return { label: `${Math.abs(days)}d overdue`, color: "text-red-600", icon: AlertTriangle };
  if (days === 0) return { label: "Due today", color: "text-orange-600", icon: Clock };
  if (days <= 3) return { label: `Due in ${days}d`, color: "text-yellow-600", icon: Clock };
  return { label: `Due in ${days}d`, color: "text-muted-foreground", icon: Clock };
}

function nextDueAfterComplete(frequency: string, customDays: number | null | undefined): string {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const freqDays: Record<string, number> = {
    daily: 1, weekly: 7, biweekly: 14, monthly: 30, quarterly: 91, yearly: 365,
  };
  const days = frequency === "custom" ? (customDays ?? 7) : (freqDays[frequency] ?? 7);
  const next = new Date(today.getTime() + days * 86400000);
  return next.toISOString().slice(0, 10);
}

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
  catch { return d; }
}

// ── Empty forms ───────────────────────────────────────────────────────────────

const EMPTY_CHORE = {
  title: "", category: "cleaning", frequency: "weekly", customFrequencyDays: "" as string | number,
  nextDue: "", notes: "", isActive: true, priority: "medium", assignee: "", tags: "",
};

const EMPTY_PROJECT = {
  title: "", status: "not_started", priority: "medium", dueDate: "", completedDate: "",
  estimatedCost: "" as string | number, actualCost: "" as string | number,
  contractor: "", category: "other", notes: "", tags: "",
};

const EMPTY_APPLIANCE = {
  name: "", brand: "", model: "", serialNumber: "", location: "",
  purchaseDate: "", purchasePrice: "" as string | number, warrantyExpiry: "",
  lastServiced: "", serviceFrequencyMonths: "" as string | number, nextServiceDue: "", notes: "", tags: "",
};

// ═══════════════════════════════════════════════════════════════════════════════
// ── CHORES TAB ────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

function ChoresTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [filterTag, setFilterTag] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Chore | null>(null);
  const [form, setForm] = useState({ ...EMPTY_CHORE });
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());

  const { data: chores = [] } = useQuery<Chore[]>({ queryKey: ["/api/chores"] });

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    chores.forEach((c) => c.tags?.split(",").map((t) => t.trim()).filter(Boolean).forEach((t) => tags.add(t)));
    return Array.from(tags).sort();
  }, [chores]);

  const createMut = useMutation({
    mutationFn: (data: typeof form) => apiRequest("POST", "/api/chores", data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/chores"] }); closeModal(); toast({ title: "Chore added" }); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<typeof form> }) => apiRequest("PATCH", `/api/chores/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/chores"] }); closeModal(); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/chores/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/chores"] }); toast({ title: "Chore deleted" }); },
  });
  const completeMut = useMutation({
    mutationFn: (chore: Chore) => apiRequest("PATCH", `/api/chores/${chore.id}`, {
      lastCompleted: todayStr(),
      nextDue: chore.frequency === "as_needed" ? chore.nextDue : nextDueAfterComplete(chore.frequency, chore.customFrequencyDays),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/chores"] }); toast({ title: "Marked complete ✓" }); },
  });

  function openNew() { setEditing(null); setForm({ ...EMPTY_CHORE }); setModalOpen(true); }
  function openEdit(c: Chore) {
    setEditing(c);
    setForm({
      title: c.title, category: c.category, frequency: c.frequency,
      customFrequencyDays: c.customFrequencyDays ?? "",
      nextDue: c.nextDue ?? "", notes: c.notes ?? "", isActive: c.isActive,
      priority: c.priority, assignee: c.assignee ?? "", tags: c.tags ?? "",
    });
    setModalOpen(true);
  }
  function closeModal() { setModalOpen(false); setEditing(null); }

  function handleSave() {
    const payload = {
      ...form,
      customFrequencyDays: form.customFrequencyDays !== "" ? Number(form.customFrequencyDays) : null,
      nextDue: form.nextDue || null,
    };
    if (editing) updateMut.mutate({ id: editing.id, data: payload });
    else createMut.mutate(payload as any);
  }

  const filtered = chores.filter((c) => {
    const matchSearch = c.title.toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCat === "all" || c.category === filterCat;
    const matchTag = filterTag === "all" || (c.tags ?? "").split(",").map((t) => t.trim()).includes(filterTag);
    return matchSearch && matchCat && matchTag;
  });

  const sorted = [...filtered].sort((a, b) => {
    const da = daysUntil(a.nextDue) ?? 9999;
    const db = daysUntil(b.nextDue) ?? 9999;
    return da - db;
  });

  const grouped = useMemo(() => {
    const order = CHORE_CATEGORIES.map((c) => c.value);
    const map = new Map<string, Chore[]>();
    for (const cat of order) map.set(cat, []);
    for (const chore of sorted) {
      const list = map.get(chore.category) ?? [];
      list.push(chore);
      map.set(chore.category, list);
    }
    return Array.from(map.entries()).filter(([, chores]) => chores.length > 0);
  }, [sorted]);

  function toggleCat(cat: string) {
    setCollapsedCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input className="pl-8 h-9 w-48" placeholder="Search chores…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={filterCat} onValueChange={setFilterCat}>
            <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {CHORE_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {allTags.length > 0 && (
            <Select value={filterTag} onValueChange={setFilterTag}>
              <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tags</SelectItem>
                {allTags.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
        <Button size="sm" onClick={openNew}><Plus size={14} className="mr-1" />Add Chore</Button>
      </div>

      {grouped.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <RefreshCw size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No chores yet. Add your first one!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map(([cat, catChores]) => {
            const catLabel = CHORE_CATEGORIES.find((c) => c.value === cat)?.label ?? cat;
            const isCollapsed = collapsedCats.has(cat);
            return (
              <div key={cat}>
                <button
                  onClick={() => toggleCat(cat)}
                  className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-lg hover:bg-secondary/60 transition-colors mb-1.5"
                >
                  {isCollapsed ? <ChevronRight size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
                  <span className="text-sm font-semibold">{catLabel}</span>
                  <Badge variant="secondary" className="text-xs ml-auto">{catChores.length}</Badge>
                </button>
                {!isCollapsed && (
                  <div className="space-y-2 pl-2">
                    {catChores.map((chore) => {
                      const status = choreStatus(chore);
                      const StatusIcon = status.icon;
                      const freqLabel = FREQUENCIES.find((f) => f.value === chore.frequency)?.label ?? chore.frequency;
                      const tags = (chore.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean);
                      return (
                        <div key={chore.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/30 transition-colors">
                          <button
                            onClick={() => completeMut.mutate(chore)}
                            className="shrink-0 w-8 h-8 rounded-full border-2 flex items-center justify-center hover:border-green-500 hover:bg-green-50 transition-colors"
                            title="Mark complete"
                          >
                            <CheckCircle2 size={16} className="text-muted-foreground/40 hover:text-green-500" />
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`font-medium text-sm ${!chore.isActive ? "line-through text-muted-foreground" : ""}`}>{chore.title}</span>
                              <Badge variant="outline" className="text-xs">{freqLabel}</Badge>
                              <Badge className={`text-xs ${PRIORITY_COLORS[chore.priority]}`}>{chore.priority}</Badge>
                              {tags.map((t) => <Badge key={t} variant="secondary" className="text-xs"><Tag size={10} className="mr-0.5" />{t}</Badge>)}
                            </div>
                            <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                              {chore.assignee && <span>→ {chore.assignee}</span>}
                              {chore.lastCompleted && <span>Last done: {formatDate(chore.lastCompleted)}</span>}
                              <span className={`flex items-center gap-1 font-medium ${status.color}`}>
                                <StatusIcon size={11} />{status.label}
                              </span>
                            </div>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button onClick={() => openEdit(chore)} className="p-1.5 rounded hover:bg-secondary transition-colors"><Pencil size={13} /></button>
                            <button onClick={() => deleteMut.mutate(chore.id)} className="p-1.5 rounded hover:bg-destructive/10 hover:text-destructive transition-colors"><Trash2 size={13} /></button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Chore" : "Add Chore"}</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Title *</label>
              <Input placeholder="e.g. Vacuum living room" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Category</label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CHORE_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Priority</label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Frequency</label>
                <Select value={form.frequency} onValueChange={(v) => setForm({ ...form, frequency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{FREQUENCIES.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {form.frequency === "custom" && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Every N days</label>
                  <Input type="number" min={1} placeholder="7" value={form.customFrequencyDays} onChange={(e) => setForm({ ...form, customFrequencyDays: e.target.value })} />
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Next Due</label>
                <Input type="date" value={form.nextDue} onChange={(e) => setForm({ ...form, nextDue: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Assignee</label>
                <Input placeholder="e.g. Jamison" value={form.assignee} onChange={(e) => setForm({ ...form, assignee: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Tags (comma-separated)</label>
              <Input placeholder="e.g. Weekly, Downstairs, Pet" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes</label>
              <Textarea rows={2} placeholder="Any special instructions…" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="choreActive" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="rounded" />
              <label htmlFor="choreActive" className="text-sm">Active</label>
            </div>
            <div className="flex gap-2 pt-1">
              <Button className="flex-1" onClick={handleSave} disabled={!form.title.trim()}>{editing ? "Save" : "Add Chore"}</Button>
              <Button variant="outline" onClick={closeModal}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── PROJECTS TAB ──────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

// ── Inline QuickAdd ───────────────────────────────────────────────────────────
function QuickAdd({ placeholder, onAdd, className = "" }: {
  placeholder: string; onAdd: (title: string) => void; className?: string;
}) {
  const [val, setVal] = useState("");
  const [open, setOpen] = useState(false);
  const submit = () => { if (!val.trim()) return; onAdd(val.trim()); setVal(""); setOpen(false); };
  if (!open) return (
    <button onClick={() => setOpen(true)} className={`flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors ${className}`}>
      <Plus size={12} /> {placeholder}
    </button>
  );
  return (
    <div className="flex gap-1.5">
      <Input value={val} onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") { setOpen(false); setVal(""); } }}
        placeholder={placeholder} className="h-7 text-xs flex-1" autoFocus />
      <Button size="sm" className="h-7 px-2" onClick={submit}><Check size={12} /></Button>
      <Button size="sm" variant="ghost" className="h-7 px-1" onClick={() => { setOpen(false); setVal(""); }}><X size={12} /></Button>
    </div>
  );
}

function ProjectsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterTag, setFilterTag] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<HouseProjectWithTasks | null>(null);
  const [form, setForm] = useState({ ...EMPTY_PROJECT });
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const { data: projects = [] } = useQuery<HouseProjectWithTasks[]>({ queryKey: ["/api/house-projects"] });

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    projects.forEach((p) => p.tags?.split(",").map((t) => t.trim()).filter(Boolean).forEach((t) => tags.add(t)));
    return Array.from(tags).sort();
  }, [projects]);

  const inv = () => qc.invalidateQueries({ queryKey: ["/api/house-projects"] });

  const createMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/house-projects", data),
    onSuccess: () => { inv(); closeModal(); toast({ title: "Project added" }); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/house-projects/${id}`, data),
    onSuccess: () => { inv(); closeModal(); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/house-projects/${id}`),
    onSuccess: () => { inv(); toast({ title: "Project deleted" }); },
  });

  // Task mutations
  const addTask = useMutation({
    mutationFn: ({ projectId, title }: { projectId: number; title: string }) =>
      apiRequest("POST", `/api/house-projects/${projectId}/tasks`, { title, completed: false, priority: "medium", sortOrder: 0 }),
    onSuccess: inv,
  });
  const toggleTask = useMutation({
    mutationFn: ({ id, completed }: { id: number; completed: boolean }) =>
      apiRequest("PATCH", `/api/house-project-tasks/${id}`, { completed }),
    onSuccess: inv,
  });
  const deleteTask = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/house-project-tasks/${id}`),
    onSuccess: inv,
  });

  function openNew() { setEditing(null); setForm({ ...EMPTY_PROJECT }); setModalOpen(true); }
  function openEdit(p: HouseProjectWithTasks) {
    setEditing(p);
    setForm({
      title: p.title, status: p.status, priority: p.priority,
      dueDate: p.dueDate ?? "", completedDate: p.completedDate ?? "",
      estimatedCost: p.estimatedCost ?? "", actualCost: p.actualCost ?? "",
      contractor: p.contractor ?? "", category: p.category,
      notes: p.notes ?? "", tags: p.tags ?? "",
    });
    setModalOpen(true);
  }
  function closeModal() { setModalOpen(false); setEditing(null); }

  function handleSave() {
    const payload = {
      ...form,
      estimatedCost: form.estimatedCost !== "" ? Number(form.estimatedCost) : null,
      actualCost: form.actualCost !== "" ? Number(form.actualCost) : null,
      dueDate: form.dueDate || null,
      completedDate: form.completedDate || null,
    };
    if (editing) updateMut.mutate({ id: editing.id, data: payload });
    else createMut.mutate(payload);
  }

  const filtered = projects.filter((p) => {
    const matchSearch = p.title.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || p.status === filterStatus;
    const matchTag = filterTag === "all" || (p.tags ?? "").split(",").map((t) => t.trim()).includes(filterTag);
    return matchSearch && matchStatus && matchTag;
  });

  function toggleExpand(id: number) {
    setExpanded((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input className="pl-8 h-9 w-48" placeholder="Search projects…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {PROJECT_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {allTags.length > 0 && (
            <Select value={filterTag} onValueChange={setFilterTag}>
              <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tags</SelectItem>
                {allTags.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
        <Button size="sm" onClick={openNew}><Plus size={14} className="mr-1" />Add Project</Button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Wrench size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No projects yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((proj) => {
            const tags = (proj.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean);
            const isExpanded = expanded.has(proj.id);
            const daysLeft = daysUntil(proj.dueDate);
            const doneTasks = proj.tasks.filter((t) => t.completed).length;
            return (
              <div key={proj.id} className="rounded-lg border bg-card overflow-hidden">
                <div className="flex items-center gap-3 p-3 cursor-pointer hover:bg-accent/30 transition-colors" onClick={() => toggleExpand(proj.id)}>
                  {isExpanded ? <ChevronDown size={14} className="shrink-0 text-muted-foreground" /> : <ChevronRight size={14} className="shrink-0 text-muted-foreground" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{proj.title}</span>
                      <Badge className={`text-xs ${STATUS_COLORS[proj.status]}`}>{PROJECT_STATUSES.find((s) => s.value === proj.status)?.label}</Badge>
                      <Badge className={`text-xs ${PRIORITY_COLORS[proj.priority]}`}>{proj.priority}</Badge>
                      {proj.tasks.length > 0 && (
                        <span className="text-xs text-muted-foreground">{doneTasks}/{proj.tasks.length} tasks</span>
                      )}
                      {tags.map((t) => <Badge key={t} variant="secondary" className="text-xs"><Tag size={10} className="mr-0.5" />{t}</Badge>)}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                      <span>{PROJECT_CATEGORIES.find((c) => c.value === proj.category)?.label}</span>
                      {proj.dueDate && (
                        <span className={daysLeft !== null && daysLeft < 0 ? "text-red-600 font-medium" : ""}>
                          Due {formatDate(proj.dueDate)}{daysLeft !== null && daysLeft < 0 ? ` (${Math.abs(daysLeft)}d overdue)` : ""}
                        </span>
                      )}
                      {proj.estimatedCost && <span>Est. ${proj.estimatedCost.toLocaleString()}</span>}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => openEdit(proj)} className="p-1.5 rounded hover:bg-secondary transition-colors"><Pencil size={13} /></button>
                    <button onClick={() => deleteMut.mutate(proj.id)} className="p-1.5 rounded hover:bg-destructive/10 hover:text-destructive transition-colors"><Trash2 size={13} /></button>
                  </div>
                </div>
                {isExpanded && (
                  <div className="border-t bg-muted/10">
                    {/* Project details */}
                    {(proj.notes || proj.contractor || proj.actualCost != null) && (
                      <div className="px-4 pt-2 pb-1 text-sm space-y-0.5 border-b border-border/50">
                        {proj.contractor && <p className="text-xs"><span className="text-muted-foreground">Contractor:</span> {proj.contractor}</p>}
                        {proj.actualCost != null && <p className="text-xs"><span className="text-muted-foreground">Actual cost:</span> ${proj.actualCost.toLocaleString()}</p>}
                        {proj.notes && <p className="text-xs text-muted-foreground">{proj.notes}</p>}
                      </div>
                    )}
                    {/* Tasks */}
                    <div className="px-4 py-2 space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Tasks</p>
                      {proj.tasks.length === 0 && (
                        <p className="text-xs text-muted-foreground italic">No tasks yet</p>
                      )}
                      {proj.tasks.map((task) => (
                        <div key={task.id} className="flex items-center gap-2 group">
                          <button
                            onClick={() => toggleTask.mutate({ id: task.id, completed: !task.completed })}
                            className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                          >
                            {task.completed
                              ? <CheckCircle2 size={15} className="text-primary" />
                              : <Circle size={15} />}
                          </button>
                          <span className={`text-sm flex-1 ${task.completed ? "line-through text-muted-foreground" : ""}`}>{task.title}</span>
                          <button
                            onClick={() => deleteTask.mutate(task.id)}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-all"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                      <div className="pt-1">
                        <QuickAdd
                          placeholder="Add task..."
                          onAdd={(title) => addTask.mutate({ projectId: proj.id, title })}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Project" : "Add Project"}</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Title *</label>
              <Input placeholder="e.g. Fix garage door" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PROJECT_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Category</label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PROJECT_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Priority</label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Due Date</label>
                <Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Est. Cost ($)</label>
                <Input type="number" min={0} placeholder="0" value={form.estimatedCost} onChange={(e) => setForm({ ...form, estimatedCost: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Actual Cost ($)</label>
                <Input type="number" min={0} placeholder="0" value={form.actualCost} onChange={(e) => setForm({ ...form, actualCost: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Contractor</label>
              <Input placeholder="Name or company" value={form.contractor} onChange={(e) => setForm({ ...form, contractor: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Tags (comma-separated)</label>
              <Input placeholder="e.g. Exterior, DIY, Urgent" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes</label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            {form.status === "done" && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Completed Date</label>
                <Input type="date" value={form.completedDate} onChange={(e) => setForm({ ...form, completedDate: e.target.value })} />
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <Button className="flex-1" onClick={handleSave} disabled={!form.title.trim()}>{editing ? "Save" : "Add Project"}</Button>
              <Button variant="outline" onClick={closeModal}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── APPLIANCES TAB ────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

function AppliancesTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filterLoc, setFilterLoc] = useState("all");
  const [filterTag, setFilterTag] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Appliance | null>(null);
  const [form, setForm] = useState({ ...EMPTY_APPLIANCE });

  const { data: appliances = [] } = useQuery<Appliance[]>({ queryKey: ["/api/appliances"] });

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    appliances.forEach((a) => a.tags?.split(",").map((t) => t.trim()).filter(Boolean).forEach((t) => tags.add(t)));
    return Array.from(tags).sort();
  }, [appliances]);

  const createMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/appliances", data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/appliances"] }); closeModal(); toast({ title: "Appliance added" }); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/appliances/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/appliances"] }); closeModal(); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/appliances/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/appliances"] }); toast({ title: "Appliance deleted" }); },
  });

  function openNew() { setEditing(null); setForm({ ...EMPTY_APPLIANCE }); setModalOpen(true); }
  function openEdit(a: Appliance) {
    setEditing(a);
    setForm({
      name: a.name, brand: a.brand ?? "", model: a.model ?? "",
      serialNumber: a.serialNumber ?? "", location: a.location ?? "",
      purchaseDate: a.purchaseDate ?? "", purchasePrice: a.purchasePrice ?? "",
      warrantyExpiry: a.warrantyExpiry ?? "", lastServiced: a.lastServiced ?? "",
      serviceFrequencyMonths: a.serviceFrequencyMonths ?? "",
      nextServiceDue: a.nextServiceDue ?? "", notes: a.notes ?? "", tags: a.tags ?? "",
    });
    setModalOpen(true);
  }
  function closeModal() { setModalOpen(false); setEditing(null); }

  function handleSave() {
    const payload = {
      ...form,
      purchasePrice: form.purchasePrice !== "" ? Number(form.purchasePrice) : null,
      serviceFrequencyMonths: form.serviceFrequencyMonths !== "" ? Number(form.serviceFrequencyMonths) : null,
      location: form.location || null,
      purchaseDate: form.purchaseDate || null,
      warrantyExpiry: form.warrantyExpiry || null,
      lastServiced: form.lastServiced || null,
      nextServiceDue: form.nextServiceDue || null,
    };
    if (editing) updateMut.mutate({ id: editing.id, data: payload });
    else createMut.mutate(payload);
  }

  const filtered = appliances.filter((a) => {
    const matchSearch = a.name.toLowerCase().includes(search.toLowerCase()) || (a.brand ?? "").toLowerCase().includes(search.toLowerCase());
    const matchLoc = filterLoc === "all" || a.location === filterLoc;
    const matchTag = filterTag === "all" || (a.tags ?? "").split(",").map((t) => t.trim()).includes(filterTag);
    return matchSearch && matchLoc && matchTag;
  });

  function serviceStatus(a: Appliance): { label: string; color: string } {
    if (!a.nextServiceDue) return { label: "No service scheduled", color: "text-muted-foreground" };
    const days = daysUntil(a.nextServiceDue);
    if (days === null) return { label: "No service scheduled", color: "text-muted-foreground" };
    if (days < 0) return { label: `Service ${Math.abs(days)}d overdue`, color: "text-red-600" };
    if (days <= 30) return { label: `Service in ${days}d`, color: "text-yellow-600" };
    return { label: `Service in ${days}d`, color: "text-muted-foreground" };
  }

  function warrantyStatus(a: Appliance): { label: string; color: string } {
    if (!a.warrantyExpiry) return { label: "", color: "" };
    const days = daysUntil(a.warrantyExpiry);
    if (days === null) return { label: "", color: "" };
    if (days < 0) return { label: "Warranty expired", color: "text-red-500" };
    if (days <= 90) return { label: `Warranty expires in ${days}d`, color: "text-yellow-600" };
    return { label: `Warranty until ${formatDate(a.warrantyExpiry)}`, color: "text-muted-foreground" };
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input className="pl-8 h-9 w-48" placeholder="Search appliances…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={filterLoc} onValueChange={setFilterLoc}>
            <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All locations</SelectItem>
              {APPLIANCE_LOCATIONS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {allTags.length > 0 && (
            <Select value={filterTag} onValueChange={setFilterTag}>
              <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tags</SelectItem>
                {allTags.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
        <Button size="sm" onClick={openNew}><Plus size={14} className="mr-1" />Add Appliance</Button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Package size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No appliances yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((appl) => {
            const svc = serviceStatus(appl);
            const warr = warrantyStatus(appl);
            const tags = (appl.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean);
            return (
              <div key={appl.id} className="p-4 rounded-lg border bg-card space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm">{appl.name}</p>
                    {(appl.brand || appl.model) && (
                      <p className="text-xs text-muted-foreground">{[appl.brand, appl.model].filter(Boolean).join(" · ")}</p>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => openEdit(appl)} className="p-1.5 rounded hover:bg-secondary transition-colors"><Pencil size={13} /></button>
                    <button onClick={() => deleteMut.mutate(appl.id)} className="p-1.5 rounded hover:bg-destructive/10 hover:text-destructive transition-colors"><Trash2 size={13} /></button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {appl.location && <Badge variant="outline" className="text-xs">{APPLIANCE_LOCATIONS.find((l) => l.value === appl.location)?.label ?? appl.location}</Badge>}
                  {tags.map((t) => <Badge key={t} variant="secondary" className="text-xs"><Tag size={10} className="mr-0.5" />{t}</Badge>)}
                </div>
                <div className="text-xs space-y-0.5">
                  {appl.purchaseDate && <p className="text-muted-foreground">Purchased: {formatDate(appl.purchaseDate)}</p>}
                  {warr.label && <p className={warr.color}>{warr.label}</p>}
                  {appl.lastServiced && <p className="text-muted-foreground">Last serviced: {formatDate(appl.lastServiced)}</p>}
                  {svc.label !== "No service scheduled" && <p className={svc.color}>{svc.label}</p>}
                  {appl.serialNumber && <p className="text-muted-foreground font-mono text-[10px]">S/N: {appl.serialNumber}</p>}
                </div>
                {appl.notes && <p className="text-xs text-muted-foreground border-t pt-1">{appl.notes}</p>}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Appliance" : "Add Appliance"}</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Name *</label>
              <Input placeholder="e.g. Refrigerator" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Brand</label>
                <Input placeholder="e.g. Samsung" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Model</label>
                <Input placeholder="e.g. RF28R7351SG" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Location</label>
                <Select value={form.location || "_none"} onValueChange={(v) => setForm({ ...form, location: v === "_none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">None</SelectItem>
                    {APPLIANCE_LOCATIONS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Purchase Price ($)</label>
                <Input type="number" min={0} value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Purchase Date</label>
                <Input type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Warranty Expiry</label>
                <Input type="date" value={form.warrantyExpiry} onChange={(e) => setForm({ ...form, warrantyExpiry: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Last Serviced</label>
                <Input type="date" value={form.lastServiced} onChange={(e) => setForm({ ...form, lastServiced: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Next Service Due</label>
                <Input type="date" value={form.nextServiceDue} onChange={(e) => setForm({ ...form, nextServiceDue: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Serial Number</label>
              <Input placeholder="Optional" value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Tags (comma-separated)</label>
              <Input placeholder="e.g. Large, High-priority" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes</label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="flex gap-2 pt-1">
              <Button className="flex-1" onClick={handleSave} disabled={!form.name.trim()}>{editing ? "Save" : "Add Appliance"}</Button>
              <Button variant="outline" onClick={closeModal}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── MAIN PAGE ─────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

export default function HousekeepingPage() {
  const { data: chores = [] } = useQuery<Chore[]>({ queryKey: ["/api/chores"] });

  const { data: collabs = [] } = useQuery<TabCollaborationWithUser[]>({
    queryKey: ["/api/tab-collaborations"],
    queryFn: () => apiRequest("GET", "/api/tab-collaborations").then(r => r.json()),
  });
  const housekeepingCollab = collabs.find(c => c.tabName === "housekeeping" && c.status === "accepted");

  const overdueCount = chores.filter((c) => {
    if (!c.isActive || !c.nextDue) return false;
    return (daysUntil(c.nextDue) ?? 1) < 0;
  }).length;

  const dueTodayCount = chores.filter((c) => {
    if (!c.isActive || !c.nextDue) return false;
    return daysUntil(c.nextDue) === 0;
  }).length;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Home size={22} className="text-primary" />
        <div>
          <h1 className="text-xl font-bold">Housekeeping</h1>
          <p className="text-sm text-muted-foreground">Chores, projects & appliances</p>
        </div>
        {(overdueCount > 0 || dueTodayCount > 0) && (
          <div className="ml-auto flex gap-2">
            {overdueCount > 0 && <Badge className="bg-red-100 text-red-700">{overdueCount} overdue</Badge>}
            {dueTodayCount > 0 && <Badge className="bg-orange-100 text-orange-700">{dueTodayCount} due today</Badge>}
          </div>
        )}
      </div>

      {housekeepingCollab && (
        <div className="flex items-center gap-2 mb-5 px-3 py-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 text-sm text-emerald-800 dark:text-emerald-300">
          <Users size={14} className="shrink-0" />
          <span>
            Collaborating with <strong>{housekeepingCollab.otherUser.name}</strong>
            {housekeepingCollab.role === "collaborator" ? " — viewing their data" : " — they can see your data"}
          </span>
        </div>
      )}

      <Tabs defaultValue="chores">
        <TabsList className="mb-4">
          <TabsTrigger value="chores">Chores</TabsTrigger>
          <TabsTrigger value="projects">Projects</TabsTrigger>
          <TabsTrigger value="appliances">Appliances</TabsTrigger>
        </TabsList>
        <TabsContent value="chores"><ChoresTab /></TabsContent>
        <TabsContent value="projects"><ProjectsTab /></TabsContent>
        <TabsContent value="appliances"><AppliancesTab /></TabsContent>
      </Tabs>
    </div>
  );
}
