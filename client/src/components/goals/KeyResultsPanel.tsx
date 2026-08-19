/**
 * Key results for a goal that's been promoted to an objective.
 *
 * The distinction the UI has to carry: a simple goal owns one number and you
 * edit it directly. An objective owns nothing — its progress is the mean of its
 * key results, so its own progress fields go read-only and the roll-up is
 * displayed rather than typed. Flipping the toggle is therefore a real change
 * in how the goal behaves, which is why it says so in plain language instead of
 * being a bare switch.
 *
 * Lives in its own file because GoalsPage.tsx is already ~2,900 lines.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, TrendingUp, Activity } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient as qc } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { GoalKeyResult } from "@shared/schema";
import { keyResultProgress, objectiveProgressPct } from "@shared/goalMath";

/** A key result reads as a journey, not a percentage: "2 → 10 clients". */
function krRange(kr: GoalKeyResult): string {
  const unit = kr.unit?.trim() ? ` ${kr.unit.trim()}` : "";
  return `${kr.baseline} → ${kr.target}${unit}`;
}

export default function KeyResultsPanel({
  goalId,
  isObjective,
  onToggleObjective,
}: {
  goalId: number;
  isObjective: boolean;
  onToggleObjective: (next: boolean) => void;
}) {
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [unit, setUnit] = useState("");
  const [baseline, setBaseline] = useState("0");
  const [target, setTarget] = useState("100");
  const [kind, setKind] = useState<"leading" | "lagging">("lagging");

  // Only fetch once the goal actually is an objective — a simple goal has no
  // key results and shouldn't pay for a request.
  const { data: krs = [] } = useQuery<GoalKeyResult[]>({
    queryKey: [`/api/goals/${goalId}/key-results`],
    enabled: isObjective,
  });

  // The goals list carries its own copy of keyResults for the roll-up, so both
  // caches have to move together or the sidebar bar disagrees with this panel.
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: [`/api/goals/${goalId}/key-results`] });
    qc.invalidateQueries({ queryKey: ["/api/goals"] });
  };

  const createMut = useMutation({
    mutationFn: (d: any) => apiRequest("POST", `/api/goals/${goalId}/key-results`, d),
    onSuccess: () => {
      invalidate();
      setAdding(false); setTitle(""); setUnit(""); setBaseline("0"); setTarget("100"); setKind("lagging");
    },
    onError: () => toast({ title: "Couldn't add that key result", variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...d }: any) => apiRequest("PATCH", `/api/key-results/${id}`, d),
    onSuccess: invalidate,
    onError: () => toast({ title: "Couldn't save that change", variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/key-results/${id}`),
    onSuccess: invalidate,
  });

  if (!isObjective) {
    return (
      <div className="rounded-xl border bg-card p-4">
        <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <TrendingUp size={14} className="text-primary" /> Key results
        </p>
        <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
          Track this as an objective and its progress becomes the average of two
          to five measurable key results, instead of one number you update by hand.
        </p>
        <Button
          type="button" variant="outline" size="sm" className="mt-3"
          onClick={() => onToggleObjective(true)}
        >
          Use key results
        </Button>
      </div>
    );
  }

  const rollup = objectiveProgressPct(krs);

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <TrendingUp size={14} className="text-primary" /> Key results
        </p>
        <button
          type="button"
          onClick={() => onToggleObjective(false)}
          className="text-xs text-muted-foreground hover:text-foreground shrink-0"
        >
          Back to a simple goal
        </button>
      </div>

      <div>
        <div className="flex items-center gap-2">
          <Progress value={rollup} className="h-2 flex-1" />
          <span className="text-sm font-semibold shrink-0">{rollup}%</span>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1">
          {krs.length === 0
            ? "Add a key result to start measuring."
            : `Average of ${krs.length} key result${krs.length === 1 ? "" : "s"}.`}
        </p>
      </div>

      <div className="space-y-2">
        {krs.map((kr) => {
          const pct = Math.round(keyResultProgress(kr) * 100);
          return (
            <div key={kr.id} className="rounded-lg border bg-background/50 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground break-words">{kr.title}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
                    {kr.kind === "leading" ? <Activity size={10} /> : <TrendingUp size={10} />}
                    {kr.kind === "leading" ? "Leading" : "Lagging"} · {krRange(kr)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => deleteMut.mutate(kr.id)}
                  className="text-muted-foreground hover:text-destructive shrink-0"
                  aria-label={`Delete key result ${kr.title}`}
                >
                  <Trash2 size={13} />
                </button>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <Progress value={pct} className="h-1.5 flex-1" />
                <span className="text-xs font-semibold shrink-0 w-9 text-right">{pct}%</span>
                <Input
                  type="number"
                  defaultValue={kr.current}
                  // Commit on blur rather than per-keystroke: typing "12" would
                  // otherwise fire a save at "1" and briefly show the wrong roll-up.
                  onBlur={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!Number.isNaN(v) && v !== kr.current) updateMut.mutate({ id: kr.id, current: v });
                  }}
                  className="h-7 w-20 text-xs shrink-0"
                  aria-label={`Current value for ${kr.title}`}
                />
              </div>
            </div>
          );
        })}
      </div>

      {adding ? (
        <div className="rounded-lg border border-dashed p-3 space-y-2">
          <div className="space-y-1">
            <Label className="text-xs">What are you measuring?</Label>
            <Input
              value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Paying clients" className="h-8 text-sm" autoFocus
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Start</Label>
              <Input type="number" value={baseline} onChange={(e) => setBaseline(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Target</Label>
              <Input type="number" value={target} onChange={(e) => setTarget(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Unit</Label>
              <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="lbs" className="h-8 text-sm" />
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {(["lagging", "leading"] as const).map((k) => (
              <button
                key={k} type="button" onClick={() => setKind(k)}
                className={`px-2 py-1 rounded text-[11px] border transition-colors ${
                  kind === k ? "border-primary text-primary bg-primary/5" : "border-border text-muted-foreground"
                }`}
              >
                {k === "lagging" ? "Lagging (the outcome)" : "Leading (the effort)"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Button
              type="button" size="sm"
              disabled={!title.trim() || createMut.isPending}
              onClick={() => createMut.mutate({
                goalId,
                title: title.trim(),
                unit: unit.trim() || null,
                baseline: parseFloat(baseline) || 0,
                // Progress is measured from the baseline, so a new key result
                // starts where you are today, not at zero.
                current: parseFloat(baseline) || 0,
                target: parseFloat(target) || 100,
                kind,
                sortOrder: krs.length,
              })}
            >
              Add
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
        >
          <Plus size={12} /> Add key result
        </button>
      )}
    </div>
  );
}
