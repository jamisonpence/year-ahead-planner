import type { Macros } from "@/lib/planner/types";
import { Progress } from "@/components/ui/progress";

export function MacroChips({ macros }: { macros: Macros }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <Chip label="Cal" value={macros.cal} color="bg-primary/10 text-primary" />
      <Chip label="P" value={macros.p + "g"} color="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" />
      <Chip label="C" value={macros.c + "g"} color="bg-secondary/60 text-foreground" />
      <Chip label="F" value={macros.f + "g"} color="bg-orange-500/10 text-foreground" />
    </div>
  );
}

function Chip({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${color}`}>
      <span className="opacity-70">{label}</span>
      <span>{value}</span>
    </span>
  );
}

export function MacroBars({ totals, target }: { totals: Macros; target: Macros }) {
  const items: { key: keyof Macros; label: string; unit: string }[] = [
    { key: "cal", label: "Calories", unit: "" },
    { key: "p", label: "Protein", unit: "g" },
    { key: "c", label: "Carbs", unit: "g" },
    { key: "f", label: "Fat", unit: "g" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((i) => {
        const t = target[i.key];
        const v = totals[i.key];
        const pct = t > 0 ? Math.min(150, Math.round((v / t) * 100)) : 0;
        return (
          <div key={i.key} className="rounded-xl border border-border/70 bg-card p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{i.label}</div>
            <div className="mt-0.5 text-base font-semibold tabular-nums">
              {v}
              <span className="text-muted-foreground text-xs font-normal"> / {t}{i.unit}</span>
            </div>
            <Progress value={Math.min(100, pct)} className="mt-2 h-1.5" />
            <div className="mt-1 text-[11px] text-muted-foreground">{pct}%</div>
          </div>
        );
      })}
    </div>
  );
}
