import { createMcpHandler } from "agents/mcp/server";

import { loadCatalogs } from "./catalogs.js";
import { createToolServer } from "./tools.js";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

export function createWorker(env, { catalogLoader = loadCatalogs } = {}) {
  const mcpHandler = createMcpHandler(
    async () => createToolServer(await catalogLoader(env)),
    { route: "/mcp", legacy: "stateless" },
  );
  return {
    async fetch(request, runtimeEnv = env, ctx) {
      const url = new URL(request.url);
      if (url.pathname === "/health" && request.method === "GET") {
        return Response.json({ service: "pokecal-mcp", status: "ok" }, { headers: JSON_HEADERS });
      }
      if (url.pathname === "/mcp") {
        if (request.method !== "OPTIONS") {
          // Cloudflare sets CF-Connecting-IP on every request from the internet (wrangler dev
          // sets it too). Refuse rather than pool header-less callers into one shared bucket,
          // where one client could use up everyone else's limit.
          const clientIp = request.headers.get("cf-connecting-ip");
          if (!clientIp) {
            return Response.json({ error: "Missing client address" }, { status: 400, headers: JSON_HEADERS });
          }
          const { success } = await runtimeEnv.MCP_RATE_LIMITER.limit({ key: clientIp });
          if (!success) {
            return Response.json(
              { error: "Rate limit exceeded" },
              {
                status: 429,
                headers: {
                  ...JSON_HEADERS,
                  "retry-after": "60",
                  "access-control-allow-origin": "*",
                  "access-control-expose-headers": "Retry-After",
                },
              },
            );
          }
        }
        return mcpHandler(request, runtimeEnv, ctx);
      }
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
