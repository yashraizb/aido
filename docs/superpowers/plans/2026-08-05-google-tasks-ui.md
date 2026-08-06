# Google Tasks-Style UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the read-only aido frontend into a fully interactive, Google Tasks-styled to-do list — add/complete/reopen/delete tasks from the browser — while keeping the MCP server (Claude-driven task management) working against the exact same data.

**Architecture:** `mcp-server/tasks.js` gains two shared operations (`setTaskStatus`, replacing the one-way `completeTask`, and `deleteTask`). `backend/server.js` gains three REST routes (`POST /tasks`, `PATCH /tasks/:id`, `DELETE /tasks/:id`) that call those shared operations. `mcp-server/index.js`'s `complete_task` tool is repointed at `setTaskStatus`, and a new `delete_task` tool is added. The frontend is restructured from one flat component into `api.js` (fetch wrapper) + four presentational components, with optimistic local state layered on top of the existing 3s poll.

**Tech Stack:** Same as the existing project — Node.js, `better-sqlite3`, Express, `@modelcontextprotocol/sdk` + `zod`, React + Vite, `node:test`.

## Global Constraints

- No new automated test framework for the frontend — verification there stays manual (run the app, exercise it in a browser), per the design spec and the original MVP plan.
- Status values are exactly the strings `'pending'` and `'done'` — no other values are valid anywhere in this system.
- No `reopen_task` MCP tool — the two-way toggle is frontend-only; `complete_task` stays a one-directional (→ `'done'`) tool from Claude's side.
- No Docker/compose packaging, no due dates/categories/drag-reorder, no auth — out of scope per the design spec.
- All three components (MCP server, backend, frontend) continue to read/write the exact same `db/tasks.db` file via `db/db.js`'s `DB_PATH` — no new database files, no syncing logic.

---

## File Structure

```
mcp-server/
  tasks.js            # MODIFY: completeTask -> setTaskStatus, add deleteTask
  tasks.test.js        # MODIFY: replace completeTask tests, add deleteTask tests
  index.js             # MODIFY: complete_task uses setTaskStatus, add delete_task tool
backend/
  server.js            # MODIFY: add express.json(), POST/PATCH/DELETE routes
  server.test.js        # MODIFY: add tests for new routes
frontend/
  src/
    api.js             # CREATE: fetch wrapper (getTasks, createTask, setStatus, deleteTask)
    App.jsx             # MODIFY: rewritten to compose the components below
    App.css             # CREATE: Google Tasks-style visual design
    main.jsx             # MODIFY: import App.css
    components/
      AddTaskInput.jsx   # CREATE: inline "+ Add a task" box
      TaskRow.jsx         # CREATE: one row (checkbox, title, trash icon)
      TaskList.jsx         # CREATE: renders pending TaskRows
      CompletedSection.jsx # CREATE: collapsible "Completed (N)" section
```

---

### Task 1: Shared data layer — `setTaskStatus` and `deleteTask`

**Files:**
- Modify: `mcp-server/tasks.js`
- Modify: `mcp-server/tasks.test.js`

**Interfaces:**
- Consumes: `initDb(path)` from `db/db.js` (already exists).
- Produces:
  - `setTaskStatus(db, id: number, status: 'pending' | 'done') -> { id, title, status, created_at } | null` (null if no task with that id exists) — **replaces** `completeTask`, which is deleted from this file.
  - `deleteTask(db, id: number) -> boolean` (`true` if a row was deleted, `false` if no task with that id existed) — new.
  - `addTask(db, title)` and `listTasks(db)` are unchanged.

- [ ] **Step 1: Replace the `completeTask` tests with `setTaskStatus` tests, and add `deleteTask` tests**

Open `mcp-server/tasks.test.js`. Replace the two tests named `'completeTask marks a task done and returns the updated row'` and `'completeTask returns null for a nonexistent id'` (currently lines 31-51) with:

