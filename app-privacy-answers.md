# App Privacy questionnaire — MyLifos

Answers for App Store Connect → App Privacy. Derived from `shared/schema.ts` and the server
routes, not from a template, so they match `privacy.html` — Apple cross-checks the two and a
contradiction is a rejection.

**The rule that catches people out:** "collect" in Apple's sense means the data leaves the
device to your server, even if only you can ever read it again. Everything MyLifos stores is
on the server, so almost all of it is collected. It is *not* "tracking" unless it is linked to
third-party data for advertising — which MyLifos does not do anywhere.

---

## Top-level answers

| Question | Answer |
|---|---|
| Do you or your third-party partners collect data from this app? | **Yes** |
| Do you use data for tracking? (as Apple defines it) | **No** — no ads, no data brokers, no cross-app linking, no analytics SDKs |

---

## Data types to declare

For every type below: **Linked to the user — Yes** (it is stored against an account) and
**Used for tracking — No**. The purpose is **App Functionality** unless noted.

### Contact Info
- **Name** — from Apple/Google sign-in or entered at registration
- **Email Address** — same. Note: Sign in with Apple relay addresses count here too
- **Phone Number** — only via imported contacts (Google/LinkedIn/Facebook)
- **Physical Address** — saved spots store street addresses

### Health & Fitness
- **Health** — weight and other metrics, sleep logs, medications with dosage and prescriber, care providers, body-composition check-ins
- **Fitness** — workouts, workout plans and logs, water intake

### Financial Info
- **Other Financial Info** — budget categories, transactions, receipts, subscriptions
  (declare this even though there is no payment processing — Apple's category covers
  financial information generally)

### Location
- **Coarse Location** — saved spots, trips and visited cities include cities and addresses
  - MyLifos does **not** use device GPS. This is user-typed location data. Declare it anyway;
    it is still location information about the user.

### User Content
- **Photos or Videos** — uploaded images (profile, art, recipes, child memories)
- **Other User Content** — journal entries, goals, tasks, habits, notes, reviews, prayer list, sermon and sacred-text notes, political positions and debate posts, recipes, children's milestones and memories
- **Emails or Text Messages** — direct messages between MyLifos users

### Contacts
- **Contacts** — the People section, plus contacts imported from Google, LinkedIn or Facebook

### Identifiers
- **User ID** — account identifier
- **Device ID** — APNs push token, only when notifications are enabled

### Usage Data
- **Product Interaction** — last-active timestamp, used to count active users
  - Purpose: **Analytics** (this is the only Analytics-purpose item)

### Diagnostics
- **Other Diagnostic Data** — server request logs (method, path, status, timing)
  - Purpose: **App Functionality**
  - Response bodies are deliberately never logged

---

## Data types NOT collected — answer No

- Precise Location (no GPS)
- Payment Info (no payment processing)
- Credit Info, Sensitive Info as Apple defines it for *advertising* purposes
- Search History, Browsing History
- Advertising Data
- Crash Data, Performance Data (no crash-reporting SDK installed)
- Audio Data, Gameplay Content, Customer Support, Other Data Types

---

## Points reviewers commonly probe

**Sensitive content and Guideline 1.1.** The app stores religious practices, political
positions, and medical information. That is fine — the user enters it about themselves — but
be ready to say in review notes that it is private by default, never shared without an
explicit per-section setting, and that the prayer list cannot be shared at all.

**Children's data and the Kids Category.** The Kids section holds children's names, birthdays
and milestones. Do **not** select the Kids Category for this app: it is designed for the adult
account holder, and the Kids Category brings requirements (no external links, no third-party
analytics, parental gates) MyLifos would fail. Age rating should be **17+** or **13+**, and
17+ is the safer call given the Politics section holds user-generated debate content.

**Account deletion — Guideline 5.1.1(v).** Required and present: Settings → Danger Zone →
Delete account, hitting `DELETE /api/me`. Point the reviewer at it in the review notes; this
is one of the most common rejections and it is already satisfied.

**Sign in with Apple — Guideline 4.8.** Required because Google Sign-In is offered. Present,
and equally prominent on the login screen.

**AI features.** Optional and require the user's own Anthropic API key; there is no
server-side key and no AI feature runs without one. Worth one line in review notes so it isn't
mistaken for undisclosed third-party data sharing.

**Third-party content lookups.** TMDB, Google Books, Last.fm, Ticketmaster, scripture APIs and
similar receive **search terms only** — no user identity. This is why they are not listed as
data-sharing partners.

---

## Review notes — draft to paste into App Store Connect

> MyLifos is a personal life-management app. All content is private to the account by default;
> sharing is opt-in per section and off unless the user turns it on.
>
> Account deletion: Settings → Danger Zone → Delete account. This permanently removes the
> account and all associated data.
>
> Sign in with Apple, Google Sign-In and email/password are all supported.
>
> AI-assisted features (meal and trip suggestions, weekly planning) are optional and require
> the user to supply their own Anthropic API key in Settings. The app ships with no AI key and
> these features are inactive until one is added.
>
> The app contains no advertising, no analytics SDKs and no third-party trackers.
>
> Demo account: <add credentials before submitting>
