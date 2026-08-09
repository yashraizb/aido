function normalizeTagNames(tagNames = []) {
  const names = Array.isArray(tagNames) ? tagNames : [];
  return Array.from(
    new Set(
      names
        .filter((name) => typeof name === 'string')
        .map((name) => name.trim())
        .filter((name) => name.length > 0)
    )
  );
}

function normalizeListIds(listIds = []) {
  const ids = Array.isArray(listIds) ? listIds : [];
  return Array.from(new Set(ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)));
}

function ensureTags(db, tagNames) {
  const normalized = normalizeTagNames(tagNames);
  if (normalized.length === 0) return [];

  const insertStmt = db.prepare(
    'INSERT INTO tags (name, created_at, updated_at) VALUES (?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT(name) DO UPDATE SET updated_at = tags.updated_at'
  );
  const selectStmt = db.prepare('SELECT id, name FROM tags WHERE name = ?');

  for (const name of normalized) {
    insertStmt.run(name);
  }

  return normalized.map((name) => selectStmt.get(name));
}

function setTaskTagIds(db, taskId, tagIds) {
  const deleteStmt = db.prepare('DELETE FROM task_tags WHERE task_id = ?');
  const insertStmt = db.prepare('INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)');
  const tx = db.transaction((id, ids) => {
    deleteStmt.run(id);
    for (const tagId of ids) {
      insertStmt.run(id, tagId);
    }
  });
  tx(taskId, tagIds);
}

function setTaskListLinkIds(db, taskId, linkedListIds, ownerListId) {
  const normalized = normalizeListIds(linkedListIds).filter((id) => id !== ownerListId);
  const deleteStmt = db.prepare('DELETE FROM task_list_links WHERE task_id = ?');
  const insertStmt = db.prepare('INSERT INTO task_list_links (task_id, list_id) VALUES (?, ?)');
  const tx = db.transaction((id, listIds) => {
    deleteStmt.run(id);
    for (const listId of listIds) {
      insertStmt.run(id, listId);
    }
  });
  tx(taskId, normalized);
}

function snapshotState(db) {
  return {
    lists: db.prepare('SELECT * FROM lists ORDER BY id ASC').all(),
    tasks: db.prepare('SELECT * FROM tasks ORDER BY id ASC').all(),
    tags: db.prepare('SELECT * FROM tags ORDER BY id ASC').all(),
    task_tags: db.prepare('SELECT * FROM task_tags ORDER BY task_id ASC, tag_id ASC').all(),
    task_list_links: db.prepare('SELECT * FROM task_list_links ORDER BY task_id ASC, list_id ASC').all(),
  };
}

function recordAudit(db, { action, entityType, entityId = null, details }) {
  db.prepare(
    'INSERT INTO audit_logs (action, entity_type, entity_id, details_json, snapshot_json) VALUES (?, ?, ?, ?, ?)'
  ).run(action, entityType, entityId, JSON.stringify(details ?? {}), JSON.stringify(snapshotState(db)));
}

