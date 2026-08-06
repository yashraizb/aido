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
