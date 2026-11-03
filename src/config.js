// Read Supabase + credentials from env vars and validate up front.
// Nothing here reads disk or files — Claude Desktop and other MCP clients
// pass credentials through the server's env block, which is the only
// supported configuration surface.

const REQUIRED = [
  "QODER_SUPABASE_URL",
  "QODER_SUPABASE_ANON_KEY",
  "QODER_EMAIL",
  "QODER_PASSWORD",
];

export function loadConfig() {
  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(
      `qoder-mcp: missing required environment variables: ${missing.join(", ")}. ` +
        `Set them in your Claude Desktop / MCP client config under the server's "env" block. ` +
        `See the README for examples.`,
    );
  }
  // Strip trailing slashes so we can concatenate with "/rest/v1/..." safely.
  const url = process.env.QODER_SUPABASE_URL.replace(/\/+$/, "");
  return {
    url,
    key: process.env.QODER_SUPABASE_ANON_KEY,
    email: process.env.QODER_EMAIL,
    password: process.env.QODER_PASSWORD,
  };
}
