import express from "express";
import type { Express, Request, Response, NextFunction } from "express";
import { createServer } from "http";
import { storage } from "./storage";
import { passport } from "./auth";
import { encrypt, decrypt, hasEncryptionKey } from "./encryption";
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
  insertArtPieceSchema,
  insertEquipmentSchema,
} from "@shared/schema";
import { z } from "zod";

function handleError(res: any, e: unknown) {
  if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors });
  res.status(500).json({ error: String(e) });
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: "Unauthorized" });
}

export async function registerRoutes(_httpServer: ReturnType<typeof createServer>, app: Express) {

  // ── Auth Routes ──────────────────────────────────────────────────────────────
  app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));

  app.get(
    "/auth/google/callback",
    passport.authenticate("google", { failureRedirect: "/" }),
    (_req, res) => { res.redirect("/"); }
  );

    // ── Landing page ───────────────────────────────────────────────────────────
  app.get("/", (req, res) => {
    if (req.isAuthenticated()) return res.redirect("/dashboard");
    res.sendFile(path.resolve(process.cwd(), "landing.html"));
  });

  // ── Token-based Google sign-in ─────────────────────────────────────────────
  app.post("/auth/google", async (req, res) => {
    try {
      const { access_token } = req.body;
      if (!access_token) return res.status(400).json({ error: "access_token required" });

      const googleRes = await fetch(
        `https://www.googleapis.com/oauth2/v1/userinfo?access_token=${access_token}`
      );
      if (!googleRes.ok) return res.status(401).json({ error: "Invalid Google token" });
      const profile = await googleRes.json() as { id: string; email: string; name: string; picture?: string };

      const { id: googleId, email, name } = profile;
      if (!email) return res.status(401).json({ error: "No email returned from Google" });

      const user = await storage.upsertUser({
        googleId,
        email,
        name: name ?? email,
        avatarUrl: profile.picture ?? null,
      });

      await new Promise<void>((resolve, reject) => {
        req.login(user!, (err) => (err ? reject(err) : resolve()));
      });

      res.json({ redirect: "/dashboard" });
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
  app.get("/api/books", async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(await storage.getAllBooksWithSessions(uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/books", async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.status(201).json(await storage.createBook(insertBookSchema.parse(req.body), uid));
    }
    catch (e) { handleError(res, e); }
  });
  app.patch("/api/books/:id", async (req, res) => {
    try {
      const r = await storage.updateBook(+req.params.id, insertBookSchema.partial().parse(req.body));
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
      res.status(201).json(await storage.createRecipe(insertRecipeSchema.parse(req.body), uid));
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
      res.status(201).json(await storage.createMovie(insertMovieSchema.parse(req.body), uid));
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
      const data = insertMusicSongSchema.parse({ ...req.body, userId: (req.user as User).id });
      res.status(201).json(await storage.createMusicSong(data, (req.user as User).id));
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
    try { res.json(await storage.getAllChores((req.user as User).id)); } catch (e) { handleError(res, e); }
  });
  app.post("/api/chores", requireAuth, async (req, res) => {
    try {
      const data = insertChoreSchema.parse({ ...req.body, userId: (req.user as User).id });
      res.status(201).json(await storage.createChore(data, (req.user as User).id));
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
    try { res.json(await storage.getAllHouseProjects((req.user as User).id)); } catch (e) { handleError(res, e); }
  });
  app.post("/api/house-projects", requireAuth, async (req, res) => {
    try {
      const data = insertHouseProjectSchema.parse({ ...req.body, userId: (req.user as User).id });
      res.status(201).json(await storage.createHouseProject(data, (req.user as User).id));
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
      const data = { ...req.body, houseProjectId: +req.params.id, userId: (req.user as User).id };
      res.status(201).json(await storage.createHouseProjectTask(data, (req.user as User).id));
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
    try { res.json(await storage.getAllAppliances((req.user as User).id)); } catch (e) { handleError(res, e); }
  });
  app.post("/api/appliances", requireAuth, async (req, res) => {
    try {
      const data = insertApplianceSchema.parse({ ...req.body, userId: (req.user as User).id });
      res.status(201).json(await storage.createAppliance(data, (req.user as User).id));
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
      const data = insertSpotSchema.parse({ ...req.body, userId: (req.user as User).id });
      res.status(201).json(await storage.createSpot(data, (req.user as User).id));
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
          "User-Agent": "YearAheadPlanner/1.0 (personal life planner app)",
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
      const headers = { "Accept": "application/json", "AIC-User-Agent": "YearAheadPlanner/1.0 (personal life planner app)" };

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
      // Strip markdown code fences if present
      const cleaned = text.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
      const plan = JSON.parse(cleaned);
      res.json(plan);
    } catch (e) {
      if (e instanceof SyntaxError) return res.status(500).json({ error: "parse_error", message: "Could not parse AI response. Try again." });
      handleError(res, e);
    }
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
    try { res.json(await storage.getAllChildrenWithDetails((req.user as User).id)); } catch (e) { handleError(res, e); }
  });
  app.post("/api/children", requireAuth, async (req, res) => {
    try {
      const data = insertChildSchema.parse({ ...req.body, userId: (req.user as User).id });
      res.status(201).json(await storage.createChild(data, (req.user as User).id));
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
      const data = insertChildMilestoneSchema.parse({ ...req.body, childId: +req.params.childId, userId: (req.user as User).id });
      res.status(201).json(await storage.createChildMilestone(data, (req.user as User).id));
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
      const data = insertChildMemorySchema.parse({ ...req.body, childId: +req.params.childId, userId: (req.user as User).id });
      res.status(201).json(await storage.createChildMemory(data, (req.user as User).id));
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
      const data = insertChildPrepItemSchema.parse({ ...req.body, childId: +req.params.childId, userId: (req.user as User).id });
      res.status(201).json(await storage.createChildPrepItem(data, (req.user as User).id));
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
      const data = insertQuoteSchema.parse({ ...req.body, userId: (req.user as User).id });
      res.status(201).json(await storage.createQuote(data, (req.user as User).id));
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

  // ── Google Books Proxy ────────────────────────────────────────────────────────
  app.get("/api/gbooks/search", requireAuth, async (req, res) => {
    try {
      const query = String(req.query.q || "").trim();
      if (!query) return res.status(400).json({ error: "q is required" });
      const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
      const keyParam = apiKey ? `&key=${apiKey}` : "";
      const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=20&printType=books${keyParam}`;
      const gbRes = await fetch(url);
      if (!gbRes.ok) return res.status(gbRes.status).json({ error: "Google Books error" });
      const data = await gbRes.json() as any;
      res.json(data.items ?? []);
    } catch (e) { handleError(res, e); }
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
}
