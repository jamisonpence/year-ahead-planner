# MyLifos on the App Store — scope and walkthrough

Written 19 Aug 2026, against the repo at that date. Two decisions are already made:
bearer tokens for the native app's API access, and a minimum-submittable v1 with push
notifications deferred to 1.1.

---

## What already exists

More than you'd expect. This is not a from-scratch job.

- **Capacitor 8 is set up** — `@capacitor/core`, `ios`, `splash-screen`, `status-bar`
- **`capacitor.config.ts` is correctly configured** — `appId: com.mylifos.app`,
  `appName: MyLifos`, `webDir: dist/public`, dark status bar and splash matching the
  brand `#1e2d4d`, and — importantly — it bundles assets in production and only points
  at a server URL when `CAPACITOR_SERVER_URL` is set for local dev
- **`ios/` project is generated** — Xcode project, `AppDelegate.swift`, `Info.plist`,
  asset catalogue, SPM package
- **`npm run build:ios`** builds the web assets with `VITE_API_URL` baked in, then
  `cap sync ios`
- **App icon exists and is the right size** — 1024×1024, which is all modern Xcode needs
- **Account deletion is already in-app** — `DELETE /api/me`, wired into Settings. This
  satisfies Guideline 5.1.1(v), which is a common rejection and is already handled
- **Privacy policy page exists** at `/privacy`

## What blocks submission

### 1. The app can't talk to the API at all — the real blocker

This is the one that isn't obvious and would waste a day if you hit it in Xcode.

A Capacitor iOS app serves its web assets from `capacitor://localhost`. Every call to
`https://www.mylifos.com` is therefore **cross-origin**. Two things in the current server
config make that fail:

- **There is no CORS middleware.** No `Access-Control-Allow-Origin` header, so WKWebView
  blocks the responses.
- **The session cookie is `sameSite: "lax"`** (`server/auth.ts`). A lax cookie is not
  sent on cross-site requests, so even with CORS the user would never appear logged in.

Fix (chosen): **bearer tokens for native**. On login the server issues a token; the app
stores it in the iOS Keychain and sends `Authorization: Bearer …`. The website keeps its
cookie session exactly as-is — nothing about the web experience changes. This also
survives future WebKit cookie restrictions, which have been tightening steadily.

### 2. Sign in with Apple is mandatory

Guideline 4.8. An app that offers a third-party login (you offer Google, and only Google)
must also offer Sign in with Apple. This is a hard rejection, not a warning, and it's the
largest single piece of work here.

It needs both halves: an Apple auth strategy on the server with account linking by email,
and the button in the client. Plus configuration in the Apple Developer portal — an App
ID with the capability enabled, a Service ID, and a signing key.

### 3. Push notifications don't work in a WebView

`server/push.ts` uses Web Push (VAPID). That works in Safari and installed PWAs; it does
**not** work inside a Capacitor WKWebView. Native push needs
`@capacitor/push-notifications`, an APNs key, and a server path that sends to APNs rather
than Web Push.

Deferred to 1.1 by decision. Worth knowing that the daily-loop, streak-insurance and
evening close-out features lean on push, so they'll be quieter in v1 than on the web.

### 4. Guideline 4.2 — minimum functionality

Apple rejects apps that are just a website in a wrapper. You're on the right side of this
because assets are bundled rather than loaded from a URL, and there's a native splash and
status bar — but it's thin. Adding one genuinely native capability strengthens the case.
Push in 1.1 covers it; haptics or native share are cheap alternatives if you want
something in v1.

---

## Step by step

### Phase A — Apple Developer portal (yours; I can't do these)

These need your account, and several produce secrets I shouldn't handle.

1. **Register the App ID.** Certificates, Identifiers & Profiles → Identifiers → `+` →
   App IDs → App. Description `MyLifos`, Bundle ID **explicit**: `com.mylifos.app` — it
   must match `capacitor.config.ts` exactly. Under Capabilities tick **Sign In with
   Apple**. (Tick Push Notifications too while you're there — free, and saves a revisit
   in 1.1.)
