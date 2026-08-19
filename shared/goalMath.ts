/**
 * Pure goal/OKR maths, shared by client and server.
 *
 * This lives apart from schema.ts on purpose. schema.ts calls pgTable() at
 * module scope, so importing *any* value from it drags drizzle-orm, drizzle-zod
 * and the whole table graph into whatever bundle does the importing — side
 * effects mean Rollup cannot tree-shake it away. The client had only ever used
 * `import type` from schema.ts, which erases at build time; the first real value
 * import put database table names into the browser bundle.
 *
 * So: nothing here imports anything. Types are structural rather than pulled
 * from schema.ts, which keeps that guarantee obvious instead of resting on
 * `import type` being erased.
 */

/** The three fields a key result needs to compute progress. */
export type KeyResultProgressInput = {
  baseline: number;
  current: number;
  target: number;
};

/**
 * Completion of a single key result, 0–1, measured from its baseline.
 *
 * Starting at 2 clients and targeting 10 means 4 clients is 25% of the way, not
 * 40% — measuring from zero would flatter every objective that started with
 * something already on the board. Works for descending targets too (200 → 180
 * lbs), since the span is signed. A zero-width range is treated as done once
 * reached, there being no distance to travel.
 */
export function keyResultProgress(kr: KeyResultProgressInput): number {
  const span = kr.target - kr.baseline;
  if (span === 0) return kr.current >= kr.target ? 1 : 0;
  return Math.max(0, Math.min(1, (kr.current - kr.baseline) / span));
}

/** An objective's progress is the mean of its key results. Simple goals never use this. */
export function objectiveProgressPct(krs: KeyResultProgressInput[]): number {
  if (!krs.length) return 0;
  return Math.round((krs.reduce((sum, k) => sum + keyResultProgress(k), 0) / krs.length) * 100);
}

/**
 * Quarter helpers. Stored form is "2026-Q3" — sortable as a plain string, and
 * unambiguous in a way that "Q3" alone is not once a goal outlives the year.
 * Local time is deliberate: a quarter is a human planning unit, so it should
 * turn over at the user's midnight rather than UTC's.
 */
export function currentQuarter(d: Date = new Date()): string {
  return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
}

/** "2026-Q3" → "Q3 2026". Falls back to the raw value rather than showing nothing. */
export function quarterLabel(q: string | null | undefined): string {
  const m = /^(\d{4})-Q([1-4])$/.exec(q ?? "");
  return m ? `Q${m[2]} ${m[1]}` : (q || "");
}

/** The current quarter plus the next three — enough to plan ahead without a date picker. */
export function upcomingQuarters(d: Date = new Date(), count = 4): string[] {
  const out: string[] = [];
  let year = d.getFullYear();
  let q = Math.floor(d.getMonth() / 3) + 1;
  for (let i = 0; i < count; i++) {
    out.push(`${year}-Q${q}`);
    if (++q > 4) { q = 1; year++; }
  }
  return out;
}
