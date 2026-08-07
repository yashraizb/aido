# Data Model: Three-State Tasks + Reserved Today List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the data-model foundation for the productivity-management redesign: a third task status (`in_progress`), a reserved system list that represents "Today," an Inbox default for un-listed new tasks, and the two new read queries (`listTodayTasks`, `listCompletedTasks`) that the Today board and Completed view will consume in later plans.

**Architecture:** `db/db.js` gains a `lists.kind` column (`'system'` | `'user'`) and a migration step that marks the existing "Today" list as `kind = 'system'` and creates a `kind = 'user'` "Inbox" list. `mcp-server/tasks.js` widens status validation to include `'in_progress'`, changes `addTask`'s default owning list from a hardcoded id to the resolved Inbox list, and adds `listTodayTasks`/`listCompletedTasks`. `mcp-server/index.js` and `backend/server.js` both get their status enum/validation widened to match, and `GET /lists` gains an optional `?kind=` filter.

**Tech Stack:** Same as the rest of the project — Node.js, `better-sqlite3`, Express, `@modelcontextprotocol/sdk` + `zod`, `node:test`.

## Global Constraints

- `status` is now exactly one of `'pending'`, `'in_progress'`, `'done'` everywhere it's validated (was `'pending'`/`'done'`).
- The reserved Today list must never be returned by any "which lists can I assign a task to" query used by list-picker UI (out of scope for this plan, but the `GET /lists?kind=user` filter this plan adds is what later plans will use for that).
- This plan does not touch the frontend, the MCP tool schemas' required-vs-optional parameters, or the Today Kanban UI — those are separate plans per the design spec. This plan's job is exclusively the shared data layer both of those will build on.
- No background jobs / cron: daily rollover for the Today board is a read-time date filter, implemented here as part of `listTodayTasks`.

---

## File Structure

```
db/
  db.js               # MODIFY: add lists.kind column + migration (Today/Inbox lists)
  db.test.js           # MODIFY: add kind-migration assertions
mcp-server/
  tasks.js             # MODIFY: status widened, addTask default list, new query functions
  tasks.test.js         # MODIFY: add tests for the above
  index.js             # MODIFY: status enum widened to include 'in_progress'
backend/
  server.js            # MODIFY: status validation widened, GET /lists?kind= filter
  server.test.js         # MODIFY: add tests for the above
```

---

### Task 1: `lists.kind` column + Today/Inbox migration

**Files:**
- Modify: `db/db.js`
- Modify: `db/db.test.js`

**Interfaces:**
- Consumes: nothing new (this is the foundation).
- Produces: after `initDb()` runs, `lists` always contains at least one row with `kind = 'system'` and `name = 'Today'`, and at least one row with `kind = 'user'` and `name = 'Inbox'`. Later tasks resolve these by querying `WHERE kind = 'system'` / `WHERE kind = 'user' AND name = 'Inbox'` — never by hardcoded id.

- [ ] **Step 1: Write the failing tests**

Open `db/db.test.js`. Add these two tests after the existing two (`initDb creates the tasks table with expected columns` and `initDb is idempotent`):

