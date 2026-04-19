import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Spot } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  MapPin, Plus, Pencil, Trash2, Search, Heart,
  Globe, Clock, Tag, Navigation,
} from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────

const SPOT_TYPES = [
  { value: "restaurant", label: "Restaurant",  emoji: "🍽️" },
  { value: "bar",        label: "Bar",          emoji: "🍺" },
  { value: "cafe",       label: "Café",         emoji: "☕" },
  { value: "park",       label: "Park",         emoji: "🌳" },
  { value: "trail",      label: "Trail",        emoji: "🥾" },
  { value: "shop",       label: "Shop",         emoji: "🛍️" },
  { value: "service",    label: "Service",      emoji: "🔧" },
  { value: "attraction", label: "Attraction",   emoji: "🎡" },
  { value: "hotel",      label: "Hotel",        emoji: "🏨" },
  { value: "other",      label: "Other",        emoji: "📍" },
];

const SPOT_STATUSES = [
  { value: "want_to_visit", label: "Want to Visit" },
  { value: "visited",       label: "Visited"       },
  { value: "favorite",      label: "Favorite"      },
];

const STATUS_COLORS: Record<string, string> = {
  want_to_visit: "bg-blue-100 text-blue-700",
  visited:       "bg-green-100 text-green-700",
  favorite:      "bg-pink-100 text-pink-700",
};

const PRICE_LABELS = ["", "$", "$$", "$$$", "$$$$"];

const EMPTY_FORM = {
  name: "", type: "restaurant", address: "", neighborhood: "", city: "",
  status: "want_to_visit", rating: "" as string | number, notes: "", website: "",
  priceRange: "" as string | number, tags: "", visitedDate: "", isFavorite: false, openingHours: "",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function typeEmoji(type: string) {
  return SPOT_TYPES.find((t) => t.value === type)?.emoji ?? "📍";
}
function typeLabel(type: string) {
  return SPOT_TYPES.find((t) => t.value === type)?.label ?? type;
}

function StarRating({ value, onChange, readonly = false }: { value: number | null; onChange?: (v: number) => void; readonly?: boolean }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" disabled={readonly}
          onClick={() => onChange?.(n)}
          className={`text-sm transition-colors ${readonly ? "cursor-default" : "cursor-pointer hover:text-yellow-400"} ${(value ?? 0) >= n ? "text-yellow-400" : "text-muted-foreground/30"}`}>
          ★
        </button>
      ))}
    </div>
  );
}

// ── Spot Card ─────────────────────────────────────────────────────────────────

