import { readFile, writeFile } from "node:fs/promises";

import { isValidShowdownPin } from "../../src/data/champions-data.js";

// The checked-in Showdown commit every `sync-data` run fetches from. Bumped by
// scripts/bump-showdown-pin.mjs (weekly "Bump Showdown pin" pull request).
export const SHOWDOWN_PIN_URL = new URL("../showdown-pin.json", import.meta.url);

export function parseShowdownPin(text, source = "showdown-pin.json") {
  let pin;
  try {
    pin = JSON.parse(text);
  } catch (error) {
    throw new Error(`${source} is not valid JSON: ${error.message}`, { cause: error });
  }
  if (!isValidShowdownPin(pin)) {
    throw new Error(
      `${source} must be { "repo": "owner/name", "commit": "<40-hex SHA>" }, got ${JSON.stringify(pin)}`,
    );
  }
  return { repo: pin.repo, commit: pin.commit };
}

export async function readShowdownPin(file = SHOWDOWN_PIN_URL) {
  return parseShowdownPin(await readFile(file, "utf8"), String(file));
}

export async function writeShowdownPin(pin, file = SHOWDOWN_PIN_URL) {
  const validated = parseShowdownPin(JSON.stringify(pin));
  await writeFile(file, `${JSON.stringify(validated, null, 2)}\n`);
}
