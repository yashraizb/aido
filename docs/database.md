# Database

[← Back to README](../README.md)

**File:** `db/db.js` · **Data file:** `db/tasks.db` (SQLite, WAL mode, git-ignored)

`initDb(dbPath = DB_PATH)` opens the database, enables `journal_mode = WAL` and `foreign_keys = ON`, runs the `CREATE TABLE IF NOT EXISTS` schema below, then runs `runMigrations(db)`. It's safe to call repeatedly (idempotent) and every process that touches the database (`mcp-server/index.js`, `backend/index.js`, and every test file) goes through this same function.

## Schema

```sql
CREATE TABLE IF NOT EXISTS lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  status TEXT DEFAULT 'pending',        -- 'pending' | 'done'
  list_id INTEGER,                      -- owning list (FK -> lists.id)
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

CREATE TABLE IF NOT EXISTS task_tags (            -- many-to-many: tasks <-> tags
  task_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (task_id, tag_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS task_list_links (       -- many-to-many: a task can be
  task_id INTEGER NOT NULL,                        -- *visible* in lists other than
  list_id INTEGER NOT NULL,                        -- the one it's owned by (list_id)
  PRIMARY KEY (task_id, list_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,           -- e.g. 'create_task', 'delete_list', 'restore_audit_log'
  entity_type TEXT NOT NULL,      -- 'task' | 'list' | 'tag' | 'audit_log'
  entity_id INTEGER,
  details_json TEXT NOT NULL,     -- action-specific payload (e.g. { title, listId })
  snapshot_json TEXT NOT NULL,    -- full state of lists/tasks/tags/task_tags/task_list_links
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

## `list_id` vs. `linked_list_ids`: ownership vs. visibility

Every task has exactly one **owning list** (`tasks.list_id`) — this is what a plain `DELETE FROM lists WHERE id = ?` cascades against, and what `listTasks(db, listId)` filters on by default. `task_list_links` layers *additional* visibility on top: a task can also show up when browsing a different list without actually belonging to it. `hydrateTasks()` (`mcp-server/tasks.js`) computes `linked_list_ids` for API responses as the union of the owning list plus any `task_list_links` rows — so `linked_list_ids` always includes `list_id` even if `task_list_links` has no rows for that task.

## Migrations

`runMigrations(db)` in `db/db.js` handles the transition from the original single-table MVP schema:

1. Adds `tasks.list_id` and `tasks.updated_at` columns if a database from before they existed is opened (`ALTER TABLE` is only run if the column is missing, via `hasColumn()`).
2. Ensures a list with `id = 1` named `'My Tasks'` exists, and backfills any task with a `NULL` list_id to point at it — this is why `list_id` defaults to `1` in `addTask()`.
3. Backfills `updated_at` from `created_at` for any row where it's still `NULL`.
4. A one-time backfill of `task_list_links` from any pre-existing `task_tags` rows whose tag name matches a list name — a heuristic for migrating data from an earlier iteration where tags and cross-list visibility were conflated. This only inserts rows that don't already exist (`INSERT OR IGNORE`).

There's no versioned migration system (no `schema_migrations` table) — each migration step is written to be safely re-runnable, and `runMigrations` runs unconditionally on every `initDb()` call.

## Inspecting the database directly

```bash
sqlite3 db/tasks.db ".tables"
sqlite3 db/tasks.db "SELECT * FROM tasks;"
```

The `-wal` and `-shm` sidecar files next to `db/tasks.db` are normal WAL-mode artifacts, not corruption — they're merged into the main file periodically by SQLite. Stop all processes touching the database before deleting them manually.
