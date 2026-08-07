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
  assert.deepStrictEqual(columns.sort(), ['created_at', 'id', 'list_id', 'status', 'title', 'updated_at'].sort());

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
