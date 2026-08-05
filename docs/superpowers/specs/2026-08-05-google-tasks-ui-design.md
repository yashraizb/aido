# Google Tasks-Style UI Design

## Purpose

The current frontend (`frontend/src/App.jsx`) is a read-only list: it polls `GET /tasks` every 3s and renders `{title} — {status}` as flat `<li>` text, with no styling and no way to add, complete, reopen, or delete a task from the browser. Adding tasks today only happens through Claude via the MCP tools.

This redesign turns the frontend into a fully interactive, visually polished to-do list styled after Google Tasks: an inline "add a task" box, checkbox-driven complete/reopen, a collapsible Completed section, and delete support — while keeping Claude/MCP as an equally valid way to manage the same list.

## Scope Decisions (from brainstorming)

- **Interactive, not read-only.** The UI can add, complete, reopen, and delete tasks directly — not just view them.
- **Completed tasks collapse into a "Completed (N)" section**, collapsed by default, at the bottom of the list — matching Google Tasks rather than showing completed items inline with strikethrough.
- **Delete is in scope.** A trash icon (shown on hover) removes a task permanently, in both the pending list and the Completed section.
- **Status toggles both ways.** Checking a pending task marks it done; unchecking a completed task returns it to pending. The one-way `complete_task` concept is replaced by a general status setter.

## Architecture

No new components are introduced at the process level — this stays within the existing three pieces (`db/`, `mcp-server/`, `backend/`, `frontend/`), all still sharing the one `db/tasks.db` file via `db/db.js`. The change is: the shared task-operations module gains two new operations (delete, generalized status-set) that both `backend/server.js` and `mcp-server/index.js` call, and `backend/server.js` gains three new REST routes so the frontend can invoke those operations without going through Claude. The frontend goes from a static poll-and-render list to a small component tree with local optimistic state layered on top of the existing poll.

```
frontend (React)
  │  POST /tasks, PATCH /tasks/:id, DELETE /tasks/:id, GET /tasks (poll)
  ▼
backend/server.js (Express)
  │  addTask / setTaskStatus / deleteTask / listTasks
  ▼
mcp-server/tasks.js (shared task-ops module)
  │
  ▼
db/tasks.db (SQLite, via db/db.js)
  ▲
  │  same functions
mcp-server/index.js (MCP tools: add_task, list_tasks, complete_task, delete_task)
```

## Data Layer Changes

**File:** `mcp-server/tasks.js` (unchanged file location — still the shared task-ops module both backend and MCP server import from; a rename to `db/tasks.js` was flagged as a nice-to-have in an earlier review but is out of scope here)

