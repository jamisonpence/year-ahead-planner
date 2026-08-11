import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Router, Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { storage } from "./storage";

// ── Auth ─────────────────────────────────────────────────────────────────────

function requireMcpAuth(req: Request, res: Response, next: NextFunction) {
  const token = process.env.MCP_AUTH_TOKEN?.trim();
  if (!token) {
    return res.status(503).json({ error: "MCP_AUTH_TOKEN not configured" });
  }
  const header = req.headers.authorization;
  const provided = (header?.startsWith("Bearer ") ? header.slice(7).trim() : null)
    ?? (req.headers["x-mcp-auth"] as string | undefined)?.trim()
    ?? (req.query.token as string | undefined)?.trim();
  if (!provided || provided !== token) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getExternalUserId(): number {
  return parseInt(process.env.EXTERNAL_USER_ID || "1", 10);
}


// ── MCP Server ────────────────────────────────────────────────────────────────

function buildMcpServer() {
  const server = new McpServer({ name: "mylifos", version: "1.0.0" });
  const uid = getExternalUserId();

  // ── Tasks ────────────────────────────────────────────────────────────────

  server.tool(
    "list_tasks",
    "Get tasks from MyLifos. Returns incomplete tasks by default.",
    {
      includeCompleted: z
        .boolean()
        .optional()
        .describe("Set true to include completed tasks (default: false)"),
    },
    async ({ includeCompleted }) => {
      const tasks = await storage.getAllGeneralTasks(uid);
      const result = includeCompleted ? tasks : tasks.filter((t) => !t.completed);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "create_task",
    "Create a new task in MyLifos",
    {
      title: z.string().describe("Task title"),
      priority: z
        .enum(["low", "medium", "high"])
        .optional()
        .describe("Priority (default: medium)"),
      dueDate: z.string().optional().describe("Due date in YYYY-MM-DD format"),
      notes: z.string().optional().describe("Optional notes"),
    },
    async ({ title, priority, dueDate, notes }) => {
      const task = await storage.createGeneralTask(
        {
          title,
          priority: priority ?? "medium",
          dueDate: dueDate ?? null,
          notes: notes ?? null,
          completed: false,
          sortOrder: 0,
        },
        uid,
      );
      return { content: [{ type: "text", text: JSON.stringify(task, null, 2) }] };
    },
  );

  server.tool(
    "update_task",
    "Update a task in MyLifos — mark done, change priority, reschedule, etc.",
    {
      id: z.number().describe("Task ID"),
      title: z.string().optional().describe("New title"),
      completed: z.boolean().optional().describe("Mark complete or incomplete"),
      priority: z.enum(["low", "medium", "high"]).optional().describe("New priority"),
      dueDate: z.string().nullable().optional().describe("New due date (YYYY-MM-DD) or null to clear"),
      notes: z.string().nullable().optional().describe("New notes or null to clear"),
    },
    async ({ id, ...updates }) => {
      const task = await storage.updateGeneralTask(id, updates, uid);
      if (!task) {
        return {
          content: [{ type: "text", text: `Task ${id} not found` }],
          isError: true,
        };
      }
      return { content: [{ type: "text", text: JSON.stringify(task, null, 2) }] };
    },
  );

  // ── Goals ────────────────────────────────────────────────────────────────

  server.tool(
    "list_goals",
    "Get all goals with their nested projects and project tasks from MyLifos",
    {},
    async () => {
      const goals = await storage.getAllGoalsWithProjects(uid);
      return { content: [{ type: "text", text: JSON.stringify(goals, null, 2) }] };
    },
  );

  // ── Recipes ──────────────────────────────────────────────────────────────

  server.tool(
    "list_recipes",
    "Get recipes with full ingredients and instructions. Optionally filter by category (e.g. 'Chicken', 'Beef', 'Seafood', 'Vegetarian'). Use this to build grocery orders.",
    {
      category: z.string().optional().describe("Filter by recipe category (case-insensitive partial match). Omit to return all recipes."),
    },
    async ({ category }) => {
      const all = await storage.getAllRecipes(uid);
      const filtered = category
        ? all.filter((r) => r.category?.toLowerCase().includes(category.toLowerCase()))
        : all;
      const result = filtered.map((r) => ({
        id: r.id,
        name: r.name,
        emoji: r.emoji,
        category: r.category,
        componentType: r.componentType,
        servings: r.servings,
        prepTime: r.prepTime,
        cookTime: r.cookTime,
        ingredients: JSON.parse(r.ingredientsJson || "[]") as { name: string; qty: string }[],
        instructions: r.instructions,
        tags: r.tags,
      }));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "get_week_meal_plan",
    "Get the meal plan for the current week (or any week). Returns each day's assigned recipes/bundles with their ingredients — useful for generating a grocery list.",
    {
      weekOffset: z.number().optional().describe("0 = this week (default), 1 = next week, -1 = last week"),
    },
    async ({ weekOffset = 0 }) => {
      // Compute the Sunday of the target week
      const today = new Date();
      const sunday = new Date(today);
      sunday.setDate(today.getDate() - today.getDay() + weekOffset * 7);
      const weekStart = sunday.toISOString().slice(0, 10);

      const plan = await storage.getWeekPlan(weekStart, uid);
      const allRecipes = await storage.getAllRecipes(uid);
      const recipeMap = new Map(allRecipes.map((r) => [r.id, r]));

      const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const result = plan.map((entry) => {
        const recipe = entry.recipeId ? recipeMap.get(entry.recipeId) : null;
        return {
          day: days[entry.dayIndex],
          dayIndex: entry.dayIndex,
          recipe: recipe
            ? {
                id: recipe.id,
                name: recipe.name,
                category: recipe.category,
                servings: recipe.servings,
                ingredients: JSON.parse(recipe.ingredientsJson || "[]") as { name: string; qty: string }[],
              }
            : null,
          bundleId: entry.bundleId ?? null,
        };
      });

      return { content: [{ type: "text", text: JSON.stringify({ weekStart, days: result }, null, 2) }] };
    },
  );

  // ── Workouts ─────────────────────────────────────────────────────────────

  server.tool(
    "list_scheduled_workouts",
    "Get the workout(s) scheduled for today from the active workout plan. Returns the template name and day, or empty if rest day.",
    {},
    async () => {
      const plans = await storage.getAllWorkoutPlans(uid);
      const activePlan = plans.find((p) => p.isActive);
      if (!activePlan) {
        return { content: [{ type: "text", text: JSON.stringify({ restDay: true, reason: "No active workout plan" }) }] };
      }

      const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
      const todayName = days[new Date().getDay()];

      type ScheduleEntry = { dayOfWeek: string; templateId: number; templateName: string };
      const schedule: ScheduleEntry[] = JSON.parse(activePlan.scheduleJson || "[]");
      const todaysWorkouts = schedule.filter((e) => e.dayOfWeek === todayName);

      if (todaysWorkouts.length === 0) {
        return { content: [{ type: "text", text: JSON.stringify({ restDay: true, day: todayName, plan: activePlan.name }) }] };
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            restDay: false,
            day: todayName,
            plan: activePlan.name,
            workouts: todaysWorkouts.map((e) => ({ templateId: e.templateId, name: e.templateName })),
          }),
        }],
      };
    },
  );

  // ── Chores ───────────────────────────────────────────────────────────────

  server.tool(
    "list_chores",
    "Get chores from MyLifos. Returns active chores by default. Use dueOnly=true to return only overdue or due-today chores.",
    {
      dueOnly: z
        .boolean()
        .optional()
        .describe("Set true to return only chores that are overdue or due today (default: false)"),
    },
    async ({ dueOnly }) => {
      const all = await storage.getAllChores(uid);
      const active = all.filter((c) => c.isActive);
      if (!dueOnly) {
        return { content: [{ type: "text", text: JSON.stringify(active, null, 2) }] };
      }
      const today = new Date().toISOString().slice(0, 10);
      const due = active.filter((c) => c.nextDue && c.nextDue <= today);
      return { content: [{ type: "text", text: JSON.stringify(due, null, 2) }] };
    },
  );

  server.tool(
    "create_chore",
    "Create a new chore in MyLifos",
    {
      title: z.string().describe("Chore title"),
      category: z
        .enum(["cleaning", "yard", "maintenance", "laundry", "cooking", "other"])
        .optional()
        .describe("Category (default: cleaning)"),
      frequency: z
        .enum(["daily", "weekly", "biweekly", "monthly", "quarterly", "yearly", "custom", "as_needed"])
        .optional()
        .describe("How often the chore recurs (default: weekly)"),
      priority: z.enum(["low", "medium", "high"]).optional().describe("Priority (default: medium)"),
      assignee: z.string().optional().describe("Household member name"),
      notes: z.string().optional().describe("Optional notes"),
      nextDue: z.string().optional().describe("Next due date in YYYY-MM-DD format"),
    },
    async ({ title, category, frequency, priority, assignee, notes, nextDue }) => {
      const chore = await storage.createChore(
        {
          title,
          category: category ?? "cleaning",
          frequency: frequency ?? "weekly",
          priority: priority ?? "medium",
          assignee: assignee ?? null,
          notes: notes ?? null,
          nextDue: nextDue ?? null,
          lastCompleted: null,
          isActive: true,
          sortOrder: 0,
          tags: null,
          customFrequencyDays: null,
          applianceId: null,
        },
        uid,
      );
      return { content: [{ type: "text", text: JSON.stringify(chore, null, 2) }] };
    },
  );

  server.tool(
    "complete_chore",
    "Mark a chore as completed and set its next due date. Use this after finishing a chore.",
    {
      id: z.number().describe("Chore ID"),
      lastCompleted: z
        .string()
        .optional()
        .describe("Completion date in YYYY-MM-DD format (defaults to today)"),
      nextDue: z.string().optional().describe("Next due date in YYYY-MM-DD format"),
    },
    async ({ id, lastCompleted, nextDue }) => {
      const today = new Date().toISOString().slice(0, 10);
      const chore = await storage.updateChore(id, {
        lastCompleted: lastCompleted ?? today,
        ...(nextDue ? { nextDue } : {}),
      }, uid);
      if (!chore) {
        return { content: [{ type: "text", text: `Chore ${id} not found` }], isError: true };
      }
      return { content: [{ type: "text", text: JSON.stringify(chore, null, 2) }] };
    },
  );

  // ── Email ────────────────────────────────────────────────────────────────

  server.tool(
    "send_email",
    "Send an email via Resend to jamisonpence@gmail.com",
    {
      subject: z.string().describe("Email subject"),
      body: z.string().describe("Plain-text email body"),
    },
    async ({ subject, body }) => {
      if (!process.env.RESEND_API_KEY) {
        return {
          content: [{ type: "text", text: "Resend not configured. Set RESEND_API_KEY." }],
          isError: true,
        };
      }
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Daily Planner <planner@mylifos.com>",
          to: ["jamisonpence@gmail.com"],
          subject,
          text: body,
        }),
      });
      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Resend error ${response.status}: ${err}`);
      }
      const data = await response.json() as { id: string };
      return { content: [{ type: "text", text: JSON.stringify({ sent: true, id: data.id, subject }) }] };
    },
  );

  server.tool(
    "get_today",
    "Get the unified agenda for today: tasks, project tasks, chores, habits, events, and plants to water, with overdue flags. Optionally pass a date (YYYY-MM-DD).",
    {
      date: z.string().optional().describe("ISO date YYYY-MM-DD (default: today, America/Chicago)"),
    },
    async ({ date }) => {
      const today = date || new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
      const agenda = await storage.getTodayItems(uid, today);
      return { content: [{ type: "text", text: JSON.stringify(agenda, null, 2) }] };
    },
  );

  return server;
}

// ── OAuth 2.0 endpoints (required by MCP spec for Cowork/Claude connectors) ──
// Single-user app: authorize auto-approves and issues MCP_AUTH_TOKEN directly.

// code → { redirectUri, userId, expiresAt }. Codes are bound to the user who
// authorized them so a code can never be minted by one party and redeemed for
// another's access.
const pendingCodes = new Map<string, { redirectUri: string; userId: number; expiresAt: number }>();

/**
 * Hosts allowed to receive an authorization code.
 *
 * The code is a bearer credential in a query string — whoever receives it can
 * exchange it for the MCP token. Without this allowlist, anyone could pass
 * `?redirect_uri=https://attacker.example` and have the server hand them a
 * valid code directly.
 *
 * Override with MCP_ALLOWED_REDIRECT_HOSTS (comma-separated) if the connector's
 * callback host ever changes, so this doesn't require a code edit to unblock.
 */
