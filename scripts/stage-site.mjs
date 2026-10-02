// Stages the browser site for GitHub Pages into _site/ (or --out <dir>): the six HTML pages,
// src/, the slim catalogs in public/web/, and public/icons/. Tests, docs, MCP, scripts, agent
// skills, and the full public/*.json catalogs are deliberately not published.
import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { WEB_CATALOG_NAMES } from "../src/data/web-catalogs.js";
import { argumentValue, isMainModule } from "./lib/sync-utils.mjs";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

export async function stageSite({ root = repositoryRoot, out = join(root, "_site") } = {}) {
  const outDirectory = resolve(out);
  await rm(outDirectory, { recursive: true, force: true });
  await mkdir(outDirectory, { recursive: true });

  const pages = (await readdir(root)).filter((name) => name.endsWith(".html")).sort();
  if (pages.length === 0) throw new Error(`No HTML pages found in ${root}.`);
  for (const page of pages) await cp(join(root, page), join(outDirectory, page));

  const skipHidden = (source) => !basename(source).startsWith(".");
  await cp(join(root, "src"), join(outDirectory, "src"), { recursive: true, filter: skipHidden });
  await cp(join(root, "public", "icons"), join(outDirectory, "public", "icons"), {
    recursive: true,
    filter: (source) => skipHidden(source) && !source.endsWith(".md"),
  });
  await mkdir(join(outDirectory, "public", "web"), { recursive: true });
  for (const name of WEB_CATALOG_NAMES) {
    await cp(
      join(root, "public", "web", `${name}.json`),
      join(outDirectory, "public", "web", `${name}.json`),
    );
  }
  // Serve files as-is (no Jekyll processing on GitHub Pages).
  await writeFile(join(outDirectory, ".nojekyll"), "");

  return { out: outDirectory, pages };
}

if (isMainModule(import.meta.url)) {
  try {
    const { out, pages } = await stageSite({
      out: argumentValue(process.argv.slice(2), "--out") ?? join(repositoryRoot, "_site"),
    });
    console.log(`Staged ${pages.length} pages, src/, public/icons/, and public/web/ into ${out}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
