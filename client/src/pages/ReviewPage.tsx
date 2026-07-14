import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Sparkles, Dumbbell, BookOpen, Zap, Home, PenLine, AlertTriangle,
  Target, Calendar, RefreshCw, Check, Loader2, ArrowRight, CheckCircle2, Share2,
} from "lucide-react";
import { Link } from "wouter";

type ReviewData = {
  weekStart: string;
  stats: {
    workouts: number; readingSessions: number; pagesRead: number; booksFinished: number;
    choresDone: number; journalEntries: number;
    habitCompletions: number; habitPossible: number; habitRate: number | null;
    overdueNow: number;
  };
  goals: Array<{ id: number; title: string; description: string | null; progressPct: number; targetDate: string | null; priority: string }>;
  upcoming: {
    events: Array<{ id: number; title: string; date: string; time: string | null }>;
    tasks: Array<{ id: number; title: string; dueDate: string | null; priority: string; overdue: boolean }>;
  };
  completedItems: Array<{ type: string; id: number; title: string; context: string; dueDate: string | null }>;
  nextActions: Array<{
    id: number;
    title: string;
    dueDate: string | null;
    priority: string;
    projectId: number;
    projectTitle: string;
    goalId: number | null;
    goalTitle: string | null;
    goalDescription: string | null;
    progressPct: number;
  }>;
  suggestedFocus: string;
  review: { wins: string | null; challenges: string | null; focus: string | null } | null;
  aiPlan: { summary: string; suggestions: Suggestion[] } | null;
};

type Suggestion = { title: string; date: string; time: string | null; reason: string; source: string };

// ── Shareable week recap ──────────────────────────────────────────────────────
// Renders the week's numbers onto a canvas and shares (or downloads) it as an
// image — a ritual artifact worth posting, not a screenshot of a dashboard.
async function shareWeekRecap(weekStart: string, s: ReviewData["stats"]) {
  const W = 720, H = 900;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Background
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#17171f");
  bg.addColorStop(1, "#0f0f15");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Header
  ctx.fillStyle = "#a78bfa";
  ctx.font = "600 22px -apple-system, system-ui, sans-serif";
  ctx.fillText("MY WEEK · MYLIFOS", 56, 84);
  ctx.fillStyle = "#f4f4f5";
  ctx.font = "700 44px -apple-system, system-ui, sans-serif";
  ctx.fillText(`Week of ${weekStart}`, 56, 140);

  const rows: Array<{ emoji: string; label: string; value: string }> = [
    { emoji: "💪", label: "Workouts", value: String(s.workouts) },
    { emoji: "⚡", label: "Habit rate", value: s.habitRate !== null ? `${s.habitRate}%` : "—" },
    { emoji: "📖", label: "Pages read", value: String(s.pagesRead) + (s.booksFinished ? `  ·  ${s.booksFinished} book${s.booksFinished === 1 ? "" : "s"} finished` : "") },
    { emoji: "🏠", label: "Chores done", value: String(s.choresDone) },
    { emoji: "✍️", label: "Journal entries", value: String(s.journalEntries) },
  ];
  let y = 220;
  for (const r of rows) {
    ctx.fillStyle = "#1f1f2a";
    roundRect(ctx, 56, y, W - 112, 100, 20);
    ctx.fill();
    ctx.font = "400 40px -apple-system, system-ui, sans-serif";
    ctx.fillText(r.emoji, 84, y + 62);
    ctx.fillStyle = "#a1a1aa";
    ctx.font = "600 20px -apple-system, system-ui, sans-serif";
    ctx.fillText(r.label.toUpperCase(), 152, y + 42);
    ctx.fillStyle = "#f4f4f5";
    ctx.font = "700 34px -apple-system, system-ui, sans-serif";
    ctx.fillText(r.value, 152, y + 80);
    y += 120;
  }

  ctx.fillStyle = "#71717a";
  ctx.font = "500 20px -apple-system, system-ui, sans-serif";
  ctx.fillText("mylifos.com — your personal life OS", 56, H - 48);

  const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b!), "image/png"));
  const file = new File([blob], `mylifos-week-${weekStart}.png`, { type: "image/png" });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: "My week in MyLifos" }); return; } catch { /* fall through to download */ }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `mylifos-week-${weekStart}.png`;
  a.click();
  URL.revokeObjectURL(url);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function nextSevenDays(): Array<{ iso: string; label: string }> {
  const out = [];
  for (let i = 1; i <= 7; i++) {
    const d = new Date(Date.now() + i * 86400_000);
    out.push({
      iso: d.toLocaleDateString("en-CA"),
      label: d.toLocaleDateString("en-US", { weekday: "short" }),
    });
  }
  return out;
}

