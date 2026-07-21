# Migrating recipe images to Cloudflare R2

Moving 916 WebP files (124 MB) out of the repo and onto R2, served from a custom domain.

Nothing here needs your R2 API keys. The bucket will be public-read, so the app just points at URLs — there are no credentials to store on Railway and nothing secret in the codebase.

---

## Step 1 — Create the bucket

In the Cloudflare dashboard, go to **R2 → Create bucket**.

- **Name:** `mylifos-images`
- **Location:** Automatic
- **Storage class:** Standard

Leave everything else at its default and create it.

## Step 2 — Attach the custom domain

Still in the bucket, open **Settings → Public access → Custom domains → Connect domain**.

Enter `images.mylifos.com` and connect. Cloudflare adds the CNAME automatically as long as mylifos.com's DNS is already on Cloudflare — it takes a minute or two to go live.

Do **not** enable the `r2.dev` public URL. It's rate-limited and Cloudflare states it isn't for production traffic. The custom domain has no such limit and gets full CDN caching.

## Step 3 — Set the cache header

In the same bucket, go to **Settings → Object lifecycle / Caching**, or set it at the domain level under **Rules → Cache Rules** for `images.mylifos.com`:

```
Cache-Control: public, max-age=31536000, immutable
```

These filenames are content-stable — `chicken-piccata.webp` will always be that image — so a one-year immutable cache is correct and means repeat visitors never re-download them.

## Step 4 — Upload the images

In the bucket, click **Upload → Select folder**, and choose:

```
YearAheadPlanner-source (1)/client/public/recipe-images
```

Cloudflare will upload all 916 files and key them as `recipe-images/<filename>.webp`, which gives you final URLs like:

```
https://images.mylifos.com/recipe-images/chicken-piccata.webp
```

Two things to watch:

The browser may warn about uploading many files — that's expected, accept it. And when it finishes, **check the object count reads 916**. Browser folder uploads occasionally drop files silently, and a partial upload is the one failure mode that would leave broken images in the app. If the count is short, re-run the upload; R2 overwrites by key, so re-uploading everything is safe and idempotent.

## Step 5 — Verify before cutting over

Open one image directly in a browser tab:

```
https://images.mylifos.com/recipe-images/1-pot-black-bean-soup.webp
```

If it renders, you're ready. Tell me and I'll run the cutover.

---

## Step 6 — The cutover (I run this)

I'll call the admin endpoint in preview mode first, which reports how many rows would change and shows five before/after examples without writing anything:

```
POST /api/admin/rewrite-image-urls
{ "from": "/recipe-images/",
  "to":   "https://images.mylifos.com/recipe-images/",
  "dryRun": true }
```

It should report **938 rows**. Once that looks right, the same call with `"dryRun": false` performs the update.

**Rollback is the same call with the prefixes swapped.** Nothing about this is one-way — if the domain has a problem, one request puts every URL back to `/recipe-images/` and the local files still exist at that point.

## Step 7 — Remove the local files

Only after the app is confirmed rendering from R2: I delete `client/public/recipe-images/` in a normal commit and add an ignore rule so it can't creep back in.

This drops 124 MB from the working tree and from every future build. The blobs stay in git history, so `.git` remains around 131 MB — purging that needs a history rewrite and force-push, which you opted out of. That's the right call for now; it's a one-time cleanup you can do later if the clone size becomes annoying, and it's much safer done deliberately than bundled into a migration.

---

## What changes, and what doesn't

The database stores absolute URLs after this, exactly as it already does for the 729 externally hotlinked recipes. So no client code changes at all — every component that renders `imageUrl` already handles absolute URLs today.

The 729 hotlinked recipes are untouched by this migration. They still point at other people's servers. If you later want to bring those in-house too, the same R2 bucket and the same rewrite endpoint handle it; the only added work is downloading and converting those images first.
