import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createStaticServer, isInside, resolveRequestPath } from "../scripts/serve.mjs";

async function withServer(run) {
  const parent = await mkdtemp(join(tmpdir(), "pokecal-serve-"));
  const root = join(parent, "root");
  const sibling = join(parent, "root-x");
  await mkdir(join(root, "public"), { recursive: true });
  await mkdir(sibling, { recursive: true });
  await writeFile(join(root, "index.html"), "<!doctype html><title>home</title>");
  await writeFile(join(root, "public", "data.json"), '{"ok":true}');
  await writeFile(join(root, ".env"), "SECRET=1");
  await writeFile(join(sibling, "secret.txt"), "sibling secret");
  await symlink(join(sibling, "secret.txt"), join(root, "link.txt"));

  const server = createStaticServer({ root });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const get = (path, { method = "GET", headers = {} } = {}) =>
    new Promise((resolve, reject) => {
      const req = request({ host: "127.0.0.1", port, path, method, headers }, (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => (body += chunk));
        response.on("end", () => resolve({ status: response.statusCode, headers: response.headers, body }));
      });
      req.on("error", reject);
      req.end();
    });
  try {
    await run(get);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(parent, { recursive: true, force: true });
  }
}

test("serves files with content types and caching validators", async () => {
  await withServer(async (get) => {
    const home = await get("/");
    assert.equal(home.status, 200);
    assert.match(home.headers["content-type"], /text\/html/);
    assert.match(home.body, /home/);

    const data = await get("/public/data.json");
    assert.equal(data.status, 200);
    assert.match(data.headers["content-type"], /application\/json/);
    assert.ok(data.headers.etag);
    assert.ok(data.headers["last-modified"]);
    assert.equal(data.headers["cache-control"], "no-cache");

    const byTag = await get("/public/data.json", { headers: { "If-None-Match": data.headers.etag } });
    assert.equal(byTag.status, 304);
    assert.equal(byTag.body, "");
    const byDate = await get("/public/data.json", {
      headers: { "If-Modified-Since": data.headers["last-modified"] },
    });
    assert.equal(byDate.status, 304);
    const stale = await get("/public/data.json", { headers: { "If-None-Match": 'W/"0-0"' } });
    assert.equal(stale.status, 200);

    const head = await get("/public/data.json", { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(head.body, "");
  });
});

test("blocks sibling-directory traversal, dotfiles, and symlink escapes", async () => {
  await withServer(async (get) => {
    for (const path of [
      "/..%2froot-x/secret.txt",
      "/%2e%2e/root-x/secret.txt",
      "/..%5croot-x%5csecret.txt",
      "/public/..%2f..%2froot-x/secret.txt",
      "/.env",
      "/public/%2eenv",
      "/link.txt",
      "/missing.html",
      "/public",
    ]) {
      const response = await get(path);
      assert.equal(response.status, 404, path);
      assert.doesNotMatch(response.body, /secret|SECRET/, path);
    }
  });
});

test("answers malformed escapes with 400 and keeps serving", async () => {
  await withServer(async (get) => {
    assert.equal((await get("/%E0%A4%A")).status, 400);
    assert.equal((await get("/%")).status, 400);
    assert.equal((await get("/a%00b")).status, 400);
    assert.equal((await get("/", { method: "POST" })).status, 405);
    assert.equal((await get("/")).status, 200);
  });
});

test("resolves request paths only inside the root", () => {
  assert.equal(resolveRequestPath("/srv/root", "/..%2froot-x/a").status, 404);
  assert.equal(resolveRequestPath("/srv/root", "/%").status, 400);
  assert.equal(resolveRequestPath("/srv/root", "/").filePath, "/srv/root/index.html");
  assert.equal(isInside("/srv/root", "/srv/root-x/a"), false);
  assert.equal(isInside("/srv/root", "/srv/root/a/..b"), true);
});
