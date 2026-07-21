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

## Step 3 — Set a long cache lifetime with a Cache Rule

R2 has no bucket-wide Cache-Control setting. `Cache-Control` lives on each individual object's HTTP metadata, and the dashboard's folder upload doesn't let you set it — so for 916 files, the practical route is a **Cache Rule** on the zone, which overrides TTLs at the edge and in the browser regardless of what the objects say.

Go to the **mylifos.com** zone (not the R2 section) → **Caching → Cache Rules → Create rule**.

- **Rule name:** `R2 recipe images`
- **When incoming requests match:** Hostname **equals** `images.mylifos.com`
- **Cache eligibility:** Eligible for cache
- **Edge TTL:** *Ignore cache-control header and use this TTL* → **1 year**
- **Browser TTL:** *Override origin* → **1 year**

Deploy the rule.

These filenames are content-stable — `chicken-piccata.webp` will always be that image — so a one-year lifetime is correct. If you ever do need to replace an image, upload it under a new filename rather than fighting the cache, or purge that single URL from **Caching → Configuration → Purge cache**.

One honest limitation: Cache Rules set `max-age`, but they can't add the `immutable` directive — that only comes from per-object metadata. `immutable` just suppresses revalidation requests on reload, so you're giving up a small optimization, not the caching itself. If it ever matters, it's fixable later by re-uploading with metadata via `rclone` or `wrangler`.

While you're in **Caching → Tiered Cache**, turning on **Smart Tiered Cache** is worth the click. It makes edge locations check a nearby upper-tier data center before going back to R2, which cuts your Class B operation count and therefore your bill.

## Step 4 — Upload the images with rclone

**The dashboard can't do this.** It refuses more than 100 files per upload, and we have 916. Wrangler isn't an option either — it uploads one object per invocation. rclone is the supported tool for bulk transfers into R2, and it parallelises and resumes.

### 4a. Create an R2 API token

**R2 → API → Manage API tokens → Create API token**

- **Permissions:** Object Read & Write
- **Specify bucket:** `mylifos-images` (scope it to just this bucket, not the whole account)
- **TTL:** short — you only need it for this upload, and you can delete it afterward

Copy the **Access Key ID** and **Secret Access Key**. The secret is shown once. Also note your **Account ID** from the R2 overview page.

### 4b. Install rclone

```sh
brew install rclone
```

### 4c. Run the upload

Paste your credentials into your shell and run the script. They're read from the environment, never written to disk or into this repo:

```sh
export R2_ACCOUNT_ID="your-account-id"
export R2_ACCESS_KEY_ID="..."
export R2_SECRET_ACCESS_KEY="..."

cd ~/Downloads/"YearAheadPlanner-source (1)"
chmod +x script/upload-recipe-images-r2.sh
./script/upload-recipe-images-r2.sh
```

It uploads with 32 parallel transfers, prints progress, then counts the remote objects and confirms the total matches the 916 local files. If anything fails partway, just run it again — rclone skips what's already there and sends only the remainder.

When you're done, delete the API token in the Cloudflare dashboard. Nothing in the running app needs it; the bucket is public-read.

### A bonus: this makes Step 3 optional

The script passes `--header-upload "Cache-Control: public, max-age=31536000, immutable"`, which writes real Cache-Control metadata onto every object. That's the thing a zone Cache Rule *can't* do, so going the rclone route gets you the genuine `immutable` directive after all.

The Cache Rule from Step 3 is still harmless to keep as a belt-and-braces default, but it's no longer necessary.

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
