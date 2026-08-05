# Voice Assistant To-Do App MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a voice/chat-driven to-do list: Claude Desktop calls an MCP server to manage tasks in SQLite, a small Express backend exposes the tasks as JSON, and a React frontend polls and displays them.

**Architecture:** A single SQLite file (`db/tasks.db`) is the source of truth. A shared `db/db.js` module opens/initializes it. The MCP server (`mcp-server/`) and the Express backend (`backend/`) both require `db/db.js` directly (no network hop between them) and read/write the same file. The React frontend (`frontend/`, Vite) polls the backend's `GET /tasks` endpoint every 3 seconds.

**Tech Stack:** Node.js (v22), `better-sqlite3`, `@modelcontextprotocol/sdk` + `zod`, Express + `cors`, React + Vite. Testing via Node's built-in `node:test` + `node:assert`.

## Global Constraints

- No auth, no websockets, no styling — this is a 1-hour MVP.
- Frontend polls every 3–5s; do not implement SSE.
- All three components (MCP server, backend, frontend) read/write the exact same `db/tasks.db` file — no syncing logic.
- Build order is fixed: DB schema → MCP server → backend → frontend. Each task depends on the previous.

---

## File Structure

```
aido/
  package.json                # root deps: better-sqlite3, @modelcontextprotocol/sdk, zod, express, cors
  db/
    db.js                     # initDb(path) -> better-sqlite3 instance with schema ensured; DB_PATH const
    db.test.js
    tasks.db                  # created at runtime, gitignored
  mcp-server/
    tasks.js                  # pure functions: addTask, listTasks, completeTask (take db instance as arg)
    tasks.test.js
    index.js                  # wires tasks.js to @modelcontextprotocol/sdk stdio server against real DB_PATH
  backend/
    server.js                 # createApp(db) -> express app with GET /tasks
    server.test.js
    index.js                  # starts createApp(realDb) listening on port 3001
  frontend/
    package.json              # Vite React app
    index.html
    vite.config.js
    src/main.jsx
    src/App.jsx                # polls GET /tasks every 3s, renders list
  .gitignore                  # node_modules, db/tasks.db
```

---

### Task 1: SQLite schema + shared DB module

**Files:**
- Create: `package.json`
- Create: `db/db.js`
- Test: `db/db.test.js`
- Create: `.gitignore`

