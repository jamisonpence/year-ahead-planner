import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Router, Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import nodemailer from "nodemailer";
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

function getMailTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
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
      const task = await storage.updateGeneralTask(id, updates);
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

  // ── Email ────────────────────────────────────────────────────────────────

  server.tool(
    "send_email",
    "Send an email from the configured Gmail account",
    {
      to: z.string().describe("Recipient email address"),
      subject: z.string().describe("Email subject"),
      body: z.string().describe("Plain-text email body"),
    },
    async ({ to, subject, body }) => {
      if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
        return {
          content: [{ type: "text", text: "Gmail not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD." }],
          isError: true,
        };
      }
      const transporter = getMailTransporter();
      await transporter.sendMail({
        from: process.env.GMAIL_USER,
        to,
        subject,
        text: body,
      });
      return { content: [{ type: "text", text: `Email sent to ${to}` }] };
    },
  );

  return server;
}

// ── OAuth 2.0 endpoints (required by MCP spec for Cowork/Claude connectors) ──
// Single-user app: authorize auto-approves and issues MCP_AUTH_TOKEN directly.

const pendingCodes = new Map<string, string>(); // code → redirect_uri

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

  /** GET /oauth/authorize — auto-approve and redirect with code */
  router.get("/authorize", (req: Request, res: Response) => {
    const { redirect_uri, state } = req.query as Record<string, string>;
    if (!redirect_uri) return res.status(400).send("Missing redirect_uri");

    const code = `mlcode-${Math.random().toString(36).slice(2)}`;
    pendingCodes.set(code, redirect_uri);
    // Codes expire after 5 minutes
    setTimeout(() => pendingCodes.delete(code), 5 * 60 * 1000);

    const url = new URL(redirect_uri);
    url.searchParams.set("code", code);
    if (state) url.searchParams.set("state", state);
    res.redirect(url.toString());
  });

  /** POST /oauth/token — exchange code for access token */
  router.post("/token", (req: Request, res: Response) => {
    const { code, grant_type } = req.body ?? {};
    if (grant_type !== "authorization_code") {
      return res.status(400).json({ error: "unsupported_grant_type" });
    }
    if (!code || !pendingCodes.has(code)) {
      return res.status(400).json({ error: "invalid_grant" });
    }
    pendingCodes.delete(code);

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
    let transport = sessionId ? httpSessions.get(sessionId) : undefined;

    if (!transport) {
      // New session — create transport + server
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          httpSessions.set(sid, transport!);
        },
      });
      transport.onclose = () => {
        if (transport!.sessionId) httpSessions.delete(transport!.sessionId);
      };
      const server = buildMcpServer();
      await server.connect(transport);
    }

    await transport.handleRequest(req, res, req.body);
  });

  router.get("/", requireMcpAuth, async (req: Request, res: Response) => {
    res.setHeader("X-Accel-Buffering", "no");
    res.setHeader("Cache-Control", "no-cache");
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    const transport = sessionId ? httpSessions.get(sessionId) : undefined;
    if (!transport) return res.status(400).json({ error: "No active session" });
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
