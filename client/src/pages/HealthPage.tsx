import { useState, useMemo, useEffect, useContext, createContext, useCallback, useRef } from "react";
import type { ReactNode } from "react";
import PageShell from "@/components/PageShell";
import { useLocation, Router, Switch, Route } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePlanner } from "@/state/PlannerContext";
import PlannerHome from "@/pages/planner/Home";
import PlannerSetup from "@/pages/planner/Setup";
import PlannerPreferences from "@/pages/planner/Preferences";
import PlannerPlan from "@/pages/planner/Plan";
import PlannerLibrary from "@/pages/planner/Library";
import PlannerRecipeDetail from "@/pages/planner/RecipeDetail";
import PlannerShopping from "@/pages/planner/Shopping";
import type { Recipe as PlannerRecipe, MealSlot } from "@/lib/planner/types";
import { buildShoppingList } from "@/lib/planner/shopping";
import { format, parseISO, subDays, isBefore, isAfter, startOfDay } from "date-fns";
import {
  Activity, Pill, Moon, TrendingUp, Plus, Pencil, Trash2, X, Check,
  ChevronDown, ChevronUp, Star, Stethoscope, Phone, MapPin, CalendarCheck, CalendarClock,
  Users, UtensilsCrossed, Search, Loader2, Heart, Target, ArrowRight,
  BookOpen, Zap, BookMarked, Lock, Share2, MessageCircle, NotebookPen, Dumbbell, Link2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input as UIInput } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select as UISelect, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Medication, HealthMetric, SleepLog, CareProvider, TabCollaborationWithUser, FoodLogEntry, NutritionGoal, WorkoutPlan, Recipe, NutritionSummary, PublicUser } from "@shared/schema";

// ── Constants ──────────────────────────────────────────────────────────────────

const MED_TYPES = ["medication", "supplement", "vitamin", "other"];
const FREQUENCIES = ["Once daily", "Twice daily", "Three times daily", "As needed", "Weekly", "Monthly"];
const TIME_OF_DAY = ["Morning", "Afternoon", "Evening", "Bedtime", "With meals", "As needed"];
const METRIC_PRESETS = [
  { name: "Weight", unit: "lbs" },
  { name: "Blood Pressure", unit: "mmHg" },
  { name: "Blood Sugar", unit: "mg/dL" },
  { name: "Heart Rate", unit: "bpm" },
  { name: "Oxygen Saturation", unit: "%" },
  { name: "Temperature", unit: "°F" },
  { name: "Cholesterol", unit: "mg/dL" },
  { name: "Custom", unit: "" },
];
const QUALITY_LABELS = ["", "Poor", "Fair", "Okay", "Good", "Great"];

const TYPE_COLORS: Record<string, string> = {
  medication: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  supplement: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  vitamin: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  other: "bg-secondary text-muted-foreground",
};