**Interfaces:**
- Produces: `initDb(path: string) -> better-sqlite3.Database` (creates the `tasks` table if it doesn't exist, returns the open db handle). `DB_PATH` (string constant, absolute path to `<root>/db/tasks.db`) exported from `db/db.js`.

- [ ] **Step 1: Create root `package.json` and install dependencies**

```json
{
  "name": "aido",
  "version": "1.0.0",
  "private": true,
  "type": "commonjs",
  "scripts": {
    "test": "node --test db/*.test.js mcp-server/*.test.js backend/*.test.js"
  },
  "dependencies": {
    "better-sqlite3": "^11.3.0",
    "@modelcontextprotocol/sdk": "^1.0.4",
    "zod": "^3.23.8",
    "express": "^4.19.2",
    "cors": "^2.8.5"
  }
}
```

Run: `npm install`

- [ ] **Step 2: Create `.gitignore`**

```
node_modules/
db/tasks.db
```

- [ ] **Step 3: Write the failing test for `db/db.js`**

Create `db/db.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

test('initDb creates the tasks table with expected columns', () => {
  const { initDb } = require('./db.js');
  const tmpPath = path.join(os.tmpdir(), `aido-test-${Date.now()}.db`);
  const db = initDb(tmpPath);

  const columns = db.prepare("PRAGMA table_info(tasks)").all().map(c => c.name);
  assert.deepStrictEqual(columns.sort(), ['created_at', 'id', 'status', 'title'].sort());

  db.close();
  fs.unlinkSync(tmpPath);
});

test('initDb is idempotent (safe to call twice on same file)', () => {
  const { initDb } = require('./db.js');
  const tmpPath = path.join(os.tmpdir(), `aido-test-${Date.now()}-2.db`);
  const db1 = initDb(tmpPath);
  db1.close();
  const db2 = initDb(tmpPath);

  const row = db2.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'").get();
  assert.strictEqual(row.name, 'tasks');

  db2.close();
  fs.unlinkSync(tmpPath);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test db/db.test.js`
Expected: FAIL with "Cannot find module './db.js'"

- [ ] **Step 3: Write `db/db.js`**

```js
const path = require('node:path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'tasks.db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;

function initDb(dbPath = DB_PATH) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  return db;
}

module.exports = { initDb, DB_PATH };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test db/db.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git init
git add package.json .gitignore db/db.js db/db.test.js
git commit -m "feat: add SQLite schema and shared db module"
```

---

### Task 2: MCP server with add_task / list_tasks / complete_task

**Files:**
- Create: `mcp-server/tasks.js`
- Test: `mcp-server/tasks.test.js`
- Create: `mcp-server/index.js`

**Interfaces:**
- Consumes: `initDb(path)` from `db/db.js` (Task 1).
- Produces (used by `mcp-server/index.js` in this task, and available for any future caller):
  - `addTask(db, title: string) -> { id: number, title: string, status: 'pending', created_at: string }`
  - `listTasks(db) -> Array<{ id, title, status, created_at }>`
  - `completeTask(db, id: number) -> { id: number, title: string, status: 'done', created_at: string } | null` (returns `null` if no task with that id exists)

- [ ] **Step 1: Write the failing tests for `mcp-server/tasks.js`**

Create `mcp-server/tasks.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { initDb } = require('../db/db.js');

test('addTask inserts a pending task and returns it', () => {
  const db = initDb(':memory:');
  const { addTask } = require('./tasks.js');

  const task = addTask(db, 'Buy milk');

  assert.strictEqual(task.title, 'Buy milk');
  assert.strictEqual(task.status, 'pending');
  assert.strictEqual(typeof task.id, 'number');
  db.close();
});

test('listTasks returns all tasks in insertion order', () => {
  const db = initDb(':memory:');
  const { addTask, listTasks } = require('./tasks.js');

  addTask(db, 'First');
  addTask(db, 'Second');
  const tasks = listTasks(db);

  assert.strictEqual(tasks.length, 2);
  assert.strictEqual(tasks[0].title, 'First');
  assert.strictEqual(tasks[1].title, 'Second');
  db.close();
});

test('completeTask marks a task done and returns the updated row', () => {
  const db = initDb(':memory:');
  const { addTask, completeTask } = require('./tasks.js');

  const created = addTask(db, 'Walk dog');
  const updated = completeTask(db, created.id);

  assert.strictEqual(updated.status, 'done');
  assert.strictEqual(updated.id, created.id);
  db.close();
});

test('completeTask returns null for a nonexistent id', () => {
  const db = initDb(':memory:');
  const { completeTask } = require('./tasks.js');

  const result = completeTask(db, 9999);

  assert.strictEqual(result, null);
  db.close();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test mcp-server/tasks.test.js`
Expected: FAIL with "Cannot find module './tasks.js'"

- [ ] **Step 3: Write `mcp-server/tasks.js`**

```js
function addTask(db, title) {
  const stmt = db.prepare('INSERT INTO tasks (title) VALUES (?)');
  const info = stmt.run(title);
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(info.lastInsertRowid);
}

function listTasks(db) {
  return db.prepare('SELECT * FROM tasks ORDER BY id ASC').all();
}

function completeTask(db, id) {
  const info = db.prepare("UPDATE tasks SET status = 'done' WHERE id = ?").run(id);
  if (info.changes === 0) return null;
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
}

module.exports = { addTask, listTasks, completeTask };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test mcp-server/tasks.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Write `mcp-server/index.js` (MCP stdio server)**

```js
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const { initDb, DB_PATH } = require('../db/db.js');
const { addTask, listTasks, completeTask } = require('./tasks.js');

const db = initDb(DB_PATH);

const server = new McpServer({ name: 'aido-tasks', version: '1.0.0' });

server.tool(
  'add_task',
  { title: z.string().describe('Title of the task to add') },
  async ({ title }) => {
    const task = addTask(db, title);
    return { content: [{ type: 'text', text: JSON.stringify(task) }] };
  }
);

server.tool('list_tasks', {}, async () => {
  const tasks = listTasks(db);
  return { content: [{ type: 'text', text: JSON.stringify(tasks) }] };
});

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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 6: Manually verify the MCP server starts without crashing**

Run: `node mcp-server/index.js`
Expected: process starts and waits on stdio (no stack trace). Press Ctrl+C to stop.

- [ ] **Step 7: Commit**

```bash
git add mcp-server/tasks.js mcp-server/tasks.test.js mcp-server/index.js
git commit -m "feat: add MCP server with add_task/list_tasks/complete_task tools"
```

---

### Task 3: Express REST backend (`GET /tasks`)

**Files:**
- Create: `backend/server.js`
- Test: `backend/server.test.js`
- Create: `backend/index.js`

**Interfaces:**
- Consumes: `initDb(path)`, `DB_PATH` from `db/db.js` (Task 1); `listTasks(db)` from `mcp-server/tasks.js` (Task 2).
- Produces: `createApp(db) -> express.Application` with `GET /tasks` returning `200` and a JSON array of `{ id, title, status, created_at }`. `backend/index.js` starts this app on port `3001`.

- [ ] **Step 1: Write the failing test for `backend/server.js`**

Create `backend/server.test.js`:

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
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
    }).on('error', reject);
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test backend/server.test.js`
Expected: FAIL with "Cannot find module './server.js'"

- [ ] **Step 3: Write `backend/server.js`**

```js
const express = require('express');
const cors = require('cors');
const { listTasks } = require('../mcp-server/tasks.js');

