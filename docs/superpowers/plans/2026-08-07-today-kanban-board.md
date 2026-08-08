# Today Kanban Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "Today" placeholder panel with a real three-column Kanban board (To Do / In Progress / Done), populated by tasks already pulled into Today (via the "Pull to Today" action built in the prior navigation-restructure plan), with drag-and-drop and click-to-advance status changes, and a "Remove from Today" card action.

**Architecture:** A new backend route (`GET /tasks/today`) exposes the `listTodayTasks` query already built in the data-model plan (date-filtered so Done only shows today's completions; To Do/In Progress always carry over). The frontend gets a new `TaskCard.jsx` (card-style rendering, distinct from the row-style `TaskRow.jsx` used elsewhere) and a `TodayBoard.jsx` that fetches/polls today's tasks, groups them by `status` into three columns, and handles drag-and-drop (native HTML5 DnD, no external library) plus a forward-only click-to-advance control. Status changes reuse the existing `setStatus` API call; "Remove from Today" reuses the existing `updateTaskLinkedLists` call with the Today list's id removed from the task's linked lists — no new backend mutation primitives are needed, only a new read route.

**Tech Stack:** Same as the rest of the project — Node.js, Express, React, native HTML5 drag-and-drop (`draggable`, `onDragStart`/`onDragOver`/`onDrop`) rather than a drag-and-drop library.

## Global Constraints

- Column mapping is exactly `status`: `'pending'` → To Do, `'in_progress'` → In Progress, `'done'` → Done. No new status values.
- Drag-and-drop moves a card between any two columns (forward or backward) by changing `status`. Click-to-advance is forward-only (To Do → In Progress → Done) — backward moves are drag-only, per the design spec's stated distinction between "the common path" and "a correction case."
- "Remove from Today" is a card action (a button), not a drag-out zone — removing a task from Today does not change its `status` or owning list, it only unlinks it from the reserved Today list. A Done card removed this way must still appear in the global Completed section (already true by construction, since Completed is queried independently of Today-linkage).
- The Today board's own data (`GET /tasks/today`) is date-filtered server-side (already implemented by `listTodayTasks` in the prior data-model plan) — this plan does not re-implement or duplicate that filtering client-side.
- No new automated frontend tests (no test runner exists, per established project convention — see [Testing](../../testing.md)); verification is manual. The one new backend route gets a `node:test` test.

---

## File Structure

```
backend/
  server.js              # MODIFY: add GET /tasks/today
  server.test.js          # MODIFY: add test for the new route
frontend/
  src/
    api.js                 # MODIFY: add getTodayTasks
    App.css                  # MODIFY: kanban board/column/card styles, responsive stacking
    App.jsx                   # MODIFY: replace Today placeholder with <TodayBoard />
    components/
      TaskCard.jsx             # CREATE: card-style task rendering for the Kanban board
      TodayBoard.jsx            # CREATE: fetches/polls Today's tasks, renders 3 columns, drag/drop + click-to-advance + remove-from-today
```

---

### Task 1: `GET /tasks/today` backend route

**Files:**
- Modify: `backend/server.js`
- Modify: `backend/server.test.js`

**Interfaces:**
- Consumes: `listTodayTasks(db)` from `mcp-server/tasks.js` (already exists — added by the data-model plan; not modified here).
- Produces: `GET /tasks/today -> 200` with a JSON array of hydrated tasks linked to the reserved Today list, `done` tasks included only if completed today, `pending`/`in_progress` tasks always included.

- [ ] **Step 1: Write the failing test**

Open `backend/server.test.js`. Add this test (anywhere after the existing `GET /tasks/completed` test). It needs `setTaskLinkedLists` in addition to what's already imported — check the top-level import line (`const { addTask, createList, setTaskStatus } = require('../mcp-server/tasks.js');`) and add `setTaskLinkedLists` to it if it isn't already there:

```js
test('GET /tasks/today returns tasks linked to the system Today list, filtered by the same rules as listTodayTasks', async () => {
  const db = initDb(':memory:');
  const todayList = db.prepare("SELECT id FROM lists WHERE kind = 'system'").get();

  const pendingOnToday = addTask(db, 'Pending on Today');
  setTaskLinkedLists(db, pendingOnToday.id, [todayList.id]);

  const doneYesterday = addTask(db, 'Done yesterday, still on Today');
  setTaskLinkedLists(db, doneYesterday.id, [todayList.id]);
  db.prepare("UPDATE tasks SET status = 'done', updated_at = datetime('now', '-2 day') WHERE id = ?").run(doneYesterday.id);

  const notOnToday = addTask(db, 'Not on Today at all');

  const { createApp } = require('./server.js');
  const app = createApp(db);
  const server = app.listen(0);

  const res = await get(server, '/tasks/today');

  assert.strictEqual(res.status, 200);
  const ids = res.body.map((t) => t.id);
  assert.ok(ids.includes(pendingOnToday.id));
  assert.ok(!ids.includes(doneYesterday.id));
  assert.ok(!ids.includes(notOnToday.id));

  server.close();
  db.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test backend/server.test.js`
Expected: FAIL — 404 "Cannot GET /tasks/today" (the route doesn't exist yet).

- [ ] **Step 3: Implement the route in `backend/server.js`**

Add `listTodayTasks` to the import destructure at the top of the file (alongside the existing `listCompletedTasks`):

```js
const {
  addTask,
  listTasks,
  setTaskStatus,
  setTaskTitle,
  deleteTask,
  setTaskTags,
  setTaskLinkedLists,
  listLists,
  createList,
  updateList,
  deleteList,
  listTags,
  createTag,
  listAuditLogs,
  restoreAuditLog,
  listCompletedTasks,
  listTodayTasks,
} = require('../mcp-server/tasks.js');
```

Then add the new route directly after the existing `app.get('/tasks/completed', ...)` route, before `app.post('/tasks', ...)`:

```js
  app.get('/tasks/today', (req, res) => {
    return res.json(listTodayTasks(db));
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test backend/server.test.js`
Expected: PASS (the new test, plus all existing tests still passing)

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS, all tests across `db/`, `mcp-server/`, `backend/`.

- [ ] **Step 6: Commit**

```bash
git add backend/server.js backend/server.test.js
git commit -m "feat: add GET /tasks/today route"
```

---

### Task 2: `api.js` addition

**Files:**
- Modify: `frontend/src/api.js`

**Interfaces:**
- Consumes: `GET /tasks/today` (Task 1).
- Produces: `getTodayTasks() -> Promise<Array<hydrated task>>`, following the existing `parseResponse`-wrapped fetch pattern already used by every other function in this file.

- [ ] **Step 1: Add the function**

Open `frontend/src/api.js`. Add this function after the existing `getCompletedTasks` function:

```js
export async function getTodayTasks() {
  const res = await fetch(`${API_BASE}/tasks/today`);
  return parseResponse(res);
}
```

- [ ] **Step 2: Manually verify**

With the backend running (`node backend/index.js`), run:

```bash
curl "http://localhost:3001/tasks/today"
```

Expected: `200` with a JSON array (empty unless you've already pulled a task into Today via the Lists view in a prior session).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api.js
git commit -m "feat: add getTodayTasks to frontend api client"
```

---

### Task 3: `TaskCard` component and Kanban CSS

**Files:**
- Create: `frontend/src/components/TaskCard.jsx`
- Modify: `frontend/src/App.css`

**Interfaces:**
- Consumes: nothing new — this is a leaf presentational component.
- Produces: `TaskCard` props `{ task, listName: string, onAdvance: (id: number, nextStatus: string) => void, onRemoveFromToday: (id: number) => void, onDragStart: (event: DragEvent, taskId: number) => void }`. Draggable (`draggable="true"`), calling `onDragStart` on drag start. Not yet imported/used by anything — `TodayBoard.jsx` (Task 4) wires it in. This mirrors the pattern used earlier in this project (build the leaf piece first, wire it in next), keeping this task's diff self-contained and buildable on its own.

- [ ] **Step 1: Create `frontend/src/components/TaskCard.jsx`**

```jsx
const STATUS_ORDER = ['pending', 'in_progress', 'done'];

function nextStatusFor(status) {
  const index = STATUS_ORDER.indexOf(status);
  if (index === -1 || index === STATUS_ORDER.length - 1) return null;
  return STATUS_ORDER[index + 1];
}

export default function TaskCard({ task, listName, onAdvance, onRemoveFromToday, onDragStart }) {
  const advanceTo = nextStatusFor(task.status);
  const tags = Array.isArray(task.tags) ? task.tags : [];

  return (
    <div
      className="kanban-card"
      draggable="true"
      onDragStart={(event) => onDragStart(event, task.id)}
    >
      <div className="kanban-card-title">{task.title}</div>
      <div className="kanban-card-meta">
        {listName && <span className="task-tag-chip">{listName}</span>}
        {tags.map((tag) => (
          <span key={tag} className="task-tag-chip">
            {tag}
          </span>
        ))}
      </div>
      <div className="kanban-card-actions">
        {advanceTo && (
          <button
            type="button"
            className="kanban-advance-btn"
            onClick={() => onAdvance(task.id, advanceTo)}
            aria-label={`Advance ${task.title} to ${advanceTo.replace('_', ' ')}`}
          >
            →
          </button>
        )}
        <button
          type="button"
          className="kanban-remove-btn"
          onClick={() => onRemoveFromToday(task.id)}
          aria-label={`Remove ${task.title} from Today`}
        >
          ✕ Today
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add Kanban CSS to `frontend/src/App.css`**

Add these rules after the existing `.empty-note` rule and before the `@media (max-width: 900px)` block:

```css
.kanban-board {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin-top: 12px;
}

.kanban-column {
  background: #fbfdff;
  border: 1px solid #e8edf3;
  border-radius: 12px;
  padding: 12px;
  min-height: 240px;
}

.kanban-column-heading {
  margin: 0 0 10px;
  font-size: 1.02rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.kanban-column-count {
  color: var(--muted);
  font-weight: 500;
  font-size: 0.85rem;
}

.kanban-column-dropzone {
  min-height: 60px;
  display: grid;
  gap: 10px;
}

.kanban-column-dropzone-over {
  background: #e8f0fe;
  border-radius: 8px;
}

.kanban-card {
  background: var(--card);
  border: 1px solid #eceff1;
  border-radius: 10px;
  padding: 10px;
  box-shadow: 0 1px 3px rgba(60, 64, 67, 0.08);
  cursor: grab;
}

.kanban-card-title {
  font-size: 0.95rem;
  font-weight: 500;
  margin-bottom: 6px;
}

.kanban-card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.kanban-card-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.kanban-advance-btn {
  border: 1px solid #d2e3fc;
  background: #e8f0fe;
  color: #174ea6;
  border-radius: 8px;
  padding: 4px 10px;
  font-weight: 700;
  cursor: pointer;
}

.kanban-advance-btn:hover {
  background: #d2e3fc;
}

.kanban-remove-btn {
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 0.8rem;
  cursor: pointer;
  padding: 4px 6px;
}

.kanban-remove-btn:hover {
  color: var(--error-text);
}
```

Then add a matching stacking rule inside the existing `@media (max-width: 900px)` block (find it — it currently ends with the `.tasks-title` rule) by adding, before the block's closing `}`:

```css
  .kanban-board {
    grid-template-columns: 1fr;
  }
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/TaskCard.jsx frontend/src/App.css
git commit -m "feat: add TaskCard component and Kanban board CSS"
```

---

### Task 4: `TodayBoard` — assemble the Kanban board

**Files:**
- Create: `frontend/src/components/TodayBoard.jsx`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: `getTodayTasks` (Task 2), `TaskCard` (Task 3), and the existing `getUserLists`, `getSystemLists`, `setStatus`, `updateTaskLinkedLists` from `frontend/src/api.js` (all already exist from prior plans).
- Produces: `TodayBoard` — no props, self-contained (same shape as `ListsView`/`CompletedView`).

- [ ] **Step 1: Create `frontend/src/components/TodayBoard.jsx`**

```jsx
import { useCallback, useEffect, useState } from 'react';
import { getTodayTasks, getUserLists, getSystemLists, setStatus, updateTaskLinkedLists } from '../api.js';
import TaskCard from './TaskCard.jsx';

const POLL_INTERVAL_MS = 3000;

const COLUMNS = [
  { status: 'pending', heading: 'To Do' },
  { status: 'in_progress', heading: 'In Progress' },
  { status: 'done', heading: 'Done' },
];

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

  useEffect(() => {
    let cancelled = false;

    async function loadTodayListId() {
      try {
        const systemLists = await getSystemLists();
        if (!cancelled && systemLists.length > 0) {
          setTodayListId(systemLists[0].id);
        }
      } catch {
        // Non-fatal: "Remove from Today" simply won't work if this fails; the board still displays.
      }
    }

    loadTodayListId();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      if (cancelled) return;
      await refresh();
    }

    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [refresh]);

  async function handleStatusChange(taskId, nextStatus) {
    const previous = tasks;
    setError(null);
    setTasks((current) => current.map((t) => (t.id === taskId ? { ...t, status: nextStatus } : t)));

    try {
      const updated = await setStatus(taskId, nextStatus);
      setTasks((current) => current.map((t) => (t.id === taskId ? updated : t)));
    } catch (err) {
      setTasks(previous);
      setError(err.message);
      await refresh();
    }
  }

  async function handleRemoveFromToday(taskId) {
    if (!todayListId) {
      setError('The Today list is not available yet — try again in a moment.');
      return;
    }

    const previous = tasks;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const currentLinkedListIds = Array.isArray(task.linked_list_ids) ? task.linked_list_ids : [task.list_id];
    const nextLinkedListIds = currentLinkedListIds.filter((id) => id !== todayListId);

    setError(null);
    setTasks((current) => current.filter((t) => t.id !== taskId));

    try {
      await updateTaskLinkedLists(taskId, nextLinkedListIds);
    } catch (err) {
      setTasks(previous);
      setError(err.message);
      await refresh();
    }
  }

  function handleDragStart(event, taskId) {
    event.dataTransfer.setData('text/plain', String(taskId));
    event.dataTransfer.effectAllowed = 'move';
  }

  function handleDrop(event, columnStatus) {
    event.preventDefault();
    setDragOverStatus(null);
    const taskId = Number(event.dataTransfer.getData('text/plain'));
    if (!taskId) return;
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === columnStatus) return;
    void handleStatusChange(taskId, columnStatus);
  }

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
        {COLUMNS.map((column) => {
          const columnTasks = tasks.filter((t) => t.status === column.status);
          const isOver = dragOverStatus === column.status;

          return (
            <div key={column.status} className="kanban-column">
              <h2 className="kanban-column-heading">
                <span>{column.heading}</span>
                <span className="kanban-column-count">{columnTasks.length}</span>
              </h2>
              <div
                className={isOver ? 'kanban-column-dropzone kanban-column-dropzone-over' : 'kanban-column-dropzone'}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragOverStatus(column.status);
                }}
                onDragLeave={() => setDragOverStatus((current) => (current === column.status ? null : current))}
                onDrop={(event) => handleDrop(event, column.status)}
              >
                {columnTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    listName={listNameById[task.list_id]}
                    onAdvance={handleStatusChange}
                    onRemoveFromToday={handleRemoveFromToday}
                    onDragStart={handleDragStart}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Wire `TodayBoard` into `App.jsx`**

Open `frontend/src/App.jsx`. Replace the Today placeholder block:

```jsx
        {activeSection === 'today' && (
          <section className="placeholder-panel" aria-label="Today">
            <h1 className="tasks-title">Today</h1>
            <p className="empty-note">The Today board is coming soon.</p>
          </section>
        )}
```

with:

```jsx
        {activeSection === 'today' && <TodayBoard />}
```

And add the import at the top of the file, alongside the existing component imports:

```jsx
import TodayBoard from './components/TodayBoard.jsx';
```

`TodayBoard` is a simple conditional render (not kept always-mounted like `ListsView`) — it has no meaningful local selection state to preserve across section switches (unlike `ListsView`'s `checkedListIds`), so remounting on every visit is fine and matches `CompletedView`'s existing pattern.

- [ ] **Step 3: Manually verify end-to-end**

Start the backend (`node backend/index.js`) and frontend (`cd frontend && npm run dev`), open the app.

1. In the Lists view, use "Pull to Today" on two or three pending tasks (some in different lists, if you have more than one list).
2. Click "Today" in the nav rail. Confirm a three-column board appears (To Do / In Progress / Done) with the pulled tasks showing as cards under "To Do", each showing its owning list's name and any tags.
3. Click a card's "→" button. Confirm it moves to the "In Progress" column. Click "→" again — confirm it moves to "Done". Confirm the "→" button disappears once a card is in Done.
4. Drag a card from Done back to "In Progress" (or any backward move). Confirm it moves.
5. Click a card's "✕ Today" button. Confirm the card disappears from the board. Switch to the Lists view and confirm the task still exists there with its status unchanged (pull it into Today again if you want to re-verify anything).
6. Mark a task Done on the board, then switch to the Completed view — confirm the same task also appears there.
7. Confirm no console errors throughout.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/TodayBoard.jsx frontend/src/App.jsx
git commit -m "feat: assemble Today Kanban board with drag-and-drop and click-to-advance"
```

---

## Self-Review Notes

- **Spec coverage:** Three columns mapped to status ✓ (Task 4). Cards, not rows, showing owning-list name + tags ✓ (Task 3/4). Drag-and-drop between any columns ✓ (Task 4's `handleDrop`). Click-to-advance forward-only ✓ (`TaskCard`'s `nextStatusFor`, only ever offering the next status in `STATUS_ORDER`). "Remove from Today" as a card button, not drag-out, task/status untouched ✓ (Task 4's `handleRemoveFromToday`, which only calls `updateTaskLinkedLists`, never `setStatus` or delete). Date-filtered Done column ✓ (server-side, via the already-built `listTodayTasks` — this plan adds no client-side date logic). Removed-but-done tasks still show in Completed ✓ (Completed is queried independently, per the existing `listCompletedTasks`/`CompletedView`, untouched by this plan).
- **Task independence:** Task 3 (`TaskCard` + CSS) is a leaf piece with zero wiring, same pattern used successfully in the navigation-restructure plan — builds and is reviewable on its own, doesn't break anything since nothing imports it yet. Task 4 does the only wiring, using pieces that already exist by then.
- **Type/signature consistency:** `TaskCard`'s `onAdvance`/`onRemoveFromToday`/`onDragStart` props (Task 3) are supplied with matching names and signatures by `TodayBoard` in Task 4 (`onAdvance={handleStatusChange}`, `onRemoveFromToday={handleRemoveFromToday}`, `onDragStart={handleDragStart}`).
- **Placeholder scan:** No TBD/TODO markers; every step contains complete, runnable code.
