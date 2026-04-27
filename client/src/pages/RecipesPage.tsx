import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format, startOfWeek, parseISO } from "date-fns";
import {
  Plus, Pencil, Trash2, MoreHorizontal, Clock, ChefHat,
  CalendarDays, ShoppingCart, BookOpen, X, Check, Printer,
  RefreshCw, Flame, ChevronRight, ChevronDown, Layers, UtensilsCrossed,
  Leaf, Wheat, Droplets, Package, CakeSlice, Cookie, Upload, Download, HelpCircle, Search,
  Send, Users, Inbox, CornerUpRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import type { Recipe, InsertRecipe, MealBundle, InsertMealBundle, WeekPlan, GroceryCheck, RecipeIngredient, ComponentType, RecipeShareWithUser, PublicUser } from "@shared/schema";

// ── Constants ─────────────────────────────────────────────────────────────────
const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const SHORT_DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

const COMPONENT_TYPES: { value: ComponentType; label: string; icon: React.ReactNode; color: string; bg: string }[] = [
  { value: "main",      label: "Main",       icon: <UtensilsCrossed size={14} />, color: "text-rose-600 dark:text-rose-400",   bg: "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800"   },
  { value: "vegetable", label: "Vegetable",  icon: <Leaf size={14} />,            color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800" },
  { value: "side",      label: "Side",       icon: <Wheat size={14} />,           color: "text-amber-600 dark:text-amber-400",  bg: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800"   },
  { value: "sauce",     label: "Sauce",      icon: <Droplets size={14} />,        color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800" },
  { value: "dessert",   label: "Dessert",    icon: <CakeSlice size={14} />,       color: "text-pink-600 dark:text-pink-400",    bg: "bg-pink-50 dark:bg-pink-950/30 border-pink-200 dark:border-pink-800"    },
  { value: "baking",    label: "Baking",     icon: <Cookie size={14} />,          color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800" },
];

function getWeekStart(): string {
  const sun = startOfWeek(new Date(), { weekStartsOn: 0 });
  return format(sun, "yyyy-MM-dd");
}

function parseIngredients(json: string): RecipeIngredient[] {
  try { return JSON.parse(json); } catch { return []; }
}

function getComponentInfo(type: string | null | undefined) {
  return COMPONENT_TYPES.find(c => c.value === type) ?? null;
}

// ── Bucket grouping (by category/tag) ─────────────────────────────────────────
function groupByCategory(recipes: Recipe[]): { category: string | null; recipes: Recipe[] }[] {
  const map = new Map<string | null, Recipe[]>();
  recipes.forEach(r => {
    const key = r.category?.trim() || null;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  });
  return Array.from(map.entries())
    .sort(([a], [b]) => {
      if (a === null) return 1;
      if (b === null) return -1;
      return a.localeCompare(b);
    })
    .map(([category, recs]) => ({ category, recipes: recs }));
}

// Simple CSV parser
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]).map(h => h.trim());
  return lines.slice(1).map(line => {
    const cols = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (cols[i] ?? "").trim(); });
    return row;
  }).filter(row => Object.values(row).some(v => v));
}
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = ""; let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) { result.push(current); current = ""; }
    else current += c;
  }
  result.push(current);
  return result;
}

// ── Grocery grouping ───────────────────────────────────────────────────────────
function groupIngredients(recipes: Recipe[]): Record<string, { name: string; qty: string; recipes: string[] }[]> {
  const CATEGORIES: Record<string, string[]> = {
    "Produce":  ["onion","garlic","tomato","potato","carrot","celery","lettuce","spinach","pepper","lemon","lime","herb","basil","parsley","cilantro","thyme","rosemary","apple","banana","avocado","mushroom","zucchini","broccoli","asparagus"],
    "Meat & Seafood": ["beef","chicken","pork","lamb","steak","ribeye","salmon","shrimp","bacon","sausage","turkey","tuna","fish","ground"],
    "Dairy & Eggs": ["butter","cream","milk","cheese","egg","yogurt","parmesan","mozzarella","cheddar","sour cream"],
    "Pantry":    ["oil","salt","pepper","sugar","flour","vinegar","soy","sauce","paste","stock","broth","wine","honey","mustard","mayo","ketchup","bread","pasta","rice","noodle","canned","beans","lentil"],
    "Spices":    ["cumin","paprika","turmeric","oregano","cayenne","cinnamon","ginger","chili","bay","nutmeg","powder","flakes"],
    "Other":     [],
  };
  const map: Record<string, Map<string, { qty: string; recipes: Set<string> }>> = {};
  Object.keys(CATEGORIES).forEach(c => { map[c] = new Map(); });
  recipes.forEach(recipe => {
    const ings = parseIngredients(recipe.ingredientsJson);
    ings.forEach(ing => {
      const name = ing.name.trim(); if (!name) return;
      const key = name.toLowerCase();
      let cat = "Other";
      for (const [c, keywords] of Object.entries(CATEGORIES)) {
        if (c === "Other") continue;
        if (keywords.some(k => key.includes(k))) { cat = c; break; }
      }
      if (!map[cat].has(key)) map[cat].set(key, { qty: ing.qty, recipes: new Set() });
      const entry = map[cat].get(key)!;
      if (ing.qty && entry.qty !== ing.qty) entry.qty = entry.qty ? `${entry.qty}, ${ing.qty}` : ing.qty;
      entry.recipes.add(recipe.name);
    });
  });
  const result: Record<string, { name: string; qty: string; recipes: string[] }[]> = {};
  for (const [cat, m] of Object.entries(map)) {
    if (m.size === 0) continue;
    result[cat] = Array.from(m.entries()).map(([key, v]) => ({
      name: key.charAt(0).toUpperCase() + key.slice(1),
      qty: v.qty, recipes: Array.from(v.recipes),
    }));
  }
  return result;
}

// ── Recipe text parser ─────────────────────────────────────────────────────────
function parseRecipeText(raw: string): { ingredients: RecipeIngredient[]; instructions: string; recipeName: string } {
  const lines = raw.split('\n').map(l => l.trim());
  const ingredients: RecipeIngredient[] = [];
  const instructionLines: string[] = [];
  let recipeName = "";
  const isIngredientHeader = (l: string) => /^(ingredients?|what you('?ll)? need|you('?ll)? need):?\s*$/i.test(l);
  const isInstructionHeader = (l: string) => /^(instructions?|directions?|method|steps?|how to( make)?|preparation|prep):?\s*$/i.test(l);
  const UNIT_RE = /cups?|tbsps?|tsp|tablespoons?|teaspoons?|oz(?:s)?|lbs?|pounds?|grams?|g\b|kg\b|ml\b|liters?|cans?|cloves?|slices?|bunches?|handfuls?|pinch(?:es)?|dash(?:es)?|sprigs?|packages?|pkgs?|sticks?|sheets?/i;
  const QTY_RE = new RegExp(`^([\\d\\s½⅓¼⅔¾\\/\\.]+(?:\\s*(?:${UNIT_RE.source}))?\\s+)(.+)`, 'i');
  let mode: 'scan' | 'ingredients' | 'instructions' = 'scan';
  let firstNonEmpty = true;
  for (const line of lines) {
    if (!line) continue;
    if (firstNonEmpty) {
      firstNonEmpty = false;
      if (!isIngredientHeader(line) && !isInstructionHeader(line)) { recipeName = line; continue; }
    }
    if (isIngredientHeader(line)) { mode = 'ingredients'; continue; }
    if (isInstructionHeader(line)) { mode = 'instructions'; continue; }
    if (mode === 'ingredients') {
      const c = line.replace(/^[-•*·✓]\s*/, '');
      const m = c.match(QTY_RE);
      ingredients.push(m ? { qty: m[1].trim(), name: m[2].trim() } : { qty: '', name: c });
    } else if (mode === 'instructions') {
      instructionLines.push(line);
    } else {
      const c = line.replace(/^[-•*·✓\d\.]+\s*/, '');
      const m = c.match(QTY_RE);
      if (m) { mode = 'ingredients'; ingredients.push({ qty: m[1].trim(), name: m[2].trim() }); }
    }
  }
  if (ingredients.length === 0 && instructionLines.length === 0) {
    const rest = lines.slice(recipeName ? 1 : 0).filter(l => l);
    return { ingredients: [], instructions: rest.join('\n'), recipeName };
  }
  return { ingredients, instructions: instructionLines.join('\n').trim(), recipeName };
}

