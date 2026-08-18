import express from "express";
import type { Express, Request, Response, NextFunction } from "express";
import { createServer } from "http";
import { storage, pool } from "./storage";
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
  insertGoalSchema,
  insertGoalKeyResultSchema, insertGoalTaskSchema,
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
  insertPetSchema, insertPetVetVisitSchema,
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
  RELATIONSHIP_STATUSES,
  RELATION_TYPES,
  RELATION_INVERSE,
  PROFILE_VISIBILITY_DEFAULTS,
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

// ── Admin access ─────────────────────────────────────────────────────────────
// Hardcoded owner accounts. Add or remove emails here (lowercase) — a database
// write can never grant admin, which keeps the blast radius small.
const ADMIN_EMAILS = new Set<string>([
  "jamisonpence@gmail.com",
  "jamison@trysecurelead.com",
]);

export function isAdminUser(user: unknown): boolean {
  const email = (user as User | undefined)?.email;
  return !!email && ADMIN_EMAILS.has(email.toLowerCase().trim());
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
  if (!isAdminUser(req.user)) return res.status(403).json({ error: "Forbidden" });
  next();
}

import { initWebPush, getVapidPublicKey, saveSubscription, removeSubscription, sendPushToUser } from "./push";

/** Fire-and-forget notification creator — never throws or blocks the main request.
 *  Persists an in-app notification AND pushes it to the user's devices. */
