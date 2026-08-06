# Claude Desktop Setup

[← Back to README](../README.md)

Claude Desktop spawns `mcp-server/index.js` as a local subprocess and talks to it over stdio — there's no network hop or port for this piece (unlike the backend). See [Architecture: why no Docker Compose](architecture.md#why-no-docker-compose) for why this rules out containerizing it the same way as the backend/frontend.

## Config

Add an entry to `mcpServers` in Claude Desktop's config file:

- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "aido": {
      "command": "node",
      "args": [
        "/absolute/path/to/aido/mcp-server/index.js"
      ]
    }
  }
}
```

Use an **absolute path** to both `node` and `index.js` — Claude Desktop doesn't run this with your shell's `PATH` or working directory. On Windows, use the full path to `node.exe` (e.g. `C:\\Program Files\\nodejs\\node.exe`) and double-escaped backslashes in the JSON path string, or forward slashes.

Restart Claude Desktop after editing the config for it to pick up the new server.

## Verifying it's connected

Once connected, all of the tools in [MCP Server](mcp-server.md) become available to Claude — `add_task`, `list_tasks`, `complete_task`, `update_task_status`, `update_task_title`, `update_task_tags`, `update_task_linked_lists`, `delete_task`, `list_lists`, `create_list`, `update_list`, `delete_list`, `list_tags`, `create_tag`, `list_audit_logs`, `restore_audit_log`. Ask Claude to list your tasks — if it can, the connection is working.

## Troubleshooting

- **Tools don't show up:** check the path in the config is absolute and correct, and that you restarted Claude Desktop (not just started a new chat).
- **Server errors immediately:** run `node /absolute/path/to/mcp-server/index.js` manually in a terminal — if it throws on startup, the error will be visible there instead of swallowed by Claude Desktop. A common cause is `node_modules` not being installed (`npm install` at the repo root — see [Development](development.md#setup)).
- **Tool calls succeed but the browser UI doesn't show the change:** the frontend polls every 3 seconds (see [Frontend: state sync](frontend.md#state-sync-poll--optimistic-updates)) — wait a few seconds, or confirm `backend/index.js` is running and pointed at the same `db/tasks.db`.
