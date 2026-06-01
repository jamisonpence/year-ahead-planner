// Places domain: Saved / Visited / Collections / Map | Travel: Upcoming / Past / Itineraries / Logistics
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Spot, SpotShareWithUser, PublicUser, Trip, TripItem, VisitedCity, SpotFolder, TabCollaborationWithUser } from "@shared/schema";
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
  SlidersHorizontal, List, Map as MapIcon, CheckCheck, Share2,
  FolderOpen, FolderPlus, FolderEdit, Users,
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
  want_to_visit: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  visited:       "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  favorite:      "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

const PRICE_LABELS = ["", "$", "$$", "$$$", "$$$$"];

const EMPTY_FORM = {
  name: "", type: "restaurant", address: "", neighborhood: "", city: "",
  status: "want_to_visit", rating: "" as string | number, notes: "", website: "",
  priceRange: "" as string | number, tags: "", visitedDate: "", isFavorite: false, openingHours: "",
  lat: null as number | null, lon: null as number | null,
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
      lat: parseFloat(r.lat),
      lon: parseFloat(r.lon),
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

// ── Bottom Sheet ──────────────────────────────────────────────────────────────

function BottomSheet({ open, onClose, title, children, maxHeight = "80vh" }: {
  open: boolean; onClose: () => void; title?: string; children: React.ReactNode; maxHeight?: string;
}) {
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      {/* Sheet */}
      <div className="relative bg-card rounded-t-2xl shadow-2xl flex flex-col animate-in slide-in-from-bottom-4 duration-200"
        style={{ maxHeight }}>
        {/* Handle */}
        <div className="flex justify-center pt-2.5 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>
        {title && (
          <div className="flex items-center justify-between px-4 pb-3 shrink-0">
            <h3 className="font-semibold text-base">{title}</h3>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary">
              <X size={16} className="text-muted-foreground" />
            </button>
          </div>
        )}
        <div className="overflow-y-auto flex-1 pb-safe">
          {children}
        </div>
      </div>
    </div>
  );
}

// ── Type thumbnail background ─────────────────────────────────────────────────
const TYPE_THUMB: Record<string, string> = {
  restaurant: "bg-orange-100 text-orange-500",
  bar:        "bg-purple-100 text-purple-500",
  cafe:       "bg-amber-100 text-amber-500",
  park:       "bg-green-100 text-green-500",
  trail:      "bg-teal-100 text-teal-500",
  shop:       "bg-pink-100 text-pink-500",
  service:    "bg-slate-100 text-slate-500",
  attraction: "bg-blue-100 text-blue-500",
  hotel:      "bg-indigo-100 text-indigo-500",
  other:      "bg-gray-100 text-gray-500",
};

// Status-based top border color
const STATUS_ACCENT_BAR: Record<string, string> = {
  want_to_visit: "bg-orange-400",
  visited:       "bg-green-500",
  favorite:      "bg-red-500",
};

// ── Spot Card ─────────────────────────────────────────────────────────────────

function SpotCard({ spot, onEdit, onDelete, onToggleFav, onShare, onAddToTrip, onCreateTrip, onRate }: {
  spot: Spot;
  onEdit: () => void;
  onDelete: () => void;
  onToggleFav: () => void;
  onShare: () => void;
  onAddToTrip: () => void;
  onCreateTrip: () => void;
  onRate: (rating: number) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = [spot.neighborhood, spot.city].filter(Boolean).join(", ");
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([spot.name, spot.address, spot.city].filter(Boolean).join(", "))}`;
  const thumbBg = TYPE_THUMB[spot.type] ?? "bg-gray-100 text-gray-500";
  const accentBar = STATUS_ACCENT_BAR[spot.isFavorite ? "favorite" : spot.status] ?? "bg-gray-300";

  const statusLabel =
    spot.isFavorite ? "❤️ Favorite" :
    spot.status === "visited" ? "✓ Visited" :
    "Want to Visit";
  const statusColor =
    spot.isFavorite ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" :
    spot.status === "visited" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
    "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";

  return (
    <>
      <div className="rounded-xl border bg-card overflow-hidden active:opacity-90 transition-opacity">


        <div className="flex gap-3 p-3">
          {/* Left thumbnail */}
          <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-2xl shrink-0 ${thumbBg}`}>
            {typeEmoji(spot.type)}
          </div>

          {/* Right content */}
          <div className="flex-1 min-w-0">
            {/* Name row + heart + three-dot */}
            <div className="flex items-start gap-1 -mr-1.5 -mt-0.5">
              <p className="font-semibold text-sm leading-snug flex-1 pr-1">{spot.name}</p>
              <button
                onClick={onToggleFav}
                className={`p-1.5 rounded-lg shrink-0 transition-colors ${spot.isFavorite ? "text-red-500" : "text-muted-foreground/40 hover:text-red-400"}`}
              >
                <Heart size={15} fill={spot.isFavorite ? "currentColor" : "none"} />
              </button>
              <button
                onClick={() => setMenuOpen(true)}
                className="p-1.5 rounded-lg shrink-0 text-muted-foreground hover:bg-secondary transition-colors"
              >
                <span className="text-base leading-none font-bold tracking-wider">⋯</span>
              </button>
            </div>

            {/* Location */}
            {location && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1.5">
                <Navigation size={9} className="shrink-0" />{location}
              </p>
            )}



            {/* Star rating — always shown, tappable */}
            <div className="flex gap-0.5 mt-1.5">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => onRate(n === spot.rating ? 0 : n)}
                  className={`text-sm transition-colors ${(spot.rating ?? 0) >= n ? "text-yellow-400" : "text-muted-foreground/25 hover:text-yellow-300"}`}
                >
                  ★
                </button>
              ))}
            </div>

            {/* Notes (compact, one-line) */}
            {spot.notes && (
              <p className="text-xs text-muted-foreground italic mt-1 line-clamp-1">{spot.notes}</p>
            )}
          </div>
        </div>
      </div>

      {/* Overflow menu bottom sheet */}
      <BottomSheet open={menuOpen} onClose={() => setMenuOpen(false)}>
        <div className="px-4 pb-6 space-y-1">
          <p className="text-xs text-muted-foreground font-medium px-2 pb-2">{spot.name}</p>
          {[
            { icon: <Pencil size={17} />, label: "Edit place", action: () => { setMenuOpen(false); onEdit(); } },
            { icon: <Plane size={17} />, label: "Add to Existing Trip", action: () => { setMenuOpen(false); onAddToTrip(); } },
            { icon: <Plus size={17} />, label: "Create Trip from Here", action: () => { setMenuOpen(false); onCreateTrip(); } },
            { icon: <Send size={17} />, label: "Share with friend", action: () => { setMenuOpen(false); onShare(); } },
            { icon: <Navigation size={17} />, label: "Get directions", href: mapsUrl },
            ...(spot.website ? [{ icon: <Globe size={17} />, label: "Open website", href: spot.website.startsWith("http") ? spot.website : `https://${spot.website}` }] : []),
            { icon: <Trash2 size={17} className="text-destructive" />, label: <span className="text-destructive">Delete</span>, action: () => { setMenuOpen(false); onDelete(); } },
          ].map((item, i) =>
            "href" in item ? (
              <a key={i} href={item.href} target="_blank" rel="noopener noreferrer"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 w-full px-3 py-3.5 rounded-xl hover:bg-secondary transition-colors text-sm">
                <span className="text-muted-foreground">{item.icon}</span>
                {item.label}
              </a>
            ) : (
              <button key={i} onClick={item.action}
                className="flex items-center gap-3 w-full px-3 py-3.5 rounded-xl hover:bg-secondary transition-colors text-sm text-left">
                <span className="text-muted-foreground">{item.icon}</span>
                {item.label}
              </button>
            )
          )}
        </div>
      </BottomSheet>
    </>
  );
}

// ── Map View ──────────────────────────────────────────────────────────────────

