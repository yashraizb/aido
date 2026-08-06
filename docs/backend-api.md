# Backend API

[← Back to README](../README.md)

**File:** `backend/server.js` (route wiring) · `backend/index.js` (starts it on port `3001`)

Express app with `cors()` (open — any origin) and `express.json()`. Every route is a thin wrapper around a function from `mcp-server/tasks.js` — see [MCP Server](mcp-server.md) for what each underlying operation actually does; this page documents the HTTP surface (status codes, request/response bodies) on top of it.

## Tasks

| Method & Path | Body | Success | Failure |
|---|---|---|---|
| `GET /tasks?listId=` | — | `200` all tasks, or only those owned by `listId` if the query param is given | `400` if `listId` is present but not a positive integer |
| `POST /tasks` | `{ title, listId, tags?, linkedListIds? }` | `201` created task | `400` missing/empty `title`, missing/invalid `listId`, malformed `tags`/`linkedListIds`; `404` if `listId` or any `linkedListIds` entry doesn't exist |
| `PATCH /tasks/:id` | `{ status }` | `200` updated task | `400` if `status` isn't exactly `'pending'` or `'done'`; `404` unknown id |
| `PATCH /tasks/:id/title` | `{ title }` | `200` updated task | `400` empty/non-string title; `404` unknown id |
| `PATCH /tasks/:id/tags` | `{ tags }` (string array) | `200` updated task, full tag set replaced | `400` malformed `tags`; `404` unknown id |
| `PATCH /tasks/:id/linked-lists` | `{ linkedListIds }` (int array) | `200` updated task, full linked-list set replaced | `400` malformed array; `404` unknown id or unknown list id in the array |
| `DELETE /tasks/:id` | — | `204` no body | `404` unknown id |

**Note:** unlike the MCP `add_task` tool (where `listId` defaults to `1`), `POST /tasks` requires `listId` explicitly and returns `400` if it's missing.

## Lists

| Method & Path | Body | Success | Failure |
|---|---|---|---|
| `GET /lists` | — | `200` all lists | — |
| `POST /lists` | `{ name }` | `201` created list | `400` empty name; `409` duplicate name |
| `PATCH /lists/:id` | `{ name }` | `200` renamed list | `400` invalid id or empty name; `404` unknown id; `409` duplicate name |
| `DELETE /lists/:id` | — | `204` no body | `400` invalid id or attempting to delete the last remaining list; `404` unknown id |

**Deleting a list deletes every task it owns** — see [Architecture: known gaps](architecture.md#known-gaps).

## Tags

| Method & Path | Body | Success | Failure |
|---|---|---|---|
| `GET /tags` | — | `200` all tags | — |
| `POST /tags` | `{ name }` | `201` created tag | `400` empty name; `409` duplicate name |

## Audit log

| Method & Path | Body | Success | Failure |
|---|---|---|---|
| `GET /audit-logs` | — | `200` all entries, newest first | — |
| `POST /audit-logs/:id/restore` | — | `200` `{ restoredFromAuditId, restoredAction }` | `400` invalid id; `404` unknown audit log id |

## Error body shape

Every non-2xx response is `{ "error": "human-readable message" }`. The frontend's `api.js` reads this field directly to populate its error banner — see [Frontend: error handling](frontend.md#error-handling).

## Manual smoke test

```bash
node backend/index.js &                 # start it
curl http://localhost:3001/lists
curl -X POST http://localhost:3001/tasks -H "Content-Type: application/json" \
  -d '{"title":"Test task","listId":1}'
curl -X PATCH http://localhost:3001/tasks/1 -H "Content-Type: application/json" \
  -d '{"status":"done"}'
curl -X DELETE http://localhost:3001/tasks/1 -w "\n%{http_code}\n"
```
