# Goals page — UX audit

Audited against the live build on 19 Aug 2026, desktop (1257px) and mobile (390px),
plus `client/src/pages/GoalsPage.tsx`. Findings are ordered by how much they cost the
user, not by how hard they are to fix.

---

## The one-sentence version

The Goals page opens on an empty list, shows a count that disagrees with what's on
screen, and devotes the entire detail pane to nine cards that are mostly asking the
user to do setup chores rather than showing them their goal.

---

## P0 — The page misrepresents its own contents

These three compound into a bad first impression: you land on Goals and see "0", an
empty column, and a goal in the detail pane that isn't in the list.

### 1. The default tab is empty

`horizonTab` defaults to `"quarter"`, but nothing is in Q3 2026 yet, so the page opens
on "Nothing set for Q3 2026 yet" while four goals sit one tab over.

This one is mine — I made the quarter tab open first on the reasoning that the quarter
is where execution happens. That reasoning holds once there *are* quarterly goals and
is wrong on day one, which is exactly when it matters most.

**Fix:** default to the first tab that has goals, preferring quarter when it's populated.
Roughly: `quarter → this_year → long_term → vision`, first non-empty wins. Users who set
quarterly goals still land on the quarter; nobody lands on a wall.

### 2. The list header says "0" while four rows are visible

`GOALS 0` comes from `filteredGoals.length` (line 1218), but the cards below it —
Nutrition Goals, Beefcake, Chess, Hobby Goals — render unconditionally, outside the tab
filter entirely. One column is running two different list semantics under one count.

**Fix:** either count everything the column shows, or separate the two. The second is
better — see P2/#8, these aren't the same kind of object.

### 3. The detail pane shows a goal that isn't in the list

`selectedGoal` resolves against the unfiltered `goals` array (line 1113), and the
auto-select effect picks `goals[0]` (line 977) regardless of the active tab. So the
detail pane routinely displays a goal the list isn't showing — visible in the audit:
Q3 tab empty, "Have Tauxpas be a full time business" in the detail pane.

**Fix:** auto-select `filteredGoals[0]`, and when the tab changes, either clear the
selection or switch to a goal within that tab. Selection should never point outside the
visible list.

---

## P1 — The detail pane is a chore list, not a goal view

### 4. Nine stacked cards, and most are empty prompts

Current order: Why it matters · Execution · Key results · Accountability · Rolls up to ·
Supporting goals · Linked Habits · Connections · Linked Projects.

On a new goal, eight of the nine are soliciting input: "Add why", "Add task",
"Use key results", "Add buddy", "Add stakes", "Link to a longer-horizon goal",
"No connections yet", "No linked projects yet". The page reads as a backlog of setup
work the user hasn't done. Every card is an unfinished task staring back at them.

**Fix — progressive disclosure.** Three fixed zones, everything else on demand:

1. **Progress** — the bar, the number, and how it's derived
2. **Execution** — next action and current project (the only thing that changes daily)
3. **Context** — one collapsed section holding why/habits/connections/roll-up/supporting

Empty optional sections shouldn't render as cards at all. Replace the eight prompts with
a single low-key "Add to this goal ▾" menu listing what isn't set yet. Same capability,
one row instead of eight cards.

### 5. Progress is rendered three times on one screen

Header bar (0%), "Goal progress 0 / 100" inside Execution, and again on each supporting
goal. Three renderings of one fact, none obviously authoritative.

**Fix:** one progress display, at the top, next to the title. Remove the duplicate inside
Execution.

### 6. Orphaned "3-Year Goal" label

Between the Accountability card and "Rolls up to" there's a bare `📅 3-Year Goal` label
sitting outside any card, aligned to nothing. It reads like a rendering bug.

**Fix:** move the horizon into the title block as a chip beside the category and priority,
where the other metadata already lives.

### 7. No visual hierarchy

Every card shares one border, one padding value, one title size. Nothing signals that
"Execution" matters more than "Connections". The eye has no entry point.

**Fix:** let the primary zone carry visual weight (larger type, filled background) and
demote context to plain rows on the page background, no card chrome.

---

## P2 — The list column

### 8. Four different object types in one list

Real goals sit alongside Nutrition Goals (a macro target), Beefcake (a workout plan),
Chess: 800 → 1200 ELO (a hobby plan) and Hobby Goals (a group). Their affordances differ
too — some rows have pencil + trash, some have a chevron, some have progress bars, some
don't. The column looks broken rather than varied.

**Fix:** a labelled divider — goals above, a "Trackers" or "Plans" group below — and one
consistent row treatment per group. This also resolves #2's count problem.

### 9. Tabs are clipped

Four tabs don't fit the 288px column: "Vision" is cut off at the column edge on desktop.
The container scrolls horizontally, but there's no visual hint, so the tab looks missing
rather than scrollable.

**Fix:** shorten the labels (`Q3 · Year · Long · Vision`), drop the emoji, or use a
segmented control that wraps. The quarter tab is the longest and the newest — it's what
pushed Vision off the edge.

---

## P3 — Header

### 10. Two competing primary actions

"Browse Goals & Plans" and "+ Goal" sit adjacent with near-equal weight. The first is
discovery, the second is creation.

**Fix:** "+ Goal" solid primary, "Browse" a text link.

### 11. The subtitle says nothing

"Long-term outcomes and progress" is filler under a heading that already says Goals.
Better: the actual state — "4 goals · 1 due this quarter" — or nothing.

---

## Suggested order

1. **P0 (#1–3)** — small, self-contained, and they're the difference between the page
   looking broken and looking fine. Worth doing on their own.
2. **#4 + #5 + #6** — the detail pane restructure. The largest change and the one that
   actually addresses "cluttered".
3. **#8 + #9** — the list column.
4. **P3** — trim.

Items 1–3 are bug-shaped and I'd fix them without further discussion. Item 4 is a design
decision about what the detail pane is *for*, and is worth agreeing on before I move code.
