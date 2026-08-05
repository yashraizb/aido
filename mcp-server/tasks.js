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