// ── Recipe Form Modal ─────────────────────────────────────────────────────────
function RecipeFormModal({ open, onClose, editRecipe }: {
  open: boolean; onClose: () => void; editRecipe: Recipe | null;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🍽️");
  const [componentType, setComponentType] = useState<string>("__none__");
  const [category, setCategory] = useState("");
  const [prepTime, setPrepTime] = useState("");
  const [cookTime, setCookTime] = useState("");
  const [instructions, setInstructions] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([{ name: "", qty: "" }]);
  const [pasteText, setPasteText] = useState("");
  const [showPaste, setShowPaste] = useState(false);

  useEffect(() => {
    if (open) {
      setName(editRecipe?.name ?? "");
      setEmoji(editRecipe?.emoji ?? "🍽️");
      setComponentType(editRecipe?.componentType ?? "__none__");
      setCategory(editRecipe?.category ?? "");
      setPrepTime(editRecipe?.prepTime?.toString() ?? "");
      setCookTime(editRecipe?.cookTime?.toString() ?? "");
      setInstructions(editRecipe?.instructions ?? "");
      setImageUrl(editRecipe?.imageUrl ?? "");
      const ings = editRecipe ? parseIngredients(editRecipe.ingredientsJson) : [];
      setIngredients(ings.length > 0 ? ings : [{ name: "", qty: "" }]);
      setPasteText(""); setShowPaste(false);
    }
  }, [open, editRecipe]);

  const inv = () => queryClient.invalidateQueries({ queryKey: ["/api/recipes"] });
  const createMut = useMutation({
    mutationFn: (d: InsertRecipe) => apiRequest("POST", "/api/recipes", d),
    onSuccess: () => { inv(); toast({ title: "Recipe saved" }); onClose(); },
  });
  const updateMut = useMutation({
    mutationFn: (d: Partial<InsertRecipe>) => apiRequest("PATCH", `/api/recipes/${editRecipe?.id}`, d),
    onSuccess: () => { inv(); toast({ title: "Recipe updated" }); onClose(); },
  });

  const addIngRow = () => setIngredients(p => [...p, { name: "", qty: "" }]);
  const removeIngRow = (i: number) => setIngredients(p => p.filter((_, j) => j !== i));
  const updateIng = (i: number, field: keyof RecipeIngredient, val: string) =>
    setIngredients(p => p.map((ing, j) => j !== i ? ing : { ...ing, [field]: val }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const payload: InsertRecipe = {
      name: name.trim(), emoji: emoji || "🍽️",
      componentType: componentType !== "__none__" ? componentType : null,
      category: category.trim() || null,
      prepTime: prepTime ? parseInt(prepTime) : null,
      cookTime: cookTime ? parseInt(cookTime) : null,
      instructions: instructions.trim() || null,
      ingredientsJson: JSON.stringify(ingredients.filter(i => i.name.trim())),
      imageUrl: imageUrl.trim() || null,
    };
    editRecipe ? updateMut.mutate(payload) : createMut.mutate(payload);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editRecipe ? "Edit Recipe" : "Add Recipe"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Paste & Parse */}
          <div className="rounded-xl border border-dashed bg-secondary/20 overflow-hidden">
            <button type="button" onClick={() => setShowPaste(v => !v)}
              className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              <span className="flex items-center gap-1.5"><BookOpen size={14} /> Paste a recipe to auto-fill</span>
              <ChevronRight size={14} className={`transition-transform ${showPaste ? "rotate-90" : ""}`} />
            </button>
            {showPaste && (
              <div className="px-3 pb-3 space-y-2 border-t">
                <Textarea value={pasteText} onChange={e => setPasteText(e.target.value)} rows={5}
                  placeholder={"Paste recipe here...\n\nIngredients:\n2 cups flour\n\nInstructions:\n1. Preheat oven..."} className="text-xs mt-2 resize-none" />
                <Button type="button" size="sm" variant="outline" disabled={!pasteText.trim()}
                  onClick={() => {
                    const parsed = parseRecipeText(pasteText);
                    if (parsed.recipeName && !name) setName(parsed.recipeName);
                    if (parsed.ingredients.length > 0) setIngredients(parsed.ingredients);
                    if (parsed.instructions) setInstructions(parsed.instructions);
                    setShowPaste(false); setPasteText("");
                    toast({ title: `Parsed ${parsed.ingredients.length} ingredients` });
                  }} className="gap-1.5">
                  <RefreshCw size={12} /> Parse Recipe
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Recipe Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Garlic Butter Ribeye" required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Component Type</Label>
              <Select value={componentType} onValueChange={setComponentType}>
                <SelectTrigger><SelectValue placeholder="Unclassified" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Unclassified</SelectItem>
                  {COMPONENT_TYPES.map(ct => (
                    <SelectItem key={ct.value} value={ct.value}>
                      <span className="flex items-center gap-1.5">{ct.icon} {ct.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tag <span className="text-muted-foreground text-xs">(opt)</span></Label>
              <Input value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Italian, BBQ" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Emoji</Label>
              <Input value={emoji} onChange={e => setEmoji(e.target.value)} placeholder="🍽️" maxLength={4} />
            </div>
            <div className="space-y-1.5">
              <Label>Prep (min)</Label>
              <Input type="number" value={prepTime} onChange={e => setPrepTime(e.target.value)} placeholder="15" min={0} />
            </div>
            <div className="space-y-1.5">
              <Label>Cook (min)</Label>
              <Input type="number" value={cookTime} onChange={e => setCookTime(e.target.value)} placeholder="30" min={0} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Image URL <span className="text-muted-foreground text-xs">(opt)</span></Label>
            {imageUrl && (
              <div className="relative h-32 w-full rounded-lg overflow-hidden mb-1.5 border">
                <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" onError={e => (e.currentTarget.style.display = "none")} />
              </div>
            )}
            <Input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://example.com/image.jpg" />
          </div>

          <div className="space-y-2">
            <Label>Ingredients</Label>
            {ingredients.map((ing, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Input value={ing.name} onChange={e => updateIng(i, "name", e.target.value)} placeholder="Ingredient" className="flex-[2]" />
                <Input value={ing.qty} onChange={e => updateIng(i, "qty", e.target.value)} placeholder="Qty" className="flex-1" />
                <button type="button" onClick={() => removeIngRow(i)} className="text-muted-foreground hover:text-destructive p-1 shrink-0"><X size={14} /></button>
              </div>
            ))}
            <Button type="button" variant="ghost" size="sm" onClick={addIngRow} className="gap-1.5 h-7 text-xs">
              <Plus size={12} /> Add Ingredient
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label>Instructions <span className="text-muted-foreground text-xs">(opt)</span></Label>
            <Textarea value={instructions} onChange={e => setInstructions(e.target.value)} rows={4} placeholder="Cooking steps..." />
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={createMut.isPending || updateMut.isPending} className="flex-1">
              {createMut.isPending || updateMut.isPending ? "Saving..." : editRecipe ? "Save Changes" : "Save Recipe"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Bundle Form Modal ─────────────────────────────────────────────────────────
function BundleFormModal({ open, onClose, editBundle, recipes }: {
  open: boolean; onClose: () => void; editBundle: MealBundle | null; recipes: Recipe[];
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🍽️");
  const [description, setDescription] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [filter, setFilter] = useState<ComponentType | "all">("all");

  useEffect(() => {
    if (open) {
      setName(editBundle?.name ?? "");
      setEmoji(editBundle?.emoji ?? "🍽️");
      setDescription(editBundle?.description ?? "");
      setSelectedIds(editBundle ? JSON.parse(editBundle.recipeIdsJson) : []);
      setFilter("all");
    }
  }, [open, editBundle]);

  const inv = () => queryClient.invalidateQueries({ queryKey: ["/api/meal-bundles"] });
  const createMut = useMutation({
    mutationFn: (d: InsertMealBundle) => apiRequest("POST", "/api/meal-bundles", d),
    onSuccess: () => { inv(); toast({ title: "Bundle saved" }); onClose(); },
  });
  const updateMut = useMutation({
    mutationFn: (d: Partial<InsertMealBundle>) => apiRequest("PATCH", `/api/meal-bundles/${editBundle?.id}`, d),
    onSuccess: () => { inv(); toast({ title: "Bundle updated" }); onClose(); },
  });

  const toggleRecipe = (id: number) =>
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const filtered = filter === "all" ? recipes : recipes.filter(r => r.componentType === filter);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const payload: InsertMealBundle = {
      name: name.trim(), emoji: emoji || "🍽️",
      description: description.trim() || null,
      recipeIdsJson: JSON.stringify(selectedIds),
    };
    editBundle ? updateMut.mutate(payload) : createMut.mutate(payload);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editBundle ? "Edit Bundle" : "Create Meal Bundle"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Emoji</Label>
              <Input value={emoji} onChange={e => setEmoji(e.target.value)} placeholder="🍽️" maxLength={4} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Bundle Name *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Steak Night" required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Description <span className="text-muted-foreground text-xs">(opt)</span></Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Our classic Saturday dinner" />
          </div>

          {/* Recipe picker */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Pick Components</Label>
              <span className="text-xs text-muted-foreground">{selectedIds.length} selected</span>
            </div>
            {/* Type filter pills */}
            <div className="flex gap-1.5 flex-wrap">
              {([{ value: "all", label: "All" }, ...COMPONENT_TYPES.map(c => ({ value: c.value, label: c.label }))] as { value: string; label: string }[]).map(f => (
                <button key={f.value} type="button" onClick={() => setFilter(f.value as any)}
                  className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${filter === f.value ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary hover:text-foreground"}`}>
                  {f.label}
                </button>
              ))}
            </div>
            <div className="border rounded-xl overflow-hidden max-h-64 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">No recipes in this category yet</p>
              ) : filtered.map(r => {
                const checked = selectedIds.includes(r.id);
                const info = getComponentInfo(r.componentType);
                return (
                  <label key={r.id} className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors border-b last:border-b-0 ${checked ? "bg-primary/5" : "hover:bg-secondary/40"}`}>
                    <input type="checkbox" checked={checked} onChange={() => toggleRecipe(r.id)} className="accent-primary shrink-0" />
                    <span className="text-lg shrink-0">{r.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{r.name}</p>
                      {info && <p className={`text-xs ${info.color}`}>{info.label}</p>}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Selected preview */}
          {selectedIds.length > 0 && (
            <div className="p-3 rounded-xl bg-secondary/30 border">
              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Bundle Preview</p>
              <div className="flex flex-wrap gap-2">
                {selectedIds.map(id => {
                  const r = recipes.find(x => x.id === id);
                  if (!r) return null;
                  return (
                    <span key={id} className="flex items-center gap-1 text-xs bg-background border rounded-full px-2 py-1">
                      {r.emoji} {r.name}
                      <button type="button" onClick={() => toggleRecipe(id)} className="text-muted-foreground hover:text-destructive ml-0.5"><X size={10} /></button>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Button type="submit" disabled={createMut.isPending || updateMut.isPending} className="flex-1">
              {createMut.isPending || updateMut.isPending ? "Saving..." : editBundle ? "Save Bundle" : "Create Bundle"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Avatar helper ─────────────────────────────────────────────────────────────
function Avatar({ user }: { user: { name: string; avatarUrl?: string | null } }) {
  if (user.avatarUrl) return <img src={user.avatarUrl} alt={user.name} className="w-7 h-7 rounded-full object-cover shrink-0" />;
  return (
    <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold shrink-0">
      {user.name.charAt(0).toUpperCase()}
    </div>
  );
}

// ── Recipe Share Modal ────────────────────────────────────────────────────────
function RecipeShareModal({ open, onClose, recipe }: {
  open: boolean; onClose: () => void; recipe: Recipe | null;
}) {
  const { toast } = useToast();
  const [selectedFriendId, setSelectedFriendId] = useState<number | null>(null);
  const [note, setNote] = useState("");

  const { data: friends = [] } = useQuery<PublicUser[]>({
    queryKey: ["/api/friends"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/friends"); return r.json(); },
    enabled: open,
  });

  useEffect(() => { if (open) { setSelectedFriendId(null); setNote(""); } }, [open, recipe]);

  const sendMut = useMutation({
    mutationFn: (body: object) => apiRequest("POST", "/api/recipe-shares", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recipe-shares"] });
      queryClient.invalidateQueries({ queryKey: ["/api/shares/count"] });
      toast({ title: `Shared "${recipe?.name}"` });
      onClose();
    },
    onError: () => toast({ title: "Failed to share recipe", variant: "destructive" }),
  });

  function handleSend() {
    if (!recipe || !selectedFriendId) return;
    sendMut.mutate({
      toUserId: selectedFriendId,
      recipeName: recipe.name,
      recipeEmoji: recipe.emoji,
      recipeCategory: recipe.category,
      recipeComponentType: recipe.componentType,
      recipePrepTime: recipe.prepTime,
      recipeCookTime: recipe.cookTime,
      recipeServings: (recipe as any).servings ?? null,
      recipeIngredients: recipe.ingredientsJson,
      recipeInstructions: recipe.instructions,
      recipeImageUrl: recipe.imageUrl,
      notes: note.trim() || null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Send size={15} /> Share Recipe
          </DialogTitle>
        </DialogHeader>

        {recipe && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 border">
            <span className="text-2xl shrink-0">{recipe.emoji}</span>
            <div className="min-w-0">
              <p className="text-sm font-semibold line-clamp-1">{recipe.name}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                {recipe.prepTime != null && <span>Prep {recipe.prepTime}m</span>}
                {recipe.cookTime != null && <span>Cook {recipe.cookTime}m</span>}
                {recipe.category && <span>{recipe.category}</span>}
              </div>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Send to</label>
            {friends.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3 border rounded-lg">
                <Users size={18} className="mx-auto mb-1 opacity-30" />
                No friends yet — connect with people in the Relationships tab
              </p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {friends.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setSelectedFriendId(f.id === selectedFriendId ? null : f.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left transition-colors ${
                      selectedFriendId === f.id ? "border-primary bg-primary/10" : "hover:bg-secondary border-border"
                    }`}
                  >
                    <Avatar user={f} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{f.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{f.email}</p>
                    </div>
                    {selectedFriendId === f.id && <Check size={14} className="text-primary shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Note (optional)</label>
            <textarea
              className="w-full text-sm border rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              rows={2}
              placeholder="Why you're sharing this…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-1">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSend} disabled={!selectedFriendId || sendMut.isPending} className="gap-1.5">
            <Send size={13} /> Share
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Shared Recipes Tab ────────────────────────────────────────────────────────
function SharedRecipesTab() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: shares } = useQuery<{ received: RecipeShareWithUser[]; sent: RecipeShareWithUser[] }>({
    queryKey: ["/api/recipe-shares"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/recipe-shares"); return r.json(); },
  });

  const dismissMut = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/recipe-shares/${id}/dismiss`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/recipe-shares"] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/recipe-shares/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/recipe-shares"] }),
  });

  const addToLibraryMut = useMutation({
    mutationFn: (share: RecipeShareWithUser) => apiRequest("POST", "/api/recipes", {
      name: share.recipeName,
      emoji: share.recipeEmoji,
      category: share.recipeCategory,
      componentType: share.recipeComponentType,
      prepTime: share.recipePrepTime,
      cookTime: share.recipeCookTime,
      servings: share.recipeServings,
      ingredientsJson: share.recipeIngredients,
      instructions: share.recipeInstructions,
      imageUrl: share.recipeImageUrl,
      notes: share.notes ? `Shared by ${share.fromUser.name}: ${share.notes}` : `Shared by ${share.fromUser.name}`,
      isFavorite: false,
    }),
    onSuccess: (_, share) => {
      qc.invalidateQueries({ queryKey: ["/api/recipes"] });
      toast({ title: `Added "${share.recipeName}" to your library` });
    },
    onError: () => toast({ title: "Failed to add recipe", variant: "destructive" }),
  });

  const received = shares?.received ?? [];
  const sent = shares?.sent ?? [];

  return (
    <div className="space-y-6">
      {/* Received */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Inbox size={14} className="text-muted-foreground" />
          <h3 className="font-semibold text-sm">Shared with You</h3>
          {received.length > 0 && (
            <span className="text-xs bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 font-medium">{received.length}</span>
          )}
        </div>
        {received.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8 border rounded-lg border-dashed">
            No recipes shared with you yet — friends can share recipes from their library
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {received.map((share) => {
              const totalTime = (share.recipePrepTime ?? 0) + (share.recipeCookTime ?? 0);
              const info = getComponentInfo(share.recipeComponentType);
              const ingredients = parseIngredients(share.recipeIngredients);
              return (
                <div key={share.id} className="border rounded-xl bg-card overflow-hidden">
                  {share.recipeImageUrl ? (
                    <div className="relative h-32 overflow-hidden">
                      <img src={share.recipeImageUrl} alt={share.recipeName} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                      <span className="absolute bottom-2 left-3 text-white text-sm font-semibold line-clamp-1">{share.recipeName}</span>
                    </div>
                  ) : (
                    <div className={`px-4 py-3 flex items-center gap-2 ${info ? info.bg : "bg-amber-50 dark:bg-amber-950/30"}`}>
                      <span className="text-2xl">{share.recipeEmoji}</span>
                      <p className="font-semibold text-sm line-clamp-1">{share.recipeName}</p>
                    </div>
                  )}
                  <div className="p-3 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                      {totalTime > 0 && <span className="flex items-center gap-1"><Clock size={10} />{totalTime}m</span>}
                      {share.recipeCategory && <span>{share.recipeCategory}</span>}
                      {info && <span className={`font-medium ${info.color}`}>{info.label}</span>}
                    </div>
                    {ingredients.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {ingredients.slice(0, 4).map((ing, i) => (
                          <span key={i} className="text-xs px-1.5 py-0.5 bg-secondary rounded-full text-muted-foreground">{ing.name}</span>
                        ))}
                        {ingredients.length > 4 && <span className="text-xs text-muted-foreground">+{ingredients.length - 4}</span>}
                      </div>
                    )}
                    <div className="flex items-center gap-1.5">
                      <Avatar user={share.fromUser} />
                      <span className="text-xs text-muted-foreground">from <span className="font-medium text-foreground">{share.fromUser.name}</span></span>
                    </div>
                    {share.notes && <p className="text-xs italic text-muted-foreground line-clamp-2">"{share.notes}"</p>}
                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        className="flex-1 h-7 text-xs gap-1"
                        onClick={() => addToLibraryMut.mutate(share)}
                        disabled={addToLibraryMut.isPending}
                      >
                        <Plus size={11} /> Add to Library
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground"
                        onClick={() => dismissMut.mutate(share.id)}
                      >
                        <X size={12} />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Sent */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <CornerUpRight size={14} className="text-muted-foreground" />
          <h3 className="font-semibold text-sm">Shared by You</h3>
        </div>
        {sent.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8 border rounded-lg border-dashed">
            You haven't shared any recipes yet — use the ··· menu on any recipe
          </p>
        ) : (
          <div className="space-y-2">
            {sent.map((share) => (
              <div key={share.id} className="flex items-center gap-3 p-3 border rounded-lg bg-card">
                <span className="text-xl shrink-0">{share.recipeEmoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium line-clamp-1">{share.recipeName}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-xs text-muted-foreground">to <span className="font-medium text-foreground">{share.toUser.name}</span></span>
                    <span className="text-xs text-muted-foreground">· {format(parseISO(share.createdAt), "MMM d")}</span>
                  </div>
                </div>
                {share.notes && <p className="text-xs italic text-muted-foreground max-w-32 line-clamp-2 hidden sm:block">"{share.notes}"</p>}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                  onClick={() => deleteMut.mutate(share.id)}
                >
                  <Trash2 size={12} />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Recipe Card ───────────────────────────────────────────────────────────────
function RecipeCard({ recipe, onDetail, onAssign, onEdit, onDelete, onShare, isOnWeek }: {
  recipe: Recipe; onDetail: () => void; onAssign: () => void;
  onEdit: () => void; onDelete: () => void; onShare: () => void; isOnWeek: boolean;
}) {
  const ingredients = parseIngredients(recipe.ingredientsJson);
  const info = getComponentInfo(recipe.componentType);
  return (
    <div className="bg-card border rounded-xl overflow-hidden hover:shadow-md transition-all cursor-pointer group"
      onClick={onDetail}>
      {recipe.imageUrl ? (
        <div className="relative h-36 w-full overflow-hidden">
          <img src={recipe.imageUrl} alt={recipe.name} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
          <div className="absolute top-2 right-2 flex items-center gap-1 flex-wrap justify-end">
            {isOnWeek && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-200/80 text-amber-900">This week</span>
            )}
            {info && (
              <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${info.bg} ${info.color}`}>
                {info.icon} {info.label}
              </span>
            )}
            {recipe.category && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary text-primary-foreground">{recipe.category}</span>
            )}
          </div>
        </div>
      ) : (
        <div className={`px-4 py-3 flex items-start justify-between ${info ? info.bg : "bg-amber-50 dark:bg-amber-950/30"}`}>
          <span className="text-2xl">{recipe.emoji}</span>
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {isOnWeek && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-200/60 dark:bg-amber-800/40 text-amber-800 dark:text-amber-300">This week</span>
            )}
            {info && (
              <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${info.bg} ${info.color}`}>
                {info.icon} {info.label}
              </span>
            )}
            {recipe.category && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary text-primary-foreground">{recipe.category}</span>
            )}
          </div>
        </div>
      )}
      <div className="p-3">
        <p className="font-semibold text-sm leading-tight mb-1">{recipe.name}</p>
        <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
          {recipe.prepTime != null && <span className="flex items-center gap-1"><Clock size={10} />Prep {recipe.prepTime}m</span>}
          {recipe.cookTime != null && <span className="flex items-center gap-1"><Clock size={10} />Cook {recipe.cookTime}m</span>}
        </div>
        {ingredients.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {ingredients.slice(0, 4).map((ing, i) => (
              <span key={i} className="text-xs px-1.5 py-0.5 bg-secondary rounded-full text-muted-foreground">{ing.name}</span>
            ))}
            {ingredients.length > 4 && <span className="text-xs text-muted-foreground">+{ingredients.length - 4}</span>}
          </div>
        )}
      </div>
      <div className="border-t px-3 py-2 flex items-center gap-1" onClick={e => e.stopPropagation()}>
        <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 flex-1" onClick={onAssign}>
          <CalendarDays size={11} /> Add to Week
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal size={12} /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}><Pencil size={12} className="mr-2" />Edit</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onShare}><Send size={12} className="mr-2" />Share with Friend</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
              <Trash2 size={12} className="mr-2" />Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

// ── Recipe Detail ─────────────────────────────────────────────────────────────
function RecipeDetail({ recipe, onClose, onAddToWeek }: {
  recipe: Recipe; onClose: () => void; onAddToWeek: (r: Recipe) => void;
}) {
  const ingredients = parseIngredients(recipe.ingredientsJson);
  const totalTime = (recipe.prepTime ?? 0) + (recipe.cookTime ?? 0);
  const info = getComponentInfo(recipe.componentType);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto p-0 gap-0">
        {recipe.imageUrl && (
          <div className="relative h-52 w-full overflow-hidden rounded-t-lg">
            <img src={recipe.imageUrl} alt={recipe.name} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          </div>
        )}
        <div className="px-6 pt-5 pb-2">
          <DialogHeader>
            <div className="flex items-center gap-3">
              {!recipe.imageUrl && <span className="text-3xl">{recipe.emoji}</span>}
              <div>
                <DialogTitle className="text-xl font-bold leading-tight">{recipe.name}</DialogTitle>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {info && <span className={`text-xs font-medium ${info.color}`}>{info.label}</span>}
                  {recipe.category && <span className="text-xs text-muted-foreground">{recipe.category}</span>}
                </div>
              </div>
            </div>
          </DialogHeader>
        </div>
        <div className="space-y-4 px-6 pb-6">
          {(recipe.prepTime != null || recipe.cookTime != null) && (
            <div className="grid grid-cols-3 gap-3 p-3 bg-secondary/40 rounded-xl text-center">
              {recipe.prepTime != null && <div><p className="text-lg font-bold">{recipe.prepTime}m</p><p className="text-xs text-muted-foreground">Prep</p></div>}
              {recipe.cookTime != null && <div><p className="text-lg font-bold">{recipe.cookTime}m</p><p className="text-xs text-muted-foreground">Cook</p></div>}
              {totalTime > 0 && <div><p className="text-lg font-bold">{totalTime}m</p><p className="text-xs text-muted-foreground">Total</p></div>}
            </div>
          )}
          {ingredients.length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-primary mb-2">Ingredients</p>
              <div className="space-y-1.5">
                {ingredients.map((ing, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 px-3 bg-secondary/30 rounded-lg">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                      <span className="text-sm">{ing.name}</span>
                    </div>
                    {ing.qty && <span className="text-xs text-muted-foreground">{ing.qty}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {recipe.instructions && (
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-primary mb-2">Instructions</p>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{recipe.instructions}</p>
            </div>
          )}
          <div className="flex gap-2">
            <Button onClick={() => { onAddToWeek(recipe); onClose(); }} variant="outline" className="flex-1 gap-1.5">
              <CalendarDays size={14} /> Add to Week
            </Button>
            <Button variant="outline" onClick={onClose}>Close</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Assign Day Modal ──────────────────────────────────────────────────────────
function AssignDayModal({ recipe, bundle, weekStart, onClose, existingPlan }: {
  recipe?: Recipe; bundle?: MealBundle; weekStart: string; onClose: () => void; existingPlan: WeekPlan[];
}) {
  const { toast } = useToast();
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const assignMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/week-plan", {
      dayIndex: selectedDay,
      weekStart,
      recipeId: recipe?.id ?? null,
      bundleId: bundle?.id ?? null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/week-plan", weekStart] });
      const name = recipe?.name ?? bundle?.name ?? "";
      toast({ title: `${name} added to ${SHORT_DAYS[selectedDay!]}` });
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Add to Week</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Pick a day for <strong>{recipe?.name ?? bundle?.name}</strong>:</p>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((day, i) => {
              const taken = existingPlan.some(p => p.dayIndex === i);
              return (
                <button key={i} type="button" onClick={() => setSelectedDay(i)}
                  className={["px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                    selectedDay === i ? "bg-primary text-primary-foreground border-primary" :
                    taken ? "border-border bg-secondary/50 text-muted-foreground" :
                    "border-border hover:border-primary hover:text-primary"].join(" ")}>
                  {SHORT_DAYS[i]}{taken && <span className="ml-1 opacity-50">·</span>}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <Button onClick={() => assignMut.mutate()} disabled={selectedDay === null || assignMut.isPending} className="flex-1">
              <Check size={14} className="mr-1" /> Assign
            </Button>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── MealDB Search Modal ───────────────────────────────────────────────────────

const MEALDB_CATEGORY_EMOJI: Record<string, string> = {
  beef: "🥩", chicken: "🍗", dessert: "🍰", lamb: "🍖", miscellaneous: "🍽️",
  pasta: "🍝", pork: "🥓", seafood: "🐟", side: "🥗", starter: "🥗",
  vegan: "🌿", vegetarian: "🥦", breakfast: "🍳", goat: "🐐",
};
const MEALDB_COMPONENT_MAP: Record<string, string> = {
  dessert: "dessert", starter: "side", side: "side",
  beef: "main", chicken: "main", lamb: "main", pasta: "main", pork: "main",
  seafood: "main", vegan: "main", vegetarian: "main", breakfast: "main",
  goat: "main", miscellaneous: "main",
};

interface MealDBMeal {
  idMeal: string; strMeal: string; strCategory: string; strArea: string;
  strInstructions: string; strMealThumb: string; [key: string]: string;
}

function extractIngredients(meal: MealDBMeal) {
  const ings: { name: string; qty: string }[] = [];
  for (let i = 1; i <= 20; i++) {
    const name = (meal[`strIngredient${i}`] ?? "").trim();
    const qty  = (meal[`strMeasure${i}`]   ?? "").trim();
    if (name) ings.push({ name, qty });
  }
  return ings;
}

function MealDBSearchModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MealDBMeal[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [categories, setCategories] = useState<{ strCategory: string; strCategoryThumb: string; strCategoryDescription: string }[]>([]);
  const [browseCategory, setBrowseCategory] = useState<string | null>(null);
  const [catLoading, setCatLoading] = useState(false);
  const [mode, setMode] = useState<"search" | "browse">("search");
  const [preview, setPreview] = useState<MealDBMeal | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  async function openPreview(meal: MealDBMeal) {
    // If browse result (no instructions), fetch full details first
    if (!meal.strInstructions) {
      setPreviewLoading(true);
      setPreview({ ...meal }); // show panel immediately with loading state
      try {
        const r = await fetch(`https://www.themealdb.com/api/json/v1/1/lookup.php?i=${meal.idMeal}`);
        const d = await r.json();
        setPreview(d.meals?.[0] ?? meal);
      } catch {
        toast({ title: "Could not load recipe details", variant: "destructive" });
      } finally { setPreviewLoading(false); }
    } else {
      setPreview(meal);
    }
  }

  // Load categories once on open
  useEffect(() => {
    if (!open || categories.length > 0) return;
    fetch("https://www.themealdb.com/api/json/v1/1/categories.php")
      .then(r => r.json())
      .then(d => setCategories(d.categories ?? []))
      .catch(() => {});
  }, [open]);

  async function doSearch() {
    if (!query.trim()) return;
    setLoading(true); setResults([]);
    try {
      const r = await fetch(`https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(query.trim())}`);
      const d = await r.json();
      setResults(d.meals ?? []);
      if (!d.meals) toast({ title: "No results found", description: `Nothing matched "${query}"` });
    } catch {
      toast({ title: "Search failed", description: "Could not reach TheMealDB", variant: "destructive" });
    } finally { setLoading(false); }
  }

  async function browseByCategory(cat: string) {
    setBrowseCategory(cat); setCatLoading(true); setResults([]);
    try {
      const r = await fetch(`https://www.themealdb.com/api/json/v1/1/filter.php?c=${encodeURIComponent(cat)}`);
      const d = await r.json();
      // filter results only have id/name/thumb — we'll do full lookup on add
      setResults((d.meals ?? []).map((m: any) => ({
        idMeal: m.idMeal, strMeal: m.strMeal, strMealThumb: m.strMealThumb,
        strCategory: cat, strArea: "", strInstructions: "",
      })));
    } catch {
      toast({ title: "Browse failed", variant: "destructive" });
    } finally { setCatLoading(false); }
  }

  async function addMeal(meal: MealDBMeal) {
    setAdding(prev => new Set([...prev, meal.idMeal]));
    try {
      let fullMeal = meal;
      // If browsed (no instructions), do a full lookup first
      if (!meal.strInstructions) {
        const r = await fetch(`https://www.themealdb.com/api/json/v1/1/lookup.php?i=${meal.idMeal}`);
        const d = await r.json();
        fullMeal = d.meals?.[0] ?? meal;
      }
      const catKey = (fullMeal.strCategory ?? "").toLowerCase();
      await apiRequest("POST", "/api/recipes", {
        name: fullMeal.strMeal,
        emoji: MEALDB_CATEGORY_EMOJI[catKey] ?? "🍽️",
        category: fullMeal.strArea || null,
        componentType: MEALDB_COMPONENT_MAP[catKey] ?? "main",
        ingredientsJson: JSON.stringify(extractIngredients(fullMeal)),
        instructions: fullMeal.strInstructions || null,
        imageUrl: fullMeal.strMealThumb || null,
        prepTime: null,
        cookTime: null,
      });
      setAdded(prev => new Set([...prev, meal.idMeal]));
      qc.invalidateQueries({ queryKey: ["/api/recipes"] });
      toast({ title: `"${fullMeal.strMeal}" added to your recipes ✓` });
    } catch {
      toast({ title: "Failed to add recipe", variant: "destructive" });
    } finally {
      setAdding(prev => { const n = new Set(prev); n.delete(meal.idMeal); return n; });
    }
  }

  function handleClose() {
    setQuery(""); setResults([]); setAdded(new Set()); setBrowseCategory(null); setMode("search"); setPreview(null);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={`${preview ? "max-w-5xl" : "max-w-3xl"} max-h-[88vh] flex flex-col p-0 gap-0 transition-all duration-200`}>
        <DialogHeader className="px-6 pt-5 pb-0 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <ChefHat size={18} /> Find Recipes from MealDB
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-0.5">Search thousands of recipes and add them to your library in one click.</p>
        </DialogHeader>

        {/* Mode toggle + search */}
        <div className="px-6 pt-4 pb-3 space-y-3 shrink-0 border-b">
          <div className="flex gap-1 bg-muted rounded-lg p-1 w-fit">
            {[{ id: "search", label: "Search" }, { id: "browse", label: "Browse by Category" }].map(m => (
              <button
                key={m.id}
                onClick={() => { setMode(m.id as any); setResults([]); setBrowseCategory(null); }}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${mode === m.id ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >{m.label}</button>
            ))}
          </div>
          {mode === "search" && (
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="e.g. chicken tikka, chocolate cake, pasta…"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && doSearch()}
                />
              </div>
              <Button onClick={doSearch} disabled={loading || !query.trim()} className="gap-1.5">
                {loading ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
                Search
              </Button>
            </div>
          )}
          {mode === "browse" && browseCategory && (
            <div className="flex items-center gap-2">
              <button onClick={() => { setBrowseCategory(null); setResults([]); }} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
                <ChevronRight size={14} className="rotate-180" /> All Categories
              </button>
              <span className="text-sm font-medium">{browseCategory}</span>
            </div>
          )}
        </div>

        {/* Content area — splits into results + preview when a recipe is selected */}
        <div className="flex flex-1 min-h-0">
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Browse: category grid */}
          {mode === "browse" && !browseCategory && (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {categories.map(cat => (
                <button
                  key={cat.strCategory}
                  onClick={() => browseByCategory(cat.strCategory)}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-xl border bg-card hover:bg-accent/40 transition-colors text-center"
                >
                  <img src={cat.strCategoryThumb} alt={cat.strCategory} className="w-14 h-14 rounded-lg object-cover" />
                  <span className="text-xs font-medium leading-tight">{cat.strCategory}</span>
                </button>
              ))}
            </div>
          )}

          {/* Loading */}
          {(loading || catLoading) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[1,2,3,4].map(n => (
                <div key={n} className="flex gap-3 p-3 rounded-xl border bg-card animate-pulse">
                  <div className="w-20 h-20 rounded-lg bg-muted shrink-0" />
                  <div className="flex-1 space-y-2 pt-1">
                    <div className="h-4 bg-muted rounded w-3/4" />
                    <div className="h-3 bg-muted rounded w-1/2" />
                    <div className="h-7 bg-muted rounded w-24 mt-2" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Results */}
          {!loading && !catLoading && results.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {results.map(meal => {
                const isAdded = added.has(meal.idMeal);
                const isAdding = adding.has(meal.idMeal);
                return (
                  <div key={meal.idMeal} className="flex gap-3 p-3 rounded-xl border bg-card hover:bg-accent/20 transition-colors">
                    <img
                      src={meal.strMealThumb}
                      alt={meal.strMeal}
                      className="w-20 h-20 rounded-lg object-cover shrink-0"
                    />
                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      <div>
                        <p className="font-medium text-sm leading-snug line-clamp-2">{meal.strMeal}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {meal.strCategory && <span className="text-xs bg-secondary px-1.5 py-0.5 rounded-full">{meal.strCategory}</span>}
                          {meal.strArea && <span className="text-xs bg-secondary px-1.5 py-0.5 rounded-full">{meal.strArea}</span>}
                        </div>
                      </div>
                      <div className="flex gap-2 mt-2 flex-wrap">
                        <button
                          onClick={() => openPreview(meal)}
                          className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 ${
                            preview?.idMeal === meal.idMeal
                              ? "bg-secondary border-foreground/20 text-foreground"
                              : "hover:bg-secondary border-border text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <BookOpen size={11} /> Preview
                        </button>
                        <button
                          onClick={() => !isAdded && !isAdding && addMeal(meal)}
                          disabled={isAdded || isAdding}
                          className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                            isAdded
                              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 cursor-default"
                              : "bg-primary text-primary-foreground hover:bg-primary/90"
                          }`}
                        >
                          {isAdding
                            ? <><RefreshCw size={11} className="animate-spin" /> Adding…</>
                            : isAdded
                            ? <><Check size={11} /> Added</>
                            : <><Plus size={11} /> Add</>
                          }
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Empty state after search */}
          {!loading && !catLoading && results.length === 0 && mode === "search" && query && (
            <div className="text-center py-12 text-muted-foreground">
              <ChefHat size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No recipes found for "{query}"</p>
              <p className="text-xs mt-1">Try a different search term</p>
            </div>
          )}

          {/* Initial search prompt */}
          {!loading && results.length === 0 && mode === "search" && !query && (
            <div className="text-center py-12 text-muted-foreground">
              <Search size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Search for any dish to get started</p>
              <p className="text-xs mt-1">e.g. "pasta", "chicken", "chocolate cake"</p>
            </div>
          )}
        </div>{/* end results column */}

        {/* Preview panel */}
        {preview && (
          <div className="w-80 shrink-0 border-l flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b shrink-0">
              <span className="text-sm font-semibold">Preview</span>
              <button onClick={() => setPreview(null)} className="p-1 rounded hover:bg-secondary transition-colors">
                <X size={14} className="text-muted-foreground" />
              </button>
            </div>
            {previewLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <RefreshCw size={20} className="animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                {/* Hero image */}
                {preview.strMealThumb && (
                  <div className="relative h-44 shrink-0">
                    <img src={preview.strMealThumb} alt={preview.strMeal} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    <div className="absolute bottom-2 left-3 right-3">
                      <p className="text-white font-semibold text-sm leading-tight line-clamp-2">{preview.strMeal}</p>
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {preview.strCategory && <span className="text-[10px] bg-white/20 text-white px-1.5 py-0.5 rounded-full">{preview.strCategory}</span>}
                        {preview.strArea && <span className="text-[10px] bg-white/20 text-white px-1.5 py-0.5 rounded-full">{preview.strArea}</span>}
                      </div>
                    </div>
                  </div>
                )}

                <div className="p-4 space-y-4">
                  {/* Ingredients */}
                  {extractIngredients(preview).length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Ingredients</p>
                      <ul className="space-y-1">
                        {extractIngredients(preview).map((ing, i) => (
                          <li key={i} className="flex justify-between text-xs gap-2">
                            <span className="text-foreground">{ing.name}</span>
                            <span className="text-muted-foreground shrink-0">{ing.qty}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Instructions */}
                  {preview.strInstructions && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Instructions</p>
                      <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">{preview.strInstructions}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Add button */}
            <div className="p-3 border-t shrink-0">
              <button
                onClick={() => { addMeal(preview); }}
                disabled={added.has(preview.idMeal) || adding.has(preview.idMeal)}
                className={`w-full flex items-center justify-center gap-1.5 text-sm font-medium py-2 rounded-lg transition-colors ${
                  added.has(preview.idMeal)
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 cursor-default"
                    : "bg-primary text-primary-foreground hover:bg-primary/90"
                }`}
              >
                {adding.has(preview.idMeal)
                  ? <><RefreshCw size={13} className="animate-spin" /> Adding…</>
                  : added.has(preview.idMeal)
                  ? <><Check size={13} /> Added</>
                  : <><Plus size={13} /> Add to My Recipes</>
                }
              </button>
            </div>
          </div>
        )}
        </div>{/* end flex row */}

        <div className="px-6 py-3 border-t shrink-0 flex justify-between items-center">
          <p className="text-xs text-muted-foreground">Powered by <a href="https://www.themealdb.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">TheMealDB</a></p>
          <Button variant="outline" size="sm" onClick={handleClose}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
type SubView = "library" | "bundles" | "week" | "grocery" | "shared";
type LibFilter = ComponentType | "all" | "unclassified";

export default function RecipesPage() {
  const { toast } = useToast();
  const [subView, setSubView] = useState<SubView>("library");
  const [libFilter, setLibFilter] = useState<LibFilter>("all");
  const [recipeModal, setRecipeModal] = useState(false);
  const [editRecipe, setEditRecipe] = useState<Recipe | null>(null);
  const [detailRecipe, setDetailRecipe] = useState<Recipe | null>(null);
  const [bundleModal, setBundleModal] = useState(false);
  const [editBundle, setEditBundle] = useState<MealBundle | null>(null);
  const [assignRecipe, setAssignRecipe] = useState<Recipe | null>(null);
  const [assignBundle, setAssignBundle] = useState<MealBundle | null>(null);
  const [collapsedBuckets, setCollapsedBuckets] = useState<Set<string>>(new Set());
  const [csvInfoOpen, setCsvInfoOpen] = useState(false);
  const csvRef = useRef<HTMLInputElement>(null);
  const [mealDbOpen, setMealDbOpen] = useState(false);
  const [shareRecipe, setShareRecipe] = useState<Recipe | null>(null);
  const weekStart = getWeekStart();

  function toggleBucket(key: string) {
    setCollapsedBuckets(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  const COMPONENT_TYPE_MAP: Record<string, string> = {
    main: "main", vegetable: "vegetable", side: "side",
    sauce: "sauce", dessert: "dessert", baking: "baking",
  };

  function downloadCsvTemplate() {
    const header = "name,category,componentType,prepTime,cookTime,servings,notes,isFavorite";
    const ex1 = `"Spaghetti Bolognese",Italian,main,"15 min","45 min",4,"Classic comfort food",false`;
    const ex2 = `"Chocolate Chip Cookies",Baked Goods,baking,"20 min","12 min",24,"Crispy edges, chewy center",true`;
    const ex3 = `"Caesar Salad",Salads,side,"10 min",,2,,false`;
    const blob = new Blob([`${header}\n${ex1}\n${ex2}\n${ex3}`], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "recipes_template.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  async function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    // reuse existing parseCSV but lowercase headers
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) {
      toast({ title: "No rows found", description: "Make sure your CSV has a header row and data rows.", variant: "destructive" });
      e.target.value = ""; return;
    }
    const rows = parseCSV(text).map(row => {
      const lower: Record<string, string> = {};
      Object.entries(row).forEach(([k, v]) => { lower[k.toLowerCase()] = v; });
      return lower;
    });
    let created = 0, skipped = 0;
    const errors: string[] = [];
    for (const row of rows) {
      if (!row.name?.trim()) { skipped++; continue; }
      try {
        await apiRequest("POST", "/api/recipes", {
          name: row.name.trim(),
          category: row.category?.trim() || null,
          componentType: COMPONENT_TYPE_MAP[row.componenttype?.toLowerCase().trim() ?? ""] ?? null,
          prepTime: row.preptime?.trim() || null,
          cookTime: row.cooktime?.trim() || null,
          servings: row.servings ? parseInt(row.servings) : null,
          notes: row.notes?.trim() || null,
          isFavorite: row.isfavorite === "true",
          ingredientsJson: "[]",
          instructions: "",
        });
        created++;
      } catch {
        errors.push(row.name?.slice(0, 30) ?? "unknown");
      }
    }
    queryClient.invalidateQueries({ queryKey: ["/api/recipes"] });
    e.target.value = "";
    const desc = [
      `${created} recipe${created !== 1 ? "s" : ""} imported`,
      skipped ? `${skipped} skipped (no name)` : "",
      errors.length ? `${errors.length} failed` : "",
      "Ingredients can be added by editing each recipe.",
    ].filter(Boolean).join(" · ");
    toast({ title: "CSV imported", description: desc });
  }

  const { data: recipes = [] } = useQuery<Recipe[]>({ queryKey: ["/api/recipes"] });
  const { data: bundles = [] } = useQuery<MealBundle[]>({ queryKey: ["/api/meal-bundles"] });
  const { data: weekPlan = [] } = useQuery<WeekPlan[]>({
    queryKey: ["/api/week-plan", weekStart],
    queryFn: async () => { const r = await apiRequest("GET", `/api/week-plan/${weekStart}`); return r.json(); },
  });
  const { data: groceryChecks = [] } = useQuery<GroceryCheck[]>({
    queryKey: ["/api/grocery-checks", weekStart],
    queryFn: async () => { const r = await apiRequest("GET", `/api/grocery-checks/${weekStart}`); return r.json(); },
  });

  const deleteRecipeMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/recipes/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/recipes"] }); toast({ title: "Recipe deleted" }); },
  });
  const deleteBundleMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/meal-bundles/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/meal-bundles"] }); toast({ title: "Bundle deleted" }); },
  });
  const removeAssignMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/week-plan/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/week-plan", weekStart] }),
  });
  const toggleCheckMut = useMutation({
    mutationFn: ({ itemKey, checked }: { itemKey: string; checked: boolean }) =>
      apiRequest("PATCH", "/api/grocery-checks", { weekStart, itemKey, checked }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/grocery-checks", weekStart] }),
  });

  // Filtered recipes for library view
  const filteredRecipes = useMemo(() => {
    if (libFilter === "all") return recipes;
    if (libFilter === "unclassified") return recipes.filter(r => !r.componentType);
    return recipes.filter(r => r.componentType === libFilter);
  }, [recipes, libFilter]);

  // Build grocery list from week's recipe assignments + bundle expansions
  const weekRecipes = useMemo(() => {
    const result: Recipe[] = [];
    weekPlan.forEach(p => {
      if (p.recipeId) {
        const r = recipes.find(r => r.id === p.recipeId);
        if (r) result.push(r);
      }
      if (p.bundleId) {
        const b = bundles.find(b => b.id === p.bundleId);
        if (b) {
          const ids: number[] = JSON.parse(b.recipeIdsJson);
          ids.forEach(id => {
            const r = recipes.find(r => r.id === id);
            if (r && !result.find(x => x.id === r.id)) result.push(r);
          });
        }
      }
    });
    return result;
  }, [weekPlan, recipes, bundles]);

  const groupedGrocery = useMemo(() => groupIngredients(weekRecipes), [weekRecipes]);
  const checkedKeys = new Set(groceryChecks.filter(g => g.checked).map(g => g.itemKey));
  const totalGrocery = Object.values(groupedGrocery).reduce((sum, items) => sum + items.length, 0);
  const checkedGrocery = Object.values(groupedGrocery).reduce((sum, items) =>
    sum + items.filter(item => checkedKeys.has(item.name.toLowerCase())).length, 0);

  // Group recipes by component type for the library section view
  const recipesByType = useMemo(() => {
    const result: Record<string, Recipe[]> = {};
    COMPONENT_TYPES.forEach(ct => {
      result[ct.value] = recipes.filter(r => r.componentType === ct.value);
    });
    result["unclassified"] = recipes.filter(r => !r.componentType);
    return result;
  }, [recipes]);

  const subNavItems = [
    { id: "library" as SubView, label: "Library", icon: <BookOpen size={14} />, count: recipes.length },
    { id: "bundles" as SubView, label: "Bundles", icon: <Package size={14} />, count: bundles.length },
    { id: "week" as SubView, label: "This Week", icon: <CalendarDays size={14} />, count: weekPlan.length },
    { id: "grocery" as SubView, label: "Grocery", icon: <ShoppingCart size={14} />, count: totalGrocery },
    { id: "shared" as SubView, label: "Shared", icon: <Send size={14} />, count: null },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Recipes</h1>
        <div className="flex gap-2">
          {subView === "library" && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setMealDbOpen(true)} className="gap-1.5">
                <Search size={13} /> Find Recipes
              </Button>
              <Button size="sm" onClick={() => { setEditRecipe(null); setRecipeModal(true); }} className="gap-1.5">
                <Plus size={13} /><ChefHat size={13} /> Add Recipe
              </Button>
              <Button size="sm" variant="outline" onClick={() => csvRef.current?.click()} className="gap-1.5">
                <Upload size={13} /> Upload CSV
              </Button>
              <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
              <Button size="sm" variant="outline" onClick={downloadCsvTemplate} className="gap-1.5">
                <Download size={13} /> Template
              </Button>
              <Button size="sm" variant="outline" onClick={() => setCsvInfoOpen(true)} className="gap-1.5">
                <HelpCircle size={13} /> CSV Format
              </Button>
            </div>
          )}
          {subView === "bundles" && (
            <Button size="sm" onClick={() => { setEditBundle(null); setBundleModal(true); }} className="gap-1.5">
              <Plus size={13} /><Package size={13} /> Create Bundle
            </Button>
          )}
          {subView === "week" && (
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1.5 rounded-full border border-amber-200 dark:border-amber-800">
              <Flame size={12} /> Week of {format(parseISO(weekStart), "MMM d")}
            </div>
          )}
          {subView === "grocery" && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => {
                const text = Object.entries(groupedGrocery).map(([cat, items]) =>
                  `${cat}:\n${items.map(i => `  • ${i.name}${i.qty ? ` — ${i.qty}` : ""}`).join("\n")}`
                ).join("\n\n");
                navigator.clipboard.writeText(text).then(() => toast({ title: "Copied to clipboard" }));
              }} className="gap-1.5"><Printer size={13} /> Copy List</Button>
              <Button size="sm" variant="ghost" onClick={() => {
                Object.values(groupedGrocery).flatMap(items => items).forEach(item => {
                  if (checkedKeys.has(item.name.toLowerCase()))
                    toggleCheckMut.mutate({ itemKey: item.name.toLowerCase(), checked: false });
                });
              }} className="gap-1.5"><RefreshCw size={13} /> Uncheck All</Button>
            </div>
          )}
        </div>
      </div>

      {/* Sub-navigation */}
      <div className="flex items-center gap-1 bg-secondary rounded-lg p-1 w-fit">
        {subNavItems.map(item => (
          <button key={item.id} onClick={() => setSubView(item.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${subView === item.id ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}>
            {item.icon} {item.label}
            {item.count > 0 && <span className="text-xs opacity-60">{item.count}</span>}
          </button>
        ))}
      </div>

      {/* ── LIBRARY ── */}
      {subView === "library" && (
        <div className="space-y-6">
          {/* Component type filter */}
          <div className="flex gap-2 flex-wrap">
            {([{ value: "all", label: "All", icon: <Layers size={13} /> },
               ...COMPONENT_TYPES.map(ct => ({ value: ct.value, label: ct.label, icon: ct.icon })),
               { value: "unclassified", label: "Unclassified", icon: <ChefHat size={13} /> }
            ] as { value: string; label: string; icon: React.ReactNode }[]).map(f => (
              <button key={f.value} onClick={() => setLibFilter(f.value as LibFilter)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${libFilter === f.value ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary hover:text-foreground"}`}>
                {f.icon} {f.label}
                {f.value !== "all" && f.value !== "unclassified" && recipesByType[f.value]?.length > 0 && (
                  <span className="opacity-60">{recipesByType[f.value].length}</span>
                )}
                {f.value === "unclassified" && recipesByType["unclassified"]?.length > 0 && (
                  <span className="opacity-60">{recipesByType["unclassified"].length}</span>
                )}
              </button>
            ))}
          </div>

          {/* Sectioned view when "All" selected */}
          {libFilter === "all" ? (
            <div className="space-y-8">
              {COMPONENT_TYPES.map(ct => {
                const group = recipesByType[ct.value];
                if (group.length === 0) return null;
                const buckets = groupByCategory(group);
                const hasBuckets = buckets.some(b => b.category !== null);
                return (
                  <div key={ct.value}>
                    <div className={`flex items-center gap-2 mb-3 pb-2 border-b`}>
                      <span className={ct.color}>{ct.icon}</span>
                      <h2 className={`text-sm font-bold uppercase tracking-widest ${ct.color}`}>{ct.label}s</h2>
                      <span className="text-xs text-muted-foreground">{group.length}</span>
                    </div>
                    {hasBuckets ? (
                      <div className="space-y-4">
                        {buckets.map(({ category, recipes: bRecipes }) => {
                          const bucketKey = `${ct.value}:${category ?? "__none__"}`;
                          const isCollapsed = collapsedBuckets.has(bucketKey);
                          return (
                            <div key={bucketKey}>
                              <button onClick={() => toggleBucket(bucketKey)}
                                className="flex items-center gap-1.5 w-full text-left mb-2 py-1 px-2 rounded-lg hover:bg-secondary/60 transition-colors">
                                <ChevronDown size={12} className={`transition-transform duration-200 text-muted-foreground ${isCollapsed ? "-rotate-90" : ""}`} />
                                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                  {category ?? "Other"}
                                </span>
                                <span className="text-xs text-muted-foreground/60 ml-1">{bRecipes.length}</span>
                              </button>
                              {!isCollapsed && (
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                                  {bRecipes.map(recipe => (
                                    <RecipeCard key={recipe.id} recipe={recipe}
                                      isOnWeek={weekPlan.some(p => p.recipeId === recipe.id)}
                                      onDetail={() => setDetailRecipe(recipe)}
                                      onAssign={() => setAssignRecipe(recipe)}
                                      onEdit={() => { setEditRecipe(recipe); setRecipeModal(true); }}
                                      onDelete={() => deleteRecipeMut.mutate(recipe.id)}
                                    onShare={() => setShareRecipe(recipe)}
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {group.map(recipe => (
                          <RecipeCard key={recipe.id} recipe={recipe}
                            isOnWeek={weekPlan.some(p => p.recipeId === recipe.id)}
                            onDetail={() => setDetailRecipe(recipe)}
                            onAssign={() => setAssignRecipe(recipe)}
                            onEdit={() => { setEditRecipe(recipe); setRecipeModal(true); }}
                            onDelete={() => deleteRecipeMut.mutate(recipe.id)}
                            onShare={() => setShareRecipe(recipe)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {recipesByType["unclassified"].length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b">
                    <ChefHat size={13} className="text-muted-foreground" />
                    <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Unclassified</h2>
                    <span className="text-xs text-muted-foreground">{recipesByType["unclassified"].length}</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {recipesByType["unclassified"].map(recipe => (
                      <RecipeCard key={recipe.id} recipe={recipe}
                        isOnWeek={weekPlan.some(p => p.recipeId === recipe.id)}
                        onDetail={() => setDetailRecipe(recipe)}
                        onAssign={() => setAssignRecipe(recipe)}
                        onEdit={() => { setEditRecipe(recipe); setRecipeModal(true); }}
                        onDelete={() => deleteRecipeMut.mutate(recipe.id)}
                        onShare={() => setShareRecipe(recipe)}
                      />
                    ))}
                  </div>
                </div>
              )}
              {recipes.length === 0 && (
                <div className="text-center py-16 text-muted-foreground">
                  <ChefHat size={40} className="mx-auto mb-4 opacity-20" />
                  <p className="font-medium">No recipes yet</p>
                  <p className="text-sm mt-1">Add your first recipe to get started</p>
                </div>
              )}
            </div>
          ) : (
            // Filtered view
            <div>
              {filteredRecipes.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <ChefHat size={40} className="mx-auto mb-4 opacity-20" />
                  <p className="font-medium">No recipes here yet</p>
                  <p className="text-sm mt-1">Add a recipe and set its Component Type to add it to this section</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {filteredRecipes.map(recipe => (
                    <RecipeCard key={recipe.id} recipe={recipe}
                      isOnWeek={weekPlan.some(p => p.recipeId === recipe.id)}
                      onDetail={() => setDetailRecipe(recipe)}
                      onAssign={() => setAssignRecipe(recipe)}
                      onEdit={() => { setEditRecipe(recipe); setRecipeModal(true); }}
                      onDelete={() => deleteRecipeMut.mutate(recipe.id)}
                      onShare={() => setShareRecipe(recipe)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── BUNDLES ── */}
      {subView === "bundles" && (
        <div className="space-y-4">
          {bundles.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Package size={40} className="mx-auto mb-4 opacity-20" />
              <p className="font-medium">No meal bundles yet</p>
              <p className="text-sm mt-1">Create a bundle to save full-meal combinations like "Steak Night" or "Taco Tuesday"</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {bundles.map(bundle => {
                const ids: number[] = JSON.parse(bundle.recipeIdsJson);
                const bundleRecipes = ids.map(id => recipes.find(r => r.id === id)).filter(Boolean) as Recipe[];
                const byType: Record<ComponentType, Recipe[]> = { main: [], vegetable: [], side: [], sauce: [], dessert: [], baking: [] };
                const untyped: Recipe[] = [];
                bundleRecipes.forEach(r => {
                  if (r.componentType && byType[r.componentType as ComponentType]) byType[r.componentType as ComponentType].push(r);
                  else untyped.push(r);
                });
                return (
                  <div key={bundle.id} className="bg-card border rounded-xl overflow-hidden hover:shadow-md transition-all group">
                    <div className="px-4 py-3 bg-secondary/40 flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{bundle.emoji}</span>
                        <div>
                          <p className="font-semibold text-sm">{bundle.name}</p>
                          {bundle.description && <p className="text-xs text-muted-foreground">{bundle.description}</p>}
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100">
                            <MoreHorizontal size={13} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => { setEditBundle(bundle); setBundleModal(true); }}>
                            <Pencil size={12} className="mr-2" />Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => deleteBundleMut.mutate(bundle.id)}>
                            <Trash2 size={12} className="mr-2" />Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="p-3 space-y-2">
                      {COMPONENT_TYPES.map(ct => {
                        const items = byType[ct.value];
                        if (items.length === 0) return null;
                        return (
                          <div key={ct.value} className="flex items-start gap-2">
                            <span className={`${ct.color} shrink-0 mt-0.5`}>{ct.icon}</span>
                            <div className="flex-1 min-w-0">
                              <p className={`text-xs font-semibold ${ct.color}`}>{ct.label}</p>
                              <p className="text-xs text-foreground">{items.map(r => r.name).join(", ")}</p>
                            </div>
                          </div>
                        );
                      })}
                      {untyped.length > 0 && (
                        <div className="flex items-start gap-2">
                          <ChefHat size={13} className="text-muted-foreground shrink-0 mt-0.5" />
                          <p className="text-xs text-muted-foreground">{untyped.map(r => r.name).join(", ")}</p>
                        </div>
                      )}
                      {bundleRecipes.length === 0 && (
                        <p className="text-xs text-muted-foreground">No recipes added yet</p>
                      )}
                    </div>
                    <div className="border-t px-3 py-2">
                      <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 w-full" onClick={() => setAssignBundle(bundle)}>
                        <CalendarDays size={11} /> Add to Week
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── THIS WEEK ── */}
      {subView === "week" && (
        <div className="space-y-6">
          {/* 7-day grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {DAYS.map((day, i) => {
              const assignment = weekPlan.find(p => p.dayIndex === i);
              const recipe = assignment?.recipeId ? recipes.find(r => r.id === assignment.recipeId) : null;
              const bundle = assignment?.bundleId ? bundles.find(b => b.id === assignment.bundleId) : null;
              const isToday = new Date().getDay() === i;
              const bundleRecipes = bundle ? (JSON.parse(bundle.recipeIdsJson) as number[]).map(id => recipes.find(r => r.id === id)).filter(Boolean) as Recipe[] : [];
              return (
                <div key={i} className={`bg-card border rounded-xl overflow-hidden ${isToday ? "border-primary/40 shadow-sm" : ""}`}>
                  <div className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wide border-b ${isToday ? "bg-primary/10 text-primary border-primary/20" : "bg-secondary/50 text-muted-foreground"}`}>
                    {SHORT_DAYS[i]}
                  </div>
                  <div className="p-2.5 min-h-[80px]">
                    {recipe && (
                      <div className="flex items-start justify-between gap-1">
                        <div className="min-w-0">
                          <span className="text-base">{recipe.emoji}</span>
                          <p className="text-xs font-semibold leading-tight mt-0.5 truncate">{recipe.name}</p>
                          {recipe.componentType && <p className={`text-xs ${getComponentInfo(recipe.componentType)?.color}`}>{getComponentInfo(recipe.componentType)?.label}</p>}
                        </div>
                        <button onClick={() => removeAssignMut.mutate(assignment!.id)} className="text-muted-foreground hover:text-destructive shrink-0 mt-0.5"><X size={12} /></button>
                      </div>
                    )}
                    {bundle && (
                      <div className="flex items-start justify-between gap-1">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1">
                            <span className="text-base">{bundle.emoji}</span>
                            <p className="text-xs font-semibold leading-tight truncate">{bundle.name}</p>
                          </div>
                          <div className="mt-0.5 space-y-0.5">
                            {bundleRecipes.slice(0, 3).map(r => (
                              <p key={r.id} className="text-xs text-muted-foreground truncate">{r.emoji} {r.name}</p>
                            ))}
                            {bundleRecipes.length > 3 && <p className="text-xs text-muted-foreground">+{bundleRecipes.length - 3} more</p>}
                          </div>
                        </div>
                        <button onClick={() => removeAssignMut.mutate(assignment!.id)} className="text-muted-foreground hover:text-destructive shrink-0 mt-0.5"><X size={12} /></button>
                      </div>
                    )}
                    {!recipe && !bundle && (
                      <button onClick={() => setSubView("library")} className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors mt-1">
                        <Plus size={11} /> Add meal
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick assign panels */}
          <div className="grid md:grid-cols-2 gap-4">
            {/* Components */}
            <div className="bg-card border rounded-xl p-4">
              <p className="text-sm font-semibold mb-3 flex items-center gap-2"><ChefHat size={15} /> Assign a Recipe</p>
              {recipes.length === 0 ? (
                <p className="text-xs text-muted-foreground">Add recipes in the Library tab first.</p>
              ) : (
                <div className="space-y-1 max-h-56 overflow-y-auto">
                  {COMPONENT_TYPES.map(ct => {
                    const group = recipesByType[ct.value];
                    if (group.length === 0) return null;
                    return (
                      <div key={ct.value} className="mb-2">
                        <p className={`text-xs font-semibold uppercase tracking-wide mb-1 flex items-center gap-1 ${ct.color}`}>{ct.icon} {ct.label}s</p>
                        {group.map(r => (
                          <button key={r.id} onClick={() => setAssignRecipe(r)}
                            className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg hover:bg-secondary/60 text-left transition-colors">
                            <span className="text-sm shrink-0">{r.emoji}</span>
                            <span className="text-xs truncate">{r.name}</span>
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {/* Bundles */}
            <div className="bg-card border rounded-xl p-4">
              <p className="text-sm font-semibold mb-3 flex items-center gap-2"><Package size={15} /> Assign a Bundle</p>
              {bundles.length === 0 ? (
                <p className="text-xs text-muted-foreground">Create bundles in the Bundles tab first.</p>
              ) : (
                <div className="space-y-1 max-h-56 overflow-y-auto">
                  {bundles.map(b => (
                    <button key={b.id} onClick={() => setAssignBundle(b)}
                      className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg hover:bg-secondary/60 text-left transition-colors">
                      <span className="text-sm shrink-0">{b.emoji}</span>
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{b.name}</p>
                        {b.description && <p className="text-xs text-muted-foreground truncate">{b.description}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── GROCERY ── */}
      {subView === "grocery" && (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-card border rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-primary">{totalGrocery}</p>
              <p className="text-xs text-muted-foreground">Items</p>
            </div>
            <div className="bg-card border rounded-xl p-4 text-center">
              <p className="text-2xl font-bold">{checkedGrocery}</p>
              <p className="text-xs text-muted-foreground">Checked off</p>
            </div>
            <div className="bg-card border rounded-xl p-4 text-center">
              <p className="text-2xl font-bold">{weekRecipes.length}</p>
              <p className="text-xs text-muted-foreground">Recipes</p>
            </div>
          </div>
          {totalGrocery > 0 && totalGrocery > checkedGrocery && (
            <Progress value={Math.round((checkedGrocery / totalGrocery) * 100)} className="h-2" />
          )}
          {Object.keys(groupedGrocery).length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <ShoppingCart size={40} className="mx-auto mb-4 opacity-20" />
              <p className="font-medium">No ingredients yet</p>
              <p className="text-sm mt-1">Assign recipes or bundles to this week to generate your list</p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedGrocery).map(([category, items]) => (
                <div key={category}>
                  <p className="text-xs font-bold uppercase tracking-widest text-primary mb-2 pb-2 border-b-2 border-primary/20">{category}</p>
                  <div className="space-y-2">
                    {items.map((item, i) => {
                      const key = item.name.toLowerCase();
                      const isChecked = checkedKeys.has(key);
                      return (
                        <label key={i} className={`flex items-center gap-3 p-3 bg-card border rounded-xl cursor-pointer transition-colors hover:bg-secondary/30 ${isChecked ? "opacity-60" : ""}`}>
                          <input type="checkbox" checked={isChecked}
                            onChange={() => toggleCheckMut.mutate({ itemKey: key, checked: !isChecked })}
                            className="w-4 h-4 accent-primary shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium ${isChecked ? "line-through text-muted-foreground" : ""}`}>{item.name}</p>
                            <p className="text-xs text-muted-foreground">{item.recipes.join(", ")}</p>
                          </div>
                          {item.qty && <span className="text-xs text-muted-foreground shrink-0">{item.qty}</span>}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Shared recipes subView */}
      {subView === "shared" && (
        <div className="mt-2">
          <SharedRecipesTab />
        </div>
      )}

      {/* Modals */}
      <MealDBSearchModal open={mealDbOpen} onClose={() => setMealDbOpen(false)} />
      <RecipeFormModal open={recipeModal} onClose={() => { setRecipeModal(false); setEditRecipe(null); }} editRecipe={editRecipe} />
      <BundleFormModal open={bundleModal} onClose={() => { setBundleModal(false); setEditBundle(null); }} editBundle={editBundle} recipes={recipes} />
      {detailRecipe && (
        <RecipeDetail recipe={detailRecipe} onClose={() => setDetailRecipe(null)} onAddToWeek={(r) => setAssignRecipe(r)} />
      )}
      {assignRecipe && (
        <AssignDayModal recipe={assignRecipe} weekStart={weekStart} existingPlan={weekPlan} onClose={() => setAssignRecipe(null)} />
      )}
      {assignBundle && (
        <AssignDayModal bundle={assignBundle} weekStart={weekStart} existingPlan={weekPlan} onClose={() => setAssignBundle(null)} />
      )}
      <RecipeShareModal
        open={!!shareRecipe}
        onClose={() => setShareRecipe(null)}
        recipe={shareRecipe}
      />

      {/* CSV Format Info */}
      <Dialog open={csvInfoOpen} onOpenChange={setCsvInfoOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><HelpCircle size={16} /> Recipes CSV Format</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-3">Your CSV must have a header row. Column names are case-insensitive. Only <span className="font-semibold text-foreground">name</span> is required. Ingredients must be added manually after import.</p>
          <div className="space-y-1 text-sm">
            {[
              { col: "name",          req: true,  note: "Recipe name" },
              { col: "category",      req: false, note: "Tag / bucket label, e.g. Italian, Baked Goods, Salads" },
              { col: "componentType", req: false, note: "main · vegetable · side · sauce · dessert · baking" },
              { col: "prepTime",      req: false, note: "e.g. 15 min" },
              { col: "cookTime",      req: false, note: "e.g. 45 min" },
              { col: "servings",      req: false, note: "Number, e.g. 4" },
              { col: "notes",         req: false, note: "Free text" },
              { col: "isFavorite",    req: false, note: "true · false" },
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
