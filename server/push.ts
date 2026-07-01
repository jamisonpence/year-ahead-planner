import webpush from "web-push";
import { pool } from "./storage";

// ── Web Push (VAPID) ─────────────────────────────────────────────────────────
// Keys come from VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY env vars when set;
// otherwise they're generated once and persisted in app_secrets so push works
// with zero manual setup.

let publicKey: string | null = null;
let configured = false;

export async function initWebPush() {
  try {
    let pub = process.env.VAPID_PUBLIC_KEY?.trim();
    let priv = process.env.VAPID_PRIVATE_KEY?.trim();

    if (!pub || !priv) {
      await pool.query(`CREATE TABLE IF NOT EXISTS app_secrets (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
      const r = await pool.query(`SELECT key, value FROM app_secrets WHERE key IN ('vapid_public','vapid_private')`);
      const map: Record<string, string> = Object.fromEntries(r.rows.map((x: any) => [x.key, x.value]));
      if (map.vapid_public && map.vapid_private) {
        pub = map.vapid_public;
        priv = map.vapid_private;
      } else {
        const keys = webpush.generateVAPIDKeys();
        await pool.query(
          `INSERT INTO app_secrets (key, value) VALUES ('vapid_public',$1), ('vapid_private',$2)
           ON CONFLICT (key) DO NOTHING`,
          [keys.publicKey, keys.privateKey]
        );
        // Re-read to survive races between multiple instances
        const r2 = await pool.query(`SELECT key, value FROM app_secrets WHERE key IN ('vapid_public','vapid_private')`);
        const map2: Record<string, string> = Object.fromEntries(r2.rows.map((x: any) => [x.key, x.value]));
        pub = map2.vapid_public;
        priv = map2.vapid_private;
      }
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        endpoint TEXT NOT NULL UNIQUE,
        keys_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions (user_id)`);

    webpush.setVapidDetails("mailto:jamisonpence@gmail.com", pub!, priv!);
    publicKey = pub!;
    configured = true;
    console.log("Web push configured.");
  } catch (e) {
    console.error("Web push init failed (push disabled):", e);
  }
}

export function getVapidPublicKey(): string | null {
  return publicKey;
}

export async function saveSubscription(userId: number, sub: { endpoint: string; keys: unknown }) {
  await pool.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, keys_json, created_at)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = $1, keys_json = $3`,
    [userId, sub.endpoint, JSON.stringify(sub.keys), new Date().toISOString()]
  );
}

export async function removeSubscription(userId: number, endpoint: string) {
  await pool.query(`DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2`, [userId, endpoint]);
}

/** Fire-and-forget push to all of a user's devices. Prunes dead subscriptions. */
export async function sendPushToUser(
  userId: number,
  payload: { title: string; body?: string | null; href?: string | null }
) {
  if (!configured) return;
  try {
    const subs = await pool.query(`SELECT id, endpoint, keys_json FROM push_subscriptions WHERE user_id = $1`, [userId]);
    await Promise.all(subs.rows.map(async (s: any) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: JSON.parse(s.keys_json) },
          JSON.stringify({ title: payload.title, body: payload.body ?? "", href: payload.href ?? "/" })
        );
      } catch (e: any) {
        // 404/410 = subscription expired or revoked
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          await pool.query(`DELETE FROM push_subscriptions WHERE id = $1`, [s.id]).catch(() => {});
        }
      }
    }));
  } catch {}
}
