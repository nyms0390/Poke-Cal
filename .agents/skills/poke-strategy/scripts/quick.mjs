import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  calculateDamageMatchup,
  checkSurvival,
  compareSpeed,
  createStrategyContext,
  parseBooleanOption,
} from "../../../../src/data/strategy-tools.js";

const DATA_URL = new URL("../../../../public/", import.meta.url);

export { calculateDamageMatchup, checkSurvival, compareSpeed, createStrategyContext };

export async function loadQuickContext(dataUrl = DATA_URL) {
  const [pokemon, abilities, moves, items] = await Promise.all(
    ["pokemon", "abilities", "moves", "items"].map(async (name) =>
      JSON.parse(await readFile(new URL(`${name}.json`, dataUrl), "utf8"))),
  );
  return createStrategyContext({ pokemon, abilities, moves, items });
}

export async function runCli(argv = process.argv.slice(2)) {
  const [command, ...rawOptions] = argv;
  const options = parseOptions(rawOptions);
  const context = await loadQuickContext();
  let result;
  if (command === "speed") {
    result = compareSpeed(context, options);
  } else if (command === "survive") {
    result = checkSurvival(context, options);
  } else {
    throw new Error("Usage: quick.mjs speed|survive [--option value]");
  }

  process.stdout.write(parseBooleanOption(options.json, "json") ? `${JSON.stringify(result)}\n` : `${result.summary}\n`);
  return result;
}

// `--flag` alone is true; `--flag value` keeps the string, and boolean options are parsed by
// parseBooleanOption in strategy-tools ("false"/"0"/"no"/"off" -> false).
export function parseOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      options[key] = true;
    } else {
      options[key] = value;
      index += 1;
    }
  }
  return options;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  runCli().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