function createApp(db) {
  const app = express();
  app.use(cors());

  app.get('/tasks', (req, res) => {
    res.json(listTasks(db));
  });

  return app;
}

module.exports = { createApp };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test backend/server.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Write `backend/index.js`**

```js
const { initDb, DB_PATH } = require('../db/db.js');
const { createApp } = require('./server.js');

const db = initDb(DB_PATH);
const app = createApp(db);
const PORT = 3001;

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
```

- [ ] **Step 6: Manually verify the backend serves real data**

Run: `node backend/index.js` (leave running), then in another terminal: `curl http://localhost:3001/tasks`
Expected: `200 OK` with a JSON array (empty if no tasks added yet via Task 2's MCP server).

- [ ] **Step 7: Commit**

```bash
git add backend/server.js backend/server.test.js backend/index.js
git commit -m "feat: add Express backend exposing GET /tasks"
```

---

### Task 4: React frontend (poll and display tasks)

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/index.html`
- Create: `frontend/vite.config.js`
- Create: `frontend/src/main.jsx`
- Create: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: `GET http://localhost:3001/tasks` from `backend/server.js` (Task 3), returning `Array<{ id, title, status, created_at }>`.

- [ ] **Step 1: Scaffold the Vite React app**

Create `frontend/package.json`:

```json
{
  "name": "aido-frontend",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "vite": "^5.4.0"
  }
}
```

Run: `cd frontend && npm install && cd ..`

- [ ] **Step 2: Create `frontend/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Aido - Tasks</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Create `frontend/vite.config.js`**

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
```

- [ ] **Step 4: Create `frontend/src/main.jsx`**

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 5: Create `frontend/src/App.jsx`**

```jsx
import { useEffect, useState } from 'react';

const API_URL = 'http://localhost:3001/tasks';
const POLL_INTERVAL_MS = 3000;

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchTasks() {
      try {
        const res = await fetch(API_URL);
        const data = await res.json();
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

  return (
    <div>
      <h1>Today's Tasks</h1>
      {error && <p>Error loading tasks: {error}</p>}
      <ul>
        {tasks.map((task) => (
          <li key={task.id}>
            {task.title} — {task.status}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 6: Manually verify end to end**

With `backend/index.js` still running from Task 3:

Run: `cd frontend && npm run dev`

Open `http://localhost:5173` in a browser. Expected: page shows "Today's Tasks" and an empty list (or existing tasks). In another terminal, run `node mcp-server/index.js`, and via stdio (or a quick manual script calling `addTask` against `db/tasks.db`) add a task; within 3 seconds the browser list should update without a manual refresh.

- [ ] **Step 7: Commit**

```bash
git add frontend/package.json frontend/index.html frontend/vite.config.js frontend/src/main.jsx frontend/src/App.jsx
git commit -m "feat: add React frontend polling GET /tasks"
```

---

## Self-Review Notes

- **Spec coverage:** DB schema (Task 1) ✓, MCP server 3 tools (Task 2) ✓, backend `GET /tasks` (Task 3) ✓, React polling list view (Task 4) ✓. Build order matches the spec's fixed sequence.
- **Shared DB file:** all three runtime entry points (`mcp-server/index.js`, `backend/index.js`, and tests) go through `db/db.js`'s `initDb`/`DB_PATH`, satisfying "no syncing logic" and "same tasks.db file."
- **Type/signature consistency:** `addTask(db, title)`, `listTasks(db)`, `completeTask(db, id)` signatures are identical across their definition in Task 2 and their consumers in Tasks 2 and 3.
- **Claude Desktop wiring** (connecting `mcp-server/index.js` as an MCP server in Claude Desktop's config) is a manual, one-time user configuration step outside this repo's code — call it out to the user after Task 2 lands, not a coding task.
