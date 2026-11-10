# qoder-mcp — handover

This file is the orientation document for `qoder-mcp`. The README says *what the thing does*; this file says *how the work is run, what was decided and why, and which mistakes have already been paid for*. It is updated in the same commit as the change it describes.

## 1. What it is

A Model Context Protocol (MCP) server, published to npm as `qoder-mcp`, that lets Claude (and any other MCP client) read and write a user's Qoder data by signing into their Supabase project with email + password.

- Language: plain ESM JavaScript. No TypeScript, no bundler.
- Runtime: Node ≥ 18.17 (needs native `fetch` and global `URL`).
- Transport: stdio only.
- Dependencies: `@modelcontextprotocol/sdk`, `zod`.

This package is intentionally **not** shared code with the Electron app (`F:\Qoder\App`), even though its Supabase REST client (`src/supabase.js`) mirrors the dialect of the app's `src/data.js`. The reasons:

- The Electron renderer runs under Vite + browser globals; this is a Node CLI with its own fetch/URL semantics.
- A long-lived MCP process has to refresh its JWT inline — the renderer refreshes via React effects. Different control flow.
- Keeping them separate means neither change breaks the other, and the npm package has zero Electron/Vite dependencies.

The schema the tools write to matches the Electron app's **as of v0.9.20** (commit `bf9b89a`). Any schema change in the app repo must land here too.

## 2. Standing constraints

- **Credentials come only from env vars.** `QODER_SUPABASE_URL`, `QODER_SUPABASE_ANON_KEY`, `QODER_EMAIL`, `QODER_PASSWORD`. No file-based config, no OAuth, no interactive prompt. The MCP client (Claude Desktop etc.) is the configuration surface. Missing vars → fail-fast with a message that tells the user where to set them.
- **stdout is reserved for the MCP transport.** Any log, warning, or diagnostic goes to stderr. A `console.log` on stdout corrupts the protocol and the client goes silent.
- **One Supabase session per process.** Password is kept in memory so we can re-signin if a refresh fails.
- **User-scoped reads only.** Every read filters by `user_id=eq.<signed-in uid>` at the `projects` level, then joins children by `project_id`. We do not expose arbitrary cross-user queries, even though Supabase RLS would also block them.
- **MIT-licensed public package.** This is intentionally a public, reusable package so any Qoder user can wire it into their MCP client; it does not depend on being installed from a private registry.
- **The anon key is public.** It's what the Electron app also ships with. Access control is enforced by Supabase row-level security, not by hiding the key.

## 3. How the work is run

- Edit → `node bin/qoder-mcp.js` locally with env vars set in the shell. The server speaks MCP over stdio, so after a successful sign-in it looks "hung" (waiting on protocol input). That is success. Ctrl-C to stop.
- For end-to-end tests with Claude Desktop, wire the local checkout in instead of npx: `{"command": "node", "args": ["F:/Qoder/MCP/bin/qoder-mcp.js"]}` with the env block.
- No test runner yet. The first tests should mock `fetch` and verify the Supabase REST dialect in `src/supabase.js`.

## 4. Building, running, testing

```bash
npm install                 # installs @modelcontextprotocol/sdk + zod
node bin/qoder-mcp.js       # one-process smoke test (needs env vars)
```

There is no build step. ESM runs directly under Node.

## 5. Architecture worth knowing

```
F:\Qoder\MCP\
├── bin/
│   └── qoder-mcp.js       Shebang entrypoint. Imports startServer and runs it.
└── src/
    ├── config.js          Reads + validates env vars.
    ├── supabase.js        SupabaseClient — sign in, token refresh, get/post/patch/del.
    ├── server.js          Wires config + client + tool registration + stdio transport.
    └── tools/
        ├── index.js       Re-exports registerReads + registerWrites.
        ├── reads.js       list_projects, get_project, list_todos, list_issues,
        │                  list_versions, search_content, list_daily_logs,
        │                  list_workspace_ideas (8 tools).
        └── writes.js      add_project, update_project, add_todo, complete_todo, add_note,
                           add_version, add_milestone, complete_milestone, add_daily_log,
                           add_idea, add_workspace_idea (11 tools).
```

