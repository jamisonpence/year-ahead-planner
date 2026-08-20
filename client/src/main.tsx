import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { registerAuthDeepLink } from "./lib/nativeAuth";
import { installNativeApiFetch } from "./lib/nativeFetch";
import { API_BASE } from "./lib/queryClient";

// Native app only: send relative /api and /auth calls to the real server with the bearer
// token attached. Must run before React mounts, since components fetch on their first
// render. No-op in the browser.
installNativeApiFetch(API_BASE);

if (!window.location.hash) {
  window.location.hash = "#/";
}

// Capture beforeinstallprompt early — before React mounts.
// The event fires once and is easily missed if the listener is added later.
(window as any).__pwaInstallPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  (window as any).__pwaInstallPrompt = e;
  window.dispatchEvent(new Event("pwaInstallReady"));
});

// Native app only: catch mylifos://auth?token=… when the system browser hands control
// back after OAuth. Registered before React mounts, because the deep link can arrive
// while the app is still starting and the event does not replay.
registerAuthDeepLink(() => {
  // The token is stored by the time this runs; reload so every query refetches with
  // the Authorization header rather than leaving a half-signed-in UI.
  window.location.hash = "#/";
  window.location.reload();
});

createRoot(document.getElementById("root")!).render(<App />);
