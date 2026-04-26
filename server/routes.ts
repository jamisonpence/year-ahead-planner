import express from "express";
import type { Express, Request, Response, NextFunction } from "express";
import { createServer } from "http";
import { storage } from "./storage";
import { passport } from "./auth";
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

  app.get("/api/me", (req, res) => {
    if (req.isAuthenticated()) {
      res.json(req.user);
    } else {
      res.status(401).json({ error: "Not authenticated" });
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
      const data = insertPlantSchema.omit({ userId: true } as any).parse(req.body);
      const plant = await storage.createPlant(data as any, (req.user as User).id);
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
