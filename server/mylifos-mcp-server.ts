import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import nodemailer from "nodemailer";
import { storage } from "./storage.js";

// ── Auth ─────────────────────────────────────────────────────────────────────

function requireMcpAuth(req: Request, res: Response, next: NextFunction) {
  const token = process.env.MCP_AUTH_TOKEN?.trim();
  if (!token) {
    return res.status(503).json({ error: "MCP_AUTH_TOKEN not configured" });
  }
  const header = req.headers.authorization;
  const provided = header?.startsWith("Bearer ")
    ? header.slice(7).trim()
    : (req.headers["x-mcp-auth"] as string | undefined)?.trim();
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

// ── Express Router ───────────────────────────────────────────────────────────

const activeSessions = new Map<string, SSEServerTransport>();

export function createMcpRouter() {
  const router = Router();

  /** GET /mcp/sse — open an SSE connection */
  router.get("/sse", requireMcpAuth, async (req: Request, res: Response) => {
    const transport = new SSEServerTransport("/mcp/message", res);
    activeSessions.set(transport.sessionId, transport);

    res.on("close", () => {
      activeSessions.delete(transport.sessionId);
    });

    const server = buildMcpServer();
    await server.connect(transport);
  });

  /** POST /mcp/message?sessionId=<id> — send a message to an active session */
  router.post("/message", requireMcpAuth, async (req: Request, res: Response) => {
    const sessionId = req.query.sessionId as string;
    const transport = activeSessions.get(sessionId);
    if (!transport) {
      return res.status(400).json({ error: "No active session with that id" });
    }
    await transport.handlePostMessage(req, res);
  });

  return router;
}
