# Frontend

[← Back to README](../README.md)

**Location:** `frontend/` (Vite + React, separate `package.json`/`node_modules` from the root project)

## Running it

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173, expects the backend on http://localhost:3001
```

`npm run build` produces a static `frontend/dist/` bundle (not currently deployed anywhere — see [Architecture: known gaps](architecture.md#known-gaps)).

## Layout model

The UI is a sidebar of lists next to a main panel of tasks — not a single flat list. `App.jsx` fetches all lists (`getLists`) and all tasks (`getTasks`, unfiltered), then:

- `checkedListIds` (local state) tracks which lists' checkboxes are ticked in the sidebar.
- `visibleLists` = lists whose id is in `checkedListIds`.
- For each visible list, `tasksForList(list)` filters `allTasks` down to those whose `linked_list_ids` includes that list's id (so a task linked to multiple lists appears under each one it's checked for).
- Each visible list renders its own `TaskList` (pending) + `CompletedSection` (done, collapsed) pair.

If no lists are checked, the UI shows "Select one or more list checkboxes to view their tasks." instead of an empty task area.

## Components

| Component | File | Role |
|---|---|---|
| `App` | `App.jsx` | Owns all state (`lists`, `checkedListIds`, `allTasks`, `error`), the 3s poll, and every mutation handler. Renders the sidebar and the per-list task groups. |
| `AddTaskModal` | `components/AddTaskModal.jsx` | A reusable dialog: title input + multi-select dropdown of lists to link the task into. Used both for the global "+ Add Task" button (`App.jsx`) and (with `initialTitle`/`initialSelectedListIds` pre-filled) for editing an existing task from `TaskRow`. |
| `TaskList` | `components/TaskList.jsx` | Renders one list's pending tasks as `TaskRow`s. |
| `CompletedSection` | `components/CompletedSection.jsx` | Collapsible "Completed (N)" section, collapsed by default, `null` (renders nothing) when there are zero completed tasks in that list. |
| `TaskRow` | `components/TaskRow.jsx` | One row: checkbox (toggles status), title, edit trigger (opens `AddTaskModal` pre-filled), delete button. |

`frontend/src/api.js` is the only place that knows the backend's URLs — every component calls its exported functions (`getTasks`, `createTask`, `setStatus`, `updateTaskTitle`, `updateTaskLinkedLists`, `deleteTask`, `getLists`, `createList`, `renameList`, `removeList`, `getTags`, `createTag`, `getAuditLogs`, `restoreAuditLog`), never `fetch` directly. See [Backend API](backend-api.md) for what each one hits.

## State sync: poll + optimistic updates

`App.jsx` polls `getLists()` + `getTasks()` every 3 seconds (`POLL_INTERVAL_MS`), unconditionally, for the lifetime of the component — this is what picks up changes made through Claude while the browser tab is open. On top of that, every user-initiated mutation (`handleAdd`, `handleToggle`, `handleDelete`, `handleEditTask`, and the list-management handlers) applies its change to local state **immediately**, before the network call resolves, so the UI never waits on a round-trip. If the underlying request fails, the handler reverts to the pre-action snapshot, sets `error`, and calls `refreshWorkspace()` to reconcile from the server.

`handleAdd` in particular constructs a temporary optimistic task with a string id (`tmp-${Date.now()}`) so React has a stable `key` before the real server-assigned id comes back, then swaps it for the real task once the request resolves.

## Error handling

`error` (top-level state in `App.jsx`) renders as a banner (`.error-banner` in `App.css`) above the task list whenever any operation fails. It's cleared (`setError(null)`) at the start of every new attempt. There's no per-row error state — a failed row-level action (toggle/delete) surfaces through this same shared banner.

## Visual design

`App.css` implements the Google Tasks look specified in [the original UI design spec](superpowers/specs/2026-08-05-google-tasks-ui-design.md): light gray page background, white rounded card, circular checkboxes (blue fill + white checkmark when checked via `.task-checkbox:checked::after`), strikethrough on completed titles, and a trash icon that fades in on row hover. The layout has since grown a sidebar (lists) that wasn't part of that original single-list spec — the visual language (colors, spacing, typography) was kept consistent, but the multi-list layout itself isn't documented in that spec.

## No automated frontend tests

There's no test runner configured for `frontend/` (no Vitest/Jest, no `test` script in `frontend/package.json`). Verification is manual: run `npm run dev`, exercise add/toggle/edit/delete/list-management in a browser, check the console for errors. See [Testing](testing.md) for the full picture across all four pieces of the project.
