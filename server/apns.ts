/**
 * Apple Push Notification service.
 *
 * The web app uses Web Push (VAPID) via server/push.ts. WKWebView does not implement Web
 * Push, so the iOS app cannot receive any of it — the 9pm close-out, one-tap habit logging
 * and every notification in the daily loop are silently dead on the one platform we ship
 * to. This is the device-token path that replaces it there.
 *
 * Deliberately no new dependency. Node 20 ships http2, and the provider token is the same
 * ES256 JWT we already build for Sign in with Apple, so `apn`/`node-apn` would earn its
 * install cost only in features we do not use.
 *
 * Two environments, two keys. Apple's 2025 scoped keys cannot span environments: builds run
 * from Xcode and the simulator get **sandbox** device tokens, TestFlight and App Store
 * builds get **production** ones, and presenting a token to the wrong host fails with
 * BadDeviceToken. Rather than an env-var switch — which would break simulator delivery the
 * moment it flipped for TestFlight — each device records the environment it registered in
 * and we pick the key and host per device.
 */
import crypto from "node:crypto";
import http2 from "node:http2";
import { pool } from "./storage";

export type ApnsEnvironment = "sandbox" | "production";

const HOSTS: Record<ApnsEnvironment, string> = {
  production: "https://api.push.apple.com",
  sandbox: "https://api.sandbox.push.apple.com",
};

function keyIdFor(env: ApnsEnvironment): string | undefined {
  return env === "production"
    ? process.env.APNS_KEY_ID_PRODUCTION
    : process.env.APNS_KEY_ID_SANDBOX;
}

function rawKeyFor(env: ApnsEnvironment): string {
  const raw = env === "production"
    ? process.env.APNS_PRIVATE_KEY_PRODUCTION
    : process.env.APNS_PRIVATE_KEY_SANDBOX;
  // Railway keeps real newlines, but some hosts collapse them to "\n" literals. Accept
  // both, matching appleAuth.ts, so a pasted-wrong key doesn't fail opaquely.
  return (raw ?? "").replace(/\\n/g, "\n").trim();
}

/** True when at least one environment is fully configured. */
export function apnsConfigured(env?: ApnsEnvironment): boolean {
  const ok = (e: ApnsEnvironment) =>
    Boolean(process.env.APNS_TEAM_ID && process.env.APNS_BUNDLE_ID && keyIdFor(e) && rawKeyFor(e));
  return env ? ok(env) : ok("production") || ok("sandbox");
}

const b64url = (input: Buffer | string) => Buffer.from(input).toString("base64url");

/**
 * Provider token, cached per environment.
 *
 * APNs rejects a token refreshed more often than every 20 minutes (TooManyProviderTokenUpdates)
 * and one older than 60 minutes (ExpiredProviderToken). Regenerating per request would trip
 * the first; never regenerating trips the second. 40 minutes sits clear of both.
 */
const tokenCache = new Map<ApnsEnvironment, { jwt: string; madeAt: number }>();
const TOKEN_TTL_MS = 40 * 60 * 1000;

function providerToken(env: ApnsEnvironment): string {
  const cached = tokenCache.get(env);
  if (cached && Date.now() - cached.madeAt < TOKEN_TTL_MS) return cached.jwt;

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: keyIdFor(env), typ: "JWT" };
  const payload = { iss: process.env.APNS_TEAM_ID, iat: now };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  // dsaEncoding: "ieee-p1363" for the same reason as appleAuth.ts — Node signs EC as DER by
  // default, JOSE wants raw r||s. Getting it wrong yields InvalidProviderToken with no hint.
  const signature = crypto.sign("sha256", Buffer.from(signingInput), {
    key: crypto.createPrivateKey(rawKeyFor(env)),
    dsaEncoding: "ieee-p1363",
  });
  const jwt = `${signingInput}.${b64url(signature)}`;
  tokenCache.set(env, { jwt, madeAt: Date.now() });
  return jwt;
}

