const path = require('node:path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'tasks.db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'user',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  list_id INTEGER,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (list_id) REFERENCES lists(id)
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS task_tags (
  task_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (task_id, tag_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS task_list_links (
  task_id INTEGER NOT NULL,
  list_id INTEGER NOT NULL,
  PRIMARY KEY (task_id, list_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  details_json TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`;

function hasColumn(db, tableName, columnName) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return columns.some((column) => column.name === columnName);
}

function runMigrations(db) {
  if (!hasColumn(db, 'tasks', 'list_id')) {
    db.exec('ALTER TABLE tasks ADD COLUMN list_id INTEGER');
  }

  if (!hasColumn(db, 'tasks', 'updated_at')) {
    db.exec('ALTER TABLE tasks ADD COLUMN updated_at DATETIME');
  }

  if (!hasColumn(db, 'lists', 'kind')) {
    db.exec("ALTER TABLE lists ADD COLUMN kind TEXT NOT NULL DEFAULT 'user'");
  }

  db.exec("INSERT OR IGNORE INTO lists (id, name) VALUES (1, 'My Tasks')");
  db.exec('UPDATE tasks SET list_id = 1 WHERE list_id IS NULL');
  db.exec('UPDATE tasks SET updated_at = created_at WHERE updated_at IS NULL');

  db.exec(`
    INSERT OR IGNORE INTO task_list_links (task_id, list_id)
    SELECT tt.task_id, l.id
    FROM task_tags tt
    JOIN tags t ON t.id = tt.tag_id
    JOIN lists l ON l.name = t.name
  `);

  const existingSystemList = db.prepare("SELECT id FROM lists WHERE kind = 'system'").get();
  if (!existingSystemList) {
    const existingTodayNamed = db.prepare("SELECT id FROM lists WHERE name = 'Today'").get();
    if (existingTodayNamed) {
      db.prepare("UPDATE lists SET kind = 'system' WHERE id = ?").run(existingTodayNamed.id);
    } else {
      db.prepare("INSERT INTO lists (name, kind) VALUES ('Today', 'system')").run();
    }
  }

  const existingInbox = db.prepare("SELECT id FROM lists WHERE kind = 'user' AND name = 'Inbox'").get();
  if (!existingInbox) {
    db.prepare("INSERT INTO lists (name, kind) VALUES ('Inbox', 'user')").run();
  }

  const systemList = db.prepare("SELECT id FROM lists WHERE kind = 'system'").get();
  const inboxList = db.prepare("SELECT id FROM lists WHERE kind = 'user' AND name = 'Inbox'").get();
  if (systemList && inboxList) {
    const orphanedTasks = db.prepare('SELECT id FROM tasks WHERE list_id = ?').all(systemList.id);
    const reassignOwner = db.prepare('UPDATE tasks SET list_id = ? WHERE id = ?');
    const preserveTodayLink = db.prepare('INSERT OR IGNORE INTO task_list_links (task_id, list_id) VALUES (?, ?)');
    for (const task of orphanedTasks) {
      reassignOwner.run(inboxList.id, task.id);
      preserveTodayLink.run(task.id, systemList.id);
    }
  }
}

function initDb(dbPath = DB_PATH) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  runMigrations(db);
  return db;
}

module.exports = { initDb, DB_PATH };
