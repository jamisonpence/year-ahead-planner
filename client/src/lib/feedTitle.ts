// Display-sanitizer for friend-saved item titles surfaced in feeds and
// recommendations. Friend saves are raw user data — titles can arrive as
// shouting caps with leading emoji ("🔴INFOWARS CHIEF ISSUES EMERGENCY
// STATEMENT"). Cleaning happens at render time only; stored data is untouched.

const LEADING_JUNK = /^[\s\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}🔴🔺⚠️❗️‼️]+/u;

function isMostlyUppercase(s: string): boolean {
  const letters = s.replace(/[^a-zA-Z]/g, "");
  if (letters.length < 8) return false;
  const upper = letters.replace(/[^A-Z]/g, "");
  return upper.length / letters.length > 0.7;
}

function toTitleCase(s: string): string {
  return s.toLowerCase().replace(/(^|\s|[-–—/("'])(\p{L})/gu, (m, pre, ch) => pre + ch.toUpperCase());
}

export function cleanFeedTitle(raw: string | null | undefined): string {
  if (!raw) return "";
  let t = raw.replace(LEADING_JUNK, "").replace(/\s+/g, " ").trim();
  if (isMostlyUppercase(t)) t = toTitleCase(t);
  if (t.length > 90) t = t.slice(0, 87).trimEnd() + "…";
  return t || (raw ?? "");
}