function notify(n: { userId: number; type: string; title: string; body?: string | null; href?: string | null; actorId?: number | null; pushActions?: { action: string; title: string }[]; pushTag?: string }) {
  storage.createNotification(n).catch(() => {});
  sendPushToUser(n.userId, { title: n.title, body: n.body, href: n.href, actions: n.pushActions, tag: n.pushTag }).catch(() => {});
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

import { scryptSync, randomBytes, timingSafeEqual } from "crypto";
import rateLimit from "express-rate-limit";
import { registerExternalApiRoutes } from "./routes/externalApi";

/** Strip secrets before sending a user row to the client. */
function sanitizeUser(user: User) {
  const {
    passwordHash,
    anthropicApiKeyEnc,
    gcalAccessToken, gcalRefreshToken,
    stravaAccessToken, stravaRefreshToken,
    linkedinAccessToken,
    facebookAccessToken,
    googleContactsAccessToken, googleContactsRefreshToken,
    ...safe
  } = user;
  return safe;
}

export async function registerRoutes(_httpServer: ReturnType<typeof createServer>, app: Express) {

  // Throttle credential endpoints — blocks password brute-forcing.
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20, // 20 attempts per IP per 15 min
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many attempts. Please try again in a few minutes." },
  });

  // ── Today (unified agenda) ───────────────────────────────────────────────────
  // Everything actionable today across all modules in one call:
  // tasks, project tasks, house tasks, chores, habits, events, plant watering.
  app.get("/api/today", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as User).id;
      const today = (req.query.date as string) || new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
      res.json(await storage.getTodayItems(userId, today));
    } catch (e) { handleError(res, e); }
  });

  // ── Notifications ────────────────────────────────────────────────────────────
  app.get("/api/notifications", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as User).id;
      const limit = Math.min(+(req.query.limit ?? 20), 50);
      res.json(await storage.getNotifications(userId, limit));
    } catch (e) { handleError(res, e); }
  });

  app.get("/api/notifications/unread-count", requireAuth, async (req, res) => {
    try {
      res.json({ count: await storage.getUnreadNotificationCount((req.user as User).id) });
    } catch (e) { handleError(res, e); }
  });

  app.post("/api/notifications/mark-read", requireAuth, async (req, res) => {
    try {
      await storage.markAllNotificationsRead((req.user as User).id);
      res.json({ ok: true });
    } catch (e) { handleError(res, e); }
  });

  // ── Web push ─────────────────────────────────────────────────────────────────
  initWebPush().catch((e) => console.error("initWebPush:", e));

  app.get("/api/push/public-key", requireAuth, (_req, res) => {
    const key = getVapidPublicKey();
    if (!key) return res.status(503).json({ error: "Push not configured" });
    res.json({ key });
  });

  app.post("/api/push/subscribe", requireAuth, async (req, res) => {
    try {
      const sub = req.body?.subscription ?? req.body;
      if (!sub?.endpoint || !sub?.keys) return res.status(400).json({ error: "subscription with endpoint and keys required" });
      await saveSubscription((req.user as User).id, sub);
      res.json({ ok: true });
    } catch (e) { handleError(res, e); }
  });

  app.post("/api/push/unsubscribe", requireAuth, async (req, res) => {
    try {
      const { endpoint } = req.body ?? {};
      if (!endpoint) return res.status(400).json({ error: "endpoint required" });
      await removeSubscription((req.user as User).id, endpoint);
      res.json({ ok: true });
    } catch (e) { handleError(res, e); }
  });

  // ── Data export ──────────────────────────────────────────────────────────────
  // Full JSON dump of everything the user owns. A life repository people trust
  // is one they know they can leave with.
  app.get("/api/export", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const directTables = [
        "events", "books", "workout_templates", "workout_logs", "workout_plans",
        "goals", "projects", "general_tasks", "purchase_items", "recipes",
        "meal_bundles", "week_plan", "grocery_checks", "custom_grocery_items",
        "timeline_entries", "relationship_groups", "people", "google_contacts",
        "facebook_friends", "linkedin_contacts", "movies", "movie_lists",
        "music_artists", "music_songs", "music_collections", "budget_categories",
        "transactions", "subscriptions", "receipts", "plants", "chores",
        "house_projects", "appliances", "spots", "spot_folders", "trips",
        "visited_cities", "family_members", "children", "pets", "quotes",
        "mantras", "hobbies", "art_pieces", "equipment", "journal_entries",
        "sacred_texts", "faith_practices", "sermons", "prayer_items",
        "medications", "health_metrics", "sleep_logs", "care_providers",
        "political_officials", "political_issues", "political_elections",
        "civic_actions", "political_news_sources", "activity_feed",
        "body_comp_plans", "food_log_entries", "water_logs", "nutrition_goals",
        "reading_goals", "habits", "notifications",
      ];
      const childTables: Array<[string, string, string]> = [
        ["tasks", "events", "event_id"],
        ["reading_sessions", "books", "book_id"],
        ["project_tasks", "projects", "project_id"],
        ["house_project_tasks", "house_projects", "house_project_id"],
        ["child_milestones", "children", "child_id"],
        ["child_memories", "children", "child_id"],
        ["child_prep_items", "children", "child_id"],
        ["pet_vet_visits", "pets", "pet_id"],
        ["music_collection_items", "music_collections", "collection_id"],
        ["trip_items", "trips", "trip_id"],
        ["body_comp_check_ins", "body_comp_plans", "plan_id"],
      ];
      const shareTables = ["shares"];

      const data: Record<string, unknown[]> = {};
      for (const t of directTables) {
        try { data[t] = (await pool.query(`SELECT * FROM ${t} WHERE user_id = $1`, [uid])).rows; } catch {}
      }
      for (const [child, parent, fk] of childTables) {
        try {
          data[child] = (await pool.query(
            `SELECT c.* FROM ${child} c JOIN ${parent} p ON p.id = c.${fk} WHERE p.user_id = $1`, [uid]
          )).rows;
        } catch {}
      }
      for (const t of shareTables) {
        try { data[t] = (await pool.query(`SELECT * FROM ${t} WHERE from_user_id = $1 OR to_user_id = $1`, [uid])).rows; } catch {}
      }

      const date = new Date().toISOString().slice(0, 10);
      res.setHeader("Content-Disposition", `attachment; filename="mylifos-export-${date}.json"`);
      res.json({
        exportedAt: new Date().toISOString(),
        user: sanitizeUser(req.user as User),
        data,
      });
    } catch (e) { handleError(res, e); }
  });

  // ── Invite links ─────────────────────────────────────────────────────────────
  // Each user gets one permanent invite code. Visiting /invite/:code stores the
  // code in the session; after signup or login the two users are auto-friended.
  async function applyPendingInvite(req: Request, userId: number) {
    try {
      const code = (req.session as any)?.inviteCode;
      if (!code) return;
      delete (req.session as any).inviteCode;
      const inv = await pool.query(`SELECT from_user_id FROM invites WHERE code=$1`, [code]);
      const inviterId: number | undefined = inv.rows[0]?.from_user_id;
      if (!inviterId || inviterId === userId) return;
      const existing = await pool.query(
        `SELECT 1 FROM friend_requests
         WHERE ((from_user_id=$1 AND to_user_id=$2) OR (from_user_id=$2 AND to_user_id=$1))
           AND status IN ('pending','accepted') LIMIT 1`,
        [inviterId, userId]
      );
      if (existing.rows.length) return;
      await pool.query(
        `INSERT INTO friend_requests (from_user_id, to_user_id, status, created_at) VALUES ($1,$2,'accepted',$3)`,
        [inviterId, userId, new Date().toISOString()]
      );
      await pool.query(`UPDATE invites SET uses = uses + 1 WHERE code=$1`, [code]);
      const inviter = await storage.getUserById(inviterId);
      const invitee = await storage.getUserById(userId);
      notify({
        userId: inviterId, type: "friend_request", actorId: userId,
        title: `${invitee?.name ?? "Someone"} joined from your invite — you're now friends`,
        href: "/relationships",
      });
      notify({
        userId, type: "friend_request", actorId: inviterId,
        title: `You're now friends with ${inviter?.name ?? "your inviter"}`,
        href: "/relationships",
      });
    } catch (e) { console.error("invite apply error:", e); }
  }

  /** GET /invite/:code — public landing for invite links */
  app.get("/invite/:code", async (req, res) => {
    const code = req.params.code?.trim();
    if (code) {
      const inv = await pool.query(`SELECT from_user_id FROM invites WHERE code=$1`, [code]).catch(() => ({ rows: [] as any[] }));
      if (inv.rows.length) {
        (req.session as any).inviteCode = code;
        if (req.isAuthenticated()) await applyPendingInvite(req, (req.user as User).id);
      }
    }
    res.redirect("/");
  });

  /** POST /api/invites — get (or create) my permanent invite link */
  app.post("/api/invites", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as User).id;
      let r = await pool.query(`SELECT code FROM invites WHERE from_user_id=$1 LIMIT 1`, [userId]);
      if (!r.rows.length) {
        const code = randomBytes(6).toString("base64url");
        r = await pool.query(
          `INSERT INTO invites (code, from_user_id, uses, created_at) VALUES ($1,$2,0,$3) RETURNING code`,
          [code, userId, new Date().toISOString()]
        );
      }
      const proto = req.get("x-forwarded-proto") ?? req.protocol ?? "https";
      res.json({ code: r.rows[0].code, url: `${proto}://${req.get("host")}/invite/${r.rows[0].code}` });
    } catch (e) { handleError(res, e); }
  });

  // ── Contact matching ─────────────────────────────────────────────────────────
  // Match imported Google/LinkedIn contacts (by email) against MyLifos users.
  app.get("/api/friends/contact-matches", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as User).id;
      const matches = await pool.query(
        `SELECT DISTINCT ON (u.id) u.id, u.name, u.email, u.avatar_url,
                src.source, src.contact_name
         FROM (
           SELECT LOWER(email) AS email, 'google' AS source,
                  TRIM(COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')) AS contact_name
           FROM google_contacts WHERE user_id=$1 AND email IS NOT NULL
           UNION ALL
           SELECT LOWER(email), 'linkedin',
                  TRIM(first_name || ' ' || COALESCE(last_name,''))
           FROM linkedin_contacts WHERE user_id=$1 AND email IS NOT NULL
         ) src
         JOIN users u ON LOWER(u.email) = src.email
         WHERE u.id != $1
         ORDER BY u.id`,
        [userId]
      );
      if (!matches.rows.length) return res.json([]);
      const ids = matches.rows.map((m: any) => m.id);
      const rel = await pool.query(
        `SELECT id, from_user_id, to_user_id, status FROM friend_requests
         WHERE (from_user_id=$1 AND to_user_id = ANY($2)) OR (to_user_id=$1 AND from_user_id = ANY($2))`,
        [userId, ids]
      );
      const relByUser = new Map<number, { status: string; incomingRequestId?: number }>();
      for (const fr of rel.rows) {
        const otherId = fr.from_user_id === userId ? fr.to_user_id : fr.from_user_id;
        if (fr.status === "accepted") relByUser.set(otherId, { status: "friends" });
        else if (fr.status === "pending" && fr.from_user_id === userId) relByUser.set(otherId, { status: "outgoing_pending" });
        else if (fr.status === "pending") relByUser.set(otherId, { status: "incoming", incomingRequestId: fr.id });
      }
      res.json(matches.rows.map((m: any) => ({
        id: m.id, name: m.name, email: m.email, avatarUrl: m.avatar_url,
        source: m.source, contactName: m.contact_name || null,
        relationshipStatus: relByUser.get(m.id)?.status ?? "none",
        incomingRequestId: relByUser.get(m.id)?.incomingRequestId ?? null,
      })));
    } catch (e) { handleError(res, e); }
  });

  // ── Attachments (photos/files on any item) ───────────────────────────────────
  // Generic: attach files to journal entries, kid memories, hobbies, etc.
  // Stored on local disk like receipts; served behind auth.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS attachments (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      item_type TEXT NOT NULL,
      item_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_attachments_item ON attachments (user_id, item_type, item_id)`).catch(() => {});

  const ATTACH_DIR = path.resolve("uploads/attachments");
  if (!fs.existsSync(ATTACH_DIR)) fs.mkdirSync(ATTACH_DIR, { recursive: true });

  const attachUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, ATTACH_DIR),
      filename: (_req, file, cb) => {
        const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        cb(null, `${unique}${path.extname(file.originalname)}`);
      },
    }),
    limits: { fileSize: 15 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/gif", "application/pdf"];
      cb(null, allowed.includes(file.mimetype));
    },
  });

  // Serve behind auth — attachments are personal photos
  app.use("/uploads/attachments", requireAuth, express.static(ATTACH_DIR));

  app.post("/api/attachments", requireAuth, attachUpload.single("file"), async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const { itemType, itemId } = req.body ?? {};
      if (!req.file) return res.status(400).json({ error: "file required (jpeg/png/webp/heic/gif/pdf, max 15MB)" });
      if (!itemType || !itemId) return res.status(400).json({ error: "itemType and itemId required" });
      const r = await pool.query(
        `INSERT INTO attachments (user_id, item_type, item_id, filename, original_name, mime_type, size_bytes, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [uid, itemType, +itemId, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, new Date().toISOString()]
      );
      const a = r.rows[0];
      res.status(201).json({ id: a.id, itemType: a.item_type, itemId: a.item_id, url: `/uploads/attachments/${a.filename}`, originalName: a.original_name, mimeType: a.mime_type, sizeBytes: a.size_bytes, createdAt: a.created_at });
    } catch (e) { handleError(res, e); }
  });

  app.get("/api/attachments", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const { itemType, itemId } = req.query as Record<string, string>;
      const r = itemType && itemId
        ? await pool.query(`SELECT * FROM attachments WHERE user_id=$1 AND item_type=$2 AND item_id=$3 ORDER BY created_at`, [uid, itemType, +itemId])
        : await pool.query(`SELECT * FROM attachments WHERE user_id=$1 AND item_type=$2 ORDER BY created_at`, [uid, itemType ?? ""]);
      res.json(r.rows.map((a: any) => ({ id: a.id, itemType: a.item_type, itemId: a.item_id, url: `/uploads/attachments/${a.filename}`, originalName: a.original_name, mimeType: a.mime_type, sizeBytes: a.size_bytes, createdAt: a.created_at })));
    } catch (e) { handleError(res, e); }
  });

  app.delete("/api/attachments/:id", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const r = await pool.query(`DELETE FROM attachments WHERE id=$1 AND user_id=$2 RETURNING filename`, [+req.params.id, uid]);
      if (!r.rows[0]) return res.status(404).json({ error: "Not found" });
      fs.unlink(path.join(ATTACH_DIR, r.rows[0].filename), () => {});
      res.json({ ok: true });
    } catch (e) { handleError(res, e); }
  });

  // ── Journal notes (folders/notes) ────────────────────────────────────────────
  // Previously localStorage-only; now server-backed so notes survive devices
  // and browser resets. Stored as one JSON document per user.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notes_data (
      user_id INTEGER PRIMARY KEY,
      data_json TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL
    )
  `);

  app.get("/api/notes-data", requireAuth, async (req, res) => {
    try {
      const r = await pool.query(`SELECT data_json FROM notes_data WHERE user_id=$1`, [(req.user as User).id]);
      try { res.json(JSON.parse(r.rows[0]?.data_json ?? "[]")); }
      catch { res.json([]); }
    } catch (e) { handleError(res, e); }
  });

  app.put("/api/notes-data", requireAuth, async (req, res) => {
    try {
      const data = Array.isArray(req.body?.data) ? req.body.data : [];
      await pool.query(
        `INSERT INTO notes_data (user_id, data_json, updated_at) VALUES ($1,$2,$3)
         ON CONFLICT (user_id) DO UPDATE SET data_json=$2, updated_at=$3`,
        [(req.user as User).id, JSON.stringify(data), new Date().toISOString()]
      );
      res.json({ ok: true });
    } catch (e) { handleError(res, e); }
  });

  // ── User preferences (intentions, persona, etc.) ─────────────────────────────
  // One JSON document per user; same pattern as notes_data.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_prefs_data (
      user_id INTEGER PRIMARY KEY,
      data_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL
    )
  `);

  app.get("/api/me/prefs", requireAuth, async (req, res) => {
    try {
      const r = await pool.query(`SELECT data_json FROM user_prefs_data WHERE user_id=$1`, [(req.user as User).id]);
      try { res.json(JSON.parse(r.rows[0]?.data_json ?? "{}")); }
      catch { res.json({}); }
    } catch (e) { handleError(res, e); }
  });

  app.put("/api/me/prefs", requireAuth, async (req, res) => {
    try {
      const data = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
      await pool.query(
        `INSERT INTO user_prefs_data (user_id, data_json, updated_at) VALUES ($1,$2,$3)
         ON CONFLICT (user_id) DO UPDATE SET data_json=$2, updated_at=$3`,
        [(req.user as User).id, JSON.stringify(data), new Date().toISOString()]
      );
      res.json({ ok: true });
    } catch (e) { handleError(res, e); }
  });

  // ── On this day (memories resurfacing) ───────────────────────────────────────
  // Entries from this same calendar date in previous years, plus 1/3/6 months ago.
  app.get("/api/on-this-day", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
      const [y, m, d] = today.split("-").map(Number);
      const mmdd = today.slice(5); // "MM-DD"

      const monthsAgo = (n: number) => {
        const dt = new Date(Date.UTC(y, m - 1 - n, Math.min(d, 28)));
        return dt.toISOString().slice(0, 10);
      };
      const recentDates = [monthsAgo(1), monthsAgo(3), monthsAgo(6)];

      const label = (dateISO: string): string => {
        const yearsAgo = y - +dateISO.slice(0, 4);
        if (dateISO.slice(5) === mmdd && yearsAgo > 0) return `${yearsAgo} year${yearsAgo === 1 ? "" : "s"} ago today`;
        const months = (y - +dateISO.slice(0, 4)) * 12 + (m - +dateISO.slice(5, 7));
        return `${months} month${months === 1 ? "" : "s"} ago`;
      };

      // Same MM-DD in a previous year, or one of the months-ago dates
      const dateMatch = `(
        (SUBSTRING(%COL% FROM 6 FOR 5) = $2 AND %COL% < $3)
        OR %COL% = ANY($4)
      )`;
      const q = (table: string, col: string, select: string) =>
        pool.query(
          `SELECT ${select}, ${col} AS mem_date FROM ${table}
           WHERE user_id = $1 AND ${col} IS NOT NULL AND ${dateMatch.replace(/%COL%/g, col)}
           ORDER BY ${col} DESC LIMIT 5`,
          [uid, mmdd, today, recentDates]
        ).catch(() => ({ rows: [] as any[] }));

      const [journal, memories, milestones, timeline, cities, booksRows] = await Promise.all([
        q("journal_entries", "date", `id, COALESCE(title, LEFT(content, 70)) AS title, mood AS sub`),
        q("child_memories", "date", `id, title, description AS sub`),
        q("child_milestones", "date", `id, title, category AS sub`),
        q("timeline_entries", "date", `id, COALESCE(note, interaction_type) AS title, interaction_type AS sub`),
        q("visited_cities", "visited_date", `id, city AS title, country AS sub`),
        q("books", "finish_date", `id, title, author AS sub`),
      ]);

      const items = [
        ...journal.rows.map((r: any) => ({ type: "journal", emoji: "✍️", href: "/journal", ...r })),
        ...memories.rows.map((r: any) => ({ type: "memory", emoji: "💛", href: "/kids", ...r })),
        ...milestones.rows.map((r: any) => ({ type: "milestone", emoji: "🌟", href: "/kids", ...r })),
        ...timeline.rows.map((r: any) => ({ type: "moment", emoji: "👥", href: "/relationships", ...r })),
        ...cities.rows.map((r: any) => ({ type: "travel", emoji: "🌍", href: "/spots", ...r })),
        ...booksRows.rows.map((r: any) => ({ type: "book", emoji: "📚", href: "/reading", ...r })),
      ]
        .map((it: any) => ({
          type: it.type, emoji: it.emoji, href: it.href, id: it.id,
          title: it.title, sub: it.sub ?? null, date: it.mem_date, when: label(it.mem_date),
        }))
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 8);

      res.json({ date: today, items });
    } catch (e) { handleError(res, e); }
  });

  // ── Weekly review ────────────────────────────────────────────────────────────
  // Monday-anchored week. Stats are computed live; the reflection is saved.
  function mondayOf(dateISO: string): string {
    const d = new Date(dateISO + "T00:00:00Z");
    const dow = d.getUTCDay(); // 0=Sun
    d.setUTCDate(d.getUTCDate() - ((dow + 6) % 7));
    return d.toISOString().slice(0, 10);
  }

  app.get("/api/review/weekly", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
      const weekStart = mondayOf(today);
      const weekAgo = new Date(new Date(today + "T00:00:00Z").getTime() - 7 * 86400_000).toISOString().slice(0, 10);
      const weekAhead = new Date(new Date(today + "T00:00:00Z").getTime() + 7 * 86400_000).toISOString().slice(0, 10);

      const [workouts, sessions, booksFinished, choresDone, journals, habitsRows, goalsRows, upcomingEvents, dueTasks, savedReview, agenda, completedGeneral, completedProject, nextProjectActions] = await Promise.all([
        pool.query(`SELECT COUNT(*)::int AS c FROM workout_logs WHERE user_id=$1 AND completed=true AND date >= $2 AND date <= $3`, [uid, weekAgo, today]),
        pool.query(`SELECT COALESCE(SUM(rs.pages_read),0)::int AS pages, COUNT(*)::int AS c FROM reading_sessions rs JOIN books b ON b.id = rs.book_id WHERE b.user_id=$1 AND rs.date >= $2 AND rs.date <= $3 AND rs.planned = false`, [uid, weekAgo, today]),
        pool.query(`SELECT COUNT(*)::int AS c FROM books WHERE user_id=$1 AND status='finished' AND finish_date >= $2 AND finish_date <= $3`, [uid, weekAgo, today]),
        pool.query(`SELECT COUNT(*)::int AS c FROM chores WHERE user_id=$1 AND last_completed >= $2 AND last_completed <= $3`, [uid, weekAgo, today]),
        pool.query(`SELECT COUNT(*)::int AS c FROM journal_entries WHERE user_id=$1 AND date >= $2 AND date <= $3`, [uid, weekAgo, today]),
        pool.query(`SELECT completions_json FROM habits WHERE user_id=$1 AND is_archived=false`, [uid]),
        pool.query(`SELECT id, title, description, progress_current, progress_target, target_date, priority FROM goals WHERE user_id=$1 ORDER BY priority DESC`, [uid]),
        pool.query(`SELECT id, title, date, time FROM events WHERE user_id=$1 AND date > $2 AND date <= $3 ORDER BY date LIMIT 15`, [uid, today, weekAhead]),
        pool.query(`SELECT id, title, due_date, priority FROM general_tasks WHERE user_id=$1 AND completed=false AND due_date IS NOT NULL AND due_date <= $2 ORDER BY due_date LIMIT 25`, [uid, weekAhead]),
        pool.query(`SELECT * FROM weekly_reviews WHERE user_id=$1 AND week_start=$2`, [uid, weekStart]),
        storage.getTodayItems(uid, today),
        pool.query(`SELECT id, title, due_date FROM general_tasks WHERE user_id=$1 AND completed=true ORDER BY id DESC LIMIT 12`, [uid]),
        pool.query(`
          SELECT pt.id, pt.title, pt.due_date, p.title AS project_title, g.title AS goal_title
          FROM project_tasks pt
          JOIN projects p ON p.id = pt.project_id
          LEFT JOIN goals g ON g.id = p.goal_id
          WHERE p.user_id=$1 AND pt.completed=true
          ORDER BY pt.id DESC
          LIMIT 12
        `, [uid]),
        pool.query(`
          SELECT DISTINCT ON (p.id)
            pt.id, pt.title, pt.due_date, pt.priority,
            p.id AS project_id, p.title AS project_title, p.status AS project_status,
            g.id AS goal_id, g.title AS goal_title, g.description AS goal_description, g.priority AS goal_priority,
            g.progress_current, g.progress_target
          FROM projects p
          JOIN project_tasks pt ON pt.project_id = p.id AND pt.completed = false
          LEFT JOIN goals g ON g.id = p.goal_id
          WHERE p.user_id=$1 AND p.status != 'done' AND p.status != 'blocked'
          ORDER BY p.id, pt.due_date NULLS LAST, pt.id
          LIMIT 10
        `, [uid]),
      ]);

      // Habit completion rate over the window
      let habitDone = 0;
      const habitPossible = habitsRows.rows.length * 7;
      for (const h of habitsRows.rows) {
        try {
          const comps: Array<{ date: string }> = JSON.parse(h.completions_json || "[]");
          habitDone += comps.filter((c) => c.date > weekAgo && c.date <= today).length;
        } catch {}
      }

      const goals = goalsRows.rows.map((g: any) => ({
        id: g.id, title: g.title, description: g.description,
        progressPct: Math.min(100, Math.round((+g.progress_current / (+g.progress_target || 1)) * 100)),
        targetDate: g.target_date, priority: g.priority,
      }));
      const completedItems = [
        ...completedGeneral.rows.map((t: any) => ({ type: "task", id: t.id, title: t.title, context: "Task", dueDate: t.due_date ?? null })),
        ...completedProject.rows.map((t: any) => ({ type: "project", id: t.id, title: t.title, context: [t.goal_title, t.project_title].filter(Boolean).join(" · ") || "Project", dueDate: t.due_date ?? null })),
      ].slice(0, 10);
      const nextActions = nextProjectActions.rows.map((r: any) => ({
        id: r.id,
        title: r.title,
        dueDate: r.due_date ?? null,
        priority: r.priority ?? "medium",
        projectId: r.project_id,
        projectTitle: r.project_title,
        goalId: r.goal_id,
        goalTitle: r.goal_title,
        goalDescription: r.goal_description,
        progressPct: Math.min(100, Math.round((+r.progress_current / (+r.progress_target || 1)) * 100)),
      }));
      const suggestedFocus = nextActions[0]?.goalTitle
        ? `Move ${nextActions[0].goalTitle} forward by finishing "${nextActions[0].title}".`
        : goals[0]?.title ? `Move ${goals[0].title} forward with one concrete next action.` : "";

      const saved = savedReview.rows[0];
      res.json({
        weekStart,
        stats: {
          workouts: workouts.rows[0].c,
          readingSessions: sessions.rows[0].c,
          pagesRead: sessions.rows[0].pages,
          booksFinished: booksFinished.rows[0].c,
          choresDone: choresDone.rows[0].c,
          journalEntries: journals.rows[0].c,
          habitCompletions: habitDone,
          habitPossible,
          habitRate: habitPossible ? Math.round((habitDone / habitPossible) * 100) : null,
          overdueNow: agenda.counts.overdue,
        },
        goals,
        upcoming: {
          events: upcomingEvents.rows.map((e: any) => ({ id: e.id, title: e.title, date: e.date, time: e.time })),
          tasks: dueTasks.rows.map((t: any) => ({ id: t.id, title: t.title, dueDate: t.due_date, priority: t.priority, overdue: t.due_date < today })),
        },
        completedItems,
        nextActions,
        suggestedFocus,
        review: saved ? { wins: saved.wins, challenges: saved.challenges, focus: saved.focus } : null,
        aiPlan: saved?.ai_plan_json ? (() => { try { return JSON.parse(saved.ai_plan_json); } catch { return null; } })() : null,
      });
    } catch (e) { handleError(res, e); }
  });

  app.post("/api/review", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const { wins, challenges, focus, stats } = req.body ?? {};
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
      const weekStart = mondayOf(today);
      const r = await pool.query(
        `INSERT INTO weekly_reviews (user_id, week_start, wins, challenges, focus, stats_json, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (user_id, week_start)
         DO UPDATE SET wins=$3, challenges=$4, focus=$5, stats_json=$6
         RETURNING *`,
        [uid, weekStart, wins ?? null, challenges ?? null, focus ?? null, JSON.stringify(stats ?? {}), new Date().toISOString()]
      );
      res.json(r.rows[0]);
    } catch (e) { handleError(res, e); }
  });

  /** GET /api/review/focus — this week's saved focus (lightweight, for the dashboard header) */
  app.get("/api/review/focus", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
      const r = await pool.query(`SELECT focus FROM weekly_reviews WHERE user_id=$1 AND week_start=$2`, [uid, mondayOf(today)]);
      res.json({ focus: r.rows[0]?.focus || null });
    } catch (e) { handleError(res, e); }
  });

  /** PUT /api/review/focus - save just this week's focus from Today */
  app.put("/api/review/focus", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const focus = typeof req.body?.focus === "string" ? req.body.focus.trim() : "";
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
      const weekStart = mondayOf(today);
      const r = await pool.query(
        `INSERT INTO weekly_reviews (user_id, week_start, focus, stats_json, created_at)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (user_id, week_start)
         DO UPDATE SET focus=$3
         RETURNING focus`,
        [uid, weekStart, focus || null, "{}", new Date().toISOString()]
      );
      res.json({ focus: r.rows[0]?.focus || null });
    } catch (e) { handleError(res, e); }
  });

  // ── Time-blocking ────────────────────────────────────────────────────────────
  // Put a task on the calendar: sets its due date and creates (or moves) a
  // linked calendar block, optionally at a specific time.
  app.post("/api/schedule-task", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const { taskType = "general", taskId, date, time } = req.body ?? {};
      if (!taskId || !date) return res.status(400).json({ error: "taskId and date required" });

      let title: string | null = null;
      if (taskType === "general") {
        const t = await pool.query(`SELECT title FROM general_tasks WHERE id=$1 AND user_id=$2`, [taskId, uid]);
        if (!t.rows[0]) return res.status(404).json({ error: "Task not found" });
        title = t.rows[0].title;
        await pool.query(`UPDATE general_tasks SET due_date=$1 WHERE id=$2 AND user_id=$3`, [date, taskId, uid]);
      } else if (taskType === "project") {
        const t = await pool.query(
          `SELECT pt.title FROM project_tasks pt JOIN projects p ON p.id = pt.project_id WHERE pt.id=$1 AND p.user_id=$2`,
          [taskId, uid]);
        if (!t.rows[0]) return res.status(404).json({ error: "Task not found" });
        title = t.rows[0].title;
        await pool.query(`UPDATE project_tasks SET due_date=$1 WHERE id=$2`, [date, taskId]);
      } else {
        return res.status(400).json({ error: "taskType must be general or project" });
      }

      // Upsert the linked calendar block
      const existing = await pool.query(
        `SELECT id FROM events WHERE user_id=$1 AND linked_task_id=$2 AND linked_task_type=$3`,
        [uid, taskId, taskType]);
      let event;
      if (existing.rows[0]) {
        event = (await pool.query(
          `UPDATE events SET date=$1, time=$2, title=$3 WHERE id=$4 RETURNING *`,
          [date, time ?? null, title, existing.rows[0].id])).rows[0];
      } else {
        event = (await pool.query(
          `INSERT INTO events (user_id, title, date, category, recurring, time, linked_task_id, linked_task_type)
           VALUES ($1,$2,$3,'task','none',$4,$5,$6) RETURNING *`,
          [uid, title, date, time ?? null, taskId, taskType])).rows[0];
      }
      res.json({ ok: true, event });
    } catch (e) { handleError(res, e); }
  });

  // ── AI weekly planner ────────────────────────────────────────────────────────
  // Turns active goals/projects/tasks into a concrete week of scheduled tasks.
  app.post("/api/ai/plan-week", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const enc = await storage.getAnthropicApiKeyEnc(uid);
      if (!enc) return res.status(402).json({ error: "no_api_key", message: "Add your Anthropic API key in Settings to use AI features." });
      const apiKey = decrypt(enc);

      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
      const weekAhead = new Date(new Date(today + "T00:00:00Z").getTime() + 7 * 86400_000).toISOString().slice(0, 10);
      const { focus } = req.body ?? {};

      const [goalsWithProjects, generalTasks, eventsAhead, habitsRows] = await Promise.all([
        storage.getAllGoalsWithProjects(uid),
        storage.getAllGeneralTasks(uid),
        pool.query(`SELECT title, date, time FROM events WHERE user_id=$1 AND date >= $2 AND date <= $3 ORDER BY date`, [uid, today, weekAhead]),
        pool.query(`SELECT title FROM habits WHERE user_id=$1 AND is_archived=false LIMIT 10`, [uid]),
      ]);

      const activeGoals = goalsWithProjects.map((g) => ({
        title: g.title,
        pct: Math.round((g.progressCurrent / (g.progressTarget || 1)) * 100),
        targetDate: g.targetDate,
        projects: (g.projects ?? []).filter((p: any) => p.status !== "done").map((p: any) => ({
          title: p.title,
          openTasks: p.tasks.filter((t: any) => !t.completed).map((t: any) => t.title).slice(0, 5),
        })),
      }));
      const openTasks = generalTasks.filter((t) => !t.completed)
        .map((t) => `${t.title}${t.priority === "high" ? " [HIGH]" : ""}${t.dueDate ? ` (due ${t.dueDate})` : " (no due date)"}`);

      const prompt = `You are a personal productivity coach planning the next 7 days (${today} through ${weekAhead}) for a user.

${focus ? `THE USER'S STATED FOCUS FOR THIS WEEK: ${focus}\n` : ""}
ACTIVE GOALS (with % progress and open project tasks):
${activeGoals.length ? JSON.stringify(activeGoals, null, 1) : "none"}

OPEN STANDALONE TASKS:
${openTasks.length ? openTasks.slice(0, 20).map((t) => `- ${t}`).join("\n") : "none"}

ALREADY ON THE CALENDAR THIS WEEK:
${eventsAhead.rows.length ? eventsAhead.rows.map((e: any) => `- ${e.date}${e.time ? " " + e.time : ""}: ${e.title}`).join("\n") : "nothing"}

DAILY HABITS: ${habitsRows.rows.map((h: any) => h.title).join(", ") || "none"}

Produce a realistic week plan as pure JSON (no markdown fences, no commentary):
{
  "summary": "2-3 sentence encouraging overview of the week's plan and priorities",
  "suggestions": [
    { "title": "specific, actionable task", "date": "YYYY-MM-DD", "time": "HH:MM or null",
      "reason": "one short line tying it to a goal/deadline", "source": "goal|project|task|new" }
  ]
}
Rules:
- 6 to 12 suggestions total, at most 3 per day, spread across the week
- Prioritize: overdue and high-priority tasks first, then tasks that advance the goals closest to their target dates or the user's stated focus
- Existing due dates should be respected; don't schedule on top of calendar events
- Titles must be concrete next actions (verb-first), not vague themes
- Dates must be within ${today} to ${weekAhead}`;

      const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 2000,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!aiRes.ok) {
        const detail = await aiRes.text();
        return res.status(502).json({ error: "AI request failed", detail: detail.slice(0, 200) });
      }
      const aiJson = await aiRes.json();
      const text = aiJson?.content?.[0]?.text ?? "";
      const parsed = extractJson(text) as { summary?: string; suggestions?: unknown[] } | null;
      if (!parsed || !Array.isArray(parsed.suggestions)) {
        return res.status(502).json({ error: "AI returned an unexpected format. Try again." });
      }
      const planPayload = { summary: parsed.summary ?? "", suggestions: parsed.suggestions };
      // Persist for the week so Review opens pre-planned (survives navigation/devices)
      try {
        const wkToday = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
        await pool.query(
          `INSERT INTO weekly_reviews (user_id, week_start, stats_json, ai_plan_json, created_at)
           VALUES ($1,$2,'{}',$3,$4)
           ON CONFLICT (user_id, week_start) DO UPDATE SET ai_plan_json=$3`,
          [uid, mondayOf(wkToday), JSON.stringify(planPayload), new Date().toISOString()]
        );
      } catch {}
      res.json(planPayload);
    } catch (e) { handleError(res, e); }
  });

  /** Accept AI suggestions: creates general tasks (+ timed calendar blocks). */
  app.post("/api/ai/plan-week/accept", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const items: Array<{ title: string; date: string; time?: string | null }> = req.body?.items ?? [];
      if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: "items required" });
      if (items.length > 25) return res.status(400).json({ error: "too many items" });
      const created = [];
      for (const item of items) {
        if (!item.title?.trim() || !item.date) continue;
        const task = (await pool.query(
          `INSERT INTO general_tasks (user_id, title, completed, due_date, priority, sort_order)
           VALUES ($1,$2,false,$3,'medium',0) RETURNING *`,
          [uid, item.title.trim(), item.date])).rows[0];
        if (item.time) {
          await pool.query(
            `INSERT INTO events (user_id, title, date, category, recurring, time, linked_task_id, linked_task_type)
             VALUES ($1,$2,$3,'task','none',$4,$5,'general')`,
            [uid, item.title.trim(), item.date, item.time, task.id]);
        }
        created.push(task);
      }
      // Suggestions are now real tasks — clear the cached plan for the week
      try {
        const wkToday = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
        await pool.query(
          `UPDATE weekly_reviews SET ai_plan_json = NULL WHERE user_id = $1 AND week_start = $2`,
          [uid, mondayOf(wkToday)]
        );
      } catch {}
      res.status(201).json({ created: created.length, tasks: created });
    } catch (e) { handleError(res, e); }
  });

  // ── Accountability buddies ───────────────────────────────────────────────────
  // Items where I'm someone's buddy: their goals, reading goals, nutrition
  // goals, and workout plans, with owner info and live progress.
  app.get("/api/buddies/mine", requireAuth, async (req, res) => {
    try {
      const me = (req.user as User).id;
      const [goals, reading, nutrition, plans] = await Promise.all([
        pool.query(
          `SELECT g.id, g.title, g.progress_current, g.progress_target, g.progress_type, g.target_date,
                  u.id AS owner_id, u.name AS owner_name, u.avatar_url AS owner_avatar
           FROM goals g JOIN users u ON u.id = g.user_id
           WHERE g.buddy_user_id = $1`, [me]),
        pool.query(
          `SELECT rg.id, rg.books_target, rg.year, rg.label,
                  u.id AS owner_id, u.name AS owner_name, u.avatar_url AS owner_avatar,
                  (SELECT COUNT(*) FROM books b WHERE b.user_id = rg.user_id AND b.status = 'finished'
                    AND b.finish_date >= (rg.year || '-01-01') AND b.finish_date <= (rg.year || '-12-31'))::int AS books_finished
           FROM reading_goals rg JOIN users u ON u.id = rg.user_id
           WHERE rg.buddy_user_id = $1`, [me]),
        pool.query(
          `SELECT ng.id, ng.calories,
                  u.id AS owner_id, u.name AS owner_name, u.avatar_url AS owner_avatar,
                  COALESCE((SELECT SUM(f.calories * f.quantity) FROM food_log_entries f
                    WHERE f.user_id = ng.user_id AND f.date = $2), 0)::int AS calories_today
           FROM nutrition_goals ng JOIN users u ON u.id = ng.user_id
           WHERE ng.buddy_user_id = $1`,
          [me, new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" })]),
        pool.query(
          `SELECT wp.id, wp.name, wp.goal_type, wp.start_date, wp.duration_weeks, wp.is_active,
                  u.id AS owner_id, u.name AS owner_name, u.avatar_url AS owner_avatar,
                  (SELECT COUNT(*) FROM workout_logs wl WHERE wl.user_id = wp.user_id AND wl.completed = true
                    AND wl.date >= TO_CHAR(NOW() - INTERVAL '7 days', 'YYYY-MM-DD'))::int AS workouts_this_week
           FROM workout_plans wp JOIN users u ON u.id = wp.user_id
           WHERE wp.buddy_user_id = $1 AND wp.is_active = true`, [me]),
      ]);
      const owner = (r: any) => ({ id: r.owner_id, name: r.owner_name, avatarUrl: r.owner_avatar });
      res.json({
        goals: goals.rows.map((r: any) => ({
          id: r.id, title: r.title, progressCurrent: +r.progress_current, progressTarget: +r.progress_target,
          progressType: r.progress_type, targetDate: r.target_date, owner: owner(r),
        })),
        readingGoals: reading.rows.map((r: any) => ({
          id: r.id, label: r.label, year: r.year, booksTarget: r.books_target, booksFinished: r.books_finished, owner: owner(r),
        })),
        nutritionGoals: nutrition.rows.map((r: any) => ({
          id: r.id, calories: r.calories, caloriesToday: r.calories_today, owner: owner(r),
        })),
        workoutPlans: plans.rows.map((r: any) => ({
          id: r.id, name: r.name, goalType: r.goal_type, workoutsThisWeek: r.workouts_this_week, owner: owner(r),
        })),
      });
    } catch (e) { handleError(res, e); }
  });

  /** POST /api/buddies/nudge — send an encouraging poke to someone you're a buddy for */
  app.post("/api/buddies/nudge", requireAuth, async (req, res) => {
    try {
      const me = req.user as User;
      const { toUserId, itemTitle } = req.body ?? {};
      if (!toUserId) return res.status(400).json({ error: "toUserId required" });
      // Verify I'm actually a buddy on something of theirs
      const check = await pool.query(
        `SELECT 1 FROM goals WHERE user_id=$1 AND buddy_user_id=$2
         UNION SELECT 1 FROM reading_goals WHERE user_id=$1 AND buddy_user_id=$2
         UNION SELECT 1 FROM nutrition_goals WHERE user_id=$1 AND buddy_user_id=$2
         UNION SELECT 1 FROM workout_plans WHERE user_id=$1 AND buddy_user_id=$2
         LIMIT 1`, [toUserId, me.id]);
      if (!check.rows.length) return res.status(403).json({ error: "You're not a buddy on anything of theirs" });
      notify({
        userId: +toUserId, type: "buddy_nudge", actorId: me.id,
        title: `👊 ${me.name} is checking in${itemTitle ? ` on "${itemTitle}"` : ""}`,
        body: "Your accountability buddy wants to see some progress!",
        href: "/goals",
      });
      res.json({ ok: true });
    } catch (e) { handleError(res, e); }
  });

  // ── Global search ────────────────────────────────────────────────────────────
  // One query across every module the user tracks. Powers the Cmd-K palette.
  app.get("/api/search", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as User).id;
      const q = String(req.query.q ?? "").trim();
      if (q.length < 2) return res.json([]);
      const pat = `%${q.replace(/[%_]/g, "\\$&")}%`;
      const sql = `
        (SELECT 'goal' AS type, id, title, category AS sub, '/goals' AS href FROM goals WHERE user_id=$1 AND title ILIKE $2 LIMIT 5)
        UNION ALL (SELECT 'project', id, title, status, '/tasks' FROM projects WHERE user_id=$1 AND title ILIKE $2 LIMIT 5)
        UNION ALL (SELECT 'task', id, title, NULL, '/tasks' FROM general_tasks WHERE user_id=$1 AND title ILIKE $2 LIMIT 5)
        UNION ALL (SELECT 'book', id, title, author, '/reading' FROM books WHERE user_id=$1 AND (title ILIKE $2 OR author ILIKE $2) LIMIT 5)
        UNION ALL (SELECT 'movie', id, title, director, '/movies' FROM movies WHERE user_id=$1 AND title ILIKE $2 LIMIT 5)
        UNION ALL (SELECT 'artist', id, name, genres, '/music' FROM music_artists WHERE user_id=$1 AND name ILIKE $2 LIMIT 5)
        UNION ALL (SELECT 'song', id, title, album, '/music' FROM music_songs WHERE user_id=$1 AND title ILIKE $2 LIMIT 5)
        UNION ALL (SELECT 'recipe', id, name, category, '/recipes' FROM recipes WHERE user_id=$1 AND name ILIKE $2 LIMIT 5)
        UNION ALL (SELECT 'spot', id, name, city, '/spots' FROM spots WHERE user_id=$1 AND name ILIKE $2 LIMIT 5)
        UNION ALL (SELECT 'person', id, TRIM(first_name || ' ' || COALESCE(last_name,'')), notes, '/relationships' FROM people WHERE user_id=$1 AND (first_name ILIKE $2 OR last_name ILIKE $2) LIMIT 5)
        UNION ALL (SELECT 'quote', id, LEFT(text, 80), author, '/quotes' FROM quotes WHERE user_id=$1 AND (text ILIKE $2 OR author ILIKE $2) LIMIT 5)
        UNION ALL (SELECT 'journal', id, COALESCE(title, LEFT(content, 60)), date, '/journal' FROM journal_entries WHERE user_id=$1 AND (title ILIKE $2 OR content ILIKE $2) LIMIT 5)
        UNION ALL (SELECT 'event', id, title, date, '/calendar' FROM events WHERE user_id=$1 AND title ILIKE $2 LIMIT 5)
        UNION ALL (SELECT 'chore', id, title, category, '/housekeeping' FROM chores WHERE user_id=$1 AND title ILIKE $2 LIMIT 5)
        UNION ALL (SELECT 'hobby', id, name, category, '/hobbies' FROM hobbies WHERE user_id=$1 AND name ILIKE $2 LIMIT 5)
        UNION ALL (SELECT 'habit', id, title, category, '/habits' FROM habits WHERE user_id=$1 AND title ILIKE $2 LIMIT 5)
        UNION ALL (SELECT 'trip', id, name, destination, '/spots' FROM trips WHERE user_id=$1 AND (name ILIKE $2 OR destination ILIKE $2) LIMIT 5)
        UNION ALL (SELECT 'art', id, title, artist_name, '/art' FROM art_pieces WHERE user_id=$1 AND (title ILIKE $2 OR artist_name ILIKE $2) LIMIT 5)
        UNION ALL (SELECT 'plant', id, name, species, '/plants' FROM plants WHERE user_id=$1 AND name ILIKE $2 LIMIT 5)
        LIMIT 60`;
      const r = await pool.query(sql, [userId, pat]);
      res.json(r.rows);
    } catch (e) { handleError(res, e); }
  });

  app.get("/api/mylifos/hub", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as User).id;
      const [summary, shared, recent, favorites, notes] = await Promise.all([
        storage.getUserSummary(userId),
        storage.getRecommendationsInbox(userId, "all"),
        pool.query(
          `SELECT activity_type, item_type, item_title, item_subtitle, item_image_url, created_at
           FROM activity_feed
           WHERE user_id=$1 AND item_title IS NOT NULL
           ORDER BY created_at DESC
           LIMIT 8`,
          [userId]
        ),
        pool.query(
          `(SELECT 'movie' AS type, id, title, media_type AS subtitle, '/library?tab=watching' AS href FROM movies WHERE user_id=$1 AND is_favorite=true LIMIT 5)
           UNION ALL (SELECT 'artist', id, name, genres, '/library?tab=music' FROM music_artists WHERE user_id=$1 AND is_favorite=true LIMIT 5)
           UNION ALL (SELECT 'song', id, title, album, '/library?tab=music' FROM music_songs WHERE user_id=$1 AND is_favorite=true LIMIT 5)
           UNION ALL (SELECT 'place', id, name, city, '/places' FROM spots WHERE user_id=$1 AND is_favorite=true LIMIT 5)
           UNION ALL (SELECT 'quote', id, LEFT(text, 90), author, '/quotes' FROM quotes WHERE user_id=$1 AND is_favorite=true LIMIT 5)
           UNION ALL (SELECT 'interest', id, name, category, '/hobbies' FROM hobbies WHERE user_id=$1 AND is_favorite=true LIMIT 5)
           UNION ALL (SELECT 'art', id, title, artist_name, '/library?tab=art' FROM art_pieces WHERE user_id=$1 AND is_favorite=true LIMIT 5)
           UNION ALL (SELECT 'note', id, COALESCE(title, LEFT(content, 80)), date, '/journal' FROM journal_entries WHERE user_id=$1 AND is_favorite=true LIMIT 5)
           LIMIT 12`,
          [userId]
        ),
        pool.query(
          `SELECT
             (SELECT COUNT(*)::int FROM journal_entries WHERE user_id=$1) AS total,
             COALESCE(json_agg(row_to_json(j)) FILTER (WHERE j.id IS NOT NULL), '[]'::json) AS recent
           FROM (
             SELECT id, COALESCE(title, LEFT(content, 80)) AS title, date, mood
             FROM journal_entries
             WHERE user_id=$1
             ORDER BY date DESC, id DESC
             LIMIT 4
           ) j`,
          [userId]
        ),
      ]);

      const collections = [
        { key: "media", label: "Media", href: "/library", count: (summary.counts.reading ?? 0) + (summary.counts.movies ?? 0) + (summary.counts.music ?? 0) + (summary.counts.art ?? 0), items: ["Books", "Watching", "Music", "Art"] },
        { key: "interests", label: "Interests", href: "/hobbies", count: summary.counts.hobbies ?? 0, items: ["Hobbies", "Plans", "Skills"] },
        { key: "health", label: "Health", href: "/health", count: (summary.counts.workouts ?? 0) + (summary.counts.health ?? 0) + (summary.counts.recipes ?? 0), items: ["Workouts", "Vitals", "Recipes"] },
        { key: "places", label: "Places & Trips", href: "/places", count: summary.counts.spots ?? 0, items: ["Places", "Trips", "Memories"] },
        { key: "home", label: "Home", href: "/housekeeping", count: summary.counts.housekeeping ?? 0, items: ["Chores", "Projects", "Household"] },
        { key: "finance", label: "Finance", href: "/budget", count: summary.counts.budget ?? 0, items: ["Budget", "Transactions", "Bills"] },
        { key: "faith", label: "Faith", href: "/faith", count: summary.counts.faith ?? 0, items: ["Texts", "Practices", "Prayer"] },
        { key: "civic", label: "Civic", href: "/politics", count: summary.counts.politics ?? 0, items: ["Issues", "Officials", "Debates"] },
      ];

      res.json({
        recentlySaved: recent.rows.map((row: any) => ({
          type: row.item_type ?? row.activity_type,
          title: row.item_title,
          subtitle: row.item_subtitle,
          imageUrl: row.item_image_url,
          createdAt: row.created_at,
        })),
        collections,
        sharedWithMe: shared.slice(0, 6),
        favorites: favorites.rows,
        privateNotes: {
          total: notes.rows[0]?.total ?? 0,
          recent: notes.rows[0]?.recent ?? [],
        },
        lifeStats: summary,
      });
    } catch (e) { handleError(res, e); }
  });

  // ── Life Graph ──────────────────────────────────────────────────────────────
  // Generic connection layer for people, places, media, goals, trips, workouts,
  // notes, habits, projects, recommendations, and future life entities.
  const LIFE_GRAPH_TYPES = new Set([
    "person", "place", "book", "music", "recipe", "goal", "trip", "workout",
    "note", "habit", "project", "recommendation", "movie", "art", "quote",
  ]);
  const LIFE_GRAPH_RELATIONS = new Set([
    "related", "supports", "shared_with", "recommended_by", "visited_with",
    "planned_for", "inspired_by", "memory", "accountability", "interest",
  ]);
  const GRAPH_TYPE_META: Record<string, { label: string; href: string }> = {
    person: { label: "Person", href: "/people" },
    place: { label: "Place", href: "/places" },
    book: { label: "Book", href: "/library" },
    music: { label: "Music", href: "/library?tab=music" },
    recipe: { label: "Recipe", href: "/health?tab=recipes" },
    goal: { label: "Goal", href: "/goals" },
    trip: { label: "Trip", href: "/places?tab=trips" },
    workout: { label: "Workout", href: "/health" },
    note: { label: "Note", href: "/journal" },
    habit: { label: "Habit", href: "/habits" },
    project: { label: "Project", href: "/tasks" },
    recommendation: { label: "Recommendation", href: "/people?tab=discover" },
    movie: { label: "Movie", href: "/library?tab=watching" },
    art: { label: "Art", href: "/library?tab=art" },
    quote: { label: "Quote", href: "/quotes" },
  };

  function graphType(type: unknown): string | null {
    const t = String(type ?? "").trim().toLowerCase();
    return LIFE_GRAPH_TYPES.has(t) ? t : null;
  }
  function graphRelation(relation: unknown): string {
    const r = String(relation ?? "related").trim().toLowerCase();
    return LIFE_GRAPH_RELATIONS.has(r) ? r : "related";
  }
  async function graphEntitySummary(userId: number, type: string, id: number) {
    const meta = GRAPH_TYPE_META[type] ?? { label: type, href: "/" };
    let row: any | undefined;
    switch (type) {
      case "person":
        row = (await pool.query(`SELECT TRIM(first_name || ' ' || COALESCE(last_name,'')) AS title, notes AS subtitle FROM people WHERE user_id=$1 AND id=$2`, [userId, id])).rows[0];
        break;
      case "place":
        row = (await pool.query(`SELECT name AS title, city AS subtitle FROM spots WHERE user_id=$1 AND id=$2`, [userId, id])).rows[0];
        break;
      case "book":
        row = (await pool.query(`SELECT title, author AS subtitle FROM books WHERE user_id=$1 AND id=$2`, [userId, id])).rows[0];
        break;
      case "music":
        row = (await pool.query(`SELECT name AS title, genres AS subtitle FROM music_artists WHERE user_id=$1 AND id=$2`, [userId, id])).rows[0];
        break;
      case "recipe":
        row = (await pool.query(`SELECT name AS title, category AS subtitle FROM recipes WHERE user_id=$1 AND id=$2`, [userId, id])).rows[0];
        break;
      case "goal":
        row = (await pool.query(`SELECT title, priority AS subtitle FROM goals WHERE user_id=$1 AND id=$2`, [userId, id])).rows[0];
        break;
      case "trip":
        row = (await pool.query(`SELECT name AS title, destination AS subtitle FROM trips WHERE user_id=$1 AND id=$2`, [userId, id])).rows[0];
        break;
      case "workout":
        row = (await pool.query(`SELECT name AS title, date AS subtitle FROM workout_logs WHERE user_id=$1 AND id=$2`, [userId, id])).rows[0];
        break;
      case "note":
        row = (await pool.query(`SELECT COALESCE(title, LEFT(content, 80)) AS title, date AS subtitle FROM journal_entries WHERE user_id=$1 AND id=$2`, [userId, id])).rows[0];
        break;
      case "habit":
        row = (await pool.query(`SELECT title, category AS subtitle FROM habits WHERE user_id=$1 AND id=$2`, [userId, id])).rows[0];
        break;
      case "project":
        row = (await pool.query(`SELECT title, status AS subtitle FROM projects WHERE user_id=$1 AND id=$2`, [userId, id])).rows[0];
        break;
      case "movie":
        row = (await pool.query(`SELECT title, media_type AS subtitle FROM movies WHERE user_id=$1 AND id=$2`, [userId, id])).rows[0];
        break;
      case "art":
        row = (await pool.query(`SELECT title, artist_name AS subtitle FROM art_pieces WHERE user_id=$1 AND id=$2`, [userId, id])).rows[0];
        break;
      case "quote":
        row = (await pool.query(`SELECT LEFT(text, 80) AS title, author AS subtitle FROM quotes WHERE user_id=$1 AND id=$2`, [userId, id])).rows[0];
        break;
      case "recommendation":
        row = (await pool.query(`SELECT item_title AS title, item_subtitle AS subtitle FROM activity_feed WHERE user_id=$1 AND id=$2`, [userId, id])).rows[0];
        break;
    }
    if (!row) return null;
    return { type, id, typeLabel: meta.label, title: row.title, subtitle: row.subtitle ?? null, href: meta.href };
  }

  app.get("/api/life-graph/search", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as User).id;
      const q = String(req.query.q ?? "").trim();
      if (q.length < 2) return res.json([]);
      const pat = `%${q.replace(/[%_]/g, "\\$&")}%`;
      const sql = `
        (SELECT 'person' AS type, id, TRIM(first_name || ' ' || COALESCE(last_name,'')) AS title, notes AS subtitle, '/people' AS href FROM people WHERE user_id=$1 AND (first_name ILIKE $2 OR last_name ILIKE $2) LIMIT 6)
        UNION ALL (SELECT 'place', id, name, city, '/places' FROM spots WHERE user_id=$1 AND (name ILIKE $2 OR city ILIKE $2) LIMIT 6)
        UNION ALL (SELECT 'book', id, title, author, '/library' FROM books WHERE user_id=$1 AND (title ILIKE $2 OR author ILIKE $2) LIMIT 6)
        UNION ALL (SELECT 'music', id, name, genres, '/library?tab=music' FROM music_artists WHERE user_id=$1 AND name ILIKE $2 LIMIT 6)
        UNION ALL (SELECT 'recipe', id, name, category, '/health?tab=recipes' FROM recipes WHERE user_id=$1 AND name ILIKE $2 LIMIT 6)
        UNION ALL (SELECT 'goal', id, title, priority, '/goals' FROM goals WHERE user_id=$1 AND title ILIKE $2 LIMIT 6)
        UNION ALL (SELECT 'trip', id, name, destination, '/places?tab=trips' FROM trips WHERE user_id=$1 AND (name ILIKE $2 OR destination ILIKE $2) LIMIT 6)
        UNION ALL (SELECT 'workout', id, name, date, '/health' FROM workout_logs WHERE user_id=$1 AND name ILIKE $2 LIMIT 6)
        UNION ALL (SELECT 'note', id, COALESCE(title, LEFT(content, 80)), date, '/journal' FROM journal_entries WHERE user_id=$1 AND (title ILIKE $2 OR content ILIKE $2) LIMIT 6)
        UNION ALL (SELECT 'habit', id, title, category, '/habits' FROM habits WHERE user_id=$1 AND title ILIKE $2 LIMIT 6)
        UNION ALL (SELECT 'project', id, title, status, '/tasks' FROM projects WHERE user_id=$1 AND title ILIKE $2 LIMIT 6)
        UNION ALL (SELECT 'movie', id, title, media_type, '/library?tab=watching' FROM movies WHERE user_id=$1 AND title ILIKE $2 LIMIT 6)
        UNION ALL (SELECT 'art', id, title, artist_name, '/library?tab=art' FROM art_pieces WHERE user_id=$1 AND (title ILIKE $2 OR artist_name ILIKE $2) LIMIT 6)
        UNION ALL (SELECT 'quote', id, LEFT(text, 80), author, '/quotes' FROM quotes WHERE user_id=$1 AND (text ILIKE $2 OR author ILIKE $2) LIMIT 6)
        LIMIT 80`;
      const r = await pool.query(sql, [userId, pat]);
      res.json(r.rows.map((row: any) => ({ ...row, typeLabel: GRAPH_TYPE_META[row.type]?.label ?? row.type })));
    } catch (e) { handleError(res, e); }
  });

  app.get("/api/life-graph/:type/:id", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as User).id;
      const type = graphType(req.params.type);
      const id = Number(req.params.id);
      if (!type || !Number.isFinite(id)) return res.status(400).json({ error: "Invalid entity" });
      const entity = await graphEntitySummary(userId, type, id);
      if (!entity) return res.status(404).json({ error: "Entity not found" });

      const links = await pool.query(
        `SELECT * FROM life_graph_links
         WHERE user_id=$1 AND ((source_type=$2 AND source_id=$3) OR (target_type=$2 AND target_id=$3))
         ORDER BY created_at DESC`,
        [userId, type, id]
      );
      const items = await Promise.all(links.rows.map(async (link: any) => {
        const isSource = link.source_type === type && link.source_id === id;
        const otherType = isSource ? link.target_type : link.source_type;
        const otherId = isSource ? link.target_id : link.source_id;
        const other = await graphEntitySummary(userId, otherType, otherId);
        return { ...link, direction: isSource ? "out" : "in", other };
      }));
      res.json({ entity, links: items.filter((item) => item.other) });
    } catch (e) { handleError(res, e); }
  });

  app.post("/api/life-graph", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as User).id;
      const sourceType = graphType(req.body?.sourceType);
      const targetType = graphType(req.body?.targetType);
      const sourceId = Number(req.body?.sourceId);
      const targetId = Number(req.body?.targetId);
      const relation = graphRelation(req.body?.relation);
      const notes = typeof req.body?.notes === "string" ? req.body.notes.trim() : "";
      if (!sourceType || !targetType || !Number.isFinite(sourceId) || !Number.isFinite(targetId)) {
        return res.status(400).json({ error: "sourceType, sourceId, targetType, and targetId are required" });
      }
      if (sourceType === targetType && sourceId === targetId) return res.status(400).json({ error: "Cannot link an item to itself" });
      const [source, target] = await Promise.all([
        graphEntitySummary(userId, sourceType, sourceId),
        graphEntitySummary(userId, targetType, targetId),
      ]);
      if (!source || !target) return res.status(404).json({ error: "Entity not found" });

      const existing = await pool.query(
        `SELECT * FROM life_graph_links
         WHERE user_id=$1 AND relation=$6 AND (
          (source_type=$2 AND source_id=$3 AND target_type=$4 AND target_id=$5)
          OR (source_type=$4 AND source_id=$5 AND target_type=$2 AND target_id=$3)
         )`,
        [userId, sourceType, sourceId, targetType, targetId, relation]
      );
      if (existing.rows[0]) return res.json(existing.rows[0]);

      const r = await pool.query(
        `INSERT INTO life_graph_links (user_id, source_type, source_id, target_type, target_id, relation, notes, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [userId, sourceType, sourceId, targetType, targetId, relation, notes || null, new Date().toISOString()]
      );
      res.status(201).json(r.rows[0]);
    } catch (e) { handleError(res, e); }
  });

  app.delete("/api/life-graph/:id", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as User).id;
      const id = Number(req.params.id);
      const r = await pool.query(`DELETE FROM life_graph_links WHERE user_id=$1 AND id=$2 RETURNING id`, [userId, id]);
      r.rows[0] ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  // ── Daily digest ─────────────────────────────────────────────────────────────
  // Every 30 min, after 7am (America/Chicago) create one "Your day ahead"
  // notification per user summarizing today's agenda. Guarded to once per day.
  const DIGEST_HOUR = 7;
  const CLOSEOUT_HOUR = 21;
  let lastChoreSweepDate = "";
  const dailyTick = async () => {
    try {
      const now = new Date();
      const hour = +now.toLocaleString("en-US", { timeZone: "America/Chicago", hour: "2-digit", hour12: false });
      if (hour < DIGEST_HOUR) return;
      const today = now.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
      const isSunday = new Date(today + "T00:00:00Z").getUTCDay() === 0;
      const usersRes = await pool.query(`SELECT id FROM users`);

      // ── Streak insurance for chores: auto-reschedule anything overdue by more
      // than one full frequency cycle. A "49d overdue" wall of guilt keeps
      // people out of the app; a chore that's due today invites them back in.
      if (lastChoreSweepDate !== today) {
        lastChoreSweepDate = today;
        await pool.query(
          `UPDATE chores SET next_due = $1
           WHERE is_active = true AND next_due IS NOT NULL AND frequency != 'as_needed'
             AND next_due::date < ($1::date - (CASE frequency
               WHEN 'daily' THEN 1 WHEN 'weekly' THEN 7 WHEN 'biweekly' THEN 14
               WHEN 'monthly' THEN 30 WHEN 'quarterly' THEN 91 WHEN 'yearly' THEN 365
               ELSE GREATEST(COALESCE(custom_frequency_days, 30), 1) END) * INTERVAL '1 day')`,
          [today]
        ).catch((e) => console.error("chore auto-reschedule error:", e));
      }

      // ── Evening close-out: after 9pm, one nudge to check habits, jot a line,
      // and set tomorrow's focus. Only for users who track habits.
      if (hour >= CLOSEOUT_HOUR) {
        for (const u of usersRes.rows) {
          if (await storage.hasNotificationToday(u.id, "evening_closeout", today)) continue;
          const agenda = await storage.getTodayItems(u.id, today);
          const habitItems = agenda.items.filter(i => i.type === "habit");
          if (habitItems.length === 0) continue;
          const left = habitItems.filter(i => !i.done).length;
          notify({
            userId: u.id, type: "evening_closeout",
            title: "Close out your day",
            body: left > 0
              ? `${left} habit${left === 1 ? "" : "s"} to check off · one line about today`
              : "All habits done 🎉 Add one line about today and set tomorrow's focus.",
            href: "/close-day",
            pushTag: "evening-closeout",
          });
        }
      }

      // Sunday afternoon: weekly review reminder (once per Sunday)
      if (isSunday && hour >= 16) {
        for (const u of usersRes.rows) {
          if (await storage.hasNotificationToday(u.id, "weekly_review", today)) continue;
          notify({
            userId: u.id, type: "weekly_review",
            title: "🪞 Time for your weekly review",
            body: "Look back at the week, celebrate wins, and plan the next one.",
            href: "/review",
          });
        }
      }

      for (const u of usersRes.rows) {
        if (await storage.hasNotificationToday(u.id, "daily_digest", today)) continue;
        const agenda = await storage.getTodayItems(u.id, today);
        const open = agenda.counts.total - agenda.counts.done;
        if (open === 0) continue;
        const parts: string[] = [];
        const by = (t: string) => agenda.items.filter(i => i.type === t && !i.done).length;
        const tasks = by("task") + by("project_task") + by("house_task");
        if (tasks) parts.push(`${tasks} task${tasks === 1 ? "" : "s"}`);
        const chores = by("chore"); if (chores) parts.push(`${chores} chore${chores === 1 ? "" : "s"}`);
        const habits = by("habit"); if (habits) parts.push(`${habits} habit${habits === 1 ? "" : "s"}`);
        const events = by("event"); if (events) parts.push(`${events} event${events === 1 ? "" : "s"}`);
        const plants = by("plant"); if (plants) parts.push(`${plants} plant${plants === 1 ? "" : "s"} to water`);
        // One-tap logging: surface up to two due habits as notification action buttons
        const dueHabits = agenda.items.filter(i => i.type === "habit" && !i.done).slice(0, 2);
        notify({
          userId: u.id, type: "daily_digest",
          title: "Your day ahead",
          body: parts.join(" · ") + (agenda.counts.overdue ? ` · ${agenda.counts.overdue} overdue` : ""),
          href: "/dashboard",
          pushTag: "daily-digest",
          pushActions: dueHabits.map(h => ({
            action: `habit:${h.id}`,
            title: `✓ ${h.title.length > 18 ? h.title.slice(0, 17) + "…" : h.title}`,
          })),
        });
      }
    } catch (e) { console.error("daily digest error:", e); }
  };
  setInterval(dailyTick, 30 * 60 * 1000);
  // Run once shortly after boot — frequent deploys restart the server before
  // the 30-minute interval ever fires, which starved the chore sweep entirely.
  setTimeout(dailyTick, 15 * 1000);

  /**
   * Keep Google Calendar fresh for every connected user.
   *
   * Deliberately separate from dailyTick: that one returns early before
   * DIGEST_HOUR, so folding calendar sync into it would leave the calendar stale
   * for most of the day. Events should be current whenever someone looks.
   *
   * Failures are logged per user and never allowed to stop the loop — one
   * revoked grant shouldn't block everyone else's sync.
   */
  const calendarTick = async () => {
    try {
      const connected = await pool.query<{ id: number }>(
        `SELECT id FROM users WHERE gcal_refresh_token IS NOT NULL`
      );
      for (const { id } of connected.rows) {
        try {
          const n = await syncGcalForUser(id);
          if (n !== null && n > 0) console.log(`[gcal] synced ${n} event(s) for user ${id}`);
        } catch (e) {
          console.error(`[gcal] sync failed for user ${id}:`, (e as Error).message);
        }
      }
    } catch (e) { console.error("[gcal] tick error:", e); }
  };
  setInterval(calendarTick, 30 * 60 * 1000);
  setTimeout(calendarTick, 20 * 1000);

  // ── Auth Routes ──────────────────────────────────────────────────────────────
  app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));

  // Switch Google account (force account picker)
  app.get("/auth/google/switch", passport.authenticate("google", {
    scope: ["profile", "email"], prompt: "select_account",
  }));

  // Ensure password_hash column exists (safe to run on every boot)
  try {
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text');
  } catch (_) {}
  // Goal stakes: bets can be linked to a goal (safe to run on every boot)
  try {
    await pool.query('ALTER TABLE bud_bets ADD COLUMN IF NOT EXISTS goal_id integer');
  } catch (_) {}
  // Weekly review: persist the AI-generated plan for the week
  try {
    await pool.query('ALTER TABLE weekly_reviews ADD COLUMN IF NOT EXISTS ai_plan_json text');
  } catch (_) {}
  // Engagement: when we last saw each user (real DAU/WAU, not just content writes)
  try {
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at text');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_users_last_seen_at ON users (last_seen_at)');
  } catch (_) {}
  // Shared household planner state (meal plan + shopping list)
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS planner_state (
      user_id INTEGER PRIMARY KEY,
      data_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
  } catch (_) {}

  // ── Local auth helpers ──────────────────────────────────────────────────────
  function hashPassword(password: string): string {
    const salt = randomBytes(16).toString("hex");
    const hash = scryptSync(password, salt, 64).toString("hex");
    return `${salt}:${hash}`;
  }
  function verifyPassword(password: string, stored: string): boolean {
    try {
      const [salt, hash] = stored.split(":");
      const hashBuf = Buffer.from(hash, "hex");
      const derived = scryptSync(password, salt, 64);
      return timingSafeEqual(hashBuf, derived);
    } catch { return false; }
  }

  // POST /auth/register
  app.post("/auth/register", authLimiter, async (req, res) => {
    const { email, name, password } = req.body ?? {};
    if (!email || !name || !password) return res.status(400).json({ error: "email, name, and password required" });
    if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });
    try {
      const existing = await storage.getUserByEmail(email.toLowerCase().trim());
      if (existing) return res.status(409).json({ error: "An account with that email already exists" });
      const user = await storage.createLocalUser({
        email: email.toLowerCase().trim(),
        name: name.trim(),
        passwordHash: hashPassword(password),
      });
      // keepSessionInfo preserves the pending inviteCode across login's session regeneration
      req.logIn(user, { keepSessionInfo: true }, (err) => {
        if (err) return res.status(500).json({ error: "Login failed after registration" });
        applyPendingInvite(req, user.id).catch(() => {});
        res.json({ ok: true });
      });
    } catch (e: any) {
      res.status(500).json({ error: "Registration failed" });
    }
  });

  // POST /auth/login
  app.post("/auth/login", authLimiter, async (req, res) => {
    const { email, password } = req.body ?? {};
    if (!email || !password) return res.status(400).json({ error: "email and password required" });
    try {
      const user = await storage.getUserByEmail(email.toLowerCase().trim());
      if (!user || !user.passwordHash) return res.status(401).json({ error: "Invalid email or password" });
      if (!verifyPassword(password, user.passwordHash)) return res.status(401).json({ error: "Invalid email or password" });
      // QA account — always start fresh so onboarding can be tested on every login
      const QA_EMAIL = "jamison@trysecurelead.com";
      if (user.email.toLowerCase() === QA_EMAIL) {
        await pool.query(`UPDATE users SET onboarded = false WHERE id = $1`, [user.id]);
        (req.session as any).qaOnboardingPresented = false;
      }
      req.logIn(user, { keepSessionInfo: true }, (err) => {
        if (err) return res.status(500).json({ error: "Login failed" });
        applyPendingInvite(req, user.id).catch(() => {});
        res.json({ ok: true });
      });
    } catch {
      res.status(500).json({ error: "Login failed" });
    }
  });

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
  }, passport.authenticate("google", { failureRedirect: "/", keepSessionInfo: true }),
  (req, res) => {
    if (req.user) applyPendingInvite(req, (req.user as User).id).catch(() => {});
    // After login, honour any pending OAuth connect redirect (e.g. LinkedIn, Facebook)
    const dest = (req.session as any).postLoginRedirect;
    if (dest) {
      delete (req.session as any).postLoginRedirect;
      return res.redirect(dest);
    }
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

  // ── Login page (SPA, no auth required) ──────────────────────────────────────
  app.get("/login", (req, res) => {
    if (req.isAuthenticated()) return res.redirect("/");
    const spaIndex = path.resolve(process.cwd(), "dist/public/index.html");
    if (fs.existsSync(spaIndex)) return res.sendFile(spaIndex);
    res.redirect("/");
  });

  // ── Privacy Policy & Terms ────────────────────────────────────────────────
  app.get("/privacy", (req, res) => {
    res.sendFile(path.resolve(process.cwd(), "privacy.html"));
  });
  app.get("/terms", (req, res) => {
    res.sendFile(path.resolve(process.cwd(), "terms.html"));
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
        req.login(user!, { keepSessionInfo: true }, (err) => (err ? reject(err) : resolve()));
      });
      applyPendingInvite(req, user!.id).catch(() => {});

      res.json({ redirect: "/" });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  const lastSeenTouch = new Map<number, number>();
  const LAST_SEEN_THROTTLE_MS = 60 * 60 * 1000; // at most one write per user per hour

  app.get("/api/me", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Not authenticated" });
    const user = req.user as User;
    // Record engagement. Fire-and-forget and throttled — never blocks the response.
    const now = Date.now();
    if (now - (lastSeenTouch.get(user.id) ?? 0) > LAST_SEEN_THROTTLE_MS) {
      lastSeenTouch.set(user.id, now);
      pool.query(`UPDATE users SET last_seen_at = $1 WHERE id = $2`,
        [new Date().toISOString(), user.id]).catch(() => {});
    }
    const enc = await storage.getAnthropicApiKeyEnc(user.id);
    // Never expose secrets (password hash, OAuth tokens, encrypted API key) —
    // only indicate whether an Anthropic key is saved
    const QA_EMAIL = "jamison@trysecurelead.com";
    const sanitized = sanitizeUser(user);
    // QA account: force onboarded=false on the FIRST /api/me of each login session only.
    // After that, let the user proceed normally so they can complete the flow.
    if (sanitized.email?.toLowerCase() === QA_EMAIL) {
      const sess = req.session as any;
      if (!sess.qaOnboardingPresented) {
        sess.qaOnboardingPresented = true;
        sanitized.onboarded = false;
      }
    }
    res.json({ ...sanitized, hasAnthropicKey: !!enc });
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

  /**
   * Pull Google Calendar into local events for one user.
   *
   * Extracted from the route so the scheduler can call it too. The sync itself
   * always worked — it was simply never invoked. A manual button on the Calendar
   * page was the only trigger, so a connected account could sit at
   * lastSync: null indefinitely and the calendar stayed empty.
   *
   * Returns the number of events synced, or null when the user isn't connected.
   * Throws on API failure so callers can decide whether to surface it.
   */
  async function syncGcalForUser(userId: number): Promise<number | null> {
      const accessToken = await getValidGcalToken(userId);
      if (!accessToken) return null;

      const timeMin = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days ago
      const timeMax = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(); // 1 year ahead
      const apiUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
        `timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&` +
        `maxResults=500&singleEvents=true&orderBy=startTime`;

      const gcalRes = await fetch(apiUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!gcalRes.ok) {
        // A 401 means the grant was revoked — drop the tokens so the UI offers
        // reconnect instead of silently retrying forever.
        if (gcalRes.status === 401) await storage.clearGcalTokens(userId);
        throw new Error(`Google Calendar API ${gcalRes.status}`);
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
      return synced;
  }

  // POST /api/gcal/sync — manual sync from the Calendar page
  app.post("/api/gcal/sync", requireAuth, async (req, res) => {
    try {
      const synced = await syncGcalForUser((req.user as User).id);
      if (synced === null) return res.status(401).json({ error: "Not connected to Google Calendar" });
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

      const updated = await storage.updatePlant(plantId, update, (req.user as User).id);
      res.json(updated);
    } catch (e) {
      console.error("[Plant enrich] Unexpected error:", e);
      handleError(res, e);
    }
  });

  app.post("/api/logout", (req, res) => {
    req.logout(() => { res.json({ ok: true }); });
  });

  // ── External REST API (API-key auth) — see server/routes/externalApi.ts ─────
  // Must register before the /api session guard below so /api/v1 bypasses it.
  registerExternalApiRoutes(app);

  // Protect all remaining /api routes — except OAuth connect/callback endpoints
  // which handle auth themselves (the callback arrives from an external redirect
  // and may not have a session cookie present)
  app.use("/api", (req, res, next) => {
    const oauthPaths = [
      "/api/linkedin/connect",
      "/api/linkedin/callback",
      "/api/facebook/connect",
      "/api/facebook/callback",
      "/api/gcontacts/connect",
      "/api/gcontacts/callback",
    ];
    if (oauthPaths.some(p => req.originalUrl.startsWith(p))) {
      return next();
    }
    return requireAuth(req, res, next);
  });

  // ── Events ──────────────────────────────────────────────────────────────────
  app.get("/api/events", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(await storage.getAllEventsWithTasks(uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/events", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.status(201).json(await storage.createEvent(insertEventSchema.parse(req.body), uid));
    }
    catch (e) { handleError(res, e); }
  });
  app.patch("/api/events/:id", requireAuth, async (req, res) => {
    try {
      const r = await storage.updateEvent(+req.params.id, insertEventSchema.partial().parse(req.body), (req.user as User).id);
      r ? res.json(r) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/events/:id", requireAuth, async (req, res) => {
    (await storage.deleteEvent(+req.params.id, (req.user as User).id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // ── Tasks ────────────────────────────────────────────────────────────────────
  app.post("/api/events/:eventId/tasks", requireAuth, async (req, res) => {
    try { res.status(201).json(await storage.createTask(insertTaskSchema.parse({ ...req.body, eventId: +req.params.eventId }))); }
    catch (e) { handleError(res, e); }
  });
  app.patch("/api/tasks/:id", requireAuth, async (req, res) => {
    try {
      const r = await storage.updateTask(+req.params.id, insertTaskSchema.partial().parse(req.body));
      r ? res.json(r) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/tasks/:id", requireAuth, async (req, res) => {
    (await storage.deleteTask(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // ── Books ────────────────────────────────────────────────────────────────────
  // ── Reading Goal ─────────────────────────────────────────────────────────────
  // Multi-goal reading endpoints
  app.get("/api/reading/goals", requireAuth, async (req, res) => {
    try { res.json(await storage.getReadingGoals((req.user as User).id)); }
    catch (e) { handleError(res, e); }
  });
  app.post("/api/reading/goals", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const { booksTarget, year, label, startDate, endDate, buddyUserId } = req.body;
      const goal = await storage.createReadingGoal(uid, { booksTarget, year, label: label ?? null, startDate: startDate ?? null, endDate: endDate ?? null, buddyUserId: buddyUserId ?? null });
      res.status(201).json(goal);
    } catch (e) { handleError(res, e); }
  });
  app.patch("/api/reading/goals/:id", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const { booksTarget, year, label, startDate, endDate, buddyUserId } = req.body;
      res.json(await storage.updateReadingGoalById(+req.params.id, uid, { booksTarget, year, label: label ?? null, startDate: startDate ?? null, endDate: endDate ?? null, buddyUserId: buddyUserId ?? null }));
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/reading/goals/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteReadingGoalById(+req.params.id, (req.user as User).id);
      res.status(204).end();
    } catch (e) { handleError(res, e); }
  });
  // Legacy single-goal endpoints (kept for backwards compat)
  app.get("/api/reading/goal", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(await storage.getReadingGoal(uid));
    } catch (e) { handleError(res, e); }
  });
  app.patch("/api/reading/goal", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const { booksTarget, year, label, startDate, endDate, buddyUserId } = req.body;
      res.json(await storage.upsertReadingGoal(uid, { booksTarget, year, label: label ?? null, startDate: startDate ?? null, endDate: endDate ?? null, buddyUserId: buddyUserId ?? null }));
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/reading/goal", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      await storage.deleteReadingGoal(uid);
      res.status(204).end();
    } catch (e) { handleError(res, e); }
  });

  app.get("/api/books", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(await storage.getAllBooksWithSessions(uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/books", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const book = await storage.createBook(insertBookSchema.parse(req.body), uid);
      logActivity(uid, "book_added", book.id, "book", book.title, book.coverUrl ?? null, book.author ?? null);
      res.status(201).json(book);
    }
    catch (e) { handleError(res, e); }
  });
  app.patch("/api/books/:id", requireAuth, async (req, res) => {
    try {
      const body = insertBookSchema.partial().parse(req.body);
      // Check if we're transitioning to 'finished'
      if (body.status === "finished") {
        const existing = await storage.getAllBooks((req.user as User).id);
        const book = existing.find((b) => b.id === +req.params.id);
        if (book && book.status !== "finished") {
          const r = await storage.updateBook(+req.params.id, body, (req.user as User).id);
          if (r) {
            // Buddy visibility: finished book pings the reading-goal buddy
            const uid = (req.user as User).id;
            pool.query(
              `SELECT rg.buddy_user_id, u.name AS owner_name FROM reading_goals rg
               JOIN users u ON u.id = rg.user_id
               WHERE rg.user_id = $1 AND rg.buddy_user_id IS NOT NULL`, [uid]
            ).then((rows) => {
              for (const rg of rows.rows) {
                notify({
                  userId: rg.buddy_user_id, type: "buddy_progress", actorId: uid,
                  title: `📚 ${rg.owner_name} finished "${r.title}"`,
                  body: r.author ?? undefined,
                  href: "/relationships",
                });
              }
            }).catch(() => {});
            logActivity((req.user as User).id, "book_finished", r.id, "book", r.title, r.coverUrl ?? null, r.author ?? null);
            return res.json(r);
          }
          return res.status(404).json({ error: "Not found" });
        }
      }
      const r = await storage.updateBook(+req.params.id, body, uid);
      r ? res.json(r) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/books/:id", requireAuth, async (req, res) => {
    (await storage.deleteBook(+req.params.id, (req.user as User).id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // ── Reading Sessions ──────────────────────────────────────────────────────────
  app.get("/api/reading-sessions", requireAuth, async (_req, res) => {
    try { res.json(await storage.getAllReadingSessions()); } catch (e) { handleError(res, e); }
  });
  app.post("/api/reading-sessions", requireAuth, async (req, res) => {
    try { res.status(201).json(await storage.createReadingSession(insertReadingSessionSchema.parse(req.body))); }
    catch (e) { handleError(res, e); }
  });
  app.patch("/api/reading-sessions/:id", requireAuth, async (req, res) => {
    try {
      const r = await storage.updateReadingSession(+req.params.id, insertReadingSessionSchema.partial().parse(req.body));
      r ? res.json(r) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/reading-sessions/:id", requireAuth, async (req, res) => {
    (await storage.deleteReadingSession(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // ── Workout Templates ─────────────────────────────────────────────────────────
  app.get("/api/workout-templates", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(await storage.getAllWorkoutTemplates(uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/workout-templates", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.status(201).json(await storage.createWorkoutTemplate(insertWorkoutTemplateSchema.parse(req.body), uid));
    }
    catch (e) { handleError(res, e); }
  });
  app.patch("/api/workout-templates/:id", requireAuth, async (req, res) => {
    try {
      const r = await storage.updateWorkoutTemplate(+req.params.id, insertWorkoutTemplateSchema.partial().parse(req.body), (req.user as User).id);
      r ? res.json(r) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/workout-templates/:id", requireAuth, async (req, res) => {
    (await storage.deleteWorkoutTemplate(+req.params.id, (req.user as User).id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
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
      const plan = await storage.createWorkoutPlan(data, uid);
      // Auto-create a linked Goal so the plan appears on the Goals page
      await storage.createGoal({
        title: plan.name,
        category: "fitness",
        progressType: "percent",
        progressCurrent: 0,
        progressTarget: 100,
        priority: "medium",
        recurring: "none",
        startDate: plan.startDate ?? new Date().toISOString().slice(0, 10),
        targetDate: plan.durationWeeks
          ? new Date(Date.now() + plan.durationWeeks * 7 * 86400000).toISOString().slice(0, 10)
          : null,
        linkedWorkoutPlanId: plan.id,
      }, uid);
      res.status(201).json(plan);
    } catch (e) { handleError(res, e); }
  });
  app.patch("/api/workout-plans/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateWorkoutPlan(+req.params.id, req.body, (req.user as User).id);
      if (!updated) return res.status(404).json({ error: "Not found" });
      // Keep linked goal title in sync when plan is renamed
      if (req.body.name) {
        const uid = (req.user as User).id;
        const allGoals = await storage.getAllGoalsWithProjects(uid);
        const linked = allGoals.find((g: any) => g.linkedWorkoutPlanId === +req.params.id);
        if (linked) await storage.updateGoal(linked.id, { title: req.body.name }, uid);
      }
      res.json(updated);
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/workout-plans/:id", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      // Delete linked goal first
      const allGoals = await storage.getAllGoalsWithProjects(uid);
      const linked = allGoals.find((g: any) => g.linkedWorkoutPlanId === +req.params.id);
      if (linked) await storage.deleteGoal(linked.id, uid);
      const ok = await storage.deleteWorkoutPlan(+req.params.id, uid);
      ok ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/workout-plans/:id/activate", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const updated = await storage.setActivePlan(+req.params.id, uid);
      if (!updated) return res.status(404).json({ error: "Not found" });
      // When deactivating, remove the linked goal so it disappears from Goals page
      if (!updated.isActive) {
        const allGoals = await storage.getAllGoalsWithProjects(uid);
        const linked = allGoals.find((g: any) => g.linkedWorkoutPlanId === +req.params.id);
        if (linked) await storage.deleteGoal(linked.id, uid);
      }
      res.json(updated);
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
      const updated = await storage.updateBodyCompPlan(+req.params.id, req.body, (req.user as User).id);
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
      // Send DM message to recipient
      let workoutName = shareType;
      try { const parsed = JSON.parse(contentJson); workoutName = parsed.name || parsed.title || shareType; } catch {}
      await storage.createDMShareMessage(uid, toUserId, 'workout', JSON.stringify({
        shareType: 'workout', name: workoutName, emoji: '🏋️',
      }), `Shared a workout with you: ${workoutName}`);
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
  app.get("/api/workout-logs", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(await storage.getAllWorkoutLogs(uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/workout-logs", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const log = await storage.createWorkoutLog(insertWorkoutLogSchema.parse(req.body), uid);
      // Feed: new personal records
      try {
        const exercises: Array<{ name: string; isPR?: boolean }> = JSON.parse(log.exercisesJson || "[]");
        const prs = exercises.filter(e => e.isPR).map(e => e.name);
        if (log.completed && prs.length > 0) {
          logActivity(uid, "workout_pr", log.id, "workout", prs.join(", "), null, `New PR 💪 · ${log.name}`);
        }
      } catch {}
      // Buddy visibility: a completed workout pings the buddy on any active plan
      // (at most once per day).
      if (log.completed) {
        pool.query(
          `SELECT wp.id, wp.name, wp.buddy_user_id, u.name AS owner_name
           FROM workout_plans wp JOIN users u ON u.id = wp.user_id
           WHERE wp.user_id = $1 AND wp.is_active = true AND wp.buddy_user_id IS NOT NULL`, [uid]
        ).then(async (r) => {
          const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
          for (const plan of r.rows) {
            const dedupeType = `buddy_workout:${plan.id}`;
            if (await storage.hasNotificationToday(plan.buddy_user_id, dedupeType, today)) continue;
            notify({
              userId: plan.buddy_user_id, type: dedupeType, actorId: uid,
              title: `💪 ${plan.owner_name} logged a workout`,
              body: `${log.name} — plan: ${plan.name}`,
              href: "/relationships",
            });
          }
        }).catch(() => {});
      }
      res.status(201).json(log);
    }
    catch (e) { handleError(res, e); }
  });
  app.patch("/api/workout-logs/:id", requireAuth, async (req, res) => {
    try {
      const r = await storage.updateWorkoutLog(+req.params.id, insertWorkoutLogSchema.partial().parse(req.body), (req.user as User).id);
      r ? res.json(r) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/workout-logs/:id", requireAuth, async (req, res) => {
    (await storage.deleteWorkoutLog(+req.params.id, (req.user as User).id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // ── Goals ─────────────────────────────────────────────────────────────────────
  app.get("/api/goals", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(await storage.getAllGoalsWithProjects(uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/goals", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.status(201).json(await storage.createGoal(insertGoalSchema.parse(req.body), uid));
    }
    catch (e) { handleError(res, e); }
  });
  // ── Goal key results ───────────────────────────────────────────────────────
  // Only meaningful when a goal is flagged isObjective; simple goals keep their
  // single progress bar and never touch these.
  app.get("/api/goals/:goalId/key-results", requireAuth, async (req, res) => {
    try {
      res.json(await storage.getKeyResults(+req.params.goalId, (req.user as User).id));
    } catch (e) { handleError(res, e); }
  });

  app.post("/api/goals/:goalId/key-results", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const goalId = +req.params.goalId;
      // Confirm the goal is yours before hanging a child off it — otherwise a
      // key result could be attached to someone else's objective.
      const owns = await pool.query(`SELECT 1 FROM goals WHERE id=$1 AND user_id=$2`, [goalId, uid]);
      if (!owns.rows[0]) return res.status(404).json({ error: "Goal not found" });

      const data = insertGoalKeyResultSchema.parse({ ...req.body, goalId });
      res.status(201).json(await storage.createKeyResult(data, uid));
    } catch (e) { handleError(res, e); }
  });

  app.patch("/api/key-results/:id", requireAuth, async (req, res) => {
    try {
      const data = insertGoalKeyResultSchema.partial().omit({ goalId: true }).parse(req.body);
      const updated = await storage.updateKeyResult(+req.params.id, data, (req.user as User).id);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  app.delete("/api/key-results/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deleteKeyResult(+req.params.id, (req.user as User).id))
        ? res.json({ ok: true })
        : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  app.patch("/api/goals/:id", requireAuth, async (req, res) => {
    try {
      const parsed = insertGoalSchema.partial().parse(req.body);
      // Snapshot the previous state so we can detect crossings (completion,
      // newly-done milestones) instead of firing on every save.
      const beforeRow = (parsed.progressCurrent !== undefined || parsed.milestonesJson !== undefined)
        ? (await pool.query(`SELECT progress_current, progress_target, milestones_json FROM goals WHERE id=$1`, [+req.params.id])).rows[0]
        : null;

      const r = await storage.updateGoal(+req.params.id, parsed, (req.user as User).id);
      if (!r) return res.status(404).json({ error: "Not found" });

      const target = r.progressTarget || 100;
      const wasComplete = beforeRow ? +beforeRow.progress_current >= (+beforeRow.progress_target || 100) : true;
      const nowComplete = r.progressCurrent >= target && target > 0;

      // Feed: goal completed (only when crossing the line)
      if (r.userId && parsed.progressCurrent !== undefined && nowComplete && !wasComplete) {
        logActivity(r.userId, "goal_completed", r.id, "goal", r.title, null, r.category ?? null);
      }

      // Feed + buddy: newly completed milestones
      if (r.userId && parsed.milestonesJson !== undefined && beforeRow) {
        try {
          const before: Array<{ title: string; done?: boolean }> = JSON.parse(beforeRow.milestones_json || "[]");
          const after: Array<{ title: string; done?: boolean }> = JSON.parse(r.milestonesJson || "[]");
          const doneBefore = new Set(before.filter(m => m.done).map(m => m.title));
          for (const m of after.filter(m => m.done && !doneBefore.has(m.title))) {
            logActivity(r.userId, "goal_milestone", r.id, "goal", m.title, null, `Milestone · ${r.title}`);
            if (r.buddyUserId) {
              const owner = await storage.getUserById(r.userId);
              notify({
                userId: r.buddyUserId, type: "buddy_progress", actorId: r.userId,
                title: `🌟 ${owner?.name ?? "Your buddy"} hit a milestone: "${m.title}"`,
                body: r.title,
                href: "/relationships",
              });
            }
          }
        } catch {}
      }

      // Buddy visibility: progress updates (at most once/day/goal) and completion
      if (r.buddyUserId && r.userId && parsed.progressCurrent !== undefined) {
        const owner = await storage.getUserById(r.userId);
        const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
        const dedupeType = `buddy_progress:${r.id}`;
        if (nowComplete && !wasComplete) {
          notify({
            userId: r.buddyUserId, type: "buddy_progress", actorId: r.userId,
            title: `🎉 ${owner?.name ?? "Your buddy"} completed "${r.title}"!`,
            href: "/relationships",
          });
        } else if (!nowComplete && !(await storage.hasNotificationToday(r.buddyUserId, dedupeType, today))) {
          notify({
            userId: r.buddyUserId, type: dedupeType, actorId: r.userId,
            title: `${owner?.name ?? "Your buddy"} made progress on "${r.title}"`,
            body: `Now at ${Math.round((r.progressCurrent / target) * 100)}%`,
            href: "/relationships",
          });
        }
      }
      res.json(r);
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/goals/:id", requireAuth, async (req, res) => {
    (await storage.deleteGoal(+req.params.id, (req.user as User).id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // ── Goal Tasks (legacy) ──────────────────────────────────────────────────────
  app.post("/api/goals/:goalId/tasks", requireAuth, async (req, res) => {
    try { res.status(201).json(await storage.createGoalTask(insertGoalTaskSchema.parse({ ...req.body, goalId: +req.params.goalId }))); }
    catch (e) { handleError(res, e); }
  });
  app.patch("/api/goal-tasks/:id", requireAuth, async (req, res) => {
    try {
      const r = await storage.updateGoalTask(+req.params.id, insertGoalTaskSchema.partial().parse(req.body));
      r ? res.json(r) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/goal-tasks/:id", requireAuth, async (req, res) => {
    (await storage.deleteGoalTask(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // ── Projects ──────────────────────────────────────────────────────────────────
  app.post("/api/goals/:goalId/projects", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.status(201).json(await storage.createProject(insertProjectSchema.parse({ ...req.body, goalId: +req.params.goalId }), uid));
    }
    catch (e) { handleError(res, e); }
  });
  app.patch("/api/projects/:id", requireAuth, async (req, res) => {
    try {
      const r = await storage.updateProject(+req.params.id, insertProjectSchema.partial().parse(req.body), (req.user as User).id);
      r ? res.json(r) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/projects/:id", requireAuth, async (req, res) => {
    (await storage.deleteProject(+req.params.id, (req.user as User).id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // ── Project Tasks ─────────────────────────────────────────────────────────────
  // ── Auto-progress: project tasks drive their goal's % ────────────────────────
  // Whenever a project task changes under a goal with progressType "percent",
  // the goal's progress is recomputed as completed/total across all its
  // projects' tasks. Crossing 100% fires the celebration + buddy notification.
  async function recomputeGoalProgress(goalId: number | null | undefined) {
    if (!goalId) return;
    try {
      const stats = await pool.query(
        `SELECT COUNT(*) FILTER (WHERE pt.completed)::int AS done, COUNT(*)::int AS total
         FROM project_tasks pt JOIN projects p ON p.id = pt.project_id
         WHERE p.goal_id = $1`, [goalId]);
      const { done, total } = stats.rows[0];
      if (!total) return;
      const goalRow = await pool.query(`SELECT * FROM goals WHERE id=$1 AND progress_type='percent'`, [goalId]);
      const g = goalRow.rows[0];
      if (!g) return;
      const target = +g.progress_target || 100;
      const newCurrent = Math.round((done / total) * target);
      if (newCurrent === +g.progress_current) return;
      const wasComplete = +g.progress_current >= target;
      await pool.query(`UPDATE goals SET progress_current=$1 WHERE id=$2`, [newCurrent, goalId]);
      const nowComplete = newCurrent >= target;
      if (nowComplete && !wasComplete && g.user_id) {
        logActivity(g.user_id, "goal_completed", g.id, "goal", g.title, null, "All project tasks done");
        if (g.buddy_user_id) {
          const owner = await storage.getUserById(g.user_id);
          notify({
            userId: g.buddy_user_id, type: "buddy_progress", actorId: g.user_id,
            title: `🎉 ${owner?.name ?? "Your buddy"} completed "${g.title}"!`,
            href: "/relationships",
          });
        }
      }
    } catch (e) { console.error("recomputeGoalProgress:", e); }
  }

  async function goalIdOfProject(projectId: number): Promise<number | null> {
    const r = await pool.query(`SELECT goal_id FROM projects WHERE id=$1`, [projectId]);
    return r.rows[0]?.goal_id ?? null;
  }

  /** Derive project status from its tasks: all done → done, any done →
   *  in_progress, none done → not_started. "blocked" is never overridden. */
  async function deriveProjectStatus(projectId: number) {
    try {
      const r = await pool.query(
        `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE completed)::int AS done FROM project_tasks WHERE project_id=$1`,
        [projectId]);
      const { total, done } = r.rows[0];
      if (!total) return;
      const status = done === total ? "done" : done > 0 ? "in_progress" : "not_started";
      await pool.query(`UPDATE projects SET status=$1 WHERE id=$2 AND status != 'blocked' AND status != $1`, [status, projectId]);
    } catch (e) { console.error("deriveProjectStatus:", e); }
  }

  function afterProjectTaskChange(projectId: number) {
    deriveProjectStatus(projectId).catch(() => {});
    goalIdOfProject(projectId).then(recomputeGoalProgress).catch(() => {});
  }

  // One-shot backfill: bring existing project statuses in line with their tasks
  pool.query(`
    UPDATE projects p SET status = sub.derived
    FROM (
      SELECT project_id,
             CASE WHEN COUNT(*) FILTER (WHERE completed) = COUNT(*) THEN 'done'
                  WHEN COUNT(*) FILTER (WHERE completed) > 0 THEN 'in_progress'
                  ELSE 'not_started' END AS derived
      FROM project_tasks GROUP BY project_id
    ) sub
    WHERE p.id = sub.project_id AND p.status != 'blocked' AND p.status != sub.derived
  `).then(r => { if (r.rowCount) console.log(`Backfilled status on ${r.rowCount} projects.`); }).catch(() => {});

  app.post("/api/projects/:projectId/tasks", requireAuth, async (req, res) => {
    try {
      const task = await storage.createProjectTask(insertProjectTaskSchema.parse({ ...req.body, projectId: +req.params.projectId }));
      afterProjectTaskChange(+req.params.projectId);
      res.status(201).json(task);
    }
    catch (e) { handleError(res, e); }
  });
  app.patch("/api/project-tasks/:id", requireAuth, async (req, res) => {
    try {
      const r = await storage.updateProjectTask(+req.params.id, insertProjectTaskSchema.partial().parse(req.body));
      if (!r) return res.status(404).json({ error: "Not found" });
      afterProjectTaskChange(r.projectId);
      res.json(r);
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/project-tasks/:id", requireAuth, async (req, res) => {
    const pid = await pool.query(`SELECT project_id FROM project_tasks WHERE id=$1`, [+req.params.id]).then(r => r.rows[0]?.project_id).catch(() => null);
    const ok = await storage.deleteProjectTask(+req.params.id);
    if (ok && pid) afterProjectTaskChange(pid);
    ok ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // ── Standalone Projects (no goal) ────────────────────────────────────────────
  app.get("/api/projects/standalone", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(await storage.getStandaloneProjects(uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/projects/standalone", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.status(201).json(await storage.createProject(insertProjectSchema.parse({ ...req.body, goalId: null }), uid));
    }
    catch (e) { handleError(res, e); }
  });

  // ── General Tasks ─────────────────────────────────────────────────────────────
  app.get("/api/general-tasks", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(await storage.getAllGeneralTasks(uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/general-tasks", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.status(201).json(await storage.createGeneralTask(insertGeneralTaskSchema.parse(req.body), uid));
    }
    catch (e) { handleError(res, e); }
  });
  app.patch("/api/general-tasks/:id", requireAuth, async (req, res) => {
    try {
      const r = await storage.updateGeneralTask(+req.params.id, insertGeneralTaskSchema.partial().parse(req.body), (req.user as User).id);
      r ? res.json(r) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/general-tasks/:id", requireAuth, async (req, res) => {
    (await storage.deleteGeneralTask(+req.params.id, (req.user as User).id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // ── Relationship Groups ───────────────────────────────────────────────────────
  app.get("/api/groups", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(await storage.getAllGroups(uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/groups", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.status(201).json(await storage.createGroup(insertRelationshipGroupSchema.parse(req.body), uid));
    }
    catch (e) { handleError(res, e); }
  });
  app.patch("/api/groups/:id", requireAuth, async (req, res) => {
    try {
      const r = await storage.updateGroup(+req.params.id, insertRelationshipGroupSchema.partial().parse(req.body), (req.user as User).id);
      r ? res.json(r) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/groups/:id", requireAuth, async (req, res) => {
    (await storage.deleteGroup(+req.params.id, (req.user as User).id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // ── People ────────────────────────────────────────────────────────────────────
  app.get("/api/people", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const list = await storage.getAllPeople(uid);

      // For contacts linked to an app account, borrow the birthday from that
      // person's own profile when they've chosen to share it. Surfaced as a
      // separate field rather than written into the row — their profile stays
      // the source of truth, and the user's own entry is never overwritten.
      const linkedIds = [...new Set(list.map((p: any) => p.linkedUserId).filter(Boolean))] as number[];
      if (linkedIds.length) {
        const r = await pool.query(
          `SELECT id, birthday, location_city AS "locationCity", location_region AS "locationRegion",
                  profile_visibility_json AS "visJson"
             FROM users WHERE id = ANY($1::int[])`, [linkedIds]
        );
        const shared = new Map<number, any>();
        for (const u of r.rows) {
          const vis = parseVisibility(u.visJson);
          shared.set(u.id, {
            birthday: vis.birthday === "friends" ? u.birthday ?? null : null,
            city: vis.location === "friends" ? u.locationCity ?? null : null,
            region: vis.location === "friends" ? u.locationRegion ?? null : null,
          });
        }
        return res.json(list.map((p: any) => {
          const s = p.linkedUserId ? shared.get(p.linkedUserId) : null;
          if (!s) return p;
          return {
            ...p,
            profileBirthday: s.birthday,          // from their profile
            profileCity: s.city,
            profileRegion: s.region,
            // What the UI should actually show: their entry wins if they typed one.
            effectiveBirthday: p.birthday || s.birthday || null,
            birthdayFromProfile: !p.birthday && !!s.birthday,
          };
        }));
      }
      res.json(list);
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/people", requireAuth, async (req, res) => {
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
        await storage.updatePerson(person.id, { birthdayEventId: event.id }, uid);
        person.birthdayEventId = event.id;
      }
      res.status(201).json(person);
    } catch (e) { handleError(res, e); }
  });
  app.patch("/api/people/:id", requireAuth, async (req, res) => {
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
          }, uid);
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

      const r = await storage.updatePerson(+req.params.id, data, uid);
      r ? res.json(r) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/people/:id", requireAuth, async (req, res) => {
    const uid = (req.user as User).id;
    (await storage.deletePerson(+req.params.id, uid)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // ── Timeline Entries ─────────────────────────────────────────────────────────
  app.get("/api/timeline", requireAuth, async (req, res) => {
    try {
      const entries = await storage.getTimelineEntries((req.user as User).id);
      res.json(entries);
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/timeline", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const { personIds, interactionType, customType, note, date } = req.body as {
        personIds: number[]; interactionType: string; customType?: string; note?: string; date: string;
      };
      const id = await storage.createTimelineEntry(uid, {
        personIdsJson: JSON.stringify(personIds ?? []),
        interactionType: interactionType ?? "note",
        customType: customType ?? null,
        note: note ?? null,
        date: date ?? new Date().toISOString().slice(0, 10),
      });
      res.json({ id });
    } catch (e) { handleError(res, e); }
  });
  app.patch("/api/timeline/:id", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const { personIds, interactionType, customType, note, date } = req.body as any;
      await storage.updateTimelineEntry(+req.params.id, uid, {
        personIdsJson: personIds !== undefined ? JSON.stringify(personIds) : undefined,
        interactionType, customType, note, date,
      });
      res.json({ ok: true });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/timeline/:id", requireAuth, async (req, res) => {
    try {
      const ok = await storage.deleteTimelineEntry(+req.params.id, (req.user as User).id);
      ok ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  app.post("/api/people/:id/link-spouse", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const id = +req.params.id;
      const { spouseId } = req.body as { spouseId: number | null };

      const all = await storage.getAllPeople(uid);
      const current = all.find(p => p.id === id);
      if (!current) return res.status(404).json({ error: "Not found" });

      if (current.spouseId && current.spouseId !== spouseId) {
        await storage.updatePerson(current.spouseId, { spouseId: null }, uid);
      }

      await storage.updatePerson(id, { spouseId: spouseId ?? null }, uid);
      if (spouseId) {
        const newSpouse = all.find(p => p.id === spouseId);
        if (newSpouse?.spouseId && newSpouse.spouseId !== id) {
          await storage.updatePerson(newSpouse.spouseId, { spouseId: null }, uid);
        }
        await storage.updatePerson(spouseId, { spouseId: id }, uid);
      }

      res.json({ ok: true });
    } catch (e) { handleError(res, e); }
  });

  // ── Merge contacts ──────────────────────────────────────────────────────────
  // POST /api/people/:id/merge
  // Body: { mergePersonId: number }  — merge mergePersonId INTO :id, delete mergePersonId
  // OR:   { linkUserId: number }     — link :id to a MyLifos user (set linkedUserId)
  app.post("/api/people/:id/merge", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const primaryId = +req.params.id;
      const { mergePersonId, linkUserId } = req.body as { mergePersonId?: number; linkUserId?: number };

      const all = await storage.getAllPeople(uid);
      const primary = all.find(p => p.id === primaryId);
      if (!primary) return res.status(404).json({ error: "Primary person not found" });

      // ── Case 1: link to a MyLifos user ─────────────────────────────────────
      if (linkUserId !== undefined) {
        await storage.updatePerson(primaryId, { linkedUserId: linkUserId }, uid);
        return res.json({ ok: true });
      }

      // ── Case 2: merge two people records ───────────────────────────────────
      if (!mergePersonId) return res.status(400).json({ error: "mergePersonId required" });
      const secondary = all.find(p => p.id === mergePersonId);
      if (!secondary) return res.status(404).json({ error: "Secondary person not found" });

      // Merge: keep non-null values from primary, fall back to secondary
      const merged: Record<string, any> = {};
      const fields = ["lastName","birthday","notes","spouseId","childrenJson","groupId","linkedUserId","keepInTouchFrequency","lastContactedAt"] as const;
      for (const f of fields) {
        const pv = (primary as any)[f];
        const sv = (secondary as any)[f];
        if (f === "childrenJson") {
          // union child IDs from both
          const pids: number[] = (() => { try { return JSON.parse(pv || "[]"); } catch { return []; } })();
          const sids: number[] = (() => { try { return JSON.parse(sv || "[]"); } catch { return []; } })();
          const union = Array.from(new Set([...pids, ...sids]).values());
          merged[f] = JSON.stringify(union);
        } else {
          merged[f] = pv ?? sv ?? null;
        }
      }
      await storage.updatePerson(primaryId, merged, uid);

      // Re-point anything that referenced secondaryId
      // Spouse: if anyone had secondary as their spouse, redirect to primary
      for (const p of all) {
        if (p.id === primaryId || p.id === mergePersonId) continue;
        if (p.spouseId === mergePersonId) {
          await storage.updatePerson(p.id, { spouseId: primaryId }, uid);
        }
        const cids: number[] = (() => { try { return JSON.parse(p.childrenJson || "[]"); } catch { return []; } })();
        if (cids.includes(mergePersonId)) {
          const updated = cids.map(c => c === mergePersonId ? primaryId : c);
          await storage.updatePerson(p.id, { childrenJson: JSON.stringify(updated) }, uid);
        }
      }

      // Delete the secondary record
      await storage.deletePerson(mergePersonId, uid);

      res.json({ ok: true, primaryId });
    } catch (e) { handleError(res, e); }
  });

  // ── Recipes ────────────────────────────────────────────────────────────────
  function decodeHtmlEntities(value: string) {
    const named: Record<string, string> = {
      amp: "&",
      quot: "\"",
      apos: "'",
      nbsp: " ",
      ndash: "-",
      mdash: "-",
      hellip: "...",
      rsquo: "'",
      lsquo: "'",
      rdquo: "\"",
      ldquo: "\"",
    };
    return value
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
      .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
      .replace(/&([a-z]+);/gi, (match, name) => named[String(name).toLowerCase()] ?? match);
  }

  function cleanRecipeText(value: string) {
    return decodeHtmlEntities(value)
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|li|div|h[1-6]|section|article)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+\n/g, "\n")
      .replace(/\n\s+/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function textFromHtml(html: string) {
    return cleanRecipeText(html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
    );
  }

  function pickRecipeJsonLd(node: any): any | null {
    if (!node) return null;
    if (Array.isArray(node)) {
      for (const item of node) {
        const found = pickRecipeJsonLd(item);
        if (found) return found;
      }
      return null;
    }
    if (node["@graph"]) {
      const found = pickRecipeJsonLd(node["@graph"]);
      if (found) return found;
    }
    const type = node["@type"];
    const types = Array.isArray(type) ? type : [type];
    if (types.some((t: any) => String(t).toLowerCase() === "recipe")) return node;
    return null;
  }

  function parseDurationMinutes(value: any): number | null {
    if (!value) return null;
    const text = String(value);
    const iso = text.match(/PT(?:(\d+)H)?(?:(\d+)M)?/i);
    if (iso) return (parseInt(iso[1] || "0") * 60) + parseInt(iso[2] || "0");
    const minutes = text.match(/(\d+)\s*(?:minutes?|mins?|m)\b/i);
    const hours = text.match(/(\d+)\s*(?:hours?|hrs?|h)\b/i);
    const total = (hours ? parseInt(hours[1]) * 60 : 0) + (minutes ? parseInt(minutes[1]) : 0);
    return total || null;
  }

  function parseIngredientLine(line: string): { name: string; qty: string } {
    const clean = cleanRecipeText(line).replace(/^[-•*·✓]\s*/, "").trim();
    const match = clean.match(/^([\d\s½⅓¼⅔¾\/.]+(?:\s*(?:cups?|tbsps?|tbsp|tsps?|tsp|tablespoons?|teaspoons?|oz|ounces?|lbs?|pounds?|grams?|g\b|kg\b|ml\b|liters?|cans?|cloves?|slices?|bunches?|pinch(?:es)?|dash(?:es)?|sprigs?|packages?|pkgs?|sticks?))?\s+)(.+)$/i);
    return match ? { qty: match[1].trim(), name: match[2].trim() } : { qty: "", name: clean };
  }

  function recipeInstructionsToText(value: any): string {
    if (!value) return "";
    if (typeof value === "string") return cleanRecipeText(value);
    if (Array.isArray(value)) {
      const steps = value.map((step) => {
        if (typeof step === "string") return step;
        if (Array.isArray(step.itemListElement)) return recipeInstructionsToText(step.itemListElement);
        return step.text || step.name || "";
      }).filter(Boolean).join("\n");
      return cleanRecipeText(steps);
    }
    return cleanRecipeText(value.text || value.name || "");
  }

  app.post("/api/recipes/import-url", requireAuth, async (req, res) => {
    try {
      const rawUrl = String(req.body?.url || "").trim();
      if (!rawUrl) return res.status(400).json({ error: "url is required" });
      const parsedUrl = new URL(rawUrl);
      if (!["http:", "https:"].includes(parsedUrl.protocol)) return res.status(400).json({ error: "Only http and https URLs are supported" });

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12_000);
      const response = await fetch(parsedUrl.toString(), {
        signal: ctrl.signal,
        headers: {
          "User-Agent": "MyLifos Recipe Importer/1.0",
          Accept: "text/html,application/xhtml+xml",
        },
      });
      clearTimeout(timer);
      if (!response.ok) return res.status(502).json({ error: `Could not fetch recipe page (${response.status})` });
      const html = await response.text();

      let recipe: any | null = null;
      const scripts = Array.from(html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi));
      for (const script of scripts) {
        try {
          const json = JSON.parse(script[1].trim());
          recipe = pickRecipeJsonLd(json);
          if (recipe) break;
        } catch {}
      }

      const titleFallback = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() ?? "";
      const imageFromRecipe = Array.isArray(recipe?.image) ? recipe.image[0] : recipe?.image;
      const imageUrl = typeof imageFromRecipe === "string" ? imageFromRecipe : imageFromRecipe?.url;
      const ingredients = Array.isArray(recipe?.recipeIngredient)
        ? recipe.recipeIngredient.map((line: string) => parseIngredientLine(String(line))).filter((i: any) => i.name)
        : [];
      const instructions = recipeInstructionsToText(recipe?.recipeInstructions);

      const text = textFromHtml(html);
      const fallbackParsed = ingredients.length || instructions
        ? null
        : (() => {
            const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
            const ingStart = lines.findIndex(l => /^ingredients?$/i.test(l));
            const instStart = lines.findIndex(l => /^(instructions?|directions?|method)$/i.test(l));
            const ingLines = ingStart >= 0 ? lines.slice(ingStart + 1, instStart > ingStart ? instStart : ingStart + 25) : [];
            const instLines = instStart >= 0 ? lines.slice(instStart + 1, instStart + 20) : [];
            return {
              ingredients: ingLines.slice(0, 30).map(parseIngredientLine).filter(i => i.name),
              instructions: instLines.join("\n"),
            };
          })();

      res.json({
        name: recipe?.name || titleFallback.replace(/\s*[-|]\s*.+$/, "") || parsedUrl.hostname,
        description: recipe?.description || null,
        category: Array.isArray(recipe?.recipeCategory) ? recipe.recipeCategory[0] : recipe?.recipeCategory || null,
        prepTime: parseDurationMinutes(recipe?.prepTime),
        cookTime: parseDurationMinutes(recipe?.cookTime),
        servings: recipe?.recipeYield ? parseInt(Array.isArray(recipe.recipeYield) ? recipe.recipeYield[0] : recipe.recipeYield) || null : null,
        imageUrl: imageUrl || null,
        ingredients: ingredients.length ? ingredients : fallbackParsed?.ingredients ?? [],
        instructions: instructions || fallbackParsed?.instructions || "",
        source: parsedUrl.toString(),
      });
    } catch (e: any) {
      if (e?.name === "AbortError") return res.status(504).json({ error: "Recipe page took too long to respond" });
      handleError(res, e);
    }
  });

  app.get("/api/recipes", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(await storage.getAllRecipes(uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/recipes", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const recipe = await storage.createRecipe(insertRecipeSchema.parse(req.body), uid);
      logActivity(uid, "recipe_added", recipe.id, "recipe", recipe.name, recipe.imageUrl ?? null, recipe.category ?? null);
      res.status(201).json(recipe);
    }
    catch (e) { handleError(res, e); }
  });
  app.patch("/api/recipes/:id", requireAuth, async (req, res) => {
    try {
      const r = await storage.updateRecipe(+req.params.id, insertRecipeSchema.partial().parse(req.body), (req.user as User).id);
      r ? res.json(r) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/recipes/:id", requireAuth, async (req, res) => {
    (await storage.deleteRecipe(+req.params.id, (req.user as User).id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // POST /api/recipes/apply-image-csv
  // Accepts a CSV body with columns "Recipe" and "Image Address" (same format as
  // the manual upload sheet) and bulk-updates image_url on system recipes.
  app.post("/api/recipes/apply-image-csv", requireAdmin, async (req, res) => {
    try {
      const { csvText } = req.body as { csvText: string };
      if (!csvText) return res.status(400).json({ error: "csvText required" });

      const lines = csvText.split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) return res.status(400).json({ error: "CSV has no data rows" });

      // Parse header
      const parseRow = (line: string) => {
        const cols: string[] = [];
        let cur = "", inQ = false;
        for (const ch of line) {
          if (ch === '"') { inQ = !inQ; continue; }
          if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ""; continue; }
          cur += ch;
        }
        cols.push(cur.trim());
        return cols;
      };

      const headers = parseRow(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, ''));
      const nameIdx = headers.findIndex(h => h === 'recipe' || h === 'name');
      const urlIdx  = headers.findIndex(h => h.includes('image') || h.includes('url'));
      if (nameIdx === -1 || urlIdx === -1) {
        return res.status(400).json({ error: "CSV must have 'Recipe' and 'Image Address' columns" });
      }

      let updated = 0, skipped = 0;
      for (const line of lines.slice(1)) {
        const cols = parseRow(line);
        const name = cols[nameIdx]?.trim();
        const url  = cols[urlIdx]?.trim();
        if (!name || !url) { skipped++; continue; }
        // Update the system recipe AND any user-saved copies of the same recipe,
        // so people who saved a recipe get the new artwork too.
        const result = await pool.query(
          `UPDATE recipes SET image_url = $1 WHERE name = $2`,
          [url, name]
        );
        if ((result.rowCount ?? 0) > 0) updated++; else skipped++;
      }

      console.log(`[apply-image-csv] Updated ${updated} recipes, skipped ${skipped}.`);
      res.json({ ok: true, updated, skipped });
    } catch (err: any) {
      console.error("[apply-image-csv] error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/admin/reseed-images
  // Batched og:image scraper. Accepts ?offset=N&limit=M to process a slice of
  // system recipes with source URLs. Writes immediately (no dryRun needed —
  // caller can test with limit=5 first). Also re-applies manual images when
  // ?applyManual=true. Processes up to 15 recipes concurrently per batch to
  // stay under the 60-second proxy timeout.
  app.post("/api/admin/reseed-images", requireAdmin, async (req, res) => {
    try {
      const offset    = parseInt((req.query.offset  as string) || "0",  10);
      const limit     = parseInt((req.query.limit   as string) || "20", 10);
      const applyManual = req.query.applyManual === "true";

      // Fetch the requested slice of system recipes with source URLs
      const { rows } = await pool.query<{ id: number; name: string; source: string }>(
        `SELECT id, name, source FROM recipes
         WHERE user_id IS NULL AND source IS NOT NULL AND source LIKE 'http%'
         ORDER BY id
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      // Total count (for progress reporting)
      const { rows: countRows } = await pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM recipes
         WHERE user_id IS NULL AND source IS NOT NULL AND source LIKE 'http%'`
      );
      const totalWithSource = parseInt(countRows[0].count, 10);

      // Scrape og:image for each row concurrently (no polite delay — batches are small)
      const scrapeOne = async (row: { id: number; name: string; source: string }) => {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 6000);
          const fetchRes = await fetch(row.source, {
            signal: controller.signal,
            headers: {
              "User-Agent": "Mozilla/5.0 (compatible; recipe-enricher/1.0)",
              "Accept": "text/html",
            },
            redirect: "follow",
          }).finally(() => clearTimeout(timeout));

          if (!fetchRes.ok) return null;
          const html = await fetchRes.text();
          const ogMatch =
            html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ??
            html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ??
            html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i) ??
            html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);
          const imageUrl = ogMatch?.[1]?.trim();
          if (!imageUrl || !imageUrl.startsWith("http")) return null;
          return { id: row.id, url: imageUrl };
        } catch {
          return null;
        }
      };

      const results = await Promise.all(rows.map(scrapeOne));
      const updates = results.filter((r): r is { id: number; url: string } => r !== null);

      let dbUpdated = 0, scrapeFailed = rows.length - updates.length;

      // Write scraped images
      for (const u of updates) {
        await pool.query(`UPDATE recipes SET image_url = $1 WHERE id = $2`, [u.url, u.id]);
        dbUpdated++;
      }

      // Optionally re-apply manual overrides
      let manualUpdated = 0;
      if (applyManual) {
        const MANUAL = [
          { name: "100% Whole Wheat Bread", imageUrl: "https://www.kingarthurbaking.com/sites/default/files/styles/featured_image_2x/public/recipe_legacy/5997-3-large.jpg?itok=9NikFeli" },
          { name: "30-Minute Cashew Alfredo", imageUrl: "https://minimalistbaker.com/wp-content/uploads/2017/08/AMAZING-30-Minute-Vegan-Alfredo-Creamy-cheesy-SO-tasty-pasta-alfredo-zoodles-recipe-vegan-glutenfree-minimalistbaker-oilfree-12.jpg" },
          { name: "4th of July Baby Back Ribs", imageUrl: "https://ayearatthetable.com/wp-content/uploads/2011/06/IMG_33561.jpg" },
          { name: "5-Alarm Competition Chili", imageUrl: "https://spicysouthernkitchen.com/wp-content/uploads/5-alarm-chili-4.jpg" },
          { name: "Abbacchio Scottadito", imageUrl: "https://www.giallozafferano.it/images/3-326/Abbacchio-A-Scottadito_780x520_wm.jpg" },
          { name: "Aglio e Olio", imageUrl: "https://www.allrecipes.com/thmb/gqWs6X3LQQUQiqENYtphs32W-Po=/0x512/filters:no_upscale():max_bytes(150000):strip_icc():format(webp)/AR-222000-spaghetti-aglio-e-olio-DDMFS-beauty-3x4-8d8d06ed371c4c17a29f2aa7eb500e9e.jpg" },
          { name: "Air Fryer Egg Cups", imageUrl: "https://www.eazypeazymealz.com/wp-content/uploads/2016/06/air-fryer-egg-cups-6.jpg" },
          { name: "Air Fryer Garlic Butter Steak Bites", imageUrl: "https://www.thecountrycook.net/wp-content/uploads/2023/06/1st-image-Air-Fryer-Garlic-Butter-Steak-Bites-scaled.jpg" },
          { name: "Air Fryer Garlic Parmesan Wings", imageUrl: "https://drdavinahseats.com/wp-content/uploads/2021/05/Air-Fryer-Garlic-Parmesan-Chicken-Wings-2-V4-1200-X-1800.jpg" },
          { name: "Air Fryer Roasted Cauliflower", imageUrl: "https://www.allrecipes.com/thmb/Xi360DVVJSOBQzgoWGk01QTKsDc=/750x0/filters:no_upscale():max_bytes(150000):strip_icc():format(webp)/267304-air-fryer-roasted-cauliflower-ddmfs-step-4x3-64dd8aa5047348d7b3ec887860222f63.jpg" },
          { name: "Air Fryer Sweet Potato Fries", imageUrl: "https://natashaskitchen.com/wp-content/uploads/2022/01/Air-Fryer-Sweet-Potato-Fries-5.jpg" },
          { name: "Alabama White Sauce Smoked Chicken", imageUrl: "https://bamagrillmaster.com/cdn/shop/articles/20240302205543-img_1765.jpg?v=1729624932&width=2200" },
          { name: "All-American Beef Stew", imageUrl: "https://www.seriouseats.com/thmb/vjjDTUANmCqADYHyhzbv3p4oYyQ=/750x0/filters:no_upscale():max_bytes(150000):strip_icc():format(webp)/__opt__aboutcom__coeus__resources__content_migration__serious_eats__seriouseats.com__recipes__images__2016__01__20160116-american-beef-stew-recipe-34-bafc948f10ba4d49a8bfb1dd6502c911.jpg" },
          { name: "Aloo Paratha", imageUrl: "https://www.seriouseats.com/thmb/rUJE0u39M7K-_UCHQeQ0vyM-yLI=/750x0/filters:no_upscale():max_bytes(150000):strip_icc():format(webp)/__opt__aboutcom__coeus__resources__content_migration__serious_eats__seriouseats.com__2021__01__20210106-aloo-parathas-nik-sharma-13-52b77ba4cbad4c4f844f2f88910b2b53.jpg" },
          { name: "Al Pastor Tacos", imageUrl: "https://www.seriouseats.com/thmb/phKX03D3YWbjHp9ZoelmXYWag-0=/750x0/filters:no_upscale():max_bytes(150000):strip_icc():format(webp)/20260609-SEA-tacos-al-pastor-Lorena-Masso-03-051d44b9937346dcb3f818e853b9c20b.jpg" },
          { name: "Anadama Bread", imageUrl: "https://www.seriouseats.com/thmb/TsBNLZUb1GFsLIuxxYCSuajCMAU=/750x0/filters:no_upscale():max_bytes(150000):strip_icc():format(webp)/20250129-SEA-AnadamaBread-DebbieWee-Beauty2-24-538335cc8ae94e79a563006ff9be44f3.jpg" },
          { name: "Andalusian Gazpacho", imageUrl: "https://www.seriouseats.com/thmb/4r5EDLcD3I9S3SKXgEqk4Ha7ccU=/750x0/filters:no_upscale():max_bytes(150000):strip_icc():format(webp)/andalusian-gazpacho-recipe-hero-04_1-a7207c6562c543fa9d5c4d1c53996f46.JPG" },
        ];
        for (const m of MANUAL) {
          const r = await pool.query(
            `UPDATE recipes SET image_url = $1 WHERE name = $2 AND user_id IS NULL`,
            [m.imageUrl, m.name]
          );
          if ((r.rowCount ?? 0) > 0) manualUpdated++;
        }
      }

      res.json({
        offset, limit, totalWithSource,
        processed: rows.length,
        scraped: updates.length,
        scrapeFailed,
        dbUpdated,
        manualUpdated,
        done: offset + rows.length >= totalWithSource,
        successRate: rows.length > 0 ? `${Math.round(updates.length * 100 / rows.length)}%` : "n/a",
      });
    } catch (err: any) {
      console.error("[reseed-images] error:", err);
      res.status(500).json({ error: err.message });
    }
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
  app.get("/api/server-ip", requireAdmin, async (_req, res) => {
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

      // Parse an ingredient quantity ("1 lb", "2 tbsp", "1/2 cup", "200g", "3")
      // into an estimated gram weight. USDA values are per 100g, so without
      // this every recipe was just a sum of per-100g rows — quantities ignored.
      const qtyToGrams = (qty: string | null | undefined): number => {
        if (!qty || !String(qty).trim()) return 100;
        const q = String(qty).toLowerCase().trim();
        let n = 1;
        const m = q.match(/(\d+\s+\d+\/\d+|\d+\/\d+|\d*\.?\d+)/);
        if (m) {
          const t = m[1];
          if (t.includes("/")) {
            const parts = t.split(/\s+/);
            const frac = parts[parts.length - 1].split("/");
            n = (parts.length === 2 ? parseFloat(parts[0]) : 0) + (parseFloat(frac[0]) / (parseFloat(frac[1]) || 1));
          } else n = parseFloat(t);
        }
        if (!isFinite(n) || n <= 0) n = 1;
        const units: Array<[RegExp, number]> = [
          [/\bkgs?\b|\bkilo/, 1000],
          [/\blbs?\b|\bpound/, 454],
          [/\boz\b|\bounce/, 28],
          [/\bgrams?\b|\bgr?\b/, 1],
          [/\bmls?\b|\bmillilit/, 1],
          [/\blitre|\bliter|\bl\b/, 1000],
          [/\btbsp|\btablespoon/, 14],
          [/\btsp|\bteaspoon/, 5],
          [/\bcups?\b/, 130],
          [/\bcloves?\b/, 5],
          [/\bcans?\b/, 400],
          [/\bsticks?\b/, 113],
          [/\bslices?\b|\bpieces?\b/, 30],
          [/\bbunch/, 100],
          [/\bpinch|\bdash/, 0.5],
          [/\bhandful/, 40],
        ];
        for (const [re, g] of units) if (re.test(q)) return Math.max(0.5, n * g);
        // Bare count ("2 eggs", "1 onion") — assume a typical item weight
        return Math.max(20, n * 80);
      };

      // Robust nutrient lookup: match by id OR name, preferring kcal for energy
      const nutrientValue = (food: any, ids: number[], nameRe: RegExp, preferUnit?: string): number => {
        let fallback = 0, hasFallback = false;
        for (const fn of food.foodNutrients ?? []) {
          const matches = ids.includes(fn.nutrientId) || nameRe.test(String(fn.nutrientName ?? ""));
          if (!matches) continue;
          const unit = String(fn.unitName ?? "").toUpperCase();
          if (preferUnit && unit !== preferUnit) {
            if (!hasFallback) { fallback = fn.value || 0; hasFallback = true; }
            continue;
          }
          return fn.value || 0;
        }
        return fallback;
      };

      // Pick the most sensible match from the top hits — the raw #1 result is
      // often a processed variant ("Lunchmeat, chicken breast, sliced") with no
      // usable nutrient payload. Prefer simple raw/cooked entries with data.
      const pickFood = (foods: any[], query: string) => {
        const qTokens = query.toLowerCase().split(/\s+/).filter(Boolean);
        let best: any = null; let bestScore = -Infinity;
        for (const f of foods ?? []) {
          const desc = String(f.description ?? "").toLowerCase();
          const hasData = (f.foodNutrients ?? []).some((n: any) =>
            n.nutrientId === 1008 || n.nutrientId === 1003 || /^energy$/i.test(String(n.nutrientName ?? "")));
          if (!hasData) continue;
          let score = 0;
          for (const t of qTokens) if (desc.includes(t)) score += 10;
          score -= desc.split(",").length * 2;
          if (/lunchmeat|breaded|roll|canned|soup|baby|snack|fried|sauce|gravy|fast food|restaurant|frozen/.test(desc)) score -= 25;
          if (/\braw\b/.test(desc)) score += 6;
          if (f.dataType === "SR Legacy") score += 3;
          if (score > bestScore) { bestScore = score; best = f; }
        }
        return best;
      };

      let totals = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0 };
      const unmatched: string[] = [];
      for (const ing of (ingredients || [])) {
        try {
          const cleanName = String(ing.name ?? "").replace(/\(.*?\)/g, "").trim();
          if (!cleanName) continue;
          const url = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(cleanName)}&dataType=Foundation,SR%20Legacy&pageSize=6&api_key=${apiKey}`;
          const r = await fetch(url);
          const data = await r.json() as any;
          const food = pickFood(data.foods, cleanName);
          if (!food) { unmatched.push(ing.name); continue; }
          const factor = qtyToGrams(ing.qty) / 100; // per-100g → actual amount
          totals.calories += nutrientValue(food, [1008, 2047, 2048], /^energy$/i, "KCAL") * factor;
          totals.protein  += nutrientValue(food, [1003], /^protein$/i) * factor;
          totals.carbs    += nutrientValue(food, [1005], /^carbohydrate/i) * factor;
          totals.fat      += nutrientValue(food, [1004], /^total lipid|^total fat/i) * factor;
          totals.fiber    += nutrientValue(food, [1079], /^fiber/i) * factor;
          totals.sugar    += nutrientValue(food, [2000], /^sugars|^total sugars/i) * factor;
          totals.sodium   += nutrientValue(food, [1093], /^sodium/i) * factor;
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
      const entry = await storage.updateFoodLogEntry(+req.params.id, req.body, (req.user as User).id);
      entry ? res.json(entry) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/nutrition/food-log/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deleteFoodLogEntry(+req.params.id, (req.user as User).id))
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
      res.json(goals ?? null);
    } catch (e) { handleError(res, e); }
  });
  app.patch("/api/nutrition/goals", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const { calories, protein, carbs, fat, waterGlasses, buddyUserId } = req.body;
      res.json(await storage.upsertNutritionGoals(uid, { calories, protein, carbs, fat, waterGlasses, buddyUserId: buddyUserId ?? null }));
    } catch (e) { handleError(res, e); }
  });

  // Delete nutrition goals
  app.delete("/api/nutrition/goals", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      await storage.deleteNutritionGoals(uid);
      res.json({ ok: true });
    } catch (e) { handleError(res, e); }
  });

  // ── Meal Bundles ────────────────────────────────────────────────────────────
  app.get("/api/meal-bundles", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(await storage.getAllBundles(uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/meal-bundles", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.status(201).json(await storage.createBundle(insertMealBundleSchema.parse(req.body), uid));
    } catch (e) { handleError(res, e); }
  });
  app.patch("/api/meal-bundles/:id", requireAuth, async (req, res) => {
    try {
      const r = await storage.updateBundle(+req.params.id, insertMealBundleSchema.partial().parse(req.body), (req.user as User).id);
      r ? res.json(r) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/meal-bundles/:id", requireAuth, async (req, res) => {
    (await storage.deleteBundle(+req.params.id, (req.user as User).id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // ── Week Plan ───────────────────────────────────────────────────────────────
  app.get("/api/week-plan/:weekStart", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(await storage.getWeekPlan(req.params.weekStart, uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/week-plan", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.status(201).json(await storage.assignToWeek(insertWeekPlanSchema.parse(req.body), uid));
    }
    catch (e) { handleError(res, e); }
  });
  app.delete("/api/week-plan/:id", requireAuth, async (req, res) => {
    (await storage.removeWeekAssignment(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // ── Grocery Checks ──────────────────────────────────────────────────────────
  app.get("/api/grocery-checks/:weekStart", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(await storage.getGroceryChecks(req.params.weekStart, uid));
    } catch (e) { handleError(res, e); }
  });
  app.patch("/api/grocery-checks", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const { weekStart, itemKey, checked } = req.body;
      res.json(await storage.upsertGroceryCheck(weekStart, itemKey, checked, uid));
    } catch (e) { handleError(res, e); }
  });

  // ── Custom Grocery Items ──────────────────────────────────────────────────────
  app.get("/api/custom-grocery-items/:weekStart", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(await storage.getCustomGroceryItems(req.params.weekStart, uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/custom-grocery-items", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(await storage.addCustomGroceryItem(req.body, uid));
    } catch (e) { handleError(res, e); }
  });
  app.patch("/api/custom-grocery-items/:id", requireAuth, async (req, res) => {
    try {
      const result = await storage.updateCustomGroceryItem(parseInt(req.params.id), req.body, (req.user as User).id);
      if (!result) return res.status(404).json({ error: "Not found" });
      res.json(result);
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/custom-grocery-items/:id", requireAuth, async (req, res) => {
    try {
      const ok = await storage.deleteCustomGroceryItem(parseInt(req.params.id), (req.user as User).id);
      res.json({ success: ok });
    } catch (e) { handleError(res, e); }
  });

  // ── Movies ────────────────────────────────────────────────────────────────────
  app.get("/api/movies", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(await storage.getAllMovies(uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/movies", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const movie = await storage.createMovie(insertMovieSchema.parse(req.body), uid);
      logActivity(uid, "movie_added", movie.id, "movie", movie.title, movie.posterUrl ?? null, movie.director ?? movie.genres ?? null);
      res.status(201).json(movie);
    }
    catch (e) { handleError(res, e); }
  });
  app.patch("/api/movies/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateMovie(+req.params.id, req.body, (req.user as User).id);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/movies/:id", requireAuth, async (req, res) => {
    (await storage.deleteMovie(+req.params.id, (req.user as User).id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // ── Movie Lists ─────────────────────────────────────────────────────────────
  app.get("/api/movie-lists", requireAuth, async (req, res) => {
    try { res.json(await storage.getMovieLists((req.user as User).id)); }
    catch (e) { handleError(res, e); }
  });
  app.post("/api/movie-lists", requireAuth, async (req, res) => {
    try {
      const { name, visibility, isRanked, moviesJson } = req.body;
      res.status(201).json(await storage.createMovieList((req.user as User).id, { name, visibility: visibility ?? "friends", isRanked: !!isRanked, moviesJson: moviesJson ?? "[]" }));
    } catch (e) { handleError(res, e); }
  });
  app.patch("/api/movie-lists/:id", requireAuth, async (req, res) => {
    try {
      const { name, visibility, isRanked, moviesJson } = req.body;
      res.json(await storage.updateMovieList(+req.params.id, (req.user as User).id, { name, visibility, isRanked, ...(moviesJson !== undefined ? { moviesJson } : {}) }));
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/movie-lists/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteMovieList(+req.params.id, (req.user as User).id);
      res.status(204).end();
    } catch (e) { handleError(res, e); }
  });

  // ── Movie List Members ──────────────────────────────────────────────────────
  app.get("/api/movie-lists/shared", requireAuth, async (req, res) => {
    try { res.json(await storage.getSharedListsForUser((req.user as User).id)); }
    catch (e) { handleError(res, e); }
  });
  app.get("/api/movie-lists/:id/members", requireAuth, async (req, res) => {
    try { res.json(await storage.getListMembers(+req.params.id)); }
    catch (e) { handleError(res, e); }
  });
  app.post("/api/movie-lists/:id/members", requireAuth, async (req, res) => {
    try {
      const { userId, role } = req.body;
      await storage.addListMember(+req.params.id, +userId, (req.user as User).id, role ?? "viewer");
      res.status(201).json({ ok: true });
    } catch (e) { handleError(res, e); }
  });
  app.patch("/api/movie-lists/:id/members/:userId", requireAuth, async (req, res) => {
    try {
      const { role } = req.body;
      await storage.updateListMemberRole(+req.params.id, +req.params.userId, role);
      res.json({ ok: true });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/movie-lists/:id/members/:userId", requireAuth, async (req, res) => {
    try {
      await storage.removeListMember(+req.params.id, +req.params.userId, (req.user as User).id);
      res.status(204).end();
    } catch (e) { handleError(res, e); }
  });

  // ── Budget Categories ───────────────────────────────────────────────────────
  app.get("/api/budget-categories", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(await storage.getAllBudgetCategories(uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/budget-categories", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.status(201).json(await storage.createBudgetCategory(insertBudgetCategorySchema.parse(req.body), uid));
    }
    catch (e) { handleError(res, e); }
  });
  app.patch("/api/budget-categories/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateBudgetCategory(+req.params.id, req.body, (req.user as User).id);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/budget-categories/:id", requireAuth, async (req, res) => {
    (await storage.deleteBudgetCategory(+req.params.id, (req.user as User).id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // ── Transactions ─────────────────────────────────────────────────────────────────
  app.get("/api/transactions", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(await storage.getAllTransactions(uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/transactions", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.status(201).json(await storage.createTransaction(insertTransactionSchema.parse(req.body), uid));
    }
    catch (e) { handleError(res, e); }
  });
  app.patch("/api/transactions/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateTransaction(+req.params.id, req.body, (req.user as User).id);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/transactions/:id", requireAuth, async (req, res) => {
    const uid = (req.user as User).id;
    (await storage.deleteTransaction(+req.params.id, uid)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // ── Subscriptions ────────────────────────────────────────────────────────────────
  app.get("/api/subscriptions", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(await storage.getAllSubscriptions(uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/subscriptions", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.status(201).json(await storage.createSubscription(insertSubscriptionSchema.parse(req.body), uid));
    }
    catch (e) { handleError(res, e); }
  });
  app.patch("/api/subscriptions/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateSubscription(+req.params.id, req.body, (req.user as User).id);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/subscriptions/:id", requireAuth, async (req, res) => {
    (await storage.deleteSubscription(+req.params.id, (req.user as User).id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });

  // ── Nav Prefs ────────────────────────────────────────────────────────────────────
  app.get("/api/nav-prefs", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(await storage.getNavPrefs(uid));
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/nav-prefs", requireAuth, async (req, res) => {
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

  // ── Personal profile: birthday, location, relationship, family ─────────────
  // Visibility is enforced here, server-side. The client never receives a field
  // the viewer isn't entitled to see, so a UI bug can't leak one.

  function parseVisibility(json: string | null): Record<string, "friends" | "private"> {
    let stored: Record<string, any> = {};
    try { stored = JSON.parse(json || "{}") || {}; } catch { stored = {}; }
    const out: Record<string, "friends" | "private"> = { ...PROFILE_VISIBILITY_DEFAULTS };
    for (const k of Object.keys(PROFILE_VISIBILITY_DEFAULTS)) {
      if (stored[k] === "friends" || stored[k] === "private") out[k] = stored[k];
    }
    return out;
  }

  async function areFriends(a: number, b: number): Promise<boolean> {
    if (a === b) return true;
    const r = await pool.query(
      `SELECT 1 FROM friend_requests WHERE status = 'accepted'
        AND ((from_user_id = $1 AND to_user_id = $2) OR (from_user_id = $2 AND to_user_id = $1))
        LIMIT 1`, [a, b]
    );
    return !!r.rows[0];
  }

  /** Confirmed relations for a user, with the linked account's name resolved. */
  async function getRelations(userId: number, onlyConfirmed = true) {
    const r = await pool.query(
      `SELECT ur.id, ur.relation, ur.display_name AS "displayName", ur.birthday,
              ur.status, ur.related_user_id AS "relatedUserId",
              u.name AS "relatedName", u.avatar_url AS "relatedAvatarUrl"
         FROM user_relations ur
         LEFT JOIN users u ON u.id = ur.related_user_id
        WHERE ur.user_id = $1 ${onlyConfirmed ? "AND ur.status = 'confirmed'" : ""}
        ORDER BY ur.created_at`, [userId]
    );
    return r.rows.map((x: any) => ({ ...x, name: x.relatedName ?? x.displayName }));
  }

  /** The profile block a given viewer is allowed to see. */
  async function visibleProfileFor(viewerId: number, targetId: number) {
    const q = await pool.query(
      `SELECT id, birthday, location_city AS "locationCity", location_region AS "locationRegion",
              location_country AS "locationCountry", relationship_status AS "relationshipStatus",
              profile_visibility_json AS "visJson"
         FROM users WHERE id = $1`, [targetId]
    );
    const u = q.rows[0];
    if (!u) return null;

    const vis = parseVisibility(u.visJson);
    const isSelf = viewerId === targetId;
    const friend = isSelf || (await areFriends(viewerId, targetId));
    const can = (f: string) => isSelf || (friend && vis[f] === "friends");

    const out: Record<string, any> = {};
    if (can("birthday")) out.birthday = u.birthday ?? null;
    if (can("location")) {
      out.locationCity = u.locationCity ?? null;
      out.locationRegion = u.locationRegion ?? null;
      out.locationCountry = u.locationCountry ?? null;
    }
    if (can("relationship")) out.relationshipStatus = u.relationshipStatus ?? null;
    if (can("family")) out.family = await getRelations(targetId);
    return out;
  }

  // Own profile — always complete, plus the visibility settings themselves.
  app.get("/api/profile/me", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const q = await pool.query(
        `SELECT birthday, location_city AS "locationCity", location_region AS "locationRegion",
                location_country AS "locationCountry", relationship_status AS "relationshipStatus",
                profile_visibility_json AS "visJson"
           FROM users WHERE id = $1`, [uid]
      );
      const u = q.rows[0] ?? {};
      // Incoming link requests waiting on this user
      const pending = await pool.query(
        `SELECT ur.id, ur.relation, u.name AS "fromName", u.avatar_url AS "fromAvatarUrl", ur.user_id AS "fromUserId"
           FROM user_relations ur JOIN users u ON u.id = ur.user_id
          WHERE ur.related_user_id = $1 AND ur.status = 'pending'
          ORDER BY ur.created_at DESC`, [uid]
      );
      res.json({
        birthday: u.birthday ?? null,
        locationCity: u.locationCity ?? null,
        locationRegion: u.locationRegion ?? null,
        locationCountry: u.locationCountry ?? null,
        relationshipStatus: u.relationshipStatus ?? null,
        visibility: parseVisibility(u.visJson),
        family: await getRelations(uid, false),
        pendingRequests: pending.rows,
      });
    } catch (e) { handleError(res, e); }
  });

  app.patch("/api/profile/me", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const b = req.body ?? {};
      const sets: string[] = [];
      const vals: any[] = [];
      const push = (col: string, v: any) => { sets.push(`${col} = $${vals.length + 1}`); vals.push(v); };

      if ("birthday" in b) {
        const v = b.birthday ? String(b.birthday).trim() : null;
        if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return res.status(400).json({ error: "birthday must be YYYY-MM-DD" });
        push("birthday", v);
      }
      for (const [key, col] of [["locationCity", "location_city"], ["locationRegion", "location_region"], ["locationCountry", "location_country"]] as const) {
        if (key in b) push(col, b[key] ? String(b[key]).trim().slice(0, 120) : null);
      }
      if ("relationshipStatus" in b) {
        const v = b.relationshipStatus ? String(b.relationshipStatus) : null;
        if (v && !RELATIONSHIP_STATUSES.includes(v as any)) return res.status(400).json({ error: "Unknown relationshipStatus" });
        push("relationship_status", v);
      }
      if (b.visibility && typeof b.visibility === "object") {
        const merged = parseVisibility((await pool.query(`SELECT profile_visibility_json AS v FROM users WHERE id=$1`, [uid])).rows[0]?.v);
        for (const k of Object.keys(PROFILE_VISIBILITY_DEFAULTS)) {
          const v = b.visibility[k];
          if (v === "friends" || v === "private") merged[k] = v;
        }
        push("profile_visibility_json", JSON.stringify(merged));
      }
      if (!sets.length) return res.status(400).json({ error: "Nothing to update" });

      vals.push(uid);
      await pool.query(`UPDATE users SET ${sets.join(", ")} WHERE id = $${vals.length}`, vals);
      res.json({ ok: true });
    } catch (e) { handleError(res, e); }
  });

  // Add a family member — free text, or a link request to another account.
  app.post("/api/profile/relations", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const { relation, displayName, relatedUserId, birthday } = req.body ?? {};
      if (!RELATION_TYPES.includes(relation)) return res.status(400).json({ error: "Unknown relation type" });
      if (!displayName && !relatedUserId) return res.status(400).json({ error: "displayName or relatedUserId required" });
      if (birthday && !/^\d{4}-\d{2}-\d{2}$/.test(String(birthday))) {
        return res.status(400).json({ error: "birthday must be YYYY-MM-DD" });
      }

      let linkedId: number | null = null;
      let status = "confirmed";
      if (relatedUserId) {
        linkedId = Number(relatedUserId);
        if (!Number.isInteger(linkedId)) return res.status(400).json({ error: "Bad relatedUserId" });
        if (linkedId === uid) return res.status(400).json({ error: "You can't link your profile to yourself" });
        const exists = await pool.query(`SELECT 1 FROM users WHERE id = $1`, [linkedId]);
        if (!exists.rows[0]) return res.status(404).json({ error: "That user doesn't exist" });
        // You can only propose a link to someone you're already friends with.
        if (!(await areFriends(uid, linkedId))) {
          return res.status(403).json({ error: "You can only link family members you're friends with" });
        }
        status = "pending"; // waits on their confirmation
      }

      const dup = linkedId
        ? await pool.query(`SELECT 1 FROM user_relations WHERE user_id=$1 AND related_user_id=$2 AND relation=$3`, [uid, linkedId, relation])
        : { rows: [] };
      if (dup.rows[0]) return res.status(409).json({ error: "That link already exists" });

      const r = await pool.query(
        `INSERT INTO user_relations (user_id, related_user_id, relation, display_name, birthday, status, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [uid, linkedId, relation, displayName ? String(displayName).trim().slice(0, 120) : null,
         birthday || null, status, new Date().toISOString()]
      );
      if (linkedId) {
        await storage.createNotification({
          userId: linkedId,
          type: "relation_request",
          title: `${(req.user as User).name} added you as their ${relation}`,
          body: "Confirm or decline this in Settings → Profile.",
          href: "/settings",
          actorId: uid,
        }).catch(() => { /* notification failure must not fail the request */ });
      }
      res.status(201).json({ id: r.rows[0].id, status });
    } catch (e) { handleError(res, e); }
  });

  // Confirm or decline a link someone proposed. Only the named person may do this.
  app.patch("/api/profile/relations/:id", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const id = Number(req.params.id);
      const action = String(req.body?.action ?? "");
      if (!["confirm", "decline"].includes(action)) return res.status(400).json({ error: "action must be confirm or decline" });

      const row = (await pool.query(`SELECT * FROM user_relations WHERE id = $1`, [id])).rows[0];
      if (!row) return res.status(404).json({ error: "Not found" });
      if (row.related_user_id !== uid) return res.status(403).json({ error: "Only the linked person can respond to this" });
      if (row.status !== "pending") return res.status(409).json({ error: "Already answered" });

      if (action === "decline") {
        await pool.query(`UPDATE user_relations SET status = 'declined' WHERE id = $1`, [id]);
        return res.json({ ok: true, status: "declined" });
      }

      await pool.query(`UPDATE user_relations SET status = 'confirmed' WHERE id = $1`, [id]);
      // Mirror it so the relationship reads correctly from both sides.
      const inverse = RELATION_INVERSE[row.relation] ?? "other";
      await pool.query(
        `INSERT INTO user_relations (user_id, related_user_id, relation, status, created_at)
         VALUES ($1,$2,$3,'confirmed',$4)
         ON CONFLICT (user_id, related_user_id, relation) WHERE related_user_id IS NOT NULL
         DO UPDATE SET status = 'confirmed'`,
        [uid, row.user_id, inverse, new Date().toISOString()]
      );
      res.json({ ok: true, status: "confirmed" });
    } catch (e) { handleError(res, e); }
  });

  app.delete("/api/profile/relations/:id", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const id = Number(req.params.id);
      const row = (await pool.query(`SELECT * FROM user_relations WHERE id = $1`, [id])).rows[0];
      if (!row) return res.status(404).json({ error: "Not found" });
      // Either side can sever the link.
      if (row.user_id !== uid && row.related_user_id !== uid) return res.status(403).json({ error: "Forbidden" });
      await pool.query(`DELETE FROM user_relations WHERE id = $1`, [id]);
      if (row.related_user_id) {
        await pool.query(
          `DELETE FROM user_relations WHERE user_id = $1 AND related_user_id = $2`,
          [row.related_user_id, row.user_id]
        );
      }
      res.json({ ok: true });
    } catch (e) { handleError(res, e); }
  });

  // Friend directory — birthdays and cities the viewer is entitled to see.
  // This is what stops people retyping their friends' birthdays by hand.
  app.get("/api/friends/directory", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const r = await pool.query(
        `SELECT u.id, u.name, u.avatar_url AS "avatarUrl", u.birthday,
                u.location_city AS "locationCity", u.location_region AS "locationRegion",
                u.location_country AS "locationCountry", u.profile_visibility_json AS "visJson"
           FROM friend_requests fr
           JOIN users u ON u.id = CASE WHEN fr.from_user_id = $1 THEN fr.to_user_id ELSE fr.from_user_id END
          WHERE fr.status = 'accepted' AND (fr.from_user_id = $1 OR fr.to_user_id = $1)`,
        [uid]
      );
      const friends = r.rows.map((u: any) => {
        const vis = parseVisibility(u.visJson);
        return {
          id: u.id, name: u.name, avatarUrl: u.avatarUrl,
          birthday: vis.birthday === "friends" ? u.birthday ?? null : null,
          locationCity: vis.location === "friends" ? u.locationCity ?? null : null,
          locationRegion: vis.location === "friends" ? u.locationRegion ?? null : null,
          locationCountry: vis.location === "friends" ? u.locationCountry ?? null : null,
        };
      });
      // Group by city for the "friends in different areas" view.
      const byCity: Record<string, { city: string; region: string | null; friends: any[] }> = {};
      for (const f of friends) {
        if (!f.locationCity) continue;
        const key = f.locationCity.toLowerCase();
        byCity[key] ??= { city: f.locationCity, region: f.locationRegion, friends: [] };
        byCity[key].friends.push({ id: f.id, name: f.name, avatarUrl: f.avatarUrl });
      }
      res.json({
        friends,
        withBirthday: friends.filter(f => f.birthday).length,
        locations: Object.values(byCity).sort((a, b) => b.friends.length - a.friends.length),
      });
    } catch (e) { handleError(res, e); }
  });

  // NOTE: registered after /api/profile/me and /api/profile/relations so those
  // literal paths win. Express 5 dropped regex path params, so ordering is the
  // only thing keeping ":userId" from swallowing "me".
  app.get("/api/profile/:userId", requireAuth, async (req, res) => {
    try {
      const viewerId = (req.user as User).id;
      const targetId = parseInt(req.params.userId);
      if (isNaN(targetId)) return res.status(400).json({ error: "Invalid userId" });
      const profile = await storage.getFriendProfile(viewerId, targetId);
      if (!profile) return res.status(404).json({ error: "Profile not found or not a friend" });
      // Identity block, already filtered to what this viewer may see.
      const identity = await visibleProfileFor(viewerId, targetId);
      res.json({ ...profile, identity });
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

  // Serve behind auth — receipts are scanned financial documents. This was
  // public while the near-identical attachments route above was already
  // guarded, so it read as an oversight rather than a decision.
  //
  // Note this stops anonymous access but does not scope files per user: any
  // signed-in caller who knows a filename can still fetch it. Filenames are
  // timestamp + random so they aren't guessable, but genuine per-owner access
  // needs these served through a route that checks ownership, alongside the
  // wider update/delete ownership work.
  app.use("/uploads/receipts", requireAuth, express.static(UPLOADS_DIR));

  app.get("/api/receipts", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      res.json(await storage.getAllReceipts(uid));
    } catch (e) { handleError(res, e); }
  });

  app.post("/api/receipts", requireAuth, upload.single("file"), async (req: any, res) => {
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

  app.patch("/api/receipts/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateReceiptRecord(+req.params.id, req.body, (req.user as User).id);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  app.delete("/api/receipts/:id", requireAuth, async (req, res) => {
    try {
      const all = await storage.getAllReceipts((req.user as User).id);
      const rec = all.find((r) => r.id === +req.params.id);
      if (rec) {
        const filePath = path.join(UPLOADS_DIR, rec.filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
      (await storage.deleteReceiptRecord(+req.params.id, (req.user as User).id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  // ── Plants ────────────────────────────────────────────────────────────────────
  app.get("/api/plants", requireAuth, async (req, res) => {
    try {
      // Plants belong to the Home tab, so reads resolve the shared owner the
      // same way chores, house projects and appliances already do. Without this
      // a collaborator saw their own (empty) plant list instead of the owner's.
      const uid = await storage.getTabUserId((req.user as User).id, "housekeeping");
      res.json(await storage.getAllPlants(uid));
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
      const uid = await storage.getTabUserId((req.user as User).id, "housekeeping");
      const plant = await storage.createPlant(data, uid);
      res.status(201).json(plant);
    } catch (e) { handleError(res, e); }
  });

  app.patch("/api/plants/:id", requireAuth, async (req, res) => {
    try {
      const uid = await storage.getTabUserId((req.user as User).id, "housekeeping");
      const updated = await storage.updatePlant(+req.params.id, req.body, uid);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  app.delete("/api/plants/:id", requireAuth, async (req, res) => {
    try {
      const uid = await storage.getTabUserId((req.user as User).id, "housekeeping");
      (await storage.deletePlant(+req.params.id, uid)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
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
      const updated = await storage.updateMusicArtist(+req.params.id, req.body, (req.user as User).id);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/music/artists/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deleteMusicArtist(+req.params.id, (req.user as User).id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
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
      const updated = await storage.updateMusicSong(+req.params.id, req.body, (req.user as User).id);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/music/songs/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deleteMusicSong(+req.params.id, (req.user as User).id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
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
      const updated = await storage.updateChore(+req.params.id, req.body, (req.user as User).id);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/chores/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deleteChore(+req.params.id, (req.user as User).id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
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
      const updated = await storage.updateHouseProject(+req.params.id, req.body, (req.user as User).id);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/house-projects/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deleteHouseProject(+req.params.id, (req.user as User).id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
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
      const updated = await storage.updateHouseProjectTask(+req.params.id, req.body, (req.user as User).id);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/house-project-tasks/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deleteHouseProjectTask(+req.params.id, (req.user as User).id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
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
      const updated = await storage.updateAppliance(+req.params.id, req.body, (req.user as User).id);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/appliances/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deleteAppliance(+req.params.id, (req.user as User).id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  // ── Spots ─────────────────────────────────────────────────────────────────────
  // ── Purchase List ────────────────────────────────────────────────────────────
  app.get("/api/purchase-items", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const r = await pool.query(`SELECT * FROM purchase_items WHERE user_id=$1 ORDER BY purchased, created_at DESC`, [uid]);
      res.json(r.rows);
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/purchase-items", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const { name, notes, price, url, priority, category, linkedTaskId } = req.body;
      if (!name?.trim()) return res.status(400).json({ error: "name required" });
      const r = await pool.query(
        `INSERT INTO purchase_items (user_id,name,notes,price,url,priority,category,linked_task_id,purchased,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,false,$9) RETURNING *`,
        [uid, name.trim(), notes||null, price||null, url||null, priority||'medium', category||null, linkedTaskId||null, new Date().toISOString()]
      );
      res.status(201).json(r.rows[0]);
    } catch (e) { handleError(res, e); }
  });
  app.patch("/api/purchase-items/:id", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const { name, notes, price, url, priority, category, linkedTaskId, purchased } = req.body;
      const sets: string[] = []; const vals: any[] = []; let i = 1;
      if (name !== undefined)         { sets.push(`name=$${i++}`); vals.push(name); }
      if (notes !== undefined)        { sets.push(`notes=$${i++}`); vals.push(notes); }
      if (price !== undefined)        { sets.push(`price=$${i++}`); vals.push(price); }
      if (url !== undefined)          { sets.push(`url=$${i++}`); vals.push(url); }
      if (priority !== undefined)     { sets.push(`priority=$${i++}`); vals.push(priority); }
      if (category !== undefined)     { sets.push(`category=$${i++}`); vals.push(category); }
      if (linkedTaskId !== undefined) { sets.push(`linked_task_id=$${i++}`); vals.push(linkedTaskId); }
      if (purchased !== undefined)    { sets.push(`purchased=$${i++}`); vals.push(purchased); }
      if (!sets.length) return res.status(400).json({ error: "nothing to update" });
      vals.push(+req.params.id, uid);
      const r = await pool.query(`UPDATE purchase_items SET ${sets.join(",")} WHERE id=$${i++} AND user_id=$${i} RETURNING *`, vals);
      r.rows[0] ? res.json(r.rows[0]) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/purchase-items/:id", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      await pool.query(`DELETE FROM purchase_items WHERE id=$1 AND user_id=$2`, [+req.params.id, uid]);
      res.json({ ok: true });
    } catch (e) { handleError(res, e); }
  });

  // ── Trip Prep Project ────────────────────────────────────────────────────────
  // Get or create the prep project for a trip, with its tasks
  app.get("/api/trips/:id/prep-project", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const tripId = +req.params.id;
      const projRow = await pool.query(
        `SELECT p.*, COALESCE(json_agg(pt.* ORDER BY pt.sort_order, pt.id) FILTER (WHERE pt.id IS NOT NULL), '[]') AS tasks
         FROM projects p LEFT JOIN project_tasks pt ON pt.project_id = p.id
         WHERE p.trip_id = $1 AND p.user_id = $2 GROUP BY p.id LIMIT 1`,
        [tripId, uid]
      );
      res.json(projRow.rows[0] ?? null);
    } catch (e) { handleError(res, e); }
  });
  // Create a task in the trip's prep project (auto-creates the project if needed)
  app.post("/api/trips/:id/prep-tasks", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const tripId = +req.params.id;
      const { title } = req.body;
      if (!title?.trim()) return res.status(400).json({ error: "title required" });
      // Get or create the prep project
      let proj = await pool.query(
        `SELECT id FROM projects WHERE trip_id = $1 AND user_id = $2 LIMIT 1`,
        [tripId, uid]
      );
      let projectId: number;
      if (proj.rows[0]) {
        projectId = proj.rows[0].id;
      } else {
        const trip = await pool.query(`SELECT name FROM trips WHERE id = $1`, [tripId]);
        const tripName = trip.rows[0]?.name ?? "Trip";
        const newProj = await pool.query(
          `INSERT INTO projects (user_id, trip_id, title, status, sort_order) VALUES ($1,$2,$3,'in_progress',0) RETURNING id`,
          [uid, tripId, `Trip Prep: ${tripName}`]
        );
        projectId = newProj.rows[0].id;
      }
      const task = await pool.query(
        `INSERT INTO project_tasks (project_id, title, completed, sort_order) VALUES ($1,$2,false,COALESCE((SELECT MAX(sort_order)+1 FROM project_tasks WHERE project_id=$1),0)) RETURNING *`,
        [projectId, title.trim()]
      );
      res.status(201).json({ task: task.rows[0], projectId });
    } catch (e) { handleError(res, e); }
  });
  // Toggle a prep task complete
  app.patch("/api/trips/:id/prep-tasks/:taskId", requireAuth, async (req, res) => {
    try {
      const { completed } = req.body;
      const r = await pool.query(`UPDATE project_tasks SET completed=$1 WHERE id=$2 RETURNING *`, [completed, +req.params.taskId]);
      r.rows[0] ? res.json(r.rows[0]) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  // Delete a prep task
  app.delete("/api/trips/:id/prep-tasks/:taskId", requireAuth, async (req, res) => {
    try {
      await pool.query(`DELETE FROM project_tasks WHERE id=$1`, [+req.params.taskId]);
      res.json({ ok: true });
    } catch (e) { handleError(res, e); }
  });

  // ── Spot Folders CRUD ────────────────────────────────────────────────────────
  app.get("/api/spot-folders", requireAuth, async (req, res) => {
    try {
      const uid = await storage.getTabUserId((req.user as User).id, "places");
      const rows = await pool.query(`SELECT * FROM spot_folders WHERE user_id = $1 ORDER BY sort_order, id`, [uid]);
      res.json(rows.rows);
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/spot-folders", requireAuth, async (req, res) => {
    try {
      const uid = await storage.getTabUserId((req.user as User).id, "places");
      const { name, emoji = "📁" } = req.body;
      if (!name?.trim()) return res.status(400).json({ error: "name required" });
      const r = await pool.query(
        `INSERT INTO spot_folders (user_id, name, emoji, sort_order) VALUES ($1,$2,$3,COALESCE((SELECT MAX(sort_order)+1 FROM spot_folders WHERE user_id=$1),0)) RETURNING *`,
        [uid, name.trim(), emoji]
      );
      res.status(201).json(r.rows[0]);
    } catch (e) { handleError(res, e); }
  });
  app.patch("/api/spot-folders/:id", requireAuth, async (req, res) => {
    try {
      const uid = await storage.getTabUserId((req.user as User).id, "places");
      const { name, emoji } = req.body;
      const sets: string[] = [];
      const vals: any[] = [];
      let i = 1;
      if (name !== undefined) { sets.push(`name=$${i++}`); vals.push(name.trim()); }
      if (emoji !== undefined) { sets.push(`emoji=$${i++}`); vals.push(emoji); }
      if (!sets.length) return res.status(400).json({ error: "nothing to update" });
      vals.push(+req.params.id, uid);
      const r = await pool.query(`UPDATE spot_folders SET ${sets.join(",")} WHERE id=$${i++} AND user_id=$${i} RETURNING *`, vals);
      r.rows[0] ? res.json(r.rows[0]) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/spot-folders/:id", requireAuth, async (req, res) => {
    try {
      const uid = await storage.getTabUserId((req.user as User).id, "places");
      // Remove all junction entries for this folder before deleting
      await pool.query(`DELETE FROM spot_folder_members WHERE folder_id = $1`, [+req.params.id]);
      await pool.query(`DELETE FROM spot_folders WHERE id = $1 AND user_id = $2`, [+req.params.id, uid]);
      res.json({ ok: true });
    } catch (e) { handleError(res, e); }
  });

  // Add spot to a folder (multi-folder via junction table)
  app.post("/api/spot-folder-members", requireAuth, async (req, res) => {
    try {
      const uid = await storage.getTabUserId((req.user as User).id, "places");
      const { spotId, folderId } = req.body;
      if (!spotId || !folderId) return res.status(400).json({ error: "spotId and folderId required" });
      // Verify ownership
      const spot = await pool.query(`SELECT id FROM spots WHERE id = $1 AND user_id = $2`, [spotId, uid]);
      if (!spot.rows[0]) return res.status(403).json({ error: "Not authorized" });
      await pool.query(`INSERT INTO spot_folder_members (spot_id, folder_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [spotId, folderId]);
      res.json({ ok: true });
    } catch (e) { handleError(res, e); }
  });
  // Remove spot from a folder
  app.delete("/api/spot-folder-members", requireAuth, async (req, res) => {
    try {
      const uid = await storage.getTabUserId((req.user as User).id, "places");
      const { spotId, folderId } = req.body;
      if (!spotId || !folderId) return res.status(400).json({ error: "spotId and folderId required" });
      await pool.query(`DELETE FROM spot_folder_members WHERE spot_id = $1 AND folder_id = $2`, [spotId, folderId]);
      res.json({ ok: true });
    } catch (e) { handleError(res, e); }
  });

  app.get("/api/spots", requireAuth, async (req, res) => {
    try { res.json(await storage.getAllSpots(await storage.getTabUserId((req.user as User).id, "places"))); } catch (e) { handleError(res, e); }
  });
  app.post("/api/spots", requireAuth, async (req, res) => {
    try {
      const uid = await storage.getTabUserId((req.user as User).id, "places");
      const data = insertSpotSchema.parse({ ...req.body, userId: uid });
      const spot = await storage.createSpot(data, uid);
      logActivity(uid, "spot_added", spot.id, "spot", spot.name, null, spot.address ?? spot.city ?? null);
      res.status(201).json(spot);
    } catch (e) { handleError(res, e); }
  });
  app.patch("/api/spots/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateSpot(+req.params.id, req.body, (req.user as User).id);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/spots/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deleteSpot(+req.params.id, (req.user as User).id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
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

  // Combined search — queries both The Met and AIC in parallel
  app.get("/api/museum/art/search", requireAuth, async (req, res) => {
    try {
      const q = String(req.query.q ?? "").trim();
      const metDeptId = req.query.metDeptId ? parseInt(String(req.query.metDeptId)) : null;
      const aicType = String(req.query.aicType ?? "").trim() || null;
      if (!q && !metDeptId && !aicType) return res.json([]);

      const AIC_FIELDS = "id,title,artist_display,date_display,medium_display,style_title,department_title,image_id,artwork_type_title,place_of_origin";
      const aicHeaders = { "Accept": "application/json", "AIC-User-Agent": "MyLifos/1.0 (personal life planner app)" };

      const [metRes, aicRes] = await Promise.allSettled([
        // Met
        (async (): Promise<any[]> => {
          if (!q && !metDeptId) return [];
          let objectIds: number[] = [];
          if (metDeptId && !q) {
            const r = await fetch(`https://collectionapi.metmuseum.org/public/collection/v1/objects?departmentIds=${metDeptId}`);
            if (!r.ok) return [];
            const d = await r.json() as { objectIDs: number[] | null };
            const all = d.objectIDs ?? [];
            const stride = Math.max(1, Math.floor(all.length / 9));
            const offset = Math.floor(Math.random() * stride);
            for (let i = offset; objectIds.length < 9 && i < all.length; i += stride) objectIds.push(all[i]);
          } else {
            const url = new URL("https://collectionapi.metmuseum.org/public/collection/v1/search");
            url.searchParams.set("q", q); url.searchParams.set("hasImages", "true");
            if (metDeptId) url.searchParams.set("departmentId", String(metDeptId));
            const r = await fetch(url.toString());
            if (!r.ok) return [];
            const d = await r.json() as { objectIDs: number[] | null };
            objectIds = (d.objectIDs ?? []).slice(0, 9);
          }
          const details = await Promise.all(objectIds.map(async (id) => {
            try { const r = await fetch(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`); return r.ok ? await r.json() : null; }
            catch { return null; }
          }));
          return details.filter((d) => d?.primaryImageSmall).slice(0, 9).map(mapMetObject);
        })(),
        // AIC
        (async (): Promise<any[]> => {
          if (!q && !aicType) return [];
          let data: any[] = [];
          if (aicType && !q) {
            const page = Math.floor(Math.random() * 8) + 1;
            const url = `https://api.artic.edu/api/v1/artworks/search?fields=${AIC_FIELDS}&limit=9&page=${page}`;
            const body = JSON.stringify({ query: { term: { artwork_type_title: aicType } }, fields: AIC_FIELDS.split(","), limit: 9, from: (page - 1) * 9 });
            const r = await fetch(url, { method: "POST", headers: { ...aicHeaders, "Content-Type": "application/json" }, body });
            if (!r.ok) return [];
            data = ((await r.json()) as { data: any[] }).data ?? [];
          } else {
            const url = new URL("https://api.artic.edu/api/v1/artworks/search");
            url.searchParams.set("q", q); url.searchParams.set("limit", "9"); url.searchParams.set("fields", AIC_FIELDS);
            const r = await fetch(url.toString(), { headers: aicHeaders });
            if (!r.ok) return [];
            let all = ((await r.json()) as { data: any[] }).data ?? [];
            if (aicType) all = all.filter((d: any) => d.artwork_type_title === aicType);
            data = all;
          }
          return data.filter((d: any) => d.image_id).slice(0, 9).map((d: any) => ({
            id: `aic-${d.id}`, title: d.title || "Untitled",
            artistName: d.artist_display ? d.artist_display.split("\n")[0] : null,
            yearCreated: d.date_display || null, medium: d.medium_display || null,
            movement: d.style_title || d.department_title || null,
            imageUrl: `https://www.artic.edu/iiif/2/${d.image_id}/full/400,/0/default.jpg`,
            sourceUrl: `https://www.artic.edu/artworks/${d.id}`,
            museum: "Art Institute of Chicago", city: "Chicago",
          }));
        })(),
      ]);

      const met = metRes.status === "fulfilled" ? metRes.value : [];
      const aic = aicRes.status === "fulfilled" ? aicRes.value : [];
      // Interleave results from both museums
      const merged: any[] = [];
      const maxLen = Math.max(met.length, aic.length);
      for (let i = 0; i < maxLen; i++) {
        if (i < met.length) merged.push(met[i]);
        if (i < aic.length) merged.push(aic[i]);
      }
      res.json(merged.slice(0, 18));
    } catch (e) { handleError(res, e); }
  });

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
      const updated = await storage.updateEquipment(+req.params.id, req.body, (req.user as User).id);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/equipment/:id", requireAuth, async (req, res) => {
    try {
      const ok = await storage.deleteEquipment(+req.params.id, (req.user as User).id);
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
      const updated = await storage.updateWorkoutTemplate(+req.params.id, { exercisesJson: JSON.stringify(exercises) }, (req.user as User).id);
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
      notify({
        userId: Number(toUserId), type: "friend_request", actorId: fromUserId,
        title: `${(req.user as User).name} sent you a friend request`,
        href: "/relationships",
      });
      res.status(201).json(req_);
    } catch (e) { handleError(res, e); }
  });

  app.patch("/api/friend-requests/:id", requireAuth, async (req, res) => {
    try {
      const { status } = req.body;
      if (status !== "accepted" && status !== "declined") return res.status(400).json({ error: "status must be accepted or declined" });
      const updated = await storage.respondFriendRequest(+req.params.id, status, (req.user as User).id);
      if (!updated) return res.status(404).json({ error: "Not found or not authorized" });
      if (status === "accepted") {
        notify({
          userId: updated.fromUserId, type: "friend_request", actorId: (req.user as User).id,
          title: `${(req.user as User).name} accepted your friend request`,
          href: "/relationships",
        });
      }
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
      notify({
        userId: toUserId, type: "recommendation", actorId: fromUserId,
        title: `${(req.user as User).name} recommended a ${type}`,
        body: title,
        href: "/discover",
      });
      // Recommendations land in Messages too — that's where the conversation happens
      storage.createDMShareMessage(fromUserId, toUserId, type, JSON.stringify({
        shareType: type, name: title, subtitle: subtitle ?? null, note: note ?? null,
      }), `Recommended "${title}"${note ? ` — "${note}"` : ""}`).catch(() => {});
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
      await storage.createDMShareMessage(userId, toUserId, 'book', JSON.stringify({
        shareType: 'book', name: bookTitle, subtitle: bookAuthor || '', emoji: '📚',
      }), `Recommended a book: ${bookTitle}${bookAuthor ? ' by ' + bookAuthor : ''}`);
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
      const timeParts = [recipePrepTime, recipeCookTime].filter(Boolean);
      await storage.createDMShareMessage(userId, toUserId, 'recipe', JSON.stringify({
        shareType: 'recipe', name: recipeName,
        subtitle: [recipeCategory, timeParts.length ? timeParts.join(" + ") : null].filter(Boolean).join(" · "),
        emoji: recipeEmoji || "🍽️", imageUrl: recipeImageUrl ?? undefined, note: notes ?? undefined,
      }), `Shared a recipe: ${recipeName}`);
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
      const musicName = songTitle ? `${songTitle} by ${artistName}` : artistName;
      await storage.createDMShareMessage(userId, toUserId, 'music', JSON.stringify({
        shareType: 'music', name: musicName, subtitle: artistName, emoji: '🎵',
      }), `Recommended ${type === 'song' ? 'a song' : 'an artist'}: ${musicName}`);
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
      const quoteShare = await storage.sendQuoteShare(data);
      const quotePreview = data.text.length > 60 ? data.text.slice(0, 60) + '…' : data.text;
      await storage.createDMShareMessage(userId, data.toUserId, 'quote', JSON.stringify({
        shareType: 'quote', name: quotePreview, subtitle: data.author || '', emoji: '💬',
      }), `Shared a quote: "${quotePreview}"${data.author ? ' — ' + data.author : ''}`);
      res.status(201).json(quoteShare);
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
      const artShare = await storage.sendArtShare(data);
      await storage.createDMShareMessage(userId, data.toUserId, 'art', JSON.stringify({
        shareType: 'art', name: data.title, subtitle: data.artistName || '', emoji: '🎨',
      }), `Shared a piece of art: ${data.title}${data.artistName ? ' by ' + data.artistName : ''}`);
      res.status(201).json(artShare);
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
      const share = await storage.sendSpotShare(data);
      // Mirror to Messenger DM
      const spotTypeEmoji: Record<string, string> = { restaurant: "🍽️", bar: "🍸", cafe: "☕", hotel: "🏨", attraction: "🎯", shop: "🛍️", park: "🌳", other: "📍" };
      const emoji = spotTypeEmoji[data.type] ?? "📍";
      const subtitle = [data.type, data.neighborhood || data.city].filter(Boolean).join(" · ");
      await storage.createDMShareMessage(userId, data.toUserId, 'spot', JSON.stringify({
        shareType: 'spot', name: data.name, subtitle, emoji,
        note: data.notes ?? undefined,
      }), `Shared a spot: ${data.name}`);
      res.status(201).json(share);
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
      const share = await storage.sendMovieShare(data);
      const emoji = data.mediaType === "tv" ? "📺" : "🎬";
      const subtitle = [data.mediaType === "tv" ? "TV Show" : "Movie", data.year ? String(data.year) : null].filter(Boolean).join(" · ");
      await storage.createDMShareMessage(userId, data.toUserId, 'movie', JSON.stringify({
        shareType: 'movie', name: data.title, subtitle, emoji,
        imageUrl: data.posterUrl ?? undefined, note: data.notes ?? undefined,
      }), `Shared a ${data.mediaType === "tv" ? "show" : "movie"}: ${data.title}`);
      res.status(201).json(share);
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
      const updated = await storage.updateChild(+req.params.id, req.body, (req.user as User).id);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/children/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deleteChild(+req.params.id, (req.user as User).id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
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
      const updated = await storage.updateChildMilestone(+req.params.id, req.body, (req.user as User).id);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/child-milestones/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deleteChildMilestone(+req.params.id, (req.user as User).id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
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
      const updated = await storage.updateChildMemory(+req.params.id, req.body, (req.user as User).id);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/child-memories/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deleteChildMemory(+req.params.id, (req.user as User).id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
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
      const updated = await storage.updateChildPrepItem(+req.params.id, req.body, (req.user as User).id);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/child-prep-items/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deleteChildPrepItem(+req.params.id, (req.user as User).id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  // ── Pets ─────────────────────────────────────────────────────────────────────
  app.get("/api/pets", requireAuth, async (req, res) => {
    try { res.json(await storage.getAllPetsWithVisits((req.user as User).id)); } catch (e) { handleError(res, e); }
  });
  app.post("/api/pets", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const data = insertPetSchema.parse({ ...req.body, userId: uid });
      res.status(201).json(await storage.createPet(data, uid));
    } catch (e) { handleError(res, e); }
  });
  app.patch("/api/pets/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updatePet(+req.params.id, req.body);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/pets/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deletePet(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.post("/api/pets/:petId/vet-visits", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const data = insertPetVetVisitSchema.parse({ ...req.body, petId: +req.params.petId, userId: uid });
      res.status(201).json(await storage.createPetVetVisit(data, uid));
    } catch (e) { handleError(res, e); }
  });
  app.patch("/api/pet-vet-visits/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updatePetVetVisit(+req.params.id, req.body);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/pet-vet-visits/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deletePetVetVisit(+req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
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
      const updated = await storage.updateQuote(+req.params.id, req.body, (req.user as User).id);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/quotes/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deleteQuote(+req.params.id, (req.user as User).id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
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
      const updated = await storage.updateMantra(+req.params.id, req.body, (req.user as User).id);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/mantras/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deleteMantra(+req.params.id, (req.user as User).id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
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
      const updated = await storage.updateArtPiece(+req.params.id, req.body, (req.user as User).id);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/art/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deleteArtPiece(+req.params.id, (req.user as User).id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
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
    const entry = await storage.updateJournalEntry(Number(req.params.id), req.body, req.user!.id);
    if (!entry) return res.status(404).json({ error: "Not found" });
    res.json(entry);
  });
  app.delete("/api/journal/:id", requireAuth, async (req, res) => {
    const removed = await storage.deleteJournalEntry(Number(req.params.id), req.user!.id);
    if (!removed) return res.status(404).json({ error: "Not found" });
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
  app.get("/api/debug/env-check", requireAdmin, (req, res) => {
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

  // ── Strava OAuth ─────────────────────────────────────────────────────────────

  function stravaCallbackUrl(req: Request): string {
    if (process.env.STRAVA_CALLBACK_URL) return process.env.STRAVA_CALLBACK_URL;
    const proto = req.get("x-forwarded-proto") ?? req.protocol ?? "https";
    return `${proto}://${req.get("host")}/api/strava/callback`;
  }

  async function getValidStravaToken(userId: number): Promise<string | null> {
    const tokens = await storage.getStravaTokens(userId);
    if (!tokens) return null;
    // Refresh if expired (with 5-min buffer)
    if (Number(tokens.expiry) < Date.now() / 1000 + 300) {
      const r = await fetch("https://www.strava.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: process.env.STRAVA_CLIENT_ID,
          client_secret: process.env.STRAVA_CLIENT_SECRET,
          grant_type: "refresh_token",
          refresh_token: tokens.refreshToken,
        }),
      });
      if (!r.ok) { await storage.clearStravaTokens(userId); return null; }
      const d = await r.json() as any;
      await storage.saveStravaTokens(userId, d.access_token, d.refresh_token, String(d.expires_at), tokens.athleteId);
      return d.access_token;
    }
    return tokens.accessToken;
  }

  // GET /api/strava/status
  app.get("/api/strava/status", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as User).id;
      const tokens = await storage.getStravaTokens(userId);
      res.json({
        connected: !!tokens,
        athleteId: tokens?.athleteId ?? null,
        configured: !!(process.env.STRAVA_CLIENT_ID && process.env.STRAVA_CLIENT_SECRET),
        callbackUrl: stravaCallbackUrl(req),
      });
    } catch (e) { handleError(res, e); }
  });

  // GET /api/strava/connect — redirect to Strava OAuth
  app.get("/api/strava/connect", requireAuth, (req, res) => {
    const clientId = process.env.STRAVA_CLIENT_ID;
    if (!clientId) return res.status(500).json({ error: "STRAVA_CLIENT_ID not configured" });
    (req.session as any).stravaUserId = (req.user as User).id;
    const url = new URL("https://www.strava.com/oauth/authorize");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", stravaCallbackUrl(req));
    url.searchParams.set("response_type", "code");
    url.searchParams.set("approval_prompt", "auto");
    url.searchParams.set("scope", "activity:read_all");
    res.redirect(url.toString());
  });

  // GET /api/strava/callback — exchange code for tokens
  app.get("/api/strava/callback", async (req, res) => {
    try {
      const { code, error } = req.query as Record<string, string>;
      const userId = (req.session as any).stravaUserId;
      if (error || !code || !userId) return res.redirect("/?strava=error");
      const r = await fetch("https://www.strava.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: process.env.STRAVA_CLIENT_ID,
          client_secret: process.env.STRAVA_CLIENT_SECRET,
          code,
          grant_type: "authorization_code",
        }),
      });
      if (!r.ok) return res.redirect("/?strava=error");
      const d = await r.json() as any;
      await storage.saveStravaTokens(
        userId,
        d.access_token,
        d.refresh_token,
        String(d.expires_at),
        String(d.athlete?.id ?? ""),
      );
      delete (req.session as any).stravaUserId;
      res.redirect("/?strava=connected");
    } catch (e) { console.error("[Strava callback]", e); res.redirect("/?strava=error"); }
  });

  // GET /api/strava/activities — fetch recent activities filtered by sport
  // ?sport=run (default) | surf
  app.get("/api/strava/activities", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as User).id;
      const sport = ((req.query.sport as string) ?? "run").toLowerCase();
      const accessToken = await getValidStravaToken(userId);
      if (!accessToken) return res.status(401).json({ error: "Not connected to Strava" });
      const perPage = Math.min(Number(req.query.per_page ?? 20), 50);
      const r = await fetch(
        `https://www.strava.com/api/v3/athlete/activities?per_page=${perPage}&page=1`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!r.ok) {
        if (r.status === 401) await storage.clearStravaTokens(userId);
        return res.status(r.status).json({ error: "Strava API error" });
      }
      const activities = await r.json() as any[];

      if (sport === "surf") {
        const sessions = activities
          .filter((a: any) => a.type === "Surfing" || a.sport_type === "Surfing" || a.sport_type === "Surf")
          .map((a: any) => ({
            id: String(a.id),
            name: a.name,
            date: a.start_date_local?.slice(0, 10) ?? "",
            durationSec: a.moving_time,
            distanceKm: Math.round((a.distance / 1000) * 100) / 100,
            elevationGain: Math.round(a.total_elevation_gain ?? 0),
            stravaUrl: `https://www.strava.com/activities/${a.id}`,
          }));
        return res.json({ sessions });
      }

      // Default: running
      const runs = activities
        .filter((a: any) => a.type === "Run" || a.sport_type === "Run" || a.sport_type === "TrailRun")
        .map((a: any) => ({
          id: String(a.id),
          name: a.name,
          date: a.start_date_local?.slice(0, 10) ?? "",
          distanceKm: Math.round((a.distance / 1000) * 100) / 100,
          durationSec: a.moving_time,
          elevationGain: Math.round(a.total_elevation_gain ?? 0),
          isTrail: a.sport_type === "TrailRun",
          stravaUrl: `https://www.strava.com/activities/${a.id}`,
        }));
      res.json({ runs });
    } catch (e) { handleError(res, e); }
  });

  // DELETE /api/strava/disconnect
  app.delete("/api/strava/disconnect", requireAuth, async (req, res) => {
    try {
      await storage.clearStravaTokens((req.user as User).id);
      res.json({ ok: true });
    } catch (e) { handleError(res, e); }
  });

  // ── OpenBeta climbing route search ───────────────────────────────────────────
  app.get("/api/climbing/search", requireAuth, async (req, res) => {
    try {
      const q = String(req.query.q || "").trim();
      if (!q) return res.json({ results: [] });

      const GQL_URL = "https://api.openbeta.io/graphql";
      const headers = { "Content-Type": "application/json", "Accept": "application/json", "User-Agent": "MyLifos/1.0" };

      // Log available query fields once so we know the real schema
      fetch(GQL_URL, {
        method: "POST", headers,
        body: JSON.stringify({ query: "{ __schema { queryType { fields { name } } } }" }),
      }).then(r => r.text()).then(t => console.log("[OpenBeta schema]", t.slice(0, 600))).catch(() => {});

      // areas() + nested climbs — the current documented query for text search
      const gql = `
        query SearchAreas($q: String!) {
          areas(filter: { area_name: { match: $q } }) {
            id
            areaName
            climbs {
              id
              name
              grades { yds vscale }
              type { sport trad bouldering tr }
            }
          }
        }
      `;
      const r = await fetch(GQL_URL, { method: "POST", headers, body: JSON.stringify({ query: gql, variables: { q } }) });
      const rawText = await r.text();
      console.log(`[OpenBeta areas query] HTTP ${r.status}: ${rawText.slice(0, 400)}`);

      if (!r.ok) return res.status(502).json({ error: "Route search unavailable. You can type the route name manually below." });

      let data: any;
      try { data = JSON.parse(rawText); } catch {
        return res.status(502).json({ error: "Route search unavailable. You can type the route name manually below." });
      }
      if (data.errors?.length) {
        console.error("[OpenBeta] GraphQL errors:", JSON.stringify(data.errors).slice(0, 400));
        return res.status(502).json({ error: `Route search unavailable. You can type the route name manually below.` });
      }

      // Flatten climbs from all matched areas
      const areas: any[] = data?.data?.areas ?? [];
      const results: any[] = [];
      for (const area of areas) {
        for (const c of (area.climbs ?? [])) {
          if (results.length >= 15) break;
          results.push({
            id: c.id,
            name: c.name,
            grade: c.grades?.yds ?? c.grades?.vscale ?? "",
            climbType: c.type?.bouldering ? "Boulder" : c.type?.sport ? "Sport" : c.type?.trad ? "Trad" : c.type?.tr ? "Top Rope" : "Route",
            location: area.areaName ?? "",
            description: "",
          });
        }
        if (results.length >= 15) break;
      }
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
      const type = String(req.query.type || "movie"); // "movie" | "tv" | "multi"
      if (!query) return res.status(400).json({ error: "q is required" });
      const apiKey = process.env.TMDB_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "TMDB_API_KEY not configured" });
      const url = `https://api.themoviedb.org/3/search/${type}?api_key=${apiKey}&query=${encodeURIComponent(query)}&include_adult=false`;
      const tmdbRes = await fetch(url);
      if (!tmdbRes.ok) return res.status(tmdbRes.status).json({ error: "TMDB error" });
      const data = await tmdbRes.json() as any;
      // For multi-search, filter out persons and normalize fields
      const results = (data.results ?? []).filter((r: any) => r.media_type !== "person");
      res.json(results);
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
      const updated = await storage.updateHobby(Number(req.params.id), req.body, (req.user as User).id);
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (e) { handleError(res, e); }
  });

  app.delete("/api/hobbies/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteHobby(Number(req.params.id), (req.user as User).id);
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
      const updated = await storage.updateCollection(Number(req.params.id), req.body, (req.user as User).id);
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (e) { handleError(res, e); }
  });

  app.delete("/api/music/collections/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteCollection(Number(req.params.id), (req.user as User).id);
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

  // ── Admin: users & usage ───────────────────────────────────────────────────
  // Content tables are discovered from information_schema so this keeps working
  // as the schema grows — no hardcoded list to fall out of date.
  let contentTablesCache: string[] | null = null;
  const SKIP_TABLES = new Set([
    "users", "session", "push_subscriptions", "nav_prefs", "notifications",
    "activity_feed", "activity_reactions", "activity_comments", "app_secrets",
    "tab_privacy", "tab_collaborations", "friend_requests", "conversation_participants",
    "messages", "conversations", "shares", "planner_state", "invites",
  ]);
  async function getContentTables(): Promise<string[]> {
    if (contentTablesCache) return contentTablesCache;
    const r = await pool.query(
      `SELECT table_name FROM information_schema.columns
       WHERE table_schema='public' AND column_name='user_id'`
    );
    contentTablesCache = r.rows
      .map((x: any) => x.table_name as string)
      .filter((t) => !SKIP_TABLES.has(t))
      .sort();
    return contentTablesCache;
  }

  app.get("/api/admin/overview", requireAdmin, async (_req, res) => {
    try {
      const tables = await getContentTables();
      const [users, active, feed] = await Promise.all([
        pool.query(`SELECT COUNT(*)::int AS total,
                           COUNT(*) FILTER (WHERE onboarded)::int AS onboarded,
                           COUNT(*) FILTER (WHERE created_at::timestamptz >= NOW() - INTERVAL '7 days')::int  AS new7,
                           COUNT(*) FILTER (WHERE created_at::timestamptz >= NOW() - INTERVAL '30 days')::int AS new30
                    FROM users`),
        pool.query(`SELECT
                      COUNT(*) FILTER (WHERE last_seen_at::timestamptz >= NOW() - INTERVAL '1 day')::int   AS d1,
                      COUNT(*) FILTER (WHERE last_seen_at::timestamptz >= NOW() - INTERVAL '7 days')::int  AS d7,
                      COUNT(*) FILTER (WHERE last_seen_at::timestamptz >= NOW() - INTERVAL '30 days')::int AS d30,
                      COUNT(*) FILTER (WHERE last_seen_at IS NOT NULL)::int AS everSeen
                    FROM users`).catch(() => ({ rows: [{ d1: null, d7: null, d30: null }] })),
        pool.query(`SELECT COUNT(*)::int AS events FROM activity_feed`).catch(() => ({ rows: [{ events: null }] })),
      ]);

      // Total content rows across every user-owned table
      let totalItems = 0;
      const byTable: { table: string; count: number }[] = [];
      for (const t of tables) {
        try {
          const c = await pool.query(`SELECT COUNT(*)::int AS c FROM "${t}" WHERE user_id IS NOT NULL`);
          const n = c.rows[0]?.c ?? 0;
          totalItems += n;
          if (n > 0) byTable.push({ table: t, count: n });
        } catch { /* table shape differs — skip */ }
      }
      byTable.sort((a, b) => b.count - a.count);

      res.json({
        users: users.rows[0],
        activeUsers: active.rows[0],
        totalActivityEvents: feed.rows[0]?.events ?? null,
        totalItems,
        topTables: byTable.slice(0, 12),
        tablesScanned: tables.length,
      });
    } catch (e) { handleError(res, e); }
  });

  app.get("/api/admin/users", requireAdmin, async (_req, res) => {
    try {
      const tables = await getContentTables();
      const base = await pool.query(
        `SELECT u.id, u.email, u.name, u.avatar_url AS "avatarUrl", u.created_at AS "createdAt",
                u.onboarded,
                (u.anthropic_api_key_enc IS NOT NULL) AS "hasApiKey",
                (u.gcal_refresh_token IS NOT NULL)    AS "hasGoogleCal",
                (SELECT COUNT(*)::int FROM push_subscriptions ps WHERE ps.user_id = u.id) AS "devices",
                u.last_seen_at AS "lastSeen",
                (SELECT MAX(af.created_at) FROM activity_feed af WHERE af.user_id = u.id)  AS "lastActive",
                (SELECT COUNT(*)::int FROM activity_feed af WHERE af.user_id = u.id)       AS "activityEvents",
                (SELECT COUNT(*)::int FROM friend_requests fr
                   WHERE fr.status='accepted' AND (fr.from_user_id = u.id OR fr.to_user_id = u.id)) AS "friends"
         FROM users u ORDER BY u.created_at DESC NULLS LAST`
      );

      // One grouped count per table → scales with tables, not users
      const perUser = new Map<number, Record<string, number>>();
      for (const t of tables) {
        try {
          const r = await pool.query(
            `SELECT user_id AS uid, COUNT(*)::int AS c FROM "${t}" WHERE user_id IS NOT NULL GROUP BY user_id`
          );
          for (const row of r.rows) {
            const m = perUser.get(row.uid) ?? {};
            m[t] = row.c;
            perUser.set(row.uid, m);
          }
        } catch { /* skip odd tables */ }
      }

      const users = base.rows.map((u: any) => {
        const counts = perUser.get(u.id) ?? {};
        const totalItems = Object.values(counts).reduce((a: number, b: any) => a + b, 0);
        const top = Object.entries(counts)
          .sort((a, b) => (b[1] as number) - (a[1] as number))
          .slice(0, 5)
          .map(([table, count]) => ({ table, count }));
        return { ...u, totalItems, topModules: top, moduleCount: Object.keys(counts).length };
      });

      res.json({ users, tablesScanned: tables.length });
    } catch (e) { handleError(res, e); }
  });

  // ── Admin: repoint recipe image URLs (local ⇄ CDN) ─────────────────────────
  // Used to move the local /recipe-images/ files to Cloudflare R2 and back again.
  // Prefix-swap only, always previewable, and symmetric — running it with `from`
  // and `to` reversed is a complete rollback.
  app.post("/api/admin/rewrite-image-urls", requireAdmin, async (req, res) => {
    try {
      const from = String(req.body?.from ?? "").trim();
      const to = String(req.body?.to ?? "").trim();
      const dryRun = req.body?.dryRun !== false; // default to preview
      if (!from || !to) return res.status(400).json({ error: "from and to prefixes are required" });
      if (from === to) return res.status(400).json({ error: "from and to are identical" });

      // `to` must be an https URL or a site-relative path — never anything else.
      const validTo = /^https:\/\/[a-z0-9.-]+\//i.test(to) || to.startsWith("/");
      if (!validTo) return res.status(400).json({ error: "to must start with https://<host>/ or /" });

      const matched = await pool.query(
        `SELECT COUNT(*)::int AS c FROM recipes WHERE image_url LIKE $1`, [from + "%"]
      );
      const sample = await pool.query(
        `SELECT name, image_url FROM recipes WHERE image_url LIKE $1 ORDER BY name LIMIT 5`, [from + "%"]
      );
      const preview = sample.rows.map((r: any) => ({
        recipe: r.name,
        before: r.image_url,
        after: to + String(r.image_url).slice(from.length),
      }));

      if (dryRun) {
        return res.json({ dryRun: true, wouldUpdate: matched.rows[0].c, from, to, preview });
      }

      const upd = await pool.query(
        `UPDATE recipes
            SET image_url = $2 || SUBSTRING(image_url FROM ${from.length + 1})
          WHERE image_url LIKE $1`,
        [from + "%", to]
      );
      console.log(`[admin] ${(req.user as User).email} rewrote ${upd.rowCount} recipe image URLs: "${from}" → "${to}"`);
      res.json({ dryRun: false, updated: upd.rowCount, from, to, preview });
    } catch (e) { handleError(res, e); }
  });

  /**
   * POST /api/admin/reset-onboarding
   *
   * Clears the onboarded flag so the selected users see the onboarding flow again
   * on their next sign-in. Used to route existing accounts back through hub and
   * sidebar setup.
   *
   * Only touches users.onboarded — no content is created or removed. Note that
   * when a user then completes onboarding, saveNavPrefs replaces their sidebar
   * configuration wholesale, so a customised sidebar will be replaced by whatever
   * they pick. That is the intended effect here, but it is the reason this is a
   * deliberate admin action rather than something automatic.
   *
   * Defaults to a dry run, and always excludes the caller so an admin can't lock
   * themselves into the flow by accident.
   */
  app.post("/api/admin/reset-onboarding", requireAdmin, async (req, res) => {
    try {
      const actor = req.user as User;
      const dryRun = req.body?.dryRun !== false;
      const rawExcept: unknown = req.body?.exceptEmails;
      const except = new Set<string>(
        (Array.isArray(rawExcept) ? rawExcept : [])
          .map(e => String(e).trim().toLowerCase())
          .filter(Boolean)
      );
      // The caller is always spared, whatever the request says.
      except.add(String(actor.email ?? "").toLowerCase());

      const all = await pool.query<{ id: number; email: string; onboarded: boolean }>(
        `SELECT id, email, onboarded FROM users ORDER BY id`
      );
      const targets = all.rows.filter(u => !except.has(String(u.email ?? "").toLowerCase()));
      // Only rows that would actually change are worth reporting as affected.
      const willChange = targets.filter(u => u.onboarded);

      if (dryRun) {
        return res.json({
          dryRun: true,
          // Array.from rather than a spread: this project's tsconfig target makes
          // spreading a Set a TS2802 error.
          excluded: Array.from(except),
          matched: targets.length,
          wouldChange: willChange.length,
          alreadyFalse: targets.length - willChange.length,
          users: willChange.map(u => ({ id: u.id, email: u.email })),
        });
      }

      const ids = targets.map(u => u.id);
      if (!ids.length) return res.json({ dryRun: false, updated: 0, users: [] });

      const upd = await pool.query(
        `UPDATE users SET onboarded = false WHERE id = ANY($1::int[]) AND onboarded = true RETURNING id, email`,
        [ids]
      );
      console.log(`[admin] ${actor.email} reset onboarding for ${upd.rowCount} user(s)`);
      res.json({ dryRun: false, updated: upd.rowCount, users: upd.rows });
    } catch (e) { handleError(res, e); }
  });

  // ── Admin: delete an account ───────────────────────────────────────────────
  // Every column that points at users.id, discovered from the live schema so new
  // tables are covered automatically. facebook_user_id is an external string ID,
  // not a reference to our users table — the integer-type filter excludes it.
  let userRefCache: { table: string; column: string }[] | null = null;
  async function getUserRefColumns() {
    if (userRefCache) return userRefCache;
    const r = await pool.query(
      `SELECT c.table_name AS t, c.column_name AS col
         FROM information_schema.columns c
         JOIN information_schema.tables tb
           ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
        WHERE c.table_schema = 'public'
          AND tb.table_type = 'BASE TABLE'
          AND c.column_name ~ '(^|_)user_id$'
          AND c.data_type IN ('integer','bigint','smallint')
          AND c.table_name <> 'users'`
    );
    userRefCache = r.rows.map((x: any) => ({ table: x.t as string, column: x.col as string }));
    return userRefCache;
  }

  /** Count every row across the app that belongs to this user. */
  async function userFootprint(userId: number) {
    const refs = await getUserRefColumns();
    const byTable: Record<string, number> = {};
    let total = 0;
    for (const { table, column } of refs) {
      try {
        const c = await pool.query(
          `SELECT COUNT(*)::int AS c FROM "${table}" WHERE "${column}" = $1`, [userId]
        );
        const n = c.rows[0]?.c ?? 0;
        if (n > 0) { byTable[table] = (byTable[table] ?? 0) + n; total += n; }
      } catch { /* skip odd tables */ }
    }
    return { total, byTable };
  }

  // Preview: what exactly would be destroyed. Powers the confirmation dialog.
  app.get("/api/admin/users/:id/footprint", requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) return res.status(400).json({ error: "Bad user id" });
      const u = await pool.query(`SELECT id, email, name FROM users WHERE id = $1`, [id]);
      if (!u.rows[0]) return res.status(404).json({ error: "User not found" });
      const fp = await userFootprint(id);
      const rows = Object.entries(fp.byTable)
        .sort((a, b) => b[1] - a[1])
        .map(([table, count]) => ({ table, count }));
      res.json({ user: u.rows[0], totalRows: fp.total, tables: rows });
    } catch (e) { handleError(res, e); }
  });

  app.delete("/api/admin/users/:id", requireAdmin, async (req, res) => {
    const client = await pool.connect();
    try {
      const id = Number(req.params.id);
      const actor = req.user as User;
      if (!Number.isInteger(id)) return res.status(400).json({ error: "Bad user id" });

      const target = (await client.query(
        `SELECT id, email, name FROM users WHERE id = $1`, [id]
      )).rows[0];
      if (!target) return res.status(404).json({ error: "User not found" });

      // Guards — deliberately strict; this is unrecoverable.
      if (target.id === actor.id) {
        return res.status(400).json({ error: "You can't delete your own account from the admin panel." });
      }
      if (isAdminUser(target)) {
        return res.status(403).json({ error: "Admin accounts can't be deleted here. Remove the email from ADMIN_EMAILS first." });
      }
      const confirm = String(req.body?.confirmEmail ?? "").trim().toLowerCase();
      if (confirm !== String(target.email ?? "").trim().toLowerCase()) {
        return res.status(400).json({ error: "confirmEmail does not match this user's email." });
      }

      const refs = await getUserRefColumns();
      const deleted: Record<string, number> = {};
      let totalRows = 0;

      await client.query("BEGIN");

      // Several passes: a table can be blocked by an FK from another table we
      // haven't cleared yet. Each pass clears what it can; we stop when a pass
      // makes no progress. Anything still failing surfaces as a real error.
      let pending = [...refs];
      let lastError: any = null;
      for (let pass = 0; pass < 4 && pending.length; pass++) {
        const stillPending: typeof pending = [];
        let progress = false;
        for (const ref of pending) {
          try {
            await client.query("SAVEPOINT del");
            const r = await client.query(
              `DELETE FROM "${ref.table}" WHERE "${ref.column}" = $1`, [id]
            );
            await client.query("RELEASE SAVEPOINT del");
            const n = r.rowCount ?? 0;
            if (n > 0) { deleted[ref.table] = (deleted[ref.table] ?? 0) + n; totalRows += n; }
            progress = true;
          } catch (err) {
            await client.query("ROLLBACK TO SAVEPOINT del");
            lastError = err;
            stillPending.push(ref);
          }
        }
        pending = stillPending;
        if (!progress) break;
      }

      if (pending.length) {
        await client.query("ROLLBACK");
        console.error("[admin] delete blocked on tables:", pending.map((p) => p.table).join(", "), lastError);
        return res.status(500).json({
          error: "Could not fully delete this account — nothing was changed.",
          blockedTables: [...new Set(pending.map((p) => p.table))],
        });
      }

      const userRow = await client.query(`DELETE FROM users WHERE id = $1`, [id]);
      if ((userRow.rowCount ?? 0) === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "User not found" });
      }
      await client.query("COMMIT");

      // Audit trail — deletions should always be attributable.
      console.log(
        `[admin] ${actor.email} (id ${actor.id}) deleted user ${target.email} (id ${id}) — ` +
        `${totalRows} rows across ${Object.keys(deleted).length} tables`
      );

      // Any live session for this user now deserializes to false → logged out.
      res.json({
        ok: true,
        deletedUser: { id: target.id, email: target.email, name: target.name },
        totalRows,
        tables: Object.entries(deleted).sort((a, b) => b[1] - a[1]).map(([table, count]) => ({ table, count })),
      });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch { /* already rolled back */ }
      handleError(res, e);
    } finally {
      client.release();
    }
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
      const updated = await storage.updateSacredText(+req.params.id, req.body, (req.user as User).id);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/sacred-texts/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deleteSacredText(+req.params.id, (req.user as User).id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
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
      const updated = await storage.updateFaithPractice(+req.params.id, req.body, (req.user as User).id);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/faith-practices/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deleteFaithPractice(+req.params.id, (req.user as User).id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
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
      const updated = await storage.updateSermon(+req.params.id, req.body, (req.user as User).id);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/sermons/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deleteSermon(+req.params.id, (req.user as User).id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
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
      const updated = await storage.updatePrayerItem(+req.params.id, req.body, (req.user as User).id);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/prayer-items/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deletePrayerItem(+req.params.id, (req.user as User).id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
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
      const updated = await storage.updateMedication(+req.params.id, req.body, (req.user as User).id);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/health/medications/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deleteMedication(+req.params.id, (req.user as User).id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
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
      (await storage.deleteHealthMetric(+req.params.id, (req.user as User).id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
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
      const updated = await storage.updateSleepLog(+req.params.id, req.body, (req.user as User).id);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/health/sleep/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deleteSleepLog(+req.params.id, (req.user as User).id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
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
      const updated = await storage.updateCareProvider(+req.params.id, req.body, (req.user as User).id);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/health/care-providers/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deleteCareProvider(+req.params.id, (req.user as User).id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
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
      await storage.deleteDebatePost(postId, (req.user as User).id);
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
      const updated = await storage.updatePoliticalOfficial(+req.params.id, req.body, (req.user as User).id);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/politics/officials/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deletePoliticalOfficial(+req.params.id, (req.user as User).id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
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
      (await storage.deletePoliticalIssue(+req.params.id, (req.user as User).id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
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
      const updated = await storage.updatePoliticalElection(+req.params.id, req.body, (req.user as User).id);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/politics/elections/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deletePoliticalElection(+req.params.id, (req.user as User).id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
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
      const updated = await storage.updateCivicAction(+req.params.id, req.body, (req.user as User).id);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/politics/civic-actions/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deleteCivicAction(+req.params.id, (req.user as User).id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
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
      const updated = await storage.updatePoliticalNewsSource(+req.params.id, req.body, (req.user as User).id);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/politics/news-sources/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deletePoliticalNewsSource(+req.params.id, (req.user as User).id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
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
      const updated = await storage.updateTrip(+req.params.id, req.body, (req.user as User).id);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/trips/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deleteTrip(+req.params.id, (req.user as User).id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
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
      const updated = await storage.updateTripItem(+req.params.id, req.body, (req.user as User).id);
      updated ? res.json(updated) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/trip-items/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deleteTripItem(+req.params.id, (req.user as User).id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  // ── Visited Cities ────────────────────────────────────────────────────────────
  app.get("/api/visited-cities", requireAuth, async (req, res) => {
    try { res.json(await storage.getVisitedCities((req.user as User).id)); }
    catch (e) { handleError(res, e); }
  });
  app.post("/api/visited-cities", requireAuth, async (req, res) => {
    try { res.json(await storage.addVisitedCity((req.user as User).id, req.body)); }
    catch (e) { handleError(res, e); }
  });
  app.patch("/api/visited-cities/:id", requireAuth, async (req, res) => {
    try {
      const r = await storage.updateVisitedCity(+req.params.id, (req.user as User).id, req.body);
      r ? res.json(r) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/visited-cities/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deleteVisitedCity(+req.params.id, (req.user as User).id))
        ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });

  // ── Family Tree ───────────────────────────────────────────────────────────────
  app.get("/api/family-members", requireAuth, async (req, res) => {
    try { res.json(await storage.getFamilyMembers((req.user as User).id)); }
    catch (e) { handleError(res, e); }
  });
  app.post("/api/family-members", requireAuth, async (req, res) => {
    try { res.json(await storage.addFamilyMember((req.user as User).id, req.body)); }
    catch (e) { handleError(res, e); }
  });
  app.patch("/api/family-members/:id", requireAuth, async (req, res) => {
    try {
      const m = await storage.updateFamilyMember(+req.params.id, (req.user as User).id, req.body);
      m ? res.json(m) : res.status(404).json({ error: "Not found" });
    } catch (e) { handleError(res, e); }
  });
  app.delete("/api/family-members/:id", requireAuth, async (req, res) => {
    try {
      (await storage.deleteFamilyMember(+req.params.id, (req.user as User).id))
        ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
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
      // Notify the feed item's owner if a reaction now exists (not on un-react)
      pool.query(
        `SELECT af.user_id, af.item_title,
                (SELECT COUNT(*) FROM activity_reactions ar WHERE ar.feed_item_id=af.id AND ar.user_id=$2) AS mine
         FROM activity_feed af WHERE af.id=$1`, [feedItemId, user.id]
      ).then(r => {
        const row = r.rows[0];
        if (row && row.user_id !== user.id && +row.mine > 0) {
          notify({
            userId: row.user_id, type: "reaction", actorId: user.id,
            title: `${user.name} reacted ${emoji} to ${row.item_title ?? "your activity"}`,
            href: "/discover",
          });
          // Land it in Messages too, so the moment can turn into a conversation
          storage.createDMTextMessage(
            user.id, row.user_id,
            `${emoji} Cheered your save — "${row.item_title ?? "your activity"}"`
          ).catch(() => {});
        }
      }).catch(() => {});
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
      // Notify the feed item's owner (unless commenting on your own activity)
      pool.query(`SELECT user_id, item_title FROM activity_feed WHERE id=$1`, [feedItemId])
        .then(r => {
          const owner = r.rows[0];
          if (owner && owner.user_id !== user.id) {
            notify({
              userId: owner.user_id, type: "comment", actorId: user.id,
              title: `${user.name} commented on ${owner.item_title ?? "your activity"}`,
              body: content.trim().slice(0, 120),
              href: "/discover",
            });
            storage.createDMTextMessage(
              user.id, owner.user_id,
              `About "${owner.item_title ?? "your activity"}" — ${content.trim()}`
            ).catch(() => {});
          }
        }).catch(() => {});
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

  // One-tap add from Discover: save a friend-recommended item straight into
  // the matching collection. Minimal records — users can enrich later.
  app.post("/api/discover/add", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const { itemType, itemTitle, itemSubtitle, itemImageUrl, friendId } = req.body ?? {};
      if (!itemType || !itemTitle) return res.status(400).json({ error: "itemType and itemTitle required" });
      const t = String(itemType).toLowerCase();
      let href = "/mylifos";
      if (t === "book") {
        const book = await storage.createBook({ title: itemTitle, author: itemSubtitle || undefined, status: "backlog", coverUrl: itemImageUrl || undefined } as any, uid);
        logActivity(uid, "book_added", book.id, "book", book.title, book.coverUrl ?? null, book.author ?? null);
        href = "/reading";
      } else if (t === "movie" || t === "show") {
        const movie = await storage.createMovie({ mediaType: t, title: itemTitle, status: "backlog", posterUrl: itemImageUrl || undefined } as any, uid);
        logActivity(uid, "movie_added", movie.id, t, movie.title, itemImageUrl ?? null, itemSubtitle ?? null);
        href = "/movies";
      } else if (t === "artist") {
        const artist = await storage.createMusicArtist({ name: itemTitle } as any, uid);
        logActivity(uid, "artist_added", artist.id, "artist", artist.name, itemImageUrl ?? null, null);
        href = "/music";
      } else if (t === "song") {
        // Songs need an artist row — find or create by the subtitle (artist name)
        const artistName = itemSubtitle || "Unknown Artist";
        const existing = await pool.query(`SELECT id FROM music_artists WHERE user_id=$1 AND LOWER(name)=LOWER($2) LIMIT 1`, [uid, artistName]);
        const artistId = existing.rows[0]?.id ?? (await storage.createMusicArtist({ name: artistName } as any, uid)).id;
        const song = await storage.createMusicSong({ artistId, title: itemTitle, status: "want_to_listen" } as any, uid);
        logActivity(uid, "song_added", song.id, "song", song.title, itemImageUrl ?? null, artistName);
        href = "/music";
      } else if (t === "spot") {
        const spot = await storage.createSpot({ name: itemTitle, type: "other", status: "want_to_visit" } as any, uid);
        logActivity(uid, "spot_added", spot.id, "spot", spot.name, itemImageUrl ?? null, itemSubtitle ?? null);
        href = "/places";
      } else if (t === "recipe") {
        const recipe = await storage.createRecipe({ name: itemTitle, imageUrl: itemImageUrl || undefined } as any, uid);
        logActivity(uid, "recipe_added", recipe.id, "recipe", recipe.name, itemImageUrl ?? null, null);
        href = "/recipes";
      } else {
        return res.status(400).json({ error: `Unsupported item type: ${t}` });
      }
      // If this save came from a friend's highlight/recommendation, tell them in Messages
      if (friendId && Number(friendId) !== uid) {
        storage.createDMShareMessage(uid, Number(friendId), t, JSON.stringify({
          shareType: t, name: itemTitle, subtitle: itemSubtitle ?? null, emoji: "📌",
          note: "Saved this from your highlights",
        }), `Saved "${itemTitle}" from your highlights 📌`).catch(() => {});
      }
      res.json({ ok: true, href });
    } catch (e) { handleError(res, e); }
  });

  // ── Shared household planner state (meal plan + shopping list) ────────────
  // If the user has an accepted Home collaboration, both people read and write
  // the OWNER's planner state — one meal plan, one grocery list per household.
  async function plannerOwnerFor(userId: number): Promise<{ ownerId: number; sharedWith: string | null }> {
    const r = await pool.query(`
      SELECT tc.owner_user_id, tc.collaborator_user_id,
             uo.name AS owner_name, uc.name AS collab_name
      FROM tab_collaborations tc
      JOIN users uo ON uo.id = tc.owner_user_id
      JOIN users uc ON uc.id = tc.collaborator_user_id
      WHERE tc.tab_name = 'housekeeping' AND tc.status = 'accepted'
        AND tc.owner_user_id != tc.collaborator_user_id
        AND (tc.owner_user_id = $1 OR tc.collaborator_user_id = $1)
      LIMIT 1
    `, [userId]);
    const row = r.rows[0];
    if (!row) return { ownerId: userId, sharedWith: null };
    return row.owner_user_id === userId
      ? { ownerId: userId, sharedWith: row.collab_name }
      : { ownerId: row.owner_user_id, sharedWith: row.owner_name };
  }

  app.get("/api/planner-state", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const { ownerId, sharedWith } = await plannerOwnerFor(uid);
      const r = await pool.query(`SELECT data_json, updated_at FROM planner_state WHERE user_id = $1`, [ownerId]);
      res.json({
        data: r.rows[0] ? JSON.parse(r.rows[0].data_json) : null,
        updatedAt: r.rows[0]?.updated_at ?? null,
        sharedWith,
      });
    } catch (e) { handleError(res, e); }
  });

  app.put("/api/planner-state", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const { ownerId, sharedWith } = await plannerOwnerFor(uid);
      const now = new Date().toISOString();
      await pool.query(
        `INSERT INTO planner_state (user_id, data_json, updated_at) VALUES ($1,$2,$3)
         ON CONFLICT (user_id) DO UPDATE SET data_json=$2, updated_at=$3`,
        [ownerId, JSON.stringify(req.body ?? {}), now]
      );
      res.json({ ok: true, updatedAt: now, sharedWith });
    } catch (e) { handleError(res, e); }
  });

  app.get("/api/discover/shared-taste", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const data = await storage.getDiscoverSharedTaste(user.id);
      res.json(data);
    } catch (e) { handleError(res, e); }
  });

  // ── Klipy GIF Proxy ──────────────────────────────────────────────────────────
  // Klipy docs: https://api.klipy.com — API key is in the URL path as {app_key}
  // Debug: returns first raw GIF item so we can inspect field names
  app.get("/api/gifs/debug", requireAuth, async (req, res) => {
    try {
      const key = process.env.KLIPY_API_KEY;
      if (!key) return res.status(503).json({ error: "no key" });
      const r = await fetch(`https://api.klipy.com/api/v1/${key}/gifs/trending?per_page=1&page=1`);
      const data = await r.json() as any;
      const first = data?.data?.data?.[0] ?? data?.data?.[0] ?? data;
      res.json({ first, keys: first ? Object.keys(first) : [], filesKeys: first?.files ? Object.keys(first.files) : [] });
    } catch (e) { handleError(res, e); }
  });

  app.get("/api/gifs/trending", requireAuth, async (req, res) => {
    try {
      const key = process.env.KLIPY_API_KEY;
      if (!key) return res.status(503).json({ error: "GIF service not configured" });
      const perPage = req.query.limit ?? 24;
      const r = await fetch(`https://api.klipy.com/api/v1/${key}/gifs/trending?per_page=${perPage}&page=1`);
      if (!r.ok) {
        const errText = await r.text();
        console.error("[Klipy trending] status:", r.status, errText);
        return res.status(r.status).json({ error: `Klipy API error: ${r.status}`, detail: errText });
      }
      const data = await r.json();
      res.json(data);
    } catch (e) { handleError(res, e); }
  });

  app.get("/api/gifs/search", requireAuth, async (req, res) => {
    try {
      const key = process.env.KLIPY_API_KEY;
      if (!key) return res.status(503).json({ error: "GIF service not configured" });
      const q = req.query.q as string;
      if (!q) return res.status(400).json({ error: "q required" });
      const perPage = req.query.limit ?? 24;
      const r = await fetch(`https://api.klipy.com/api/v1/${key}/gifs/search?q=${encodeURIComponent(q)}&per_page=${perPage}&page=1`);
      if (!r.ok) {
        const errText = await r.text();
        console.error("[Klipy search] status:", r.status, errText);
        return res.status(r.status).json({ error: `Klipy API error: ${r.status}`, detail: errText });
      }
      const data = await r.json();
      res.json(data);
    } catch (e) { handleError(res, e); }
  });

  // ── Messenger ────────────────────────────────────────────────────────────────

  // List all conversations for the current user
  app.get("/api/messenger/conversations", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as User).id;
      const convs = await storage.getConversationsForUser(userId);
      res.json(convs);
    } catch (e) { handleError(res, e); }
  });

  // Get or create a DM with a friend
  app.post("/api/messenger/dm", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as User).id;
      const { friendId } = req.body;
      if (!friendId) return res.status(400).json({ error: "friendId required" });
      // Verify friendship
      const friends = await storage.getFriends(userId);
      if (!friends.find(f => f.id === +friendId)) return res.status(403).json({ error: "Not friends" });
      const conv = await storage.getOrCreateDM(userId, +friendId);
      res.json(conv);
    } catch (e) { handleError(res, e); }
  });

  // Create a group conversation
  app.post("/api/messenger/groups", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as User).id;
      const { name, participantIds } = req.body;
      if (!name?.trim()) return res.status(400).json({ error: "name required" });
      if (!Array.isArray(participantIds) || participantIds.length === 0) return res.status(400).json({ error: "participantIds required" });
      // Verify all are friends
      const friends = await storage.getFriends(userId);
      const friendIds = new Set(friends.map(f => f.id));
      for (const pid of participantIds) {
        if (!friendIds.has(+pid)) return res.status(403).json({ error: `User ${pid} is not a friend` });
      }
      const conv = await storage.createGroupConversation(userId, name.trim(), participantIds.map(Number));
      res.status(201).json(conv);
    } catch (e) { handleError(res, e); }
  });

  // Get messages for a conversation
  app.get("/api/messenger/conversations/:id/messages", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as User).id;
      const convId = +req.params.id;
      const limit = Math.min(+(req.query.limit ?? 50), 100);
      const beforeId = req.query.before ? +req.query.before : undefined;
      const msgs = await storage.getMessages(convId, userId, limit, beforeId);
      res.json(msgs);
    } catch (e) { handleError(res, e); }
  });

  // Send a message
  app.post("/api/messenger/conversations/:id/messages", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as User).id;
      const convId = +req.params.id;
      const { content } = req.body;
      if (!content?.trim()) return res.status(400).json({ error: "content required" });
      const msg = await storage.createMessage(convId, userId, content.trim());
      res.status(201).json(msg);
    } catch (e) { handleError(res, e); }
  });

  // Send a share card directly from Messenger
  app.post("/api/messenger/conversations/:id/share", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as User).id;
      const convId = +req.params.id;
      const { shareType, shareData, note } = req.body;
      if (!shareType || !shareData) return res.status(400).json({ error: "shareType and shareData required" });
      const payload = typeof shareData === 'string' ? shareData : JSON.stringify(shareData);
      const parsed = JSON.parse(payload);
      const displayText = note?.trim() || `Shared a ${shareType}: ${parsed.name ?? ''}`;
      const finalPayload = JSON.stringify({ ...parsed, note: note?.trim() || undefined });
      const msg = await storage.createMessage(convId, userId, displayText, {
        messageType: 'share', shareType, shareData: finalPayload,
      });
      res.status(201).json(msg);
    } catch (e) { handleError(res, e); }
  });

  // Mark conversation as read
  app.post("/api/messenger/conversations/:id/read", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as User).id;
      await storage.markConversationRead(+req.params.id, userId);
      res.json({ ok: true });
    } catch (e) { handleError(res, e); }
  });

  // Unread message count (for badge)
  app.get("/api/messenger/unread-count", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as User).id;
      const count = await storage.getUnreadMessageCount(userId);
      res.json({ count });
    } catch (e) { handleError(res, e); }
  });

  // Soft-delete a message
  app.delete("/api/messenger/messages/:id", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as User).id;
      const ok = await storage.softDeleteMessage(+req.params.id, userId);
      ok ? res.json({ ok: true }) : res.status(404).json({ error: "Not found or not authorized" });
    } catch (e) { handleError(res, e); }
  });

  // Add a reaction to a message
  app.post("/api/messenger/messages/:id/reactions", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as User).id;
      const { emoji } = req.body;
      if (!emoji) return res.status(400).json({ error: "emoji required" });
      await storage.addMessageReaction(+req.params.id, userId, emoji);
      res.json({ ok: true });
    } catch (e) { handleError(res, e); }
  });

  // Remove a reaction from a message
  app.delete("/api/messenger/messages/:id/reactions/:emoji", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as User).id;
      await storage.removeMessageReaction(+req.params.id, userId, decodeURIComponent(req.params.emoji));
      res.json({ ok: true });
    } catch (e) { handleError(res, e); }
  });

  // Send a GIF message
  app.post("/api/messenger/conversations/:id/gif", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as User).id;
      const convId = +req.params.id;
      const { gifUrl, gifPreviewUrl, gifTitle } = req.body;
      if (!gifUrl) return res.status(400).json({ error: "gifUrl required" });
      const displayText = gifTitle ? `[GIF: ${gifTitle}]` : "[GIF]";
      const shareData = JSON.stringify({ gifUrl, gifPreviewUrl: gifPreviewUrl ?? gifUrl, gifTitle: gifTitle ?? "" });
      const msg = await storage.createMessage(convId, userId, displayText, {
        messageType: 'gif', shareData,
      });
      res.status(201).json(msg);
    } catch (e) { handleError(res, e); }
  });


  // ── Facebook OAuth ────────────────────────────────────────────────────────────

  function fbCallbackUrl(req: Request): string {
    if (process.env.FACEBOOK_CALLBACK_URL) return process.env.FACEBOOK_CALLBACK_URL;
    const proto = req.get("x-forwarded-proto") ?? req.protocol ?? "https";
    return `${proto}://${req.get("host")}/api/facebook/callback`;
  }

  /** Parse Facebook birthday ICS calendar feed to extract {name, birthday} pairs */
  function parseFacebookBirthdayIcs(icsText: string): Array<{ fbFriendId: string; name: string; birthday: string; birthdayRaw: string }> {
    const events: Array<{ fbFriendId: string; name: string; birthday: string; birthdayRaw: string }> = [];
    const blocks = icsText.split("BEGIN:VEVENT");
    for (const block of blocks.slice(1)) {
      const get = (key: string) => {
        const m = block.match(new RegExp(`^${key}[^:]*:(.+)$`, "m"));
        return m ? m[1].trim() : null;
      };
      const summary = get("SUMMARY");
      const dtstart = get("DTSTART");
      const uid = get("UID");
      if (!summary || !dtstart) continue;
      // Summary is typically "Name's Birthday" — strip the "'s Birthday" suffix
      const name = summary.replace(/'s Birthday$/i, "").replace(/'\s*Birthday$/i, "").trim();
      // DTSTART;VALUE=DATE:19700101 for recurring — get month/day
      const dateMatch = dtstart.match(/(\d{4})(\d{2})(\d{2})/);
      if (!dateMatch) continue;
      const [, _y, mm, dd] = dateMatch;
      const birthday = `${mm}/${dd}`; // MM/DD (year is usually placeholder)
      // Use UID to extract FB friend ID if present
      const fbFriendId = uid?.match(/fb\/(\d+)/)?.[1] ?? uid ?? `${name}-${birthday}`;
      events.push({ fbFriendId, name, birthday, birthdayRaw: dtstart });
    }
    return events;
  }

  // GET /api/facebook/status
  app.get("/api/facebook/status", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as User).id;
      const profile = await storage.getFacebookProfile(userId);
      const friends = await storage.getFacebookFriends(userId);
      const withBirthday = friends.filter(f => f.birthday).length;
      res.json({
        connected: !!profile,
        configured: !!(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET),
        profile: profile ? { name: profile.name, email: profile.email, avatarUrl: profile.avatarUrl, birthday: profile.birthday, lastSync: profile.lastSync } : null,
        friendCount: friends.length,
        birthdayCount: withBirthday,
      });
    } catch (e) { handleError(res, e); }
  });

  // GET /api/facebook/connect — redirect to Facebook OAuth
  app.get("/api/facebook/connect", (req, res) => {
    if (!req.isAuthenticated()) {
      (req.session as any).postLoginRedirect = "/api/facebook/connect";
      return res.redirect("/auth/google");
    }
    const appId = process.env.FACEBOOK_APP_ID;
    if (!appId) return res.status(500).send(`
      <html><body style="font-family:sans-serif;padding:40px;text-align:center;max-width:520px;margin:0 auto">
        <h2>Facebook not configured</h2>
        <p>Add <strong>FACEBOOK_APP_ID</strong> and <strong>FACEBOOK_APP_SECRET</strong> to your Railway environment variables.</p>
        <ol style="text-align:left;line-height:2">
          <li>Go to <a href="https://developers.facebook.com/apps" target="_blank">developers.facebook.com/apps</a></li>
          <li>Create a new app → Choose "Consumer" type</li>
          <li>Add "Facebook Login" product</li>
          <li>Under Facebook Login → Settings, add <code>${fbCallbackUrl(req)}</code> as a valid OAuth redirect URI</li>
          <li>Copy App ID and App Secret to Railway env vars</li>
        </ol>
        <a href="/">← Back to app</a>
      </body></html>
    `);
    (req.session as any).facebookUserId = (req.user as User).id;
    const url = new URL("https://www.facebook.com/v19.0/dialog/oauth");
    url.searchParams.set("client_id", appId);
    url.searchParams.set("redirect_uri", fbCallbackUrl(req));
    url.searchParams.set("response_type", "code");
    // user_birthday: logged-in user's birthday
    // user_friends: friends who also use this app
    // email: email address
    url.searchParams.set("scope", "email,user_birthday,user_friends,user_location,public_profile");
    url.searchParams.set("state", String((req.user as User).id));
    res.redirect(url.toString());
  });

  // GET /api/facebook/callback — exchange code, fetch profile + friends + birthday calendar
  app.get("/api/facebook/callback", async (req, res) => {
    try {
      const { code, error, state } = req.query as Record<string, string>;
      const userId = (req.session as any).facebookUserId ?? (state ? parseInt(state) : null);
      if (error || !code || !userId) return res.redirect("/?facebook=error#/relationships");

      // Exchange code for access token
      const tokenUrl = new URL("https://graph.facebook.com/v19.0/oauth/access_token");
      tokenUrl.searchParams.set("client_id", process.env.FACEBOOK_APP_ID!);
      tokenUrl.searchParams.set("client_secret", process.env.FACEBOOK_APP_SECRET!);
      tokenUrl.searchParams.set("redirect_uri", fbCallbackUrl(req));
      tokenUrl.searchParams.set("code", code);
      const tokenRes = await fetch(tokenUrl.toString());
      if (!tokenRes.ok) return res.redirect("/?facebook=error#/relationships");
      const tokenData = await tokenRes.json() as any;
      const accessToken: string = tokenData.access_token;

      // Fetch user profile (id, name, email, birthday, picture)
      const profileRes = await fetch(
        `https://graph.facebook.com/v19.0/me?fields=id,name,email,birthday,picture.type(large),location&access_token=${accessToken}`
      );
      if (!profileRes.ok) return res.redirect("/?facebook=error#/relationships");
      const profile = await profileRes.json() as any;

      await storage.saveFacebookProfile(userId, {
        accessToken,
        fbUserId: profile.id,
        name: profile.name ?? "",
        email: profile.email ?? null,
        avatarUrl: profile.picture?.data?.url ?? null,
        birthday: profile.birthday ?? null,
        location: profile.location?.name ?? null,
      });

      // Fetch friends who have also authorized this app (user_friends scope)
      const friendsRes = await fetch(
        `https://graph.facebook.com/v19.0/me/friends?fields=id,name,picture.type(normal)&limit=200&access_token=${accessToken}`
      );
      const friendsData = friendsRes.ok ? await friendsRes.json() as any : { data: [] };
      const apiFriends = (friendsData.data ?? []).map((f: any) => ({
        fbFriendId: f.id,
        name: f.name,
        avatarUrl: f.picture?.data?.url ?? null,
      }));
      if (apiFriends.length > 0) {
        await storage.upsertFacebookFriends(userId, apiFriends);
      }

      // Fetch birthday ICS calendar feed — this contains ALL friends' birthdays
      // Facebook provides this at /me/events/birthday as an ICS-like feed
      // We use the graph events endpoint and also the ical birthday export
      try {
        const bdayRes = await fetch(
          `https://graph.facebook.com/v19.0/me/events/birthday?fields=name,start_time,cover&limit=500&access_token=${accessToken}`
        );
        if (bdayRes.ok) {
          const bdayData = await bdayRes.json() as any;
          const bdayFriends = (bdayData.data ?? []).map((ev: any) => {
            const name = (ev.name ?? "").replace(/'s Birthday$/i, "").replace(/'\s*Birthday$/i, "").trim();
            const dateStr = ev.start_time ? ev.start_time.slice(5, 10) : null; // MM-DD
            const birthday = dateStr ? dateStr.replace("-", "/") : null;
            return { fbFriendId: `bday-${name}`, name, birthday, avatarUrl: ev.cover?.source ?? null };
          }).filter((f: any) => f.name && f.birthday);
          if (bdayFriends.length > 0) {
            await storage.upsertFacebookFriends(userId, bdayFriends);
          }
        }
      } catch { /* birthday calendar optional */ }

      await storage.setFacebookLastSync(userId, new Date().toISOString());
      res.redirect("/?facebook=connected#/relationships");
    } catch (e) {
      console.error("Facebook callback error:", e);
      res.redirect("/?facebook=error#/relationships");
    }
  });

  // POST /api/facebook/sync — re-fetch friends + birthdays with stored token
  app.post("/api/facebook/sync", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as User).id;
      const profile = await storage.getFacebookProfile(userId);
      if (!profile) return res.status(400).json({ error: "Not connected" });
      const accessToken = profile.accessToken;

      // Refresh friends
      const friendsRes = await fetch(
        `https://graph.facebook.com/v19.0/me/friends?fields=id,name,picture.type(normal)&limit=500&access_token=${accessToken}`
      );
      let friendCount = 0;
      if (friendsRes.ok) {
        const d = await friendsRes.json() as any;
        const friends = (d.data ?? []).map((f: any) => ({ fbFriendId: f.id, name: f.name, avatarUrl: f.picture?.data?.url ?? null }));
        friendCount = await storage.upsertFacebookFriends(userId, friends);
      }

      // Refresh birthday events
      let bdayCount = 0;
      const bdayRes = await fetch(
        `https://graph.facebook.com/v19.0/me/events/birthday?fields=name,start_time&limit=500&access_token=${accessToken}`
      );
      if (bdayRes.ok) {
        const d = await bdayRes.json() as any;
        const bdayFriends = (d.data ?? []).map((ev: any) => {
          const name = (ev.name ?? "").replace(/'s Birthday$/i, "").replace(/'\s*Birthday$/i, "").trim();
          const dateStr = ev.start_time ? ev.start_time.slice(5, 10) : null;
          const birthday = dateStr ? dateStr.replace("-", "/") : null;
          return { fbFriendId: `bday-${name}`, name, birthday };
        }).filter((f: any) => f.name && f.birthday);
        bdayCount = await storage.upsertFacebookFriends(userId, bdayFriends);
      }

      await storage.setFacebookLastSync(userId, new Date().toISOString());
      res.json({ friendCount, bdayCount });
    } catch (e) { handleError(res, e); }
  });

  // GET /api/facebook/friends
  app.get("/api/facebook/friends", requireAuth, async (req, res) => {
    try {
      const friends = await storage.getFacebookFriends((req.user as User).id);
      res.json(friends);
    } catch (e) { handleError(res, e); }
  });

  // DELETE /api/facebook/disconnect
  app.delete("/api/facebook/disconnect", requireAuth, async (req, res) => {
    try {
      await storage.clearFacebookProfile((req.user as User).id);
      res.json({ ok: true });
    } catch (e) { handleError(res, e); }
  });

  // ── LinkedIn OAuth ────────────────────────────────────────────────────────────

  function linkedinCallbackUrl(req: Request): string {
    if (process.env.LINKEDIN_CALLBACK_URL) return process.env.LINKEDIN_CALLBACK_URL;
    const proto = req.get("x-forwarded-proto") ?? req.protocol ?? "https";
    return `${proto}://${req.get("host")}/api/linkedin/callback`;
  }

  // GET /api/linkedin/status
  app.get("/api/linkedin/status", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as User).id;
      const profile = await storage.getLinkedinProfile(userId);
      const contacts = await storage.getLinkedinContacts(userId);
      res.json({
        connected: !!profile,
        configured: !!(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET),
        profile: profile ? { name: profile.name, headline: profile.headline, avatarUrl: profile.avatarUrl, email: profile.email } : null,
        contactCount: contacts.length,
      });
    } catch (e) { handleError(res, e); }
  });

  // GET /api/linkedin/connect — redirect to LinkedIn OAuth
  app.get("/api/linkedin/connect", (req, res) => {
    if (!req.isAuthenticated()) {
      (req.session as any).postLoginRedirect = "/api/linkedin/connect";
      return res.redirect("/auth/google");
    }
    const clientId = process.env.LINKEDIN_CLIENT_ID;
    if (!clientId) return res.status(500).send(`
      <html><body style="font-family:sans-serif;padding:40px;text-align:center">
        <h2>LinkedIn not configured</h2>
        <p>Add <strong>LINKEDIN_CLIENT_ID</strong> and <strong>LINKEDIN_CLIENT_SECRET</strong> to your Railway environment variables.</p>
        <p><a href="https://www.linkedin.com/developers/apps/new" target="_blank">Create a LinkedIn app</a> to get credentials.</p>
        <p><a href="/">← Back to app</a></p>
      </body></html>
    `);
    (req.session as any).linkedinUserId = (req.user as User).id;
    const url = new URL("https://www.linkedin.com/oauth/v2/authorization");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", linkedinCallbackUrl(req));
    url.searchParams.set("scope", "openid profile email");
    url.searchParams.set("state", String((req.user as User).id));
    res.redirect(url.toString());
  });

  // GET /api/linkedin/callback — exchange code for token + fetch profile
  app.get("/api/linkedin/callback", async (req, res) => {
    try {
      const { code, error, state } = req.query as Record<string, string>;
      const userId = (req.session as any).linkedinUserId ?? (state ? parseInt(state) : null);
      if (error || !code || !userId) return res.redirect("/?linkedin=error#/relationships");

      // Exchange code for access token
      const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: linkedinCallbackUrl(req),
          client_id: process.env.LINKEDIN_CLIENT_ID!,
          client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
        }).toString(),
      });
      if (!tokenRes.ok) return res.redirect("/?linkedin=error#/relationships");
      const tokenData = await tokenRes.json() as any;
      const accessToken: string = tokenData.access_token;

      // Fetch profile via OpenID Connect userinfo
      const profileRes = await fetch("https://api.linkedin.com/v2/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!profileRes.ok) return res.redirect("/?linkedin=error#/relationships");
      const profile = await profileRes.json() as any;

      const name = profile.name ?? [profile.given_name, profile.family_name].filter(Boolean).join(" ") ?? "LinkedIn User";
      await storage.saveLinkedinProfile(userId, {
        accessToken,
        profileId: profile.sub ?? String(userId),
        name,
        headline: profile.locale?.language ? `LinkedIn member` : null,
        avatarUrl: profile.picture ?? null,
        email: profile.email ?? null,
      });

      res.redirect("/?linkedin=connected#/relationships");
    } catch (e) {
      console.error("LinkedIn callback error:", e);
      res.redirect("/?linkedin=error#/relationships");
    }
  });

  // DELETE /api/linkedin/disconnect
  app.delete("/api/linkedin/disconnect", requireAuth, async (req, res) => {
    try {
      await storage.clearLinkedinProfile((req.user as User).id);
      res.json({ ok: true });
    } catch (e) { handleError(res, e); }
  });

  // GET /api/linkedin/contacts
  app.get("/api/linkedin/contacts", requireAuth, async (req, res) => {
    try {
      const contacts = await storage.getLinkedinContacts((req.user as User).id);
      res.json(contacts);
    } catch (e) { handleError(res, e); }
  });

  // ── Google Contacts OAuth ─────────────────────────────────────────────────────

  function gcontactsCallbackUrl(req: Request): string {
    if (process.env.GOOGLE_CONTACTS_CALLBACK_URL) return process.env.GOOGLE_CONTACTS_CALLBACK_URL;
    const proto = req.get("x-forwarded-proto") ?? req.protocol ?? "https";
    return `${proto}://${req.get("host")}/api/gcontacts/callback`;
  }

  // GET /api/gcontacts/status
  app.get("/api/gcontacts/status", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as User).id;
      const tokens = await storage.getGoogleContactsTokens(userId);
      const contacts = tokens ? await storage.getGoogleContacts(userId) : [];
      const r = await pool.query(`SELECT google_contacts_last_sync FROM users WHERE id=$1`, [userId]);
      const lastSync = r.rows[0]?.google_contacts_last_sync ?? null;
      const withBirthday = contacts.filter(c => c.birthday).length;
      res.json({
        connected: !!tokens,
        configured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
        contactCount: contacts.length,
        birthdayCount: withBirthday,
        lastSync,
      });
    } catch (e) { handleError(res, e); }
  });

  // GET /api/gcontacts/connect — redirect to Google OAuth for contacts
  app.get("/api/gcontacts/connect", (req, res) => {
    if (!req.isAuthenticated()) {
      (req.session as any).postLoginRedirect = "/api/gcontacts/connect";
      return res.redirect("/auth/google");
    }
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) return res.status(500).send(`
      <html><body style="font-family:sans-serif;padding:40px;text-align:center;max-width:520px;margin:0 auto">
        <h2>Google Contacts not configured</h2>
        <p>Add <strong>GOOGLE_CLIENT_ID</strong> and <strong>GOOGLE_CLIENT_SECRET</strong> to your environment variables.</p>
        <p>These are the same credentials used for Google login — just add this callback URL in the Google Cloud Console:</p>
        <code style="display:block;padding:10px;background:#f0f0f0;border-radius:6px;margin:10px 0">${gcontactsCallbackUrl(req)}</code>
        <a href="/">← Back to app</a>
      </body></html>
    `);
    (req.session as any).gcontactsUserId = (req.user as User).id;
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", gcontactsCallbackUrl(req));
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "https://www.googleapis.com/auth/contacts.readonly https://www.googleapis.com/auth/contacts.other.readonly");
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent"); // force refresh_token
    url.searchParams.set("state", String((req.user as User).id));
    res.redirect(url.toString());
  });

  // GET /api/gcontacts/callback — exchange code, fetch & store contacts
  app.get("/api/gcontacts/callback", async (req, res) => {
    try {
      const { code, error, state } = req.query as Record<string, string>;
      const userId = (req.session as any).gcontactsUserId ?? (state ? parseInt(state) : null);
      if (error || !code || !userId) return res.redirect("/?google=error#/relationships");

      // Exchange code for tokens
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          redirect_uri: gcontactsCallbackUrl(req),
          grant_type: "authorization_code",
        }).toString(),
      });
      if (!tokenRes.ok) return res.redirect("/?google=error#/relationships");
      const tokenData = await tokenRes.json() as any;
      const accessToken: string = tokenData.access_token;
      const refreshToken: string | null = tokenData.refresh_token ?? null;
      const expiry = new Date(Date.now() + (tokenData.expires_in ?? 3600) * 1000).toISOString();

      await storage.saveGoogleContactsTokens(userId, { accessToken, refreshToken, expiry });

      // Fetch contacts from Google People API
      await syncGoogleContactsForUser(userId, accessToken);

      await storage.setGoogleContactsLastSync(userId, new Date().toISOString());
      res.redirect("/?google=connected#/relationships");
    } catch (e) {
      console.error("Google Contacts callback error:", e);
      res.redirect("/?google=error#/relationships");
    }
  });

  /** Parse a raw People API person object into a storable contact */
  function parsePerson(p: any) {
    const name = p.names?.[0];
    const email = p.emailAddresses?.[0]?.value ?? null;
    const phone = p.phoneNumbers?.[0]?.value ?? null;
    const photo = p.photos?.find((ph: any) => !ph.default)?.url ?? p.photos?.[0]?.url ?? null;
    const org = p.organizations?.[0];
    const bdayObj = p.birthdays?.[0]?.date;
    let birthday: string | null = null;
    if (bdayObj) {
      const { year, month, day } = bdayObj;
      if (year && month && day) birthday = `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
      else if (month && day) birthday = `${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    }
    return {
      resourceName: p.resourceName as string,
      firstName: name?.givenName ?? null,
      lastName: name?.familyName ?? null,
      email,
      phone,
      birthday,
      avatarUrl: photo,
      company: org?.name ?? null,
    };
  }

  /** Fetch all contacts from Google People API and upsert them */
  async function syncGoogleContactsForUser(userId: number, accessToken: string): Promise<number> {
    const fields = "names,emailAddresses,phoneNumbers,birthdays,photos,organizations";
    const headers = { Authorization: `Bearer ${accessToken}` };
    let total = 0;

    // 1. "My Contacts" — people/me/connections
    let pageToken: string | undefined;
    do {
      const url = new URL("https://people.googleapis.com/v1/people/me/connections");
      url.searchParams.set("personFields", fields);
      url.searchParams.set("pageSize", "1000");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const r = await fetch(url.toString(), { headers });
      const rawText = await r.text();
      console.log(`[gcontacts] connections status=${r.status} body=${rawText.slice(0, 500)}`);
      if (!r.ok) {
        const errBody = JSON.parse(rawText).catch?.(() => ({})) ?? {};
        const msg = (errBody as any)?.error?.message ?? `HTTP ${r.status}`;
        throw new Error(`Google People API (connections) error: ${msg} — ${rawText.slice(0, 200)}`);
      }
      const data = JSON.parse(rawText) as any;
      console.log(`[gcontacts] connections count=${(data.connections ?? []).length} nextPageToken=${data.nextPageToken ?? "none"}`);
      const contacts = (data.connections ?? []).map(parsePerson).filter((c: any) => c.resourceName);
      if (contacts.length > 0) total += await storage.upsertGoogleContacts(userId, contacts);
      pageToken = data.nextPageToken;
    } while (pageToken);

    // 2. "Other contacts" — people auto-saved from Gmail/interactions
    let otherPageToken: string | undefined;
    do {
      const url = new URL("https://people.googleapis.com/v1/otherContacts");
      url.searchParams.set("readMask", fields);
      url.searchParams.set("pageSize", "1000");
      if (otherPageToken) url.searchParams.set("pageToken", otherPageToken);
      const r = await fetch(url.toString(), { headers });
      const rawText = await r.text();
      console.log(`[gcontacts] otherContacts status=${r.status} body=${rawText.slice(0, 500)}`);
      if (!r.ok) {
        // otherContacts scope is optional — skip silently if not granted
        break;
      }
      const data = JSON.parse(rawText) as any;
      console.log(`[gcontacts] otherContacts count=${(data.otherContacts ?? []).length}`);
      const contacts = (data.otherContacts ?? []).map(parsePerson).filter((c: any) => c.resourceName);
      if (contacts.length > 0) total += await storage.upsertGoogleContacts(userId, contacts);
      otherPageToken = data.nextPageToken;
    } while (otherPageToken);

    return total;
  }

  // POST /api/gcontacts/sync — re-sync with stored token
  app.post("/api/gcontacts/sync", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as User).id;
      const tokens = await storage.getGoogleContactsTokens(userId);
      if (!tokens) return res.status(400).json({ error: "Not connected" });

      // Refresh token if expired
      let accessToken = tokens.accessToken;
      if (tokens.refreshToken && new Date(tokens.expiry) <= new Date()) {
        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            refresh_token: tokens.refreshToken,
            client_id: process.env.GOOGLE_CLIENT_ID!,
            client_secret: process.env.GOOGLE_CLIENT_SECRET!,
            grant_type: "refresh_token",
          }).toString(),
        });
        if (tokenRes.ok) {
          const d = await tokenRes.json() as any;
          accessToken = d.access_token;
          const newExpiry = new Date(Date.now() + (d.expires_in ?? 3600) * 1000).toISOString();
          await storage.saveGoogleContactsTokens(userId, { accessToken, refreshToken: tokens.refreshToken, expiry: newExpiry });
        }
      }

      const count = await syncGoogleContactsForUser(userId, accessToken);
      await storage.setGoogleContactsLastSync(userId, new Date().toISOString());
      res.json({ contactCount: count });
    } catch (e) { handleError(res, e); }
  });

  // GET /api/gcontacts/contacts
  app.get("/api/gcontacts/contacts", requireAuth, async (req, res) => {
    try {
      const contacts = await storage.getGoogleContacts((req.user as User).id);
      res.json(contacts);
    } catch (e) { handleError(res, e); }
  });

  // DELETE /api/gcontacts/disconnect
  app.delete("/api/gcontacts/disconnect", requireAuth, async (req, res) => {
    try {
      await storage.clearGoogleContactsTokens((req.user as User).id);
      res.json({ ok: true });
    } catch (e) { handleError(res, e); }
  });

  // POST /api/linkedin/import-csv — parse LinkedIn connections CSV export
  app.post("/api/linkedin/import-csv", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as User).id;
      const { csvText } = req.body as { csvText: string };
      if (!csvText) return res.status(400).json({ error: "csvText required" });

      // LinkedIn CSV format: First Name,Last Name,Email Address,Company,Position,Connected On
      const lines = csvText.split(/\r?\n/).filter(Boolean);
      // Find header row (skip any preamble lines)
      const headerIdx = lines.findIndex(l => l.toLowerCase().includes("first name") || l.toLowerCase().includes("firstname"));
      if (headerIdx === -1) return res.status(400).json({ error: "Could not find CSV header row" });

      const headers = lines[headerIdx].split(",").map(h => h.replace(/^"|"$/g, "").trim().toLowerCase());
      const firstCol  = headers.indexOf("first name") !== -1 ? headers.indexOf("first name") : headers.indexOf("firstname");
      const lastCol   = headers.indexOf("last name")  !== -1 ? headers.indexOf("last name")  : headers.indexOf("lastname");
      const emailCol  = headers.findIndex(h => h.includes("email"));
      const compCol   = headers.findIndex(h => h.includes("company"));
      const posCol    = headers.findIndex(h => h.includes("position"));
      const dateCol   = headers.findIndex(h => h.includes("connected"));

      const contacts = lines.slice(headerIdx + 1).map(line => {
        // Respect quoted CSV fields
        const cols: string[] = [];
        let cur = "", inQ = false;
        for (const ch of line) {
          if (ch === '"') { inQ = !inQ; continue; }
          if (ch === "," && !inQ) { cols.push(cur.trim()); cur = ""; continue; }
          cur += ch;
        }
        cols.push(cur.trim());
        return {
          firstName: firstCol >= 0 ? (cols[firstCol] ?? "").replace(/^"|"$/g, "") : "",
          lastName:  lastCol  >= 0 ? (cols[lastCol]  ?? "").replace(/^"|"$/g, "") : undefined,
          email:     emailCol >= 0 ? (cols[emailCol] ?? "").replace(/^"|"$/g, "") || undefined : undefined,
          company:   compCol  >= 0 ? (cols[compCol]  ?? "").replace(/^"|"$/g, "") || undefined : undefined,
          position:  posCol   >= 0 ? (cols[posCol]   ?? "").replace(/^"|"$/g, "") || undefined : undefined,
          connectedOn: dateCol >= 0 ? (cols[dateCol]  ?? "").replace(/^"|"$/g, "") || undefined : undefined,
        };
      }).filter(c => c.firstName);

      const count = await storage.importLinkedinContacts(userId, contacts);
      res.json({ imported: count });
    } catch (e) { handleError(res, e); }
  });

  // ── Habits ──────────────────────────────────────────────────────────────────
  app.get("/api/habits", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const rows = await storage.getHabits(uid);
      res.json(rows);
    } catch (e) { handleError(res, e); }
  });

  app.post("/api/habits", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const habit = await storage.createHabit(uid, req.body);
      res.json(habit);
    } catch (e) { handleError(res, e); }
  });

  app.patch("/api/habits/:id", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const id = parseInt(req.params.id);
      const habit = await storage.updateHabit(id, uid, req.body);
      res.json(habit);
    } catch (e) { handleError(res, e); }
  });

  app.delete("/api/habits/:id", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const id = parseInt(req.params.id);
      await storage.deleteHabit(id, uid);
      res.json({ ok: true });
    } catch (e) { handleError(res, e); }
  });

  app.post("/api/habits/:id/complete/:date", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const id = parseInt(req.params.id);
      const { date } = req.params;
      const { note } = req.body ?? {};
      const habit = await storage.toggleHabitCompletion(id, uid, date, note);
      // Feed: streak milestones (7/30/100 days) — only when today's toggle
      // completed the habit and the streak lands exactly on a milestone.
      try {
        const completions: Array<{ date: string }> = JSON.parse((habit as any).completionsJson || "[]");
        const days = new Set(completions.map(c => c.date));
        if (days.has(date)) {
          let streak = 0;
          const cursor = new Date(date + "T00:00:00Z");
          while (days.has(cursor.toISOString().slice(0, 10))) {
            streak++;
            cursor.setUTCDate(cursor.getUTCDate() - 1);
          }
          if ([7, 30, 100].includes(streak)) {
            logActivity(uid, "habit_streak", id, "habit", habit.title, null, `${streak}-day streak 🔥`);
          }
        }
      } catch {}
      res.json(habit);
    } catch (e) { handleError(res, e); }
  });

  app.delete("/api/habits/:id/complete/:date", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const id = parseInt(req.params.id);
      const { date } = req.params;
      const habit = await storage.toggleHabitCompletion(id, uid, date);
      res.json(habit);
    } catch (e) { handleError(res, e); }
  });

  // ── BUD BETS ──────────────────────────────────────────────────────────────
  app.get("/api/bud-bets", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const bets = await storage.getBudBets(uid);
      res.json(bets);
    } catch (e) { handleError(res, e); }
  });

  app.post("/api/bud-bets", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const bet = await storage.createBudBet({ ...req.body, creatorId: uid });
      // Send a DM to the opponent (and arbitrator if set) so the bet appears in Messages
      if (bet.opponentId) {
        await storage.createDMShareMessage(uid, bet.opponentId, 'bet', JSON.stringify({
          shareType: 'bet', name: bet.title, subtitle: `Wager: ${bet.wager}`, emoji: '🤝',
        }), `Challenged you to a bet: "${bet.title}" — Wager: ${bet.wager}`);
      }
      if (bet.arbitratorId) {
        await storage.createDMShareMessage(uid, bet.arbitratorId, 'bet', JSON.stringify({
          shareType: 'bet', name: bet.title, subtitle: `You've been asked to arbitrate`, emoji: '⚖️',
        }), `Asked you to arbitrate a bet: "${bet.title}"`);
      }
      res.json(bet);
    } catch (e) { handleError(res, e); }
  });

  app.patch("/api/bud-bets/:id", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const id = parseInt(req.params.id);
      const bet = await storage.updateBudBet(id, uid, req.body);
      res.json(bet);
    } catch (e) { handleError(res, e); }
  });

  app.delete("/api/bud-bets/:id", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as User).id;
      const id = parseInt(req.params.id);
      await storage.deleteBudBet(id, uid);
      res.json({ success: true });
    } catch (e) { handleError(res, e); }
  });
}
