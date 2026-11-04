// Builds public/fonts/pokecal-names.woff2, the font the My teams screenshot reader draws names
// with (src/ui/team-screen-text.js). It is Noto Sans TC Regular (SIL Open Font License, see
// public/fonts/OFL.txt) cut down to the characters in move, item and ability names, Chinese and
// English, so every device draws the same shapes the reader is tested with.
//
// Re-run when `npm test` reports names with characters the font lacks (after a data update):
//   python3 -m pip install fonttools brotli
//   node scripts/build-name-font.mjs
// Needs network access to fonts.googleapis.com and fonts.gstatic.com.
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const FAMILY = "Noto Sans TC";
const WEIGHT = 400;

// Every character the reader may draw: Chinese and English names, plus digits and the Latin and
// full-width X and Y of Mega Stones.
export async function nameFontCharacters(rootDirectory = root) {
  const characters = new Set("0123456789XYＸＹ");
  for (const name of ["moves", "items", "abilities"]) {
    const entries = JSON.parse(await readFile(join(rootDirectory, "public", "web", `${name}.json`), "utf8"));
    for (const entry of entries) {
      for (const text of [entry.name, ...(entry.aliases ?? []).filter((a) => /[㐀-鿿]/.test(a))]) {
        for (const c of text) if (c.trim()) characters.add(c);
      }
    }
  }
  return [...characters].sort().join("");
}

async function main() {
  const characters = await nameFontCharacters();
  const work = await mkdtemp(join(tmpdir(), "pokecal-font-"));
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(FAMILY)}:wght@${WEIGHT}`, {
    headers: { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) Chrome/120" },
  })).text();
  // The full font comes in unicode-range slices; fetch them all and subset each into one font.
  const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1]);
  if (!urls.length) throw new Error("No font URLs in the Google Fonts CSS.");
  const full = join(work, "full.ttf");
  if (urls.length === 1) {
    await writeFile(full, Buffer.from(await (await fetch(urls[0])).arrayBuffer()));
  } else {
    const parts = [];
    for (const [i, url] of urls.entries()) {
      const part = join(work, `part${i}.woff2`);
      await writeFile(part, Buffer.from(await (await fetch(url)).arrayBuffer()));
      parts.push(part);
    }
    execFileSync("python3", ["-m", "fontTools.merge", "--output-file", full, ...parts], { stdio: "inherit" });
  }
  const textFile = join(work, "chars.txt");
  await writeFile(textFile, characters);
  execFileSync("python3", [
    "-m", "fontTools.subset", full,
    `--text-file=${textFile}`,
    "--flavor=woff2",
    "--layout-features=*",
    `--output-file=${join(root, "public", "fonts", "pokecal-names.woff2")}`,
  ], { stdio: "inherit" });
  await writeFile(join(root, "public", "fonts", "pokecal-names.chars.txt"), `${characters}\n`);
  console.log(`Wrote public/fonts/pokecal-names.woff2 with ${[...characters].length} characters.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
