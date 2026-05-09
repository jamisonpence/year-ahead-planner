import { useState, useEffect } from "react";
import { X, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showFallback, setShowFallback] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Don't show if already dismissed this session
    if (sessionStorage.getItem("pwa-install-dismissed")) return;

    const isInStandalone = window.matchMedia("(display-mode: standalone)").matches
      || (navigator as any).standalone === true;
    if (isInStandalone) return; // Already installed as PWA

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as any).MSStream;
    const android = /android/i.test(navigator.userAgent);

    if (ios) {
      setIsIOS(true);
      setTimeout(() => setShowBanner(true), 3000);
      return;
    }

    if (android) {
      // Show banner regardless — Chrome may have already fired (and we caught it in main.tsx),
      // or may fire later, or may not fire at all (suppressed). We handle all cases.
      setTimeout(() => setShowBanner(true), 3000);
    }

    // Pick up prompt if already captured before React mounted
    if ((window as any).__pwaInstallPrompt) {
      setDeferredPrompt((window as any).__pwaInstallPrompt);
    }

    // Also listen for it firing later
    const handler = () => {
      if ((window as any).__pwaInstallPrompt) {
        setDeferredPrompt((window as any).__pwaInstallPrompt);
      }
    };
    window.addEventListener("pwaInstallReady", handler);
    return () => window.removeEventListener("pwaInstallReady", handler);
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      // Native install prompt available — use it
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") setShowBanner(false);
      setDeferredPrompt(null);
    } else {
      // Prompt not available — show manual instructions
      setShowFallback(true);
    }
  };

  const handleDismiss = () => {
    setShowBanner(false);
    setDismissed(true);
    sessionStorage.setItem("pwa-install-dismissed", "1");
  };

  if (!showBanner || dismissed) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100vw-2rem)] max-w-sm animate-in slide-in-from-bottom-4 duration-300">
      <div className="rounded-2xl border border-border bg-card shadow-lg shadow-black/10 dark:shadow-black/30 p-4">
        <div className="flex items-start gap-3">
          {/* App icon */}
          <img
            src="/icons/icon-192x192.png"
            alt="Year Ahead"
            className="w-12 h-12 rounded-xl shrink-0"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-tight">Add to Home Screen</p>
            {isIOS ? (
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                Tap <strong>Share</strong> then <strong>"Add to Home Screen"</strong> to install Year Ahead.
              </p>
            ) : showFallback ? (
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                Tap the <strong>⋮ menu</strong> in Chrome, then tap <strong>"Add to Home Screen"</strong>.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                Install Year Ahead for quick access — works offline too.
              </p>
            )}
          </div>
          <button
            onClick={handleDismiss}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors -mt-0.5 -mr-0.5 p-1"
          >
            <X size={14} />
          </button>
        </div>
        {!isIOS && (
          <div className="flex gap-2 mt-3">
            <Button size="sm" className="flex-1 gap-1.5 h-8 text-xs" onClick={handleInstall}>
              <Download size={12} /> Install App
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground" onClick={handleDismiss}>
              Not now
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
