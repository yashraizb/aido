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
