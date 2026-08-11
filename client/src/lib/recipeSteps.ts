/**
 * Split a recipe's instructions into individual steps for display.
 *
 * Instructions arrive as one run-together string, and the source sites number
 * their steps in at least three different ways:
 *
 *   "1. Add warm water … 2. Add salt …"            → number + period
 *   "1. 1 Prepare the Figs … 2 Place the figs …"   → bare numbers, wrapped in a stray "1."
 *   "1. step 1 Peel and devein … step 2 Pour …"    → "step N", also wrapped
 *
 * Rendering any of them in a single <p> gives a wall of text. Splitting happens
 * here rather than by rewriting stored data: it covers every recipe including
 * ones imported later, and a wrong guess costs a bad render rather than
 * corrupted content.
 *
 * The whole difficulty is telling a step number from an ordinary one — "a 1.5 lb
 * loaf", "10 - 15 minutes", "150ml water", "1-2 mins". Two defences do the work:
 *
 *   1. A marker must be followed by whitespace then a capital letter. That alone
 *      rules out "1.5" (period then digit) and "5 mins" (lowercase).
 *   2. The extracted numbers must form an ascending run starting at 1 or 2.
 *      A stray "Serves 4 People" produces [4] with nothing before it and is
 *      rejected, where a real list produces [1,2,3,4,5,6].
 *
 * Strategies are tried in order of how unambiguous they are, and the first one
 * that yields a valid ascending run of at least two steps wins.
 */

/**
 * `start` is where the marker text begins ("step 2" / "3." / "4"), `end` is where
 * the step body begins. Tracking both matters: keying off the digit alone left
 * the word "step" stranded in front of it, which then surfaced as a phantom
 * first step reading "1. step".
 */
type Marker = { start: number; end: number; num: number };

/** "step 1 " / "Step 2." — explicit, so safest to try first. */
const STEP_WORD = /(?:^|\s)step\s*(\d{1,2})[.):]?\s+(?=["“'A-Z])/gi;
/** "1. " / "2) " — number with punctuation. */
const NUM_PUNCT = /(?:^|\s)(\d{1,2})[.)]\s+(?=["“'A-Z])/g;
/** "2 Place the figs" — bare number, only safe with the ascending-run check. */
const NUM_BARE = /(?:^|\s)(\d{1,2})\s+(?=["“'A-Z])/g;

function collect(text: string, re: RegExp): Marker[] {
  const out: Marker[] = [];
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const lead = m[0].length - m[0].trimStart().length; // the (?:^|\s) prefix
    out.push({
      start: m.index + lead,
      end: m.index + m[0].length,
      num: parseInt(m[1], 10),
    });
  }
  return out;
}

/**
 * A real step list counts up. Allow a gap (some sites skip a number) but reject
 * anything that starts high or wanders — that's prose containing digits.
 */
function isAscendingRun(marks: Marker[]): boolean {
  if (marks.length < 2) return false;
  if (marks[0].num > 2) return false;
  for (let i = 1; i < marks.length; i++) {
    const step = marks[i].num - marks[i - 1].num;
    if (step < 1 || step > 2) return false;
  }
  return true;
}

function sliceAt(text: string, marks: Marker[]): string[] {
  const steps: string[] = [];
  const preamble = text.slice(0, marks[0].start).trim();
  // Sources often wrap the whole block in a stray "1." — that's noise, not a step.
  if (preamble && !/^\d{1,2}[.):]?$/.test(preamble)) steps.push(preamble);
  for (let i = 0; i < marks.length; i++) {
    const body = text.slice(marks[i].end, marks[i + 1]?.start ?? text.length).trim();
    if (body) steps.push(body);
  }
  return steps;
}

export function splitRecipeSteps(raw: string | null | undefined): string[] {
  const text = (raw ?? "").trim();
  if (!text) return [];

  // Author-formatted line breaks are a deliberate choice — respect them.
  const lines = text.split(/\r?\n+/).map(l => l.trim()).filter(Boolean);
  if (lines.length > 1) return lines.map(stripLeadingMarker).filter(Boolean);

  for (const re of [STEP_WORD, NUM_PUNCT, NUM_BARE]) {
    const marks = collect(text, re);
    if (isAscendingRun(marks)) return sliceAt(text, marks);
  }

  // Not a numbered list — return it whole rather than inventing structure,
  // minus any lone leading marker so the UI's numbering doesn't double up.
  return [stripLeadingMarker(text)].filter(Boolean);
}

/** Remove a leading "3. " / "3) " / "step 3 " so the UI supplies the numbering. */
function stripLeadingMarker(s: string): string {
  return s.replace(/^(?:step\s*)?\d{1,2}[.):]?\s*/i, "").trim();
}
