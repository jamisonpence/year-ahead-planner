#!/usr/bin/env node
/**
 * Import local recipe PNGs into the app.
 *
 *   1. Reads PNGs from ./recipe-images-source/  (filenames like 0129-slug-name.png)
 *   2. Converts each to WebP (max 900px wide, quality 82) — typically ~85% smaller
 *   3. Writes them to client/public/recipe-images/<slug>.webp  (served at /recipe-images/<slug>.webp)
 *   4. Writes recipe-image-map.csv  ("Recipe","Image Address") for the bulk apply endpoint
 *
 * Matching: the leading NNNN- counter is stripped, and the remaining slug is
 * matched against slugify(recipe.name). Unmatched files are reported, never guessed.
 *
 * Usage:
 *   node script/import-recipe-images.mjs                 # convert + build map
 *   node script/import-recipe-images.mjs --dry-run       # report matches only, write nothing
 */
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = path.join(ROOT, "recipe-images-source");
const OUT_DIR = path.join(ROOT, "client", "public", "recipe-images");
const RECIPES_JSON = path.join(ROOT, "client", "public", "recipes.json");
const MAP_CSV = path.join(ROOT, "recipe-image-map.csv");
const DRY = process.argv.includes("--dry-run");

const slugify = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
/** Strip a leading numeric counter: "0129-foo-bar" → "foo-bar" */
const fileSlug = (f) => path.basename(f, path.extname(f)).replace(/^\d+[-_]/, "").toLowerCase();

if (!fs.existsSync(SRC_DIR)) {
  console.error(`\n✗ Source folder not found: ${SRC_DIR}`);
  console.error(`  Create it and drop your PNGs inside, then re-run.\n`);
  process.exit(1);
}

// ── Recipe names: prefer the live catalog file, fall back to a names.txt ──
let recipeNames = [];
if (fs.existsSync(RECIPES_JSON)) {
  try {
    const data = JSON.parse(fs.readFileSync(RECIPES_JSON, "utf-8"));
    const arr = Array.isArray(data) ? data : data.recipes ?? [];
    recipeNames = arr.map((r) => r.name ?? r.title).filter(Boolean);
  } catch (e) {
    console.error("Could not parse recipes.json:", e.message);
  }
}
if (recipeNames.length === 0) {
  console.error("✗ No recipe names found (client/public/recipes.json missing or empty).");
  process.exit(1);
}

const bySlug = new Map();
for (const name of recipeNames) {
  const s = slugify(name);
  if (!bySlug.has(s)) bySlug.set(s, []);
  bySlug.get(s).push(name);
}

/** Recursively collect image files — sources are organised into category folders. */
function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(png|jpe?g|webp)$/i.test(entry.name)) out.push(full);
  }
  return out;
}
const files = walk(SRC_DIR);
console.log(`\nFound ${files.length} image files, ${recipeNames.length} recipe names.\n`);

if (!DRY) fs.mkdirSync(OUT_DIR, { recursive: true });

const rows = [['"Recipe"', '"Image Address"']];
let matched = 0, converted = 0, bytesIn = 0, bytesOut = 0;
const unmatched = [];

for (const file of files) {
  const slug = fileSlug(file);
  const names = bySlug.get(slug);
  if (!names) { unmatched.push(file); continue; }
  matched++;

  const srcPath = file;
  const outName = `${slug}.webp`;
  const outPath = path.join(OUT_DIR, outName);
  bytesIn += fs.statSync(srcPath).size;

  if (!DRY) {
    // Pillow: downscale to max 900px wide and encode WebP
    execFileSync("python3", ["-c", `
import sys
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert("RGB")
if im.width > 900:
    im = im.resize((900, round(im.height * 900 / im.width)), Image.LANCZOS)
im.save(out, "WEBP", quality=82, method=6)
`, srcPath, outPath]);
    bytesOut += fs.statSync(outPath).size;
    converted++;
  }

  // One image can serve several recipes that share a name (user copies of system recipes)
  for (const name of names) {
    rows.push([`"${name.replace(/"/g, '""')}"`, `"/recipe-images/${outName}"`]);
  }
}

if (!DRY) fs.writeFileSync(MAP_CSV, rows.map((r) => r.join(",")).join("\r\n"));

const mb = (b) => (b / 1024 / 1024).toFixed(1) + " MB";
console.log(`Matched:    ${matched}/${files.length} images → ${rows.length - 1} recipe rows`);
console.log(`Unmatched:  ${unmatched.length}`);
if (!DRY) {
  console.log(`Converted:  ${converted} → ${OUT_DIR}`);
  console.log(`Size:       ${mb(bytesIn)} → ${mb(bytesOut)}  (${Math.round((1 - bytesOut / bytesIn) * 100)}% smaller)`);
  console.log(`Map:        ${MAP_CSV}`);
}
if (unmatched.length) {
  console.log(`\nUnmatched files (first 25) — these need a name tweak or a manual row:`);
  unmatched.slice(0, 25).forEach((f) => console.log("  " + f));
  if (unmatched.length > 25) console.log(`  …and ${unmatched.length - 25} more`);
  if (!DRY) fs.writeFileSync(path.join(ROOT, "recipe-images-unmatched.txt"), unmatched.join("\n"));
}
console.log("");