```js
test('setTaskStatus marks a task done and returns the updated row', () => {
  const db = initDb(':memory:');
  const { addTask, setTaskStatus } = require('./tasks.js');

  const created = addTask(db, 'Walk dog');
  const updated = setTaskStatus(db, created.id, 'done');

  assert.strictEqual(updated.status, 'done');
  assert.strictEqual(updated.id, created.id);
  db.close();
});

test('setTaskStatus can move a done task back to pending', () => {
  const db = initDb(':memory:');
  const { addTask, setTaskStatus } = require('./tasks.js');

  const created = addTask(db, 'Walk dog');
  setTaskStatus(db, created.id, 'done');
  const reopened = setTaskStatus(db, created.id, 'pending');

  assert.strictEqual(reopened.status, 'pending');
  assert.strictEqual(reopened.id, created.id);
  db.close();
});

test('setTaskStatus returns null for a nonexistent id', () => {
  const db = initDb(':memory:');
  const { setTaskStatus } = require('./tasks.js');

  const result = setTaskStatus(db, 9999, 'done');

  assert.strictEqual(result, null);
  db.close();
});

test('deleteTask removes an existing task and returns true', () => {
  const db = initDb(':memory:');
  const { addTask, deleteTask, listTasks } = require('./tasks.js');

  const created = addTask(db, 'Buy milk');
  const result = deleteTask(db, created.id);

  assert.strictEqual(result, true);
  assert.strictEqual(listTasks(db).length, 0);
  db.close();
});

test('deleteTask returns false for a nonexistent id', () => {
  const db = initDb(':memory:');
  const { deleteTask } = require('./tasks.js');

  const result = deleteTask(db, 9999);

  assert.strictEqual(result, false);
  db.close();
});
```

The full file should now read (top-to-bottom): the `require` lines (unchanged), `addTask` test (unchanged), `listTasks` test (unchanged), then the five tests above.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test mcp-server/tasks.test.js`
Expected: FAIL — `setTaskStatus is not a function` and `deleteTask is not a function` (they don't exist in `tasks.js` yet).

- [ ] **Step 3: Update `mcp-server/tasks.js`**

Replace the entire file content with:

```js
function addTask(db, title) {
  const stmt = db.prepare('INSERT INTO tasks (title) VALUES (?)');
  const info = stmt.run(title);
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(info.lastInsertRowid);
}

function listTasks(db) {
  return db.prepare('SELECT * FROM tasks ORDER BY id ASC').all();
}

function setTaskStatus(db, id, status) {
  const info = db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run(status, id);
  if (info.changes === 0) return null;
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
}

function deleteTask(db, id) {
  const info = db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  return info.changes > 0;
}

module.exports = { addTask, listTasks, setTaskStatus, deleteTask };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test mcp-server/tasks.test.js`
Expected: PASS (7 tests: addTask, listTasks, setTaskStatus x3, deleteTask x2)

- [ ] **Step 5: Commit**

```bash
git add mcp-server/tasks.js mcp-server/tasks.test.js
git commit -m "feat: replace completeTask with setTaskStatus, add deleteTask"
```

---

### Task 2: MCP server — repoint `complete_task`, add `delete_task` tool

**Files:**
- Modify: `mcp-server/index.js`

**Interfaces:**
- Consumes: `setTaskStatus(db, id, status)` and `deleteTask(db, id)` from `mcp-server/tasks.js` (Task 1).
- Produces: `complete_task` tool (unchanged external contract: `{ id: number }` in, same success/error response shape out) now implemented via `setTaskStatus`. New `delete_task` tool: input `{ id: number }`, returns a text confirmation on success or `isError: true` with `"No task with id N"` if the id didn't exist.

- [ ] **Step 1: Update the import and `complete_task` tool**

In `mcp-server/index.js`, change line 5 from:

```js
const { addTask, listTasks, completeTask } = require('./tasks.js');
```

to:

```js
const { addTask, listTasks, setTaskStatus, deleteTask } = require('./tasks.js');
```

Then replace the `complete_task` tool registration (currently lines 25-35):

```js
server.tool(
  'complete_task',
  { id: z.number().describe('ID of the task to mark done') },
  async ({ id }) => {
    const task = completeTask(db, id);
    if (!task) {
      return { content: [{ type: 'text', text: `No task with id ${id}` }], isError: true };
    }
    return { content: [{ type: 'text', text: JSON.stringify(task) }] };
  }
);
```

with:

```js
server.tool(
  'complete_task',
  { id: z.number().describe('ID of the task to mark done') },
  async ({ id }) => {
    const task = setTaskStatus(db, id, 'done');
    if (!task) {
      return { content: [{ type: 'text', text: `No task with id ${id}` }], isError: true };
    }
    return { content: [{ type: 'text', text: JSON.stringify(task) }] };
  }
);

