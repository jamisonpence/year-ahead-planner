import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { insertGeneralTaskSchema, insertChoreSchema } from "@shared/schema";
import { handleError } from "./helpers";

// ── External REST API (API-key auth, no session required) ────────────────────
// Set EXTERNAL_API_KEY and EXTERNAL_USER_ID in Railway env vars to enable.
// Call with:  Authorization: Bearer <your-key>
//   or:       x-api-key: <your-key>

function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const key = process.env.EXTERNAL_API_KEY?.trim();
  if (!key) return res.status(503).json({ error: "External API not configured. Set EXTERNAL_API_KEY env var." });
  const authHeader = req.headers.authorization;
  const provided = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : (req.headers["x-api-key"] as string | undefined)?.trim();
  if (!provided || provided !== key) {
    return res.status(401).json({ error: "Invalid or missing API key" });
  }
  next();
}

async function externalUserId(res: Response): Promise<number | null> {
  const raw = process.env.EXTERNAL_USER_ID;
  if (!raw) { res.status(503).json({ error: "EXTERNAL_USER_ID env var not set" }); return null; }
  const uid = parseInt(raw);
  if (isNaN(uid)) { res.status(503).json({ error: "EXTERNAL_USER_ID must be a number" }); return null; }
  return uid;
}

export function registerExternalApiRoutes(app: Express) {
  /**
   * GET /api/v1/health — unauthenticated liveness probe.
   *
   * Reports only whether configuration is present, never anything derived from
   * the key itself. This previously returned `keyLength` and `keyPrefix`
   * (the first 8 characters), which handed an unauthenticated caller real key
   * material plus the exact search space — a meaningful head start on guessing
   * the rest. Booleans are enough to answer "is this deployment configured?",
   * which is all a health check needs to do.
   */
  app.get("/api/v1/health", (_req, res) => {
    res.json({
      ok: true,
      keyConfigured: !!process.env.EXTERNAL_API_KEY?.trim(),
      userIdConfigured: !!process.env.EXTERNAL_USER_ID,
    });
  });

  /** GET /api/v1/goals — all goals with their projects */
  app.get("/api/v1/goals", requireApiKey, async (_req, res) => {
    try {
      const uid = await externalUserId(res); if (!uid) return;
      res.json(await storage.getAllGoalsWithProjects(uid));
    } catch (e) { handleError(res, e); }
  });

  /** GET /api/v1/tasks — active general tasks (incomplete only by default; pass ?all=1 for all) */
  app.get("/api/v1/tasks", requireApiKey, async (req, res) => {
    try {
      const uid = await externalUserId(res); if (!uid) return;
      const all = await storage.getAllGeneralTasks(uid);
      const tasks = req.query.all === "1" ? all : all.filter(t => !t.completed);
      res.json(tasks);
    } catch (e) { handleError(res, e); }
  });

  /** POST /api/v1/tasks — create a general task. Body: { title, priority?, dueDate?, notes? } */
  app.post("/api/v1/tasks", requireApiKey, async (req, res) => {
    try {
      const uid = await externalUserId(res); if (!uid) return;
      res.status(201).json(await storage.createGeneralTask(insertGeneralTaskSchema.parse(req.body), uid));
    } catch (e) { handleError(res, e); }
  });

  /** PATCH /api/v1/tasks/:id — update a general task (any fields, e.g. completed, priority) */
  app.patch("/api/v1/tasks/:id", requireApiKey, async (req, res) => {
    try {
      const r = await storage.updateGeneralTask(+req.params.id, insertGeneralTaskSchema.partial().parse(req.body));
      r ? res.json(r) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  /** GET /api/v1/chores — list chores
   *  ?due=1   returns only chores due today or overdue (nextDue <= today)
   *  ?active=0 includes inactive chores (default: active only)
   */
  app.get("/api/v1/chores", requireApiKey, async (req, res) => {
    try {
      const uid = await externalUserId(res); if (!uid) return;
      let chores = await storage.getAllChores(uid);
      if (req.query.active !== "0") chores = chores.filter(c => c.isActive);
      if (req.query.due === "1") {
        const today = new Date().toISOString().slice(0, 10);
        chores = chores.filter(c => c.nextDue && c.nextDue <= today);
      }
      res.json(chores);
    } catch (e) { handleError(res, e); }
  });

  /** POST /api/v1/chores — create a chore. Body: { title, category?, frequency?, priority?, assignee?, notes?, nextDue? } */
  app.post("/api/v1/chores", requireApiKey, async (req, res) => {
    try {
      const uid = await externalUserId(res); if (!uid) return;
      res.status(201).json(await storage.createChore(insertChoreSchema.parse(req.body), uid));
    } catch (e) { handleError(res, e); }
  });

  /** PATCH /api/v1/chores/:id — update a chore (e.g. mark lastCompleted, update nextDue) */
  app.patch("/api/v1/chores/:id", requireApiKey, async (req, res) => {
    try {
      const r = await storage.updateChore(+req.params.id, insertChoreSchema.partial().parse(req.body));
      r ? res.json(r) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
}
