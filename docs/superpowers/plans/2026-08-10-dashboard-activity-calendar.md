# Dashboard Rename + Activity Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename "Today" to "Dashboard" throughout the UI, and add a GitHub-style contribution calendar (one colored square per day, last 12 months, intensity driven by tasks completed that day) above the existing Kanban board.

**Architecture:** A new `ActivityCalendar.jsx` is a pure rendering component — it takes a `completedTasks` array as a prop and does all date-bucketing internally; it has no network calls of its own. `TodayBoard.jsx` (not renamed as a file — only its user-facing text changes) adds a second `getCompletedTasks()` call to its existing 3-second poll and passes the result down. The "Today" → "Dashboard" rename touches three files: the nav item's id/label (`PrimarySidebar.jsx`), the section-matching conditional (`App.jsx`), and the board's own heading/aria-label (`TodayBoard.jsx`).

**Tech Stack:** Same as the rest of the project — React, plain CSS, no new dependencies. No backend changes — the calendar is computed client-side from data the app already fetches (`getCompletedTasks`, already used by `CompletedView.jsx`).

## Global Constraints

- "Activity" = tasks marked `done` that day, counted from `updated_at` (already the same signal `CompletedView`/`listCompletedTasks` use — no new backend query).
- 12 months of history, GitHub-style: weekly columns, 7 rows (Sun-Sat) per column.
- Date bucketing is done entirely in UTC terms — both the calendar's own day grid and the raw `updated_at` strings from SQLite are UTC, so comparing them directly (rather than converting through the browser's local timezone) avoids a day-boundary mismatch. This is consistent with the existing, already-documented UTC-day-boundary behavior elsewhere in this codebase (`listTodayTasks`'s Done-column rollover) — not a new inconsistency.
- Hover tooltip uses the native `title` attribute — no new tooltip component.
- Color intensity uses 5 shades of the existing `--accent` blue — no new palette.
- The Kanban board's own interior (columns, drag-and-drop, click-to-advance) is unchanged — the calendar is inserted above it, nothing about the board itself changes.
- `TodayBoard.jsx` the file is NOT renamed — only user-facing text (`aria-label`, heading) changes to "Dashboard". Renaming the file would churn every import for no functional benefit.
- No automated frontend tests exist in this project (no test runner configured) — verification is manual, per [Testing](../../testing.md).

---

## File Structure

```
frontend/
  src/
    App.jsx                            # MODIFY: 'today' → 'dashboard' section id
    App.css                             # MODIFY: new .activity-calendar* rules
    components/
      PrimarySidebar.jsx                 # MODIFY: NAV_ITEMS 'today'/'Today' → 'dashboard'/'Dashboard'
      TodayBoard.jsx                      # MODIFY: heading/aria-label text, add getCompletedTasks
                                            # poll + render <ActivityCalendar> above the board
      ActivityCalendar.jsx                 # CREATE: pure rendering component, day-bucketed heatmap
```

---

### Task 1: `ActivityCalendar` component — leaf piece

**Files:**
- Create: `frontend/src/components/ActivityCalendar.jsx`
- Modify: `frontend/src/App.css`

**Interfaces:**
- Consumes: nothing new — receives `completedTasks` as a prop.
- Produces: `ActivityCalendar` props: `{ completedTasks: Array<{ updated_at: string, ... }> }`. Not yet imported/rendered by anything in this task (same "build the leaf piece first" pattern used successfully in every prior plan this session) — Task 2 wires it into `TodayBoard.jsx`.

- [ ] **Step 1: Create `frontend/src/components/ActivityCalendar.jsx`**

```jsx
function startOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function buildCalendarWeeks(referenceDate) {
  const end = startOfUtcDay(referenceDate);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 364);

  const startDay = start.getUTCDay();
  start.setUTCDate(start.getUTCDate() - startDay);

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

export default function ActivityCalendar({ completedTasks }) {
  const countsByDate = {};
  for (const task of completedTasks) {
    if (!task.updated_at) continue;
    const key = task.updated_at.slice(0, 10);
    countsByDate[key] = (countsByDate[key] || 0) + 1;
  }

  const weeks = buildCalendarWeeks(new Date());

  return (
    <div className="activity-calendar" aria-label="Task completion activity, last 12 months">
      <div className="activity-calendar-grid">
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className="activity-calendar-week">
            {week.map((day) => {
              const key = day.toISOString().slice(0, 10);
              const count = countsByDate[key] || 0;
              const level = levelForCount(count);
              const label = day.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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

`startOfUtcDay`/`buildCalendarWeeks` build the grid entirely with `getUTC*`/`setUTC*` methods, so every day cell's key (`day.toISOString().slice(0, 10)`) is derived from a genuinely UTC-midnight `Date`, matching the UTC date strings SQLite's `updated_at` already produces — no local-timezone conversion happens anywhere in this file, avoiding the off-by-one-day class of bug that a naive `new Date(...).toISOString()` on a locally-constructed date could introduce.

- [ ] **Step 2: Add calendar CSS to `frontend/src/App.css`**

Add these rules after the existing `.kanban-remove-btn:hover` rule and before the `@media (max-width: 900px)` block:

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

- [ ] **Step 3: Manually verify the file builds**

Run `cd frontend && npm run build` (or confirm `npm run dev` starts cleanly). `ActivityCalendar.jsx` isn't imported anywhere yet, so this just confirms no syntax errors and the CSS addition doesn't break anything.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ActivityCalendar.jsx frontend/src/App.css
git commit -m "feat: add ActivityCalendar component (not wired in yet)"
```

---

### Task 2: Rename Today → Dashboard, wire the calendar in

**Files:**
- Modify: `frontend/src/components/PrimarySidebar.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/TodayBoard.jsx`

**Interfaces:**
- Consumes: `ActivityCalendar` (Task 1), `getCompletedTasks` from `frontend/src/api.js` (already exists, already used by `CompletedView.jsx` — no change needed there).
- Produces: the `'today'` section id becomes `'dashboard'` everywhere it's referenced. `TodayBoard.jsx`'s exported component/function name and file path are unchanged — only its rendered text and its added `completedTasks` state/poll are new.

- [ ] **Step 1: Rename the nav item in `frontend/src/components/PrimarySidebar.jsx`**

Find:

```jsx
const NAV_ITEMS = [
  { id: 'today', label: 'Today' },
  { id: 'completed', label: 'Completed' },
  { id: 'timeline', label: 'Timeline' },
];
```

Replace with:

```jsx
const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'completed', label: 'Completed' },
  { id: 'timeline', label: 'Timeline' },
];
```

- [ ] **Step 2: Update the section conditional in `frontend/src/App.jsx`**

Find:

```jsx
        {activeSection === 'today' && <TodayBoard />}
```

Replace with:

```jsx
        {activeSection === 'dashboard' && <TodayBoard />}
```

(`App.jsx`'s default `activeSection` state stays `'lists'` — unrelated to this rename, no change needed there. `TodayBoard` is still the component name/import — only the string id that selects it changes.)

- [ ] **Step 3: Update `frontend/src/components/TodayBoard.jsx`: rename text, add the calendar**

First, add the import and the `getCompletedTasks` call to the existing poll. Find:

```jsx
import { useCallback, useEffect, useState } from 'react';
import { getTodayTasks, getUserLists, getSystemLists, setStatus, updateTaskLinkedLists } from '../api.js';
import TaskCard from './TaskCard.jsx';
```

Replace with:

```jsx
import { useCallback, useEffect, useState } from 'react';
import { getTodayTasks, getCompletedTasks, getUserLists, getSystemLists, setStatus, updateTaskLinkedLists } from '../api.js';
import TaskCard from './TaskCard.jsx';
import ActivityCalendar from './ActivityCalendar.jsx';
```

Then add a `completedTasks` state variable. Find:

```jsx
export default function TodayBoard() {
  const [tasks, setTasks] = useState([]);
  const [listNameById, setListNameById] = useState({});
  const [todayListId, setTodayListId] = useState(null);
  const [error, setError] = useState(null);
  const [dragOverStatus, setDragOverStatus] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [today, userLists] = await Promise.all([getTodayTasks(), getUserLists()]);
      setTasks(today);
      setListNameById(Object.fromEntries(userLists.map((list) => [list.id, list.name])));
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);
```

Replace with:

```jsx
export default function TodayBoard() {
  const [tasks, setTasks] = useState([]);
  const [completedTasks, setCompletedTasks] = useState([]);
  const [listNameById, setListNameById] = useState({});
  const [todayListId, setTodayListId] = useState(null);
  const [error, setError] = useState(null);
  const [dragOverStatus, setDragOverStatus] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [today, userLists, completed] = await Promise.all([getTodayTasks(), getUserLists(), getCompletedTasks()]);
      setTasks(today);
      setListNameById(Object.fromEntries(userLists.map((list) => [list.id, list.name])));
      setCompletedTasks(completed);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);
```

Finally, update the rendered heading/aria-label and insert the calendar. Find:

```jsx
  return (
    <section className="tasks-card" aria-label="Today board">
      <h1 className="tasks-title">Today</h1>
      {error && <p className="error-banner">{error}</p>}
      {tasks.length === 0 && (
        <p className="empty-note">
          Nothing here yet — pull a task into Today from the Lists view to see it on this board.
        </p>
      )}
      <div className="kanban-board">
```

Replace with:

```jsx
  return (
    <section className="tasks-card" aria-label="Dashboard">
      <h1 className="tasks-title">Dashboard</h1>
      {error && <p className="error-banner">{error}</p>}
      <ActivityCalendar completedTasks={completedTasks} />
      {tasks.length === 0 && (
        <p className="empty-note">
          Nothing here yet — pull a task into Today from the Lists view to see it on this board.
        </p>
      )}
      <div className="kanban-board">
```

Note: the empty-state note's text ("pull a task into Today from the Lists view") intentionally still says "Today," not "Dashboard" — "Today" is the ongoing concept name for "your working set for today" (matching the "Pull to Today"/"Remove from Today" button labels elsewhere in the app, which this plan does not touch), while "Dashboard" is only the name of the *page* that displays it. Renaming the button labels too is out of scope for this plan.

- [ ] **Step 4: Manually verify end-to-end**

Start the backend (`node backend/index.js`) and frontend (`cd frontend && npm run dev`), open the app.

1. Confirm the sidebar's top nav item now reads "Dashboard" instead of "Today," and clicking it shows the same Kanban board as before.
2. Confirm a calendar grid of small colored squares now appears between the "Dashboard" heading and the "To Do / In Progress / Done" columns — roughly a year of weekly columns.
3. Hover over a few squares — confirm a tooltip shows a date and a task count (e.g. "2 tasks completed on Aug 8, 2026" or "0 tasks completed on Jul 1, 2026").
4. Mark a task done (from the Kanban board or the Lists view) and confirm — after the next 3s poll — that today's square updates to a nonzero count and a darker shade.
5. Confirm the "Pull to Today"/"Remove from Today" button labels in the Lists view and on Kanban cards are unchanged (still say "Today," not "Dashboard").
6. Confirm no console errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/PrimarySidebar.jsx frontend/src/App.jsx frontend/src/components/TodayBoard.jsx
git commit -m "feat: rename Today to Dashboard, add activity calendar above the Kanban board"
```

---

## Self-Review Notes

- **Spec coverage:** "Today" → "Dashboard" rename (nav label, section id, board heading/aria-label) ✓ (Task 2). Activity calendar, 12 months, GitHub-style, colored by completed-task count, hover tooltip via native `title` ✓ (Task 1). Client-side computation from existing `getCompletedTasks()` data, no new backend endpoint ✓ (Task 2 Step 3, reusing the already-exported `api.js` function). Calendar positioned between the heading and the Kanban board ✓ (Task 2 Step 3's JSX ordering). Kanban board interior unchanged ✓ (no columns/drag/advance code touched by either task). 5 shades of the existing `--accent` blue ✓ (Task 1's CSS levels).
- **Task independence:** Task 1 (`ActivityCalendar` + CSS) is a leaf piece with zero wiring — builds and is reviewable on its own, doesn't affect the currently-running app since nothing imports it yet. Task 2 does the only wiring (rename + `TodayBoard` integration), using a component that already exists and is already correct by then.
- **Type/signature consistency:** `ActivityCalendar`'s `completedTasks` prop (Task 1) is supplied with the matching name by `TodayBoard.jsx` in Task 2 (`<ActivityCalendar completedTasks={completedTasks} />`), fed by the new `completedTasks` state populated from `getCompletedTasks()` in the same task's `refresh` callback.
- **Placeholder scan:** No TBD/TODO markers; every step contains complete, runnable code.
