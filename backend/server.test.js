const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { initDb } = require('../db/db.js');
const { addTask, createList } = require('../mcp-server/tasks.js');

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
  addTask(db, 'Buy milk', 1);
  addTask(db, 'Walk dog', 1);

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

test('POST /tasks creates a task and trims title', async () => {
  const db = initDb(':memory:');
  const work = createList(db, 'Work');
  const { createApp } = require('./server.js');
  const app = createApp(db);
  const server = app.listen(0);

  const res = await request(server, 'POST', '/tasks', {
    title: '  Buy milk  ',
    listId: 1,
    linkedListIds: [work.id],
    tags: ['groceries', 'home', 'home'],
  });

  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.title, 'Buy milk');
  assert.strictEqual(res.body.status, 'pending');
  assert.strictEqual(res.body.list_id, 1);
  assert.deepStrictEqual(res.body.tags, ['groceries', 'home']);
  assert.deepStrictEqual(res.body.linked_lists.sort(), ['My Tasks', 'Work']);
  assert.ok(res.body.created_at);
  assert.ok(res.body.updated_at);

  server.close();
  db.close();
});

test('POST /tasks returns 400 for missing or empty title', async () => {
  const db = initDb(':memory:');
  const { createApp } = require('./server.js');
  const app = createApp(db);
  const server = app.listen(0);

  const missing = await request(server, 'POST', '/tasks', { listId: 1 });
  const empty = await request(server, 'POST', '/tasks', { title: '   ', listId: 1 });

  assert.strictEqual(missing.status, 400);
  assert.strictEqual(empty.status, 400);

  server.close();
  db.close();
});

test('POST /tasks returns 400 or 404 for invalid listId', async () => {
  const db = initDb(':memory:');
  const { createApp } = require('./server.js');
  const app = createApp(db);
  const server = app.listen(0);

  const invalid = await request(server, 'POST', '/tasks', { title: 'x', listId: 0 });
  const missing = await request(server, 'POST', '/tasks', { title: 'x', listId: 9999 });

  assert.strictEqual(invalid.status, 400);
  assert.strictEqual(missing.status, 404);

  server.close();
  db.close();
});

test('PATCH /tasks/:id updates status done and pending', async () => {
  const db = initDb(':memory:');
  const created = addTask(db, 'Walk dog', 1);
  const { createApp } = require('./server.js');
  const app = createApp(db);
  const server = app.listen(0);

  const doneRes = await request(server, 'PATCH', `/tasks/${created.id}`, { status: 'done' });
  const pendingRes = await request(server, 'PATCH', `/tasks/${created.id}`, { status: 'pending' });

  assert.strictEqual(doneRes.status, 200);
  assert.strictEqual(doneRes.body.status, 'done');
  assert.strictEqual(pendingRes.status, 200);
  assert.strictEqual(pendingRes.body.status, 'pending');

  server.close();
  db.close();
});

test('PATCH /tasks/:id returns 400 for invalid status', async () => {
  const db = initDb(':memory:');
  const created = addTask(db, 'Walk dog', 1);
  const { createApp } = require('./server.js');
  const app = createApp(db);
  const server = app.listen(0);

  const res = await request(server, 'PATCH', `/tasks/${created.id}`, { status: 'archived' });

  assert.strictEqual(res.status, 400);

  server.close();
  db.close();
});

test('PATCH /tasks/:id accepts in_progress as a valid status', async () => {
  const db = initDb(':memory:');
  const created = addTask(db, 'Walk dog', 1);
  const { createApp } = require('./server.js');
  const app = createApp(db);
  const server = app.listen(0);

  const res = await request(server, 'PATCH', `/tasks/${created.id}`, { status: 'in_progress' });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.status, 'in_progress');

  server.close();
  db.close();
});

test('PATCH /tasks/:id returns 404 when task does not exist', async () => {
  const db = initDb(':memory:');
  const { createApp } = require('./server.js');
  const app = createApp(db);
  const server = app.listen(0);

  const res = await request(server, 'PATCH', '/tasks/9999', { status: 'done' });

  assert.strictEqual(res.status, 404);

  server.close();
  db.close();
});

