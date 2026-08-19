# MyLifos — Project Context

Personal life-management platform (Notion/Evernote-style) at **https://mylifos.com**.
Sections: Goals, Tasks, Habits, Health (workouts, plans, nutrition), Recipes, Library
(books/movies/music), Places, Hobbies, People, Messenger, a social Feed, and Home
(household management). Also ships as a PWA and an iOS app via Capacitor.

Repo name is still `rest-express` / `year-ahead-planner` — "YearAheadPlanner" is the
original name. The product is MyLifos.

## Stack

- **Client** — React 18 + TypeScript, Vite 7, Wouter (routing), TanStack Query v5,
  shadcn/ui on Radix, Tailwind 3, Framer Motion
- **Server** — Node 20, Express 5, Passport (local + Google OAuth), express-session
  on connect-pg-simple
- **DB** — PostgreSQL via Drizzle ORM. Single schema file: `shared/schema.ts`
- **Hosting** — Railway, auto-deploying from GitHub `main`
- **Mobile** — Capacitor 8 (iOS), vite-plugin-pwa with a custom service worker

## Layout

```
client/src/pages/       # one file per section — very large (~74k lines total)
client/src/components/  # AppShell, OnboardingModal, QuickAddModal, ui/ (shadcn)
client/src/sw.ts        # custom service worker (injectManifest strategy)
server/index.ts         # entry — mounts routes, /mcp, static
server/routes.ts        # the bulk of the API (~11k lines)
server/routes/          # externalApi.ts, helpers.ts
server/storage.ts       # data access layer
server/static.ts        # serves dist/public in production
server/auth.ts          # Passport strategies
server/mylifos-mcp-server.ts  # MCP server exposed at /mcp
shared/schema.ts        # Drizzle schema — single source of truth for both sides
script/                 # build entrypoints
```

Path aliases: `@/` → `client/src/`, `@shared/` → `shared/`, `@assets/` → `attached_assets/`.

## Commands

```bash
npm run dev       # tsx server/index.ts, NODE_ENV=development
npm run check     # tsc — THE TYPE CHECK. Nothing else type-checks. Run it.
npm run build     # tsx script/build.ts (client + server in one process)
npm start         # node dist/index.cjs
npm run db:push   # drizzle-kit push — applies shared/schema.ts to the DB
npm run build:ios # Capacitor iOS build
```

Client builds to `dist/public`, server bundles to `dist/index.cjs`.
`dist/` is gitignored.

## Deploying

**Railway builds from source. Do not build locally and commit artifacts.**

```
edit source → npm run check → git add → git commit → git push origin main
```

Railway detects the push and runs the build itself. `dist/` is gitignored precisely
because of this. (Older notes described copying a local Vite build into a separate
deploy repo — that is obsolete and will not work.)

**`nixpacks.toml` is the single source of truth for the build.** Its build phase runs
`script/build-client.ts` then `script/build-server.ts` as two separate processes, each
with `--max-old-space-size=3072`. `railway.json` carries only what nixpacks can't express
— the builder choice and the deploy/restart policy — and deliberately has **no
`buildCommand`**: setting one overrides the nixpacks build phase entirely, which is how
the split-for-memory arrangement previously ended up as dead config while every deploy
quietly ran a single-process build on a default heap.

`package.json`'s `build` script runs the same two commands, so a local build exercises
the production path rather than a second one. `script/build.ts` and `build-server.mjs`
were near-duplicates and are gone.

**Be careful adding to the esbuild `define` block in `script/build-server.ts`.** `define`
*replaces* `process.env.X` at build time, so a key absent from the **build** environment
is baked as `""` and permanently overrides whatever Railway provides at runtime. Anything
left out stays a normal runtime lookup, which is the safer default — `SEATGEEK_CLIENT_ID`
and `SEATGEEK_CLIENT_SECRET` are omitted for exactly that reason and work fine. Adding a
key to that list is a behaviour change, not a tidy-up.

Still worth doing one day: `define` is the wrong mechanism for values Railway already
injects at runtime, and any key currently in the list that's missing from the build
environment is silently `""`. Removing the block is the real cleanup, but it changes
behaviour and deserves its own deploy.

## Gotchas that have actually bitten

**The four task "tables" are VIEWS.** `general_tasks`, `tasks`, `project_tasks` and
`goal_tasks` are not tables. `migrateUnifiedTasks()` in `server/storage.ts` folded them
into a single `unified_tasks` table and left auto-updatable views behind under the old
names, so existing queries kept working. Reads and writes through the views are fine —
but DDL is not:

```sql
ALTER TABLE general_tasks ADD COLUMN ...   -- 42809, "not supported for views"
```

This crash-looped production and took mylifos.com down for three deploy cycles. To add a
column that any of these expose, put it on `unified_tasks` and widen the view:

```sql
ALTER TABLE unified_tasks ADD COLUMN IF NOT EXISTS <col> <type>;
CREATE OR REPLACE VIEW general_tasks AS
  SELECT id, user_id, title, completed, due_date, priority, notes, sort_order, <col>
  FROM unified_tasks
  WHERE event_id IS NULL AND project_id IS NULL AND goal_id IS NULL;
```

Two shapes exist and boot migrations run against both, so branch on
`to_regclass('unified_tasks')`: in production the views exist, but on a fresh install
`general_tasks` is still a real table at that point because `migrateUnifiedTasks()` runs
at the *end* of `initializeStorage()`. Also add the column to `migrateUnifiedTasks` itself
(base table, the `INSERT ... SELECT`, and the view) or a new database will create it and
lose it minutes later. `CREATE OR REPLACE VIEW` can only append columns to the end of the
select list — which is all that's needed here, and avoids a `DROP` that would fail while
the view has dependents.

