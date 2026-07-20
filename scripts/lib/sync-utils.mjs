import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export function argumentValue(argv, flag) {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

export function isMainModule(moduleUrl, argv = process.argv) {
  return Boolean(argv[1]) && moduleUrl === pathToFileURL(argv[1]).href;
}

export async function readJson(directory, name) {
  return JSON.parse(await readFile(new URL(`${name}.json`, directory), "utf8"));
}

export async function writeJson(directory, name, data) {
  await mkdir(directory, { recursive: true });
  await writeFile(new URL(`${name}.json`, directory), formattedJson(data));
}

export async function writeJsonEntries(directory, entries) {
  await mkdir(directory, { recursive: true });
  await Promise.all(
    Object.entries(entries).map(([name, data]) =>
      writeFile(new URL(`${name}.json`, directory), formattedJson(data)),
    ),
  );
}

function formattedJson(data) {
  return `${JSON.stringify(data, null, 2)}\n`;
}
