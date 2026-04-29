import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Hobby, InsertHobby } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Pencil, Trash2, Search, Heart, Star,
  Camera, Palette, Mountain, Gamepad2, Cpu, Mic2,
  Archive, Trees, BookOpen, Music2, ChevronDown, ChevronUp,
  Layers, X, ImagePlus,
} from "lucide-react";

// ── Constants ──────────────────────────────────────────────────────────────────

export type HobbyType = "creative" | "collection" | "outdoor" | "games" | "learning" | "performance";

const HOBBY_TYPES: { value: HobbyType; label: string; icon: React.ElementType; color: string; emoji: string }[] = [
  { value: "creative",    label: "Creative",    icon: Palette,   color: "#ec4899", emoji: "🎨" },
  { value: "collection",  label: "Collection",  icon: Archive,   color: "#f97316", emoji: "🪙" },
  { value: "outdoor",     label: "Outdoor & Active", icon: Mountain, color: "#10b981", emoji: "🏔️" },
  { value: "games",       label: "Games & Mind", icon: Gamepad2, color: "#6366f1", emoji: "🎮" },
  { value: "learning",    label: "Learning & Making", icon: Cpu, color: "#3b82f6", emoji: "🔬" },
  { value: "performance", label: "Performance", icon: Mic2,      color: "#8b5cf6", emoji: "🎭" },
];

const HOBBY_TYPE_MAP = Object.fromEntries(HOBBY_TYPES.map(t => [t.value, t]));

const PRESET_HOBBIES: Record<HobbyType, string[]> = {
  creative:    ["Photography", "Painting", "Drawing", "Pottery", "Knitting/Crochet", "Woodworking", "Jewelry Making", "Sculpting"],
  collection:  ["Coins", "Stamps", "Vinyl Records", "Trading Cards", "Sneakers", "Watches", "Comic Books", "Antiques"],
  outdoor:     ["Hiking", "Cycling", "Fishing", "Gardening", "Rock Climbing", "Bird Watching", "Surfing", "Running"],
  games:       ["Chess", "Board Games", "Video Games", "Puzzles", "Poker", "Dungeons & Dragons"],
  learning:    ["Coding", "Electronics", "3D Printing", "Brewing/Winemaking", "Cooking", "Language Learning"],
  performance: ["Playing an Instrument", "Singing", "Acting", "Dancing", "Comedy"],
};

const SKILL_LEVELS = [
  { value: "beginner",     label: "Beginner",     color: "bg-green-500/15 text-green-700 dark:text-green-400" },
  { value: "intermediate", label: "Intermediate", color: "bg-blue-500/15 text-blue-700 dark:text-blue-400" },
  { value: "advanced",     label: "Advanced",     color: "bg-purple-500/15 text-purple-700 dark:text-purple-400" },
  { value: "expert",       label: "Expert",       color: "bg-orange-500/15 text-orange-700 dark:text-orange-400" },
];

