# Activity Calendar Year View — Design Spec

## Context

The Dashboard's activity calendar (`frontend/src/components/ActivityCalendar.jsx`) currently shows a rolling 365-day window ending today, rendered as fixed 11px squares with `width: max-content` — the grid stops short of the card's right edge on any screen wider than the grid itself, leaving dead space. There is no way to see completion activity from a previous year, and no visual marker for where one month ends and the next begins.

This spec covers three changes, all confined to `ActivityCalendar.jsx` and its CSS in `frontend/src/App.css`:

1. Switch from a rolling 365-day window to a full calendar-year view (Jan 1 – Dec 31, or Jan 1 – today for the current year), selectable via a year dropdown.
2. Add a month-label row above the grid, marking where each new month starts.
3. Make the grid fill the full width of its container, with no dead space on the right.

A fourth, unrelated change — repositioning the sidebar's "Lists" section so it sits directly below the Timeline nav item instead of being pushed to the bottom via `margin-top: auto` — is a small, unambiguous CSS fix applied directly, outside this spec's scope.

No backend changes are needed: `GET /tasks/completed` (`listCompletedTasks` in `mcp-server/tasks.js`) already returns the full unbounded completed-task history in one call, so the frontend already has everything needed to compute which years have data.

## 1. Data & range model

`ActivityCalendar` owns its own `selectedYear` state (`useState`, defaulting to the current UTC year) — no prop drilling from `TodayBoard`, since `completedTasks` (already passed in) covers full history.

For the selected year:
- If `selectedYear === currentYear`: the grid spans Jan 1 → today (UTC), same "don't show future days" behavior as today's rolling window.
- If `selectedYear < currentYear`: the grid spans Jan 1 → Dec 31 of that year, in full.
- `selectedYear > currentYear` is not reachable — the dropdown never offers future years.

The grid always starts its first row on the Sunday on or before Jan 1, and ends on the Saturday on or after the range's end date, so full weeks render (matching the existing padding logic, just anchored to Jan 1 instead of "365 days back").

## 2. Year dropdown

A `<select>` populated from the distinct years present in `completedTasks[].updated_at` (parsed as UTC), always unioned with the current year (so the dropdown is never empty, even with zero completed tasks). Sorted descending (most recent year first). Changing the selection updates `selectedYear`, which recomputes the grid and month labels.

Placement: top-right of the calendar card, in the same header row as the month labels (see Layout below).

## 3. Month labels

A label row sits above the grid, sharing the same column structure (one grid column per week). For each week-column, if any day in that week is the 1st–7th of a new month AND that month's first day falls within the column, render the short month name (`Jan`, `Feb`, …) in that column; otherwise the column's label cell is empty. This mirrors GitHub's contribution-graph convention: a label appears once, above the column where that month begins, not repeated across every column the month spans.

## 4. Full-width layout

- `.activity-calendar-grid` changes from `display: flex; width: max-content` to `display: grid; grid-template-columns: repeat(<weekCount>, 1fr); width: 100%;` — one column per week, filling the card's full width.
- `.activity-calendar-week` becomes a grid column (7 rows via `display: grid; grid-template-rows: repeat(7, 1fr); gap` matching the row gap) instead of a flex column, so cells align across both axes.
- `.activity-calendar-day` drops its fixed `width/height: 11px` in favor of `aspect-ratio: 1` (stays square) with `max-width: 18px` / `max-height: 18px` (prevents cells from growing absurdly tall on ultra-wide monitors — beyond that cap, the grid's own `1fr` columns simply carry extra gap rather than growing cells further, so the grid still reaches the right edge either way).
- The month-label row uses the same `repeat(<weekCount>, 1fr)` column template so labels align directly above their week-column.
- `.activity-calendar` keeps `overflow-x: auto` as a safety net for very narrow viewports (mobile breakpoint), but on any normal desktop width the grid should no longer need to scroll — it fits and fills the card.

No palette changes — month labels and the dropdown use existing `--text`, `--muted`, `--border`, `--card`, `--accent` tokens; the five activity-level color classes (`.activity-calendar-level-0` through `.activity-calendar-level-4`, currently hardcoded hex values, unrelated to `:root` tokens) are untouched.

## Out of scope

- Backend changes (none needed, see Context).
- Changing the 5-level color scale or its thresholds (`levelForCount`).
- Any change to the Kanban board below the calendar.
- The sidebar "Lists" position fix (applied directly, not part of this spec's implementation plan).
