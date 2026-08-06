# Development

[← Back to README](../README.md)

## Setup

```bash
npm install                          # root: db/, mcp-server/, backend/ deps
cd frontend && npm install && cd ..  # frontend/: separate package.json, own node_modules
```

Two `package.json`s, two `node_modules`, two dependency trees — the root one is CommonJS (`require`/`module.exports`, `"type": "commonjs"`), the frontend one is ESM (`"type": "module"`, Vite). They don't share dependencies and shouldn't — keep it that way rather than hoisting to a single root `node_modules`.

## Running everything locally

Three processes, three terminals:

```bash
node backend/index.js        # REST API, :3001
```
```bash
cd frontend && npm run dev   # UI, :5173
```
```bash
node mcp-server/index.js     # only needed if you want to test MCP tool calls
                              # outside of Claude Desktop — it just waits on stdio
```

Claude Desktop launches `mcp-server/index.js` itself (see [Claude Desktop setup](claude-desktop-setup.md)) — you don't need to run it manually unless you're testing MCP tool behavior directly (e.g. with a throwaway `InMemoryTransport` script, as described in [Testing](testing.md#whats-not-covered)).

## Making a change that touches task data

If the change affects how tasks/lists/tags/audit-logs are stored or queried:

1. Add/modify the operation in `mcp-server/tasks.js` first — this is the single source of truth both `mcp-server/index.js` and `backend/server.js` build on. Never duplicate query logic into either adapter.
2. Wire it into `mcp-server/index.js` as an MCP tool (if Claude should be able to call it) and/or `backend/server.js` as a REST route (if the frontend needs it) — see [MCP Server: adding a new tool](mcp-server.md#adding-a-new-tool).
3. If the schema itself needs to change, add the new `CREATE TABLE`/column to `db/db.js`'s `SCHEMA`, and add a step to `runMigrations()` if existing databases need to be backfilled — see [Database: migrations](database.md#migrations).
4. Add tests to `mcp-server/tasks.test.js` and, if you added a REST route, `backend/server.test.js`.
5. Run `npm test`.

## Commit conventions

Conventional-commit-style prefixes are used throughout the history: `feat:`, `fix:`, `chore:`, `docs:`. Follow the existing style (`git log --oneline`) rather than introducing a new one.

## Planning artifacts

Larger features go through a spec (`docs/superpowers/specs/`) and an implementation plan (`docs/superpowers/plans/`) before code — see the [Design history](../README.md#design-history) section of the README for the two produced so far. These aren't required for small fixes, but for anything touching multiple files/layers they're the place to record the *why*, not just the *what* (git history already has the what).
