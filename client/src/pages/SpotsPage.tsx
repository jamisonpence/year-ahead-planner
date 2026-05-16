import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import EventsTab from "@/components/EventsTab";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Spot, SpotShareWithUser, PublicUser, Trip, TripItem } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { format, parseISO } from "date-fns";
import {
  MapPin, Plus, Pencil, Trash2, Search, Heart,
  Globe, Clock, Tag, Navigation, Upload, Download, HelpCircle, Loader2,
  Send, Inbox, CornerUpRight, Check, X, Plane, Calendar, ChevronLeft,
  CheckCircle2, Circle, StickyNote, Sunrise, Sparkles, MessageCircle,
  Backpack, ClipboardList, Star, ChevronDown, ChevronUp, RefreshCw,
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

function SpotCard({ spot, onEdit, onDelete, onToggleFav, onShare }: {
  spot: Spot;
  onEdit: () => void;
  onDelete: () => void;
  onToggleFav: () => void;
  onShare: () => void;
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
          <button onClick={onShare} className="p-1.5 rounded hover:bg-secondary transition-colors" title="Share with friend">
            <Send size={13} className="text-muted-foreground" />
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
  const [shareSpot, setShareSpot] = useState<Spot | null>(null);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("shared") === "1") setActiveTab("shared");
  }, []);
  useEffect(() => {
    if (activeTab !== "shared") return;
    apiRequest("POST", "/api/shares/mark-read", { type: "spots" })
      .then(() => qc.invalidateQueries({ queryKey: ["/api/shares/count"] })).catch(() => {});
  }, [activeTab]);

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
    <div className="p-3 sm:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
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
          <Button size="sm" variant="outline" onClick={downloadCsvTemplate} className="hidden sm:inline-flex gap-1.5">
            <Download size={13} /> Template
          </Button>
          <Button size="sm" variant="outline" onClick={() => setCsvInfoOpen(true)} className="hidden sm:inline-flex gap-1.5">
            <HelpCircle size={13} /> CSV Format
          </Button>
          <Button size="sm" variant="outline" onClick={() => csvRef.current?.click()} className="hidden sm:inline-flex gap-1.5">
            <Upload size={13} /> Upload CSV
          </Button>
          <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-4">
        <div className="overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0">
        <TabsList className="w-max sm:w-auto flex-nowrap">
          <TabsTrigger value="all">All <span className="ml-1 text-xs text-muted-foreground">({spots.length})</span></TabsTrigger>
          <TabsTrigger value="want_to_visit">Want to Visit <span className="ml-1 text-xs text-muted-foreground">({spots.filter((s) => s.status === "want_to_visit").length})</span></TabsTrigger>
          <TabsTrigger value="visited">Visited <span className="ml-1 text-xs text-muted-foreground">({spots.filter((s) => s.status === "visited").length})</span></TabsTrigger>
          <TabsTrigger value="favorites"><Heart size={12} className="inline mr-1" />Favorites <span className="ml-1 text-xs text-muted-foreground">({spots.filter((s) => s.isFavorite).length})</span></TabsTrigger>
          <TabsTrigger value="shared" className="gap-1.5"><Inbox size={13} /> Shared</TabsTrigger>
          <TabsTrigger value="trips" className="gap-1.5"><Plane size={13} /> Trips</TabsTrigger>
          <TabsTrigger value="events" className="gap-1.5"><span className="text-sm leading-none">🎟️</span> Events</TabsTrigger>
        </TabsList>
        </div>
      </Tabs>

      {/* Filters */}
      {activeTab !== "trips" && activeTab !== "events" && <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input className="pl-8 h-9 w-full sm:w-52" placeholder="Search spots…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="h-9 w-full sm:w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {SPOT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.emoji} {t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {allCities.length > 0 && (
          <Select value={filterCity} onValueChange={setFilterCity}>
            <SelectTrigger className="h-9 w-full sm:w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All cities</SelectItem>
              {allCities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {allTags.length > 0 && (
          <Select value={filterTag} onValueChange={setFilterTag}>
            <SelectTrigger className="h-9 w-full sm:w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tags</SelectItem>
              {allTags.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>}

      {/* Results */}
      {activeTab === "shared" ? (
        <SharedSpotsTab />
      ) : activeTab === "trips" ? (
        <TripsTab spots={spots} />
      ) : activeTab === "events" ? (
        <EventsTab />
      ) : displaySpots.length === 0 ? (
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
              onShare={() => setShareSpot(spot)}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Neighborhood</label>
                <Input placeholder="e.g. East Side" value={form.neighborhood} onChange={(e) => setForm({ ...form, neighborhood: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">City</label>
                <Input placeholder="e.g. Austin" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

      {/* Spot Share Modal */}
      {shareSpot && (
        <SpotShareModal spot={shareSpot} onClose={() => setShareSpot(null)} />
      )}

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

// ── Avatar helper ──────────────────────────────────────────────────────────────
function Avatar({ name, avatarUrl, size = 28 }: { name: string; avatarUrl?: string | null; size?: number }) {
  if (avatarUrl) return <img src={avatarUrl} alt={name} style={{ width: size, height: size }} className="rounded-full object-cover shrink-0" />;
  return (
    <div style={{ width: size, height: size }} className="rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

// ── Spot Share Modal ───────────────────────────────────────────────────────────
function SpotShareModal({ spot, onClose }: { spot: Spot; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedFriend, setSelectedFriend] = useState<number | null>(null);
  const [note, setNote] = useState("");

  const { data: friends = [] } = useQuery<PublicUser[]>({ queryKey: ["/api/friends"] });

  const sendMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/spot-shares", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/spot-shares"] });
      qc.invalidateQueries({ queryKey: ["/api/shares/count"] });
      toast({ title: "Shared!", description: `${spot.name} shared with your friend.` });
      onClose();
    },
    onError: () => toast({ title: "Error sharing", variant: "destructive" }),
  });

  function handleSend() {
    if (!selectedFriend) return;
    sendMut.mutate({
      toUserId: selectedFriend,
      name: spot.name,
      type: spot.type,
      address: spot.address ?? null,
      neighborhood: spot.neighborhood ?? null,
      city: spot.city ?? null,
      website: spot.website ?? null,
      priceRange: spot.priceRange ?? null,
      tags: spot.tags ?? null,
      openingHours: spot.openingHours ?? null,
      rating: spot.rating ?? null,
      spotNotes: spot.notes ?? null,
      notes: note.trim() || null,
    });
  }

  const emoji = SPOT_TYPES.find((t) => t.value === spot.type)?.emoji ?? "📍";

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send size={16} /> Share "{spot.name}"
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-secondary/50 text-sm">
            <span className="text-xl">{emoji}</span>
            <div>
              <p className="font-medium leading-tight">{spot.name}</p>
              {(spot.neighborhood || spot.city) && (
                <p className="text-xs text-muted-foreground">{[spot.neighborhood, spot.city].filter(Boolean).join(", ")}</p>
              )}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Send to a friend</p>
            {friends.length === 0 ? (
              <p className="text-sm text-muted-foreground">No friends yet. Add friends in the People section.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {friends.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setSelectedFriend(f.id)}
                    className={`flex items-center gap-3 p-2.5 rounded-lg border text-left transition-colors ${
                      selectedFriend === f.id ? "border-primary bg-primary/5" : "hover:bg-secondary"
                    }`}
                  >
                    <Avatar name={f.name} avatarUrl={f.avatarUrl} size={32} />
                    <span className="text-sm font-medium">{f.name}</span>
                    {selectedFriend === f.id && <Check size={14} className="ml-auto text-primary" />}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Add a note (optional)</p>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="You'd love this place…" rows={2} />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSend} disabled={!selectedFriend || sendMut.isPending} className="flex-1 gap-1.5">
              <Send size={14} /> Send
            </Button>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Shared Spots Tab ───────────────────────────────────────────────────────────
const PRICE_LABELS_LOCAL = ["", "$", "$$", "$$$", "$$$$"];

function SharedSpotsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [view, setView] = useState<"received" | "sent">("received");

  const { data } = useQuery<{ received: SpotShareWithUser[]; sent: SpotShareWithUser[] }>({
    queryKey: ["/api/spot-shares"],
  });
  const received = data?.received ?? [];
  const sent = data?.sent ?? [];

  const dismissMut = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/spot-shares/${id}/dismiss`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/spot-shares"] }),
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/spot-shares/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/spot-shares"] }),
  });

  const addMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/spots", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/spots"] });
      toast({ title: "Added to your Spots!" });
    },
    onError: () => toast({ title: "Error adding", variant: "destructive" }),
  });

  function handleAddToSpots(share: SpotShareWithUser) {
    addMut.mutate({
      name: share.name,
      type: share.type,
      address: share.address ?? null,
      neighborhood: share.neighborhood ?? null,
      city: share.city ?? null,
      website: share.website ?? null,
      priceRange: share.priceRange ?? null,
      tags: share.tags ?? null,
      openingHours: share.openingHours ?? null,
      rating: share.rating ?? null,
      notes: share.spotNotes ? `${share.spotNotes} (shared by ${share.fromUser.name})` : `Shared by ${share.fromUser.name}`,
      status: "want_to_visit",
    });
  }

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setView("received")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${view === "received" ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}
        >
          <Inbox size={14} /> Received {received.length > 0 && <span className="ml-1 bg-white/20 text-xs px-1.5 py-0.5 rounded-full">{received.length}</span>}
        </button>
        <button
          onClick={() => setView("sent")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${view === "sent" ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}
        >
          <CornerUpRight size={14} /> Sent
        </button>
      </div>

      {view === "received" && (
        received.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Inbox size={40} className="mx-auto mb-3 opacity-20" />
            <p className="text-sm">No spots shared with you yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {received.map((share) => {
              const emoji = SPOT_TYPES.find((t) => t.value === share.type)?.emoji ?? "📍";
              const typeLabel = SPOT_TYPES.find((t) => t.value === share.type)?.label ?? share.type;
              const location = [share.neighborhood, share.city].filter(Boolean).join(", ");
              const tags = (share.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean);
              return (
                <div key={share.id} className="p-4 rounded-lg border bg-card space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      <span className="text-xl shrink-0 mt-0.5">{emoji}</span>
                      <div className="min-w-0">
                        <p className="font-medium text-sm leading-tight">{share.name}</p>
                        {location && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Navigation size={10} />{location}</p>}
                      </div>
                    </div>
                    <button onClick={() => dismissMut.mutate(share.id)} className="p-1 rounded hover:bg-secondary transition-colors shrink-0">
                      <X size={13} className="text-muted-foreground" />
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className="text-xs">{typeLabel}</Badge>
                    {share.priceRange && <span className="text-xs font-medium text-muted-foreground">{PRICE_LABELS_LOCAL[share.priceRange]}</span>}
                    {tags.map((t) => <Badge key={t} variant="secondary" className="text-xs"><Tag size={10} className="mr-0.5" />{t}</Badge>)}
                  </div>

                  {share.rating != null && (
                    <div className="flex gap-0.5">
                      {[1,2,3,4,5].map((n) => (
                        <span key={n} className={`text-sm ${(share.rating ?? 0) >= n ? "text-yellow-400" : "text-muted-foreground/30"}`}>★</span>
                      ))}
                    </div>
                  )}

                  <div className="text-xs text-muted-foreground space-y-0.5">
                    {share.address && <p className="flex items-center gap-1"><MapPin size={10} />{share.address}</p>}
                    {share.openingHours && <p className="flex items-center gap-1"><Clock size={10} />{share.openingHours}</p>}
                    {share.website && (
                      <a href={share.website.startsWith("http") ? share.website : `https://${share.website}`}
                        target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-blue-500 hover:underline">
                        <Globe size={10} />{share.website}
                      </a>
                    )}
                  </div>

                  {share.spotNotes && <p className="text-xs text-muted-foreground border-t pt-1">{share.spotNotes}</p>}

                  <div className="flex items-center gap-2 pt-1">
                    <Avatar name={share.fromUser.name} avatarUrl={share.fromUser.avatarUrl} size={20} />
                    <span className="text-xs text-muted-foreground">from {share.fromUser.name}</span>
                    <span className="text-xs text-muted-foreground ml-auto">{format(parseISO(share.createdAt), "MMM d")}</span>
                  </div>
                  {share.notes && <p className="text-xs italic text-muted-foreground">"{share.notes}"</p>}

                  <Button size="sm" className="w-full gap-1.5 h-8 text-xs" onClick={() => handleAddToSpots(share)} disabled={addMut.isPending}>
                    <Plus size={12} /> Add to my Spots
                  </Button>
                </div>
              );
            })}
          </div>
        )
      )}

      {view === "sent" && (
        sent.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <CornerUpRight size={40} className="mx-auto mb-3 opacity-20" />
            <p className="text-sm">You haven't shared any spots yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sent.map((share) => {
              const emoji = SPOT_TYPES.find((t) => t.value === share.type)?.emoji ?? "📍";
              return (
                <div key={share.id} className="flex items-start gap-3 p-3 rounded-lg border bg-card">
                  <span className="text-lg shrink-0">{emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{share.name}</p>
                    {(share.neighborhood || share.city) && (
                      <p className="text-xs text-muted-foreground">{[share.neighborhood, share.city].filter(Boolean).join(", ")}</p>
                    )}
                    {share.notes && <p className="text-xs text-muted-foreground italic mt-0.5">"{share.notes}"</p>}
                    <div className="flex items-center gap-2 mt-1">
                      <Avatar name={share.toUser.name} avatarUrl={share.toUser.avatarUrl} size={18} />
                      <span className="text-xs text-muted-foreground">to {share.toUser.name} · {format(parseISO(share.createdAt), "MMM d")}</span>
                    </div>
                  </div>
                  <button onClick={() => deleteMut.mutate(share.id)} className="p-1.5 rounded hover:bg-secondary transition-colors shrink-0">
                    <Trash2 size={13} className="text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}

// ── AI Trip Planner ───────────────────────────────────────────────────────────

type PrepCategory   = { category: string; emoji: string; items: string[] };
type PackCategory   = { category: string; emoji: string; items: string[] };
type PlaceRec       = { name: string; type: string; emoji: string; description: string; area?: string; location?: string; tip?: string };
type DayHighlight   = { day: number; label: string; area?: string; highlights: string[] };
type TripAIPlan     = { overview: string; prep: PrepCategory[]; packing: PackCategory[]; recommendations: PlaceRec[]; dayByDay: DayHighlight[]; budgetTips: string[]; localTips: string[] };
type ChatMessage    = { role: "user" | "assistant"; content: string };

function AITripPlanner({ trip }: { trip: Trip }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  // localStorage keys for this specific trip
  const PLAN_KEY = `ai_trip_plan_${trip.id}`;
  const CHAT_KEY = `ai_trip_chat_${trip.id}`;

  // Restore persisted plan and chat on mount
  const [plan, setPlanState]        = useState<TripAIPlan | null>(() => {
    try { const s = localStorage.getItem(PLAN_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  const [chatMessages, setChatMessagesState] = useState<ChatMessage[]>(() => {
    try { const s = localStorage.getItem(CHAT_KEY); return s ? JSON.parse(s) : []; } catch { return []; }
  });

  // Wrappers that keep localStorage in sync
  const setPlan = (p: TripAIPlan | null) => {
    setPlanState(p);
    if (p) localStorage.setItem(PLAN_KEY, JSON.stringify(p));
    else   localStorage.removeItem(PLAN_KEY);
  };
  const setChatMessages = (fn: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
    setChatMessagesState(prev => {
      const next = typeof fn === "function" ? fn(prev) : fn;
      try { localStorage.setItem(CHAT_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [preferences, setPreferences] = useState("");
  const [showPrefInput, setShowPrefInput] = useState(!plan);

  // Chat input state
  const [chatInput, setChatInput]   = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Collapsed sections
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setCollapsed(p => ({ ...p, [k]: !p[k] }));

  // Track which recs have been saved
  const [savedToSpots, setSavedToSpots]         = useState<Record<number, boolean>>({});
  const [savedToItinerary, setSavedToItinerary] = useState<Record<number, boolean>>({});
  // Inline day-picker: which rec index is open + selected date
  const [dayPickerIdx, setDayPickerIdx]         = useState<number | null>(null);
  const [pickedDate, setPickedDate]             = useState("");

  // Build trip date options (same logic as TripsTab)
  const dateOptions = useMemo(() => {
    if (!trip.startDate) return [];
    const opts: { value: string; label: string }[] = [];
    const start = parseISO(trip.startDate);
    const end   = trip.endDate ? parseISO(trip.endDate) : start;
    const days  = Math.min(Math.round((end.getTime() - start.getTime()) / 86400000) + 1, 30);
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      opts.push({ value: d.toISOString().split("T")[0], label: `Day ${i + 1} · ${format(d, "EEE, MMM d")}` });
    }
    return opts;
  }, [trip.startDate, trip.endDate]);

  // Map PlaceRec type to spot/trip-item type field
  const recTypeToSpotType = (t: string) => {
    const map: Record<string, string> = {
      restaurant: "restaurant", bar: "bar", cafe: "cafe", hotel: "hotel",
      attraction: "attraction", park: "park", shop: "shop", other: "other",
    };
    return map[t] ?? "attraction";
  };

  const saveToSpots = useMutation({
    mutationFn: (rec: PlaceRec) =>
      apiRequest("POST", "/api/spots", {
        name: rec.name,
        type: recTypeToSpotType(rec.type),
        address: rec.area ?? "",
        city: trip.destination ?? "",
        notes: [rec.description, rec.tip ? `Tip: ${rec.tip}` : ""].filter(Boolean).join("\n"),
        status: "want_to_visit",
      }).then(r => r.json()),
    onSuccess: (_, rec) => {
      const idx = plan?.recommendations.indexOf(rec) ?? -1;
      if (idx >= 0) setSavedToSpots(p => ({ ...p, [idx]: true }));
      qc.invalidateQueries({ queryKey: ["/api/spots"] });
      toast({ title: `"${rec.name}" saved to Spots!` });
    },
    onError: () => toast({ title: "Failed to save spot", variant: "destructive" }),
  });

  const addToItinerary = useMutation({
    mutationFn: ({ rec, date }: { rec: PlaceRec; date: string }) =>
      apiRequest("POST", `/api/trips/${trip.id}/items`, {
        name: rec.name,
        type: recTypeToSpotType(rec.type),
        address: rec.area ?? "",
        date: date || null,
        notes: [rec.description, rec.tip ? `Tip: ${rec.tip}` : ""].filter(Boolean).join("\n"),
        confirmed: false,
      }).then(r => r.json()),
    onSuccess: (_, { rec }) => {
      const idx = plan?.recommendations.indexOf(rec) ?? -1;
      if (idx >= 0) setSavedToItinerary(p => ({ ...p, [idx]: true }));
      qc.invalidateQueries({ queryKey: ["/api/trips", trip.id, "items"] });
      setDayPickerIdx(null);
      toast({ title: `"${rec.name}" added to itinerary!` });
    },
    onError: () => toast({ title: "Failed to add to itinerary", variant: "destructive" }),
  });

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages]);

  async function generate() {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/ai/trip-planner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId: trip.id, preferences: preferences.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error === "no_api_key"
          ? "Add your Anthropic API key in Settings → API Keys to use AI features."
          : (data.message ?? "Failed to generate. Try again."));
        return;
      }
      setPlan(data);
      setChatMessages([]);
      setShowPrefInput(false);
    } catch (e) {
      setError("Network error. Please check your connection and try again.");
    } finally { setLoading(false); }
  }

  async function sendChat() {
    const msg = chatInput.trim();
    if (!msg) return;
    const newMessages: ChatMessage[] = [...chatMessages, { role: "user", content: msg }];
    setChatMessages(newMessages);
    setChatInput("");
    setChatLoading(true);
    try {
      const res = await fetch("/api/ai/trip-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId: trip.id, messages: newMessages }),
      });
      const data = await res.json();
      if (!res.ok) {
        setChatMessages(prev => [...prev, { role: "assistant", content: data.message ?? "Sorry, I couldn't respond. Please try again." }]);
        return;
      }
      setChatMessages(prev => [...prev, { role: "assistant", content: data.reply }]);
    } catch {
      setChatMessages(prev => [...prev, { role: "assistant", content: "Network error. Please try again." }]);
    } finally { setChatLoading(false); }
  }

  const SUGGESTION_PROMPTS = [
    "What should I avoid?",
    "Best local food to try",
    "Budget-friendly options",
    "Hidden gems off the beaten path",
    "Best time of day for attractions",
    "Transportation tips",
  ];

  return (
    <div className="mt-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-amber-500" />
          <h3 className="text-sm font-semibold">AI Trip Planner</h3>
        </div>
        <div className="flex items-center gap-2">
          {!plan && !loading && (
            <button onClick={() => setShowPrefInput(p => !p)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
              Preferences {showPrefInput ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          )}
          {plan && (
            <Button size="sm" variant="outline" onClick={() => { setPlan(null); setChatMessages([]); setSavedToSpots({}); setSavedToItinerary({}); setShowPrefInput(true); }} className="gap-1.5 h-7 text-xs px-2.5">
              <RefreshCw size={11} /> Redo
            </Button>
          )}
        </div>
      </div>

      {/* Preferences input */}
      {showPrefInput && !plan && (
        <div className="space-y-2">
          <Textarea
            placeholder={`Tell me about your travel style… e.g. "We love street food and walking tours, traveling with 2 kids ages 5 and 8, budget-conscious, prefer boutique hotels"`}
            rows={3}
            value={preferences}
            onChange={e => setPreferences(e.target.value)}
            className="text-sm"
          />
        </div>
      )}

      {/* Error */}
      {error && <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>}

      {/* Generate button */}
      {!plan && !loading && (
        <Button onClick={generate} className="w-full gap-2" disabled={loading}>
          <Sparkles size={14} /> Generate Trip Plan for {trip.destination ?? trip.name}
        </Button>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-center py-8 text-muted-foreground">
          <Sparkles size={28} className="mx-auto mb-2 text-amber-400 animate-pulse" />
          <p className="text-sm animate-pulse">Researching {trip.destination ?? trip.name}…</p>
          <p className="text-xs mt-1 opacity-60">Building your personalized trip guide</p>
        </div>
      )}

      {/* Plan */}
      {plan && (
        <div className="space-y-4">
          {/* Overview */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 border border-amber-200 dark:border-amber-800">
            <p className="text-sm leading-relaxed">{plan.overview}</p>
          </div>

          {/* Prep checklist */}
          {plan.prep?.length > 0 && (
            <div className="rounded-xl border overflow-hidden">
              <button onClick={() => toggle("prep")} className="w-full flex items-center justify-between p-3 bg-card hover:bg-secondary/50 transition-colors">
                <span className="flex items-center gap-2 text-sm font-semibold"><ClipboardList size={14} className="text-blue-500" /> Pre-Trip Checklist</span>
                {collapsed.prep ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronUp size={14} className="text-muted-foreground" />}
              </button>
              {!collapsed.prep && (
                <div className="p-3 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-card">
                  {plan.prep.map((cat, i) => (
                    <div key={i}>
                      <p className="text-xs font-semibold text-muted-foreground mb-1.5">{cat.emoji} {cat.category}</p>
                      <ul className="space-y-1">
                        {cat.items.map((item, j) => (
                          <li key={j} className="flex items-start gap-1.5 text-xs"><span className="text-blue-500 mt-0.5 shrink-0">☐</span>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Packing list */}
          {plan.packing?.length > 0 && (
            <div className="rounded-xl border overflow-hidden">
              <button onClick={() => toggle("packing")} className="w-full flex items-center justify-between p-3 bg-card hover:bg-secondary/50 transition-colors">
                <span className="flex items-center gap-2 text-sm font-semibold"><Backpack size={14} className="text-emerald-500" /> What to Pack</span>
                {collapsed.packing ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronUp size={14} className="text-muted-foreground" />}
              </button>
              {!collapsed.packing && (
                <div className="p-3 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-card">
                  {plan.packing.map((cat, i) => (
                    <div key={i}>
                      <p className="text-xs font-semibold text-muted-foreground mb-1.5">{cat.emoji} {cat.category}</p>
                      <ul className="space-y-1">
                        {cat.items.map((item, j) => (
                          <li key={j} className="flex items-start gap-1.5 text-xs"><span className="text-emerald-500 mt-0.5 shrink-0">☐</span>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Recommendations */}
          {plan.recommendations?.length > 0 && (
            <div className="rounded-xl border overflow-hidden">
              <button onClick={() => toggle("recs")} className="w-full flex items-center justify-between p-3 bg-card hover:bg-secondary/50 transition-colors">
                <span className="flex items-center gap-2 text-sm font-semibold"><Star size={14} className="text-amber-500" /> Places to Visit</span>
                {collapsed.recs ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronUp size={14} className="text-muted-foreground" />}
              </button>
              {!collapsed.recs && (
                <div className="p-3 pt-0 space-y-2.5 bg-card">
                  {plan.recommendations.map((rec, i) => (
                    <div key={i} className="p-2.5 rounded-lg border bg-secondary/20">
                      <div className="flex items-start gap-2">
                        <span className="text-lg shrink-0">{rec.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-medium">{rec.name}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground capitalize">{rec.type.replace("_", " ")}</span>
                          </div>
                          {(rec.location || rec.area) && (
                            <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                              <MapPin size={9} className="shrink-0 text-rose-400" />
                              {rec.location ? rec.location : rec.area}
                              {rec.location && rec.area && <span className="opacity-60">· {rec.area}</span>}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground mt-0.5">{rec.description}</p>
                          {rec.tip && <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-start gap-1"><Sparkles size={10} className="mt-0.5 shrink-0" />{rec.tip}</p>}

                          {/* Action buttons */}
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {/* Save to Spots */}
                            <button
                              onClick={() => { if (!savedToSpots[i]) saveToSpots.mutate(rec); }}
                              disabled={savedToSpots[i] || saveToSpots.isPending}
                              className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border transition-colors ${savedToSpots[i] ? "border-green-300 bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800" : "border-border bg-card hover:bg-secondary text-muted-foreground hover:text-foreground"}`}
                            >
                              {savedToSpots[i] ? <><Check size={10} /> Saved to Spots</> : <><MapPin size={10} /> Save to Spots</>}
                            </button>

                            {/* Add to Itinerary */}
                            {savedToItinerary[i] ? (
                              <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border border-violet-300 bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-400 dark:border-violet-800">
                                <Check size={10} /> On Itinerary
                              </span>
                            ) : dayPickerIdx === i ? (
                              /* Inline day picker */
                              <div className="flex items-center gap-1.5 flex-wrap mt-0.5 w-full">
                                {dateOptions.length > 0 ? (
                                  <select
                                    value={pickedDate}
                                    onChange={e => setPickedDate(e.target.value)}
                                    className="text-[11px] border rounded px-1.5 py-0.5 bg-background flex-1 min-w-0"
                                  >
                                    <option value="">No specific day</option>
                                    {dateOptions.map(opt => (
                                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                  </select>
                                ) : null}
                                <button
                                  onClick={() => addToItinerary.mutate({ rec, date: pickedDate })}
                                  disabled={addToItinerary.isPending}
                                  className="text-[11px] px-2 py-0.5 rounded-full border border-violet-400 bg-violet-100 text-violet-700 hover:bg-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-700 transition-colors"
                                >
                                  {addToItinerary.isPending ? "Adding…" : "Confirm"}
                                </button>
                                <button
                                  onClick={() => setDayPickerIdx(null)}
                                  className="text-[11px] px-2 py-0.5 rounded-full border border-border text-muted-foreground hover:text-foreground transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => { setPickedDate(""); setDayPickerIdx(i); }}
                                className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border border-border bg-card hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                              >
                                <Calendar size={10} /> Add to Itinerary
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Day by day */}
          {plan.dayByDay?.length > 0 && (
            <div className="rounded-xl border overflow-hidden">
              <button onClick={() => toggle("days")} className="w-full flex items-center justify-between p-3 bg-card hover:bg-secondary/50 transition-colors">
                <span className="flex items-center gap-2 text-sm font-semibold"><Calendar size={14} className="text-violet-500" /> Day-by-Day Suggestions</span>
                {collapsed.days ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronUp size={14} className="text-muted-foreground" />}
              </button>
              {!collapsed.days && (
                <div className="p-3 pt-0 space-y-2 bg-card">
                  {plan.dayByDay.map((day, i) => (
                    <div key={i} className="border-l-2 border-violet-300 dark:border-violet-700 pl-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-xs font-semibold">Day {day.day} — {day.label}</p>
                        {day.area && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300 flex items-center gap-0.5">
                            <MapPin size={8} />{day.area}
                          </span>
                        )}
                      </div>
                      <ul className="mt-1 space-y-0.5">
                        {day.highlights.map((h, j) => (
                          <li key={j} className="text-xs text-muted-foreground flex items-start gap-1"><span className="text-violet-400 shrink-0">·</span>{h}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tips row */}
          {((plan.budgetTips?.length > 0) || (plan.localTips?.length > 0)) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {plan.budgetTips?.length > 0 && (
                <div className="rounded-xl border p-3 bg-card">
                  <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">💰 Budget Tips</p>
                  <ul className="space-y-1">
                    {plan.budgetTips.map((t, i) => <li key={i} className="text-xs text-muted-foreground flex items-start gap-1"><span className="text-green-500 shrink-0">·</span>{t}</li>)}
                  </ul>
                </div>
              )}
              {plan.localTips?.length > 0 && (
                <div className="rounded-xl border p-3 bg-card">
                  <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">🗺️ Local Tips</p>
                  <ul className="space-y-1">
                    {plan.localTips.map((t, i) => <li key={i} className="text-xs text-muted-foreground flex items-start gap-1"><span className="text-blue-500 shrink-0">·</span>{t}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Chat section */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="flex items-center gap-2 p-3 border-b bg-secondary/30">
              <MessageCircle size={14} className="text-primary" />
              <span className="text-sm font-semibold">Ask Anything</span>
              <span className="text-xs text-muted-foreground">Tailor this trip with follow-up questions</span>
            </div>

            {/* Suggestion chips */}
            {chatMessages.length === 0 && (
              <div className="p-3 flex flex-wrap gap-1.5">
                {SUGGESTION_PROMPTS.map((prompt, i) => (
                  <button key={i} onClick={() => { setChatInput(prompt); }}
                    className="text-xs px-2.5 py-1 rounded-full border bg-secondary/40 hover:bg-secondary transition-colors">
                    {prompt}
                  </button>
                ))}
              </div>
            )}

            {/* Messages */}
            {chatMessages.length > 0 && (
              <div className="p-3 space-y-2 max-h-64 overflow-y-auto">
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>
                      {msg.content}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-secondary rounded-xl px-3 py-2 text-xs text-muted-foreground animate-pulse">Thinking…</div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            )}

            {/* Input */}
            <div className="p-3 pt-0 flex gap-2 items-end">
              <Textarea
                placeholder="Ask about restaurants, activities, what to pack, local customs…"
                rows={2}
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                className="text-xs flex-1 resize-none"
              />
              <Button size="sm" onClick={sendChat} disabled={!chatInput.trim() || chatLoading} className="shrink-0 gap-1.5">
                <Send size={12} /> Send
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── TripsTab ──────────────────────────────────────────────────────────────────

const TRIP_ITEM_TYPES = [
  { value: "restaurant", label: "Restaurant", emoji: "🍽️" },
  { value: "bar",        label: "Bar / Nightlife", emoji: "🍺" },
  { value: "cafe",       label: "Café",        emoji: "☕" },
  { value: "hotel",      label: "Hotel / Stay", emoji: "🏨" },
  { value: "attraction", label: "Attraction",  emoji: "🎡" },
  { value: "park",       label: "Park / Nature", emoji: "🌳" },
  { value: "shop",       label: "Shopping",    emoji: "🛍️" },
  { value: "transport",  label: "Transport",   emoji: "🚌" },
  { value: "other",      label: "Other",       emoji: "📍" },
];

const COVER_COLORS = [
  "#6366f1", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#ef4444",
  "#8b5cf6", "#14b8a6", "#f97316", "#84cc16",
];

const EMPTY_TRIP = { name: "", destination: "", startDate: "", endDate: "", emoji: "✈️", notes: "", coverColor: "#6366f1" };
const EMPTY_ITEM = { name: "", address: "", date: "", time: "", duration: "", notes: "", type: "other", confirmed: false, spotId: null as number | null };

function TripsTab({ spots }: { spots: Spot[] }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  // Trips state
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [tripModal, setTripModal] = useState(false);
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
  const [tripForm, setTripForm] = useState({ ...EMPTY_TRIP });

  // Trip items state
  const [itemModal, setItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<TripItem | null>(null);
  const [itemForm, setItemForm] = useState({ ...EMPTY_ITEM });

  // Queries
  const { data: trips = [], isLoading } = useQuery<Trip[]>({
    queryKey: ["/api/trips"],
    queryFn: () => apiRequest("GET", "/api/trips").then((r) => r.json()),
  });

  const { data: tripItems = [] } = useQuery<TripItem[]>({
    queryKey: ["/api/trips", selectedTrip?.id, "items"],
    queryFn: () => apiRequest("GET", `/api/trips/${selectedTrip!.id}/items`).then((r) => r.json()),
    enabled: !!selectedTrip,
  });

  // Mutations
  const createTrip = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/trips", data).then((r) => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/trips"] }); setTripModal(false); toast({ title: "Trip created!" }); },
    onError: () => toast({ title: "Failed to create trip", variant: "destructive" }),
  });
  const updateTrip = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/trips/${id}`, data).then((r) => r.json()),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ["/api/trips"] });
      if (selectedTrip?.id === updated.id) setSelectedTrip(updated);
      setTripModal(false);
      toast({ title: "Trip updated!" });
    },
    onError: () => toast({ title: "Failed to update trip", variant: "destructive" }),
  });
  const deleteTrip = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/trips/${id}`).then((r) => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/trips"] }); setSelectedTrip(null); toast({ title: "Trip deleted" }); },
    onError: () => toast({ title: "Failed to delete trip", variant: "destructive" }),
  });

  const createItem = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/trips/${selectedTrip!.id}/items`, data).then((r) => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/trips", selectedTrip?.id, "items"] }); setItemModal(false); toast({ title: "Stop added!" }); },
    onError: () => toast({ title: "Failed to add stop", variant: "destructive" }),
  });
  const updateItem = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/trip-items/${id}`, data).then((r) => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/trips", selectedTrip?.id, "items"] }); setItemModal(false); toast({ title: "Stop updated!" }); },
    onError: () => toast({ title: "Failed to update stop", variant: "destructive" }),
  });
  const deleteItem = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/trip-items/${id}`).then((r) => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/trips", selectedTrip?.id, "items"] }); },
    onError: () => toast({ title: "Failed to delete stop", variant: "destructive" }),
  });
  const toggleConfirmed = useMutation({
    mutationFn: ({ id, confirmed }: { id: number; confirmed: boolean }) => apiRequest("PATCH", `/api/trip-items/${id}`, { confirmed }).then((r) => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/trips", selectedTrip?.id, "items"] }); },
  });

  function openNewTrip() { setEditingTrip(null); setTripForm({ ...EMPTY_TRIP }); setTripModal(true); }
  function openEditTrip(t: Trip) { setEditingTrip(t); setTripForm({ name: t.name, destination: t.destination ?? "", startDate: t.startDate ?? "", endDate: t.endDate ?? "", emoji: t.emoji, notes: t.notes ?? "", coverColor: t.coverColor ?? "#6366f1" }); setTripModal(true); }
  function saveTripForm() {
    const payload = { ...tripForm, destination: tripForm.destination || null, startDate: tripForm.startDate || null, endDate: tripForm.endDate || null, notes: tripForm.notes || null };
    if (editingTrip) updateTrip.mutate({ id: editingTrip.id, data: payload });
    else createTrip.mutate(payload);
  }

  function openNewItem() { setEditingItem(null); setItemForm({ ...EMPTY_ITEM, date: selectedTrip?.startDate ?? "" }); setItemModal(true); }
  function openEditItem(item: TripItem) {
    setEditingItem(item);
    setItemForm({ name: item.name, address: item.address ?? "", date: item.date ?? "", time: item.time ?? "", duration: item.duration ?? "", notes: item.notes ?? "", type: item.type ?? "other", confirmed: item.confirmed, spotId: item.spotId });
    setItemModal(true);
  }
  function saveItemForm() {
    const payload = { ...itemForm, address: itemForm.address || null, date: itemForm.date || null, time: itemForm.time || null, duration: itemForm.duration || null, notes: itemForm.notes || null, spotId: itemForm.spotId || null };
    if (editingItem) updateItem.mutate({ id: editingItem.id, data: payload });
    else createItem.mutate(payload);
  }

  // Group trip items by date
  const itemsByDay = useMemo(() => {
    const map = new Map<string, TripItem[]>();
    for (const item of tripItems) {
      const key = item.date ?? "__unscheduled";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    // Sort keys: dates first (chronologically), then unscheduled
    const keys = Array.from(map.keys()).sort((a, b) => {
      if (a === "__unscheduled") return 1;
      if (b === "__unscheduled") return -1;
      return a.localeCompare(b);
    });
    return keys.map((k) => ({ date: k, items: map.get(k)! }));
  }, [tripItems]);

  // Generate day labels for the trip
  function getDayLabel(dateStr: string) {
    if (dateStr === "__unscheduled") return "Unscheduled";
    try {
      const d = parseISO(dateStr);
      const label = format(d, "EEEE, MMM d");
      if (selectedTrip?.startDate) {
        const start = parseISO(selectedTrip.startDate);
        const diff = Math.round((d.getTime() - start.getTime()) / 86400000);
        if (diff >= 0) return `Day ${diff + 1} · ${label}`;
      }
      return label;
    } catch { return dateStr; }
  }

  // Build date options for "which day" select
  function buildDateOptions() {
    if (!selectedTrip?.startDate) return [];
    const opts: { value: string; label: string }[] = [];
    const start = parseISO(selectedTrip.startDate);
    const end = selectedTrip.endDate ? parseISO(selectedTrip.endDate) : start;
    const days = Math.min(Math.round((end.getTime() - start.getTime()) / 86400000) + 1, 30);
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const val = format(d, "yyyy-MM-dd");
      opts.push({ value: val, label: `Day ${i + 1} · ${format(d, "EEE MMM d")}` });
    }
    return opts;
  }

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin text-muted-foreground" /></div>;

  // ─── Trip Detail View ──────────────────────────────────────────────────────
  if (selectedTrip) {
    const tripData = trips.find((t) => t.id === selectedTrip.id) ?? selectedTrip;
    const confirmedCount = tripItems.filter((i) => i.confirmed).length;
    return (
      <div>
        {/* Back + header */}
        <div className="flex items-start gap-3 mb-5">
          <button onClick={() => setSelectedTrip(null)} className="mt-0.5 p-1.5 rounded hover:bg-secondary transition-colors">
            <ChevronLeft size={18} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-2xl">{tripData.emoji}</span>
              <h2 className="text-lg font-bold">{tripData.name}</h2>
              {tripData.destination && <span className="text-sm text-muted-foreground">· {tripData.destination}</span>}
            </div>
            {(tripData.startDate || tripData.endDate) && (
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                <Calendar size={11} />
                {tripData.startDate && format(parseISO(tripData.startDate), "MMM d")}
                {tripData.startDate && tripData.endDate && " – "}
                {tripData.endDate && format(parseISO(tripData.endDate), "MMM d, yyyy")}
                {tripItems.length > 0 && <span className="ml-2">· {confirmedCount}/{tripItems.length} confirmed</span>}
              </p>
            )}
            {tripData.notes && <p className="text-xs text-muted-foreground mt-1 italic">{tripData.notes}</p>}
          </div>
          <div className="flex gap-1.5 shrink-0">
            <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={() => openEditTrip(tripData)}>
              <Pencil size={12} /> Edit
            </Button>
            <Button size="sm" onClick={openNewItem} className="gap-1.5 h-8 text-xs">
              <Plus size={12} /> Add Stop
            </Button>
          </div>
        </div>

        {/* Itinerary */}
        {itemsByDay.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Plane size={36} className="mx-auto mb-3 opacity-20" />
            <p className="text-sm font-medium">No stops yet</p>
            <p className="text-xs mt-1">Add restaurants, hotels, attractions, and more to plan your itinerary.</p>
            <Button size="sm" className="mt-4 gap-1.5" onClick={openNewItem}><Plus size={13} /> Add First Stop</Button>
          </div>
        ) : (
          <div className="space-y-5">
            {itemsByDay.map(({ date, items }) => (
              <div key={date}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {date === "__unscheduled" ? <StickyNote size={12} /> : <Sunrise size={12} />}
                    {getDayLabel(date)}
                  </div>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <div className="space-y-2">
                  {items.map((item) => {
                    const typeInfo = TRIP_ITEM_TYPES.find((t) => t.value === item.type) ?? TRIP_ITEM_TYPES[TRIP_ITEM_TYPES.length - 1];
                    return (
                      <div key={item.id} className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${item.confirmed ? "bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-800" : "bg-card"}`}>
                        <button
                          onClick={() => toggleConfirmed.mutate({ id: item.id, confirmed: !item.confirmed })}
                          className="mt-0.5 shrink-0 text-muted-foreground hover:text-green-600 transition-colors"
                          title={item.confirmed ? "Mark unconfirmed" : "Mark confirmed"}
                        >
                          {item.confirmed ? <CheckCircle2 size={18} className="text-green-600" /> : <Circle size={18} />}
                        </button>
                        <span className="text-lg shrink-0">{typeInfo.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium ${item.confirmed ? "text-green-800 dark:text-green-300" : ""}`}>{item.name}</p>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                            {item.time && <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock size={10} />{item.time}</span>}
                            {item.duration && <span className="text-xs text-muted-foreground">{item.duration}</span>}
                            {item.address && <span className="text-xs text-muted-foreground flex items-center gap-1"><MapPin size={10} />{item.address}</span>}
                          </div>
                          {item.notes && <p className="text-xs text-muted-foreground mt-1 italic">{item.notes}</p>}
                        </div>
                        <div className="flex gap-0.5 shrink-0">
                          <button onClick={() => openEditItem(item)} className="p-1.5 rounded hover:bg-secondary transition-colors">
                            <Pencil size={13} className="text-muted-foreground" />
                          </button>
                          <button onClick={() => deleteItem.mutate(item.id)} className="p-1.5 rounded hover:bg-secondary transition-colors">
                            <Trash2 size={13} className="text-muted-foreground hover:text-destructive" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* AI Trip Planner */}
        <AITripPlanner trip={tripData} />

        {/* Delete trip button */}
        <div className="mt-8 pt-4 border-t">
          <button
            onClick={() => { if (confirm("Delete this trip and all its stops?")) deleteTrip.mutate(tripData.id); }}
            className="text-xs text-destructive hover:underline"
          >
            Delete this trip
          </button>
        </div>

        {/* Add/Edit Stop Modal */}
        <Dialog open={itemModal} onOpenChange={setItemModal}>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editingItem ? "Edit Stop" : "Add Stop"}</DialogTitle></DialogHeader>
            <div className="space-y-3 pt-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Name *</label>
                <Input placeholder="e.g. Eiffel Tower" value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} />
              </div>
              {/* Or pick from existing spots */}
              {spots.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Or pick from your Spots</label>
                  <Select value={itemForm.spotId ? String(itemForm.spotId) : "_none"}
                    onValueChange={(v) => {
                      if (v === "_none") { setItemForm({ ...itemForm, spotId: null }); return; }
                      const spot = spots.find((s) => s.id === Number(v));
                      if (spot) setItemForm({ ...itemForm, spotId: spot.id, name: spot.name, address: spot.address ?? "", type: spot.type ?? "other" });
                    }}>
                    <SelectTrigger><SelectValue placeholder="Select a saved spot…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">— none —</SelectItem>
                      {spots.map((s) => {
                        const emoji = SPOT_TYPES.find((t) => t.value === s.type)?.emoji ?? "📍";
                        return <SelectItem key={s.id} value={String(s.id)}>{emoji} {s.name}{s.city ? ` (${s.city})` : ""}</SelectItem>;
                      })}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Type</label>
                  <Select value={itemForm.type} onValueChange={(v) => setItemForm({ ...itemForm, type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{TRIP_ITEM_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.emoji} {t.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Day</label>
                  {buildDateOptions().length > 0 ? (
                    <Select value={itemForm.date || "_none"} onValueChange={(v) => setItemForm({ ...itemForm, date: v === "_none" ? "" : v })}>
                      <SelectTrigger><SelectValue placeholder="Pick a day" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">Unscheduled</SelectItem>
                        {buildDateOptions().map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input type="date" value={itemForm.date} onChange={(e) => setItemForm({ ...itemForm, date: e.target.value })} />
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Time</label>
                  <Input placeholder="e.g. 9:00 AM" value={itemForm.time} onChange={(e) => setItemForm({ ...itemForm, time: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Duration</label>
                  <Input placeholder="e.g. 2 hours" value={itemForm.duration} onChange={(e) => setItemForm({ ...itemForm, duration: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Address</label>
                <Input placeholder="Optional" value={itemForm.address} onChange={(e) => setItemForm({ ...itemForm, address: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes</label>
                <Textarea placeholder="Reservation info, tips, etc." rows={2} value={itemForm.notes} onChange={(e) => setItemForm({ ...itemForm, notes: e.target.value })} />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={itemForm.confirmed} onChange={(e) => setItemForm({ ...itemForm, confirmed: e.target.checked })} className="w-4 h-4 rounded" />
                <span className="text-sm">Confirmed / Booked</span>
              </label>
              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={() => setItemModal(false)}>Cancel</Button>
                <Button className="flex-1" onClick={saveItemForm} disabled={!itemForm.name.trim() || createItem.isPending || updateItem.isPending}>
                  {editingItem ? "Save Changes" : "Add Stop"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit Trip Modal (accessible from detail view) */}
        <Dialog open={tripModal} onOpenChange={setTripModal}>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Edit Trip</DialogTitle></DialogHeader>
            <div className="space-y-3 pt-2">
              <div className="grid grid-cols-[60px_1fr] gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Emoji</label>
                  <Input value={tripForm.emoji} onChange={(e) => setTripForm({ ...tripForm, emoji: e.target.value })} className="text-center text-xl" maxLength={2} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Trip Name *</label>
                  <Input placeholder="e.g. Paris Summer 2026" value={tripForm.name} onChange={(e) => setTripForm({ ...tripForm, name: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Destination</label>
                <Input placeholder="e.g. Paris, France" value={tripForm.destination} onChange={(e) => setTripForm({ ...tripForm, destination: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Start Date</label>
                  <Input type="date" value={tripForm.startDate} onChange={(e) => setTripForm({ ...tripForm, startDate: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">End Date</label>
                  <Input type="date" value={tripForm.endDate} onChange={(e) => setTripForm({ ...tripForm, endDate: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Color</label>
                <div className="flex gap-2 flex-wrap">
                  {COVER_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setTripForm({ ...tripForm, coverColor: c })}
                      className={`w-7 h-7 rounded-full transition-transform ${tripForm.coverColor === c ? "ring-2 ring-offset-2 ring-foreground scale-110" : ""}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes</label>
                <Textarea placeholder="Budget, packing list, hotel info…" rows={3} value={tripForm.notes} onChange={(e) => setTripForm({ ...tripForm, notes: e.target.value })} />
              </div>
              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={() => setTripModal(false)}>Cancel</Button>
                <Button className="flex-1" onClick={saveTripForm} disabled={!tripForm.name.trim() || updateTrip.isPending}>
                  Save Changes
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ─── Trips List View ───────────────────────────────────────────────────────
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2"><Plane size={16} className="text-primary" /> Trip Planning</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Plan itineraries with day-by-day stops</p>
        </div>
        <Button size="sm" onClick={openNewTrip} className="gap-1.5">
          <Plus size={13} /> New Trip
        </Button>
      </div>

      {trips.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Plane size={40} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium">No trips yet</p>
          <p className="text-xs mt-1">Create your first trip to start planning your itinerary.</p>
          <Button size="sm" className="mt-4 gap-1.5" onClick={openNewTrip}><Plus size={13} /> Create Trip</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {trips.map((trip) => (
            <button
              key={trip.id}
              onClick={() => setSelectedTrip(trip)}
              className="text-left rounded-xl border p-4 hover:shadow-md transition-all group relative overflow-hidden"
              style={{ borderLeftWidth: 4, borderLeftColor: trip.coverColor ?? "#6366f1" }}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl">{trip.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm group-hover:text-primary transition-colors">{trip.name}</p>
                  {trip.destination && <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1"><Navigation size={10} />{trip.destination}</p>}
                  {(trip.startDate || trip.endDate) && (
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                      <Calendar size={10} />
                      {trip.startDate && format(parseISO(trip.startDate), "MMM d")}
                      {trip.startDate && trip.endDate && " – "}
                      {trip.endDate && format(parseISO(trip.endDate), "MMM d, yyyy")}
                    </p>
                  )}
                  {trip.notes && <p className="text-xs text-muted-foreground mt-1 italic line-clamp-2">{trip.notes}</p>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Create/Edit Trip Modal */}
      <Dialog open={tripModal} onOpenChange={setTripModal}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingTrip ? "Edit Trip" : "New Trip"}</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-[60px_1fr] gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Emoji</label>
                <Input value={tripForm.emoji} onChange={(e) => setTripForm({ ...tripForm, emoji: e.target.value })} className="text-center text-xl" maxLength={2} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Trip Name *</label>
                <Input placeholder="e.g. Paris Summer 2026" value={tripForm.name} onChange={(e) => setTripForm({ ...tripForm, name: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Destination</label>
              <Input placeholder="e.g. Paris, France" value={tripForm.destination} onChange={(e) => setTripForm({ ...tripForm, destination: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Start Date</label>
                <Input type="date" value={tripForm.startDate} onChange={(e) => setTripForm({ ...tripForm, startDate: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">End Date</label>
                <Input type="date" value={tripForm.endDate} onChange={(e) => setTripForm({ ...tripForm, endDate: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Color</label>
              <div className="flex gap-2 flex-wrap">
                {COVER_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setTripForm({ ...tripForm, coverColor: c })}
                    className={`w-7 h-7 rounded-full transition-transform ${tripForm.coverColor === c ? "ring-2 ring-offset-2 ring-foreground scale-110" : ""}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes</label>
              <Textarea placeholder="Budget, packing list, hotel info…" rows={3} value={tripForm.notes} onChange={(e) => setTripForm({ ...tripForm, notes: e.target.value })} />
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setTripModal(false)}>Cancel</Button>
              <Button className="flex-1" onClick={saveTripForm} disabled={!tripForm.name.trim() || createTrip.isPending || updateTrip.isPending}>
                {editingTrip ? "Save Changes" : "Create Trip"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
