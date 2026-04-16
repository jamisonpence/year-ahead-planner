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
  insertRecipeSchema, insertWeekPlanSchema, insertGroceryCheckSchema,
  insertMovieSchema,
  insertBudgetCategorySchema, insertTransactionSchema, insertSubscriptionSchema,
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

export function registerRoutes(_httpServer: ReturnType<typeof createServer>, app: Express) {

  // ── Auth Routes ──────────────────────────────────────────────────────────────
  app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));

  app.get(
    "/auth/google/callback",
    passport.authenticate("google", { failureRedirect: "/#/login?error=1" }),
    (_req, res) => { res.redirect("/"); }
  );

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
  app.get("/api/events", (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(storage.getAllEventsWithTasks(uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/events", (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.status(201).json(storage.createEvent(insertEventSchema.parse(req.body), uid));
    }
    catch (e) { handleError(res, e); }
  });
  app.patch("/api/events/:id", (req, res) => {
    try {
      const r = storage.updateEvent(+req.params.id, insertEventSchema.partial().parse(req.body));
      r ? res.json(r) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/events/:id", (req, res) => {
    storage.deleteEvent(+req.params.id) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // ── Tasks ────────────────────────────────────────────────────────────────────
  app.post("/api/events/:eventId/tasks", (req, res) => {
    try { res.status(201).json(storage.createTask(insertTaskSchema.parse({ ...req.body, eventId: +req.params.eventId }))); }
    catch (e) { handleError(res, e); }
  });
  app.patch("/api/tasks/:id", (req, res) => {
    try {
      const r = storage.updateTask(+req.params.id, insertTaskSchema.partial().parse(req.body));
      r ? res.json(r) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/tasks/:id", (req, res) => {
    storage.deleteTask(+req.params.id) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // ── Books ────────────────────────────────────────────────────────────────────
  app.get("/api/books", (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(storage.getAllBooksWithSessions(uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/books", (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.status(201).json(storage.createBook(insertBookSchema.parse(req.body), uid));
    }
    catch (e) { handleError(res, e); }
  });
  app.patch("/api/books/:id", (req, res) => {
    try {
      const r = storage.updateBook(+req.params.id, insertBookSchema.partial().parse(req.body));
      r ? res.json(r) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/books/:id", (req, res) => {
    storage.deleteBook(+req.params.id) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // ── Reading Sessions ──────────────────────────────────────────────────────────
  app.get("/api/reading-sessions", (_req, res) => {
    try { res.json(storage.getAllReadingSessions()); } catch (e) { handleError(res, e); }
  });
  app.post("/api/reading-sessions", (req, res) => {
    try { res.status(201).json(storage.createReadingSession(insertReadingSessionSchema.parse(req.body))); }
    catch (e) { handleError(res, e); }
  });
  app.patch("/api/reading-sessions/:id", (req, res) => {
    try {
      const r = storage.updateReadingSession(+req.params.id, insertReadingSessionSchema.partial().parse(req.body));
      r ? res.json(r) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/reading-sessions/:id", (req, res) => {
    storage.deleteReadingSession(+req.params.id) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // ── Workout Templates ─────────────────────────────────────────────────────────
  app.get("/api/workout-templates", (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(storage.getAllWorkoutTemplates(uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/workout-templates", (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.status(201).json(storage.createWorkoutTemplate(insertWorkoutTemplateSchema.parse(req.body), uid));
    }
    catch (e) { handleError(res, e); }
  });
  app.patch("/api/workout-templates/:id", (req, res) => {
    try {
      const r = storage.updateWorkoutTemplate(+req.params.id, insertWorkoutTemplateSchema.partial().parse(req.body));
      r ? res.json(r) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/workout-templates/:id", (req, res) => {
    storage.deleteWorkoutTemplate(+req.params.id) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // ── Workout Logs ──────────────────────────────────────────────────────────────
  app.get("/api/workout-logs", (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(storage.getAllWorkoutLogs(uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/workout-logs", (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.status(201).json(storage.createWorkoutLog(insertWorkoutLogSchema.parse(req.body), uid));
    }
    catch (e) { handleError(res, e); }
  });
  app.patch("/api/workout-logs/:id", (req, res) => {
    try {
      const r = storage.updateWorkoutLog(+req.params.id, insertWorkoutLogSchema.partial().parse(req.body));
      r ? res.json(r) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/workout-logs/:id", (req, res) => {
    storage.deleteWorkoutLog(+req.params.id) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // ── Goals ─────────────────────────────────────────────────────────────────────
  app.get("/api/goals", (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(storage.getAllGoalsWithProjects(uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/goals", (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.status(201).json(storage.createGoal(insertGoalSchema.parse(req.body), uid));
    }
    catch (e) { handleError(res, e); }
  });
  app.patch("/api/goals/:id", (req, res) => {
    try {
      const r = storage.updateGoal(+req.params.id, insertGoalSchema.partial().parse(req.body));
      r ? res.json(r) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/goals/:id", (req, res) => {
    storage.deleteGoal(+req.params.id) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // ── Goal Tasks (legacy) ──────────────────────────────────────────────────────
  app.post("/api/goals/:goalId/tasks", (req, res) => {
    try { res.status(201).json(storage.createGoalTask(insertGoalTaskSchema.parse({ ...req.body, goalId: +req.params.goalId }))); }
    catch (e) { handleError(res, e); }
  });
  app.patch("/api/goal-tasks/:id", (req, res) => {
    try {
      const r = storage.updateGoalTask(+req.params.id, insertGoalTaskSchema.partial().parse(req.body));
      r ? res.json(r) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/goal-tasks/:id", (req, res) => {
    storage.deleteGoalTask(+req.params.id) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // ── Projects ──────────────────────────────────────────────────────────────────
  app.post("/api/goals/:goalId/projects", (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.status(201).json(storage.createProject(insertProjectSchema.parse({ ...req.body, goalId: +req.params.goalId }), uid));
    }
    catch (e) { handleError(res, e); }
  });
  app.patch("/api/projects/:id", (req, res) => {
    try {
      const r = storage.updateProject(+req.params.id, insertProjectSchema.partial().parse(req.body));
      r ? res.json(r) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/projects/:id", (req, res) => {
    storage.deleteProject(+req.params.id) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // ── Project Tasks ─────────────────────────────────────────────────────────────
  app.post("/api/projects/:projectId/tasks", (req, res) => {
    try { res.status(201).json(storage.createProjectTask(insertProjectTaskSchema.parse({ ...req.body, projectId: +req.params.projectId }))); }
    catch (e) { handleError(res, e); }
  });
  app.patch("/api/project-tasks/:id", (req, res) => {
    try {
      const r = storage.updateProjectTask(+req.params.id, insertProjectTaskSchema.partial().parse(req.body));
      r ? res.json(r) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/project-tasks/:id", (req, res) => {
    storage.deleteProjectTask(+req.params.id) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // ── Standalone Projects (no goal) ────────────────────────────────────────────
  app.get("/api/projects/standalone", (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(storage.getStandaloneProjects(uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/projects/standalone", (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.status(201).json(storage.createProject(insertProjectSchema.parse({ ...req.body, goalId: null }), uid));
    }
    catch (e) { handleError(res, e); }
  });

  // ── General Tasks ─────────────────────────────────────────────────────────────
  app.get("/api/general-tasks", (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(storage.getAllGeneralTasks(uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/general-tasks", (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.status(201).json(storage.createGeneralTask(insertGeneralTaskSchema.parse(req.body), uid));
    }
    catch (e) { handleError(res, e); }
  });
  app.patch("/api/general-tasks/:id", (req, res) => {
    try {
      const r = storage.updateGeneralTask(+req.params.id, insertGeneralTaskSchema.partial().parse(req.body));
      r ? res.json(r) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/general-tasks/:id", (req, res) => {
    storage.deleteGeneralTask(+req.params.id) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // ── Relationship Groups ───────────────────────────────────────────────────────
  app.get("/api/groups", (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(storage.getAllGroups(uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/groups", (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.status(201).json(storage.createGroup(insertRelationshipGroupSchema.parse(req.body), uid));
    }
    catch (e) { handleError(res, e); }
  });
  app.patch("/api/groups/:id", (req, res) => {
    try {
      const r = storage.updateGroup(+req.params.id, insertRelationshipGroupSchema.partial().parse(req.body));
      r ? res.json(r) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/groups/:id", (req, res) => {
    storage.deleteGroup(+req.params.id) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // ── People ────────────────────────────────────────────────────────────────────
  app.get("/api/people", (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(storage.getAllPeople(uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/people", (req, res) => {
    try {
      const uid = (req.user as User).id;
      const person = storage.createPerson(insertPersonSchema.parse(req.body), uid);
      // Auto-create a yearly recurring birthday event if birthday provided
      if (person.birthday) {
        const name = [person.firstName, person.lastName].filter(Boolean).join(" ");
        const event = storage.createEvent({
          title: `${name}'s Birthday`,
          date: person.birthday,
          endDate: null,
          category: "birthday",
          recurring: "yearly",
          description: null,
          color: null,
        }, uid);
        storage.updatePerson(person.id, { birthdayEventId: event.id });
        person.birthdayEventId = event.id;
      }
      res.status(201).json(person);
    } catch (e) { handleError(res, e); }
  });
  app.patch("/api/people/:id", (req, res) => {
    try {
      const uid = (req.user as User).id;
      const data = insertPersonSchema.partial().parse(req.body);
      const existing = storage.getAllPeople(uid).find(p => p.id === +req.params.id);
      if (!existing) return res.status(404).json({ error: "Not found" });

      // If birthday changed, update the linked event
      if (data.birthday !== undefined && data.birthday !== existing.birthday) {
        const name = [data.firstName ?? existing.firstName, data.lastName ?? existing.lastName].filter(Boolean).join(" ");
        if (existing.birthdayEventId) {
          // Update existing event
          storage.updateEvent(existing.birthdayEventId, {
            title: `${name}'s Birthday`,
            date: data.birthday || existing.birthday || "",
            recurring: "yearly",
          });
        } else if (data.birthday) {
          // Create new event
          const event = storage.createEvent({
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

      const r = storage.updatePerson(+req.params.id, data);
      r ? res.json(r) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/people/:id", (req, res) => {
    storage.deletePerson(+req.params.id) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // Link spouse bidirectionally in one atomic call
  app.post("/api/people/:id/link-spouse", (req, res) => {
    try {
      const uid = (req.user as User).id;
      const id = +req.params.id;
      const { spouseId } = req.body as { spouseId: number | null };

      // Get current person to find old spouse (for unlinking)
      const current = storage.getAllPeople(uid).find(p => p.id === id);
      if (!current) return res.status(404).json({ error: "Not found" });

      // Unlink old spouse if changing
      if (current.spouseId && current.spouseId !== spouseId) {
        storage.updatePerson(current.spouseId, { spouseId: null });
      }

      // Link both directions
      storage.updatePerson(id, { spouseId: spouseId ?? null });
      if (spouseId) {
        // Unlink new spouse's old spouse first
        const newSpouse = storage.getAllPeople(uid).find(p => p.id === spouseId);
        if (newSpouse?.spouseId && newSpouse.spouseId !== id) {
          storage.updatePerson(newSpouse.spouseId, { spouseId: null });
        }
        storage.updatePerson(spouseId, { spouseId: id });
      }

      res.json({ ok: true });
    } catch (e) { handleError(res, e); }
  });

  // ── Recipes ────────────────────────────────────────────────────────────────
  app.get("/api/recipes", (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(storage.getAllRecipes(uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/recipes", (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.status(201).json(storage.createRecipe(insertRecipeSchema.parse(req.body), uid));
    }
    catch (e) { handleError(res, e); }
  });
  app.patch("/api/recipes/:id", (req, res) => {
    try {
      const r = storage.updateRecipe(+req.params.id, insertRecipeSchema.partial().parse(req.body));
      r ? res.json(r) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/recipes/:id", (req, res) => {
    storage.deleteRecipe(+req.params.id) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // ── Week Plan ───────────────────────────────────────────────────────────────
  app.get("/api/week-plan/:weekStart", (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(storage.getWeekPlan(req.params.weekStart, uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/week-plan", (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.status(201).json(storage.assignRecipe(insertWeekPlanSchema.parse(req.body), uid));
    }
    catch (e) { handleError(res, e); }
  });
  app.delete("/api/week-plan/:id", (req, res) => {
    storage.removeWeekAssignment(+req.params.id) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // ── Grocery Checks ──────────────────────────────────────────────────────────
  app.get("/api/grocery-checks/:weekStart", (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(storage.getGroceryChecks(req.params.weekStart, uid));
    } catch (e) { handleError(res, e); }
  });
  app.patch("/api/grocery-checks", (req, res) => {
    try {
      const uid = (req.user as User).id;
      const { weekStart, itemKey, checked } = req.body;
      res.json(storage.upsertGroceryCheck(weekStart, itemKey, checked, uid));
    } catch (e) { handleError(res, e); }
  });

  // ── Movies ────────────────────────────────────────────────────────────────────
  app.get("/api/movies", (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(storage.getAllMovies(uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/movies", (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.status(201).json(storage.createMovie(insertMovieSchema.parse(req.body), uid));
    }
    catch (e) { handleError(res, e); }
  });
  app.patch("/api/movies/:id", (req, res) => {
    try {
      const updated = storage.updateMovie(+req.params.id, req.body);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/movies/:id", (req, res) => {
    storage.deleteMovie(+req.params.id) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // ── Budget Categories ───────────────────────────────────────────────────────
  app.get("/api/budget-categories", (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(storage.getAllBudgetCategories(uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/budget-categories", (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.status(201).json(storage.createBudgetCategory(insertBudgetCategorySchema.parse(req.body), uid));
    }
    catch (e) { handleError(res, e); }
  });
  app.patch("/api/budget-categories/:id", (req, res) => {
    try {
      const updated = storage.updateBudgetCategory(+req.params.id, req.body);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/budget-categories/:id", (req, res) => {
    storage.deleteBudgetCategory(+req.params.id) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // ── Transactions ─────────────────────────────────────────────────────────────────
  app.get("/api/transactions", (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(storage.getAllTransactions(uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/transactions", (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.status(201).json(storage.createTransaction(insertTransactionSchema.parse(req.body), uid));
    }
    catch (e) { handleError(res, e); }
  });
  app.patch("/api/transactions/:id", (req, res) => {
    try {
      const updated = storage.updateTransaction(+req.params.id, req.body);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/transactions/:id", (req, res) => {
    storage.deleteTransaction(+req.params.id) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // ── Subscriptions ────────────────────────────────────────────────────────────────
  app.get("/api/subscriptions", (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(storage.getAllSubscriptions(uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/subscriptions", (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.status(201).json(storage.createSubscription(insertSubscriptionSchema.parse(req.body), uid));
    }
    catch (e) { handleError(res, e); }
  });
  app.patch("/api/subscriptions/:id", (req, res) => {
    try {
      const updated = storage.updateSubscription(+req.params.id, req.body);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/subscriptions/:id", (req, res) => {
    storage.deleteSubscription(+req.params.id) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // ── Nav Prefs ────────────────────────────────────────────────────────────────────
  app.get("/api/nav-prefs", (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(storage.getNavPrefs(uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/nav-prefs", (req, res) => {
    try {
      const uid = (req.user as User).id;
      storage.saveNavPrefs(uid, req.body);
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
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
    fileFilter: (_req, file, cb) => {
      const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];
      cb(null, allowed.includes(file.mimetype));
    },
  });

  // Serve uploaded files statically (must come before SPA catch-all)
  app.use("/uploads/receipts", express.static(UPLOADS_DIR));

  app.get("/api/receipts", (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(storage.getAllReceipts(uid));
    } catch (e) { handleError(res, e); }
  });

  app.post("/api/receipts", upload.single("file"), (req: any, res) => {
    try {
      const uid = (req.user as User).id;
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      const today = new Date().toISOString().split("T")[0];
      const body = req.body ?? {};
      const record = storage.createReceiptRecord({
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

  app.patch("/api/receipts/:id", (req, res) => {
    try {
      const updated = storage.updateReceiptRecord(+req.params.id, req.body);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  app.delete("/api/receipts/:id", (req, res) => {
    try {
      const all = storage.getAllReceipts();
      const rec = all.find((r) => r.id === +req.params.id);
      if (rec) {
        const filePath = path.join(UPLOADS_DIR, rec.filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
      storage.deleteReceiptRecord(+req.params.id) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
}