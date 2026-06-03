# MyLifos — iOS App Store Setup

This repo uses [Capacitor](https://capacitorjs.com/) to wrap the web app in a native iOS shell for the App Store.

## What you need (one-time setup)

- A **Mac** with Xcode 15+ installed (required — iOS builds cannot be done on Windows/Linux)
- An **Apple Developer account** at [developer.apple.com](https://developer.apple.com) ($99/year)
- Node 20+ and npm installed on the Mac

## Step 1 — Find your Railway URL

1. Open [railway.app](https://railway.app) → your project
2. Go to **Settings → Networking** and copy the public URL (e.g. `https://year-ahead-planner.up.railway.app`)

## Step 2 — Create .env.ios

```bash
cp .env.ios.example .env.ios
# Then edit .env.ios and set:
VITE_API_URL=https://your-actual-railway-url.up.railway.app
```

## Step 3 — Clone the repo on your Mac and install

```bash
git clone https://github.com/jamisonpence/year-ahead-planner.git
cd year-ahead-planner
npm install --legacy-peer-deps
```

## Step 4 — Build for iOS

```bash
npm run build:ios
```

This builds the frontend with your Railway URL baked in, then syncs to the Xcode project.

## Step 5 — Open in Xcode

```bash
npm run cap:open
# or: npx cap open ios
```

## Step 6 — Configure signing in Xcode

1. In Xcode, click the **App** target in the sidebar
2. Go to **Signing & Capabilities**
3. Select your **Apple Developer Team**
4. Set **Bundle Identifier** to `com.mylifos.app` (or your own)
5. Xcode will auto-generate a provisioning profile

## Step 7 — Test on your iPhone

1. Connect your iPhone via USB
2. Select it in Xcode's device picker
3. Press **▶ Run** — the app installs directly to your phone

## Step 8 — Submit to the App Store

1. In Xcode: **Product → Archive**
2. In the Organizer window that opens: **Distribute App → App Store Connect**
3. Follow the prompts — upload to App Store Connect
4. In [App Store Connect](https://appstoreconnect.apple.com):
   - Fill in app metadata (description, screenshots, keywords)
   - Set pricing (free)
   - Submit for Review

Review typically takes **1–3 business days**.

## App icons

All required icon sizes are already in `client/public/icons/`. Xcode's asset catalog will be configured automatically by Capacitor.

## Subsequent builds

After any code change:
```bash
npm run build:ios   # rebuild frontend + sync to Xcode
# then in Xcode: Product → Archive to re-submit
```

## Required App Store assets (you'll need to create these)

- **Screenshots** for iPhone 6.7" and 6.1" displays (use Xcode Simulator)
- **App description** (~200 words describing what MyLifos does)
- **Privacy policy URL** (required — Railway hosts `privacy.html` already in the repo)
- **Support URL** (can be the Railway app URL)
