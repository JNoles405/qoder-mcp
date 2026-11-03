import { z } from "zod";

export function registerReads(server, sb) {
  server.registerTool(
    "list_projects",
    {
      title: "List projects",
      description:
        "List all Qoder projects for the signed-in user. Each row includes id, name, description, status, tech stack, and the latest version if one exists. Pass `status` to filter by lifecycle state.",
      inputSchema: {
        status: z
          .string()
          .optional()
          .describe("Filter by status: planning | in-dev | beta | released | archived"),
      },
    },
    async ({ status }) => {
      let q = `?user_id=eq.${sb.userId}&order=position.asc`;
      if (status) q += `&status=eq.${encodeURIComponent(status)}`;
      const rows = await sb.get("projects", q);
      if (rows.length === 0) return json([]);

      const ids = rows.map((r) => r.id).join(",");
      const versions = await sb
        .get("versions", `?project_id=in.(${ids})&order=date.desc`)
        .catch(() => []);
      const latest = new Map();
      for (const v of versions) {
        if (!latest.has(v.project_id)) latest.set(v.project_id, v);
      }

      const out = rows.map((r) => {
        const v = latest.get(r.id);
        return {
          id: r.id,
          name: r.name,
          description: r.description,
          status: r.status,
          tech_stack: r.tech_stack || [],
          git_url: r.git_url || null,
          latest_version: v ? v.version : null,
          latest_version_date: v ? v.date : null,
          created_at: r.created_at,
        };
      });
      return json(out);
    },
  );

  server.registerTool(
    "get_project",
    {
      title: "Get project",
      description:
        "Fetch one project by id with its children: versions, milestones, todos, notes, issues, ideas, concepts, daily logs.",
      inputSchema: {
        id: z.string().describe("Project id (uuid)"),
      },
    },
    async ({ id }) => {
      const projects = await sb.get("projects", `?id=eq.${id}&user_id=eq.${sb.userId}`);
      if (!projects.length) return text(`No project with id ${id} for the signed-in user.`);
      const p = projects[0];
      const scope = `project_id=eq.${id}`;
      const [versions, milestones, todos, notes, issues, ideas, concepts, dailyLogs] =
        await Promise.all([
          sb.get("versions", `?${scope}&order=date.desc`).catch(() => []),
          sb.get("milestones", `?${scope}&order=created_at.asc`).catch(() => []),
          sb.get("todos", `?${scope}&order=position.asc`).catch(() => []),
          sb.get("notes", `?${scope}&order=position.asc`).catch(() => []),
          sb.get("issues", `?${scope}&order=created_at.desc`).catch(() => []),
          sb.get("ideas", `?${scope}&order=position.asc`).catch(() => []),
          sb.get("concepts", `?${scope}&order=created_at.desc`).catch(() => []),
          sb.get("daily_logs", `?${scope}&order=log_date.desc`).catch(() => []),
        ]);
      return json({
        ...p,
        versions,
        milestones,
        todos,
        notes,
        issues,
        ideas,
        concepts,
        daily_logs: dailyLogs,
      });
    },
  );

  server.registerTool(
    "list_todos",
    {
      title: "List todos",
      description:
        "List todos. Pass `project_id` to scope to one project, otherwise returns todos across every project you own. Pass `completed` to filter by state.",
      inputSchema: {
        project_id: z.string().optional().describe("Scope to one project; omit for all"),
        completed: z
          .boolean()
          .optional()
          .describe("true = completed only, false = open only, omit = both"),
      },
    },
    async ({ project_id, completed }) => {
      const filters = [];
      if (project_id) {
        filters.push(`project_id=eq.${project_id}`);
      } else {
        const projs = await sb.get("projects", `?user_id=eq.${sb.userId}&select=id`);
        const ids = projs.map((p) => p.id).join(",");
        if (!ids) return json([]);
        filters.push(`project_id=in.(${ids})`);
      }
      if (completed !== undefined) filters.push(`completed=eq.${completed}`);
      filters.push("order=position.asc");
      const rows = await sb.get("todos", `?${filters.join("&")}`);
      return json(rows);
    },
  );

  server.registerTool(
    "list_issues",
    {
      title: "List issues",
      description:
        "List issues (bugs / feature requests). Pass `project_id` to scope to one project, otherwise returns issues across every project you own. Pass `status` to filter.",
      inputSchema: {
        project_id: z.string().optional(),
        status: z.string().optional().describe("Filter: open | fixed | wontfix"),
      },
    },
    async ({ project_id, status }) => {
      const filters = [];
      if (project_id) {
        filters.push(`project_id=eq.${project_id}`);
      } else {
        const projs = await sb.get("projects", `?user_id=eq.${sb.userId}&select=id`);
        const ids = projs.map((p) => p.id).join(",");
        if (!ids) return json([]);
        filters.push(`project_id=in.(${ids})`);
      }
      if (status) filters.push(`status=eq.${encodeURIComponent(status)}`);
      filters.push("order=created_at.desc");
      const rows = await sb.get("issues", `?${filters.join("&")}`);
      return json(rows);
    },
  );

  server.registerTool(
    "list_versions",
    {
      title: "List versions",
      description:
        "List release-history entries. Pass `project_id` to scope to one project, otherwise returns versions across every project you own, newest first.",
      inputSchema: {
        project_id: z.string().optional(),
      },
    },
    async ({ project_id }) => {
      if (project_id) {
        const rows = await sb.get(
          "versions",
          `?project_id=eq.${project_id}&order=date.desc`,
        );
        return json(rows);
      }
      const projs = await sb.get("projects", `?user_id=eq.${sb.userId}&select=id,name`);
      const ids = projs.map((p) => p.id).join(",");
      if (!ids) return json([]);
      const rows = await sb.get("versions", `?project_id=in.(${ids})&order=date.desc`);
      const nameFor = new Map(projs.map((p) => [p.id, p.name]));
      const enriched = rows.map((v) => ({ ...v, project_name: nameFor.get(v.project_id) }));
      return json(enriched);
    },
  );

  server.registerTool(
    "search_content",
    {
      title: "Search content",
      description:
        "Case-insensitive substring search across notes, ideas, concepts, and daily logs. Returns up to 50 matches with the project name they belong to.",
      inputSchema: {
        query: z.string().describe("Text to search for"),
      },
    },
    async ({ query }) => {
      // Escape PostgREST ilike wildcards (`*` and `%`) that would otherwise widen the match.
      const safe = query.replace(/[*%\\]/g, "\\$&");
      const projs = await sb.get("projects", `?user_id=eq.${sb.userId}&select=id,name`);
      const ids = projs.map((p) => p.id).join(",");
      if (!ids) return json({ query, matches: [] });
      const scope = `project_id=in.(${ids})`;
      const needle = `ilike.*${encodeURIComponent(safe)}*`;
      const [notes, ideas, concepts, logs] = await Promise.all([
        sb.get("notes", `?${scope}&content=${needle}&limit=50`).catch(() => []),
        sb.get("ideas", `?${scope}&content=${needle}&limit=50`).catch(() => []),
        sb.get("concepts", `?${scope}&content=${needle}&limit=50`).catch(() => []),
        sb.get("daily_logs", `?${scope}&content=${needle}&limit=50`).catch(() => []),
      ]);
      const nameFor = new Map(projs.map((p) => [p.id, p.name]));
      const matches = [
        ...notes.map((n) => ({
          type: "note",
          project: nameFor.get(n.project_id),
          id: n.id,
          content: n.content,
          created_at: n.created_at,
        })),
        ...ideas.map((d) => ({
          type: "idea",
          project: nameFor.get(d.project_id),
          id: d.id,
          content: d.content,
          created_at: d.created_at,
        })),
        ...concepts.map((c) => ({
          type: "concept",
          project: nameFor.get(c.project_id),
          id: c.id,
          label: c.label,
          content: c.content,
          created_at: c.created_at,
        })),
        ...logs.map((l) => ({
          type: "daily_log",
          project: nameFor.get(l.project_id),
          id: l.id,
          content: l.content,
          log_date: l.log_date,
          mood: l.mood,
          created_at: l.created_at,
        })),
      ].slice(0, 50);
      return json({ query, matches });
    },
  );

  server.registerTool(
    "list_workspace_ideas",
    {
      title: "List workspace ideas",
      description:
        "List ideas in the user's global workspace (the cross-project idea bank shown under Workspace > Ideas in the Qoder app). Not scoped to any project. Newest first, matching the app.",
      inputSchema: {},
    },
    async () => {
      const row = await sb.getUserSettings();
      const ideas = row?.workspace_data?.ideas || [];
      return json(ideas);
    },
  );

  server.registerTool(
    "list_daily_logs",
    {
      title: "List daily logs",
      description:
        "List daily journal entries. Pass `project_id` to scope to one project, otherwise returns entries across every project. Newest first.",
      inputSchema: {
        project_id: z.string().optional(),
        limit: z.number().int().positive().max(500).optional().describe("Default 100"),
      },
    },
    async ({ project_id, limit }) => {
      const take = limit || 100;
      if (project_id) {
        const rows = await sb.get(
          "daily_logs",
          `?project_id=eq.${project_id}&order=log_date.desc&limit=${take}`,
        );
        return json(rows);
      }
      const projs = await sb.get("projects", `?user_id=eq.${sb.userId}&select=id,name`);
      const ids = projs.map((p) => p.id).join(",");
      if (!ids) return json([]);
      const rows = await sb.get(
        "daily_logs",
        `?project_id=in.(${ids})&order=log_date.desc&limit=${take}`,
      );
      const nameFor = new Map(projs.map((p) => [p.id, p.name]));
      return json(rows.map((l) => ({ ...l, project_name: nameFor.get(l.project_id) })));
    },
  );
}

function text(t) {
  return { content: [{ type: "text", text: t }] };
}
function json(data) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}
