import { build as esbuild } from "esbuild";
import { readFile } from "fs/promises";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildServer() {
  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    // This list must not grow casually. esbuild's `define` REPLACES the
    // expression at build time, so a key that is absent from the *build*
    // environment is baked as "" and permanently overrides whatever Railway
    // provides at runtime. Anything omitted here stays a normal runtime lookup,
    // which is the safer default. SEATGEEK_CLIENT_ID/SECRET are deliberately
    // absent for that reason — they resolve at runtime today and work.
    define: {
      "process.env.NODE_ENV": '"production"',
      "process.env.TMDB_API_KEY": JSON.stringify(process.env.TMDB_API_KEY ?? ""),
      "process.env.GOOGLE_BOOKS_API_KEY": JSON.stringify(process.env.GOOGLE_BOOKS_API_KEY ?? ""),
      "process.env.LASTFM_API_KEY": JSON.stringify(process.env.LASTFM_API_KEY ?? ""),
      "process.env.PERENUAL_API_KEY": JSON.stringify(process.env.PERENUAL_API_KEY ?? ""),
      "process.env.ENCRYPTION_KEY": JSON.stringify(process.env.ENCRYPTION_KEY ?? ""),
      "process.env.EVENTBRITE_API_KEY": JSON.stringify(process.env.EVENTBRITE_API_KEY ?? ""),
      "process.env.TICKETMASTER_API_KEY": JSON.stringify(process.env.TICKETMASTER_API_KEY ?? ""),
      "process.env.KLIPY_API_KEY": JSON.stringify(process.env.KLIPY_API_KEY ?? ""),
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });

  console.log("server build done.");
}

buildServer().catch((err) => {
  if (err && Array.isArray(err.errors) && err.errors.length > 0) {
    console.error("esbuild errors:");
    for (const e of err.errors as any[]) {
      const loc = e.location ? ` (${e.location.file}:${e.location.line})` : "";
      console.error(`  • ${e.text}${loc}`);
    }
  }
  console.error(err);
  process.exit(1);
});
