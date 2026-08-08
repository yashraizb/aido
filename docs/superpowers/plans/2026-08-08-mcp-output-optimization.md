# MCP Output/Token Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tighten the two MCP tools that currently return unbounded data (`list_tasks`, `list_audit_logs`) so Claude must always narrow its query, preventing an accidental full-database dump into an LLM's context window.

**Architecture:** `listTasks(db, listId, status)` and `listAuditLogs(db, entityType, limit)` in `mcp-server/tasks.js` both gain new filter parameters — optional at the shared-function level, so `backend/server.js`'s existing unfiltered REST calls (`GET /tasks`, `GET /audit-logs`) keep working exactly as before. Only `mcp-server/index.js`'s tool schemas make the new parameters required, via zod. `listAuditLogs`'s `limit` is additionally hard-capped at 50 server-side whenever a limit is supplied, independent of what the caller asked for.

**Tech Stack:** Same as the rest of the project — Node.js, `@modelcontextprotocol/sdk` + `zod`, `node:test`. No REST or frontend changes.

## Global Constraints

- `list_tasks` (MCP tool): `listId` and `status` both become **required** parameters. No more "all lists, all statuses" default.
- `list_audit_logs` (MCP tool): `entityType` (`'task' | 'list' | 'tag' | 'audit_log'`) and `limit` (positive integer, max 50) both become **required** parameters.
- `backend/server.js`'s `GET /tasks` and `GET /audit-logs` are **not touched** — they call the shared functions with fewer arguments than the new signatures support, which is valid because the new parameters default to "no filter" when omitted. The frontend's existing "fetch everything, filter/poll client-side" behavior (Lists, Completed, Today, Timeline) must be unaffected.
- `listAuditLogs`'s cap is real, not just advisory: even if a future caller (REST or otherwise) requests `limit: 1000`, the shared function itself returns at most 50 rows whenever `limit` is not `null`. Omitting `limit` entirely (as `GET /audit-logs` does today) is unaffected by the cap — that path stays fully unbounded, per the constraint above.

---

## File Structure

```
mcp-server/
  tasks.js             # MODIFY: listTasks gains status filter; listAuditLogs gains entityType filter + capped limit
  tasks.test.js          # MODIFY: add tests for both
  index.js              # MODIFY: list_tasks and list_audit_logs tool schemas require their new params
```

---

### Task 1: Extend `listTasks` and `listAuditLogs` with optional filters

**Files:**
- Modify: `mcp-server/tasks.js`
- Modify: `mcp-server/tasks.test.js`

