# Activity Calendar Year View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Dashboard's activity calendar from a rolling 365-day strip into a full calendar-year view with a year picker and month labels, and make the grid fill the full width of its card instead of stopping short.

**Architecture:** All changes are confined to `frontend/src/components/ActivityCalendar.jsx` and the `.activity-calendar*` CSS block in `frontend/src/App.css`. No backend or API changes — `GET /tasks/completed` already returns the full unbounded completed-task history, so the component already receives everything it needs via its existing `completedTasks` prop; only the component's internal date-range logic and rendering change. Task 1 switches the date-range model from "365 days ending today" to "Jan 1–Dec 31 of a selected year (or Jan 1–today for the current year)" and adds the year `<select>`. Task 2 adds month labels above the grid and reworks the grid CSS to fill the card's full width — these two are combined into one task because the labels only align correctly once the grid uses the same full-width column template, so shipping them separately would leave a visibly-misaligned intermediate state.

**Tech Stack:** React (function component, `useState`), plain CSS. No new dependencies.

## Global Constraints

- No backend/API changes — `listCompletedTasks` in `mcp-server/tasks.js` already returns full history; `frontend/src/api.js`'s `getCompletedTasks()` is unchanged.
- No palette changes — the five existing level colors (`.activity-calendar-level-0` through `.activity-calendar-level-4`, hardcoded hex, unrelated to `:root` tokens) keep their exact current values; any new UI (year select, month labels) uses only existing `:root` tokens (`--text`, `--muted`, `--border`, `--card`, `--accent`, `--text-sm`).
- `levelForCount`'s thresholds are unchanged — this plan does not touch the 0/1/2-3/4-6/7+ bucketing.
- All date math stays UTC-based (`startOfUtcDay`, `getUTCFullYear`/`getUTCMonth`/`getUTCDate`/`getUTCDay`, `timeZone: 'UTC'` in `toLocaleDateString`) — this codebase has a established convention of avoiding local-timezone day-boundary bugs in this exact file; do not introduce a local-time date method.
- Month labels appear once, above the week-column containing the 1st of that month — not repeated across every column a month spans (matches GitHub's contribution-graph convention, called out explicitly in the design spec).
- The year `<select>` is always populated with at least the current year, plus any other years found in `completedTasks[].updated_at`, sorted descending (most recent first).

---

## File Structure

```
frontend/
  src/
    components/
      ActivityCalendar.jsx   # MODIFY across both tasks — full rewrite of the date-range/rendering logic
    App.css                  # MODIFY across both tasks — the .activity-calendar* rule block (currently lines 774-816)
```

---

### Task 1: Year-based date range + year picker

**Files:**
- Modify: `frontend/src/components/ActivityCalendar.jsx`
- Modify: `frontend/src/App.css:774-816` (the `.activity-calendar*` block)

**Interfaces:**
- Consumes: `completedTasks` prop (array of task objects with `.updated_at`, an ISO datetime string) — unchanged from before, already passed by `frontend/src/components/TodayBoard.jsx:129` (`<ActivityCalendar completedTasks={completedTasks} />`), no caller change needed.
- Produces: the component now renders a year `<select>` (class `activity-calendar-year-select`) above the grid, and the grid shows the selected year's Jan 1 through (Dec 31, or today for the current year). Internal state `selectedYear` (component-local, not exposed to parents). This task does not yet add month labels or the full-width grid — that's Task 2.

- [ ] **Step 1: Replace the whole component file**

Replace the entire contents of `frontend/src/components/ActivityCalendar.jsx` with:

```jsx
import { useState } from 'react';

function startOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function buildYearWeeks(year, today) {
  const currentYear = today.getUTCFullYear();
  const rangeEnd = year === currentYear ? today : new Date(Date.UTC(year, 11, 31));
  const rangeStart = new Date(Date.UTC(year, 0, 1));

  const start = new Date(rangeStart);
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());

  const end = new Date(rangeEnd);
  end.setUTCDate(end.getUTCDate() + (6 - end.getUTCDay()));

  const days = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    days.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const weeks = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }
  return weeks;
}

function levelForCount(count) {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 6) return 3;
  return 4;
}

function yearsWithData(completedTasks, currentYear) {
  const years = new Set([currentYear]);
  for (const task of completedTasks) {
    if (!task.updated_at) continue;
    years.add(Number(task.updated_at.slice(0, 4)));
  }
  return [...years].sort((a, b) => b - a);
}

export default function ActivityCalendar({ completedTasks }) {
  const today = startOfUtcDay(new Date());
  const currentYear = today.getUTCFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);

  const countsByDate = {};
  for (const task of completedTasks) {
    if (!task.updated_at) continue;
    const key = task.updated_at.slice(0, 10);
    countsByDate[key] = (countsByDate[key] || 0) + 1;
  }

  const years = yearsWithData(completedTasks, currentYear);
  const weeks = buildYearWeeks(selectedYear, today);

  return (
    <div className="activity-calendar" aria-label={`Task completion activity for ${selectedYear}`}>
      <div className="activity-calendar-header">
        <select
          className="activity-calendar-year-select"
          value={selectedYear}
          onChange={(event) => setSelectedYear(Number(event.target.value))}
          aria-label="Select year"
        >
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>
      <div className="activity-calendar-grid">
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className="activity-calendar-week">
            {week.map((day) => {
              const inYear = day.getUTCFullYear() === selectedYear;
              if (!inYear) {
                return <div key={day.toISOString()} className="activity-calendar-day activity-calendar-day-empty" />;
              }
              const key = day.toISOString().slice(0, 10);
              const count = countsByDate[key] || 0;
              const level = levelForCount(count);
              const label = day.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
              const countLabel = count === 1 ? '1 task completed' : `${count} tasks completed`;

              return (
                <div
                  key={key}
                  className={`activity-calendar-day activity-calendar-level-${level}`}
                  title={`${countLabel} on ${label}`}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update the CSS block**

Find the current `.activity-calendar*` block in `frontend/src/App.css` (currently at lines 774-816):

```css
.activity-calendar {
  margin: 12px 0 20px;
  overflow-x: auto;
}

.activity-calendar-grid {
  display: flex;
  gap: 3px;
  width: max-content;
}

.activity-calendar-week {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.activity-calendar-day {
  width: 11px;
  height: 11px;
  border-radius: 2px;
  background: #ebedf0;
}

.activity-calendar-level-0 {
  background: #ebedf0;
}

.activity-calendar-level-1 {
  background: #cfe3fc;
}

.activity-calendar-level-2 {
  background: #9cc6fa;
}

.activity-calendar-level-3 {
  background: #4f96e8;
}

.activity-calendar-level-4 {
  background: #174ea6;
}
```

Replace it with:

```css
.activity-calendar {
  margin: 12px 0 20px;
  overflow-x: auto;
}

.activity-calendar-header {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 6px;
}

.activity-calendar-year-select {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 4px 10px;
  font-size: var(--text-sm);
  color: var(--text);
  background: var(--card);
  cursor: pointer;
}

.activity-calendar-year-select:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.activity-calendar-grid {
  display: flex;
  gap: 3px;
  width: max-content;
}

.activity-calendar-week {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.activity-calendar-day {
  width: 11px;
  height: 11px;
  border-radius: 2px;
  background: #ebedf0;
}

.activity-calendar-day-empty {
  background: transparent;
}

.activity-calendar-level-0 {
  background: #ebedf0;
}

.activity-calendar-level-1 {
  background: #cfe3fc;
}

.activity-calendar-level-2 {
  background: #9cc6fa;
}

.activity-calendar-level-3 {
  background: #4f96e8;
}

.activity-calendar-level-4 {
  background: #174ea6;
}
```

(This step keeps the grid itself unchanged — flex layout, fixed 11px cells — since the full-width rework happens in Task 2 alongside month labels, to avoid alignment breaking mid-way.)

- [ ] **Step 3: Run the build to verify no errors**

Run: `cd frontend && npm run build`
Expected: succeeds with no errors or warnings.

- [ ] **Step 4: Manually verify in the browser**

Start the dev server (`cd frontend && npm run dev`), open the Dashboard. Confirm:
- The year dropdown appears above the calendar, top-right, showing the current year selected.
- If `completedTasks` contains any task with an `updated_at` from a previous year, that year appears as an additional option; picking it shows that year's Jan 1–Dec 31 grid (hover a day near the start/end of the year to confirm the tooltip date matches).
- Picking the current year again shows days only up to today (no colored cells for future dates).
- No console errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ActivityCalendar.jsx frontend/src/App.css
git commit -m "feat: switch activity calendar to year-based range with year picker"
```

---

### Task 2: Month labels + full-width grid

**Files:**
- Modify: `frontend/src/components/ActivityCalendar.jsx`
- Modify: `frontend/src/App.css` (the `.activity-calendar*` block, as left by Task 1)

**Interfaces:**
- Consumes: `weeks` (array of arrays of `Date`, from Task 1's `buildYearWeeks`), `selectedYear` (Task 1's state).
- Produces: final state of the component — month-label row above the grid, grid spans the full card width with square, capped-size cells. Nothing downstream consumes this component's internals; this is the last task in the plan.

- [ ] **Step 1: Replace the whole component file**

Replace the entire contents of `frontend/src/components/ActivityCalendar.jsx` with:

```jsx
import { useState } from 'react';

function startOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function buildYearWeeks(year, today) {
  const currentYear = today.getUTCFullYear();
  const rangeEnd = year === currentYear ? today : new Date(Date.UTC(year, 11, 31));
  const rangeStart = new Date(Date.UTC(year, 0, 1));

  const start = new Date(rangeStart);
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());

  const end = new Date(rangeEnd);
  end.setUTCDate(end.getUTCDate() + (6 - end.getUTCDay()));

  const days = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    days.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const weeks = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }
  return weeks;
}

function levelForCount(count) {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 6) return 3;
  return 4;
}

function yearsWithData(completedTasks, currentYear) {
  const years = new Set([currentYear]);
  for (const task of completedTasks) {
    if (!task.updated_at) continue;
    years.add(Number(task.updated_at.slice(0, 4)));
  }
  return [...years].sort((a, b) => b - a);
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function monthLabelsForWeeks(weeks, year) {
  return weeks.map((week) => {
    const monthStart = week.find((day) => day.getUTCDate() === 1 && day.getUTCFullYear() === year);
    return monthStart ? MONTH_NAMES[monthStart.getUTCMonth()] : '';
  });
}

export default function ActivityCalendar({ completedTasks }) {
  const today = startOfUtcDay(new Date());
  const currentYear = today.getUTCFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);

  const countsByDate = {};
  for (const task of completedTasks) {
    if (!task.updated_at) continue;
    const key = task.updated_at.slice(0, 10);
    countsByDate[key] = (countsByDate[key] || 0) + 1;
  }

  const years = yearsWithData(completedTasks, currentYear);
  const weeks = buildYearWeeks(selectedYear, today);
  const monthLabels = monthLabelsForWeeks(weeks, selectedYear);
  const columnStyle = { gridTemplateColumns: `repeat(${weeks.length}, 1fr)` };

  return (
    <div className="activity-calendar" aria-label={`Task completion activity for ${selectedYear}`}>
      <div className="activity-calendar-header">
        <select
          className="activity-calendar-year-select"
          value={selectedYear}
          onChange={(event) => setSelectedYear(Number(event.target.value))}
          aria-label="Select year"
        >
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>
      <div className="activity-calendar-months" style={columnStyle}>
        {monthLabels.map((label, index) => (
          <span key={index} className="activity-calendar-month-label">
            {label}
          </span>
        ))}
      </div>
      <div className="activity-calendar-grid" style={columnStyle}>
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className="activity-calendar-week">
            {week.map((day) => {
              const inYear = day.getUTCFullYear() === selectedYear;
              if (!inYear) {
                return <div key={day.toISOString()} className="activity-calendar-day activity-calendar-day-empty" />;
              }
              const key = day.toISOString().slice(0, 10);
              const count = countsByDate[key] || 0;
              const level = levelForCount(count);
              const label = day.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
              const countLabel = count === 1 ? '1 task completed' : `${count} tasks completed`;

              return (
                <div
                  key={key}
                  className={`activity-calendar-day activity-calendar-level-${level}`}
                  title={`${countLabel} on ${label}`}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
```

(Only the addition of `MONTH_NAMES`, `monthLabelsForWeeks`, the `monthLabels`/`columnStyle` variables, and the new `.activity-calendar-months` block changed from Task 1's version — everything else is identical.)

- [ ] **Step 2: Update the CSS block**

Find the `.activity-calendar*` block in `frontend/src/App.css` as Task 1 left it:

```css
.activity-calendar {
  margin: 12px 0 20px;
  overflow-x: auto;
}

.activity-calendar-header {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 6px;
}

.activity-calendar-year-select {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 4px 10px;
  font-size: var(--text-sm);
  color: var(--text);
  background: var(--card);
  cursor: pointer;
}

.activity-calendar-year-select:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.activity-calendar-grid {
  display: flex;
  gap: 3px;
  width: max-content;
}

.activity-calendar-week {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.activity-calendar-day {
  width: 11px;
  height: 11px;
  border-radius: 2px;
  background: #ebedf0;
}

.activity-calendar-day-empty {
  background: transparent;
}

.activity-calendar-level-0 {
  background: #ebedf0;
}

.activity-calendar-level-1 {
  background: #cfe3fc;
}

.activity-calendar-level-2 {
  background: #9cc6fa;
}

.activity-calendar-level-3 {
  background: #4f96e8;
}

.activity-calendar-level-4 {
  background: #174ea6;
}
```

Replace it with:

```css
.activity-calendar {
  margin: 12px 0 20px;
  overflow-x: auto;
}

.activity-calendar-header {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 6px;
}

.activity-calendar-year-select {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 4px 10px;
  font-size: var(--text-sm);
  color: var(--text);
  background: var(--card);
  cursor: pointer;
}

.activity-calendar-year-select:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.activity-calendar-months {
  display: grid;
  gap: 3px;
  width: 100%;
  margin-bottom: 4px;
}

.activity-calendar-month-label {
  font-size: var(--text-sm);
  color: var(--muted);
}

.activity-calendar-grid {
  display: grid;
  gap: 3px;
  width: 100%;
}

.activity-calendar-week {
  display: grid;
  grid-template-rows: repeat(7, 1fr);
  gap: 3px;
}

.activity-calendar-day {
  width: 100%;
  aspect-ratio: 1;
  max-width: 18px;
  max-height: 18px;
  border-radius: 2px;
  background: #ebedf0;
}

.activity-calendar-day-empty {
  background: transparent;
}

.activity-calendar-level-0 {
  background: #ebedf0;
}

.activity-calendar-level-1 {
  background: #cfe3fc;
}

.activity-calendar-level-2 {
  background: #9cc6fa;
}

.activity-calendar-level-3 {
  background: #4f96e8;
}

.activity-calendar-level-4 {
  background: #174ea6;
}
```

- [ ] **Step 3: Run the build to verify no errors**

Run: `cd frontend && npm run build`
Expected: succeeds with no errors or warnings.

- [ ] **Step 4: Manually verify in the browser**

Start the dev server (`cd frontend && npm run dev`) if not already running, open the Dashboard, and check:
- The grid now visually reaches the right edge of the calendar card, on a normal desktop-width window — no dead space on the right.
- Above the grid, month names (Jan, Feb, …) appear, each aligned directly above the week-column where that month's 1st falls — spot-check by hovering the day cell directly below a label and confirming its tooltip date is within the first few days of that month.
- Switching the year dropdown updates both the grid and the month labels together, staying aligned.
- Resize the browser window narrower (or use responsive/mobile emulation) — confirm the calendar still renders sensibly (cells shrink with the card, or the existing `overflow-x: auto` on `.activity-calendar` kicks in without breaking the page layout) at the existing 900px and 640px breakpoints.
- No console errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ActivityCalendar.jsx frontend/src/App.css
git commit -m "feat: add month labels and full-width layout to activity calendar"
```

---

## Self-Review Notes

- **Spec coverage:** §1 Data & range model → Task 1. §2 Year dropdown → Task 1. §3 Month labels → Task 2. §4 Full-width layout → Task 2. Out-of-scope items (backend changes, color-scale changes, Kanban board, sidebar Lists fix) are untouched by both tasks, consistent with the spec.
- **Placeholder scan:** No TBD/TODO; every step has complete code, both for the JS logic and every CSS rule (including the ones that don't change between the two tasks' CSS blocks — repeated in full each time so the find/replace is unambiguous).
- **Type/name consistency:** `buildYearWeeks(year, today)`, `yearsWithData(completedTasks, currentYear)`, `levelForCount(count)`, `selectedYear` state, and CSS classes `activity-calendar-header`/`-year-select`/`-months`/`-month-label`/`-grid`/`-week`/`-day`/`-day-empty`/`-level-N` are introduced in Task 1 (where applicable) and reused with identical names/signatures in Task 2 — no renames across tasks.
- **Alignment risk called out explicitly:** Task 2's docstring-equivalent (its "Architecture" note) explains why month labels and the full-width grid ship together rather than as separate tasks — shipping the month-label row before the grid uses matching full-width columns would produce visibly misaligned labels, which a task reviewer would rightly flag. Combining them avoids that dead end.
- **Day.getUTCDate() === 1 guard, not <= 7:** the month-label logic keys off the exact day the month starts (not "any day in the first week"), because if a month's 1st falls on a Saturday, the following week-column also contains days 2-7 of that month — using `<= 7` would double-label two adjacent columns with the same month name. Using `=== 1` guarantees exactly one column per month is labeled. The `getUTCFullYear() === year` check on top of that prevents padding days from an adjacent year (e.g. early-January padding days appended after a past year's Dec 31) from being mistaken for that year's own month start.
