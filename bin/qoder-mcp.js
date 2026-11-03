#!/usr/bin/env node
import { startServer } from "../src/server.js";

startServer().catch((err) => {
  process.stderr.write(`qoder-mcp: fatal: ${err.message}\n`);
  process.exit(1);
});
