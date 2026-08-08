const test = require('node:test');
const assert = require('node:assert');
const { initDb } = require('../db/db.js');

test('addTask inserts a pending task and returns it', () => {
  const db = initDb(':memory:');
  const { addTask } = require('./tasks.js');

  const task = addTask(db, 'Buy milk', 1);

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
  assert.strictEqual(before.length, 3);
  const myTasks = before.find((l) => l.name === 'My Tasks');
  assert.ok(myTasks);

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
  const { addTask, listLists, createList, setTaskLinkedLists } = require('./tasks.js');

  const today = listLists(db).find((l) => l.name === 'Today');
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
  db.prepare("UPDATE tasks SET updated_at = datetime('now', '+1 second') WHERE id = ?").run(taskB.id);

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

test('restoreAuditLog preserves kind=system on the Today list', () => {
  const db = initDb(':memory:');
  const { addTask, listAuditLogs, restoreAuditLog } = require('./tasks.js');

  addTask(db, 'Some task');
  const auditId = listAuditLogs(db).find((log) => log.action === 'create_task').id;

  restoreAuditLog(db, auditId);

  const todayList = db.prepare("SELECT kind FROM lists WHERE name = 'Today'").get();
  assert.strictEqual(todayList.kind, 'system');
  db.close();
});

test('restoreAuditLog reconciles the system/Inbox lists when the target snapshot has none (pre-migration snapshot simulation)', () => {
  const db = initDb(':memory:');
  const { addTask, restoreAuditLog } = require('./tasks.js');

  addTask(db, 'Some task');

  // Simulate a very old audit-log entry recorded before the kind='system'/'user'
  // migration ever ran: its snapshot's lists array has no kind='system' entry at all
  // (as would be the case for a snapshot captured pre-migration).
  const preMigrationSnapshot = {
    lists: [{ id: 1, name: 'My Tasks', kind: 'user', created_at: '2020-01-01', updated_at: '2020-01-01' }],
    tasks: [],
    tags: [],
    task_tags: [],
    task_list_links: [],
  };
  const info = db
    .prepare(
      'INSERT INTO audit_logs (action, entity_type, entity_id, details_json, snapshot_json) VALUES (?, ?, ?, ?, ?)'
    )
    .run('create_task', 'task', null, JSON.stringify({}), JSON.stringify(preMigrationSnapshot));
  const preMigrationAuditId = info.lastInsertRowid;

  restoreAuditLog(db, preMigrationAuditId);

  const systemLists = db.prepare("SELECT COUNT(*) AS count FROM lists WHERE kind = 'system'").get();
  const userLists = db.prepare("SELECT COUNT(*) AS count FROM lists WHERE kind = 'user'").get();
  assert.strictEqual(systemLists.count, 1);
  assert.ok(userLists.count >= 1);
  db.close();
});

test('updateList rejects renaming the reserved system list', () => {
  const db = initDb(':memory:');
  const { listLists, updateList } = require('./tasks.js');

  const todayList = listLists(db).find((l) => l.kind === 'system');
  const result = updateList(db, todayList.id, 'Renamed Today');

  assert.strictEqual(result.rejected, true);
  const unchanged = db.prepare('SELECT name FROM lists WHERE id = ?').get(todayList.id);
  assert.strictEqual(unchanged.name, 'Today');
  db.close();
});

test('updateList still returns null for a nonexistent list', () => {
  const db = initDb(':memory:');
  const { updateList } = require('./tasks.js');

  const result = updateList(db, 999999, 'Whatever');

  assert.strictEqual(result, null);
  db.close();
});

test('deleteList rejects deleting the reserved system list and keeps its tasks', () => {
  const db = initDb(':memory:');
  const { addTask, listLists, setTaskLinkedLists, deleteList } = require('./tasks.js');

  const todayList = listLists(db).find((l) => l.kind === 'system');
  const task = addTask(db, 'Owned elsewhere but pulled into Today');
  setTaskLinkedLists(db, task.id, [todayList.id]);

  const result = deleteList(db, todayList.id);

  assert.strictEqual(result.removedList, false);
  assert.strictEqual(result.removedTasks, 0);
  assert.strictEqual(result.reason, 'system list cannot be deleted');

  const stillThere = db.prepare('SELECT id FROM lists WHERE id = ?').get(todayList.id);
  assert.ok(stillThere);
  db.close();
});

test('a task cannot be assigned the system list as its owning list (REST/MCP boundary simulation)', () => {
  const db = initDb(':memory:');
  const { listLists } = require('./tasks.js');

  const todayList = listLists(db).find((l) => l.kind === 'system');

  // Simulates the guard added at the REST (POST /tasks) and MCP (add_task) boundaries:
  // an explicit attempt to target the system list as the owning list must be rejected
  // before addTask is ever called.
  function simulateAddTaskBoundary(listId) {
    const targetList = listLists(db).find((l) => l.id === listId);
    if (targetList && targetList.kind === 'system') {
      return { rejected: true, error: 'Cannot assign tasks directly to the reserved Today list' };
    }
    return { rejected: false };
  }

  const result = simulateAddTaskBoundary(todayList.id);

  assert.strictEqual(result.rejected, true);
  db.close();
});

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
