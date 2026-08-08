# Timeline Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "Timeline" placeholder panel with a real read-only feed over the existing audit log, each entry described in plain language, with a "Restore to here" action.

**Architecture:** No backend or `api.js` changes are needed — `GET /audit-logs` and `POST /audit-logs/:id/restore` already exist (built well before this plan, alongside the rest of the lists/tags/audit-log feature), and `frontend/src/api.js` already exports `getAuditLogs()`/`restoreAuditLog(id)` wrapping them. This plan is purely a new frontend page: a pure `describeAuditEntry(entry)` function that turns an audit log row's `action`/`entity_type`/`details` into a human-readable line, and a `Timeline.jsx` component that fetches the feed, renders it newest-first using that description plus the existing shared `formatTimestamp`, and wires up the restore button.

**Tech Stack:** Same as the rest of the project — React, no new dependencies.

## Global Constraints

- No filtering or search in this pass — the full feed, newest-first (already the order `listAuditLogs` returns, via `ORDER BY id DESC` — no client-side sorting needed).
- Timestamps use the existing shared `formatTimestamp` (absolute, IST-formatted) rather than a separate relative-time ("2 minutes ago") system — a deliberate simplification to reuse what's already consistent across `TaskRow`/`CompletedView` rather than introduce a second time-formatting approach for the same underlying data.
- Entry descriptions only use data actually present in `details` — several audit actions (e.g. `set_task_status`, `set_task_tags`, `set_task_linked_lists`) don't store the task's title, only its id, so those entries describe the task by id (`"Task #12"`) rather than fabricating a title that isn't in the stored data. Actions whose `details` does include a title/name (`create_task`, `set_task_title`, `delete_task`, `create_list`, `update_list`, `delete_list`, `create_tag`) use it.
- Restore is destructive (it wipes and reinserts `lists`/`tasks`/`tags`/`task_tags`/`task_list_links` from a past snapshot) — it must be gated behind a confirmation step before calling the API.
- No new automated frontend tests (no test runner exists, per established project convention — see [Testing](../../testing.md)); verification is manual.

---

## File Structure

```
frontend/
  src/
    describeAuditEntry.js    # CREATE: pure function, audit entry -> human-readable string
    App.jsx                    # MODIFY: replace Timeline placeholder with <Timeline />
    components/
      Timeline.jsx              # CREATE: fetches audit log, renders feed, handles restore
```

---

### Task 1: `describeAuditEntry` — human-readable audit descriptions

**Files:**
- Create: `frontend/src/describeAuditEntry.js`

**Interfaces:**
- Consumes: nothing — pure function over the shape `listAuditLogs`/`GET /audit-logs` already returns: `{ id, action, entity_type, entity_id, details_json, details, created_at }` (the `details` field is already parsed JSON — see `mcp-server/tasks.js`'s `listAuditLogs`, which maps each row to include `details: JSON.parse(row.details_json)`).
- Produces: `describeAuditEntry(entry) -> string`, exported for use by `Timeline.jsx` (Task 2). Not yet imported by anything in this task — same "build the leaf piece first" pattern used successfully in the two prior plans.

- [ ] **Step 1: Create `frontend/src/describeAuditEntry.js`**

```js
function describeCreateTask(entry) {
  return `Created task "${entry.details.title}"`;
}

function describeSetTaskStatus(entry) {
  return `Marked task #${entry.entity_id} as ${entry.details.status}`;
}

function describeSetTaskTitle(entry) {
  return `Renamed task #${entry.entity_id} to "${entry.details.title}"`;
}

function describeDeleteTask(entry) {
  const title = entry.details && entry.details.title;
  return title ? `Deleted task "${title}"` : `Deleted task #${entry.entity_id}`;
}

function describeSetTaskTags(entry) {
  const tagNames = Array.isArray(entry.details.tagNames) ? entry.details.tagNames : [];
  return tagNames.length > 0
    ? `Set tags on task #${entry.entity_id} to: ${tagNames.join(', ')}`
    : `Cleared tags on task #${entry.entity_id}`;
}

function describeSetTaskLinkedLists(entry) {
  return `Updated linked lists for task #${entry.entity_id}`;
}

function describeCreateList(entry) {
  return `Created list "${entry.details.name}"`;
}

function describeUpdateList(entry) {
  return `Renamed list #${entry.entity_id} to "${entry.details.name}"`;
}

function describeDeleteList(entry) {
  const name = entry.details && entry.details.list && entry.details.list.name;
  const removedTasks = entry.details && entry.details.removedTasks;
  const label = name ? `"${name}"` : `#${entry.entity_id}`;
  return `Deleted list ${label}${removedTasks ? ` (${removedTasks} task${removedTasks === 1 ? '' : 's'} removed)` : ''}`;
}