server.tool(
  'delete_task',
  { id: z.number().describe('ID of the task to delete') },
  async ({ id }) => {
    const deleted = deleteTask(db, id);
    if (!deleted) {
      return { content: [{ type: 'text', text: `No task with id ${id}` }], isError: true };
    }
    return { content: [{ type: 'text', text: `Deleted task ${id}` }] };
  }
);
```

- [ ] **Step 2: Manually verify the MCP server starts and both tools work**

Run: `node mcp-server/index.js`
Expected: process starts and waits on stdio, no stack trace. Press Ctrl+C to stop.

Then verify tool wiring with a throwaway in-memory client script (do not commit it). Create a temporary file `/tmp-verify-mcp.js` (or use your OS temp dir) with:

```js
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js');
const { z } = require('zod');
const { initDb } = require('./db/db.js');
const { addTask, setTaskStatus, deleteTask } = require('./mcp-server/tasks.js');

async function main() {
  const db = initDb(':memory:');
  const server = new McpServer({ name: 'test', version: '1.0.0' });

  server.tool('complete_task', { id: z.number() }, async ({ id }) => {
    const task = setTaskStatus(db, id, 'done');
    if (!task) return { content: [{ type: 'text', text: `No task with id ${id}` }], isError: true };
    return { content: [{ type: 'text', text: JSON.stringify(task) }] };
  });
  server.tool('delete_task', { id: z.number() }, async ({ id }) => {
    const deleted = deleteTask(db, id);
    if (!deleted) return { content: [{ type: 'text', text: `No task with id ${id}` }], isError: true };
    return { content: [{ type: 'text', text: `Deleted task ${id}` }] };
  });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

  const task = addTask(db, 'Test task');
  const completeResult = await client.callTool({ name: 'complete_task', arguments: { id: task.id } });
  console.log('complete_task result:', JSON.stringify(completeResult));

  const deleteResult = await client.callTool({ name: 'delete_task', arguments: { id: task.id } });
  console.log('delete_task result:', JSON.stringify(deleteResult));

  const deleteMissingResult = await client.callTool({ name: 'delete_task', arguments: { id: 9999 } });
  console.log('delete_task (missing) result:', JSON.stringify(deleteMissingResult));

  db.close();
}

main();
```

Run: `node /tmp-verify-mcp.js` (adjust the require paths for `./db/db.js` and `./mcp-server/tasks.js` to be relative to wherever you saved this script — simplest is to save it at the repo root as `verify-mcp-scratch.js` and run `node verify-mcp-scratch.js` from the repo root)

Expected output: `complete_task result` shows a task with `"status":"done"`; `delete_task result` shows a non-error text confirmation; `delete_task (missing) result` shows `isError` behavior (an error response for id 9999).

Delete the scratch script afterward — do not commit it.

- [ ] **Step 3: Commit**

```bash
git add mcp-server/index.js
git commit -m "feat: repoint complete_task at setTaskStatus, add delete_task MCP tool"
```

---

### Task 3: Backend REST API — `POST /tasks`, `PATCH /tasks/:id`, `DELETE /tasks/:id`

**Files:**
- Modify: `backend/server.js`
- Modify: `backend/server.test.js`

**Interfaces:**
- Consumes: `addTask(db, title)`, `listTasks(db)`, `setTaskStatus(db, id, status)`, `deleteTask(db, id)` from `mcp-server/tasks.js` (Tasks 1-2).
- Produces:
  - `POST /tasks` — body `{ title: string }` → `201` with created task JSON, or `400` with `{ error: string }` if `title` is missing/not a string/empty after trim.
  - `PATCH /tasks/:id` — body `{ status: 'pending' | 'done' }` → `200` with updated task JSON, `400` with `{ error: string }` if `status` isn't exactly one of those two strings, `404` with `{ error: string }` if no task with that id exists.
  - `DELETE /tasks/:id` → `204` no body on success, `404` with `{ error: string }` if no task with that id existed.
  - `GET /tasks` is unchanged.

- [ ] **Step 1: Write the failing tests**

Open `backend/server.test.js`. Add a generic JSON-request helper alongside the existing `get` helper, and add the new tests. Replace the entire file with:

```js
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { initDb } = require('../db/db.js');
const { addTask } = require('../mcp-server/tasks.js');