function MapView({ spots }: { spots: Spot[] }) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);

  const mappable = spots.filter(s => s.lat != null && s.lon != null);
  const unmappableCount = spots.length - mappable.length;

  useEffect(() => {
    if (!mapContainerRef.current) return;
    let unmounted = false;

    function initMap() {
      if (unmounted) return;
      const L = (window as any).L;
      if (!L || !mapContainerRef.current) return;
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }

      const defaultCenter: [number, number] = mappable.length > 0
        ? [mappable[0].lat!, mappable[0].lon!]
        : [39.5, -98.35]; // center of US

      const map = L.map(mapContainerRef.current, { zoomControl: true }).setView(defaultCenter, 13);
      mapInstanceRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      const TYPE_PIN_COLOR: Record<string, string> = {
        restaurant: "#f97316", bar: "#a855f7", cafe: "#f59e0b",
        park: "#22c55e", trail: "#14b8a6", shop: "#ec4899",
        service: "#64748b", attraction: "#3b82f6", hotel: "#6366f1", other: "#6b7280",
      };

      mappable.forEach(spot => {
        const color = TYPE_PIN_COLOR[spot.type] ?? "#6b7280";
        const iconHtml = `<div style="
          width:32px;height:32px;border-radius:50% 50% 50% 0;
          background:${color};border:2px solid white;
          transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,0.3);
          display:flex;align-items:center;justify-content:center;">
        </div>`;
        const icon = L.divIcon({ html: iconHtml, className: "", iconSize: [32, 32], iconAnchor: [16, 32] });
        const marker = L.marker([spot.lat!, spot.lon!], { icon }).addTo(map);
        marker.on("click", () => setSelectedSpot(spot));
      });

      if (mappable.length > 1) {
        const bounds = L.latLngBounds(mappable.map(s => [s.lat!, s.lon!]));
        map.fitBounds(bounds, { padding: [40, 40] });
      }
    }

    // Load Leaflet CSS
    if (!document.querySelector('link[href*="leaflet"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }

    let script: HTMLScriptElement | null = null;
    if ((window as any).L) {
      initMap();
    } else {
      script = document.createElement("script");
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.onload = initMap;
      document.head.appendChild(script);
    }

    return () => {
      unmounted = true;
      if (script) { script.onload = null; }
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
    };
  }, [JSON.stringify(mappable.map(s => s.id + s.lat + s.lon))]);

  return (
    <div className="relative">
      {mappable.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 border rounded-xl text-muted-foreground gap-2">
          <MapPin size={32} className="opacity-20" />
          <p className="text-sm font-medium">No spots with location data</p>
          <p className="text-xs text-center max-w-xs">Add spots via the Search button to automatically capture their coordinates for mapping.</p>
        </div>
      ) : (
        <div ref={mapContainerRef} className="h-[500px] rounded-xl overflow-hidden border" style={{ zIndex: 0 }} />
      )}

      {unmappableCount > 0 && (
        <p className="text-xs text-muted-foreground text-center mt-2">
          {unmappableCount} spot{unmappableCount !== 1 ? "s" : ""} without coordinates not shown on map
        </p>
      )}

      {/* Bottom sheet for selected spot */}
      {selectedSpot && (
        <div className="absolute bottom-0 left-0 right-0 bg-card border-t rounded-t-2xl p-4 shadow-2xl z-50 animate-in slide-in-from-bottom-4">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{SPOT_TYPES.find(t => t.value === selectedSpot.type)?.emoji ?? "📍"}</span>
              <div>
                <p className="font-semibold">{selectedSpot.name}</p>
                {(selectedSpot.neighborhood || selectedSpot.city) && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Navigation size={10} />
                    {[selectedSpot.neighborhood, selectedSpot.city].filter(Boolean).join(", ")}
                  </p>
                )}
              </div>
            </div>
            <button onClick={() => setSelectedSpot(null)} className="p-1.5 rounded-lg hover:bg-secondary">
              <X size={16} className="text-muted-foreground" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {selectedSpot.address && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([selectedSpot.name, selectedSpot.address, selectedSpot.city].filter(Boolean).join(', '))}`}
                target="_blank" rel="noopener noreferrer"
                className="text-xs text-blue-500 hover:underline flex items-center gap-1"
              >
                <Navigation size={10} /> Directions
              </a>
            )}
            {selectedSpot.website && (
              <a
                href={selectedSpot.website.startsWith("http") ? selectedSpot.website : `https://${selectedSpot.website}`}
                target="_blank" rel="noopener noreferrer"
                className="text-xs text-blue-500 hover:underline flex items-center gap-1"
              >
                <Globe size={10} /> Website
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Add to Trip Modal ─────────────────────────────────────────────────────────

function AddToTripModal({ spot, onClose }: { spot: Spot; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: trips = [] } = useQuery<any[]>({ queryKey: ["/api/trips"] });

  const addItemMut = useMutation({
    mutationFn: (tripId: number) => apiRequest("POST", `/api/trips/${tripId}/items`, {
      name: spot.name,
      type: spot.type,
      address: spot.address ?? null,
      date: null, time: null, duration: null,
      notes: spot.notes ?? null,
      spotId: spot.id,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/trips"] });
      toast({ title: `${spot.name} added to trip!` });
      onClose();
    },
    onError: () => toast({ title: "Failed to add to trip", variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plane size={16} className="text-primary" /> Add to Trip
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground mb-3">Select a trip to add <strong>{spot.name}</strong> to:</p>
        {trips.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Plane size={28} className="mx-auto mb-2 opacity-20" />
            <p className="text-sm">No trips yet. Create a trip in the Trips tab first.</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {trips.map((trip: any) => (
              <button
                key={trip.id}
                onClick={() => addItemMut.mutate(trip.id)}
                disabled={addItemMut.isPending}
                className="w-full text-left flex items-center gap-3 p-3 rounded-lg border hover:bg-secondary transition-colors"
              >
                <Plane size={14} className="text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{trip.name}</p>
                  {trip.destination && <p className="text-xs text-muted-foreground truncate">{trip.destination}</p>}
                </div>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Create Trip from Place Modal ──────────────────────────────────────────────

function CreateTripFromPlaceModal({ spot, onClose }: { spot: Spot; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState(`Trip to ${spot.city || spot.name}`);
  const [destination, setDestination] = useState(spot.city || spot.name);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const createTrip = useMutation({
    mutationFn: async (data: any) => {
      const r = await apiRequest("POST", "/api/trips", data);
      return r.json();
    },
    onSuccess: async (trip: any) => {
      // Auto-link the spot as the first item
      await apiRequest("POST", `/api/trips/${trip.id}/items`, {
        name: spot.name, type: spot.type,
        address: spot.address ?? null,
        date: null, time: null, duration: null,
        notes: spot.notes ?? null, spotId: spot.id,
      });
      qc.invalidateQueries({ queryKey: ["/api/trips"] });
      toast({ title: `Trip created! ${spot.name} added as first stop.` });
      onClose();
    },
    onError: () => toast({ title: "Failed to create trip", variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plane size={16} className="text-primary" /> Create Trip from Place
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-1">Starting from <strong>{spot.name}</strong></p>
        <div className="space-y-3 pt-1">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Trip Name</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Weekend in Nashville" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Destination</label>
            <Input value={destination} onChange={e => setDestination(e.target.value)} placeholder="City or region" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Start Date</label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">End Date</label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>
          <Button
            className="w-full gap-2"
            disabled={!name.trim() || createTrip.isPending}
            onClick={() => createTrip.mutate({
              name: name.trim(), destination: destination || null,
              startDate: startDate || null, endDate: endDate || null,
              emoji: "✈️", notes: null, coverColor: "#6366f1",
            })}
          >
            <Plus size={14} /> Create Trip
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Trip Planner Modal ────────────────────────────────────────────────────────

function TripPlannerModal({ open, onClose, spots }: { open: boolean; onClose: () => void; spots: Spot[] }) {
  const { toast } = useToast();
  const [city, setCity] = useState("");
  const [duration, setDuration] = useState<"day" | "weekend">("day");
  const [vibe, setVibe] = useState("");
  const [budget, setBudget] = useState("moderate ($$)");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [plan, setPlan] = useState("");
  const [loading, setLoading] = useState(false);

  const VIBES = [
    { value: "romantic date night", label: "💑 Romantic" },
    { value: "family fun with kids", label: "👨‍👩‍👧 Family" },
    { value: "outdoorsy adventure", label: "🥾 Outdoorsy" },
    { value: "foodie exploration", label: "🍽️ Foodie" },
    { value: "cultural and arts", label: "🎨 Cultural" },
    { value: "relaxing and chill", label: "😌 Relaxed" },
    { value: "nightlife and bars", label: "🍸 Nightlife" },
    { value: "shopping and exploration", label: "🛍️ Shopping" },
  ];

  const BUDGETS = [
    { value: "budget-friendly ($)", label: "$ Budget" },
    { value: "moderate ($$)", label: "$$ Moderate" },
    { value: "upscale ($$$)", label: "$$$ Upscale" },
    { value: "luxury ($$$$)", label: "$$$$ Luxury" },
  ];

  async function handleGenerate() {
    if (!city.trim() || !vibe) {
      toast({ title: "Please fill in city and vibe", variant: "destructive" });
      return;
    }
    setLoading(true);
    setPlan("");
    try {
      const res = await apiRequest("POST", "/api/spots/plan-trip", { city, duration, vibe, budget, date, notes });
      if (!res.ok) {
        const err = await res.json();
        if (err.error === "no_api_key") {
          toast({ title: "Anthropic API key required", description: "Add your key in Settings to use AI features.", variant: "destructive" });
        } else {
          toast({ title: err.message ?? "Error generating plan", variant: "destructive" });
        }
        return;
      }
      const data = await res.json();
      setPlan(data.plan ?? "");
    } catch {
      toast({ title: "Failed to generate plan", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  function reset() { setPlan(""); setCity(""); setVibe(""); setDate(""); setNotes(""); }

  const citySpotsCount = city ? spots.filter(s => s.city?.toLowerCase().includes(city.toLowerCase())).length : 0;

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) { onClose(); if (!loading) reset(); } }}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-4 shrink-0 border-b">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Sparkles size={18} className="text-primary" />
            Plan My {duration === "day" ? "Day" : "Weekend"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {!plan ? (
            <div className="px-6 py-4 space-y-5">
              {/* Duration toggle */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Duration</label>
                <div className="grid grid-cols-2 gap-2">
                  {(["day", "weekend"] as const).map(d => (
                    <button key={d} onClick={() => setDuration(d)}
                      className={`py-2.5 rounded-lg border text-sm font-medium transition-all ${duration === d ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/40"}`}>
                      {d === "day" ? "🌅 One Day" : "🗓️ Full Weekend"}
                    </button>
                  ))}
                </div>
              </div>

              {/* City */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">City / Destination</label>
                <Input placeholder="e.g. Austin, Chicago, NYC…" value={city} onChange={e => setCity(e.target.value)} />
                {citySpotsCount > 0 && (
                  <p className="text-xs text-primary mt-1">✓ {citySpotsCount} saved spot{citySpotsCount !== 1 ? "s" : ""} in this city will be included</p>
                )}
              </div>

              {/* Vibe */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Vibe</label>
                <div className="flex flex-wrap gap-2">
                  {VIBES.map(v => (
                    <button key={v.value} onClick={() => setVibe(v.value)}
                      className={`px-3 py-1.5 rounded-full text-sm border transition-all ${vibe === v.value ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/40"}`}>
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Budget */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Budget</label>
                <div className="grid grid-cols-4 gap-2">
                  {BUDGETS.map(b => (
                    <button key={b.value} onClick={() => setBudget(b.value)}
                      className={`py-2 rounded-lg border text-xs font-medium transition-all ${budget === b.value ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/40"}`}>
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date + Notes */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Date (optional)</label>
                  <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Special requests</label>
                  <Input placeholder="e.g. No seafood, dog-friendly…" value={notes} onChange={e => setNotes(e.target.value)} />
                </div>
              </div>

              <Button className="w-full gap-2 h-11" onClick={handleGenerate} disabled={loading || !city.trim() || !vibe}>
                {loading ? <><Loader2 size={15} className="animate-spin" /> Crafting your plan…</> : <><Sparkles size={15} /> Generate Plan</>}
              </Button>
            </div>
          ) : (
            <div className="px-6 py-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-base">Your {duration === "day" ? "Day" : "Weekend"} in {city}</h3>
                <Button variant="outline" size="sm" onClick={reset} className="gap-1.5 text-xs"><RefreshCw size={12} /> New Plan</Button>
              </div>
              {/* Render the plan as formatted text */}
              <div className="space-y-2">
                {plan.split('\n').map((line, i) => {
                  if (!line.trim()) return <div key={i} className="h-2" />;
                  if (line.startsWith('**SECTION')) return (
                    <div key={i} className="mt-6 mb-3 pb-2 border-b">
                      <h2 className="font-bold text-base text-foreground">{line.replace(/\*\*/g, '')}</h2>
                    </div>
                  );
                  if (line.startsWith('**') && line.endsWith('**')) return (
                    <p key={i} className="font-semibold text-sm text-foreground mt-4">{line.replace(/\*\*/g, '')}</p>
                  );
                  if (/^\*\*\d{1,2}:\d{2}/.test(line)) return (
                    <div key={i} className="flex gap-3 py-2 border-l-2 border-primary/30 pl-3">
                      <span className="text-sm">{line.replace(/\*\*/g, '')}</span>
                    </div>
                  );
                  if (line.startsWith('- ')) return (
                    <div key={i} className="flex gap-2 text-sm text-muted-foreground pl-2">
                      <span className="shrink-0">•</span>
                      <span>{line.slice(2)}</span>
                    </div>
                  );
                  return <p key={i} className="text-sm text-muted-foreground leading-relaxed">{line}</p>;
                })}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SpotsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterTag, setFilterTag] = useState("all");
  const [filterCity, setFilterCity] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [nominatimOpen, setNominatimOpen] = useState(false);
  const [editing, setEditing] = useState<Spot | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  // Route-locked: /spots = Places only, /travel = Trips only
  const isTravelRoute = window.location.hash === "#/travel" || window.location.pathname === "/travel";
  const [travelSubTab, setTravelSubTab] = useState<"upcoming" | "past" | "visited">("upcoming");
  const [placesSubTab, setPlacesSubTab] = useState("saved");
  const [createTripSpot, setCreateTripSpot] = useState<Spot | null>(null);
  const [shareSpot, setShareSpot] = useState<Spot | null>(null);
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [addToTripSpot, setAddToTripSpot] = useState<Spot | null>(null);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [collapsedTypes, setCollapsedTypes] = useState<Set<string>>(
    new Set(SPOT_TYPES.map(t => t.value))   // all collapsed by default
  );
  // Spot folder state — all collapsed by default
  const [collapsedFolders, setCollapsedFolders] = useState<Set<number>>(new Set());
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderEmoji, setNewFolderEmoji] = useState("📁");
  const [showNewFolderForm, setShowNewFolderForm] = useState(false);
  const [editingFolderId, setEditingFolderId] = useState<number | null>(null);
  const [editFolderName, setEditFolderName] = useState("");
  const [editFolderEmoji, setEditFolderEmoji] = useState("");
  const [assigningSpot, setAssigningSpot] = useState<Spot | null>(null);
  const [addingToFolderId, setAddingToFolderId] = useState<number | null>(null);
  const [addToFolderSearch, setAddToFolderSearch] = useState("");
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("shared") === "1") {
      setPlacesSubTab("shared");
    }
  }, []);
  useEffect(() => {
    if (isTravelRoute || placesSubTab !== "shared") return;
    apiRequest("POST", "/api/shares/mark-read", { type: "spots" })
      .then(() => qc.invalidateQueries({ queryKey: ["/api/shares/count"] })).catch(() => {});
  }, [isTravelRoute, placesSubTab]);

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
  const rateMut = useMutation({
    mutationFn: ({ id, rating }: { id: number; rating: number }) =>
      apiRequest("PATCH", `/api/spots/${id}`, { rating: rating === 0 ? null : rating }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/spots"] }),
  });

  const csvRef = useRef<HTMLInputElement>(null);

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
      lat: s.lat ?? null, lon: s.lon ?? null,
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
      const matchTag = filterTag === "all" || (s.tags ?? "").split(",").map((t) => t.trim()).includes(filterTag);
      const matchCity = filterCity === "all" || s.city === filterCity;
      return matchSearch && matchType && matchTag && matchCity;
    });
  }

  const tabSpots: Record<string, Spot[]> = {
    all:           applyFilters(spots),
    saved:         applyFilters(spots),
    favorites:     applyFilters(spots.filter((s) => s.isFavorite)),
    want_to_visit: applyFilters(spots.filter((s) => s.status === "want_to_visit")),
  };

  // For "collections" tab: group spots by their tags
  const allTagGroups = useMemo(() => {
    const groups: Record<string, Spot[]> = {};
    spots.forEach(s => {
      const tags = (s.tags ?? "").split(",").map(t => t.trim()).filter(Boolean);
      tags.forEach(tag => {
        if (!groups[tag]) groups[tag] = [];
        groups[tag].push(s);
      });
    });
    return groups;
  }, [spots]);

  const displaySpots = tabSpots[placesSubTab] ?? tabSpots.saved;

  // ── Places collaboration ─────────────────────────────────────────────────────
  const { data: allCollabs = [] } = useQuery<TabCollaborationWithUser[]>({
    queryKey: ["/api/tab-collaborations"],
    queryFn: () => apiRequest("GET", "/api/tab-collaborations").then(r => r.json()),
  });
  const placesCollab = allCollabs.find(c => c.tabName === "places" && c.status === "accepted");

  // ── Spot Folders ─────────────────────────────────────────────────────────────
  const { data: spotFolders = [] } = useQuery<SpotFolder[]>({
    queryKey: ["/api/spot-folders"],
    queryFn: () => apiRequest("GET", "/api/spot-folders").then(r => r.json()),
  });
  const createFolder = useMutation({
    mutationFn: (data: { name: string; emoji: string }) => apiRequest("POST", "/api/spot-folders", data).then(r => r.json()),
    onSuccess: (f: SpotFolder) => {
      qc.invalidateQueries({ queryKey: ["/api/spot-folders"] });
      setShowNewFolderForm(false); setNewFolderName(""); setNewFolderEmoji("📁");
      // Auto-expand newly created folder
      setCollapsedFolders(prev => { const next = new Set(prev); next.delete(f.id); return next; });
    },
  });
  const updateFolder = useMutation({
    mutationFn: ({ id, ...data }: { id: number; name: string; emoji: string }) => apiRequest("PATCH", `/api/spot-folders/${id}`, data).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/spot-folders"] }); setEditingFolderId(null); },
  });
  const deleteFolder = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/spot-folders/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/spot-folders", "/api/spots"] }),
  });
  const addToFolder = useMutation({
    mutationFn: ({ spotId, folderId }: { spotId: number; folderId: number }) =>
      apiRequest("POST", "/api/spot-folder-members", { spotId, folderId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/spots"] }),
  });
  const removeFromFolder = useMutation({
    mutationFn: ({ spotId, folderId }: { spotId: number; folderId: number }) =>
      apiRequest("DELETE", "/api/spot-folder-members", { spotId, folderId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/spots"] }),
  });

  return (
    <div className="flex flex-col h-full">

      {/* ══ Page header ══════════════════════════════════════════════════════ */}
      {!isTravelRoute ? (
        <div className="px-5 py-4 border-b flex items-center justify-between gap-3 flex-wrap shrink-0">
          <div>
            <h1 className="text-xl font-bold">Places</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Spots you've saved, visited, or want to explore</p>
            {placesCollab && (
              <div className="flex items-center gap-1.5 mt-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-300">
                <Users size={11} className="shrink-0" />
                <span>
                  {placesCollab.role === "collaborator"
                    ? <>Viewing & editing <strong>{placesCollab.otherUser.name}</strong>'s places</>
                    : <><strong>{placesCollab.otherUser.name}</strong> can view and edit your places</>}
                </span>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setNominatimOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full border border-border hover:bg-secondary transition-colors"
            >
              <Search size={13} /> Find &amp; Add
            </button>
            <button
              onClick={openNew}
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-full border border-border hover:bg-secondary transition-colors"
            >
              <Plus size={13} /> Manual
            </button>
          </div>
        </div>
      ) : (
        <div className="px-5 py-4 border-b flex items-center justify-between gap-3 flex-wrap shrink-0">
          <div>
            <h1 className="text-xl font-bold">Trips</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Travel planning, itineraries, and history</p>
          </div>
          <a href="#/spots" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
            <MapPin size={11} /> Places →
          </a>
        </div>
      )}

      {/* ══ PLACES ═══════════════════════════════════════════════════════════ */}
      {!isTravelRoute && (
        <>
          {/* Search + Filters + Map toggle */}
          {placesSubTab !== "shared" && placesSubTab !== "map" && placesSubTab !== "collections" && (
            <div className="px-3 pt-3 pb-2 space-y-2">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  <Input
                    className="pl-9 h-10 rounded-xl bg-secondary border-transparent focus:border-border text-sm"
                    placeholder="Search places…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  {search && (
                    <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      <X size={14} />
                    </button>
                  )}
                </div>
                <button
                  onClick={() => setFilterSheetOpen(true)}
                  className={`flex items-center gap-1.5 h-10 px-3 rounded-xl border text-sm font-medium shrink-0 transition-colors relative ${
                    (filterType !== "all" || filterCity !== "all")
                      ? "border-primary text-primary bg-primary/5"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <SlidersHorizontal size={14} />
                  Filters
                  {(filterType !== "all" || filterCity !== "all") && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-primary" />
                  )}
                </button>
                <button
                  onClick={() => setPlacesSubTab("map")}
                  className="h-10 px-3 flex items-center gap-1.5 rounded-xl border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shrink-0"
                >
                  <MapIcon size={14} /> Map
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPlannerOpen(true)}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-full text-white bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-700 hover:to-violet-700 shadow-sm transition-all"
                >
                  <Sparkles size={13} /> Plan My Day
                </button>
              </div>
            </div>
          )}

          {/* Places sub-tabs: Saved | Visited | Collections | Map | Shared */}
          <div className="overflow-x-auto scrollbar-hide px-3 pb-2 shrink-0">
            <div className="flex gap-1 w-max">
              {[
                { value: "saved",       label: `Saved (${tabSpots.saved.length})` },
                { value: "collections", label: `Collections (${Object.keys(allTagGroups).length})` },
                { value: "map",         label: "🗺 Map" },
                { value: "shared",      label: "Shared" },
              ].map(tab => (
                <button
                  key={tab.value}
                  onClick={() => setPlacesSubTab(tab.value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                    placesSubTab === tab.value
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Places content */}
          <div className="flex-1 overflow-y-auto px-3 pb-6">
            {placesSubTab === "shared" ? (
              <SharedSpotsTab />
            ) : placesSubTab === "map" ? (
              <MapView spots={applyFilters(spots)} />
            ) : placesSubTab === "collections" ? (
              // ── Collections: user-managed folders ────────────────────────────
              <div className="space-y-2 pt-1">
                {/* New folder button / form */}
                {showNewFolderForm ? (
                  <div className="flex items-center gap-2 px-1 py-1">
                    <input
                      className="w-10 text-center text-lg border rounded-lg p-1 bg-secondary"
                      value={newFolderEmoji}
                      onChange={e => setNewFolderEmoji(e.target.value)}
                      maxLength={2}
                    />
                    <Input
                      className="flex-1 h-8 text-sm"
                      placeholder="Folder name…"
                      value={newFolderName}
                      onChange={e => setNewFolderName(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && newFolderName.trim()) createFolder.mutate({ name: newFolderName, emoji: newFolderEmoji }); }}
                      autoFocus
                    />
                    <Button size="sm" className="h-8 px-3" disabled={!newFolderName.trim()} onClick={() => createFolder.mutate({ name: newFolderName, emoji: newFolderEmoji })}>
                      Create
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => { setShowNewFolderForm(false); setNewFolderName(""); }}>
                      <X size={14} />
                    </Button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowNewFolderForm(true)}
                    className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl border border-dashed text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                  >
                    <FolderPlus size={15} /> New Folder
                  </button>
                )}

                {/* Assign spot to folders dialog — multi-select via checkboxes */}
                {assigningSpot && (
                  <div className="rounded-xl border bg-card p-3 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Folders for "{assigningSpot.name}"</p>
                    <div className="space-y-1">
                      {spotFolders.map(f => {
                        const inFolder = ((assigningSpot as any).folderIds ?? []).includes(f.id);
                        return (
                          <button key={f.id}
                            onClick={() => {
                              if (inFolder) removeFromFolder.mutate({ spotId: assigningSpot.id, folderId: f.id });
                              else addToFolder.mutate({ spotId: assigningSpot.id, folderId: f.id });
                              // optimistic update on assigningSpot
                              const ids: number[] = (assigningSpot as any).folderIds ?? [];
                              (assigningSpot as any).folderIds = inFolder ? ids.filter(i => i !== f.id) : [...ids, f.id];
                            }}
                            className="flex items-center gap-2 w-full px-2.5 py-2 rounded-lg hover:bg-secondary transition-colors text-sm">
                            <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${inFolder ? "bg-primary border-primary" : "border-border"}`}>
                              {inFolder && <Check size={10} className="text-primary-foreground" />}
                            </span>
                            <span>{f.emoji}</span><span className="font-medium">{f.name}</span>
                          </button>
                        );
                      })}
                    </div>
                    <Button size="sm" variant="ghost" className="w-full h-7 text-xs" onClick={() => setAssigningSpot(null)}>Done</Button>
                  </div>
                )}

                {/* Folder list */}
                {spotFolders.length === 0 && !showNewFolderForm ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
                    <FolderOpen size={36} className="opacity-20" />
                    <div className="text-center">
                      <p className="font-semibold text-foreground mb-1">No folders yet</p>
                      <p className="text-sm">Create a folder to organize your places.</p>
                    </div>
                  </div>
                ) : (
                  spotFolders.map(folder => {
                    const folderSpots = spots.filter(s => ((s as any).folderIds ?? []).includes(folder.id));
                    const isCollapsed = collapsedFolders.has(folder.id) || !collapsedFolders.has(-folder.id - 1);
                    const expanded = !isCollapsed;
                    return (
                      <div key={folder.id} className="rounded-xl border overflow-hidden">
                        {/* Folder header */}
                        {editingFolderId === folder.id ? (
                          <div className="flex items-center gap-2 px-3 py-2.5 bg-card">
                            <input className="w-10 text-center text-lg border rounded p-0.5 bg-secondary" value={editFolderEmoji} onChange={e => setEditFolderEmoji(e.target.value)} maxLength={2} />
                            <Input className="flex-1 h-7 text-sm" value={editFolderName} onChange={e => setEditFolderName(e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter") updateFolder.mutate({ id: folder.id, name: editFolderName, emoji: editFolderEmoji }); }} autoFocus />
                            <Button size="sm" className="h-7 px-2 text-xs" onClick={() => updateFolder.mutate({ id: folder.id, name: editFolderName, emoji: editFolderEmoji })}>Save</Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditingFolderId(null)}><X size={13} /></Button>
                          </div>
                        ) : (
                          <div className="flex items-center bg-card hover:bg-secondary/40 transition-colors">
                            <button
                              className="flex items-center gap-2.5 flex-1 px-3 py-3 text-left"
                              onClick={() => setCollapsedFolders(prev => {
                                const next = new Set(prev);
                                // use negative id as "expanded" marker
                                if (next.has(-folder.id - 1)) { next.delete(-folder.id - 1); } else { next.add(-folder.id - 1); next.delete(folder.id); }
                                return next;
                              })}
                            >
                              <span className="text-lg shrink-0">{folder.emoji}</span>
                              <span className="font-semibold text-sm flex-1">{folder.name}</span>
                              <span className="text-xs text-muted-foreground mr-1">{folderSpots.length}</span>
                              {collapsedFolders.has(-folder.id - 1) ? <ChevronUp size={15} className="text-muted-foreground shrink-0" /> : <ChevronDown size={15} className="text-muted-foreground shrink-0" />}
                            </button>
                            <div className="flex items-center gap-0.5 pr-2">
                              <button onClick={() => { setEditingFolderId(folder.id); setEditFolderName(folder.name); setEditFolderEmoji(folder.emoji); }}
                                className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors" title="Rename">
                                <Pencil size={12} />
                              </button>
                              <button onClick={() => { if (confirm(`Delete folder "${folder.name}"? Spots won't be deleted.`)) deleteFolder.mutate(folder.id); }}
                                className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-destructive transition-colors" title="Delete folder">
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        )}
                        {/* Folder contents — shown when expanded */}
                        {collapsedFolders.has(-folder.id - 1) && (
                          <div className="border-t">
                            {folderSpots.length === 0 && addingToFolderId !== folder.id ? (
                              <div className="py-6 text-center text-xs text-muted-foreground">
                                No places in this folder yet.
                              </div>
                            ) : (
                              // Group by spot type
                              (() => {
                                const typeOrder = ["restaurant","bar","cafe","hotel","attraction","shop","park","other"];
                                const byType = typeOrder
                                  .map(t => ({ type: t, list: folderSpots.filter(s => s.type === t) }))
                                  .filter(g => g.list.length > 0);
                                // Also catch any types not in typeOrder
                                const coveredTypes = new Set(typeOrder);
                                const extraTypes = [...new Set(folderSpots.filter(s => !coveredTypes.has(s.type)).map(s => s.type))];
                                extraTypes.forEach(t => byType.push({ type: t, list: folderSpots.filter(s => s.type === t) }));
                                return (
                                  <div>
                                    {byType.map(({ type, list }) => (
                                      <div key={type}>
                                        <div className="px-3 py-1.5 bg-secondary/40 border-y">
                                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                            {typeEmoji(type)} {type.charAt(0).toUpperCase() + type.slice(1)} · {list.length}
                                          </span>
                                        </div>
                                        {list.map(spot => {
                                          const loc = [spot.neighborhood, spot.city].filter(Boolean).join(", ");
                                          return (
                                            <div key={spot.id} className="flex items-center gap-2.5 px-3 py-2 border-b last:border-b-0 hover:bg-secondary/30 transition-colors group">
                                              <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium truncate leading-tight">{spot.name}</p>
                                                {loc && <p className="text-[11px] text-muted-foreground truncate">{loc}</p>}
                                              </div>
                                              <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => openEdit(spot)} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground" title="Edit"><Pencil size={11} /></button>
                                                <button onClick={() => setAssigningSpot(spot)} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground" title="Move"><FolderOpen size={11} /></button>
                                                <button onClick={() => deleteMut.mutate(spot.id)} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-destructive" title="Delete"><Trash2 size={11} /></button>
                                              </div>
                                              {spot.isFavorite && <Heart size={11} className="text-red-400 shrink-0" fill="currentColor" />}
                                              {spot.rating ? <span className="text-[10px] text-amber-500 shrink-0">{"★".repeat(spot.rating)}</span> : null}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    ))}
                                  </div>
                                );
                              })()
                            )}

                            {/* Add places to this folder */}
                            {addingToFolderId === folder.id ? (
                              <div className="border-t px-3 py-3 space-y-2">
                                <div className="flex items-center gap-2">
                                  <Input
                                    className="flex-1 h-7 text-xs"
                                    placeholder="Search places to add…"
                                    value={addToFolderSearch}
                                    onChange={e => setAddToFolderSearch(e.target.value)}
                                    autoFocus
                                  />
                                  <button onClick={() => { setAddingToFolderId(null); setAddToFolderSearch(""); }}
                                    className="text-muted-foreground hover:text-foreground p-1"><X size={13} /></button>
                                </div>
                                <div className="max-h-48 overflow-y-auto space-y-0.5">
                                  {spots
                                    .filter(s => (s as any).folderId !== folder.id)
                                    .filter(s => !addToFolderSearch || s.name.toLowerCase().includes(addToFolderSearch.toLowerCase()))
                                    .slice(0, 20)
                                    .map(s => (
                                      <button key={s.id}
                                        onClick={() => { addToFolder.mutate({ spotId: s.id, folderId: folder.id }); setAddToFolderSearch(""); }}
                                        className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg hover:bg-secondary transition-colors text-left text-xs"
                                      >
                                        <MapPin size={11} className="text-muted-foreground shrink-0" />
                                        <span className="font-medium truncate">{s.name}</span>
                                        {((s as any).folderIds ?? []).length > 0 && (
                                          <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                                            {((s as any).folderIds ?? []).map((fid: number) => spotFolders.find(f => f.id === fid)?.name).filter(Boolean).join(", ")}
                                          </span>
                                        )}
                                      </button>
                                    ))}
                                  {spots.filter(s => !((s as any).folderIds ?? []).includes(folder.id) && (!addToFolderSearch || s.name.toLowerCase().includes(addToFolderSearch.toLowerCase()))).length === 0 && (
                                    <p className="text-xs text-muted-foreground text-center py-3">No places found</p>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => { setAddingToFolderId(folder.id); setAddToFolderSearch(""); }}
                                className="flex items-center gap-1.5 w-full px-3 py-2.5 text-xs text-muted-foreground hover:text-primary border-t transition-colors"
                              >
                                <Plus size={12} /> Add places to this folder
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}


              </div>
                ) : spots.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-4">
                <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center text-3xl">📍</div>
                <div className="text-center">
                  <p className="font-semibold text-foreground mb-1">Start building your places list</p>
                  <p className="text-sm">Add spots you love, want to visit, or come back to.</p>
                </div>
                <button
                  onClick={() => setNominatimOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium"
                >
                  <Search size={15} /> Find Places
                </button>
              </div>
            ) : displaySpots.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
                <Search size={36} className="opacity-20" />
                <div className="text-center">
                  <p className="font-semibold text-foreground mb-1">No spots match your filters</p>
                  <p className="text-sm">Try adjusting or clearing your filters.</p>
                </div>
                <button
                  onClick={() => { setSearch(""); setFilterType("all"); setFilterCity("all"); }}
                  className="px-4 py-2 rounded-xl border text-sm font-medium hover:bg-secondary transition-colors"
                >
                  Clear filters
                </button>
              </div>
            ) : !search && filterType === "all" ? (
              // ── Grouped by type, compact rows ──────────────────────────────
              (() => {
                const typeGroups = SPOT_TYPES
                  .map(t => ({ type: t, spots: displaySpots.filter(s => s.type === t.value) }))
                  .filter(g => g.spots.length > 0);
                return (
                  <div className="space-y-1 pt-1">
                    {typeGroups.map(({ type, spots: typeSpots }) => {
                      const collapsed = collapsedTypes.has(type.value);
                      return (
                        <div key={type.value} className="rounded-xl border overflow-hidden">
                          <button
                            onClick={() => setCollapsedTypes(prev => {
                              const next = new Set(prev);
                              if (collapsed) next.delete(type.value); else next.add(type.value);
                              return next;
                            })}
                            className="flex items-center gap-2.5 w-full px-3 py-2.5 bg-card hover:bg-secondary/50 transition-colors"
                          >
                            <span className="text-base shrink-0">{type.emoji}</span>
                            <span className="font-semibold text-sm flex-1 text-left">{type.label}</span>
                            <span className="text-xs text-muted-foreground mr-1">{typeSpots.length}</span>
                            {collapsed ? <ChevronDown size={14} className="text-muted-foreground shrink-0" /> : <ChevronUp size={14} className="text-muted-foreground shrink-0" />}
                          </button>
                          {!collapsed && (
                            <div className="border-t">
                              {typeSpots.map(spot => {
                                const loc = [spot.neighborhood, spot.city].filter(Boolean).join(", ");
                                return (
                                  <div key={spot.id} className="flex items-center gap-2.5 px-3 py-2 border-b last:border-b-0 hover:bg-secondary/30 transition-colors group">
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium truncate leading-tight">{spot.name}</p>
                                      {loc && <p className="text-[11px] text-muted-foreground truncate">{loc}</p>}
                                    </div>
                                    {spot.rating ? <span className="text-[11px] text-amber-500 shrink-0">{"★".repeat(spot.rating)}</span> : null}
                                    {spot.isFavorite && <Heart size={11} className="text-red-400 shrink-0" fill="currentColor" />}
                                    <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <button onClick={() => openEdit(spot)} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground" title="Edit"><Pencil size={11} /></button>
                                      <button onClick={() => favMut.mutate({ id: spot.id, isFavorite: !spot.isFavorite })} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-red-400 transition-colors" title="Favourite"><Heart size={11} /></button>
                                      <button onClick={() => deleteMut.mutate(spot.id)} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-destructive" title="Delete"><Trash2 size={11} /></button>
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
                );
              })()
            ) : (
              // ── Flat compact list (searching or type-filtered) ─────────────
              <div className="rounded-xl border overflow-hidden mt-1">
                {displaySpots.map(spot => {
                  const loc = [spot.neighborhood, spot.city].filter(Boolean).join(", ");
                  return (
                    <div key={spot.id} className="flex items-center gap-2.5 px-3 py-2 border-b last:border-b-0 hover:bg-secondary/30 transition-colors group">
                      <span className="text-base shrink-0">{typeEmoji(spot.type)}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate leading-tight">{spot.name}</p>
                        {loc && <p className="text-[11px] text-muted-foreground truncate">{loc}</p>}
                      </div>
                      {spot.rating ? <span className="text-[11px] text-amber-500 shrink-0">{"★".repeat(spot.rating)}</span> : null}
                      {spot.isFavorite && <Heart size={11} className="text-red-400 shrink-0" fill="currentColor" />}
                      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEdit(spot)} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground" title="Edit"><Pencil size={11} /></button>
                        <button onClick={() => favMut.mutate({ id: spot.id, isFavorite: !spot.isFavorite })} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-red-400 transition-colors" title="Favourite"><Heart size={11} /></button>
                        <button onClick={() => deleteMut.mutate(spot.id)} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-destructive" title="Delete"><Trash2 size={11} /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* ══ TRAVEL ═══════════════════════════════════════════════════════════ */}
      {isTravelRoute && (
        <>
          {/* Travel sub-tabs */}
          <div className="overflow-x-auto scrollbar-hide px-3 pt-2 pb-0 shrink-0">
            <div className="flex gap-1 w-max">
              {([
                { value: "upcoming" as const, label: "Upcoming", icon: <Plane size={13} /> },
                { value: "past"     as const, label: "Past",     icon: <Globe size={13} /> },
                { value: "visited"  as const, label: "Visited",  icon: <Globe size={13} /> },
              ]).map(tab => (
                <button
                  key={tab.value}
                  onClick={() => setTravelSubTab(tab.value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                    travelSubTab === tab.value
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  }`}
                >
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-6 pt-3">
            {travelSubTab === "visited" ? (
              <VisitedCitiesTab />
            ) : (
              <TripsTab
                spots={spots}
                initialFilter={
                  travelSubTab === "upcoming" ? "upcoming" :
                  travelSubTab === "past" ? "past" : "all"
                }
              />
            )}
          </div>
        </>
      )}

      {/* ── Hidden CSV input ──────────────────────────────────────────────────── */}
      <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />

      {/* ── Filter Bottom Sheet ──────────────────────────────────────────────── */}
      <BottomSheet open={filterSheetOpen} onClose={() => setFilterSheetOpen(false)} title="Filter Places">
        <div className="px-4 pb-6 space-y-5">
          {/* City */}
          {allCities.length >= 2 && (
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">City</label>
              <div className="flex flex-wrap gap-2">
                {["all", ...allCities].map(c => (
                  <button
                    key={c}
                    onClick={() => setFilterCity(c)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                      filterCity === c ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-secondary"
                    }`}
                  >
                    {c === "all" ? "All cities" : c}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Category */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Category</label>
            <div className="flex flex-wrap gap-2">
              {[{ value: "all", label: "All", emoji: "🗺️" }, ...SPOT_TYPES].map(t => (
                <button
                  key={t.value}
                  onClick={() => setFilterType(t.value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-colors ${
                    filterType === t.value ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-secondary"
                  }`}
                >
                  <span>{t.emoji}</span> {t.label}
                </button>
              ))}
            </div>
          </div>



          {/* Clear all */}
          {(filterType !== "all" || filterCity !== "all") && (
            <button
              onClick={() => { setFilterType("all"); setFilterCity("all"); setFilterSheetOpen(false); }}
              className="w-full py-2.5 rounded-xl border border-destructive/50 text-destructive text-sm font-medium"
            >
              Clear all filters
            </button>
          )}
        </div>
      </BottomSheet>

      {/* ── Nominatim Search Modal ────────────────────────────────────────────── */}
      <NominatimSearchModal
        open={nominatimOpen}
        onClose={() => setNominatimOpen(false)}
        onSelect={(prefill) => {
          setEditing(null);
          setForm({ ...EMPTY_FORM, ...prefill });
          setModalOpen(true);
        }}
      />

      {/* ── Add/Edit Modal ────────────────────────────────────────────────────── */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Place" : "Add Place"}</DialogTitle></DialogHeader>
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
                  <StarRating value={form.rating !== "" ? Number(form.rating) : null} onChange={(v) => setForm({ ...form, rating: v })} />
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

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Tags (comma-separated)</label>
              <Input placeholder="e.g. Date Night, Kid-Friendly" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes</label>
              <Textarea rows={2} placeholder="What you liked, what to order, tips…" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="spotFav" checked={form.isFavorite} onChange={(e) => setForm({ ...form, isFavorite: e.target.checked })} className="rounded" />
              <label htmlFor="spotFav" className="text-sm flex items-center gap-1"><Heart size={13} className="text-red-500" />Mark as Favorite</label>
            </div>
            <div className="flex gap-2 pt-1">
              <Button className="flex-1" onClick={handleSave} disabled={!form.name.trim()}>{editing ? "Save" : "Add Place"}</Button>
              <Button variant="outline" onClick={closeModal}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Spot Share Modal ──────────────────────────────────────────────────── */}
      {shareSpot && <SpotShareModal spot={shareSpot} onClose={() => setShareSpot(null)} />}

      {/* ── Add to Trip ───────────────────────────────────────────────────────── */}
      {addToTripSpot && <AddToTripModal spot={addToTripSpot} onClose={() => setAddToTripSpot(null)} />}
      {createTripSpot && <CreateTripFromPlaceModal spot={createTripSpot} onClose={() => setCreateTripSpot(null)} />}

      {/* ── Trip Planner ──────────────────────────────────────────────────────── */}
      <TripPlannerModal open={plannerOpen} onClose={() => setPlannerOpen(false)} spots={spots} />

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

function TripsTab({ spots, initialFilter = "upcoming" }: { spots: Spot[]; initialFilter?: "upcoming" | "past" | "all" }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  // Trips state — when showing all (itineraries), no internal sub-tab needed
  const [tripsSubTab, setTripsSubTab] = useState<"upcoming" | "past">(initialFilter === "past" ? "past" : "upcoming");
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

  // Prep task mutations
  const { data: prepProject, refetch: refetchPrepProject } = useQuery<any>({
    queryKey: ["/api/trips", selectedTrip?.id, "prep-project"],
    queryFn: () => apiRequest("GET", `/api/trips/${selectedTrip!.id}/prep-project`).then(r => r.json()),
    enabled: !!selectedTrip,
  });
  const addPrepTask = useMutation({
    mutationFn: (title: string) => apiRequest("POST", `/api/trips/${selectedTrip!.id}/prep-tasks`, { title }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/trips", selectedTrip?.id, "prep-project"] }); setPrepTaskInput(""); },
  });
  const togglePrepTask = useMutation({
    mutationFn: ({ taskId, completed }: { taskId: number; completed: boolean }) =>
      apiRequest("PATCH", `/api/trips/${selectedTrip!.id}/prep-tasks/${taskId}`, { completed }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/trips", selectedTrip?.id, "prep-project"] }),
  });
  const deletePrepTask = useMutation({
    mutationFn: (taskId: number) => apiRequest("DELETE", `/api/trips/${selectedTrip!.id}/prep-tasks/${taskId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/trips", selectedTrip?.id, "prep-project"] }),
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

        {/* Prep Tasks */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <ClipboardList size={14} className="text-primary" /> Prep Tasks
            </h3>
            {prepProject?.tasks?.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {prepProject.tasks.filter((t: any) => t.completed).length}/{prepProject.tasks.length} done
              </span>
            )}
          </div>
          {/* Task list */}
          {prepProject?.tasks?.length > 0 && (
            <div className="space-y-1.5 mb-3">
              {prepProject.tasks.map((task: any) => (
                <div key={task.id} className="flex items-center gap-2 group">
                  <button
                    onClick={() => togglePrepTask.mutate({ taskId: task.id, completed: !task.completed })}
                    className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                  >
                    {task.completed
                      ? <CheckCircle2 size={16} className="text-emerald-500" />
                      : <Circle size={16} />}
                  </button>
                  <span className={`flex-1 text-sm ${task.completed ? "line-through text-muted-foreground" : ""}`}>
                    {task.title}
                  </span>
                  <button
                    onClick={() => deletePrepTask.mutate(task.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-secondary text-muted-foreground hover:text-destructive transition-all"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {/* Add task input */}
          <div className="flex gap-2">
            <input
              className="flex-1 h-8 px-3 text-sm border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Add a prep task…"
              value={prepTaskInput}
              onChange={e => setPrepTaskInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && prepTaskInput.trim()) addPrepTask.mutate(prepTaskInput.trim()); }}
            />
            <Button size="sm" className="h-8 px-3 text-xs" disabled={!prepTaskInput.trim() || addPrepTask.isPending}
              onClick={() => addPrepTask.mutate(prepTaskInput.trim())}>
              Add
            </Button>
          </div>
          {prepProject && (
            <p className="text-[11px] text-muted-foreground mt-1.5 flex items-center gap-1">
              <ClipboardList size={10} /> Saved as project "{prepProject.title}" in Projects & Tasks
            </p>
          )}
        </div>

        {/* Notes & reflection */}
        {tripData.notes && (
          <div className="mt-6 p-3 rounded-xl bg-muted/40 border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Notes</p>
            <p className="text-sm text-muted-foreground italic leading-relaxed">{tripData.notes}</p>
          </div>
        )}

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
  const today = new Date().toISOString().split("T")[0];
  const upcomingTrips = trips.filter(t => !t.endDate || t.endDate >= today);
  const pastTrips     = trips.filter(t => t.endDate && t.endDate < today);
  // When initialFilter is "all" (itineraries view), show all trips without sub-tabs
  const displayedTrips = initialFilter === "upcoming" ? upcomingTrips :
    initialFilter === "past" ? pastTrips :
    initialFilter === "all" ? trips :
    tripsSubTab === "upcoming" ? upcomingTrips : pastTrips;

  const emptyLabel = initialFilter === "upcoming" ? "No upcoming trips" :
    initialFilter === "past" ? "No past trips" :
    initialFilter === "all" ? "No trips yet" :
    tripsSubTab === "upcoming" ? "No upcoming trips" : "No past trips";

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        {initialFilter === "all" ? (
          <p className="text-sm font-semibold text-foreground flex-1">All Trips ({trips.length})</p>
        ) : (
          <span className="flex-1" />
        )}
        <Button size="sm" onClick={openNewTrip} className="gap-1.5 shrink-0">
          <Plus size={13} /> New Trip
        </Button>
      </div>

      {displayedTrips.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Plane size={40} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium">{emptyLabel}</p>
          {(initialFilter === "upcoming" || (initialFilter !== "all" && tripsSubTab === "upcoming")) && (
            <>
              <p className="text-xs mt-1">Create a trip to start planning your itinerary.</p>
              <Button size="sm" className="mt-4 gap-1.5" onClick={openNewTrip}><Plus size={13} /> Create Trip</Button>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {displayedTrips.map((trip) => (
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

// ── VisitedCitiesTab ──────────────────────────────────────────────────────────

type NominatimCity = {
  place_id: number;
  display_name: string;
  name?: string;
  lat: string;
  lon: string;
  address?: {
    city?: string; town?: string; village?: string; municipality?: string;
    country?: string; country_code?: string;
  };
};

const COUNTRY_FLAGS: Record<string, string> = {
  us: "🇺🇸", gb: "🇬🇧", fr: "🇫🇷", de: "🇩🇪", it: "🇮🇹", es: "🇪🇸",
  jp: "🇯🇵", cn: "🇨🇳", au: "🇦🇺", ca: "🇨🇦", mx: "🇲🇽", br: "🇧🇷",
  in: "🇮🇳", pt: "🇵🇹", nl: "🇳🇱", be: "🇧🇪", ch: "🇨🇭", at: "🇦🇹",
  se: "🇸🇪", no: "🇳🇴", dk: "🇩🇰", fi: "🇫🇮", pl: "🇵🇱", cz: "🇨🇿",
  gr: "🇬🇷", tr: "🇹🇷", th: "🇹🇭", vn: "🇻🇳", id: "🇮🇩", sg: "🇸🇬",
  nz: "🇳🇿", za: "🇿🇦", eg: "🇪🇬", ma: "🇲🇦", ar: "🇦🇷", co: "🇨🇴",
  pe: "🇵🇪", cl: "🇨🇱", kr: "🇰🇷", hk: "🇭🇰", tw: "🇹🇼", ae: "🇦🇪",
  il: "🇮🇱", hu: "🇭🇺", ro: "🇷🇴", hr: "🇭🇷", sk: "🇸🇰", rs: "🇷🇸",
  ie: "🇮🇪", is: "🇮🇸", ru: "🇷🇺", ua: "🇺🇦",
};

function countryFlag(country: string): string {
  const lower = country.toLowerCase().replace(/\s+/g, "");
  // Try direct lookup by country code (if passed a code)
  if (COUNTRY_FLAGS[lower]) return COUNTRY_FLAGS[lower];
  // Try finding by matching known country names
  const NAME_TO_CODE: Record<string, string> = {
    "unitedstates": "us", "usa": "us", "unitedkingdom": "gb", "uk": "gb",
    "france": "fr", "germany": "de", "italy": "it", "spain": "es",
    "japan": "jp", "china": "cn", "australia": "au", "canada": "ca",
    "mexico": "mx", "brazil": "br", "india": "in", "portugal": "pt",
    "netherlands": "nl", "belgium": "be", "switzerland": "ch", "austria": "at",
    "sweden": "se", "norway": "no", "denmark": "dk", "finland": "fi",
    "poland": "pl", "czechrepublic": "cz", "czechia": "cz", "greece": "gr",
    "turkey": "tr", "thailand": "th", "vietnam": "vn", "indonesia": "id",
    "singapore": "sg", "newzealand": "nz", "southafrica": "za", "egypt": "eg",
    "morocco": "ma", "argentina": "ar", "colombia": "co", "peru": "pe",
    "chile": "cl", "southkorea": "kr", "hongkong": "hk", "taiwan": "tw",
    "unitedarabemirates": "ae", "uae": "ae", "israel": "il", "hungary": "hu",
    "romania": "ro", "croatia": "hr", "slovakia": "sk", "serbia": "rs",
    "ireland": "ie", "iceland": "is", "russia": "ru", "ukraine": "ua",
  };
  const code = NAME_TO_CODE[lower];
  return code ? (COUNTRY_FLAGS[code] ?? "🌍") : "🌍";
}

function VisitedCitiesWorldMap({ cities }: { cities: VisitedCity[] }) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  const mappable = cities.filter(c => c.lat != null && c.lon != null);

  useEffect(() => {
    if (!mapContainerRef.current) return;
    let unmounted = false;

    function initMap() {
      if (unmounted) return;
      const L = (window as any).L;
      if (!L || !mapContainerRef.current) return;
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }

      const map = L.map(mapContainerRef.current, { zoomControl: true, scrollWheelZoom: false })
        .setView([20, 10], 2);
      mapInstanceRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      mappable.forEach(city => {
        const iconHtml = `
          <div style="position:relative;width:32px;height:42px;">
            <div style="
              width:32px;height:32px;border-radius:50% 50% 50% 0;
              background:#6366f1;border:3px solid white;
              transform:rotate(-45deg);
              box-shadow:0 3px 10px rgba(0,0,0,0.4);
              position:absolute;top:0;left:0;">
            </div>
            <div style="
              position:absolute;top:5px;left:5px;
              width:22px;height:22px;border-radius:50%;
              background:white;
              display:flex;align-items:center;justify-content:center;
              font-size:11px;transform:rotate(45deg);">
              ✈️
            </div>
          </div>`;
        const icon = L.divIcon({ html: iconHtml, className: "", iconSize: [32, 42], iconAnchor: [16, 42] });
        const marker = L.marker([city.lat!, city.lon!], { icon }).addTo(map);
        marker.bindPopup(`<b>${city.city}</b>${city.country ? `<br/>${city.country}` : ""}${city.visitedDate ? `<br/><small>${city.visitedDate}</small>` : ""}`);
      });

      if (mappable.length > 1) {
        const bounds = L.latLngBounds(mappable.map(c => [c.lat!, c.lon!]));
        map.fitBounds(bounds, { padding: [30, 30], maxZoom: 6 });
      } else if (mappable.length === 1) {
        map.setView([mappable[0].lat!, mappable[0].lon!], 5);
      }
    }

    if (!document.querySelector('link[href*="leaflet"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }

    let script: HTMLScriptElement | null = null;
    if ((window as any).L) {
      initMap();
    } else {
      script = document.createElement("script");
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.onload = initMap;
      document.head.appendChild(script);
    }

    return () => {
      unmounted = true;
      if (script) { script.onload = null; }
      if (mapInstanceRef.current) {
        try { mapInstanceRef.current.remove(); } catch (_) {}
        mapInstanceRef.current = null;
      }
      // Immediately wipe the container so no lingering tiles can paint
      if (mapContainerRef.current) {
        mapContainerRef.current.style.display = "none";
        mapContainerRef.current.innerHTML = "";
      }
    };
  }, [JSON.stringify(mappable.map(c => c.id))]);

  return (
    <div className="rounded-xl overflow-hidden border" style={{ height: 220, isolation: "isolate", position: "relative", zIndex: 0 }}>
      <div ref={mapContainerRef} style={{ height: "100%", width: "100%" }} />
    </div>
  );
}

const EMPTY_CITY_FORM = { city: "", country: "", visitedDate: "", notes: "", lat: null as number | null, lon: null as number | null };

function VisitedCitiesTab() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCity, setEditingCity] = useState<VisitedCity | null>(null);
  const [cityForm, setCityForm] = useState({ ...EMPTY_CITY_FORM });
  const [citySearch, setCitySearch] = useState("");
  const [cityResults, setCityResults] = useState<NominatimCity[]>([]);
  const [citySearchLoading, setCitySearchLoading] = useState(false);
  const cityDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: cities = [], isLoading } = useQuery<VisitedCity[]>({
    queryKey: ["/api/visited-cities"],
    queryFn: () => apiRequest("GET", "/api/visited-cities").then(r => r.json()),
  });

  const addCity = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/visited-cities", data).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/visited-cities"] }); setShowAddModal(false); toast({ title: "City logged!" }); },
    onError: () => toast({ title: "Failed to log city", variant: "destructive" }),
  });
  const updateCity = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/visited-cities/${id}`, data).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/visited-cities"] }); setShowAddModal(false); toast({ title: "City updated!" }); },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });
  const deleteCity = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/visited-cities/${id}`).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/visited-cities"] }); toast({ title: "Removed" }); },
    onError: () => toast({ title: "Failed to remove", variant: "destructive" }),
  });

  async function searchCities(q: string) {
    if (!q.trim()) { setCityResults([]); return; }
    setCitySearchLoading(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&addressdetails=1&limit=6&featuretype=city`;
      const res = await fetch(url, { headers: { "Accept-Language": "en" } });
      const data: NominatimCity[] = await res.json();
      // Filter to city-like results
      setCityResults(data.filter(r => ["city","town","village","municipality","administrative"].includes((r as any).type ?? "")));
    } catch {
      setCityResults([]);
    } finally { setCitySearchLoading(false); }
  }

  function handleCitySearchChange(val: string) {
    setCitySearch(val);
    if (cityDebounceRef.current) clearTimeout(cityDebounceRef.current);
    cityDebounceRef.current = setTimeout(() => searchCities(val), 450);
  }

  function selectNominatimCity(r: NominatimCity) {
    const addr = r.address ?? {};
    const cityName = r.name ?? addr.city ?? addr.town ?? addr.village ?? addr.municipality ?? r.display_name.split(",")[0];
    const country = addr.country ?? "";
    setCityForm(f => ({ ...f, city: cityName, country, lat: parseFloat(r.lat), lon: parseFloat(r.lon) }));
    setCitySearch(cityName);
    setCityResults([]);
  }

  function openAdd() {
    setEditingCity(null);
    setCityForm({ ...EMPTY_CITY_FORM });
    setCitySearch("");
    setCityResults([]);
    setShowAddModal(true);
  }

  function openEdit(c: VisitedCity) {
    setEditingCity(c);
    setCityForm({ city: c.city, country: c.country ?? "", visitedDate: c.visitedDate ?? "", notes: c.notes ?? "", lat: c.lat ?? null, lon: c.lon ?? null });
    setCitySearch(c.city);
    setCityResults([]);
    setShowAddModal(true);
  }

  function saveForm() {
    const payload = { ...cityForm, country: cityForm.country || null, visitedDate: cityForm.visitedDate || null, notes: cityForm.notes || null };
    if (editingCity) updateCity.mutate({ id: editingCity.id, data: payload });
    else addCity.mutate(payload);
  }

  // Stats
  const countryCount = new Set(cities.map(c => c.country).filter(Boolean)).size;
  const cityCount = cities.length;

  // Group by country
  const grouped = useMemo(() => {
    const map = new Map<string, VisitedCity[]>();
    cities.forEach(c => {
      const key = c.country ?? "Unknown";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    });
    // Sort countries alphabetically
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [cities]);

  if (isLoading) {
    return <div className="flex items-center justify-center h-40 text-muted-foreground"><Loader2 size={20} className="animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="flex items-center justify-between">
        <div className="flex gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold leading-none">{countryCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">countries</p>
          </div>
          <div className="w-px bg-border" />
          <div className="text-center">
            <p className="text-2xl font-bold leading-none">{cityCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">cities</p>
          </div>
        </div>
        <Button size="sm" onClick={openAdd} className="gap-1.5">
          <Plus size={14} /> Log a City
        </Button>
      </div>

      {/* Map */}
      {cities.length > 0 && <VisitedCitiesWorldMap cities={cities} />}

      {/* City list grouped by country */}
      {cities.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-36 text-muted-foreground gap-2">
          <Globe size={32} className="opacity-20" />
          <p className="text-sm text-center">No cities logged yet.<br/>Tap "Log a City" to get started!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map(([country, citiesInCountry]) => (
            <div key={country}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-base">{countryFlag(country)}</span>
                <span className="text-sm font-semibold">{country}</span>
                <span className="text-xs text-muted-foreground">({citiesInCountry.length})</span>
              </div>
              <div className="space-y-1.5 pl-1">
                {citiesInCountry
                  .sort((a, b) => (b.visitedDate ?? "").localeCompare(a.visitedDate ?? ""))
                  .map(city => (
                  <div key={city.id} className="flex items-start gap-2.5 p-2.5 rounded-xl border bg-card group">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{city.city}</p>
                      {city.visitedDate && (
                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                          <Calendar size={10} />
                          {city.visitedDate}
                        </p>
                      )}
                      {city.notes && (
                        <p className="text-xs text-muted-foreground italic mt-0.5 line-clamp-1">{city.notes}</p>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEdit(city)} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground transition-colors">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => deleteCity.mutate(city.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editingCity ? "Edit City" : "Log a City"}</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-1">
            {/* City search */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">City *</label>
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                {citySearchLoading && <Loader2 size={12} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />}
                <Input
                  placeholder="Search for a city…"
                  value={citySearch}
                  onChange={e => { handleCitySearchChange(e.target.value); setCityForm(f => ({ ...f, city: e.target.value })); }}
                  className="pl-9 text-sm"
                />
              </div>
              {cityResults.length > 0 && (
                <div className="border rounded-lg mt-1 overflow-hidden shadow-md bg-card">
                  {cityResults.map(r => {
                    const name = r.name ?? r.display_name.split(",")[0];
                    const country = r.address?.country ?? "";
                    return (
                      <button
                        key={r.place_id}
                        onClick={() => selectNominatimCity(r)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-secondary transition-colors flex items-center gap-2 border-b last:border-b-0"
                      >
                        <MapPin size={12} className="text-muted-foreground shrink-0" />
                        <span className="font-medium">{name}</span>
                        {country && <span className="text-xs text-muted-foreground ml-1">{country}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Country */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Country</label>
              <Input
                placeholder="e.g. France"
                value={cityForm.country}
                onChange={e => setCityForm(f => ({ ...f, country: e.target.value }))}
                className="text-sm"
              />
            </div>

            {/* Visit date */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Visit Date</label>
              <Input
                type="date"
                value={cityForm.visitedDate}
                onChange={e => setCityForm(f => ({ ...f, visitedDate: e.target.value }))}
                className="text-sm"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes</label>
              <Textarea
                placeholder="Highlights, memories…"
                rows={2}
                value={cityForm.notes}
                onChange={e => setCityForm(f => ({ ...f, notes: e.target.value }))}
                className="text-sm resize-none"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setShowAddModal(false)}>Cancel</Button>
              <Button
                className="flex-1"
                onClick={saveForm}
                disabled={!cityForm.city.trim() || addCity.isPending || updateCity.isPending}
              >
                {editingCity ? "Save Changes" : "Log City"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
