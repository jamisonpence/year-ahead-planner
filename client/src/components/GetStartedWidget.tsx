import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Check, X, ChevronRight } from "lucide-react";
import { loadChecklist, saveChecklist } from "./OnboardingModal";

const DISMISSED_KEY = "mylifos_getstarted_dismissed";

export default function GetStartedWidget() {
  const [items, setItems] = useState(loadChecklist);
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISSED_KEY) === "1"; } catch { return false; }
  });

  // Don't show if dismissed or no checklist
  if (dismissed || items.length === 0) return null;

  const doneCount = items.filter(i => i.done).length;
  const allDone = doneCount === items.length;
  const pct = Math.round((doneCount / items.length) * 100);

  function toggle(idx: number) {
    const next = items.map((item, i) => i === idx ? { ...item, done: !item.done } : item);
    setItems(next);
    saveChecklist(next);
  }

  function dismiss() {
    try { localStorage.setItem(DISMISSED_KEY, "1"); } catch {}
    setDismissed(true);
  }

  // Auto-dismiss after all done (with brief delay)
  useEffect(() => {
    if (allDone) {
      const t = setTimeout(dismiss, 2500);
      return () => clearTimeout(t);
    }
  }, [allDone]);

  return (
    <div className="mx-3 mb-3 rounded-xl border bg-card p-3 space-y-2.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-foreground">Get Started</span>
          <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">{doneCount}/{items.length}</span>
        </div>
        <button onClick={dismiss} className="text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors" title="Dismiss">
          <X size={13} />
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${allDone ? "bg-emerald-500" : "bg-primary"}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Checklist */}
      <div className="space-y-1">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <button
              onClick={() => toggle(i)}
              className={`w-4.5 h-4.5 w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                item.done ? "bg-emerald-500 border-emerald-500" : "border-border hover:border-primary"
              }`}
            >
              {item.done && <Check size={10} className="text-white" />}
            </button>
            <Link href={item.href}>
              <a className={`text-xs flex-1 hover:text-primary transition-colors flex items-center gap-0.5 ${item.done ? "line-through text-muted-foreground" : "text-foreground"}`}>
                {item.section}
                {!item.done && <ChevronRight size={10} className="text-muted-foreground" />}
              </a>
            </Link>
          </div>
        ))}
      </div>

      {allDone && (
        <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium text-center">
          🎉 All done! Great start.
        </p>
      )}
    </div>
  );
}
