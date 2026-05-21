import express from "express";
import type { Express, Request, Response, NextFunction } from "express";
import { createServer } from "http";
import { storage } from "./storage";
import { passport } from "./auth";
import { encrypt, decrypt, hasEncryptionKey } from "./encryption";
import { fatSecretSearch, fatSecretGetFood, fatSecretConfigured } from "./fatsecret";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import type { User } from "@shared/schema";
import {
  insertEventSchema, insertTaskSchema,
  insertBookSchema, insertReadingSessionSchema,
  insertWorkoutTemplateSchema, insertWorkoutLogSchema,
  insertGoalSchema, insertGoalTaskSchema,
  insertProjectSchema, insertProjectTaskSchema,
  insertGeneralTaskSchema,
  insertRelationshipGroupSchema, insertPersonSchema,
  insertRecipeSchema, insertMealBundleSchema, insertWeekPlanSchema, insertGroceryCheckSchema,
  insertMovieSchema,
  insertBudgetCategorySchema, insertTransactionSchema, insertSubscriptionSchema,
  insertPlantSchema,
  insertMusicArtistSchema, insertMusicSongSchema,
  insertChoreSchema, insertHouseProjectSchema, insertApplianceSchema, insertSpotSchema,
  insertChildSchema, insertChildMilestoneSchema, insertChildMemorySchema, insertChildPrepItemSchema,
  insertQuoteSchema,
  insertMantraSchema,
  insertArtPieceSchema,
  insertEquipmentSchema,
  insertTabCollaborationSchema,
  insertSacredTextSchema,
  insertFaithPracticeSchema,
  insertSermonSchema,
  insertPrayerItemSchema,
  insertMedicationSchema,
  insertHealthMetricSchema,
  insertSleepLogSchema,
  insertCareProviderSchema,
  insertFoodLogSchema,
  insertNutritionGoalSchema,
} from "@shared/schema";
import type { FoodLogEntry, WaterLog, NutritionGoal } from "@shared/schema";
import { z } from "zod";

function handleError(res: any, e: unknown) {
  if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors });
  res.status(500).json({ error: String(e) });
}

/** Robustly extract a JSON object from an AI response that may include markdown fences or preamble text. */
function extractJson(text: string): object | null {
  // 1. Strip markdown code fences (```json ... ``` or ``` ... ```)
  let s = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  // 2. If the result starts with {, try parsing directly
  if (s.startsWith("{")) {
    try { return JSON.parse(s); } catch {}
  }
  // 3. Extract the outermost { ... } block (handles preamble/postamble text)
  const start = s.indexOf("{");
  const end   = s.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try { return JSON.parse(s.slice(start, end + 1)); } catch {}
  }
  return null;
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: "Unauthorized" });
}

/** Fire-and-forget activity logger — never throws or blocks the main request. */
function logActivity(
  userId: number,
  type: string,
  itemId: number | null,
  itemType: string | null,
  title: string | null,
  imageUrl: string | null,
  subtitle: string | null,
  extra?: string
) {
  storage.logActivity(userId, type, itemId, itemType, title, imageUrl, subtitle, extra).catch(() => {});
}