- `completeTask(db, id)` is replaced by:
  ```js
  function setTaskStatus(db, id, status) {
    // status must be 'pending' or 'done'
    const info = db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run(status, id);
    if (info.changes === 0) return null;
    return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  }
  ```
  Validation of `status` (must be exactly `'pending'` or `'done'`) happens at the caller boundary (REST route body validation, MCP tool's zod enum) — `setTaskStatus` itself trusts its input, consistent with `addTask`/`listTasks` trusting theirs.

- New function:
  ```js
  function deleteTask(db, id) {
    const info = db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    return info.changes > 0; // true if a row was deleted, false if id didn't exist
  }
  ```

- `addTask` and `listTasks` are unchanged.

## Backend REST API Changes

**File:** `backend/server.js`

New routes, all reading/writing through the same `db` instance passed into `createApp(db)`:

- **`POST /tasks`** — body `{ title: string }`. Rejects with `400` if `title` is missing, not a string, or empty after trimming. Calls `addTask(db, title.trim())`. Returns `201` with the created task JSON.
- **`PATCH /tasks/:id`** — body `{ status: 'pending' | 'done' }`. Rejects with `400` if `status` isn't exactly one of those two strings. Calls `setTaskStatus(db, Number(id), status)`. Returns `200` with the updated task JSON, or `404` if no task with that id exists.
- **`DELETE /tasks/:id`** — calls `deleteTask(db, Number(id))`. Returns `204` with no body on success, or `404` if no task with that id existed.

`express.json()` middleware is added so the app can parse JSON request bodies (needed for POST/PATCH, not required by the existing GET).

`GET /tasks` is unchanged.

## MCP Server Changes

**File:** `mcp-server/index.js`

- `complete_task` tool: internally now calls `setTaskStatus(db, id, 'done')` instead of the removed `completeTask`. Its external contract (tool name, `{ id: number }` input, same success/error response shape) does not change.
- New `delete_task` tool: input `{ id: number }`, calls `deleteTask(db, id)`. Returns a text confirmation on success, or an `isError: true` response with a "No task with id N" message if the id didn't exist — mirroring `complete_task`'s existing not-found handling.
- No new tool is added for reopening a task (`pending`) via MCP — the existing `complete_task` tool remains one-directional from Claude's side, since "reopen" isn't a natural voice/chat action the plan calls for. The two-way toggle is a frontend-only interaction, reachable from Claude only if a future session adds a `reopen_task` or generalized `set_task_status` tool — explicitly out of scope here.

## Frontend Changes

**Files:** `frontend/src/App.jsx` (restructured), new `frontend/src/api.js`, new `frontend/src/components/` (`AddTaskInput.jsx`, `TaskList.jsx`, `TaskRow.jsx`, `CompletedSection.jsx`), new `frontend/src/App.css`

### Component breakdown

- **`api.js`** — a thin fetch wrapper: `getTasks()`, `createTask(title)`, `setStatus(id, status)`, `deleteTask(id)`. Centralizes the `API_URL` base and JSON handling/error surfacing so components don't each hand-roll `fetch`.
- **`App.jsx`** — owns the `tasks` array and `error` state, keeps the existing 3s poll (via `getTasks()`), and derives `pending`/`completed` sublists from `tasks` by filtering on `status`. Passes down callback props (`onAdd`, `onToggle`, `onDelete`) that call `api.js` functions and then optimistically patch local state (so the UI updates instantly instead of waiting for the next poll tick), falling back to a full `getTasks()` refresh if an optimistic call fails.
- **`AddTaskInput.jsx`** — the inline "+ Add a task" box. Local input state; Enter (or blur with non-empty text) calls `onAdd(title)` and clears the input.
- **`TaskList.jsx`** — renders the pending tasks as `TaskRow`s. Renders nothing (not even a heading) when `pending` is empty except the add-input, matching Google Tasks' minimal empty state.
- **`TaskRow.jsx`** — one row: a circular checkbox (checked ⇔ `status === 'done'`, `onChange` calls `onToggle(id, nextStatus)`), the title, and a trash icon that appears on row hover (`onClick` calls `onDelete(id)`). Used for both pending and completed rows — the same component, just fed a different task.
- **`CompletedSection.jsx`** — a `<details>`-based (or local `useState` boolean) collapsible header reading "Completed (N)", collapsed by default; when expanded, renders `completed` tasks via `TaskRow`. Hidden entirely (no header at all) when `completed.length === 0`.

### Optimistic update strategy

Every user action (add/toggle/delete) does the following:
1. Compute the new `tasks` array locally and call `setTasks` immediately (instant UI feedback).
2. Fire the corresponding `api.js` call.
3. On failure, revert to the pre-action `tasks` snapshot and surface `error` (reusing the existing error-banner pattern already in `App.jsx`).
4. The existing 3s poll continues running unconditionally in the background as the source of truth for reconciling multi-client state (e.g., a task added via Claude while the browser tab is open) — optimistic state is a short-lived local overlay, not a replacement for polling.

### Visual design (Google Tasks look)

- Page background: light gray (`#f8f9fa`); the task list itself sits in a white rounded-corner container with a subtle shadow, centered with a max-width (matching Google Tasks' single-column card).
- Typography: system font stack (`-apple-system, "Segoe UI", Roboto, sans-serif`), no serif anywhere.
- Checkboxes: rendered as circular, not square (custom-styled `<input type="checkbox">` or an SVG-backed control), unchecked = gray outline circle, checked = filled blue circle with a white check.
- Completed task titles: gray text with a strikethrough.
- Add-task input: borderless, sits inline at the top of the card with a "+" glyph to its left, focus state shows a bottom border matching Google's Material feel.
- Row hover: light gray row background + the trash icon fades in (opacity transition), matching Google Tasks' hover affordance.
- Accent color: Google blue (`#1a73e8`) for the checked-checkbox fill and any interactive focus states.
- No dark mode requirement — this is a local dev tool, single light theme is sufficient for this iteration.

## Error Handling

- Network/API failures on any of the four operations surface in the existing `error` banner at the top of `App.jsx`; they do not crash the poll loop or block further actions.
- `POST`/`PATCH` validation errors (bad title, bad status) return `400` with a JSON `{ error: string }` body; the frontend surfaces `error` from that body directly in the banner.
- `PATCH`/`DELETE` on a nonexistent id return `404`; the frontend treats this the same as any other failed optimistic action — revert and show the error — since it most likely means another client (or Claude) already deleted that task.

## Testing

- **`mcp-server/tasks.test.js`**: add tests for `setTaskStatus` (done→pending, pending→done, nonexistent id returns null) replacing the old `completeTask` tests, and for `deleteTask` (existing id returns true and the row is gone, nonexistent id returns false).
- **`backend/server.test.js`**: add tests for `POST /tasks` (201 + body echoes title, 400 on missing/empty title), `PATCH /tasks/:id` (200 + status changes both directions, 400 on invalid status value, 404 on nonexistent id), `DELETE /tasks/:id` (204 + subsequent `GET /tasks` no longer includes it, 404 on nonexistent id).
- **Frontend**: no automated test suite exists for the frontend today (per the original MVP plan) and this design doesn't introduce one — verification stays manual (run the app, exercise add/toggle/collapse/delete in a browser), consistent with how Task 4 of the original MVP was verified.
- **MCP server manual check**: confirm `delete_task` and the now-generalized `complete_task` still start and respond correctly via a quick MCP client script, the same way the original `list_tasks` registration was verified.

## Out of Scope

- Docker/compose packaging (explicitly declined earlier in this project).
- A `reopen_task` MCP tool (Claude-side reopening) — the toggle-back interaction is frontend-only for now.
- Task categories, due dates/times, drag-to-reorder, multi-list support — none of these are part of "Google Tasks-style" as scoped here; this design is about the single-list interaction model and visual polish only.
- Authentication, multi-user support — unchanged from the original MVP's constraints.
