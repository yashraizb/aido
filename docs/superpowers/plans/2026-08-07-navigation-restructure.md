# Navigation Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the frontend's single always-shown "Lists" view with a four-section navigation shell (Today / Lists / Completed / Timeline), build out the Lists section (carrying over existing multi-select behavior, now correctly excluding the reserved system list) and a new global Completed section, and add a "Pull to Today" action. The Today board's own interior (drag-and-drop Kanban) and the Timeline page's own content are separate future plans — this plan gives both a placeholder panel inside the new nav shell.

**Architecture:** `App.jsx` becomes a thin layout: a new `NavRail` (four-item primary navigation) plus a `main-panel` that swaps between the existing Lists UI (extracted into a new `ListsView.jsx`, functionally unchanged except for two additions), a new `CompletedView.jsx`, and placeholder panels for Today/Timeline. A new backend route (`GET /tasks/completed`) exposes the `listCompletedTasks` function already built in the prior data-model plan. `ListsView.jsx` switches from the unfiltered `GET /lists` to `GET /lists?kind=user` (built in the prior plan), which also fixes a live bug: the reserved Today/Inbox system lists currently show up as ordinary, editable, deletable lists in the UI.

Tasks are ordered so each one leaves the app in a buildable state on its own: shared/leaf pieces (a timestamp helper, the pull-to-today button, the standalone Completed page) land before the pieces that assemble them into the new shell.

**Tech Stack:** Same as the rest of the project — Node.js, Express, React (no router library — section switching is local `useState`, not URL-based, consistent with this being a single-page local tool).

## Global Constraints