**Interfaces:**
- Consumes: nothing new — extends two existing exported functions.
- Produces: `listTasks(db, listId = null, status = null) -> Array<hydrated task>` — filters by owning list id and/or status; both `null` (the existing default) means "no filter on that dimension", preserving current callers (`backend/server.js`'s `GET /tasks` calls `listTasks(db, listId)` with `listId` possibly `null` and no third argument — both remain valid). `listAuditLogs(db, entityType = null, limit = null) -> Array<audit entry>` — filters by `entity_type` and caps the row count at `Math.min(limit, 50)` whenever `limit` is not `null`; `entityType = null` and `limit = null` (the existing zero-arg call shape) return everything, unfiltered, exactly as today.

- [ ] **Step 1: Write the failing tests**

Open `mcp-server/tasks.test.js`. Add these tests (anywhere near the existing `listTasks`/`listAuditLogs` tests, or at the end of the file):

```js
test('listTasks filters by status alone when no listId is given', () => {
  const db = initDb(':memory:');
  const { addTask, setTaskStatus, listTasks } = require('./tasks.js');

  const pendingTask = addTask(db, 'Still pending');
  const doneTask = addTask(db, 'Already done');
  setTaskStatus(db, doneTask.id, 'done');

  const results = listTasks(db, null, 'done');

  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].id, doneTask.id);
  db.close();
});

test('listTasks filters by both listId and status together', () => {
  const db = initDb(':memory:');
  const { addTask, createList, setTaskStatus, listTasks } = require('./tasks.js');

  const otherList = createList(db, 'Other list');
  const taskA = addTask(db, 'Task A');
  const taskB = addTask(db, 'Task B', otherList.id);
  setTaskStatus(db, taskA.id, 'done');
  setTaskStatus(db, taskB.id, 'done');

  const inboxDone = listTasks(db, taskA.list_id, 'done');

  assert.strictEqual(inboxDone.length, 1);
  assert.strictEqual(inboxDone[0].id, taskA.id);
  db.close();
});

test('listTasks with no arguments beyond db still returns everything (REST backward compatibility)', () => {
  const db = initDb(':memory:');
  const { addTask, listTasks } = require('./tasks.js');

  addTask(db, 'First');
  addTask(db, 'Second');

  const results = listTasks(db);

  assert.strictEqual(results.length, 2);
  db.close();
});

test('listAuditLogs filters by entityType', () => {
  const db = initDb(':memory:');
  const { addTask, createList, listAuditLogs } = require('./tasks.js');

  addTask(db, 'A task'); // records a 'task' entity_type audit entry
  createList(db, 'A list'); // records a 'list' entity_type audit entry

  const taskEntries = listAuditLogs(db, 'task');

  assert.ok(taskEntries.length > 0);
  assert.ok(taskEntries.every((entry) => entry.entity_type === 'task'));
  db.close();
});

test('listAuditLogs caps limit at 50 even if a larger limit is requested', () => {
  const db = initDb(':memory:');
  const { addTask, listAuditLogs } = require('./tasks.js');

  for (let i = 0; i < 55; i += 1) {
    addTask(db, `Task ${i}`);
  }

  const results = listAuditLogs(db, null, 1000);

  assert.strictEqual(results.length, 50);
  db.close();
});

test('listAuditLogs with no arguments beyond db still returns everything (REST backward compatibility)', () => {
  const db = initDb(':memory:');
  const { addTask, listAuditLogs } = require('./tasks.js');

  for (let i = 0; i < 10; i += 1) {
    addTask(db, `Task ${i}`);
  }

  const results = listAuditLogs(db);

  assert.strictEqual(results.length, 10);
  db.close();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test mcp-server/tasks.test.js`
Expected: FAIL — `listTasks(db, null, 'done')` currently ignores the third argument entirely (status filtering doesn't exist yet), so the status-only and combined-filter tests fail; `listAuditLogs(db, 'task')` currently ignores its second argument, so the entityType and limit tests fail.

- [ ] **Step 3: Update `listTasks` in `mcp-server/tasks.js`**

Find the current function:

```js
function listTasks(db, listId = null) {
  let tasks;
  if (listId == null) {
    tasks = db.prepare('SELECT * FROM tasks ORDER BY id ASC').all();
  } else {
    tasks = db.prepare('SELECT * FROM tasks WHERE list_id = ? ORDER BY id ASC').all(listId);
  }
  return hydrateTasks(db, tasks);
}
```

Replace it with:

```js
function listTasks(db, listId = null, status = null) {
  const conditions = [];
  const params = [];

  if (listId != null) {
    conditions.push('list_id = ?');
    params.push(listId);
  }
  if (status != null) {
    conditions.push('status = ?');
    params.push(status);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const tasks = db.prepare(`SELECT * FROM tasks ${whereClause} ORDER BY id ASC`).all(...params);
  return hydrateTasks(db, tasks);
}
```

- [ ] **Step 4: Update `listAuditLogs` in `mcp-server/tasks.js`**

Find the current function:

```js
function listAuditLogs(db) {
  return db
    .prepare('SELECT id, action, entity_type, entity_id, details_json, created_at FROM audit_logs ORDER BY id DESC')
    .all()
    .map((row) => ({
      ...row,
      details: JSON.parse(row.details_json),
    }));
}
```

Replace it with:

```js
function listAuditLogs(db, entityType = null, limit = null) {
  const conditions = [];
  const params = [];

  if (entityType != null) {
    conditions.push('entity_type = ?');
    params.push(entityType);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const effectiveLimit = limit != null ? Math.min(limit, 50) : null;
  const limitClause = effectiveLimit != null ? 'LIMIT ?' : '';
  const queryParams = effectiveLimit != null ? [...params, effectiveLimit] : params;

  return db
    .prepare(
      `SELECT id, action, entity_type, entity_id, details_json, created_at FROM audit_logs ${whereClause} ORDER BY id DESC ${limitClause}`
    )
    .all(...queryParams)
    .map((row) => ({
      ...row,
      details: JSON.parse(row.details_json),
    }));
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test mcp-server/tasks.test.js`
Expected: PASS (all tests, including the 5 new ones)

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS, all tests across `db/`, `mcp-server/`, `backend/` — the `backend/server.test.js` tests for `GET /tasks` and `GET /audit-logs` must still pass unchanged, confirming the REST layer's unfiltered calls (`listTasks(db, listId)`, `listAuditLogs(db)`) still work with the extended signatures.

- [ ] **Step 7: Commit**

```bash
git add mcp-server/tasks.js mcp-server/tasks.test.js
git commit -m "feat: add optional status filter to listTasks, entityType/capped-limit filter to listAuditLogs"
```

---

### Task 2: Require the new filters on the MCP tools

**Files:**
- Modify: `mcp-server/index.js`

**Interfaces:**
- Consumes: `listTasks(db, listId, status)`, `listAuditLogs(db, entityType, limit)` (Task 1).
- Produces: `list_tasks` MCP tool now requires `listId` (positive integer) and `status` (`'pending' | 'in_progress' | 'done'`) — both mandatory, no `.optional()`. `list_audit_logs` MCP tool now requires `entityType` (`'task' | 'list' | 'tag' | 'audit_log'`) and `limit` (positive integer, max 50) — both mandatory, replacing its previous zero-argument registration.

- [ ] **Step 1: Update the `list_tasks` tool**

Find the current registration:

```js
server.tool(
  'list_tasks',
  { listId: z.number().int().positive().optional().describe('Optional list ID filter') },
  async ({ listId }) => {
    const tasks = listTasks(db, listId ?? null);
    return { content: [{ type: 'text', text: JSON.stringify(tasks) }] };
  }
);
```

Replace it with:

```js
server.tool(
  'list_tasks',
  {
    listId: z.number().int().positive().describe('List ID to filter by (required — narrow the query, do not fetch every list)'),
    status: z.enum(['pending', 'in_progress', 'done']).describe('Status to filter by (required — narrow the query, do not fetch every status)'),
  },
  async ({ listId, status }) => {
    const tasks = listTasks(db, listId, status);
    return { content: [{ type: 'text', text: JSON.stringify(tasks) }] };
  }
);
```

- [ ] **Step 2: Update the `list_audit_logs` tool**

Find the current registration:

```js
server.tool('list_audit_logs', 'List audit log entries', async () => {
  const logs = listAuditLogs(db);
  return { content: [{ type: 'text', text: JSON.stringify(logs) }] };
});
```

Replace it with:

```js
server.tool(
  'list_audit_logs',
  {
    entityType: z
      .enum(['task', 'list', 'tag', 'audit_log'])
      .describe('Entity type to filter by (required — narrow the query, do not fetch every entry)'),
    limit: z.number().int().positive().max(50).describe('Maximum number of entries to return (required, max 50)'),
  },
  async ({ entityType, limit }) => {
    const logs = listAuditLogs(db, entityType, limit);
    return { content: [{ type: 'text', text: JSON.stringify(logs) }] };
  }
);
```

- [ ] **Step 3: Manually verify both tools reject calls missing the required parameters, and succeed when provided**

Run: `node mcp-server/index.js` briefly to confirm it starts without error (no stack trace), then Ctrl+C to stop.

Then verify tool behavior with a throwaway in-memory client script (do not commit it) — this follows the same verification pattern already documented in [docs/mcp-server.md](../../mcp-server.md#adding-a-new-tool) for a prior change to this file:

```js
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js');
const { z } = require('zod');
const { initDb } = require('./db/db.js');
const { addTask, listTasks, listAuditLogs, createList } = require('./mcp-server/tasks.js');

async function main() {
  const db = initDb(':memory:');
  const server = new McpServer({ name: 'test', version: '1.0.0' });

  server.tool(
    'list_tasks',
    {
      listId: z.number().int().positive().describe('required'),
      status: z.enum(['pending', 'in_progress', 'done']).describe('required'),
    },
    async ({ listId, status }) => {
      const tasks = listTasks(db, listId, status);
      return { content: [{ type: 'text', text: JSON.stringify(tasks) }] };
    }
  );

  server.tool(
    'list_audit_logs',
    {
      entityType: z.enum(['task', 'list', 'tag', 'audit_log']).describe('required'),
      limit: z.number().int().positive().max(50).describe('required'),
    },
    async ({ entityType, limit }) => {
      const logs = listAuditLogs(db, entityType, limit);
      return { content: [{ type: 'text', text: JSON.stringify(logs) }] };
    }
  );

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

  const list = createList(db, 'Verification list');
  addTask(db, 'Verification task', list.id);

  const withArgs = await client.callTool({ name: 'list_tasks', arguments: { listId: list.id, status: 'pending' } });
  console.log('list_tasks WITH args:', JSON.stringify(withArgs).slice(0, 200));

  try {
    const withoutArgs = await client.callTool({ name: 'list_tasks', arguments: {} });
    console.log('list_tasks WITHOUT args (should not reach here):', JSON.stringify(withoutArgs));
  } catch (err) {
    console.log('list_tasks WITHOUT args correctly rejected:', err.message);
  }

  const auditWithArgs = await client.callTool({ name: 'list_audit_logs', arguments: { entityType: 'task', limit: 10 } });
  console.log('list_audit_logs WITH args:', JSON.stringify(auditWithArgs).slice(0, 200));

  try {
    const auditWithoutArgs = await client.callTool({ name: 'list_audit_logs', arguments: {} });
    console.log('list_audit_logs WITHOUT args (should not reach here):', JSON.stringify(auditWithoutArgs));
  } catch (err) {
    console.log('list_audit_logs WITHOUT args correctly rejected:', err.message);
  }

  db.close();
}

main();
```

Save this as `verify-mcp-scratch.js` at the repo root and run `node verify-mcp-scratch.js`.

Expected output: both "WITH args" calls succeed and print task/log data; both "WITHOUT args" calls are caught and print a rejection message (zod validation error), never reaching the "should not reach here" lines.

Delete `verify-mcp-scratch.js` afterward — do not commit it.

- [ ] **Step 4: Run the full suite one more time**

Run: `npm test`
Expected: PASS — this task only touched `mcp-server/index.js`, which has no direct `node:test` coverage in this codebase (the MCP tool layer is verified manually, per the project's established convention — see [Testing: what's not covered](../../testing.md#whats-not-covered)), so this run confirms nothing else regressed.

- [ ] **Step 5: Commit**

```bash
git add mcp-server/index.js
git commit -m "feat: require listId+status on list_tasks, entityType+limit on list_audit_logs MCP tools"
```

---

## Self-Review Notes

- **Spec coverage:** `list_tasks` requires `listId`+`status` ✓ (Task 2 Step 1). `list_audit_logs` requires `entityType`+`limit` (capped 50) ✓ (Task 2 Step 2, with the cap enforced at the shared-function level in Task 1 Step 4 — a real cap, not just a zod `.max(50)` on the tool boundary that a REST-style caller could bypass). REST endpoints unchanged ✓ (verified explicitly by the backward-compatibility tests in Task 1 Step 1, which call the shared functions the exact way `backend/server.js` does today, and by Task 1 Step 6 re-running the full suite including `backend/server.test.js`).
- **Type/signature consistency:** `listTasks(db, listId, status)` and `listAuditLogs(db, entityType, limit)` — the parameter names and order defined in Task 1 are used identically by `mcp-server/index.js` in Task 2 (`listTasks(db, listId, status)`, `listAuditLogs(db, entityType, limit)`).
- **Placeholder scan:** No TBD/TODO markers; every step contains complete, runnable code.