function hydrateTasks(db, tasks) {
  if (tasks.length === 0) {
    return tasks.map((task) => ({ ...task, tags: [], linked_list_ids: [task.list_id], linked_lists: [] }));
  }

  const ids = tasks.map((task) => task.id);
  const placeholders = ids.map(() => '?').join(', ');

  const tagRows = db
    .prepare(
      `SELECT tt.task_id AS task_id, t.name AS tag_name
       FROM task_tags tt
       JOIN tags t ON t.id = tt.tag_id
       WHERE tt.task_id IN (${placeholders})
       ORDER BY t.name ASC`
    )
    .all(...ids);

  const linkRows = db
    .prepare(
      `SELECT t.id AS task_id, l.id AS list_id, l.name AS list_name
       FROM tasks t
       JOIN lists l ON l.id = t.list_id
       WHERE t.id IN (${placeholders})
       UNION ALL
       SELECT tll.task_id AS task_id, l.id AS list_id, l.name AS list_name
       FROM task_list_links tll
       JOIN lists l ON l.id = tll.list_id
       WHERE tll.task_id IN (${placeholders})
       ORDER BY list_name ASC`
    )
    .all(...ids, ...ids);

  const tagsByTaskId = new Map();
  for (const row of tagRows) {
    if (!tagsByTaskId.has(row.task_id)) tagsByTaskId.set(row.task_id, []);
    tagsByTaskId.get(row.task_id).push(row.tag_name);
  }

  const linkedListIdsByTaskId = new Map();
  const linkedListNamesByTaskId = new Map();
  for (const row of linkRows) {
    if (!linkedListIdsByTaskId.has(row.task_id)) {
      linkedListIdsByTaskId.set(row.task_id, []);
      linkedListNamesByTaskId.set(row.task_id, []);
    }

    if (!linkedListIdsByTaskId.get(row.task_id).includes(row.list_id)) {
      linkedListIdsByTaskId.get(row.task_id).push(row.list_id);
      linkedListNamesByTaskId.get(row.task_id).push(row.list_name);
    }
  }

  return tasks.map((task) => ({
    ...task,
    tags: tagsByTaskId.get(task.id) ?? [],
    linked_list_ids: linkedListIdsByTaskId.get(task.id) ?? [task.list_id],
    linked_lists: linkedListNamesByTaskId.get(task.id) ?? [],
  }));
}

function readTask(db, id) {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!task) return null;
  return hydrateTasks(db, [task])[0];
}

function resolveDefaultListId(db) {
  const inbox = db.prepare("SELECT id FROM lists WHERE kind = 'user' AND name = 'Inbox'").get();
  if (inbox) return inbox.id;
  const anyUserList = db.prepare("SELECT id FROM lists WHERE kind = 'user' ORDER BY id ASC LIMIT 1").get();
  return anyUserList ? anyUserList.id : 1;
}

function deriveLinkedListIdsFromTagNames(db, tagNames) {
  const names = normalizeTagNames(tagNames);
  if (names.length === 0) return [];
  const placeholders = names.map(() => '?').join(', ');
  const rows = db.prepare(`SELECT id FROM lists WHERE name IN (${placeholders})`).all(...names);
  return rows.map((row) => row.id);
}

function addTask(db, title, listId = null, tagNames = [], linkedListIds = []) {
  const resolvedListId = listId ?? resolveDefaultListId(db);

  const stmt = db.prepare(
    'INSERT INTO tasks (title, status, list_id, created_at, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)'
  );
  const info = stmt.run(title, 'pending', resolvedListId);
  const taskId = info.lastInsertRowid;

  const tags = ensureTags(db, tagNames);
  setTaskTagIds(
    db,
    taskId,
    tags.map((tag) => tag.id)
  );

  const derivedListIds = deriveLinkedListIdsFromTagNames(db, tagNames);
  setTaskListLinkIds(db, taskId, [...linkedListIds, ...derivedListIds], resolvedListId);

  const task = readTask(db, taskId);
  recordAudit(db, {
    action: 'create_task',
    entityType: 'task',
    entityId: taskId,
    details: { title, listId: resolvedListId, tagNames, linkedListIds: task.linked_list_ids },
  });
  return task;
}