// ── Shared helpers ─────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground block mb-1">{label}</label>
      {children}
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 ${props.className ?? ""}`} />;
}

function Select({ value, onChange, children, className }: { value: string; onChange: (v: string) => void; children: React.ReactNode; className?: string }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className={`w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 ${className ?? ""}`}
    >
      {children}
    </select>
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" rows={2} />;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-card border sm:rounded-2xl w-full max-w-md shadow-xl h-[100dvh] max-h-[100dvh] sm:h-auto sm:max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom,0px)]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-secondary transition-colors"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-4">{children}</div>
      </div>
    </div>
  );
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function openHealthRecipeTab(recipeTab: "saved" | "library") {
  localStorage.setItem("mylifos_health_tab_intent", "recipes");
  localStorage.setItem("mylifos_recipe_tab_intent", recipeTab);
  window.dispatchEvent(new CustomEvent("mylifos-open-health-tab", { detail: { tab: "recipes" } }));
  window.location.hash = "#/health";
}

// ── MEDICATIONS TAB ────────────────────────────────────────────────────────────

function MedicationsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Medication | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const { data: meds = [] } = useQuery<Medication[]>({ queryKey: ["/api/health/medications"] });

  const blank = { name: "", type: "medication", dosage: "", frequency: "", timeOfDay: "", startDate: "", isActive: true, prescribedBy: "", notes: "" };
  const [form, setForm] = useState(blank);

  function openNew() { setForm(blank); setEditing(null); setShowModal(true); }
  function openEdit(m: Medication) { setForm({ name: m.name, type: m.type, dosage: m.dosage ?? "", frequency: m.frequency ?? "", timeOfDay: m.timeOfDay ?? "", startDate: m.startDate ?? "", isActive: m.isActive, prescribedBy: m.prescribedBy ?? "", notes: m.notes ?? "" }); setEditing(m); setShowModal(true); }

  const saveMut = useMutation({
    mutationFn: (data: any) => editing
      ? apiRequest("PATCH", `/api/health/medications/${editing.id}`, data).then(r => r.json())
      : apiRequest("POST", "/api/health/medications", data).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/health/medications"] }); setShowModal(false); toast({ title: editing ? "Updated" : "Added", description: form.name }); },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/health/medications/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/health/medications"] }),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => apiRequest("PATCH", `/api/health/medications/${id}`, { isActive }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/health/medications"] }),
  });

  const active = meds.filter(m => m.isActive);
  const inactive = meds.filter(m => !m.isActive);

  function handleSubmit() {
    if (!form.name.trim()) return;
    saveMut.mutate({ ...form, name: form.name.trim() });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-sm text-muted-foreground">{active.length} active{inactive.length > 0 ? ` · ${inactive.length} inactive` : ""}</p>
        </div>
        <Button size="sm" onClick={openNew} className="gap-1.5"><Plus size={13} />Add</Button>
      </div>

      {active.length === 0 && inactive.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Pill size={32} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm">No medications or supplements yet</p>
          <p className="text-xs mt-1">Track your meds, vitamins, and supplements</p>
        </div>
      )}

      {active.length > 0 && (
        <div className="space-y-2 mb-4">
          {active.map(m => <MedCard key={m.id} med={m} onEdit={openEdit} onDelete={id => deleteMut.mutate(id)} onToggle={(id, v) => toggleMut.mutate({ id, isActive: v })} />)}
        </div>
      )}

      {inactive.length > 0 && (
        <div>
          <button onClick={() => setShowInactive(v => !v)} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors mb-2">
            {showInactive ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {inactive.length} inactive
          </button>
          {showInactive && (
            <div className="space-y-2 opacity-60">
              {inactive.map(m => <MedCard key={m.id} med={m} onEdit={openEdit} onDelete={id => deleteMut.mutate(id)} onToggle={(id, v) => toggleMut.mutate({ id, isActive: v })} />)}
            </div>
          )}
        </div>
      )}

      {showModal && (
        <Modal title={editing ? "Edit Medication" : "Add Medication"} onClose={() => setShowModal(false)}>
          <Field label="Name *">
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Lisinopril, Vitamin D" autoFocus />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Type">
              <Select value={form.type} onChange={v => setForm(f => ({ ...f, type: v }))}>
                {MED_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </Select>
            </Field>
            <Field label="Dosage">
              <Input value={form.dosage} onChange={e => setForm(f => ({ ...f, dosage: e.target.value }))} placeholder="e.g. 10mg" />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Frequency">
              <Select value={form.frequency} onChange={v => setForm(f => ({ ...f, frequency: v }))}>
                <option value="">Select…</option>
                {FREQUENCIES.map(fr => <option key={fr} value={fr}>{fr}</option>)}
              </Select>
            </Field>
            <Field label="Time of day">
              <Select value={form.timeOfDay} onChange={v => setForm(f => ({ ...f, timeOfDay: v }))}>
                <option value="">Select…</option>
                {TIME_OF_DAY.map(t => <option key={t} value={t}>{t}</option>)}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Start date">
              <Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
            </Field>
            <Field label="Prescribed by">
              <Input value={form.prescribedBy} onChange={e => setForm(f => ({ ...f, prescribedBy: e.target.value }))} placeholder="Doctor's name" />
            </Field>
          </div>
          <Field label="Notes">
            <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any additional notes…" />
          </Field>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} className="rounded" />
            Currently active
          </label>
          <div className="flex gap-2 pt-1">
            <Button onClick={handleSubmit} disabled={saveMut.isPending} className="flex-1">{saveMut.isPending ? "Saving…" : editing ? "Save changes" : "Add"}</Button>
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function MedCard({ med, onEdit, onDelete, onToggle }: {
  med: Medication;
  onEdit: (m: Medication) => void;
  onDelete: (id: number) => void;
  onToggle: (id: number, active: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3 p-3.5 rounded-xl border bg-card">
      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
        <Pill size={14} className="text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold">{med.name}</p>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium capitalize ${TYPE_COLORS[med.type] ?? TYPE_COLORS.other}`}>{med.type}</span>
          {!med.isActive && <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">Inactive</span>}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
          {med.dosage && <p className="text-xs text-muted-foreground">{med.dosage}</p>}
          {med.frequency && <p className="text-xs text-muted-foreground">{med.frequency}</p>}
          {med.timeOfDay && <p className="text-xs text-muted-foreground">{med.timeOfDay}</p>}
        </div>
        {med.prescribedBy && <p className="text-xs text-muted-foreground/70 mt-0.5">Dr. {med.prescribedBy}</p>}
        {med.notes && <p className="text-xs text-muted-foreground/70 mt-1 line-clamp-1 italic">{med.notes}</p>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => onToggle(med.id, !med.isActive)}
          title={med.isActive ? "Mark inactive" : "Mark active"}
          className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
        >
          <Check size={13} className={med.isActive ? "text-green-500" : "text-muted-foreground/30"} />
        </button>
        <button onClick={() => onEdit(med)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
          <Pencil size={13} className="text-muted-foreground" />
        </button>
        <button onClick={() => onDelete(med.id)} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-destructive transition-colors">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

// ── HEALTH METRICS TAB ─────────────────────────────────────────────────────────

function MetricsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showModal, setShowModal] = useState(false);
  const [expandedName, setExpandedName] = useState<string | null>(null);

  const { data: metrics = [] } = useQuery<HealthMetric[]>({ queryKey: ["/api/health/metrics"] });

  const blankForm = { name: "", customName: "", value: "", unit: "", date: todayStr(), notes: "" };
  const [form, setForm] = useState(blankForm);
  const [useCustom, setUseCustom] = useState(false);

  function openNew() { setForm(blankForm); setUseCustom(false); setShowModal(true); }

  const addMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/health/metrics", data).then(r => r.json()),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/health/metrics"] });
      setShowModal(false);
      setExpandedName(vars.name);
      toast({ title: "Logged", description: `${vars.name}: ${vars.value}${vars.unit ? " " + vars.unit : ""}` });
    },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/health/metrics/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/health/metrics"] }),
  });

  // Group by metric name, sort each group newest first
  const groups = useMemo(() => {
    const map: Record<string, HealthMetric[]> = {};
    for (const m of metrics) {
      if (!map[m.name]) map[m.name] = [];
      map[m.name].push(m);
    }
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [metrics]);

  const selectedPreset = METRIC_PRESETS.find(p => p.name === form.name);

  function handleSubmit() {
    const name = useCustom ? form.customName.trim() : form.name;
    if (!name || !form.value.trim()) return;
    const unit = form.unit || selectedPreset?.unit || "";
    addMut.mutate({ name, value: form.value.trim(), unit, date: form.date, notes: form.notes });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-muted-foreground">{groups.length} metric{groups.length !== 1 ? "s" : ""} tracked</p>
        <Button size="sm" onClick={openNew} className="gap-1.5"><Plus size={13} />Log Metric</Button>
      </div>

      {groups.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <TrendingUp size={32} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm">No metrics logged yet</p>
          <p className="text-xs mt-1">Track weight, blood pressure, blood sugar, and more</p>
        </div>
      )}

      <div className="space-y-3">
        {groups.map(([name, entries]) => {
          const latest = entries[0];
          const isExpanded = expandedName === name;
          return (
            <div key={name} className="rounded-xl border bg-card overflow-hidden">
              <button
                onClick={() => setExpandedName(isExpanded ? null : name)}
                className="w-full flex items-center justify-between p-4 hover:bg-secondary/30 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center shrink-0">
                    <TrendingUp size={14} className="text-rose-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{name}</p>
                    <p className="text-xs text-muted-foreground">
                      Latest: <span className="font-medium text-foreground">{latest.value}{latest.unit ? ` ${latest.unit}` : ""}</span>
                      {" · "}{format(parseISO(latest.date), "MMM d, yyyy")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{entries.length} log{entries.length !== 1 ? "s" : ""}</span>
                  {isExpanded ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
                </div>
              </button>
              {isExpanded && (
                <div className="border-t divide-y">
                  {entries.map(e => (
                    <div key={e.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-secondary/20">
                      <div>
                        <span className="text-sm font-medium">{e.value}{e.unit ? ` ${e.unit}` : ""}</span>
                        {e.notes && <span className="text-xs text-muted-foreground ml-2 italic">{e.notes}</span>}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground">{format(parseISO(e.date), "MMM d, yyyy")}</span>
                        <button onClick={() => deleteMut.mutate(e.id)} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showModal && (
        <Modal title="Log Health Metric" onClose={() => setShowModal(false)}>
          <Field label="Metric">
            <Select value={useCustom ? "Custom" : form.name} onChange={v => {
              if (v === "Custom") { setUseCustom(true); setForm(f => ({ ...f, name: "Custom", unit: "" })); }
              else { setUseCustom(false); const preset = METRIC_PRESETS.find(p => p.name === v); setForm(f => ({ ...f, name: v, unit: preset?.unit ?? "" })); }
            }}>
              <option value="">Select a metric…</option>
              {METRIC_PRESETS.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
            </Select>
          </Field>
          {useCustom && (
            <Field label="Custom metric name">
              <Input value={form.customName} onChange={e => setForm(f => ({ ...f, customName: e.target.value }))} placeholder="e.g. Waist circumference" autoFocus />
            </Field>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Value *">
              <Input value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} placeholder={form.name === "Blood Pressure" ? "e.g. 120/80" : "Enter value"} />
            </Field>
            <Field label="Unit">
              <Input value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} placeholder={selectedPreset?.unit ?? "e.g. lbs"} />
            </Field>
          </div>
          <Field label="Date">
            <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </Field>
          <Field label="Notes">
            <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes…" />
          </Field>
          <div className="flex gap-2 pt-1">
            <Button onClick={handleSubmit} disabled={addMut.isPending} className="flex-1">{addMut.isPending ? "Saving…" : "Log"}</Button>
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── SLEEP TAB ──────────────────────────────────────────────────────────────────

function SleepTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<SleepLog | null>(null);

  const { data: logs = [] } = useQuery<SleepLog[]>({ queryKey: ["/api/health/sleep"] });

  const blankForm = { date: todayStr(), hoursSlept: "", quality: "", bedtime: "", wakeTime: "", notes: "" };
  const [form, setForm] = useState(blankForm);

  function openNew() { setForm(blankForm); setEditing(null); setShowModal(true); }
  function openEdit(s: SleepLog) {
    setForm({ date: s.date, hoursSlept: String(s.hoursSlept), quality: s.quality ? String(s.quality) : "", bedtime: s.bedtime ?? "", wakeTime: s.wakeTime ?? "", notes: s.notes ?? "" });
    setEditing(s);
    setShowModal(true);
  }

  const saveMut = useMutation({
    mutationFn: (data: any) => editing
      ? apiRequest("PATCH", `/api/health/sleep/${editing.id}`, data).then(r => r.json())
      : apiRequest("POST", "/api/health/sleep", data).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/health/sleep"] }); setShowModal(false); toast({ title: "Sleep logged" }); },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/health/sleep/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/health/sleep"] }),
  });

  // Stats
  const last30 = logs.filter(l => l.date >= subDays(new Date(), 30).toISOString().slice(0, 10));
  const avgHours = last30.length ? Math.round((last30.reduce((s, l) => s + l.hoursSlept, 0) / last30.length) * 10) / 10 : null;
  const avgQuality = last30.filter(l => l.quality).length
    ? Math.round((last30.filter(l => l.quality).reduce((s, l) => s + (l.quality ?? 0), 0) / last30.filter(l => l.quality).length) * 10) / 10
    : null;

  function handleSubmit() {
    const hours = parseFloat(form.hoursSlept);
    if (!form.date || isNaN(hours) || hours <= 0) return;
    saveMut.mutate({
      date: form.date,
      hoursSlept: hours,
      quality: form.quality ? parseInt(form.quality) : null,
      bedtime: form.bedtime || null,
      wakeTime: form.wakeTime || null,
      notes: form.notes || null,
    });
  }

  const qualityColor = (q: number | null | undefined) => {
    if (!q) return "text-muted-foreground";
    if (q >= 4) return "text-green-500";
    if (q >= 3) return "text-amber-500";
    return "text-red-500";
  };

  return (
    <div>
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
        <div className="bg-card border rounded-xl p-3">
          <p className="text-xs text-muted-foreground mb-1">Avg hours (30d)</p>
          <p className="text-2xl font-bold">{avgHours ?? "–"}</p>
          <p className="text-xs text-muted-foreground">{avgHours ? `${last30.length} nights logged` : "No data yet"}</p>
        </div>
        <div className="bg-card border rounded-xl p-3">
          <p className="text-xs text-muted-foreground mb-1">Avg quality (30d)</p>
          <p className={`text-2xl font-bold ${qualityColor(avgQuality)}`}>{avgQuality ?? "–"}<span className="text-sm text-muted-foreground font-normal">{avgQuality ? "/5" : ""}</span></p>
          <p className="text-xs text-muted-foreground">{avgQuality ? QUALITY_LABELS[Math.round(avgQuality)] : "No ratings yet"}</p>
        </div>
        <div className="bg-card border rounded-xl p-3 col-span-2 sm:col-span-1">
          <p className="text-xs text-muted-foreground mb-1">Total logs</p>
          <p className="text-2xl font-bold">{logs.length}</p>
          <p className="text-xs text-muted-foreground">{logs.length > 0 ? `Since ${format(parseISO(logs[logs.length - 1].date), "MMM d, yyyy")}` : "Start logging tonight"}</p>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold">Sleep History</h3>
        <Button size="sm" onClick={openNew} className="gap-1.5"><Plus size={13} />Log Night</Button>
      </div>

      {logs.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Moon size={32} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm">No sleep logs yet</p>
          <p className="text-xs mt-1">Log your sleep to track patterns over time</p>
        </div>
      )}

      <div className="space-y-2">
        {logs.slice(0, 60).map(s => (
          <div key={s.id} className="flex items-center gap-3 p-3 rounded-xl border bg-card">
            <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
              <Moon size={14} className="text-indigo-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold">{s.hoursSlept}h</p>
                {s.quality && (
                  <div className="flex items-center gap-0.5">
                    {[1,2,3,4,5].map(i => (
                      <Star key={i} size={9} className={i <= s.quality! ? "fill-amber-400 text-amber-400" : "text-muted-foreground/20"} />
                    ))}
                    <span className="text-[10px] text-muted-foreground ml-0.5">{QUALITY_LABELS[s.quality]}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-xs text-muted-foreground">{format(parseISO(s.date), "EEE, MMM d")}</p>
                {s.bedtime && <p className="text-xs text-muted-foreground/60">{s.bedtime} → {s.wakeTime ?? "–"}</p>}
              </div>
              {s.notes && <p className="text-xs text-muted-foreground/70 mt-0.5 italic line-clamp-1">{s.notes}</p>}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => openEdit(s)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                <Pencil size={13} className="text-muted-foreground" />
              </button>
              <button onClick={() => deleteMut.mutate(s.id)} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-destructive transition-colors">
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <Modal title={editing ? "Edit Sleep Log" : "Log Sleep"} onClose={() => setShowModal(false)}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Date *">
              <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </Field>
            <Field label="Hours slept *">
              <Input type="number" step="0.5" min="0" max="24" value={form.hoursSlept} onChange={e => setForm(f => ({ ...f, hoursSlept: e.target.value }))} placeholder="e.g. 7.5" />
            </Field>
          </div>
          <Field label="Quality">
            <div className="flex gap-2">
              {[1,2,3,4,5].map(q => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, quality: f.quality === String(q) ? "" : String(q) }))}
                  className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition-all ${form.quality === String(q) ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-secondary"}`}
                >
                  {QUALITY_LABELS[q]}
                </button>
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Bedtime">
              <Input value={form.bedtime} onChange={e => setForm(f => ({ ...f, bedtime: e.target.value }))} placeholder="e.g. 11:00 PM" />
            </Field>
            <Field label="Wake time">
              <Input value={form.wakeTime} onChange={e => setForm(f => ({ ...f, wakeTime: e.target.value }))} placeholder="e.g. 7:00 AM" />
            </Field>
          </div>
          <Field label="Notes">
            <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="How did you sleep?" />
          </Field>
          <div className="flex gap-2 pt-1">
            <Button onClick={handleSubmit} disabled={saveMut.isPending} className="flex-1">{saveMut.isPending ? "Saving…" : editing ? "Save changes" : "Log"}</Button>
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── CARE TEAM TAB ──────────────────────────────────────────────────────────────

const SPECIALTIES = [
  "Primary Care", "Dentist", "Optometrist", "Cardiologist", "Dermatologist",
  "Endocrinologist", "Gastroenterologist", "Gynecologist / OB-GYN", "Neurologist",
  "Oncologist", "Orthopedist", "Pediatrician", "Psychiatrist", "Psychologist / Therapist",
  "Pulmonologist", "Rheumatologist", "Urologist", "Physical Therapist", "Chiropractor",
  "Nutritionist / Dietitian", "Other",
];

function CareTeamTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<CareProvider | null>(null);

  const { data: providers = [] } = useQuery<CareProvider[]>({ queryKey: ["/api/health/care-providers"] });

  const blank = { name: "", specialty: "", practice: "", phone: "", address: "", lastAppointment: "", nextAppointment: "", notes: "" };
  const [form, setForm] = useState(blank);

  function openNew() { setForm(blank); setEditing(null); setShowModal(true); }
  function openEdit(p: CareProvider) {
    setForm({
      name: p.name, specialty: p.specialty ?? "", practice: p.practice ?? "",
      phone: p.phone ?? "", address: p.address ?? "",
      lastAppointment: p.lastAppointment ?? "", nextAppointment: p.nextAppointment ?? "",
      notes: p.notes ?? "",
    });
    setEditing(p);
    setShowModal(true);
  }

  const saveMut = useMutation({
    mutationFn: (data: any) => editing
      ? apiRequest("PATCH", `/api/health/care-providers/${editing.id}`, data).then(r => r.json())
      : apiRequest("POST", "/api/health/care-providers", data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/health/care-providers"] });
      setShowModal(false);
      toast({ title: editing ? "Updated" : "Added", description: form.name });
    },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/health/care-providers/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/health/care-providers"] }),
  });

  function handleSubmit() {
    if (!form.name.trim()) return;
    saveMut.mutate({
      name: form.name.trim(),
      specialty: form.specialty || null,
      practice: form.practice || null,
      phone: form.phone || null,
      address: form.address || null,
      lastAppointment: form.lastAppointment || null,
      nextAppointment: form.nextAppointment || null,
      notes: form.notes || null,
    });
  }

  // Sort: upcoming next appt first, then no next appt, then past-only
  const today = startOfDay(new Date());
  const sorted = [...providers].sort((a, b) => {
    const aNext = a.nextAppointment ? parseISO(a.nextAppointment) : null;
    const bNext = b.nextAppointment ? parseISO(b.nextAppointment) : null;
    if (aNext && bNext) return aNext.getTime() - bNext.getTime();
    if (aNext && !bNext) return -1;
    if (!aNext && bNext) return 1;
    return a.name.localeCompare(b.name);
  });

  // Upcoming appts across all providers (next 90 days)
  const upcoming = providers
    .filter(p => p.nextAppointment)
    .map(p => ({ provider: p, date: parseISO(p.nextAppointment!) }))
    .filter(x => isAfter(x.date, new Date()) || x.date.toDateString() === today.toDateString())
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, 5);

  function apptLabel(dateStr: string | null | undefined) {
    if (!dateStr) return null;
    const d = parseISO(dateStr);
    const diff = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const label = format(d, "MMM d, yyyy");
    if (diff === 0) return { label, badge: "Today", color: "text-primary bg-primary/10 border-primary/20" };
    if (diff > 0 && diff <= 7) return { label, badge: `In ${diff}d`, color: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800" };
    if (diff > 0) return { label, badge: format(d, "MMM d"), color: "text-muted-foreground bg-secondary border-border" };
    return { label, badge: `${Math.abs(diff)}d ago`, color: "text-muted-foreground bg-secondary border-border" };
  }

  return (
    <div>
      {/* Upcoming appointments banner */}
      {upcoming.length > 0 && (
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 mb-5">
          <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">Upcoming Appointments</p>
          <div className="space-y-1.5">
            {upcoming.map(({ provider, date }) => {
              const info = apptLabel(provider.nextAppointment);
              return (
                <div key={provider.id} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <CalendarClock size={12} className="text-primary shrink-0" />
                    <span className="text-sm font-medium truncate">{provider.name}</span>
                    {provider.specialty && <span className="text-xs text-muted-foreground hidden sm:inline">{provider.specialty}</span>}
                  </div>
                  <span className={`text-xs font-semibold shrink-0 px-2 py-0.5 rounded-full border ${info?.color}`}>
                    {info?.badge}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-muted-foreground">{providers.length} provider{providers.length !== 1 ? "s" : ""}</p>
        <Button size="sm" onClick={openNew} className="gap-1.5"><Plus size={13} />Add Provider</Button>
      </div>

      {providers.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Stethoscope size={32} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm">No care providers yet</p>
          <p className="text-xs mt-1">Track your doctors, dentists, therapists, and more</p>
        </div>
      )}

      <div className="space-y-3">
        {sorted.map(p => {
          const lastInfo = apptLabel(p.lastAppointment);
          const nextInfo = apptLabel(p.nextAppointment);
          return (
            <div key={p.id} className="rounded-xl border bg-card p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center shrink-0 mt-0.5">
                  <Stethoscope size={16} className="text-teal-600 dark:text-teal-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold leading-snug">{p.name}</p>
                      {p.specialty && <p className="text-xs text-muted-foreground">{p.specialty}{p.practice ? ` · ${p.practice}` : ""}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                        <Pencil size={13} className="text-muted-foreground" />
                      </button>
                      <button onClick={() => deleteMut.mutate(p.id)} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Appointment dates */}
                  <div className="flex flex-wrap gap-3 mt-2.5">
                    {p.lastAppointment && (
                      <div className="flex items-center gap-1.5">
                        <CalendarCheck size={12} className="text-muted-foreground shrink-0" />
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider leading-none mb-0.5">Last visit</p>
                          <p className="text-xs font-medium">{lastInfo?.label}</p>
                        </div>
                      </div>
                    )}
                    {p.nextAppointment && (
                      <div className="flex items-center gap-1.5">
                        <CalendarClock size={12} className={nextInfo && parseISO(p.nextAppointment) > today ? "text-primary shrink-0" : "text-muted-foreground shrink-0"} />
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider leading-none mb-0.5">Next visit</p>
                          <p className={`text-xs font-medium ${nextInfo && parseISO(p.nextAppointment) > today ? "text-primary" : ""}`}>{nextInfo?.label}</p>
                        </div>
                      </div>
                    )}
                    {!p.lastAppointment && !p.nextAppointment && (
                      <p className="text-xs text-muted-foreground italic">No appointments recorded</p>
                    )}
                  </div>

                  {/* Contact info */}
                  {(p.phone || p.address) && (
                    <div className="flex flex-wrap gap-3 mt-2 pt-2 border-t border-dashed">
                      {p.phone && (
                        <a href={`tel:${p.phone}`} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                          <Phone size={11} className="shrink-0" />{p.phone}
                        </a>
                      )}
                      {p.address && (
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <MapPin size={11} className="shrink-0" />{p.address}
                        </p>
                      )}
                    </div>
                  )}

                  {p.notes && <p className="text-xs text-muted-foreground/70 mt-2 italic line-clamp-2">{p.notes}</p>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {showModal && (
        <Modal title={editing ? "Edit Provider" : "Add Care Provider"} onClose={() => setShowModal(false)}>
          <Field label="Name *">
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Dr. Sarah Kim" autoFocus />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Specialty">
              <Select value={form.specialty} onChange={v => setForm(f => ({ ...f, specialty: v }))}>
                <option value="">Select…</option>
                {SPECIALTIES.map(s => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
            <Field label="Practice / Clinic">
              <Input value={form.practice} onChange={e => setForm(f => ({ ...f, practice: e.target.value }))} placeholder="Clinic name" />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Last appointment">
              <Input type="date" value={form.lastAppointment} onChange={e => setForm(f => ({ ...f, lastAppointment: e.target.value }))} />
            </Field>
            <Field label="Next appointment">
              <Input type="date" value={form.nextAppointment} onChange={e => setForm(f => ({ ...f, nextAppointment: e.target.value }))} />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Phone">
              <Input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="(555) 555-5555" />
            </Field>
            <Field label="Address">
              <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Office address" />
            </Field>
          </div>
          <Field label="Notes">
            <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Insurance, referrals, anything useful…" />
          </Field>
          <div className="flex gap-2 pt-1">
            <Button onClick={handleSubmit} disabled={saveMut.isPending} className="flex-1">
              {saveMut.isPending ? "Saving…" : editing ? "Save changes" : "Add"}
            </Button>
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Shared meal-type + servings selectors ─────────────────────────────────
const MEAL_TYPES = ["breakfast","lunch","dinner","snack"] as const;
function MealServingRow({ mealType, setMealType, qty, setQty }: {
  mealType: string; setMealType: (v: string) => void; qty: number; setQty: (v: number) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <p className="text-[10px] text-muted-foreground mb-0.5">Meal</p>
        <UISelect value={mealType} onValueChange={setMealType}>
          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MEAL_TYPES.map(m => <SelectItem key={m} value={m} className="capitalize">{m.charAt(0).toUpperCase() + m.slice(1)}</SelectItem>)}
          </SelectContent>
        </UISelect>
      </div>
      <div>
        <p className="text-[10px] text-muted-foreground mb-0.5">Servings</p>
        <UIInput type="number" value={qty} min={0.25} step={0.25}
          onChange={e => setQty(parseFloat(e.target.value) || 1)} className="h-7 text-xs" />
      </div>
    </div>
  );
}
function MacroPreview({ cal, p, c, f }: { cal: number; p: number; c: number; f: number }) {
  return (
    <p className="text-[10px] text-muted-foreground">
      {Math.round(cal)} kcal · P {Math.round(p)}g · C {Math.round(c)}g · F {Math.round(f)}g
    </p>
  );
}

// ── FoodSearchAdd (unified composer: search + saved + manual) ─────────────
function FoodSearchAdd({ date, onAdded, defaultMeal = "snack" }: { date: string; onAdded: () => void; defaultMeal?: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [mode, setMode] = useState<"search" | "manual">("search");

  // ── Search tab state ───────────────────────────────────────────────────
  const [searchSource, setSearchSource] = useState<"usda" | "restaurant">("usda");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);
  const [searchMeal, setSearchMeal] = useState(defaultMeal);
  const [searchQty, setSearchQty] = useState(1);
  const [adding, setAdding] = useState(false);

  // FatSecret (restaurant) sub-state
  const [fsResults, setFsResults] = useState<any[]>([]);
  const [fsFood, setFsFood] = useState<any | null>(null);   // full food detail with servings
  const [fsServingIdx, setFsServingIdx] = useState(0);
  const [fsMeal, setFsMeal] = useState(defaultMeal);
  const [fsQty, setFsQty] = useState(1);
  const [fsAdding, setFsAdding] = useState(false);
  const [fsLoading, setFsLoading] = useState(false);

  // ── Recent/saved foods ─────────────────────────────────────────────────
  const [recentSelected, setRecentSelected] = useState<FoodLogEntry | null>(null);
  const [recentMeal, setRecentMeal] = useState(defaultMeal);
  const [recentQty, setRecentQty] = useState(1);
  const [recentAdding, setRecentAdding] = useState(false);

  const { data: foodHistory = [] } = useQuery<FoodLogEntry[]>({
    queryKey: ["/api/nutrition/food-log/history"],
    queryFn: () => apiRequest("GET", "/api/nutrition/food-log/history").then(r => r.json()),
  });

  // ── Manual entry state ────────────────────────────────────────────────
  const [qaName, setQaName] = useState("");
  const [qaServingSize, setQaServingSize] = useState("1");
  const [qaServingUnit, setQaServingUnit] = useState("serving");
  const [qaCals, setQaCals] = useState("");
  const [qaProt, setQaProt] = useState("");
  const [qaCarbs, setQaCarbs] = useState("");
  const [qaFat, setQaFat] = useState("");
  const [qaMeal, setQaMeal] = useState(defaultMeal);
  const [qaQty, setQaQty] = useState(1);
  const [qaSaveRecipe, setQaSaveRecipe] = useState(false);
  const [qaAdding, setQaAdding] = useState(false);

  // ── Ingredient builder (inside Manual Entry) ──────────────────────────
  type QAIngredient = {
    id: number; name: string;
    servingSize: number; servingUnit: string;
    qty: number;
    nutrients: { calories: number; protein: number; carbs: number; fat: number; fiber: number; sugar: number; sodium: number };
  };
  const [qaShowIngBuilder, setQaShowIngBuilder] = useState(false);
  const [qaIngredients, setQaIngredients] = useState<QAIngredient[]>([]);
  const [qaIngQuery, setQaIngQuery] = useState("");
  const [qaIngResults, setQaIngResults] = useState<any[]>([]);
  const [qaIngSearching, setQaIngSearching] = useState(false);
  const [qaIngPending, setQaIngPending] = useState<any | null>(null);
  const [qaIngPendingQty, setQaIngPendingQty] = useState(1);

  // Auto-fill macro fields whenever ingredient list changes
  useEffect(() => {
    if (qaIngredients.length === 0) return;
    const totals = qaIngredients.reduce(
      (acc, ing) => ({
        calories: acc.calories + ing.nutrients.calories * ing.qty,
        protein:  acc.protein  + ing.nutrients.protein  * ing.qty,
        carbs:    acc.carbs    + ing.nutrients.carbs     * ing.qty,
        fat:      acc.fat      + ing.nutrients.fat       * ing.qty,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
    setQaCals(String(Math.round(totals.calories)));
    setQaProt(String(Math.round(totals.protein)));
    setQaCarbs(String(Math.round(totals.carbs)));
    setQaFat(String(Math.round(totals.fat)));
  }, [qaIngredients]);

  async function doIngSearch() {
    if (!qaIngQuery.trim()) return;
    setQaIngSearching(true);
    try {
      const r = await apiRequest("GET", `/api/nutrition/usda-search?q=${encodeURIComponent(qaIngQuery)}`);
      const data = await r.json();
      setQaIngResults(data.foods || []);
    } catch { toast({ title: "Search failed", variant: "destructive" }); }
    setQaIngSearching(false);
  }

  function confirmIngredient() {
    if (!qaIngPending) return;
    setQaIngredients(prev => [...prev, {
      id: Date.now(),
      name: qaIngPending.description,
      servingSize: qaIngPending.servingSize,
      servingUnit: qaIngPending.servingUnit,
      qty: qaIngPendingQty,
      nutrients: qaIngPending.nutrients,
    }]);
    setQaIngPending(null);
    setQaIngQuery("");
    setQaIngResults([]);
    setQaIngPendingQty(1);
  }

  // ── My Recipes tab state ───────────────────────────────────────────────
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [recipeMeal, setRecipeMeal] = useState(defaultMeal);
  const [recipeQty, setRecipeQty] = useState(1);
  const [recipeAdding, setRecipeAdding] = useState(false);

  const { data: recipes = [] } = useQuery<Recipe[]>({
    queryKey: ["/api/recipes"],
    queryFn: () => apiRequest("GET", "/api/recipes").then(r => r.json()),
  });

  // ── Search tab handlers ────────────────────────────────────────────────
  async function doSearch() {
    if (!query.trim()) return;
    setSearching(true);
    if (searchSource === "usda") {
      try {
        const r = await apiRequest("GET", `/api/nutrition/usda-search?q=${encodeURIComponent(query)}`);
        const data = await r.json();
        setResults(data.foods || []);
      } catch { toast({ title: "Search failed", variant: "destructive" }); }
    } else {
      try {
        const r = await apiRequest("GET", `/api/nutrition/fatsecret-search?q=${encodeURIComponent(query)}`);
        const data = await r.json();
        if (!data.configured) {
          toast({ title: "FatSecret not configured", description: "Add FATSECRET_CLIENT_ID and FATSECRET_CLIENT_SECRET to your environment variables.", variant: "destructive" });
        }
        setFsResults(data.foods || []);
      } catch { toast({ title: "Search failed", variant: "destructive" }); }
    }
    setSearching(false);
  }

  async function selectFsFood(foodId: string) {
    setFsLoading(true);
    setFsFood(null);
    try {
      const r = await apiRequest("GET", `/api/nutrition/fatsecret-food/${foodId}`);
      const data = await r.json();
      setFsFood(data);
      setFsServingIdx(0);
      setFsMeal("snack");
      setFsQty(1);
    } catch { toast({ title: "Could not load food details", variant: "destructive" }); }
    setFsLoading(false);
  }

  async function addFsFood() {
    if (!fsFood || !fsFood.servings?.length) return;
    const serving = fsFood.servings[fsServingIdx];
    setFsAdding(true);
    try {
      await apiRequest("POST", "/api/nutrition/food-log", {
        foodName:    fsFood.brandName ? `${fsFood.brandName} — ${fsFood.foodName}` : fsFood.foodName,
        servingSize: 1,
        servingUnit: serving.servingDescription,
        quantity:    fsQty,
        mealType:    fsMeal,
        date,
        calories:    serving.calories,
        protein:     serving.protein,
        carbs:       serving.carbs,
        fat:         serving.fat,
        fiber:       serving.fiber,
        sugar:       serving.sugar,
        sodium:      serving.sodium,
      });
      setFsFood(null); setFsResults([]); setQuery(""); setFsQty(1);
      onAdded();
      toast({ title: "Food logged" });
    } catch { toast({ title: "Failed to log food", variant: "destructive" }); }
    setFsAdding(false);
  }

  async function addSearchFood() {
    if (!selected) return;
    setAdding(true);
    try {
      await apiRequest("POST", "/api/nutrition/food-log", {
        foodName: selected.description,
        usdaFoodId: String(selected.fdcId),
        servingSize: selected.servingSize,
        servingUnit: selected.servingUnit,
        quantity: searchQty,
        mealType: searchMeal,
        date,
        calories: selected.nutrients.calories,
        protein:  selected.nutrients.protein,
        carbs:    selected.nutrients.carbs,
        fat:      selected.nutrients.fat,
        fiber:    selected.nutrients.fiber,
        sugar:    selected.nutrients.sugar,
        sodium:   selected.nutrients.sodium,
      });
      setSelected(null); setQuery(""); setResults([]); setSearchQty(1);
      onAdded();
      toast({ title: "Food logged" });
    } catch { toast({ title: "Failed to log food", variant: "destructive" }); }
    setAdding(false);
  }

  // ── Recent food re-log handler ─────────────────────────────────────────
  async function addRecentFood() {
    if (!recentSelected) return;
    setRecentAdding(true);
    try {
      await apiRequest("POST", "/api/nutrition/food-log", {
        foodName:    recentSelected.foodName,
        usdaFoodId:  recentSelected.usdaFoodId,
        servingSize: recentSelected.servingSize,
        servingUnit: recentSelected.servingUnit,
        quantity:    recentQty,
        mealType:    recentMeal,
        date,
        calories:    recentSelected.calories,
        protein:     recentSelected.protein,
        carbs:       recentSelected.carbs,
        fat:         recentSelected.fat,
        fiber:       recentSelected.fiber,
        sugar:       recentSelected.sugar,
        sodium:      recentSelected.sodium,
      });
      setRecentSelected(null); setRecentQty(1);
      onAdded();
      toast({ title: `${recentSelected.foodName} logged` });
    } catch { toast({ title: "Failed to log food", variant: "destructive" }); }
    setRecentAdding(false);
  }

  function saveRecentAsMeal(item: FoodLogEntry) {
    setQaName(item.foodName);
    setQaServingSize(String(item.servingSize || 1));
    setQaServingUnit(item.servingUnit || "serving");
    setQaCals(String(Math.round(Number(item.calories) || 0)));
    setQaProt(String(Math.round(Number(item.protein) || 0)));
    setQaCarbs(String(Math.round(Number(item.carbs) || 0)));
    setQaFat(String(Math.round(Number(item.fat) || 0)));
    setQaMeal(item.mealType || defaultMeal);
    setQaQty(1);
    setQaSaveRecipe(true);
    setRecentSelected(null);
    setMode("manual");
  }

  // ── Manual entry handler ───────────────────────────────────────────────
  async function addQuickFood() {
    if (!qaName.trim() || !qaCals) return;
    setQaAdding(true);
    try {
      const cals  = parseFloat(qaCals)  || 0;
      const prot  = parseFloat(qaProt)  || 0;
      const carbs = parseFloat(qaCarbs) || 0;
      const fat   = parseFloat(qaFat)   || 0;
      const servSz = parseFloat(qaServingSize) || 1;

      // Log to food log
      await apiRequest("POST", "/api/nutrition/food-log", {
        foodName: qaName.trim(),
        servingSize: servSz,
        servingUnit: qaServingUnit || "serving",
        quantity: qaQty,
        mealType: qaMeal,
        date,
        calories: cals,
        protein:  prot,
        carbs,
        fat,
        fiber: 0, sugar: 0, sodium: 0,
        ingredientsJson: qaIngredients.length > 0 ? JSON.stringify(qaIngredients) : undefined,
      });

      // Optionally save as recipe
      if (qaSaveRecipe) {
        const nutrition: NutritionSummary = { calories: cals, protein: prot, carbs, fat, fiber: 0, sugar: 0, sodium: 0, servings: 1 };
        // Build ingredientsJson from USDA ingredient builder if used
        const ingredientsJson = qaIngredients.length > 0
          ? JSON.stringify(qaIngredients.map(ing => ({ name: ing.name, qty: `${ing.qty} × ${ing.servingSize}${ing.servingUnit}` })))
          : "[]";
        await apiRequest("POST", "/api/recipes", {
          name: qaName.trim(),
          emoji: "🍽️",
          servings: 1,
          ingredientsJson,
          nutritionData: JSON.stringify(nutrition),
        });
        qc.invalidateQueries({ queryKey: ["/api/recipes"] });
        toast({ title: "Logged & saved as recipe!" });
      } else {
        toast({ title: "Food logged" });
      }

      // Reset
      setQaName(""); setQaCals(""); setQaProt(""); setQaCarbs(""); setQaFat("");
      setQaServingSize("1"); setQaServingUnit("serving"); setQaQty(1); setQaSaveRecipe(false);
      setQaIngredients([]); setQaIngQuery(""); setQaIngResults([]); setQaIngPending(null);
      onAdded();
    } catch { toast({ title: "Failed to log food", variant: "destructive" }); }
    setQaAdding(false);
  }

  // ── My Recipes handler ─────────────────────────────────────────────────
  async function addRecipeFood() {
    if (!selectedRecipe) return;
    setRecipeAdding(true);
    try {
      let nutrition: NutritionSummary | null = null;
      try { nutrition = selectedRecipe.nutritionData ? JSON.parse(selectedRecipe.nutritionData as string) : null; } catch {}

      await apiRequest("POST", "/api/nutrition/food-log", {
        foodName: selectedRecipe.name,
        servingSize: 1,
        servingUnit: "serving",
        quantity: recipeQty,
        mealType: recipeMeal,
        date,
        calories: nutrition?.calories ?? 0,
        protein:  nutrition?.protein  ?? 0,
        carbs:    nutrition?.carbs    ?? 0,
        fat:      nutrition?.fat      ?? 0,
        fiber:    nutrition?.fiber    ?? 0,
        sugar:    nutrition?.sugar    ?? 0,
        sodium:   nutrition?.sodium   ?? 0,
      });
      setSelectedRecipe(null); setRecipeQty(1);
      onAdded();
      toast({ title: `${selectedRecipe.name} logged` });
    } catch { toast({ title: "Failed to log recipe", variant: "destructive" }); }
    setRecipeAdding(false);
  }

  const recipeFilter = query.trim().toLowerCase();
  const filteredRecipes = recipes.filter(r =>
    !recipeFilter || r.name.toLowerCase().includes(recipeFilter)
  );

  return (
    <div className="rounded-xl border bg-card p-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold">Log Food</p>
          <p className="text-[10px] text-muted-foreground">Search recent meals, recipes, foods, and restaurants in one place.</p>
        </div>
        <button
          type="button"
          onClick={() => setMode(mode === "manual" ? "search" : "manual")}
          className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all ${
            mode === "manual"
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary"
          }`}
        >
          <Zap size={10} /> Manual Entry
        </button>
      </div>

      {/* ── Unified search composer ────────────────────────────────── */}
      {mode === "search" && (
        <div className="space-y-2">
          {/* Source toggle */}
          <div className="flex rounded-lg border overflow-hidden text-xs font-medium">
            <button
              onClick={() => { setSearchSource("usda"); setFsResults([]); setFsFood(null); setResults([]); setSelected(null); }}
              className={`flex-1 py-1.5 transition-colors ${searchSource === "usda" ? "bg-foreground text-background" : "bg-transparent text-muted-foreground hover:bg-secondary/60"}`}
            >🥗 USDA Foods</button>
            <button
              onClick={() => { setSearchSource("restaurant"); setResults([]); setSelected(null); setFsResults([]); setFsFood(null); }}
              className={`flex-1 py-1.5 transition-colors ${searchSource === "restaurant" ? "bg-foreground text-background" : "bg-transparent text-muted-foreground hover:bg-secondary/60"}`}
            >🍔 Restaurants</button>
          </div>

          <div className="flex gap-2">
            <UIInput
              value={query}
              onChange={e => {
                setQuery(e.target.value);
                if (!e.target.value) { setResults([]); setSelected(null); setFsResults([]); setFsFood(null); }
              }}
              onKeyDown={e => e.key === "Enter" && doSearch()}
              placeholder={searchSource === "restaurant" ? "e.g. McDonald's cheeseburger, Chipotle bowl…" : "Search USDA database (e.g. chicken breast)"}
              className="flex-1 h-8 text-sm"
            />
            <Button size="sm" variant="outline" onClick={doSearch} disabled={searching} className="h-8 shrink-0">
              {searching ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
            </Button>
          </div>

          {/* Recent foods — shown when query is empty and no item selected */}
          {!query && !selected && !recentSelected && !selectedRecipe && foodHistory.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-0.5">Recent meals</p>
              <div className="space-y-1 max-h-52 overflow-y-auto">
                {foodHistory.map(item => (
                  <button key={item.id} onClick={() => { setRecentSelected(item); setRecentMeal("snack"); setRecentQty(1); }}
                    className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-secondary/60 border border-transparent hover:border-border transition-all group">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{item.foodName}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {Math.round(Number(item.calories))} kcal · P {Math.round(Number(item.protein))}g · C {Math.round(Number(item.carbs))}g · F {Math.round(Number(item.fat))}g
                          {item.servingSize ? ` per ${item.servingSize}${item.servingUnit}` : ""}
                        </p>
                      </div>
                      <Plus size={13} className="text-muted-foreground/40 group-hover:text-primary shrink-0 transition-colors" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Saved recipes surface in the same search flow */}
          {!selected && !recentSelected && !selectedRecipe && filteredRecipes.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2 px-0.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Saved recipes</p>
                <a
                  href="#/health"
                  onClick={() => openHealthRecipeTab("saved")}
                  className="text-[10px] text-primary hover:underline shrink-0"
                >
                  Manage saved
                </a>
              </div>
              <div className="space-y-1 max-h-44 overflow-y-auto border rounded-lg p-1">
                {filteredRecipes.slice(0, query ? 6 : 4).map(recipe => {
                  let nutrition: NutritionSummary | null = null;
                  try { nutrition = recipe.nutritionData ? JSON.parse(recipe.nutritionData as string) : null; } catch {}
                  return (
                    <button key={recipe.id} onClick={() => { setSelectedRecipe(recipe); setRecipeMeal(defaultMeal); setRecipeQty(1); }}
                      className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-secondary/60 transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="text-base leading-none">{recipe.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{recipe.name}</p>
                          {nutrition ? (
                            <p className="text-[10px] text-muted-foreground">
                              {Math.round(nutrition.calories)} kcal · P {Math.round(nutrition.protein)}g · C {Math.round(nutrition.carbs)}g · F {Math.round(nutrition.fat)}g
                            </p>
                          ) : (
                            <p className="text-[10px] text-muted-foreground/60 italic">No nutrition data — logs as 0 kcal</p>
                          )}
                        </div>
                        <Plus size={13} className="text-muted-foreground/40 shrink-0" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {query && !searching && !selected && !recentSelected && !selectedRecipe && results.length === 0 && fsResults.length === 0 && filteredRecipes.length === 0 && (
            <div className="rounded-xl border border-dashed px-3 py-4 text-center">
              <p className="text-xs font-medium">No matches yet</p>
              <p className="text-[11px] text-muted-foreground mt-1">Search USDA or restaurants, or use Manual Entry for a custom meal.</p>
              <button onClick={() => setMode("manual")} className="text-xs text-primary hover:underline font-medium mt-2">
                Use Manual Entry
              </button>
            </div>
          )}

          {/* Confirm re-log for recent item */}
          {recentSelected && (
            <div className="space-y-2 border rounded-xl p-3 bg-primary/5 border-primary/20">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold truncate flex-1">{recentSelected.foodName}</p>
                <button onClick={() => setRecentSelected(null)} className="text-muted-foreground hover:text-foreground shrink-0"><X size={13} /></button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                {Math.round(Number(recentSelected.calories))} kcal · P {Math.round(Number(recentSelected.protein))}g · C {Math.round(Number(recentSelected.carbs))}g · F {Math.round(Number(recentSelected.fat))}g per serving
              </p>
              <MealServingRow mealType={recentMeal} setMealType={setRecentMeal} qty={recentQty} setQty={setRecentQty} />
              <MacroPreview
                cal={Number(recentSelected.calories) * recentQty}
                p={Number(recentSelected.protein) * recentQty}
                c={Number(recentSelected.carbs) * recentQty}
                f={Number(recentSelected.fat) * recentQty}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={addRecentFood} disabled={recentAdding} className="flex-1 h-7 text-xs">
                  {recentAdding ? <Loader2 size={11} className="animate-spin mr-1" /> : null}Add to Log
                </Button>
                <Button size="sm" variant="outline" onClick={() => saveRecentAsMeal(recentSelected)} className="h-7 text-xs">
                  Save meal
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setRecentSelected(null)} className="h-7 text-xs">Cancel</Button>
              </div>
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Lock size={10} /> Food logs stay private. Saving creates a reusable meal item.
              </p>
            </div>
          )}

          {selectedRecipe && (
            <div className="space-y-2 border rounded-xl p-3 bg-primary/5 border-primary/20">
              <div className="flex items-center gap-2">
                <span className="text-lg">{selectedRecipe.emoji}</span>
                <p className="text-xs font-semibold flex-1 truncate">{selectedRecipe.name}</p>
                <button onClick={() => setSelectedRecipe(null)} className="text-muted-foreground hover:text-foreground shrink-0"><X size={13} /></button>
              </div>
              {(() => {
                let nutrition: NutritionSummary | null = null;
                try { nutrition = selectedRecipe.nutritionData ? JSON.parse(selectedRecipe.nutritionData as string) : null; } catch {}
                return nutrition ? (
                  <MacroPreview
                    cal={nutrition.calories * recipeQty}
                    p={nutrition.protein  * recipeQty}
                    c={nutrition.carbs    * recipeQty}
                    f={nutrition.fat      * recipeQty}
                  />
                ) : (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400">
                    No nutrition data. Open Recipes to estimate it, or this will log as 0 kcal.
                  </p>
                );
              })()}
              <MealServingRow mealType={recipeMeal} setMealType={setRecipeMeal} qty={recipeQty} setQty={setRecipeQty} />
              <div className="flex gap-2">
                <Button size="sm" onClick={addRecipeFood} disabled={recipeAdding} className="flex-1 h-7 text-xs">
                  {recipeAdding ? <Loader2 size={11} className="animate-spin mr-1" /> : null}Add to Log
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelectedRecipe(null)} className="h-7 text-xs">Back</Button>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <a href="#/discover" className="text-[10px] rounded-lg border px-2 py-1.5 text-center hover:bg-secondary transition-colors">
                  Recommend
                </a>
                <a href="#/messenger" className="text-[10px] rounded-lg border px-2 py-1.5 text-center hover:bg-secondary transition-colors">
                  Ask about it
                </a>
                <a href="#/health?tab=nutrition" onClick={() => setSelectedRecipe(null)} className="text-[10px] rounded-lg border px-2 py-1.5 text-center hover:bg-secondary transition-colors">
                  Add to plan
                </a>
              </div>
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Lock size={10} /> Sharing sends recipe ideas only, never your private food log.
              </p>
            </div>
          )}

          {/* USDA search results */}
          {results.length > 0 && !selected && (
            <div className="space-y-1 max-h-48 overflow-y-auto border rounded-lg p-1">
              {results.map((f: any) => (
                <button key={f.fdcId} onClick={() => setSelected(f)}
                  className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-secondary/60 transition-colors">
                  <p className="text-xs font-medium truncate">{f.description}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {Math.round(f.nutrients.calories)} kcal · P {Math.round(f.nutrients.protein)}g · C {Math.round(f.nutrients.carbs)}g · F {Math.round(f.nutrients.fat)}g
                    {" "}per {f.servingSize}{f.servingUnit}
                  </p>
                </button>
              ))}
            </div>
          )}

          {selected && (
            <div className="space-y-2 pt-2 border-t">
              <p className="text-xs font-medium truncate">{selected.description}</p>
              <MealServingRow mealType={searchMeal} setMealType={setSearchMeal} qty={searchQty} setQty={setSearchQty} />
              <MacroPreview
                cal={selected.nutrients.calories * searchQty}
                p={selected.nutrients.protein  * searchQty}
                c={selected.nutrients.carbs    * searchQty}
                f={selected.nutrients.fat      * searchQty}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={addSearchFood} disabled={adding} className="flex-1 h-7 text-xs">
                  {adding ? <Loader2 size={11} className="animate-spin mr-1" /> : null}Add to Log
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setSelected(null); setResults([]); }} className="h-7 text-xs">Back</Button>
              </div>
            </div>
          )}

          {/* ── FatSecret (restaurant) results ── */}
          {searchSource === "restaurant" && fsResults.length > 0 && !fsFood && !fsLoading && (
            <div className="space-y-1 max-h-52 overflow-y-auto border rounded-lg p-1">
              {fsResults.map((f: any) => (
                <button key={f.foodId} onClick={() => selectFsFood(f.foodId)}
                  className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-secondary/60 transition-colors">
                  {f.brandName && (
                    <p className="text-[10px] font-semibold text-primary uppercase tracking-wide leading-tight">{f.brandName}</p>
                  )}
                  <p className="text-xs font-medium truncate">{f.foodName}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{f.foodDescription}</p>
                </button>
              ))}
            </div>
          )}

          {searchSource === "restaurant" && fsLoading && (
            <div className="flex items-center justify-center py-4 gap-2 text-muted-foreground">
              <Loader2 size={13} className="animate-spin" />
              <span className="text-xs">Loading nutrition…</span>
            </div>
          )}

          {/* ── FatSecret food detail: serving picker ── */}
          {searchSource === "restaurant" && fsFood && !fsLoading && (
            <div className="space-y-2.5 border rounded-xl p-3 bg-primary/5 border-primary/20">
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {fsFood.brandName && (
                    <p className="text-[10px] font-semibold text-primary uppercase tracking-wide">{fsFood.brandName}</p>
                  )}
                  <p className="text-xs font-semibold truncate">{fsFood.foodName}</p>
                </div>
                <button onClick={() => { setFsFood(null); }} className="text-muted-foreground hover:text-foreground shrink-0"><X size={13} /></button>
              </div>

              {/* Serving size picker */}
              {fsFood.servings?.length > 1 && (
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">Serving size</p>
                  <div className="grid gap-1 max-h-36 overflow-y-auto">
                    {fsFood.servings.map((s: any, i: number) => (
                      <button
                        key={s.servingId}
                        onClick={() => setFsServingIdx(i)}
                        className={`text-left px-2.5 py-1.5 rounded-lg border text-xs transition-all ${
                          fsServingIdx === i
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background hover:bg-secondary/60 border-border"
                        }`}
                      >
                        <span className="font-medium">{s.servingDescription}</span>
                        <span className={`ml-2 text-[10px] ${fsServingIdx === i ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                          {Math.round(s.calories)} kcal
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Macro summary for selected serving */}
              {fsFood.servings?.[fsServingIdx] && (
                <MacroPreview
                  cal={fsFood.servings[fsServingIdx].calories * fsQty}
                  p={fsFood.servings[fsServingIdx].protein   * fsQty}
                  c={fsFood.servings[fsServingIdx].carbs     * fsQty}
                  f={fsFood.servings[fsServingIdx].fat       * fsQty}
                />
              )}

              <MealServingRow mealType={fsMeal} setMealType={setFsMeal} qty={fsQty} setQty={setFsQty} />

              <div className="flex gap-2">
                <Button size="sm" onClick={addFsFood} disabled={fsAdding || !fsFood.servings?.length} className="flex-1 h-7 text-xs">
                  {fsAdding ? <Loader2 size={11} className="animate-spin mr-1" /> : null}Add to Log
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setFsFood(null); }} className="h-7 text-xs">Back</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Manual entry fallback ─────────────────────────────────── */}
      {mode === "manual" && (
        <div className="space-y-2.5">
          {/* Food name */}
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground">Food / meal name *</p>
            <UIInput value={qaName} onChange={e => setQaName(e.target.value)}
              placeholder="e.g. Morning Smoothie" className="h-8 text-sm" />
          </div>

          {/* ── Ingredient Builder ──────────────────────────────────── */}
          <button
            type="button"
            onClick={() => setQaShowIngBuilder(o => !o)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium bg-secondary/30 border-border text-muted-foreground hover:text-foreground transition-colors"
          >
            <Search size={11} />
            <span className="flex-1 text-left">
              {qaIngredients.length > 0
                ? `${qaIngredients.length} ingredient${qaIngredients.length !== 1 ? "s" : ""} added — macros auto-calculated`
                : "Build from ingredients (search USDA)"}
            </span>
            {qaShowIngBuilder ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>

          {qaShowIngBuilder && (
            <div className="border rounded-xl p-3 space-y-2.5 bg-secondary/10">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Search ingredients</p>

              {/* Per-ingredient USDA search */}
              {!qaIngPending ? (
                <>
                  <div className="flex gap-2">
                    <UIInput
                      value={qaIngQuery}
                      onChange={e => setQaIngQuery(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && doIngSearch()}
                      placeholder="e.g. milk, avocado, spinach"
                      className="flex-1 h-7 text-xs"
                    />
                    <Button size="sm" variant="outline" onClick={doIngSearch} disabled={qaIngSearching} className="h-7 shrink-0 px-2">
                      {qaIngSearching ? <Loader2 size={11} className="animate-spin" /> : <Search size={11} />}
                    </Button>
                  </div>
                  {qaIngResults.length > 0 && (
                    <div className="space-y-1 max-h-36 overflow-y-auto border rounded-lg p-1 bg-card">
                      {qaIngResults.map((f: any) => (
                        <button key={f.fdcId}
                          onClick={() => { setQaIngPending(f); setQaIngPendingQty(1); setQaIngResults([]); }}
                          className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-secondary/60 transition-colors">
                          <p className="text-xs font-medium truncate">{f.description}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {Math.round(f.nutrients.calories)} kcal · P {Math.round(f.nutrients.protein)}g · C {Math.round(f.nutrients.carbs)}g · F {Math.round(f.nutrients.fat)}g
                            {" "}per {f.servingSize}{f.servingUnit}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                /* Confirm ingredient quantity */
                <div className="space-y-2 border rounded-lg p-2.5 bg-card">
                  <p className="text-xs font-medium truncate">{qaIngPending.description}</p>
                  <p className="text-[10px] text-muted-foreground">
                    Per serving ({qaIngPending.servingSize}{qaIngPending.servingUnit}): {Math.round(qaIngPending.nutrients.calories)} kcal
                  </p>
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] text-muted-foreground shrink-0">Servings:</p>
                    <UIInput type="number" value={qaIngPendingQty} min={0.25} step={0.25}
                      onChange={e => setQaIngPendingQty(parseFloat(e.target.value) || 1)}
                      className="h-7 text-xs w-20" />
                    <p className="text-[10px] text-muted-foreground">
                      = {Math.round(qaIngPending.nutrients.calories * qaIngPendingQty)} kcal
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={confirmIngredient} className="flex-1 h-7 text-xs gap-1">
                      <Plus size={10} /> Add ingredient
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setQaIngPending(null); }} className="h-7 text-xs">Cancel</Button>
                  </div>
                </div>
              )}

              {/* Ingredient list */}
              {qaIngredients.length > 0 && (
                <div className="space-y-1">
                  {qaIngredients.map(ing => (
                    <div key={ing.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-card border text-xs">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{ing.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {ing.qty} × {ing.servingSize}{ing.servingUnit} · {Math.round(ing.nutrients.calories * ing.qty)} kcal
                        </p>
                      </div>
                      <button onClick={() => setQaIngredients(prev => prev.filter(i => i.id !== ing.id))}
                        className="text-muted-foreground/40 hover:text-destructive shrink-0">
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  {/* Combined total */}
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/5 border border-primary/20 text-xs font-medium text-primary">
                    <Check size={11} />
                    Total: {qaCals} kcal · P {qaProt}g · C {qaCarbs}g · F {qaFat}g
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Serving info */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground">Serving size</p>
              <UIInput type="number" value={qaServingSize} onChange={e => setQaServingSize(e.target.value)}
                placeholder="1" className="h-7 text-xs" />
            </div>
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground">Unit</p>
              <UIInput value={qaServingUnit} onChange={e => setQaServingUnit(e.target.value)}
                placeholder="serving, cup, oz…" className="h-7 text-xs" />
            </div>
          </div>

          {/* Macro fields — pre-filled from ingredients, still editable */}
          <div>
            <p className="text-[10px] text-muted-foreground mb-1.5">
              Nutrition per serving
              {qaIngredients.length > 0 && <span className="text-primary ml-1">(auto-calculated from ingredients)</span>}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground">Calories *</p>
                <UIInput type="number" value={qaCals} onChange={e => setQaCals(e.target.value)}
                  placeholder="350" className="h-7 text-xs" />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground">Protein (g)</p>
                <UIInput type="number" value={qaProt} onChange={e => setQaProt(e.target.value)}
                  placeholder="20" className="h-7 text-xs" />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground">Carbs (g)</p>
                <UIInput type="number" value={qaCarbs} onChange={e => setQaCarbs(e.target.value)}
                  placeholder="45" className="h-7 text-xs" />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground">Fat (g)</p>
                <UIInput type="number" value={qaFat} onChange={e => setQaFat(e.target.value)}
                  placeholder="8" className="h-7 text-xs" />
              </div>
            </div>
          </div>

          <MealServingRow mealType={qaMeal} setMealType={setQaMeal} qty={qaQty} setQty={setQaQty} />

          {/* Save as recipe toggle */}
          <button
            type="button"
            onClick={() => setQaSaveRecipe(o => !o)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
              qaSaveRecipe
                ? "bg-primary/10 border-primary text-primary"
                : "bg-secondary/30 border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            <BookMarked size={12} />
            <span className="flex-1 text-left">Also save as a Recipe</span>
            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
              qaSaveRecipe ? "bg-primary border-primary" : "border-muted-foreground/40"
            }`}>
              {qaSaveRecipe && <Check size={10} className="text-primary-foreground" />}
            </div>
          </button>
          {qaSaveRecipe && (
            <p className="text-[10px] text-muted-foreground px-1">
              Saved to your Recipes tab — including ingredients if you added any.
            </p>
          )}

          <Button size="sm" onClick={addQuickFood}
            disabled={qaAdding || !qaName.trim() || !qaCals}
            className="w-full h-8 text-xs gap-1.5">
            {qaAdding ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
            {qaSaveRecipe ? "Log & Save as Recipe" : "Add to Log"}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── TargetsEditor ────────────────────────────────────────────────────────────
type NutritionTargets = { calories: number; protein: number; carbs: number; fat: number; waterGlasses: number };
type NutritionSection = "today" | "plan" | "targets" | "insights";
type NutritionSectionInput = NutritionSection | "meals" | "trends";

function normalizeNutritionSection(section?: NutritionSectionInput): NutritionSection {
  if (section === "meals") return "plan";
  if (section === "trends") return "insights";
  return section ?? "today";
}

function TargetsEditor({
  goals,
  planTargets,
  planName,
  goalsMatchPlan,
  onSave,
  onApplyPlan,
}: {
  goals: NutritionTargets;
  planTargets: Omit<NutritionTargets, "waterGlasses"> | null;
  planName?: string | null;
  goalsMatchPlan: boolean;
  onSave: (d: NutritionTargets) => Promise<void>;
  onApplyPlan: () => void;
}) {
  const { toast } = useToast();
  const [cals,  setCals]  = useState(String(goals.calories));
  const [prot,  setProt]  = useState(String(goals.protein));
  const [carb,  setCarb]  = useState(String(goals.carbs));
  const [fat,   setFat]   = useState(String(goals.fat));
  const [water, setWater] = useState(String(goals.waterGlasses));
  const [saving, setSaving] = useState(false);
  const [strategy, setStrategy] = useState("custom");
  const [showAdvancedNumbers, setShowAdvancedNumbers] = useState(false);
  const [sex, setSex] = useState<"male" | "female">("male");
  const [age, setAge] = useState("30");
  const [heightUnit, setHeightUnit] = useState<"imperial" | "metric">("imperial");
  const [heightFeet, setHeightFeet] = useState("5");
  const [heightInches, setHeightInches] = useState("8");
  const [heightCm, setHeightCm] = useState("173");
  const [weightUnit, setWeightUnit] = useState<"lb" | "kg">("lb");
  const [weight, setWeight] = useState("155");
  const [calculatorActivity, setCalculatorActivity] = useState("moderate");
  const [calculatorGoal, setCalculatorGoal] = useState("maintain");
  const caloriesNum = Math.max(1, Number(cals) || goals.calories || 2000);
  const proteinNum = Number(prot) || 0;
  const carbNum = Number(carb) || 0;
  const fatNum = Number(fat) || 0;
  const waterNum = Number(water) || 0;
  const macroCalories = proteinNum * 4 + carbNum * 4 + fatNum * 9;
  const macroCoveragePct = Math.round((macroCalories / caloriesNum) * 100);
  const macroSplit = macroCalories > 0
    ? [
        { label: "Protein", pct: Math.round((proteinNum * 4 / macroCalories) * 100), cls: "bg-blue-500" },
        { label: "Carbs",   pct: Math.round((carbNum * 4 / macroCalories) * 100), cls: "bg-amber-500" },
        { label: "Fat",     pct: Math.round((fatNum * 9 / macroCalories) * 100), cls: "bg-rose-500" },
      ]
    : [];
  const activityOptions = [
    { id: "sedentary", label: "Sedentary - little exercise", multiplier: 1.2 },
    { id: "light", label: "Light - exercise 1-3x/wk", multiplier: 1.375 },
    { id: "moderate", label: "Moderate - exercise 3-5x/wk", multiplier: 1.55 },
    { id: "active", label: "Active - exercise 6-7x/wk", multiplier: 1.725 },
    { id: "athlete", label: "Athlete - intense daily training", multiplier: 1.9 },
  ];
  const calculatorGoalOptions = [
    { id: "lose", label: "Lose weight", calorieFactor: 0.85, proteinPerLb: 1, fatPct: 0.3, waterMin: 8, description: "Supports a gentle calorie deficit while keeping protein high." },
    { id: "maintain", label: "Maintain", calorieFactor: 1, proteinPerLb: 0.8, fatPct: 0.3, waterMin: 8, description: "Keeps targets steady while Insights learns your normal rhythm." },
    { id: "build", label: "Build muscle", calorieFactor: 1.1, proteinPerLb: 0.9, fatPct: 0.28, waterMin: 9, description: "Supports muscle gain with more calories, protein, and training fuel." },
    { id: "energy", label: "Improve energy", calorieFactor: 1, proteinPerLb: 0.85, fatPct: 0.28, waterMin: 8, description: "Balances meals around steadier energy and hydration." },
    { id: "protein", label: "Eat more protein", calorieFactor: 1, proteinPerLb: 0.95, fatPct: 0.28, waterMin: 8, description: "Prioritizes a realistic protein floor before changing everything else." },
    { id: "hydrate", label: "Hydrate better", calorieFactor: 1, proteinPerLb: 0.8, fatPct: 0.3, waterMin: 10, description: "Keeps calories steady while making hydration the clearest target." },
    { id: "performance", label: "Performance", calorieFactor: 1.05, proteinPerLb: 0.85, fatPct: 0.25, waterMin: 9, description: "Adds training fuel while keeping protein and hydration reliable." },
  ];
  const strategyCopy = calculatorGoalOptions.find(option => option.id === strategy)?.description ?? "Use custom targets when you already know the numbers you want.";
  const calculatedTargets = useMemo(() => {
    const parsedAge = Math.max(14, Number(age) || 30);
    const parsedHeightCm = heightUnit === "metric"
      ? Math.max(100, Number(heightCm) || 173)
      : Math.max(100, (Number(heightFeet) || 5) * 30.48 + (Number(heightInches) || 8) * 2.54);
    const weightLb = weightUnit === "kg" ? (Number(weight) || 70) * 2.20462 : Number(weight) || 155;
    const weightKg = weightLb / 2.20462;
    const activity = activityOptions.find(option => option.id === calculatorActivity) ?? activityOptions[2];
    const goalOption = calculatorGoalOptions.find(option => option.id === calculatorGoal) ?? calculatorGoalOptions[1];
    const bmr = 10 * weightKg + 6.25 * parsedHeightCm - 5 * parsedAge + (sex === "male" ? 5 : -161);
    const maintenance = bmr * activity.multiplier;
    const calories = Math.max(1200, Math.round((maintenance * goalOption.calorieFactor) / 10) * 10);
    const protein = Math.max(70, Math.round(weightLb * goalOption.proteinPerLb));
    const fat = Math.max(35, Math.round((calories * goalOption.fatPct) / 9));
    const carbs = Math.max(50, Math.round((calories - protein * 4 - fat * 9) / 4));
    const waterGlasses = Math.max(goalOption.waterMin, Math.round((weightLb * 0.5) / 8));
    return {
      calories,
      protein,
      carbs,
      fat,
      waterGlasses,
      bmr: Math.round(bmr),
      maintenance: Math.round(maintenance),
      activityLabel: activity.label,
      goalLabel: goalOption.label,
    };
  }, [activityOptions, age, calculatorActivity, calculatorGoal, calculatorGoalOptions, heightCm, heightFeet, heightInches, heightUnit, sex, weight, weightUnit]);

  function applyTargets(next: NutritionTargets, id: string) {
    setStrategy(id);
    setCals(String(next.calories));
    setProt(String(next.protein));
    setCarb(String(next.carbs));
    setFat(String(next.fat));
    setWater(String(next.waterGlasses));
    toast({ title: "Strategy loaded", description: "Review the numbers, then save when they feel right." });
  }

  function applyCalculatedTargets() {
    applyTargets({
      calories: calculatedTargets.calories,
      protein: calculatedTargets.protein,
      carbs: calculatedTargets.carbs,
      fat: calculatedTargets.fat,
      waterGlasses: calculatedTargets.waterGlasses,
    }, calculatorGoal);
    setShowAdvancedNumbers(true);
  }

  function toggleHeightUnit() {
    if (heightUnit === "imperial") {
      const cm = Math.round((Number(heightFeet) || 0) * 30.48 + (Number(heightInches) || 0) * 2.54);
      setHeightCm(String(cm || 173));
      setHeightUnit("metric");
      return;
    }
    const totalInches = Math.round((Number(heightCm) || 173) / 2.54);
    setHeightFeet(String(Math.floor(totalInches / 12)));
    setHeightInches(String(totalInches % 12));
    setHeightUnit("imperial");
  }

  function toggleWeightUnit() {
    if (weightUnit === "lb") {
      setWeight(String(Math.round((Number(weight) || 155) / 2.20462)));
      setWeightUnit("kg");
      return;
    }
    setWeight(String(Math.round((Number(weight) || 70) * 2.20462)));
    setWeightUnit("lb");
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-card p-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Nutrition Strategy</p>
            <p className="text-xs text-muted-foreground">Choose what MyLifos should coach Today and Insights against.</p>
          </div>
          <span className="rounded-full bg-primary/10 text-primary px-2.5 py-1 text-[10px] font-semibold">Targets</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {[
            { label: "Calories", value: caloriesNum, unit: "kcal" },
            { label: "Protein", value: proteinNum, unit: "g" },
            { label: "Carbs", value: carbNum, unit: "g" },
            { label: "Fat", value: fatNum, unit: "g" },
            { label: "Water", value: waterNum, unit: "glasses" },
          ].map(item => (
            <div key={item.label} className="rounded-xl border bg-secondary/20 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{item.label}</p>
              <p className="text-sm font-bold">
                {item.value}
                <span className="text-[10px] font-medium text-muted-foreground ml-1">{item.unit}</span>
              </p>
            </div>
          ))}
        </div>
        <div className="rounded-xl bg-secondary/20 px-3 py-2">
          <p className="text-xs font-semibold">Current strategy</p>
          <p className="text-xs text-muted-foreground mt-0.5">{strategyCopy}</p>
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-4 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Calculate From Your Stats</p>
            <p className="text-xs text-muted-foreground">Use body stats, activity, and goal to estimate targets. You can still edit any number before saving.</p>
          </div>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={applyCalculatedTargets}>
            Recalculate
          </Button>
        </div>

        <div className="grid lg:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label className="text-xs">Sex</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["male", "female"] as const).map(option => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setSex(option)}
                  className={`rounded-xl border px-3 py-2 text-left text-sm font-medium capitalize transition-colors ${
                    sex === option ? "border-primary bg-primary/10 text-primary" : "hover:bg-secondary"
                  }`}
                >
                  <span className={`mr-2 inline-flex h-3.5 w-3.5 rounded-full border align-[-2px] ${sex === option ? "border-primary bg-primary shadow-[inset_0_0_0_3px_hsl(var(--background))]" : "border-muted-foreground"}`} />
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Age</Label>
            <UIInput type="number" min="14" value={age} onChange={e => setAge(e.target.value)} className="h-10 text-sm" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs">Height</Label>
              <button type="button" onClick={toggleHeightUnit} className="text-[11px] text-muted-foreground hover:text-primary">
                Switch to {heightUnit === "imperial" ? "cm" : "ft/in"}
              </button>
            </div>
            {heightUnit === "imperial" ? (
              <div className="grid grid-cols-2 gap-2">
                <UIInput type="number" min="0" value={heightFeet} onChange={e => setHeightFeet(e.target.value)} className="h-10 text-sm" placeholder="ft" />
                <UIInput type="number" min="0" max="11" value={heightInches} onChange={e => setHeightInches(e.target.value)} className="h-10 text-sm" placeholder="in" />
              </div>
            ) : (
              <UIInput type="number" min="100" value={heightCm} onChange={e => setHeightCm(e.target.value)} className="h-10 text-sm" placeholder="cm" />
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs">Weight</Label>
              <button type="button" onClick={toggleWeightUnit} className="text-[11px] text-muted-foreground hover:text-primary">
                Switch to {weightUnit === "lb" ? "kg" : "lb"}
              </button>
            </div>
            <UIInput type="number" min="1" value={weight} onChange={e => setWeight(e.target.value)} className="h-10 text-sm" placeholder={weightUnit} />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Activity</Label>
            <Select value={calculatorActivity} onChange={setCalculatorActivity} className="h-10">
              {activityOptions.map(option => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Goal</Label>
            <Select value={calculatorGoal} onChange={setCalculatorGoal} className="h-10">
              {calculatorGoalOptions.map(option => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </Select>
          </div>
        </div>

        <div className="rounded-xl border bg-secondary/20 p-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold">Estimated daily target</p>
              <p className="text-[11px] text-muted-foreground">
                {calculatedTargets.goalLabel} goal · BMR {calculatedTargets.bmr} kcal · Maintenance {calculatedTargets.maintenance} kcal · {calculatedTargets.activityLabel}
              </p>
            </div>
            <Button size="sm" className="h-8 text-xs" onClick={applyCalculatedTargets}>
              Apply to targets
            </Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {[
              { label: "Calories", value: calculatedTargets.calories, unit: "kcal" },
              { label: "Protein", value: calculatedTargets.protein, unit: "g" },
              { label: "Carbs", value: calculatedTargets.carbs, unit: "g" },
              { label: "Fat", value: calculatedTargets.fat, unit: "g" },
              { label: "Water", value: calculatedTargets.waterGlasses, unit: "glasses" },
            ].map(item => (
              <div key={item.label} className="rounded-lg bg-background/70 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{item.label}</p>
                <p className="text-sm font-bold">{item.value}<span className="text-[10px] font-medium text-muted-foreground ml-1">{item.unit}</span></p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {planTargets && (
        <div className={`rounded-2xl border p-4 space-y-3 ${
          goalsMatchPlan
            ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800"
            : "bg-primary/5 border-primary/30"
        }`}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className={`text-sm font-semibold ${goalsMatchPlan ? "text-green-700 dark:text-green-300" : "text-primary"}`}>
                {goalsMatchPlan ? "Targets synced with active plan" : "Active plan suggests updated targets"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{planName ?? "Active health plan"}</p>
            </div>
            {goalsMatchPlan && <Check size={16} className="text-green-600 dark:text-green-400 shrink-0" />}
          </div>
          <div className="grid grid-cols-4 gap-1.5 text-center">
            {[
              { label: "Calories", val: planTargets.calories, unit: "kcal", color: "text-primary" },
              { label: "Protein", val: planTargets.protein, unit: "g", color: "text-blue-600 dark:text-blue-400" },
              { label: "Carbs", val: planTargets.carbs, unit: "g", color: "text-amber-600 dark:text-amber-400" },
              { label: "Fat", val: planTargets.fat, unit: "g", color: "text-rose-600 dark:text-rose-400" },
            ].map(item => (
              <div key={item.label} className="bg-background/60 rounded-lg py-1.5">
                <p className={`text-sm font-bold ${item.color}`}>{item.val}<span className="text-[9px] font-normal ml-0.5">{item.unit}</span></p>
                <p className="text-[9px] text-muted-foreground">{item.label}</p>
              </div>
            ))}
          </div>
          {!goalsMatchPlan && (
            <Button size="sm" className="w-full h-8 gap-1.5 text-xs" onClick={onApplyPlan}>
              <ArrowRight size={12} /> Apply Plan Targets
            </Button>
          )}
        </div>
      )}

      <div className="rounded-2xl border bg-card p-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Advanced Numbers</p>
            <p className="text-xs text-muted-foreground">Fine-tune the daily numbers Today uses for progress tracking.</p>
          </div>
          <button
            type="button"
            onClick={() => setShowAdvancedNumbers(v => !v)}
            className="rounded-lg border px-3 py-1.5 text-xs hover:bg-secondary shrink-0"
          >
            {showAdvancedNumbers ? "Hide" : "Edit"}
          </button>
        </div>

        {showAdvancedNumbers && (
        <>
        {macroSplit.length > 0 && (
        <div className="rounded-xl border bg-background p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold">Macro Split</p>
            <p className="text-[10px] text-muted-foreground">{macroCoveragePct}% of calorie target represented</p>
          </div>
          <div className="flex h-2 overflow-hidden rounded-full bg-secondary">
            {macroSplit.map(item => (
              <div key={item.label} className={item.cls} style={{ width: `${item.pct}%` }} />
            ))}
          </div>
          <div className="flex gap-3 flex-wrap text-[10px] text-muted-foreground">
            {macroSplit.map(item => <span key={item.label}>{item.label} {item.pct}%</span>)}
          </div>
        </div>
        )}

        <div className="grid sm:grid-cols-2 gap-3">
          {[
            { label: "Calories (kcal)", val: cals, set: setCals },
            { label: "Protein (g)", val: prot, set: setProt },
            { label: "Carbs (g)", val: carb, set: setCarb },
            { label: "Fat (g)", val: fat, set: setFat },
            { label: "Water (glasses)", val: water, set: setWater },
          ].map(f => (
            <div key={f.label} className="space-y-1">
              <Label className="text-xs">{f.label}</Label>
              <UIInput type="number" value={f.val} onChange={e => f.set(e.target.value)} className="h-8 text-sm" />
            </div>
          ))}
        </div>
        <Button size="sm" disabled={saving} className="w-full" onClick={async () => {
          setSaving(true);
          await onSave({ calories: +cals, protein: +prot, carbs: +carb, fat: +fat, waterGlasses: +water });
          setSaving(false);
        }}>
          {saving ? <Loader2 size={13} className="animate-spin mr-1" /> : null}Save Targets
        </Button>
        <p className="text-[10px] text-muted-foreground">Fiber is tracked from logged foods. A dedicated fiber target can be added later if you want stricter tracking.</p>
        </>
        )}
      </div>
    </div>
  );
}

// ── WeeklyNutritionView ──────────────────────────────────────────────────────
function WeeklyNutritionView({ weekDays, weeklyByDate, goals, weeklyLog }: {
  weekDays: string[];
  weeklyByDate: Record<string, number>;
  goals: { calories: number; protein: number; carbs: number; fat: number };
  weeklyLog: FoodLogEntry[];
}) {
  const maxCal = Math.max(...weekDays.map(d => weeklyByDate[d] || 0), goals.calories, 1);
  const dayTotals = weekDays.reduce((acc, d) => {
    const entries = weeklyLog.filter(e => e.date === d);
    acc[d] = entries.reduce((sum, e) => ({
      calories: sum.calories + Number(e.calories) * Number(e.quantity),
      protein:  sum.protein  + Number(e.protein)  * Number(e.quantity),
      carbs:    sum.carbs    + Number(e.carbs)    * Number(e.quantity),
      fat:      sum.fat      + Number(e.fat)      * Number(e.quantity),
      fiber:    sum.fiber    + Number(e.fiber)    * Number(e.quantity),
    }), { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
    return acc;
  }, {} as Record<string, { calories: number; protein: number; carbs: number; fat: number; fiber: number }>);
  const daysWithData = weekDays.filter(d => dayTotals[d].calories > 0);
  const proteinHitDays = weekDays.filter(d => dayTotals[d].protein >= goals.protein).length;
  const calorieTargetDays = weekDays.filter(d => {
    const cal = dayTotals[d].calories;
    return cal > 0 && Math.abs(cal - goals.calories) / goals.calories <= 0.15;
  }).length;
  const avg = {
    calories: daysWithData.length ? daysWithData.reduce((s, d) => s + dayTotals[d].calories, 0) / daysWithData.length : 0,
    protein:  weeklyLog.reduce((s, e) => s + Number(e.protein) * Number(e.quantity), 0) / 7,
    carbs:    weeklyLog.reduce((s, e) => s + Number(e.carbs)   * Number(e.quantity), 0) / 7,
    fat:      weeklyLog.reduce((s, e) => s + Number(e.fat)     * Number(e.quantity), 0) / 7,
    fiber:    weeklyLog.reduce((s, e) => s + Number(e.fiber)   * Number(e.quantity), 0) / 7,
  };
  const bestDay = daysWithData.length ? daysWithData.reduce((best, d) => {
    return Math.abs(dayTotals[d].calories - goals.calories) < Math.abs(dayTotals[best].calories - goals.calories) ? d : best;
  }, daysWithData[0]) : null;
  const mealCoverage = (["breakfast", "lunch", "dinner", "snack"] as const).map(meal => ({
    meal,
    days: new Set(weeklyLog.filter(e => e.mealType === meal).map(e => e.date)).size,
  }));
  const mostConsistentMeal = mealCoverage.reduce((best, item) => item.days > best.days ? item : best, mealCoverage[0]);
  const targetHits = [
    { label: "Calories", hits: calorieTargetDays, target: goals.calories, avg: avg.calories, unit: "kcal" },
    { label: "Protein",  hits: proteinHitDays,    target: goals.protein,  avg: avg.protein,  unit: "g" },
    { label: "Carbs",    hits: weekDays.filter(d => dayTotals[d].carbs >= goals.carbs * 0.85 && dayTotals[d].carbs <= goals.carbs * 1.15).length, target: goals.carbs, avg: avg.carbs, unit: "g" },
    { label: "Fat",      hits: weekDays.filter(d => dayTotals[d].fat >= goals.fat * 0.85 && dayTotals[d].fat <= goals.fat * 1.15).length, target: goals.fat, avg: avg.fat, unit: "g" },
  ];
  const mostMissed = targetHits.reduce((miss, item) => item.hits < miss.hits ? item : miss, targetHits[0]);
  const adjustment = daysWithData.length === 0
    ? "Log a few meals this week so Insights can make a real suggestion."
    : proteinHitDays <= 2
      ? "Add one reliable protein meal to your plan and repeat it on busy days."
      : calorieTargetDays <= 2
        ? avg.calories > goals.calories
          ? "Consider slightly lighter dinners or pre-planned snacks next week."
          : "Plan one more complete meal each day so calories do not fall short."
        : "Keep repeating the meals that made this week consistent.";
  const mealLabel: Record<string, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snacks" };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-card p-4">
        <p className="text-sm font-semibold">Weekly Insights</p>
        <p className="text-xs text-muted-foreground mt-1">Learn what worked, what slipped, and what to adjust next week.</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-2">
        {[
          { title: "Protein target", value: `${proteinHitDays}/7 days`, body: `Average ${Math.round(avg.protein)}g / ${goals.protein}g` },
          { title: "Calories on target", value: `${calorieTargetDays}/7 days`, body: `Average ${Math.round(avg.calories)} kcal / ${goals.calories}` },
          { title: "Most consistent meal", value: mostConsistentMeal?.days ? mealLabel[mostConsistentMeal.meal] : "Not enough data", body: mostConsistentMeal?.days ? `Logged ${mostConsistentMeal.days} of 7 days` : "Log meals to see the pattern." },
          { title: "Most missed target", value: mostMissed.label, body: `${mostMissed.hits}/7 days close to target` },
        ].map(card => (
          <div key={card.title} className="rounded-xl border bg-card p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{card.title}</p>
            <p className="text-lg font-bold leading-tight">{card.value}</p>
            <p className="text-xs text-muted-foreground">{card.body}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border bg-primary/5 border-primary/20 p-3">
        <p className="text-xs font-semibold text-primary">Suggested adjustment for next week</p>
        <p className="text-xs text-muted-foreground mt-1">{adjustment}</p>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <p className="text-xs font-semibold mb-3">Calorie Trend, Last 7 Days</p>
        <div className="flex items-end gap-1.5" style={{ height: "96px" }}>
          {weekDays.map(d => {
            const cal = dayTotals[d].calories || weeklyByDate[d] || 0;
            const pct = (cal / maxCal) * 100;
            const onTarget = cal > 0 && Math.abs(cal - goals.calories) / goals.calories < 0.15;
            const over = cal > goals.calories * 1.15;
            return (
              <div key={d} className="flex-1 flex flex-col items-center gap-0.5">
                <div className="w-full flex items-end" style={{ height: "80px" }}>
                  <div
                    className={`w-full rounded-t transition-all ${cal === 0 ? "bg-secondary/30" : onTarget ? "bg-emerald-500" : over ? "bg-rose-400" : "bg-primary/60"}`}
                    style={{ height: cal === 0 ? "4px" : `${Math.max(4, pct)}%` }}
                  />
                </div>
                <p className="text-[8px] text-muted-foreground">
                  {new Date(d + "T12:00:00").toLocaleDateString("en", { weekday: "narrow" })}
                </p>
              </div>
            );
          })}
        </div>
        <div className="flex gap-3 mt-2 text-[10px] text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />On target</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-400 inline-block" />Over goal</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-primary/60 inline-block" />Under goal</span>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-2">
        <p className="text-xs font-semibold">7-Day Averages</p>
        {[
          { label: "Calories", val: Math.round(avg.calories), unit: "kcal", goal: goals.calories },
          { label: "Protein",  val: Math.round(avg.protein),  unit: "g",    goal: goals.protein },
          { label: "Carbs",    val: Math.round(avg.carbs),    unit: "g",    goal: goals.carbs },
          { label: "Fat",      val: Math.round(avg.fat),      unit: "g",    goal: goals.fat },
          { label: "Fiber",    val: Math.round(avg.fiber),    unit: "g",    goal: "tracked" },
        ].map(m => (
          <div key={m.label} className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">{m.label}</span>
            <span className="text-xs font-medium">{m.val} {m.unit} <span className="text-muted-foreground font-normal">/ {m.goal}</span></span>
          </div>
        ))}
        {bestDay && (
          <p className="text-[10px] text-muted-foreground pt-1 border-t">
            Best day: {new Date(bestDay + "T12:00:00").toLocaleDateString("en", { weekday: "long", month: "short", day: "numeric" })}
          </p>
        )}
      </div>
    </div>
  );
}

// ── BodyCompGoalCard ──────────────────────────────────────────────────────────
function BodyCompGoalCard({
  plan,
  metric,
}: {
  plan: WorkoutPlan;
  metric: { metric: string; currentValue: number | string; targetValue: number | string; unit: string };
}) {
  const metricLabels: Record<string, string> = {
    weight: "Body Weight",
    body_fat: "Body Fat %",
    muscle_mass: "Muscle Mass",
  };
  const label   = metricLabels[metric.metric] ?? metric.metric;
  const current = parseFloat(String(metric.currentValue));
  const target  = parseFloat(String(metric.targetValue));
  const unit    = metric.unit;

  const hasValues = !isNaN(current) && !isNaN(target) && current > 0;
  const diff = hasValues ? Math.abs(target - current) : 0;
  const losing  = hasValues && target < current;
  const gaining = hasValues && target > current;
  const dirLabel = losing ? `↓ lose ${diff.toFixed(1)} ${unit}` : gaining ? `↑ gain ${diff.toFixed(1)} ${unit}` : "→ maintain";

  return (
    <div className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20 p-3 space-y-2.5">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Heart size={13} className="text-green-600 dark:text-green-400 shrink-0" />
          <p className="text-xs font-semibold text-green-700 dark:text-green-300">Body Composition Goal</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {plan.isActive ? (
            <span className="text-[10px] font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 rounded-full">Active</span>
          ) : (
            <span className="text-[10px] font-medium text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">Not active</span>
          )}
        </div>
      </div>

      {/* Plan name */}
      <p className="text-[11px] text-muted-foreground">{plan.name}</p>

      {/* Goal values */}
      <div className="flex items-center gap-3">
        <Target size={16} className="text-green-500 shrink-0" />
        <div className="flex-1 space-y-0.5">
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
          {hasValues ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-bold">{current} {unit}</span>
              <ArrowRight size={11} className="text-muted-foreground shrink-0" />
              <span className="text-sm font-bold text-green-600 dark:text-green-400">{target} {unit}</span>
              <span className="text-[10px] text-muted-foreground">({dirLabel})</span>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No target values set — edit the plan in Workouts to add them</p>
          )}
        </div>
      </div>

      <p className="text-[10px] text-green-600/70 dark:text-green-400/70">
        {plan.isActive
          ? "Linked from your active workout plan · Log food below to support your goal"
          : "Activate this plan in Workouts to mark it as your current program"}
      </p>
    </div>
  );
}

// ── Embedded planner router (keeps everything inside the Health tab) ──────────
// We use a wouter Router with a custom location hook backed by React state,
// so Link/navigate calls inside planner pages update local state instead of the
// browser hash URL — the user never leaves the Health page.

type EmbedNav = [string, (to: string) => void];
const EmbedNavCtx = createContext<EmbedNav>(["/meal-planner", () => {}]);

/** Called by wouter inside the embedded Router — reads from our context. */
function useEmbedLocation(): EmbedNav {
  return useContext(EmbedNavCtx);
}

function MealPlannerEmbed({
  onRecommendMeal,
  onAskMeal,
  onSaveMealNote,
  savedMealsContent,
}: {
  onRecommendMeal?: (item: NutritionMealActionItem) => void;
  onAskMeal?: (item: NutritionMealActionItem) => void;
  onSaveMealNote?: (item: NutritionMealActionItem) => void;
  savedMealsContent?: ReactNode;
} = {}) {
  const [embedPath, setEmbedPath] = useState("/meal-planner");
  const [openMealMenu, setOpenMealMenu] = useState<string | null>(null);
  const [selectedShareMealKey, setSelectedShareMealKey] = useState("");
  const [planView, setPlanView] = useState<"week" | "saved" | "shopping" | "share">("week");
  const [removedShoppingKeys, setRemovedShoppingKeys] = useState<Set<string>>(() => new Set());
  const [customShoppingItems, setCustomShoppingItems] = useState<{ id: string; display: string }[]>([]);
  const [newShoppingItem, setNewShoppingItem] = useState("");
  const { plan, recipes, setPlan } = usePlanner();
  const { toast } = useToast();
  const qc = useQueryClient();
  const todayStr = new Date().toISOString().slice(0, 10);

  const navigate = useCallback((to: string) => {
    setOpenMealMenu(null);
    setEmbedPath(to);
  }, []);

  function saveActivePlan() {
    if (!plan) return;
    // Plan is already persisted to localStorage by PlannerContext.
    // This just gives the user a confirmation.
    toast({ title: "Plan saved!", description: `${plan.days.length}-day plan locked in as your active plan.` });
  }

  const plannedToday = plan?.days[0]?.meals.filter(m => !m.removed) ?? [];
  const plannedTomorrow = plan?.days[1]?.meals.filter(m => !m.removed) ?? [];
  const planDays = plan?.days ?? [];
  const plannedMeals = planDays.flatMap(day => day.meals.filter(m => !m.removed).map(meal => ({ day, meal })));
  const planLength = planDays.length || 0;
  const mealSlots: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];
  const missingSlots = planDays.reduce((count, day) => {
    const slots = new Set(day.meals.filter(m => !m.removed).map(m => m.slot));
    return count + mealSlots.filter(slot => !slots.has(slot)).length;
  }, 0);
  const proteinCoverageDays = planDays.filter(day => day.totals.p >= (plan?.target.p ?? 0) * 0.85).length;
  const breakfastDays = planDays.filter(day => day.meals.some(m => !m.removed && m.slot === "breakfast")).length;
  const repeatedMealCount = (() => {
    const counts = new Map<string, number>();
    plannedMeals.forEach(({ meal }) => counts.set(meal.recipe.name, (counts.get(meal.recipe.name) ?? 0) + 1));
    return Array.from(counts.values()).filter(count => count > 1).length;
  })();
  const shoppingPreview = plan ? buildShoppingList(plan, plan.days.map(day => day.day)) : null;
  const editableShoppingAisles = useMemo(() => {
    const generated = (shoppingPreview?.aisles ?? []).map(aisle => ({
      name: aisle.name,
      items: aisle.items
        .filter(item => !removedShoppingKeys.has(item.key))
        .map(item => ({ ...item, custom: false })),
    })).filter(aisle => aisle.items.length > 0);
    if (customShoppingItems.length > 0) {
      generated.push({
        name: "Added",
        items: customShoppingItems.map(item => ({
          key: item.id,
          display: item.display,
          recipes: ["Added manually"],
          count: 1,
          custom: true,
        })),
      });
    }
    return generated;
  }, [customShoppingItems, removedShoppingKeys, shoppingPreview]);
  const quickSavedMeals = recipes.slice(0, 4);
  const shareablePlannedMeals = planDays.flatMap((day, dayIndex) =>
    day.meals
      .filter(meal => !meal.removed)
      .map((meal, mealIndex) => ({
        key: `${dayIndex}-${mealIndex}-${meal.slot}-${meal.recipe.id}`,
        dayIndex,
        mealIndex,
        meal,
        action: mealActionFromPlannerRecipe(meal.recipe, meal.slot),
      }))
  );
  const selectedShareMeal = shareablePlannedMeals.find(item => item.key === selectedShareMealKey) ?? shareablePlannedMeals[0] ?? null;
  const selectedShareMealAction = selectedShareMeal?.action ?? null;
  const planSuggestion = !plan
    ? null
    : missingSlots > 0
      ? {
          title: "Fill open meal slots",
          body: `You have ${missingSlots} open meal slot${missingSlots === 1 ? "" : "s"} this week. Fill the gaps before grocery shopping.`,
          primaryLabel: "Fill gaps",
          primaryPath: "/meal-planner/setup",
          secondaryLabel: "Open saved meals",
          secondaryPath: "/meal-planner/library",
        }
      : proteinCoverageDays < planLength
        ? {
            title: "Add more protein coverage",
            body: "A few days are light on protein. Add one high-protein saved meal and repeat it.",
            primaryLabel: "Add high-protein meal",
            primaryPath: "/meal-planner/library",
            secondaryLabel: "Edit plan",
            secondaryPath: "/meal-planner/plan",
          }
        : {
            title: "Plan is ready to use",
            body: "Your week is covered. Log planned meals from Today and use Insights to adjust next week.",
            primaryLabel: "Edit plan",
            primaryPath: "/meal-planner/plan",
            secondaryLabel: "Shopping list",
            secondaryPath: "/meal-planner/shopping",
          };
  const planViewCopy = {
    week: { title: "This Week", body: "What is planned, what is missing, and what to log next." },
    saved: { title: "Saved Meals", body: "Reusable meals and recipes you can log or add to this week." },
    shopping: { title: "Shopping", body: "What to buy or prep before the plan is easy to follow." },
    share: { title: "Share", body: "Choose one planned meal idea to send in Messages." },
  }[planView];
  useEffect(() => {
    if (shareablePlannedMeals.length === 0) {
      if (selectedShareMealKey) setSelectedShareMealKey("");
      return;
    }
    if (!selectedShareMealKey || !shareablePlannedMeals.some(item => item.key === selectedShareMealKey)) {
      setSelectedShareMealKey(shareablePlannedMeals[0].key);
    }
  }, [selectedShareMealKey, shareablePlannedMeals]);
  const logPlannedMealMut = useMutation({
    mutationFn: (meal: (typeof plannedToday)[number]) => apiRequest("POST", "/api/nutrition/food-log", {
      foodName: meal.recipe.name,
      servingSize: 1,
      servingUnit: "serving",
      quantity: 1,
      mealType: meal.slot,
      date: todayStr,
      calories: meal.recipe.macros.cal,
      protein: meal.recipe.macros.p,
      carbs: meal.recipe.macros.c,
      fat: meal.recipe.macros.f,
      fiber: 0,
      sugar: 0,
      sodium: 0,
    }).then(r => r.json()),
    onSuccess: (_data, meal) => {
      qc.invalidateQueries({ queryKey: ["/api/nutrition/food-log", todayStr] });
      qc.invalidateQueries({ queryKey: ["/api/nutrition/food-log/week"] });
      toast({ title: `${meal.recipe.name} logged for today` });
    },
    onError: () => toast({ title: "Failed to log planned meal", variant: "destructive" }),
  });

  function recalcPlannedMeals(meals: NonNullable<typeof plan>["days"][number]["meals"]) {
    return meals.filter(meal => !meal.removed).reduce((acc, meal) => ({
      cal: acc.cal + meal.recipe.macros.cal,
      p: acc.p + meal.recipe.macros.p,
      c: acc.c + meal.recipe.macros.c,
      f: acc.f + meal.recipe.macros.f,
    }), { cal: 0, p: 0, c: 0, f: 0 });
  }

  function removePlannedMeal(dayIndex: number, mealIndex: number) {
    if (!plan) return;
    const nextPlan = {
      ...plan,
      days: plan.days.map((day, idx) => {
        if (idx !== dayIndex) return day;
        const meals = day.meals.map((meal, mi) => mi === mealIndex ? { ...meal, removed: true } : meal);
        return { ...day, meals, totals: recalcPlannedMeals(meals) };
      }),
    };
    setPlan(nextPlan);
    toast({ title: "Meal removed from plan" });
  }

  function movePlannedMealToTomorrow(dayIndex: number, mealIndex: number) {
    if (!plan || plan.days.length < 2) {
      toast({ title: "Add another plan day first", description: "Generate a multi-day plan to move meals between days." });
      return;
    }
    const targetIndex = Math.min(dayIndex + 1, plan.days.length - 1);
    const sourceMeal = plan.days[dayIndex]?.meals[mealIndex];
    if (!sourceMeal) return;
    const nextPlan = {
      ...plan,
      days: plan.days.map((day, idx) => {
        if (idx === dayIndex) {
          const meals = day.meals.map((meal, mi) => mi === mealIndex ? { ...meal, removed: true } : meal);
          return { ...day, meals, totals: recalcPlannedMeals(meals) };
        }
        if (idx === targetIndex) {
          const meals = [...day.meals, sourceMeal];
          return { ...day, meals, totals: recalcPlannedMeals(meals) };
        }
        return day;
      }),
    };
    setPlan(nextPlan);
    toast({ title: "Meal moved", description: `${sourceMeal.recipe.name} moved to day ${targetIndex + 1}.` });
  }

  function addShoppingItem() {
    const display = newShoppingItem.trim();
    if (!display) return;
    setCustomShoppingItems(items => [...items, { id: `custom-${Date.now()}`, display }]);
    setNewShoppingItem("");
  }

  function removeShoppingItem(item: { key: string; custom?: boolean }) {
    if (item.custom) {
      setCustomShoppingItems(items => items.filter(existing => existing.id !== item.key));
      return;
    }
    setRemovedShoppingKeys(keys => {
      const next = new Set(keys);
      next.add(item.key);
      return next;
    });
  }

  return (
    <EmbedNavCtx.Provider value={[embedPath, navigate]}>
      <div className="rounded-2xl border bg-card p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">{planViewCopy.title}</p>
            <p className="text-xs text-muted-foreground">{planViewCopy.body}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" className="h-8 text-xs" onClick={() => navigate(plan ? "/meal-planner/plan" : "/meal-planner/setup")}>
              {plan ? "Edit Plan" : "Generate My Plan"}
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => navigate("/meal-planner/setup")}>
              Rebuild Plan
            </Button>
            {plan && (
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => { setPlanView("shopping"); navigate("/meal-planner/shopping"); }}>
                Shopping List
              </Button>
            )}
          </div>
        </div>

        {plan && (
          <div className="grid grid-cols-4 gap-1.5 rounded-xl bg-secondary/20 p-1">
            {[
              { id: "week", label: "This Week" },
              { id: "saved", label: "Saved Meals" },
              { id: "shopping", label: "Shopping" },
              { id: "share", label: "Share" },
            ].map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setPlanView(item.id as typeof planView);
                  setEmbedPath("/meal-planner");
                }}
                className={`rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors ${planView === item.id ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}

        {!plan ? (
          <div className="rounded-xl border border-dashed p-5 text-center space-y-3">
            <div>
              <p className="text-sm font-semibold">Generate a personalized meal plan</p>
              <p className="text-xs text-muted-foreground mt-1">MyLifos can build meals from your stats, target, dietary preferences, exclusions, and household settings.</p>
            </div>
            <div className="flex justify-center gap-2 flex-wrap">
              <Button size="sm" onClick={() => navigate("/meal-planner/setup")}>Generate My Plan</Button>
              <Button size="sm" variant="outline" onClick={() => navigate("/meal-planner/preferences")}>Diet & Preferences</Button>
            </div>
          </div>
        ) : planView === "week" ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: "Plan length", value: `${planLength} day${planLength === 1 ? "" : "s"}` },
                { label: "Daily target", value: `${plan.target.cal} kcal` },
                { label: "Protein days", value: `${proteinCoverageDays}/${planLength}` },
                { label: "Gaps", value: missingSlots },
              ].map(item => (
                <div key={item.label} className="rounded-xl border bg-secondary/20 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{item.label}</p>
                  <p className="text-sm font-bold truncate">{item.value}</p>
                </div>
              ))}
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <div className="rounded-xl border bg-background p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold">Today's planned meals</p>
                </div>
                {plannedToday.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No meals planned for today.</p>
                ) : plannedToday.slice(0, 3).map((meal, idx) => {
                  const mealIndex = plan.days[0].meals.indexOf(meal);
                  const menuKey = `today-${meal.slot}-${meal.recipe.id}-${idx}`;
                  return (
                    <div key={`${meal.slot}-${meal.recipe.id}-${idx}`} className="rounded-lg border px-2.5 py-2 space-y-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold truncate">{meal.recipe.name}</p>
                        <p className="text-[10px] text-muted-foreground capitalize">{meal.slot} · {meal.recipe.macros.cal} kcal · P {meal.recipe.macros.p}g</p>
                      </div>
                      <div className="grid grid-cols-[1fr_auto] gap-1.5">
                        <button type="button" onClick={() => logPlannedMealMut.mutate(meal)} disabled={logPlannedMealMut.isPending} className="rounded-md bg-primary text-primary-foreground px-2 py-1.5 text-[11px] font-medium disabled:opacity-50">Log today</button>
                        <button type="button" onClick={() => setOpenMealMenu(openMealMenu === menuKey ? null : menuKey)} className="rounded-md border px-2 py-1.5 text-[11px] hover:bg-secondary">More</button>
                      </div>
                      {openMealMenu === menuKey && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1">
                          <button type="button" onClick={() => navigate("/meal-planner/plan")} className="rounded-md border px-1.5 py-1 text-[10px] hover:bg-secondary">Swap meal</button>
                          <button type="button" onClick={() => movePlannedMealToTomorrow(0, mealIndex)} className="rounded-md border px-1.5 py-1 text-[10px] hover:bg-secondary">Move</button>
                          <button type="button" onClick={() => removePlannedMeal(0, mealIndex)} className="rounded-md border px-1.5 py-1 text-[10px] hover:bg-secondary">Remove</button>
                          <button type="button" onClick={() => onRecommendMeal?.(mealActionFromPlannerRecipe(meal.recipe, meal.slot))} className="rounded-md border px-1.5 py-1 text-[10px] hover:bg-secondary">Recommend</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="rounded-xl border bg-background p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold">Tomorrow preview</p>
                  <button onClick={() => navigate("/meal-planner/setup")} className="text-[11px] text-primary hover:underline">Rebuild</button>
                </div>
                {plannedTomorrow.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Tomorrow has room for meals.</p>
                ) : plannedTomorrow.slice(0, 3).map((meal, idx) => (
                  <div key={`${meal.slot}-${meal.recipe.id}-${idx}`} className="flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate">{meal.recipe.name}</p>
                      <p className="text-[10px] text-muted-foreground capitalize">{meal.slot} · P {meal.recipe.macros.p}g</p>
                    </div>
                    <button type="button" onClick={() => navigate("/meal-planner/plan")} className="text-[11px] text-primary hover:underline shrink-0">Edit</button>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </div>

      {planView === "saved" && (
        <div className="mt-3">
          {savedMealsContent ?? (
            <div className="rounded-xl border bg-card p-4">
              <p className="text-sm font-semibold">Saved Meals</p>
              <p className="text-xs text-muted-foreground mt-1">Saved meals and recipes will appear here.</p>
            </div>
          )}
        </div>
      )}

      {plan && planView === "shopping" && (
        <div className="rounded-xl border bg-card p-4 space-y-4 mt-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Shopping List</p>
              <p className="text-xs text-muted-foreground">Review what the plan generated, then add or remove anything you need.</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setRemovedShoppingKeys(new Set());
                setCustomShoppingItems([]);
              }}
              className="rounded-lg border px-3 py-1.5 text-xs hover:bg-secondary"
            >
              Reset
            </button>
          </div>

          <div className="flex gap-2">
            <input
              value={newShoppingItem}
              onChange={event => setNewShoppingItem(event.target.value)}
              onKeyDown={event => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addShoppingItem();
                }
              }}
              placeholder="Add item..."
              className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={addShoppingItem}
              disabled={!newShoppingItem.trim()}
              className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-xs font-semibold disabled:opacity-50"
            >
              Add
            </button>
          </div>

          {editableShoppingAisles.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-secondary/10 p-4 text-center">
              <p className="text-sm font-semibold">No shopping items yet</p>
              <p className="text-xs text-muted-foreground mt-1">Add items manually or edit your meal plan to generate ingredients.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {editableShoppingAisles.map(aisle => (
                <div key={aisle.name} className="rounded-xl border bg-background overflow-hidden">
                  <div className="flex items-center justify-between gap-2 border-b bg-secondary/20 px-3 py-2">
                    <p className="text-xs font-semibold">{aisle.name}</p>
                    <span className="text-[11px] text-muted-foreground">{aisle.items.length} item{aisle.items.length === 1 ? "" : "s"}</span>
                  </div>
                  <div className="divide-y">
                    {aisle.items.map(item => (
                      <div key={item.key} className="flex items-center gap-3 px-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{item.display}</p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {item.custom ? "Added manually" : item.recipes.join(", ")}
                          </p>
                        </div>
                        {!item.custom && !item.amount && item.count > 1 && (
                          <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">x{item.count}</span>
                        )}
                        <button
                          type="button"
                          onClick={() => removeShoppingItem(item)}
                          className="rounded-md border px-2 py-1 text-[11px] hover:bg-secondary shrink-0"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {planView === "share" && (
      <div className="rounded-xl border bg-card p-4 space-y-3 mt-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Share a Meal Idea</p>
            <p className="text-xs text-muted-foreground">Choose a planned meal, then send it in Messages. Private food logs stay private.</p>
          </div>
          <Lock size={14} className="text-muted-foreground shrink-0 mt-0.5" />
        </div>

        {selectedShareMeal ? (
          <div className="rounded-xl border bg-secondary/20 p-3 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Meal to share</p>
                <p className="text-sm font-semibold truncate">{selectedShareMeal.meal.recipe.name}</p>
                <p className="text-xs text-muted-foreground capitalize">
                  Day {selectedShareMeal.dayIndex + 1} · {selectedShareMeal.meal.slot} · {selectedShareMeal.meal.recipe.macros.cal} kcal · P {selectedShareMeal.meal.recipe.macros.p}g
                </p>
              </div>
            </div>
            {shareablePlannedMeals.length > 1 && (
              <Select value={selectedShareMeal.key} onChange={setSelectedShareMealKey} className="h-8 text-xs">
                {shareablePlannedMeals.map(item => (
                  <option key={item.key} value={item.key}>
                    Day {item.dayIndex + 1} · {item.meal.slot} · {item.meal.recipe.name}
                  </option>
                ))}
              </Select>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed bg-secondary/10 p-3">
            <p className="text-sm font-semibold">No planned meal selected</p>
            <p className="text-xs text-muted-foreground mt-0.5">Create or edit a meal plan first, then choose the meal you want to share.</p>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() => selectedShareMealAction ? onRecommendMeal?.(selectedShareMealAction) : navigate("/meal-planner/library")}
            className="flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs hover:bg-secondary transition-colors"
          >
            <Share2 size={12} /> Recommend meal
          </button>
          <button
            type="button"
            onClick={() => selectedShareMealAction ? onAskMeal?.(selectedShareMealAction) : navigate("/meal-planner/library")}
            className="flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs hover:bg-secondary transition-colors"
          >
            <MessageCircle size={12} /> Ask about meal
          </button>
          <button
            type="button"
            onClick={() => navigate("/meal-planner/library")}
            className="flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs hover:bg-secondary transition-colors"
          >
            <BookMarked size={12} /> Open saved meals
          </button>
          <button
            type="button"
            onClick={() => selectedShareMealAction ? onSaveMealNote?.(selectedShareMealAction) : toast({ title: "Plan a meal first", description: "Then MyLifos can create a private note from it." })}
            className="flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs hover:bg-secondary transition-colors"
          >
            <Link2 size={12} /> Link to note
          </button>
        </div>
      </div>
      )}

      {/* Embedded wouter Router — intercepts all Link/navigate calls.
          IMPORTANT: use the JSX children API (not `component` prop) so that
          React sees stable element types across re-renders and never unmounts
          pages mid-interaction (which would reset step state in Setup, etc.) */}
      {embedPath !== "/meal-planner" && (
      <Router hook={useEmbedLocation}>
        <Switch>
          <Route path="/meal-planner/setup">       <PlannerSetup />         </Route>
          <Route path="/meal-planner/preferences"> <PlannerPreferences />   </Route>
          <Route path="/meal-planner/plan">        <EmbeddedPlannerPlan onSave={saveActivePlan} /> </Route>
          <Route path="/meal-planner/library">     <PlannerLibrary />       </Route>
          <Route path="/meal-planner/recipe/:id">  <PlannerRecipeDetail />  </Route>
          <Route path="/meal-planner/shopping">    <PlannerShopping />      </Route>
          <Route>                                  <PlannerHome />          </Route>
        </Switch>
      </Router>
      )}
    </EmbedNavCtx.Provider>
  );
}

/** Wraps PlannerPlan and injects a "Save as Active Plan" button into the header area */
function EmbeddedPlannerPlan({ onSave }: { onSave: () => void }) {
  const { plan } = usePlanner();
  return (
    <div className="space-y-4">
      {plan && (
        <div className="flex justify-end">
          <Button size="sm" onClick={onSave}>Save as Active Plan</Button>
        </div>
      )}
      <PlannerPlan />
    </div>
  );
}

function NutritionConnectionsCard({
  activePlan,
  metric,
  recipes,
  friendsCount,
  proteinLeft,
  caloriesLeft,
  goalsMatchPlan,
  onSyncTargets,
  onConnectGoal,
  onChooseMeal,
  onAddRecoveryMeal,
  onAskFriend,
  onSaveNote,
  syncingTargets,
}: {
  activePlan: WorkoutPlan | null;
  metric: Record<string, any> | null;
  recipes: Recipe[];
  friendsCount: number;
  proteinLeft: number;
  caloriesLeft: number;
  goalsMatchPlan: boolean;
  onSyncTargets: () => void;
  onConnectGoal: () => void;
  onChooseMeal: () => void;
  onAddRecoveryMeal: () => void;
  onAskFriend: (item: NutritionMealActionItem) => void;
  onSaveNote: (item: NutritionMealActionItem) => void;
  syncingTargets: boolean;
}) {
  const socialRecipes = useMemo(() => recipes
    .filter(recipe => !!recipe.name)
    .sort((a, b) => (parseRecipeNutrition(b)?.protein ?? 0) - (parseRecipeNutrition(a)?.protein ?? 0))
    .slice(0, 8), [recipes]);
  const [selectedSocialRecipeId, setSelectedSocialRecipeId] = useState("");
  const selectedSocialRecipe = socialRecipes.find(recipe => String(recipe.id) === selectedSocialRecipeId) ?? socialRecipes[0] ?? null;
  const targetProtein = metric?.proteinGrams ? Math.round(metric.proteinGrams as number) : null;
  const goalLabel = activePlan
    ? `${activePlan.name}${targetProtein ? ` · ${targetProtein}g protein target` : ""}`
    : `${proteinLeft}g protein left · ${caloriesLeft} kcal left today`;
  const workoutDay = !!activePlan;
  const contextNote: NutritionMealActionItem = {
    id: "nutrition-context-note",
    title: "Nutrition context",
    subtitle: `${proteinLeft}g protein left · ${caloriesLeft} kcal left today`,
    source: "recipe",
  };

  useEffect(() => {
    if (socialRecipes.length === 0) {
      if (selectedSocialRecipeId) setSelectedSocialRecipeId("");
      return;
    }
    if (!selectedSocialRecipeId || !socialRecipes.some(recipe => String(recipe.id) === selectedSocialRecipeId)) {
      setSelectedSocialRecipeId(String(socialRecipes[0].id));
    }
  }, [selectedSocialRecipeId, socialRecipes]);

  return (
    <div className="rounded-2xl border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Connected to Today</p>
          <p className="text-xs text-muted-foreground">Use goals, workouts, saved meals, and recommendations to decide what to eat next.</p>
        </div>
        <a href="#/mylifos" className="text-xs text-primary hover:underline shrink-0">Open MyLifos</a>
      </div>

      <div className="grid md:grid-cols-2 gap-2">
        <div className="rounded-xl border bg-background p-3 space-y-2">
          <div className="flex items-start gap-2">
            <Target size={14} className="mt-0.5 text-primary shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-semibold">Goal context</p>
              <p className="text-[11px] text-muted-foreground truncate">{goalLabel}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={activePlan && !goalsMatchPlan ? onSyncTargets : onConnectGoal}
            disabled={syncingTargets}
            className="w-full rounded-lg border px-2 py-1.5 text-[11px] hover:bg-secondary disabled:opacity-50"
          >
            {syncingTargets
              ? "Working..."
              : activePlan && !goalsMatchPlan
                ? "Use workout targets"
                : "Edit nutrition targets"}
          </button>
        </div>

        <div className="rounded-xl border bg-background p-3 space-y-2">
          <div className="flex items-start gap-2">
            <Dumbbell size={14} className="mt-0.5 text-primary shrink-0" />
            <div>
              <p className="text-xs font-semibold">Workout context</p>
              <p className="text-[11px] text-muted-foreground">{workoutDay ? "Plan a recovery meal around your active training goal." : "No active workout goal connected. You can still log a recovery meal."}</p>
            </div>
          </div>
          <button type="button" onClick={onAddRecoveryMeal} className="w-full rounded-lg border px-2 py-1.5 text-[11px] hover:bg-secondary">{workoutDay ? "Add recovery meal" : "Log workout meal"}</button>
        </div>

        <div className="rounded-xl border bg-background p-3 space-y-2">
          <div className="flex items-start gap-2">
            <BookMarked size={14} className="mt-0.5 text-primary shrink-0" />
            <div>
              <p className="text-xs font-semibold">Saved ideas</p>
              <p className="text-[11px] text-muted-foreground">{recipes.length ? `${recipes.length} saved meal${recipes.length === 1 ? "" : "s"} available` : "Save meals to reuse them here."}</p>
            </div>
          </div>
          <button type="button" onClick={onChooseMeal} className="w-full rounded-lg border px-2 py-1.5 text-[11px] hover:bg-secondary">Choose meal</button>
        </div>

        <div className="rounded-xl border bg-background p-3 space-y-2">
          <div className="flex items-start gap-2">
            <MessageCircle size={14} className="mt-0.5 text-primary shrink-0" />
            <div>
              <p className="text-xs font-semibold">Social ideas</p>
              <p className="text-[11px] text-muted-foreground">
                {friendsCount
                  ? selectedSocialRecipe
                    ? `Ask a friend about ${selectedSocialRecipe.name}.`
                    : "Choose a saved meal idea to ask about."
                  : "Browse saved meal ideas, then add friends to ask about them."}
              </p>
            </div>
          </div>
          {friendsCount > 0 && socialRecipes.length > 0 && (
            <Select value={String(selectedSocialRecipe?.id ?? "")} onChange={setSelectedSocialRecipeId} className="h-8 text-xs">
              {socialRecipes.map(recipe => {
                const nutrition = parseRecipeNutrition(recipe);
                return (
                  <option key={recipe.id} value={String(recipe.id)}>
                    {recipe.name}{nutrition?.protein ? ` · P ${Math.round(nutrition.protein)}g` : ""}
                  </option>
                );
              })}
            </Select>
          )}
          <button
            type="button"
            onClick={() => friendsCount && selectedSocialRecipe ? onAskFriend(mealActionFromRecipe(selectedSocialRecipe)) : onChooseMeal()}
            className="w-full rounded-lg border px-2 py-1.5 text-[11px] hover:bg-secondary"
          >
            {friendsCount ? "Ask friend" : "Browse meal ideas"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border bg-primary/5 border-primary/20 px-3 py-2">
        <p className="text-xs font-semibold text-primary">Next useful action</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {proteinLeft > 25
            ? `You're ${proteinLeft}g protein short. Choose a saved high-protein meal or add a recovery meal.`
            : caloriesLeft > 400
              ? `${caloriesLeft} kcal left today. Pick a planned or saved meal before the day gets away from you.`
              : "Today is nearly covered. Save a note about what worked so you can repeat it."}
        </p>
        <div className="grid grid-cols-3 gap-1.5 mt-2">
          <button type="button" onClick={onChooseMeal} className="rounded-lg bg-primary text-primary-foreground px-2 py-1.5 text-[11px] font-medium">Use meal</button>
          <button type="button" onClick={onAddRecoveryMeal} className="rounded-lg border px-2 py-1.5 text-[11px] hover:bg-secondary">Log food</button>
          <button type="button" onClick={() => onSaveNote(contextNote)} className="rounded-lg border px-2 py-1.5 text-[11px] hover:bg-secondary">Save note</button>
        </div>
      </div>

      <div className="rounded-xl bg-secondary/20 px-3 py-2 flex items-start gap-2">
        <Lock size={13} className="mt-0.5 text-muted-foreground shrink-0" />
        <p className="text-[11px] text-muted-foreground">Private by default: logged foods are for you. Shareable moments focus on recipes, meal ideas, encouragement, and recommendations.</p>
      </div>
    </div>
  );
}

function NutritionSetupContextCard({
  hasMealPlan,
  savedRecipeCount,
  hasNutritionGoal,
  activePlan,
  metric,
  goalsMatchPlan,
  syncingTargets,
  onCreatePlan,
  onOpenSavedRecipes,
  onOpenRecipeLibrary,
  onCreateGoal,
  onEditTargets,
  onSyncTargets,
  onLogFood,
}: {
  hasMealPlan: boolean;
  savedRecipeCount: number;
  hasNutritionGoal: boolean;
  activePlan: WorkoutPlan | null;
  metric: Record<string, any> | null;
  goalsMatchPlan: boolean;
  syncingTargets: boolean;
  onCreatePlan: () => void;
  onOpenSavedRecipes: () => void;
  onOpenRecipeLibrary: () => void;
  onCreateGoal: () => void;
  onEditTargets: () => void;
  onSyncTargets: () => void;
  onLogFood: () => void;
}) {
  const targetProtein = metric?.proteinGrams ? Math.round(metric.proteinGrams as number) : null;
  const setupRows = [
    {
      icon: CalendarCheck,
      label: "Meal plan",
      status: hasMealPlan ? "Connected" : "Missing",
      body: hasMealPlan
        ? "Today can recommend planned meals and build from your schedule."
        : "Create a plan so Today knows what meal to recommend next.",
      action: hasMealPlan ? "View plan" : "Create plan",
      onClick: onCreatePlan,
      done: hasMealPlan,
    },
    {
      icon: BookMarked,
      label: "Saved recipes",
      status: savedRecipeCount ? `${savedRecipeCount} saved` : "Missing",
      body: savedRecipeCount
        ? "Saved meals can be reused in plans, messages, and MyLifos."
        : "Find one recipe in the Library and save it for planning.",
      action: savedRecipeCount ? "Open saved" : "Open Library",
      onClick: savedRecipeCount ? onOpenSavedRecipes : onOpenRecipeLibrary,
      done: savedRecipeCount > 0,
    },
    {
      icon: Target,
      label: "Nutrition goal",
      status: hasNutritionGoal ? "Set" : "Missing",
      body: hasNutritionGoal
        ? "Calories, protein, macros, and water are guiding Today."
        : "Set targets so progress and recommendations have a clear outcome.",
      action: hasNutritionGoal ? "Edit targets" : "Create goal",
      onClick: hasNutritionGoal ? onEditTargets : onCreateGoal,
      done: hasNutritionGoal,
    },
  ];

  return (
    <div className="rounded-2xl border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Setup status</p>
          <p className="text-xs text-muted-foreground">These are the pieces Today needs before it can make sharper recommendations.</p>
        </div>
        <button type="button" onClick={onLogFood} className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-secondary">
          Log food
        </button>
      </div>

      <div className="grid md:grid-cols-3 gap-2">
        {setupRows.map(row => {
          const Icon = row.icon;
          return (
            <div key={row.label} className={`rounded-xl border p-3 space-y-3 ${row.done ? "bg-green-500/5 border-green-500/20" : "bg-background"}`}>
              <div className="flex items-start gap-2">
                <Icon size={14} className={row.done ? "mt-0.5 text-green-600 dark:text-green-400 shrink-0" : "mt-0.5 text-primary shrink-0"} />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-semibold">{row.label}</p>
                    {row.done && <Check size={12} className="text-green-600 dark:text-green-400" />}
                  </div>
                  <p className={`text-[11px] font-medium ${row.done ? "text-green-700 dark:text-green-300" : "text-primary"}`}>{row.status}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">{row.body}</p>
                </div>
              </div>
              <button type="button" onClick={row.onClick} className="w-full rounded-lg border px-2 py-1.5 text-[11px] hover:bg-secondary">
                {row.action}
              </button>
            </div>
          );
        })}
      </div>

      {activePlan && (
        <div className="rounded-xl border bg-background p-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2">
            <Dumbbell size={14} className="mt-0.5 text-primary shrink-0" />
            <div>
              <p className="text-xs font-semibold">Workout context</p>
              <p className="text-[11px] text-muted-foreground">
                {targetProtein
                  ? `${activePlan.name} suggests ${targetProtein}g protein.`
                  : `${activePlan.name} can inform recovery meals and targets.`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={goalsMatchPlan ? onEditTargets : onSyncTargets}
            disabled={syncingTargets}
            className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-50"
          >
            {syncingTargets ? "Working..." : goalsMatchPlan ? "Edit targets" : "Use workout targets"}
          </button>
        </div>
      )}

      <div className="rounded-xl bg-secondary/20 px-3 py-2 flex items-start gap-2">
        <Lock size={13} className="mt-0.5 text-muted-foreground shrink-0" />
        <p className="text-[11px] text-muted-foreground">Private by default: food logs stay personal. Recipes, meal ideas, and encouragement are the shareable pieces.</p>
      </div>
    </div>
  );
}

function parseRecipeNutrition(recipe: Recipe): NutritionSummary | null {
  try {
    return recipe.nutritionData ? JSON.parse(recipe.nutritionData as string) : null;
  } catch {
    return null;
  }
}

type NutritionMealActionItem = {
  id: string;
  title: string;
  subtitle?: string;
  mealType?: string | null;
  emoji?: string;
  imageUrl?: string | null;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  details?: Record<string, any>;
  source: "recent" | "recipe";
};

function mealActionFromRecent(item: FoodLogEntry): NutritionMealActionItem {
  return {
    id: `recent-${item.id}`,
    title: item.foodName,
    subtitle: `${Math.round(Number(item.calories))} kcal · P ${Math.round(Number(item.protein))}g`,
    mealType: item.mealType,
    calories: Number(item.calories) || 0,
    protein: Number(item.protein) || 0,
    carbs: Number(item.carbs) || 0,
    fat: Number(item.fat) || 0,
    source: "recent",
  };
}

function mealActionFromRecipe(recipe: Recipe): NutritionMealActionItem {
  const nutrition = parseRecipeNutrition(recipe);
  return {
    id: `recipe-${recipe.id}`,
    title: recipe.name,
    subtitle: nutrition ? `${Math.round(nutrition.calories)} kcal · P ${Math.round(nutrition.protein)}g` : "Saved recipe",
    mealType: "dinner",
    emoji: recipe.emoji || "🍽️",
    imageUrl: recipe.imageUrl,
    calories: nutrition?.calories ?? 0,
    protein: nutrition?.protein ?? 0,
    carbs: nutrition?.carbs ?? 0,
    fat: nutrition?.fat ?? 0,
    details: {
      category: recipe.category ?? "Saved recipe",
      prepTime: recipe.prepTime ?? 0,
      cookTime: recipe.cookTime ?? 0,
      servings: recipe.servings ?? 1,
      ingredientsJson: recipe.ingredientsJson || "[]",
      instructions: recipe.instructions ?? "",
      calories: Math.round(nutrition?.calories ?? 0),
      protein: Math.round(nutrition?.protein ?? 0),
      carbs: Math.round(nutrition?.carbs ?? 0),
      fat: Math.round(nutrition?.fat ?? 0),
    },
    source: "recipe",
  };
}

function mealActionFromPlannerRecipe(recipe: PlannerRecipe, mealType?: MealSlot): NutritionMealActionItem {
  return {
    id: `planned-${recipe.id}`,
    title: recipe.name,
    subtitle: `${mealType ?? recipe.category} · ${recipe.macros.cal} kcal · P ${recipe.macros.p}g`,
    mealType,
    emoji: "🍽️",
    calories: recipe.macros.cal,
    protein: recipe.macros.p,
    carbs: recipe.macros.c,
    fat: recipe.macros.f,
    details: {
      category: recipe.category || "Planned meal",
      prepTime: recipe.prepMin,
      cookTime: recipe.cookMin,
      servings: recipe.servings,
      ingredientsJson: JSON.stringify(recipe.ingredients.map(name => ({ name, qty: "" }))),
      instructions: recipe.instructions.join("\n"),
      calories: recipe.macros.cal,
      protein: recipe.macros.p,
      carbs: recipe.macros.c,
      fat: recipe.macros.f,
    },
    source: "recipe",
  };
}

function slugifyMealName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "saved-meal";
}

function toPlannerRecipe(item: NutritionMealActionItem): PlannerRecipe {
  return {
    id: `nutrition-${item.source}-${Date.now()}`,
    slug: `nutrition-${slugifyMealName(item.title)}-${Date.now()}`,
    category: item.source === "recipe" ? "Saved recipe" : "Saved meal",
    name: item.title,
    description: item.subtitle ?? "Saved from Nutrition.",
    servings: 1,
    prepMin: 0,
    cookMin: 0,
    totalMin: 0,
    difficulty: "Easy",
    ingredients: [],
    instructions: [],
    tags: ["nutrition", item.source === "recipe" ? "recipe" : "saved-meal"],
    source: "MyLifos Nutrition",
    macros: {
      cal: Math.round(item.calories ?? 0),
      p: Math.round(item.protein ?? 0),
      c: Math.round(item.carbs ?? 0),
      f: Math.round(item.fat ?? 0),
    },
  };
}

function AddMealToPlanModal({
  item,
  onClose,
  onOpenPlan,
}: {
  item: NutritionMealActionItem;
  onClose: () => void;
  onOpenPlan: () => void;
}) {
  const { plan, setPlan } = usePlanner();
  const { toast } = useToast();
  const defaultSlot = (["breakfast", "lunch", "dinner", "snack"].includes(item.mealType || "")
    ? item.mealType
    : "dinner") as MealSlot;
  const [dayIndex, setDayIndex] = useState("0");
  const [slot, setSlot] = useState<MealSlot>(defaultSlot);

  function addToPlan() {
    if (!plan) return;
    const targetDay = Math.min(Math.max(Number(dayIndex) || 0, 0), plan.days.length - 1);
    const recipe = toPlannerRecipe(item);
    const nextPlan = {
      ...plan,
      days: plan.days.map((day, idx) => {
        if (idx !== targetDay) return day;
        const meals = day.meals.filter(meal => !(meal.slot === slot && meal.recipe.name === item.title));
        meals.push({ slot, recipe });
        return {
          ...day,
          meals,
          totals: meals.filter(meal => !meal.removed).reduce((acc, meal) => ({
            cal: acc.cal + meal.recipe.macros.cal,
            p: acc.p + meal.recipe.macros.p,
            c: acc.c + meal.recipe.macros.c,
            f: acc.f + meal.recipe.macros.f,
          }), { cal: 0, p: 0, c: 0, f: 0 }),
        };
      }),
    };
    setPlan(nextPlan);
    toast({ title: "Added to meal plan", description: `${item.title} is now in ${slot} for day ${targetDay + 1}.` });
    onClose();
  }

  return (
    <Modal title="Add to plan" onClose={onClose}>
      <div className="rounded-xl border bg-secondary/20 p-3">
        <p className="text-sm font-semibold">{item.title}</p>
        {item.subtitle && <p className="text-xs text-muted-foreground mt-0.5">{item.subtitle}</p>}
      </div>
      {!plan ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Build a meal plan first, then MyLifos can place saved meals into specific days and meal slots.</p>
          <Button className="w-full" onClick={() => { onClose(); onOpenPlan(); }}>Build meal plan</Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Day">
              <Select value={dayIndex} onChange={setDayIndex}>
                {plan.days.map((day, idx) => (
                  <option key={day.day} value={String(idx)}>Day {idx + 1}</option>
                ))}
              </Select>
            </Field>
            <Field label="Meal">
              <Select value={slot} onChange={(value) => setSlot(value as MealSlot)}>
                <option value="breakfast">Breakfast</option>
                <option value="lunch">Lunch</option>
                <option value="dinner">Dinner</option>
                <option value="snack">Snack</option>
              </Select>
            </Field>
          </div>
          <Button className="w-full" onClick={addToPlan}>Add meal</Button>
        </>
      )}
    </Modal>
  );
}

function NutritionFriendActionModal({
  mode,
  item,
  friends,
  isSending,
  onClose,
  onSubmit,
}: {
  mode: "recommend" | "ask";
  item: NutritionMealActionItem;
  friends: PublicUser[];
  isSending: boolean;
  onClose: () => void;
  onSubmit: (friendId: number, note: string) => void;
}) {
  const [friendId, setFriendId] = useState(friends[0]?.id ? String(friends[0].id) : "");
  const [note, setNote] = useState(
    mode === "recommend"
      ? `Thought you might like this: ${item.title}.`
      : `Have you tried ${item.title}? I am thinking about adding it to my meal rotation.`
  );
  const label = mode === "recommend" ? "Recommend recipe" : "Ask about it";

  return (
    <Modal title={label} onClose={onClose}>
      <div className="rounded-xl border bg-secondary/20 p-3">
        <p className="text-sm font-semibold">{item.title}</p>
        {item.subtitle && <p className="text-xs text-muted-foreground mt-0.5">{item.subtitle}</p>}
      </div>
      {friends.length === 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Add friends first, then you can send recipe ideas and questions without sharing your private food log.</p>
          <a href="#/people" onClick={onClose} className="block rounded-lg bg-primary text-primary-foreground px-3 py-2 text-center text-sm font-semibold">Find friends</a>
        </div>
      ) : (
        <>
          <Field label="Friend">
            <Select value={friendId} onChange={setFriendId}>
              {friends.map(friend => (
                <option key={friend.id} value={friend.id}>{friend.name}</option>
              ))}
            </Select>
          </Field>
          <Field label={mode === "recommend" ? "Why they'll like it" : "Question"}>
            <Textarea value={note} onChange={e => setNote(e.target.value)} rows={3} />
          </Field>
          <div className="rounded-xl bg-secondary/20 px-3 py-2 flex items-start gap-2">
            <Lock size={13} className="mt-0.5 text-muted-foreground shrink-0" />
            <p className="text-[11px] text-muted-foreground">This sends a recipe card in Messages. Your logged foods, calories, and targets stay private.</p>
          </div>
          <Button
            className="w-full"
            onClick={() => friendId && onSubmit(Number(friendId), note)}
            disabled={!friendId || isSending}
          >
            {isSending ? "Sending..." : mode === "recommend" ? "Send in Messages" : "Ask in Messages"}
          </Button>
        </>
      )}
    </Modal>
  );
}

function NutritionMealsLibrary({
  recentFoods,
  recipes,
  goals,
  onLogRecent,
  onSaveRecent,
  onLogRecipe,
  onAddToPlan,
  onRecommend,
  onAsk,
  onOpenPlan,
  savingRecentId,
  loggingRecent,
  loggingRecipe,
}: {
  recentFoods: FoodLogEntry[];
  recipes: Recipe[];
  goals: { calories: number; protein: number; carbs: number; fat: number };
  onLogRecent: (item: FoodLogEntry) => void;
  onSaveRecent: (item: FoodLogEntry) => void;
  onLogRecipe: (recipe: Recipe) => void;
  onAddToPlan: (item: NutritionMealActionItem) => void;
  onRecommend: (item: NutritionMealActionItem) => void;
  onAsk: (item: NutritionMealActionItem) => void;
  onOpenPlan: () => void;
  savingRecentId?: number | null;
  loggingRecent: boolean;
  loggingRecipe: boolean;
}) {
  const uniqueRecent = useMemo(() => {
    const seen = new Set<string>();
    return recentFoods.filter(item => {
      const key = item.foodName.trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 8);
  }, [recentFoods]);
  const savedMeals = recipes.slice(0, 8);
  const topRepeat = uniqueRecent[0] ?? null;
  const hasMealData = uniqueRecent.length > 0 || savedMeals.length > 0;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-card p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Saved Meals & Recipes</p>
            <p className="text-xs text-muted-foreground">Reusable meals you can log, add to plans, and recommend.</p>
          </div>
          <a
            href="#/health"
            onClick={() => openHealthRecipeTab("saved")}
            className="shrink-0 text-xs text-primary hover:underline"
          >
            Manage saved
          </a>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: "Saved meals", value: savedMeals.length },
            { label: "Recent meals", value: uniqueRecent.length },
            { label: "Recipes", value: recipes.length },
            { label: "Privacy", value: "Private" },
          ].map(item => (
            <div key={item.label} className="rounded-xl border bg-secondary/20 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{item.label}</p>
              <p className="text-sm font-bold">{item.value}</p>
            </div>
          ))}
        </div>
        <div className="rounded-xl bg-secondary/20 px-3 py-2 flex items-start gap-2">
          <Lock size={13} className="mt-0.5 text-muted-foreground shrink-0" />
          <p className="text-[11px] text-muted-foreground">Food logs stay private. Saved meals and recipes are reusable MyLifos items you can choose to recommend.</p>
        </div>
      </div>

      {!hasMealData && (
        <div className="rounded-2xl border border-dashed bg-card p-6 text-center space-y-3">
          <div>
            <p className="text-sm font-semibold">Save meals you eat often</p>
            <p className="text-xs text-muted-foreground mt-1">Once you log or save meals, this becomes your quick library for planning and repeating what works.</p>
          </div>
          <div className="flex justify-center gap-2 flex-wrap">
            <a href="#/nutrition" className="rounded-lg bg-primary text-primary-foreground px-3 py-2 text-xs font-semibold">Log food</a>
            <a
              href="#/health"
              onClick={() => openHealthRecipeTab("library")}
              className="rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-secondary"
            >
              Open Recipe Library
            </a>
          </div>
        </div>
      )}

      {uniqueRecent.length > 0 && (
        <div className="rounded-2xl border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">Recent Meals</p>
              <p className="text-xs text-muted-foreground">Repeat or save what you already eat.</p>
            </div>
            {topRepeat && (
              <button onClick={() => onSaveRecent(topRepeat)} className="text-xs text-primary hover:underline shrink-0">
                Save top repeat
              </button>
            )}
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            {uniqueRecent.map(item => (
              <div key={item.id} className="rounded-xl border bg-background p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{item.foodName}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {Math.round(Number(item.calories))} kcal · P {Math.round(Number(item.protein))}g · C {Math.round(Number(item.carbs))}g · F {Math.round(Number(item.fat))}g
                    </p>
                  </div>
                  <span className="text-[10px] text-muted-foreground capitalize shrink-0">{item.mealType}</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <Button size="sm" className="h-7 text-xs" onClick={() => onLogRecent(item)} disabled={loggingRecent}>Log today</Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onSaveRecent(item)} disabled={savingRecentId === item.id}>
                    {savingRecentId === item.id ? "Saving..." : "Save meal"}
                  </Button>
                  <button type="button" onClick={() => onAddToPlan(mealActionFromRecent(item))} className="rounded-md border px-2 py-1.5 text-center text-[11px] hover:bg-secondary">Add to plan</button>
                  <button type="button" onClick={() => onRecommend(mealActionFromRecent(item))} className="rounded-md border px-2 py-1.5 text-center text-[11px] hover:bg-secondary">Recommend</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {savedMeals.length > 0 && (
        <div className="rounded-2xl border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">Saved Meals & Recipes</p>
              <p className="text-xs text-muted-foreground">Reusable MyLifos food items for logging, planning, and recommendations.</p>
            </div>
            <a
              href="#/health"
              onClick={() => openHealthRecipeTab("saved")}
              className="text-xs text-primary hover:underline shrink-0"
            >
              View saved
            </a>
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            {savedMeals.map(recipe => {
              const nutrition = parseRecipeNutrition(recipe);
              return (
                <div key={recipe.id} className="rounded-xl border bg-background p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="text-lg leading-none">{recipe.emoji || "🍽️"}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{recipe.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {nutrition
                          ? `${Math.round(nutrition.calories)} kcal · P ${Math.round(nutrition.protein)}g`
                          : "Nutrition not estimated yet"}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <Button size="sm" className="h-7 text-xs" onClick={() => onLogRecipe(recipe)} disabled={loggingRecipe}>Log today</Button>
                    <button type="button" onClick={() => onAddToPlan(mealActionFromRecipe(recipe))} className="rounded-md border px-2 py-1.5 text-center text-[11px] hover:bg-secondary">Add to plan</button>
                    <button type="button" onClick={() => onRecommend(mealActionFromRecipe(recipe))} className="rounded-md border px-2 py-1.5 text-center text-[11px] hover:bg-secondary">Recommend</button>
                    <button type="button" onClick={() => onAsk(mealActionFromRecipe(recipe))} className="rounded-md border px-2 py-1.5 text-center text-[11px] hover:bg-secondary">Ask about it</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── NutritionTab ─────────────────────────────────────────────────────────────
// Exported so NutritionPage can use it directly.
// Pass `section` + `onSection` to control from outside (hides internal nav).
export function NutritionTab({
  section: externalSection,
  onSection: externalSetSection,
}: {
  section?: NutritionSectionInput;
  onSection?: (s: NutritionSection) => void;
} = {}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { plan } = usePlanner();
  const todayStr = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [internalSection, setInternalSection] = useState<NutritionSection>("today");
  const activeSection = normalizeNutritionSection(externalSection ?? internalSection);
  const setActiveSection = useCallback((section: NutritionSectionInput) => {
    const next = normalizeNutritionSection(section);
    if (externalSetSection) externalSetSection(next);
    else setInternalSection(next);
  }, [externalSetSection]);
  const [planMealItem, setPlanMealItem] = useState<NutritionMealActionItem | null>(null);
  const [friendAction, setFriendAction] = useState<{ mode: "recommend" | "ask"; item: NutritionMealActionItem } | null>(null);

  // ── Today section: food log panel state ───────────────────────────────
  const [showFoodLog, setShowFoodLog] = useState(false);
  const [logMealPreset, setLogMealPreset] = useState("snack");
  const foodLogPanelRef = useRef<HTMLDivElement | null>(null);
  const [showConnectedContext, setShowConnectedContext] = useState(false);

  const { data: foodLog = [] } = useQuery<FoodLogEntry[]>({
    queryKey: ["/api/nutrition/food-log", selectedDate],
    queryFn: () => apiRequest("GET", `/api/nutrition/food-log?date=${selectedDate}`).then(r => r.json()),
  });
  const { data: goalsData, isLoading: goalsLoading } = useQuery<{ calories: number; protein: number; carbs: number; fat: number; waterGlasses: number }>({
    queryKey: ["/api/nutrition/goals"],
    queryFn: () => apiRequest("GET", "/api/nutrition/goals").then(r => r.json()),
  });
  const { data: waterData } = useQuery<{ glasses: number }>({
    queryKey: ["/api/nutrition/water-log", selectedDate],
    queryFn: () => apiRequest("GET", `/api/nutrition/water-log?date=${selectedDate}`).then(r => r.json()),
  });
  const { data: weeklyLog = [] } = useQuery<FoodLogEntry[]>({
    queryKey: ["/api/nutrition/food-log/week"],
    queryFn: () => apiRequest("GET", "/api/nutrition/food-log/week").then(r => r.json()),
  });
  const { data: recentFoods = [] } = useQuery<FoodLogEntry[]>({
    queryKey: ["/api/nutrition/food-log/history"],
    queryFn: () => apiRequest("GET", "/api/nutrition/food-log/history").then(r => r.json()),
  });
  const { data: recipes = [], isLoading: recipesLoading } = useQuery<Recipe[]>({
    queryKey: ["/api/recipes"],
    queryFn: () => apiRequest("GET", "/api/recipes").then(r => r.json()),
  });
  const { data: friends = [] } = useQuery<PublicUser[]>({
    queryKey: ["/api/friends"],
    queryFn: () => apiRequest("GET", "/api/friends").then(r => r.json()),
  });
  const { data: workoutPlans = [] } = useQuery<WorkoutPlan[]>({
    queryKey: ["/api/workout-plans"],
    queryFn: () => apiRequest("GET", "/api/workout-plans").then(r => r.json()),
  });

  // Find a body composition plan — prefer active for optional workout context only.
  const bodyCompPlans = workoutPlans.filter(p => p.goalType === "body_composition");
  const activeBodyCompPlan = bodyCompPlans.find(p => p.isActive) ?? null;
  const bodyCompMetric: Record<string, any> | null = (() => {
    try { return activeBodyCompPlan?.goalMetricJson ? JSON.parse(activeBodyCompPlan.goalMetricJson) : null; } catch { return null; }
  })();

  // Macro targets suggested by the active plan (only when it has full nutrition data)
  const planTargets = (bodyCompMetric?.targetCalories && bodyCompMetric?.proteinGrams != null)
    ? {
        calories: Math.round(bodyCompMetric.targetCalories as number),
        protein:  Math.round(bodyCompMetric.proteinGrams  as number),
        carbs:    Math.round(bodyCompMetric.carbsGrams    as number),
        fat:      Math.round(bodyCompMetric.fatGrams      as number),
      }
    : null;

  const g = goalsData ?? { calories: 2000, protein: 150, carbs: 250, fat: 65, waterGlasses: 8 };

  // True when the stored goals already match the active plan targets
  const goalsMatchPlan = planTargets != null && goalsData != null &&
    goalsData.calories === planTargets.calories &&
    goalsData.protein  === planTargets.protein  &&
    goalsData.carbs    === planTargets.carbs    &&
    goalsData.fat      === planTargets.fat;

  const syncGoalsMut = useMutation({
    mutationFn: () => apiRequest("PATCH", "/api/nutrition/goals", {
      ...planTargets,
      waterGlasses: g.waterGlasses,
    }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/nutrition/goals"] });
      toast({ title: "Targets synced from active plan" });
    },
    onError: () => toast({ title: "Failed to sync goals", variant: "destructive" }),
  });
  const waterGlasses = waterData?.glasses ?? 0;

  const totals = foodLog.reduce((acc, e) => ({
    calories: acc.calories + Number(e.calories) * Number(e.quantity),
    protein:  acc.protein  + Number(e.protein)  * Number(e.quantity),
    carbs:    acc.carbs    + Number(e.carbs)     * Number(e.quantity),
    fat:      acc.fat      + Number(e.fat)       * Number(e.quantity),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
  const mealSlotsLogged = new Set(foodLog.map(e => e.mealType)).size;
  const caloriesLeft = Math.max(0, Math.round(g.calories - totals.calories));
  const proteinLeft = Math.max(0, Math.round(g.protein - totals.protein));
  const waterLeft = Math.max(0, g.waterGlasses - waterGlasses);
  const calPct = Math.min(100, g.calories > 0 ? (totals.calories / g.calories) * 100 : 0);

  const waterMut = useMutation({
    mutationFn: (glasses: number) => apiRequest("POST", "/api/nutrition/water-log", { date: selectedDate, glasses }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/nutrition/water-log", selectedDate] }),
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/nutrition/food-log/${id}`).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/nutrition/food-log", selectedDate] }); toast({ title: "Entry removed" }); },
  });
  const repeatFoodMut = useMutation({
    mutationFn: (item: FoodLogEntry) => apiRequest("POST", "/api/nutrition/food-log", {
      foodName: item.foodName,
      usdaFoodId: item.usdaFoodId,
      servingSize: item.servingSize,
      servingUnit: item.servingUnit,
      quantity: 1,
      mealType: item.mealType || "snack",
      date: selectedDate,
      calories: item.calories,
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
      fiber: item.fiber,
      sugar: item.sugar,
      sodium: item.sodium,
      ingredientsJson: item.ingredientsJson,
    }).then(r => r.json()),
    onSuccess: (_data, item) => {
      qc.invalidateQueries({ queryKey: ["/api/nutrition/food-log", selectedDate] });
      qc.invalidateQueries({ queryKey: ["/api/nutrition/food-log/week"] });
      qc.invalidateQueries({ queryKey: ["/api/nutrition/food-log/history"] });
      toast({ title: `${item.foodName} logged` });
    },
    onError: () => toast({ title: "Failed to log food", variant: "destructive" }),
  });
  const logRecipeMut = useMutation({
    mutationFn: (recipe: Recipe) => {
      const nutrition = parseRecipeNutrition(recipe);
      return apiRequest("POST", "/api/nutrition/food-log", {
        foodName: recipe.name,
        servingSize: 1,
        servingUnit: "serving",
        quantity: 1,
        mealType: "snack",
        date: selectedDate,
        calories: nutrition?.calories ?? 0,
        protein: nutrition?.protein ?? 0,
        carbs: nutrition?.carbs ?? 0,
        fat: nutrition?.fat ?? 0,
        fiber: nutrition?.fiber ?? 0,
        sugar: nutrition?.sugar ?? 0,
        sodium: nutrition?.sodium ?? 0,
      }).then(r => r.json());
    },
    onSuccess: (_data, recipe) => {
      qc.invalidateQueries({ queryKey: ["/api/nutrition/food-log", selectedDate] });
      qc.invalidateQueries({ queryKey: ["/api/nutrition/food-log/week"] });
      toast({ title: `${recipe.name} logged` });
    },
    onError: () => toast({ title: "Failed to log recipe", variant: "destructive" }),
  });
  const [savingRecentMealId, setSavingRecentMealId] = useState<number | null>(null);
  const saveRecentMealMut = useMutation({
    mutationFn: (item: FoodLogEntry) => {
      setSavingRecentMealId(item.id);
      const nutrition: NutritionSummary = {
        calories: Number(item.calories) || 0,
        protein: Number(item.protein) || 0,
        carbs: Number(item.carbs) || 0,
        fat: Number(item.fat) || 0,
        fiber: Number(item.fiber) || 0,
        sugar: Number(item.sugar) || 0,
        sodium: Number(item.sodium) || 0,
        servings: 1,
      };
      return apiRequest("POST", "/api/recipes", {
        name: item.foodName,
        emoji: "🍽️",
        category: "Saved meal",
        servings: 1,
        ingredientsJson: item.ingredientsJson || "[]",
        nutritionData: JSON.stringify(nutrition),
        description: `Saved from Nutrition after logging as ${item.mealType || "a meal"}.`,
        tags: "saved meal,nutrition",
      }).then(r => r.json());
    },
    onSuccess: (_data, item) => {
      qc.invalidateQueries({ queryKey: ["/api/recipes"] });
      toast({ title: `${item.foodName} saved as a meal` });
    },
    onError: () => toast({ title: "Failed to save meal", variant: "destructive" }),
    onSettled: () => setSavingRecentMealId(null),
  });
  const sendNutritionShareMut = useMutation({
    mutationFn: async ({ mode, item, friendId, note }: { mode: "recommend" | "ask"; item: NutritionMealActionItem; friendId: number; note: string }) => {
      const dm = await apiRequest("POST", "/api/messenger/dm", { friendId }).then(r => r.json());
      const messageNote = note.trim() || (mode === "ask"
        ? `Have you tried ${item.title}?`
        : `Thought you might like ${item.title}.`);
      return apiRequest("POST", `/api/messenger/conversations/${dm.id}/share`, {
        shareType: "recipe",
        shareData: {
          shareType: "recipe",
          name: item.title,
          subtitle: item.subtitle ?? (mode === "ask" ? "Nutrition question" : "Meal idea"),
          emoji: item.emoji ?? "🍽️",
          imageUrl: item.imageUrl ?? undefined,
          note: messageNote,
          details: {
            ...(item.details ?? {}),
            category: item.details?.category ?? (item.source === "recipe" ? "Saved recipe" : "Saved meal"),
            servings: item.details?.servings ?? 1,
            calories: Math.round(item.calories ?? 0),
            protein: Math.round(item.protein ?? 0),
            carbs: Math.round(item.carbs ?? 0),
            fat: Math.round(item.fat ?? 0),
          },
        },
        note: messageNote,
      }).then(r => r.json());
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["/api/messenger/conversations"] });
      toast({ title: variables.mode === "ask" ? "Question sent in Messages" : "Recommendation sent in Messages", description: variables.item.title });
      setFriendAction(null);
    },
    onError: () => toast({ title: "Could not send in Messages", description: "Make sure this person is a friend, then try again.", variant: "destructive" }),
  });
  const saveNutritionNoteMut = useMutation({
    mutationFn: (item: NutritionMealActionItem) => apiRequest("POST", "/api/journal", {
      date: selectedDate,
      title: `Meal note: ${item.title}`,
      content: `${item.title}\n\n${item.subtitle ?? "Saved from Nutrition."}`,
      mood: null,
      tags: "nutrition,meal-plan",
      isFavorite: false,
      createdAt: new Date().toISOString(),
    }).then(r => r.json()),
    onSuccess: (_data, item) => {
      qc.invalidateQueries({ queryKey: ["/api/journal"] });
      toast({ title: "Private note created", description: item.title });
    },
    onError: () => toast({ title: "Could not create note", variant: "destructive" }),
  });

  const [editingEntryId, setEditingEntryId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ foodName: "", quantity: "1", mealType: "snack", calories: "", protein: "", carbs: "", fat: "" });

  // Edit ingredient state (mirrors Quick Add ingredient builder)
  type EditIngredient = {
    id: number; name: string;
    servingSize: number; servingUnit: string;
    qty: number;
    nutrients: { calories: number; protein: number; carbs: number; fat: number; fiber: number; sugar: number; sodium: number };
  };
  const [editIngredients, setEditIngredients] = useState<EditIngredient[]>([]);
  const [editIngQuery, setEditIngQuery] = useState("");
  const [editIngResults, setEditIngResults] = useState<any[]>([]);
  const [editIngSearching, setEditIngSearching] = useState(false);
  const [editIngPending, setEditIngPending] = useState<any | null>(null);
  const [editIngPendingQty, setEditIngPendingQty] = useState(1);

  // Auto-recompute macros when editIngredients changes
  useEffect(() => {
    if (editIngredients.length === 0) return;
    const totals = editIngredients.reduce(
      (acc, ing) => ({
        calories: acc.calories + ing.nutrients.calories * ing.qty,
        protein:  acc.protein  + ing.nutrients.protein  * ing.qty,
        carbs:    acc.carbs    + ing.nutrients.carbs     * ing.qty,
        fat:      acc.fat      + ing.nutrients.fat       * ing.qty,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
    setEditForm(f => ({
      ...f,
      calories: String(Math.round(totals.calories)),
      protein:  String(Math.round(totals.protein)),
      carbs:    String(Math.round(totals.carbs)),
      fat:      String(Math.round(totals.fat)),
    }));
  }, [editIngredients]);

  async function doEditIngSearch() {
    if (!editIngQuery.trim()) return;
    setEditIngSearching(true);
    try {
      const r = await apiRequest("GET", `/api/nutrition/usda-search?q=${encodeURIComponent(editIngQuery)}`);
      const d = await r.json();
      setEditIngResults((d.foods || []).slice(0, 8));
    } catch { /* ignore */ }
    setEditIngSearching(false);
  }

  function openEditEntry(e: FoodLogEntry) {
    setEditingEntryId(e.id);
    setEditForm({
      foodName: e.foodName,
      quantity: String(e.quantity),
      mealType: e.mealType || "snack",
      calories: String(e.calories),
      protein: String(e.protein),
      carbs: String(e.carbs),
      fat: String(e.fat),
    });
    // Restore saved ingredients (if any)
    try {
      const ings = (e as any).ingredientsJson ? JSON.parse((e as any).ingredientsJson) : [];
      setEditIngredients(Array.isArray(ings) ? ings : []);
    } catch { setEditIngredients([]); }
    setEditIngQuery(""); setEditIngResults([]); setEditIngPending(null); setEditIngPendingQty(1);
  }

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiRequest("PATCH", `/api/nutrition/food-log/${id}`, data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/nutrition/food-log", selectedDate] });
      qc.invalidateQueries({ queryKey: ["/api/nutrition/food-log/week"] });
      setEditingEntryId(null);
      toast({ title: "Entry updated" });
    },
  });

  const weeklyByDate = weeklyLog.reduce((acc: Record<string, number>, e) => {
    const key = e.date || todayStr;
    acc[key] = (acc[key] || 0) + Number(e.calories) * Number(e.quantity);
    return acc;
  }, {});
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });

  const circumference = 2 * Math.PI * 32;
  const plannedTodayMeals = plan?.days?.[0]?.meals?.filter(meal => !meal.removed) ?? [];
  const nextPlannedMeal = plannedTodayMeals.find(meal => !foodLog.some(entry => entry.mealType === meal.slot)) ?? plannedTodayMeals[0] ?? null;
  const hasMealPlan = plannedTodayMeals.length > 0;
  const hasSavedRecipe = recipesLoading || recipes.length > 0;
  const hasNutritionGoal = goalsLoading || !!goalsData;
  const nextNutritionAction = !hasMealPlan
    ? {
        kind: "create-plan" as const,
        title: "Create your first meal plan",
        body: "A plan gives Today meals to recommend, meals to log, and a useful shopping list.",
        primary: "Create plan",
        secondary: "Log food instead",
      }
    : !hasSavedRecipe
      ? {
          kind: "save-recipe" as const,
          title: "Save your first recipe",
          body: "Find a recipe in the Library and save it so planning has a reusable meal idea.",
          primary: "Open Recipe Library",
          secondary: "Log food instead",
        }
      : !hasNutritionGoal
        ? {
            kind: "create-goal" as const,
            title: "Create your nutrition goal",
            body: "Set calories, protein, macros, and water so Today can judge progress against the right target.",
            primary: "Create goal",
            secondary: "Use defaults for now",
          }
        : nextPlannedMeal
          ? {
              kind: "log-planned-meal" as const,
              title: `Log ${nextPlannedMeal.recipe.name}`,
              body: `${nextPlannedMeal.slot} is planned for today: ${nextPlannedMeal.recipe.macros.cal} kcal and ${nextPlannedMeal.recipe.macros.p}g protein.`,
              primary: "Log planned meal",
              secondary: "View plan",
            }
          : proteinLeft >= 25
            ? {
                kind: "choose-meal" as const,
                title: "Pick a high-protein meal",
                body: `You are ${proteinLeft}g short on protein. Choose a saved meal or log what you ate.`,
                primary: "Choose meal",
                secondary: "Log food",
              }
            : caloriesLeft >= 400
              ? {
                  kind: "choose-meal" as const,
                  title: "Choose your next meal",
                  body: `${caloriesLeft} kcal remain today. Use a saved meal, planned meal, or quick log.`,
                  primary: "Choose meal",
                  secondary: "Log food",
                }
              : {
                  kind: "save-note" as const,
                  title: "Capture what worked",
                  body: "Today is nearly covered. Save a meal note or review your insights later.",
                  primary: "Save note",
                  secondary: "Insights",
                };

  function openFoodLog(meal = "snack") {
    setLogMealPreset(meal);
    setShowFoodLog(true);
    setTimeout(() => foodLogPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  function openSavedRecipes() {
    openHealthRecipeTab("saved");
  }

  function openRecipeLibrary() {
    openHealthRecipeTab("library");
  }

  function logPlannedMeal() {
    if (!nextPlannedMeal) return;
    apiRequest("POST", "/api/nutrition/food-log", {
      foodName: nextPlannedMeal.recipe.name,
      servingSize: 1,
      servingUnit: "serving",
      quantity: 1,
      mealType: nextPlannedMeal.slot,
      date: selectedDate,
      calories: nextPlannedMeal.recipe.macros.cal,
      protein: nextPlannedMeal.recipe.macros.p,
      carbs: nextPlannedMeal.recipe.macros.c,
      fat: nextPlannedMeal.recipe.macros.f,
      fiber: 0,
      sugar: 0,
      sodium: 0,
    }).then(() => {
      qc.invalidateQueries({ queryKey: ["/api/nutrition/food-log", selectedDate] });
      qc.invalidateQueries({ queryKey: ["/api/nutrition/food-log/week"] });
      toast({ title: `${nextPlannedMeal.recipe.name} logged for today` });
    }).catch(() => toast({ title: "Could not log planned meal", variant: "destructive" }));
  }

  function saveTodayNutritionNote() {
    saveNutritionNoteMut.mutate({
      id: "today-nutrition-summary",
      title: "Today's nutrition note",
      subtitle: `${Math.round(totals.calories)} kcal · ${Math.round(totals.protein)}g protein logged`,
      source: "recent",
    });
  }

  function handleNextNutritionPrimary() {
    if (nextNutritionAction.kind === "create-plan") {
      setActiveSection("plan");
      setShowConnectedContext(true);
      toast({ title: "Meal plan opened", description: "Start with your stats and preferences, then generate a plan." });
      return;
    }
    if (nextNutritionAction.kind === "save-recipe") {
      openRecipeLibrary();
      return;
    }
    if (nextNutritionAction.kind === "create-goal") {
      setActiveSection("targets");
      toast({ title: "Nutrition targets opened", description: "Set calories, protein, macros, and water here." });
      return;
    }
    if (nextNutritionAction.kind === "log-planned-meal") {
      logPlannedMeal();
      return;
    }
    if (nextNutritionAction.kind === "save-note") {
      saveTodayNutritionNote();
      return;
    }
    setActiveSection("plan");
  }

  function handleNextNutritionSecondary() {
    if (nextNutritionAction.secondary === "View plan") {
      setActiveSection("plan");
      return;
    }
    if (nextNutritionAction.secondary === "Insights") {
      setActiveSection("insights");
      return;
    }
    if (nextNutritionAction.secondary === "Use defaults for now") {
      toast({ title: "Default targets kept", description: "You can personalize them anytime from Targets." });
      return;
    }
    openFoodLog();
  }

  return (
    <div className="space-y-5">
      {/* Section nav — only shown when not controlled from a parent page */}
      {!externalSection && (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex gap-2 flex-wrap">
            {(["today", "plan", "targets", "insights"] as const).map(s => (
              <button key={s} onClick={() => setActiveSection(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all capitalize ${
                  activeSection === s ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}>
                {s === "today" ? "Today" : s === "plan" ? "Plan" : s === "targets" ? "Targets" : "Insights"}
              </button>
            ))}
          </div>
          <a
            href="#/health"
            onClick={() => openHealthRecipeTab("saved")}
            className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 shrink-0 transition-colors"
          >
            <BookOpen size={11} /> Saved Recipes <ArrowRight size={10} />
          </a>
        </div>
      )}

      {activeSection === "plan" && (
        <div className="space-y-4">
          <MealPlannerEmbed
            onRecommendMeal={(item) => setFriendAction({ mode: "recommend", item })}
            onAskMeal={(item) => setFriendAction({ mode: "ask", item })}
            onSaveMealNote={(item) => saveNutritionNoteMut.mutate(item)}
            savedMealsContent={
              <NutritionMealsLibrary
                recentFoods={recentFoods}
                recipes={recipes}
                goals={g}
                onLogRecent={(item) => repeatFoodMut.mutate(item)}
                onSaveRecent={(item) => saveRecentMealMut.mutate(item)}
                onLogRecipe={(recipe) => logRecipeMut.mutate(recipe)}
                onAddToPlan={setPlanMealItem}
                onRecommend={(item) => setFriendAction({ mode: "recommend", item })}
                onAsk={(item) => setFriendAction({ mode: "ask", item })}
                onOpenPlan={() => setActiveSection("plan")}
                savingRecentId={savingRecentMealId}
                loggingRecent={repeatFoodMut.isPending}
                loggingRecipe={logRecipeMut.isPending}
              />
            }
          />
        </div>
      )}

      {activeSection === "today" && (
        <div className="space-y-4">

          {/* ── Header: date + primary Log Food action ───────────────────── */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
                className="text-sm border rounded-lg px-2 py-1.5 bg-background" />
              {selectedDate !== todayStr && (
                <button onClick={() => setSelectedDate(todayStr)} className="text-xs text-primary hover:underline">Today</button>
              )}
            </div>
            <button
              onClick={() => { setLogMealPreset("snack"); setShowFoodLog(v => !v); }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors shadow-sm shrink-0"
            >
              <Plus size={14} /> Log Food
            </button>
          </div>

          {/* ── Collapsible food log panel ─────────────────────────────── */}
          {showFoodLog && (
            <div ref={foodLogPanelRef} className="rounded-2xl border bg-card shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b bg-secondary/20">
                <p className="text-sm font-semibold">Log Food</p>
                <button onClick={() => setShowFoodLog(false)} className="text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors">
                  <X size={15} />
                </button>
              </div>
              <div className="p-4">
                <FoodSearchAdd
                  key={logMealPreset}
                  date={selectedDate}
                  defaultMeal={logMealPreset}
                  onAdded={() => {
                    qc.invalidateQueries({ queryKey: ["/api/nutrition/food-log", selectedDate] });
                    qc.invalidateQueries({ queryKey: ["/api/nutrition/food-log/week"] });
                  }}
                />
              </div>
            </div>
          )}

          <div className="rounded-2xl border bg-card p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Next best action</p>
                <p className="text-sm font-semibold mt-0.5">{nextNutritionAction.title}</p>
                <p className="text-xs text-muted-foreground mt-1">{nextNutritionAction.body}</p>
              </div>
              <span className="rounded-full bg-primary/10 text-primary px-2.5 py-1 text-[10px] font-semibold shrink-0">Today</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={handleNextNutritionPrimary}
                className="rounded-lg bg-primary text-primary-foreground px-3 py-2 text-xs font-semibold hover:bg-primary/90"
              >
                {nextNutritionAction.primary}
              </button>
              <button
                type="button"
                onClick={handleNextNutritionSecondary}
                className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-secondary"
              >
                {nextNutritionAction.secondary}
              </button>
              <button type="button" onClick={() => setShowConnectedContext(v => !v)} className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-secondary">
                {showConnectedContext ? "Hide setup" : "Setup status"}
              </button>
            </div>
            {showConnectedContext && (
              <div className="border-t pt-3 space-y-3">
                {activeBodyCompPlan && bodyCompMetric && (
                  <BodyCompGoalCard plan={activeBodyCompPlan} metric={bodyCompMetric} />
                )}
                <NutritionSetupContextCard
                  hasMealPlan={hasMealPlan}
                  savedRecipeCount={recipes.length}
                  hasNutritionGoal={hasNutritionGoal}
                  activePlan={activeBodyCompPlan}
                  metric={bodyCompMetric}
                  goalsMatchPlan={!!goalsMatchPlan}
                  syncingTargets={syncGoalsMut.isPending}
                  onCreatePlan={() => setActiveSection("plan")}
                  onOpenSavedRecipes={openSavedRecipes}
                  onOpenRecipeLibrary={openRecipeLibrary}
                  onCreateGoal={() => setActiveSection("targets")}
                  onEditTargets={() => setActiveSection("targets")}
                  onSyncTargets={() => syncGoalsMut.mutate()}
                  onLogFood={() => openFoodLog()}
                />
              </div>
            )}
          </div>

          {/* ── Today at a glance ───────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: "Calories left", value: caloriesLeft, unit: "kcal", tone: "bg-primary/5 border-primary/20" },
              { label: "Protein left",  value: proteinLeft,  unit: "g",    tone: "bg-blue-500/5 border-blue-500/20" },
              { label: "Meals logged",  value: mealSlotsLogged, unit: "/ 4", tone: "bg-amber-500/5 border-amber-500/20" },
              { label: "Water left",    value: waterLeft,    unit: waterLeft === 1 ? "glass" : "glasses", tone: "bg-cyan-500/5 border-cyan-500/20" },
            ].map(item => (
              <div key={item.label} className={`rounded-xl border px-3 py-2.5 ${item.tone}`}>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{item.label}</p>
                <p className="text-lg font-bold leading-tight">
                  {item.value}
                  <span className="text-[11px] font-medium text-muted-foreground ml-1">{item.unit}</span>
                </p>
              </div>
            ))}
          </div>

          {/* ── Daily progress card: calories + macros + water ───────────── */}
          <div className="rounded-2xl border bg-card p-4 space-y-4">
            {/* Ring + macro bars */}
            <div className="flex items-center gap-5">
              {/* Calorie ring */}
              <div className="relative w-[76px] h-[76px] shrink-0">
                <svg className="w-[76px] h-[76px] -rotate-90" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="32" fill="none" stroke="currentColor" strokeOpacity="0.1" strokeWidth="9" />
                  <circle cx="40" cy="40" r="32" fill="none" stroke="hsl(var(--primary))" strokeWidth="9"
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference * (1 - calPct / 100)}
                    strokeLinecap="round" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-none gap-0.5">
                  <span className="text-[15px] font-bold">{Math.round(totals.calories)}</span>
                  <span className="text-[8px] text-muted-foreground">/ {g.calories}</span>
                  <span className="text-[8px] text-muted-foreground">kcal</span>
                </div>
              </div>
              {/* Macro bars */}
              <div className="flex-1 space-y-2.5">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold">Macros</p>
                  {goalsMatchPlan && (
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-700">From plan</span>
                  )}
                </div>
                {([
                  { label: "Protein", val: totals.protein, goal: g.protein, color: "bg-blue-500" },
                  { label: "Carbs",   val: totals.carbs,   goal: g.carbs,   color: "bg-amber-500" },
                  { label: "Fat",     val: totals.fat,     goal: g.fat,     color: "bg-rose-500" },
                ] as const).map(m => (
                  <div key={m.label}>
                    <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
                      <span>{m.label}</span>
                      <span>{Math.round(m.val)}g / {m.goal}g</span>
                    </div>
                    <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div className={`h-full ${m.color} rounded-full transition-all`}
                        style={{ width: `${Math.min(100, m.goal > 0 ? (m.val / m.goal) * 100 : 0)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* Water */}
            <div className="border-t pt-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold">💧 Water</p>
                <span className="text-xs text-muted-foreground">{waterGlasses} / {g.waterGlasses} glasses</span>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {Array.from({ length: g.waterGlasses }, (_, i) => (
                  <button key={i}
                    onClick={() => waterMut.mutate(i < waterGlasses ? i : i + 1)}
                    className={`text-lg transition-all ${i < waterGlasses ? "opacity-100" : "opacity-20 hover:opacity-60"}`}>
                    🥤
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Meal sections (always visible) ──────────────────────────── */}
          {(["breakfast", "lunch", "dinner", "snack"] as const).map(meal => {
            const mealEmoji  = { breakfast: "🌅", lunch: "☀️", dinner: "🌙", snack: "🍎" }[meal];
            const mealLabel  = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snacks" }[meal];
            const entries    = foodLog.filter(e => e.mealType === meal);
            const mealCals   = entries.reduce((s, e) => s + Number(e.calories) * Number(e.quantity), 0);
            function openLog() { setLogMealPreset(meal); setShowFoodLog(true); window.scrollTo({ top: 0, behavior: "smooth" }); }
            return (
              <div key={meal} className="rounded-2xl border bg-card overflow-hidden">
                {/* Meal header */}
                <div className="flex items-center justify-between px-4 py-3 border-b">
                  <div className="flex items-center gap-2">
                    <span className="text-base leading-none">{mealEmoji}</span>
                    <p className="text-sm font-semibold">{mealLabel}</p>
                    {entries.length > 0 && (
                      <span className="text-xs text-muted-foreground">· {Math.round(mealCals)} kcal</span>
                    )}
                  </div>
                  <button
                    onClick={openLog}
                    className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 px-2 py-1 rounded-lg hover:bg-primary/8 transition-colors"
                  >
                    <Plus size={13} /> Add
                  </button>
                </div>
                {/* Entries or empty state */}
                {entries.length === 0 ? (
                  <div className="px-4 py-5 flex flex-col items-center gap-1.5 text-center bg-secondary/10">
                    <p className="text-xs font-medium">No {mealLabel.toLowerCase()} logged</p>
                    <p className="text-[11px] text-muted-foreground max-w-xs">
                      Add it here so Today can keep calories, protein, and your next action accurate.
                    </p>
                    <button onClick={openLog} className="text-xs text-primary hover:underline font-semibold mt-1">
                      Log {mealLabel.toLowerCase()}
                    </button>
                  </div>
                ) : (
                  <div className="divide-y">
                    {entries.map(e => (
                      <div key={e.id} className="overflow-hidden">
                        {editingEntryId === e.id ? (
                          /* ── Inline edit form ── */
                          <div className="px-3 py-3 space-y-3">
                            <div className="flex items-center gap-2">
                              <input
                                className="flex-1 text-sm font-medium border rounded-md px-2 py-1.5 bg-background"
                                value={editForm.foodName}
                                onChange={ev => setEditForm(f => ({ ...f, foodName: ev.target.value }))}
                                placeholder="Food name"
                              />
                              <select
                                className="text-xs border rounded-md px-2 py-1.5 bg-background shrink-0"
                                value={editForm.mealType}
                                onChange={ev => setEditForm(f => ({ ...f, mealType: ev.target.value }))}
                              >
                                <option value="breakfast">Breakfast</option>
                                <option value="lunch">Lunch</option>
                                <option value="dinner">Dinner</option>
                                <option value="snack">Snack</option>
                              </select>
                            </div>
                            <div className="rounded-lg border bg-background overflow-hidden">
                              <div className="flex items-center justify-between px-3 py-2 border-b bg-secondary/20">
                                <p className="text-xs font-semibold">Ingredients</p>
                                {editIngredients.length > 0 && (
                                  <span className="text-[10px] text-muted-foreground">{editIngredients.length} item{editIngredients.length !== 1 ? "s" : ""}</span>
                                )}
                              </div>
                              {editIngredients.length === 0 && !editIngPending && editIngResults.length === 0 && (
                                <p className="text-xs text-muted-foreground text-center py-3 px-3">No ingredients saved — add some below or edit macros manually.</p>
                              )}
                              {editIngredients.map((ing, idx) => (
                                <div key={`${ing.id}-${idx}`} className="flex items-center gap-2 px-3 py-2.5 border-b last:border-b-0">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium truncate">{ing.name}</p>
                                    <p className="text-[10px] text-muted-foreground">
                                      {Math.round(ing.nutrients.calories * ing.qty)} kcal · P {Math.round(ing.nutrients.protein * ing.qty)}g · C {Math.round(ing.nutrients.carbs * ing.qty)}g · F {Math.round(ing.nutrients.fat * ing.qty)}g
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      onClick={() => setEditIngredients(arr => arr.map((x, i) => i === idx ? { ...x, qty: Math.max(0.25, parseFloat((x.qty - 0.5).toFixed(2))) } : x))}
                                      className="w-6 h-6 rounded-md border bg-secondary/50 hover:bg-secondary text-sm font-bold flex items-center justify-center leading-none"
                                    >−</button>
                                    <input
                                      type="number" min="0.25" step="0.25"
                                      value={ing.qty}
                                      onChange={ev => {
                                        const v = parseFloat(ev.target.value);
                                        if (!isNaN(v) && v > 0) setEditIngredients(arr => arr.map((x, i) => i === idx ? { ...x, qty: v } : x));
                                      }}
                                      className="w-12 text-xs text-center border rounded-md px-1 py-1 bg-background"
                                    />
                                    <button
                                      onClick={() => setEditIngredients(arr => arr.map((x, i) => i === idx ? { ...x, qty: parseFloat((x.qty + 0.5).toFixed(2)) } : x))}
                                      className="w-6 h-6 rounded-md border bg-secondary/50 hover:bg-secondary text-sm font-bold flex items-center justify-center leading-none"
                                    >+</button>
                                  </div>
                                  <button
                                    onClick={() => setEditIngredients(arr => arr.filter((_, i) => i !== idx))}
                                    className="text-muted-foreground hover:text-destructive shrink-0 p-0.5"
                                  ><X size={13} /></button>
                                </div>
                              ))}
                              {editIngPending && (
                                <div className="px-3 py-2.5 border-t bg-primary/5 space-y-2">
                                  <p className="text-xs font-medium truncate text-primary">{editIngPending.description}</p>
                                  <div className="flex items-center gap-2">
                                    <label className="text-[10px] text-muted-foreground shrink-0">Servings:</label>
                                    <input
                                      type="number" min="0.25" step="0.25"
                                      value={editIngPendingQty}
                                      onChange={ev => setEditIngPendingQty(parseFloat(ev.target.value) || 1)}
                                      className="w-16 text-xs border rounded-md px-2 py-1 bg-background"
                                    />
                                    <button
                                      onClick={() => {
                                        const n = editIngPending.foodNutrients || [];
                                        const get = (id: number) => (n.find((x: any) => x.nutrientId === id)?.value || 0);
                                        setEditIngredients(arr => [...arr, {
                                          id: editIngPending.fdcId,
                                          name: editIngPending.description,
                                          servingSize: editIngPending.servingSize || 100,
                                          servingUnit: editIngPending.servingUnit || "g",
                                          qty: editIngPendingQty,
                                          nutrients: {
                                            calories: get(1008), protein: get(1003), carbs: get(1005),
                                            fat: get(1004), fiber: get(1079), sugar: get(2000), sodium: get(1093),
                                          },
                                        }]);
                                        setEditIngPending(null); setEditIngPendingQty(1); setEditIngQuery(""); setEditIngResults([]);
                                      }}
                                      className="flex-1 text-xs font-semibold py-1 rounded-md bg-primary text-primary-foreground"
                                    >Add</button>
                                    <button onClick={() => setEditIngPending(null)} className="text-muted-foreground p-0.5"><X size={13} /></button>
                                  </div>
                                </div>
                              )}
                              {editIngResults.length > 0 && !editIngPending && (
                                <div className="border-t divide-y max-h-40 overflow-y-auto">
                                  {editIngResults.map((item: any) => (
                                    <button
                                      key={item.fdcId}
                                      onClick={() => { setEditIngPending(item); setEditIngPendingQty(1); }}
                                      className="w-full text-left px-3 py-2 hover:bg-secondary/40 text-xs"
                                    >
                                      <span className="font-medium block truncate">{item.description}</span>
                                      {item.brandName && <span className="text-muted-foreground text-[10px]">{item.brandName}</span>}
                                    </button>
                                  ))}
                                </div>
                              )}
                              {!editIngPending && (
                                <div className="flex items-center gap-1.5 px-3 py-2 border-t bg-secondary/10">
                                  <input
                                    className="flex-1 text-xs border rounded-md px-2 py-1.5 bg-background"
                                    placeholder="+ Search to add ingredient (USDA)…"
                                    value={editIngQuery}
                                    onChange={ev => { setEditIngQuery(ev.target.value); setEditIngResults([]); }}
                                    onKeyDown={ev => ev.key === "Enter" && doEditIngSearch()}
                                  />
                                  <button
                                    onClick={doEditIngSearch}
                                    disabled={editIngSearching || !editIngQuery.trim()}
                                    className="text-xs px-2.5 py-1.5 rounded-md bg-secondary text-foreground shrink-0 disabled:opacity-40"
                                  >{editIngSearching ? "…" : "Search"}</button>
                                </div>
                              )}
                            </div>
                            {editIngredients.length > 0 ? (
                              <div className="grid grid-cols-4 gap-1.5">
                                {([
                                  { key: "calories", label: "kcal", val: editForm.calories },
                                  { key: "protein",  label: "prot", val: editForm.protein  },
                                  { key: "carbs",    label: "carbs", val: editForm.carbs   },
                                  { key: "fat",      label: "fat",  val: editForm.fat      },
                                ] as const).map(({ key, label, val }) => (
                                  <div key={key} className="text-center rounded-md bg-secondary/30 py-1.5 px-1">
                                    <p className="text-sm font-bold">{Math.round(parseFloat(val) || 0)}</p>
                                    <p className="text-[10px] text-muted-foreground">{label}</p>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="grid grid-cols-4 gap-1.5">
                                {(["calories","protein","carbs","fat"] as const).map(field => (
                                  <div key={field}>
                                    <label className="text-[10px] text-muted-foreground font-medium">{field === "calories" ? "kcal" : field}</label>
                                    <input
                                      type="number" min="0" step="1"
                                      className="w-full text-sm border rounded-md px-2 py-1 bg-background mt-0.5"
                                      value={editForm[field]}
                                      onChange={ev => setEditForm(f => ({ ...f, [field]: ev.target.value }))}
                                    />
                                  </div>
                                ))}
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              <label className="text-xs text-muted-foreground shrink-0">Servings logged:</label>
                              <input
                                type="number" min="0.1" step="0.1"
                                className="w-20 text-sm border rounded-md px-2 py-1 bg-background"
                                value={editForm.quantity}
                                onChange={ev => setEditForm(f => ({ ...f, quantity: ev.target.value }))}
                              />
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => updateMut.mutate({ id: e.id, data: {
                                  foodName: editForm.foodName.trim(),
                                  quantity: parseFloat(editForm.quantity) || 1,
                                  mealType: editForm.mealType,
                                  calories: parseFloat(editForm.calories) || 0,
                                  protein:  parseFloat(editForm.protein)  || 0,
                                  carbs:    parseFloat(editForm.carbs)    || 0,
                                  fat:      parseFloat(editForm.fat)      || 0,
                                  ingredientsJson: editIngredients.length > 0 ? JSON.stringify(editIngredients) : null,
                                }})}
                                disabled={updateMut.isPending || !editForm.foodName.trim()}
                                className="flex-1 text-xs font-semibold py-2 rounded-md bg-primary text-primary-foreground disabled:opacity-50"
                              >
                                {updateMut.isPending ? "Saving…" : "Save changes"}
                              </button>
                              <button
                                onClick={() => setEditingEntryId(null)}
                                className="flex-1 text-xs font-medium py-2 rounded-md bg-secondary text-secondary-foreground"
                              >Cancel</button>
                            </div>
                          </div>
                        ) : (
                          /* ── Normal row ── */
                          <div className="flex items-center gap-2 px-4 py-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{e.foodName}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {e.quantity}× {e.servingSize}{e.servingUnit} · P {Math.round(Number(e.protein) * Number(e.quantity))}g · C {Math.round(Number(e.carbs) * Number(e.quantity))}g · F {Math.round(Number(e.fat) * Number(e.quantity))}g
                              </p>
                            </div>
                            <span className="text-sm font-semibold shrink-0">{Math.round(Number(e.calories) * Number(e.quantity))}</span>
                            <button onClick={() => openEditEntry(e)} className="text-muted-foreground hover:text-primary shrink-0"><Pencil size={13} /></button>
                            <button onClick={() => deleteMut.mutate(e.id)} className="text-muted-foreground hover:text-destructive shrink-0"><Trash2 size={13} /></button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          <button
            onClick={() => { setLogMealPreset("snack"); setShowFoodLog(true); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            className="fixed sm:hidden bottom-20 left-4 right-4 z-30 flex items-center justify-center gap-2 rounded-2xl bg-primary text-primary-foreground py-3 text-sm font-semibold shadow-lg"
          >
            <Plus size={16} /> Log Food
          </button>
        </div>
      )}

      {activeSection === "targets" && (
        <TargetsEditor
          goals={g}
          planTargets={planTargets}
          planName={activeBodyCompPlan?.name}
          goalsMatchPlan={!!goalsMatchPlan}
          onApplyPlan={() => syncGoalsMut.mutate()}
          onSave={async (data) => {
            await apiRequest("PATCH", "/api/nutrition/goals", data);
            qc.invalidateQueries({ queryKey: ["/api/nutrition/goals"] });
            toast({ title: "Targets saved" });
          }}
        />
      )}

      {activeSection === "insights" && (
        <WeeklyNutritionView weekDays={weekDays} weeklyByDate={weeklyByDate} goals={g} weeklyLog={weeklyLog} />
      )}

      {planMealItem && (
        <AddMealToPlanModal
          item={planMealItem}
          onClose={() => setPlanMealItem(null)}
          onOpenPlan={() => setActiveSection("plan")}
        />
      )}
      {friendAction && (
        <NutritionFriendActionModal
          mode={friendAction.mode}
          item={friendAction.item}
          friends={friends}
          isSending={sendNutritionShareMut.isPending}
          onClose={() => setFriendAction(null)}
          onSubmit={(friendId, note) => sendNutritionShareMut.mutate({ mode: friendAction.mode, item: friendAction.item, friendId, note })}
        />
      )}
    </div>
  );
}

// ── MAIN PAGE ──────────────────────────────────────────────────────────────────

const TABS = [
  { id: "medications", label: "Medications",    icon: Pill        },
  { id: "metrics",     label: "Health Metrics", icon: TrendingUp  },
  { id: "sleep",       label: "Sleep",          icon: Moon        },
  { id: "care_team",   label: "Care Team",      icon: Stethoscope },
];

export default function HealthPage() {
  const [activeTab, setActiveTab] = useState("medications");

  const { data: collabs = [] } = useQuery<TabCollaborationWithUser[]>({
    queryKey: ["/api/tab-collaborations"],
    queryFn: () => apiRequest("GET", "/api/tab-collaborations").then(r => r.json()),
  });
  const healthCollab = collabs.find(c => c.tabName === "health" && c.status === "accepted");

  return (
    <PageShell
      size="sm"
      title="Health"
      subtitle="Medications, metrics, sleep, and your care team"
      controls={
        <div className="flex gap-1.5 flex-wrap">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium transition-all ${
                  isActive
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                <Icon size={13} />
                {tab.label}
              </button>
            );
          })}
        </div>
      }
    >
      <div className="space-y-5">
      {/* Collaboration banner */}
      {healthCollab ? (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 text-sm text-emerald-800 dark:text-emerald-300">
          <Users size={14} className="shrink-0" />
          <span>
            Collaborating with <strong>{healthCollab.otherUser.name}</strong>
            {healthCollab.role === "collaborator" ? " — viewing their health data" : " — they can see your health data"}
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/50 border text-xs text-muted-foreground">
          <Activity size={12} className="shrink-0" />
          <span>Private — only you can see this tab. Share it with a friend via Settings → Collaboration.</span>
        </div>
      )}

      {/* Tab content */}
      {activeTab === "medications" && <MedicationsTab />}
      {activeTab === "metrics"     && <MetricsTab />}
      {activeTab === "sleep"       && <SleepTab />}
      {activeTab === "care_team"   && <CareTeamTab />}
      </div>
    </PageShell>
  );
}
