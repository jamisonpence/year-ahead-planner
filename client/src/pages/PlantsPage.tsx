import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Plant } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Leaf, Plus, Droplets, Sun, Pencil, Trash2, Search,
  Bell, BellOff, Clock, CheckCircle2, AlertTriangle, Loader2,
} from "lucide-react";

// ── Constants ────────────────────────────────────────────────────────────────

const LIGHT_NEEDS = [
  { value: "low",            label: "Low Light"       },
  { value: "medium",         label: "Medium Light"    },
  { value: "bright_indirect",label: "Bright Indirect" },
  { value: "direct",         label: "Direct Sun"      },
];

const LIGHT_COLORS: Record<string, string> = {
  low:             "bg-slate-100 text-slate-700",
  medium:          "bg-green-100 text-green-700",
  bright_indirect: "bg-yellow-100 text-yellow-700",
  direct:          "bg-orange-100 text-orange-700",
};

const CARD_COLORS = [
  "hsl(150 55% 40%)", "hsl(90 45% 42%)", "hsl(30 60% 48%)",
  "hsl(195 60% 42%)", "hsl(270 45% 50%)", "hsl(55 65% 45%)",
];

const EMPTY_FORM = {
  name: "",
  species: "",
  location: "",
  lightNeeds: "medium" as string,
  waterFrequencyDays: 7,
  soilType: "",
  notes: "",
  lastWatered: "",
  remindersEnabled: false,
  sortOrder: 0,
};

// ── Watering status helpers ──────────────────────────────────────────────────

function wateringStatus(plant: Plant): { label: string; daysUntil: number | null; color: string } {
  if (!plant.lastWatered) return { label: "Never watered", daysUntil: null, color: "text-muted-foreground" };
  const last = new Date(plant.lastWatered);
  const next = new Date(last.getTime() + plant.waterFrequencyDays * 86400000);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysUntil = Math.round((next.getTime() - today.getTime()) / 86400000);
  if (daysUntil < 0) {
    return { label: `Overdue by ${Math.abs(daysUntil)}d`, daysUntil, color: "text-red-600" };
  }
  if (daysUntil === 0) return { label: "Water today!", daysUntil, color: "text-amber-600" };
  if (daysUntil <= 2) return { label: `In ${daysUntil}d`, daysUntil, color: "text-amber-500" };
  return { label: `In ${daysUntil}d`, daysUntil, color: "text-green-600" };
}

// ── Perenual helpers ─────────────────────────────────────────────────────────

function mapWatering(w: string): number {
  const map: Record<string, number> = { frequent: 3, average: 7, minimum: 14, none: 30 };
  return map[w?.toLowerCase()] ?? 7;
}

function mapSunlight(arr: string[]): string {
  const s = (arr?.[0] ?? "").toLowerCase();
  if (s.includes("full sun")) return "direct";
  if (s.includes("part sun") || s.includes("part shade")) return "bright_indirect";
  if (s.includes("shade") || s.includes("filtered")) return "low";
  return "medium";
}

type PerenualResult = {
  id: number;
  common_name: string;
  scientific_name: string[];
  watering: string;
  sunlight: string[];
  cycle: string;
  default_image?: { medium_url?: string; small_url?: string; thumbnail?: string };
};

type PerenualDetail = PerenualResult & {
  description?: string;
  soil?: string[];
  care_level?: string;
};

