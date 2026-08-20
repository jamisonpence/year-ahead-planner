/**
 * Native app fetch shim.
 *
 * The web app calls its own API with root-relative URLs — `fetch("/api/me")` — which
 * is correct in a browser, where the page and the API share an origin. Inside the
 * Capacitor app the page origin is capacitor://localhost, so the same call asks the
 * local bundle server for a file that does not exist. It never reaches mylifos.com.
 *
 * Worse than a 404: Capacitor's scheme handler has no response for an unknown path, so
 * the request sits unresolved rather than rejecting. A caller with `retry: false` waits
 * forever instead of showing an error, which is exactly how the app came to sit on its
 * loading screen — /api/me was pending, so `isLoading` never became false.
 *
 * `apiRequest` and `getQueryFn` in queryClient.ts already prepend API_BASE, but 68 call
 * sites across the pages call `fetch` directly and predate that. Rewriting them by hand
 * means 68 edits spread over files up to 12,000 lines, and a bulk find-replace over that
 * surface is precisely the kind of over-matching edit that has broken this app before.
 * One shim at startup fixes every one of them, including any added later.
 *
 * Web builds never install it — `isNativeApp()` is false, so `window.fetch` is untouched
 * and the website behaves exactly as before.
 */
import { isNativeApp, authHeaders } from "./nativeAuth";

/**
 * Only our own API paths are rewritten.
 *
 * Deliberately narrow. `/recipes.json` is a static file shipped inside the app bundle and
 * must keep resolving against capacitor://localhost, and the pages fetch third-party APIs
 * (bible-api.com, sefaria.org, quran.com, bolls.life) with absolute URLs that must be left
 * alone. Matching only these two prefixes leaves both untouched.
 */
const API_PATH = /^\/(api|auth)\//;

/** Exported for tests: given a fetch input, should it be pointed at the remote API? */
export function shouldRewrite(input: unknown): input is string {
  return typeof input === "string" && API_PATH.test(input);
}

let installed = false;

/**
 * Point relative API calls at `apiBase` and attach the bearer token.
 *
 * No-op on the web, and no-op if `apiBase` is empty — an empty base would rewrite
 * "/api/me" to itself, which is harmless but pointless, and silently hides a missing
 * VITE_API_URL at build time. Better to leave fetch alone and let the failure be visible.
 */
export function installNativeApiFetch(apiBase: string): void {
  if (installed || !isNativeApp() || !apiBase) return;
  installed = true;

  const original = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    // Request objects and absolute URLs pass through untouched. No call site uses a
    // Request, and a URL instance is always absolute, so neither can be one of ours.
    if (!shouldRewrite(input)) return original(input as RequestInfo, init);

    // Merge rather than replace: a call site that already set Content-Type keeps it.
    // Existing values win, so the shim can never clobber a deliberate header.
    const headers = new Headers(init?.headers);
    for (const [key, value] of Object.entries(authHeaders())) {
      if (!headers.has(key)) headers.set(key, value);
    }

    return original(`${apiBase}${input}`, {
      ...init,
      headers,
      credentials: init?.credentials ?? "include",
    });
  };
}
