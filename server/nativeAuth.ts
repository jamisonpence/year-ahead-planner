/**
 * Bearer-token auth for the native iOS app.
 *
 * Why this exists: a Capacitor app serves its web assets from capacitor://localhost,
 * so every call to mylifos.com is cross-origin. The session cookie is sameSite: "lax"
 * and is therefore never sent on those requests, and there is no CORS middleware — so
 * without this the app cannot authenticate at all.
 *
 * The design goal is that nothing else has to change. The middleware below populates
 * req.user and req.isAuthenticated() exactly as Passport's session strategy does, so all
 * ~550 existing routes and their requireAuth guards work untouched, and the website keeps
 * its cookie session with no behaviour change whatsoever.
 *
 * No new dependency: the token is an HMAC-signed payload built with node:crypto rather
 * than pulling in a JWT library for what is a two-field claim.
 *
 * Token format:  base64url(JSON payload) "." base64url(HMAC-SHA256(payload, secret))
 * Payload:       { uid, exp }   — subject and expiry, nothing else
 *
 * The signing secret is SESSION_SECRET, so rotating it invalidates app tokens and web
 * sessions together, which is the behaviour you want from a rotation.
 */
import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";

const TOKEN_TTL_DAYS = 60; // long-lived on purpose: re-authenticating an app weekly is hostile

function secret(): string {
  return process.env.SESSION_SECRET || "dev-secret-please-change";
}

const b64url = (b: Buffer) => b.toString("base64url");

function sign(payload: string): string {
  return b64url(crypto.createHmac("sha256", secret()).update(payload).digest());
}

/** Mint a token for a user. Returns the string the app stores in the iOS Keychain. */
export function issueNativeToken(userId: number, ttlDays = TOKEN_TTL_DAYS): string {
  const exp = Date.now() + ttlDays * 24 * 60 * 60 * 1000;
  const payload = b64url(Buffer.from(JSON.stringify({ uid: userId, exp })));
  return `${payload}.${sign(payload)}`;
}

/**
 * Verify a token and return the user id, or null.
 *
 * Uses timingSafeEqual for the signature comparison. A plain === leaks how much of the
 * signature matched via response timing, which is enough to forge one given patience.
 */
export function verifyNativeToken(token: string): number | null {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [payload, providedSig] = token.split(".", 2);
  if (!payload || !providedSig) return null;

  const expectedSig = sign(payload);
  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const { uid, exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof uid !== "number" || typeof exp !== "number") return null;
    if (Date.now() > exp) return null;
    return uid;
  } catch {
    return null;
  }
}

/**
 * Accept `Authorization: Bearer <token>` as an alternative to the session cookie.
 *
 * Mounted after passport.session(), so a cookie session always wins and the web app is
 * completely unaffected. Only requests that arrive with no session and a bearer token
 * take this path.
 *
 * A bad or expired token is deliberately *not* an error — it falls through unauthenticated
 * and the route's own requireAuth returns 401. That keeps one place responsible for
 * rejecting, rather than two that could disagree.
 */
export function bearerAuth(getUserById: (id: number) => Promise<any>) {
  return async function (req: Request, _res: Response, next: NextFunction) {
    if (typeof (req as any).isAuthenticated === "function" && (req as any).isAuthenticated()) {
      return next();
    }

    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) return next();

    const userId = verifyNativeToken(header.slice(7).trim());
    if (userId === null) return next();

    try {
      const user = await getUserById(userId);
      if (!user) return next();
      (req as any).user = user;
      (req as any).isAuthenticated = () => true;
      (req as any).authVia = "bearer";
    } catch {
      // A database blip should not masquerade as a forged token; fall through
      // unauthenticated and let the route decide.
    }
    return next();
  };
}
