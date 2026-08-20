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
 * Which APNs environment this build's tokens belong to.
 *
 * A build signed with a development profile — Xcode, the simulator — gets a sandbox token;
 * TestFlight and App Store builds get a production one. Presenting a token to the wrong
 * host fails with BadDeviceToken, and the two are indistinguishable by inspection, so the
 * client is the only place that knows. import.meta.env.DEV is true for `vite` dev builds
 * and false for the production bundle that `npm run build:ios` produces.
 *
 * This is the one value most likely to be wrong in a TestFlight build, so it is reported to
 * the console at registration rather than left silent.
 */
function environment(): "sandbox" | "production" {
  return import.meta.env.DEV ? "sandbox" : "production";
}

async function postJson(path: string, body: unknown): Promise<void> {
  await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    credentials: "include",
    body: JSON.stringify(body),
  });
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

  try {
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== "granted") {
      // Denied is sticky: iOS will not prompt again, the user has to go to Settings.
      return { ok: false, reason: "denied" };
    }

    if (!registered) {
      registered = true;

      PushNotifications.addListener("registration", (token: Token) => {
        const env = environment();
        console.log(`[push] APNs token registered (${env})`);
        void postJson("/api/push/apns/register", { token: token.value, environment: env });
      });

      PushNotifications.addListener("registrationError", (err) => {
        // Almost always one of: Push Notifications capability missing from the target, the
        // App ID not entitled for push, or a provisioning profile predating either.
        console.error("[push] APNs registration failed:", err);
      });

      PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
        // The server puts the destination in `href` alongside the aps payload.
        const href = (action.notification.data as Record<string, unknown> | undefined)?.href;
        if (typeof href === "string" && href.startsWith("/")) {
          window.location.hash = href;
        }
      });
    }

    await PushNotifications.register();
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
