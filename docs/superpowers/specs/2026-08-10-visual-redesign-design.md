# Visual Redesign: Sidebar Restructure, Dashboard Activity Calendar, Polish Pass

## Purpose

The last of six sub-projects from the productivity-management redesign, originally scoped as "a UI/UX design pass over the finished layout." In practice it turned out to be bigger than styling: a real structural change to the primary navigation (the current `NavRail` reads as a floating card, not app chrome, and the separate `ListsView` list-picker panel eats a third of the horizontal space), a new feature (a GitHub-style activity calendar), and a genuine visual polish pass. This spec covers all three, sequenced so each builds on the last: the sidebar restructure first (everything else nests inside it), then the Dashboard/calendar feature, then a pure-CSS polish pass over the result.

## Scope Decisions (from brainstorming)

- **Primary nav becomes a true full-height sidebar** — flush left, no card border, spans the viewport — not a top navbar (a top navbar was considered and declined: it costs vertical space and is a bigger structural change to every page).
- **The separate list-picker panel (`ListsView`'s `.lists-sidebar` card) is eliminated.** Its contents (create/rename/delete, the multi-select checkboxes) move into the primary sidebar as an expandable "Lists" section, with lists rendered as rows directly in the sidebar. This reclaims the panel that was previously eating a third of the window.
- **Multi-select is preserved**, just relocated — checking several lists in the sidebar still shows them side-by-side in the main content area, exactly as today.
- **A new search box filters the sidebar's list rows by name** (client-side substring filter, not a task search — task search was explicitly declined).
- **"Today" is renamed to "Dashboard"** throughout (sidebar label, internal section id, any user-facing text).
- **The Dashboard gains a GitHub-style contribution calendar** above the existing three-column Kanban board: one colored square per day, last 12 months, intensity driven by count of tasks marked `done` that day. Computed **client-side** from data the app already fetches (`listCompletedTasks`/`getCompletedTasks`) — no new backend endpoint. Hovering a square shows the date and count.
- **The Kanban board itself is unchanged** — same three columns, same drag-and-drop, same click-to-advance — just relocated below the new calendar section.
- **Visual polish stays within the current palette** — no new accent color or type family, just a defined spacing/type scale and cleaner interactive states, applied over the finished structural layout from the first two sections. This is intentionally last, so it doesn't get redone when the layout underneath it changes.

## Architecture

No backend changes anywhere in this spec. All three sections are frontend-only:

```
frontend/src/
  components/
    PrimarySidebar.jsx      # NEW — replaces NavRail.jsx; full-height sidebar with
                              # nav sections AND the merged Lists picker (search +
                              # multi-select checkboxes) as an expandable section
    ListsView.jsx             # MODIFIED — loses its own list-picker sidebar/CRUD UI
                                # (moves into PrimarySidebar), keeps the task-display
                                # side (the .tasks-card / .list-task-grid content)
    ActivityCalendar.jsx       # NEW — GitHub-style heatmap, consumes the same
                                 # completed-tasks data TodayBoard/Dashboard already
                                 # has, purely a rendering component (data in, grid out)
    TodayBoard.jsx              # MODIFIED — renamed concept to "Dashboard"; renders
                                  # ActivityCalendar above its existing three columns
  App.jsx                       # MODIFIED — renders PrimarySidebar instead of
                                  # NavRail; 'today' section id becomes 'dashboard'
                                  # (or kept as internal id with just the label
                                  # changed — see Section 2 below for the exact
                                  # decision)
  App.css                        # MODIFIED across all three sections — sidebar
                                   # layout, list rows, calendar grid, then in the
                                   # final section a broader token/spacing pass
```

## Section 1: Primary Sidebar Restructure

**New component: `PrimarySidebar.jsx`** (replaces `NavRail.jsx`, which is deleted). Renders:
- The four section links (Dashboard, Lists, Completed, Timeline) as before, but styled as a full-height, edge-to-edge sidebar (`position: sticky` or full-height flex child of `.app-shell`, no card border/shadow/border-radius — those visual treatments move to individual content panels, not the nav chrome itself).
- Directly below the section links, an expandable **Lists** subsection (expanded whenever the "Lists" section is active, per the existing `activeSection` state — no new top-level state needed): a search input (filters the list rows below it by substring match on name, client-side, case-insensitive), the existing "+ New list" create row, and each list as a row with its visibility checkbox + name + rename/delete actions — this is the exact UI currently in `ListsView.jsx`'s `<aside className="lists-sidebar">`, relocated wholesale into this component.

**`ListsView.jsx` changes:** everything currently inside its `<aside className="lists-sidebar">` block (list CRUD, the checkbox list, the create-row) moves to `PrimarySidebar.jsx`. `ListsView.jsx` keeps its state (`lists`, `checkedListIds`, `allTasks`, the poll effects, all the task-mutation handlers) — it doesn't stop owning this data, it just stops rendering the picker UI for it. Since `PrimarySidebar` needs to read/write `checkedListIds` and trigger list CRUD, and `ListsView` needs to read `checkedListIds` to know what to render, this list-management state moves up to `App.jsx` and is passed down as props to both `PrimarySidebar` (for the picker UI) and `ListsView` (for the task-display UI) — the alternative (leaving state in `ListsView` and reaching into a sibling component) isn't possible in React without lifting state, so this lift is required by the restructure, not optional scope creep.

**Search implementation:** a new `listSearchQuery` string, local to `PrimarySidebar` (view-only filtering doesn't need to live higher — nothing outside this component needs to know the search text). Filters the sidebar's list rows: `lists.filter(list => list.name.toLowerCase().includes(query.toLowerCase()))`. Does not affect `checkedListIds` or what's shown in the main content area — a list stays "checked" (visible in the task area) even if a search temporarily hides its row in the picker.

**CSS:** `.app-shell` changes from the current `220px minmax(0,1fr)` two-column grid to give the sidebar column a full-bleed treatment (no padding/gap around it — the "card" look came from `.nav-rail`'s border/shadow/border-radius/padding on an otherwise-inset element; removing those and letting it span full height removes the card appearance). The old `.lists-view-shell`'s `300px minmax(0,1fr)` inner grid disappears — `ListsView`'s remaining content (the `.tasks-card` task-display area) becomes the sole content of the "Lists" section, given the full content width the picker used to share.

## Section 2: Dashboard Rename + Activity Calendar

**Rename:** `NAV_ITEMS`'s `{ id: 'today', label: 'Today' }` becomes `{ id: 'dashboard', label: 'Dashboard' }` in `PrimarySidebar.jsx`. `App.jsx`'s `activeSection === 'today'` conditionals become `activeSection === 'dashboard'`, and its default state value changes from `'lists'`... actually stays `'lists'` (the default active section is unrelated to this rename — no change there, just the id/label of the renamed section). `TodayBoard.jsx` is not renamed as a file (renaming files invites broken-import churn for no functional benefit) but its internal `aria-label="Today board"` and heading text `<h1 className="tasks-title">Today</h1>` become `aria-label="Dashboard"` and `Dashboard`.

**New component: `ActivityCalendar.jsx`.** Props: `{ completedTasks: Array<task> }` (the same array `TodayBoard`/its data layer already has access to via `getCompletedTasks()` — see Data below). Renders a grid of 52-53 weekly columns × 7 daily rows (a year, GitHub-style), each cell a colored square. Color intensity: bucket each day's completed-task count into 5 levels (0, 1, 2-3, 4-6, 7+ — matching GitHub's rough bucketing shape, tuned for a personal to-do app's realistic daily volume rather than GitHub's commit volume) mapped to 5 shades of the existing `--accent` blue (lightest = 0, darkest = 7+). Hovering a cell shows a tooltip (native `title` attribute is sufficient — no new tooltip component) with the date and count, e.g. "3 tasks completed on Mar 14, 2026".

**Data:** `TodayBoard.jsx` already polls `getTodayTasks()`; it additionally calls `getCompletedTasks()` (already exported from `api.js`, already used by `CompletedView.jsx`) on the same poll cycle, and passes the result to `ActivityCalendar`. The calendar computes its own day-bucketed aggregation internally from the flat task array (a single `reduce` over `updated_at` dates) — this is cheap even at a few hundred completed tasks, well within what a personal task tracker accumulates in a year, so no memoization beyond React's normal re-render behavior is needed.

**Layout:** `TodayBoard.jsx`'s returned JSX gains `<ActivityCalendar completedTasks={completedTasks} />` directly after the `<h1>` heading and before the existing `<div className="kanban-board">` — the calendar sits between the page title and the three columns, per the brainstormed layout.

## Section 3: Visual Polish Pass

Applied last, once Sections 1-2's structure is final. No new component files — pure `App.css` changes:

- **Spacing scale:** introduce `--space-1` through `--space-6` custom properties (e.g. 4/8/12/16/24/32px) and replace the current file's assorted one-off padding/margin/gap values with references to this scale where they logically match one of the six steps. Values that don't cleanly fit the scale stay as-is rather than being forced — this is a consistency pass, not a rewrite of every rule.
- **Type scale:** introduce `--text-sm` / `--text-base` / `--text-lg` / `--text-xl` custom properties and apply them to the current ad-hoc `font-size` values across headings, body text, and meta text, consolidating today's ~8 distinct font-size values down to this 4-step scale.
- **Interactive states:** every clickable element (buttons, list rows, kanban cards, nav items) gets a consistent hover treatment (background shift using the existing `--hover` token, already defined but inconsistently applied today) and a visible `:focus-visible` outline (currently absent almost everywhere — a real accessibility gap, not just polish) using the existing `--accent` color.
- **No palette changes** — `--bg`, `--card`, `--border`, `--text`, `--muted`, `--accent`, `--error-bg`, `--error-text` keep their current values. This section only touches spacing, type, and state consistency.

## Error Handling

No new error paths — Section 1 moves existing state/handlers without changing their logic (list CRUD's existing try/catch/error-banner pattern is unchanged, just relocated). Section 2's `ActivityCalendar` is a pure rendering component with no network calls of its own (it receives data as a prop) — if `getCompletedTasks()` fails, `TodayBoard`'s existing error banner already covers it, and `ActivityCalendar` simply renders an all-empty (lightest-shade) grid when passed an empty array, no special-case error UI needed. Section 3 introduces no new error paths at all (CSS only).

## Testing

- **No automated frontend tests** — consistent with this project's established convention (no test runner configured for `frontend/`). All three sections verify manually: Section 1 via a full click-through of list search/multi-select/CRUD relocated into the sidebar; Section 2 via seeding a few days of completed tasks (already have real historical data from this session's work) and confirming the calendar's bucketing/coloring/tooltip are correct against manually-counted expected values; Section 3 via visual inspection across the app's four sections plus a `:focus-visible` keyboard-tab check.
- **No backend tests needed** — no backend files are touched by any of the three sections, so `npm test`'s existing 75 tests are the regression check (confirming this frontend-only work didn't somehow break anything they exercise, though none of them touch frontend code) — each plan still runs `npm test` after its changes as a cheap "did I break anything on the other side of the fence" sanity check.

## Out of Scope

- Any backend/database change — this entire spec is frontend-only.
- A dedicated backend aggregation endpoint for the activity calendar — client-side aggregation is sufficient at this scale (see Section 2: Data).
- Task search (declined during brainstorming — only list-name search is in scope).
- A new color palette or type family (declined — Section 3 is spacing/type-scale/state consistency only, not a rebrand).
- Dark mode (not raised during brainstorming; the existing single light theme is unchanged).
- Any change to the Kanban board's own interior (columns, drag-and-drop, click-to-advance) — it only moves position on the page, per Section 2.