test('PATCH /tasks/:id/title updates task title', async () => {
  const db = initDb(':memory:');
  const created = addTask(db, 'Walk dog', 1, ['pets']);
  const { createApp } = require('./server.js');
  const app = createApp(db);
  const server = app.listen(0);

  const res = await request(server, 'PATCH', `/tasks/${created.id}/title`, { title: 'Walk dog in park' });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.title, 'Walk dog in park');

  server.close();
  db.close();
});

test('PATCH /tasks/:id/title validates title', async () => {
  const db = initDb(':memory:');
  const created = addTask(db, 'Walk dog', 1);
  const { createApp } = require('./server.js');
  const app = createApp(db);
  const server = app.listen(0);

  const res = await request(server, 'PATCH', `/tasks/${created.id}/title`, { title: '   ' });

  assert.strictEqual(res.status, 400);

  server.close();
  db.close();
});

test('PATCH /tasks/:id/tags updates task tags', async () => {
  const db = initDb(':memory:');
  const created = addTask(db, 'Walk dog', 1, ['pets']);
  const { createApp } = require('./server.js');
  const app = createApp(db);
  const server = app.listen(0);

  const res = await request(server, 'PATCH', `/tasks/${created.id}/tags`, { tags: ['health', 'outdoor'] });

  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(res.body.tags, ['health', 'outdoor']);

  server.close();
  db.close();
});

test('PATCH /tasks/:id/tags validates input', async () => {
  const db = initDb(':memory:');
  const created = addTask(db, 'Walk dog', 1);
  const { createApp } = require('./server.js');
  const app = createApp(db);
  const server = app.listen(0);

  const res = await request(server, 'PATCH', `/tasks/${created.id}/tags`, { tags: 'not-array' });

  assert.strictEqual(res.status, 400);

  server.close();
  db.close();
});

test('PATCH /tasks/:id/linked-lists updates list associations', async () => {
  const db = initDb(':memory:');
  const work = createList(db, 'Work');
  const todayRow = db.prepare("SELECT * FROM lists WHERE name = 'Today'").get();
  const created = addTask(db, 'Walk dog', todayRow.id);
  const { createApp } = require('./server.js');
  const app = createApp(db);
  const server = app.listen(0);

  const res = await request(server, 'PATCH', `/tasks/${created.id}/linked-lists`, {
    linkedListIds: [work.id, todayRow.id],
  });

  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(res.body.linked_lists.sort(), ['Today', 'Work']);

  server.close();
  db.close();
});

test('DELETE /tasks/:id removes task and returns 204', async () => {
  const db = initDb(':memory:');
  const created = addTask(db, 'Buy milk', 1);
  const { createApp } = require('./server.js');
  const app = createApp(db);
  const server = app.listen(0);

  const delRes = await request(server, 'DELETE', `/tasks/${created.id}`);
  const listRes = await get(server, '/tasks');

  assert.strictEqual(delRes.status, 204);
  assert.strictEqual(listRes.body.length, 0);

  server.close();
  db.close();
});

test('DELETE /tasks/:id returns 404 for nonexistent id', async () => {
  const db = initDb(':memory:');
  const { createApp } = require('./server.js');
  const app = createApp(db);
  const server = app.listen(0);

  const res = await request(server, 'DELETE', '/tasks/9999');

  assert.strictEqual(res.status, 404);

  server.close();
  db.close();
});

test('GET /tasks can filter by listId', async () => {
  const db = initDb(':memory:');
  const errands = createList(db, 'Errands');
  addTask(db, 'Milk', 1);
  addTask(db, 'Dry cleaning', errands.id);

  const { createApp } = require('./server.js');
  const app = createApp(db);
  const server = app.listen(0);

  const res = await get(server, `/tasks?listId=${errands.id}`);

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.length, 1);
  assert.strictEqual(res.body[0].title, 'Dry cleaning');

  server.close();
  db.close();
});

test('GET /lists returns default list', async () => {
  const db = initDb(':memory:');
  const { createApp } = require('./server.js');
  const app = createApp(db);
  const server = app.listen(0);

  const res = await get(server, '/lists');

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.length, 3);
  const myTasks = res.body.find((l) => l.name === 'My Tasks');
  assert.ok(myTasks);

  server.close();
  db.close();
});