function describeCreateTag(entry) {
  return `Created tag "${entry.details.name}"`;
}

function describeRestoreAuditLog(entry) {
  return `Restored to a previous state (from entry #${entry.details.restoredFromAuditId})`;
}

const DESCRIBERS = {
  create_task: describeCreateTask,
  set_task_status: describeSetTaskStatus,
  set_task_title: describeSetTaskTitle,
  delete_task: describeDeleteTask,
  set_task_tags: describeSetTaskTags,
  set_task_linked_lists: describeSetTaskLinkedLists,
  create_list: describeCreateList,
  update_list: describeUpdateList,
  delete_list: describeDeleteList,
  create_tag: describeCreateTag,
  restore_audit_log: describeRestoreAuditLog,
};

export function describeAuditEntry(entry) {
  const describer = DESCRIBERS[entry.action];
  if (!describer) return `${entry.action} (${entry.entity_type} #${entry.entity_id})`;

  try {
    return describer(entry);
  } catch {
    return `${entry.action} (${entry.entity_type} #${entry.entity_id})`;
  }
}
```

The `try/catch` around each describer (falling back to the generic `"<action> (<entity_type> #<id>)"` form) protects against a malformed/legacy `details` shape — e.g. an audit entry from before some detail field existed — without needing to hand-write defensive null checks in every describer function.

- [ ] **Step 2: Manually verify with real data**

If you have an `aido` database with some history (`db/tasks.db`, or run the app and perform a few actions first), you can sanity-check this function in a Node REPL:

```bash
node -e "
const { initDb } = require('./db/db.js');
const { listAuditLogs } = require('./mcp-server/tasks.js');
const { describeAuditEntry } = require('./frontend/src/describeAuditEntry.js');
" 2>&1 | head -5
```

This will fail with a `require` error because `describeAuditEntry.js` uses `export`/ESM syntax (matching the rest of `frontend/src/`) while the backend is CommonJS — that's expected and fine, this file is frontend-only and never required from Node directly. Instead, verify it visually: read through the 11 `describe*` functions against the `recordAudit(...)` call sites in `mcp-server/tasks.js` (grep for `recordAudit(db, {` — there are 11 call sites, one per action) and confirm each function's field access (`entry.details.title`, `entry.details.status`, etc.) matches exactly what that call site's `details: {...}` actually contains. This is a static/manual review verification since there's no test runner for this file — be thorough, since a typo'd field name (e.g. `entry.detail.title` instead of `entry.details.title`) would silently fall through to `undefined` in the string rather than erroring.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/describeAuditEntry.js
git commit -m "feat: add describeAuditEntry helper for human-readable audit log entries"
```

---

### Task 2: `Timeline` component — assemble the feed

**Files:**
- Create: `frontend/src/components/Timeline.jsx`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: `getAuditLogs()`, `restoreAuditLog(id)` from `frontend/src/api.js` (already exist, unmodified), `describeAuditEntry` (Task 1), `formatTimestamp` from `frontend/src/formatTimestamp.js` (already exists, unmodified).
- Produces: `Timeline` — no props, self-contained, same shape as `CompletedView`/`TodayBoard`.

- [ ] **Step 1: Create `frontend/src/components/Timeline.jsx`**

```jsx
import { useEffect, useState } from 'react';
import { getAuditLogs, restoreAuditLog } from '../api.js';
import { describeAuditEntry } from '../describeAuditEntry.js';
import { formatTimestamp } from '../formatTimestamp.js';

export default function Timeline() {
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await getAuditLogs();
        if (!cancelled) {
          setEntries(data);
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

  async function refreshAfterRestore() {
    try {
      const data = await getAuditLogs();
      setEntries(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRestore(entry) {
    const confirmed = window.confirm(
      `Restore to this point in time?\n\n"${describeAuditEntry(entry)}" (${formatTimestamp(entry.created_at)})\n\nThis replaces all current lists, tasks, tags, and their links with the state captured at that moment. This cannot be undone from here (though the restore itself is logged, so you could restore again to before it).`
    );
    if (!confirmed) return;

    setRestoringId(entry.id);
    setError(null);
    try {
      await restoreAuditLog(entry.id);
      await refreshAfterRestore();
    } catch (err) {
      setError(err.message);
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <section className="tasks-card" aria-label="Timeline">
      <h1 className="tasks-title">Timeline</h1>
      {error && <p className="error-banner">{error}</p>}
      {!loading && entries.length === 0 && <p className="empty-note">No activity recorded yet.</p>}
      <ul className="task-list">
        {entries.map((entry) => (
          <li key={entry.id} className="task-row timeline-row">
            <div className="task-text-wrap">
              <span className="task-title">{describeAuditEntry(entry)}</span>
              <span className="task-meta">{formatTimestamp(entry.created_at)}</span>
            </div>
            <button
              type="button"
              className="timeline-restore-btn"
              onClick={() => handleRestore(entry)}
              disabled={restoringId === entry.id}
              aria-label={`Restore to here: ${describeAuditEntry(entry)}`}
            >
              {restoringId === entry.id ? 'Restoring…' : 'Restore to here'}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

This fetches once on mount, like `CompletedView` (not on the 3s poll cycle `ListsView`/`TodayBoard` use) — the Timeline is a historical log a user checks deliberately, not a live-updating dashboard; switching sections and back re-fetches via the `useEffect`, and a successful restore explicitly calls `refresh()` to show the new "restored" entry it just created.

- [ ] **Step 2: Add the restore button's CSS**

Open `frontend/src/App.css`. Add this rule near the existing `.task-delete`/`.kanban-remove-btn` rules:

```css
.timeline-row {
  align-items: center;
}

.timeline-restore-btn {
  border: 1px solid #d2e3fc;
  background: transparent;
  color: #174ea6;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

.timeline-restore-btn:hover:not(:disabled) {
  background: #e8f0fe;
}

.timeline-restore-btn:disabled {
  opacity: 0.6;
  cursor: default;
}
```

- [ ] **Step 3: Wire `Timeline` into `App.jsx`**

Open `frontend/src/App.jsx`. Add the import alongside the existing component imports:

```jsx
import Timeline from './components/Timeline.jsx';
```

Replace the Timeline placeholder block:

```jsx
        {activeSection === 'timeline' && (
          <section className="placeholder-panel" aria-label="Timeline">
            <h1 className="tasks-title">Timeline</h1>
            <p className="empty-note">The Timeline is coming soon.</p>
          </section>
        )}
```

with:

```jsx
        {activeSection === 'timeline' && <Timeline />}
```

`Timeline` is a simple conditional render (not kept always-mounted like `ListsView`), matching `CompletedView`'s and `TodayBoard`'s existing pattern — it has no meaningful local selection state worth preserving across section switches.

- [ ] **Step 4: Manually verify end-to-end**

Start the backend (`node backend/index.js`) and frontend (`cd frontend && npm run dev`), open the app.

1. Perform a few actions first if you haven't already this session — add a task, complete it, create a list, rename it, pull something to Today.
2. Click "Timeline" in the nav rail. Confirm a reverse-chronological feed appears, each row showing a readable description (e.g. "Created task \"...\"", "Marked task #N as done", "Created list \"...\"") and a timestamp, newest at the top.
3. Click "Restore to here" on an older entry. Confirm a browser confirm dialog appears describing what will be restored. Cancel it — confirm nothing happens (no request sent, check the Network tab).
4. Click "Restore to here" again and confirm it. Confirm the button shows "Restoring…" briefly, then the feed refreshes and a new entry appears at the top describing the restore itself (e.g. "Restored to a previous state (from entry #N)").
5. Switch to the Lists view and confirm the restored state is reflected there (it'll pick it up on its next 3s poll tick if not immediately).
6. Confirm no console errors throughout.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Timeline.jsx frontend/src/App.css frontend/src/App.jsx
git commit -m "feat: add Timeline page with human-readable audit feed and restore action"
```

---

## Self-Review Notes

- **Spec coverage:** Read-only reverse-chronological feed ✓ (Task 2, `getAuditLogs()` already returns newest-first). Human-readable descriptions from `action`/`entity_type`/`details` ✓ (Task 1). "Restore to here" action, gated by confirmation ✓ (Task 2's `handleRestore`, using the already-existing `restoreAuditLog` REST call). No filtering/search ✓ (explicitly not built). Both MCP-server-originated and REST-originated audit entries appear identically ✓ (both write through the same `recordAudit` in `mcp-server/tasks.js`, unchanged by this plan — this was already true before this plan and this plan doesn't need to do anything to preserve it).
- **No backend changes needed** — verified `GET /audit-logs` and `POST /audit-logs/:id/restore` already exist in `backend/server.js` and are already exported from `frontend/src/api.js` as `getAuditLogs`/`restoreAuditLog`, predating this plan (part of the earlier lists/tags/audit-log feature work). This plan is frontend-only.
- **Type/signature consistency:** `describeAuditEntry(entry)` (Task 1) is imported and called identically in `Timeline.jsx` (Task 2) — same signature, same field names (`entry.details`, `entry.entity_id`, `entry.action`, `entry.created_at`) as what `listAuditLogs`/`GET /audit-logs` actually returns.
- **Placeholder scan:** No TBD/TODO markers; every step contains complete, runnable code.
