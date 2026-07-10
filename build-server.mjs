import { build as esbuild } from "esbuild";
import { readFileSync } from "fs";

const CLONE = "/tmp/repo-imagetool-1783690173";
const WORKSPACE = "/sessions/trusting-focused-bell/mnt/YearAheadPlanner-source (1)";
const pkg = JSON.parse(readFileSync(`${CLONE}/package.json`, "utf-8"));
const allowlist = ["@google/generative-ai","axios","cors","date-fns","drizzle-orm","drizzle-zod","express","express-rate-limit","express-session","jsonwebtoken","memorystore","multer","nanoid","nodemailer","openai","passport","passport-local","stripe","uuid","ws","xlsx","zod","zod-validation-error"];
const allDeps = [...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})];
const externals = allDeps.filter(d => !allowlist.includes(d));

await esbuild({
  entryPoints: [`${CLONE}/server/index.ts`],
  platform: "node",
  bundle: true,
  format: "cjs",
  outfile: `${CLONE}/dist/index.cjs`,
  define: { "process.env.NODE_ENV": '"production"' },
  minify: true,
  external: externals,
  nodePaths: [`${WORKSPACE}/node_modules`],
  logLevel: "warning",
});
console.log("Server built OK");
