const express = require('express');
const cors = require('cors');
const {
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
  listCompletedTasks,
  listTodayTasks,
} = require('../mcp-server/tasks.js');

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function isUniqueConstraintError(err) {
  return err && typeof err.message === 'string' && err.message.includes('UNIQUE constraint failed');
}

function normalizeTagNames(value) {
  if (!Array.isArray(value)) return null;
  const names = value
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return Array.from(new Set(names));
}

function normalizeListIds(value) {
  if (!Array.isArray(value)) return null;
  const ids = value.map((item) => Number(item));
  if (ids.some((id) => !Number.isInteger(id) || id <= 0)) {
    return null;
  }
  return Array.from(new Set(ids));
}

function createApp(db) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/lists', (req, res) => {
    const { kind } = req.query;
    if (kind !== undefined && kind !== 'user' && kind !== 'system') {
      return res.status(400).json({ error: "kind must be 'user' or 'system'" });
    }

    const lists = listLists(db);
    const filtered = kind === undefined ? lists : lists.filter((list) => list.kind === kind);
    return res.json(filtered);
  });

  app.get('/tags', (req, res) => {
    return res.json(listTags(db));
  });

  app.get('/audit-logs', (req, res) => {
    return res.json(listAuditLogs(db));
  });

  app.post('/tags', (req, res) => {
    const { name } = req.body ?? {};
    if (typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({ error: 'name must be a non-empty string' });
    }

    try {
      const tag = createTag(db, name.trim());
      return res.status(201).json(tag);
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        return res.status(409).json({ error: `A tag named "${name.trim()}" already exists` });
      }
      throw err;
    }
  });

  app.post('/lists', (req, res) => {
    const { name } = req.body ?? {};
    if (typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({ error: 'name must be a non-empty string' });
    }

    try {
      const list = createList(db, name.trim());
      return res.status(201).json(list);
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        return res.status(409).json({ error: `A list named "${name.trim()}" already exists` });
      }
      throw err;
    }
  });

  app.patch('/lists/:id', (req, res) => {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'list id must be a positive integer' });
    }

    const { name } = req.body ?? {};
    if (typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({ error: 'name must be a non-empty string' });
    }

    try {
      const list = updateList(db, id, name.trim());
      if (!list) {
        return res.status(404).json({ error: `No list with id ${id}` });
      }
      if (list.rejected) {
        return res.status(400).json({ error: 'Cannot rename the reserved Today list' });
      }
      return res.json(list);
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        return res.status(409).json({ error: `A list named "${name.trim()}" already exists` });
      }
      throw err;
    }
  });

  app.delete('/lists/:id', (req, res) => {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'list id must be a positive integer' });
    }

    const lists = listLists(db);
    if (lists.length <= 1) {
      return res.status(400).json({ error: 'Cannot delete the last remaining list' });
    }

    const result = deleteList(db, id);
    if (!result.removedList) {
      if (result.reason === 'system list cannot be deleted') {
        return res.status(400).json({ error: 'Cannot delete the reserved Today list' });
      }
      return res.status(404).json({ error: `No list with id ${id}` });
    }

    return res.status(204).end();
  });

  app.get('/tasks', (req, res) => {
    const listId = req.query.listId ? parseId(req.query.listId) : null;
    if (req.query.listId && !listId) {
      return res.status(400).json({ error: 'listId must be a positive integer' });
    }

    return res.json(listTasks(db, listId));
  });

  app.get('/tasks/completed', (req, res) => {
    return res.json(listCompletedTasks(db));
  });

  app.get('/tasks/today', (req, res) => {
    return res.json(listTodayTasks(db));
  });

  app.post('/tasks', (req, res) => {
    const { title, listId, tags, linkedListIds } = req.body ?? {};
    if (typeof title !== 'string' || title.trim() === '') {
      return res.status(400).json({ error: 'title must be a non-empty string' });
    }

    const parsedListId = parseId(listId);
    if (!parsedListId) {
      return res.status(400).json({ error: 'listId must be a positive integer' });
    }

    const allLists = listLists(db);
    const targetList = allLists.find((list) => list.id === parsedListId);
    if (!targetList) {
      return res.status(404).json({ error: `No list with id ${parsedListId}` });
    }
    if (targetList.kind === 'system') {
      return res.status(400).json({ error: 'Cannot assign tasks directly to the reserved Today list' });
    }

    const normalizedTags = tags === undefined ? [] : normalizeTagNames(tags);
    if (tags !== undefined && normalizedTags === null) {
      return res.status(400).json({ error: 'tags must be an array of strings' });
    }

    const normalizedLinkedListIds = linkedListIds === undefined ? [] : normalizeListIds(linkedListIds);
    if (linkedListIds !== undefined && normalizedLinkedListIds === null) {
      return res.status(400).json({ error: 'linkedListIds must be an array of positive integers' });
    }

    const allValidListIds = new Set(listLists(db).map((list) => list.id));
    if ((normalizedLinkedListIds ?? []).some((id) => !allValidListIds.has(id))) {
      return res.status(404).json({ error: 'One or more linked lists do not exist' });
    }

    const task = addTask(db, title.trim(), parsedListId, normalizedTags, normalizedLinkedListIds ?? []);
    return res.status(201).json(task);
  });

  app.patch('/tasks/:id', (req, res) => {
    const { status } = req.body ?? {};
    if (status !== 'pending' && status !== 'in_progress' && status !== 'done') {
      return res.status(400).json({ error: "status must be 'pending', 'in_progress', or 'done'" });
    }

    const task = setTaskStatus(db, Number(req.params.id), status);
    if (!task) {
      return res.status(404).json({ error: `No task with id ${req.params.id}` });
    }

    return res.json(task);
  });

  app.patch('/tasks/:id/title', (req, res) => {
    const parsedTaskId = parseId(req.params.id);
    if (!parsedTaskId) {
      return res.status(400).json({ error: 'task id must be a positive integer' });
    }

    const { title } = req.body ?? {};
    if (typeof title !== 'string' || title.trim() === '') {
      return res.status(400).json({ error: 'title must be a non-empty string' });
    }

    const task = setTaskTitle(db, parsedTaskId, title.trim());
    if (!task) {
      return res.status(404).json({ error: `No task with id ${parsedTaskId}` });
    }

    return res.json(task);
  });

  app.patch('/tasks/:id/tags', (req, res) => {
    const parsedTaskId = parseId(req.params.id);
    if (!parsedTaskId) {
      return res.status(400).json({ error: 'task id must be a positive integer' });
    }

    const { tags } = req.body ?? {};
    const normalizedTags = normalizeTagNames(tags);
    if (normalizedTags === null) {
      return res.status(400).json({ error: 'tags must be an array of strings' });
    }

    const task = setTaskTags(db, parsedTaskId, normalizedTags);
    if (!task) {
      return res.status(404).json({ error: `No task with id ${parsedTaskId}` });
    }

    return res.json(task);
  });

  app.patch('/tasks/:id/linked-lists', (req, res) => {
    const parsedTaskId = parseId(req.params.id);
    if (!parsedTaskId) {
      return res.status(400).json({ error: 'task id must be a positive integer' });
    }

    const { linkedListIds } = req.body ?? {};
    const normalizedLinkedListIds = normalizeListIds(linkedListIds);
    if (normalizedLinkedListIds === null) {
      return res.status(400).json({ error: 'linkedListIds must be an array of positive integers' });
    }

    const allValidListIds = new Set(listLists(db).map((list) => list.id));
    if (normalizedLinkedListIds.some((id) => !allValidListIds.has(id))) {
      return res.status(404).json({ error: 'One or more linked lists do not exist' });
    }

    const task = setTaskLinkedLists(db, parsedTaskId, normalizedLinkedListIds);
    if (!task) {
      return res.status(404).json({ error: `No task with id ${parsedTaskId}` });
    }

    return res.json(task);
  });

  app.post('/audit-logs/:id/restore', (req, res) => {
    const parsedAuditId = parseId(req.params.id);
    if (!parsedAuditId) {
      return res.status(400).json({ error: 'audit log id must be a positive integer' });
    }

    const restored = restoreAuditLog(db, parsedAuditId);
    if (!restored) {
      return res.status(404).json({ error: `No audit log with id ${parsedAuditId}` });
    }

    return res.json(restored);
  });

  app.delete('/tasks/:id', (req, res) => {
    const deleted = deleteTask(db, Number(req.params.id));
    if (!deleted) {
      return res.status(404).json({ error: `No task with id ${req.params.id}` });
    }
    return res.status(204).end();
  });

  return app;
}

module.exports = { createApp };