```js
test('initDb adds a kind column to lists, defaulting to "user"', () => {
  const { initDb } = require('./db.js');
  const tmpPath = path.join(os.tmpdir(), `aido-test-${Date.now()}-3.db`);
  const db = initDb(tmpPath);

  const columns = db.prepare("PRAGMA table_info(lists)").all().map(c => c.name);
  assert.ok(columns.includes('kind'));

  db.close();
  fs.unlinkSync(tmpPath);
});

test('initDb ensures a system Today list and a user Inbox list exist', () => {
  const { initDb } = require('./db.js');
  const tmpPath = path.join(os.tmpdir(), `aido-test-${Date.now()}-4.db`);
  const db = initDb(tmpPath);

  const todayList = db.prepare("SELECT * FROM lists WHERE kind = 'system'").get();
  assert.ok(todayList, 'expected a system-kind list to exist');
  assert.strictEqual(todayList.name, 'Today');

  const inboxList = db.prepare("SELECT * FROM lists WHERE kind = 'user' AND name = 'Inbox'").get();
  assert.ok(inboxList, 'expected a user-kind Inbox list to exist');

  db.close();
  fs.unlinkSync(tmpPath);
});

test('initDb migration is idempotent: exactly one system list after two initDb calls', () => {
  const { initDb } = require('./db.js');
  const tmpPath = path.join(os.tmpdir(), `aido-test-${Date.now()}-5.db`);
  const db1 = initDb(tmpPath);
  db1.close();
  const db2 = initDb(tmpPath);

  const systemLists = db2.prepare("SELECT * FROM lists WHERE kind = 'system'").all();
  assert.strictEqual(systemLists.length, 1);

  const inboxLists = db2.prepare("SELECT * FROM lists WHERE kind = 'user' AND name = 'Inbox'").all();
  assert.strictEqual(inboxLists.length, 1);

  db2.close();
  fs.unlinkSync(tmpPath);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test db/db.test.js`
Expected: FAIL — `lists` has no `kind` column, no system/Inbox lists exist yet.

- [ ] **Step 3: Update `db/db.js`**

In the `SCHEMA` template literal, change the `lists` table definition (add `kind`):

