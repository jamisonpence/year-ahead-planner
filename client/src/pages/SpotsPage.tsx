import { useState, useMemo, useRef, useEffect } from "react";
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
  Globe, Clock, Tag, Navigation, Upload, Download, HelpCircle, Loader2,
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

// ── Nominatim types ───────────────────────────────────────────────────────────

type NominatimResult = {
  place_id: number;
  display_name: string;
  name?: string;
  type: string;
  class: string;
  lat: string;
  lon: string;
  address?: {
    road?: string; house_number?: string;
    suburb?: string; neighbourhood?: string; quarter?: string;
    city?: string; town?: string; village?: string; municipality?: string;
    state?: string; postcode?: string; country?: string;
  };
  extratags?: {
    website?: string; "contact:website"?: string;
    opening_hours?: string; phone?: string; cuisine?: string;
  };
};

/** Map Nominatim type/class → our SPOT_TYPES value */
function nominatimToSpotType(cls: string, type: string): string {
  const t = type.toLowerCase();
  const c = cls.toLowerCase();
  if (t === "restaurant" || t === "fast_food" || t === "food_court") return "restaurant";
  if (t === "bar" || t === "pub" || t === "biergarten" || t === "nightclub") return "bar";
  if (t === "cafe" || t === "coffee_shop" || t === "tea") return "cafe";
  if (t === "park" || t === "nature_reserve" || t === "garden") return "park";
  if (t === "trail" || t === "footway" || t === "path" || t === "cycleway") return "trail";
  if (t === "hotel" || t === "motel" || t === "hostel" || t === "guest_house" || t === "chalet") return "hotel";
  if (c === "shop" || t === "supermarket" || t === "convenience" || t === "mall") return "shop";
  if (t === "museum" || t === "gallery" || t === "theatre" || t === "cinema" || t === "theme_park" || t === "attraction") return "attraction";
  if (t === "hospital" || t === "dentist" || t === "doctors" || t === "pharmacy" || t === "laundry" || t === "bank") return "service";
  return "other";
}

/** Build a clean address string from Nominatim address components */
function buildAddress(addr: NominatimResult["address"]): string {
  if (!addr) return "";
  const parts: string[] = [];
  if (addr.house_number && addr.road) parts.push(`${addr.house_number} ${addr.road}`);
  else if (addr.road) parts.push(addr.road);
  return parts.join(", ");
}

function buildCity(addr: NominatimResult["address"]): string {
  return addr?.city ?? addr?.town ?? addr?.village ?? addr?.municipality ?? "";
}

function buildNeighborhood(addr: NominatimResult["address"]): string {
  return addr?.suburb ?? addr?.neighbourhood ?? addr?.quarter ?? "";
}

// ── Nominatim Search Modal ────────────────────────────────────────────────────