function get(server, path) {
  return new Promise((resolve, reject) => {
    const { port } = server.address();
    http.get(`http://127.0.0.1:${port}${path}`, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        const parsed = body ? JSON.parse(body) : null;
        resolve({ status: res.statusCode, body: parsed });
      });
    }).on('error', reject);
  });
}

function request(server, method, path, jsonBody) {
  return new Promise((resolve, reject) => {
    const { port } = server.address();
    const payload = jsonBody === undefined ? null : JSON.stringify(jsonBody);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {},
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          const parsed = body ? JSON.parse(body) : null;
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

test('GET /tasks returns all tasks as JSON', async () => {
  const db = initDb(':memory:');
  addTask(db, 'Buy milk');
  addTask(db, 'Walk dog');

  const { createApp } = require('./server.js');
  const app = createApp(db);
  const server = app.listen(0);

  const res = await get(server, '/tasks');

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.length, 2);
  assert.strictEqual(res.body[0].title, 'Buy milk');

  server.close();
  db.close();
});

test('GET /tasks returns an empty array when there are no tasks', async () => {
  const db = initDb(':memory:');
  const { createApp } = require('./server.js');
  const app = createApp(db);
  const server = app.listen(0);

  const res = await get(server, '/tasks');

  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(res.body, []);

  server.close();
  db.close();
});

test('POST /tasks creates a task and returns 201 with the created row', async () => {
  const db = initDb(':memory:');
  const { createApp } = require('./server.js');
  const app = createApp(db);
  const server = app.listen(0);

  const res = await request(server, 'POST', '/tasks', { title: 'New task' });

  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.title, 'New task');
  assert.strictEqual(res.body.status, 'pending');
  assert.strictEqual(typeof res.body.id, 'number');

  server.close();
  db.close();
});

test('POST /tasks returns 400 when title is missing', async () => {
  const db = initDb(':memory:');
  const { createApp } = require('./server.js');
  const app = createApp(db);
  const server = app.listen(0);

  const res = await request(server, 'POST', '/tasks', {});

  assert.strictEqual(res.status, 400);
  assert.strictEqual(typeof res.body.error, 'string');

  server.close();
  db.close();
});

test('POST /tasks returns 400 when title is empty after trimming', async () => {
  const db = initDb(':memory:');
  const { createApp } = require('./server.js');
  const app = createApp(db);
  const server = app.listen(0);

  const res = await request(server, 'POST', '/tasks', { title: '   ' });

  assert.strictEqual(res.status, 400);

  server.close();
  db.close();
});

test('PATCH /tasks/:id updates status to done and returns the updated row', async () => {
  const db = initDb(':memory:');
  const created = addTask(db, 'Walk dog');
  const { createApp } = require('./server.js');
  const app = createApp(db);
  const server = app.listen(0);

  const res = await request(server, 'PATCH', `/tasks/${created.id}`, { status: 'done' });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.status, 'done');
  assert.strictEqual(res.body.id, created.id);

  server.close();
  db.close();
});