### Tool handlers

Every tool handler is an async arrow that closes over the `sb` SupabaseClient passed into `registerReads` / `registerWrites`. No module-level mutable state anywhere.

Every handler returns the uniform shape `{ content: [{ type: "text", text: JSON.stringify(...) }] }`. Keeping JSON-in-text everywhere means a future upgrade to [structured content](https://modelcontextprotocol.io/specification/draft/server/tools) swaps in one place.

### Position fields

Qoder uses `position` columns on orderable children (todos, notes, ideas, versions, project_groups). The write tools calculate the next position by querying `?select=position&order=position.desc&limit=1` on insert, matching what the renderer does.

### Workspace (cross-project idea bank)

The Electron app also has a global "Workspace" that is NOT per-project — notes, ideas, and snippets that belong to the user, not to any one project. Storage is a single JSON column on `user_settings.workspace_data` with shape `{ notes: [], ideas: [], snippets: [] }`. Each item has `{ id, content, pinned, createdAt }`.

The renderer reads it via `sb.get("user_settings","?user_id=eq.<id>")` and writes it via `sb.upsertSettings` (which POSTs with `Prefer: resolution=merge-duplicates`). That means **every write replaces the whole `workspace_data` object** — there is no partial JSON merge. The MCP mirrors this: `add_workspace_idea` reads the current workspace, prepends the new idea, and writes the whole thing back.

Two consequences, both documented in §7:
1. If something else (the Electron app, another MCP call) writes to `workspace_data` between the MCP's read and its write, the other write is lost. In practice the user is only in one place at a time, but worth knowing.
2. Workspace ids are strings produced by `Date.now()+"-"+6-random-chars` (the Electron app uses just `Date.now()+""`). The random suffix keeps two MCP writes in the same millisecond from colliding.

### Status columns

Projects: `planning | in-dev | beta | released | archived` (authoritative list in `App/src/constants.js` → `STATUS_CONFIG`). Issues: `open | fixed | wontfix`. Sprints: `active | ...`. These string values are not validated by zod — the server passes them through to Supabase and lets the DB (or RLS policy) reject bad values. That matches the Electron app's approach.

## 6. What changed and why

- **2026-11-02 — v0.1.0 initial scaffold.** 7 read tools + 9 write tools. Separate git repo. Supabase REST client duplicates the Electron app's dialect; see §1 for why. Not yet published to npm or pushed to GitHub.
- **2026-11-03 — status enum fix.** `active` → `in-dev`. See §7.
- **2026-11-03 — workspace ideas.** Added `add_workspace_idea` and `list_workspace_ideas`, backed by `user_settings.workspace_data`. Added `getUserSettings` / `upsertUserSettings` to the Supabase client. Tool count now 8 reads + 10 writes = 18.
- **2026-11-09 — first update tool.** Added `update_project` (name/description/status/tech_stack/git_url/local_folder/supabase_url/vercel_url/color). Ownership is confirmed by a pre-flight `projects?id=eq.X&user_id=eq.Y` lookup before the PATCH, giving a clear error instead of the empty array RLS would return. Empty-string on nullable columns maps to `null` so a caller can clear a field. `tech_stack` is replace, not append (documented in the tool description). Tool count now 8 reads + 11 writes = 19.

## 7. Traps already paid for

- **The project status is `in-dev`, not `active`.** The v0.1 scaffold documented the status enum as `planning | active | beta | released | archived` in the tool descriptions — but the Electron app's `STATUS_CONFIG` in `App/src/constants.js` uses `in-dev` for the active-development state, and that is what every row in the database has. A user filtering `list_projects` by `status: "active"` got an empty result. Fixed in a follow-up commit; the lesson is to read `STATUS_CONFIG` as the authoritative list before documenting any enum, not to guess from Supabase column names.
- **Workspace writes are last-write-wins.** `user_settings.workspace_data` is a single JSON blob, not a relation, so there is no row-level locking the way per-project `ideas`/`notes` have. `add_workspace_idea` reads the current workspace, prepends, writes the whole thing back. If the Electron app writes to the workspace between the MCP's read and its write (user is active in both at once), that write is lost. For a single-user tool this is acceptable; if we add multi-writer support later, we need either a dedicated `workspace_ideas` table or an optimistic-concurrency check.

## 8. How things are verified

- `node bin/qoder-mcp.js` with no env vars → fails fast with a human-readable stderr line naming the missing vars.
- `node bin/qoder-mcp.js` with bad credentials → fails fast with "Qoder sign-in failed: Invalid login credentials" or similar.
- `node bin/qoder-mcp.js` with good credentials → prints "qoder-mcp: signed in as user <uuid>" on stderr and then blocks waiting on stdin (that is MCP speaking over stdio; it is success).
- End-to-end smoke in Claude Desktop: configure the server, restart, ask "list my Qoder projects" and verify the output matches the Electron app's dashboard.

## 9. Outstanding

- **No tests yet.** First targets: Supabase REST dialect in `src/supabase.js` (mock `fetch`), and the position-calculation path in writes.js.
- **No publish to npm yet.** Needs: `npm login` under an account that owns `qoder-mcp` on npm; first publish `npm publish --access public`.
- **No HTTP / SSE transport.** stdio works for Claude Desktop and Claude Code; a shared server mode would be needed for anything that wants to connect over the network.
- **No per-tool rate limiting.** The MCP client limits concurrency naturally, but a determined caller could still hammer Supabase. If this becomes a problem, add a p-queue around the `sb` methods.
- **No delete tools; updates only for projects so far.** `update_project` lands on 2026-11-09, but there is no `update_todo` / `update_note` / `update_version` / `update_milestone` / `update_issue` / `update_idea` yet, and no `delete_*` tools at all. Follow the `update_project` pattern (ownership pre-flight via a user-scoped read, then `sb.patch`) when adding more; delete tools need an equivalent ownership check before `sb.del`.
- **Workspace items are a JSON blob, not a relation (queued for v0.2).** `user_settings.workspace_data` holds notes, ideas, and snippets as a single JSON column; every write to it replaces the whole blob, so two writers race (see §7). Fix: dedicated `workspace_ideas` / `workspace_notes` / `workspace_snippets` tables mirroring the per-project versions (same columns: `id`, `user_id`, `content`, `pinned`, `position`, `created_at`, same RLS pattern). Needs: (1) one Supabase migration + three RLS policies, (2) a one-time copy of each user's existing `workspace_data.*` into the new tables, (3) matching Electron-app refactor replacing `saveWorkspace` + the `workspace` state with per-row CRUD and an in-app migration banner (same pattern as Phase 3.5 local-backup banner), (4) MCP swap: `add_workspace_idea` / `list_workspace_ideas` from `getUserSettings` + `upsertUserSettings` over to `sb.post` / `sb.get` against `workspace_ideas`. Worth doing when there is a second reason — making workspace ideas searchable alongside per-project ones in `search_content`, feeding them into the activity feed, or supporting SQL-level ordering/pinning. The race condition alone is unlikely to bite a single-user tool, so no urgency.
- **Secrets rotation.** If a user changes their password, their MCP client config has to be updated manually. The server has no way to notify.

## 10. Code conventions

- **Plain ESM, no TS.** Matches the Electron app's renderer; a smaller surface for a small package.
- **`camelCase` for JS identifiers, `snake_case` for Supabase column names.** Same split as the app.
- **Every tool handler closes over `sb`.** No module-level mutable state. `registerReads(server, sb)` and `registerWrites(server, sb)` are the only places where state flows between modules.
- **Fail-fast on bad input.** Zod validates every tool call's shape before the handler runs; bad types never reach Supabase.
- **No console.log, ever.** Diagnostics go to `process.stderr.write()`. See §2.