function PerenualSearchModal({ open, onClose, onAdd }: {
  open: boolean;
  onClose: () => void;
  onAdd: (payload: any) => void;
}) {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PerenualResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<PerenualDetail | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [adding, setAdding] = useState(false);

  useEffect(() => { if (!open) { setQuery(""); setResults([]); setPreview(null); } }, [open]);

  async function doSearch() {
    if (!query.trim()) return;
    setLoading(true); setPreview(null);
    try {
      const r = await apiRequest("GET", `/api/perenual/search?q=${encodeURIComponent(query)}`);
      setResults(await r.json());
    } catch (e: any) {
      toast({ title: "Search failed", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }

  async function loadPreview(plant: PerenualResult) {
    setPreviewLoading(true); setPreview(null);
    try {
      const r = await apiRequest("GET", `/api/perenual/plant/${plant.id}`);
      setPreview(await r.json());
    } catch { setPreview(plant as PerenualDetail); }
    finally { setPreviewLoading(false); }
  }

  async function handleAdd() {
    if (!preview) return;
    setAdding(true);
    try {
      const payload = {
        name: preview.common_name,
        species: preview.scientific_name?.[0] ?? null,
        lightNeeds: mapSunlight(preview.sunlight ?? []),
        waterFrequencyDays: mapWatering(preview.watering),
        soilType: preview.soil?.join(", ") || null,
        notes: preview.description ? preview.description.slice(0, 500) : null,
        location: null, lastWatered: null, remindersEnabled: false, sortOrder: 0,
      };
      onAdd(payload);
      onClose();
    } finally { setAdding(false); }
  }

  const img = preview?.default_image?.medium_url ?? preview?.default_image?.small_url ?? null;

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Leaf size={16} className="text-green-600" /> Search Plants
          </DialogTitle>
        </DialogHeader>

        {/* Search bar */}
        <div className="px-5 pb-3 shrink-0 flex gap-2">
          <Input
            placeholder="Search by common name, e.g. Monstera, Lavender…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === "Enter" && doSearch()}
            className="text-sm"
          />
          <Button size="sm" onClick={doSearch} disabled={loading} className="shrink-0">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          </Button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Results list */}
          <div className={`overflow-y-auto px-3 pb-4 space-y-1 ${preview ? "w-72 border-r shrink-0" : "flex-1 px-5"}`}>
            {results.length === 0 && !loading && (
              <p className="text-center text-xs text-muted-foreground pt-6 px-4">
                {query ? "No results found" : "Search for a plant to see results from the Perenual database"}
              </p>
            )}
            {results.map(p => (
              <button
                key={p.id}
                onClick={() => loadPreview(p)}
                className={`w-full text-left flex items-center gap-3 p-2.5 rounded-lg border transition-colors ${preview?.id === p.id ? "bg-primary/5 border-primary/30" : "bg-card hover:bg-muted/40 border-transparent"}`}
              >
                {p.default_image?.thumbnail ? (
                  <img src={p.default_image.thumbnail} alt="" className="w-9 h-9 rounded object-cover shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded bg-green-100 flex items-center justify-center shrink-0">
                    <Leaf size={14} className="text-green-600" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{p.common_name}</p>
                  <p className="text-xs text-muted-foreground truncate italic">{p.scientific_name?.[0]}</p>
                </div>
              </button>
            ))}
          </div>

          {/* Preview panel */}
          {(preview || previewLoading) && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {previewLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 size={20} className="animate-spin text-muted-foreground" />
                </div>
              ) : preview && (
                <>
                  {img && <img src={img} alt={preview.common_name} className="w-full h-36 object-cover rounded-lg" />}
                  <div>
                    <h3 className="font-semibold text-base">{preview.common_name}</h3>
                    {preview.scientific_name?.[0] && <p className="text-xs text-muted-foreground italic">{preview.scientific_name[0]}</p>}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-muted/50 rounded-lg p-2.5">
                      <p className="font-medium text-muted-foreground mb-0.5">Watering</p>
                      <p className="font-semibold">{preview.watering ?? "—"}</p>
                      <p className="text-muted-foreground">every ~{mapWatering(preview.watering)} days</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-2.5">
                      <p className="font-medium text-muted-foreground mb-0.5">Sunlight</p>
                      <p className="font-semibold capitalize">{preview.sunlight?.[0] ?? "—"}</p>
                    </div>
                    {preview.cycle && (
                      <div className="bg-muted/50 rounded-lg p-2.5">
                        <p className="font-medium text-muted-foreground mb-0.5">Cycle</p>
                        <p className="font-semibold">{preview.cycle}</p>
                      </div>
                    )}
                    {preview.care_level && (
                      <div className="bg-muted/50 rounded-lg p-2.5">
                        <p className="font-medium text-muted-foreground mb-0.5">Care Level</p>
                        <p className="font-semibold">{preview.care_level}</p>
                      </div>
                    )}
                    {preview.soil && preview.soil.length > 0 && (
                      <div className="bg-muted/50 rounded-lg p-2.5 col-span-2">
                        <p className="font-medium text-muted-foreground mb-0.5">Soil</p>
                        <p className="font-semibold">{preview.soil.join(", ")}</p>
                      </div>
                    )}
                  </div>
                  {preview.description && (
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4">{preview.description}</p>
                  )}
                  <Button className="w-full" size="sm" onClick={handleAdd} disabled={adding}>
                    {adding ? <Loader2 size={13} className="animate-spin mr-1.5" /> : <Plus size={13} className="mr-1.5" />}
                    Add to My Plants
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export default function PlantsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [perenualOpen, setPerenualOpen] = useState(false);
  const [editing, setEditing] = useState<Plant | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const { data: plants = [] } = useQuery<Plant[]>({ queryKey: ["/api/plants"] });

  const createMut = useMutation({
    mutationFn: (d: any) => apiRequest("POST", "/api/plants", d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/plants"] }); closeModal(); },
    onError: () => toast({ title: "Error saving plant", variant: "destructive" }),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: number; d: any }) => apiRequest("PATCH", `/api/plants/${id}`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/plants"] }); closeModal(); },
    onError: () => toast({ title: "Error updating plant", variant: "destructive" }),
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/plants/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/plants"] }),
  });

  function openAdd() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setModalOpen(true);
  }
  function openEdit(p: Plant) {
    setEditing(p);
    setForm({
      name: p.name,
      species: p.species ?? "",
      location: p.location ?? "",
      lightNeeds: p.lightNeeds,
      waterFrequencyDays: p.waterFrequencyDays,
      soilType: p.soilType ?? "",
      notes: p.notes ?? "",
      lastWatered: p.lastWatered ?? "",
      remindersEnabled: p.remindersEnabled,
      sortOrder: p.sortOrder,
    });
    setModalOpen(true);
  }
  function closeModal() { setModalOpen(false); setEditing(null); }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      ...form,
      waterFrequencyDays: Number(form.waterFrequencyDays),
      lastWatered: form.lastWatered || null,
      species: form.species || null,
      location: form.location || null,
      soilType: form.soilType || null,
      notes: form.notes || null,
    };
    if (editing) {
      updateMut.mutate({ id: editing.id, d: payload });
    } else {
      createMut.mutate(payload);
    }
  }

  function waterNow(plant: Plant) {
    const today = new Date().toISOString().slice(0, 10);
    updateMut.mutate({ id: plant.id, d: { lastWatered: today } });
    toast({ title: `Watered "${plant.name}"!` });
  }

  const filtered = useMemo(() =>
    plants.filter((p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.species ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (p.location ?? "").toLowerCase().includes(search.toLowerCase())
    ), [plants, search]);

  const sorted = useMemo(() =>
    [...filtered].sort((a, b) => {
      const sa = wateringStatus(a);
      const sb = wateringStatus(b);
      const da = sa.daysUntil ?? 999;
      const db = sb.daysUntil ?? 999;
      return da - db;
    }), [filtered]);

  const overdueCount = plants.filter(p => {
    const s = wateringStatus(p);
    return s.daysUntil !== null && s.daysUntil < 0;
  }).length;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Leaf className="text-green-600" size={24} />
          <h1 className="text-2xl font-bold">Plants</h1>
          {overdueCount > 0 && (
            <Badge variant="destructive" className="ml-1">
              {overdueCount} overdue
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search plants..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 w-52 h-9"
            />
          </div>
          <Button size="sm" variant="outline" onClick={() => setPerenualOpen(true)} className="gap-1.5">
            <Search size={14} /> Search
          </Button>
          <Button size="sm" onClick={openAdd}>
            <Plus size={15} className="mr-1" /> Add Plant
          </Button>
        </div>
      </div>

      {plants.length === 0 && (
        <div className="text-center py-16 text-muted-foreground space-y-2">
          <Leaf size={40} className="mx-auto text-muted-foreground/30" />
          <p className="font-medium">No plants yet</p>
          <p className="text-sm">Add your first plant to start tracking care schedules.</p>
          <Button variant="outline" size="sm" onClick={openAdd} className="mt-2">
            <Plus size={14} className="mr-1" /> Add Plant
          </Button>
        </div>
      )}

      {sorted.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sorted.map((plant) => {
            const ws = wateringStatus(plant);
            const colorIdx = plant.id % CARD_COLORS.length;
            const accentColor = CARD_COLORS[colorIdx];
            return (
              <div key={plant.id} className="rounded-xl border bg-card shadow-sm overflow-hidden flex flex-col">
                <div className="h-1.5 w-full" style={{ background: accentColor }} />
                <div className="p-4 flex flex-col gap-2 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-sm leading-tight truncate">{plant.name}</h3>
                      {plant.species && (
                        <p className="text-xs text-muted-foreground italic truncate">{plant.species}</p>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => openEdit(plant)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Edit">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => deleteMut.mutate(plant.id)} className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors" title="Delete">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${LIGHT_COLORS[plant.lightNeeds] ?? "bg-muted text-muted-foreground"}`}>
                      <Sun size={10} className="inline mr-0.5 -mt-0.5" />
                      {LIGHT_NEEDS.find(l => l.value === plant.lightNeeds)?.label ?? plant.lightNeeds}
                    </span>
                    {plant.location && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{plant.location}</span>
                    )}
                    {plant.remindersEnabled && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
                        <Bell size={10} className="inline mr-0.5 -mt-0.5" />Reminders on
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-auto pt-2 border-t">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Droplets size={11} />Every {plant.waterFrequencyDays}d
                      </span>
                      <span className={`text-xs font-medium flex items-center gap-1 ${ws.color}`}>
                        {ws.daysUntil !== null && ws.daysUntil < 0 && <AlertTriangle size={11} />}
                        {ws.daysUntil === 0 && <Clock size={11} />}
                        {ws.daysUntil !== null && ws.daysUntil > 0 && <CheckCircle2 size={11} />}
                        {ws.label}
                      </span>
                    </div>
                    <button onClick={() => waterNow(plant)} className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors font-medium">
                      <Droplets size={12} /> Water now
                    </button>
                  </div>
                  {plant.notes && (
                    <p className="text-xs text-muted-foreground border-t pt-2 line-clamp-2">{plant.notes}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <PerenualSearchModal
        open={perenualOpen}
        onClose={() => setPerenualOpen(false)}
        onAdd={(payload) => createMut.mutate(payload)}
      />

      <Dialog open={modalOpen} onOpenChange={(o) => { if (!o) closeModal(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Plant" : "Add Plant"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Name *</label>
              <Input required placeholder="e.g. Monstera" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Species</label>
              <Input placeholder="e.g. Monstera deliciosa" value={form.species} onChange={(e) => setForm({ ...form, species: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Location</label>
              <Input placeholder="e.g. Living room, Kitchen windowsill" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Light Needs</label>
              <Select value={form.lightNeeds} onValueChange={(v) => setForm({ ...form, lightNeeds: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LIGHT_NEEDS.map((l) => (<SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Water Every (days)</label>
              <Input type="number" min={1} max={90} value={form.waterFrequencyDays} onChange={(e) => setForm({ ...form, waterFrequencyDays: +e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Soil Type</label>
              <Input placeholder="e.g. Well-draining potting mix" value={form.soilType} onChange={(e) => setForm({ ...form, soilType: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Last Watered</label>
              <Input type="date" value={form.lastWatered} onChange={(e) => setForm({ ...form, lastWatered: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Notes</label>
              <Textarea placeholder="Care tips, fertilizing schedule, observations..." rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="flex items-center gap-3 py-1">
              <button type="button" onClick={() => setForm({ ...form, remindersEnabled: !form.remindersEnabled })}
                className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border transition-colors ${form.remindersEnabled ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-muted border-border text-muted-foreground"}`}>
                {form.remindersEnabled ? <Bell size={14} /> : <BellOff size={14} />}
                Reminders {form.remindersEnabled ? "on" : "off"}
              </button>
              <span className="text-xs text-muted-foreground">Watering reminders (coming soon)</span>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" onClick={closeModal}>Cancel</Button>
              <Button type="submit" disabled={createMut.isPending || updateMut.isPending}>
                {editing ? "Save Changes" : "Add Plant"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
