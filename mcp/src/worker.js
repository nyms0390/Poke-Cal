import { createMcpHandler } from "agents/mcp/server";

import { loadCatalogs } from "./catalogs.js";
import { createToolServer } from "./tools.js";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

export function createWorker(env, { catalogLoader = loadCatalogs } = {}) {
  const mcpHandler = createMcpHandler(
    async () => createToolServer(await catalogLoader(env)),
    { route: "/mcp", legacy: "stateless", responseMode: "json" },
  );
  return {
    async fetch(request, runtimeEnv = env, ctx) {
      const url = new URL(request.url);
      if (url.pathname === "/health" && request.method === "GET") {
        return Response.json({ service: "pokecal-mcp", status: "ok" }, { headers: JSON_HEADERS });
      }
      if (url.pathname === "/mcp") return mcpHandler(request, runtimeEnv, ctx);
      return Response.json({ error: "Not found" }, { status: 404, headers: JSON_HEADERS });
    },
  };
}

const worker = {
  fetch(request, env, ctx) {
    return createWorker(env).fetch(request, env, ctx);
  },
};

export default worker;
