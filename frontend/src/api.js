const API_BASE = 'http://localhost:3001';
const TASKS_URL = `${API_BASE}/tasks`;
const LISTS_URL = `${API_BASE}/lists`;
const TAGS_URL = `${API_BASE}/tags`;
const AUDIT_LOGS_URL = `${API_BASE}/audit-logs`;

async function parseResponse(res) {
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const message = body && body.error ? body.error : `Request failed with status ${res.status}`;
    throw new Error(message);
  }

  return body;
}

export async function getTasks() {
  const res = await fetch(TASKS_URL);
  return parseResponse(res);
}

export async function getTasksByList(listId) {
  const res = await fetch(`${TASKS_URL}?listId=${listId}`);
  return parseResponse(res);
}

export async function createTask(title, listId, linkedListIds = [], tags = []) {
  const res = await fetch(TASKS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, listId, linkedListIds, tags }),
  });
  return parseResponse(res);
}

export async function setStatus(id, status) {
  const res = await fetch(`${TASKS_URL}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  return parseResponse(res);
}

export async function updateTaskTitle(id, title) {
  const res = await fetch(`${TASKS_URL}/${id}/title`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  return parseResponse(res);
}

export async function deleteTask(id) {
  const res = await fetch(`${TASKS_URL}/${id}`, { method: 'DELETE' });
  await parseResponse(res);
}

export async function updateTaskTags(id, tags) {
  const res = await fetch(`${TASKS_URL}/${id}/tags`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tags }),
  });
  return parseResponse(res);
}

export async function updateTaskLinkedLists(id, linkedListIds) {
  const res = await fetch(`${TASKS_URL}/${id}/linked-lists`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ linkedListIds }),
  });
  return parseResponse(res);
}

export async function getLists() {
  const res = await fetch(LISTS_URL);
  return parseResponse(res);
}

export async function getUserLists() {
  const res = await fetch(`${LISTS_URL}?kind=user`);
  return parseResponse(res);
}

export async function getSystemLists() {
  const res = await fetch(`${LISTS_URL}?kind=system`);
  return parseResponse(res);
}

export async function getCompletedTasks() {
  const res = await fetch(`${API_BASE}/tasks/completed`);
  return parseResponse(res);
}

export async function createList(name) {
  const res = await fetch(LISTS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return parseResponse(res);
}

export async function renameList(id, name) {
  const res = await fetch(`${LISTS_URL}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return parseResponse(res);
}

export async function removeList(id) {
  const res = await fetch(`${LISTS_URL}/${id}`, { method: 'DELETE' });
  await parseResponse(res);
}

export async function getTags() {
  const res = await fetch(TAGS_URL);
  return parseResponse(res);
}

export async function createTag(name) {
  const res = await fetch(TAGS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return parseResponse(res);
}

export async function getAuditLogs() {
  const res = await fetch(AUDIT_LOGS_URL);
  return parseResponse(res);
}

export async function restoreAuditLog(id) {
  const res = await fetch(`${AUDIT_LOGS_URL}/${id}/restore`, {
    method: 'POST',
  });
  return parseResponse(res);
}