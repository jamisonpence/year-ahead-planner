import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { KeyRound, Eye, EyeOff, Trash2, CheckCircle2, Loader2, Sparkles } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

type ApiKeyStatus = { hasKey: boolean; encryptionConfigured: boolean };

// ── Settings Page ─────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [inputKey, setInputKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [editing, setEditing] = useState(false);

  const { data: status, isLoading } = useQuery<ApiKeyStatus>({
    queryKey: ["/api/user/api-key/status"],
    queryFn: () => apiRequest("GET", "/api/user/api-key/status").then(r => r.json()),
  });

  const saveMut = useMutation({
    mutationFn: (apiKey: string) => apiRequest("PUT", "/api/user/api-key", { apiKey }),
    onSuccess: () => {
      toast({ title: "API key saved", description: "Your Anthropic API key is now active." });
      qc.invalidateQueries({ queryKey: ["/api/user/api-key/status"] });
      qc.invalidateQueries({ queryKey: ["/api/me"] });
      setInputKey("");
      setEditing(false);
    },
    onError: async (err: any) => {
      // apiRequest throws with the response text
      const msg = err?.message ?? "Failed to save key";
      // Try to extract the error detail
      const detail = msg.includes("validation failed") ? "Make sure you copied the full key." : msg;
      toast({ title: "Could not save API key", description: detail, variant: "destructive" });
    },
  });

  const removeMut = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/user/api-key"),
    onSuccess: () => {
      toast({ title: "API key removed" });
      qc.invalidateQueries({ queryKey: ["/api/user/api-key/status"] });
      qc.invalidateQueries({ queryKey: ["/api/me"] });
      setEditing(false);
    },
    onError: () => toast({ title: "Failed to remove key", variant: "destructive" }),
  });

  function handleSave() {
    if (!inputKey.trim()) return;
    saveMut.mutate(inputKey.trim());
  }

  const busy = saveMut.isPending || removeMut.isPending;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your account preferences and integrations.</p>
      </div>

      {/* Anthropic API Key */}
      <section className="rounded-xl border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound size={18} className="text-violet-500" />
          <h2 className="font-semibold text-base">Anthropic API Key</h2>
        </div>

        <div className="flex items-start gap-2 rounded-lg bg-violet-50 dark:bg-violet-950/20 border border-violet-100 dark:border-violet-900 p-3">
          <Sparkles size={15} className="text-violet-500 shrink-0 mt-0.5" />
          <p className="text-xs text-violet-800 dark:text-violet-300 leading-relaxed">
            Adding your Anthropic API key enables automatic plant care info, descriptions, and more when you add items.
            Claude runs on your key directly — <strong>your usage costs apply</strong>. The key is AES-256 encrypted before storage and never exposed to the browser.
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        ) : !status?.encryptionConfigured ? (
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3 text-sm text-amber-800 dark:text-amber-300">
            ⚠️ <strong>ENCRYPTION_KEY</strong> is not set on the server. Contact your admin or add it to Railway's environment variables before saving an API key.
          </div>
        ) : status?.hasKey && !editing ? (
          /* Key is saved — show masked display */
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
              <CheckCircle2 size={15} className="text-green-600 shrink-0" />
              <span className="text-sm font-mono tracking-widest text-muted-foreground flex-1">sk-ant-••••••••••••••••••••</span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                Update key
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-red-600 hover:bg-red-50 hover:text-red-700 border-red-200"
                onClick={() => removeMut.mutate()}
                disabled={busy}
              >
                {removeMut.isPending ? <Loader2 size={13} className="animate-spin mr-1.5" /> : <Trash2 size={13} className="mr-1.5" />}
                Remove
              </Button>
            </div>
          </div>
        ) : (
          /* No key or editing — show input */
          <div className="space-y-3">
            {editing && (
              <p className="text-xs text-muted-foreground">Saving a new key will replace the existing one.</p>
            )}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showKey ? "text" : "password"}
                  placeholder="sk-ant-api03-…"
                  value={inputKey}
                  onChange={e => setInputKey(e.target.value)}
                  className="pr-10 font-mono text-sm"
                  onKeyDown={e => e.key === "Enter" && handleSave()}
                />
                <button
                  type="button"
                  onClick={() => setShowKey(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <Button onClick={handleSave} disabled={!inputKey.trim() || busy} size="sm">
                {saveMut.isPending ? <Loader2 size={13} className="animate-spin mr-1.5" /> : null}
                {saveMut.isPending ? "Validating…" : "Save"}
              </Button>
              {editing && (
                <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setInputKey(""); }}>
                  Cancel
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Get your key at{" "}
              <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" className="underline hover:text-foreground">
                console.anthropic.com
              </a>. The key is validated before saving.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
