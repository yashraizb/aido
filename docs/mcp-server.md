# MCP Server

[← Back to README](../README.md)

**Files:** `mcp-server/tasks.js` (task operations, shared with the backend) · `mcp-server/index.js` (MCP stdio server wiring)

`mcp-server/index.js` starts an `@modelcontextprotocol/sdk` `McpServer` named `aido-tasks` over stdio (`StdioServerTransport`) and registers one tool per function in `tasks.js`. Wiring it into Claude Desktop is covered in [Claude Desktop setup](claude-desktop-setup.md).

## Tool reference

All `id` / `listId` / `linkedListIds` parameters are validated as positive integers by zod schemas in `index.js` before the underlying `tasks.js` function is ever called. Every tool returns `{ content: [{ type: 'text', text: ... }] }`; failures (bad id, duplicate name) set `isError: true` on that response with a human-readable message, rather than throwing.

### Tasks

| Tool | Input | Behavior |
|---|---|---|
| `add_task` | `title` (string), `listId?` (int, default `1`), `linkedListIds?` (int[]), `tags?` (string[]) | Creates a task in `listId`, applies `tags` (creating any that don't exist yet), and makes it visible in `linkedListIds` too. Returns the created task (see [shape](#task-shape) below). |
| `list_tasks` | `listId` (int), `status` (`'pending'` \| `'in_progress'` \| `'done'`) | Lists tasks in a specific list with a specific status. Both parameters required — this narrowing is deliberate to prevent accidental expensive queries fetching every task across all lists and statuses. |
| `complete_task` | `id` (int) | Shorthand for `update_task_status` with `status: 'done'`. One-directional — there's no `reopen_task` tool (see [Architecture: known gaps](architecture.md#known-gaps) for why). |
| `update_task_status` | `id` (int), `status` (`'pending'` \| `'done'`) | General two-way status setter. `complete_task` is implemented in terms of this. |
| `update_task_title` | `id` (int), `title` (string) | Rejects (isError) an empty/whitespace-only title after trimming. |
| `update_task_tags` | `id` (int), `tags` (string[]) | **Replaces** the task's full tag set — not additive. Pass the complete desired list every time. |
| `update_task_linked_lists` | `id` (int), `linkedListIds` (int[]) | **Replaces** the task's full linked-list set (excluding its owning `list_id`, which is always implicitly included). Rejects if any id doesn't correspond to an existing list. |
| `delete_task` | `id` (int) | Hard delete. Cascades `task_tags`/`task_list_links` rows for it via `ON DELETE CASCADE`. |

### Lists

| Tool | Input | Behavior |
|---|---|---|
| `list_lists` | — | Returns all lists. |
| `create_list` | `name` (string) | Rejects empty names and duplicate names (list names are `UNIQUE`). |
| `update_list` | `id` (int), `name` (string) | Renames a list; same duplicate-name rejection as create. |
| `delete_list` | `id` (int) | **Deletes every task owned by that list** (not just unlinked from it). Refuses if it's the last remaining list. |

### Tags

| Tool | Input | Behavior |
|---|---|---|
| `list_tags` | — | Returns all tags, sorted case-insensitively by name. |
| `create_tag` | `name` (string) | Rejects empty/duplicate names. Note `add_task`'s `tags` param and `update_task_tags` already auto-create tags that don't exist — this tool is for creating a tag with no task attached yet. |

### Audit log

| Tool | Input | Behavior |
|---|---|---|
| `list_audit_logs` | `entityType` (`'task'` \| `'list'` \| `'tag'` \| `'audit_log'`), `limit` (int, 1–50) | Returns audit log entries filtered by entity type and bounded to at most 50 results. Both parameters required — prevents expensive queries and bounds output size. |
| `restore_audit_log` | `id` (int, an audit log's own id) | Wipes and reinserts `lists`/`tasks`/`tags`/`task_tags`/`task_list_links` from that log entry's stored snapshot. Itself recorded as a new audit log entry (`action: 'restore_audit_log'`) — so a restore can itself be undone by restoring to the entry just before it. |

## Task shape

Every task-returning tool (and `list_tasks`) returns tasks hydrated by `hydrateTasks()` in `tasks.js`:

```json
{
  "id": 1,
  "title": "Buy milk",
  "status": "pending",
  "list_id": 1,
  "created_at": "2026-08-05 12:00:00",
  "updated_at": "2026-08-05 12:00:00",
  "tags": ["errands"],
  "linked_list_ids": [1, 3],
  "linked_lists": ["My Tasks", "Weekend"]
}
```

`tags`, `linked_list_ids`, and `linked_lists` are computed, not stored columns — see [Database: `list_id` vs. `linked_list_ids`](database.md#list_id-vs-linked_list_ids-ownership-vs-visibility).

## Adding a new tool

1. Add the underlying operation to `mcp-server/tasks.js` (it should take `db` as its first argument, like every existing function, so both this file and `backend/server.js` can call it identically).
2. Register it with `server.tool(name, zodShape, handler)` in `mcp-server/index.js`. For a zero-parameter tool, pass a description string instead of a schema object (`server.tool('list_lists', 'List all task lists', async () => {...})`) — passing `{}` makes the SDK require an `arguments` object even for zero-arg calls, which broke some MCP clients (see the `dc75ba1` commit for the original fix).
3. Add the corresponding REST route in `backend/server.js` if the frontend needs it too (see [Backend API](backend-api.md)).
