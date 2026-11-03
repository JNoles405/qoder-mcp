import { z } from "zod";

export function registerWrites(server, sb) {
  server.registerTool(
    "add_project",
    {
      title: "Add project",
      description:
        "Create a new Qoder project. The project is owned by the signed-in user and appended to the end of their list.",
      inputSchema: {
        name: z.string().describe("Project name"),
        description: z.string().optional().describe("Short description"),
        status: z
          .string()
          .optional()
          .describe("One of: planning | in-dev | beta | released | archived (default: planning)"),
        tech_stack: z
          .array(z.string())
          .optional()
          .describe('Tech-stack tags, e.g. ["React","Supabase"]'),
        git_url: z.string().optional(),
        local_folder: z.string().optional(),
      },
    },
    async ({ name, description, status, tech_stack, git_url, local_folder }) => {
      const existing = await sb.get(
        "projects",
        `?user_id=eq.${sb.userId}&select=position&order=position.desc&limit=1`,
      );
      const position = existing.length ? (existing[0].position || 0) + 1 : 0;
      const row = await sb.post("projects", {
        user_id: sb.userId,
        name,
        description: description || null,
        status: status || "planning",
        tech_stack: tech_stack || [],
        git_url: git_url || null,
        local_folder: local_folder || null,
        position,
        is_public: false,
      });
      return json({ created: row });
    },
  );

  server.registerTool(
    "add_todo",
    {
      title: "Add todo",
      description: "Add a todo to a project. Appended to the end of the todo list.",
      inputSchema: {
        project_id: z.string(),
        text: z.string().describe("Todo text"),
        priority: z.string().optional().describe("low | medium | high (default: medium)"),
      },
    },
    async ({ project_id, text, priority }) => {
      const existing = await sb.get(
        "todos",
        `?project_id=eq.${project_id}&select=position&order=position.desc&limit=1`,
      );
      const position = existing.length ? (existing[0].position || 0) + 1 : 0;
      const row = await sb.post("todos", {
        project_id,
        text,
        completed: false,
        priority: priority || "medium",
        recurring: false,
        position,
      });
      return json({ created: row });
    },
  );

  server.registerTool(
    "complete_todo",
    {
      title: "Complete todo",
      description: "Mark a todo as completed. Stamps completed_at with the current time.",
      inputSchema: {
        id: z.string().describe("Todo id (uuid)"),
      },
    },
    async ({ id }) => {
      const row = await sb.patch("todos", id, {
        completed: true,
        completed_at: new Date().toISOString(),
      });
      return json({ updated: row });
    },
  );

  server.registerTool(
    "add_note",
    {
      title: "Add note",
      description: "Add a note to a project. Appended to the end of the note list.",
      inputSchema: {
        project_id: z.string(),
        content: z.string(),
      },
    },
    async ({ project_id, content }) => {
      const existing = await sb.get(
        "notes",
        `?project_id=eq.${project_id}&select=position&order=position.desc&limit=1`,
      );
      const position = existing.length ? (existing[0].position || 0) + 1 : 0;
      const row = await sb.post("notes", { project_id, content, position });
      return json({ created: row });
    },
  );

  server.registerTool(
    "add_version",
    {
      title: "Add version",
      description: "Record a new version (release) for a project.",
      inputSchema: {
        project_id: z.string(),
        version: z.string().describe('Version string, e.g. "0.9.20"'),
        release_notes: z.string().optional(),
        date: z.string().optional().describe("ISO timestamp; defaults to now"),
      },
    },
    async ({ project_id, version, release_notes, date }) => {
      const row = await sb.post("versions", {
        project_id,
        version,
        release_notes: release_notes || null,
        date: date || new Date().toISOString(),
        file_links: [],
      });
      return json({ created: row });
    },
  );

  server.registerTool(
    "add_milestone",
    {
      title: "Add milestone",
      description: "Add a milestone to a project.",
      inputSchema: {
        project_id: z.string(),
        title: z.string(),
        description: z.string().optional(),
        date: z.string().optional().describe("Target date (ISO or YYYY-MM-DD)"),
      },
    },
    async ({ project_id, title, description, date }) => {
      const row = await sb.post("milestones", {
        project_id,
        title,
        description: description || null,
        date: date || null,
        completed: false,
      });
      return json({ created: row });
    },
  );

  server.registerTool(
    "complete_milestone",
    {
      title: "Complete milestone",
      description: "Mark a milestone as completed. Stamps completed_at with the current time.",
      inputSchema: {
        id: z.string().describe("Milestone id (uuid)"),
      },
    },
    async ({ id }) => {
      const row = await sb.patch("milestones", id, {
        completed: true,
        completed_at: new Date().toISOString(),
      });
      return json({ updated: row });
    },
  );

  server.registerTool(
    "add_daily_log",
    {
      title: "Add daily log",
      description:
        "Add a daily journal entry for a project. Defaults log_date to today (UTC) if omitted.",
      inputSchema: {
        project_id: z.string(),
        content: z.string(),
        mood: z.string().optional().describe("Mood label, e.g. great | good | meh | rough"),
        log_date: z.string().optional().describe("YYYY-MM-DD; defaults to today (UTC)"),
      },
    },
    async ({ project_id, content, mood, log_date }) => {
      const today = new Date().toISOString().slice(0, 10);
      const row = await sb.post("daily_logs", {
        project_id,
        content,
        mood: mood || null,
        log_date: log_date || today,
      });
      return json({ created: row });
    },
  );

  server.registerTool(
    "add_idea",
    {
      title: "Add idea",
      description: "Add an idea to a project's idea bank. Appended to the end of the list.",
      inputSchema: {
        project_id: z.string(),
        content: z.string(),
      },
    },
    async ({ project_id, content }) => {
      const existing = await sb.get(
        "ideas",
        `?project_id=eq.${project_id}&select=position&order=position.desc&limit=1`,
      );
      const position = existing.length ? (existing[0].position || 0) + 1 : 0;
      const row = await sb.post("ideas", {
        project_id,
        content,
        pinned: false,
        position,
      });
      return json({ created: row });
    },
  );

  server.registerTool(
    "add_workspace_idea",
    {
      title: "Add workspace idea",
      description:
        "Add an idea to the user's global workspace (the cross-project idea bank shown under Workspace > Ideas in the Qoder app). Not scoped to any project. Prepends to the list, matching the app.",
      inputSchema: {
        content: z.string().describe("Idea text"),
      },
    },
    async ({ content }) => {
      const row = await sb.getUserSettings();
      const workspace = row?.workspace_data || { notes: [], ideas: [], snippets: [] };
      const next = {
        notes: workspace.notes || [],
        ideas: workspace.ideas || [],
        snippets: workspace.snippets || [],
      };
      const idea = {
        // Match the Electron app's id shape (Date.now()+"") but add 6 random chars so
        // two MCP writes in the same millisecond don't collide.
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        content,
        pinned: false,
        createdAt: new Date().toISOString(),
      };
      next.ideas = [idea, ...next.ideas];
      await sb.upsertUserSettings({ workspace_data: next });
      return json({ created: idea });
    },
  );
}

function json(data) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}