function redirectUriAllowed(raw: string): boolean {
  let url: URL;
  try { url = new URL(raw); } catch { return false; }

  // Only https, except on loopback where local development has no certificate.
  const isLoopback = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !isLoopback) return false;

  const configured = (process.env.MCP_ALLOWED_REDIRECT_HOSTS ?? "")
    .split(",").map(h => h.trim().toLowerCase()).filter(Boolean);
  const allowed = configured.length ? configured : ["claude.ai", "anthropic.com", "localhost", "127.0.0.1"];

  const host = url.hostname.toLowerCase();
  // Match the host itself or any subdomain of it — never a suffix match on the
  // raw string, which would let "notclaude.ai" through.
  return allowed.some(a => host === a || host.endsWith(`.${a}`));
}

export function createOAuthRouter() {
  const router = Router();

  /** GET /.well-known/oauth-authorization-server */
  router.get("/oauth-authorization-server", (req: Request, res: Response) => {
    const base = `${req.protocol}://${req.get("host")}`;
    res.json({
      issuer: base,
      authorization_endpoint: `${base}/oauth/authorize`,
      token_endpoint: `${base}/oauth/token`,
      registration_endpoint: `${base}/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      code_challenge_methods_supported: ["S256"],
    });
  });

  return router;
}

export function createOAuthEndpoints() {
  const router = Router();

  /** POST /oauth/register — dynamic client registration */
  router.post("/register", (req: Request, res: Response) => {
    res.json({
      client_id: "mylifos-mcp",
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: req.body?.redirect_uris ?? [],
      grant_types: ["authorization_code"],
      response_types: ["code"],
    });
  });

  /**
   * GET /oauth/authorize
   *
   * Issues an authorization code, but only to a signed-in browser session
   * belonging to the account the MCP server actually serves.
   *
   * This previously auto-approved anyone. Because MCP_AUTH_TOKEN grants tool
   * access as EXTERNAL_USER_ID — read and write on tasks, goals, chores and
   * recipes, plus send_email — two unauthenticated requests were enough for a
   * stranger to act as that user. Requiring a session, checking that the session
   * belongs to the owner, and constraining where the code may be delivered are
   * what make this endpoint safe to leave publicly routable.
   */
  router.get("/authorize", (req: Request, res: Response) => {
    const { redirect_uri, state } = req.query as Record<string, string>;
    if (!redirect_uri) return res.status(400).send("Missing redirect_uri");

    if (!redirectUriAllowed(redirect_uri)) {
      console.warn(`[mcp-oauth] rejected redirect_uri: ${redirect_uri}`);
      return res.status(400).send(
        "redirect_uri is not an allowed destination. Set MCP_ALLOWED_REDIRECT_HOSTS if the connector's callback host has changed."
      );
    }

    // Must be a signed-in session.
    //
    // Deliberately not redirecting to /login: that route ignores a return URL
    // and lands on the dashboard, which would abandon the handshake half-done
    // and look like the connector failed. Failing closed with an instruction is
    // honest and recoverable — the connector opens this in a normal browser, so
    // the owner is usually already signed in, and if not, one retry fixes it.
    if (!req.isAuthenticated?.()) {
      return res.status(401).send(
        "Sign in to mylifos.com in this browser, then start the connection again."
      );
    }

    // The token maps to one account, so only that account may authorize it.
    // Without this, any signed-up user could complete the flow and receive a
    // token that reads and writes the owner's data.
    const sessionUserId = (req.user as { id?: number } | undefined)?.id;
    const ownerId = getExternalUserId();
    if (sessionUserId !== ownerId) {
      console.warn(`[mcp-oauth] user ${sessionUserId} tried to authorize the connector owned by ${ownerId}`);
      return res.status(403).send("This connector can only be authorized by the account that owns it.");
    }

    const code = `mlcode-${randomUUID()}`;
    pendingCodes.set(code, {
      redirectUri: redirect_uri,
      userId: sessionUserId,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });
    setTimeout(() => pendingCodes.delete(code), 5 * 60 * 1000);

    const url = new URL(redirect_uri);
    url.searchParams.set("code", code);
    if (state) url.searchParams.set("state", state);
    res.redirect(url.toString());
  });

  /** POST /oauth/token — exchange a code for the access token */
  router.post("/token", (req: Request, res: Response) => {
    const { code, grant_type, redirect_uri } = req.body ?? {};
    if (grant_type !== "authorization_code") {
      return res.status(400).json({ error: "unsupported_grant_type" });
    }

    const entry = code ? pendingCodes.get(code) : undefined;
    // Single use: consume it whatever the outcome, so a leaked code can't be
    // retried against a different redirect_uri.
    if (code) pendingCodes.delete(code);

    if (!entry || entry.expiresAt < Date.now()) {
      return res.status(400).json({ error: "invalid_grant" });
    }
    // If the client sent a redirect_uri, it must match the one the code was
    // issued for — standard OAuth code-injection defence.
    if (redirect_uri && redirect_uri !== entry.redirectUri) {
      console.warn("[mcp-oauth] redirect_uri mismatch on token exchange");
      return res.status(400).json({ error: "invalid_grant" });
    }
    if (entry.userId !== getExternalUserId()) {
      return res.status(403).json({ error: "invalid_grant" });
    }

    const token = process.env.MCP_AUTH_TOKEN?.trim();
    if (!token) return res.status(503).json({ error: "MCP_AUTH_TOKEN not configured" });

    res.json({
      access_token: token,
      token_type: "Bearer",
      scope: "mcp",
    });
  });

  return router;
}

// ── Express Router ───────────────────────────────────────────────────────────

// Legacy SSE sessions
const sseSessions = new Map<string, SSEServerTransport>();
// Streamable HTTP sessions (newer MCP spec, used by Cowork after OAuth)
const httpSessions = new Map<string, StreamableHTTPServerTransport>();

export function createMcpRouter() {
  const router = Router();

  // ── Streamable HTTP transport (POST /mcp or GET /mcp with MCP-Session-Id) ──
  // This is what Cowork uses after OAuth.

  router.post("/", requireMcpAuth, async (req: Request, res: Response) => {
    res.setHeader("X-Accel-Buffering", "no");
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (sessionId) {
      // Existing session — look it up
      const existing = httpSessions.get(sessionId);
      if (!existing) {
        // Session expired (e.g. server restarted) — client must reinitialize
        return res.status(404).json({ error: "Session expired, please reinitialize" });
      }
      await existing.handleRequest(req, res, req.body);
      return;
    }

    // No session ID → new connection, expect initialize
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => {
        httpSessions.set(sid, transport);
      },
    });
    transport.onclose = () => {
      if (transport.sessionId) httpSessions.delete(transport.sessionId);
    };
    const server = buildMcpServer();
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  router.get("/", requireMcpAuth, async (req: Request, res: Response) => {
    res.setHeader("X-Accel-Buffering", "no");
    res.setHeader("Cache-Control", "no-cache");
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    const transport = sessionId ? httpSessions.get(sessionId) : undefined;
    if (!transport) return res.status(404).json({ error: "Session expired, please reinitialize" });
    await transport.handleRequest(req, res);
  });

  router.delete("/", requireMcpAuth, async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (sessionId) {
      const transport = httpSessions.get(sessionId);
      if (transport) { await transport.close(); httpSessions.delete(sessionId); }
    }
    res.status(204).end();
  });

  // ── Legacy SSE transport (GET /mcp/sse) ──────────────────────────────────

  router.get("/sse", requireMcpAuth, async (req: Request, res: Response) => {
    res.setHeader("X-Accel-Buffering", "no");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    const transport = new SSEServerTransport("/mcp/message", res);
    sseSessions.set(transport.sessionId, transport);
    res.on("close", () => sseSessions.delete(transport.sessionId));
    const server = buildMcpServer();
    await server.connect(transport);
  });

  router.post("/message", async (req: Request, res: Response) => {
    const sessionId = req.query.sessionId as string;
    const transport = sseSessions.get(sessionId);
    if (!transport) return res.status(400).json({ error: "No active SSE session" });
    await transport.handlePostMessage(req, res);
  });

  return router;
}
