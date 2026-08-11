/**
 * Split a recipe's instructions into individual steps for display.
 *
 * Most recipes in the catalog store instructions as one run-together string:
 *
 *   "1. Add warm water honey and butter. 2. Add salt and vital wheat gluten. 3. …"
 *
 * Rendering that with `whitespace-pre-wrap` does nothing, because there is no
 * whitespace to preserve — it arrives as a single paragraph and reads as a wall
 * of text. Splitting here rather than rewriting the stored strings means every
 * recipe benefits, including imported and hand-entered ones, and nothing is
 * destroyed if the heuristic is ever wrong.
 *
 * The hard part is telling a step number from a number that happens to contain a
 * period. A boundary requires all three of:
 *
 *   · 1–2 digits, so "2026." in a note isn't a step
 *   · followed by `.` or `)` and then whitespace — this is what rules out "1.5 lb
 *     loaf", where the period is followed by a digit
 *   · followed by a capital letter or a quote, since steps start like sentences
 *
 * "Check dough after 10 minutes" and "add flour 1 tbsp at a time" both survive,
 * because neither number is followed by a period-then-space.
 */

/** A step boundary: start-of-string or whitespace, then `N.` / `N)`, then a capital. */
const STEP_BOUNDARY = /(?:^|\s)(\d{1,2})[.)]\s+(?=["“'A-Z])/g;

export function splitRecipeSteps(raw: string | null | undefined): string[] {
  const text = (raw ?? "").trim();
  if (!text) return [];

  // Already broken into lines by the author or importer — trust that and stop.
  // Re-splitting risks fighting formatting someone deliberately chose.
  const lines = text.split(/\r?\n+/).map(l => l.trim()).filter(Boolean);
  if (lines.length > 1) {
    return lines.map(stripLeadingNumber);
  }

  // One long line: find the numbered boundaries.
  const marks: number[] = [];
  STEP_BOUNDARY.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = STEP_BOUNDARY.exec(text)) !== null) {
    // Offset of the digit itself, not the whitespace before it
    marks.push(m.index + m[0].indexOf(m[1]));
  }

  // Fewer than two markers means it isn't a numbered list — leave it whole
  // rather than inventing structure that isn't there. Still strip a lone
  // leading "1." so the UI's own numbering doesn't render as "1. 1. …".
  if (marks.length < 2) return [stripLeadingNumber(text)];

  const steps: string[] = [];
  // Anything before the first "1." is a preamble worth keeping.
  const preamble = text.slice(0, marks[0]).trim();
  if (preamble) steps.push(preamble);

  for (let i = 0; i < marks.length; i++) {
    const chunk = text.slice(marks[i], marks[i + 1] ?? text.length).trim();
    const cleaned = stripLeadingNumber(chunk);
    if (cleaned) steps.push(cleaned);
  }
  return steps;
}

/** Remove a leading "3. " / "3) " so the UI can supply its own numbering. */
function stripLeadingNumber(s: string): string {
  return s.replace(/^\d{1,2}[.)]\s*/, "").trim();
}