**Boot migrations must never be fatal.** `initializeStorage()` runs before the server
listens, so a throw there means no server at all — a crash loop, not a degraded page.
Lock-taking DDL goes through `safeDdl()`, which bounds the wait with
`SET LOCAL lock_timeout = '5s'` inside a transaction and logs failures instead of
rethrowing. Use it for `ALTER TABLE` and `CREATE INDEX`; plain `pool.query` is fine for
`CREATE TABLE IF NOT EXISTS`, since a table nothing references yet has nothing to contend
with.

**Ship schema changes on their own deploy.** Bundling a migration with unrelated code
cost two extra deploy cycles to bisect. One migration, one deploy, verified before
anything else rides along.

**Read type errors by kind, not by count.** `npm run check` reports a few hundred errors,
almost all missing `@types` packages (TS7016) — genuinely harmless. But three codes are
runtime crashes hiding in that noise:

| code | meaning | consequence |
|---|---|---|
| TS2304 | name not found | `ReferenceError` the moment the line runs |
| TS2551 | misspelled property | `undefined is not a function` |
| TS2554 | wrong argument count | a parameter silently `undefined` |

`npm run check:crashers` fails if any appear. **Run it before pushing** — it is fast and
its count is 0, so any output is a real finding. An undeclared `uid` in a route handler
500'd every book status change for weeks while sitting in plain sight in the build output.

**`storage` uses `satisfies IStorage`, not `: IStorage`.** Annotating the variable with
the interface hides every method the implementation has but the interface has not yet
declared — callers get TS2339/TS2551 for methods that exist and work, which was 130 of
the old baseline. `satisfies` still checks conformance while keeping the concrete type
visible, so a genuine arity or name error is not buried. Adding a method to `storage`
does not require touching `IStorage` unless it is called via `this`.

**esbuild does not type-check.** It strips types and bundles. A dangling reference to a
variable you deleted compiles cleanly and crashes at runtime in the browser or on boot.
Always `npm run check` before pushing. This has caused live breakage more than once.

**IDs are only unique within their own table.** House projects and goal/standalone
projects live in separate tables with independent ID sequences, so the same numeric id
can exist in both. Any code that resolves an entity by id alone (`.find(p => p.id === id)`)
can silently hit the wrong record and send an update to the wrong endpoint. Always carry
the source/kind alongside the id. There was a real bug where two projects named
"Destroy Bugs" both had id 7; marking one Done updated the other. Assume this class of
bug exists elsewhere.

**Drizzle `.set()` rejects unknown columns.** Passing a field that isn't on the target
table (e.g. `goalId` on a house-projects update) will throw. Strip non-columns per branch.

**Inline `display` collisions.** At least one drawer previously had `display:none` and
`display:flex` in the same inline style; the later wins, so the panel was permanently
visible. If an overlay renders when it shouldn't, check for duplicate properties in the
inline style before touching the open/close handlers.

**Page files are enormous.** `client/src/pages/` is ~74k lines total. The worst offenders:
`HobbiesPage.tsx` (12,351), `HealthPage.tsx` (4,799), `PoliticsPage.tsx` (4,770),
`SpotsPage.tsx` (3,858), `WorkoutsPage.tsx` (3,789). `server/routes.ts` is 11,084 lines.
Read targeted ranges rather than whole files, and prefer extracting sections into
`client/src/components/` when touching them — already done for `BudBetsSection` and
`DebatesSection`. `HobbiesPage.tsx` is the obvious next candidate.

## MCP server

`server/mylifos-mcp-server.ts` mounts at `/mcp` and is what the Claude/Cowork connector
talks to. Currently exposes: `get_today`, `list_tasks`, `create_task`, `update_task`,
`list_goals`, `list_recipes`, `get_week_meal_plan`, `list_scheduled_workouts`,
`list_chores`, `create_chore`, `complete_chore`, `send_email`.

Adding a tool requires: edit the file → commit → push → **wait for the Railway deploy to
finish** → reconnect the connector. Reconnecting only re-reads the tool list from
whatever is currently deployed; if the deploy hasn't landed, the new tool won't appear
and it looks like a connector bug. Confirm the deploy first.

Chores carry a `category` field (`cleaning`, `yard`, `maintenance`, `laundry`) — the
daily planner groups by it so errands in the same place get batched.

## Secrets

`.env` (gitignored) holds: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`GOOGLE_CALLBACK_URL`, `SESSION_SECRET`, `TMDB_API_KEY`, `TICKETMASTER_API_KEY`,
`SEATGEEK_CLIENT_ID`, `SEATGEEK_CLIENT_SECRET`. `.env.example` also lists
`FATSECRET_CLIENT_ID` / `FATSECRET_CLIENT_SECRET`. Production values live in Railway's
env settings, not here.

**Never put a token in a git remote URL.** `.git/config` currently embeds a GitHub PAT
in the `origin` URL, which means it leaks into any output of `git remote -v` and into
every chat transcript that ran it. Rotate that token and re-point origin at the clean
URL, authenticating with `gh auth login` or a credential helper instead.

## Conventions

- `shared/schema.ts` is the contract — change it there, then `npm run db:push`, then
  update client and server together.
- Keep server route handlers in `server/routes.ts` unless they're external-API calls,
  which go in `server/routes/externalApi.ts`.
- Prefer real verification over assuming: after a deploy, load the page and check the
  console before declaring it fixed. Blank pages immediately after a push are usually
  the deploy swap window — reload before debugging.
