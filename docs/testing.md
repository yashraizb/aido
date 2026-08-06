# Testing

[← Back to README](../README.md)

```bash
npm test
```

Runs `node --test db/*.test.js mcp-server/*.test.js backend/*.test.js` (Node's built-in test runner — no Jest/Mocha/Vitest dependency). As of this writing: **40 tests, all passing** (2 in `db/db.test.js`, 13 in `mcp-server/tasks.test.js`, 25 in `backend/server.test.js`).

## What's covered

| File | Covers |
|---|---|
| `db/db.test.js` | Schema creation (asserts the exact column set on `tasks`, including `list_id`/`updated_at`) and that `initDb()` is idempotent when called twice against the same file. |
| `mcp-server/tasks.test.js` | Every function in `mcp-server/tasks.js`: task CRUD + status toggling, tag replacement, linked-list replacement, list CRUD, tag listing, and an audit-log-restore round trip. |
| `backend/server.test.js` | Every REST route in `backend/server.js`, using real `http.request`/`http.get` calls against an `app.listen(0)` instance (not a mocking library) — status codes and response bodies for both success and validation-failure paths. |

Every test opens its own `initDb(':memory:')` (or a tempfile for the two `db.test.js` idempotency/schema tests) and closes it at the end — tests never touch the real `db/tasks.db`, so running the suite is safe to do with the app running.

## What's not covered

- **`frontend/` has no automated tests.** No test runner is configured in `frontend/package.json`. Verification is manual — see [Frontend](frontend.md#no-automated-frontend-tests) for the checklist used historically (run `npm run dev`, exercise add/toggle/edit/delete/list-management, check the console).
- **`mcp-server/index.js` (the actual MCP tool wiring) has no automated test.** `mcp-server/tasks.test.js` covers the underlying functions directly; the MCP layer on top (zod schemas, tool registration, `isError` responses) has only been spot-checked manually with a throwaway in-memory `Client`/`InMemoryTransport` script during development (see the commit history around `dc75ba1` for an example of that verification style) — there's no committed script or CI step that does this automatically.
- **No integration test** exercises the MCP server and backend concurrently against the same real (file-backed) database to check for write contention — WAL mode is relied on rather than verified under test.

## Adding a test for a new backend/MCP feature

Follow the existing pattern: `initDb(':memory:')` at the top of the test, `db.close()` at the end, one `test(...)` block per behavior (not one giant test per function). For a new REST route, add a case to `backend/server.test.js` using the file's existing `get`/`request` helpers rather than adding a new HTTP client.