function listTasks(db, listId = null, status = null) {
  const conditions = [];
  const params = [];

  if (listId != null) {
    conditions.push('list_id = ?');
    params.push(listId);
  }
  if (status != null) {
    conditions.push('status = ?');
    params.push(status);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const tasks = db.prepare(`SELECT * FROM tasks ${whereClause} ORDER BY id ASC`).all(...params);
  return hydrateTasks(db, tasks);
}

function listTodayTasks(db) {
  const todayList = db.prepare("SELECT id FROM lists WHERE kind = 'system'").get();
  if (!todayList) return [];

  const tasks = db
    .prepare(
      `SELECT t.* FROM tasks t
       JOIN task_list_links tll ON tll.task_id = t.id
       WHERE tll.list_id = ?
         AND (t.status != 'done' OR date(t.updated_at) = date('now'))
       ORDER BY t.id ASC`
    )
    .all(todayList.id);

  return hydrateTasks(db, tasks);
}

function listCompletedTasks(db) {
  const tasks = db
    .prepare("SELECT * FROM tasks WHERE status = 'done' ORDER BY updated_at DESC")
    .all();

  return hydrateTasks(db, tasks);
}

function setTaskStatus(db, id, status) {
  const info = db.prepare('UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, id);
  if (info.changes === 0) return null;
  const task = readTask(db, id);
  recordAudit(db, { action: 'set_task_status', entityType: 'task', entityId: id, details: { status } });
  return task;
}

function setTaskTitle(db, id, title) {
  const info = db.prepare('UPDATE tasks SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(title, id);
  if (info.changes === 0) return null;
  const task = readTask(db, id);
  recordAudit(db, { action: 'set_task_title', entityType: 'task', entityId: id, details: { title } });
  return task;
}

function deleteTask(db, id) {
  const existing = readTask(db, id);
  const info = db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  if (info.changes === 0) return false;
  recordAudit(db, { action: 'delete_task', entityType: 'task', entityId: id, details: existing ?? {} });
  return true;
}

function listLists(db) {
  return db.prepare('SELECT * FROM lists ORDER BY id ASC').all();
}

function listTags(db) {
  return db.prepare('SELECT * FROM tags ORDER BY name COLLATE NOCASE ASC').all();
}

function listAuditLogs(db, entityType = null, limit = null) {
  const conditions = [];
  const params = [];

  if (entityType != null) {
    conditions.push('entity_type = ?');
    params.push(entityType);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const effectiveLimit = limit != null ? Math.min(Math.max(Math.trunc(limit), 1), 50) : null;
  const limitClause = effectiveLimit != null ? 'LIMIT ?' : '';
  const queryParams = effectiveLimit != null ? [...params, effectiveLimit] : params;

  return db
    .prepare(
      `SELECT id, action, entity_type, entity_id, details_json, created_at FROM audit_logs ${whereClause} ORDER BY id DESC ${limitClause}`
    )
    .all(...queryParams)
    .map((row) => ({
      ...row,
      details: JSON.parse(row.details_json),
    }));
}

function createTag(db, name) {
  const info = db
    .prepare('INSERT INTO tags (name, created_at, updated_at) VALUES (?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)')
    .run(name);
  const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(info.lastInsertRowid);
  recordAudit(db, { action: 'create_tag', entityType: 'tag', entityId: tag.id, details: { name } });
  return tag;
}

function createList(db, name) {
  const info = db
    .prepare('INSERT INTO lists (name, created_at, updated_at) VALUES (?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)')
    .run(name);
  const list = db.prepare('SELECT * FROM lists WHERE id = ?').get(info.lastInsertRowid);
  recordAudit(db, { action: 'create_list', entityType: 'list', entityId: list.id, details: { name } });
  return list;
}

function updateList(db, id, name) {
  const existing = db.prepare('SELECT * FROM lists WHERE id = ?').get(id);
  if (!existing) return null;
  if (existing.kind === 'system') {
    return { rejected: true, reason: 'system list cannot be renamed' };
  }

  const info = db.prepare('UPDATE lists SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(name, id);
  if (info.changes === 0) return null;
  const list = db.prepare('SELECT * FROM lists WHERE id = ?').get(id);
  recordAudit(db, { action: 'update_list', entityType: 'list', entityId: id, details: { name } });
  return list;
}

function deleteList(db, id) {
  const list = db.prepare('SELECT * FROM lists WHERE id = ?').get(id);
  if (list && list.kind === 'system') {
    return { removedList: false, removedTasks: 0, reason: 'system list cannot be deleted' };
  }

  const tx = db.transaction((listId) => {
    const removedTasks = db.prepare('DELETE FROM tasks WHERE list_id = ?').run(listId);
    const removedList = db.prepare('DELETE FROM lists WHERE id = ?').run(listId);
    return { removedList: removedList.changes > 0, removedTasks: removedTasks.changes };
  });
  const result = tx(id);
  if (result.removedList) {
    recordAudit(db, { action: 'delete_list', entityType: 'list', entityId: id, details: { list, removedTasks: result.removedTasks } });
  }
  return result;
}

function setTaskTags(db, id, tagNames) {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!task) return null;

  const tags = ensureTags(db, tagNames);
  setTaskTagIds(db, id, tags.map((tag) => tag.id));
  db.prepare('UPDATE tasks SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);

  const updated = readTask(db, id);
  recordAudit(db, { action: 'set_task_tags', entityType: 'task', entityId: id, details: { tagNames } });
  return updated;
}

function setTaskLinkedLists(db, id, linkedListIds) {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!task) return null;

  setTaskListLinkIds(db, id, linkedListIds, task.list_id);
  db.prepare('UPDATE tasks SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);

  const updated = readTask(db, id);
  recordAudit(db, {
    action: 'set_task_linked_lists',
    entityType: 'task',
    entityId: id,
    details: { linkedListIds: updated.linked_list_ids },
  });
  return updated;
}

function restoreAuditLog(db, auditId) {
  const log = db.prepare('SELECT * FROM audit_logs WHERE id = ?').get(auditId);
  if (!log) return null;

  const snapshot = JSON.parse(log.snapshot_json);
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM task_tags').run();
    db.prepare('DELETE FROM task_list_links').run();
    db.prepare('DELETE FROM tasks').run();
    db.prepare('DELETE FROM tags').run();
    db.prepare('DELETE FROM lists').run();

    const insertList = db.prepare('INSERT INTO lists (id, name, kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?)');
    const insertTask = db.prepare('INSERT INTO tasks (id, title, status, list_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
    const insertTag = db.prepare('INSERT INTO tags (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)');
    const insertTaskTag = db.prepare('INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)');
    const insertTaskListLink = db.prepare('INSERT INTO task_list_links (task_id, list_id) VALUES (?, ?)');

    for (const row of snapshot.lists) insertList.run(row.id, row.name, row.kind ?? 'user', row.created_at, row.updated_at);
    for (const row of snapshot.tasks) {
      insertTask.run(row.id, row.title, row.status, row.list_id, row.created_at, row.updated_at);
    }
    for (const row of snapshot.tags) insertTag.run(row.id, row.name, row.created_at, row.updated_at);
    for (const row of snapshot.task_tags) insertTaskTag.run(row.task_id, row.tag_id);
    for (const row of snapshot.task_list_links) insertTaskListLink.run(row.task_id, row.list_id);

    // Reconcile the reserved system/Inbox lists in case the restored snapshot
    // predates the kind='system'/'user' migration (e.g. a very old audit-log
    // entry recorded before the Today system list existed). Mirrors the
    // reconciliation runMigrations() performs in db/db.js at startup, so a
    // runtime restore can never leave the database without these lists.
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
  });

  tx();
  recordAudit(db, {
    action: 'restore_audit_log',
    entityType: 'audit_log',
    entityId: auditId,
    details: { restoredFromAuditId: auditId, restoredAction: log.action },
  });

  return { restoredFromAuditId: auditId, restoredAction: log.action };
}

module.exports = {
  addTask,
  listTasks,
  setTaskStatus,
  setTaskTitle,
  deleteTask,
  setTaskTags,
  setTaskLinkedLists,
  listLists,
  createList,
  updateList,
  deleteList,
  listTags,
  createTag,
  listAuditLogs,
  restoreAuditLog,
  listTodayTasks,
  listCompletedTasks,
};