function NominatimSearchModal({ open, onClose, onSelect }: {
  open: boolean;
  onClose: () => void;
  onSelect: (form: Partial<typeof EMPTY_FORM>) => void;
}) {
  const [query, setQuery] = useState("");
  const [near, setNear] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<NominatimResult | null>(null);
  const queryRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Nominatim-friendly search terms per category
  const CATEGORY_SEARCH_TERMS: Record<string, string> = {
    restaurant: "restaurant",
    bar: "bar pub",
    cafe: "cafe coffee shop",
    park: "park",
    trail: "trail hiking path",
    shop: "shop store",
    service: "service",
    attraction: "attraction museum",
    hotel: "hotel",
    other: "",
  };

  useEffect(() => {
    if (!open) { setQuery(""); setNear(""); setCategoryFilter(null); setResults([]); setSelected(null); }
    else setTimeout(() => queryRef.current?.focus(), 80);
  }, [open]);

  async function doSearch(q: string, nearVal: string, cat: string | null) {
    // Use category label as query if query is empty and a category is selected
    const searchTerm = q.trim() || (cat ? (CATEGORY_SEARCH_TERMS[cat] ?? cat) : "");
    if (!searchTerm) { setResults([]); return; }
    setLoading(true); setSelected(null);
    try {
      const combined = nearVal.trim() ? `${searchTerm} ${nearVal.trim()}` : searchTerm;
      const r = await apiRequest("GET", `/api/nominatim/search?q=${encodeURIComponent(combined)}`);
      const data: NominatimResult[] = await r.json();
      setResults(data);
    } catch {
      setResults([]);
    } finally { setLoading(false); }
  }

  function scheduleSearch(q: string, nearVal: string, cat: string | null) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(q, nearVal, cat), 480);
  }

  function handleQueryChange(val: string) {
    setQuery(val);
    scheduleSearch(val, near, categoryFilter);
  }

  function handleNearChange(val: string) {
    setNear(val);
    scheduleSearch(query, val, categoryFilter);
  }

  function handleCategoryToggle(cat: string) {
    const next = categoryFilter === cat ? null : cat;
    setCategoryFilter(next);
    // Immediately search if near is set or query is set
    if (debounceRef.current) clearTimeout(debounceRef.current);
    doSearch(query, near, next);
  }

  function buildPrefill(r: NominatimResult): Partial<typeof EMPTY_FORM> {
    const addr = r.address ?? {};
    return {
      name: r.name ?? r.display_name.split(",")[0].trim(),
      type: nominatimToSpotType(r.class, r.type),
      address: buildAddress(addr),
      neighborhood: buildNeighborhood(addr),
      city: buildCity(addr),
      website: r.extratags?.website ?? r.extratags?.["contact:website"] ?? "",
      openingHours: r.extratags?.opening_hours ?? "",
    };
  }

  function handleQuickAdd(r: NominatimResult) {
    onSelect(buildPrefill(r));
    onClose();
  }

  function handleAddSelected() {
    if (!selected) return;
    onSelect(buildPrefill(selected));
    onClose();
  }

  // Subtitle for each result: city + state/country context
  function resultSubtitle(r: NominatimResult) {
    const addr = r.address ?? {};
    const parts = [
      addr.suburb ?? addr.neighbourhood ?? addr.quarter,
      addr.city ?? addr.town ?? addr.village ?? addr.municipality,
      addr.state,
      addr.country,
    ].filter(Boolean);
    return parts.slice(0, 3).join(", ");
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[82vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <MapPin size={16} className="text-primary" /> Search Places
          </DialogTitle>
        </DialogHeader>

        {/* Search inputs */}
        <div className="px-5 pb-3 shrink-0 space-y-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            {loading && <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />}
            <Input
              ref={queryRef}
              placeholder="Restaurant, park, hotel, attraction…"
              value={query}
              onChange={e => handleQueryChange(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { if (debounceRef.current) clearTimeout(debounceRef.current); doSearch(query, near, categoryFilter); } }}
              className="text-sm pl-9 pr-8"
            />
          </div>
          <div className="relative">
            <Navigation size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Near city (optional) — e.g. Austin, Chicago, NYC…"
              value={near}
              onChange={e => handleNearChange(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { if (debounceRef.current) clearTimeout(debounceRef.current); doSearch(query, near, categoryFilter); } }}
              className="text-sm pl-9 h-8 text-muted-foreground placeholder:text-muted-foreground/60"
            />
          </div>

          {/* Category filter pills */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {SPOT_TYPES.filter(t => t.value !== "other").map(t => (
              <button
                key={t.value}
                onClick={() => handleCategoryToggle(t.value)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border transition-all ${
                  categoryFilter === t.value
                    ? "bg-primary text-primary-foreground border-primary font-medium"
                    : "bg-card border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                <span>{t.emoji}</span> {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden border-t">
          {/* Results list */}
          {(() => {
            const displayed = categoryFilter
              ? results.filter(r => nominatimToSpotType(r.class, r.type) === categoryFilter)
              : results;
            return (
          <div className={`overflow-y-auto py-2 space-y-0.5 ${selected ? "w-[280px] border-r shrink-0 px-2" : "flex-1 px-3"}`}>
            {displayed.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center h-28 text-muted-foreground gap-1.5 px-6">
                <MapPin size={22} className="opacity-20" />
                <p className="text-xs text-center">
                  {(query.trim() || categoryFilter)
                    ? categoryFilter && results.length > 0
                      ? `No ${SPOT_TYPES.find(t => t.value === categoryFilter)?.label ?? categoryFilter} results — try a broader search`
                      : "No results — try adding a city name in the \"Near\" field"
                    : "Type a place name or pick a category above"}
                </p>
              </div>
            )}
            {displayed.map(r => {
              const name = r.name ?? r.display_name.split(",")[0];
              const sub = resultSubtitle(r);
              const spotType = nominatimToSpotType(r.class, r.type);
              const emoji = SPOT_TYPES.find(t => t.value === spotType)?.emoji ?? "📍";
              const isSelected = selected?.place_id === r.place_id;
              return (
                <div
                  key={r.place_id}
                  onClick={() => setSelected(isSelected ? null : r)}
                  className={`w-full text-left flex items-center gap-2.5 px-2.5 py-2 rounded-lg border cursor-pointer transition-colors group ${isSelected ? "bg-primary/5 border-primary/30" : "bg-transparent hover:bg-muted/40 border-transparent"}`}
                >
                  <span className="text-base shrink-0">{emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-snug truncate">{name}</p>
                    {sub && <p className="text-xs text-muted-foreground truncate">{sub}</p>}
                  </div>
                  {/* Quick-add button */}
                  <button
                    onClick={e => { e.stopPropagation(); handleQuickAdd(r); }}
                    title="Add to My Spots"
                    className="shrink-0 p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-primary hover:text-primary-foreground text-muted-foreground transition-all"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              );
            })}
          </div>
            );
          })()}

          {/* Preview panel */}
          {selected && (
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {(() => {
                const addr = selected.address ?? {};
                const name = selected.name ?? selected.display_name.split(",")[0];
                const spotType = nominatimToSpotType(selected.class, selected.type);
                const emoji = SPOT_TYPES.find(t => t.value === spotType)?.emoji ?? "📍";
                const fullAddress = buildAddress(addr);
                const city = buildCity(addr);
                const neighborhood = buildNeighborhood(addr);
                const website = selected.extratags?.website ?? selected.extratags?.["contact:website"];
                const hours = selected.extratags?.opening_hours;
                const osmUrl = `https://www.openstreetmap.org/?mlat=${selected.lat}&mlon=${selected.lon}&zoom=17`;

                return (
                  <>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-2xl">{emoji}</span>
                        <h3 className="font-semibold text-base leading-tight">{name}</h3>
                      </div>
                      <Badge variant="outline" className="text-xs capitalize">{SPOT_TYPES.find(t => t.value === spotType)?.label ?? spotType}</Badge>
                    </div>

                    <div className="space-y-1.5 text-sm">
                      {(fullAddress || city) && (
                        <p className="flex items-start gap-2 text-muted-foreground">
                          <MapPin size={13} className="shrink-0 mt-0.5" />
                          <span>{[fullAddress, neighborhood, city, addr.state, addr.postcode].filter(Boolean).join(", ")}</span>
                        </p>
                      )}
                      {hours && (
                        <p className="flex items-start gap-2 text-muted-foreground">
                          <Clock size={13} className="shrink-0 mt-0.5" /><span className="text-xs">{hours}</span>
                        </p>
                      )}
                      {website && (
                        <p className="flex items-center gap-2 text-muted-foreground">
                          <Globe size={13} className="shrink-0" />
                          <a href={website.startsWith("http") ? website : `https://${website}`}
                            target="_blank" rel="noopener noreferrer"
                            className="text-xs text-blue-500 hover:underline truncate">{website}</a>
                        </p>
                      )}
                      <p className="flex items-center gap-2 text-muted-foreground">
                        <Navigation size={13} className="shrink-0" />
                        <a href={osmUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline">
                          View on OpenStreetMap
                        </a>
                      </p>
                    </div>

                    <Button className="w-full" size="sm" onClick={handleAddSelected}>
                      <Plus size={13} className="mr-1.5" /> Add to My Spots
                    </Button>
                    <p className="text-xs text-center text-muted-foreground">
                      You can add notes, rating, and status after adding.
                    </p>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

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
  const [nominatimOpen, setNominatimOpen] = useState(false);
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

  const csvRef = useRef<HTMLInputElement>(null);
  const [csvInfoOpen, setCsvInfoOpen] = useState(false);

  // Normalize type/status values so CSV doesn't need exact casing
  const TYPE_MAP: Record<string, string> = {
    restaurant: "restaurant", bar: "bar", café: "cafe", cafe: "cafe",
    park: "park", trail: "trail", shop: "shop", service: "service",
    attraction: "attraction", hotel: "hotel",
  };
  const STATUS_MAP: Record<string, string> = {
    want_to_visit: "want_to_visit", "want to visit": "want_to_visit", want: "want_to_visit",
    visited: "visited", seen: "visited",
    favorite: "favorite", favourite: "favorite", fav: "favorite",
  };

  function parseCsvText(text: string): Record<string, string>[] {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];
    // ↓ lowercase + trim headers so "Name" and "name" both work
    const headers = parseCsvLine(lines[0]).map(h => h.trim().toLowerCase());
    return lines.slice(1).map(line => {
      const cols = parseCsvLine(line);
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = (cols[i] ?? "").trim(); });
      return row;
    }).filter(row => Object.values(row).some(v => v));
  }
  function parseCsvLine(line: string): string[] {
    const result: string[] = []; let cur = ""; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
      else if (c === ',' && !inQ) { result.push(cur); cur = ""; }
      else cur += c;
    }
    result.push(cur); return result;
  }

  function downloadCsvTemplate() {
    const header = "name,type,address,neighborhood,city,status,rating,notes,website,priceRange,tags";
    const ex1 = `"Franklin Barbecue",restaurant,"900 E 11th St",East Austin,Austin,want_to_visit,,Best brisket in Texas,franklinbbq.com,2,bbq`;
    const ex2 = `"Barton Springs Pool",park,,Zilker,Austin,visited,5,Perfect swimming hole,,1,outdoor`;
    const blob = new Blob([`${header}\n${ex1}\n${ex2}`], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "spots_template.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  async function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const rows = parseCsvText(text);
    if (rows.length === 0) {
      toast({ title: "No rows found", description: "Make sure your CSV has a header row and at least one data row.", variant: "destructive" });
      e.target.value = ""; return;
    }
    let created = 0, skipped = 0;
    const errorDetails: string[] = [];
    for (const row of rows) {
      if (!row.name?.trim()) { skipped++; continue; }
      try {
        const typeVal = TYPE_MAP[row.type?.toLowerCase().trim() ?? ""] ?? (row.type?.trim() || "other");
        const statusVal = STATUS_MAP[row.status?.toLowerCase().trim() ?? ""] ?? "want_to_visit";
        await apiRequest("POST", "/api/spots", {
          name: row.name.trim(),
          type: typeVal,
          address: row.address || null,
          neighborhood: row.neighborhood || null,
          city: row.city || null,
          status: statusVal,
          rating: row.rating ? Math.min(5, Math.max(1, parseInt(row.rating))) : null,
          notes: row.notes || null,
          website: row.website || null,
          priceRange: row.priceRange ? Math.min(4, Math.max(1, parseInt(row.priceRange))) : null,
          tags: row.tags || null,
          isFavorite: row.isFavorite === "true" || row.isFavorite === "1" || row.isfavorite === "true",
        });
        created++;
      } catch (err: any) {
        errorDetails.push(row.name);
      }
    }
    qc.invalidateQueries({ queryKey: ["/api/spots"] });
    if (errorDetails.length === 0) {
      toast({ title: `✓ Imported ${created} spot${created !== 1 ? "s" : ""}${skipped ? ` (${skipped} skipped — no name)` : ""}` });
    } else {
      toast({
        title: `Imported ${created}, failed ${errorDetails.length}`,
        description: `Failed rows: ${errorDetails.slice(0, 3).join(", ")}${errorDetails.length > 3 ? "…" : ""}`,
        variant: "destructive",
      });
    }
    e.target.value = "";
  }

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
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setNominatimOpen(true)} className="gap-1.5">
            <Search size={13} /> Search
          </Button>
          <Button size="sm" variant="outline" onClick={openNew} className="gap-1.5">
            <Plus size={14} /> Add Spot
          </Button>
          <Button size="sm" variant="outline" onClick={downloadCsvTemplate} className="gap-1.5">
            <Download size={13} /> Template
          </Button>
          <Button size="sm" variant="outline" onClick={() => setCsvInfoOpen(true)} className="gap-1.5">
            <HelpCircle size={13} /> CSV Format
          </Button>
          <Button size="sm" variant="outline" onClick={() => csvRef.current?.click()} className="gap-1.5">
            <Upload size={13} /> Upload CSV
          </Button>
          <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
        </div>
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

      {/* Nominatim Search Modal */}
      <NominatimSearchModal
        open={nominatimOpen}
        onClose={() => setNominatimOpen(false)}
        onSelect={(prefill) => {
          setEditing(null);
          setForm({ ...EMPTY_FORM, ...prefill });
          setModalOpen(true);
        }}
      />

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

      {/* CSV Format Info Dialog */}
      <Dialog open={csvInfoOpen} onOpenChange={setCsvInfoOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><HelpCircle size={16} /> Spots CSV Format</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-3">Your CSV must have a header row. Column names are case-insensitive. Only <span className="font-semibold text-foreground">name</span> is required — all others are optional.</p>
          <div className="space-y-1 text-sm">
            {[
              { col: "name", req: true,  note: "Name of the spot" },
              { col: "type", req: false, note: "restaurant · bar · cafe · park · trail · beach · museum · hotel · shop · gym · venue · activity · other" },
              { col: "address", req: false, note: "Street address" },
              { col: "neighborhood", req: false, note: "Neighborhood name" },
              { col: "city", req: false, note: "City name" },
              { col: "status", req: false, note: "want_to_visit · visited · favorite  (default: want_to_visit)" },
              { col: "rating", req: false, note: "1–5" },
              { col: "notes", req: false, note: "Free text" },
              { col: "website", req: false, note: "URL, e.g. franklinbbq.com" },
              { col: "priceRange", req: false, note: "1 ($) · 2 ($$) · 3 ($$$) · 4 ($$$$)" },
              { col: "tags", req: false, note: "Comma-separated, e.g. Date Night, Dog-Friendly" },
            ].map(({ col, req, note }) => (
              <div key={col} className="flex gap-3 py-1.5 border-b last:border-0">
                <code className="text-xs font-mono bg-secondary px-1.5 py-0.5 rounded shrink-0 self-start">{col}</code>
                {req && <span className="text-xs text-red-500 font-medium shrink-0 self-start pt-0.5">required</span>}
                <span className="text-xs text-muted-foreground leading-relaxed">{note}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">Tip: click <strong>Template</strong> to download a pre-filled example CSV.</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
