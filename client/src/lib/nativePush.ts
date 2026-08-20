/**
 * Native push registration (iOS).
 *
 * The web app uses Web Push via lib/push.ts. WKWebView does not implement it, so inside the
 * Capacitor app that path is inert and every notification the daily loop sends — the
 * evening close-out, habit reminders, friend activity — simply never arrives. This
 * registers an APNs device token instead and hands it to the server.
 *
 * Nothing here runs on the web: every entry point returns early when isNativeApp() is
 * false, so the browser keeps using Web Push untouched.
 */
import { PushNotifications, type Token } from "@capacitor/push-notifications";
import { isNativeApp, authHeaders } from "./nativeAuth";
import { API_BASE } from "./queryClient";

/**
 * Which APNs environment this build's tokens belong to — a hint, not a fact.
 *
 * What actually decides it is the *code-signing profile*: a development-signed build gets a
 * sandbox token, TestFlight and App Store builds get production ones. The web bundle cannot
 * see the signing profile at all.
 *
 * `import.meta.env.DEV` looked like the answer and is wrong: it reports the Vite build
 * mode, and `npm run build:ios` produces a production Vite bundle that is normally
 * development-signed. Using it would have labelled every local build "production", sent its
 * sandbox token to the production host, and had the row deleted on BadDeviceToken — push
 * silently never working, with nothing in the logs pointing here.
 *
 * So: VITE_APNS_ENV when set, otherwise sandbox, because the un-set case is a developer
 * building locally. The server treats this as a starting guess and corrects itself if APNs
 * disagrees, which is what makes a wrong answer here recoverable rather than fatal.
 */
function environment(): "sandbox" | "production" {
  const declared = import.meta.env.VITE_APNS_ENV;
  return declared === "production" ? "production" : "sandbox";
}

async function postJson(path: string, body: unknown): Promise<number> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    credentials: "include",
    body: JSON.stringify(body),
  });
  return res.status;
}

/**
 * What happened the last time this device tried to register.
 *
 * Registration is asynchronous and, on a device, invisible: TestFlight has no console, so
 * "did Apple give us a token, and did the server accept it" was unanswerable from the app.
 * Every branch below writes here so Settings can show the answer.
 */
export type PushDiagnostics = {
  supported: boolean;
  permission: "unknown" | "granted" | "denied" | "prompt";
  /** Apple returned a token. Null while pending, false if registration errored. */
  tokenReceived: boolean | null;
  tokenTail?: string;
  environment?: "sandbox" | "production";
  /** HTTP status from our own register endpoint, so a 401 is distinguishable from a 500. */
  serverStatus?: number;
  lastError?: string;
  at?: string;
};

let diagnostics: PushDiagnostics = {
  supported: false,
  permission: "unknown",
  tokenReceived: null,
};

const listeners = new Set<(d: PushDiagnostics) => void>();

function update(patch: Partial<PushDiagnostics>) {
  diagnostics = { ...diagnostics, ...patch, at: new Date().toISOString() };
  listeners.forEach(fn => fn(diagnostics));
}

export function getPushDiagnostics(): PushDiagnostics {
  return diagnostics;
}

/** Subscribe to diagnostics changes. The token arrives well after the UI first renders. */
export function onPushDiagnostics(fn: (d: PushDiagnostics) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let registered = false;

/**
 * Ask for permission, register with APNs, and send the token to the server.
 *
 * Safe to call more than once — iOS returns the existing token without re-prompting, but
 * the listener would be attached twice, so it guards.
 *
 * Deliberately *not* called at startup. iOS only lets you ask for notification permission
 * once, and a prompt on first launch, before the user has seen anything, is the reliable
 * way to get denied for good. The caller decides when it has earned the ask.
 */
export async function enableNativePush(): Promise<{ ok: boolean; reason?: string }> {
  if (!isNativeApp()) return { ok: false, reason: "not-native" };
  update({ supported: true });

  try {
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
      perm = await PushNotifications.requestPermissions();
    }
    update({ permission: perm.receive === "granted" ? "granted" : perm.receive === "denied" ? "denied" : "prompt" });
    if (perm.receive !== "granted") {
      // Denied is sticky: iOS will not prompt again, the user has to go to Settings.
      return { ok: false, reason: "denied" };
    }

    if (!registered) {
      registered = true;

      // Every addListener call is awaited before register() below.
      //
      // These return Promises: the JS call is queued over the bridge and the native side
      // attaches the handler when it arrives. register() dispatched before that attachment
      // completes means APNs can deliver the token to a listener that does not exist yet,
      // and the event is simply lost — no token, no error, nothing. Which is exactly the
      // silence this produced on a Mac that turned out to be perfectly capable of push.
      const handles = [
      PushNotifications.addListener("registration", async (token: Token) => {
        const env = environment();
        console.log(`[push] APNs token registered (${env})`);
        update({ tokenReceived: true, tokenTail: token.value.slice(-6), environment: env });
        try {
          // The server's answer matters as much as Apple's: a token Apple issued but our
          // API rejected (expired session, 500) looks identical from the device otherwise.
          const status = await postJson("/api/push/apns/register", { token: token.value, environment: env });
          update({ serverStatus: status, lastError: status === 200 ? undefined : `register returned ${status}` });
        } catch (e) {
          update({ lastError: `register request failed: ${String(e)}` });
        }
      }),

      PushNotifications.addListener("registrationError", (err) => {
        // Almost always one of: Push Notifications capability missing from the target, the
        // App ID not entitled for push, or a provisioning profile predating either.
        console.error("[push] APNs registration failed:", err);
        update({ tokenReceived: false, lastError: String((err as any)?.error ?? err) });
      }),

      PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
        // The server puts the destination in `href` alongside the aps payload.
        const href = (action.notification.data as Record<string, unknown> | undefined)?.href;
        if (typeof href === "string" && href.startsWith("/")) {
          window.location.hash = href;
        }
      }),
      ];
      await Promise.all(handles);
    }

    await PushNotifications.register();

    // If neither callback has fired by now, something is wrong that produces no error of
    // its own. Say so, rather than leaving the diagnostics panel on "waiting…" forever and
    // making the caller guess whether it is slow or broken.
    setTimeout(() => {
      if (diagnostics.tokenReceived === null) {
        update({ lastError: "No token from Apple after 15s — registration returned nothing and raised no error." });
      }
    }, 15_000);

    return { ok: true };
  } catch (e) {
    console.error("[push] enableNativePush failed:", e);
    return { ok: false, reason: "error" };
  }
}

/** Stop delivery to this device. The OS-level permission is unaffected. */
export async function disableNativePush(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const delivered = await PushNotifications.getDeliveredNotifications();
    if (delivered.notifications.length) {
      await PushNotifications.removeAllDeliveredNotifications();
    }
  } catch { /* clearing the tray is best-effort */ }
}

/** True when this build can use native push at all — lets Settings show the right control. */
export function nativePushSupported(): boolean {
  return isNativeApp();
}

/** Ask the server to push to this account's devices, and report Apple's verdict. */
export async function sendTestPush(): Promise<{ sent: number; results: unknown[] } | { error: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/push/apns/test`, {
      method: "POST",
      headers: { ...authHeaders() },
      credentials: "include",
    });
    if (!res.ok) return { error: `server returned ${res.status}` };
    return await res.json();
  } catch (e) {
    return { error: String(e) };
  }
}

/** What the server currently knows about this account's registered devices. */
export async function fetchPushStatus(): Promise<any | null> {
  try {
    const res = await fetch(`${API_BASE}/api/push/apns/status`, {
      headers: { ...authHeaders() },
      credentials: "include",
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}
