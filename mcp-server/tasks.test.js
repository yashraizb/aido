const test = require('node:test');
const assert = require('node:assert');
const { initDb } = require('../db/db.js');

test('addTask inserts a pending task and returns it', () => {
  const db = initDb(':memory:');
  const { addTask } = require('./tasks.js');

  const task = addTask(db, 'Buy milk');

  assert.strictEqual(task.title, 'Buy milk');
  assert.strictEqual(task.status, 'pending');
  assert.strictEqual(task.list_id, 1);
  assert.deepStrictEqual(task.tags, []);
  assert.ok(task.created_at);
  assert.ok(task.updated_at);
  assert.strictEqual(typeof task.id, 'number');
  db.close();
});

test('listTasks returns all tasks in insertion order', () => {
  const db = initDb(':memory:');
  const { addTask, listTasks, createList } = require('./tasks.js');

  const list = createList(db, 'Work');
  addTask(db, 'First', list.id, ['urgent', 'work'], [1]);
  addTask(db, 'Second');
  const tasks = listTasks(db);
  const listTasksOnly = listTasks(db, list.id);

  assert.strictEqual(tasks.length, 2);
  assert.strictEqual(tasks[0].title, 'First');
  assert.deepStrictEqual(tasks[0].tags, ['urgent', 'work']);
  assert.deepStrictEqual(tasks[0].linked_lists.sort(), ['My Tasks', 'Work']);
  assert.strictEqual(tasks[1].title, 'Second');
  assert.strictEqual(listTasksOnly.length, 1);
  assert.strictEqual(listTasksOnly[0].title, 'First');
  db.close();
});

test('setTaskStatus marks a task done and returns the updated row', () => {
  const db = initDb(':memory:');
  const { addTask, setTaskStatus } = require('./tasks.js');

  const created = addTask(db, 'Walk dog');
  const updated = setTaskStatus(db, created.id, 'done');

  assert.strictEqual(updated.status, 'done');
  assert.strictEqual(updated.id, created.id);
  assert.ok(updated.updated_at);
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

test('setTaskTitle updates title and returns updated task', () => {
  const db = initDb(':memory:');
  const { addTask, setTaskTitle } = require('./tasks.js');

  const created = addTask(db, 'Old title');
  const updated = setTaskTitle(db, created.id, 'New title');

  assert.strictEqual(updated.title, 'New title');
  assert.strictEqual(updated.id, created.id);
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

test('list CRUD supports create, update, and delete', () => {
  const db = initDb(':memory:');
  const { listLists, createList, updateList, deleteList, addTask, listTasks } = require('./tasks.js');

  const before = listLists(db);
  assert.strictEqual(before.length, 1);
  assert.strictEqual(before[0].name, 'My Tasks');

  const created = createList(db, 'Errands');
  assert.strictEqual(created.name, 'Errands');

  const renamed = updateList(db, created.id, 'Weekend Errands');
  assert.strictEqual(renamed.name, 'Weekend Errands');

  addTask(db, 'Buy detergent', created.id);
  const deletion = deleteList(db, created.id);
  assert.strictEqual(deletion.removedList, true);
  assert.strictEqual(deletion.removedTasks, 1);
  assert.strictEqual(listTasks(db, created.id).length, 0);

  db.close();
});

test('setTaskTags replaces tags on a task', () => {
  const db = initDb(':memory:');
  const { addTask, setTaskTags } = require('./tasks.js');

  const created = addTask(db, 'Plan sprint', 1, ['planning']);
  const updated = setTaskTags(db, created.id, ['engineering', 'priority']);

  assert.deepStrictEqual(updated.tags, ['engineering', 'priority']);
  db.close();
});

test('setTaskLinkedLists updates cross-list visibility associations', () => {
  const db = initDb(':memory:');
  const { addTask, createList, setTaskLinkedLists } = require('./tasks.js');

  const today = createList(db, 'Today');
  const work = createList(db, 'Work');
  const created = addTask(db, 'Plan sprint', today.id, [], [work.id]);
  const updated = setTaskLinkedLists(db, created.id, [today.id, work.id]);

  assert.deepStrictEqual(updated.linked_lists.sort(), ['Today', 'Work']);
  assert.deepStrictEqual(updated.linked_list_ids.sort((a, b) => a - b), [today.id, work.id]);
  db.close();
});

test('audit log restore returns app state to prior snapshot', () => {
  const db = initDb(':memory:');
  const { addTask, listTasks, listAuditLogs, restoreAuditLog } = require('./tasks.js');

  addTask(db, 'First task');
  addTask(db, 'Second task');
  const beforeDeleteAudit = listAuditLogs(db).find((log) => log.action === 'create_task' && log.details.title === 'Second task');
  const secondTask = listTasks(db).find((task) => task.title === 'Second task');
  db.prepare('DELETE FROM tasks WHERE id = ?').run(secondTask.id);

  const restored = restoreAuditLog(db, beforeDeleteAudit.id);

  assert.strictEqual(restored.restoredFromAuditId, beforeDeleteAudit.id);
  assert.strictEqual(listTasks(db).length, 2);
  db.close();
});

test('tag CRUD supports list and create', () => {
  const db = initDb(':memory:');
  const { listTags, createTag } = require('./tasks.js');

  createTag(db, 'personal');
  createTag(db, 'work');
  const tags = listTags(db);

  assert.strictEqual(tags.length, 2);
  assert.strictEqual(tags[0].name, 'personal');
  assert.strictEqual(tags[1].name, 'work');
  db.close();
});
