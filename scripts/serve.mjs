// Minimal dependency-free static server for local development (and the Playwright smoke check).
// Serves files under `root` only: path.relative containment (after resolving symlinks), no
// dotfiles, 400 on malformed percent-encoding, GET/HEAD only, ETag/Last-Modified with 304
// revalidation, and stream errors handled without crashing the process.
import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

export const CONTENT_TYPES = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
});

// Resolves a request pathname to a file path inside `root`, or returns an HTTP status code.
export function resolveRequestPath(root, rawPathname) {
  let pathname;
  try {
    pathname = decodeURIComponent(rawPathname);
  } catch {
    return { status: 400 };
  }
  if (pathname.includes("\0")) return { status: 400 };

  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const segments = relativePath.split(/[\\/]+/).filter(Boolean);
  if (segments.some((segment) => segment.startsWith("."))) return { status: 404 };

  const filePath = resolve(root, ...segments);
  if (!isInside(root, filePath)) return { status: 404 };
  return { filePath };
}

export function isInside(root, filePath) {
  const relativePath = relative(root, filePath);
  return (
    relativePath === "" ||
    (!relativePath.startsWith(`..${sep}`) && relativePath !== ".." && !isAbsolute(relativePath))
  );
}

export function entityTag(stats) {
  return `W/"${stats.size.toString(16)}-${Math.floor(stats.mtimeMs).toString(16)}"`;
}

export function isNotModified(request, stats, etag) {
  const ifNoneMatch = request.headers["if-none-match"];
  if (ifNoneMatch) {
    return ifNoneMatch
      .split(",")
      .map((tag) => tag.trim())
      .some((tag) => tag === "*" || tag === etag || tag.replace(/^W\//, "") === etag.replace(/^W\//, ""));
  }
  const ifModifiedSince = Date.parse(request.headers["if-modified-since"] ?? "");
  return Number.isFinite(ifModifiedSince) && Math.floor(stats.mtimeMs / 1000) * 1000 <= ifModifiedSince;
}

export function createStaticServer({ root = process.cwd() } = {}) {
  const rootPath = resolve(root);
  let realRootPromise;
  const realRoot = () => (realRootPromise ??= realpath(rootPath));

  return createServer((request, response) => {
    handleRequest(request, response).catch((error) => {
      console.error(error);
      sendStatus(response, 500);
    });
  });

  async function handleRequest(request, response) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.setHeader("Allow", "GET, HEAD");
      sendStatus(response, 405);
      return;
    }

    let pathname;
    try {
      pathname = new URL(request.url, "http://localhost").pathname;
    } catch {
      sendStatus(response, 400);
      return;
    }

    const resolved = resolveRequestPath(rootPath, pathname);
    if (resolved.status) {
      sendStatus(response, resolved.status);
      return;
    }

    let filePath;
    let stats;
    try {
      // Resolve symlinks so a link inside root cannot expose files outside it.
      filePath = await realpath(resolved.filePath);
      if (!isInside(await realRoot(), filePath)) {
        sendStatus(response, 404);
        return;
      }
      stats = await stat(filePath);
    } catch {
      sendStatus(response, 404);
      return;
    }
    if (!stats.isFile()) {
      sendStatus(response, 404);
      return;
    }

    const etag = entityTag(stats);
    const headers = {
      "Cache-Control": "no-cache",
      ETag: etag,
      "Last-Modified": new Date(stats.mtimeMs).toUTCString(),
      "X-Content-Type-Options": "nosniff",
    };
    if (isNotModified(request, stats, etag)) {
      response.writeHead(304, headers);
      response.end();
      return;
    }

    response.writeHead(200, {
      ...headers,
      "Content-Type": CONTENT_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream",
      "Content-Length": stats.size,
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }

    const stream = createReadStream(filePath);
    stream.on("error", (error) => {
      console.error(`Failed to read ${filePath}: ${error.message}`);
      response.destroy(error);
    });
    response.on("close", () => stream.destroy());
    stream.pipe(response);
  }
}

function sendStatus(response, status) {
  if (response.headersSent) {
    response.destroy();
    return;
  }
  const messages = { 400: "Bad request", 404: "Not found", 405: "Method not allowed", 500: "Server error" };
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(messages[status] ?? String(status));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 4173);
  const root = resolve(process.env.SERVE_ROOT ?? process.cwd());
  createStaticServer({ root }).listen(port, "127.0.0.1", () => {
    console.log(`PokéCal running at http://127.0.0.1:${port} (serving ${root})`);
  });
}