```sql
CREATE TABLE IF NOT EXISTS lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'user',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Then update `runMigrations(db)` — add this logic after the existing `hasColumn`-based column checks and before the existing `INSERT OR IGNORE INTO lists (id, name) VALUES (1, 'My Tasks')` line (that old line stays as-is, for databases older than this migration; the new logic below runs after it so it can find whatever list ends up as the effective "first" list):

```js
function runMigrations(db) {
  if (!hasColumn(db, 'tasks', 'list_id')) {
    db.exec('ALTER TABLE tasks ADD COLUMN list_id INTEGER');
  }

  if (!hasColumn(db, 'tasks', 'updated_at')) {
    db.exec('ALTER TABLE tasks ADD COLUMN updated_at DATETIME');
  }

  if (!hasColumn(db, 'lists', 'kind')) {
    db.exec("ALTER TABLE lists ADD COLUMN kind TEXT NOT NULL DEFAULT 'user'");
  }

  db.exec("INSERT OR IGNORE INTO lists (id, name) VALUES (1, 'My Tasks')");
  db.exec('UPDATE tasks SET list_id = 1 WHERE list_id IS NULL');
  db.exec('UPDATE tasks SET updated_at = created_at WHERE updated_at IS NULL');

  db.exec(`
    INSERT OR IGNORE INTO task_list_links (task_id, list_id)
    SELECT tt.task_id, l.id
    FROM task_tags tt
    JOIN tags t ON t.id = tt.tag_id
    JOIN lists l ON l.name = t.name
  `);

  const existingSystemList = db.prepare("SELECT id FROM lists WHERE kind = 'system'").get();
  if (!existingSystemList) {
    const existingTodayNamed = db.prepare("SELECT id FROM lists WHERE name = 'Today'").get();
    if (existingTodayNamed) {
      db.prepare("UPDATE lists SET kind = 'system' WHERE id = ?").run(existingTodayNamed.id);
    } else {
      db.prepare("INSERT INTO lists (name, kind) VALUES ('Today', 'system')").run();
    }
  }

  const existingInbox = db.prepare("SELECT id FROM lists WHERE kind = 'user' AND name = 'Inbox'").get();
  if (!existingInbox) {
    db.prepare("INSERT INTO lists (name, kind) VALUES ('Inbox', 'user')").run();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test db/db.test.js`
Expected: PASS (5 tests: the original 2, plus the 3 new ones)

- [ ] **Step 5: Commit**

```bash
git add db/db.js db/db.test.js
git commit -m "feat: add lists.kind column with system Today list and user Inbox list migration"
```

---

### Task 2: Widen status to include `in_progress`; `addTask` defaults to Inbox

**Files:**
- Modify: `mcp-server/tasks.js`
- Modify: `mcp-server/tasks.test.js`
- Modify: `mcp-server/index.js`
- Modify: `backend/server.js`
- Modify: `backend/server.test.js`

**Interfaces:**
- Consumes: the `kind = 'system'`/`kind = 'user'` lists guaranteed to exist by Task 1.
- Produces: `setTaskStatus(db, id, status)` now accepts `'pending' | 'in_progress' | 'done'` (unchanged signature, just a wider accepted value set — validation of the value itself still happens at the MCP tool / REST route boundary, not inside `setTaskStatus`, consistent with how it already trusts its input). `addTask(db, title, listId, tagNames, linkedListIds)` — when `listId` is not passed (or is `undefined`), resolves to the Inbox list's id instead of the previous hardcoded `1`.

- [ ] **Step 1: Write the failing tests**

In `mcp-server/tasks.test.js`, add these tests (place them near the existing `addTask`/`setTaskStatus` tests — the file's exact existing test names may vary since this file has grown since the original MVP, so add these as new `test(...)` blocks rather than replacing anything):

```js
test('addTask with no listId defaults to the Inbox list, not a hardcoded id', () => {
  const db = initDb(':memory:');
  const { addTask } = require('./tasks.js');

  const task = addTask(db, 'Unsorted task');
  const inbox = db.prepare("SELECT id FROM lists WHERE kind = 'user' AND name = 'Inbox'").get();

  assert.strictEqual(task.list_id, inbox.id);
  db.close();
});

test('setTaskStatus accepts in_progress and round-trips it', () => {
  const db = initDb(':memory:');
  const { addTask, setTaskStatus } = require('./tasks.js');

  const created = addTask(db, 'Working on it');
  const updated = setTaskStatus(db, created.id, 'in_progress');

  assert.strictEqual(updated.status, 'in_progress');
  db.close();
});
```

Note: `db/db.test.js`'s `initDb` import path is `require('./db.js')` relative to `db/`; `mcp-server/tasks.test.js` already imports it as `require('../db/db.js')` — use that same existing pattern, don't change it.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test mcp-server/tasks.test.js`
Expected: FAIL — `addTask`'s default still resolves to id `1` (whatever list that happens to be, not necessarily Inbox); `in_progress` currently round-trips fine at the `tasks.js` level already (no validation there) so that specific assertion may actually pass already — the `addTask` default-list assertion is the one that must fail first.

- [ ] **Step 3: Update `mcp-server/tasks.js`**

Add a helper and change `addTask`'s default resolution. Find this line near the top of the file (after the existing helper functions, before `addTask`):

```js
function deriveLinkedListIdsFromTagNames(db, tagNames) {
```

Add a new helper directly above it:

```js
function resolveDefaultListId(db) {
  const inbox = db.prepare("SELECT id FROM lists WHERE kind = 'user' AND name = 'Inbox'").get();
  if (inbox) return inbox.id;
  const anyUserList = db.prepare("SELECT id FROM lists WHERE kind = 'user' ORDER BY id ASC LIMIT 1").get();
  return anyUserList ? anyUserList.id : 1;
}
```

Then change the `addTask` signature and its first line. Replace:

```js
function addTask(db, title, listId = 1, tagNames = [], linkedListIds = []) {
```

with:

```js
function addTask(db, title, listId = null, tagNames = [], linkedListIds = []) {
  const resolvedListId = listId ?? resolveDefaultListId(db);
```

And update the rest of `addTask`'s body to use `resolvedListId` instead of `listId` (every remaining reference inside the function). The full function should read:

```js
function addTask(db, title, listId = null, tagNames = [], linkedListIds = []) {
  const resolvedListId = listId ?? resolveDefaultListId(db);

  const stmt = db.prepare(
    'INSERT INTO tasks (title, status, list_id, created_at, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)'
  );
  const info = stmt.run(title, 'pending', resolvedListId);
  const taskId = info.lastInsertRowid;

  const tags = ensureTags(db, tagNames);
  setTaskTagIds(
    db,
    taskId,
    tags.map((tag) => tag.id)
  );

  const derivedListIds = deriveLinkedListIdsFromTagNames(db, tagNames);
  setTaskListLinkIds(db, taskId, [...linkedListIds, ...derivedListIds], resolvedListId);

  const task = readTask(db, taskId);
  recordAudit(db, {
    action: 'create_task',
    entityType: 'task',
    entityId: taskId,
    details: { title, listId: resolvedListId, tagNames, linkedListIds: task.linked_list_ids },
  });
  return task;
}
```

`setTaskStatus` itself needs no code change — it already accepts any string value and trusts its caller, same as `addTask` trusts `title`. The widening happens entirely at the boundary (Step 4/5 below).

- [ ] **Step 4: Fix `add_task`'s MCP tool handler to use the new Inbox default**

The `add_task` tool in `mcp-server/index.js` currently passes `listId ?? 1` to `addTask`, bypassing the Inbox-resolution logic added in Step 3 (list id `1` may not be the Inbox list — it could be the reserved system Today list, which would incorrectly file new Claude-created tasks onto the Today board instead of into the Inbox). Find:

```js
server.tool(
  'add_task',
  {
    title: z.string().describe('Title of the task to add'),
    listId: z.number().int().positive().optional().describe('Optional list ID, defaults to 1'),
    linkedListIds: z.array(z.number().int().positive()).optional().describe('Optional linked list IDs for cross-list visibility'),
    tags: z.array(z.string()).optional().describe('Optional tag names'),
  },
  async ({ title, listId, linkedListIds, tags }) => {
    const normalizedTags = normalizeTagNames(tags ?? []);
    const normalizedLinkedListIds = normalizeListIds(linkedListIds ?? []);
    const task = addTask(db, title, listId ?? 1, normalizedTags, normalizedLinkedListIds);
    return { content: [{ type: 'text', text: JSON.stringify(task) }] };
  }
);
```

Replace the `listId` schema description and the `addTask` call:

```js
server.tool(
  'add_task',
  {
    title: z.string().describe('Title of the task to add'),
    listId: z.number().int().positive().optional().describe('Optional list ID, defaults to the Inbox list if omitted'),
    linkedListIds: z.array(z.number().int().positive()).optional().describe('Optional linked list IDs for cross-list visibility'),
    tags: z.array(z.string()).optional().describe('Optional tag names'),
  },
  async ({ title, listId, linkedListIds, tags }) => {
    const normalizedTags = normalizeTagNames(tags ?? []);
    const normalizedLinkedListIds = normalizeListIds(linkedListIds ?? []);
    const task = addTask(db, title, listId ?? null, normalizedTags, normalizedLinkedListIds);
    return { content: [{ type: 'text', text: JSON.stringify(task) }] };
  }
);
```

- [ ] **Step 5: Widen status validation in `mcp-server/index.js`**

Find the `update_task_status` tool registration:

```js
server.tool(
  'update_task_status',
  {
    id: z.number().int().positive().describe('ID of the task to update'),
    status: z.enum(['pending', 'done']).describe('New task status'),
  },
```

Change `z.enum(['pending', 'done'])` to:

```js
    status: z.enum(['pending', 'in_progress', 'done']).describe('New task status'),
```

- [ ] **Step 6: Widen status validation in `backend/server.js`**

Find the `PATCH /tasks/:id` route:

```js
  app.patch('/tasks/:id', (req, res) => {
    const { status } = req.body ?? {};
    if (status !== 'pending' && status !== 'done') {
      return res.status(400).json({ error: "status must be either 'pending' or 'done'" });
    }
```

Change the condition and message to:

```js
  app.patch('/tasks/:id', (req, res) => {
    const { status } = req.body ?? {};
    if (status !== 'pending' && status !== 'in_progress' && status !== 'done') {
      return res.status(400).json({ error: "status must be 'pending', 'in_progress', or 'done'" });
    }
```

- [ ] **Step 7: Add a backend test for the widened status**

In `backend/server.test.js`, add (near the existing `PATCH /tasks/:id` tests):

```js
test('PATCH /tasks/:id accepts in_progress as a valid status', async () => {
  const db = initDb(':memory:');
  const created = addTask(db, 'Walk dog');
  const { createApp } = require('./server.js');
  const app = createApp(db);
  const server = app.listen(0);

  const res = await request(server, 'PATCH', `/tasks/${created.id}`, { status: 'in_progress' });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.status, 'in_progress');

  server.close();
  db.close();
});
```

(This uses the `request` helper already added to `backend/server.test.js` by the prior Google Tasks UI plan — if that helper isn't present, it means this plan is being run against a codebase state before that work landed, which shouldn't happen given the current committed state includes it. Confirm `request(...)` exists in the file before adding this test; if it doesn't, this plan is being run out of order — stop and report NEEDS_CONTEXT.)

- [ ] **Step 8: Run all affected tests to verify they pass**

Run: `node --test db/*.test.js mcp-server/*.test.js backend/*.test.js`
Expected: PASS — all tests including the new ones from Task 1 and this task.

- [ ] **Step 9: Commit**

```bash
git add mcp-server/tasks.js mcp-server/tasks.test.js mcp-server/index.js backend/server.js backend/server.test.js
git commit -m "feat: widen task status to include in_progress; addTask defaults to Inbox list"
```

---

### Task 3: `listTodayTasks` and `listCompletedTasks`

**Files:**
- Modify: `mcp-server/tasks.js`
- Modify: `mcp-server/tasks.test.js`

**Interfaces:**
- Consumes: `hydrateTasks(db, tasks)` (existing, unchanged) — both new functions run their base query then pass the result rows through it, same as `listTasks` does today.
- Produces:
  - `listTodayTasks(db) -> Array<hydrated task>` — tasks linked (via `task_list_links`) to the `kind = 'system'` list, where `status = 'done'` rows are included only if `date(updated_at) = date('now')`; `pending`/`in_progress` rows are always included.
  - `listCompletedTasks(db) -> Array<hydrated task>` — all tasks with `status = 'done'`, across every list, ordered by `updated_at DESC`.

- [ ] **Step 1: Write the failing tests**

Add to `mcp-server/tasks.test.js`:

```js
test('listTodayTasks includes pending/in_progress tasks linked to Today regardless of date', () => {
  const db = initDb(':memory:');
  const { addTask, setTaskStatus, setTaskLinkedLists, listTodayTasks } = require('./tasks.js');

  const todayList = db.prepare("SELECT id FROM lists WHERE kind = 'system'").get();
  const task = addTask(db, 'In progress today task');
  setTaskLinkedLists(db, task.id, [todayList.id]);
  setTaskStatus(db, task.id, 'in_progress');

  const results = listTodayTasks(db);

  assert.ok(results.some((t) => t.id === task.id));
  db.close();
});

test('listTodayTasks excludes a done task whose updated_at is not today', () => {
  const db = initDb(':memory:');
  const { addTask, setTaskLinkedLists, listTodayTasks } = require('./tasks.js');

  const todayList = db.prepare("SELECT id FROM lists WHERE kind = 'system'").get();
  const task = addTask(db, 'Completed yesterday');
  setTaskLinkedLists(db, task.id, [todayList.id]);
  db.prepare("UPDATE tasks SET status = 'done', updated_at = datetime('now', '-2 day') WHERE id = ?").run(task.id);

  const results = listTodayTasks(db);

  assert.ok(!results.some((t) => t.id === task.id));
  db.close();
});

test('listTodayTasks includes a done task whose updated_at is today', () => {
  const db = initDb(':memory:');
  const { addTask, setTaskLinkedLists, setTaskStatus, listTodayTasks } = require('./tasks.js');

  const todayList = db.prepare("SELECT id FROM lists WHERE kind = 'system'").get();
  const task = addTask(db, 'Completed today');
  setTaskLinkedLists(db, task.id, [todayList.id]);
  setTaskStatus(db, task.id, 'done');

  const results = listTodayTasks(db);

  assert.ok(results.some((t) => t.id === task.id));
  db.close();
});

test('listTodayTasks excludes tasks not linked to the Today list', () => {
  const db = initDb(':memory:');
  const { addTask, listTodayTasks } = require('./tasks.js');

  const task = addTask(db, 'Not on the board');

  const results = listTodayTasks(db);

  assert.ok(!results.some((t) => t.id === task.id));
  db.close();
});

test('listCompletedTasks returns all done tasks across lists, newest updated_at first', () => {
  const db = initDb(':memory:');
  const { addTask, createList, setTaskStatus, listCompletedTasks } = require('./tasks.js');

  const otherList = createList(db, 'Other list');
  const taskA = addTask(db, 'First done');
  const taskB = addTask(db, 'Second done', otherList.id);
  setTaskStatus(db, taskA.id, 'done');
  setTaskStatus(db, taskB.id, 'done');

  const results = listCompletedTasks(db);
  const ids = results.map((t) => t.id);

  assert.ok(ids.indexOf(taskB.id) < ids.indexOf(taskA.id), 'expected the more recently completed task first');
  assert.ok(results.every((t) => t.status === 'done'));
  db.close();
});

test('listCompletedTasks excludes pending and in_progress tasks', () => {
  const db = initDb(':memory:');
  const { addTask, setTaskStatus, listCompletedTasks } = require('./tasks.js');

  addTask(db, 'Still pending');
  const inProgress = addTask(db, 'Still working');
  setTaskStatus(db, inProgress.id, 'in_progress');

  const results = listCompletedTasks(db);

  assert.strictEqual(results.length, 0);
  db.close();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test mcp-server/tasks.test.js`
Expected: FAIL — `listTodayTasks is not a function`, `listCompletedTasks is not a function`.

- [ ] **Step 3: Implement both functions in `mcp-server/tasks.js`**

Add these two functions directly after the existing `listTasks` function:

```js
function listTodayTasks(db) {
  const todayList = db.prepare("SELECT id FROM lists WHERE kind = 'system'").get();
  if (!todayList) return [];

  const tasks = db
    .prepare(
      `SELECT t.* FROM tasks t
       JOIN task_list_links tll ON tll.task_id = t.id
       WHERE tll.list_id = ?
         AND (t.status != 'done' OR date(t.updated_at) = date('now'))
       ORDER BY t.id ASC`
    )
    .all(todayList.id);

  return hydrateTasks(db, tasks);
}

function listCompletedTasks(db) {
  const tasks = db
    .prepare("SELECT * FROM tasks WHERE status = 'done' ORDER BY updated_at DESC")
    .all();

  return hydrateTasks(db, tasks);
}
```

Add both to the `module.exports` block at the bottom of the file:

```js
module.exports = {
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
  listTodayTasks,
  listCompletedTasks,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test mcp-server/tasks.test.js`
Expected: PASS (all tests, including the 6 new ones)

- [ ] **Step 5: Commit**

```bash
git add mcp-server/tasks.js mcp-server/tasks.test.js
git commit -m "feat: add listTodayTasks and listCompletedTasks queries"
```

---

### Task 4: `GET /lists?kind=` filter

**Files:**
- Modify: `backend/server.js`
- Modify: `backend/server.test.js`

**Interfaces:**
- Consumes: `listLists(db)` (existing, unchanged).
- Produces: `GET /lists` — unfiltered (unchanged) when no `kind` query param is given; `GET /lists?kind=user` or `GET /lists?kind=system` filters the response to only that kind. An invalid `kind` value (anything other than `user`/`system`) returns `400`.

- [ ] **Step 1: Write the failing tests**

In `backend/server.test.js`, add:

```js
test('GET /lists returns all lists when no kind filter is given', async () => {
  const db = initDb(':memory:');
  const { createApp } = require('./server.js');
  const app = createApp(db);
  const server = app.listen(0);

  const res = await get(server, '/lists');

  assert.strictEqual(res.status, 200);
  assert.ok(res.body.some((list) => list.kind === 'system'));
  assert.ok(res.body.some((list) => list.kind === 'user'));

  server.close();
  db.close();
});

test('GET /lists?kind=user excludes the system Today list', async () => {
  const db = initDb(':memory:');
  const { createApp } = require('./server.js');
  const app = createApp(db);
  const server = app.listen(0);

  const res = await get(server, '/lists?kind=user');

  assert.strictEqual(res.status, 200);
  assert.ok(res.body.every((list) => list.kind === 'user'));

  server.close();
  db.close();
});

test('GET /lists?kind=invalid returns 400', async () => {
  const db = initDb(':memory:');
  const { createApp } = require('./server.js');
  const app = createApp(db);
  const server = app.listen(0);

  const res = await get(server, '/lists?kind=invalid');

  assert.strictEqual(res.status, 400);

  server.close();
  db.close();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test backend/server.test.js`
Expected: FAIL — the `kind=user` filter isn't applied yet (all three tests may not fail identically; specifically the `kind=user` test fails because the system list is still present in the response, and the `kind=invalid` test fails because no `400` is returned).

- [ ] **Step 3: Implement the filter in `backend/server.js`**

Replace:

```js
  app.get('/lists', (req, res) => {
    const lists = listLists(db);
    return res.json(lists);
  });
```

with:

```js
  app.get('/lists', (req, res) => {
    const { kind } = req.query;
    if (kind !== undefined && kind !== 'user' && kind !== 'system') {
      return res.status(400).json({ error: "kind must be 'user' or 'system'" });
    }

    const lists = listLists(db);
    const filtered = kind === undefined ? lists : lists.filter((list) => list.kind === kind);
    return res.json(filtered);
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test backend/server.test.js`
Expected: PASS (all tests, including the 3 new ones)

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS, all tests across `db/`, `mcp-server/`, `backend/`.

- [ ] **Step 6: Commit**

```bash
git add backend/server.js backend/server.test.js
git commit -m "feat: add GET /lists?kind= filter"
```

---

## Self-Review Notes

- **Spec coverage:** Section 1's every bullet is covered — `lists.kind` migration (Task 1), status widened + `addTask` default (Task 2), `listTodayTasks`/`listCompletedTasks` (Task 3). The `GET /lists?kind=` filter (Task 4) is called out in Section 2 of the spec ("`GET /lists` gains an optional `?kind=user` filter") — included here since it's a small, purely additive REST change that later UI plans will depend on, and keeping it with the rest of the data-layer work avoids a later plan needing to touch `backend/server.js` for a one-line addition.
- **Explicitly not covered by this plan** (per Global Constraints, deferred to later plans): the MCP tool required-parameter tightening (Section 5 of the spec), the Today board UI (Section 3), navigation restructure (Section 2's UI side), Timeline page (Section 4), and visual design (Section 6).
- **Type/signature consistency:** `addTask(db, title, listId = null, tagNames, linkedListIds)` — the default change from `1` to `null` (resolved via `resolveDefaultListId`) is defined in Task 2 Step 3. **Gap caught and fixed during self-review:** `mcp-server/index.js`'s `add_task` tool handler originally called `addTask(db, title, listId ?? 1, ...)`, which would have bypassed the new Inbox-resolution logic entirely (list id `1` is the reserved system Today list in the current real database, not Inbox — new Claude-created tasks would have been incorrectly filed onto the Today board). Task 2 Step 4 now updates that call site to pass `listId ?? null` instead, so it goes through `resolveDefaultListId`.
