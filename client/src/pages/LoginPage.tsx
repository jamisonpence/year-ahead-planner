import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";

export default function LoginPage() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isLoading && user) {
      navigate("/");
    }
  }, [user, isLoading, navigate]);

  const searchParams = new URLSearchParams(window.location.hash.split("?")[1] ?? "");
  const hasError = searchParams.get("error");

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm mx-auto p-8 flex flex-col items-center gap-6">
        {/* Logo / Title */}
        <div className="text-center space-y-2">
          <div className="text-5xl mb-2">📅</div>
          <h1 className="text-3xl font-bold tracking-tight">Year Ahead Planner</h1>
          <p className="text-muted-foreground text-sm">Sign in to access your planner</p>
        </div>

        {/* Error message */}
        {hasError && (
          <div className="w-full bg-destructive/10 text-destructive text-sm rounded-lg px-4 py-3 text-center">
            Sign-in failed. Please try again.
          </div>
        )}

        {/* Google sign-in button */}
        <a
          href="/auth/google"
          className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-lg border border-border bg-card hover:bg-accent transition-colors text-sm font-medium shadow-sm"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </a>

        <p className="text-xs text-muted-foreground text-center">
          Your personal planning space — sign in to get started
        </p>
      </div>
    </div>
  );
}
