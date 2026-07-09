import type { Plan, Recipe } from "./types";

export type AggregatedIngredient = {
  key: string;
  display: string;
  recipes: string[]; // names
  count: number;
  amount?: number | null;
  unit?: string | null;
};

const STOP_WORDS = new Set([
  "a", "an", "the", "of", "and", "or", "to", "for", "with",
  "fresh", "large", "small", "medium", "cold", "warm", "hot",
  "chopped", "minced", "diced", "sliced", "grated", "shredded", "crushed", "peeled", "trimmed", "rinsed", "drained", "cooked", "raw",
  "cup", "cups", "tsp", "tbsp", "oz", "lb", "lbs", "g", "kg", "ml", "l",
  "teaspoon", "teaspoons", "tablespoon", "tablespoons", "ounce", "ounces", "pound", "pounds", "gram", "grams",
  "clove", "cloves", "can", "cans", "slice", "slices", "piece", "pieces", "package", "packages", "bunch", "bunches",
  "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "0",
  "1/2", "1/3", "1/4", "2/3", "3/4", "1/8", "1/16",
]);

const UNIT_ALIASES: Record<string, string> = {
  cup: "cup", cups: "cup",
  tsp: "tsp", teaspoon: "tsp", teaspoons: "tsp",
  tbsp: "tbsp", tablespoon: "tbsp", tablespoons: "tbsp",
  oz: "oz", ounce: "oz", ounces: "oz",
  lb: "lb", lbs: "lb", pound: "lb", pounds: "lb",
  g: "g", gram: "g", grams: "g",
  kg: "kg",
  ml: "ml",
  l: "l",
  clove: "clove", cloves: "clove",
  can: "can", cans: "can",
  slice: "slice", slices: "slice",
  piece: "piece", pieces: "piece",
  package: "package", packages: "package", pkg: "package",
  bunch: "bunch", bunches: "bunch",
};

const KNOWN_INGREDIENT_PHRASES = [
  "olive oil", "soy sauce", "tomato sauce", "tomato paste", "peanut butter", "almond butter",
  "sour cream", "heavy cream", "cream cheese", "ground beef", "ground turkey", "ground chicken",
  "ground pork", "sweet potato", "green bean", "black bean", "sea salt", "black pepper",
  "white pepper", "bell pepper", "red bell pepper", "green bell pepper", "yellow bell pepper",
  "red pepper", "chicken broth", "vegetable broth", "beef broth", "maple syrup", "lemon juice",
  "lime juice", "coconut milk", "greek yogurt", "brown rice", "white rice",
];

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

function parseAmount(token: string): number | null {
  if (/^\d+(\.\d+)?$/.test(token)) return Number(token);
  const fraction = token.match(/^(\d+)\/(\d+)$/);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);
  return null;
}

function formatAmount(amount: number): string {
  if (Number.isInteger(amount)) return String(amount);
  return String(Math.round(amount * 100) / 100).replace(/\.0+$/, "");
}

function pluralizeUnit(unit: string | null | undefined, amount: number): string {
  if (!unit) return "";
  if (amount === 1) return unit;
  if (unit === "tsp" || unit === "tbsp" || unit === "oz" || unit === "lb" || unit === "g" || unit === "kg" || unit === "ml" || unit === "l") return unit;
  return `${unit}s`;
}

function cleanToken(token: string): string {
  return token.toLowerCase().replace(/^[^\w/.-]+|[^\w/.-]+$/g, "");
}

function bestIngredientName(tokens: string[], fallback: string): string {
  const phrase = tokens.join(" ");
  const known = KNOWN_INGREDIENT_PHRASES
    .filter(item => phrase.includes(item))
    .sort((a, b) => b.length - a.length)[0];
  if (known) return known;
  return tokens.slice(0, 3).join(" ") || fallback;
}

function singularKey(name: string): string {
  return name
    .replace(/\bcloves\b/g, "clove")
    .replace(/\bleaves\b/g, "leaf")
    .replace(/\bberries\b/g, "berry")
    .replace(/\b([a-z]{4,})s\b/g, "$1")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/(^_|_$)/g, "");
}

function displayIngredient(name: string, amount: number | null, unit: string | null): string {
  if (!amount) return name;
  const unitLabel = pluralizeUnit(unit, amount);
  return unitLabel ? `${formatAmount(amount)} ${unitLabel} ${name}` : `${formatAmount(amount)} ${name}`;
}

function normalize(line: string): { key: string; display: string; amount: number | null; unit: string | null } {
  const trimmed = line.trim().toLowerCase();
  const tokens = trimmed.split(/[\s,]+/).map(cleanToken).filter(Boolean);
  let amount: number | null = null;
  let startIndex = 0;
  const firstAmount = parseAmount(tokens[0] ?? "");
  if (firstAmount != null) {
    amount = firstAmount;
    startIndex = 1;
    const mixedFraction = parseAmount(tokens[1] ?? "");
    if (mixedFraction != null && tokens[1]?.includes("/")) {
      amount += mixedFraction;
      startIndex = 2;
    }
  }

  let unit: string | null = null;
  const remaining = tokens.slice(startIndex);
  if (remaining[0] && UNIT_ALIASES[remaining[0]]) {
    unit = UNIT_ALIASES[remaining[0]];
    remaining.shift();
  } else if (amount != null) {
    const unitIndex = remaining.findIndex((token, index) => index <= 2 && !!UNIT_ALIASES[token]);
    if (unitIndex >= 0) {
      unit = UNIT_ALIASES[remaining[unitIndex]];
      remaining.splice(unitIndex, 1);
    }
  }

  const ingredientTokens = remaining.filter(token => {
    if (!token) return false;
    if (STOP_WORDS.has(token)) return false;
    if (UNIT_ALIASES[token]) return false;
    if (parseAmount(token) != null) return false;
    return true;
  });
  const name = bestIngredientName(ingredientTokens, trimmed);
  const key = singularKey(name);
  const display = displayIngredient(name, amount, unit);
  return { key, display, amount, unit };
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
        const { key, display, amount, unit } = normalize(ing);
        const aggregateKey = `${key}|${unit ?? "item"}`;
        const ex = map.get(aggregateKey);
        if (ex) {
          ex.count += 1;
          if (amount != null && ex.amount != null && ex.unit === unit) {
            ex.amount += amount;
            ex.display = displayIngredient(key.replace(/_/g, " "), ex.amount, unit);
          }
          if (!ex.recipes.includes(recipe.name)) ex.recipes.push(recipe.name);
        } else {
          map.set(aggregateKey, { key: aggregateKey, display, recipes: [recipe.name], count: 1, amount, unit });
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
