import type { Plan, Recipe } from "./types";

export type AggregatedIngredient = {
  key: string;
  display: string;
  recipes: string[]; // names
  count: number;
};

const STOP_WORDS = new Set([
  "a", "an", "the", "of", "and", "or", "to", "for", "with",
  "fresh", "large", "small", "medium", "cold", "warm", "hot",
  "chopped", "minced", "diced", "sliced", "grated", "shredded",
  "cup", "cups", "tsp", "tbsp", "oz", "lb", "lbs", "g", "kg", "ml", "l",
  "teaspoon", "tablespoon", "ounce", "ounces", "pound", "pounds", "gram", "grams",
  "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "0",
  "1/2", "1/3", "1/4", "2/3", "3/4", "1/8", "1/16",
]);

// crude aisle groups
const AISLES: Record<string, string[]> = {
  Produce: [
    "onion","garlic","tomato","lettuce","spinach","kale","carrot","celery","pepper","cucumber","zucchini","squash","potato","sweet potato","broccoli","cauliflower","mushroom","avocado","lemon","lime","orange","apple","banana","strawberr","blueberr","raspberr","cilantro","parsley","basil","mint","ginger","jalapeno","chili","scallion","leek","cabbage","corn","green bean","asparagus","beet","radish","arugula","romaine","kale","cherry tomato","grape","peach","pear","mango","pineapple","watermelon","cantaloupe","herb","sprout","shallot","fennel","artichoke","eggplant","brussels"
  ],
  Meat: [
    "chicken","beef","pork","steak","sausage","bacon","ham","turkey","lamb","ground beef","ground turkey","ground chicken","ground pork","ribs","chop","brisket","tenderloin","ribeye","sirloin"
  ],
  Seafood: [
    "salmon","tuna","shrimp","cod","tilapia","halibut","scallop","mussel","clam","crab","lobster","fish","prawn","anchov","sardine","trout","mahi"
  ],
  Dairy: [
    "milk","butter","cheese","yogurt","cream","sour cream","cream cheese","parmesan","mozzarella","cheddar","feta","ricotta","cottage cheese","heavy cream","half-and-half","buttermilk"
  ],
  Pantry: [
    "flour","sugar","salt","pepper","oil","olive oil","vinegar","soy sauce","honey","maple","baking","yeast","cornstarch","starch","stock","broth","sauce","paste","oats","rice","quinoa","beans","lentils","chickpea","pasta","noodle","bread","tortilla","crouton","cracker","ketchup","mustard","mayo","spice","cumin","paprika","oregano","thyme","rosemary","cinnamon","nutmeg","vanilla","cocoa","chocolate","chip","peanut butter","almond butter","tahini","nut","seed","tomato sauce","tomato paste","canned"
  ],
  Eggs: ["egg", "eggs", "egg white", "egg yolk"],
  Frozen: ["frozen"],
};

function normalize(line: string): { key: string; display: string } {
  const trimmed = line.trim().toLowerCase();
  // strip leading qty/unit tokens
  const tokens = trimmed.split(/[\s,]+/).filter(Boolean);
  const cleaned: string[] = [];
  let qtyConsumed = false;
  for (const t of tokens) {
    const isNum = /^[\d./]+$/.test(t);
    const isStop = STOP_WORDS.has(t);
    if ((isNum || isStop) && !qtyConsumed) continue;
    qtyConsumed = true;
    cleaned.push(t);
  }
  // first meaningful 2-3 words become the key
  const keyTokens = cleaned.slice(0, 3).filter((t) => !STOP_WORDS.has(t));
  const keyBase = (keyTokens[0] || cleaned[0] || trimmed).replace(/[^a-z]/g, "");
  // for "olive oil" or "soy sauce" use 2 words
  const twoWord = cleaned.slice(0, 2).join(" ");
  const knownPairs = ["olive oil", "soy sauce", "tomato sauce", "tomato paste", "peanut butter", "almond butter", "sour cream", "heavy cream", "cream cheese", "ground beef", "ground turkey", "ground chicken", "ground pork", "sweet potato", "green bean", "black bean", "sea salt", "black pepper", "white pepper", "bell pepper", "red pepper", "chicken broth", "vegetable broth", "beef broth", "maple syrup", "lemon juice", "lime juice"];
  const key = knownPairs.includes(twoWord) ? twoWord.replace(/\s+/g, "_") : keyBase;
  const display = cleaned.slice(0, 4).join(" ") || trimmed;
  return { key, display };
}

function findAisle(key: string, display: string): string {
  const needle = (display + " " + key.replace(/_/g, " ")).toLowerCase();
  for (const [aisle, keywords] of Object.entries(AISLES)) {
    for (const kw of keywords) {
      if (needle.includes(kw)) return aisle;
    }
  }
  return "Other";
}

export type ShoppingList = {
  aisles: { name: string; items: AggregatedIngredient[] }[];
  flat: AggregatedIngredient[];
};

export function buildShoppingList(plan: Plan, selectedDays: number[]): ShoppingList {
  const map = new Map<string, AggregatedIngredient>();
  const days = plan.days.filter((d) => selectedDays.includes(d.day));
  for (const d of days) {
    for (const meal of d.meals) {
      const recipe: Recipe = meal.recipe;
      for (const ing of recipe.ingredients) {
        const { key, display } = normalize(ing);
        const ex = map.get(key);
        if (ex) {
          ex.count += 1;
          if (!ex.recipes.includes(recipe.name)) ex.recipes.push(recipe.name);
        } else {
          map.set(key, { key, display: ing, recipes: [recipe.name], count: 1 });
        }
      }
    }
  }
  const flat = Array.from(map.values()).sort((a, b) => a.display.localeCompare(b.display));
  const aisles = new Map<string, AggregatedIngredient[]>();
  for (const item of flat) {
    const aisle = findAisle(item.key, item.display);
    if (!aisles.has(aisle)) aisles.set(aisle, []);
    aisles.get(aisle)!.push(item);
  }
  const ordered = ["Produce", "Meat", "Seafood", "Dairy", "Eggs", "Pantry", "Frozen", "Other"];
  const aisleList = ordered
    .filter((a) => aisles.has(a))
    .map((a) => ({ name: a, items: aisles.get(a)! }));
  return { aisles: aisleList, flat };
}

export function shoppingToCSV(list: ShoppingList): string {
  const rows = [["Aisle", "Ingredient", "Count", "Recipes"]];
  for (const aisle of list.aisles) {
    for (const it of aisle.items) {
      rows.push([aisle.name, it.display, String(it.count), it.recipes.join("; ")]);
    }
  }
  return rows.map((r) => r.map(csvField).join(",")).join("\n");
}

export function planToCSV(plan: Plan): string {
  const rows = [["Day", "Slot", "Recipe", "Category", "Calories", "Protein (g)", "Carbs (g)", "Fat (g)", "Source"]];
  for (const d of plan.days) {
    for (const m of d.meals) {
      rows.push([
        `Day ${d.day + 1}`,
        m.slot,
        m.recipe.name,
        m.recipe.category,
        String(m.recipe.macros.cal),
        String(m.recipe.macros.p),
        String(m.recipe.macros.c),
        String(m.recipe.macros.f),
        m.recipe.source,
      ]);
    }
  }
  return rows.map((r) => r.map(csvField).join(",")).join("\n");
}

function csvField(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function downloadFile(name: string, contents: string, mime = "text/csv") {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