test('PATCH /tasks/:id can move a done task back to pending', async () => {
  const db = initDb(':memory:');
  const created = addTask(db, 'Walk dog');
  const { createApp } = require('./server.js');
  const app = createApp(db);
  const server = app.listen(0);

  await request(server, 'PATCH', `/tasks/${created.id}`, { status: 'done' });
  const res = await request(server, 'PATCH', `/tasks/${created.id}`, { status: 'pending' });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.status, 'pending');

  server.close();
  db.close();
});

test('PATCH /tasks/:id returns 400 for an invalid status value', async () => {
  const db = initDb(':memory:');
  const created = addTask(db, 'Walk dog');
  const { createApp } = require('./server.js');
  const app = createApp(db);
  const server = app.listen(0);

  const res = await request(server, 'PATCH', `/tasks/${created.id}`, { status: 'archived' });

  assert.strictEqual(res.status, 400);

  server.close();
  db.close();
});

test('PATCH /tasks/:id returns 404 for a nonexistent id', async () => {
  const db = initDb(':memory:');
  const { createApp } = require('./server.js');
  const app = createApp(db);
  const server = app.listen(0);

  const res = await request(server, 'PATCH', '/tasks/9999', { status: 'done' });

  assert.strictEqual(res.status, 404);

  server.close();
  db.close();
});

test('DELETE /tasks/:id removes the task and GET /tasks no longer includes it', async () => {
  const db = initDb(':memory:');
  const created = addTask(db, 'Buy milk');
  const { createApp } = require('./server.js');
  const app = createApp(db);
  const server = app.listen(0);

  const deleteRes = await request(server, 'DELETE', `/tasks/${created.id}`);
  assert.strictEqual(deleteRes.status, 204);

  const getRes = await get(server, '/tasks');
  assert.deepStrictEqual(getRes.body, []);

  server.close();
  db.close();
});

test('DELETE /tasks/:id returns 404 for a nonexistent id', async () => {
  const db = initDb(':memory:');
  const { createApp } = require('./server.js');
  const app = createApp(db);
  const server = app.listen(0);

  const res = await request(server, 'DELETE', '/tasks/9999');

  assert.strictEqual(res.status, 404);

  server.close();
  db.close();
});
```

Note: the `get` helper is changed slightly (guards against an empty body before `JSON.parse`) to stay safe if ever called against a route with no body — this doesn't change behavior for the existing two `GET /tasks` tests, which always return a JSON array body.

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `node --test backend/server.test.js`
Expected: the two existing `GET /tasks` tests still PASS; all new `POST`/`PATCH`/`DELETE` tests FAIL (404 "Cannot POST /tasks", "Cannot PATCH /tasks/...", "Cannot DELETE /tasks/..." — the routes don't exist yet).

- [ ] **Step 3: Implement the new routes in `backend/server.js`**

Replace the entire file content with:

```js
const express = require('express');
const cors = require('cors');
const { addTask, listTasks, setTaskStatus, deleteTask } = require('../mcp-server/tasks.js');

function createApp(db) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/tasks', (req, res) => {
    res.json(listTasks(db));
  });

  app.post('/tasks', (req, res) => {
    const title = req.body && typeof req.body.title === 'string' ? req.body.title.trim() : '';
    if (!title) {
      return res.status(400).json({ error: 'title is required and must be a non-empty string' });
    }
    const task = addTask(db, title);
    res.status(201).json(task);
  });

  app.patch('/tasks/:id', (req, res) => {
    const status = req.body && req.body.status;
    if (status !== 'pending' && status !== 'done') {
      return res.status(400).json({ error: "status must be 'pending' or 'done'" });
    }
    const task = setTaskStatus(db, Number(req.params.id), status);
    if (!task) {
      return res.status(404).json({ error: `No task with id ${req.params.id}` });
    }
    res.json(task);
  });

  app.delete('/tasks/:id', (req, res) => {
    const deleted = deleteTask(db, Number(req.params.id));
    if (!deleted) {
      return res.status(404).json({ error: `No task with id ${req.params.id}` });
    }
    res.status(204).send();
  });

  return app;
}

