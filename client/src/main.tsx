import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

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

createRoot(document.getElementById("root")!).render(<App />);
