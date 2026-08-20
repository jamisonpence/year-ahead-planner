/**
 * Native app authentication.
 *
 * On the web this file does nothing — the browser has a session cookie and every helper
 * here short-circuits. It only matters inside the Capacitor app, which serves its assets
 * from capacitor://localhost and therefore cannot send the sameSite:"lax" session cookie
 * to mylifos.com at all.
 *
 * The flow:
 *   1. the app opens /auth/apple?native=1 (or /auth/google?native=1) in the *system*
 *      browser rather than the WebView — a WebView OAuth flow would navigate away from
 *      the bundled app and never come back, and Apple/Google both refuse embedded
 *      WebViews for sign-in anyway
 *   2. the server finishes the OAuth round trip and redirects to mylifos://auth?token=…
 *   3. iOS hands that URL to the app, the listener below stores the token
 *   4. every subsequent request carries Authorization: Bearer <token>
 *
 * Storage is localStorage, which on iOS lives inside the app's sandbox. The Keychain
 * would be better — it survives app reinstall and is encrypted at rest — but needs
 * another plugin, so this is a deliberate v1 trade rather than an oversight.
 */
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";

const TOKEN_KEY = "mylifos.native.token";

/** True only inside the packaged iOS/Android app, never in a browser. */
export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch { /* private mode or storage full — the user simply has to sign in again */ }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch { /* nothing useful to do */ }
}

/**
 * Authorization header for a request, or {} on the web.
 *
 * Returning an object rather than mutating headers keeps the call sites honest: every
 * fetch spreads this in, so a request that forgets it is visible in review.
 */
export function authHeaders(): Record<string, string> {
  const token = isNativeApp() ? getToken() : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Start sign-in for the native app. Opens the system browser, not the WebView. */
export async function startNativeSignIn(provider: "apple" | "google"): Promise<void> {
  const base = import.meta.env.VITE_API_URL || "";
  await Browser.open({ url: `${base}/auth/${provider}?native=1` });
}

/**
 * Listen for mylifos://auth?token=… and store the token.
 *
 * Registered once at startup. Returns a cleanup function, though in practice the app
 * lives as long as the listener does.
 */
export function registerAuthDeepLink(onAuthenticated?: () => void): () => void {
  if (!isNativeApp()) return () => {};

  const handle = App.addListener("appUrlOpen", async ({ url }) => {
    try {
      // mylifos://auth?token=… — URL can't parse a custom scheme reliably across
      // platforms, so read the query string directly.
      if (!url.startsWith("mylifos://auth")) return;

      // Strip the fragment first. iOS hands the URL over with a bare "#" appended —
      // the server never sends one — and URLSearchParams does not treat "#" as a
      // delimiter, so it ends up inside the token value. The signature then fails to
      // verify, /api/me returns 401, and the app drops straight back to the login
      // screen looking exactly like the sign-in itself failed.
      const withoutFragment = url.split("#")[0];
      const query = withoutFragment.includes("?") ? withoutFragment.slice(withoutFragment.indexOf("?") + 1) : "";
      const token = new URLSearchParams(query).get("token");
      if (!token) return;

      setToken(token);
      // Close the system browser the OAuth flow opened, otherwise the user comes
      // back to the app with a browser sheet still covering it.
      await Browser.close().catch(() => {});
      onAuthenticated?.();
    } catch { /* a malformed deep link should never crash the app */ }
  });

  return () => { handle.then((h) => h.remove()).catch(() => {}); };
}