export default function ReviewPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data } = useQuery<ReviewData>({
    queryKey: ["/api/review/weekly"],
    queryFn: () => apiRequest("GET", "/api/review/weekly").then((r) => r.json()),
  });

  // ── Reflection state ─────────────────────────────────────────────────────
  const [wins, setWins] = useState("");
  const [challenges, setChallenges] = useState("");
  const [focus, setFocus] = useState("");
  useEffect(() => {
    if (data?.review) {
      setWins(data.review.wins ?? "");
      setChallenges(data.review.challenges ?? "");
      setFocus(data.review.focus ?? "");
    } else if (data) {
      const generatedWins = data.completedItems.length > 0
        ? data.completedItems.slice(0, 3).map((item) => item.title).join(", ")
        : data.stats.habitCompletions > 0
          ? `${data.stats.habitCompletions} habit completion${data.stats.habitCompletions !== 1 ? "s" : ""}`
          : "";
      const generatedChallenges = data.stats.overdueNow > 0
        ? `${data.stats.overdueNow} overdue item${data.stats.overdueNow !== 1 ? "s" : ""} needs a new plan.`
        : "";
      setWins((current) => current || generatedWins);
      setChallenges((current) => current || generatedChallenges);
      setFocus((current) => current || data.suggestedFocus || "");
    }
  }, [data]);

  const saveMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/review", { wins, challenges, focus, stats: data?.stats }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/review/weekly"] });
      toast({ title: "Review saved ✅", description: "See you next Sunday." });
    },
    onError: () => toast({ title: "Couldn't save review", variant: "destructive" }),
  });

  // ── Task day-assignment (time-blocking lite) ─────────────────────────────
  const days = nextSevenDays();
  const scheduleMut = useMutation({
    mutationFn: ({ taskId, date, taskType = "general" }: { taskId: number; date: string; taskType?: "general" | "project" }) =>
      apiRequest("POST", "/api/schedule-task", { taskType, taskId, date }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/review/weekly"] });
      qc.invalidateQueries({ queryKey: ["/api/general-tasks"] });
      qc.invalidateQueries({ queryKey: ["/api/goals"] });
      qc.invalidateQueries({ queryKey: ["/api/projects/standalone"] });
      qc.invalidateQueries({ queryKey: ["/api/events"] });
      toast({ title: "Scheduled 📅" });
    },
  });

  // ── AI weekly plan ───────────────────────────────────────────────────────
  const [aiPlan, setAiPlan] = useState<{ summary: string; suggestions: Suggestion[] } | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Hydrate the week's saved plan so Review opens pre-planned
  useEffect(() => {
    if (data?.aiPlan && !aiPlan && !aiLoading) {
      setAiPlan(data.aiPlan);
      setSelected(new Set(data.aiPlan.suggestions.map((_, i) => i)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.aiPlan]);

  async function generatePlan() {
    setAiLoading(true); setAiError(null);
    try {
      const r = await apiRequest("POST", "/api/ai/plan-week", { focus });
      const json = await r.json();
      setAiPlan(json);
      setSelected(new Set(json.suggestions.map((_: unknown, i: number) => i)));
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      setAiError(msg.includes("402") || msg.includes("no_api_key")
        ? "Add your Anthropic API key in Settings → API Keys to use AI planning."
        : "Couldn't generate a plan. Try again.");
    } finally { setAiLoading(false); }
  }

  const acceptMut = useMutation({
    mutationFn: () => {
      const items = aiPlan!.suggestions.filter((_, i) => selected.has(i))
        .map((s) => ({ title: s.title, date: s.date, time: s.time }));
      return apiRequest("POST", "/api/ai/plan-week/accept", { items }).then((r) => r.json());
    },
    onSuccess: (d: { created: number }) => {
      toast({ title: `Added ${d.created} task${d.created === 1 ? "" : "s"} to your week 🎯` });
      setAiPlan(null);
      qc.invalidateQueries({ queryKey: ["/api/review/weekly"] });
      qc.invalidateQueries({ queryKey: ["/api/general-tasks"] });
      qc.invalidateQueries({ queryKey: ["/api/events"] });
    },
    onError: () => toast({ title: "Couldn't add tasks", variant: "destructive" }),
  });

  if (!data) {
    return <div className="min-h-[50vh] flex items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }

  const s = data.stats;
  const statCards = [
    { icon: <Dumbbell size={15} className="text-indigo-500" />, label: "Workouts", value: s.workouts },
    { icon: <Zap size={15} className="text-emerald-500" />, label: "Habit rate", value: s.habitRate !== null ? `${s.habitRate}%` : "—", sub: s.habitPossible ? `${s.habitCompletions}/${s.habitPossible}` : undefined },
    { icon: <BookOpen size={15} className="text-amber-500" />, label: "Pages read", value: s.pagesRead, sub: s.booksFinished ? `${s.booksFinished} finished 🎉` : undefined },
    { icon: <Home size={15} className="text-sky-500" />, label: "Chores done", value: s.choresDone },
    { icon: <PenLine size={15} className="text-violet-500" />, label: "Journal entries", value: s.journalEntries },
    { icon: <AlertTriangle size={15} className={s.overdueNow ? "text-red-500" : "text-muted-foreground"} />, label: "Overdue now", value: s.overdueNow },
  ];

  const unscheduled = data.upcoming.tasks.filter((t) => t.overdue);
  const topNextAction = data.nextActions[0];

  return (
    <div className="p-3 sm:p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Week of {data.weekStart}</p>
        <h1 className="text-2xl font-bold leading-tight">🪞 Weekly Review</h1>
        <p className="text-sm text-muted-foreground mt-1">Ten minutes to close out this week and set up the next one.</p>
      </div>

      {/* 1 ── The week in numbers */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">1 · Your week in numbers</h2>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => shareWeekRecap(data.weekStart, s)}>
            <Share2 size={11} /> Share recap
          </Button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {statCards.map((c) => (
            <div key={c.label} className="rounded-xl border bg-card p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{c.icon}{c.label}</div>
              <p className="text-xl font-bold mt-1">{c.value}</p>
              {c.sub && <p className="text-[11px] text-muted-foreground">{c.sub}</p>}
            </div>
          ))}
        </div>
        {data.goals.length > 0 && (
          <div className="rounded-xl border bg-card p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Target size={13} /> Goal progress</div>
            {data.goals.slice(0, 5).map((g) => (
              <div key={g.id}>
                <div className="flex justify-between text-xs mb-0.5">
                  <span className="truncate">{g.title}</span>
                  <span className="text-muted-foreground shrink-0 ml-2">{g.progressPct}%{g.targetDate ? ` · by ${g.targetDate}` : ""}</span>
                </div>
                <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div className="h-full bg-violet-500 rounded-full" style={{ width: `${g.progressPct}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
        {(data.completedItems.length > 0 || topNextAction) && (
          <div className="rounded-xl border bg-card p-3 space-y-3">
            {data.completedItems.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2"><CheckCircle2 size={13} /> Wins pulled from your activity</div>
                <div className="space-y-1.5">
                  {data.completedItems.slice(0, 5).map((item) => (
                    <div key={`${item.type}-${item.id}`} className="flex items-start gap-2 rounded-lg bg-secondary/30 px-2.5 py-2">
                      <Check size={12} className="text-emerald-500 mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{item.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{item.context}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {topNextAction && (
              <div className="rounded-xl border border-violet-200/70 dark:border-violet-800/60 bg-violet-50/70 dark:bg-violet-950/20 p-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-600 dark:text-violet-300 uppercase tracking-wide mb-1">
                  <ArrowRight size={12} /> Suggested next action
                </div>
                <p className="text-sm font-semibold">{topNextAction.title}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {[topNextAction.goalTitle, topNextAction.projectTitle].filter(Boolean).join(" · ")}
                </p>
                {topNextAction.goalDescription && (
                  <p className="text-xs text-violet-700/80 dark:text-violet-200/80 mt-2 line-clamp-2">Why it matters: {topNextAction.goalDescription}</p>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* 2 ── Reflect */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">2 · Reflect</h2>
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div>
            <label className="text-xs font-medium">🏆 What went well?</label>
            <textarea value={wins} onChange={(e) => setWins(e.target.value)} rows={2}
              placeholder="Wins, big or small…"
              className="mt-1 w-full text-sm border rounded-lg bg-background p-2.5 focus:outline-none focus:ring-2 focus:ring-violet-400/30" />
          </div>
          <div>
            <label className="text-xs font-medium">🧗 What was hard?</label>
            <textarea value={challenges} onChange={(e) => setChallenges(e.target.value)} rows={2}
              placeholder="What got in the way?"
              className="mt-1 w-full text-sm border rounded-lg bg-background p-2.5 focus:outline-none focus:ring-2 focus:ring-violet-400/30" />
          </div>
          <div>
            <label className="text-xs font-medium">🎯 Top focus for next week</label>
            <textarea value={focus} onChange={(e) => setFocus(e.target.value)} rows={2}
              placeholder="One thing that would make next week a success…"
              className="mt-1 w-full text-sm border rounded-lg bg-background p-2.5 focus:outline-none focus:ring-2 focus:ring-violet-400/30" />
          </div>
          <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="gap-1.5">
            <Check size={13} /> Save review
          </Button>
        </div>
      </section>

      {/* 3 ── Plan next week */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">3 · Plan next week</h2>

        {/* Overdue tasks → quick day assignment */}
        {unscheduled.length > 0 && (
          <div className="rounded-xl border bg-card p-4 space-y-2">
            <p className="text-xs font-medium flex items-center gap-1.5">
              <AlertTriangle size={13} className="text-red-500" /> Overdue — pick a new day
            </p>
            {unscheduled.slice(0, 8).map((t) => (
              <div key={t.id} className="flex items-center gap-2 flex-wrap py-1.5 border-b last:border-0">
                <span className="text-sm flex-1 min-w-[140px] truncate">{t.title}</span>
                <div className="flex gap-1">
                  {days.map((d) => (
                    <button key={d.iso}
                      onClick={() => scheduleMut.mutate({ taskId: t.id, date: d.iso })}
                      className="text-[10px] font-medium px-1.5 py-1 rounded border hover:bg-violet-500 hover:text-white hover:border-violet-500 transition-colors">
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* What's already on deck */}
        {(data.upcoming.events.length > 0 || data.upcoming.tasks.some((t) => !t.overdue)) && (
          <div className="rounded-xl border bg-card p-4 space-y-1.5">
            <p className="text-xs font-medium flex items-center gap-1.5"><Calendar size={13} className="text-violet-500" /> Already on deck</p>
            {data.upcoming.events.slice(0, 6).map((e) => (
              <p key={`e${e.id}`} className="text-sm text-muted-foreground">
                📅 {e.date}{e.time ? ` ${e.time}` : ""} — {e.title}
              </p>
            ))}
            {data.upcoming.tasks.filter((t) => !t.overdue).slice(0, 6).map((t) => (
              <p key={`t${t.id}`} className="text-sm text-muted-foreground">✅ {t.dueDate} — {t.title}</p>
            ))}
          </div>
        )}

        {/* AI planner */}
        {data.nextActions.length > 0 && (
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold flex items-center gap-1.5">
                <ArrowRight size={14} className="text-violet-500" /> Pick next week's action
              </p>
              <Link href="/tasks"><a className="text-xs text-muted-foreground hover:text-foreground">Manage actions</a></Link>
            </div>
            <div className="space-y-2">
              {data.nextActions.slice(0, 4).map((action) => (
                <div key={action.id} className="rounded-xl border bg-secondary/20 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{action.title}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {[action.goalTitle, action.projectTitle].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <span className="text-[10px] uppercase font-semibold text-muted-foreground shrink-0">{action.priority}</span>
                  </div>
                  <div className="flex gap-1 mt-2 overflow-x-auto pb-0.5">
                    {days.map((d) => (
                      <button key={d.iso}
                        onClick={() => scheduleMut.mutate({ taskId: action.id, date: d.iso, taskType: "project" })}
                        className="text-[10px] font-medium px-2 py-1 rounded border hover:bg-violet-500 hover:text-white hover:border-violet-500 transition-colors shrink-0">
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI planner */}
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold flex items-center gap-1.5">
              <Sparkles size={14} className="text-amber-500" /> AI weekly plan
            </p>
            <Button size="sm" variant={aiPlan ? "outline" : "default"} onClick={generatePlan} disabled={aiLoading} className="gap-1.5 h-7 text-xs">
              {aiLoading ? <><Loader2 size={11} className="animate-spin" /> Planning…</>
                : aiPlan ? <><RefreshCw size={11} /> Regenerate</>
                : <><Sparkles size={11} /> Plan my week</>}
            </Button>
          </div>
          {aiError && <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">{aiError}</p>}
          {!aiPlan && !aiLoading && !aiError && (
            <p className="text-xs text-muted-foreground">
              AI turns your goals, open tasks, and calendar into a concrete week of scheduled tasks.
              Uses your focus above as the guiding priority.
            </p>
          )}
          {aiPlan && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{aiPlan.summary}</p>
              {aiPlan.suggestions.map((sg, i) => (
                <label key={i} className="flex items-start gap-2.5 p-2 rounded-lg border cursor-pointer hover:bg-secondary/40 transition-colors">
                  <input type="checkbox" checked={selected.has(i)}
                    onChange={() => setSelected((prev) => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; })}
                    className="mt-0.5 accent-violet-500" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm">{sg.title}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {sg.date}{sg.time ? ` · ${sg.time}` : ""} — {sg.reason}
                    </span>
                  </span>
                </label>
              ))}
              <Button size="sm" onClick={() => acceptMut.mutate()} disabled={acceptMut.isPending || selected.size === 0} className="gap-1.5">
                <Check size={13} /> Add {selected.size} to my week
              </Button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
