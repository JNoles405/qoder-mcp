# qoder-mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server for [Qoder](https://github.com/JNoles405/qoder) — read and write your projects, todos, issues, versions, notes, milestones, daily logs, and ideas against your Qoder Supabase workspace, from Claude or any MCP-aware client.

## Install

### Via npx (recommended — always latest)

No install step; your MCP client will fetch it on demand. See the config examples below.

### Globally

```bash
npm install -g qoder-mcp
```

## Configuration

`qoder-mcp` signs into your Qoder Supabase project with email + password. All four variables are required:

| Variable | Where to find it |
| -------- | ---------------- |
| `QODER_SUPABASE_URL` | Your Supabase project URL (e.g. `https://abcde.supabase.co`). In the Qoder desktop app, click the Supabase badge in the sidebar footer. |
| `QODER_SUPABASE_ANON_KEY` | Your Supabase project `anon` key (same place). |
| `QODER_EMAIL` | The email you sign into Qoder with. |
| `QODER_PASSWORD` | The password for that account. |

### Claude Desktop

Add this to `claude_desktop_config.json` (on Windows: `%APPDATA%\Claude\claude_desktop_config.json`; on macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "qoder": {
      "command": "npx",
      "args": ["-y", "qoder-mcp"],
      "env": {
        "QODER_SUPABASE_URL": "https://your-project.supabase.co",
        "QODER_SUPABASE_ANON_KEY": "eyJ...",
        "QODER_EMAIL": "you@example.com",
        "QODER_PASSWORD": "your-password"
      }
    }
  }
}
```

Restart Claude Desktop. You should see the Qoder tools listed in the tool picker.

### Claude Code (CLI)

```bash
claude mcp add qoder \
  --env QODER_SUPABASE_URL=https://your-project.supabase.co \
  --env QODER_SUPABASE_ANON_KEY=eyJ... \
  --env QODER_EMAIL=you@example.com \
  --env QODER_PASSWORD=your-password \
  -- npx -y qoder-mcp
```

## Tools

### Reads

| Tool | What it does |
| ---- | ------------ |
| `list_projects` | List every project you own, with the latest version attached. Optional `status` filter. |
| `get_project` | One project with all children — versions, milestones, todos, notes, issues, ideas, concepts, daily logs. |
| `list_todos` | Scoped to a project or across all your projects. Optional `completed` filter. |
| `list_issues` | Scoped to a project or across all your projects. Optional `status` filter. |
| `list_versions` | Release-history entries scoped to a project or across all your projects. |
| `search_content` | Case-insensitive substring match across notes, ideas, concepts and daily logs. |
| `list_daily_logs` | Journal entries scoped to a project or all projects, newest first. |
| `list_workspace_ideas` | List ideas in the user's global workspace (the cross-project idea bank under Workspace > Ideas in the Qoder app). |

### Writes

| Tool | What it does |
| ---- | ------------ |
| `add_project` | Create a new project. |
| `add_todo` | Add a todo to a project. |
| `complete_todo` | Mark a todo as completed. |
| `add_note` | Append a note to a project. |
| `add_version` | Record a new version / release. |
| `add_milestone` | Add a milestone. |
| `complete_milestone` | Mark a milestone as completed. |
| `add_daily_log` | Add a journal entry (defaults `log_date` to today UTC). |
| `add_idea` | Capture an idea in a project's idea bank. |
| `add_workspace_idea` | Capture an idea in the user's global workspace (cross-project idea bank). |

## Security notes

- All credentials are read from the server's environment block, which the MCP client passes to the child process. Nothing is written to disk by `qoder-mcp`.
- The server signs in once per process and refreshes its JWT in the background.
- Every read filters by your user id — the server does not expose cross-user queries.
- The connection to Supabase is a direct HTTPS call from this process; nothing is proxied through a third party.
- The anon key is a public identifier (that's what the Electron app ships with). Access control comes from Supabase's row-level security policies on your tables.

## Local development

```bash
git clone https://github.com/JNoles405/qoder-mcp.git
cd qoder-mcp
npm install
# set the four env vars, then:
node bin/qoder-mcp.js
```

The server speaks MCP over stdio, so a bare `node` launch will just sit there waiting on protocol input after signing in — that's success. `Ctrl-C` to exit.

To wire your local checkout into Claude Desktop for end-to-end testing, point it at the absolute path:

```json
{
  "mcpServers": {
    "qoder": {
      "command": "node",
      "args": ["F:/Qoder/MCP/bin/qoder-mcp.js"],
      "env": { "...": "..." }
    }
  }
}
```

## License

MIT. See [LICENSE](LICENSE).