export async function initApns(): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS apns_devices (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        device_token TEXT NOT NULL UNIQUE,
        environment TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_seen_at TEXT
      )
    `);
    // Plain pool.query rather than safeDdl: a table nothing references yet has nothing to
    // contend with. The index does take a lock, so it goes through the guarded path.
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_apns_devices_user_id ON apns_devices (user_id)`);

    const envs = (["sandbox", "production"] as ApnsEnvironment[]).filter(e => apnsConfigured(e));
    console.log(envs.length
      ? `APNs configured for: ${envs.join(", ")}.`
      : "APNs not configured — iOS push disabled (set APNS_* env vars).");
  } catch (e) {
    // Never fatal. initializeStorage() runs before the server listens, so a throw here is a
    // crash loop rather than a degraded feature.
    console.error("APNs init failed (iOS push disabled):", e);
  }
}

export async function saveApnsDevice(userId: number, token: string, environment: ApnsEnvironment) {
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO apns_devices (user_id, device_token, environment, created_at, last_seen_at)
     VALUES ($1,$2,$3,$4,$4)
     ON CONFLICT (device_token)
       DO UPDATE SET user_id = $1, environment = $3, last_seen_at = $4`,
    [userId, token, environment, now],
  );
}

export async function removeApnsDevice(userId: number, token: string) {
  await pool.query(
    `DELETE FROM apns_devices WHERE user_id = $1 AND device_token = $2`,
    [userId, token],
  );
}

/** One HTTP/2 POST to APNs. Resolves with the status and Apple's `reason`, if any. */
function post(env: ApnsEnvironment, deviceToken: string, body: string): Promise<{ status: number; reason?: string }> {
  return new Promise((resolve) => {
    let client: http2.ClientHttp2Session;
    try {
      client = http2.connect(HOSTS[env]);
    } catch {
      return resolve({ status: 0, reason: "ConnectFailed" });
    }
    // A hung socket must not keep the request pending forever — the daily digest fans out
    // across every device and one bad connection should not stall the batch.
    const timer = setTimeout(() => { try { client.destroy(); } catch {} resolve({ status: 0, reason: "Timeout" }); }, 10_000);
    const done = (r: { status: number; reason?: string }) => {
      clearTimeout(timer);
      try { client.close(); } catch {}
      resolve(r);
    };

    client.on("error", () => done({ status: 0, reason: "SocketError" }));

    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      "authorization": `bearer ${providerToken(env)}`,
      "apns-topic": process.env.APNS_BUNDLE_ID!,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    });

    let status = 0;
    let data = "";
    req.on("response", (headers) => { status = Number(headers[":status"] ?? 0); });
    req.on("data", (chunk) => { data += chunk; });
    req.on("error", () => done({ status: 0, reason: "RequestError" }));
    req.on("end", () => {
      let reason: string | undefined;
      try { reason = data ? JSON.parse(data).reason : undefined; } catch { /* non-JSON body */ }
      done({ status, reason });
    });

    req.end(body);
  });
}

/**
 * Fire-and-forget push to a user's iOS devices. Prunes tokens Apple reports as dead.
 *
 * Called from sendPushToUser alongside Web Push, so every existing caller — the daily
 * digest, the evening close-out, habit actions, in-app notifications — reaches iOS with no
 * change at the call site.
 */
export type ApnsPayload = {
  title: string;
  body?: string | null;
  href?: string | null;
  /** Maps to an APNs category; the app registers matching action buttons. */
  category?: string;
  /** Collapse id — a later push with the same value replaces an unread earlier one. */
  tag?: string;
};

/** Per-device outcome. Returned by the diagnostic path; discarded by the normal one. */
export type ApnsResult = {
  deviceId: number;
  tokenTail: string;
  environment: ApnsEnvironment;
  status: number;
  reason?: string;
  /** Set when the device was registered under the wrong environment and we fixed it. */
  correctedTo?: ApnsEnvironment;
  deleted?: boolean;
};

/**
 * Fire-and-forget push to a user's iOS devices. Prunes tokens Apple reports as dead.
 *
 * Called from sendPushToUser alongside Web Push, so every existing caller — the daily
 * digest, the evening close-out, habit actions, in-app notifications — reaches iOS with no
 * change at the call site.
 */
export async function sendApnsToUser(userId: number, payload: ApnsPayload): Promise<void> {
  await deliver(userId, payload);
}

/**
 * Same delivery, but returns what happened per device.
 *
 * Exists because on TestFlight there is no Xcode console: an install either works or fails
 * silently, and "silently" was the whole problem with this subsystem. Apple's `reason`
 * string is the only real diagnostic they give, so it is surfaced to the user rather than
 * left in a server log they cannot read.
 */
export async function sendApnsDiagnostic(userId: number, payload: ApnsPayload): Promise<ApnsResult[]> {
  return deliver(userId, payload);
}

async function deliver(userId: number, payload: ApnsPayload): Promise<ApnsResult[]> {
  const results: ApnsResult[] = [];
  if (!apnsConfigured()) return results;
  try {
    const devices = await pool.query(
      `SELECT id, device_token, environment FROM apns_devices WHERE user_id = $1`,
      [userId],
    );
    if (devices.rowCount === 0) return results;

    const body = JSON.stringify({
      aps: {
        alert: { title: payload.title, body: payload.body ?? "" },
        sound: "default",
        ...(payload.category ? { category: payload.category } : {}),
        ...(payload.tag ? { "thread-id": payload.tag } : {}),
      },
      // Read by the app when the notification is tapped, to route to the right screen.
      href: payload.href ?? "/",
    });

    await Promise.all(devices.rows.map(async (d: any) => {
      const env: ApnsEnvironment = d.environment === "production" ? "production" : "sandbox";
      const tokenTail = String(d.device_token).slice(-6);
      if (!apnsConfigured(env)) {
        // The device registered under an environment whose key is not set. Reported rather
        // than skipped silently — this is exactly the case that looks like "push is broken".
        results.push({ deviceId: d.id, tokenTail, environment: env, status: 0, reason: "EnvironmentNotConfigured" });
        return;
      }

      let { status, reason } = await post(env, d.device_token, body);

      // BadDeviceToken most often means the token is valid but belongs to the *other*
      // environment. The client cannot reliably tell which it is — a Vite production
      // bundle can be signed with a development profile, which is exactly what a local
      // `npm run build:ios` produces — so its answer is a hint, not a fact. Retry the
      // other environment once and persist whichever works, rather than deleting a token
      // that would have delivered fine.
      if (reason === "BadDeviceToken") {
        const other: ApnsEnvironment = env === "production" ? "sandbox" : "production";
        if (apnsConfigured(other)) {
          const retry = await post(other, d.device_token, body);
          if (retry.status === 200) {
            await pool.query(
              `UPDATE apns_devices SET environment = $1 WHERE id = $2`,
              [other, d.id],
            ).catch(() => {});
            console.log(`[apns] device ${d.id} corrected to ${other}`);
            results.push({ deviceId: d.id, tokenTail, environment: other, status: 200, correctedTo: other });
            return;
          }
          ({ status, reason } = retry);
        }
      }

      // 410 Unregistered: the app was deleted. BadDeviceToken surviving the retry above
      // means it is genuinely malformed. Either way the row will never deliver again.
      if (status === 410 || reason === "Unregistered" || reason === "BadDeviceToken") {
        await pool.query(`DELETE FROM apns_devices WHERE id = $1`, [d.id]).catch(() => {});
        results.push({ deviceId: d.id, tokenTail, environment: env, status, reason, deleted: true });
        return;
      }
      if (status !== 200) {
        // Log rather than throw: one dead device must not abort the fan-out. The reason
        // string is Apple's own and is the only useful diagnostic they give.
        console.error(`[apns] ${env} device ${d.id} failed: ${status} ${reason ?? ""}`.trim());
      }
      results.push({ deviceId: d.id, tokenTail, environment: env, status, reason });
    }));
  } catch (e) {
    console.error("[apns] send failed:", e);
  }
  return results;
}
