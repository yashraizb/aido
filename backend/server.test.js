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
