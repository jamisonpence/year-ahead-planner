/**
 * Sign in with Apple (web flow).
 *
 * Required by App Review Guideline 4.8: an app offering a third-party login (we offer
 * Google) must also offer an equivalent option that limits collection to name and email,
 * lets the user keep their email private, and doesn't track for ads. Sign in with Apple
 * meets that; email/password does not, because it can't hide the user's address.
 *
 * This is the *web* flow rather than the native one, so the same code serves the website
 * and the iOS app — the app opens this in a system browser and gets a bearer token back.
 * That's why it's configured against a Services ID rather than the App ID.
 *
 * Two Apple-specific traps this handles:
 *
 *   1. The client secret is not a static string. It's an ES256 JWT you sign yourself with
 *      the .p8 key, valid for at most 6 months. It's generated per request here — cheap,
 *      and avoids caching something that silently expires.
 *
 *   2. Apple sends the user's *name* only on the very first authorisation, in a form field
 *      rather than in the token, and never again. A returning user gives us nothing but a
 *      stable `sub`. Account creation therefore has to work from sub + email alone.
 */
import crypto from "crypto";

const APPLE_ISS = "https://appleid.apple.com";
const APPLE_TOKEN_URL = `${APPLE_ISS}/auth/token`;
const APPLE_AUTHZ_URL = `${APPLE_ISS}/auth/authorize`;

export function appleConfigured(): boolean {
  return Boolean(
    process.env.APPLE_TEAM_ID &&
    process.env.APPLE_KEY_ID &&
    process.env.APPLE_SERVICE_ID &&
    process.env.APPLE_PRIVATE_KEY,
  );
}

function privateKey(): crypto.KeyObject {
  // Railway stores the .p8 with real newlines, but some hosts collapse them to "\n"
  // literals. Accept both so a pasted-wrong key doesn't fail with an opaque error.
  const raw = (process.env.APPLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n").trim();
  return crypto.createPrivateKey(raw);
}

const b64url = (input: Buffer | string) =>
  Buffer.from(input).toString("base64url");

/**
 * Build the ES256 client secret Apple expects in place of a static secret.
 *
 * Note dsaEncoding: "ieee-p1363". Node signs EC in DER by default, but JOSE requires the
 * raw r||s form — getting this wrong produces `invalid_client` from Apple with no hint.
 */
export function makeClientSecret(ttlSeconds = 15 * 60): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: process.env.APPLE_KEY_ID, typ: "JWT" };
  const payload = {
    iss: process.env.APPLE_TEAM_ID,
    iat: now,
    exp: now + ttlSeconds,
    aud: APPLE_ISS,
    sub: process.env.APPLE_SERVICE_ID,
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signature = crypto.sign("sha256", Buffer.from(signingInput), {
    key: privateKey(),
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${signature.toString("base64url")}`;
}

/** Where to send the browser to start the flow. */
export function authorizeUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: process.env.APPLE_SERVICE_ID!,
    redirect_uri: redirectUri,
    response_type: "code id_token",
    scope: "name email",
    // Apple requires form_post whenever name/email scope is requested, so the
    // callback arrives as a POST rather than a GET.
    response_mode: "form_post",
    state,
  });
  return `${APPLE_AUTHZ_URL}?${params}`;
}

export type AppleIdentity = { sub: string; email: string | null; emailVerified: boolean };

/** Decode a JWT payload without verifying. Only safe for tokens received over TLS
 *  directly from Apple's token endpoint — never for one posted by a browser. */
function decodePayload(jwt: string): any {
  const part = jwt.split(".")[1];
  if (!part) throw new Error("malformed id_token");
  return JSON.parse(Buffer.from(part, "base64url").toString());
}

/**
 * Exchange the authorization code for the identity.
 *
 * Deliberately ignores the id_token that Apple form-posts to the callback and uses only
 * the one returned here: this response comes straight from Apple over TLS, whereas
 * anything arriving via the browser is attacker-controllable. The claims are still
 * checked, since a TLS channel says who sent it, not what it says.
 */
export async function exchangeCode(code: string, redirectUri: string): Promise<AppleIdentity> {
  const body = new URLSearchParams({
    client_id: process.env.APPLE_SERVICE_ID!,
    client_secret: makeClientSecret(),
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });

  const res = await fetch(APPLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || !json.id_token) {
    // Apple's errors are terse; surface the code so the cause is diagnosable.
    throw new Error(`Apple token exchange failed (${res.status}): ${json.error ?? "no id_token"}`);
  }

  const claims = decodePayload(json.id_token);
  if (claims.iss !== APPLE_ISS) throw new Error("id_token issuer mismatch");
  if (claims.aud !== process.env.APPLE_SERVICE_ID) throw new Error("id_token audience mismatch");
  if (typeof claims.exp === "number" && Date.now() / 1000 > claims.exp) throw new Error("id_token expired");
  if (!claims.sub) throw new Error("id_token missing sub");

  return {
    sub: String(claims.sub),
    email: claims.email ? String(claims.email) : null,
    // Apple sends these as strings ("true") as often as booleans.
    emailVerified: claims.email_verified === true || claims.email_verified === "true",
  };
}

/**
 * The synthetic identity key for an Apple user.
 *
 * The users table has a single non-null googleId, and the codebase already stores
 * password accounts as "local:<email>". Following that convention means Sign in with
 * Apple needs no schema change and no migration at all.
 */
export const appleIdentityKey = (sub: string) => `apple:${sub}`;
