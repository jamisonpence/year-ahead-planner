import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, subDays, isBefore, isAfter, startOfDay } from "date-fns";
import {
  Activity, Pill, Moon, TrendingUp, Plus, Pencil, Trash2, X, Check,
  ChevronDown, ChevronUp, Star, Stethoscope, Phone, MapPin, CalendarCheck, CalendarClock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Medication, HealthMetric, SleepLog, CareProvider } from "@shared/schema";

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

// ── MAIN PAGE ──────────────────────────────────────────────────────────────────

const TABS = [
  { id: "medications", label: "Medications",    icon: Pill        },
  { id: "metrics",     label: "Health Metrics", icon: TrendingUp  },
  { id: "sleep",       label: "Sleep",          icon: Moon        },
  { id: "care_team",   label: "Care Team",      icon: Stethoscope },
];

export default function HealthPage() {
  const [activeTab, setActiveTab] = useState("medications");

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
    </div>
  );
}
