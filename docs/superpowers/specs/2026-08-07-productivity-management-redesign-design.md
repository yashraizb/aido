# Productivity Management Redesign

## Purpose

Turn aido from "a to-do list with lists/tags/audit-logs bolted on" into a coherent productivity management tool: a fixed four-section navigation (Today / Lists / Completed / Timeline), a drag-and-drop Kanban board for daily work, and a properly designed visual layer — while tightening the MCP tool surface so Claude-side usage doesn't dump the entire database into an LLM's context on every call.

This spec covers six sub-projects, built in this order (each depends on the one before it):

1. Data model: three-state tasks + a reserved "Today" system list
2. Navigation restructure: Today / Lists / Completed / Timeline sidebar
3. Today Kanban board: cards, drag-and-drop, click-to-advance
4. Timeline page: audit log feed + restore action
5. MCP output/token optimization
6. Visual redesign pass (applied last, over the finished layout)

Sub-project 5 (MCP optimization) is not dependent on 2-4's UI work and could technically be built in parallel, but is sequenced after them here because it touches the same `mcp-server/tasks.js` functions that sub-projects 1-4 are already modifying — doing it in the same pass avoids two separate diffs to the same file.

## Section 1: Data Model

**File:** `db/db.js`

- **`lists.kind` (new column):** `TEXT NOT NULL DEFAULT 'user'`, values `'system'` or `'user'`. A migration step in `runMigrations()`:
  - Adds the column if missing (same `hasColumn()` pattern already used for `tasks.list_id`/`tasks.updated_at`).
  - Ensures a `kind = 'system'` list named `'Today'` exists (reusing the existing id-`1` "Today" list if `runMigrations` finds one already named `'Today'`, since that's the current state of the real database — otherwise creating it fresh).
  - Ensures a `kind = 'user'` list named `'Inbox'` exists, for new tasks that don't specify a list.
- **`tasks.status`:** no column change — still `TEXT DEFAULT 'pending'` — but the set of valid values understood by the application layer widens from `'pending' | 'done'` to `'pending' | 'in_progress' | 'done'`, enforced at every boundary that currently checks `status !== 'pending' && status !== 'done'` (`backend/server.js`'s `PATCH /tasks/:id`, and the zod `z.enum([...])` in `mcp-server/index.js`'s `update_task_status` tool).
- **`addTask`'s default `listId`** (`mcp-server/tasks.js`) changes from the hardcoded `1` to the `'user'`-kind Inbox list's id, resolved at call time (not hardcoded, since ids aren't stable across fresh installs).
- **"Pulled into Today"** = a `task_list_links` row linking the task to the `kind = 'system'` Today list, via the existing `setTaskLinkedLists` function — no new mutation primitive needed, just a new call site (a "Pull to Today" UI action) that adds the Today list's id to a task's `linkedListIds`.
- **Today board queries** (new functions in `mcp-server/tasks.js`):
  - `listTodayTasks(db)` — tasks linked to the system Today list, filtered so `status = 'done'` rows only appear if `date(updated_at) = date('now')`; `pending`/`in_progress` rows always appear regardless of date. Implemented as one SQL query using `task_list_links` joined to the system list's id (resolved via `SELECT id FROM lists WHERE kind = 'system'`) plus the date condition — not a background job.
  - `listCompletedTasks(db)` — all tasks with `status = 'done'`, across all lists, unfiltered by date, sorted by `updated_at DESC`. Used by the global Completed section (Section 2).

## Section 2: Navigation & Sidebar

**Files:** `frontend/src/App.jsx` (restructured), new `frontend/src/components/Sidebar.jsx`, new page-level components (Section 2 continues into Sections 3-4 for the Today/Timeline pages specifically)

The sidebar becomes four fixed, always-present sections instead of the current dynamic list of user lists with checkboxes:

1. **Today** — the Kanban board (Section 3).
2. **Lists** — every `kind = 'user'` list (including Inbox), rendered with the **existing multi-select checkbox behavior already in `App.jsx`** (`checkedListIds`, `visibleLists`) — this doesn't change, it's carried over as-is. Each visible list's task card gets a **max-height with its own scroll region** (`overflow-y: auto` on the card body, not the page) so a long list doesn't push the layout around. Each list still shows its existing two-group view: pending+in_progress tasks, then a collapsible Completed group. A "Pull to Today" action is added per pending/in_progress task row here (new `onPullToToday` handler alongside the existing `onToggle`/`onDelete`/`onEdit`).
3. **Completed** — a new page/section rendering `listCompletedTasks`, one flat reverse-chronological list across all lists, each row showing title, its originating list(s), and completion time — reusing the existing `formatTimestamp()`/"Last modified" display already built into `TaskRow.jsx` (that display already exists; this section is a new place it's also used, filtered to done-only, across all lists at once rather than per-list).
4. **Timeline** — the audit log (Section 4).

The system Today list is filtered out of every "which lists exist" query the **Lists** section and any list-picker (e.g. `AddTaskModal`'s list dropdown) use — `GET /lists` gains an optional `?kind=user` filter for this, defaulting to returning all lists (unfiltered) for backward compatibility with any caller that doesn't pass it.

## Section 3: Today Kanban Board

**Files:** new `frontend/src/components/TodayBoard.jsx`, new `frontend/src/components/TaskCard.jsx`

Three columns — **To Do**, **In Progress**, **Done** — sourced from `listTodayTasks` (Section 1) and grouped client-side by `status`.

- **`TaskCard`** (replaces row-style rendering for this view only — `TaskRow`/list rows are unchanged for the Lists section): shows title, a small chip for the task's owning Backlog list name, and any tags. No checkbox here — status changes happen via drag or the advance control below.
- **Drag-and-drop** between columns updates `status` via the existing `setStatus`-style API call (extended to accept `'in_progress'`), optimistically moving the card client-side first, reverting + surfacing the error banner on failure — same pattern as every other mutation in `App.jsx` today.
- **Click-to-advance**: each card gets a "→" control that moves it forward one column (To Do → In Progress → Done) for touch/no-drag use. Backward moves (e.g. undoing a Done) are drag-only, since that's a correction path rather than the common flow.
- **"Pull to Today"** (triggered from the Lists section, Section 2): calls `updateTaskLinkedLists` with the Today list's id added to the task's current `linked_list_ids`.
- **"Remove from Today"** (a card action, not a drag-out zone, to avoid accidental removal): calls `updateTaskLinkedLists` with the Today list's id removed. The task's `status` and owning list are untouched — a Done card removed this way still appears in the global Completed section (Section 2), just no longer on the board.
- **Daily rollover is entirely a read-time filter** (Section 1's `listTodayTasks` date condition) — no data mutation happens at midnight or on any schedule. A Done card silently stops appearing in the Done column once its `updated_at` date is no longer today; To Do/In Progress cards are unaffected by date and simply persist until moved to Done or removed.

## Section 4: Timeline Page

**Files:** new `frontend/src/components/Timeline.jsx`, `backend/server.js` (new route), `mcp-server/tasks.js` (see Section 5 for the audit-log tool changes)

A read-only, reverse-chronological feed over `audit_logs`, populated identically regardless of whether the triggering action came from the MCP server or the REST backend (both already call the same `recordAudit()` in `mcp-server/tasks.js` — this is already synchronized today, this section just adds a page to view it). Each entry renders using `action`/`entity_type`/`details_json` — e.g. "Completed 'Buy milk' — 2 minutes ago", "Created list 'Learning' — yesterday" — with relative-time formatting layered on the existing `formatTimestamp` pattern.

- **Restore action**: each entry gets a "Restore to here" button calling `POST /audit-logs/:id/restore` (already exists — `backend/server.js` already has this route wired to `restoreAuditLog`; this section's only new work is exposing it in the UI with a confirmation step, since it's a destructive/full-state operation).
- No filtering/search in this pass — just the full feed. Pagination isn't addressed here either (out of scope, see below) since the REST route is explicitly *not* being tightened the way the MCP tool is (Section 5) — this is a local single-user tool and the audit log, while unbounded, is expected to stay small enough for a browser to render for the foreseeable future.

## Section 5: MCP Output/Token Optimization

**Files:** `mcp-server/tasks.js`, `mcp-server/index.js`

- **`listTasks(db, listId, status)`** (extended signature, both params optional at this shared-function level so the REST layer can keep calling it unfiltered): adds a `status` filter alongside the existing `listId` filter.
- **`mcp-server/index.js`'s `list_tasks` tool**: `listId` and `status` both become **required** in the zod schema (no `.optional()`) — Claude must specify both. This is enforced only at the MCP tool boundary, not in `listTasks` itself.
- **`listAuditLogs(db, entityType, limit)`** (extended signature, both optional at the shared-function level): adds an `entityType` filter (`'task' | 'list' | 'tag' | 'audit_log'`) and a `limit` (capped server-side at 50 regardless of what's requested, to bound worst-case output even if a caller passes something large).
- **`mcp-server/index.js`'s `list_audit_logs` tool**: `entityType` and `limit` both become **required** in the zod schema.
- **REST endpoints are unchanged** — `GET /tasks` and `GET /audit-logs` keep their current optional/unfiltered query behavior, since the frontend's existing "fetch everything, filter client-side" pattern (Today board, Completed view, multi-select Lists) is not the thing generating oversized LLM context, and re-architecting the frontend's data-fetching strategy is out of scope for this token-optimization goal.

## Error Handling

No new pattern — every new mutation (pull/remove from Today, drag/click status change, restore-from-Timeline) follows the existing optimistic-update-then-revert-on-failure flow already in `App.jsx`, surfacing through the existing shared error banner. The one new failure mode worth naming: a `list_tasks` or `list_audit_logs` MCP call missing a now-required parameter fails zod validation before ever touching the database — this is intentional (it's the whole point of Section 5), and surfaces to Claude as a normal tool-input-validation error, not an application bug.

## Testing

- **`db/db.test.js`**: migration test for `lists.kind` (system Today list ends up `kind = 'system'`, a new Inbox list is created `kind = 'user'`, migration is idempotent on repeated `initDb()` calls).
- **`mcp-server/tasks.test.js`**: `in_progress` accepted by `setTaskStatus` everywhere `'pending'`/`'done'` are today; `listTodayTasks` date-filtering (a `done` task from yesterday is excluded, from today is included, `pending`/`in_progress` included regardless of date); `listCompletedTasks` cross-list ordering; `listTasks`/`listAuditLogs`'s new optional filter params, called both with and without them (REST-style unfiltered calls must keep working).
- **`backend/server.test.js`**: new `GET /lists?kind=user` filter; any new routes added for the Completed/Timeline pages if they need dedicated endpoints beyond what `listCompletedTasks`/`listAuditLogs` already provide via existing routes.
- **`mcp-server/index.js`** (manual, per existing project convention — see [Testing](../../testing.md#whats-not-covered)): a throwaway `InMemoryTransport` script confirming `list_tasks` and `list_audit_logs` now reject calls missing the required params, and succeed with them.
- **Frontend**: manual verification, no automated suite (per existing project convention) — a walkthrough checklist covering drag-and-drop, click-to-advance, pull/remove from Today, the Completed view, and Timeline's restore action goes into the implementation plan.

## Out of Scope

- Pagination or search on the Timeline/Completed pages.
- Any change to the REST API's filtering behavior (Section 5 is MCP-only).
- Recurring tasks / due dates (raised in an earlier conversation, not part of this redesign).
- Multi-user support, auth — unchanged from every prior spec's constraints.
- Specific visual design decisions (colors, spacing, typography for the new layout) — deliberately deferred to sub-project 6, applied as its own pass once this functional layout is built, using a UI/UX design skill rather than being pre-specified here.
