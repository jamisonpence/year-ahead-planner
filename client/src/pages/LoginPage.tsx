import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { useQueryClient } from "@tanstack/react-query";

type Mode = "choose" | "login" | "register";

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

export default function LoginPage() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>("choose");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!isLoading && user) { navigate("/"); return null; }

  const searchParams = new URLSearchParams(window.location.hash.split("?")[1] ?? "");
  const hasError = searchParams.get("error");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const endpoint = mode === "register" ? "/auth/register" : "/auth/login";
      const body: any = { email, password };
      if (mode === "register") body.name = name;
      const res = await apiRequest("POST", endpoint, body);
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Something went wrong"); return; }
      await qc.invalidateQueries({ queryKey: ["/api/me"] });
      navigate("/");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm flex flex-col gap-6">
        {/* Logo — same mark as the app shell and landing page */}
        <div className="text-center space-y-1">
          <svg aria-label="MyLifos" viewBox="0 0 32 32" width="44" height="44" fill="none" className="mx-auto mb-2">
            <rect x="2" y="6" width="28" height="24" rx="4" stroke="currentColor" strokeWidth="2" />
            <path d="M2 12h28" stroke="currentColor" strokeWidth="2" />
            <rect x="8" y="2" width="2" height="6" rx="1" fill="currentColor" />
            <rect x="22" y="2" width="2" height="6" rx="1" fill="currentColor" />
            <circle cx="10" cy="21" r="2" fill="hsl(var(--cat-goal))" />
            <circle cx="16" cy="21" r="2" fill="hsl(25 85% 52%)" />
            <circle cx="22" cy="21" r="2" fill="hsl(210 80% 48%)" />
          </svg>
          <h1 className="text-3xl font-bold tracking-tight">MyLifos</h1>
          <p className="text-muted-foreground text-sm">Your personal life OS</p>
        </div>

        {/* Error banner */}
        {(hasError || error) && (
          <div className="bg-destructive/10 text-destructive text-sm rounded-lg px-4 py-3 text-center">
            {error || "Sign-in failed. Please try again."}
          </div>
        )}

        {/* ── Choose mode ─────────────────────────────────────── */}
        {mode === "choose" && (
          <div className="flex flex-col gap-3">
            {/* Google */}
            <a href="/auth/google"
              className="flex items-center justify-center gap-3 px-4 py-3 rounded-xl border border-border bg-card hover:bg-accent transition-colors text-sm font-medium shadow-sm">
              <GoogleIcon /> Continue with Google
            </a>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground">or</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            <button
              onClick={() => setMode("login")}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-border bg-card hover:bg-accent transition-colors text-sm font-medium">
              Sign in with email & password
            </button>

            <button
              onClick={() => setMode("register")}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium">
              Create an account
            </button>

            {/* Switch Google account */}
            <p className="text-center text-xs text-muted-foreground mt-1">
              Using the wrong Google account?{" "}
              <a href="/auth/google/switch" className="text-primary hover:underline">Switch account</a>
            </p>
          </div>
        )}

        {/* ── Sign in form ─────────────────────────────────────── */}
        {mode === "login" && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold text-center">Sign in</h2>
            <input
              type="email" required placeholder="Email"
              value={email} onChange={e => setEmail(e.target.value)}
              className="w-full border rounded-xl px-4 py-3 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <input
              type="password" required placeholder="Password"
              value={password} onChange={e => setPassword(e.target.value)}
              className="w-full border rounded-xl px-4 py-3 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button type="submit" disabled={submitting}
              className="w-full bg-primary text-primary-foreground py-3 rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60">
              {submitting ? "Signing in…" : "Sign in"}
            </button>
            <div className="flex flex-col gap-2 pt-1">
              <button type="button" onClick={() => { setMode("choose"); setError(""); }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors text-center">
                ← Other sign-in options
              </button>
              <p className="text-xs text-center text-muted-foreground">
                No account?{" "}
                <button type="button" onClick={() => { setMode("register"); setError(""); }} className="text-primary hover:underline">Create one</button>
              </p>
            </div>
          </form>
        )}

        {/* ── Register form ─────────────────────────────────────── */}
        {mode === "register" && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold text-center">Create account</h2>
            <input
              type="text" required placeholder="Your name"
              value={name} onChange={e => setName(e.target.value)}
              className="w-full border rounded-xl px-4 py-3 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <input
              type="email" required placeholder="Email"
              value={email} onChange={e => setEmail(e.target.value)}
              className="w-full border rounded-xl px-4 py-3 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <input
              type="password" required placeholder="Password (min 8 characters)"
              value={password} onChange={e => setPassword(e.target.value)}
              minLength={8}
              className="w-full border rounded-xl px-4 py-3 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button type="submit" disabled={submitting}
              className="w-full bg-primary text-primary-foreground py-3 rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60">
              {submitting ? "Creating account…" : "Create account"}
            </button>
            <div className="flex flex-col gap-2 pt-1">
              <button type="button" onClick={() => { setMode("choose"); setError(""); }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors text-center">
                ← Other sign-in options
              </button>
              <p className="text-xs text-center text-muted-foreground">
                Already have an account?{" "}
                <button type="button" onClick={() => { setMode("login"); setError(""); }} className="text-primary hover:underline">Sign in</button>
              </p>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
