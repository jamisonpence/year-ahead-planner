import { useMemo, useState } from "react";
import { Link } from "wouter";
import { usePlanner } from "@/state/PlannerContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Copy, Download, Printer } from "lucide-react";
import { buildShoppingList, shoppingToCSV, downloadFile } from "@/lib/planner/shopping";
import { useToast } from "@/hooks/use-toast";

export default function Shopping() {
  const { plan } = usePlanner();
  const { toast } = useToast();
  const [selected, setSelected] = useState<number[]>(() => plan ? plan.days.map((d) => d.day) : []);

  if (!plan) {
    return (
      <Card className="mx-auto max-w-lg rounded-2xl">
        <CardContent className="p-8 text-center">
          <h2 className="text-base font-semibold">No plan yet</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">Generate a plan first to build a shopping list.</p>
          <Link href="/meal-planner/setup">
            <Button className="mt-5">Open setup</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  const list = useMemo(() => buildShoppingList(plan, selected), [plan, selected]);

  function toggleDay(day: number) {
    setSelected((s) => s.includes(day) ? s.filter((x) => x !== day) : [...s, day]);
  }

  function copyText() {
    const text = list.aisles.map((a) => `## ${a.name}\n` + a.items.map((it) => `- ${it.display}${it.count > 1 ? ` (x${it.count})` : ""}`).join("\n")).join("\n\n");
    navigator.clipboard?.writeText(text).then(
      () => toast({ title: "Copied", description: "Shopping list on your clipboard." }),
      () => toast({ title: "Copy failed", description: "Clipboard not available." }),
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Shopping</div>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">Your list</h1>
          <p className="mt-1 text-sm text-muted-foreground">Aggregated from your plan and grouped by aisle.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={copyText} data-testid="button-copy">
            <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy
          </Button>
          <Button variant="outline" size="sm" onClick={() => downloadFile("shopping-list.csv", shoppingToCSV(list))} data-testid="button-csv">
            <Download className="mr-1.5 h-3.5 w-3.5" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()} data-testid="button-print">
            <Printer className="mr-1.5 h-3.5 w-3.5" /> Print
          </Button>
        </div>
      </div>

      {plan.days.length > 1 && (
        <Card className="rounded-2xl">
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Include days</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {plan.days.map((d) => {
                const active = selected.includes(d.day);
                return (
                  <button
                    key={d.day}
                    onClick={() => toggleDay(d.day)}
                    data-testid={`day-toggle-${d.day}`}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium hover:shadow-sm ${active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                  >
                    <span className={`inline-block h-3 w-3 rounded-sm border ${active ? "border-primary bg-primary" : "border-input"}`} />
                    Day {d.day + 1}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {list.flat.length === 0 ? (
        <div className="text-sm text-muted-foreground">No ingredients selected.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {list.aisles.map((aisle) => (
            <Card key={aisle.name} className="rounded-2xl">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">{aisle.name}</h3>
                  <span className="text-[11px] text-muted-foreground">{aisle.items.length}</span>
                </div>
                <ul className="mt-3 space-y-2 text-sm">
                  {aisle.items.map((it) => (
                    <li key={it.key} className="flex flex-col gap-0.5" data-testid={`ingredient-${it.key}`}>
                      <div className="flex items-baseline justify-between gap-2">
                        <span>{it.display}</span>
                        {it.count > 1 && <span className="text-[11px] text-muted-foreground tabular-nums">×{it.count}</span>}
                      </div>
                      <div className="text-[10.5px] text-muted-foreground line-clamp-1">{it.recipes.join(" · ")}</div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