- The reserved system Today list must never appear in the Lists section's sidebar, list picker, or any user-facing list-of-lists — use `GET /lists?kind=user` everywhere the UI currently calls the unfiltered `GET /lists`.
- "Pull to Today" is added only for pending/in_progress tasks in this plan. Removing a task from Today, and the Today board's own drag-and-drop Kanban interior, belong to a separate future plan.
- Timeline's own audit-log content belongs to a separate future plan — this plan only adds the nav entry and a placeholder panel.
- No new automated tests for the frontend (no test runner exists — per the project's established convention, verified in [Testing](../../testing.md)); verification is manual. The one new backend route does get a `node:test` test.
- Default active section on load is `'lists'` (preserves current app behavior); a future plan can change this default once the Today board has real content.

---

## File Structure

```
backend/
  server.js              # MODIFY: add GET /tasks/completed
  server.test.js          # MODIFY: add test for the new route
mcp-server/
  tasks.js                # unchanged — listCompletedTasks already exists from the prior plan
frontend/
  src/
    api.js                 # MODIFY: add getUserLists, getSystemLists, getCompletedTasks
    formatTimestamp.js      # CREATE: shared timestamp-formatting helper (extracted from TaskRow.jsx)
    App.jsx                 # MODIFY: becomes the nav shell + section switcher
    App.css                  # MODIFY: nav rail styles, lists-view-shell wrapper, list-task-group scroll, pull-to-today button
    components/
      NavRail.jsx             # CREATE: four-item primary navigation
      ListsView.jsx            # CREATE: current App.jsx's list-management logic, extracted + updated
      CompletedView.jsx         # CREATE: global cross-list completed feed
      TaskRow.jsx                # MODIFY: use shared formatTimestamp, add optional "Pull to Today" button
      TaskList.jsx                # MODIFY: forward the new onPullToToday prop
```

---

### Task 1: `GET /tasks/completed` backend route

**Files:**
- Modify: `backend/server.js`
- Modify: `backend/server.test.js`

**Interfaces:**
- Consumes: `listCompletedTasks(db)` from `mcp-server/tasks.js` (already exists — added by the prior data-model plan; not modified here).
- Produces: `GET /tasks/completed -> 200` with a JSON array of hydrated tasks (`{ id, title, status: 'done', list_id, created_at, updated_at, tags, linked_list_ids, linked_lists }`), sorted newest-`updated_at`-first, across every list.

- [ ] **Step 1: Write the failing test**

Open `backend/server.test.js`. Change the top-level import on line 5 from:

```js
const { addTask, createList } = require('../mcp-server/tasks.js');
```

to:

```js
const { addTask, createList, setTaskStatus } = require('../mcp-server/tasks.js');
```

Then add this test (anywhere after the existing `GET /tasks` tests):

```js
test('GET /tasks/completed returns only done tasks across all lists, newest first', async () => {
  const db = initDb(':memory:');
  const otherList = createList(db, 'Other list');
  const pendingTask = addTask(db, 'Still pending');
  const firstDone = addTask(db, 'First done');
  const secondDone = addTask(db, 'Second done', otherList.id);
  setTaskStatus(db, firstDone.id, 'done');
  setTaskStatus(db, secondDone.id, 'done');
  db.prepare("UPDATE tasks SET updated_at = datetime('now', '+1 second') WHERE id = ?").run(secondDone.id);

  const { createApp } = require('./server.js');
  const app = createApp(db);
  const server = app.listen(0);

  const res = await get(server, '/tasks/completed');

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.length, 2);
  assert.strictEqual(res.body[0].id, secondDone.id);
  assert.strictEqual(res.body[1].id, firstDone.id);
  assert.ok(!res.body.some((task) => task.id === pendingTask.id));

  server.close();
  db.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test backend/server.test.js`
Expected: FAIL — 404 "Cannot GET /tasks/completed" (the route doesn't exist yet).

- [ ] **Step 3: Implement the route in `backend/server.js`**

Change the import destructure at the top of the file (line 3-19) to add `listCompletedTasks`:

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
} = require('../mcp-server/tasks.js');
```

Then add the new route directly after the existing `app.get('/tasks', ...)` route (currently lines 156-163), before `app.post('/tasks', ...)`:

```js
  app.get('/tasks/completed', (req, res) => {
    return res.json(listCompletedTasks(db));
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
git commit -m "feat: add GET /tasks/completed route"
```

---

### Task 2: `api.js` additions

**Files:**
- Modify: `frontend/src/api.js`

**Interfaces:**
- Consumes: `GET /lists?kind=`, `GET /tasks/completed` (Task 1) from the backend.
- Produces: `getUserLists() -> Promise<Array<list>>`, `getSystemLists() -> Promise<Array<list>>`, `getCompletedTasks() -> Promise<Array<hydrated task>>` — all following the existing `parseResponse`-wrapped fetch pattern already used by every other function in this file.

- [ ] **Step 1: Add the three functions**

Open `frontend/src/api.js`. Add these three functions after the existing `getLists` function (which stays unchanged — it's still used internally to look up any list regardless of kind):

```js
export async function getUserLists() {
  const res = await fetch(`${LISTS_URL}?kind=user`);
  return parseResponse(res);
}

export async function getSystemLists() {
  const res = await fetch(`${LISTS_URL}?kind=system`);
  return parseResponse(res);
}

export async function getCompletedTasks() {
  const res = await fetch(`${API_BASE}/tasks/completed`);
  return parseResponse(res);
}
```

(`API_BASE` and `LISTS_URL` are both already defined as constants at the top of this file — reuse them, don't redefine.)

- [ ] **Step 2: Manually verify**

With the backend running (`node backend/index.js`), run:

```bash
curl "http://localhost:3001/lists?kind=user"
curl "http://localhost:3001/lists?kind=system"
curl "http://localhost:3001/tasks/completed"
```

Expected: each returns `200` with a JSON array (the first two mutually exclusive by `kind`, the third empty or showing done tasks depending on current data).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api.js
git commit -m "feat: add getUserLists/getSystemLists/getCompletedTasks to frontend api client"
```

---

### Task 3: Shared timestamp helper, "Pull to Today" button, and the standalone Completed page

**Files:**
- Create: `frontend/src/formatTimestamp.js`
- Modify: `frontend/src/components/TaskRow.jsx`
- Modify: `frontend/src/components/TaskList.jsx`
- Create: `frontend/src/components/CompletedView.jsx`
- Modify: `frontend/src/App.css`

**Interfaces:**
- Consumes: `getCompletedTasks()` from `frontend/src/api.js` (Task 2).
- Produces: `formatTimestamp(value: string) -> string`, exported for reuse. `TaskRow` gains an optional `onPullToToday?: (id: number) => void` prop; when provided, renders a "→ Today" button (backward compatible — omitting the prop renders nothing new, so this doesn't change how `TaskRow` behaves anywhere it's used before Task 4 wires up a real handler). `TaskList` forwards `onPullToToday` to each `TaskRow` it renders. `CompletedView` — no props, self-contained; not yet reachable from the UI until Task 4 wires it into `App.jsx` (it's a complete, correct component on its own, just not navigated-to yet — the same "build a leaf piece before wiring it in" pattern the prior data-model plan used for its query functions).

This task does **not** touch `App.jsx` or create `ListsView.jsx`/`NavRail.jsx` — the app continues running exactly as it does today after this task, with zero behavior change visible in the UI. That's intentional: it keeps this task's diff buildable and reviewable on its own before Task 4's larger restructuring.

- [ ] **Step 1: Create `frontend/src/formatTimestamp.js`**

```js
export function formatTimestamp(value) {
  if (!value) return 'Unknown';
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;

  const utcMs = date.getTime();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(utcMs + istOffsetMs);

  return istDate.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
```

This is the exact function body that currently lives inline at the top of `TaskRow.jsx` — moved here unchanged so it can be shared.

- [ ] **Step 2: Update `TaskRow.jsx`: use the shared helper, add the "Pull to Today" button**

Open `frontend/src/components/TaskRow.jsx`. Replace the top of the file — from the start through the `export default function TaskRow(...)` line — which currently reads:

```jsx
import AddTaskModal from './AddTaskModal.jsx';

function formatTimestamp(value) {
  if (!value) return 'Unknown';
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;

  const utcMs = date.getTime();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(utcMs + istOffsetMs);

  return istDate.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default function TaskRow({ task, onToggle, onDelete, onEdit, listOptions }) {
```

with:

```jsx
import AddTaskModal from './AddTaskModal.jsx';
import { formatTimestamp } from '../formatTimestamp.js';

export default function TaskRow({ task, onToggle, onDelete, onEdit, listOptions, onPullToToday }) {
```

Then find the existing delete button near the end of the returned JSX:

```jsx
      <button
        className="task-delete"
        type="button"
        onClick={() => {
          void onDelete(task.id);
        }}
        aria-label={`Delete ${task.title}`}
      >
        🗑
      </button>
```

and insert the new pull-to-today button immediately before it:

```jsx
      {onPullToToday && (
        <button
          className="task-pull-today-btn"
          type="button"
          onClick={() => {
            void onPullToToday(task.id);
          }}
          aria-label={`Pull ${task.title} into Today`}
        >
          → Today
        </button>
      )}
      <button
        className="task-delete"
        type="button"
        onClick={() => {
          void onDelete(task.id);
        }}
        aria-label={`Delete ${task.title}`}
      >
        🗑
      </button>
```

- [ ] **Step 3: Forward `onPullToToday` through `TaskList.jsx`**

Open `frontend/src/components/TaskList.jsx`. Change:

```jsx
export default function TaskList({ tasks, onToggle, onDelete, onEdit, listOptions }) {
```

to:

```jsx
export default function TaskList({ tasks, onToggle, onDelete, onEdit, listOptions, onPullToToday }) {
```

And change the `<TaskRow .../>` call inside the `.map(...)` to also pass it:

```jsx
        <TaskRow
          key={task.id}
          task={task}
          onToggle={onToggle}
          onDelete={onDelete}
          onEdit={onEdit}
          listOptions={listOptions}
          onPullToToday={onPullToToday}
        />
```

`CompletedSection.jsx` is **not** modified in this task — it simply won't receive `onPullToToday` from its caller, so `TaskRow` instances it renders won't show the button (consistent with the plan's constraint that pull-to-today only applies to pending/in_progress rows, and with `onPullToToday` being optional so `CompletedSection`'s existing calls to `TaskRow` keep working unchanged).

- [ ] **Step 4: Create `frontend/src/components/CompletedView.jsx`**

```jsx
import { useEffect, useState } from 'react';
import { getCompletedTasks } from '../api.js';
import { formatTimestamp } from '../formatTimestamp.js';

export default function CompletedView() {
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await getCompletedTasks();
        if (!cancelled) {
          setTasks(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="tasks-card" aria-label="Completed tasks">
      <h1 className="tasks-title">Completed</h1>
      {error && <p className="error-banner">{error}</p>}
      {!loading && tasks.length === 0 && <p className="empty-note">No completed tasks yet.</p>}
      <ul className="task-list">
        {tasks.map((task) => {
          const linkedLists = Array.isArray(task.linked_lists) ? task.linked_lists : [];
          return (
            <li key={task.id} className="task-row">
              <div className="task-text-wrap">
                <span className="task-title task-title-done">{task.title}</span>
                {linkedLists.length > 0 && (
                  <span className="task-tags" aria-label="Task lists">
                    {linkedLists.map((listName) => (
                      <span key={listName} className="task-tag-chip">
                        {listName}
                      </span>
                    ))}
                  </span>
                )}
                <span className="task-meta">Completed: {formatTimestamp(task.updated_at)}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
```

This isn't imported/rendered by anything yet in this task — Task 4 wires it into the new nav shell. It fetches once on mount (not on the 3s poll cycle the Lists view uses) — a deliberate scope decision, since the Completed view is user-navigated rather than a live dashboard; switching away and back re-fetches via the `useEffect`. Polling can be added later if it turns out to matter in practice.

- [ ] **Step 5: Add the pull-to-today button's CSS**

Open `frontend/src/App.css`. Add this new rule near the existing `.task-edit-inline-btn`/`.task-delete` rules:

```css
.task-pull-today-btn {
  border: 1px solid #d2e3fc;
  background: transparent;
  color: #174ea6;
  border-radius: 8px;
  padding: 4px 8px;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
}

.task-pull-today-btn:hover {
  background: #e8f0fe;
}
```

- [ ] **Step 6: Manually verify no regression**

Start the backend (`node backend/index.js`) and frontend (`cd frontend && npm run dev`), open `http://localhost:5173`. Confirm the app looks and behaves exactly as it did before this task (single Lists view, no nav rail yet — that's Task 4). Confirm no console errors (this exercises the `TaskRow`/`TaskList` prop changes even though nothing currently passes `onPullToToday`, so a broken import would surface here).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/formatTimestamp.js frontend/src/components/TaskRow.jsx frontend/src/components/TaskList.jsx frontend/src/components/CompletedView.jsx frontend/src/App.css
git commit -m "feat: add shared formatTimestamp, pull-to-today button, and standalone CompletedView"
```

---

### Task 4: Nav shell — `NavRail`, `ListsView` extraction, wiring it all together

**Files:**
- Create: `frontend/src/components/NavRail.jsx`
- Create: `frontend/src/components/ListsView.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/App.css`

**Interfaces:**
- Consumes: `getUserLists`, `getSystemLists` (Task 2); `TaskList`'s `onPullToToday` prop and `CompletedView` (Task 3) — both already exist and are already correct, this task just wires them in; everything else `frontend/src/api.js` already exported before this plan (`createTask`, `deleteTask` as `deleteTaskRequest`, `getTasks`, `createList`, `removeList`, `renameList`, `setStatus`, `updateTaskLinkedLists`, `updateTaskTitle`) — all unchanged, just re-imported into the new `ListsView.jsx` instead of `App.jsx`.
- Produces: `NavRail` props `{ active: string, onSelect: (sectionId: string) => void }`. `ListsView` — no props (self-contained, exactly like the current `App.jsx` is today, just relocated).

- [ ] **Step 1: Create `frontend/src/components/NavRail.jsx`**

```jsx
const NAV_ITEMS = [
  { id: 'today', label: 'Today' },
  { id: 'lists', label: 'Lists' },
  { id: 'completed', label: 'Completed' },
  { id: 'timeline', label: 'Timeline' },
];

export default function NavRail({ active, onSelect }) {
  return (
    <nav className="nav-rail" aria-label="Primary">
      <ul className="nav-rail-list">
        {NAV_ITEMS.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className={item.id === active ? 'nav-rail-btn nav-rail-btn-active' : 'nav-rail-btn'}
              onClick={() => onSelect(item.id)}
              aria-current={item.id === active ? 'page' : undefined}
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 2: Create `frontend/src/components/ListsView.jsx`**

This is the current `frontend/src/App.jsx` content, relocated and updated. Create the new file with this content:

```jsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createList,
  createTask,
  deleteTask as deleteTaskRequest,
  getTasks,
  getUserLists,
  getSystemLists,
  removeList,
  renameList,
  setStatus,
  updateTaskLinkedLists,
  updateTaskTitle,
} from '../api.js';
import AddTaskModal from './AddTaskModal.jsx';
import TaskList from './TaskList.jsx';
import CompletedSection from './CompletedSection.jsx';

const POLL_INTERVAL_MS = 3000;

export default function ListsView() {
  const [lists, setLists] = useState([]);
  const [checkedListIds, setCheckedListIds] = useState([]);
  const [newListName, setNewListName] = useState('');
  const [renamingListId, setRenamingListId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [allTasks, setAllTasks] = useState([]);
  const [todayListId, setTodayListId] = useState(null);
  const [error, setError] = useState(null);

  const refreshTasks = useCallback(async () => {
    const tasks = await getTasks();
    setAllTasks(tasks);
  }, []);

  const refreshWorkspace = useCallback(async (preferredCheckedListIds = checkedListIds) => {
    try {
      const fetchedLists = await getUserLists();
      setLists(fetchedLists);

      if (fetchedLists.length === 0) {
        setCheckedListIds([]);
        setAllTasks([]);
        setError(null);
        return;
      }

      const fetchedIds = new Set(fetchedLists.map((list) => list.id));
      let effectiveChecked = preferredCheckedListIds.filter((id) => fetchedIds.has(id));
      if (effectiveChecked.length === 0) {
        effectiveChecked = [fetchedLists[0].id];
      }

      setCheckedListIds(effectiveChecked);
      await refreshTasks();
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, [checkedListIds, refreshTasks]);

  useEffect(() => {
    let cancelled = false;

    async function loadTodayListId() {
      try {
        const systemLists = await getSystemLists();
        if (!cancelled && systemLists.length > 0) {
          setTodayListId(systemLists[0].id);
        }
      } catch {
        // Non-fatal: "Pull to Today" simply won't be available if this fails.
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
      try {
        const fetchedLists = await getUserLists();
        if (cancelled) return;

        setLists(fetchedLists);

        if (fetchedLists.length === 0) {
          setCheckedListIds([]);
          setAllTasks([]);
          setError(null);
          return;
        }

        const fetchedIds = new Set(fetchedLists.map((list) => list.id));
        let effectiveChecked = checkedListIds.filter((id) => fetchedIds.has(id));
        if (effectiveChecked.length === 0) {
          effectiveChecked = [fetchedLists[0].id];
          setCheckedListIds(effectiveChecked);
        }

        const tasks = await getTasks();
        if (cancelled) return;
        setAllTasks(tasks);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    }

    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [checkedListIds]);

  const tasksForList = useCallback(
    (list) =>
      allTasks.filter((task) => {
        const linkedListIds = Array.isArray(task.linked_list_ids) ? task.linked_list_ids : [task.list_id];
        return linkedListIds.includes(list.id);
      }),
    [allTasks]
  );

  const visibleLists = useMemo(
    () => lists.filter((list) => checkedListIds.includes(list.id)),
    [lists, checkedListIds]
  );

  const listOptions = useMemo(() => lists.map((list) => ({ id: list.id, name: list.name })), [lists]);

  async function handleAdd(listId, title, linkedListIds = []) {
    const previous = allTasks;
    const optimisticId = `tmp-${Date.now()}`;
    const optimisticTask = {
      id: optimisticId,
      title,
      status: 'pending',
      list_id: listId,
      linked_list_ids: Array.from(new Set([listId, ...linkedListIds])),
      linked_lists: lists
        .filter((list) => Array.from(new Set([listId, ...linkedListIds])).includes(list.id))
        .map((list) => list.name),
      created_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
      updated_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
    };

    setError(null);
    setAllTasks((current) => [...current, optimisticTask]);

    try {
      const created = await createTask(title, listId, linkedListIds);
      setAllTasks((current) => current.map((task) => (task.id === optimisticId ? created : task)));

      const requestedLinkedListIds = Array.from(new Set([listId, ...linkedListIds]));
      const returnedLinkedListIds = Array.isArray(created?.linked_list_ids)
        ? created.linked_list_ids
        : [created?.list_id ?? listId];
      const missingLinkedListIds = requestedLinkedListIds.filter((id) => !returnedLinkedListIds.includes(id));

      if (missingLinkedListIds.length > 0 && created?.id) {
        try {
          const synced = await updateTaskLinkedLists(created.id, requestedLinkedListIds);
          setAllTasks((current) => current.map((task) => (task.id === optimisticId ? synced : task)));
        } catch {
          setError('Task was created, but some selected tags were not saved. Please restart backend and try again.');
          await refreshWorkspace(checkedListIds);
        }
      }
    } catch (err) {
      setAllTasks(previous);
      setError(err.message);
      await refreshWorkspace(checkedListIds);
    }
  }

  async function handleGlobalAdd({ title, linkedListIds }) {
    const deduped = Array.from(new Set(linkedListIds));
    const ownerListId = deduped[0] ?? checkedListIds[0] ?? listOptions[0]?.id;
    if (!ownerListId) return;

    await handleAdd(ownerListId, title, deduped);
  }

  async function handleToggle(listId, id, nextStatus) {
    const previous = allTasks;
    setError(null);
    setAllTasks((current) => current.map((task) => (task.id === id ? { ...task, status: nextStatus } : task)));

    try {
      const updated = await setStatus(id, nextStatus);
      setAllTasks((current) => current.map((task) => (task.id === id ? updated : task)));
    } catch (err) {
      setAllTasks(previous);
      setError(err.message);
      await refreshWorkspace(checkedListIds);
    }
  }

  async function handleDelete(listId, id) {
    const previous = allTasks;
    setError(null);
    setAllTasks((current) => current.filter((task) => task.id !== id));

    try {
      await deleteTaskRequest(id);
    } catch (err) {
      setAllTasks(previous);
      setError(err.message);
      await refreshWorkspace(checkedListIds);
    }
  }

  async function handleEditTask(listId, taskId, { title, linkedListIds }) {
    const previous = allTasks;
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

    setError(null);
    setAllTasks((current) =>
      current.map((task) =>
        task.id === taskId
          ? {
              ...task,
              title,
              linked_list_ids: linkedListIds,
              linked_lists: lists.filter((list) => linkedListIds.includes(list.id)).map((list) => list.name),
              updated_at: now,
            }
          : task
      )
    );

    try {
      await updateTaskTitle(taskId, title);
      const updated = await updateTaskLinkedLists(taskId, linkedListIds);
      setAllTasks((current) => current.map((task) => (task.id === taskId ? updated : task)));
    } catch (err) {
      setAllTasks(previous);
      setError(err.message);
      await refreshWorkspace(checkedListIds);
    }
  }

  async function handlePullToToday(taskId) {
    if (!todayListId) {
      setError('The Today list is not available yet — try again in a moment.');
      return;
    }

    const previous = allTasks;
    const task = allTasks.find((t) => t.id === taskId);
    if (!task) return;

    const currentLinkedListIds = Array.isArray(task.linked_list_ids) ? task.linked_list_ids : [task.list_id];
    const nextLinkedListIds = Array.from(new Set([...currentLinkedListIds, todayListId]));

    setError(null);
    setAllTasks((current) =>
      current.map((t) => (t.id === taskId ? { ...t, linked_list_ids: nextLinkedListIds } : t))
    );

    try {
      const updated = await updateTaskLinkedLists(taskId, nextLinkedListIds);
      setAllTasks((current) => current.map((t) => (t.id === taskId ? updated : t)));
    } catch (err) {
      setAllTasks(previous);
      setError(err.message);
      await refreshWorkspace(checkedListIds);
    }
  }

  function handleCheckedListChange(listId, checked) {
    const next = checked
      ? Array.from(new Set([...checkedListIds, listId]))
      : checkedListIds.filter((id) => id !== listId);

    setCheckedListIds(next);
  }

  async function handleCreateList() {
    const name = newListName.trim();
    if (!name) return;

    setError(null);
    try {
      const created = await createList(name);
      setLists((current) => [...current, created]);
      setCheckedListIds((current) => Array.from(new Set([...current, created.id])));
      setNewListName('');
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRenameList(id) {
    const name = renameValue.trim();
    if (!name) return;

    setError(null);
    try {
      const updated = await renameList(id, name);
      setLists((current) => current.map((list) => (list.id === id ? updated : list)));
      setRenamingListId(null);
      setRenameValue('');
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteList(id) {
    setError(null);
    try {
      await removeList(id);
      const remaining = lists.filter((list) => list.id !== id);
      setLists(remaining);
      setCheckedListIds((current) => current.filter((listId) => listId !== id));
      setAllTasks((current) => current.filter((task) => task.list_id !== id));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="lists-view-shell">
      <aside className="lists-sidebar" aria-label="Task lists">
        <h2 className="sidebar-title">Lists</h2>
        <div className="list-create-row">
          <input
            className="list-create-input"
            type="text"
            placeholder="New list"
            value={newListName}
            onChange={(event) => setNewListName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void handleCreateList();
              }
            }}
            aria-label="Create new list"
          />
          <button className="list-action-btn" type="button" onClick={() => void handleCreateList()}>
            Add
          </button>
        </div>
        <ul className="lists-nav">
          {lists.map((list) => {
            const isChecked = checkedListIds.includes(list.id);
            const isRenaming = list.id === renamingListId;

            return (
              <li key={list.id} className={isChecked ? 'list-item list-item-selected' : 'list-item'}>
                {isRenaming ? (
                  <>
                    <input
                      className="list-visibility-check"
                      type="checkbox"
                      checked={isChecked}
                      onChange={(event) => handleCheckedListChange(list.id, event.target.checked)}
                      aria-label={`Show tasks for ${list.name}`}
                    />
                    <input
                      className="list-rename-input"
                      value={renameValue}
                      onChange={(event) => setRenameValue(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          void handleRenameList(list.id);
                        }
                      }}
                      aria-label={`Rename ${list.name}`}
                    />
                    <button className="list-mini-btn" type="button" onClick={() => void handleRenameList(list.id)}>
                      Save
                    </button>
                  </>
                ) : (
                  <>
                    <input
                      className="list-visibility-check"
                      type="checkbox"
                      checked={isChecked}
                      onChange={(event) => handleCheckedListChange(list.id, event.target.checked)}
                      aria-label={`Show tasks for ${list.name}`}
                    />
                    <button
                      className="list-name-btn"
                      type="button"
                      onClick={() => handleCheckedListChange(list.id, !isChecked)}
                    >
                      {list.name}
                    </button>
                    <button
                      className="list-mini-btn"
                      type="button"
                      onClick={() => {
                        setRenamingListId(list.id);
                        setRenameValue(list.name);
                      }}
                    >
                      Rename
                    </button>
                  </>
                )}
                <button className="list-delete-btn" type="button" onClick={() => void handleDeleteList(list.id)}>
                  🗑
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <section className="tasks-card" aria-label="Tasks for checked lists">
        <div className="tasks-header-row">
          <h1 className="tasks-title">Tasks</h1>
          <AddTaskModal
            buttonLabel="+ Add Task"
            dialogTitle="Add task"
            listOptions={listOptions}
            initialSelectedListIds={[]}
            onSubmit={handleGlobalAdd}
          />
        </div>
        {error && <p className="error-banner">{error}</p>}

        {visibleLists.length === 0 && <p className="empty-note">Select one or more list checkboxes to view their tasks.</p>}

        <div className="list-task-grid">
          {visibleLists.map((list) => {
            const listTasks = tasksForList(list);
            const pending = listTasks.filter((task) => task.status === 'pending' || task.status === 'in_progress');
            const completed = listTasks.filter((task) => task.status === 'done');

            return (
              <section key={list.id} className="list-task-group" aria-label={`Tasks for ${list.name}`}>
                <h2 className="list-task-heading">{list.name}</h2>
                <TaskList
                  tasks={pending}
                  onToggle={(id, nextStatus) => handleToggle(list.id, id, nextStatus)}
                  onDelete={(id) => handleDelete(list.id, id)}
                  onEdit={(taskId, payload) => handleEditTask(list.id, taskId, payload)}
                  onPullToToday={handlePullToToday}
                  listOptions={listOptions}
                />
                <CompletedSection
                  tasks={completed}
                  onToggle={(id, nextStatus) => handleToggle(list.id, id, nextStatus)}
                  onDelete={(id) => handleDelete(list.id, id)}
                  onEdit={(taskId, payload) => handleEditTask(list.id, taskId, payload)}
                  listOptions={listOptions}
                />
              </section>
            );
          })}
        </div>
      </section>
    </div>
  );
}
```

Three intentional changes from the original `App.jsx` (call these out in your report so the reviewer can verify them deliberately, not as accidents):
1. `getLists` → `getUserLists` in both the initial `refreshWorkspace` and the polling `useEffect` (fixes the system-list-leaking-into-the-UI bug).
2. The `pending` filter now includes `'in_progress'` too (`task.status === 'pending' || task.status === 'in_progress'`) — necessary because the prior data-model plan introduced the `in_progress` status, and without this change an in_progress task would vanish from both the pending and completed groups entirely. `completed` stays `status === 'done'` only.
3. A new `todayListId` state, resolved once on mount via `getSystemLists()`, and a new `handlePullToToday` handler wired to `TaskList`'s `onPullToToday` prop (which already exists from Task 3 of this plan).

- [ ] **Step 3: Rewrite `frontend/src/App.jsx` as the nav shell**

Replace the entire file content with:

```jsx
import { useState } from 'react';
import NavRail from './components/NavRail.jsx';
import ListsView from './components/ListsView.jsx';
import CompletedView from './components/CompletedView.jsx';

export default function App() {
  const [activeSection, setActiveSection] = useState('lists');

  return (
    <div className="app-shell">
      <NavRail active={activeSection} onSelect={setActiveSection} />
      <div className="main-panel">
        {activeSection === 'today' && (
          <section className="placeholder-panel" aria-label="Today">
            <h1 className="tasks-title">Today</h1>
            <p className="empty-note">The Today board is coming soon.</p>
          </section>
        )}
        {activeSection === 'lists' && <ListsView />}
        {activeSection === 'completed' && <CompletedView />}
        {activeSection === 'timeline' && (
          <section className="placeholder-panel" aria-label="Timeline">
            <h1 className="tasks-title">Timeline</h1>
            <p className="empty-note">The Timeline is coming soon.</p>
          </section>
        )}
      </div>
    </div>
  );
}
```

`CompletedView.jsx` already exists (created in Task 3 of this plan) — this step is the first time anything imports/renders it.

- [ ] **Step 4: Update `App.css` for the nav shell layout**

Open `frontend/src/App.css`. Change the existing `.app-shell` rule (currently lines 25-33) from:

```css
.app-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  gap: 16px;
  width: 100%;
  align-items: start;
  padding: 20px;
}
```

to:

```css
.app-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 16px;
  width: 100%;
  align-items: start;
  padding: 20px;
}

.main-panel {
  min-width: 0;
}

.lists-view-shell {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.nav-rail {
  background: #fcfdff;
  border: 1px solid #e7ebf0;
  border-radius: 16px;
  box-shadow: 0 8px 24px rgba(60, 64, 67, 0.06);
  padding: 12px;
  height: fit-content;
}

.nav-rail-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}

.nav-rail-btn {
  width: 100%;
  text-align: left;
  border: 0;
  border-radius: 10px;
  padding: 10px 12px;
  background: transparent;
  color: var(--text);
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
}

.nav-rail-btn:hover {
  background: var(--hover);
}

.nav-rail-btn-active {
  background: #e8f0fe;
  color: #174ea6;
  font-weight: 700;
}

.placeholder-panel {
  background: var(--card);
  border: 1px solid #eceff1;
  border-radius: 16px;
  box-shadow: 0 8px 24px rgba(60, 64, 67, 0.08);
  padding: 20px;
}
```

Then change the existing `.list-task-group` rule (currently around line 175-181) from:

```css
.list-task-group {
  background: #fbfdff;
  border: 1px solid #e8edf3;
  border-radius: 12px;
  padding: 12px;
  min-height: 220px;
}
```

to:

```css
.list-task-group {
  background: #fbfdff;
  border: 1px solid #e8edf3;
  border-radius: 12px;
  padding: 12px;
  min-height: 220px;
  max-height: 480px;
  overflow-y: auto;
}
```

- [ ] **Step 5: Manually verify end-to-end**

Start the backend (`node backend/index.js`) and frontend (`cd frontend && npm run dev`), open `http://localhost:5173`.

Verify:
1. A left nav rail shows four items: Today, Lists, Completed, Timeline. "Lists" is highlighted by default and its content matches what the app looked like before this plan (list sidebar + task cards), except the "Today" and "Inbox" system/default lists no longer appear in the list sidebar or in the "+ Add Task" modal's list picker.
2. Each list's task card has a visible scrollbar once it has enough tasks to exceed roughly 480px of height (add several tasks to one list to confirm, or resize the browser).
3. Hovering a pending task row shows a "→ Today" button alongside the existing edit/delete controls; clicking it succeeds (no error banner) and the task's list chips (visible via its edit modal or, once available, the Today board) reflect the added link.
4. Clicking "Today" in the nav rail shows a placeholder panel ("The Today board is coming soon."). Clicking "Timeline" shows the equivalent placeholder.
5. Clicking "Completed" shows a flat list of every done task across all lists, each with its list name(s) as chips and a "Completed: <timestamp>" line, sorted newest-first. If there are no completed tasks yet, mark one done in the Lists view first, then switch to Completed to confirm it appears.
6. No console errors on any of the four sections.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/NavRail.jsx frontend/src/components/ListsView.jsx frontend/src/App.jsx frontend/src/App.css
git commit -m "feat: assemble four-section nav shell (Today/Lists/Completed/Timeline)"
```

---

## Self-Review Notes

- **Spec coverage:** Four fixed sidebar sections ✓ (Task 4 Step 3). Lists section carries over multi-select behavior, now `kind=user`-filtered ✓ (Task 4 Step 2). Max-height + scroll per list card ✓ (Task 4 Step 4). "Pull to Today" per pending/in_progress row ✓ (Task 3 Steps 2-3, wired up in Task 4 Step 2). Global Completed view with completion time ✓ (Task 3 Step 4, wired up in Task 4 Step 3). System list never appears in Lists/list-picker ✓ (same `getUserLists` fix). Today board interior and Timeline content explicitly deferred to future plans, represented here as placeholders ✓.
- **Task independence fixed on self-review:** the first draft of this plan had Task 3 (nav shell) referencing files a later task created, which would have failed any build/lint check run mid-task and could unfairly fail its own task review. Reordered so Task 3 now builds every shared/leaf piece (`formatTimestamp.js`, the `TaskRow`/`TaskList` prop plumbing, `CompletedView.jsx`) with zero visible behavior change and a clean build, and Task 4 does the actual assembly (`NavRail.jsx`, `ListsView.jsx`, the `App.jsx` rewrite) using only pieces that already exist by then.
- **Type/signature consistency:** `TaskRow`'s `onPullToToday` prop is defined in Task 3 Step 2, forwarded by `TaskList` in Task 3 Step 3 with the same name, and supplied by `ListsView` in Task 4 Step 2 (`onPullToToday={handlePullToToday}`) — consistent throughout. `formatTimestamp` is defined once (Task 3 Step 1) and imported identically by `TaskRow.jsx` and `CompletedView.jsx`.
- **Placeholder scan:** No TBD/TODO markers; every step contains complete, runnable code.
