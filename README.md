# aido

A voice/chat-driven to-do app. Claude manages your tasks through an MCP server; a web UI (styled after Google Tasks) gives you the same list in a browser. Both talk to the same SQLite file, so anything you tell Claude to do shows up in the browser within a few seconds, and vice versa.

```
Claude Desktop (chat/voice)
        │  MCP tool calls (stdio)
        ▼
   mcp-server/            ──┐
        │                    │  both call the same
        ▼                    │  functions in mcp-server/tasks.js
   db/tasks.db (SQLite)      │
        ▲                    │
        │                    │
   backend/  (Express REST) ─┘
        ▲
        │  HTTP (poll + optimistic updates)
   frontend/  (React, Google Tasks-style UI)
```

## Quick start

```bash
npm install                    # installs root deps (db, mcp-server, backend)
cd frontend && npm install && cd ..   # installs frontend deps
```

Run the backend and frontend in two terminals:

```bash
node backend/index.js          # REST API on http://localhost:3001
```

```bash
cd frontend && npm run dev     # UI on http://localhost:5173
```

Open `http://localhost:5173`. To manage tasks through Claude instead, see [Claude Desktop setup](docs/claude-desktop-setup.md).

## Run the tests

```bash
npm test
```

See [Testing](docs/testing.md) for what's covered and how each layer is tested.

## Project layout

| Path | What it is | Details |
|---|---|---|
| `db/` | SQLite schema + shared `initDb()` | [Database](docs/database.md) |
| `mcp-server/` | Task operations (`tasks.js`) + MCP stdio server (`index.js`) exposing them as tools to Claude | [MCP Server](docs/mcp-server.md) |
| `backend/` | Express REST API over the same task operations | [Backend API](docs/backend-api.md) |
| `frontend/` | React UI (Google Tasks-style) | [Frontend](docs/frontend.md) |

Further reading:

- [Architecture](docs/architecture.md) — how the pieces fit together and why
- [Development](docs/development.md) — day-to-day workflow, scripts, conventions
- [Claude Desktop setup](docs/claude-desktop-setup.md) — wiring the MCP server into Claude Desktop

## Design history

This project was built incrementally through a series of planned features, each with its own spec and implementation plan under `docs/superpowers/`:

- [Voice To-Do MVP plan](docs/superpowers/plans/2026-08-05-voice-todo-mvp.md) — the original 4-piece MVP (schema, MCP server, backend, read-only frontend)
- [Google Tasks-style UI spec](docs/superpowers/specs/2026-08-05-google-tasks-ui-design.md) and [plan](docs/superpowers/plans/2026-08-05-google-tasks-ui.md) — turning the frontend interactive

The current codebase has grown beyond both of those documents (lists, tags, and audit-log/restore support were added directly) — the docs above describe the reasoning trail, not necessarily the exact current feature set. [Architecture](docs/architecture.md) and the other reference docs describe what's actually implemented today.

## Status

Not containerized (see the tradeoffs in [Architecture](docs/architecture.md#why-no-docker-compose)) and not deployed anywhere — this runs locally only. No authentication; it's a single-user local tool.