const STATUS_OPTIONS = [
  { value: "active",    label: "Active",    color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  { value: "on_pause",  label: "On Pause",  color: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400" },
  { value: "retired",   label: "Retired",   color: "bg-slate-500/15 text-slate-500" },
];

const SKILL_MAP = Object.fromEntries(SKILL_LEVELS.map(s => [s.value, s]));
const STATUS_MAP = Object.fromEntries(STATUS_OPTIONS.map(s => [s.value, s]));

const EMPTY_FORM: Partial<InsertHobby> = {
  name: "",
  hobbyType: "creative",
  category: "",
  description: "",
  skillLevel: "beginner",
  dateStarted: "",
  status: "active",
  notes: "",
  extraJson: "{}",
  isFavorite: false,
  coverUrl: "",
};

// ── Extra-field helpers ────────────────────────────────────────────────────────

function parseExtra(json: string): Record<string, any> {
  try { return JSON.parse(json || "{}"); } catch { return {}; }
}

function ExtraFields({
  hobbyType,
  extra,
  onChange,
}: {
  hobbyType: HobbyType;
  extra: Record<string, any>;
  onChange: (key: string, value: any) => void;
}) {
  const field = (label: string, key: string, placeholder?: string, type: "input" | "textarea" = "input") => (
    <div key={key}>
      <label className="text-xs font-medium text-muted-foreground mb-1 block">{label}</label>
      {type === "textarea" ? (
        <Textarea
          className="text-sm min-h-[70px]"
          placeholder={placeholder}
          value={extra[key] ?? ""}
          onChange={e => onChange(key, e.target.value)}
        />
      ) : (
        <Input
          className="text-sm"
          placeholder={placeholder}
          value={extra[key] ?? ""}
          onChange={e => onChange(key, e.target.value)}
        />
      )}
    </div>
  );

  if (hobbyType === "collection") return (
    <div className="space-y-3">
      {field("Items in Collection (count)", "itemCount", "e.g. 142")}
      {field("Estimated Value", "estimatedValue", "e.g. ~$2,400")}
      {field("Most Prized Item", "mostPrizedItem", "Describe your favorite piece")}
    </div>
  );

  if (hobbyType === "outdoor") return (
    <div className="space-y-3">
      {field("Favorite Locations", "favoriteLocations", "e.g. Yosemite, Blue Ridge Trail…", "textarea")}
      {field("Gear List", "gearList", "Key gear you use or want", "textarea")}
      {field("Personal Bests", "personalBests", "e.g. 26.2 mi marathon, 14,000 ft summit")}
    </div>
  );

  if (hobbyType === "creative") return (
    <div className="space-y-3">
      {field("Materials / Tools Used", "materialsTools", "e.g. Nikon Z6, watercolor, lathe…")}
      {field("Works in Progress", "worksInProgress", "What are you working on right now?", "textarea")}
    </div>
  );

  if (hobbyType === "games") return (
    <div className="space-y-3">
      {field("Favorite Games / Titles", "favoriteGames", "e.g. Catan, Elden Ring, Blitz Chess", "textarea")}
      {field("Rating / ELO", "ratingElo", "e.g. Chess.com 1450, BGG 8/10")}
      {field("Play Frequency", "playFrequency", "e.g. Weekly with friends")}
    </div>
  );

  if (hobbyType === "learning") return (
    <div className="space-y-3">
      {field("Current Level", "currentLevel", "e.g. B2 Spanish, built 3 circuits")}
      {field("Goals", "goals", "What are you working toward?", "textarea")}
      {field("Resources / Courses", "resources", "Books, courses, links you're using", "textarea")}
    </div>
  );

  if (hobbyType === "performance") return (
    <div className="space-y-3">
      {field("Instrument / Style", "instrumentStyle", "e.g. Acoustic guitar, jazz improv")}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Years Playing</label>
        <Input
          type="number"
          className="text-sm"
          placeholder="e.g. 7"
          value={extra["yearsPlaying"] ?? ""}
          onChange={e => onChange("yearsPlaying", e.target.value ? Number(e.target.value) : "")}
        />
      </div>
      {field("Favorite Pieces / Sets", "favoritePieces", "Favorite songs, plays, performances", "textarea")}
    </div>
  );

  return null;
}

// ── Extra-field display ────────────────────────────────────────────────────────

function ExtraDisplay({ hobbyType, extra }: { hobbyType: HobbyType; extra: Record<string, any> }) {
  const row = (label: string, value: any) =>
    value ? (
      <div key={label} className="flex gap-2 text-sm">
        <span className="text-muted-foreground min-w-[120px] shrink-0">{label}</span>
        <span className="text-foreground">{String(value)}</span>
      </div>
    ) : null;

  if (hobbyType === "collection") return (
    <>
      {row("Items", extra.itemCount)}
      {row("Est. Value", extra.estimatedValue)}
      {row("Prized Item", extra.mostPrizedItem)}
    </>
  );
  if (hobbyType === "outdoor") return (
    <>
      {row("Locations", extra.favoriteLocations)}
      {row("Gear", extra.gearList)}
      {row("Personal Bests", extra.personalBests)}
    </>
  );
  if (hobbyType === "creative") return (
    <>
      {row("Materials / Tools", extra.materialsTools)}
      {row("WIP", extra.worksInProgress)}
    </>
  );
  if (hobbyType === "games") return (
    <>
      {row("Favorites", extra.favoriteGames)}
      {row("Rating / ELO", extra.ratingElo)}
      {row("Play Freq.", extra.playFrequency)}
    </>
  );
  if (hobbyType === "learning") return (
    <>
      {row("Current Level", extra.currentLevel)}
      {row("Goals", extra.goals)}
      {row("Resources", extra.resources)}
    </>
  );
  if (hobbyType === "performance") return (
    <>
      {row("Instrument / Style", extra.instrumentStyle)}
      {row("Years Playing", extra.yearsPlaying)}
      {row("Favorites", extra.favoritePieces)}
    </>
  );
  return null;
}

// ── Hobby Card ─────────────────────────────────────────────────────────────────

function HobbyCard({
  hobby,
  onEdit,
  onDelete,
  onToggleFavorite,
  onClick,
}: {
  hobby: Hobby;
  onEdit: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
  onClick: () => void;
}) {
  const typeInfo = HOBBY_TYPE_MAP[hobby.hobbyType as HobbyType] ?? HOBBY_TYPES[0];
  const skillInfo = SKILL_MAP[hobby.skillLevel ?? "beginner"];
  const statusInfo = STATUS_MAP[hobby.status ?? "active"];
  const TypeIcon = typeInfo.icon;

  return (
    <div
      className="group relative bg-card border rounded-xl overflow-hidden cursor-pointer hover:shadow-md transition-all duration-200"
      onClick={onClick}
    >
      {/* Color bar */}
      <div className="h-1.5 w-full" style={{ backgroundColor: typeInfo.color }} />

      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm"
              style={{ backgroundColor: typeInfo.color }}
            >
              <TypeIcon size={15} />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-sm leading-tight truncate">{hobby.name}</h3>
              {hobby.category && (
                <p className="text-xs text-muted-foreground truncate">{hobby.category}</p>
              )}
            </div>
          </div>
          <button
            className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={e => { e.stopPropagation(); onToggleFavorite(); }}
          >
            <Heart
              size={14}
              className={hobby.isFavorite ? "fill-pink-500 text-pink-500" : "text-muted-foreground"}
            />
          </button>
        </div>

        {/* Description */}
        {hobby.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{hobby.description}</p>
        )}

        {/* Badges */}
        <div className="flex flex-wrap gap-1.5 items-center">
          {skillInfo && (
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${skillInfo.color}`}>
              {skillInfo.label}
            </span>
          )}
          {statusInfo && hobby.status !== "active" && (
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statusInfo.color}`}>
              {statusInfo.label}
            </span>
          )}
          {hobby.dateStarted && (
            <span className="text-[10px] text-muted-foreground">
              Since {hobby.dateStarted.slice(0, 4)}
            </span>
          )}
        </div>
      </div>

      {/* Action buttons on hover */}
      <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          className="p-1 rounded bg-background/80 border hover:bg-muted transition-colors"
          onClick={e => { e.stopPropagation(); onEdit(); }}
        >
          <Pencil size={11} />
        </button>
        <button
          className="p-1 rounded bg-background/80 border hover:bg-destructive/10 text-destructive transition-colors"
          onClick={e => { e.stopPropagation(); onDelete(); }}
        >
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  );
}

