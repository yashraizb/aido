# Architecture

[← Back to README](../README.md)

## The shared-database pattern

There is no API layer between the MCP server and the backend — they are two independent Node processes that both `require('../mcp-server/tasks.js')` and both open the same `db/tasks.db` file via `db/db.js`'s `initDb(DB_PATH)`. SQLite's WAL mode (enabled in `db/db.js`) makes this safe for one writer at a time from either process.

This means:
- A task added by Claude (via the MCP server) is immediately visible to the backend's next `GET /tasks` — no sync step, no message queue.
- A task added through the browser (via the backend) is immediately visible the next time Claude calls `list_tasks`.
- `mcp-server/tasks.js` is the single source of truth for *business logic* (validation, audit logging, tag/list bookkeeping). Both `mcp-server/index.js` (MCP tool wiring) and `backend/server.js` (REST route wiring) are thin adapters over the same functions — neither reimplements task logic itself.

## Data flow

```
User (browser)                          User (voice/chat via Claude)
     │                                          │
     ▼                                          ▼
frontend/ (React)                     Claude Desktop
     │  fetch()                              │  MCP tool call (stdio)
     ▼                                          ▼
backend/server.js (Express)          mcp-server/index.js (McpServer)
     │                                          │
     └──────────────┬───────────────────────────┘
                     ▼
          mcp-server/tasks.js
          (addTask, listTasks, setTaskStatus, deleteTask,
           setTaskTitle, setTaskTags, setTaskLinkedLists,
           list/create/update/delete List, list/createTag,
           listAuditLogs, restoreAuditLog)
                     │
                     ▼
              db/db.js → db/tasks.db (SQLite, WAL mode)
```

See [Database](database.md) for the schema those functions read and write, [MCP Server](mcp-server.md) for the full tool list, [Backend API](backend-api.md) for the REST surface, and [Frontend](frontend.md) for how the UI consumes it.

## Audit log and restore

Every mutating operation in `mcp-server/tasks.js` (`recordAudit`) writes a row to `audit_logs` containing the action name, the affected entity, and a full JSON snapshot of `lists`/`tasks`/`tags`/`task_tags`/`task_list_links` *after* the change. `restoreAuditLog(db, auditId)` replays a past snapshot by wiping and reinserting all five tables inside a transaction. This is a full-state undo, not a diff-based undo — it trades storage efficiency for simplicity (each snapshot is self-contained, so restoring never depends on replaying a chain of prior changes).

## Why no Docker Compose

Considered and declined. The backend and frontend containerize trivially, but the MCP server is meant to be spawned by Claude Desktop as a local subprocess over stdio (see [Claude Desktop setup](claude-desktop-setup.md)) — wrapping it in a container would mean Claude Desktop's config has to `docker exec` into a running container instead of just running `node`, which is more fragile than the payoff is worth for a local single-user tool. If the backend/frontend ever need one-command spinup independent of the MCP server, a compose file covering just those two (with `db/tasks.db` mounted as a shared volume, and the MCP server still run natively pointed at that same path) would be the right scope.

## Known gaps

- **List deletion is destructive.** `deleteList` (`mcp-server/tasks.js`) deletes every task in that list outright — there's no "move tasks to another list first" step. `delete_list` (MCP tool) and `DELETE /lists/:id` (REST) both refuse to delete the last remaining list, but otherwise proceed without confirmation.
- **No frontend automated tests.** Verification of `frontend/` is manual (run it, click through it) — see [Testing](testing.md).
- **`frontend/dist/` is a committed-looking build artifact** sitting in the working tree from a local `vite build` run; it isn't tracked by `.gitignore` and should probably be removed or ignored rather than shipped.