2. **Create a Services ID.** Identifiers → `+` → Services IDs. Description `MyLifos Web`,
   identifier something like `com.mylifos.app.web`. Enable Sign In with Apple → Configure
   → primary App ID `com.mylifos.app`, domain `mylifos.com`, return URL
   `https://www.mylifos.com/auth/apple/callback`.
3. **Create a Sign in with Apple key.** Keys → `+` → tick Sign In with Apple → Configure →
   primary App ID → Continue → Register. **Download the `.p8` — you get exactly one
   chance.** Note the Key ID, and your Team ID (top right of the portal).
4. **Put the credentials in Railway**, not in the repo: `APPLE_TEAM_ID`, `APPLE_KEY_ID`,
   `APPLE_SERVICE_ID`, and `APPLE_PRIVATE_KEY` (the whole `.p8` contents, newlines and
   all). Never commit the `.p8`.

### Phase B — code (mine)

5. **Bearer-token auth.** Token issued on login, accepted via `Authorization` header
   alongside the existing session check. Website unaffected.
6. **Sign in with Apple.** Server strategy + account linking by email so someone who
   signed up with Google and later uses Apple lands on the same account. Client button
   next to Continue with Google.
7. **Native auth handoff.** The OAuth round trip has to return to the app rather than a
   browser tab — a custom URL scheme, with the token handed back on return.

### Phase C — build and run on a device

8. `npm run build:ios` (needs `.env.ios` with `VITE_API_URL=https://www.mylifos.com`)
9. `npx cap open ios`
10. In Xcode → target **App** → Signing & Capabilities: select your Team; confirm the
    bundle identifier is `com.mylifos.app`; add the **Sign In with Apple** capability.
11. Set **Version** `1.0.0` and **Build** `1`.
12. Run on a real device, not just the simulator — sign in with both Google and Apple,
    and confirm the session survives force-quitting the app.

### Phase D — App Store Connect

13. **Create the app record.** apps → `+` → New App. Platform iOS, name `MyLifos`,
    primary language, bundle ID `com.mylifos.app`, SKU anything stable (`mylifos-ios-1`).
14. **Screenshots.** Required: 6.7" iPhone. Take them on a device or simulator at that
    size. Five or six that show real content — Today, Goals, Recipes, Health, Home.
15. **Privacy nutrition labels.** Be accurate; this is reviewed. You collect: name, email,
    photos, health/fitness, location (city), contacts (if the LinkedIn/Google import is
    used), and user content. Declare linkage to identity, since it's all tied to an
    account.
16. **Privacy policy URL** — `https://www.mylifos.com/privacy`.
17. **Age rating** questionnaire. Note the Bud Bets feature — it's friendly wagering
    rather than gambling, but read the gambling questions carefully and answer honestly.
18. **App Review notes.** Give them a demo account with data already in it. A reviewer
    who lands on empty states will bounce it. Mention that Sign in with Apple is
    supported.
19. **Archive and upload.** Xcode → Product → Archive → Distribute App → App Store
    Connect.
20. **Submit.** Expect a rejection or two; 4.8 and privacy labels are the usual causes,
    and both are addressed above.

---

## Honest risks

- **Sign in with Apple is fiddly.** Apple returns the user's name *only on first
  authorisation*, and may relay a private email. The account-linking logic has to handle
  a returning user who gives you nothing but a stable subject id.
- **4.2 minimum functionality.** Bundled assets and native chrome should carry it, but if
  a reviewer sees a web app in a shell, push in 1.1 is the strongest answer.
- **Session longevity.** A 7-day cookie is fine on the web and annoying in an app. Worth
  a longer-lived token with refresh before you have real users.
- **First submission takes longer than the work.** Budget for review round trips rather
  than assuming a clean first pass.