module.exports = { createApp };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test backend/server.test.js`
Expected: PASS (12 tests)

- [ ] **Step 5: Manually verify with the real backend**

Run: `node backend/index.js` (leave running)

In another terminal:

```bash
curl -X POST http://localhost:3001/tasks -H "Content-Type: application/json" -d '{"title":"Verify POST"}'
```

Expected: `201` with a JSON task object.

```bash
curl -X PATCH http://localhost:3001/tasks/1 -H "Content-Type: application/json" -d '{"status":"done"}'
```

Expected: `200` with the task showing `"status":"done"` (adjust the id `1` to whatever id the POST above actually returned).

```bash
curl -X DELETE http://localhost:3001/tasks/1 -w "\n%{http_code}\n"
```

Expected: `204` with no body (adjust the id to match). Stop the backend afterward (Ctrl+C).

- [ ] **Step 6: Commit**

```bash
git add backend/server.js backend/server.test.js
git commit -m "feat: add POST/PATCH/DELETE /tasks routes to backend"
```

---

### Task 4: Frontend — interactive Google Tasks-style UI

**Files:**
- Create: `frontend/src/api.js`
- Create: `frontend/src/components/AddTaskInput.jsx`
- Create: `frontend/src/components/TaskRow.jsx`
- Create: `frontend/src/components/TaskList.jsx`
- Create: `frontend/src/components/CompletedSection.jsx`
- Create: `frontend/src/App.css`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/main.jsx`

**Interfaces:**
- Consumes: `GET /tasks`, `POST /tasks`, `PATCH /tasks/:id`, `DELETE /tasks/:id` from `backend/server.js` (Task 3).
- Produces (internal to the frontend, used across this task's files):
  - `frontend/src/api.js` exports: `getTasks() -> Promise<Array<{id, title, status, created_at}>>`, `createTask(title: string) -> Promise<task>`, `setStatus(id: number, status: 'pending'|'done') -> Promise<task>`, `deleteTask(id: number) -> Promise<void>`. Each throws an `Error` with a human-readable message on non-2xx responses (reading the `{ error }` body if present).
  - `TaskRow` props: `{ task, onToggle: (id, nextStatus) => void, onDelete: (id) => void }`.
  - `TaskList` props: `{ tasks, onToggle, onDelete }` (renders pending tasks only — filtering happens in `App.jsx`, not inside `TaskList`).
  - `CompletedSection` props: `{ tasks, onToggle, onDelete }` (renders nothing if `tasks.length === 0`).
  - `AddTaskInput` props: `{ onAdd: (title: string) => void }`.

- [ ] **Step 1: Create `frontend/src/api.js`**

```js
const API_URL = 'http://localhost:3001/tasks';

async function handleResponse(res) {
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (data && data.error) || `Request failed with status ${res.status}`;
    throw new Error(message);
  }
  return data;
}

export async function getTasks() {
  const res = await fetch(API_URL);
  return handleResponse(res);
}

export async function createTask(title) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  return handleResponse(res);
}

export async function setStatus(id, status) {
  const res = await fetch(`${API_URL}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  return handleResponse(res);
}

export async function deleteTask(id) {
  const res = await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
  return handleResponse(res);
}
```

- [ ] **Step 2: Create `frontend/src/components/TaskRow.jsx`**

```jsx
export default function TaskRow({ task, onToggle, onDelete }) {
  const isDone = task.status === 'done';

  return (
    <li className="task-row">
      <input
        type="checkbox"
        className="task-checkbox"
        checked={isDone}
        onChange={() => onToggle(task.id, isDone ? 'pending' : 'done')}
      />
      <span className={isDone ? 'task-title task-title--done' : 'task-title'}>{task.title}</span>
      <button
        type="button"
        className="task-delete"
        aria-label={`Delete ${task.title}`}
        onClick={() => onDelete(task.id)}
      >
        🗑
      </button>
    </li>
  );
}
```

- [ ] **Step 3: Create `frontend/src/components/TaskList.jsx`**

```jsx
import TaskRow from './TaskRow.jsx';

