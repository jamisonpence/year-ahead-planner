import { clearToken } from "./nativeAuth";

/**
 * End the session on the server and on the device.
 *
 * Shared because there are two entry points — the MyLifos sheet footer and Settings — and
 * the interesting part is easy to leave out of one of them. On the web the session cookie
 * is the credential, so POSTing to /api/logout is sufficient. In the native app the bearer
 * token is stateless and lives in localStorage: destroying the server session does nothing
 * to it, and the reload afterwards would simply re-authenticate with the same token. That
 * bug shipped once already.
 *
 * Callers are responsible for clearing the query cache and navigating, since what counts
 * as "afterwards" differs between a sheet and a settings page.
 */
export async function signOut(): Promise<void> {
  try {
    // Send while the token is still present, or the request is unauthenticated and the
    // server-side session outlives the client's.
    await fetch("/api/logout", { method: "POST" });
  } finally {
    // Unconditional: a failed request must not leave a usable credential on the device.
    clearToken();
  }
}
