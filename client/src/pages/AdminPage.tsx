import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "wouter";
import {
  Users, Activity, Database, ShieldAlert, TrendingUp, Search,
  ChevronRight, Loader2, CheckCircle2, Circle, Smartphone, KeyRound, Calendar,
  Trash2, AlertTriangle, X,
} from "lucide-react";

type AdminUser = {
  id: number; email: string; name: string; avatarUrl: string | null;
  createdAt: string | null; onboarded: boolean;
  hasApiKey: boolean; hasGoogleCal: boolean; devices: number;
  lastSeen: string | null; lastActive: string | null; activityEvents: number; friends: number;
  totalItems: number; moduleCount: number;
  topModules: { table: string; count: number }[];
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function relativeDays(iso: string | null): { label: string; tone: string } {
  if (!iso) return { label: "never", tone: "text-muted-foreground" };
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { label: "—", tone: "text-muted-foreground" };
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return { label: "today", tone: "text-emerald-500" };
  if (days === 1) return { label: "yesterday", tone: "text-emerald-500" };
  if (days <= 7) return { label: `${days}d ago`, tone: "text-emerald-500" };
  if (days <= 30) return { label: `${days}d ago`, tone: "text-amber-500" };
  return { label: `${days}d ago`, tone: "text-muted-foreground" };
}

const prettyTable = (t: string) =>
  t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** apiRequest throws `Error("409: {json}")` — pull out the human-readable bit. */
function errText(e: unknown): string {
  const raw = (e as Error)?.message ?? "Something went wrong.";
  const body = raw.replace(/^\d{3}:\s*/, "");
  try {
    const parsed = JSON.parse(body);
    if (parsed?.error) return parsed.error;
  } catch { /* not JSON */ }
  return body;
}

/**
 * Permanent account deletion. Deliberately high-friction: shows exactly how many
 * rows will be destroyed and requires the operator to type the user's email.
 */
function DeleteUserDialog({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const [typed, setTyped] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const footprint = useQuery<{ totalRows: number; tables: { table: string; count: number }[] }>({
    queryKey: ["/api/admin/users", user.id, "footprint"],
    queryFn: () => apiRequest("GET", `/api/admin/users/${user.id}/footprint`).then((r) => r.json()),
    retry: false,
  });

  const del = useMutation({
    mutationFn: () =>
      apiRequest("DELETE", `/api/admin/users/${user.id}`, { confirmEmail: user.email }).then((r) => r.json()),
    onSuccess: (data: any) => {
      toast({
        title: "Account deleted",
        description: `${data.deletedUser?.email} and ${data.totalRows?.toLocaleString()} rows of their data were permanently removed.`,
      });
      qc.invalidateQueries({ queryKey: ["/api/admin/users"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/overview"] });
      onClose();
    },
    onError: (e) =>
      toast({ title: "Couldn't delete account", description: errText(e), variant: "destructive" }),
  });

  const confirmed = typed.trim().toLowerCase() === user.email.trim().toLowerCase();

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={() => !del.isPending && onClose()} />
      <div
        role="alertdialog"
        aria-modal="true"
        className="relative w-full max-w-md rounded-2xl border bg-card shadow-xl p-5 space-y-4"
      >
        <button
          onClick={() => !del.isPending && onClose()}
          className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        <div className="flex gap-3">
          <div className="w-9 h-9 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
            <AlertTriangle size={17} className="text-destructive" />
          </div>
          <div>
            <h2 className="font-bold leading-tight">Delete this account?</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              <span className="font-medium text-foreground">{user.name}</span> · {user.email}
            </p>
          </div>
        </div>

        <div className="rounded-xl border bg-secondary/30 p-3">
          {footprint.isLoading ? (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Loader2 size={12} className="animate-spin" /> Counting their data…
            </p>
          ) : footprint.data ? (
            <>
              <p className="text-sm">
                <span className="font-bold">{footprint.data.totalRows.toLocaleString()}</span> rows across{" "}
                <span className="font-bold">{footprint.data.tables.length}</span> tables will be permanently erased.
              </p>
              {footprint.data.tables.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2 max-h-24 overflow-y-auto">
                  {footprint.data.tables.slice(0, 12).map((t) => (
                    <span key={t.table} className="text-[10px] px-1.5 py-0.5 rounded bg-card border">
                      {prettyTable(t.table)} <span className="font-semibold">{t.count}</span>
                    </span>
                  ))}
                  {footprint.data.tables.length > 12 && (
                    <span className="text-[10px] px-1.5 py-0.5 text-muted-foreground">
                      +{footprint.data.tables.length - 12} more
                    </span>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-destructive">{errText(footprint.error)}</p>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          This cannot be undone. There is no soft-delete and no backup restore from this page.
          Their goals, recipes, tasks, messages, and friendships all go with them.
        </p>

        <div>
          <label className="text-xs font-medium">
            Type <span className="font-mono text-foreground">{user.email}</span> to confirm
          </label>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder={user.email}
            className="mt-1 w-full px-3 py-2 rounded-lg border bg-background text-sm outline-none focus:ring-2 focus:ring-destructive/40"
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            disabled={del.isPending}
            className="px-3 py-2 rounded-lg border text-sm hover:bg-secondary disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => del.mutate()}
            disabled={!confirmed || del.isPending}
            className="px-3 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {del.isPending ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            {del.isPending ? "Deleting…" : "Delete permanently"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AdminUser | null>(null);
  const { user: me } = useAuth();

  const overview = useQuery<any>({
    queryKey: ["/api/admin/overview"],
    queryFn: () => apiRequest("GET", "/api/admin/overview").then((r) => r.json()),
    retry: false,
  });
  const usersQ = useQuery<{ users: AdminUser[]; tablesScanned: number }>({
    queryKey: ["/api/admin/users"],
    queryFn: () => apiRequest("GET", "/api/admin/users").then((r) => r.json()),
    retry: false,
  });

  const forbidden =
    (overview.error as any)?.message?.includes("403") ||
    (usersQ.error as any)?.message?.includes("403");

  if (forbidden) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <ShieldAlert size={40} className="mx-auto mb-4 text-muted-foreground opacity-40" />
        <h1 className="text-xl font-bold">Admin only</h1>
        <p className="text-sm text-muted-foreground mt-2">
          This page is restricted to app owners.
        </p>
        <Link href="/dashboard">
          <a className="mt-6 inline-block text-sm text-primary hover:underline">Back to Today →</a>
        </Link>
      </div>
    );
  }

  const users = usersQ.data?.users ?? [];
  const filtered = query.trim()
    ? users.filter((u) =>
        `${u.name} ${u.email}`.toLowerCase().includes(query.trim().toLowerCase()))
    : users;

  const o = overview.data;
  const stats = [
    { label: "Total users", value: o?.users?.total ?? "—", sub: o ? `${o.users.new7} new this week` : "", icon: <Users size={15} className="text-violet-500" /> },
    { label: "Onboarded", value: o?.users?.onboarded ?? "—", sub: o?.users?.total ? `${Math.round((o.users.onboarded / o.users.total) * 100)}% of users` : "", icon: <CheckCircle2 size={15} className="text-emerald-500" /> },
    { label: "Active (7d)", value: o?.activeUsers?.d7 ?? "—", sub: o?.activeUsers ? `${o.activeUsers.d1 ?? "—"} today · ${o.activeUsers.d30 ?? "—"} in 30d` : "", icon: <Activity size={15} className="text-amber-500" /> },
    { label: "Content items", value: o?.totalItems?.toLocaleString() ?? "—", sub: o ? `across ${o.tablesScanned} tables` : "", icon: <Database size={15} className="text-sky-500" /> },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div>
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Owner only</p>
        <h1 className="text-2xl font-bold leading-tight">Admin</h1>
        <p className="text-sm text-muted-foreground mt-1">Users, adoption, and usage across the app.</p>
      </div>

      {/* ── Top-line stats ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{s.icon}{s.label}</div>
            <p className="text-2xl font-bold mt-1">{overview.isLoading ? "…" : s.value}</p>
            {s.sub && <p className="text-[11px] text-muted-foreground mt-0.5">{s.sub}</p>}
          </div>
        ))}
      </div>

      {/* ── Most-used modules ──────────────────────────────────────────── */}
      {o?.topTables?.length > 0 && (
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm font-semibold flex items-center gap-1.5 mb-3">
            <TrendingUp size={14} className="text-primary" /> Most-used modules
          </p>
          <div className="space-y-1.5">
            {o.topTables.map((t: any) => {
              const pct = Math.round((t.count / o.topTables[0].count) * 100);
              return (
                <div key={t.table} className="flex items-center gap-3">
                  <span className="text-xs w-40 shrink-0 truncate">{prettyTable(t.table)}</span>
                  <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs tabular-nums text-muted-foreground w-14 text-right">
                    {t.count.toLocaleString()}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Users ──────────────────────────────────────────────────────── */}
      <div className="rounded-xl border bg-card">
        <div className="flex items-center justify-between gap-3 p-4 border-b">
          <p className="text-sm font-semibold">
            Users {users.length > 0 && <span className="text-muted-foreground font-normal">({filtered.length})</span>}
          </p>
          <div className="relative w-56">
            <Search size={13} className="absolute left-2.5 top-2.5 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or email…"
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border bg-background text-xs outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        </div>

        {usersQ.isLoading && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <Loader2 size={18} className="animate-spin mx-auto mb-2" /> Loading users…
          </div>
        )}

        {!usersQ.isLoading && filtered.length === 0 && (
          <p className="p-8 text-center text-sm text-muted-foreground">No users match “{query}”.</p>
        )}

        <div className="divide-y">
          {filtered.map((u) => {
            const seen = relativeDays(u.lastSeen ?? u.lastActive);
            const open = expanded === u.id;
            return (
              <div key={u.id}>
                <button
                  onClick={() => setExpanded(open ? null : u.id)}
                  className="w-full flex items-center gap-3 p-3 hover:bg-secondary/40 transition-colors text-left"
                >
                  {u.avatarUrl
                    ? <img src={u.avatarUrl} alt="" className="w-8 h-8 rounded-full shrink-0" />
                    : <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-xs font-bold shrink-0">
                        {u.name?.charAt(0)?.toUpperCase() ?? "?"}
                      </div>}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium truncate">{u.name}</p>
                      {u.onboarded
                        ? <CheckCircle2 size={11} className="text-emerald-500 shrink-0" />
                        : <Circle size={11} className="text-muted-foreground/50 shrink-0" />}
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">{u.email}</p>
                  </div>
                  <div className="hidden sm:block text-right shrink-0 w-24">
                    <p className="text-sm font-semibold tabular-nums">{u.totalItems.toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground">items</p>
                  </div>
                  <div className="text-right shrink-0 w-24">
                    <p className={`text-xs font-medium ${seen.tone}`}>{seen.label}</p>
                    <p className="text-[10px] text-muted-foreground">joined {fmtDate(u.createdAt)}</p>
                  </div>
                  <ChevronRight size={14} className={`text-muted-foreground shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
                </button>

                {open && (
                  <div className="px-4 pb-4 pt-1 bg-secondary/20 space-y-3">
                    <div className="flex flex-wrap gap-2 text-[11px]">
                      <span className="px-2 py-0.5 rounded-full bg-secondary">{u.moduleCount} modules used</span>
                      <span className="px-2 py-0.5 rounded-full bg-secondary">{u.activityEvents} activity events</span>
                      <span className="px-2 py-0.5 rounded-full bg-secondary">
                        last session {u.lastSeen ? relativeDays(u.lastSeen).label : "not yet tracked"}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-secondary">{u.friends} friends</span>
                      {u.devices > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-secondary flex items-center gap-1">
                          <Smartphone size={10} />{u.devices} device{u.devices === 1 ? "" : "s"}
                        </span>
                      )}
                      {u.hasApiKey && (
                        <span className="px-2 py-0.5 rounded-full bg-secondary flex items-center gap-1">
                          <KeyRound size={10} /> AI key
                        </span>
                      )}
                      {u.hasGoogleCal && (
                        <span className="px-2 py-0.5 rounded-full bg-secondary flex items-center gap-1">
                          <Calendar size={10} /> Google Cal
                        </span>
                      )}
                    </div>
                    {u.topModules.length > 0 ? (
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Top modules</p>
                        <div className="flex flex-wrap gap-1.5">
                          {u.topModules.map((m) => (
                            <span key={m.table} className="text-[11px] px-2 py-1 rounded-lg bg-card border">
                              {prettyTable(m.table)} <span className="font-semibold">{m.count}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">No content created yet.</p>
                    )}

                    <div className="pt-2 border-t flex items-center justify-between gap-3">
                      <p className="text-[11px] text-muted-foreground">
                        {u.id === me?.id
                          ? "This is your own account."
                          : "Deleting removes this person and all of their data permanently."}
                      </p>
                      <button
                        onClick={() => setPendingDelete(u)}
                        disabled={u.id === me?.id}
                        className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-destructive/30 text-destructive text-xs font-medium hover:bg-destructive/10 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                      >
                        <Trash2 size={12} /> Delete account
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Aggregate counts only — no one's personal content is shown here.
        “Active” counts real sessions (tracked from this release onward), falling back to
        content activity for users not yet seen since.
      </p>

      {pendingDelete && (
        <DeleteUserDialog user={pendingDelete} onClose={() => setPendingDelete(null)} />
      )}
    </div>
  );
}
