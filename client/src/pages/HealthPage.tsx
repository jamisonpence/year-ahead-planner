import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import BodyCompositionPlanSection from "@/components/BodyCompositionPlanSection";
import { format, parseISO, subDays, isBefore, isAfter, startOfDay } from "date-fns";
import {
  Activity, Pill, Moon, TrendingUp, Plus, Pencil, Trash2, X, Check,
  ChevronDown, ChevronUp, Star, Stethoscope, Phone, MapPin, CalendarCheck, CalendarClock,
  Users, UtensilsCrossed, Search, Loader2, Heart, Target, ArrowRight,
  BookOpen, Zap, BookMarked,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input as UIInput } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select as UISelect, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Medication, HealthMetric, SleepLog, CareProvider, TabCollaborationWithUser, FoodLogEntry, NutritionGoal, WorkoutPlan, Recipe, NutritionSummary } from "@shared/schema";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-card border rounded-2xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
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

// ── FoodSearchAdd (tabbed: Search / Quick Add / My Recipes) ───────────────
function FoodSearchAdd({ date, onAdded }: { date: string; onAdded: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [mode, setMode] = useState<"search" | "quick" | "recipes">("search");

  // ── Search tab state ───────────────────────────────────────────────────
  const [searchSource, setSearchSource] = useState<"usda" | "restaurant">("usda");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);
  const [searchMeal, setSearchMeal] = useState("snack");
  const [searchQty, setSearchQty] = useState(1);
  const [adding, setAdding] = useState(false);

  // FatSecret (restaurant) sub-state
  const [fsResults, setFsResults] = useState<any[]>([]);
  const [fsFood, setFsFood] = useState<any | null>(null);   // full food detail with servings
  const [fsServingIdx, setFsServingIdx] = useState(0);
  const [fsMeal, setFsMeal] = useState("snack");
  const [fsQty, setFsQty] = useState(1);
  const [fsAdding, setFsAdding] = useState(false);
  const [fsLoading, setFsLoading] = useState(false);

  // ── Recent/saved foods ─────────────────────────────────────────────────
  const [recentSelected, setRecentSelected] = useState<FoodLogEntry | null>(null);
  const [recentMeal, setRecentMeal] = useState("snack");
  const [recentQty, setRecentQty] = useState(1);
  const [recentAdding, setRecentAdding] = useState(false);

  const { data: foodHistory = [] } = useQuery<FoodLogEntry[]>({
    queryKey: ["/api/nutrition/food-log/history"],
    queryFn: () => apiRequest("GET", "/api/nutrition/food-log/history").then(r => r.json()),
  });

  // ── Quick Add tab state ────────────────────────────────────────────────
  const [qaName, setQaName] = useState("");
  const [qaServingSize, setQaServingSize] = useState("1");
  const [qaServingUnit, setQaServingUnit] = useState("serving");
  const [qaCals, setQaCals] = useState("");
  const [qaProt, setQaProt] = useState("");
  const [qaCarbs, setQaCarbs] = useState("");
  const [qaFat, setQaFat] = useState("");
  const [qaMeal, setQaMeal] = useState("snack");
  const [qaQty, setQaQty] = useState(1);
  const [qaSaveRecipe, setQaSaveRecipe] = useState(false);
  const [qaAdding, setQaAdding] = useState(false);

  // ── Ingredient builder (inside Quick Add) ─────────────────────────────
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
  const [recipeSearch, setRecipeSearch] = useState("");
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [recipeMeal, setRecipeMeal] = useState("snack");
  const [recipeQty, setRecipeQty] = useState(1);
  const [recipeAdding, setRecipeAdding] = useState(false);

  const { data: recipes = [] } = useQuery<Recipe[]>({
    queryKey: ["/api/recipes"],
    queryFn: () => apiRequest("GET", "/api/recipes").then(r => r.json()),
    enabled: mode === "recipes",
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

  // ── Quick Add handler ──────────────────────────────────────────────────
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

  const filteredRecipes = recipes.filter(r =>
    !recipeSearch || r.name.toLowerCase().includes(recipeSearch.toLowerCase())
  );

  const TAB_STYLES = (active: boolean) =>
    `flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
      active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
    }`;

  return (
    <div className="rounded-xl border bg-card p-3 space-y-3">
      {/* Tab bar */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold">Add Food</p>
        <div className="flex gap-1">
          <button className={TAB_STYLES(mode === "search")}  onClick={() => { setMode("search");  setSelected(null); setResults([]); }}>
            <Search size={10} /> Search
          </button>
          <button className={TAB_STYLES(mode === "quick")}   onClick={() => setMode("quick")}>
            <Zap size={10} /> Quick Add
          </button>
          <button className={TAB_STYLES(mode === "recipes")} onClick={() => { setMode("recipes"); setSelectedRecipe(null); }}>
            <BookOpen size={10} /> Recipes
          </button>
        </div>
      </div>

      {/* ── SEARCH TAB ─────────────────────────────────────────────── */}
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
          {!query && !selected && !recentSelected && foodHistory.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-0.5">Recently logged</p>
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
                <Button size="sm" variant="ghost" onClick={() => setRecentSelected(null)} className="h-7 text-xs">Cancel</Button>
              </div>
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

      {/* ── QUICK ADD TAB ──────────────────────────────────────────── */}
      {mode === "quick" && (
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

      {/* ── MY RECIPES TAB ─────────────────────────────────────────── */}
      {mode === "recipes" && (
        <div className="space-y-2">
          {!selectedRecipe ? (
            <>
              <UIInput
                value={recipeSearch}
                onChange={e => setRecipeSearch(e.target.value)}
                placeholder="Search your recipes…"
                className="h-8 text-sm"
              />
              {filteredRecipes.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <BookOpen size={24} className="mx-auto mb-2 opacity-20" />
                  <p className="text-xs">
                    {recipes.length === 0
                      ? "No recipes yet. Add some in the Recipes tab."
                      : "No recipes match your search."}
                  </p>
                </div>
              ) : (
                <div className="space-y-1 max-h-52 overflow-y-auto border rounded-lg p-1">
                  {filteredRecipes.map(recipe => {
                    let nutrition: NutritionSummary | null = null;
                    try { nutrition = recipe.nutritionData ? JSON.parse(recipe.nutritionData as string) : null; } catch {}
                    return (
                      <button key={recipe.id} onClick={() => setSelectedRecipe(recipe)}
                        className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-secondary/60 transition-colors">
                        <div className="flex items-center gap-2">
                          <span className="text-base leading-none">{recipe.emoji}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{recipe.name}</p>
                            {nutrition ? (
                              <p className="text-[10px] text-muted-foreground">
                                {Math.round(nutrition.calories)} kcal · P {Math.round(nutrition.protein)}g · C {Math.round(nutrition.carbs)}g · F {Math.round(nutrition.fat)}g per serving
                              </p>
                            ) : (
                              <p className="text-[10px] text-muted-foreground/60 italic">No nutrition data — will log as 0 kcal</p>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-2 pt-1 border-t">
              <div className="flex items-center gap-2">
                <span className="text-lg">{selectedRecipe.emoji}</span>
                <p className="text-xs font-semibold flex-1 truncate">{selectedRecipe.name}</p>
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
                    ⚠️ No nutrition data. Open the Recipes tab to estimate it, or it will log as 0 kcal.
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
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── GoalsEditor ──────────────────────────────────────────────────────────────
function GoalsEditor({ goals, onSave }: { goals: { calories: number; protein: number; carbs: number; fat: number; waterGlasses: number }; onSave: (d: { calories: number; protein: number; carbs: number; fat: number; waterGlasses: number }) => Promise<void> }) {
  const [cals,  setCals]  = useState(String(goals.calories));
  const [prot,  setProt]  = useState(String(goals.protein));
  const [carb,  setCarb]  = useState(String(goals.carbs));
  const [fat,   setFat]   = useState(String(goals.fat));
  const [water, setWater] = useState(String(goals.waterGlasses));
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3 max-w-sm">
      <p className="text-sm font-semibold">Daily Nutrition Goals</p>
      {[
        { label: "Calories (kcal)", val: cals, set: setCals },
        { label: "Protein (g)",     val: prot, set: setProt },
        { label: "Carbs (g)",       val: carb, set: setCarb },
        { label: "Fat (g)",         val: fat,  set: setFat  },
        { label: "Water (glasses)", val: water, set: setWater },
      ].map(f => (
        <div key={f.label} className="space-y-1">
          <Label className="text-xs">{f.label}</Label>
          <UIInput type="number" value={f.val} onChange={e => f.set(e.target.value)} className="h-8 text-sm" />
        </div>
      ))}
      <Button size="sm" disabled={saving} className="w-full" onClick={async () => {
        setSaving(true);
        await onSave({ calories: +cals, protein: +prot, carbs: +carb, fat: +fat, waterGlasses: +water });
        setSaving(false);
      }}>
        {saving ? <Loader2 size={13} className="animate-spin mr-1" /> : null}Save Goals
      </Button>
      <p className="text-[10px] text-muted-foreground">Defaults based on a 2,000 kcal diet. Customize to match your goals.</p>
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
  const daysWithData = weekDays.filter(d => (weeklyByDate[d] || 0) > 0);
  const avg = {
    calories: daysWithData.length ? daysWithData.reduce((s, d) => s + (weeklyByDate[d] || 0), 0) / daysWithData.length : 0,
    protein:  weeklyLog.reduce((s, e) => s + Number(e.protein) * Number(e.quantity), 0) / 7,
    carbs:    weeklyLog.reduce((s, e) => s + Number(e.carbs)   * Number(e.quantity), 0) / 7,
    fat:      weeklyLog.reduce((s, e) => s + Number(e.fat)     * Number(e.quantity), 0) / 7,
  };
  const bestDay = daysWithData.length ? daysWithData.reduce((best, d) => {
    return Math.abs((weeklyByDate[d] || 0) - goals.calories) < Math.abs((weeklyByDate[best] || 0) - goals.calories) ? d : best;
  }, daysWithData[0]) : null;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4">
        <p className="text-xs font-semibold mb-3">Calorie Intake — Last 7 Days</p>
        <div className="flex items-end gap-1.5" style={{ height: "96px" }}>
          {weekDays.map(d => {
            const cal = weeklyByDate[d] || 0;
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

// ── NutritionTab ─────────────────────────────────────────────────────────────
function NutritionTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const todayStr = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [activeSection, setActiveSection] = useState<"log" | "goals" | "plans" | "weekly">("log");

  const { data: foodLog = [] } = useQuery<FoodLogEntry[]>({
    queryKey: ["/api/nutrition/food-log", selectedDate],
    queryFn: () => apiRequest("GET", `/api/nutrition/food-log?date=${selectedDate}`).then(r => r.json()),
  });
  const { data: goalsData } = useQuery<{ calories: number; protein: number; carbs: number; fat: number; waterGlasses: number }>({
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
  const { data: workoutPlans = [] } = useQuery<WorkoutPlan[]>({
    queryKey: ["/api/workout-plans"],
    queryFn: () => apiRequest("GET", "/api/workout-plans").then(r => r.json()),
  });

  // Find a body composition plan — prefer active, fall back to most recent
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
      toast({ title: "Goals synced from active plan" });
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

  const calPct = Math.min(100, g.calories > 0 ? (totals.calories / g.calories) * 100 : 0);

  const waterMut = useMutation({
    mutationFn: (glasses: number) => apiRequest("POST", "/api/nutrition/water-log", { date: selectedDate, glasses }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/nutrition/water-log", selectedDate] }),
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/nutrition/food-log/${id}`).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/nutrition/food-log", selectedDate] }); toast({ title: "Entry removed" }); },
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

  return (
    <div className="space-y-5">
      {/* Section nav */}
      <div className="flex gap-2 flex-wrap">
        {(["log", "goals", "plans", "weekly"] as const).map(s => (
          <button key={s} onClick={() => setActiveSection(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              activeSection === s ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            }`}>
            {s === "log" ? "Food Log" : s === "goals" ? "Goals" : s === "plans" ? "Plans" : "Weekly"}
          </button>
        ))}
      </div>

      {activeSection === "log" && (
        <div className="space-y-4">
          {/* Body Composition Goal card — shown when an active body_composition workout plan exists */}
          {activeBodyCompPlan && bodyCompMetric && (
            <BodyCompGoalCard plan={activeBodyCompPlan} metric={bodyCompMetric} />
          )}

          {/* Date selector */}
          <div className="flex items-center gap-2">
            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
              className="text-sm border rounded-lg px-2 py-1 bg-background" />
            {selectedDate !== todayStr && (
              <button onClick={() => setSelectedDate(todayStr)} className="text-xs text-primary hover:underline">Today</button>
            )}
          </div>

          {/* Daily summary */}
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <div className="flex items-center gap-4">
              {/* Circular calorie gauge */}
              <div className="relative w-20 h-20 shrink-0">
                <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="32" fill="none" stroke="currentColor" strokeOpacity="0.1" strokeWidth="8" />
                  <circle cx="40" cy="40" r="32" fill="none" stroke="hsl(var(--primary))" strokeWidth="8"
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference * (1 - calPct / 100)}
                    strokeLinecap="round" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-base font-bold leading-none">{Math.round(totals.calories)}</span>
                  <span className="text-[9px] text-muted-foreground">/ {g.calories}</span>
                </div>
              </div>
              {/* Macro bars */}
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-xs font-medium text-muted-foreground">Today's Macros</p>
                  {goalsMatchPlan && (
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-700">
                      From plan
                    </span>
                  )}
                </div>
                {[
                  { label: "Protein", val: totals.protein, goal: g.protein, color: "bg-blue-500" },
                  { label: "Carbs",   val: totals.carbs,   goal: g.carbs,   color: "bg-amber-500" },
                  { label: "Fat",     val: totals.fat,     goal: g.fat,     color: "bg-rose-500" },
                ].map(m => (
                  <div key={m.label} className="space-y-0.5">
                    <div className="flex justify-between text-[10px] text-muted-foreground">
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
          </div>

          {/* Water tracker */}
          <div className="rounded-xl border bg-card p-3">
            <p className="text-xs font-semibold mb-2">💧 Water — {waterGlasses} of {g.waterGlasses} glasses</p>
            <div className="flex gap-1.5 flex-wrap">
              {Array.from({ length: g.waterGlasses }, (_, i) => (
                <button key={i}
                  onClick={() => waterMut.mutate(i < waterGlasses ? i : i + 1)}
                  className={`text-lg transition-all ${i < waterGlasses ? "opacity-100" : "opacity-25 hover:opacity-60"}`}>
                  🥤
                </button>
              ))}
            </div>
          </div>

          {/* Food search */}
          <FoodSearchAdd date={selectedDate} onAdded={() => {
            qc.invalidateQueries({ queryKey: ["/api/nutrition/food-log", selectedDate] });
            qc.invalidateQueries({ queryKey: ["/api/nutrition/food-log/week"] });
          }} />

          {/* Meal groups */}
          {(["breakfast","lunch","dinner","snack"] as const).map(meal => {
            const entries = foodLog.filter(e => e.mealType === meal);
            if (entries.length === 0) return null;
            const mealCals = entries.reduce((s, e) => s + Number(e.calories) * Number(e.quantity), 0);
            return (
              <div key={meal} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold capitalize text-muted-foreground">{meal}</p>
                  <span className="text-xs text-muted-foreground">{Math.round(mealCals)} kcal</span>
                </div>
                {entries.map(e => (
                  <div key={e.id} className="rounded-lg bg-secondary/30 border overflow-hidden">
                    {editingEntryId === e.id ? (
                      /* ── Inline edit form ── */
                      <div className="px-3 py-3 space-y-3">

                        {/* Row 1: name + meal inline */}
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

                        {/* ── Ingredients (main focus) ── */}
                        <div className="rounded-lg border bg-background overflow-hidden">
                          {/* Header */}
                          <div className="flex items-center justify-between px-3 py-2 border-b bg-secondary/20">
                            <p className="text-xs font-semibold">Ingredients</p>
                            {editIngredients.length > 0 && (
                              <span className="text-[10px] text-muted-foreground">{editIngredients.length} item{editIngredients.length !== 1 ? "s" : ""}</span>
                            )}
                          </div>

                          {/* Ingredient rows */}
                          {editIngredients.length === 0 && !editIngPending && editIngResults.length === 0 && (
                            <p className="text-xs text-muted-foreground text-center py-3 px-3">No ingredients saved — add some below or edit macros manually.</p>
                          )}
                          {editIngredients.map((ing, idx) => (
                            <div key={`${ing.id}-${idx}`} className="flex items-center gap-2 px-3 py-2.5 border-b last:border-b-0">
                              {/* Name + macro contribution */}
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium truncate">{ing.name}</p>
                                <p className="text-[10px] text-muted-foreground">
                                  {Math.round(ing.nutrients.calories * ing.qty)} kcal · P {Math.round(ing.nutrients.protein * ing.qty)}g · C {Math.round(ing.nutrients.carbs * ing.qty)}g · F {Math.round(ing.nutrients.fat * ing.qty)}g
                                </p>
                              </div>
                              {/* Qty stepper */}
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
                              {/* Remove */}
                              <button
                                onClick={() => setEditIngredients(arr => arr.filter((_, i) => i !== idx))}
                                className="text-muted-foreground hover:text-destructive shrink-0 p-0.5"
                              ><X size={13} /></button>
                            </div>
                          ))}

                          {/* Confirm pending ingredient */}
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

                          {/* USDA search results */}
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

                          {/* Add ingredient search bar */}
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

                        {/* Macros — auto-calculated summary when ingredients present, editable when not */}
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

                        {/* Serving quantity */}
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-muted-foreground shrink-0">Servings logged:</label>
                          <input
                            type="number" min="0.1" step="0.1"
                            className="w-20 text-sm border rounded-md px-2 py-1 bg-background"
                            value={editForm.quantity}
                            onChange={ev => setEditForm(f => ({ ...f, quantity: ev.target.value }))}
                          />
                        </div>

                        {/* Actions */}
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
                      <div className="flex items-center gap-2 px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{e.foodName}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {e.quantity}× {e.servingSize}{e.servingUnit} · P {Math.round(Number(e.protein) * Number(e.quantity))}g · C {Math.round(Number(e.carbs) * Number(e.quantity))}g · F {Math.round(Number(e.fat) * Number(e.quantity))}g
                          </p>
                        </div>
                        <span className="text-sm font-semibold shrink-0">{Math.round(Number(e.calories) * Number(e.quantity))}</span>
                        <button onClick={() => openEditEntry(e)} className="text-muted-foreground hover:text-primary shrink-0">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => deleteMut.mutate(e.id)} className="text-muted-foreground hover:text-destructive shrink-0">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
          {foodLog.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">No food logged yet. Use the search above to add meals.</div>
          )}
        </div>
      )}

      {activeSection === "goals" && (
        <div className="space-y-3">
          {/* Active plan sync banner */}
          {planTargets && (
            <div className={`rounded-xl border p-3 space-y-2.5 ${
              goalsMatchPlan
                ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800"
                : "bg-primary/5 border-primary/30"
            }`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Heart size={13} className={goalsMatchPlan ? "text-green-600 dark:text-green-400" : "text-primary"} />
                  <p className={`text-xs font-semibold ${goalsMatchPlan ? "text-green-700 dark:text-green-300" : "text-primary"}`}>
                    {goalsMatchPlan ? "Goals synced with active plan" : "Active plan suggests updated targets"}
                  </p>
                </div>
                {goalsMatchPlan && <Check size={14} className="text-green-600 dark:text-green-400 shrink-0" />}
              </div>
              <p className="text-xs text-muted-foreground font-medium">
                {activeBodyCompPlan!.name}
              </p>
              <div className="grid grid-cols-4 gap-1.5 text-center">
                {[
                  { label: "Calories", val: planTargets.calories, unit: "kcal", color: "text-primary" },
                  { label: "Protein",  val: planTargets.protein,  unit: "g",    color: "text-blue-600 dark:text-blue-400" },
                  { label: "Carbs",    val: planTargets.carbs,    unit: "g",    color: "text-amber-600 dark:text-amber-400" },
                  { label: "Fat",      val: planTargets.fat,      unit: "g",    color: "text-rose-600 dark:text-rose-400" },
                ].map(item => (
                  <div key={item.label} className="bg-background/60 rounded-lg py-1.5">
                    <p className={`text-sm font-bold ${item.color}`}>{item.val}<span className="text-[9px] font-normal ml-0.5">{item.unit}</span></p>
                    <p className="text-[9px] text-muted-foreground">{item.label}</p>
                  </div>
                ))}
              </div>
              {!goalsMatchPlan && (
                <Button
                  size="sm"
                  className="w-full h-8 gap-1.5 text-xs"
                  onClick={() => syncGoalsMut.mutate()}
                  disabled={syncGoalsMut.isPending}
                >
                  {syncGoalsMut.isPending
                    ? <Loader2 size={12} className="animate-spin" />
                    : <ArrowRight size={12} />}
                  Apply Plan Targets to My Goals
                </Button>
              )}
            </div>
          )}
          <GoalsEditor goals={g} onSave={async (data) => {
            await apiRequest("PATCH", "/api/nutrition/goals", data);
            qc.invalidateQueries({ queryKey: ["/api/nutrition/goals"] });
            toast({ title: "Goals saved" });
          }} />
        </div>
      )}

      {activeSection === "plans" && (
        <BodyCompositionPlanSection />
      )}

      {activeSection === "weekly" && (
        <WeeklyNutritionView weekDays={weekDays} weeklyByDate={weeklyByDate} goals={g} weeklyLog={weeklyLog} />
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
  { id: "nutrition",   label: "Nutrition",      icon: UtensilsCrossed },
];

export default function HealthPage() {
  const [activeTab, setActiveTab] = useState("medications");

  const { data: collabs = [] } = useQuery<TabCollaborationWithUser[]>({
    queryKey: ["/api/tab-collaborations"],
    queryFn: () => apiRequest("GET", "/api/tab-collaborations").then(r => r.json()),
  });
  const healthCollab = collabs.find(c => c.tabName === "health" && c.status === "accepted");

  return (
    <div className="p-3 sm:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center shrink-0">
          <Activity size={20} className="text-rose-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Health</h1>
          <p className="text-sm text-muted-foreground">Track medications, metrics, sleep, and your care team</p>
        </div>
      </div>

      {/* Collaboration banner */}
      {healthCollab ? (
        <div className="flex items-center gap-2 mb-5 px-3 py-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 text-sm text-emerald-800 dark:text-emerald-300">
          <Users size={14} className="shrink-0" />
          <span>
            Collaborating with <strong>{healthCollab.otherUser.name}</strong>
            {healthCollab.role === "collaborator" ? " — viewing their health data" : " — they can see your health data"}
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2 mb-5 px-3 py-2 rounded-lg bg-secondary/50 border text-xs text-muted-foreground">
          <Activity size={12} className="shrink-0" />
          <span>Private — only you can see this tab. Share it with a friend via Settings → Collaboration.</span>
        </div>
      )}

      {/* Sub-tabs */}
      <div className="flex gap-1.5 flex-wrap border-b pb-3 mb-6">
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

      {/* Tab content */}
      {activeTab === "medications" && <MedicationsTab />}
      {activeTab === "metrics"     && <MetricsTab />}
      {activeTab === "sleep"       && <SleepTab />}
      {activeTab === "care_team"   && <CareTeamTab />}
      {activeTab === "nutrition"   && <NutritionTab />}
    </div>
  );
}