export default function TaskList({ tasks, onToggle, onDelete }) {
  return (
    <ul className="task-list">
      {tasks.map((task) => (
        <TaskRow key={task.id} task={task} onToggle={onToggle} onDelete={onDelete} />
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: Create `frontend/src/components/CompletedSection.jsx`**

```jsx
import { useState } from 'react';
import TaskRow from './TaskRow.jsx';

export default function CompletedSection({ tasks, onToggle, onDelete }) {
  const [open, setOpen] = useState(false);

  if (tasks.length === 0) return null;

  return (
    <div className="completed-section">
      <button type="button" className="completed-toggle" onClick={() => setOpen(!open)}>
        {open ? '▾' : '▸'} Completed ({tasks.length})
      </button>
      {open && (
        <ul className="task-list">
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} onToggle={onToggle} onDelete={onDelete} />
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Create `frontend/src/components/AddTaskInput.jsx`**

```jsx
import { useState } from 'react';

export default function AddTaskInput({ onAdd }) {
  const [title, setTitle] = useState('');

  function submit() {
    const trimmed = title.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setTitle('');
  }

  return (
    <div className="add-task-input">
      <span className="add-task-plus">+</span>
      <input
        type="text"
        placeholder="Add a task"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
      />
    </div>
  );
}
```

- [ ] **Step 6: Rewrite `frontend/src/App.jsx`**

Replace the entire file content with:

```jsx
import { useEffect, useState } from 'react';
import { getTasks, createTask, setStatus, deleteTask } from './api.js';
import AddTaskInput from './components/AddTaskInput.jsx';
import TaskList from './components/TaskList.jsx';
import CompletedSection from './components/CompletedSection.jsx';

const POLL_INTERVAL_MS = 3000;

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchTasks() {
      try {
        const data = await getTasks();
        if (!cancelled) {
          setTasks(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    }

    fetchTasks();
    const id = setInterval(fetchTasks, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  async function handleAdd(title) {
    const snapshot = tasks;
    try {
      const created = await createTask(title);
      setTasks([...tasks, created]);
      setError(null);
    } catch (err) {
      setTasks(snapshot);
      setError(err.message);
    }
  }

  async function handleToggle(id, nextStatus) {
    const snapshot = tasks;
    setTasks(tasks.map((t) => (t.id === id ? { ...t, status: nextStatus } : t)));
    try {
      await setStatus(id, nextStatus);
      setError(null);
    } catch (err) {
      setTasks(snapshot);
      setError(err.message);
    }
  }

  async function handleDelete(id) {
    const snapshot = tasks;
    setTasks(tasks.filter((t) => t.id !== id));
    try {
      await deleteTask(id);
      setError(null);
    } catch (err) {
      setTasks(snapshot);
      setError(err.message);
    }
  }

  const pending = tasks.filter((t) => t.status === 'pending');
  const completed = tasks.filter((t) => t.status === 'done');

  return (
    <div className="app-page">
      <div className="task-card">
        <h1 className="app-title">Tasks</h1>
        {error && <p className="error-banner">Error: {error}</p>}
        <AddTaskInput onAdd={handleAdd} />
        <TaskList tasks={pending} onToggle={handleToggle} onDelete={handleDelete} />
        <CompletedSection tasks={completed} onToggle={handleToggle} onDelete={handleDelete} />
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Create `frontend/src/App.css`**

```css
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: #f8f9fa;
  font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: #202124;
}

.app-page {
  min-height: 100vh;
  display: flex;
  justify-content: center;
  padding: 48px 16px;
}

.task-card {
  width: 100%;
  max-width: 560px;
  background: #ffffff;
  border-radius: 8px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1), 0 1px 3px rgba(0, 0, 0, 0.08);
  padding: 24px;
}

.app-title {
  font-size: 22px;
  font-weight: 500;
  margin: 0 0 16px;
}

.error-banner {
  color: #c5221f;
  background: #fce8e6;
  border-radius: 4px;
  padding: 8px 12px;
  font-size: 14px;
}

.add-task-input {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 4px;
  border-bottom: 1px solid #e0e0e0;
  margin-bottom: 8px;
}

.add-task-plus {
  color: #1a73e8;
  font-size: 18px;
  font-weight: 600;
}

.add-task-input input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 14px;
  padding: 6px 0;
  font-family: inherit;
}

.task-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.task-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 4px;
  border-radius: 4px;
}

.task-row:hover {
  background: #f1f3f4;
}

.task-row:hover .task-delete {
  opacity: 1;
}

.task-checkbox {
  appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid #5f6368;
  cursor: pointer;
  flex-shrink: 0;
  position: relative;
}

.task-checkbox:checked {
  background: #1a73e8;
  border-color: #1a73e8;
}

.task-checkbox:checked::after {
  content: '';
  position: absolute;
  left: 4px;
  top: 1px;
  width: 4px;
  height: 8px;
  border: solid white;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

.task-title {
  flex: 1;
  font-size: 14px;
}

.task-title--done {
  color: #5f6368;
  text-decoration: line-through;
}

.task-delete {
  opacity: 0;
  transition: opacity 0.15s ease;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 14px;
  color: #5f6368;
}

.completed-section {
  margin-top: 12px;
  border-top: 1px solid #e0e0e0;
  padding-top: 8px;
}

.completed-toggle {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 13px;
  color: #5f6368;
  padding: 6px 4px;
}
```

- [ ] **Step 8: Update `frontend/src/main.jsx` to import the stylesheet**

Add `import './App.css';` as the first line of `frontend/src/main.jsx`, before the existing `import React from 'react';` line. The full file should read:

```jsx
import './App.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 9: Manually verify end-to-end in a browser**

Start the backend (`node backend/index.js`) and the frontend (`cd frontend && npm run dev`), then open `http://localhost:5173`.

Verify:
1. The page shows a white card titled "Tasks" on a light gray background, with an inline "+ Add a task" input at the top.
2. Typing a title and pressing Enter adds it to the list immediately (optimistic update) and it persists after the next 3s poll.
3. Clicking a task's checkbox marks it done: the row disappears from the main list and a "▸ Completed (1)" toggle appears at the bottom.
4. Clicking "▸ Completed (1)" expands it to show the done task with a strikethrough title and a filled checkbox.
5. Unchecking that completed task moves it back to the pending list above.
6. Hovering a row reveals a trash icon on the right; clicking it removes the task immediately, and it stays gone after the next poll.
7. No errors appear in the browser console.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/api.js frontend/src/components frontend/src/App.jsx frontend/src/App.css frontend/src/main.jsx
git commit -m "feat: interactive Google Tasks-style frontend UI"
```

---

## Self-Review Notes

- **Spec coverage:** Data layer (`setTaskStatus`/`deleteTask`, Task 1) ✓, MCP tools (`complete_task` repointed, `delete_task` added, Task 2) ✓, REST routes (`POST`/`PATCH`/`DELETE`, Task 3) ✓, frontend interactivity + collapsible Completed section + Google Tasks visual design (Task 4) ✓. Two-way toggle ✓ (Task 3's `PATCH` accepts either status; Task 4's `TaskRow` computes the opposite status on click). No `reopen_task` MCP tool, as specced ✓.
- **Type/signature consistency:** `setTaskStatus(db, id, status)` and `deleteTask(db, id)` are defined identically in Task 1 and consumed identically in Tasks 2 and 3. Frontend `api.js` functions (`getTasks`, `createTask`, `setStatus`, `deleteTask`) are defined in Task 4 Step 1 and consumed with matching names/arguments in Task 4 Step 6's `App.jsx`. Component prop names (`onToggle`, `onDelete`, `onAdd`, `tasks`, `task`) match between each component's definition and its parent's usage.
- **Placeholder scan:** No TBD/TODO markers; every step contains complete, runnable code.
