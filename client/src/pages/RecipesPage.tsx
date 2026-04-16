import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format, startOfWeek, parseISO } from "date-fns";
import {
  Plus, Pencil, Trash2, MoreHorizontal, Clock, ChefHat,
  CalendarDays, ShoppingCart, BookOpen, X, Check, Printer,
  RefreshCw, Flame,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import type { Recipe, InsertRecipe, WeekPlan, GroceryCheck, RecipeIngredient } from "@shared/schema";

// ── Helpers ───────────────────────────────────────────────────────────────────
const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const SHORT_DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function getWeekStart(): string {
  const mon = startOfWeek(new Date(), { weekStartsOn: 0 }); // Sunday
  return format(mon, "yyyy-MM-dd");
}

function parseIngredients(json: string): RecipeIngredient[] {
  try { return JSON.parse(json); } catch { return []; }
}

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
      const name = ing.name.trim();
      if (!name) return;
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
      qty: v.qty,
      recipes: Array.from(v.recipes),
    }));
  }
  return result;
}

// ── Recipe Form Modal ─────────────────────────────────────────────────────────
function RecipeFormModal({ open, onClose, editRecipe }: {
  open: boolean; onClose: () => void; editRecipe: Recipe | null;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🍽️");
  const [category, setCategory] = useState("");
  const [prepTime, setPrepTime] = useState("");
  const [cookTime, setCookTime] = useState("");
  const [instructions, setInstructions] = useState("");
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([{ name: "", qty: "" }]);

  useEffect(() => {
    if (open) {
      setName(editRecipe?.name ?? "");
      setEmoji(editRecipe?.emoji ?? "🍽️");
      setCategory(editRecipe?.category ?? "");
      setPrepTime(editRecipe?.prepTime?.toString() ?? "");
      setCookTime(editRecipe?.cookTime?.toString() ?? "");
      setInstructions(editRecipe?.instructions ?? "");
      const ings = editRecipe ? parseIngredients(editRecipe.ingredientsJson) : [];
      setIngredients(ings.length > 0 ? ings : [{ name: "", qty: "" }]);
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
      category: category.trim() || null,
      prepTime: prepTime ? parseInt(prepTime) : null,
      cookTime: cookTime ? parseInt(cookTime) : null,
      instructions: instructions.trim() || null,
      ingredientsJson: JSON.stringify(ingredients.filter(i => i.name.trim())),
    };
    editRecipe ? updateMut.mutate(payload) : createMut.mutate(payload);
  };

  const isPending = createMut.isPending || updateMut.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">{editRecipe ? "Edit Recipe" : "Add New Recipe"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Recipe Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Garlic Butter Ribeye" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Emoji</Label>
              <Input value={emoji} onChange={e => setEmoji(e.target.value)} placeholder="🍽️" maxLength={4} />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Input value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Italian, BBQ" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Prep Time (min)</Label>
              <Input type="number" value={prepTime} onChange={e => setPrepTime(e.target.value)} placeholder="15" min={0} />
            </div>
            <div className="space-y-1.5">
              <Label>Cook Time (min)</Label>
              <Input type="number" value={cookTime} onChange={e => setCookTime(e.target.value)} placeholder="30" min={0} />
            </div>
          </div>

          {/* Ingredients */}
          <div className="space-y-2">
            <Label>Ingredients</Label>
            <div className="space-y-2">
              {ingredients.map((ing, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Input value={ing.name} onChange={e => updateIng(i, "name", e.target.value)}
                    placeholder="Ingredient name" className="flex-[2]" />
                  <Input value={ing.qty} onChange={e => updateIng(i, "qty", e.target.value)}
                    placeholder="Amount (e.g. 2 lbs)" className="flex-1" />
                  <button type="button" onClick={() => removeIngRow(i)}
                    className="text-muted-foreground hover:text-destructive transition-colors p-1 shrink-0">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={addIngRow} className="gap-1.5 h-7 text-xs">
              <Plus size={12} /> Add Ingredient
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label>Instructions <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Textarea value={instructions} onChange={e => setInstructions(e.target.value)}
              rows={4} placeholder="Cooking notes or steps..." />
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={isPending} className="flex-1">
              {isPending ? "Saving..." : editRecipe ? "Save Changes" : "Save Recipe"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Recipe Detail Sheet ───────────────────────────────────────────────────────
function RecipeDetail({ recipe, onClose, onAddToWeek }: {
  recipe: Recipe; onClose: () => void; onAddToWeek: (r: Recipe) => void;
}) {
  const ingredients = parseIngredients(recipe.ingredientsJson);
  const totalTime = (recipe.prepTime ?? 0) + (recipe.cookTime ?? 0);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="text-3xl">{recipe.emoji}</span>
            <div>
              <DialogTitle className="text-xl font-bold leading-tight">{recipe.name}</DialogTitle>
              {recipe.category && <p className="text-xs text-muted-foreground mt-0.5">{recipe.category}</p>}
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5">
          {/* Meta */}
          <div className="grid grid-cols-3 gap-3 p-3 bg-secondary/40 rounded-xl">
            {recipe.prepTime != null && (
              <div className="text-center">
                <p className="text-lg font-bold">{recipe.prepTime}m</p>
                <p className="text-xs text-muted-foreground">Prep</p>
              </div>
            )}
            {recipe.cookTime != null && (
              <div className="text-center">
                <p className="text-lg font-bold">{recipe.cookTime}m</p>
                <p className="text-xs text-muted-foreground">Cook</p>
              </div>
            )}
            {totalTime > 0 && (
              <div className="text-center">
                <p className="text-lg font-bold">{totalTime}m</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
            )}
          </div>

          {/* Ingredients */}
          {ingredients.length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-primary mb-2">Ingredients</p>
              <div className="space-y-1.5">
                {ingredients.map((ing, i) => (
                  <div key={i} className="flex items-center justify-between py-2 px-3 bg-secondary/30 rounded-lg">
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

          {/* Instructions */}
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
function AssignDayModal({ recipe, weekStart, onClose, existingPlan }: {
  recipe: Recipe; weekStart: string; onClose: () => void; existingPlan: WeekPlan[];
}) {
  const { toast } = useToast();
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const assignMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/week-plan", { recipeId: recipe.id, dayIndex: selectedDay, weekStart }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/week-plan", weekStart] });
      toast({ title: `${recipe.name} added to ${SHORT_DAYS[selectedDay!]}` });
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add to Week</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Pick a day for <strong>{recipe.name}</strong>:</p>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((day, i) => {
              const taken = existingPlan.some(p => p.dayIndex === i);
              return (
                <button key={i} type="button" onClick={() => setSelectedDay(i)}
                  className={[
                    "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                    selectedDay === i ? "bg-primary text-primary-foreground border-primary" :
                    taken ? "border-border bg-secondary/50 text-muted-foreground" :
                    "border-border hover:border-primary hover:text-primary",
                  ].join(" ")}>
                  {SHORT_DAYS[i]}
                  {taken && <span className="ml-1 opacity-50">·</span>}
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

// ── Main Page ─────────────────────────────────────────────────────────────────
type SubView = "recipes" | "week" | "grocery";

export default function RecipesPage() {
  const { toast } = useToast();
  const [subView, setSubView] = useState<SubView>("recipes");
  const [recipeModal, setRecipeModal] = useState(false);
  const [editRecipe, setEditRecipe] = useState<Recipe | null>(null);
  const [detailRecipe, setDetailRecipe] = useState<Recipe | null>(null);
  const [assignRecipe, setAssignRecipe] = useState<Recipe | null>(null);
  const weekStart = getWeekStart();

  const { data: recipes = [] } = useQuery<Recipe[]>({ queryKey: ["/api/recipes"] });
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

  const removeAssignMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/week-plan/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/week-plan", weekStart] }),
  });

  const toggleCheckMut = useMutation({
    mutationFn: ({ itemKey, checked }: { itemKey: string; checked: boolean }) =>
      apiRequest("PATCH", "/api/grocery-checks", { weekStart, itemKey, checked }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/grocery-checks", weekStart] }),
  });

  // Build grocery list from week's assigned recipes
  const weekRecipes = useMemo(() => {
    return weekPlan.map(p => recipes.find(r => r.id === p.recipeId)).filter(Boolean) as Recipe[];
  }, [weekPlan, recipes]);

  const groupedGrocery = useMemo(() => groupIngredients(weekRecipes), [weekRecipes]);
  const checkedKeys = new Set(groceryChecks.filter(g => g.checked).map(g => g.itemKey));

  const totalGrocery = Object.values(groupedGrocery).reduce((sum, items) => sum + items.length, 0);
  const checkedGrocery = Object.values(groupedGrocery).reduce((sum, items) =>
    sum + items.filter(item => checkedKeys.has(item.name.toLowerCase())).length, 0);

  const subNavItems = [
    { id: "recipes" as SubView, label: "All Recipes", icon: <BookOpen size={14} />, count: recipes.length },
    { id: "week" as SubView, label: "This Week", icon: <CalendarDays size={14} />, count: weekPlan.length },
    { id: "grocery" as SubView, label: "Grocery List", icon: <ShoppingCart size={14} />, count: totalGrocery },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Recipes</h1>
        </div>
        {subView === "recipes" && (
          <Button size="sm" onClick={() => { setEditRecipe(null); setRecipeModal(true); }} className="gap-1.5">
            <Plus size={13} /><ChefHat size={13} /> Add Recipe
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
            }} className="gap-1.5">
              <Printer size={13} /> Copy List
            </Button>
            <Button size="sm" variant="ghost" onClick={() => {
              Object.values(groupedGrocery).flatMap(items => items).forEach(item => {
                if (checkedKeys.has(item.name.toLowerCase())) {
                  toggleCheckMut.mutate({ itemKey: item.name.toLowerCase(), checked: false });
                }
              });
            }} className="gap-1.5">
              <RefreshCw size={13} /> Uncheck All
            </Button>
          </div>
        )}
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

      {/* ── ALL RECIPES ── */}
      {subView === "recipes" && (
        <div>
          {recipes.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <ChefHat size={40} className="mx-auto mb-4 opacity-20" />
              <p className="font-medium">No recipes yet</p>
              <p className="text-sm mt-1">Add your first recipe to get started</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {recipes.map(recipe => {
                const ingredients = parseIngredients(recipe.ingredientsJson);
                const isOnWeek = weekPlan.some(p => p.recipeId === recipe.id);
                return (
                  <div key={recipe.id}
                    className="bg-card border rounded-xl overflow-hidden hover:shadow-md transition-all cursor-pointer group"
                    onClick={() => setDetailRecipe(recipe)}>
                    {/* Card header */}
                    <div className="bg-amber-50 dark:bg-amber-950/30 px-5 py-4 flex items-start justify-between">
                      <span className="text-3xl">{recipe.emoji}</span>
                      <div className="flex items-center gap-2">
                        {isOnWeek && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-200/60 dark:bg-amber-800/40 text-amber-800 dark:text-amber-300">
                            This week
                          </span>
                        )}
                        {recipe.category && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary text-primary-foreground">
                            {recipe.category}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Card body */}
                    <div className="p-4">
                      <p className="font-semibold text-base leading-tight mb-1">{recipe.name}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
                        {recipe.prepTime != null && (
                          <span className="flex items-center gap-1"><Clock size={11} />Prep {recipe.prepTime}m</span>
                        )}
                        {recipe.cookTime != null && (
                          <span className="flex items-center gap-1"><Clock size={11} />Cook {recipe.cookTime}m</span>
                        )}
                      </div>
                      {ingredients.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {ingredients.slice(0, 5).map((ing, i) => (
                            <span key={i} className="text-xs px-1.5 py-0.5 bg-secondary rounded-full text-muted-foreground">
                              {ing.name}
                            </span>
                          ))}
                          {ingredients.length > 5 && (
                            <span className="text-xs text-muted-foreground">+{ingredients.length - 5}</span>
                          )}
                        </div>
                      )}
                    </div>
                    {/* Card actions */}
                    <div className="border-t px-4 py-2.5 flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 flex-1"
                        onClick={() => setAssignRecipe(recipe)}>
                        <CalendarDays size={12} /> Add to Week
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreHorizontal size={13} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => { setEditRecipe(recipe); setRecipeModal(true); }}>
                            <Pencil size={13} className="mr-2" />Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive focus:text-destructive"
                            onClick={() => deleteRecipeMut.mutate(recipe.id)}>
                            <Trash2 size={13} className="mr-2" />Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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
              const recipe = assignment ? recipes.find(r => r.id === assignment.recipeId) : null;
              const isToday = new Date().getDay() === i;
              return (
                <div key={i} className={`bg-card border rounded-xl overflow-hidden ${isToday ? "border-primary/40 shadow-sm" : ""}`}>
                  <div className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wide border-b ${isToday ? "bg-primary/10 text-primary border-primary/20" : "bg-secondary/50 text-muted-foreground"}`}>
                    {SHORT_DAYS[i]}
                  </div>
                  <div className="p-3 min-h-[72px]">
                    {recipe ? (
                      <div>
                        <div className="flex items-start justify-between gap-1">
                          <div className="min-w-0">
                            <span className="text-base">{recipe.emoji}</span>
                            <p className="text-xs font-semibold leading-tight mt-0.5 truncate">{recipe.name}</p>
                            {recipe.category && <p className="text-xs text-muted-foreground">{recipe.category}</p>}
                          </div>
                          <button onClick={() => removeAssignMut.mutate(assignment!.id)}
                            className="text-muted-foreground hover:text-destructive transition-colors shrink-0 mt-0.5">
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setSubView("recipes")}
                        className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors mt-1">
                        <Plus size={11} /> Add dinner
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Assign section */}
          <div className="bg-card border rounded-xl p-5">
            <p className="text-sm font-semibold mb-3">Assign a Recipe</p>
            {recipes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Add recipes first from the All Recipes tab.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {recipes.map(recipe => (
                  <button key={recipe.id} onClick={() => setAssignRecipe(recipe)}
                    className="flex items-center gap-3 p-3 bg-secondary/40 hover:bg-secondary rounded-xl text-left transition-colors border border-transparent hover:border-border">
                    <span className="text-xl shrink-0">{recipe.emoji}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{recipe.name}</p>
                      {recipe.category && <p className="text-xs text-muted-foreground">{recipe.category}</p>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── GROCERY LIST ── */}
      {subView === "grocery" && (
        <div className="space-y-5">
          {/* Stats */}
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
              <p className="text-sm mt-1">Assign recipes to this week to generate your list</p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedGrocery).map(([category, items]) => (
                <div key={category}>
                  <p className="text-xs font-bold uppercase tracking-widest text-primary mb-2 pb-2 border-b-2 border-primary/20">
                    {category}
                  </p>
                  <div className="space-y-2">
                    {items.map((item, i) => {
                      const key = item.name.toLowerCase();
                      const isChecked = checkedKeys.has(key);
                      return (
                        <label key={i}
                          className={`flex items-center gap-3 p-3 bg-card border rounded-xl cursor-pointer transition-colors hover:bg-secondary/30 ${isChecked ? "opacity-60" : ""}`}>
                          <input type="checkbox" checked={isChecked}
                            onChange={() => toggleCheckMut.mutate({ itemKey: key, checked: !isChecked })}
                            className="w-4 h-4 accent-primary shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium ${isChecked ? "line-through text-muted-foreground" : ""}`}>
                              {item.name}
                            </p>
                            <p className="text-xs text-muted-foreground">{item.recipes.join(", ")}</p>
                          </div>
                          {item.qty && (
                            <span className="text-xs text-muted-foreground shrink-0">{item.qty}</span>
                          )}
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

      {/* Modals */}
      <RecipeFormModal
        open={recipeModal}
        onClose={() => { setRecipeModal(false); setEditRecipe(null); }}
        editRecipe={editRecipe}
      />
      {detailRecipe && (
        <RecipeDetail
          recipe={detailRecipe}
          onClose={() => setDetailRecipe(null)}
          onAddToWeek={(r) => setAssignRecipe(r)}
        />
      )}
      {assignRecipe && (
        <AssignDayModal
          recipe={assignRecipe}
          weekStart={weekStart}
          existingPlan={weekPlan}
          onClose={() => setAssignRecipe(null)}
        />
      )}
    </div>
  );
}
