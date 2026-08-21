# App Store listing copy — MyLifos

Drafted from what the app actually does, and matched to the landing page's positioning
("Stop juggling apps. Your whole life on one screen") so the store and the site tell the
same story.

Every character limit below is Apple's, and each field is counted.

---

## App Name — 30 char limit

**`MyLifos`** *(7)*

Keep it plain. Apple allows a subtitle-style suffix like "MyLifos: Life Organizer", and it
does help search, but it reads like an app that doesn't trust its own name. The subtitle
field exists for exactly that job and is weighted for search too.

---

## Subtitle — 30 char limit

**`Your whole life, one app`** *(24)*

Alternatives, all within limit:

| Option | Chars | Note |
|---|---|---|
| Your whole life, one app | 24 | Recommended — echoes the landing page |
| Goals, habits, health, home | 27 | More searchable, less memorable |
| Stop juggling apps | 18 | Punchy, but states the problem not the product |
| One app for your whole life | 27 | Same idea, weaker rhythm |

---

## Promotional Text — 170 char limit

Editable **without submitting a new build**, so this is the field to change seasonally.

**Launch version** *(158)*

> Goals, tasks, habits, workouts, meals, books, budget, home projects — finally in one
> place instead of nine. Private by default. Share only what you choose.

---

## Keywords — 100 char limit, comma-separated, no spaces after commas

**`organizer,goals,habits,tracker,planner,journal,routine,productivity,fitness,meal,budget,chores`** *(95)*

Rules that catch people out:
- Do **not** repeat the app name or subtitle words — Apple already indexes those, so
  repeating them wastes characters.
- No spaces after commas; a space costs a character and buys nothing.
- Singular over plural where possible; Apple matches stems.
- Don't use competitor names — it's against the guidelines and gets flagged.
- `life` was dropped: it already appears in the subtitle, so Apple indexes it either way.
  The freed characters went to `chores`, which nothing else covers.

---

## Description — 4000 char limit

> **Your whole life, on one screen.**
>
> Most of us run our lives across nine different apps. Goals in one, habits in another,
> workouts somewhere else, recipes bookmarked in a browser, and the household stuff on a
> note nobody reads. MyLifos puts it in one place.
>
> **PLAN**
> Set goals with real key results and track progress by quarter. Break them into projects
> and tasks. Build habits and keep streaks. See everything due today on one screen, with a
> daily plan that groups errands so you're not crossing town twice.
>
> **HEALTH**
> Log workouts and build training plans. Track weight, sleep, vitals and water. Set
> nutrition targets and log meals against them. Save recipes, plan the week, and generate
> the shopping list from what you actually planned to cook.
>
> **RECIPES**
> Import a recipe from any URL, or browse over 1,600 built in. Plan meals across the week
> and turn that plan into a grocery list in one tap.
>
> **HOME AND MONEY**
> Chores that reschedule themselves when life gets in the way. Home projects, appliances
> and maintenance. Budget categories, transactions and subscriptions in one view.
>
> **LIBRARY**
> Books with reading sessions and goals. Films and shows. Music. Art. The things you meant
> to get to, in a list you'll actually revisit.
>
> **PEOPLE**
> Keep track of the people who matter — birthdays, when you last spoke, who to reach out
> to. Share a section with a friend or partner, or recommend a book or recipe directly.
>
> **PRIVATE BY DEFAULT**
> Nothing you write is visible to anyone unless you choose to share it, and sharing is set
> per section. Your prayer list can't be shared at all. Export everything as a single file
> whenever you want, or delete your account and all of it, permanently, from Settings.
>
> No ads. No trackers. No selling your data.

*(~1,850 characters — well inside the limit, and deliberately so. The first three lines are
all most people read before deciding to tap "more".)*

---

## What's New — first version

> First release. Goals with key results, habits, health and nutrition tracking, 1,600+
> recipes with meal planning and shopping lists, home and budget management, a personal
> library, and daily notifications to keep it all moving.

---

## Other fields

| Field | Value |
|---|---|
| Support URL | `https://www.mylifos.com` *(needs a contact route — see below)* |
| Marketing URL | `https://www.mylifos.com` |
| Privacy Policy URL | `https://www.mylifos.com/privacy` |
| Primary Category | Productivity |
| Secondary Category | Lifestyle |
| Age Rating | 13+ (as calculated) |
| Content Rights | Yes — the app displays third-party content (TMDB artwork, book covers, scripture text) |

**Support URL is worth a moment.** Apple expects a page where a user can actually get help.
The landing page isn't that. Either add a short `/support` page with an email address, or
point this at `mailto:` — a real contact route, since App Review does check.

---

## Review notes — paste into App Store Connect

> MyLifos is a personal life-management app. All content is private to the account by
> default; sharing is opt-in per section.
>
> **Account deletion:** Settings → Danger Zone → Delete account. Permanently removes the
> account and all associated data.
>
> **Sign-in:** Sign in with Apple, Google, and email/password are all supported.
>
> **"Bud Bets" involves no money.** It is a social feature for friendly wagers between
> friends — the stake is a free-text forfeit such as "loser buys dinner". The app has no
> payment processing, no virtual currency, and no way to transfer anything of value.
>
> **AI features** (meal and trip suggestions, weekly planning) are optional and require the
> user to supply their own Anthropic API key in Settings. The app ships with no AI key and
> these features are inactive until one is added.
>
> **Reporting and blocking:** any post, comment or message from another user can be
> reported or its author blocked via the flag icon on the content. Blocked users are hidden
> in both directions and cannot send messages or friend requests. Blocked accounts are
> managed in Settings.
>
> The app contains no advertising, no analytics SDKs and no third-party trackers.
>
> **Demo account:** <add credentials before submitting>

**Add a demo account before you submit.** A reviewer who can't get past the login screen
rejects on Guideline 2.1, and it's the single most common avoidable rejection. Seed it with
enough data that the app doesn't look empty — the fake profile you're building for
screenshots would do the job twice over.