test('GET /tags returns tags', async () => {
  const db = initDb(':memory:');
  addTask(db, 'Finish report', 1, ['work', 'urgent']);
  const { createApp } = require('./server.js');
  const app = createApp(db);
  const server = app.listen(0);

  const res = await get(server, '/tags');

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.length, 2);
  assert.strictEqual(res.body[0].name, 'urgent');
  assert.strictEqual(res.body[1].name, 'work');

  server.close();
  db.close();
});

test('GET /audit-logs returns recorded actions', async () => {
  const db = initDb(':memory:');
  addTask(db, 'Finish report', 1);
  const { createApp } = require('./server.js');
  const app = createApp(db);
  const server = app.listen(0);

  const res = await get(server, '/audit-logs');

  assert.strictEqual(res.status, 200);
  assert.ok(res.body.length >= 1);
  assert.strictEqual(res.body[0].action.includes('task'), true);

  server.close();
  db.close();
});

test('POST /audit-logs/:id/restore restores prior snapshot', async () => {
  const db = initDb(':memory:');
  addTask(db, 'First task', 1);
  addTask(db, 'Second task', 1);
  const auditId = db.prepare("SELECT id FROM audit_logs WHERE action = 'create_task' AND details_json LIKE '%Second task%' ORDER BY id DESC LIMIT 1").get().id;
  const secondTaskId = db.prepare("SELECT id FROM tasks WHERE title = 'Second task'").get().id;
  db.prepare('DELETE FROM tasks WHERE id = ?').run(secondTaskId);

  const { createApp } = require('./server.js');
  const app = createApp(db);
  const server = app.listen(0);

  const restoreRes = await request(server, 'POST', `/audit-logs/${auditId}/restore`);
  const tasksRes = await get(server, '/tasks');

  assert.strictEqual(restoreRes.status, 200);
  assert.strictEqual(tasksRes.body.length, 2);

  server.close();
  db.close();
});

test('POST /tags creates a tag', async () => {
  const db = initDb(':memory:');
  const { createApp } = require('./server.js');
  const app = createApp(db);
  const server = app.listen(0);

  const res = await request(server, 'POST', '/tags', { name: 'focus' });

  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.name, 'focus');

  server.close();
  db.close();
});

test('POST /lists creates a new list', async () => {
  const db = initDb(':memory:');
  const { createApp } = require('./server.js');
  const app = createApp(db);
  const server = app.listen(0);

  const res = await request(server, 'POST', '/lists', { name: 'Work' });

  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.name, 'Work');
  assert.ok(res.body.created_at);
  assert.ok(res.body.updated_at);

  server.close();
  db.close();
});

test('PATCH /lists/:id renames a list', async () => {
  const db = initDb(':memory:');
  const created = createList(db, 'Home');
  const { createApp } = require('./server.js');
  const app = createApp(db);
  const server = app.listen(0);

  const res = await request(server, 'PATCH', `/lists/${created.id}`, { name: 'Home chores' });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.name, 'Home chores');

  server.close();
  db.close();
});

test('DELETE /lists/:id deletes list and cascades tasks', async () => {
  const db = initDb(':memory:');
  const created = createList(db, 'Work');
  addTask(db, 'Prepare report', created.id);
  const { createApp } = require('./server.js');
  const app = createApp(db);
  const server = app.listen(0);

  const delRes = await request(server, 'DELETE', `/lists/${created.id}`);
  const tasksRes = await get(server, `/tasks?listId=${created.id}`);

  assert.strictEqual(delRes.status, 204);
  assert.strictEqual(tasksRes.status, 200);
  assert.strictEqual(tasksRes.body.length, 0);

  server.close();
  db.close();
});

test('DELETE /lists/:id rejects deleting the last list', async () => {
  const db = initDb(':memory:');
  const { createApp } = require('./server.js');
  const app = createApp(db);
  const server = app.listen(0);

  const lists = await get(server, '/lists');
  const allListIds = lists.body.map((l) => l.id).sort((a, b) => a - b);

  // Delete all lists except the last one
  for (const id of allListIds.slice(0, -1)) {
    await request(server, 'DELETE', `/lists/${id}`);
  }

  // Try to delete the last list, which should fail
  const lastListId = allListIds[allListIds.length - 1];
  const res = await request(server, 'DELETE', `/lists/${lastListId}`);

  assert.strictEqual(res.status, 400);

  server.close();
  db.close();
});

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