// ── Hobby Detail Dialog ────────────────────────────────────────────────────────

function HobbyDetailDialog({
  hobby,
  open,
  onClose,
  onEdit,
}: {
  hobby: Hobby | null;
  open: boolean;
  onClose: () => void;
  onEdit: () => void;
}) {
  if (!hobby) return null;
  const typeInfo = HOBBY_TYPE_MAP[hobby.hobbyType as HobbyType] ?? HOBBY_TYPES[0];
  const TypeIcon = typeInfo.icon;
  const skillInfo = SKILL_MAP[hobby.skillLevel ?? "beginner"];
  const statusInfo = STATUS_MAP[hobby.status ?? "active"];
  const extra = parseExtra(hobby.extraJson ?? "{}");

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Color header */}
        <div
          className="absolute top-0 left-0 right-0 h-1.5 rounded-t-lg"
          style={{ backgroundColor: typeInfo.color }}
        />
        <DialogHeader className="mt-2">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white"
              style={{ backgroundColor: typeInfo.color }}
            >
              <TypeIcon size={18} />
            </div>
            <div>
              <DialogTitle className="text-lg leading-tight">{hobby.name}</DialogTitle>
              <p className="text-xs text-muted-foreground">{typeInfo.label}{hobby.category ? ` · ${hobby.category}` : ""}</p>
            </div>
            {hobby.isFavorite && <Heart size={16} className="ml-auto fill-pink-500 text-pink-500" />}
          </div>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Badges */}
          <div className="flex flex-wrap gap-2">
            {skillInfo && (
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${skillInfo.color}`}>
                {skillInfo.label}
              </span>
            )}
            {statusInfo && (
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusInfo.color}`}>
                {statusInfo.label}
              </span>
            )}
            {hobby.dateStarted && (
              <span className="text-xs text-muted-foreground px-2.5 py-1 rounded-full bg-muted">
                Started {hobby.dateStarted}
              </span>
            )}
          </div>

          {/* Cover image */}
          {hobby.coverUrl && (
            <img
              src={hobby.coverUrl}
              alt={hobby.name}
              className="w-full h-48 object-cover rounded-lg"
            />
          )}

          {/* Description */}
          {hobby.description && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Why I Love It</h4>
              <p className="text-sm">{hobby.description}</p>
            </div>
          )}

          {/* Type-specific extra fields */}
          {Object.values(extra).some(v => v !== "" && v != null) && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Details</h4>
              <div className="space-y-1.5">
                <ExtraDisplay hobbyType={hobby.hobbyType as HobbyType} extra={extra} />
              </div>
            </div>
          )}

          {/* Notes */}
          {hobby.notes && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Notes</h4>
              <p className="text-sm text-muted-foreground">{hobby.notes}</p>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button size="sm" variant="outline" onClick={onEdit}>
              <Pencil size={13} className="mr-1.5" /> Edit
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Add/Edit Dialog ────────────────────────────────────────────────────────────

function HobbyFormDialog({
  open,
  onClose,
  initial,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  initial: Partial<InsertHobby>;
  onSave: (data: Partial<InsertHobby>) => void;
}) {
  const [form, setForm] = useState<Partial<InsertHobby>>(initial);
  const [extra, setExtra] = useState<Record<string, any>>(() => parseExtra(initial.extraJson ?? "{}"));
  const [showPresets, setShowPresets] = useState(false);
  const isEdit = !!(initial as any)?.id === undefined ? false : !!(initial as any)?.id;

  // Sync form when dialog opens with new initial
  useState(() => {
    setForm(initial);
    setExtra(parseExtra(initial.extraJson ?? "{}"));
  });

  const set = (key: keyof InsertHobby, val: any) => setForm(f => ({ ...f, [key]: val }));
  const setExtraKey = (key: string, val: any) => setExtra(e => ({ ...e, [key]: val }));

  const handleSave = () => {
    if (!form.name?.trim()) return;
    onSave({ ...form, extraJson: JSON.stringify(extra) });
  };

  const typeInfo = HOBBY_TYPE_MAP[(form.hobbyType as HobbyType) ?? "creative"];
  const presets = PRESET_HOBBIES[(form.hobbyType as HobbyType) ?? "creative"] ?? [];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Hobby" : "Add Hobby"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">

          {/* Type selector */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">Hobby Type</label>
            <div className="grid grid-cols-3 gap-2">
              {HOBBY_TYPES.map(t => {
                const Icon = t.icon;
                const selected = form.hobbyType === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => { set("hobbyType", t.value); set("category", ""); }}
                    className={`flex flex-col items-center gap-1 p-2.5 rounded-lg border text-xs font-medium transition-all ${
                      selected
                        ? "border-2 text-white"
                        : "border hover:border-muted-foreground/50 text-muted-foreground"
                    }`}
                    style={selected ? { borderColor: t.color, backgroundColor: t.color + "22", color: t.color } : {}}
                  >
                    <Icon size={16} />
                    <span className="leading-tight text-center">{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Name + preset picker */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Hobby Name *</label>
            <div className="flex gap-2">
              <Input
                className="text-sm flex-1"
                placeholder={`e.g. ${presets[0] ?? "Photography"}`}
                value={form.name ?? ""}
                onChange={e => set("name", e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPresets(p => !p)}
                className="px-3 py-2 rounded-lg border text-xs text-muted-foreground hover:bg-muted transition-colors flex items-center gap-1"
              >
                <Layers size={13} />
                {showPresets ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
            </div>
            {showPresets && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {presets.map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => { set("name", p); set("category", p); setShowPresets(false); }}
                    className="text-xs px-2.5 py-1 rounded-full border hover:bg-muted transition-colors"
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Category */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Specific Category / Sub-type</label>
            <Input
              className="text-sm"
              placeholder="e.g. Landscape Photography, Fly Fishing…"
              value={form.category ?? ""}
              onChange={e => set("category", e.target.value)}
            />
          </div>

          {/* Skill level + Status in a row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Skill Level</label>
              <Select value={form.skillLevel ?? "beginner"} onValueChange={v => set("skillLevel", v)}>
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SKILL_LEVELS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
              <Select value={form.status ?? "active"} onValueChange={v => set("status", v)}>
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Date started */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Date Started</label>
            <Input
              type="date"
              className="text-sm"
              value={form.dateStarted ?? ""}
              onChange={e => set("dateStarted", e.target.value)}
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Why You Love It</label>
            <Textarea
              className="text-sm min-h-[70px]"
              placeholder="What drew you to this hobby? What do you enjoy about it?"
              value={form.description ?? ""}
              onChange={e => set("description", e.target.value)}
            />
          </div>

          {/* Cover URL */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Cover Photo URL</label>
            <Input
              className="text-sm"
              placeholder="https://…"
              value={form.coverUrl ?? ""}
              onChange={e => set("coverUrl", e.target.value)}
            />
          </div>

          {/* Type-specific fields */}
          <div className="rounded-lg border bg-muted/30 p-3">
            <p
              className="text-xs font-semibold mb-3 flex items-center gap-1.5"
              style={{ color: typeInfo?.color }}
            >
              {typeInfo && <typeInfo.icon size={13} />}
              {typeInfo?.label} Details
            </p>
            <ExtraFields
              hobbyType={(form.hobbyType as HobbyType) ?? "creative"}
              extra={extra}
              onChange={setExtraKey}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Personal Notes</label>
            <Textarea
              className="text-sm min-h-[60px]"
              placeholder="Goals, reminders, anything else…"
              value={form.notes ?? ""}
              onChange={e => set("notes", e.target.value)}
            />
          </div>

          {/* Favorite toggle */}
          <button
            type="button"
            onClick={() => set("isFavorite", !form.isFavorite)}
            className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg border transition-colors w-full ${
              form.isFavorite ? "bg-pink-50 dark:bg-pink-950/20 border-pink-200 text-pink-600" : "hover:bg-muted"
            }`}
          >
            <Heart size={14} className={form.isFavorite ? "fill-pink-500 text-pink-500" : ""} />
            {form.isFavorite ? "Marked as favorite" : "Mark as favorite"}
          </button>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={!form.name?.trim()}>
              {isEdit ? "Save Changes" : "Add Hobby"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function HobbiesPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: hobbies = [], isLoading } = useQuery<Hobby[]>({
    queryKey: ["/api/hobbies"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/hobbies");
      return r.json();
    },
  });

  const createMut = useMutation({
    mutationFn: (data: Partial<InsertHobby>) => apiRequest("POST", "/api/hobbies", data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/hobbies"] }); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<InsertHobby> }) =>
      apiRequest("PATCH", `/api/hobbies/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/hobbies"] }); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/hobbies/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/hobbies"] }); },
  });

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<HobbyType | "all">("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showForm, setShowForm] = useState(false);
  const [editHobby, setEditHobby] = useState<Hobby | null>(null);
  const [detailHobby, setDetailHobby] = useState<Hobby | null>(null);
  const [formInitial, setFormInitial] = useState<Partial<InsertHobby>>(EMPTY_FORM);

  const filtered = useMemo(() => {
    return hobbies.filter(h => {
      if (filterType !== "all" && h.hobbyType !== filterType) return false;
      if (filterStatus !== "all" && h.status !== filterStatus) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!h.name.toLowerCase().includes(q) && !(h.category ?? "").toLowerCase().includes(q) && !(h.description ?? "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [hobbies, filterType, filterStatus, search]);

  const grouped = useMemo(() => {
    if (filterType !== "all") return { [filterType]: filtered };
    const g: Record<string, Hobby[]> = {};
    for (const h of filtered) {
      if (!g[h.hobbyType]) g[h.hobbyType] = [];
      g[h.hobbyType].push(h);
    }
    return g;
  }, [filtered, filterType]);

  const openAdd = (type?: HobbyType) => {
    setFormInitial({ ...EMPTY_FORM, hobbyType: type ?? "creative" });
    setEditHobby(null);
    setShowForm(true);
  };
  const openEdit = (h: Hobby) => {
    setFormInitial({
      name: h.name, hobbyType: h.hobbyType as HobbyType, category: h.category ?? "",
      description: h.description ?? "", skillLevel: h.skillLevel, dateStarted: h.dateStarted ?? "",
      status: h.status, notes: h.notes ?? "", extraJson: h.extraJson ?? "{}",
      isFavorite: h.isFavorite, coverUrl: h.coverUrl ?? "",
    });
    setEditHobby(h);
    setShowForm(true);
  };

  const handleSave = async (data: Partial<InsertHobby>) => {
    try {
      if (editHobby) {
        await updateMut.mutateAsync({ id: editHobby.id, data });
        toast({ title: "Hobby updated" });
      } else {
        await createMut.mutateAsync(data);
        toast({ title: "Hobby added!" });
      }
      setShowForm(false);
      setEditHobby(null);
    } catch {
      toast({ title: "Something went wrong", variant: "destructive" });
    }
  };

  const handleDelete = async (h: Hobby) => {
    try {
      await deleteMut.mutateAsync(h.id);
      toast({ title: "Hobby removed" });
    } catch {
      toast({ title: "Error deleting hobby", variant: "destructive" });
    }
  };

  const handleToggleFavorite = async (h: Hobby) => {
    await updateMut.mutateAsync({ id: h.id, data: { isFavorite: !h.isFavorite } });
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const h of hobbies) c[h.hobbyType] = (c[h.hobbyType] ?? 0) + 1;
    return c;
  }, [hobbies]);

  const activeCount = hobbies.filter(h => h.status === "active").length;
  const favCount = hobbies.filter(h => h.isFavorite).length;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Hobbies</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {hobbies.length} {hobbies.length === 1 ? "hobby" : "hobbies"}
            {activeCount > 0 && ` · ${activeCount} active`}
            {favCount > 0 && ` · ${favCount} favorited`}
          </p>
        </div>
        <Button size="sm" onClick={() => openAdd()}>
          <Plus size={15} className="mr-1.5" /> Add Hobby
        </Button>
      </div>

      {/* Stats row */}
      {hobbies.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {HOBBY_TYPES.map(t => {
            const cnt = counts[t.value] ?? 0;
            if (cnt === 0 && filterType !== t.value) return null;
            const Icon = t.icon;
            return (
              <button
                key={t.value}
                onClick={() => setFilterType(filterType === t.value ? "all" : t.value)}
                className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border text-center transition-all ${
                  filterType === t.value ? "ring-2 ring-offset-1" : "hover:bg-muted/50"
                }`}
                style={filterType === t.value ? { ringColor: t.color, borderColor: t.color, backgroundColor: t.color + "15" } : {}}
              >
                <Icon size={16} style={{ color: t.color }} />
                <span className="text-[10px] font-medium leading-tight" style={{ color: t.color }}>{t.emoji} {t.label.split(" ")[0]}</span>
                <span className="text-sm font-bold">{cnt}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8 text-sm"
            placeholder="Search hobbies…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setSearch("")}>
              <X size={13} className="text-muted-foreground" />
            </button>
          )}
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-full sm:w-36 text-sm"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {(filterType !== "all" || filterStatus !== "all" || search) && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterType("all"); setFilterStatus("all"); setSearch(""); }}>
            Clear
          </Button>
        )}
      </div>

      {/* Empty state */}
      {!isLoading && hobbies.length === 0 && (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">🎯</div>
          <h2 className="text-lg font-semibold mb-1">What do you love to do?</h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">
            Track your hobbies, skills, and passions in one place.
          </p>
          <div className="flex flex-wrap gap-2 justify-center mb-6">
            {HOBBY_TYPES.map(t => (
              <button
                key={t.value}
                onClick={() => openAdd(t.value)}
                className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-full border hover:bg-muted transition-colors"
              >
                <span>{t.emoji}</span> {t.label}
              </button>
            ))}
          </div>
          <Button onClick={() => openAdd()}>
            <Plus size={15} className="mr-1.5" /> Add Your First Hobby
          </Button>
        </div>
      )}

      {/* No results */}
      {!isLoading && hobbies.length > 0 && filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p className="mb-2">No hobbies match your filters.</p>
          <Button variant="ghost" size="sm" onClick={() => { setFilterType("all"); setFilterStatus("all"); setSearch(""); }}>
            Clear filters
          </Button>
        </div>
      )}

      {/* Grouped grid */}
      {Object.entries(grouped).map(([type, items]) => {
        if (items.length === 0) return null;
        const typeInfo = HOBBY_TYPE_MAP[type as HobbyType];
        if (!typeInfo) return null;
        const TypeIcon = typeInfo.icon;
        return (
          <div key={type}>
            {filterType === "all" && (
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ backgroundColor: typeInfo.color + "22" }}>
                  <TypeIcon size={13} style={{ color: typeInfo.color }} />
                </div>
                <h2 className="text-sm font-semibold" style={{ color: typeInfo.color }}>{typeInfo.label}</h2>
                <span className="text-xs text-muted-foreground">({items.length})</span>
                <div className="flex-1 h-px bg-border" />
                <button
                  onClick={() => openAdd(type as HobbyType)}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
                >
                  <Plus size={11} /> Add
                </button>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {items.map(h => (
                <HobbyCard
                  key={h.id}
                  hobby={h}
                  onEdit={() => openEdit(h)}
                  onDelete={() => handleDelete(h)}
                  onToggleFavorite={() => handleToggleFavorite(h)}
                  onClick={() => setDetailHobby(h)}
                />
              ))}
              {/* Add card for this type */}
              <button
                onClick={() => openAdd(type as HobbyType)}
                className="rounded-xl border-2 border-dashed border-muted-foreground/20 hover:border-muted-foreground/40 transition-colors flex flex-col items-center justify-center gap-2 p-6 text-muted-foreground min-h-[100px]"
              >
                <Plus size={18} />
                <span className="text-xs">Add {typeInfo.label} hobby</span>
              </button>
            </div>
          </div>
        );
      })}

      {/* Dialogs */}
      <HobbyFormDialog
        key={editHobby?.id ?? "new"}
        open={showForm}
        onClose={() => { setShowForm(false); setEditHobby(null); }}
        initial={formInitial}
        onSave={handleSave}
      />

      <HobbyDetailDialog
        hobby={detailHobby}
        open={!!detailHobby}
        onClose={() => setDetailHobby(null)}
        onEdit={() => { if (detailHobby) { setDetailHobby(null); openEdit(detailHobby); } }}
      />
    </div>
  );
}