export async function registerRoutes(_httpServer: ReturnType<typeof createServer>, app: Express) {

  // ── Auth Routes ──────────────────────────────────────────────────────────────
  app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));

  // /auth/google/callback handles BOTH regular login AND Google Calendar OAuth.
  // When req.session.gcalConnecting is set, it's a calendar auth — exchange the
  // code for calendar tokens and redirect back into the app.  Otherwise hand off
  // to Passport for the normal login flow.
  app.get("/auth/google/callback", async (req, res, next) => {
    const isGcalConnect = !!(req.session as any).gcalConnecting;
    if (!isGcalConnect) return next();

    // --- Calendar auth branch ---
    delete (req.session as any).gcalConnecting;
    const { code, error } = req.query as Record<string, string>;
    const userId: number | undefined = (req.session as any).gcalUserId;
    if (error || !code || !userId) return res.redirect("/?gcal=error#/calendar");

    try {
      const callbackUrl = process.env.GOOGLE_CALLBACK_URL ||
        `${req.get("x-forwarded-proto") ?? req.protocol}://${req.get("host")}/auth/google/callback`;

      const r = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: callbackUrl,
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        }),
      });
      if (!r.ok) return res.redirect("/?gcal=error#/calendar");
      const d = await r.json() as any;
      const expiry = new Date(Date.now() + (d.expires_in ?? 3600) * 1000).toISOString();
      await storage.saveGcalTokens(userId, d.access_token, d.refresh_token ?? null, expiry);
      delete (req.session as any).gcalUserId;
      return res.redirect("/?gcal=connected#/calendar");
    } catch {
      return res.redirect("/?gcal=error#/calendar");
    }
  }, passport.authenticate("google", { failureRedirect: "/" }),
  (_req, res) => {
    // Redirect to "/" not "/dashboard" — the SPA is served from root so
    // Vite's base:"/" asset paths always resolve correctly.
    res.redirect("/");
  });

    // ── Landing / app root ─────────────────────────────────────────────────────
  app.get("/", (req, res) => {
    if (req.isAuthenticated()) {
      // Serve the SPA from "/" so relative asset paths (base: "/") always resolve correctly.
      // Redirecting to "/dashboard" was breaking PWA login because assets at
      // "./assets/…" resolved to "/dashboard/assets/…" which don't exist.
      const spaIndex = path.resolve(process.cwd(), "dist/public/index.html");
      if (fs.existsSync(spaIndex)) return res.sendFile(spaIndex);
      // Dev fallback
      return res.redirect("/#/");
    }
    // Unauthenticated — serve landing page with Google client ID injected
    try {
      const html = fs.readFileSync(path.resolve(process.cwd(), "landing.html"), "utf-8");
      const clientId = process.env.GOOGLE_CLIENT_ID || "";
      res.setHeader("Content-Type", "text/html");
      res.send(html.replace(/__GOOGLE_CLIENT_ID__/g, clientId));
    } catch {
      res.sendFile(path.resolve(process.cwd(), "landing.html"));
    }
  });

  // ── Privacy Policy ────────────────────────────────────────────────────────
  app.get("/privacy", (req, res) => {
    res.sendFile(path.resolve(process.cwd(), "privacy.html"));
  });

  // ── Digital Asset Links (required for TWA Android packaging) ─────────────
  // PWABuilder generates the SHA-256 fingerprint; store it in assetlinks.json at the project root.
  app.get("/.well-known/assetlinks.json", (req, res) => {
    const assetLinksPath = path.resolve(process.cwd(), "assetlinks.json");
    if (fs.existsSync(assetLinksPath)) {
      res.setHeader("Content-Type", "application/json");
      return res.sendFile(assetLinksPath);
    }
    res.status(404).json([]);
  });

  // ── Public config (client-safe values only) ───────────────────────────────
  app.get("/api/config", (_req, res) => {
    res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || "" });
  });

  // ── Token-based Google sign-in ─────────────────────────────────────────────
  // Accepts either:
  //   { access_token }  – legacy OAuth access token
  //   { credential }    – GIS JWT credential (id_token) — works in PWA / no redirect needed
  app.post("/auth/google", async (req, res) => {
    try {
      const { access_token, credential } = req.body;
      let googleId: string, email: string, name: string, picture: string | undefined;

      if (credential) {
        // Validate GIS JWT via Google's tokeninfo endpoint
        const tokenRes = await fetch(
          `https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`
        );
        if (!tokenRes.ok) return res.status(401).json({ error: "Invalid credential" });
        const td = await tokenRes.json() as any;
        // Verify audience matches our client ID
        if (td.aud !== process.env.GOOGLE_CLIENT_ID) {
          return res.status(401).json({ error: "Token audience mismatch" });
        }
        googleId = td.sub;
        email = td.email;
        name = td.name ?? td.email;
        picture = td.picture;
      } else if (access_token) {
        const googleRes = await fetch(
          `https://www.googleapis.com/oauth2/v1/userinfo?access_token=${access_token}`
        );
        if (!googleRes.ok) return res.status(401).json({ error: "Invalid Google token" });
        const profile = await googleRes.json() as any;
        googleId = profile.id;
        email = profile.email;
        name = profile.name ?? profile.email;
        picture = profile.picture;
      } else {
        return res.status(400).json({ error: "access_token or credential required" });
      }

      if (!email) return res.status(401).json({ error: "No email returned from Google" });

      const user = await storage.upsertUser({
        googleId,
        email,
        name,
        avatarUrl: picture ?? null,
      });

      await new Promise<void>((resolve, reject) => {
        req.login(user!, (err) => (err ? reject(err) : resolve()));
      });

      res.json({ redirect: "/" });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.get("/api/me", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Not authenticated" });
    const user = req.user as User;
    const enc = await storage.getAnthropicApiKeyEnc(user.id);
    // Never expose the raw key — only indicate whether one is saved
    res.json({ ...user, anthropicApiKeyEnc: undefined, hasAnthropicKey: !!enc });
  });

  // ── Google Calendar Integration ───────────────────────────────────────────────

  const GCAL_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

  // Helper: get a valid (possibly refreshed) access token
  async function getValidGcalToken(userId: number): Promise<string | null> {
    const tokens = await storage.getGcalTokens(userId);
    if (!tokens) return null;
    // If expiry is more than 60 seconds away, token is still valid
    if (tokens.expiry && new Date(tokens.expiry) > new Date(Date.now() + 60_000)) {
      return tokens.accessToken;
    }
    // Refresh the token
    if (!tokens.refreshToken) return null;
    try {
      const r = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: tokens.refreshToken,
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        }),
      });
      if (!r.ok) { await storage.clearGcalTokens(userId); return null; }
      const d = await r.json() as any;
      const expiry = new Date(Date.now() + (d.expires_in ?? 3600) * 1000).toISOString();
      await storage.saveGcalTokens(userId, d.access_token, tokens.refreshToken, expiry);
      return d.access_token;
    } catch { return null; }
  }

  // Helper: build the gcal callback URL consistently
  function gcalCallbackUrl(req: Request): string {
    if (process.env.GCAL_CALLBACK_URL) return process.env.GCAL_CALLBACK_URL;
    // On Railway (trust proxy 1) req.protocol is 'https'; fall back to https explicitly
    const proto = req.get("x-forwarded-proto") ?? req.protocol ?? "https";
    return `${proto}://${req.get("host")}/api/gcal/callback`;
  }

  // GET /api/gcal/status
  app.get("/api/gcal/status", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as User).id;
      const tokens = await storage.getGcalTokens(userId);
      const u = await storage.getUserById(userId);
      res.json({
        connected: !!tokens,
        lastSync: u?.gcalLastSync ?? null,
        callbackUrl: gcalCallbackUrl(req),
      });
    } catch (e) { handleError(res, e); }
  });

  // GET /api/gcal/connect — redirect to Google OAuth with calendar scope
  // Reuses /auth/google/callback (already registered in Google Cloud Console)
  // and sets a session flag so the callback knows it's a calendar auth.
  app.get("/api/gcal/connect", requireAuth, (req, res) => {
    const userId = (req.user as User).id;
    (req.session as any).gcalUserId = userId;
    (req.session as any).gcalConnecting = true;

    // Use the same registered callback URL as the normal login flow
    const callbackUrl = process.env.GOOGLE_CALLBACK_URL ||
      `${req.get("x-forwarded-proto") ?? req.protocol}://${req.get("host")}/auth/google/callback`;

    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!);
    url.searchParams.set("redirect_uri", callbackUrl);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", GCAL_SCOPE);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    res.redirect(url.toString());
  });

  // POST /api/gcal/sync — fetch and upsert Google Calendar events
  app.post("/api/gcal/sync", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as User).id;
      const accessToken = await getValidGcalToken(userId);
      if (!accessToken) return res.status(401).json({ error: "Not connected to Google Calendar" });

      const timeMin = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days ago
      const timeMax = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(); // 1 year ahead
      const apiUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
        `timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&` +
        `maxResults=500&singleEvents=true&orderBy=startTime`;

      const gcalRes = await fetch(apiUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!gcalRes.ok) {
        if (gcalRes.status === 401) await storage.clearGcalTokens(userId);
        return res.status(gcalRes.status).json({ error: "Google Calendar API error" });
      }
      const data = await gcalRes.json() as any;
      const gcalItems = (data.items ?? []).filter((e: any) => e.status !== "cancelled");

      const syncedIds: string[] = [];
      let synced = 0;
      for (const e of gcalItems) {
        const startDate = e.start?.date ?? e.start?.dateTime?.slice(0, 10);
        const endDate = (e.end?.date ?? e.end?.dateTime?.slice(0, 10)) ?? startDate;
        if (!startDate || !e.id) continue;
        await storage.upsertGcalEvent({
          userId,
          title: e.summary || "(No title)",
          date: startDate,
          endDate,
          description: e.description ?? null,
          gcalEventId: e.id,
        });
        syncedIds.push(e.id);
        synced++;
      }
      // Remove events that no longer exist in Google Calendar
      await storage.deleteStaleGcalEvents(userId, syncedIds);
      await storage.updateGcalLastSync(userId, new Date().toISOString());

      res.json({ synced });
    } catch (e) { handleError(res, e); }
  });

  // DELETE /api/gcal/disconnect — remove tokens and all synced events
  app.delete("/api/gcal/disconnect", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as User).id;
      await storage.deleteGcalEvents(userId);
      await storage.clearGcalTokens(userId);
      res.json({ ok: true });
    } catch (e) { handleError(res, e); }
  });

  // ── Delete account ────────────────────────────────────────────────────────────

  app.delete("/api/me", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as User).id;
      await new Promise<void>((resolve, reject) => {
        req.logout((err) => (err ? reject(err) : resolve()));
      });
      req.session.destroy(() => {});
      await storage.deleteAccount(userId);
      res.json({ ok: true });
    } catch (e) { handleError(res, e); }
  });

  // ── Onboarding ────────────────────────────────────────────────────────────────

  app.post("/api/me/complete-onboarding", requireAuth, async (req, res) => {
    try {
      await storage.completeOnboarding((req.user as User).id);
      res.json({ ok: true });
    } catch (e) { handleError(res, e); }
  });

  // ── Anthropic API Key Management ─────────────────────────────────────────────

  /** GET /api/user/api-key/status — returns { hasKey, encryptionConfigured } */
  app.get("/api/user/api-key/status", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const enc = await storage.getAnthropicApiKeyEnc(uid);
      res.json({ hasKey: !!enc, encryptionConfigured: hasEncryptionKey() });
    } catch (e) { handleError(res, e); }
  });

  /** PUT /api/user/api-key — validates the key with Anthropic, then encrypts and saves it */
  app.put("/api/user/api-key", requireAuth, async (req, res) => {
    try {
      if (!hasEncryptionKey()) return res.status(503).json({ error: "Encryption not configured on server. Set ENCRYPTION_KEY." });
      const { apiKey } = req.body as { apiKey?: string };
      if (!apiKey || typeof apiKey !== "string" || !apiKey.startsWith("sk-ant-")) {
        return res.status(400).json({ error: "Invalid Anthropic API key format. Key should start with sk-ant-" });
      }
      // Validate the key by making a minimal test call
      const testRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 5,
          messages: [{ role: "user", content: "Hi" }],
        }),
      });
      if (!testRes.ok) {
        const err = await testRes.text();
        return res.status(400).json({ error: "API key validation failed. Check the key and try again.", detail: err.slice(0, 200) });
      }
      const uid = (req.user as User).id;
      await storage.saveAnthropicApiKey(uid, encrypt(apiKey));
      res.json({ ok: true });
    } catch (e) { handleError(res, e); }
  });

  /** DELETE /api/user/api-key — removes the saved key */
  app.delete("/api/user/api-key", requireAuth, async (req, res) => {
    try {
      await storage.removeAnthropicApiKey((req.user as User).id);
      res.json({ ok: true });
    } catch (e) { handleError(res, e); }
  });

  // ── Plant AI Enrichment ───────────────────────────────────────────────────────

  app.post("/api/plants/:id/enrich", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const plantId = +req.params.id;

      // Get the user's encrypted Anthropic API key
      const enc = await storage.getAnthropicApiKeyEnc(uid);
      if (!enc) return res.status(402).json({ error: "No Anthropic API key saved. Add one in Settings." });

      let apiKey: string;
      try { apiKey = decrypt(enc); }
      catch { return res.status(500).json({ error: "Failed to decrypt API key. Re-save it in Settings." }); }

      // Get the plant to know its name
      const allPlants = await storage.getAllPlants(uid);
      const plant = allPlants.find(p => p.id === plantId);
      if (!plant) return res.status(404).json({ error: "Plant not found" });

      const plantName = plant.name;
      const species = plant.species ?? "";

      const prompt = `You are a plant care expert. For the plant "${plantName}"${species ? ` (${species})` : ""}, provide care information as JSON only — no explanation, no markdown, just raw JSON.

Return exactly this structure:
{
  "waterFrequencyDays": <integer: recommended days between watering>,
  "lightNeeds": <"low" | "medium" | "bright_indirect" | "direct">,
  "soilType": <string: e.g. "Well-draining potting mix with perlite">,
  "toxicityHumans": <"non-toxic" | "mildly toxic" | "toxic" | "unknown">,
  "toxicityPets": <"non-toxic" | "mildly toxic" | "toxic" | "unknown">,
  "propagationMethods": <string: e.g. "Stem cuttings in water or soil, division">,
  "careDifficulty": <"easy" | "moderate" | "difficult">,
  "description": <string: 2-3 sentence care overview>
}`;

      const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 512,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!claudeRes.ok) {
        const errText = await claudeRes.text();
        console.error("[Plant enrich] Claude error:", claudeRes.status, errText.slice(0, 200));
        return res.status(502).json({ error: "Claude API error", detail: errText.slice(0, 200) });
      }

      const claudeData = await claudeRes.json() as any;
      const rawText: string = claudeData?.content?.[0]?.text ?? "";

      let enriched: any;
      try {
        // Extract JSON from response (Claude may include extra text)
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        enriched = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
      } catch {
        console.error("[Plant enrich] Failed to parse Claude JSON:", rawText.slice(0, 300));
        return res.status(502).json({ error: "Could not parse Claude response as JSON" });
      }

      // Build update — only overwrite fields that are currently empty/default
      const update: any = { aiEnriched: true };

      // Only set care fields if Perenual didn't already provide them (or if they're still defaults)
      if (!plant.notes && enriched.description) {
        const toxLine = enriched.toxicityHumans && enriched.toxicityPets
          ? `\n\nToxicity: ${enriched.toxicityHumans} to humans · ${enriched.toxicityPets} to pets`
          : "";
        update.notes = enriched.description + toxLine;
      }
      if (enriched.waterFrequencyDays && typeof enriched.waterFrequencyDays === "number") {
        update.waterFrequencyDays = enriched.waterFrequencyDays;
      }
      if (enriched.lightNeeds && ["low","medium","bright_indirect","direct"].includes(enriched.lightNeeds)) {
        update.lightNeeds = enriched.lightNeeds;
      }
      if (!plant.soilType && enriched.soilType) {
        update.soilType = enriched.soilType;
      }
      // Always save the structured enrichment fields
      if (enriched.toxicityHumans || enriched.toxicityPets) {
        const parts = [];
        if (enriched.toxicityHumans) parts.push(`Humans: ${enriched.toxicityHumans}`);
        if (enriched.toxicityPets) parts.push(`Pets: ${enriched.toxicityPets}`);
        update.toxicityNotes = parts.join(" · ");
      }
      if (enriched.propagationMethods) update.propagationMethods = enriched.propagationMethods;
      if (enriched.careDifficulty) update.careDifficulty = enriched.careDifficulty;

      const updated = await storage.updatePlant(plantId, update);
      res.json(updated);
    } catch (e) {
      console.error("[Plant enrich] Unexpected error:", e);
      handleError(res, e);
    }
  });

  app.post("/api/logout", (req, res) => {
    req.logout(() => { res.json({ ok: true }); });
  });

  // Protect all remaining /api routes
  app.use("/api", requireAuth);

  // ── Events ──────────────────────────────────────────────────────────────────
  app.get("/api/events", async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(await storage.getAllEventsWithTasks(uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/events", async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.status(201).json(await storage.createEvent(insertEventSchema.parse(req.body), uid));
    }
    catch (e) { handleError(res, e); }
  });
  app.patch("/api/events/:id", async (req, res) => {
    try {
      const r = await storage.updateEvent(+req.params.id, insertEventSchema.partial().parse(req.body));
      r ? res.json(r) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/events/:id", async (req, res) => {
    (await storage.deleteEvent(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // ── Tasks ────────────────────────────────────────────────────────────────────
  app.post("/api/events/:eventId/tasks", async (req, res) => {
    try { res.status(201).json(await storage.createTask(insertTaskSchema.parse({ ...req.body, eventId: +req.params.eventId }))); }
    catch (e) { handleError(res, e); }
  });
  app.patch("/api/tasks/:id", async (req, res) => {
    try {
      const r = await storage.updateTask(+req.params.id, insertTaskSchema.partial().parse(req.body));
      r ? res.json(r) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/tasks/:id", async (req, res) => {
    (await storage.deleteTask(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // ── Books ────────────────────────────────────────────────────────────────────
  // ── Reading Goal ─────────────────────────────────────────────────────────────
  app.get("/api/reading/goal", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(await storage.getReadingGoal(uid));
    } catch (e) { handleError(res, e); }
  });
  app.patch("/api/reading/goal", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const { booksTarget, year, label, startDate, endDate } = req.body;
      res.json(await storage.upsertReadingGoal(uid, { booksTarget, year, label: label ?? null, startDate: startDate ?? null, endDate: endDate ?? null }));
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/reading/goal", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      await storage.deleteReadingGoal(uid);
      res.status(204).end();
    } catch (e) { handleError(res, e); }
  });

  app.get("/api/books", async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(await storage.getAllBooksWithSessions(uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/books", async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const book = await storage.createBook(insertBookSchema.parse(req.body), uid);
      logActivity(uid, "book_added", book.id, "book", book.title, book.coverUrl ?? null, book.author ?? null);
      res.status(201).json(book);
    }
    catch (e) { handleError(res, e); }
  });
  app.patch("/api/books/:id", async (req, res) => {
    try {
      const body = insertBookSchema.partial().parse(req.body);
      // Check if we're transitioning to 'finished'
      if (body.status === "finished") {
        const existing = await storage.getAllBooks((req.user as User).id);
        const book = existing.find((b) => b.id === +req.params.id);
        if (book && book.status !== "finished") {
          const r = await storage.updateBook(+req.params.id, body);
          if (r) {
            logActivity((req.user as User).id, "book_finished", r.id, "book", r.title, r.coverUrl ?? null, r.author ?? null);
            return res.json(r);
          }
          return res.status(404).json({ error: "Not found" });
        }
      }
      const r = await storage.updateBook(+req.params.id, body);
      r ? res.json(r) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/books/:id", async (req, res) => {
    (await storage.deleteBook(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // ── Reading Sessions ──────────────────────────────────────────────────────────
  app.get("/api/reading-sessions", async (_req, res) => {
    try { res.json(await storage.getAllReadingSessions()); } catch (e) { handleError(res, e); }
  });
  app.post("/api/reading-sessions", async (req, res) => {
    try { res.status(201).json(await storage.createReadingSession(insertReadingSessionSchema.parse(req.body))); }
    catch (e) { handleError(res, e); }
  });
  app.patch("/api/reading-sessions/:id", async (req, res) => {
    try {
      const r = await storage.updateReadingSession(+req.params.id, insertReadingSessionSchema.partial().parse(req.body));
      r ? res.json(r) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/reading-sessions/:id", async (req, res) => {
    (await storage.deleteReadingSession(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // ── Workout Templates ─────────────────────────────────────────────────────────
  app.get("/api/workout-templates", async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(await storage.getAllWorkoutTemplates(uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/workout-templates", async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.status(201).json(await storage.createWorkoutTemplate(insertWorkoutTemplateSchema.parse(req.body), uid));
    }
    catch (e) { handleError(res, e); }
  });
  app.patch("/api/workout-templates/:id", async (req, res) => {
    try {
      const r = await storage.updateWorkoutTemplate(+req.params.id, insertWorkoutTemplateSchema.partial().parse(req.body));
      r ? res.json(r) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/workout-templates/:id", async (req, res) => {
    (await storage.deleteWorkoutTemplate(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // ── Workout Plans ─────────────────────────────────────────────────────────────
  app.get("/api/workout-plans", requireAuth, async (req, res) => {
    try { res.json(await storage.getAllWorkoutPlans((req.user as User).id)); }
    catch (e) { handleError(res, e); }
  });
  app.post("/api/workout-plans", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const data = { ...req.body, userId: uid, createdAt: new Date().toISOString() };
      res.status(201).json(await storage.createWorkoutPlan(data, uid));
    } catch (e) { handleError(res, e); }
  });
  app.patch("/api/workout-plans/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateWorkoutPlan(+req.params.id, req.body);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/workout-plans/:id", requireAuth, async (req, res) => {
    try {
      const ok = await storage.deleteWorkoutPlan(+req.params.id);
      ok ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/workout-plans/:id/activate", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const updated = await storage.setActivePlan(+req.params.id, uid);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  // ── Body Composition Plans ────────────────────────────────────────────────────
  app.get("/api/body-comp-plans", requireAuth, async (req, res) => {
    try { res.json(await storage.getBodyCompPlans((req.user as User).id)); }
    catch (e) { handleError(res, e); }
  });
  app.post("/api/body-comp-plans", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const plan = await storage.createBodyCompPlan({ ...req.body, createdAt: new Date().toISOString() }, uid);
      res.status(201).json(plan);
    } catch (e) { handleError(res, e); }
  });
  app.patch("/api/body-comp-plans/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateBodyCompPlan(+req.params.id, req.body);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/body-comp-plans/:id", requireAuth, async (req, res) => {
    try {
      const ok = await storage.deleteBodyCompPlan(+req.params.id, (req.user as User).id);
      ok ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.get("/api/body-comp-plans/:id/check-ins", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(await storage.getBodyCompCheckIns(+req.params.id, uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/body-comp-plans/:id/check-ins", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const checkin = await storage.createBodyCompCheckIn({
        planId: +req.params.id,
        ...req.body,
        createdAt: new Date().toISOString(),
      }, uid);
      res.status(201).json(checkin);
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/body-comp-check-ins/:id", requireAuth, async (req, res) => {
    try {
      const ok = await storage.deleteBodyCompCheckIn(+req.params.id, (req.user as User).id);
      ok ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  // ── Workout Shares ────────────────────────────────────────────────────────────
  app.get("/api/workout-shares", requireAuth, async (req, res) => {
    try { res.json(await storage.getWorkoutShares((req.user as User).id)); }
    catch (e) { handleError(res, e); }
  });
  app.post("/api/workout-shares", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const { toUserId, shareType, contentJson, notes } = req.body;
      const share = await storage.createWorkoutShare({
        fromUserId: uid, toUserId, shareType, contentJson, notes: notes ?? null,
        createdAt: new Date().toISOString(),
      });
      res.status(201).json(share);
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/workout-shares/:id/dismiss", requireAuth, async (req, res) => {
    try {
      await storage.dismissWorkoutShare(+req.params.id, (req.user as User).id);
      res.json({ ok: true });
    } catch (e) { handleError(res, e); }
  });

  // ── Workout Logs ──────────────────────────────────────────────────────────────
  app.get("/api/workout-logs", async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(await storage.getAllWorkoutLogs(uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/workout-logs", async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.status(201).json(await storage.createWorkoutLog(insertWorkoutLogSchema.parse(req.body), uid));
    }
    catch (e) { handleError(res, e); }
  });
  app.patch("/api/workout-logs/:id", async (req, res) => {
    try {
      const r = await storage.updateWorkoutLog(+req.params.id, insertWorkoutLogSchema.partial().parse(req.body));
      r ? res.json(r) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/workout-logs/:id", async (req, res) => {
    (await storage.deleteWorkoutLog(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // ── Goals ─────────────────────────────────────────────────────────────────────
  app.get("/api/goals", async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(await storage.getAllGoalsWithProjects(uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/goals", async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.status(201).json(await storage.createGoal(insertGoalSchema.parse(req.body), uid));
    }
    catch (e) { handleError(res, e); }
  });
  app.patch("/api/goals/:id", async (req, res) => {
    try {
      const r = await storage.updateGoal(+req.params.id, insertGoalSchema.partial().parse(req.body));
      r ? res.json(r) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/goals/:id", async (req, res) => {
    (await storage.deleteGoal(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // ── Goal Tasks (legacy) ──────────────────────────────────────────────────────
  app.post("/api/goals/:goalId/tasks", async (req, res) => {
    try { res.status(201).json(await storage.createGoalTask(insertGoalTaskSchema.parse({ ...req.body, goalId: +req.params.goalId }))); }
    catch (e) { handleError(res, e); }
  });
  app.patch("/api/goal-tasks/:id", async (req, res) => {
    try {
      const r = await storage.updateGoalTask(+req.params.id, insertGoalTaskSchema.partial().parse(req.body));
      r ? res.json(r) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/goal-tasks/:id", async (req, res) => {
    (await storage.deleteGoalTask(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // ── Projects ──────────────────────────────────────────────────────────────────
  app.post("/api/goals/:goalId/projects", async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.status(201).json(await storage.createProject(insertProjectSchema.parse({ ...req.body, goalId: +req.params.goalId }), uid));
    }
    catch (e) { handleError(res, e); }
  });
  app.patch("/api/projects/:id", async (req, res) => {
    try {
      const r = await storage.updateProject(+req.params.id, insertProjectSchema.partial().parse(req.body));
      r ? res.json(r) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/projects/:id", async (req, res) => {
    (await storage.deleteProject(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // ── Project Tasks ─────────────────────────────────────────────────────────────
  app.post("/api/projects/:projectId/tasks", async (req, res) => {
    try { res.status(201).json(await storage.createProjectTask(insertProjectTaskSchema.parse({ ...req.body, projectId: +req.params.projectId }))); }
    catch (e) { handleError(res, e); }
  });
  app.patch("/api/project-tasks/:id", async (req, res) => {
    try {
      const r = await storage.updateProjectTask(+req.params.id, insertProjectTaskSchema.partial().parse(req.body));
      r ? res.json(r) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/project-tasks/:id", async (req, res) => {
    (await storage.deleteProjectTask(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // ── Standalone Projects (no goal) ────────────────────────────────────────────
  app.get("/api/projects/standalone", async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(await storage.getStandaloneProjects(uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/projects/standalone", async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.status(201).json(await storage.createProject(insertProjectSchema.parse({ ...req.body, goalId: null }), uid));
    }
    catch (e) { handleError(res, e); }
  });

  // ── General Tasks ─────────────────────────────────────────────────────────────
  app.get("/api/general-tasks", async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(await storage.getAllGeneralTasks(uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/general-tasks", async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.status(201).json(await storage.createGeneralTask(insertGeneralTaskSchema.parse(req.body), uid));
    }
    catch (e) { handleError(res, e); }
  });
  app.patch("/api/general-tasks/:id", async (req, res) => {
    try {
      const r = await storage.updateGeneralTask(+req.params.id, insertGeneralTaskSchema.partial().parse(req.body));
      r ? res.json(r) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/general-tasks/:id", async (req, res) => {
    (await storage.deleteGeneralTask(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // ── Relationship Groups ───────────────────────────────────────────────────────
  app.get("/api/groups", async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(await storage.getAllGroups(uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/groups", async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.status(201).json(await storage.createGroup(insertRelationshipGroupSchema.parse(req.body), uid));
    }
    catch (e) { handleError(res, e); }
  });
  app.patch("/api/groups/:id", async (req, res) => {
    try {
      const r = await storage.updateGroup(+req.params.id, insertRelationshipGroupSchema.partial().parse(req.body));
      r ? res.json(r) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/groups/:id", async (req, res) => {
    (await storage.deleteGroup(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // ── People ────────────────────────────────────────────────────────────────────
  app.get("/api/people", async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(await storage.getAllPeople(uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/people", async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const person = await storage.createPerson(insertPersonSchema.parse(req.body), uid);
      if (person.birthday) {
        const name = [person.firstName, person.lastName].filter(Boolean).join(" ");
        const event = await storage.createEvent({
          title: `${name}'s Birthday`,
          date: person.birthday,
          endDate: null,
          category: "birthday",
          recurring: "yearly",
          description: null,
          color: null,
        }, uid);
        await storage.updatePerson(person.id, { birthdayEventId: event.id });
        person.birthdayEventId = event.id;
      }
      res.status(201).json(person);
    } catch (e) { handleError(res, e); }
  });
  app.patch("/api/people/:id", async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const data = insertPersonSchema.partial().parse(req.body);
      const all = await storage.getAllPeople(uid);
      const existing = all.find(p => p.id === +req.params.id);
      if (!existing) return res.status(404).json({ error: "Not found" });

      if (data.birthday !== undefined && data.birthday !== existing.birthday) {
        const name = [data.firstName ?? existing.firstName, data.lastName ?? existing.lastName].filter(Boolean).join(" ");
        if (existing.birthdayEventId) {
          await storage.updateEvent(existing.birthdayEventId, {
            title: `${name}'s Birthday`,
            date: data.birthday || existing.birthday || "",
            recurring: "yearly",
          });
        } else if (data.birthday) {
          const event = await storage.createEvent({
            title: `${name}'s Birthday`,
            date: data.birthday,
            endDate: null,
            category: "birthday",
            recurring: "yearly",
            description: null,
            color: null,
          }, uid);
          data.birthdayEventId = event.id;
        }
      }

      const r = await storage.updatePerson(+req.params.id, data);
      r ? res.json(r) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/people/:id", async (req, res) => {
    (await storage.deletePerson(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  app.post("/api/people/:id/link-spouse", async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const id = +req.params.id;
      const { spouseId } = req.body as { spouseId: number | null };

      const all = await storage.getAllPeople(uid);
      const current = all.find(p => p.id === id);
      if (!current) return res.status(404).json({ error: "Not found" });

      if (current.spouseId && current.spouseId !== spouseId) {
        await storage.updatePerson(current.spouseId, { spouseId: null });
      }

      await storage.updatePerson(id, { spouseId: spouseId ?? null });
      if (spouseId) {
        const newSpouse = all.find(p => p.id === spouseId);
        if (newSpouse?.spouseId && newSpouse.spouseId !== id) {
          await storage.updatePerson(newSpouse.spouseId, { spouseId: null });
        }
        await storage.updatePerson(spouseId, { spouseId: id });
      }

      res.json({ ok: true });
    } catch (e) { handleError(res, e); }
  });

  // ── Recipes ────────────────────────────────────────────────────────────────
  app.get("/api/recipes", async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(await storage.getAllRecipes(uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/recipes", async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const recipe = await storage.createRecipe(insertRecipeSchema.parse(req.body), uid);
      logActivity(uid, "recipe_added", recipe.id, "recipe", recipe.name, recipe.imageUrl ?? null, recipe.category ?? null);
      res.status(201).json(recipe);
    }
    catch (e) { handleError(res, e); }
  });
  app.patch("/api/recipes/:id", async (req, res) => {
    try {
      const r = await storage.updateRecipe(+req.params.id, insertRecipeSchema.partial().parse(req.body));
      r ? res.json(r) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/recipes/:id", async (req, res) => {
    (await storage.deleteRecipe(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // ── USDA Nutrition search ────────────────────────────────────────────────────
  app.get("/api/nutrition/usda-search", requireAuth, async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query?.trim()) return res.json({ foods: [] });
      const apiKey = process.env.USDA_API_KEY;
      if (!apiKey) return res.json({ foods: [] });
      const url = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}&dataType=Foundation,SR%20Legacy&pageSize=5&api_key=${apiKey}`;
      const r = await fetch(url);
      const data = await r.json() as any;
      const foods = (data.foods || []).slice(0, 5).map((f: any) => ({
        fdcId: f.fdcId,
        description: f.description,
        brandOwner: f.brandOwner,
        servingSize: f.servingSize || 100,
        servingUnit: f.servingSizeUnit || "g",
        nutrients: {
          calories: f.foodNutrients?.find((n: any) => n.nutrientId === 1008)?.value || 0,
          protein:  f.foodNutrients?.find((n: any) => n.nutrientId === 1003)?.value || 0,
          carbs:    f.foodNutrients?.find((n: any) => n.nutrientId === 1005)?.value || 0,
          fat:      f.foodNutrients?.find((n: any) => n.nutrientId === 1004)?.value || 0,
          fiber:    f.foodNutrients?.find((n: any) => n.nutrientId === 1079)?.value || 0,
          sugar:    f.foodNutrients?.find((n: any) => n.nutrientId === 2000)?.value || 0,
          sodium:   f.foodNutrients?.find((n: any) => n.nutrientId === 1093)?.value || 0,
        },
      }));
      res.json({ foods });
    } catch (e) { handleError(res, e); }
  });

  // ── Temporary: report server outbound IP (for FatSecret whitelist setup) ──
  app.get("/api/server-ip", async (_req, res) => {
    try {
      const r = await fetch("https://api.ipify.org?format=json");
      const data = await r.json() as { ip: string };
      res.json({ ip: data.ip, note: "Add this IP to your FatSecret whitelist, then you can remove this route." });
    } catch { res.status(500).json({ error: "Could not fetch IP" }); }
  });

  // ── FatSecret restaurant / branded food search ───────────────────────────
  app.get("/api/nutrition/fatsecret-search", requireAuth, async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query?.trim()) return res.json({ foods: [], configured: fatSecretConfigured() });
      const foods = await fatSecretSearch(query.trim(), 12);
      res.json({ foods: foods ?? [], configured: fatSecretConfigured() });
    } catch (e) { handleError(res, e); }
  });

  app.get("/api/nutrition/fatsecret-food/:id", requireAuth, async (req, res) => {
    try {
      const food = await fatSecretGetFood(req.params.id);
      food ? res.json(food) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  // Open Food Facts barcode lookup
  app.get("/api/nutrition/barcode/:barcode", requireAuth, async (req, res) => {
    try {
      const { barcode } = req.params;
      const r = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
      const data = await r.json() as any;
      if (data.status !== 1 || !data.product) return res.json({ found: false });
      const p = data.product;
      const n = p.nutriments || {};
      res.json({
        found: true,
        name: p.product_name || "Unknown",
        brand: p.brands || "",
        nutriScore: p.nutriscore_grade || null,
        servingSize: parseFloat(p.serving_quantity) || 100,
        servingUnit: "g",
        nutrients: {
          calories: n["energy-kcal_serving"] || n["energy-kcal_100g"] || 0,
          protein:  n.proteins_serving  || n.proteins_100g  || 0,
          carbs:    n.carbohydrates_serving || n.carbohydrates_100g || 0,
          fat:      n.fat_serving  || n.fat_100g  || 0,
          fiber:    n.fiber_serving || n.fiber_100g || 0,
          sugar:    n.sugars_serving || n.sugars_100g || 0,
          sodium:   n.sodium_serving || n.sodium_100g || 0,
        },
      });
    } catch (e) { handleError(res, e); }
  });

  // Recipe nutrition compute (called from frontend "Estimate" button)
  app.post("/api/nutrition/recipe-compute", requireAuth, async (req, res) => {
    try {
      const apiKey = process.env.USDA_API_KEY;
      if (!apiKey) return res.status(400).json({ nutrition: null, error: "USDA_API_KEY not configured" });
      const { ingredients, servings } = req.body as { ingredients: { name: string; qty: string }[]; servings: number };
      const srv = Math.max(1, servings || 4);
      let totals = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0 };
      const unmatched: string[] = [];
      for (const ing of (ingredients || [])) {
        try {
          const url = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(ing.name)}&dataType=Foundation,SR%20Legacy&pageSize=1&api_key=${apiKey}`;
          const r = await fetch(url);
          const data = await r.json() as any;
          const food = data.foods?.[0];
          if (!food) { unmatched.push(ing.name); continue; }
          const get = (id: number) => (food.foodNutrients?.find((n: any) => n.nutrientId === id)?.value || 0);
          totals.calories += get(1008);
          totals.protein  += get(1003);
          totals.carbs    += get(1005);
          totals.fat      += get(1004);
          totals.fiber    += get(1079);
          totals.sugar    += get(2000);
          totals.sodium   += get(1093);
        } catch { unmatched.push(ing.name); }
      }
      res.json({
        nutrition: {
          calories: Math.round(totals.calories / srv),
          protein:  Math.round(totals.protein  / srv * 10) / 10,
          carbs:    Math.round(totals.carbs    / srv * 10) / 10,
          fat:      Math.round(totals.fat      / srv * 10) / 10,
          fiber:    Math.round(totals.fiber    / srv * 10) / 10,
          sugar:    Math.round(totals.sugar    / srv * 10) / 10,
          sodium:   Math.round(totals.sodium   / srv * 10) / 10,
          servings: srv,
          partial: unmatched.length > 0,
          unmatchedIngredients: unmatched,
        }
      });
    } catch (e) { handleError(res, e); }
  });

  // ── Food Log ─────────────────────────────────────────────────────────────────
  app.get("/api/nutrition/food-log", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
      res.json(await storage.getFoodLogForDate(uid, date));
    } catch (e) { handleError(res, e); }
  });
  app.get("/api/nutrition/food-log/history", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(await storage.getFoodLogHistory(uid));
    } catch (e) { handleError(res, e); }
  });
  app.get("/api/nutrition/food-log/week", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const dates = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() - i);
        return d.toISOString().slice(0, 10);
      });
      res.json(await storage.getFoodLogForWeek(uid, dates));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/nutrition/food-log", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const entry = await storage.createFoodLogEntry(insertFoodLogSchema.parse({ ...req.body, userId: uid }));
      res.status(201).json(entry);
    } catch (e) { handleError(res, e); }
  });
  app.patch("/api/nutrition/food-log/:id", requireAuth, async (req, res) => {
    try {
      const entry = await storage.updateFoodLogEntry(+req.params.id, req.body);
      entry ? res.json(entry) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/nutrition/food-log/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deleteFoodLogEntry(+req.params.id))
        ? res.json({ ok: true })
        : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  // ── Water Log ────────────────────────────────────────────────────────────────
  app.get("/api/nutrition/water-log", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
      const log = await storage.getWaterLog(uid, date);
      res.json({ glasses: log?.glasses ?? 0 });
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/nutrition/water-log", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const { date, glasses } = req.body;
      res.json(await storage.upsertWaterLog(uid, date, Number(glasses)));
    } catch (e) { handleError(res, e); }
  });

  // ── Nutrition Goals ───────────────────────────────────────────────────────────
  app.get("/api/nutrition/goals", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const goals = await storage.getNutritionGoals(uid);
      res.json(goals ?? { calories: 2000, protein: 150, carbs: 250, fat: 65, waterGlasses: 8 });
    } catch (e) { handleError(res, e); }
  });
  app.patch("/api/nutrition/goals", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const { calories, protein, carbs, fat, waterGlasses } = req.body;
      res.json(await storage.upsertNutritionGoals(uid, { calories, protein, carbs, fat, waterGlasses }));
    } catch (e) { handleError(res, e); }
  });

  // ── Meal Bundles ────────────────────────────────────────────────────────────
  app.get("/api/meal-bundles", async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(await storage.getAllBundles(uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/meal-bundles", async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.status(201).json(await storage.createBundle(insertMealBundleSchema.parse(req.body), uid));
    } catch (e) { handleError(res, e); }
  });
  app.patch("/api/meal-bundles/:id", async (req, res) => {
    try {
      const r = await storage.updateBundle(+req.params.id, insertMealBundleSchema.partial().parse(req.body));
      r ? res.json(r) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/meal-bundles/:id", async (req, res) => {
    (await storage.deleteBundle(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // ── Week Plan ───────────────────────────────────────────────────────────────
  app.get("/api/week-plan/:weekStart", async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(await storage.getWeekPlan(req.params.weekStart, uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/week-plan", async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.status(201).json(await storage.assignToWeek(insertWeekPlanSchema.parse(req.body), uid));
    }
    catch (e) { handleError(res, e); }
  });
  app.delete("/api/week-plan/:id", async (req, res) => {
    (await storage.removeWeekAssignment(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // ── Grocery Checks ──────────────────────────────────────────────────────────
  app.get("/api/grocery-checks/:weekStart", async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(await storage.getGroceryChecks(req.params.weekStart, uid));
    } catch (e) { handleError(res, e); }
  });
  app.patch("/api/grocery-checks", async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const { weekStart, itemKey, checked } = req.body;
      res.json(await storage.upsertGroceryCheck(weekStart, itemKey, checked, uid));
    } catch (e) { handleError(res, e); }
  });

  // ── Custom Grocery Items ──────────────────────────────────────────────────────
  app.get("/api/custom-grocery-items/:weekStart", async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(await storage.getCustomGroceryItems(req.params.weekStart, uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/custom-grocery-items", async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(await storage.addCustomGroceryItem(req.body, uid));
    } catch (e) { handleError(res, e); }
  });
  app.patch("/api/custom-grocery-items/:id", async (req, res) => {
    try {
      const result = await storage.updateCustomGroceryItem(parseInt(req.params.id), req.body);
      if (!result) return res.status(404).json({ error: "Not found" });
      res.json(result);
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/custom-grocery-items/:id", async (req, res) => {
    try {
      const ok = await storage.deleteCustomGroceryItem(parseInt(req.params.id));
      res.json({ success: ok });
    } catch (e) { handleError(res, e); }
  });

  // ── Movies ────────────────────────────────────────────────────────────────────
  app.get("/api/movies", async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(await storage.getAllMovies(uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/movies", async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const movie = await storage.createMovie(insertMovieSchema.parse(req.body), uid);
      logActivity(uid, "movie_added", movie.id, "movie", movie.title, movie.posterUrl ?? null, movie.director ?? movie.genres ?? null);
      res.status(201).json(movie);
    }
    catch (e) { handleError(res, e); }
  });
  app.patch("/api/movies/:id", async (req, res) => {
    try {
      const updated = await storage.updateMovie(+req.params.id, req.body);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/movies/:id", async (req, res) => {
    (await storage.deleteMovie(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // ── Budget Categories ───────────────────────────────────────────────────────
  app.get("/api/budget-categories", async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(await storage.getAllBudgetCategories(uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/budget-categories", async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.status(201).json(await storage.createBudgetCategory(insertBudgetCategorySchema.parse(req.body), uid));
    }
    catch (e) { handleError(res, e); }
  });
  app.patch("/api/budget-categories/:id", async (req, res) => {
    try {
      const updated = await storage.updateBudgetCategory(+req.params.id, req.body);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/budget-categories/:id", async (req, res) => {
    (await storage.deleteBudgetCategory(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // ── Transactions ─────────────────────────────────────────────────────────────────
  app.get("/api/transactions", async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(await storage.getAllTransactions(uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/transactions", async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.status(201).json(await storage.createTransaction(insertTransactionSchema.parse(req.body), uid));
    }
    catch (e) { handleError(res, e); }
  });
  app.patch("/api/transactions/:id", async (req, res) => {
    try {
      const updated = await storage.updateTransaction(+req.params.id, req.body);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/transactions/:id", async (req, res) => {
    (await storage.deleteTransaction(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // ── Subscriptions ────────────────────────────────────────────────────────────────
  app.get("/api/subscriptions", async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(await storage.getAllSubscriptions(uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/subscriptions", async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.status(201).json(await storage.createSubscription(insertSubscriptionSchema.parse(req.body), uid));
    }
    catch (e) { handleError(res, e); }
  });
  app.patch("/api/subscriptions/:id", async (req, res) => {
    try {
      const updated = await storage.updateSubscription(+req.params.id, req.body);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/subscriptions/:id", async (req, res) => {
    (await storage.deleteSubscription(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // ── Nav Prefs ────────────────────────────────────────────────────────────────────
  app.get("/api/nav-prefs", async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(await storage.getNavPrefs(uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/nav-prefs", async (req, res) => {
    try {
      const uid = (req.user as User).id;
      await storage.saveNavPrefs(uid, req.body);
      res.json({ ok: true });
    } catch (e) { handleError(res, e); }
  });

  app.get("/api/tab-privacy", requireAuth, async (req, res) => {
    try {
      res.json(await storage.getTabPrivacy((req.user as User).id));
    } catch (e) { handleError(res, e); }
  });
  app.put("/api/tab-privacy", requireAuth, async (req, res) => {
    try {
      await storage.saveTabPrivacy((req.user as User).id, req.body);
      res.json({ ok: true });
    } catch (e) { handleError(res, e); }
  });

  app.get("/api/profile/:userId", requireAuth, async (req, res) => {
    try {
      const targetId = parseInt(req.params.userId);
      if (isNaN(targetId)) return res.status(400).json({ error: "Invalid userId" });
      const profile = await storage.getFriendProfile((req.user as User).id, targetId);
      if (!profile) return res.status(404).json({ error: "Profile not found or not a friend" });
      res.json(profile);
    } catch (e) { handleError(res, e); }
  });

  app.post("/api/copy-from-profile", requireAuth, async (req, res) => {
    try {
      const viewerId = (req.user as User).id;
      const { sourceUserId, type, data } = req.body;
      if (!sourceUserId || !type || !data) return res.status(400).json({ error: "Missing sourceUserId, type, or data" });
      const result = await storage.copyFromProfile(viewerId, parseInt(sourceUserId), type, data);
      res.status(201).json(result);
    } catch (e) { handleError(res, e); }
  });

  // ── Receipts (file upload) ─────────────────────────────────────────────────────
  const UPLOADS_DIR = path.resolve("uploads/receipts");
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
      filename: (_req, file, cb) => {
        const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const ext = path.extname(file.originalname);
        cb(null, `${unique}${ext}`);
      },
    }),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];
      cb(null, allowed.includes(file.mimetype));
    },
  });

  app.use("/uploads/receipts", express.static(UPLOADS_DIR));

  app.get("/api/receipts", async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(await storage.getAllReceipts(uid));
    } catch (e) { handleError(res, e); }
  });

  app.post("/api/receipts", upload.single("file"), async (req: any, res) => {
    try {
      const uid = (req.user as User).id;
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      const today = new Date().toISOString().split("T")[0];
      const body = req.body ?? {};
      const record = await storage.createReceiptRecord({
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
        uploadDate: today,
        categoryId: body.categoryId ? parseInt(body.categoryId) : null,
        transactionId: body.transactionId ? parseInt(body.transactionId) : null,
        notes: body.notes ?? null,
        merchant: body.merchant ?? null,
        amount: body.amount ? parseFloat(body.amount) : null,
        receiptDate: body.receiptDate ?? null,
      }, uid);
      res.status(201).json(record);
    } catch (e) { handleError(res, e); }
  });

  app.patch("/api/receipts/:id", async (req, res) => {
    try {
      const updated = await storage.updateReceiptRecord(+req.params.id, req.body);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  app.delete("/api/receipts/:id", async (req, res) => {
    try {
      const all = await storage.getAllReceipts((req.user as User).id);
      const rec = all.find((r) => r.id === +req.params.id);
      if (rec) {
        const filePath = path.join(UPLOADS_DIR, rec.filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
      (await storage.deleteReceiptRecord(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  // ── Plants ────────────────────────────────────────────────────────────────────
  app.get("/api/plants", requireAuth, async (req, res) => {
    try {
      res.json(await storage.getAllPlants((req.user as User).id));
    } catch (e) { handleError(res, e); }
  });

  app.post("/api/plants", requireAuth, async (req, res) => {
    try {
      const b = req.body;
      // Explicitly map all plant fields to avoid any Zod stripping surprises
      const data: any = {
        name: b.name,
        species: b.species ?? null,
        location: b.location ?? null,
        lightNeeds: b.lightNeeds ?? "medium",
        waterFrequencyDays: b.waterFrequencyDays != null ? Number(b.waterFrequencyDays) : 7,
        soilType: b.soilType ?? null,
        notes: b.notes ?? null,
        lastWatered: b.lastWatered ?? null,
        remindersEnabled: b.remindersEnabled ?? false,
        sortOrder: b.sortOrder != null ? Number(b.sortOrder) : 0,
        photoUrl: b.photoUrl ?? null,
      };
      if (!data.name) return res.status(400).json({ error: "name is required" });
      const plant = await storage.createPlant(data, (req.user as User).id);
      res.status(201).json(plant);
    } catch (e) { handleError(res, e); }
  });

  app.patch("/api/plants/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updatePlant(+req.params.id, req.body);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  app.delete("/api/plants/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deletePlant(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  // ── Music Artists ─────────────────────────────────────────────────────────────
  app.get("/api/music/artists", requireAuth, async (req, res) => {
    try {
      res.json(await storage.getAllMusicArtistsWithSongs((req.user as User).id));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/music/artists", requireAuth, async (req, res) => {
    try {
      const data = insertMusicArtistSchema.parse({ ...req.body, userId: (req.user as User).id });
      res.status(201).json(await storage.createMusicArtist(data, (req.user as User).id));
    } catch (e) { handleError(res, e); }
  });
  app.patch("/api/music/artists/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateMusicArtist(+req.params.id, req.body);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/music/artists/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deleteMusicArtist(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  // ── Music Songs ───────────────────────────────────────────────────────────────
  app.post("/api/music/songs", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const data = insertMusicSongSchema.parse({ ...req.body, userId: uid });
      const song = await storage.createMusicSong(data, uid);
      logActivity(uid, "song_added", song.id, "song", song.title, null, null);
      res.status(201).json(song);
    } catch (e) { handleError(res, e); }
  });
  app.patch("/api/music/songs/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateMusicSong(+req.params.id, req.body);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/music/songs/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deleteMusicSong(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  // ── Chores ────────────────────────────────────────────────────────────────────
  app.get("/api/chores", requireAuth, async (req, res) => {
    try {
      const uid = await storage.getTabUserId((req.user as User).id, "housekeeping");
      res.json(await storage.getAllChores(uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/chores", requireAuth, async (req, res) => {
    try {
      const uid = await storage.getTabUserId((req.user as User).id, "housekeeping");
      const data = insertChoreSchema.parse({ ...req.body, userId: uid });
      res.status(201).json(await storage.createChore(data, uid));
    } catch (e) { handleError(res, e); }
  });
  app.patch("/api/chores/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateChore(+req.params.id, req.body);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/chores/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deleteChore(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  // ── House Projects ────────────────────────────────────────────────────────────
  app.get("/api/house-projects", requireAuth, async (req, res) => {
    try {
      const uid = await storage.getTabUserId((req.user as User).id, "housekeeping");
      res.json(await storage.getAllHouseProjects(uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/house-projects", requireAuth, async (req, res) => {
    try {
      const uid = await storage.getTabUserId((req.user as User).id, "housekeeping");
      const data = insertHouseProjectSchema.parse({ ...req.body, userId: uid });
      res.status(201).json(await storage.createHouseProject(data, uid));
    } catch (e) { handleError(res, e); }
  });
  app.patch("/api/house-projects/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateHouseProject(+req.params.id, req.body);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/house-projects/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deleteHouseProject(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  // ── House Project Tasks ───────────────────────────────────────────────────────
  app.post("/api/house-projects/:id/tasks", requireAuth, async (req, res) => {
    try {
      const uid = await storage.getTabUserId((req.user as User).id, "housekeeping");
      const data = { ...req.body, houseProjectId: +req.params.id, userId: uid };
      res.status(201).json(await storage.createHouseProjectTask(data, uid));
    } catch (e) { handleError(res, e); }
  });
  app.patch("/api/house-project-tasks/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateHouseProjectTask(+req.params.id, req.body);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/house-project-tasks/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deleteHouseProjectTask(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  // ── Appliances ────────────────────────────────────────────────────────────────
  app.get("/api/appliances", requireAuth, async (req, res) => {
    try {
      const uid = await storage.getTabUserId((req.user as User).id, "housekeeping");
      res.json(await storage.getAllAppliances(uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/appliances", requireAuth, async (req, res) => {
    try {
      const uid = await storage.getTabUserId((req.user as User).id, "housekeeping");
      const data = insertApplianceSchema.parse({ ...req.body, userId: uid });
      res.status(201).json(await storage.createAppliance(data, uid));
    } catch (e) { handleError(res, e); }
  });
  app.patch("/api/appliances/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateAppliance(+req.params.id, req.body);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/appliances/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deleteAppliance(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  // ── Spots ─────────────────────────────────────────────────────────────────────
  app.get("/api/spots", requireAuth, async (req, res) => {
    try { res.json(await storage.getAllSpots((req.user as User).id)); } catch (e) { handleError(res, e); }
  });
  app.post("/api/spots", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const data = insertSpotSchema.parse({ ...req.body, userId: uid });
      const spot = await storage.createSpot(data, uid);
      logActivity(uid, "spot_added", spot.id, "spot", spot.name, null, spot.address ?? spot.city ?? null);
      res.status(201).json(spot);
    } catch (e) { handleError(res, e); }
  });
  app.patch("/api/spots/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateSpot(+req.params.id, req.body);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/spots/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deleteSpot(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  // ── Nominatim (OpenStreetMap) place search proxy ───────────────────────────────
  // Nominatim requires a descriptive User-Agent — proxying through the server
  // avoids CORS and ensures the header is always set correctly.
  app.get("/api/nominatim/search", requireAuth, async (req, res) => {
    try {
      const q = String(req.query.q ?? "").trim();
      if (!q) return res.status(400).json({ error: "q is required" });
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("q", q);
      url.searchParams.set("format", "json");
      url.searchParams.set("addressdetails", "1");
      url.searchParams.set("limit", "15");
      url.searchParams.set("extratags", "1");   // website, opening_hours, phone
      const r = await fetch(url.toString(), {
        headers: {
          "User-Agent": "MyLifos/1.0 (personal life planner app)",
          "Accept": "application/json",
          "Accept-Language": "en",
        },
      });
      if (!r.ok) return res.status(r.status).json({ error: "Nominatim error" });
      const data = await r.json();
      res.json(data);
    } catch (e) { handleError(res, e); }
  });

  // ── Museum search proxies ─────────────────────────────────────────────────────

  // ── Shared helper: map Met object to result shape ────────────────────────────
  function mapMetObject(d: any) {
    return {
      id: String(d.objectID),
      title: d.title || "Untitled",
      artistName: d.artistDisplayName || null,
      yearCreated: d.objectDate || null,
      medium: d.medium || null,
      movement: d.department || null,
      imageUrl: d.primaryImageSmall || null,
      sourceUrl: d.objectURL || null,
      museum: "The Metropolitan Museum of Art",
      city: "New York",
    };
  }

  // The Metropolitan Museum of Art
  app.get("/api/museum/met/search", requireAuth, async (req, res) => {
    try {
      const q = String(req.query.q ?? "").trim();
      const departmentId = req.query.departmentId ? parseInt(String(req.query.departmentId)) : null;
      if (!q && !departmentId) return res.json([]);

      let objectIds: number[] = [];

      if (departmentId && !q) {
        // Browse by department: fetch all IDs for the dept, then random-sample
        const objRes = await fetch(
          `https://collectionapi.metmuseum.org/public/collection/v1/objects?departmentIds=${departmentId}`,
          { headers: { "Accept": "application/json" } }
        );
        if (!objRes.ok) return res.status(objRes.status).json({ error: "Met API error" });
        const objData = await objRes.json() as { total: number; objectIDs: number[] | null };
        const allIds = objData.objectIDs ?? [];
        if (allIds.length === 0) return res.json([]);
        // Pick 14 IDs spread randomly across the full list
        const stride = Math.max(1, Math.floor(allIds.length / 14));
        const offset = Math.floor(Math.random() * stride);
        for (let i = offset; objectIds.length < 14 && i < allIds.length; i += stride) {
          objectIds.push(allIds[i]);
        }
      } else {
        // Text search (optionally within a department)
        const searchUrl = new URL("https://collectionapi.metmuseum.org/public/collection/v1/search");
        searchUrl.searchParams.set("q", q);
        searchUrl.searchParams.set("hasImages", "true");
        if (departmentId) searchUrl.searchParams.set("departmentId", String(departmentId));
        const searchRes = await fetch(searchUrl.toString(), { headers: { "Accept": "application/json" } });
        if (!searchRes.ok) return res.status(searchRes.status).json({ error: "Met API error" });
        const searchData = await searchRes.json() as { total: number; objectIDs: number[] | null };
        if (!searchData.objectIDs?.length) return res.json([]);
        objectIds = searchData.objectIDs.slice(0, 14);
      }

      // Fetch object details in parallel, keep those with a small image
      const details = await Promise.all(
        objectIds.map(async (id) => {
          try {
            const r = await fetch(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`);
            if (!r.ok) return null;
            return await r.json();
          } catch { return null; }
        })
      );
      res.json(details.filter((d) => d?.primaryImageSmall).slice(0, 9).map(mapMetObject));
    } catch (e) { handleError(res, e); }
  });

  // Art Institute of Chicago
  app.get("/api/museum/aic/search", requireAuth, async (req, res) => {
    try {
      const q = String(req.query.q ?? "").trim();
      const artworkType = String(req.query.artworkType ?? "").trim();
      if (!q && !artworkType) return res.json([]);

      const AIC_FIELDS = "id,title,artist_display,date_display,medium_display,style_title,department_title,image_id,artwork_type_title,place_of_origin";
      const headers = { "Accept": "application/json", "AIC-User-Agent": "MyLifos/1.0 (personal life planner app)" };

      let data: any[] = [];

      if (artworkType && !q) {
        // Browse by artwork type — use the artworks list endpoint with an ES query filter
        // Random page (1–8) for variety each browse
        const page = Math.floor(Math.random() * 8) + 1;
        const browseUrl = `https://api.artic.edu/api/v1/artworks/search?fields=${AIC_FIELDS}&limit=18&page=${page}`;
        const body = JSON.stringify({
          query: { term: { artwork_type_title: artworkType } },
          fields: AIC_FIELDS.split(","),
          limit: 18,
          from: (page - 1) * 18,
        });
        const browseRes = await fetch(browseUrl, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body });
        if (!browseRes.ok) return res.status(browseRes.status).json({ error: "AIC API error" });
        data = (await browseRes.json() as { data: any[] }).data ?? [];
      } else {
        // Text search (optionally within an artwork type)
        const searchUrl = new URL("https://api.artic.edu/api/v1/artworks/search");
        searchUrl.searchParams.set("q", q);
        searchUrl.searchParams.set("limit", "18");
        searchUrl.searchParams.set("fields", AIC_FIELDS);
        const searchRes = await fetch(searchUrl.toString(), { headers });
        if (!searchRes.ok) return res.status(searchRes.status).json({ error: "AIC API error" });
        let allData = (await searchRes.json() as { data: any[] }).data ?? [];
        if (artworkType) allData = allData.filter((d: any) => d.artwork_type_title === artworkType);
        data = allData;
      }

      const results = data
        .filter((d: any) => d.image_id)
        .slice(0, 9)
        .map((d: any) => ({
          id: String(d.id),
          title: d.title || "Untitled",
          artistName: d.artist_display ? d.artist_display.split("\n")[0] : null,
          yearCreated: d.date_display || null,
          medium: d.medium_display || null,
          movement: d.style_title || d.department_title || null,
          imageUrl: `https://www.artic.edu/iiif/2/${d.image_id}/full/400,/0/default.jpg`,
          sourceUrl: `https://www.artic.edu/artworks/${d.id}`,
          museum: "Art Institute of Chicago",
          city: "Chicago",
        }));
      res.json(results);
    } catch (e) { handleError(res, e); }
  });

  // ── Equipment ────────────────────────────────────────────────────────────────
  app.get("/api/equipment", requireAuth, async (req, res) => {
    try { res.json(await storage.getAllEquipment((req.user as User).id)); } catch (e) { handleError(res, e); }
  });
  app.post("/api/equipment", requireAuth, async (req, res) => {
    try {
      const data = insertEquipmentSchema.parse({ ...req.body, userId: (req.user as User).id });
      res.status(201).json(await storage.createEquipment(data, (req.user as User).id));
    } catch (e) { handleError(res, e); }
  });
  app.patch("/api/equipment/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateEquipment(+req.params.id, req.body);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/equipment/:id", requireAuth, async (req, res) => {
    try {
      const ok = await storage.deleteEquipment(+req.params.id);
      ok ? res.status(204).end() : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  // ── Exercise library (free-exercise-db, cached in memory) ─────────────────────
  let exerciseDbCache: any[] | null = null;
  let exerciseDbCacheTime = 0;
  async function getExerciseDb(): Promise<any[]> {
    if (exerciseDbCache && Date.now() - exerciseDbCacheTime < 24 * 60 * 60 * 1000) return exerciseDbCache!;
    const r = await fetch("https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json");
    if (!r.ok) throw new Error("Failed to fetch exercise database");
    exerciseDbCache = await r.json() as any[];
    exerciseDbCacheTime = Date.now();
    return exerciseDbCache!;
  }

  app.get("/api/exercises/search", requireAuth, async (req, res) => {
    try {
      const q = String(req.query.q ?? "").trim().toLowerCase();
      const equipmentFilter = String(req.query.equipment ?? "").trim().toLowerCase();
      const muscle = String(req.query.muscle ?? "").trim().toLowerCase();
      const category = String(req.query.category ?? "").trim().toLowerCase();

      const db = await getExerciseDb();
      let results = db;
      if (q) results = results.filter((e: any) => e.name.toLowerCase().includes(q));
      if (equipmentFilter) results = results.filter((e: any) => (e.equipment ?? "").toLowerCase().includes(equipmentFilter));
      if (muscle) results = results.filter((e: any) =>
        (e.primaryMuscles ?? []).some((m: string) => m.toLowerCase().includes(muscle)) ||
        (e.secondaryMuscles ?? []).some((m: string) => m.toLowerCase().includes(muscle))
      );
      if (category) results = results.filter((e: any) => (e.category ?? "").toLowerCase() === category);

      const response = results.slice(0, 30).map((e: any) => ({
        id: e.id,
        name: e.name,
        equipment: e.equipment,
        primaryMuscles: e.primaryMuscles ?? [],
        secondaryMuscles: e.secondaryMuscles ?? [],
        category: e.category,
        level: e.level,
        force: e.force,
        mechanic: e.mechanic,
        image: e.images?.[0]
          ? `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/${e.images[0]}`
          : null,
        instructions: e.instructions ?? [],
      }));
      res.json(response);
    } catch (e) { handleError(res, e); }
  });

  // ── LDS scriptures proxy (bcbooks/scriptures-json) ───────────────────────────
  const LDS_SERVER_CACHE: Record<string, any[]> = {};
  const LDS_VALID_VOLUMES = new Set(["book-of-mormon", "doctrine-and-covenants", "pearl-of-great-price"]);

  app.get("/api/lds/:volume", requireAuth, async (req, res) => {
    try {
      const vol = req.params.volume;
      if (!LDS_VALID_VOLUMES.has(vol)) return res.status(400).json({ error: "Unknown volume" });
      if (LDS_SERVER_CACHE[vol]) return res.json({ books: LDS_SERVER_CACHE[vol] });
      const r = await fetch(`https://raw.githubusercontent.com/bcbooks/scriptures-json/master/${vol}.json`);
      if (!r.ok) throw new Error(`GitHub returned ${r.status}`);
      const data = await r.json() as any;

      // Different volumes use different top-level shapes; normalise everything
      // to [{ book, chapters: [{ chapter, verses: [{ verse, text }] }] }]
      let books: any[] = [];

      if (Array.isArray(data.books) && data.books.length > 0) {
        // BOM / PGP: { books: [{ book, chapters }] }
        books = data.books;
      } else if (Array.isArray(data.sections) && data.sections.length > 0) {
        // D&C variant A: { sections: [{ section, verses }] }
        books = [{ book: "Doctrine and Covenants", chapters: data.sections.map((s: any) => ({
          chapter: s.section ?? s.chapter ?? s.number,
          verses: s.verses ?? [],
        })) }];
      } else if (Array.isArray(data) && data.length > 0 && data[0].verses) {
        // Flat array of sections/chapters
        books = [{ book: vol.replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()), chapters: data.map((s: any, i: number) => ({
          chapter: s.section ?? s.chapter ?? i + 1,
          verses: s.verses ?? [],
        })) }];
      } else {
        // Last resort: expose raw keys for debugging and return 500
        throw new Error(`Unrecognised JSON shape. Top-level keys: ${Object.keys(data).join(", ")}`);
      }

      LDS_SERVER_CACHE[vol] = books;
      res.json({ books });
    } catch (e) { handleError(res, e); }
  });

  // ── Bhagavad Gita proxy (vedicscriptures.github.io) ──────────────────────────
  const GITA_BASE = "https://vedicscriptures.github.io";
  const GITA_CHAPTER_CACHE: Record<number, any[]> = {};   // chapter → verses[]
  let GITA_CHAPTERS_META: any[] | null = null;

  const GITA_CHAPTER_SIZES: Record<number, number> = {
    1:47,2:72,3:43,4:42,5:29,6:47,7:30,8:28,9:34,10:42,
    11:55,12:20,13:34,14:27,15:20,16:24,17:28,18:78,
  };

  app.get("/api/gita/chapters", requireAuth, async (_req, res) => {
    try {
      if (GITA_CHAPTERS_META) return res.json(GITA_CHAPTERS_META);
      const r = await fetch(`${GITA_BASE}/chapters`);
      if (!r.ok) throw new Error(`VedicScriptures returned ${r.status}`);
      GITA_CHAPTERS_META = await r.json() as any[];
      res.json(GITA_CHAPTERS_META);
    } catch (e) { handleError(res, e); }
  });

  app.get("/api/gita/chapter/:ch", requireAuth, async (req, res) => {
    try {
      const ch = parseInt(req.params.ch);
      if (isNaN(ch) || ch < 1 || ch > 18) return res.status(400).json({ error: "Chapter must be 1–18" });
      if (GITA_CHAPTER_CACHE[ch]) return res.json({ verses: GITA_CHAPTER_CACHE[ch] });

      const count = GITA_CHAPTER_SIZES[ch];
      const verseNums = Array.from({ length: count }, (_, i) => i + 1);
      const results = await Promise.all(
        verseNums.map(sl =>
          fetch(`${GITA_BASE}/slok/${ch}/${sl}`)
            .then(r => r.ok ? r.json() : null)
            .catch(() => null)
        )
      );
      const verses = results.filter(Boolean);
      GITA_CHAPTER_CACHE[ch] = verses;
      res.json({ verses });
    } catch (e) { handleError(res, e); }
  });

  app.get("/api/gita/search", requireAuth, async (req, res) => {
    try {
      const q = String(req.query.q ?? "").trim().toLowerCase();
      if (!q) return res.json({ results: [] });

      // Search across all cached chapters; load any uncached ones on demand
      const allResults: any[] = [];
      for (let ch = 1; ch <= 18; ch++) {
        if (!GITA_CHAPTER_CACHE[ch]) {
          const count = GITA_CHAPTER_SIZES[ch];
          const verseNums = Array.from({ length: count }, (_, i) => i + 1);
          const results = await Promise.all(
            verseNums.map(sl =>
              fetch(`${GITA_BASE}/slok/${ch}/${sl}`)
                .then(r => r.ok ? r.json() : null)
                .catch(() => null)
            )
          );
          GITA_CHAPTER_CACHE[ch] = results.filter(Boolean);
        }
        for (const v of GITA_CHAPTER_CACHE[ch]) {
          const englishText = (v.siva?.et ?? v.purohit?.et ?? v.gambir?.et ?? "").toLowerCase();
          const slokText = (v.slok ?? "").toLowerCase();
          if (englishText.includes(q) || slokText.includes(q)) {
            allResults.push(v);
            if (allResults.length >= 30) break;
          }
        }
        if (allResults.length >= 30) break;
      }
      res.json({ results: allResults });
    } catch (e) { handleError(res, e); }
  });

  // ── Add exercise to a workout template ────────────────────────────────────────
  app.post("/api/workout-templates/:id/add-exercise", requireAuth, async (req, res) => {
    try {
      const templates = await storage.getAllWorkoutTemplates((req.user as User).id);
      const template = templates.find(t => t.id === +req.params.id);
      if (!template) return res.status(404).json({ error: "Template not found" });
      const exercises = JSON.parse(template.exercisesJson ?? "[]");
      exercises.push(req.body);
      const updated = await storage.updateWorkoutTemplate(+req.params.id, { exercisesJson: JSON.stringify(exercises) });
      res.json(updated);
    } catch (e) { handleError(res, e); }
  });

  // ── AI Workout Plan Generation ─────────────────────────────────────────────────
  app.post("/api/workout/generate", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as User).id;
      const enc = await storage.getAnthropicApiKeyEnc(userId);
      if (!enc) return res.status(400).json({ error: "no_api_key", message: "Anthropic API key not configured. Add it in Settings." });
      const apiKey = decrypt(enc);

      const { equipmentList = [], goalsList = [], daysPerWeek = 3, focus = "general fitness", level = "intermediate", additionalNotes = "" } = req.body;
      const equipmentStr = equipmentList.length > 0 ? equipmentList.join(", ") : "bodyweight only (no equipment)";
      const goalsStr = goalsList.length > 0 ? goalsList.join(", ") : "general fitness and health";

      const prompt = `You are an expert personal trainer. Generate a ${daysPerWeek}-day per week workout plan.

AVAILABLE EQUIPMENT: ${equipmentStr}
GOALS: ${goalsStr}
TRAINING LEVEL: ${level}
FOCUS: ${focus}
${additionalNotes ? `ADDITIONAL NOTES: ${additionalNotes}` : ""}

Return ONLY valid JSON (no markdown, no explanation) with this exact structure:
{
  "planName": "descriptive plan name",
  "description": "2-3 sentence overview of the plan and its approach",
  "days": [
    {
      "dayLabel": "Day 1 (Monday)",
      "name": "workout name e.g. Push Day A",
      "workoutType": "full_body|upper|lower|push|pull|legs|cardio|custom",
      "durationEstimate": "45-60 min",
      "exercises": [
        {
          "name": "Exercise Name",
          "type": "Lifting|Run|Bike|Swim|HIIT|Yoga|Stretch|Custom",
          "sets": [{"reps": 8, "weight": 0}, {"reps": 8, "weight": 0}, {"reps": 8, "weight": 0}],
          "restSeconds": 90,
          "notes": "optional coaching tip or form cue"
        }
      ]
    }
  ]
}

Rules:
- For cardio exercises (Run/Bike/Swim), omit "sets" and use "distance": "5 km" and "duration": "30 min" instead
- For yoga/stretch (Yoga/Stretch), omit "sets" and use "duration": "60 min"
- Set weight to 0 for all exercises (user fills in their own weights)
- Only include exercises possible with the listed equipment
- Make it ${level}-level appropriate with progressive structure
- Include exactly ${daysPerWeek} workout days
- Include warm-up and cool-down exercises where appropriate`;

      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 4096, messages: [{ role: "user", content: prompt }] }),
      });
      if (!r.ok) {
        const err = await r.json() as any;
        return res.status(400).json({ error: "anthropic_error", message: err.error?.message ?? "API error" });
      }
      const data = await r.json() as any;
      const text: string = data.content?.[0]?.text ?? "";
      const plan = extractJson(text);
      if (!plan) return res.status(500).json({ error: "parse_error", message: "Could not parse AI response. Try again." });
      res.json(plan);
    } catch (e) {
      if (e instanceof SyntaxError) return res.status(500).json({ error: "parse_error", message: "Could not parse AI response. Try again." });
      handleError(res, e);
    }
  });

  // ── AI Day Planner ────────────────────────────────────────────────────────────
  app.post("/api/ai/day-planner", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as User).id;
      const enc = await storage.getAnthropicApiKeyEnc(userId);
      if (!enc) return res.status(402).json({ error: "no_api_key", message: "Add your Anthropic API key in Settings to use AI features." });
      const apiKey = decrypt(enc);

      // Gather context data
      const [events, goalsWithProjects, generalTasks] = await Promise.all([
        storage.getAllEventsWithTasks(userId),
        storage.getAllGoalsWithProjects(userId),
        storage.getAllGeneralTasks(userId),
      ]);

      const today = new Date();
      const todayStr = today.toISOString().slice(0, 10);
      const in7Days = new Date(today); in7Days.setDate(today.getDate() + 7);
      const in7DaysStr = in7Days.toISOString().slice(0, 10);
      const dayName = today.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

      // Filter today's events
      const todayEvents = events.filter(e => e.date === todayStr);
      const upcomingEvents = events.filter(e => e.date > todayStr && e.date <= in7DaysStr);

      // Active goals + projects with incomplete tasks
      const activeGoals = goalsWithProjects
        .filter(g => g.status !== "completed")
        .map(g => ({
          title: g.title,
          status: g.status,
          projects: g.projects
            .filter(p => p.status !== "completed")
            .map(p => ({
              title: p.title,
              status: p.status,
              tasks: p.tasks.filter(t => !t.completed).map(t => t.title),
            }))
            .filter(p => p.tasks.length > 0),
        }))
        .filter(g => g.projects.length > 0 || g.status === "in_progress");

      // Uncompleted general tasks
      const pendingTasks = generalTasks
        .filter(t => !t.completed)
        .map(t => ({ title: t.title, priority: t.priority ?? "medium", dueDate: t.dueDate ?? null, notes: t.notes ?? null }));

      const prompt = `You are a personal productivity coach. Create a structured, motivating day plan for today: ${dayName}.

TODAY'S CALENDAR EVENTS:
${todayEvents.length > 0
  ? todayEvents.map(e => `- ${e.title}${e.tasks.length > 0 ? ` (${e.tasks.filter(t => !t.completed).length} pending tasks)` : ""}`).join("\n")
  : "- No scheduled events today"}

UPCOMING EVENTS (next 7 days):
${upcomingEvents.length > 0
  ? upcomingEvents.slice(0, 5).map(e => `- ${e.date}: ${e.title}`).join("\n")
  : "- Nothing scheduled soon"}

ACTIVE GOALS & PROJECT TASKS:
${activeGoals.length > 0
  ? activeGoals.map(g => `Goal: ${g.title}\n${g.projects.map(p => `  Project: ${p.title}\n${p.tasks.slice(0, 3).map(t => `    - ${t}`).join("\n")}`).join("\n")}`).join("\n\n")
  : "- No active goals yet"}

PENDING GENERAL TASKS:
${pendingTasks.length > 0
  ? pendingTasks.slice(0, 10).map(t => `- ${t.title}${t.priority === "high" ? " [HIGH PRIORITY]" : ""}${t.dueDate ? ` (due ${t.dueDate})` : ""}`).join("\n")
  : "- No pending tasks"}

Create a practical day plan as JSON. Follow these principles:
1. MORNING (7–11 AM): Front-load 2–4 "quick wins" — tasks completable in ≤30 min that build momentum. Good morning items: small pending tasks, admin, brief habit check-ins.
2. MIDDAY (11 AM–2 PM): Schedule today's calendar events here if they exist. Also the best time for focused deep work on project tasks.
3. AFTERNOON (2–5 PM): Continue project work. Schedule any remaining events. Good for collaborative or medium-effort tasks.
4. EVENING (5–8 PM): Wind-down items only. Light planning, reviewing goals progress, and personal development.

Return ONLY valid JSON (no markdown, no explanation):
{
  "greeting": "A warm, personalized 1-sentence greeting for ${dayName.split(",")[0]}",
  "highlights": "1-2 sentence summary of the day's priorities",
  "blocks": [
    {
      "id": "morning",
      "label": "Morning",
      "timeRange": "7:00 – 11:00 AM",
      "theme": "Quick Wins & Momentum",
      "accent": "amber",
      "items": [
        {
          "title": "task or action title",
          "type": "task|event|goal|habit|planning",
          "duration": "15 min",
          "priority": "high|medium|low",
          "goalLink": "name of related goal if applicable, else null",
          "notes": "brief optional coaching note or tip, else null"
        }
      ]
    },
    { "id": "midday", "label": "Midday", "timeRange": "11:00 AM – 2:00 PM", "theme": "Deep Work", "accent": "blue", "items": [] },
    { "id": "afternoon", "label": "Afternoon", "timeRange": "2:00 – 5:00 PM", "theme": "Sustained Focus", "accent": "violet", "items": [] },
    { "id": "evening", "label": "Evening", "timeRange": "5:00 – 8:00 PM", "theme": "Wind Down & Reflect", "accent": "emerald", "items": [] }
  ],
  "tips": ["One short practical tip", "Another actionable tip"]
}

Rules: Keep items realistic for one day (8–14 items total). Spread items sensibly across blocks. Include today's calendar events in the most appropriate block. Reference real goal/task names from the data above. Keep duration estimates honest (15 min, 30 min, 1 hr, 2 hr).`;

      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 2048, messages: [{ role: "user", content: prompt }] }),
      });
      if (!r.ok) {
        const err = await r.json() as any;
        return res.status(400).json({ error: "anthropic_error", message: err.error?.message ?? "API error" });
      }
      const data = await r.json() as any;
      const text: string = data.content?.[0]?.text ?? "";
      const plan = extractJson(text);
      if (!plan) return res.status(500).json({ error: "parse_error", message: "Could not parse AI response. Try again." });
      res.json(plan);
    } catch (e) {
      if (e instanceof SyntaxError) return res.status(500).json({ error: "parse_error", message: "Could not parse AI response. Try again." });
      handleError(res, e);
    }
  });

  // ── Spots Plan My Day/Weekend ─────────────────────────────────────────────────
  app.post("/api/spots/plan-trip", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const enc = await storage.getAnthropicApiKeyEnc(user.id);
      if (!enc) return res.status(402).json({ error: "no_api_key", message: "Add your Anthropic API key in Settings to use AI features." });
      const apiKey = decrypt(enc);

      const { city, duration, vibe, budget, date, notes } = req.body as {
        city: string; duration: "day" | "weekend"; vibe: string; budget: string; date?: string; notes?: string;
      };

      // Fetch user's saved spots, filter by city if provided
      const allSpots = await storage.getAllSpots(user.id);
      const citySpots = city
        ? allSpots.filter(s => s.city?.toLowerCase().includes(city.toLowerCase()))
        : allSpots;

      const spotsContext = citySpots.length > 0
        ? citySpots.map(s => `- ${s.name} (${s.type}${s.status === 'favorite' || s.isFavorite ? ', ★ favorite' : ''}${s.status === 'visited' ? ', already visited' : ''}${s.address ? ', ' + s.address : ''}${s.notes ? ' — ' + s.notes : ''})`).join('\n')
        : "No saved spots for this city yet.";

      const durationLabel = duration === "day" ? "one-day itinerary" : "weekend itinerary (Saturday + Sunday)";
      const dateLabel = date ? ` starting ${date}` : "";

      const prompt = `You are a local travel expert planning a ${durationLabel}${dateLabel} in ${city || "the user's chosen destination"}.

Vibe: ${vibe}
Budget: ${budget}
${notes ? `Special requests: ${notes}` : ""}

The user's saved spots in this city:
${spotsContext}

Please create a comprehensive plan with two sections:

**SECTION 1: RECOMMENDATIONS**
First, provide 6-10 curated place recommendations. For each, include:
- Name and type (restaurant, attraction, park, etc.)
- Why it fits the ${vibe} vibe
- Price range ($ to $$$$)
- Best time to visit
- 1 must-try tip

Mix the user's saved spots (especially favorites and want-to-visit) with additional AI-researched suggestions. Flag saved spots with ⭐.

**SECTION 2: ITINERARY**
Then write a detailed hour-by-hour itinerary for ${duration === "day" ? "the full day (9am–10pm)" : "Saturday and Sunday (9am–10pm each day)"}.
Format each time block as: **9:00 AM** — Place Name — what to do/eat/see (approx. duration)
Include travel time notes between spots. Group spots logically by neighborhood to minimize travel. Include meals, coffee breaks, and evening plans. Be specific and actionable.

Write in an enthusiastic, friendly tone. Be specific with real place names and practical tips.`;

      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 4096,
          messages: [{ role: "user", content: prompt }]
        }),
      });
      if (!r.ok) {
        const err = await r.json() as any;
        return res.status(400).json({ error: "anthropic_error", message: err.error?.message ?? "API error" });
      }
      const data = await r.json() as any;
      const text: string = data.content?.[0]?.text ?? "";
      res.json({ plan: text });
    } catch (e) { handleError(res, e); }
  });

  // ── AI Trip Planner ───────────────────────────────────────────────────────────
  app.post("/api/ai/trip-planner", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as User).id;
      const enc = await storage.getAnthropicApiKeyEnc(userId);
      if (!enc) return res.status(402).json({ error: "no_api_key", message: "Add your Anthropic API key in Settings to use AI features." });
      const apiKey = decrypt(enc);

      const { tripId, preferences } = req.body as { tripId: number; preferences?: string };

      // Load trip + items
      const [allTrips, tripItems] = await Promise.all([
        storage.getAllTrips(userId),
        storage.getTripItems(tripId),
      ]);
      const trip = allTrips.find(t => t.id === tripId);
      if (!trip) return res.status(404).json({ error: "Trip not found" });

      const destination = trip.destination ?? trip.name;
      const tripName = trip.name;
      const startDate = trip.startDate;
      const endDate   = trip.endDate;
      const tripNotes = trip.notes ?? "";

      const durationDays = startDate && endDate
        ? Math.max(1, Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1)
        : null;

      const existingStops = tripItems.map(i =>
        `- ${i.name}${i.type ? ` (${i.type})` : ""}${i.date ? ` on ${i.date}` : ""}${i.address ? `, ${i.address}` : ""}`
      ).join("\n");

      const maxDays = Math.min(durationDays ?? 3, 5);

      const prompt = `You are an expert travel planner. Return ONLY a raw JSON object — no markdown, no code fences, no explanation, nothing before or after the JSON.

Trip: ${tripName} | Destination: ${destination}${startDate ? ` | Dates: ${startDate}${endDate ? ` to ${endDate}` : ""}` : ""}${durationDays ? ` | ${durationDays} days` : ""}
${tripNotes ? `Context: ${tripNotes}` : ""}${existingStops ? `\nExisting stops: ${existingStops}` : ""}${preferences ? `\nPreferences: ${preferences}` : ""}

Respond with exactly this JSON shape (no extra keys, no comments):
{"overview":"2 sentence trip overview","prep":[{"category":"Bookings","emoji":"📋","items":["item1","item2","item3"]},{"category":"Documents","emoji":"📄","items":["item1","item2"]},{"category":"Health","emoji":"💊","items":["item1","item2"]},{"category":"Money","emoji":"💳","items":["item1","item2"]}],"packing":[{"category":"Clothing","emoji":"👕","items":["item1","item2","item3"]},{"category":"Toiletries","emoji":"🧴","items":["item1","item2"]},{"category":"Tech","emoji":"🔌","items":["item1","item2"]},{"category":"Extras","emoji":"🎒","items":["item1","item2"]}],"recommendations":[{"name":"place name","type":"attraction","emoji":"🏛️","description":"Why visit — 1 sentence.","area":"Neighborhood name","location":"Street address or nearest landmark","tip":"Insider tip"},{"name":"place name","type":"restaurant","emoji":"🍽️","description":"Why visit — 1 sentence.","area":"Neighborhood name","location":"Street address or nearest landmark","tip":"Insider tip"},{"name":"place name","type":"cafe","emoji":"☕","description":"Why visit — 1 sentence.","area":"Neighborhood name","location":"Street address or nearest landmark","tip":"Insider tip"},{"name":"place name","type":"attraction","emoji":"🌿","description":"Why visit — 1 sentence.","area":"Neighborhood name","location":"Street address or nearest landmark","tip":"Insider tip"},{"name":"place name","type":"activity","emoji":"🚶","description":"Why visit — 1 sentence.","area":"Neighborhood name","location":"Street address or nearest landmark","tip":"Insider tip"},{"name":"place name","type":"restaurant","emoji":"🥘","description":"Why visit — 1 sentence.","area":"Neighborhood name","location":"Street address or nearest landmark","tip":"Insider tip"}],"dayByDay":[{"day":1,"label":"Day theme","area":"Neighborhood for the day","highlights":["Morning: activity near landmark","Lunch: restaurant in area","Afternoon: activity, walkable from lunch","Evening: dinner or activity nearby"]}],"budgetTips":["tip1","tip2","tip3"],"localTips":["tip1","tip2","tip3"]}

Fill in ${maxDays} day entries in dayByDay. Group each day geographically — cluster nearby places together to minimize travel. Use real place names for ${destination}. Keep every string value under 15 words. Type must be one of: restaurant, cafe, attraction, hotel, activity, day_trip, neighborhood.`;

      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 6000, messages: [{ role: "user", content: prompt }] }),
      });
      if (!r.ok) {
        const err = await r.json() as any;
        return res.status(400).json({ error: "anthropic_error", message: err.error?.message ?? "API error" });
      }
      const data = await r.json() as any;
      const text: string = data.content?.[0]?.text ?? "";
      console.log("[trip-planner] stop_reason:", data.stop_reason, "| response length:", text.length);
      if (data.stop_reason === "max_tokens") console.warn("[trip-planner] Response truncated — increase max_tokens");
      const parsed = extractJson(text);
      if (!parsed) {
        console.error("[trip-planner] Parse failed. First 300 chars:", text.slice(0, 300));
        return res.status(500).json({ error: "parse_error", message: "Could not parse AI response. Try again." });
      }
      res.json(parsed);
    } catch (e) {
      handleError(res, e);
    }
  });

  // ── AI Trip Chat ───────────────────────────────────────────────────────────────
  app.post("/api/ai/trip-chat", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as User).id;
      const enc = await storage.getAnthropicApiKeyEnc(userId);
      if (!enc) return res.status(402).json({ error: "no_api_key", message: "Add your Anthropic API key in Settings to use AI features." });
      const apiKey = decrypt(enc);

      const { tripId, messages } = req.body as { tripId: number; messages: { role: "user" | "assistant"; content: string }[] };

      const allTrips = await storage.getAllTrips(userId);
      const trip = allTrips.find(t => t.id === tripId);
      if (!trip) return res.status(404).json({ error: "Trip not found" });

      const destination = trip.destination ?? trip.name;
      const system = `You are a knowledgeable, friendly travel planner helping plan a trip to ${destination}. Trip: "${trip.name}"${trip.startDate ? `, ${trip.startDate}${trip.endDate ? ` – ${trip.endDate}` : ""}` : ""}${trip.notes ? `. Context: ${trip.notes}` : ""}. Provide specific, actionable advice. Keep responses concise but helpful (2-4 sentences or a short list). You can suggest specific places, give packing tips, help refine the itinerary, recommend restaurants, warn about things to avoid, and more.`;

      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 600,
          system,
          messages: messages.slice(-10), // keep last 10 messages for context
        }),
      });
      if (!r.ok) {
        const err = await r.json() as any;
        return res.status(400).json({ error: "anthropic_error", message: err.error?.message ?? "API error" });
      }
      const data = await r.json() as any;
      res.json({ reply: data.content?.[0]?.text ?? "" });
    } catch (e) { handleError(res, e); }
  });

  // ── Quotes proxy (DummyJSON + type.fit combined) ──────────────────────────────

  // Normalised quote shape used throughout
  type NormQuote = { id: string; quote: string; author: string };

  let combinedQuotesCache: NormQuote[] = [];
  let combinedQuotesCacheTime = 0;

  async function fetchDummyJsonQuotes(): Promise<NormQuote[]> {
    const PAGE = 150;
    const collected: NormQuote[] = [];
    let skip = 0;
    let total = Infinity;
    while (collected.length < total) {
      const r = await fetch(`https://dummyjson.com/quotes?limit=${PAGE}&skip=${skip}`);
      if (!r.ok) break;
      const data = await r.json() as { quotes: { id: number; quote: string; author: string }[]; total: number };
      total = data.total ?? 0;
      for (const q of data.quotes ?? []) {
        collected.push({ id: `dj-${q.id}`, quote: q.quote, author: q.author });
      }
      if ((data.quotes?.length ?? 0) < PAGE) break;
      skip += PAGE;
    }
    return collected;
  }

  async function fetchTypeFitQuotes(): Promise<NormQuote[]> {
    const r = await fetch("https://type.fit/api/quotes");
    if (!r.ok) return [];
    const data = await r.json() as { text: string; author: string | null }[];
    return (data ?? [])
      .filter(q => q.text?.trim())
      .map((q, i) => ({
        id: `tf-${i}`,
        quote: q.text.trim(),
        author: (q.author ?? "Unknown").replace(", type.fit", "").trim() || "Unknown",
      }));
  }

  async function getAllQuotes(): Promise<NormQuote[]> {
    const now = Date.now();
    if (combinedQuotesCache.length > 0 && now - combinedQuotesCacheTime < 24 * 60 * 60 * 1000) {
      return combinedQuotesCache;
    }
    // Fetch both sources in parallel
    const [djQuotes, tfQuotes] = await Promise.allSettled([fetchDummyJsonQuotes(), fetchTypeFitQuotes()]);
    const dj = djQuotes.status === "fulfilled" ? djQuotes.value : [];
    const tf = tfQuotes.status === "fulfilled" ? tfQuotes.value : [];

    // Deduplicate by normalised quote text (first 60 chars, lowercased)
    const seen = new Set<string>();
    const merged: NormQuote[] = [];
    for (const q of [...dj, ...tf]) {
      const key = q.quote.toLowerCase().slice(0, 60).replace(/\s+/g, " ").trim();
      if (!seen.has(key)) { seen.add(key); merged.push(q); }
    }
    if (merged.length > 0) {
      combinedQuotesCache = merged;
      combinedQuotesCacheTime = now;
    }
    return combinedQuotesCache;
  }

  // Predefined topic buckets
  const QUOTE_TOPICS = [
    { name: "Inspiration",   keywords: ["inspir", "dream", "believe", "possibl", "hope", "courag"] },
    { name: "Motivation",    keywords: ["motivat", "success", "work hard", "goal", "achiev", "effort", "persist"] },
    { name: "Wisdom",        keywords: ["wisdom", "knowledge", "learn", "truth", "mind", "understand", "exper"] },
    { name: "Happiness",     keywords: ["happi", "joy", "smile", "laugh", "content", "gratit", "peace"] },
    { name: "Life",          keywords: ["life ", "living", "live ", "exist", "journey", "moment", "time"] },
    { name: "Love",          keywords: ["love", "heart", "romance", "affection", "caring", "tender", "passion"] },
    { name: "Friendship",    keywords: ["friend", "companion", "loyal", "trust", "bond", "togeth"] },
    { name: "Change",        keywords: ["change", "growth", "transform", "adapt", "evolv", "new begin"] },
    { name: "Philosophy",    keywords: ["philosoph", "meaning", "purpose", "soul", "exist", "virtue", "moral"] },
    { name: "Humor",         keywords: ["humor", "funny", "laugh", "joke", "wit", "comic"] },
    { name: "Perseverance",  keywords: ["persever", "never give up", "keep going", "resili", "endure", "determin"] },
    { name: "Nature",        keywords: ["nature", "earth", "sky", "ocean", "tree", "mountain", "flower", "sun"] },
  ];

  function toApiQuote(q: NormQuote, tags: string[] = []) {
    return { _id: q.id, content: q.quote, author: q.author, tags };
  }

  app.get("/api/quotable/random", requireAuth, async (req, res) => {
    try {
      const limit = Math.min(parseInt(String(req.query.limit ?? "8")), 30);
      if (combinedQuotesCache.length > 0) {
        const shuffled = [...combinedQuotesCache].sort(() => Math.random() - 0.5);
        return res.json(shuffled.slice(0, limit).map(q => toApiQuote(q)));
      }
      // Cache not ready — fetch random from DummyJSON while cache builds in background
      const calls = Array.from({ length: limit }, () => fetch("https://dummyjson.com/quotes/random"));
      const jsons = await Promise.all((await Promise.all(calls)).map(r => r.json() as Promise<{ id: number; quote: string; author: string }>));
      res.json(jsons.map(q => toApiQuote({ id: `dj-${q.id}`, quote: q.quote, author: q.author })));
      getAllQuotes().catch(() => {}); // prime cache in background
    } catch (e) { handleError(res, e); }
  });

  app.get("/api/quotable/search", requireAuth, async (req, res) => {
    try {
      const query = String(req.query.query ?? "").toLowerCase().trim();
      if (!query) return res.json([]);
      const quotes = await getAllQuotes();
      const hits = quotes
        .filter(q => q.quote.toLowerCase().includes(query) || q.author.toLowerCase().includes(query))
        .slice(0, 30);
      res.json(hits.map(q => toApiQuote(q)));
    } catch (e) { handleError(res, e); }
  });

  app.get("/api/quotable/topics", requireAuth, async (_req, res) => {
    try {
      const quotes = await getAllQuotes();
      const topics = QUOTE_TOPICS.map(t => ({
        _id: t.name, name: t.name,
        quoteCount: quotes.filter(q => t.keywords.some(kw => q.quote.toLowerCase().includes(kw))).length,
      }));
      res.json(topics.sort((a, b) => b.quoteCount - a.quoteCount));
    } catch (e) { handleError(res, e); }
  });

  app.get("/api/quotable/by-topic", requireAuth, async (req, res) => {
    try {
      const topic = String(req.query.topic ?? "").trim();
      if (!topic) return res.json([]);
      const bucket = QUOTE_TOPICS.find(t => t.name.toLowerCase() === topic.toLowerCase());
      const quotes = await getAllQuotes();
      const filtered = bucket
        ? quotes.filter(q => bucket.keywords.some(kw => q.quote.toLowerCase().includes(kw)))
        : quotes.filter(q => q.quote.toLowerCase().includes(topic.toLowerCase()));
      const shuffled = [...filtered].sort(() => Math.random() - 0.5).slice(0, 30);
      res.json(shuffled.map(q => toApiQuote(q, [topic.toLowerCase()])));
    } catch (e) { handleError(res, e); }
  });

  // ── Friends ───────────────────────────────────────────────────────────────────

  app.get("/api/users/search", requireAuth, async (req, res) => {
    try {
      const q = String(req.query.q ?? "").trim();
      if (!q) return res.json([]);
      const userId = (req.user as User).id;
      const results = await storage.searchUsers(q, userId);
      // Attach relationship status for each result
      const { incoming, outgoing } = await storage.getFriendRequests(userId);
      const friends = await storage.getFriends(userId);
      const friendIds = new Set(friends.map((f) => f.id));
      const incomingIds = new Set(incoming.map((r) => r.otherUser.id));
      const outgoingIds = new Set(outgoing.map((r) => r.otherUser.id));
      const incomingReqIds = new Map(incoming.map((r) => [r.otherUser.id, r.id]));
      const enriched = results.map((u) => ({
        ...u,
        relationshipStatus: friendIds.has(u.id) ? "friends"
          : incomingIds.has(u.id) ? "incoming"
          : outgoingIds.has(u.id) ? "outgoing_pending"
          : "none",
        incomingRequestId: incomingReqIds.get(u.id) ?? null,
      }));
      res.json(enriched);
    } catch (e) { handleError(res, e); }
  });

  app.get("/api/friend-requests/count", requireAuth, async (req, res) => {
    try {
      const count = await storage.getPendingIncomingCount((req.user as User).id);
      res.json({ count });
    } catch (e) { handleError(res, e); }
  });

  app.get("/api/friend-requests", requireAuth, async (req, res) => {
    try {
      res.json(await storage.getFriendRequests((req.user as User).id));
    } catch (e) { handleError(res, e); }
  });

  app.post("/api/friend-requests", requireAuth, async (req, res) => {
    try {
      const { toUserId } = req.body;
      if (!toUserId) return res.status(400).json({ error: "toUserId required" });
      const fromUserId = (req.user as User).id;
      if (fromUserId === toUserId) return res.status(400).json({ error: "Cannot friend yourself" });
      const req_ = await storage.sendFriendRequest(fromUserId, Number(toUserId));
      res.status(201).json(req_);
    } catch (e) { handleError(res, e); }
  });

  app.patch("/api/friend-requests/:id", requireAuth, async (req, res) => {
    try {
      const { status } = req.body;
      if (status !== "accepted" && status !== "declined") return res.status(400).json({ error: "status must be accepted or declined" });
      const updated = await storage.respondFriendRequest(+req.params.id, status, (req.user as User).id);
      if (!updated) return res.status(404).json({ error: "Not found or not authorized" });
      res.json(updated);
    } catch (e) { handleError(res, e); }
  });

  app.delete("/api/friend-requests/:id", requireAuth, async (req, res) => {
    try {
      const ok = await storage.cancelFriendRequest(+req.params.id, (req.user as User).id);
      ok ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  app.get("/api/friends", requireAuth, async (req, res) => {
    try {
      res.json(await storage.getFriends((req.user as User).id));
    } catch (e) { handleError(res, e); }
  });

  app.delete("/api/friends/:friendId", requireAuth, async (req, res) => {
    try {
      const ok = await storage.unfriend((req.user as User).id, +req.params.friendId);
      ok ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  app.get("/api/friends/enriched", requireAuth, async (req, res) => {
    try {
      const data = await storage.getFriendsEnriched((req.user as User).id);
      res.json(data);
    } catch (e) { handleError(res, e); }
  });

  // ── Unified Recommendations Inbox ─────────────────────────────────────────────

  app.get("/api/recommendations/inbox", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as User).id;
      const filterType = String(req.query.type ?? "all");
      const items = await storage.getRecommendationsInbox(userId, filterType);
      res.json(items);
    } catch (e) { handleError(res, e); }
  });

  app.patch("/api/recommendations/:type/:id/read", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as User).id;
      await storage.markRecommendationRead(userId, req.params.type, +req.params.id);
      res.json({ ok: true });
    } catch (e) { handleError(res, e); }
  });

  app.post("/api/recommendations/:type/:id/add", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as User).id;
      const result = await storage.addRecommendationToCollection(userId, req.params.type, +req.params.id);
      res.status(201).json(result);
    } catch (e) { handleError(res, e); }
  });

  app.post("/api/recommendations/send", requireAuth, async (req, res) => {
    try {
      const fromUserId = (req.user as User).id;
      const { toUserId, type, title, subtitle, imageUrl, note } = req.body;
      if (!toUserId || !type || !title) return res.status(400).json({ error: "toUserId, type, title required" });
      // Verify friendship
      const friends = await storage.getFriends(fromUserId);
      if (!friends.find(f => f.id === toUserId)) return res.status(403).json({ error: "Not friends" });
      const result = await storage.sendUnifiedRecommendation(fromUserId, toUserId, type, { title, subtitle, imageUrl, note });
      res.status(201).json(result);
    } catch (e) { handleError(res, e); }
  });

  app.get("/api/profile/:userId/match", requireAuth, async (req, res) => {
    try {
      const viewerId = (req.user as User).id;
      const targetId = +req.params.userId;
      const data = await storage.getProfileTasteMatch(viewerId, targetId);
      res.json(data);
    } catch (e) { handleError(res, e); }
  });

  // ── Book Recommendations ──────────────────────────────────────────────────────
  app.get("/api/book-recommendations", requireAuth, async (req, res) => {
    try {
      res.json(await storage.getBookRecommendations((req.user as User).id));
    } catch (e) { handleError(res, e); }
  });

  app.post("/api/book-recommendations", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as User).id;
      const { toUserId, bookTitle, bookAuthor, coverUrl, notes } = req.body;
      if (!toUserId || !bookTitle) return res.status(400).json({ error: "toUserId and bookTitle required" });
      const rec = await storage.sendBookRecommendation({
        fromUserId: userId,
        toUserId,
        bookTitle,
        bookAuthor: bookAuthor || null,
        coverUrl: coverUrl || null,
        notes: notes || null,
        createdAt: new Date().toISOString(),
        isDismissed: false,
      });
      res.status(201).json(rec);
    } catch (e) { handleError(res, e); }
  });

  app.patch("/api/book-recommendations/:id/dismiss", requireAuth, async (req, res) => {
    try {
      const ok = await storage.dismissBookRecommendation(+req.params.id, (req.user as User).id);
      ok ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  app.delete("/api/book-recommendations/:id", requireAuth, async (req, res) => {
    try {
      const ok = await storage.deleteBookRecommendation(+req.params.id, (req.user as User).id);
      ok ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  // ── Recipe Shares ─────────────────────────────────────────────────────────────
  app.get("/api/recipe-shares", requireAuth, async (req, res) => {
    try {
      res.json(await storage.getRecipeShares((req.user as User).id));
    } catch (e) { handleError(res, e); }
  });

  app.post("/api/recipe-shares", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as User).id;
      const { toUserId, recipeName, recipeEmoji, recipeCategory, recipeComponentType,
              recipePrepTime, recipeCookTime, recipeServings, recipeIngredients,
              recipeInstructions, recipeImageUrl, notes } = req.body;
      if (!toUserId || !recipeName) return res.status(400).json({ error: "toUserId and recipeName required" });
      const share = await storage.sendRecipeShare({
        fromUserId: userId, toUserId,
        recipeName, recipeEmoji: recipeEmoji || "🍽️",
        recipeCategory: recipeCategory || null,
        recipeComponentType: recipeComponentType || null,
        recipePrepTime: recipePrepTime || null,
        recipeCookTime: recipeCookTime || null,
        recipeServings: recipeServings || null,
        recipeIngredients: recipeIngredients || "[]",
        recipeInstructions: recipeInstructions || null,
        recipeImageUrl: recipeImageUrl || null,
        notes: notes || null,
        createdAt: new Date().toISOString(),
        isDismissed: false,
      });
      res.status(201).json(share);
    } catch (e) { handleError(res, e); }
  });

  app.patch("/api/recipe-shares/:id/dismiss", requireAuth, async (req, res) => {
    try {
      const ok = await storage.dismissRecipeShare(+req.params.id, (req.user as User).id);
      ok ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  app.delete("/api/recipe-shares/:id", requireAuth, async (req, res) => {
    try {
      const ok = await storage.deleteRecipeShare(+req.params.id, (req.user as User).id);
      ok ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  // ── Music Recommendations ─────────────────────────────────────────────────────
  app.get("/api/music-recommendations", requireAuth, async (req, res) => {
    try {
      res.json(await storage.getMusicRecommendations((req.user as User).id));
    } catch (e) { handleError(res, e); }
  });

  app.post("/api/music-recommendations", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as User).id;
      const { toUserId, type, artistName, songTitle, notes } = req.body;
      if (!toUserId || !artistName || !type) return res.status(400).json({ error: "toUserId, type, and artistName required" });
      const rec = await storage.sendMusicRecommendation({
        fromUserId: userId,
        toUserId,
        type,
        artistName,
        songTitle: songTitle || null,
        notes: notes || null,
        createdAt: new Date().toISOString(),
        isDismissed: false,
      });
      res.status(201).json(rec);
    } catch (e) { handleError(res, e); }
  });

  app.patch("/api/music-recommendations/:id/dismiss", requireAuth, async (req, res) => {
    try {
      const ok = await storage.dismissMusicRecommendation(+req.params.id, (req.user as User).id);
      ok ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  app.delete("/api/music-recommendations/:id", requireAuth, async (req, res) => {
    try {
      const ok = await storage.deleteMusicRecommendation(+req.params.id, (req.user as User).id);
      ok ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  // ── Quote Shares ──────────────────────────────────────────────────────────────
  app.get("/api/quote-shares", requireAuth, async (req, res) => {
    try {
      res.json(await storage.getQuoteShares((req.user as User).id));
    } catch (e) { handleError(res, e); }
  });

  app.post("/api/quote-shares", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as User).id;
      const data = {
        fromUserId: userId,
        toUserId: req.body.toUserId,
        text: req.body.text,
        author: req.body.author ?? null,
        source: req.body.source ?? null,
        category: req.body.category ?? null,
        tags: req.body.tags ?? null,
        quoteNotes: req.body.quoteNotes ?? null,
        notes: req.body.notes ?? null,
        createdAt: new Date().toISOString(),
      };
      res.status(201).json(await storage.sendQuoteShare(data));
    } catch (e) { handleError(res, e); }
  });

  app.patch("/api/quote-shares/:id/dismiss", requireAuth, async (req, res) => {
    try {
      const ok = await storage.dismissQuoteShare(+req.params.id, (req.user as User).id);
      ok ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  app.delete("/api/quote-shares/:id", requireAuth, async (req, res) => {
    try {
      const ok = await storage.deleteQuoteShare(+req.params.id, (req.user as User).id);
      ok ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  // ── Art Shares ────────────────────────────────────────────────────────────────
  app.get("/api/art-shares", requireAuth, async (req, res) => {
    try {
      res.json(await storage.getArtShares((req.user as User).id));
    } catch (e) { handleError(res, e); }
  });

  app.post("/api/art-shares", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as User).id;
      const data = {
        fromUserId: userId,
        toUserId: req.body.toUserId,
        title: req.body.title,
        artistName: req.body.artistName ?? null,
        yearCreated: req.body.yearCreated ?? null,
        medium: req.body.medium ?? null,
        movement: req.body.movement ?? null,
        whereViewed: req.body.whereViewed ?? null,
        city: req.body.city ?? null,
        accentColor: req.body.accentColor ?? null,
        imageUrl: req.body.imageUrl ?? null,
        artNotes: req.body.artNotes ?? null,
        notes: req.body.notes ?? null,
        createdAt: new Date().toISOString(),
      };
      res.status(201).json(await storage.sendArtShare(data));
    } catch (e) { handleError(res, e); }
  });

  app.patch("/api/art-shares/:id/dismiss", requireAuth, async (req, res) => {
    try {
      const ok = await storage.dismissArtShare(+req.params.id, (req.user as User).id);
      ok ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  app.delete("/api/art-shares/:id", requireAuth, async (req, res) => {
    try {
      const ok = await storage.deleteArtShare(+req.params.id, (req.user as User).id);
      ok ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  // ── Spot Shares ───────────────────────────────────────────────────────────────
  app.get("/api/spot-shares", requireAuth, async (req, res) => {
    try {
      res.json(await storage.getSpotShares((req.user as User).id));
    } catch (e) { handleError(res, e); }
  });

  app.post("/api/spot-shares", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as User).id;
      const data = {
        fromUserId: userId,
        toUserId: req.body.toUserId,
        name: req.body.name,
        type: req.body.type ?? "restaurant",
        address: req.body.address ?? null,
        neighborhood: req.body.neighborhood ?? null,
        city: req.body.city ?? null,
        website: req.body.website ?? null,
        priceRange: req.body.priceRange ?? null,
        tags: req.body.tags ?? null,
        openingHours: req.body.openingHours ?? null,
        rating: req.body.rating ?? null,
        spotNotes: req.body.spotNotes ?? null,
        notes: req.body.notes ?? null,
        createdAt: new Date().toISOString(),
      };
      res.status(201).json(await storage.sendSpotShare(data));
    } catch (e) { handleError(res, e); }
  });

  app.patch("/api/spot-shares/:id/dismiss", requireAuth, async (req, res) => {
    try {
      const ok = await storage.dismissSpotShare(+req.params.id, (req.user as User).id);
      ok ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  app.delete("/api/spot-shares/:id", requireAuth, async (req, res) => {
    try {
      const ok = await storage.deleteSpotShare(+req.params.id, (req.user as User).id);
      ok ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  // ── Movie Shares ──────────────────────────────────────────────────────────────
  app.get("/api/movie-shares", requireAuth, async (req, res) => {
    try {
      res.json(await storage.getMovieShares((req.user as User).id));
    } catch (e) { handleError(res, e); }
  });

  app.post("/api/movie-shares", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as User).id;
      const data = {
        fromUserId: userId,
        toUserId: req.body.toUserId,
        mediaType: req.body.mediaType ?? "movie",
        title: req.body.title,
        year: req.body.year ?? null,
        director: req.body.director ?? null,
        genres: req.body.genres ?? null,
        streamingOn: req.body.streamingOn ?? null,
        posterColor: req.body.posterColor ?? null,
        posterUrl: req.body.posterUrl ?? null,
        notes: req.body.notes ?? null,
        createdAt: new Date().toISOString(),
      };
      res.status(201).json(await storage.sendMovieShare(data));
    } catch (e) { handleError(res, e); }
  });

  app.patch("/api/movie-shares/:id/dismiss", requireAuth, async (req, res) => {
    try {
      const ok = await storage.dismissMovieShare(+req.params.id, (req.user as User).id);
      ok ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  app.delete("/api/movie-shares/:id", requireAuth, async (req, res) => {
    try {
      const ok = await storage.deleteMovieShare(+req.params.id, (req.user as User).id);
      ok ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  // ── Shares: unified unread count ──────────────────────────────────────────────
  app.get("/api/shares/count", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as User).id;
      const counts = await storage.getUnreadSharesCount(userId);
      res.json(counts);
    } catch (e) {
      console.error("[shares/count error]", e);
      handleError(res, e);
    }
  });

  app.post("/api/shares/mark-read", requireAuth, async (req, res) => {
    try {
      const { type } = req.body as { type: string };
      await storage.markSharesRead(type, (req.user as User).id);
      res.json({ ok: true });
    } catch (e) { handleError(res, e); }
  });

  // ── Children ──────────────────────────────────────────────────────────────────
  app.get("/api/children", requireAuth, async (req, res) => {
    try {
      const uid = await storage.getTabUserId((req.user as User).id, "kids");
      res.json(await storage.getAllChildrenWithDetails(uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/children", requireAuth, async (req, res) => {
    try {
      const uid = await storage.getTabUserId((req.user as User).id, "kids");
      const data = insertChildSchema.parse({ ...req.body, userId: uid });
      res.status(201).json(await storage.createChild(data, uid));
    } catch (e) { handleError(res, e); }
  });
  app.patch("/api/children/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateChild(+req.params.id, req.body);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/children/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deleteChild(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  // Child Milestones
  app.post("/api/children/:childId/milestones", requireAuth, async (req, res) => {
    try {
      const uid = await storage.getTabUserId((req.user as User).id, "kids");
      const data = insertChildMilestoneSchema.parse({ ...req.body, childId: +req.params.childId, userId: uid });
      res.status(201).json(await storage.createChildMilestone(data, uid));
    } catch (e) { handleError(res, e); }
  });
  app.patch("/api/child-milestones/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateChildMilestone(+req.params.id, req.body);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/child-milestones/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deleteChildMilestone(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  // Child Memories
  app.post("/api/children/:childId/memories", requireAuth, async (req, res) => {
    try {
      const uid = await storage.getTabUserId((req.user as User).id, "kids");
      const data = insertChildMemorySchema.parse({ ...req.body, childId: +req.params.childId, userId: uid });
      res.status(201).json(await storage.createChildMemory(data, uid));
    } catch (e) { handleError(res, e); }
  });
  app.patch("/api/child-memories/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateChildMemory(+req.params.id, req.body);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/child-memories/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deleteChildMemory(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  // Child Prep Items
  app.post("/api/children/:childId/prep-items", requireAuth, async (req, res) => {
    try {
      const uid = await storage.getTabUserId((req.user as User).id, "kids");
      const data = insertChildPrepItemSchema.parse({ ...req.body, childId: +req.params.childId, userId: uid });
      res.status(201).json(await storage.createChildPrepItem(data, uid));
    } catch (e) { handleError(res, e); }
  });
  app.patch("/api/child-prep-items/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateChildPrepItem(+req.params.id, req.body);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/child-prep-items/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deleteChildPrepItem(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  // ── Quotes ────────────────────────────────────────────────────────────────────
  app.get("/api/quotes", requireAuth, async (req, res) => {
    try { res.json(await storage.getAllQuotes((req.user as User).id)); } catch (e) { handleError(res, e); }
  });
  app.post("/api/quotes", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const data = insertQuoteSchema.parse({ ...req.body, userId: uid });
      const quote = await storage.createQuote(data, uid);
      logActivity(uid, "quote_added", quote.id, "quote", quote.text.slice(0, 100), null, quote.author ?? null);
      res.status(201).json(quote);
    } catch (e) { handleError(res, e); }
  });
  app.patch("/api/quotes/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateQuote(+req.params.id, req.body);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/quotes/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deleteQuote(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  // ── Mantras ───────────────────────────────────────────────────────────────────
  app.get("/api/mantras", requireAuth, async (req, res) => {
    try { res.json(await storage.getAllMantras((req.user as User).id)); } catch (e) { handleError(res, e); }
  });
  app.post("/api/mantras", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const data = insertMantraSchema.parse({ ...req.body, userId: uid });
      res.status(201).json(await storage.createMantra(data, uid));
    } catch (e) { handleError(res, e); }
  });
  app.patch("/api/mantras/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateMantra(+req.params.id, req.body);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/mantras/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deleteMantra(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  // ── Art Pieces ────────────────────────────────────────────────────────────────
  app.get("/api/art", requireAuth, async (req, res) => {
    try { res.json(await storage.getAllArtPieces((req.user as User).id)); } catch (e) { handleError(res, e); }
  });
  app.post("/api/art", requireAuth, async (req, res) => {
    try {
      const data = insertArtPieceSchema.parse({ ...req.body, userId: (req.user as User).id });
      res.status(201).json(await storage.createArtPiece(data, (req.user as User).id));
    } catch (e) { handleError(res, e); }
  });
  app.patch("/api/art/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateArtPiece(+req.params.id, req.body);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/art/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deleteArtPiece(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  // ── Journal ──────────────────────────────────────────────────────────────────
  app.get("/api/journal", requireAuth, async (req, res) => {
    const entries = await storage.getJournalEntries(req.user!.id);
    res.json(entries);
  });
  app.post("/api/journal", requireAuth, async (req, res) => {
    const entry = await storage.createJournalEntry(req.body, req.user!.id);
    res.json(entry);
  });
  app.patch("/api/journal/:id", requireAuth, async (req, res) => {
    const entry = await storage.updateJournalEntry(Number(req.params.id), req.body);
    if (!entry) return res.status(404).json({ error: "Not found" });
    res.json(entry);
  });
  app.delete("/api/journal/:id", requireAuth, async (req, res) => {
    await storage.deleteJournalEntry(Number(req.params.id));
    res.json({ ok: true });
  });

  // ── Open Library Book Search Proxy ───────────────────────────────────────────
  // Uses Open Library (openlibrary.org) — no API key required, no rate limits
  app.get("/api/gbooks/search", requireAuth, async (req, res) => {
    try {
      const query = String(req.query.q || "").trim();
      if (!query) return res.status(400).json({ error: "q is required" });

      // Try Open Library first (10 s timeout)
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      try {
        const fields = "key,title,author_name,first_publish_year,number_of_pages_median,subject,cover_i,isbn";
        const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=20&fields=${fields}`;
        const olRes = await fetch(url, {
          signal: controller.signal,
          headers: { "User-Agent": "MyLifos/1.0 (contact@mylifos.app)" },
        });
        clearTimeout(timer);
        if (!olRes.ok) throw new Error(`Open Library returned ${olRes.status}`);
        const data = await olRes.json() as any;
        // Normalize to the GBVolume shape the client consumes
        const items = (data.docs ?? []).map((doc: any) => ({
          id: doc.key ?? doc.isbn?.[0] ?? Math.random().toString(),
          volumeInfo: {
            title: doc.title ?? "Unknown Title",
            authors: doc.author_name ?? [],
            publishedDate: doc.first_publish_year ? String(doc.first_publish_year) : undefined,
            pageCount: doc.number_of_pages_median ?? undefined,
            categories: doc.subject ? [doc.subject[0]] : undefined,
            imageLinks: doc.cover_i ? {
              thumbnail: `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`,
            } : undefined,
          },
        }));
        return res.json(items);
      } catch (olErr: any) {
        clearTimeout(timer);
        const reason = olErr?.name === "AbortError" ? "timeout" : String(olErr?.message ?? olErr);
        console.warn(`[gbooks/search] Open Library failed (${reason}), falling back to Google Books`);
      }

      // Fallback: unauthenticated Google Books (free tier, ~100 req/day from a single IP)
      const gbUrl = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=20&printType=books`;
      const gbRes = await fetch(gbUrl, { headers: { "User-Agent": "MyLifos/1.0" } });
      if (!gbRes.ok) {
        console.error(`[gbooks/search] Google Books fallback also failed: ${gbRes.status}`);
        return res.status(503).json({ error: "Book search temporarily unavailable" });
      }
      const gbData = await gbRes.json() as any;
      const gbItems = (gbData.items ?? []).map((v: any) => ({
        id: v.id,
        volumeInfo: {
          title: v.volumeInfo?.title ?? "Unknown Title",
          authors: v.volumeInfo?.authors ?? [],
          publishedDate: v.volumeInfo?.publishedDate,
          pageCount: v.volumeInfo?.pageCount,
          categories: v.volumeInfo?.categories,
          imageLinks: v.volumeInfo?.imageLinks ? {
            thumbnail: (v.volumeInfo.imageLinks.thumbnail ?? v.volumeInfo.imageLinks.smallThumbnail ?? "").replace(/^http:\/\//, "https://"),
          } : undefined,
        },
      }));
      res.json(gbItems);
    } catch (e) { handleError(res, e); }
  });

  // ── Book search diagnostic ────────────────────────────────────────────────────
  app.get("/api/debug/book-search", requireAuth, async (req, res) => {
    const results: Record<string, any> = {};
    // Test Open Library
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8_000);
      const r = await fetch("https://openlibrary.org/search.json?q=bible&limit=1&fields=title", { signal: ctrl.signal });
      clearTimeout(t);
      results.openLibrary = { status: r.status, ok: r.ok };
    } catch (e: any) {
      results.openLibrary = { error: e?.name === "AbortError" ? "timeout" : String(e?.message ?? e) };
    }
    // Test Google Books
    try {
      const r = await fetch("https://www.googleapis.com/books/v1/volumes?q=bible&maxResults=1");
      results.googleBooks = { status: r.status, ok: r.ok };
    } catch (e: any) {
      results.googleBooks = { error: String(e?.message ?? e) };
    }
    // Node version
    results.nodeVersion = process.version;
    results.fetchExists = typeof fetch !== "undefined";
    res.json(results);
  });

  // ── TMDB Proxy ───────────────────────────────────────────────────────────────
  // Temporary debug endpoint – remove after confirming env vars work
  app.get("/api/debug/env-check", (req, res) => {
    const allKeys = Object.keys(process.env).sort();
    res.json({
      TMDB_API_KEY: process.env.TMDB_API_KEY ? `set (${process.env.TMDB_API_KEY.length} chars)` : "NOT SET",
      LASTFM_API_KEY: process.env.LASTFM_API_KEY ? `set (${process.env.LASTFM_API_KEY.length} chars)` : "NOT SET",
      NODE_ENV: process.env.NODE_ENV ?? "not set",
      allEnvKeys: allKeys,
    });
  });

  // ── Last.fm proxy ─────────────────────────────────────────────────────────────
  app.get("/api/lastfm/search", requireAuth, async (req, res) => {
    try {
      const apiKey = process.env.LASTFM_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "LASTFM_API_KEY not configured" });
      const q = String(req.query.q || "").trim();
      const type = String(req.query.type || "artist"); // "artist" | "track"
      if (!q) return res.status(400).json({ error: "q is required" });
      const method = type === "track" ? "track.search" : "artist.search";
      const param = type === "track" ? `track=${encodeURIComponent(q)}` : `artist=${encodeURIComponent(q)}`;
      const url = `https://ws.audioscrobbler.com/2.0/?method=${method}&${param}&api_key=${apiKey}&format=json&limit=20`;
      const r = await fetch(url);
      if (!r.ok) return res.status(r.status).json({ error: "Last.fm error" });
      const data = await r.json() as any;
      const results = type === "track"
        ? (data.results?.trackmatches?.track ?? [])
        : (data.results?.artistmatches?.artist ?? []);
      res.json(Array.isArray(results) ? results : [results]);
    } catch (e) { handleError(res, e); }
  });

  // ── YouTube video search ──────────────────────────────────────────────────────

  app.get("/api/youtube/search", requireAuth, async (req, res) => {
    try {
      const apiKey = process.env.YOUTUBE_API_KEY;
      if (!apiKey) return res.status(503).json({ error: "YOUTUBE_API_KEY not configured" });
      const q = String(req.query.q ?? "").trim();
      if (!q) return res.json([]);
      const maxResults = Math.min(20, parseInt(String(req.query.maxResults ?? "12")) || 12);
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=video&maxResults=${maxResults}&key=${apiKey}`;
      const r = await fetch(url);
      if (!r.ok) return res.status(r.status).json({ error: "YouTube API error" });
      const d = await r.json() as any;
      const items = (d.items ?? []).map((item: any) => ({
        videoId: item.id?.videoId,
        title: item.snippet?.title,
        channel: item.snippet?.channelTitle,
        thumbnail: item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url,
      })).filter((i: any) => i.videoId);
      res.json(items);
    } catch (e) { handleError(res, e); }
  });

  // ── Last.fm artist info + top tracks ─────────────────────────────────────────

  app.get("/api/lastfm/artist-info", requireAuth, async (req, res) => {
    try {
      const apiKey = process.env.LASTFM_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "LASTFM_API_KEY not configured" });
      const artist = String(req.query.artist ?? "").trim();
      if (!artist) return res.status(400).json({ error: "artist is required" });
      const [infoRes, tracksRes] = await Promise.all([
        fetch(`https://ws.audioscrobbler.com/2.0/?method=artist.getInfo&artist=${encodeURIComponent(artist)}&api_key=${apiKey}&format=json&autocorrect=1`),
        fetch(`https://ws.audioscrobbler.com/2.0/?method=artist.getTopTracks&artist=${encodeURIComponent(artist)}&api_key=${apiKey}&format=json&autocorrect=1&limit=10`),
      ]);
      const [info, tracks] = await Promise.all([infoRes.json() as any, tracksRes.json() as any]);
      const a = info.artist;
      if (!a) return res.status(404).json({ error: "Artist not found" });
      const similar = (a.similar?.artist ?? []).slice(0, 6).map((s: any) => ({ name: s.name, imageUrl: s.image?.find((i: any) => i.size === "medium")?.["#text"] || null }));
      const tags = (a.tags?.tag ?? []).slice(0, 8).map((t: any) => t.name);
      const topTracks = (tracks.toptracks?.track ?? []).slice(0, 10).map((t: any) => ({
        name: t.name,
        playcount: parseInt(t.playcount ?? "0"),
        listeners: parseInt(t.listeners ?? "0"),
        url: t.url,
      }));
      res.json({
        name: a.name,
        listeners: parseInt(a.stats?.listeners ?? "0"),
        playcount: parseInt(a.stats?.playcount ?? "0"),
        imageUrl: a.image?.find((i: any) => i.size === "extralarge")?.["#text"] || a.image?.find((i: any) => i.size === "large")?.["#text"] || null,
        bio: a.bio?.summary?.replace(/<a[^>]*>.*?<\/a>/g, "").replace(/<[^>]*>/g, "").trim() || null,
        tags,
        similar,
        topTracks,
        url: a.url,
      });
    } catch (e) { handleError(res, e); }
  });

  // ── OpenBeta climbing route search ───────────────────────────────────────────
  app.get("/api/climbing/search", requireAuth, async (req, res) => {
    try {
      const q = String(req.query.q || "").trim();
      if (!q) return res.json({ results: [] });
      // Minimal query — avoid optional fields that may not exist in all schema versions
      const gql = `
        query SearchClimbs {
          search(query: ${JSON.stringify(q)}) {
            climbs {
              id
              name
              type { sport trad boulder topRope }
              grades { yds vscale }
              content { description }
            }
          }
        }
      `;
      const r = await fetch("https://api.openbeta.io", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "MyLifos/1.0 (hobby-climbing-feature)",
        },
        body: JSON.stringify({ query: gql }),
      });
      const rawText = await r.text();
      if (!r.ok) {
        console.error(`[OpenBeta] HTTP ${r.status}: ${rawText.slice(0, 400)}`);
        return res.status(502).json({ error: `Route search unavailable (HTTP ${r.status}). Try again shortly.` });
      }
      let data: any;
      try { data = JSON.parse(rawText); } catch {
        console.error("[OpenBeta] Non-JSON response:", rawText.slice(0, 400));
        return res.status(502).json({ error: "Route search returned an unexpected response." });
      }
      if (data.errors?.length) {
        const msg = data.errors[0]?.message ?? "unknown error";
        console.error("[OpenBeta] GraphQL errors:", JSON.stringify(data.errors).slice(0, 400));
        return res.status(502).json({ error: `OpenBeta error: ${msg}` });
      }
      const climbs: any[] = data?.data?.search?.climbs ?? [];
      const results = climbs.slice(0, 15).map((c: any) => ({
        id: c.id,
        name: c.name,
        grade: c.grades?.yds ?? c.grades?.vscale ?? "",
        climbType: c.type?.boulder ? "Boulder"
                 : c.type?.sport   ? "Sport"
                 : c.type?.trad    ? "Trad"
                 : c.type?.topRope ? "Top Rope"
                 : "Route",
        description: (c.content?.description ?? "").slice(0, 200),
        location: "",
      }));
      res.json({ results });
    } catch (e) { handleError(res, e); }
  });

  // ── Perenual plant API proxy ──────────────────────────────────────────────────
  app.get("/api/perenual/search", requireAuth, async (req, res) => {
    try {
      const apiKey = process.env.PERENUAL_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "PERENUAL_API_KEY not configured" });
      const q = String(req.query.q || "").trim();
      if (!q) return res.status(400).json({ error: "q is required" });
      const url = `https://perenual.com/api/species-list?key=${apiKey}&q=${encodeURIComponent(q)}&page=1`;
      const r = await fetch(url);
      if (!r.ok) return res.status(r.status).json({ error: "Perenual error" });
      const data = await r.json() as any;
      res.json(data.data ?? []);
    } catch (e) { handleError(res, e); }
  });

  app.get("/api/perenual/plant/:id", requireAuth, async (req, res) => {
    try {
      const apiKey = process.env.PERENUAL_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "PERENUAL_API_KEY not configured" });
      const url = `https://perenual.com/api/species/details/${req.params.id}?key=${apiKey}`;
      const r = await fetch(url);
      if (!r.ok) {
        const errText = await r.text();
        console.error(`[Perenual detail] ${r.status}:`, errText.slice(0, 200));
        return res.status(r.status).json({ error: "Perenual error", detail: errText.slice(0, 200) });
      }
      const data = await r.json();
      // Log key fields to help debug mapping
      console.log(`[Perenual detail id=${req.params.id}] watering=${data.watering}, sunlight=${JSON.stringify(data.sunlight)}, soil=${JSON.stringify(data.soil)}, care_level=${data.care_level}, maintenance=${data.maintenance}`);
      res.json(data);
    } catch (e) { handleError(res, e); }
  });

  // Keeps the API key server-side; client never sees it
  app.get("/api/tmdb/search", requireAuth, async (req, res) => {
    try {
      const query = String(req.query.q || "").trim();
      const type = String(req.query.type || "movie"); // "movie" | "tv"
      if (!query) return res.status(400).json({ error: "q is required" });
      const apiKey = process.env.TMDB_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "TMDB_API_KEY not configured" });
      const url = `https://api.themoviedb.org/3/search/${type}?api_key=${apiKey}&query=${encodeURIComponent(query)}&include_adult=false`;
      const tmdbRes = await fetch(url);
      if (!tmdbRes.ok) return res.status(tmdbRes.status).json({ error: "TMDB error" });
      const data = await tmdbRes.json() as any;
      res.json(data.results ?? []);
    } catch (e) { handleError(res, e); }
  });

  app.get("/api/tmdb/movie/:id", requireAuth, async (req, res) => {
    try {
      const apiKey = process.env.TMDB_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "TMDB_API_KEY not configured" });
      const url = `https://api.themoviedb.org/3/movie/${req.params.id}?api_key=${apiKey}&append_to_response=credits`;
      const tmdbRes = await fetch(url);
      if (!tmdbRes.ok) return res.status(tmdbRes.status).json({ error: "TMDB error" });
      res.json(await tmdbRes.json());
    } catch (e) { handleError(res, e); }
  });

  app.get("/api/tmdb/tv/:id", requireAuth, async (req, res) => {
    try {
      const apiKey = process.env.TMDB_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "TMDB_API_KEY not configured" });
      const url = `https://api.themoviedb.org/3/tv/${req.params.id}?api_key=${apiKey}&append_to_response=credits`;
      const tmdbRes = await fetch(url);
      if (!tmdbRes.ok) return res.status(tmdbRes.status).json({ error: "TMDB error" });
      res.json(await tmdbRes.json());
    } catch (e) { handleError(res, e); }
  });

  // ── Events: Ticketmaster + Eventbrite proxy ────────────────────────────────

  app.get("/api/events/search", requireAuth, async (req, res) => {
    try {
      const city      = String(req.query.city || "").trim();
      const keyword   = String(req.query.q    || "").trim();
      const startDate = String(req.query.startDate || "").trim(); // YYYY-MM-DD
      const endDate   = String(req.query.endDate   || "").trim();

      const tmKey = process.env.TICKETMASTER_API_KEY;
      const ebKey = process.env.EVENTBRITE_API_KEY;

      const results: any[] = [];

      // ── Ticketmaster ─────────────────────────────────────────────────────
      if (tmKey) {
        try {
          const params = new URLSearchParams({ apikey: tmKey, size: "20" });
          if (keyword)   params.set("keyword", keyword);
          if (city)      params.set("city", city);
          if (startDate) params.set("startDateTime", `${startDate}T00:00:00Z`);
          if (endDate)   params.set("endDateTime",   `${endDate}T23:59:59Z`);

          const tmRes = await fetch(
            `https://app.ticketmaster.com/discovery/v2/events.json?${params}`
          );
          if (tmRes.ok) {
            const tmData = await tmRes.json() as any;
            const events = tmData?._embedded?.events ?? [];
            for (const e of events) {
              const venue = e._embedded?.venues?.[0];
              const priceRange = e.priceRanges?.[0];
              results.push({
                source:       "ticketmaster",
                externalId:   e.id,
                name:         e.name,
                description:  e.info ?? e.pleaseNote ?? null,
                startDatetime: e.dates?.start?.dateTime ?? e.dates?.start?.localDate ?? null,
                endDatetime:   e.dates?.end?.dateTime   ?? null,
                venueName:    venue?.name ?? null,
                venueAddress: venue ? [venue.address?.line1, venue.city?.name, venue.state?.stateCode].filter(Boolean).join(", ") : null,
                city:         (venue?.city?.name ?? city) || null,
                url:          e.url ?? null,
                imageUrl:     (e.images?.find((img: any) => img.ratio === "16_9" && img.width > 500) ?? e.images?.[0])?.url ?? null,
                priceInfo:    priceRange ? `$${priceRange.min}–$${priceRange.max}` : null,
                classifications: e.classifications?.[0]?.segment?.name ?? null,
              });
            }
          }
        } catch (_) { /* Ticketmaster failed — continue */ }
      }

      // ── SeatGeek ─────────────────────────────────────────────────────────
      const sgClientId     = process.env.SEATGEEK_CLIENT_ID;
      const sgClientSecret = process.env.SEATGEEK_CLIENT_SECRET;
      if (sgClientId) {
        try {
          const params = new URLSearchParams({
            client_id: sgClientId,
            per_page:  "20",
          });
          if (sgClientSecret) params.set("client_secret", sgClientSecret);
          if (keyword)   params.set("q", keyword);
          if (city)      params.set("venue.city", city);
          if (startDate) params.set("datetime_local.gte", `${startDate}T00:00:00`);
          if (endDate)   params.set("datetime_local.lte", `${endDate}T23:59:59`);

          const sgRes = await fetch(`https://api.seatgeek.com/2/events?${params}`);
          if (sgRes.ok) {
            const sgData = await sgRes.json() as any;
            for (const e of sgData.events ?? []) {
              const venue = e.venue;
              const lo = e.stats?.lowest_price;
              const hi = e.stats?.highest_price;
              results.push({
                source:        "seatgeek",
                externalId:    String(e.id),
                name:          e.title ?? e.short_title ?? "Untitled",
                description:   null,
                startDatetime: e.datetime_utc ?? e.datetime_local ?? null,
                endDatetime:   null,
                venueName:     venue?.name ?? null,
                venueAddress:  venue ? [venue.address, venue.city, venue.state].filter(Boolean).join(", ") : null,
                city:          (venue?.city ?? city) || null,
                url:           e.url ?? null,
                imageUrl:      e.performers?.[0]?.image ?? null,
                priceInfo:     lo ? `$${lo}${hi && hi !== lo ? `–$${hi}` : ""}` : null,
                classifications: e.type ?? null,
              });
            }
          } else {
            const errText = await sgRes.text().catch(() => "");
            console.warn(`SeatGeek API error ${sgRes.status}:`, errText.slice(0, 300));
          }
        } catch (sgErr) { console.warn("SeatGeek fetch failed:", sgErr); }
      }

      if (!tmKey && !sgClientId) {
        return res.status(500).json({ error: "No event API keys configured" });
      }

      // Sort by start date ascending
      results.sort((a, b) => {
        const da = a.startDatetime ? new Date(a.startDatetime).getTime() : 0;
        const db = b.startDatetime ? new Date(b.startDatetime).getTime() : 0;
        return da - db;
      });

      res.json(results);
    } catch (e) { handleError(res, e); }
  });

  // ── Saved Events CRUD ─────────────────────────────────────────────────────

  app.get("/api/events/saved", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const events = await storage.getSavedEvents(user.id);
      res.json(events);
    } catch (e) { handleError(res, e); }
  });

  app.post("/api/events/saved", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const event = await storage.saveEvent(user.id, req.body);
      res.status(201).json(event ?? { ok: true, already_saved: true });
    } catch (e) { handleError(res, e); }
  });

  app.delete("/api/events/saved/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      await storage.deleteSavedEvent(user.id, Number(req.params.id));
      res.json({ ok: true });
    } catch (e) { handleError(res, e); }
  });

  app.patch("/api/events/saved/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { status, notes } = req.body as { status?: string; notes?: string };
      if (status) await storage.updateSavedEventStatus(user.id, Number(req.params.id), status, notes);
      res.json({ ok: true });
    } catch (e) { handleError(res, e); }
  });

  // ── Hobbies ──────────────────────────────────────────────────────────────────
  app.get("/api/hobbies", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const data = await storage.getAllHobbies(uid);
      res.json(data);
    } catch (e) { handleError(res, e); }
  });

  app.post("/api/hobbies", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const hobby = await storage.createHobby(req.body, uid);
      res.json(hobby);
    } catch (e) { handleError(res, e); }
  });

  app.patch("/api/hobbies/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateHobby(Number(req.params.id), req.body);
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (e) { handleError(res, e); }
  });

  app.delete("/api/hobbies/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteHobby(Number(req.params.id));
      res.json({ ok: true });
    } catch (e) { handleError(res, e); }
  });

  // ── Hiking / Trails ───────────────────────────────────────────────────────────

  /** GET /api/hiking/geocode?q=Boulder+CO  — returns [{ lat, lon, display_name }] */
  app.get("/api/hiking/geocode", requireAuth, async (req, res) => {
    try {
      const { q } = req.query as { q?: string };
      if (!q?.trim()) return res.status(400).json({ error: "q required" });
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=3&addressdetails=1`;
      const r = await fetch(url, { headers: { "User-Agent": "MyLifos/1.0 (hobby-hiking-feature)" } });
      const data = await r.json();
      res.json(data);
    } catch (e) { handleError(res, e); }
  });

  /** GET /api/hiking/search?query=Colorado+Trail[&lat=X&lon=Y&maxDistance=25]&maxResults=30
   *  Uses Waymarked Trails API (waymarkedtrails.org) — no API key required.
   *  Runs text-search and (optionally) bounding-box area-search in parallel, merges results.
   *  lat/lon are optional — if omitted only the text search runs.
   */
  app.get("/api/hiking/search", requireAuth, async (req, res) => {
    try {
      const { lat, lon, maxDistance = "25", maxResults = "30", locationName = "" } = req.query as Record<string, string>;
      const limit = parseInt(maxResults, 10) || 30;
      const query = (locationName as string).trim();

      function sacToDifficulty(sac?: string): string {
        switch (sac) {
          case "hiking":                    return "Green";
          case "mountain_hiking":           return "Blue";
          case "demanding_mountain_hiking": return "Black";
          case "alpine_hiking":             return "Dbl Black";
          case "demanding_alpine_hiking":
          case "difficult_alpine_hiking":   return "Terrifying";
          default:                          return "";
        }
      }
      function mapTrail(t: any, loc: string) {
        return {
          id:          t.id,
          name:        t.name || "Unnamed Trail",
          ref:         t.ref  || null,
          location:    loc,
          length:      t.mapped_length ? Math.round(t.mapped_length / 1609.34 * 10) / 10 : 0,
          ascent:      0,
          difficulty:  sacToDifficulty(t.sac_scale),
          stars:       0,
          url:         `https://hiking.waymarkedtrails.org/#route?id=${t.id}`,
          imgSqSmall:  null,
          description: t.description || null,
          network:     t.network     || null,
          group:       t.group       || null,
        };
      }

      const UA = { "User-Agent": "MyLifos/1.0 (hobby-hiking-feature)" };
      const fetches: Promise<any[]>[] = [];

      // 1. Text search (by trail name / keyword) — always run if query provided
      if (query) {
        fetches.push(
          fetch(`https://hiking.waymarkedtrails.org/api/v1/list/search?query=${encodeURIComponent(query)}&limit=${limit}`, { headers: UA })
            .then(r => r.ok ? r.json() : { results: [] })
            .then((d: any) => (d.results ?? []).map((t: any) => mapTrail(t, query)))
            .catch(() => [])
        );
      }

      // 2. Bounding-box area search — only run when lat/lon provided
      if (lat && lon) {
        const latN = parseFloat(lat);
        const lonN = parseFloat(lon);
        const radiusMiles = parseFloat(maxDistance);
        const latDelta = radiusMiles / 69.0;
        const lonDelta = radiusMiles / (69.0 * Math.cos(latN * Math.PI / 180));
        const bbox = `${lonN - lonDelta},${latN - latDelta},${lonN + lonDelta},${latN + latDelta}`;
        fetches.push(
          fetch(`https://hiking.waymarkedtrails.org/api/v1/list/by_area?bbox=${bbox}&limit=${limit}`, { headers: UA })
            .then(r => r.ok ? r.json() : { results: [] })
            .then((d: any) => (d.results ?? []).map((t: any) => mapTrail(t, query)))
            .catch(() => [])
        );
      }

      if (fetches.length === 0) return res.status(400).json({ error: "Provide locationName and/or lat+lon" });

      // Merge, deduplicate by id (text-search results come first)
      const all = (await Promise.all(fetches)).flat();
      const seen = new Set<number>();
      const trails = all.filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true; }).slice(0, limit);

      res.json({ trails, total: trails.length });
    } catch (e) { handleError(res, e); }
  });

  /** GET /api/cycling/search?query=...&lat=X&lon=Y&maxDistance=25&maxResults=30
   *  Uses Waymarked Trails cycling API (cycling.waymarkedtrails.org) — no API key required.
   *  Mirrors /api/hiking/search but targets the cycling subdomain.
   */
  app.get("/api/cycling/search", requireAuth, async (req, res) => {
    try {
      const { lat, lon, maxDistance = "25", maxResults = "30", locationName = "" } = req.query as Record<string, string>;
      const limit = parseInt(maxResults, 10) || 30;
      const query = (locationName as string).trim();

      function mapRoute(t: any, loc: string) {
        return {
          id:          t.id,
          name:        t.name || "Unnamed Route",
          ref:         t.ref  || null,
          location:    loc,
          length:      t.mapped_length ? Math.round(t.mapped_length / 1609.34 * 10) / 10 : 0,
          url:         `https://cycling.waymarkedtrails.org/#route?id=${t.id}`,
          description: t.description || null,
          network:     t.network     || null,
        };
      }

      const UA = { "User-Agent": "MyLifos/1.0 (hobby-cycling-feature)" };
      const fetches: Promise<any[]>[] = [];

      if (query) {
        fetches.push(
          fetch(`https://cycling.waymarkedtrails.org/api/v1/list/search?query=${encodeURIComponent(query)}&limit=${limit}`, { headers: UA })
            .then(r => r.ok ? r.json() : { results: [] })
            .then((d: any) => (d.results ?? []).map((t: any) => mapRoute(t, query)))
            .catch(() => [])
        );
      }

      if (lat && lon) {
        const latN = parseFloat(lat);
        const lonN = parseFloat(lon);
        const radiusMiles = parseFloat(maxDistance);
        const latDelta = radiusMiles / 69.0;
        const lonDelta = radiusMiles / (69.0 * Math.cos(latN * Math.PI / 180));
        const bbox = `${lonN - lonDelta},${latN - latDelta},${lonN + lonDelta},${latN + latDelta}`;
        fetches.push(
          fetch(`https://cycling.waymarkedtrails.org/api/v1/list/by_area?bbox=${bbox}&limit=${limit}`, { headers: UA })
            .then(r => r.ok ? r.json() : { results: [] })
            .then((d: any) => (d.results ?? []).map((t: any) => mapRoute(t, query)))
            .catch(() => [])
        );
      }

      if (fetches.length === 0) return res.status(400).json({ error: "Provide locationName and/or lat+lon" });

      const all = (await Promise.all(fetches)).flat();
      const seen = new Set<number>();
      const trails = all.filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true; }).slice(0, limit);

      res.json({ trails, total: trails.length });
    } catch (e) { handleError(res, e); }
  });

  /** GET /api/fish/search?q=bass
   *  Proxies to iNaturalist taxa API — no API key required.
   *  Restricts results to ray-finned fish (Actinopterygii).
   *  Returns { results: [{ id, name, sciName, photoUrl }] }
   */
  app.get("/api/fish/search", requireAuth, async (req, res) => {
    try {
      const { q = "" } = req.query as Record<string, string>;
      if (!q.trim()) return res.json({ results: [] });
      const url = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(q)}&rank=species,subspecies&iconic_taxa=Actinopterygii&per_page=12&locale=en`;
      const r = await fetch(url, { headers: { "User-Agent": "MyLifos/1.0 (hobby-fishing-feature)" } });
      if (!r.ok) return res.status(r.status).json({ error: "iNaturalist API error" });
      const data = await r.json();
      const results = (data.results ?? []).map((t: any) => ({
        id:       t.id,
        name:     t.preferred_common_name ?? t.name,
        sciName:  t.name,
        photoUrl: t.default_photo?.square_url ?? null,
      }));
      res.json({ results });
    } catch (e) { handleError(res, e); }
  });

  /** GET /api/birds/search?name=robin&page=1
   *  Proxies to Nuthatch API (nuthatch.lastelm.software) — requires NUTHATCH_API_KEY env var.
   *  Returns { birds: [{ id, name, sciName, status, image }], total }
   */
  app.get("/api/birds/search", requireAuth, async (req, res) => {
    try {
      const { name = "", page = "1" } = req.query as Record<string, string>;
      const apiKey = process.env.NUTHATCH_API_KEY ?? "";
      if (!apiKey) {
        return res.status(503).json({ error: "Bird search is not configured (NUTHATCH_API_KEY missing). Add your Nuthatch API key in Railway environment variables." });
      }
      const url = `https://nuthatch.lastelm.software/v2/birds?pageSize=10&page=${encodeURIComponent(page)}&name=${encodeURIComponent(name)}&hasImg=true&operator=AND`;
      const r = await fetch(url, { headers: { "API-Key": apiKey } });
      if (!r.ok) return res.status(r.status).json({ error: "Bird API error" });
      const data = await r.json();
      const birds = (data.entities ?? []).map((b: any) => ({
        id: b.id,
        name: b.name,
        sciName: b.sciName ?? "",
        status: b.status ?? "",
        image: Array.isArray(b.images) && b.images.length > 0 ? b.images[0] : null,
      }));
      res.json({ birds, total: data.total ?? birds.length });
    } catch (e) { handleError(res, e); }
  });

  // ── Music Collections ─────────────────────────────────────────────────────────
  app.get("/api/music/collections", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const data = await storage.getAllCollections(uid);
      res.json(data);
    } catch (e) { handleError(res, e); }
  });

  app.post("/api/music/collections", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const col = await storage.createCollection(req.body, uid);
      res.json(col);
    } catch (e) { handleError(res, e); }
  });

  app.patch("/api/music/collections/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateCollection(Number(req.params.id), req.body);
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (e) { handleError(res, e); }
  });

  app.delete("/api/music/collections/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteCollection(Number(req.params.id));
      res.json({ ok: true });
    } catch (e) { handleError(res, e); }
  });

  // Add item to collection
  app.post("/api/music/collections/:id/items", requireAuth, async (req, res) => {
    try {
      const { itemType, songId, artistId } = req.body;
      const item = await storage.addCollectionItem(Number(req.params.id), itemType, songId ?? null, artistId ?? null);
      res.json(item);
    } catch (e) { handleError(res, e); }
  });

  // Remove item from collection
  app.delete("/api/music/collections/:id/items/:itemId", requireAuth, async (req, res) => {
    try {
      await storage.removeCollectionItem(Number(req.params.itemId));
      res.json({ ok: true });
    } catch (e) { handleError(res, e); }
  });

  // Reorder items in collection
  app.put("/api/music/collections/:id/items/order", requireAuth, async (req, res) => {
    try {
      const { itemIds } = req.body; // ordered array of item IDs
      await storage.reorderCollectionItems(Number(req.params.id), itemIds);
      res.json({ ok: true });
    } catch (e) { handleError(res, e); }
  });

  // ── Tab Collaborations ────────────────────────────────────────────────────────
  app.get("/api/tab-collaborations/pending-count", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const all = await storage.getTabCollaborations(uid);
      const count = all.filter(c => c.collaboratorUserId === uid && c.status === "pending").length;
      res.json({ count });
    } catch (e) { handleError(res, e); }
  });

  app.get("/api/tab-collaborations", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(await storage.getTabCollaborations(uid));
    } catch (e) { handleError(res, e); }
  });

  app.post("/api/tab-collaborations", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const now = new Date().toISOString();
      // Find collaborator by email or userId
      const { collaboratorId, tabName } = req.body;
      if (!collaboratorId || !tabName) return res.status(400).json({ error: "collaboratorId and tabName are required" });
      if (collaboratorId === uid) return res.status(400).json({ error: "Cannot collaborate with yourself" });
      // Check for existing
      const existing = await storage.getTabCollaborations(uid);
      const dupe = existing.find(c => c.tabName === tabName &&
        ((c.ownerUserId === uid && c.collaboratorUserId === collaboratorId) ||
         (c.collaboratorUserId === uid && c.ownerUserId === collaboratorId)));
      if (dupe) return res.status(409).json({ error: "Collaboration already exists" });
      const data = insertTabCollaborationSchema.parse({
        ownerUserId: uid,
        collaboratorUserId: collaboratorId,
        tabName,
        status: "pending",
        createdAt: now,
      });
      res.status(201).json(await storage.createTabCollaboration(data));
    } catch (e) { handleError(res, e); }
  });

  app.patch("/api/tab-collaborations/:id", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const { status } = req.body;
      if (!["accepted", "declined"].includes(status)) return res.status(400).json({ error: "status must be accepted or declined" });
      // Verify the current user is the collaborator (only they can accept/decline)
      const collabs = await storage.getTabCollaborations(uid);
      const collab = collabs.find(c => c.id === +req.params.id && c.collaboratorUserId === uid);
      if (!collab) return res.status(403).json({ error: "Forbidden" });
      const updated = await storage.updateTabCollaborationStatus(+req.params.id, status);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  app.delete("/api/tab-collaborations/:id", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const collabs = await storage.getTabCollaborations(uid);
      const collab = collabs.find(c => c.id === +req.params.id);
      if (!collab) return res.status(403).json({ error: "Forbidden" });
      (await storage.deleteTabCollaboration(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  // ── Faith & Spirituality ──────────────────────────────────────────────────
  // PRIVATE: never included in shares, recommendations, or public profiles.

  // Sacred Texts
  app.get("/api/sacred-texts", requireAuth, async (req, res) => {
    try { res.json(await storage.getSacredTexts((req.user as User).id)); }
    catch (e) { handleError(res, e); }
  });
  app.post("/api/sacred-texts", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const data = insertSacredTextSchema.parse({ ...req.body, userId: uid, dateAdded: new Date().toISOString() });
      res.status(201).json(await storage.createSacredText(data));
    } catch (e) { handleError(res, e); }
  });
  app.patch("/api/sacred-texts/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateSacredText(+req.params.id, req.body);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/sacred-texts/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deleteSacredText(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  // Faith Practices
  app.get("/api/faith-practices", requireAuth, async (req, res) => {
    try { res.json(await storage.getFaithPractices((req.user as User).id)); }
    catch (e) { handleError(res, e); }
  });
  app.post("/api/faith-practices", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const data = insertFaithPracticeSchema.parse({ ...req.body, userId: uid });
      res.status(201).json(await storage.createFaithPractice(data));
    } catch (e) { handleError(res, e); }
  });
  app.patch("/api/faith-practices/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateFaithPractice(+req.params.id, req.body);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/faith-practices/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deleteFaithPractice(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  // Sermons & Teachings
  app.get("/api/sermons", requireAuth, async (req, res) => {
    try { res.json(await storage.getSermons((req.user as User).id)); }
    catch (e) { handleError(res, e); }
  });
  app.post("/api/sermons", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const data = insertSermonSchema.parse({ ...req.body, userId: uid });
      res.status(201).json(await storage.createSermon(data));
    } catch (e) { handleError(res, e); }
  });
  app.patch("/api/sermons/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateSermon(+req.params.id, req.body);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/sermons/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deleteSermon(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  // Prayer Items
  app.get("/api/prayer-items", requireAuth, async (req, res) => {
    try { res.json(await storage.getPrayerItems((req.user as User).id)); }
    catch (e) { handleError(res, e); }
  });
  app.post("/api/prayer-items", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const data = insertPrayerItemSchema.parse({ ...req.body, userId: uid, dateAdded: new Date().toISOString() });
      res.status(201).json(await storage.createPrayerItem(data));
    } catch (e) { handleError(res, e); }
  });
  app.patch("/api/prayer-items/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updatePrayerItem(+req.params.id, req.body);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/prayer-items/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deletePrayerItem(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  // ── Health ──────────────────────────────────────────────────────────────────

  // Medications
  app.get("/api/health/medications", requireAuth, async (req, res) => {
    try { res.json(await storage.getMedications((req.user as User).id)); } catch (e) { handleError(res, e); }
  });
  app.post("/api/health/medications", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const data = insertMedicationSchema.parse({ ...req.body, userId: uid });
      res.status(201).json(await storage.createMedication(data, uid));
    } catch (e) { handleError(res, e); }
  });
  app.patch("/api/health/medications/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateMedication(+req.params.id, req.body);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/health/medications/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deleteMedication(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  // Health Metrics
  app.get("/api/health/metrics", requireAuth, async (req, res) => {
    try { res.json(await storage.getHealthMetrics((req.user as User).id)); } catch (e) { handleError(res, e); }
  });
  app.post("/api/health/metrics", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const data = insertHealthMetricSchema.parse({ ...req.body, userId: uid });
      res.status(201).json(await storage.createHealthMetric(data, uid));
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/health/metrics/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deleteHealthMetric(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  // Sleep Logs
  app.get("/api/health/sleep", requireAuth, async (req, res) => {
    try { res.json(await storage.getSleepLogs((req.user as User).id)); } catch (e) { handleError(res, e); }
  });
  app.post("/api/health/sleep", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const data = insertSleepLogSchema.parse({ ...req.body, userId: uid });
      res.status(201).json(await storage.createSleepLog(data, uid));
    } catch (e) { handleError(res, e); }
  });
  app.patch("/api/health/sleep/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateSleepLog(+req.params.id, req.body);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/health/sleep/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deleteSleepLog(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  // Care Providers
  app.get("/api/health/care-providers", requireAuth, async (req, res) => {
    try { res.json(await storage.getCareProviders((req.user as User).id)); } catch (e) { handleError(res, e); }
  });
  app.post("/api/health/care-providers", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const data = insertCareProviderSchema.parse({ ...req.body, userId: uid });
      res.status(201).json(await storage.createCareProvider(data, uid));
    } catch (e) { handleError(res, e); }
  });
  app.patch("/api/health/care-providers/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateCareProvider(+req.params.id, req.body);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/health/care-providers/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deleteCareProvider(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  // ── Politics ────────────────────────────────────────────────────────────────

  // Congress.gov proxy — look up current federal members by state
  app.get("/api/politics/congress/members", requireAuth, async (req, res) => {
    try {
      const state = (req.query.state as string | undefined)?.toUpperCase();
      if (!state || state.length !== 2) return res.status(400).json({ error: "Valid 2-letter state code required" });
      const apiKey = process.env.CONGRESS_API_KEY || "DEMO_KEY";
      const url = `https://api.congress.gov/v3/member?stateCode=${state}&currentMember=true&limit=300&api_key=${apiKey}`;
      const resp = await fetch(url, { headers: { Accept: "application/json" } });
      if (!resp.ok) return res.status(resp.status).json({ error: "Congress.gov API error" });
      const data = await resp.json() as { members?: any[] };
      // Normalise fields for the client
      const members = (data.members ?? [])
        .filter((m: any) => {
          // Congress.gov may return m.state as full name ("Texas") so map both ways
          const STATE_NAME_TO_CODE: Record<string,string> = {
            "Alabama":"AL","Alaska":"AK","Arizona":"AZ","Arkansas":"AR","California":"CA",
            "Colorado":"CO","Connecticut":"CT","Delaware":"DE","Florida":"FL","Georgia":"GA",
            "Hawaii":"HI","Idaho":"ID","Illinois":"IL","Indiana":"IN","Iowa":"IA","Kansas":"KS",
            "Kentucky":"KY","Louisiana":"LA","Maine":"ME","Maryland":"MD","Massachusetts":"MA",
            "Michigan":"MI","Minnesota":"MN","Mississippi":"MS","Missouri":"MO","Montana":"MT",
            "Nebraska":"NE","Nevada":"NV","New Hampshire":"NH","New Jersey":"NJ",
            "New Mexico":"NM","New York":"NY","North Carolina":"NC","North Dakota":"ND",
            "Ohio":"OH","Oklahoma":"OK","Oregon":"OR","Pennsylvania":"PA","Rhode Island":"RI",
            "South Carolina":"SC","South Dakota":"SD","Tennessee":"TN","Texas":"TX","Utah":"UT",
            "Vermont":"VT","Virginia":"VA","Washington":"WA","West Virginia":"WV",
            "Wisconsin":"WI","Wyoming":"WY","District of Columbia":"DC",
          };
          const terms: any[] = Array.isArray(m.terms?.item) ? m.terms.item
            : m.terms?.item ? [m.terms.item] : [];
          const latestTerm    = terms[terms.length - 1];
          const termCode      = (latestTerm?.stateCode ?? "").toUpperCase().trim();
          const memberCode    = (m.stateCode ?? "").toUpperCase().trim();
          const memberName    = (m.state ?? "").trim();
          const mappedCode    = STATE_NAME_TO_CODE[memberName] ?? "";
          // If no state info at all, trust API's stateCode param
          if (!termCode && !memberCode && !memberName) return true;
          return termCode === state || memberCode === state || mappedCode === state;
        })
        .map((m: any) => {
          // Congress.gov returns name as "LastName, FirstName [Middle]"
          const rawName: string = m.name ?? "";
          const commaIdx = rawName.indexOf(",");
          const name = commaIdx > -1
            ? `${rawName.slice(commaIdx + 1).trim()} ${rawName.slice(0, commaIdx).trim()}`
            : rawName;
          // Determine chamber from most-recent term
          const terms: any[] = Array.isArray(m.terms?.item) ? m.terms.item
            : m.terms?.item ? [m.terms.item] : [];
          const latestTerm = terms[terms.length - 1];
          const chamber: string = latestTerm?.chamber ?? "";
          const isSenate = chamber.toLowerCase().includes("senate");
          const title = isSenate ? "U.S. Senator" : `U.S. Representative${m.district ? `, District ${m.district}` : ""}`;
          return {
            bioguideId: m.bioguideId,
            name,
            title,
            chamber: isSenate ? "Senate" : "House",
            party: m.partyName ?? "",
            state,
            district: m.district ? String(m.district) : null,
            website: m.officialWebsiteUrl ?? null,
            imageUrl: m.depiction?.imageUrl ?? null,
          };
        });
      // Sort: Senate first, then House by district
      members.sort((a: any, b: any) => {
        if (a.chamber !== b.chamber) return a.chamber === "Senate" ? -1 : 1;
        return (Number(a.district) || 0) - (Number(b.district) || 0);
      });
      res.json(members);
    } catch (e) { handleError(res, e); }
  });

  // Congress.gov — member profile: sponsored bills + committees for a candidate
  // Accepts: ?name=FEC_NAME&state=TX&office=S|H
  app.get("/api/politics/congress/member-profile", requireAuth, async (req, res) => {
    try {
      const { name = "", state = "", office = "H" } = req.query as Record<string, string>;
      if (!name) return res.status(400).json({ error: "name is required" });

      const apiKey = process.env.CONGRESS_API_KEY || "DEMO_KEY";
      const isSenate = office.toUpperCase() === "S";
      // Extract last name: "CRUZ, RAFAEL EDWARD TED" → "cruz"
      const lastName = (name.includes(",")
        ? name.split(",")[0].trim()
        : name.trim().split(/\s+/).slice(-1)[0]
      ).toLowerCase();

      const safeJson = async (url: string) => {
        try {
          const r = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12000) });
          return r.ok ? await r.json() : {};
        } catch { return {}; }
      };

      // Congress.gov name= param is unreliable — fetch all members and filter by last name
      // (same approach as the whoismyrep name-search fix)
      const [page1, page2] = await Promise.all([
        safeJson(`https://api.congress.gov/v3/member?currentMember=true&limit=300&offset=0&api_key=${apiKey}`),
        safeJson(`https://api.congress.gov/v3/member?currentMember=true&limit=300&offset=300&api_key=${apiKey}`),
      ]);
      const allMembers: any[] = [...((page1.members ?? []) as any[]), ...((page2.members ?? []) as any[])];

      // Filter to members whose last name matches (Congress.gov format: "LAST, FIRST MIDDLE")
      const byLastName = allMembers.filter(m =>
        (m.name ?? "").toLowerCase().startsWith(lastName + ",") ||
        (m.name ?? "").toLowerCase() === lastName
      );

      // Pick the best match: prefer correct state + chamber
      const member = byLastName.find(m => {
        const stateMatch = !state || (m.stateCode ?? "").toUpperCase() === state.toUpperCase();
        const terms: any[] = Array.isArray(m.terms?.item) ? m.terms.item : m.terms?.item ? [m.terms.item] : [];
        const latestTerm = terms[terms.length - 1];
        const chamberStr = (latestTerm?.chamber ?? "").toLowerCase();
        const chamberMatch = isSenate ? chamberStr.includes("senate") : chamberStr.includes("house");
        return stateMatch && chamberMatch;
      }) ?? byLastName[0];

      if (!member?.bioguideId) return res.status(404).json({ error: "Member not found in Congress.gov" });
      const bioguideId: string = member.bioguideId;

      // Parallel: sponsored legislation + full member details (includes committees)
      const [billsData, memberData] = await Promise.all([
        safeJson(`https://api.congress.gov/v3/member/${bioguideId}/sponsored-legislation?limit=40&sort=introducedDate+desc&api_key=${apiKey}`),
        safeJson(`https://api.congress.gov/v3/member/${bioguideId}?api_key=${apiKey}`),
      ]) as any[];

      const bills = ((billsData.sponsoredLegislation ?? []) as any[])
        .filter((b: any) => (b.title ?? "").trim().length > 0)   // drop blank-title entries
        .slice(0, 15)
        .map((b: any) => ({
        number:         b.number        ?? "",
        title:          b.title         ?? "",
        type:           b.type          ?? "",
        introducedDate: b.introducedDate ?? "",
        latestAction:   b.latestAction?.text ?? "",
        congress:       b.congress      ?? "",
        policyArea:     b.policyArea?.name ?? "",
        url:            b.url           ?? "",
      }));

      // Committees from member details
      const memberDetails: any = memberData.member ?? {};
      const committeeHistory: any[] = memberDetails.committeeAssignments?.item ?? [];
      const committees = (Array.isArray(committeeHistory) ? committeeHistory : [committeeHistory])
        .filter((c: any) => c?.committeeName)
        .slice(0, 10)
        .map((c: any) => ({
          name:    c.committeeName ?? "",
          chamber: c.chamber ?? "",
          rank:    c.rank ?? "",
        }));

      // Leadership roles
      const leadershipRaw: any[] = memberDetails.leadership ?? [];
      const leadership = (Array.isArray(leadershipRaw) ? leadershipRaw : [leadershipRaw])
        .filter((l: any) => l?.type)
        .map((l: any) => l.type as string);

      res.json({ bioguideId, bills, committees, leadership, party: member.partyName ?? "" });
    } catch (e) { handleError(res, e); }
  });

  // WhoIsMyRepresentative.com proxy — search by ZIP code
  // Name search uses Congress.gov API (more reliable)
  app.get("/api/politics/whoismyrep", requireAuth, async (req, res) => {
    try {
      const { zip, name } = req.query as { zip?: string; name?: string };
      if (!zip && !name) return res.status(400).json({ error: "Provide zip or name" });

      // ── Name search: fetch all current members, filter server-side ────────────
      // (Congress.gov v3 does not support reliable free-text name filtering)
      if (name) {
        const trimmed = name.trim();
        if (!trimmed) return res.status(400).json({ error: "Name cannot be empty" });
        const cgApiKey = process.env.CONGRESS_API_KEY || "DEMO_KEY";
        const searchLower = trimmed.toLowerCase();

        // Fetch all ~535 current Congress members in two parallel pages
        const safePageFetch = async (offset: number) => {
          try {
            const r = await fetch(
              `https://api.congress.gov/v3/member?currentMember=true&limit=300&offset=${offset}&api_key=${cgApiKey}`,
              { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12000) }
            );
            return r.ok ? (await r.json()).members ?? [] : [];
          } catch { return []; }
        };

        const [page1, page2] = await Promise.all([safePageFetch(0), safePageFetch(300)]);
        const allMembers: any[] = [...page1, ...page2];

        // Congress.gov stores names as "LAST, FIRST MIDDLE" — match against any part
        const matched = allMembers.filter(m =>
          (m.name ?? "").toLowerCase().includes(searchLower)
        );

        const STATE_NAME_TO_CODE: Record<string,string> = {
          "Alabama":"AL","Alaska":"AK","Arizona":"AZ","Arkansas":"AR","California":"CA",
          "Colorado":"CO","Connecticut":"CT","Delaware":"DE","Florida":"FL","Georgia":"GA",
          "Hawaii":"HI","Idaho":"ID","Illinois":"IL","Indiana":"IN","Iowa":"IA","Kansas":"KS",
          "Kentucky":"KY","Louisiana":"LA","Maine":"ME","Maryland":"MD","Massachusetts":"MA",
          "Michigan":"MI","Minnesota":"MN","Mississippi":"MS","Missouri":"MO","Montana":"MT",
          "Nebraska":"NE","Nevada":"NV","New Hampshire":"NH","New Jersey":"NJ",
          "New Mexico":"NM","New York":"NY","North Carolina":"NC","North Dakota":"ND",
          "Ohio":"OH","Oklahoma":"OK","Oregon":"OR","Pennsylvania":"PA","Rhode Island":"RI",
          "South Carolina":"SC","South Dakota":"SD","Tennessee":"TN","Texas":"TX","Utah":"UT",
          "Vermont":"VT","Virginia":"VA","Washington":"WA","West Virginia":"WV",
          "Wisconsin":"WI","Wyoming":"WY","District of Columbia":"DC",
        };

        const members = matched.map((m: any) => {
          const rawName: string = m.name ?? "";
          const commaIdx = rawName.indexOf(",");
          const displayName = commaIdx > -1
            ? `${rawName.slice(commaIdx + 1).trim()} ${rawName.slice(0, commaIdx).trim()}`
            : rawName;
          const terms: any[] = Array.isArray(m.terms?.item) ? m.terms.item
            : m.terms?.item ? [m.terms.item] : [];
          const latestTerm = terms[terms.length - 1];
          const chamber: string = latestTerm?.chamber ?? "";
          const isSenate = chamber.toLowerCase().includes("senate");
          const stateRaw = (m.stateCode ?? m.state ?? "").trim();
          const stateCode = stateRaw.length === 2 ? stateRaw.toUpperCase() : (STATE_NAME_TO_CODE[stateRaw] ?? stateRaw);
          const title = isSenate ? "U.S. Senator" : `U.S. Representative${m.district ? `, District ${m.district}` : ""}`;
          return {
            bioguideId: m.bioguideId ?? `cg-${displayName.replace(/\s+/g, "-")}`,
            name: displayName,
            title,
            chamber: (isSenate ? "Senate" : "House") as "Senate" | "House",
            party: m.partyName ?? "",
            state: stateCode,
            district: m.district ? String(m.district) : null,
            website: m.officialWebsiteUrl ?? null,
            imageUrl: m.depiction?.imageUrl ?? null,
          };
        });
        members.sort((a: any, b: any) => {
          if (a.chamber !== b.chamber) return a.chamber === "Senate" ? -1 : 1;
          return (Number(a.district) || 0) - (Number(b.district) || 0);
        });
        return res.json(members);
      }

      // ── ZIP search: WhoIsMyRepresentative.com ──────────────────────────────
      if (!/^\d{5}$/.test(zip!)) return res.status(400).json({ error: "ZIP must be 5 digits" });

      const partyFull: Record<string, string> = {
        D: "Democrat", R: "Republican", I: "Independent",
        L: "Libertarian", G: "Green", ID: "Independent Democrat",
      };

      const url = `https://whoismyrepresentative.com/getall_mems.php?zip=${zip}&output=json`;
      const resp = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
      // API returns 406 with message when no results found
      if (resp.status === 406) return res.json([]);
      if (!resp.ok) return res.status(resp.status).json({ error: "WhoIsMyRepresentative API error" });

      // Guard: API sometimes returns HTML on errors even with 200 status
      const text = await resp.text();
      let wimrData: { results?: any[] };
      try { wimrData = JSON.parse(text); } catch { return res.json([]); }

      const members = (wimrData.results ?? []).map((m: any, idx: number) => {
        const isSenate = !m.district || m.district === "" || m.district === "0";
        const district = isSenate ? null : String(m.district);
        return {
          bioguideId: `wimr-${idx}-${m.name?.replace(/\s+/g, "-")}`,
          name: m.name ?? "",
          title: isSenate ? "U.S. Senator" : `U.S. Representative${district ? `, District ${district}` : ""}`,
          chamber: isSenate ? "Senate" : "House" as "Senate" | "House",
          party: partyFull[m.party] ?? m.party ?? "",
          state: m.state ?? "",
          district,
          phone: m.phone ?? null,
          office: m.office ?? null,
          website: m.link ?? null,
          imageUrl: null,
        };
      });
      members.sort((a: any, b: any) => {
        if (a.chamber !== b.chamber) return a.chamber === "Senate" ? -1 : 1;
        return (Number(a.district) || 0) - (Number(b.district) || 0);
      });
      res.json(members);
    } catch (e) { handleError(res, e); }
  });

  // ── Voting record proxies ─────────────────────────────────────────────────────

  // ── Federal voting records via official government sources (no API key required) ──
  // Senate: senate.gov LIS roll call XML  |  House: clerk.house.gov EVS text files
  app.get("/api/politics/votes/federal/:bioguideId", requireAuth, async (req, res) => {
    try {
      const bioguideId = req.params.bioguideId;
      const memberName = (req.query.name as string | undefined)?.trim() ?? "";
      const memberTitle = (req.query.title as string | undefined)?.trim().toLowerCase() ?? "";

      if (!memberName) return res.status(400).json({ error: "Member name required (pass ?name=...)" });

      // Support both "First Last" and FEC format "LAST, FIRST MIDDLE NICK"
      // Collect ALL possible first-name initials so we still match preferred names
      // (e.g. FEC "CRUZ, RAFAEL EDWARD TED" → lastName="cruz", firstInitials={'r','e','t'})
      let lastName: string;
      const firstInitials = new Set<string>();
      if (memberName.includes(",")) {
        // FEC format: "LAST, FIRST [MIDDLE] [NICK]"
        const [lastPart, restPart = ""] = memberName.split(",");
        lastName = lastPart.trim().toLowerCase();
        restPart.trim().split(/\s+/).filter(Boolean).forEach(w => firstInitials.add(w[0].toLowerCase()));
      } else {
        const nameParts = memberName.trim().split(/\s+/);
        lastName = nameParts[nameParts.length - 1].toLowerCase();
        if (nameParts.length > 1) firstInitials.add(nameParts[0][0].toLowerCase());
      }
      const firstName = [...firstInitials][0] ?? ""; // used for display / fallback

      const isSenator = memberTitle.includes("senator") || memberTitle.includes("senate");
      const currentYear = new Date().getFullYear();
      // 119th Congress (2025–2026). Session 1 = odd year (2025), Session 2 = even year (2026).
      const CONGRESS = 119;
      const SESSION = currentYear % 2 === 0 ? 2 : 1;

      // ── XML helpers ──────────────────────────────────────────────────────────
      function xmlTag(xml: string, tag: string): string {
        const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
        return m ? m[1].trim().replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">") : "";
      }
      function xmlBlocks(xml: string, tag: string): string[] {
        return xml.match(new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi")) ?? [];
      }

      let votes: any[] = [];

      if (isSenator) {
        // ── Senate ─────────────────────────────────────────────────────────────
        // Get vote numbers from the current session's menu; fall back to previous session.
        const getSenateVoteNums = async (sess: number): Promise<string[]> => {
          const r = await fetch(
            `https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_${CONGRESS}_${sess}.xml`,
            { signal: AbortSignal.timeout(10000) }
          );
          if (!r.ok) return [];
          const xml = await r.text();
          return xmlBlocks(xml, "vote")
            .map((b) => xmlTag(b, "vote_number"))
            .filter(Boolean);
        };

        let voteNums = await getSenateVoteNums(SESSION);
        // If current session has too few votes, also include recent ones from previous session
        if (voteNums.length < 20 && SESSION > 1) {
          const prevNums = await getSenateVoteNums(SESSION - 1);
          voteNums = [...voteNums, ...prevNums.slice(0, 40)];
        }

        // Fetch individual vote XMLs in parallel; extract ALL metadata from the file itself
        const fetchSenVote = async (voteNum: string, sess: number) => {
          const padded = voteNum.padStart(5, "0");
          const url = `https://www.senate.gov/legislative/LIS/roll_call_votes/vote${CONGRESS}${sess}/vote_${CONGRESS}_${sess}_${padded}.xml`;
          try {
            const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
            if (!r.ok) return null;
            const xml = await r.text();
            // Guard: ensure this file is actually for the expected congress
            const xmlCongress = xmlTag(xml, "congress");
            if (xmlCongress && xmlCongress !== String(CONGRESS)) return null;
            // Find member by last name + any known first initial (handles FEC multi-name format)
            const memberBlock = xmlBlocks(xml, "member").find((m) => {
              const mLast = xmlTag(m, "last_name").toLowerCase();
              if (mLast !== lastName) return false;
              if (firstInitials.size === 0) return true; // no first name constraint
              const mFirst = xmlTag(m, "first_name").toLowerCase();
              return firstInitials.has(mFirst[0]);
            });
            if (!memberBlock) return null;
            return {
              billNumber:      xmlTag(xml, "vote_title") || `Senate Vote #${voteNum}`,
              billDescription: xmlTag(xml, "vote_question_text") || xmlTag(xml, "question") || "",
              voteDate:        xmlTag(xml, "vote_date"),   // Full date: "December 18, 2025, 09:42 PM"
              memberVote:      xmlTag(memberBlock, "vote_cast"),
              url,
            };
          } catch { return null; }
        };

        // voteNums = [currentSession nums..., prevSession nums...] — tag each with session
        const curSessionNums = await getSenateVoteNums(SESSION);
        const curCount = curSessionNums.length;
        const allNums = voteNums.slice(0, 60);
        const settled = await Promise.allSettled(
          allNums.map((num, i) => fetchSenVote(num, i < curCount ? SESSION : Math.max(1, SESSION - 1)))
        );
        votes = settled
          .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled" && r.value !== null)
          .map((r) => r.value)
          .slice(0, 20);

      } else {
        // ── House ──────────────────────────────────────────────────────────────
        // clerk.house.gov EVS files at /evs/{year}/roll{NNN}.xml
        // Modern format (2020+): XML with <rollcall-vote> root element
        // Legacy format: plain text with ---- YEAS / ---- NAYS sections

        // Parse metadata — handles both XML and legacy plain-text format
        const parseHouseVoteContent = (content: string, rollNum: number) => {
          if (content.includes("<rollcall-vote")) {
            return {
              date:     xmlTag(content, "action-date") || "",
              bill:     xmlTag(content, "legis-num") || xmlTag(content, "vote-desc") || `Roll #${rollNum}`,
              question: xmlTag(content, "vote-desc") || xmlTag(content, "vote-question") || "",
            };
          }
          // Legacy plain-text
          const dateMatch    = content.match(/(\d{1,2}-\w{3}-\d{4})/);
          const questionMatch = content.match(/QUESTION:\s+(.+)/);
          const titleMatch   = content.match(/BILL TITLE:\s+(.+)/);
          const billMatch    = content.match(/^\s*(\S.+?)\s{3,}(?:YEA-AND-NAY|RECORDED VOTE|TWO-THIRDS)/im);
          return {
            date:     dateMatch?.[1] ?? "",
            bill:     titleMatch?.[1]?.trim() || billMatch?.[1]?.trim() || `Roll #${rollNum}`,
            question: questionMatch?.[1]?.trim() ?? "",
          };
        };

        // Find member vote — handles both XML and legacy plain-text format
        const findHouseMemberVoteContent = (content: string): string | null => {
          if (content.includes("<rollcall-vote")) {
            // Each <recorded-vote> block has a <legislator> tag (text: "Williams, Roger") and <vote>
            const blocks = xmlBlocks(content, "recorded-vote");
            const nameRx = new RegExp(lastName, "i");
            for (const block of blocks) {
              if (nameRx.test(block)) {
                return xmlTag(block, "vote") || null;
              }
            }
            return null;
          }
          // Legacy plain-text: scan YEAS/NAYS sections
          const sections: [RegExp, string][] = [
            [/---- YEAS[\s\S]*?(?=\n----|\n\n----)/i,               "Yea"],
            [/---- NAYS[\s\S]*?(?=\n----|\n\n----)/i,               "Nay"],
            [/---- NOT VOTING[\s\S]*?(?=\n----|\n\n----|$)/i,       "Not Voting"],
            [/---- ANSWERED "PRESENT"[\s\S]*?(?=\n----|\n\n----|$)/i, "Present"],
          ];
          const nameRx = new RegExp(`\\b${lastName}\\b`, "i");
          for (const [pattern, voteName] of sections) {
            const section = content.match(pattern)?.[0] ?? "";
            if (section && nameRx.test(section)) return voteName;
          }
          return null;
        };

        const fetchHouseVote = async (year: number, rollNum: number) => {
          const padded = String(rollNum).padStart(3, "0");
          const url = `https://clerk.house.gov/evs/${year}/roll${padded}.xml`;
          try {
            const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
            if (!r.ok) return null;
            const content = await r.text();
            if (!content.includes("<rollcall-vote") && !content.includes("---- YEAS")) return null;
            const memberVote = findHouseMemberVoteContent(content);
            if (!memberVote) return null;
            const meta = parseHouseVoteContent(content, rollNum);
            return { billNumber: meta.bill, billDescription: meta.question, voteDate: meta.date, memberVote, url };
          } catch { return null; }
        };

        // Step 1: Parallel milestone checks to find approximate current max roll
        // (avoids slow sequential binary search; milestones spaced 50 apart so real max
        //  is within 50 of the highest hit, letting us add a 100-roll buffer safely)
        let houseYear = currentYear;
        const milestones = [50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 600, 700];
        const milestoneChecks = await Promise.allSettled(
          milestones.map(async (n) => {
            const r = await fetch(
              `https://clerk.house.gov/evs/${houseYear}/roll${String(n).padStart(3, "0")}.xml`,
              { signal: AbortSignal.timeout(6000) }
            );
            return { n, ok: r.ok };
          })
        );
        let approxMax = 0;
        for (const c of milestoneChecks) {
          if (c.status === "fulfilled" && c.value.ok) approxMax = Math.max(approxMax, c.value.n);
        }

        // Fall back to previous year if current year has too few rolls yet
        if (approxMax < 50) {
          houseYear = currentYear - 1;
          const prevChecks = await Promise.allSettled(
            [400, 500, 600, 700, 800].map(async (n) => {
              const r = await fetch(
                `https://clerk.house.gov/evs/${houseYear}/roll${String(n).padStart(3, "0")}.xml`,
                { signal: AbortSignal.timeout(6000) }
              );
              return { n, ok: r.ok };
            })
          );
          approxMax = 0;
          for (const c of prevChecks) {
            if (c.status === "fulfilled" && c.value.ok) approxMax = Math.max(approxMax, c.value.n);
          }
          if (approxMax > 0) approxMax += 100; // buffer toward year-end
        }

        if (approxMax === 0) {
          return res.status(502).json({ error: "Could not access House roll call records." });
        }

        // Step 2: Probe 100 rolls from (approxMax + 100) downward in parallel
        // The +100 buffer ensures we don't miss rolls above the last milestone hit
        const probeFrom = approxMax + 100;
        const probeNums = Array.from({ length: Math.min(100, probeFrom) }, (_, i) => probeFrom - i);
        const settled = await Promise.allSettled(probeNums.map((n) => fetchHouseVote(houseYear, n)));
        votes = settled
          .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled" && r.value !== null)
          .map((r) => r.value)
          .slice(0, 20);
      }

      if (votes.length === 0) {
        return res.status(404).json({
          error: `No recent votes found for "${memberName}".`,
        });
      }

      res.json(votes);
    } catch (e) { handleError(res, e); }
  });

  // FEC — campaign finance for a federal member
  // Accepts: ?name=FULL_NAME&state=TX&office=H|S
  app.get("/api/politics/finance/federal/:bioguideId", requireAuth, async (req, res) => {
    try {
      const apiKey = process.env.FEC_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "FEC_API_KEY not configured" });

      const { name = "", state = "", office = "H" } = req.query as Record<string, string>;
      const nameParts = name.trim().split(/\s+/);
      const lastName  = nameParts[nameParts.length - 1].toLowerCase();
      const fecOffice = office.toUpperCase() === "S" ? "S" : "H";

      // FEC uses even-year cycles: 2025-2026 => cycle 2026
      const currentYear = new Date().getFullYear();
      let fecCycle = currentYear % 2 === 0 ? currentYear : currentYear + 1;

      // Helper: search for FEC candidate
      const findCandidate = async (cycle: number) => {
        const p = new URLSearchParams({
          api_key: apiKey,
          q:        lastName,
          office:   fecOffice,
          cycle:    String(cycle),
          per_page: "20",
          sort:     "-receipts",
        });
        if (state) p.set("state", state.toUpperCase());
        const r = await fetch(`https://api.open.fec.gov/v1/candidates/?${p}`, {
          signal: AbortSignal.timeout(10000),
        });
        if (!r.ok) return null;
        const d = await r.json();
        const results: any[] = d.results ?? [];
        // Prefer candidate whose name contains our last name
        return results.find(c => (c.name ?? "").toLowerCase().includes(lastName)) ?? results[0] ?? null;
      };

      let candidate = await findCandidate(fecCycle);
      if (!candidate) {
        candidate = await findCandidate(fecCycle - 2); // try previous cycle
        if (candidate) fecCycle -= 2;
      }
      if (!candidate) {
        return res.status(404).json({ error: `No FEC record found for "${name}"` });
      }

      // Get principal committee — candidates endpoint sometimes returns empty array,
      // so fall back to a direct committee lookup by candidate_id
      let committeeId: string | undefined = candidate.principal_committees?.[0]?.committee_id;
      if (!committeeId) {
        const cmteResp = await fetch(
          `https://api.open.fec.gov/v1/candidate/${candidate.candidate_id}/committees/?designation=P&cycle=${fecCycle}&per_page=1&api_key=${apiKey}`,
          { signal: AbortSignal.timeout(10000) }
        );
        if (cmteResp.ok) {
          const cmteData = await cmteResp.json();
          committeeId = cmteData.results?.[0]?.committee_id;
        }
        // If still nothing, try without cycle filter (catches candidates between cycles)
        if (!committeeId) {
          const cmteResp2 = await fetch(
            `https://api.open.fec.gov/v1/candidate/${candidate.candidate_id}/committees/?designation=P&per_page=1&api_key=${apiKey}`,
            { signal: AbortSignal.timeout(10000) }
          );
          if (cmteResp2.ok) {
            const cmteData2 = await cmteResp2.json();
            committeeId = cmteData2.results?.[0]?.committee_id;
          }
        }
      }
      if (!committeeId) {
        return res.status(404).json({ error: `No FEC committee found for ${candidate.name}` });
      }

      // Parallel: committee totals + top employers + top individual donors + top PAC/company donors
      // Use allSettled so a single slow/failed FEC call doesn't kill the whole response
      const safeJson = async (r: Response) => { try { return r.ok ? await r.json() : {}; } catch { return {}; } };
      const [totalsRes, contribRes, donorsRes, pacRes] = await Promise.allSettled([
        fetch(
          `https://api.open.fec.gov/v1/committee/${committeeId}/totals/?cycle=${fecCycle}&per_page=1&api_key=${apiKey}`,
          { signal: AbortSignal.timeout(12000) }
        ).then(safeJson),
        fetch(
          `https://api.open.fec.gov/v1/schedules/schedule_a/by_employer/?committee_id=${committeeId}&cycle=${fecCycle}&per_page=12&sort=-total&api_key=${apiKey}`,
          { signal: AbortSignal.timeout(12000) }
        ).then(safeJson),
        fetch(
          `https://api.open.fec.gov/v1/schedules/schedule_a/?committee_id=${committeeId}&cycle=${fecCycle}&per_page=50&sort=-contribution_receipt_amount&api_key=${apiKey}`,
          { signal: AbortSignal.timeout(12000) }
        ).then(safeJson),
        fetch(
          `https://api.open.fec.gov/v1/schedules/schedule_a/?committee_id=${committeeId}&cycle=${fecCycle}&contributor_type=committee&per_page=20&sort=-contribution_receipt_amount&api_key=${apiKey}`,
          { signal: AbortSignal.timeout(12000) }
        ).then(safeJson),
      ]);

      const totalsData = totalsRes.status  === "fulfilled" ? totalsRes.value  : {};
      const contribData = contribRes.status === "fulfilled" ? contribRes.value : {};
      const donorsData  = donorsRes.status  === "fulfilled" ? donorsRes.value  : {};
      const pacData     = pacRes.status     === "fulfilled" ? pacRes.value     : {};

      const totals  = totalsData.results?.[0] ?? {};
      const totalRaised       = totals.receipts ?? 0;
      const individualTotal   = totals.individual_contributions ?? 0;
      const pacTotal          = totals.other_political_committee_contributions ?? 0;

      const SKIP_EMPLOYERS = new Set(["N/A", "NONE", "NOT EMPLOYED", "INFORMATION REQUESTED", "SELF-EMPLOYED", "RETIRED", "HOMEMAKER", "NULL", ""]);
      const topContributors = ((contribData.results ?? []) as any[])
        .filter(c => c.employer && !SKIP_EMPLOYERS.has((c.employer ?? "").toUpperCase().trim()))
        .slice(0, 10)
        .map(c => ({ name: c.employer as string, total: (c.total ?? 0) as number, count: (c.count ?? 0) as number }));

      // Top individual donors — dedupe by name, sum their amounts
      const donorMap = new Map<string, { name: string; employer: string; occupation: string; amount: number }>();
      for (const d of (donorsData.results ?? []) as any[]) {
        const name = (d.contributor_name ?? "").trim();
        if (!name || name.toUpperCase() === "N/A") continue;
        const existing = donorMap.get(name);
        const amount = d.contribution_receipt_amount ?? 0;
        if (existing) {
          existing.amount += amount;
        } else {
          donorMap.set(name, {
            name,
            employer:   (d.contributor_employer ?? "").trim(),
            occupation: (d.contributor_occupation ?? "").trim(),
            amount,
          });
        }
      }
      const topDonors = [...donorMap.values()]
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);

      // Top individual donations from people with a real company employer
      // Shows the single largest contribution per person, keeping their employer visible
      const SKIP_EMPLOYERS_SET = new Set([
        "N/A", "NONE", "NOT EMPLOYED", "INFORMATION REQUESTED", "INFORMATION REQUESTED PER BEST EFFORTS",
        "SELF-EMPLOYED", "SELF EMPLOYED", "RETIRED", "HOMEMAKER", "NULL", "NONE", "NA", "",
        "UNEMPLOYED", "STUDENT", "NOT APPLICABLE",
      ]);
      const orgDonorMap = new Map<string, { name: string; employer: string; occupation: string; amount: number }>();
      for (const d of (donorsData.results ?? []) as any[]) {
        const name     = (d.contributor_name ?? "").trim();
        const employer = (d.contributor_employer ?? "").trim();
        if (!name || !employer) continue;
        if (SKIP_EMPLOYERS_SET.has(employer.toUpperCase())) continue;
        const amount = d.contribution_receipt_amount ?? 0;
        const existing = orgDonorMap.get(name);
        if (existing) {
          existing.amount += amount;
        } else {
          orgDonorMap.set(name, {
            name,
            employer,
            occupation: (d.contributor_occupation ?? "").trim(),
            amount,
          });
        }
      }
      const topOrgDonors = [...orgDonorMap.values()]
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);

      // Top PAC / corporate donors — contributions from other committees
      const pacMap = new Map<string, { name: string; amount: number }>();
      for (const d of (pacData.results ?? []) as any[]) {
        const name = (d.contributor_name ?? "").trim();
        if (!name) continue;
        const amount = d.contribution_receipt_amount ?? 0;
        const existing = pacMap.get(name);
        if (existing) {
          existing.amount += amount;
        } else {
          pacMap.set(name, { name, amount });
        }
      }
      const topPacDonors = [...pacMap.values()]
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);

      res.json({
        candidateName:   (candidate.name as string),
        candidateId:     (candidate.candidate_id as string),
        cycle:           fecCycle,
        totalRaised,
        individualTotal,
        pacTotal,
        topContributors,
        topDonors,
        topOrgDonors,
        topPacDonors,
        fecUrl: `https://www.fec.gov/data/candidate/${candidate.candidate_id}/`,
      });
    } catch (e) { handleError(res, e); }
  });

  // ── Campaign spending breakdown (FEC Schedule B) ─────────────────────────────
  // Accepts: ?name=FEC_NAME&state=TX&office=S|H
  app.get("/api/politics/spending/federal", requireAuth, async (req, res) => {
    try {
      const apiKey = process.env.FEC_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "FEC_API_KEY not configured" });

      const { name = "", state = "", office = "H" } = req.query as Record<string, string>;
      // Comma-aware FEC name parsing: "CRUZ, RAFAEL EDWARD TED" → lastName = "cruz"
      const lastName = name.includes(",")
        ? name.split(",")[0].trim().toLowerCase()
        : name.trim().split(/\s+/).slice(-1)[0].toLowerCase();
      const fecOffice = office.toUpperCase() === "S" ? "S" : "H";

      const currentYear = new Date().getFullYear();
      let fecCycle = currentYear % 2 === 0 ? currentYear : currentYear + 1;

      const safeJson = async (r: Response) => { try { return r.ok ? await r.json() : {}; } catch { return {}; } };

      // Find FEC candidate — comma-aware match, try multiple cycles
      const findCandidate = async (cycle: number) => {
        const p = new URLSearchParams({ api_key: apiKey, q: lastName, office: fecOffice, cycle: String(cycle), per_page: "20", sort: "-receipts" });
        if (state) p.set("state", state.toUpperCase());
        const r = await fetch(`https://api.open.fec.gov/v1/candidates/?${p}`, { signal: AbortSignal.timeout(10000) });
        if (!r.ok) return null;
        const results: any[] = (await r.json()).results ?? [];
        return results.find(c => (c.name ?? "").toLowerCase().startsWith(lastName)) ?? results[0] ?? null;
      };

      let candidate: any = null;
      for (const tryCycle of [fecCycle, fecCycle - 2, fecCycle - 4]) {
        candidate = await findCandidate(tryCycle);
        if (candidate) { fecCycle = tryCycle; break; }
      }
      if (!candidate) return res.status(404).json({ error: `No FEC record found for "${name}"` });
      console.log(`[spending] candidate=${candidate.candidate_id} name=${candidate.name} cycle=${fecCycle}`);

      // Get the principal committee — try cycle-specific then any
      let committeeId: string | undefined = candidate.principal_committees?.[0]?.committee_id;
      if (!committeeId) {
        for (const url of [
          `https://api.open.fec.gov/v1/candidate/${candidate.candidate_id}/committees/?designation=P&cycle=${fecCycle}&per_page=5&api_key=${apiKey}`,
          `https://api.open.fec.gov/v1/candidate/${candidate.candidate_id}/committees/?designation=P&per_page=5&api_key=${apiKey}`,
        ]) {
          const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
          if (r.ok) { committeeId = (await r.json()).results?.[0]?.committee_id; }
          if (committeeId) break;
        }
      }
      console.log(`[spending] committeeId=${committeeId}`);
      if (!committeeId) return res.status(404).json({ error: `No FEC committee found for ${candidate.name}` });

      // Fetch official total disbursements from committee totals (accurate, not limited by pagination)
      let officialTotal = 0;
      let activeCycle = fecCycle;
      for (const tryCycle of [fecCycle, fecCycle - 2, fecCycle - 4]) {
        const totalsUrl = `https://api.open.fec.gov/v1/committee/${committeeId}/totals/?cycle=${tryCycle}&per_page=2&api_key=${apiKey}`;
        const totalsData = await fetch(totalsUrl, { signal: AbortSignal.timeout(10000) }).then(safeJson);
        const t = (totalsData.results ?? [])[0];
        if (t?.disbursements != null) {
          officialTotal = t.disbursements;
          activeCycle = tryCycle;
          console.log(`[spending] officialTotal=${officialTotal} from committee totals cycle=${tryCycle}`);
          break;
        }
      }

      // Fetch raw Schedule B transactions for category breakdown (top 100 by amount)
      let disbursements: any[] = [];

      for (const tryCycle of [fecCycle, fecCycle - 2, fecCycle - 4]) {
        for (const cycleParam of ["two_year_period", "cycle"]) {
          const url = `https://api.open.fec.gov/v1/schedules/schedule_b/?committee_id=${committeeId}&${cycleParam}=${tryCycle}&per_page=100&sort=-disbursement_amount&api_key=${apiKey}`;
          console.log(`[spending] trying: ${url.replace(apiKey, "***")}`);
          const r = await fetch(url, { signal: AbortSignal.timeout(12000) }).then(safeJson);
          console.log(`[spending] results count=${(r.results ?? []).length} pagination=${JSON.stringify(r.pagination ?? {})}`);
          disbursements = (r.results ?? []) as any[];
          if (disbursements.length > 0) { activeCycle = tryCycle; break; }
        }
        if (disbursements.length > 0) break;
      }
      console.log(`[spending] final disbursements=${disbursements.length} activeCycle=${activeCycle}`);

      // Friendly labels for FEC disbursement purpose descriptions
      const PURPOSE_LABELS: Record<string, string> = {
        "MEDIA":           "Advertising & Media",
        "ADVERTISING":     "Advertising & Media",
        "DIGITAL":         "Digital & Technology",
        "ONLINE":          "Digital & Technology",
        "PAYROLL":         "Payroll & Staff",
        "SALARY":          "Payroll & Staff",
        "WAGES":           "Payroll & Staff",
        "ADMINISTRATIVE":  "Administrative",
        "OFFICE":          "Administrative",
        "SUPPLIES":        "Administrative",
        "FUNDRAISING":     "Fundraising",
        "CONTRIBUTION":    "Contributions to Others",
        "TRAVEL":          "Travel & Lodging",
        "LODGING":         "Travel & Lodging",
        "AIRFARE":         "Travel & Lodging",
        "HOTEL":           "Travel & Lodging",
        "POLLING":         "Polling & Research",
        "RESEARCH":        "Polling & Research",
        "CONSULTING":      "Consulting",
        "LEGAL":           "Legal & Compliance",
        "COMPLIANCE":      "Legal & Compliance",
        "PRINTING":        "Printing & Mailers",
        "POSTAGE":         "Printing & Mailers",
        "MAILING":         "Printing & Mailers",
        "EVENT":           "Events & Rallies",
        "CATERING":        "Events & Rallies",
      };

      const categorizePurpose = (desc: string): string => {
        const upper = desc.toUpperCase();
        for (const [kw, label] of Object.entries(PURPOSE_LABELS)) {
          if (upper.includes(kw)) return label;
        }
        // Title-case the raw description as fallback
        return desc.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ") || "Other";
      };

      // Aggregate by purpose category
      const categoryMap = new Map<string, number>();
      const vendorMap   = new Map<string, { name: string; purpose: string; total: number }>();

      for (const d of disbursements) {
        const amt  = (d.disbursement_amount ?? 0) as number;
        const desc = (d.disbursement_description ?? d.purpose_full ?? "Other").trim();
        const cat  = categorizePurpose(desc);
        categoryMap.set(cat, (categoryMap.get(cat) ?? 0) + amt);

        const vendorName = (d.recipient_name ?? "").trim();
        if (vendorName) {
          const existing = vendorMap.get(vendorName);
          if (existing) { existing.total += amt; }
          else { vendorMap.set(vendorName, { name: vendorName, purpose: desc, total: amt }); }
        }
      }

      // Use official total from FEC committee totals; fall back to summing records if unavailable
      const summedDisbursements = [...categoryMap.values()].reduce((s, v) => s + v, 0);
      const totalDisbursements = officialTotal > 0 ? officialTotal : summedDisbursements;

      const byPurpose = [...categoryMap.entries()]
        .map(([purpose, total]) => ({ purpose, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);

      const topVendors = [...vendorMap.values()]
        .sort((a, b) => b.total - a.total)
        .slice(0, 8);

      res.json({
        totalDisbursements,
        cycleLabel: `${activeCycle - 1}–${activeCycle}`,
        byPurpose,
        topVendors,
        fecUrl: `https://www.fec.gov/data/candidate/${candidate.candidate_id}/?tab=spending`,
      });
    } catch (e) { handleError(res, e); }
  });

  // ── Federal government spending in a representative's state/district ──────────
  // Uses USASpending.gov public API (no key required)
  // Accepts: ?state=TX&office=S|H&district=10  (district only for House)
  app.get("/api/politics/spending/government", requireAuth, async (req, res) => {
    try {
      const { state = "", office = "H", district = "" } = req.query as Record<string, string>;
      if (!state) return res.status(400).json({ error: "state is required" });

      const isSenate = office.toUpperCase() === "S";
      const fy = new Date().getMonth() >= 9
        ? new Date().getFullYear() + 1
        : new Date().getFullYear();
      const fyStart = `${fy - 1}-10-01`;
      const fyEnd   = `${fy}-09-30`;

      const safePost = async (url: string, body: object) => {
        try {
          const r = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(14000),
          });
          return r.ok ? await r.json() : {};
        } catch { return {}; }
      };

      const districtPadded = district ? district.replace(/\D/g, "").padStart(2, "0") : "";
      const districtCode   = districtPadded ? `${state.toUpperCase()}-${districtPadded}` : state.toUpperCase();
      const hasDistrict    = !isSenate && !!districtPadded;

      // Geography totals always use state-level — congressional_district geo_layer is
      // unreliable in USASpending's API. We use place_of_performance_locations for the
      // category breakdowns instead, which DOES support district filtering.
      const stateGeoBody = (extra: object = {}) => ({
        scope: "place_of_performance", geo_layer: "state",
        geo_layer_filters: [state.toUpperCase()],
        filters: { time_period: [{ start_date: fyStart, end_date: fyEnd }], ...extra },
        subawards: false,
      });

      // Category breakdowns: district-filtered for House reps, state for senators
      const geoFilter = hasDistrict
        ? [{ country: "USA", state: state.toUpperCase(), congressional_district: districtPadded }]
        : [{ country: "USA", state: state.toUpperCase() }];

      const baseFilters = {
        time_period:                    [{ start_date: fyStart, end_date: fyEnd }],
        place_of_performance_locations: geoFilter,
      };

      const contractCodes  = ["A","B","C","D"];
      const grantCodes     = ["02","03","04","05"];
      const directPayCodes = ["06","10"];
      const loanCodes      = ["07","08"];

      // Previous FY fallback
      const prevFyStart = `${fy - 2}-10-01`;
      const prevFyEnd   = `${fy - 1}-09-30`;
      const prevBaseFilters = {
        time_period:                    [{ start_date: prevFyStart, end_date: prevFyEnd }],
        place_of_performance_locations: geoFilter,
      };

      const assistanceCodes = ["02","03","04","05","06","07","08","09","10","11"];
      const cfdaFilters     = { ...baseFilters,     award_type_codes: assistanceCodes };
      const cfdaFiltersPrev = { ...prevBaseFilters, award_type_codes: assistanceCodes };
      const catBody = (filters: object, limit = 10) => ({ filters, limit, page: 1, subawards: false });

      const [
        totalRes, contractsRes, grantsRes, directRes, loansRes,
        programRes,   agencyRes,   recipientRes,
        programResPrev, agencyResPrev, recipientResPrev,
      ] = await Promise.allSettled([
        safePost("https://api.usaspending.gov/api/v2/search/spending_by_geography/", stateGeoBody()),
        safePost("https://api.usaspending.gov/api/v2/search/spending_by_geography/", stateGeoBody({ award_type_codes: contractCodes })),
        safePost("https://api.usaspending.gov/api/v2/search/spending_by_geography/", stateGeoBody({ award_type_codes: grantCodes })),
        safePost("https://api.usaspending.gov/api/v2/search/spending_by_geography/", stateGeoBody({ award_type_codes: directPayCodes })),
        safePost("https://api.usaspending.gov/api/v2/search/spending_by_geography/", stateGeoBody({ award_type_codes: loanCodes })),
        safePost("https://api.usaspending.gov/api/v2/search/spending_by_category/cfda/",            catBody(cfdaFilters, 10)),
        safePost("https://api.usaspending.gov/api/v2/search/spending_by_category/awarding_agency/", catBody(baseFilters, 8)),
        safePost("https://api.usaspending.gov/api/v2/search/spending_by_category/recipient_type/",  catBody(baseFilters, 10)),
        safePost("https://api.usaspending.gov/api/v2/search/spending_by_category/cfda/",            catBody(cfdaFiltersPrev, 10)),
        safePost("https://api.usaspending.gov/api/v2/search/spending_by_category/awarding_agency/", catBody(prevBaseFilters, 8)),
        safePost("https://api.usaspending.gov/api/v2/search/spending_by_category/recipient_type/",  catBody(prevBaseFilters, 10)),
      ]);

      // Pick current FY if it has results, otherwise fall back to previous FY
      const pickBest = (curr: PromiseSettledResult<any>, prev: PromiseSettledResult<any>) => {
        const c = curr.status === "fulfilled" ? (curr.value ?? {}) : {};
        const p = prev.status === "fulfilled" ? (prev.value ?? {}) : {};
        return (c.results ?? []).length > 0 ? c : p;
      };
      const programData  = pickBest(programRes,   programResPrev);
      const agencyData   = pickBest(agencyRes,    agencyResPrev);
      const recipientData = pickBest(recipientRes, recipientResPrev);

      const getGeoAmount = (res: PromiseSettledResult<any>) => {
        if (res.status !== "fulfilled") return 0;
        // Always using state-level geography — find our state's row by shape_code
        const row = ((res.value?.results ?? []) as any[]).find(
          (r: any) => (r.shape_code ?? "").toUpperCase() === state.toUpperCase()
        );
        return (row?.aggregated_amount ?? 0) as number;
      };

      const totalSpending  = getGeoAmount(totalRes);
      const contractAmount = getGeoAmount(contractsRes);
      const grantAmount    = getGeoAmount(grantsRes);
      const directAmount   = getGeoAmount(directRes);
      const loanAmount     = getGeoAmount(loansRes);

      const awardTypeAmounts = [
        { label: "Contracts",       amount: contractAmount, description: "Paid to businesses for goods & services" },
        { label: "Grants",          amount: grantAmount,    description: "Research, education & community projects" },
        { label: "Direct Payments", amount: directAmount,   description: "Benefits to individuals (Social Security, veterans)" },
        { label: "Loans",           amount: loanAmount,     description: "Federal loans & loan guarantees" },
      ].filter(t => t.amount > 0).sort((a, b) => b.amount - a.amount);

      // Top federal assistance programs (CFDA)
      const rawPrograms = ((programData.results ?? []) as any[])
        .slice(0, 10)
        .map((p: any) => ({
          name:   (p.name ?? "").trim(),
          code:   p.code ?? "",
          amount: (p.amount ?? p.aggregated_amount ?? 0) as number,
        }))
        .filter((p: any) => p.name && p.amount > 0);
      const programTotal = rawPrograms.reduce((s: number, p: any) => s + p.amount, 0);
      const topPrograms  = rawPrograms.map((p: any) => ({
        ...p,
        pct: programTotal > 0 ? Math.round((p.amount / programTotal) * 100) : 0,
      }));

      // Top awarding agencies
      const topAgencies = ((agencyData.results ?? []) as any[])
        .slice(0, 8)
        .map((a: any) => ({
          name:   (a.name ?? a.awarding_agency_name ?? "").trim(),
          amount: (a.amount ?? a.aggregated_amount ?? a.obligated_amount ?? 0) as number,
        }))
        .filter((a: any) => a.name && a.amount > 0);

      // Who receives the money
      const recipientLabelMap: Record<string, string> = {
        "small_business":                  "Small Businesses",
        "other_than_small_business":       "Large Businesses",
        "individuals":                     "Individuals",
        "nonprofit":                       "Nonprofits",
        "state_governments":               "State Government",
        "local_governments":               "Local Government",
        "higher_educational_institutions": "Higher Education",
        "tribal_governments":              "Tribal Governments",
        "foreign_governments":             "Foreign Governments",
      };
      const recipientTypes = ((recipientData.results ?? []) as any[])
        .slice(0, 8)
        .map((r: any) => ({
          label:  recipientLabelMap[r.type ?? ""] ?? (r.name ?? r.type ?? "Other").trim(),
          amount: (r.amount ?? r.aggregated_amount ?? 0) as number,
        }))
        .filter((r: any) => r.label && r.amount > 0)
        .sort((a: any, b: any) => b.amount - a.amount);

      res.json({
        state:          state.toUpperCase(),
        fiscalYear:     fy,
        isSenate,
        hasDistrict,
        district:       districtPadded,
        districtCode,
        totalSpending,
        awardTypeAmounts,
        topPrograms,
        topAgencies,
        recipientTypes,
        usaSpendingUrl: `https://www.usaspending.gov/state/${state.toUpperCase()}/latest`,
      });
    } catch (e) { handleError(res, e); }
  });

  // Upcoming elections list — next 36 months, optionally filtered by state
  // Accepts: ?state=TX  (optional; omit for all states)
  app.get("/api/politics/elections/upcoming", requireAuth, async (req, res) => {
    try {
      const apiKey = process.env.GOOGLE_CIVIC_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "GOOGLE_CIVIC_API_KEY not configured" });

      const { state } = req.query as { state?: string };

      // ── Known federal elections not yet in Google Civic's database ──
      const FEDERAL_ELECTIONS = [
        {
          id: "fed-2026-midterm", federal: true,
          name: "2026 Midterm General Election",
          description: "All 435 House seats + 33 Senate seats up for election",
          date: "2026-11-03", ocdId: "ocd-division/country:us",
        },
        {
          id: "fed-2028-primary-iowa", federal: true,
          name: "2028 Presidential Primary Season",
          description: "Iowa caucuses kick off the presidential primary season",
          date: "2028-02-07", ocdId: "ocd-division/country:us",
        },
        {
          id: "fed-2028-super-tuesday", federal: true,
          name: "2028 Super Tuesday",
          description: "Multiple state presidential primaries held on a single day",
          date: "2028-03-07", ocdId: "ocd-division/country:us",
        },
        {
          id: "fed-2028-general", federal: true,
          name: "2028 Presidential General Election",
          description: "U.S. Presidential election — all 435 House seats and 34 Senate seats also on the ballot",
          date: "2028-11-07", ocdId: "ocd-division/country:us",
        },
      ];

      const today = new Date().toISOString().slice(0, 10);
      const cutoff = new Date(Date.now() + 36 * 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      // Fetch Google Civic elections list
      let civicElections: any[] = [];
      try {
        const resp = await fetch(
          `https://www.googleapis.com/civicinfo/v2/elections?key=${apiKey}`,
          { signal: AbortSignal.timeout(10000) }
        );
        if (resp.ok) {
          const data = await resp.json() as any;
          civicElections = ((data.elections ?? []) as any[])
            .filter(e => e.electionDay && e.electionDay >= today && e.electionDay <= cutoff && e.id !== "2000")
            .map(e => ({
              id: e.id, name: e.name, date: e.electionDay,
              ocdId: e.ocdDivisionId ?? null, federal: false, description: null,
            }));
        }
      } catch { /* Civic unavailable — continue with federal list */ }

      // Merge: include federal hardcoded entries unless Civic already has a same-date country-level entry
      const civicFederalDates = new Set(
        civicElections.filter(e => e.ocdId === "ocd-division/country:us").map(e => e.date)
      );
      const federalToAdd = FEDERAL_ELECTIONS.filter(
        f => f.date >= today && f.date <= cutoff && !civicFederalDates.has(f.date)
      );

      let all = [...civicElections, ...federalToAdd]
        .sort((a, b) => a.date.localeCompare(b.date));

      // State filter — federal elections always shown; state filter applies to non-federal only
      if (state?.trim()) {
        const sc = state.trim().toLowerCase();
        all = all.filter(e => {
          if (e.federal || e.ocdId === "ocd-division/country:us") return true;
          const ocd: string = (e.ocdId ?? "").toLowerCase();
          return ocd.includes(`/state:${sc}`);
        });
      }

      res.json(all);
    } catch (e) { handleError(res, e); }
  });

  // Candidates for a specific election — uses voterinfo with a state-capital address + electionId
  // Accepts: ?electionId=ID&state=TX
  app.get("/api/politics/elections/candidates", requireAuth, async (req, res) => {
    try {
      const apiKey = process.env.GOOGLE_CIVIC_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "GOOGLE_CIVIC_API_KEY not configured" });

      const { electionId, state } = req.query as { electionId?: string; state?: string };
      if (!electionId) return res.status(400).json({ error: "electionId is required" });

      // Map state codes to a representative address (state capital) for the voterinfo lookup
      const STATE_CAPITALS: Record<string, string> = {
        AL:"600 Dexter Ave, Montgomery, AL 36130",
        AK:"120 4th St, Juneau, AK 99801",
        AZ:"1700 W Washington St, Phoenix, AZ 85007",
        AR:"500 Woodlane St, Little Rock, AR 72201",
        CA:"1315 10th St, Sacramento, CA 95814",
        CO:"200 E Colfax Ave, Denver, CO 80203",
        CT:"210 Capitol Ave, Hartford, CT 06106",
        DE:"411 Legislative Ave, Dover, DE 19901",
        FL:"400 S Monroe St, Tallahassee, FL 32399",
        GA:"206 Washington St SW, Atlanta, GA 30334",
        HI:"415 S Beretania St, Honolulu, HI 96813",
        ID:"700 W Jefferson St, Boise, ID 83702",
        IL:"401 S 2nd St, Springfield, IL 62701",
        IN:"200 W Washington St, Indianapolis, IN 46204",
        IA:"1007 E Grand Ave, Des Moines, IA 50319",
        KS:"300 SW 10th Ave, Topeka, KS 66612",
        KY:"700 Capital Ave, Frankfort, KY 40601",
        LA:"900 N 3rd St, Baton Rouge, LA 70802",
        ME:"210 State St, Augusta, ME 04333",
        MD:"100 State Cir, Annapolis, MD 21401",
        MA:"24 Beacon St, Boston, MA 02133",
        MI:"100 N Capitol Ave, Lansing, MI 48933",
        MN:"75 Rev Dr Martin Luther King Jr Blvd, Saint Paul, MN 55155",
        MS:"400 High St, Jackson, MS 39201",
        MO:"201 W Capitol Ave, Jefferson City, MO 65101",
        MT:"1301 E 6th Ave, Helena, MT 59601",
        NE:"1445 K St, Lincoln, NE 68508",
        NV:"101 N Carson St, Carson City, NV 89701",
        NH:"107 N Main St, Concord, NH 03301",
        NJ:"125 W State St, Trenton, NJ 08608",
        NM:"490 Old Santa Fe Trail, Santa Fe, NM 87501",
        NY:"State St, Albany, NY 12224",
        NC:"1 E Edenton St, Raleigh, NC 27601",
        ND:"600 E Boulevard Ave, Bismarck, ND 58505",
        OH:"1 Capitol Sq, Columbus, OH 43215",
        OK:"2300 N Lincoln Blvd, Oklahoma City, OK 73105",
        OR:"900 Court St NE, Salem, OR 97301",
        PA:"501 N 3rd St, Harrisburg, PA 17120",
        RI:"82 Smith St, Providence, RI 02903",
        SC:"1100 Gervais St, Columbia, SC 29201",
        SD:"500 E Capitol Ave, Pierre, SD 57501",
        TN:"600 Charlotte Ave, Nashville, TN 37243",
        TX:"1100 Congress Ave, Austin, TX 78701",
        UT:"350 N State St, Salt Lake City, UT 84114",
        VT:"115 State St, Montpelier, VT 05633",
        VA:"1000 Bank St, Richmond, VA 23219",
        WA:"416 Sid Snyder Ave SW, Olympia, WA 98504",
        WV:"1900 Kanawha Blvd E, Charleston, WV 25305",
        WI:"2 E Main St, Madison, WI 53703",
        WY:"200 W 24th St, Cheyenne, WY 82002",
        DC:"1 Judiciary Square, Washington, DC 20001",
      };

      // Derive state from query param or fall back to TX
      const stateCode = (state ?? "TX").toUpperCase();
      const address = STATE_CAPITALS[stateCode] ?? STATE_CAPITALS["TX"];

      const resp = await fetch(
        `https://www.googleapis.com/civicinfo/v2/voterinfo?key=${apiKey}` +
        `&address=${encodeURIComponent(address)}&electionId=${encodeURIComponent(electionId)}&officialOnly=false`,
        { signal: AbortSignal.timeout(12000) }
      );

      if (!resp.ok) {
        const body = await resp.json().catch(() => ({})) as any;
        return res.status(resp.status).json({ error: body.error?.message ?? `Civic API error ${resp.status}` });
      }

      const vd = await resp.json() as any;
      let contests: any[] = ((vd.contests ?? []) as any[]).map((c: any) => ({
        office:   c.office ?? c.type ?? "Unknown",
        type:     c.type ?? null,
        district: c.district?.name ?? null,
        level:    (c.level ?? []).join(", ") || null,
        source:   "civic",
        candidates: ((c.candidates ?? []) as any[]).map((k: any) => ({
          name:     k.name,
          party:    k.party ?? null,
          phone:    k.phone ?? null,
          url:      k.candidateUrl ?? null,
          email:    k.email ?? null,
          photoUrl: k.photoUrl ?? null,
        })),
      }));

      // ── FEC fallback: when Civic has no contest data, pull federal candidates ──
      if (contests.length === 0) {
        const fecKey = process.env.FEC_API_KEY;
        if (fecKey) {
          const currentYear = new Date().getFullYear();
          const cycle = currentYear % 2 === 0 ? currentYear : currentYear + 1;

          // Fetch Senate + House candidates for this state in parallel
          const [senResp, houseResp] = await Promise.allSettled([
            fetch(
              `https://api.open.fec.gov/v1/candidates/?api_key=${fecKey}` +
              `&state=${stateCode}&office=S&cycle=${cycle}&per_page=20&page=1`,
              { signal: AbortSignal.timeout(8000) }
            ).then(r => r.json()),
            fetch(
              `https://api.open.fec.gov/v1/candidates/?api_key=${fecKey}` +
              `&state=${stateCode}&office=H&cycle=${cycle}&per_page=50&page=1`,
              { signal: AbortSignal.timeout(8000) }
            ).then(r => r.json()),
          ]);

          const mapFecCandidate = (c: any) => ({
            name:  c.name ?? c.candidate_id,
            party: c.party_full ?? c.party ?? null,
            url:   `https://www.fec.gov/data/candidate/${c.candidate_id}/`,
            phone: null, email: null, photoUrl: null,
          });

          if (senResp.status === "fulfilled") {
            const senators: any[] = (senResp.value?.results ?? []);
            if (senators.length > 0) {
              contests.push({
                office: `U.S. Senate — ${stateCode}`,
                type: "General", district: null, level: "federal", source: "fec",
                candidates: senators.map(mapFecCandidate),
              });
            }
          }

          if (houseResp.status === "fulfilled") {
            const reps: any[] = (houseResp.value?.results ?? []);
            // Group by district
            const byDistrict: Record<string, any[]> = {};
            for (const r of reps) {
              const dist = r.district ?? "At-Large";
              (byDistrict[dist] ??= []).push(r);
            }
            for (const [dist, members] of Object.entries(byDistrict).sort()) {
              contests.push({
                office: `U.S. House — ${stateCode}-${dist}`,
                type: "General", district: `District ${dist}`, level: "federal", source: "fec",
                candidates: members.map(mapFecCandidate),
              });
            }
          }
        }
      }

      const source = contests.length > 0
        ? (contests[0].source === "fec" ? "fec" : "civic")
        : "none";

      res.json({ contests, source });
    } catch (e) { handleError(res, e); }
  });

  // ── AI candidate overview ─────────────────────────────────────────────────────
  // POST /api/politics/candidate/summary
  // Body: { name, displayName, office, state, party?, topContributors?, topicBreakdown? }
  app.post("/api/politics/candidate/summary", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const enc = await storage.getAnthropicApiKeyEnc(uid);
      if (!enc) return res.status(402).json({ error: "No Anthropic API key saved. Add one in Settings → AI Features." });

      let apiKey: string;
      try { apiKey = decrypt(enc); }
      catch { return res.status(500).json({ error: "Failed to decrypt API key. Re-save it in Settings." }); }

      const { displayName, office, state, party, topContributors = [], topicBreakdown = [] } = req.body as {
        displayName: string; office: string; state: string; party?: string;
        topContributors: Array<{ name: string; total: number }>;
        topicBreakdown: Array<{ label: string; yea: number; nay: number; examples: Array<{ text: string; vote: string }> }>;
      };

      // Build a compact context block for Claude
      const financeContext = topContributors.length
        ? `Top campaign contributors: ${topContributors.slice(0, 5).map(c => c.name).join(", ")}.`
        : "";

      const voteContext = topicBreakdown.length
        ? topicBreakdown.map(b => {
            const total = b.yea + b.nay;
            const pct   = Math.round((b.yea / total) * 100);
            const stance = pct >= 65 ? "supports" : pct <= 35 ? "opposes" : "has a mixed record on";
            return `${b.label}: generally ${stance} (${b.yea} yea / ${b.nay} nay)`;
          }).join("; ")
        : "";

      const prompt = `You are a nonpartisan voter guide. Write a brief, factual overview of ${displayName} to help a voter understand who they'd be voting for.

Candidate: ${displayName}
Office sought: ${office} (${state})
${party ? `Party: ${party}` : ""}
${financeContext}
${voteContext ? `Voting record summary: ${voteContext}` : ""}

Write 3–4 concise paragraphs covering: (1) who they are and their background, (2) their key policy positions based on the voting data, (3) who funds their campaign and what that may indicate, and (4) a one-sentence neutral summary of what makes them distinctive.

Be factual, balanced, and avoid partisan framing. If you lack data for a section, skip it. Keep the total response under 200 words.`;

      const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 400,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!claudeRes.ok) {
        const errText = await claudeRes.text();
        return res.status(502).json({ error: "Claude API error", detail: errText.slice(0, 200) });
      }

      const claudeData = await claudeRes.json() as any;
      const summary: string = claudeData?.content?.[0]?.text ?? "";
      res.json({ summary });
    } catch (e) { handleError(res, e); }
  });

  // Robust JSON array extraction — handles markdown fences, preamble text, etc.
  function extractJsonArray(raw: string): any[] {
    const attempt = (s: string) => { const v = JSON.parse(s); if (!Array.isArray(v)) throw new Error("not array"); return v; };
    try { return attempt(raw.trim()); } catch {}
    const stripped = raw.replace(/^```(?:json)?\s*/im, "").replace(/\s*```\s*$/im, "").trim();
    try { return attempt(stripped); } catch {}
    const m = stripped.match(/\[[\s\S]*\]/);
    if (m) try { return attempt(m[0]); } catch {}
    throw new SyntaxError("No valid JSON array found in response");
  }

  // Call Claude with automatic retry on transient 502/529 overload errors
  async function claudeWithRetry(apiKey: string, body: object, maxRetries = 2): Promise<any> {
    let lastError: string = "";
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 2000 * attempt));
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (res.ok) return res.json();
      const errText = await res.text();
      lastError = errText;
      // Only retry on transient overload errors
      if (res.status !== 529 && res.status !== 502 && res.status !== 503) {
        throw new Error(`Claude API error ${res.status}: ${errText.slice(0, 200)}`);
      }
    }
    throw new Error(`Claude API temporarily unavailable. Please try again in a moment. (${lastError.slice(0, 100)})`);
  }

  // ── Voter Match — Auto-detect candidates from election names ─────────────────
  // POST /api/politics/voter-match/suggest-candidates
  // Body: { elections: Array<{ name, date?, level? }> }
  // Uses Claude to identify notable candidates for each election.
  app.post("/api/politics/voter-match/suggest-candidates", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const enc = (user as any).anthropicApiKeyEnc;
      if (!enc) return res.status(402).json({ error: "No Anthropic API key saved. Add one in Settings → AI Features." });

      let apiKey: string;
      try { apiKey = decrypt(enc); }
      catch { return res.status(500).json({ error: "Failed to decrypt API key. Re-save it in Settings." }); }

      const { elections = [] } = req.body as { elections: Array<{ name: string; date?: string; level?: string }> };
      if (elections.length === 0) return res.json({ candidates: [] });

      const electionList = elections
        .map((e, i) => `${i + 1}. "${e.name}"${e.date ? ` on ${e.date}` : ""}${e.level ? ` [${e.level}]` : ""}`)
        .join("\n");

      const prompt = `You are helping a voter research candidates for upcoming U.S. elections.

Elections to research:
${electionList}

Your job: identify the most likely candidates who would appear on each ballot. Use your knowledge of the state's political landscape, recent primaries, and prominent politicians. If you don't know confirmed candidates for a specific runoff or future election, suggest the most prominent politicians from that state/party who are plausible contenders based on context clues (e.g., for a Texas Democratic primary runoff, list well-known Texas Democrats who run for statewide or congressional offices).

IMPORTANT: Always return candidates for every election listed. Never return an empty array. If the exact candidates are unknown, make your best educated suggestions based on the state, party, and office type.

Return ONLY a raw JSON array starting with [ — absolutely no preamble, no markdown fences, no explanation:
[
  {
    "name": "Candidate Full Name",
    "party": "Party name",
    "office": "Office or race description",
    "race": "Which election name this is for"
  }
]

Rules:
- Include 2–6 candidates per election
- For primary runoffs, focus on the relevant party's top candidates
- Use the candidate's commonly used name (e.g., "Ted Cruz" not "Rafael Edward Cruz")
- If you're not certain, still include your best guesses — the user can edit them
- Do NOT return an empty array`;

      const claudeData = await claudeWithRetry(apiKey, {
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      });

      const raw: string = claudeData?.content?.[0]?.text ?? "[]";
      const candidates = extractJsonArray(raw);
      res.json({ candidates, note: candidates.length === 0 ? "no_candidates_found" : undefined });
    } catch (e: any) {
      if (e instanceof SyntaxError) return res.status(500).json({ error: "parse_error", message: "Could not parse AI response. Try again." });
      if (e.message?.includes("temporarily unavailable")) return res.status(503).json({ error: e.message });
      handleError(res, e);
    }
  });

  // ── Voter Match — AI-powered candidate alignment analysis ────────────────────
  // POST /api/politics/voter-match
  // Body: { candidates: Array<{ name, party?, office?, race? }> }
  // Reads user's issues + political identity from DB; returns per-candidate match scores.
  app.post("/api/politics/voter-match", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const enc = (user as any).anthropicApiKeyEnc;
      if (!enc) return res.status(402).json({ error: "No Anthropic API key saved. Add one in Settings → AI Features." });

      let apiKey: string;
      try { apiKey = decrypt(enc); }
      catch { return res.status(500).json({ error: "Failed to decrypt API key. Re-save it in Settings." }); }

      const { candidates = [] } = req.body as {
        candidates: Array<{ name: string; party?: string; office?: string; race?: string }>;
      };
      if (candidates.length === 0) return res.status(400).json({ error: "Provide at least one candidate name." });

      // Fetch user's issues + political identity from DB
      const uid = await storage.getTabUserId(user.id, "politics");
      const allIssues = await storage.getPoliticalIssues(uid);

      const myIssues = allIssues
        .filter((i: any) => i.category !== "Political Identity" && i.position && i.position !== "neutral")
        .sort((a: any, b: any) => (b.importance ?? 3) - (a.importance ?? 3));

      const identityItems = allIssues.filter((i: any) => i.category === "Political Identity");

      if (myIssues.length === 0 && identityItems.length === 0) {
        return res.status(400).json({ error: "No issues or political identity found. Add them in the Issues / Political Identity tabs first." });
      }

      // Build compact profile text
      const issueSummary = myIssues.length > 0
        ? myIssues.map((i: any) => {
            const imp = i.importance ?? 3;
            const impLabel = imp >= 5 ? "Critical" : imp >= 4 ? "Very important" : imp >= 3 ? "Important" : "Minor";
            return `- ${i.topic}: ${i.position} (${impLabel}${i.notes ? `; ${i.notes}` : ""})`;
          }).join("\n")
        : "No specific issues added.";

      const identitySummary = identityItems.length > 0
        ? identityItems.map((i: any) => `- ${i.topic}: ${i.position}`).join("\n")
        : "Not specified.";

      const candidateList = candidates
        .map((c, idx) =>
          `${idx + 1}. ${c.name}${c.party ? ` (${c.party})` : ""}${c.office ? ` — ${c.office}` : ""}${c.race ? ` [${c.race}]` : ""}`
        )
        .join("\n");

      const prompt = `You are a nonpartisan voter guide. Analyze how well each candidate aligns with this voter's profile. Be concise.

VOTER'S PROFILE
Issues (by importance):
${issueSummary}

Political Identity:
${identitySummary}

CANDIDATES
${candidateList}

Output ONLY a raw JSON array starting with [ — no preamble, no markdown fences, no explanation. For each candidate:
{
  "name": "Exact name from list",
  "matchScore": 0-100,
  "confidence": "high"|"medium"|"low",
  "party": "party or null",
  "office": "office description",
  "alignments": ["up to 2 key alignment points"],
  "divergences": ["up to 2 key differences"],
  "keyIssueBreakdown": [
    { "issue": "topic", "stance": "one sentence", "aligned": true|false }
  ],
  "recommendation": "One sentence summary for this voter.",
  "note": "if limited info available, say so"
}

Rules:
- matchScore = alignment with THIS voter's priorities (weight important issues heavily)
- keyIssueBreakdown: top 3 voter issues only
- Be concise — short strings, no redundancy
- Unknown/local candidates: confidence=low, note limited info`;

      const claudeData = await claudeWithRetry(apiKey, {
        model: "claude-sonnet-4-6",
        max_tokens: 6000,
        messages: [{ role: "user", content: prompt }],
      });

      const raw: string = claudeData?.content?.[0]?.text ?? "";
      const matches = extractJsonArray(raw);
      res.json({ matches });
    } catch (e: any) {
      if (e instanceof SyntaxError) return res.status(500).json({ error: "parse_error", message: "Could not parse AI response. Try again." });
      if (e.message?.includes("temporarily unavailable")) return res.status(503).json({ error: e.message });
      handleError(res, e);
    }
  });

  // Google Civic Information — elections, polling location, contests, drop boxes
  // Accepts: ?address=FULL_ADDRESS
  app.get("/api/politics/elections/civic", requireAuth, async (req, res) => {
    try {
      const apiKey = process.env.GOOGLE_CIVIC_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "GOOGLE_CIVIC_API_KEY not configured" });

      const { address } = req.query as { address?: string };
      if (!address?.trim()) return res.status(400).json({ error: "address is required" });

      // Detect if address is just a US state name or abbreviation (no street number)
      const US_STATE_BY_NAME: Record<string, string> = {
        "alabama":"al","alaska":"ak","arizona":"az","arkansas":"ar","california":"ca",
        "colorado":"co","connecticut":"ct","delaware":"de","florida":"fl","georgia":"ga",
        "hawaii":"hi","idaho":"id","illinois":"il","indiana":"in","iowa":"ia","kansas":"ks",
        "kentucky":"ky","louisiana":"la","maine":"me","maryland":"md","massachusetts":"ma",
        "michigan":"mi","minnesota":"mn","mississippi":"ms","missouri":"mo","montana":"mt",
        "nebraska":"ne","nevada":"nv","new hampshire":"nh","new jersey":"nj","new mexico":"nm",
        "new york":"ny","north carolina":"nc","north dakota":"nd","ohio":"oh","oklahoma":"ok",
        "oregon":"or","pennsylvania":"pa","rhode island":"ri","south carolina":"sc","south dakota":"sd",
        "tennessee":"tn","texas":"tx","utah":"ut","vermont":"vt","virginia":"va","washington":"wa",
        "west virginia":"wv","wisconsin":"wi","wyoming":"wy","district of columbia":"dc",
      };
      const VALID_ABBREVS = new Set(Object.values(US_STATE_BY_NAME));
      const addrLower = address.trim().toLowerCase();

      // Try to detect state from input — works for both state names AND embedded in full addresses
      let detectedState: string | null =
        US_STATE_BY_NAME[addrLower] ??
        (VALID_ABBREVS.has(addrLower) ? addrLower : null);

      // For full addresses, extract the 2-letter state code (e.g. "Austin, TX 78702" → "tx")
      if (!detectedState) {
        const m = address.match(/,\s*([A-Za-z]{2})\s*\d{5}/);  // ", TX 78702"
        if (!m) {
          // Also try trailing abbreviation: "Austin TX" or just "TX"
          const m2 = address.trim().match(/\b([A-Za-z]{2})\s*$/);
          if (m2 && VALID_ABBREVS.has(m2[1].toLowerCase())) {
            detectedState = m2[1].toLowerCase();
          }
        } else if (VALID_ABBREVS.has(m[1].toLowerCase())) {
          detectedState = m[1].toLowerCase();
        }
      }

      // A "full address" has a street number — skip voterinfo for state-only input
      const isFullAddress = /\d/.test(address.trim()) &&
        !(VALID_ABBREVS.has(addrLower) || US_STATE_BY_NAME[addrLower]);

      // Fetch elections list always; voterinfo only for real addresses
      const encoded = encodeURIComponent(address.trim());
      const [voterResp, electionsResp] = await Promise.all([
        isFullAddress
          ? fetch(
              `https://www.googleapis.com/civicinfo/v2/voterinfo?key=${apiKey}&address=${encoded}&officialOnly=false`,
              { signal: AbortSignal.timeout(10000) }
            )
          : Promise.resolve(null as any),
        fetch(
          `https://www.googleapis.com/civicinfo/v2/elections?key=${apiKey}`,
          { signal: AbortSignal.timeout(10000) }
        ),
      ]);

      // Elections list — filter to upcoming only, then filter by state if detected
      const today = new Date().toISOString().slice(0, 10);
      let upcomingElections: any[] = [];
      if (electionsResp.ok) {
        const ed = await electionsResp.json();
        upcomingElections = ((ed.elections ?? []) as any[])
          .filter(e => e.electionDay && e.electionDay >= today && e.id !== "2000") // 2000 = test election
          .filter(e => {
            if (!detectedState) return true;
            const ocd = (e.ocdDivisionId ?? "").toLowerCase();
            // Include national elections + elections for the detected state
            return ocd === "ocd-division/country:us" || ocd.includes(`state:${detectedState}`);
          })
          .sort((a, b) => a.electionDay.localeCompare(b.electionDay))
          .slice(0, 10)
          .map(e => ({ id: e.id, name: e.name, date: e.electionDay, ocdId: e.ocdDivisionId }));
      }

      // Voter info — only attempted for full addresses; null otherwise
      let voterInfo: any = null;
      if (voterResp && voterResp.ok) {
        const vd = await voterResp.json();
        const clean = (locs: any[]) => (locs ?? []).map((l: any) => ({
          name:   l.address?.locationName ?? null,
          line1:  l.address?.line1 ?? null,
          line2:  l.address?.line2 ?? null,
          city:   l.address?.city ?? null,
          state:  l.address?.state ?? null,
          zip:    l.address?.zip ?? null,
          hours:  l.pollingHours ?? l.hours ?? null,
          notes:  l.notes ?? null,
          startDate: l.startDate ?? null,
          endDate:   l.endDate ?? null,
        }));
        // Extract state admin body links + voter services
        const stateBody = (vd.state ?? [])[0]?.electionAdministrationBody ?? {};
        const localBody = (vd.state ?? [])[0]?.local_jurisdiction?.electionAdministrationBody ?? {};
        const adminLinks = {
          registrationUrl:             stateBody.electionRegistrationUrl ?? null,
          registrationConfirmationUrl: stateBody.electionRegistrationConfirmationUrl ?? null,
          absenteeUrl:                 stateBody.absenteeVotingInfoUrl ?? null,
          ballotInfoUrl:               stateBody.ballotInfoUrl ?? localBody.ballotInfoUrl ?? null,
          electionInfoUrl:             stateBody.electionInfoUrl ?? localBody.electionInfoUrl ?? null,
          electionRulesUrl:            stateBody.electionRulesUrl ?? null,
          voterServices:               (stateBody.voter_services ?? []) as string[],
        };

        // Derive early voting window from earlyVoteSites dates
        const evDates = (vd.earlyVoteSites ?? []).flatMap((s: any) => [s.startDate, s.endDate]).filter(Boolean) as string[];
        const earlyVotingWindow = evDates.length > 0
          ? { start: evDates.reduce((a, b) => a < b ? a : b), end: evDates.reduce((a, b) => a > b ? a : b) }
          : null;

        voterInfo = {
          election: vd.election ? {
            id:   vd.election.id,
            name: vd.election.name,
            date: vd.election.electionDay,
          } : null,
          earlyVotingWindow,
          adminLinks,
          pollingLocations: clean(vd.pollingLocations),
          earlyVoteSites:   clean(vd.earlyVoteSites),
          dropOffLocations: clean(vd.dropOffLocations),
          contests: ((vd.contests ?? []) as any[]).slice(0, 30).map((c: any) => ({
            office:   c.office ?? c.type ?? "Unknown",
            type:     c.type,
            district: c.district?.name ?? null,
            candidates: ((c.candidates ?? []) as any[]).map((k: any) => ({
              name:    k.name,
              party:   k.party ?? null,
              phone:   k.phone ?? null,
              url:     k.candidateUrl ?? null,
              email:   k.email ?? null,
            })),
          })),
        };
      }

      res.json({ upcomingElections, voterInfo, detectedState, isFullAddress });
    } catch (e) { handleError(res, e); }
  });

  // ── Political Debates ─────────────────────────────────────────────────────────

  function makeShareCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }

  // GET /api/politics/debates — list debates for current user
  app.get("/api/politics/debates", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const uid = await storage.getTabUserId(user.id, "politics");
      const debates = await storage.getDebatesForUser(uid);
      // Annotate with post count + member count
      const enriched = await Promise.all(debates.map(async d => {
        const posts = await storage.getDebatePosts(d.id);
        const members = await storage.getDebateMembers(d.id);
        return { ...d, postCount: posts.length, memberCount: members.length, isOwn: d.userId === uid };
      }));
      res.json(enriched);
    } catch (e) { handleError(res, e); }
  });

  // POST /api/politics/debates — create a debate
  app.post("/api/politics/debates", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const uid = await storage.getTabUserId(user.id, "politics");
      const { title, description, issueRef, sides } = req.body;
      if (!title?.trim()) return res.status(400).json({ error: "title is required" });
      // Validate and serialize sides (must be array of 2–6 non-empty strings)
      const sidesArr: string[] = Array.isArray(sides) && sides.length >= 2
        ? sides.map((s: any) => String(s).trim()).filter(Boolean).slice(0, 6)
        : ["For", "Against", "Neutral"];
      let shareCode = makeShareCode();
      for (let i = 0; i < 5; i++) {
        const existing = await storage.getDebateByShareCode(shareCode);
        if (!existing) break;
        shareCode = makeShareCode();
      }
      const debate = await storage.createDebate({ title: title.trim(), description, issueRef, shareCode, status: "open", sides: JSON.stringify(sidesArr) }, uid);
      res.json(debate);
    } catch (e) { handleError(res, e); }
  });

  // GET /api/politics/debates/:id — get debate + posts + upvotes
  app.get("/api/politics/debates/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const id = parseInt(req.params.id);
      const debate = await storage.getDebateById(id);
      if (!debate) return res.status(404).json({ error: "Debate not found" });
      const posts = await storage.getDebatePosts(id);
      const upvotes = await storage.getUpvotesForDebate(id);
      const members = await storage.getDebateMembers(id);
      // My upvoted post IDs
      const myUpvotes = upvotes.filter(u => u.userId === (req.user as User).id).map(u => u.postId);
      const uid = await storage.getTabUserId((req.user as User).id, "politics");
      res.json({ debate: { ...debate, isOwn: debate.userId === uid }, posts, myUpvotes, memberCount: members.length });
    } catch (e) { handleError(res, e); }
  });

  // PATCH /api/politics/debates/:id — update (title, description, status)
  app.patch("/api/politics/debates/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const id = parseInt(req.params.id);
      const debate = await storage.getDebateById(id);
      if (!debate) return res.status(404).json({ error: "Not found" });
      const uid = await storage.getTabUserId(user.id, "politics");
      if (debate.userId !== uid) return res.status(403).json({ error: "Not your debate" });
      const updated = await storage.updateDebate(id, req.body);
      res.json(updated);
    } catch (e) { handleError(res, e); }
  });

  // DELETE /api/politics/debates/:id
  app.delete("/api/politics/debates/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const id = parseInt(req.params.id);
      const debate = await storage.getDebateById(id);
      if (!debate) return res.status(404).json({ error: "Not found" });
      const uid = await storage.getTabUserId(user.id, "politics");
      if (debate.userId !== uid) return res.status(403).json({ error: "Not your debate" });
      await storage.deleteDebate(id);
      res.json({ ok: true });
    } catch (e) { handleError(res, e); }
  });

  // POST /api/politics/debates/join — join by share code
  app.post("/api/politics/debates/join", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { shareCode } = req.body as { shareCode?: string };
      if (!shareCode?.trim()) return res.status(400).json({ error: "shareCode is required" });
      const debate = await storage.getDebateByShareCode(shareCode.trim().toUpperCase());
      if (!debate) return res.status(404).json({ error: "No debate found with that code" });
      await storage.joinDebate(debate.id, user.id);
      res.json(debate);
    } catch (e) { handleError(res, e); }
  });

  // POST /api/politics/debates/:id/posts — add a post
  app.post("/api/politics/debates/:id/posts", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const debateId = parseInt(req.params.id);
      const debate = await storage.getDebateById(debateId);
      if (!debate) return res.status(404).json({ error: "Debate not found" });
      if (debate.status === "closed") return res.status(400).json({ error: "This debate is closed" });
      const { content, side, citationUrl, citationTitle } = req.body;
      if (!content?.trim()) return res.status(400).json({ error: "content is required" });
      // Always use the authenticated user's real name
      const displayName = user.name ?? "Anonymous";
      const post = await storage.createDebatePost({
        debateId, content: content.trim(), side, displayName,
        citationUrl: citationUrl?.trim() || null,
        citationTitle: citationTitle?.trim() || null,
      }, user.id);
      res.json(post);
    } catch (e) { handleError(res, e); }
  });

  // DELETE /api/politics/debates/:id/posts/:postId
  app.delete("/api/politics/debates/:id/posts/:postId", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const postId = parseInt(req.params.postId);
      const posts = await storage.getDebatePosts(parseInt(req.params.id));
      const post = posts.find(p => p.id === postId);
      if (!post) return res.status(404).json({ error: "Post not found" });
      if (post.userId !== user.id) return res.status(403).json({ error: "Not your post" });
      await storage.deleteDebatePost(postId);
      res.json({ ok: true });
    } catch (e) { handleError(res, e); }
  });

  // POST /api/politics/debates/:id/posts/:postId/upvote — toggle upvote
  app.post("/api/politics/debates/:id/posts/:postId/upvote", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const postId = parseInt(req.params.postId);
      const added = await storage.toggleUpvote(postId, user.id);
      res.json({ added });
    } catch (e) { handleError(res, e); }
  });

  // POST /api/politics/debates/:id/invite — invite a friend by userId
  app.post("/api/politics/debates/:id/invite", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const debateId = parseInt(req.params.id);
      const { friendId } = req.body as { friendId: number };
      if (!friendId) return res.status(400).json({ error: "friendId required" });
      // Verify they are actually friends
      const friends = await storage.getFriends(user.id);
      if (!friends.find(f => f.id === friendId)) return res.status(403).json({ error: "Not a friend" });
      const debate = await storage.getDebateById(debateId);
      if (!debate) return res.status(404).json({ error: "Debate not found" });
      await storage.joinDebate(debateId, friendId);
      res.json({ ok: true });
    } catch (e) { handleError(res, e); }
  });

  // GET /api/politics/debates/:id/members — members with names
  app.get("/api/politics/debates/:id/members", requireAuth, async (req, res) => {
    try {
      const debateId = parseInt(req.params.id);
      const members = await storage.getDebateMembersWithNames(debateId);
      res.json(members);
    } catch (e) { handleError(res, e); }
  });

  // LegiScan — recent votes for a state member
  // Accepts: ?peopleId=ID  (if already known/cached)  OR  ?name=NAME&stateCode=TX  (auto-lookup)
  app.get("/api/politics/votes/state", requireAuth, async (req, res) => {
    try {
      const { peopleId, name, stateCode } = req.query as { peopleId?: string; name?: string; stateCode?: string };
      const apiKey = process.env.LEGISCAN_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "LEGISCAN_API_KEY not configured" });

      let pid = peopleId;

      // If no cached people_id, look it up via session roster
      if (!pid && name && stateCode) {
        const sessResp = await fetch(
          `https://api.legiscan.com/?key=${apiKey}&op=getSessionList&state=${stateCode.toUpperCase()}`
        );
        if (!sessResp.ok) return res.status(502).json({ error: "LegiScan session lookup failed" });
        const sessData = await sessResp.json() as any;
        const sessions: any[] = sessData.sessions ?? [];
        if (sessions.length === 0) return res.json({ votes: [], peopleId: null });

        // Most-recent session by year_end descending
        sessions.sort((a: any, b: any) => (b.year_end ?? 0) - (a.year_end ?? 0));
        const session = sessions[0];

        const peopleResp = await fetch(
          `https://api.legiscan.com/?key=${apiKey}&op=getSessionPeople&session_id=${session.session_id}`
        );
        if (!peopleResp.ok) return res.status(502).json({ error: "LegiScan people lookup failed" });
        const peopleData = await peopleResp.json() as any;
        const roster: any[] = peopleData.sessionpeople?.people ?? [];

        // Match by all words in the provided name (case-insensitive)
        const nameParts = (name as string).toLowerCase().split(/\s+/).filter(Boolean);
        const match = roster.find((p: any) => {
          const pName = (p.name ?? "").toLowerCase();
          return nameParts.every((part) => pName.includes(part));
        });
        if (!match) return res.json({ votes: [], peopleId: null });
        pid = String(match.people_id);
      }

      if (!pid) return res.status(400).json({ error: "Provide peopleId or name+stateCode" });

      const votesResp = await fetch(
        `https://api.legiscan.com/?key=${apiKey}&op=getPersonVotes&people_id=${pid}`
      );
      if (!votesResp.ok) return res.status(502).json({ error: "LegiScan votes fetch failed" });
      const votesData = await votesResp.json() as any;
      const rawVotes: any[] = votesData.personvotes?.votes ?? [];

      const votes = rawVotes.slice(0, 20).map((v: any) => ({
        billNumber: v.bill_number ?? "",
        billDescription: v.description ?? v.title ?? "",
        voteDate: v.date ?? "",
        memberVote: v.vote_desc ?? v.vote_text ?? "",
        billId: v.bill_id ?? null,
        url: v.url ?? (v.bill_id ? `https://legiscan.com/bill/view/id/${v.bill_id}` : null),
      }));

      res.json({ votes, peopleId: pid });
    } catch (e) { handleError(res, e); }
  });

  // Officials / Representatives
  app.get("/api/politics/officials", requireAuth, async (req, res) => {
    try {
      const uid = await storage.getTabUserId((req.user as User).id, "politics");
      res.json(await storage.getPoliticalOfficials(uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/politics/officials", requireAuth, async (req, res) => {
    try { res.json(await storage.createPoliticalOfficial(req.body, (req.user as User).id)); } catch (e) { handleError(res, e); }
  });
  app.patch("/api/politics/officials/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updatePoliticalOfficial(+req.params.id, req.body);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/politics/officials/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deletePoliticalOfficial(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  // Issues
  app.get("/api/politics/issues", requireAuth, async (req, res) => {
    try {
      const uid = await storage.getTabUserId((req.user as User).id, "politics");
      res.json(await storage.getPoliticalIssues(uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/politics/issues", requireAuth, async (req, res) => {
    try { res.json(await storage.createPoliticalIssue(req.body, (req.user as User).id)); } catch (e) { handleError(res, e); }
  });
  app.patch("/api/politics/issues/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updatePoliticalIssue(+req.params.id, req.body);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/politics/issues/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deletePoliticalIssue(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  // Elections
  app.get("/api/politics/elections", requireAuth, async (req, res) => {
    try {
      const uid = await storage.getTabUserId((req.user as User).id, "politics");
      res.json(await storage.getPoliticalElections(uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/politics/elections", requireAuth, async (req, res) => {
    try { res.json(await storage.createPoliticalElection(req.body, (req.user as User).id)); } catch (e) { handleError(res, e); }
  });
  app.patch("/api/politics/elections/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updatePoliticalElection(+req.params.id, req.body);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/politics/elections/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deletePoliticalElection(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  // Civic Actions
  app.get("/api/politics/civic-actions", requireAuth, async (req, res) => {
    try {
      const uid = await storage.getTabUserId((req.user as User).id, "politics");
      res.json(await storage.getCivicActions(uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/politics/civic-actions", requireAuth, async (req, res) => {
    try { res.json(await storage.createCivicAction(req.body, (req.user as User).id)); } catch (e) { handleError(res, e); }
  });
  app.patch("/api/politics/civic-actions/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateCivicAction(+req.params.id, req.body);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/politics/civic-actions/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deleteCivicAction(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  // News Sources
  app.get("/api/politics/news-sources", requireAuth, async (req, res) => {
    try {
      const uid = await storage.getTabUserId((req.user as User).id, "politics");
      res.json(await storage.getPoliticalNewsSources(uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/politics/news-sources", requireAuth, async (req, res) => {
    try { res.json(await storage.createPoliticalNewsSource(req.body, (req.user as User).id)); } catch (e) { handleError(res, e); }
  });
  app.patch("/api/politics/news-sources/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updatePoliticalNewsSource(+req.params.id, req.body);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/politics/news-sources/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deletePoliticalNewsSource(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  // ── Trips ────────────────────────────────────────────────────────────────
  app.get("/api/trips", requireAuth, async (req, res) => {
    try { res.json(await storage.getAllTrips((req.user as User).id)); } catch (e) { handleError(res, e); }
  });
  app.post("/api/trips", requireAuth, async (req, res) => {
    try { res.json(await storage.createTrip(req.body, (req.user as User).id)); } catch (e) { handleError(res, e); }
  });
  app.patch("/api/trips/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateTrip(+req.params.id, req.body);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/trips/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deleteTrip(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  // Trip Items
  app.get("/api/trips/:tripId/items", requireAuth, async (req, res) => {
    try { res.json(await storage.getTripItems(+req.params.tripId)); } catch (e) { handleError(res, e); }
  });
  app.post("/api/trips/:tripId/items", requireAuth, async (req, res) => {
    try { res.json(await storage.createTripItem({ ...req.body, tripId: +req.params.tripId }, (req.user as User).id)); } catch (e) { handleError(res, e); }
  });
  app.patch("/api/trip-items/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateTripItem(+req.params.id, req.body);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/trip-items/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deleteTripItem(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  // ── Activity Feed ─────────────────────────────────────────────────────────────
  // GET /api/feed/stories — friends with recent-activity rings + current user
  app.get("/api/feed/stories", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const friends = await storage.getFriends(user.id);
      if (friends.length === 0) return res.json({ me: { id: user.id, name: user.name, avatarUrl: user.avatarUrl }, friends: [] });
      const friendIds = friends.map(f => f.id);
      const placeholders = friendIds.map((_: unknown, i: number) => `$${i + 1}`).join(",");
      const recentResult = await pool.query(
        `SELECT DISTINCT user_id FROM activity_feed
         WHERE user_id IN (${placeholders}) AND created_at > NOW() - INTERVAL '24 hours'`,
        friendIds
      );
      const activeSet = new Set(recentResult.rows.map((r: any) => r.user_id));
      const myRecentResult = await pool.query(
        `SELECT 1 FROM activity_feed WHERE user_id = $1 AND created_at > NOW() - INTERVAL '24 hours' LIMIT 1`,
        [user.id]
      );
      const stories = friends.map(f => ({ ...f, hasRecentActivity: activeSet.has(f.id) }));
      res.json({ me: { id: user.id, name: user.name, avatarUrl: user.avatarUrl, hasRecentActivity: myRecentResult.rows.length > 0 }, friends: stories });
    } catch (e) { handleError(res, e); }
  });

  app.get("/api/feed", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
      const friends = await storage.getFriends(user.id);
      if (friends.length === 0) {
        return res.json({ items: [], hasFriends: false });
      }
      const { items, total } = await storage.getFeedForUser(user.id, page, 20);
      res.json({ items, hasFriends: true, page, total });
    } catch (e) { handleError(res, e); }
  });

  app.get("/api/feed/mine", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const limit = Math.min(50, parseInt(String(req.query.limit ?? "10"), 10));
      const items = await storage.getMyRecentActivity(user.id, limit);
      res.json(items);
    } catch (e) { handleError(res, e); }
  });

  app.post("/api/feed/:id/react", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const feedItemId = +req.params.id;
      const { emoji } = req.body as { emoji: string };
      if (!emoji) return res.status(400).json({ error: "emoji is required" });
      await storage.toggleReaction(feedItemId, user.id, emoji);
      res.json({ ok: true });
    } catch (e) { handleError(res, e); }
  });

  app.post("/api/feed/:id/comment", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const feedItemId = +req.params.id;
      const { content } = req.body as { content: string };
      if (!content?.trim()) return res.status(400).json({ error: "content is required" });
      const comment = await storage.addComment(feedItemId, user.id, content.trim());
      res.status(201).json(comment);
    } catch (e) { handleError(res, e); }
  });

  // ── User summary ──────────────────────────────────────────────────────────

  app.get("/api/user/summary", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const summary = await storage.getUserSummary(user.id);
      res.json(summary);
    } catch (e) { handleError(res, e); }
  });

  // ── Discover ──────────────────────────────────────────────────────────────

  app.get("/api/discover/taste-profile", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const data = await storage.getDiscoverTasteProfile(user.id);
      res.json(data);
    } catch (e) { handleError(res, e); }
  });

  app.get("/api/discover/trending", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const data = await storage.getDiscoverTrending(user.id);
      res.json(data);
    } catch (e) { handleError(res, e); }
  });

  app.get("/api/discover/you-might-like", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const data = await storage.getDiscoverYouMightLike(user.id);
      res.json(data);
    } catch (e) { handleError(res, e); }
  });

  app.get("/api/discover/shared-taste", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const data = await storage.getDiscoverSharedTaste(user.id);
      res.json(data);
    } catch (e) { handleError(res, e); }
  });
}