function SpotCard({ spot, onEdit, onDelete, onToggleFav }: {
  spot: Spot;
  onEdit: () => void;
  onDelete: () => void;
  onToggleFav: () => void;
}) {
  const tags = (spot.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  const location = [spot.neighborhood, spot.city].filter(Boolean).join(", ");

  return (
    <div className="p-4 rounded-lg border bg-card space-y-2 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <span className="text-xl shrink-0 mt-0.5">{typeEmoji(spot.type)}</span>
          <div className="min-w-0">
            <p className="font-medium text-sm leading-tight">{spot.name}</p>
            {location && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Navigation size={10} />{location}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onToggleFav} className={`p-1.5 rounded transition-colors ${spot.isFavorite ? "text-pink-500" : "text-muted-foreground/40 hover:text-pink-400"}`}>
            <Heart size={14} fill={spot.isFavorite ? "currentColor" : "none"} />
          </button>
          <button onClick={onEdit} className="p-1.5 rounded hover:bg-secondary transition-colors"><Pencil size={13} /></button>
          <button onClick={onDelete} className="p-1.5 rounded hover:bg-destructive/10 hover:text-destructive transition-colors"><Trash2 size={13} /></button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline" className="text-xs">{typeLabel(spot.type)}</Badge>
        <Badge className={`text-xs ${STATUS_COLORS[spot.status]}`}>{SPOT_STATUSES.find((s) => s.value === spot.status)?.label}</Badge>
        {spot.priceRange && <span className="text-xs font-medium text-muted-foreground">{PRICE_LABELS[spot.priceRange]}</span>}
        {tags.map((t) => <Badge key={t} variant="secondary" className="text-xs"><Tag size={10} className="mr-0.5" />{t}</Badge>)}
      </div>

      {spot.rating != null && <StarRating value={spot.rating} readonly />}

      <div className="text-xs text-muted-foreground space-y-0.5">
        {spot.address && <p className="flex items-center gap-1"><MapPin size={10} />{spot.address}</p>}
        {spot.openingHours && <p className="flex items-center gap-1"><Clock size={10} />{spot.openingHours}</p>}
        {spot.website && (
          <a href={spot.website.startsWith("http") ? spot.website : `https://${spot.website}`}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-blue-500 hover:underline">
            <Globe size={10} />{spot.website}
          </a>
        )}
        {spot.visitedDate && <p>Visited: {new Date(spot.visitedDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>}
      </div>

      {spot.notes && <p className="text-xs text-muted-foreground border-t pt-1">{spot.notes}</p>}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SpotsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterTag, setFilterTag] = useState("all");
  const [filterCity, setFilterCity] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Spot | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [activeTab, setActiveTab] = useState("all");

  const { data: spots = [] } = useQuery<Spot[]>({ queryKey: ["/api/spots"] });

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    spots.forEach((s) => s.tags?.split(",").map((t) => t.trim()).filter(Boolean).forEach((t) => tags.add(t)));
    return Array.from(tags).sort();
  }, [spots]);

  const allCities = useMemo(() => {
    const cities = new Set<string>();
    spots.forEach((s) => { if (s.city) cities.add(s.city); });
    return Array.from(cities).sort();
  }, [spots]);

  const createMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/spots", data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/spots"] }); closeModal(); toast({ title: "Spot added" }); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/spots/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/spots"] }); closeModal(); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/spots/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/spots"] }); toast({ title: "Spot removed" }); },
  });
  const favMut = useMutation({
    mutationFn: ({ id, isFavorite }: { id: number; isFavorite: boolean }) => apiRequest("PATCH", `/api/spots/${id}`, { isFavorite }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/spots"] }),
  });

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setModalOpen(true); }
  function openEdit(s: Spot) {
    setEditing(s);
    setForm({
      name: s.name, type: s.type, address: s.address ?? "", neighborhood: s.neighborhood ?? "",
      city: s.city ?? "", status: s.status, rating: s.rating ?? "",
      notes: s.notes ?? "", website: s.website ?? "", priceRange: s.priceRange ?? "",
      tags: s.tags ?? "", visitedDate: s.visitedDate ?? "", isFavorite: s.isFavorite,
      openingHours: s.openingHours ?? "",
    });
    setModalOpen(true);
  }
  function closeModal() { setModalOpen(false); setEditing(null); }

  function handleSave() {
    const payload = {
      ...form,
      rating: form.rating !== "" ? Number(form.rating) : null,
      priceRange: form.priceRange !== "" ? Number(form.priceRange) : null,
      visitedDate: form.visitedDate || null,
    };
    if (editing) updateMut.mutate({ id: editing.id, data: payload });
    else createMut.mutate(payload);
  }

  function applyFilters(list: Spot[]) {
    return list.filter((s) => {
      const matchSearch = s.name.toLowerCase().includes(search.toLowerCase()) ||
        (s.city ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (s.neighborhood ?? "").toLowerCase().includes(search.toLowerCase());
      const matchType = filterType === "all" || s.type === filterType;
      const matchStatus = filterStatus === "all" || s.status === filterStatus;
      const matchTag = filterTag === "all" || (s.tags ?? "").split(",").map((t) => t.trim()).includes(filterTag);
      const matchCity = filterCity === "all" || s.city === filterCity;
      return matchSearch && matchType && matchStatus && matchTag && matchCity;
    });
  }

  const tabSpots: Record<string, Spot[]> = {
    all:           applyFilters(spots),
    want_to_visit: applyFilters(spots.filter((s) => s.status === "want_to_visit")),
    visited:       applyFilters(spots.filter((s) => s.status === "visited")),
    favorites:     applyFilters(spots.filter((s) => s.isFavorite)),
  };

  const displaySpots = tabSpots[activeTab] ?? [];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <MapPin size={22} className="text-primary" />
          <div>
            <h1 className="text-xl font-bold">Spots</h1>
            <p className="text-sm text-muted-foreground">Places to visit & explore</p>
          </div>
        </div>
        <Button size="sm" onClick={openNew}><Plus size={14} className="mr-1" />Add Spot</Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-4">
        <TabsList>
          <TabsTrigger value="all">All <span className="ml-1 text-xs text-muted-foreground">({spots.length})</span></TabsTrigger>
          <TabsTrigger value="want_to_visit">Want to Visit <span className="ml-1 text-xs text-muted-foreground">({spots.filter((s) => s.status === "want_to_visit").length})</span></TabsTrigger>
          <TabsTrigger value="visited">Visited <span className="ml-1 text-xs text-muted-foreground">({spots.filter((s) => s.status === "visited").length})</span></TabsTrigger>
          <TabsTrigger value="favorites"><Heart size={12} className="inline mr-1" />Favorites <span className="ml-1 text-xs text-muted-foreground">({spots.filter((s) => s.isFavorite).length})</span></TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input className="pl-8 h-9 w-52" placeholder="Search spots…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {SPOT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.emoji} {t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {allCities.length > 0 && (
          <Select value={filterCity} onValueChange={setFilterCity}>
            <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All cities</SelectItem>
              {allCities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
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

      {/* Results */}
      {displaySpots.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <MapPin size={36} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No spots yet. Start adding places!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {displaySpots.map((spot) => (
            <SpotCard
              key={spot.id}
              spot={spot}
              onEdit={() => openEdit(spot)}
              onDelete={() => deleteMut.mutate(spot.id)}
              onToggleFav={() => favMut.mutate({ id: spot.id, isFavorite: !spot.isFavorite })}
            />
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Spot" : "Add Spot"}</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Name *</label>
              <Input placeholder="e.g. The Golden Road" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Type</label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SPOT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.emoji} {t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SPOT_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Address</label>
              <Input placeholder="123 Main St" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Neighborhood</label>
                <Input placeholder="e.g. East Side" value={form.neighborhood} onChange={(e) => setForm({ ...form, neighborhood: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">City</label>
                <Input placeholder="e.g. Austin" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Price Range</label>
                <Select value={form.priceRange !== "" ? String(form.priceRange) : "_none"} onValueChange={(v) => setForm({ ...form, priceRange: v === "_none" ? "" : Number(v) })}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">None</SelectItem>
                    <SelectItem value="1">$ · Budget</SelectItem>
                    <SelectItem value="2">$$ · Moderate</SelectItem>
                    <SelectItem value="3">$$$ · Upscale</SelectItem>
                    <SelectItem value="4">$$$$ · Fine Dining</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Rating</label>
                <div className="mt-1.5">
                  <StarRating
                    value={form.rating !== "" ? Number(form.rating) : null}
                    onChange={(v) => setForm({ ...form, rating: v })}
                  />
                </div>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Website</label>
              <Input placeholder="https://…" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Hours</label>
              <Input placeholder="e.g. Mon–Fri 9am–10pm" value={form.openingHours} onChange={(e) => setForm({ ...form, openingHours: e.target.value })} />
            </div>
            {(form.status === "visited" || form.status === "favorite") && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Date Visited</label>
                <Input type="date" value={form.visitedDate} onChange={(e) => setForm({ ...form, visitedDate: e.target.value })} />
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Tags (comma-separated)</label>
              <Input placeholder="e.g. Date Night, Kid-Friendly, Dog-Friendly" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes</label>
              <Textarea rows={2} placeholder="What you liked, what to order, tips…" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="spotFav" checked={form.isFavorite} onChange={(e) => setForm({ ...form, isFavorite: e.target.checked })} className="rounded" />
              <label htmlFor="spotFav" className="text-sm flex items-center gap-1"><Heart size={13} className="text-pink-500" />Mark as Favorite</label>
            </div>
            <div className="flex gap-2 pt-1">
              <Button className="flex-1" onClick={handleSave} disabled={!form.name.trim()}>{editing ? "Save" : "Add Spot"}</Button>
              <Button variant="outline" onClick={closeModal}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
