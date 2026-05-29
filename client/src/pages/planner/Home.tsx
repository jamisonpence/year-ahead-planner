import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Calculator, Library, ShoppingBasket, Sparkles, CalendarRange, Clock, RefreshCw } from "lucide-react";
import { usePlanner } from "@/state/PlannerContext";

export default function Home() {
  const { recipes, plan, generate, recipesLoading } = usePlanner();
  const [, navigate] = useLocation();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Active plan card — shown when a plan exists */}
      {plan ? (
        <Card className="rounded-2xl border-primary/30 bg-primary/5">
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wide text-primary font-medium">Active Plan</div>
                <h2 className="mt-1 text-base font-semibold">
                  {plan.days.length === 1 ? "Today's meals" : `${plan.days.length}-day weekly plan`}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Daily target · {plan.target.cal} cal · {plan.target.p}P · {plan.target.c}C · {plan.target.f}F
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button variant="outline" size="sm" onClick={() => { generate(); }} title="Regenerate">
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
                <Link href="/meal-planner/plan">
                  <Button size="sm">View plan <ArrowRight className="ml-1 h-3.5 w-3.5" /></Button>
                </Link>
              </div>
            </div>

            {/* Today's meals preview */}
            <div className="mt-4 space-y-1.5">
              {plan.days[0].meals.map((m, i) => (
                <div key={i} className="flex items-center gap-3 text-xs">
                  <span className="w-16 shrink-0 capitalize text-muted-foreground">{m.slot}</span>
                  <span className="font-medium truncate flex-1">{m.recipe.name}</span>
                  <div className="flex items-center gap-2 shrink-0 text-muted-foreground">
                    <Badge variant="outline" className="text-[10px] py-0">{m.recipe.category}</Badge>
                    <span className="tabular-nums">{m.recipe.macros.cal} cal</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        /* No-plan hero */
        <section className="pt-4 sm:pt-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary/40 px-3 py-1 text-xs font-medium text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            {recipesLoading ? "Loading recipes…" : `${recipes.length || "—"} real recipes, no account required`}
          </div>
          <h1 className="mt-5 text-xl font-semibold tracking-tight">
            Meals that fit your macros.
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Build a daily or weekly meal plan from 930 recipes matched to your calorie and macro targets.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link href="/meal-planner/setup">
              <Button size="lg" data-testid="button-start">
                <Sparkles className="mr-1.5 h-4 w-4" /> Build a plan <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </section>
      )}

      {/* Quick links */}
      <section className="grid gap-3 sm:grid-cols-2">
        {[
          { href: "/meal-planner/setup",    icon: Sparkles,       title: "Build / rebuild plan",     body: "4-step wizard — mode, stats, diet, categories." },
          { href: "/meal-planner/plan",     icon: CalendarRange,  title: "View my plan",              body: plan ? `${plan.days.length}-day plan · ${plan.target.cal} cal/day` : "No plan yet." },
          { href: "/meal-planner/library",  icon: Library,        title: "Recipe library",            body: `${recipes.length || "930"} recipes · search, filter, sort.` },
          { href: "/meal-planner/shopping", icon: ShoppingBasket, title: "Shopping list",             body: "Aggregated by aisle · CSV export." },
        ].map(c => {
          const Icon = c.icon;
          return (
            <Link key={c.href} href={c.href}>
              <Card className="rounded-2xl h-full hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-5">
                  <Icon className="h-5 w-5 text-primary" />
                  <div className="mt-3 text-sm font-semibold">{c.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{c.body}</div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
