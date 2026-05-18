/**
 * FatSecret Platform API helper
 * OAuth2 client-credentials flow — token is cached server-side for 24 h.
 * Requires env vars:  FATSECRET_CLIENT_ID  and  FATSECRET_CLIENT_SECRET
 */

interface TokenCache {
  token: string;
  expiresAt: number; // ms timestamp
}

let tokenCache: TokenCache | null = null;

async function getAccessToken(): Promise<string | null> {
  const clientId     = process.env.FATSECRET_CLIENT_ID;
  const clientSecret = process.env.FATSECRET_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  // Return cached token if still valid (refresh 60 s before expiry)
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.token;
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const resp = await fetch("https://oauth.fatsecret.com/connect/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials&scope=basic",
  });

  if (!resp.ok) return null;
  const data = await resp.json() as { access_token: string; expires_in: number };
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return tokenCache.token;
}

function fsPost(token: string, params: Record<string, string>): Promise<Response> {
  return fetch("https://platform.fatsecret.com/rest/server.api", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
  });
}

/** Search the FatSecret database — includes restaurant / branded foods */
export async function fatSecretSearch(query: string, maxResults = 12) {
  const token = await getAccessToken();
  if (!token) return null;

  const resp = await fsPost(token, {
    method: "foods.search",
    search_expression: query,
    max_results: String(maxResults),
    format: "json",
  });
  const data = await resp.json() as any;

  const rawFoods = data?.foods?.food;
  if (!rawFoods) return [];

  const list = Array.isArray(rawFoods) ? rawFoods : [rawFoods];
  return list.map((f: any) => ({
    foodId:          f.food_id,
    foodName:        f.food_name,
    brandName:       f.brand_name  || null,
    foodType:        f.food_type,               // "Brand" | "Generic"
    foodDescription: f.food_description || "",  // "Per 1 serving - Calories: 300kcal | Fat: 13.00g | ..."
  }));
}

/** Get full nutrition details (all serving sizes) for a single food */
export async function fatSecretGetFood(foodId: string) {
  const token = await getAccessToken();
  if (!token) return null;

  const resp = await fsPost(token, {
    method: "food.get.v4",
    food_id: foodId,
    format: "json",
  });
  const data = await resp.json() as any;
  const f = data?.food;
  if (!f) return null;

  // `servings.serving` may be a single object or an array
  const rawServings = f.servings?.serving;
  const servings = rawServings
    ? (Array.isArray(rawServings) ? rawServings : [rawServings]).map((s: any) => ({
        servingId:          s.serving_id,
        servingDescription: s.serving_description,
        calories:  parseFloat(s.calories)     || 0,
        protein:   parseFloat(s.protein)      || 0,
        carbs:     parseFloat(s.carbohydrate) || 0,
        fat:       parseFloat(s.fat)          || 0,
        fiber:     parseFloat(s.fiber)        || 0,
        sugar:     parseFloat(s.sugar)        || 0,
        sodium:    parseFloat(s.sodium)       || 0,
      }))
    : [];

  return {
    foodId:    f.food_id,
    foodName:  f.food_name,
    brandName: f.brand_name || null,
    foodType:  f.food_type,
    servings,
  };
}

/** Returns true when FatSecret credentials are configured */
export function fatSecretConfigured(): boolean {
  return !!(process.env.FATSECRET_CLIENT_ID && process.env.FATSECRET_CLIENT_SECRET);
}
