import { spawnSync } from "node:child_process";

import { normalizeId } from "../identifiers.js";

// Showdown data files are TypeScript modules fetched from upstream `master`, so parsing them means
// executing third-party code. `vm` is not a security boundary (a `this.constructor.constructor`
// escape reaches the host `process`), so the code runs in a short-lived child Node process that:
//   - is started with Node's permission model (`--permission`, or `--experimental-permission` on
//     older Node), granting no file-system read/write, child-process, worker, addon, or WASI access;
//   - gets an empty environment (no tokens or other secrets to read);
//   - evaluates inside a null-prototype vm context with string code generation disabled, so the
//     classic escape payload finds no host constructor to climb;
//   - receives the source on stdin and returns plain JSON on stdout.
// Functions are dropped (as `extractCatalogEntries`/the Champions overlay already did) while
// `undefined` values are preserved, so legitimate data parses exactly as before.
const SANDBOX_TIMEOUT_MS = 5000;
const SANDBOX_MAX_BUFFER = 512 * 1024 * 1024;
const UNDEFINED_MARKER = "\u0000pokecal:undefined";
const NON_FINITE_PREFIX = "\u0000pokecal:number:";

const SANDBOX_CHILD_SOURCE = `"use strict";
const vm = require("node:vm");
const UNDEFINED_MARKER = ${JSON.stringify(UNDEFINED_MARKER)};
const NON_FINITE_PREFIX = ${JSON.stringify(NON_FINITE_PREFIX)};
const chunks = [];
process.stdin.on("data", (chunk) => chunks.push(chunk));
process.stdin.on("end", () => {
  let output;
  try {
    const request = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const context = vm.createContext(Object.create(null), {
      codeGeneration: { strings: false, wasm: false },
    });
    // Test-only: hand the host process to the context to simulate a successful vm escape and
    // prove the permission model still contains it.
    if (request.simulateSandboxEscape) context.process = process;
    vm.runInContext("var exports = {};", context);
    vm.runInContext(request.code, context, { timeout: request.timeoutMs });
    const value = context.exports[request.exportName];
    const json = JSON.stringify({ ok: true, value }, (key, item) => {
      if (item === undefined) return UNDEFINED_MARKER;
      if (typeof item === "function" || typeof item === "symbol") return undefined;
      if (typeof item === "bigint") return Number(item);
      if (typeof item === "number" && !Number.isFinite(item)) return NON_FINITE_PREFIX + String(item);
      return item;
    });
    output = json;
  } catch (error) {
    output = JSON.stringify({ ok: false, error: String(error && error.message || error) });
  }
  process.stdout.write(output, () => process.exit(0));
});
`;

export function parseShowdownExport(source, exportName) {
  const declaration = new RegExp(`export const ${exportName}: [^=]+ =`);
  const executableSource = stripTypeAssertions(source).replace(
    declaration,
    `exports.${exportName} =`,
  );
  const value = evaluateInSandbox(executableSource, exportName);
  if (!value || typeof value !== "object") {
    throw new Error(`Pokémon Showdown data did not expose ${exportName}.`);
  }
  return value;
}

// Runs `code` (plain JavaScript assigning `exports[exportName]`) in the restricted child process
// described above and returns the JSON-safe export. `simulateSandboxEscape` exists only for the
// security tests.
export function evaluateInSandbox(
  code,
  exportName,
  { timeoutMs = SANDBOX_TIMEOUT_MS, simulateSandboxEscape = false } = {},
) {
  const result = spawnSync(
    process.execPath,
    [permissionFlag(), "--no-warnings", "-e", SANDBOX_CHILD_SOURCE],
    {
      input: JSON.stringify({ code, exportName, timeoutMs, simulateSandboxEscape }),
      env: {},
      encoding: "utf8",
      maxBuffer: SANDBOX_MAX_BUFFER,
      timeout: timeoutMs + 30_000,
      windowsHide: true,
    },
  );
  if (result.error) {
    throw new Error(`Showdown data sandbox failed: ${result.error.message}`);
  }

  let response;
  try {
    response = JSON.parse(result.stdout);
  } catch {
    const detail = String(result.stderr ?? "").trim().split("\n").slice(-3).join(" ");
    throw new Error(
      `Showdown data sandbox exited with ${result.status ?? result.signal}` +
        (detail ? `: ${detail}` : "."),
    );
  }
  if (!response?.ok) {
    throw new Error(`Pokémon Showdown data for ${exportName} failed to evaluate: ${response?.error}`);
  }
  return reviveSandboxValue(response.value);
}

let cachedPermissionFlag;

export function permissionFlag(flags = process.allowedNodeEnvironmentFlags) {
  if (cachedPermissionFlag && flags === process.allowedNodeEnvironmentFlags) {
    return cachedPermissionFlag;
  }
  let flag;
  if (flags.has("--permission")) flag = "--permission";
  else if (flags.has("--experimental-permission")) flag = "--experimental-permission";
  else {
    throw new Error(
      "This Node.js version has no permission model; Node.js 22 or newer is required to parse " +
        "Pokémon Showdown data safely.",
    );
  }
  if (flags === process.allowedNodeEnvironmentFlags) cachedPermissionFlag = flag;
  return flag;
}

function reviveSandboxValue(value) {
  if (typeof value === "string") {
    if (value === UNDEFINED_MARKER) return undefined;
    if (value.startsWith(NON_FINITE_PREFIX)) return Number(value.slice(NON_FINITE_PREFIX.length));
    return value;
  }
  if (Array.isArray(value)) return value.map(reviveSandboxValue);
  if (!value || typeof value !== "object") return value;
  // Object.fromEntries defines own properties, so a `__proto__` key stays plain data.
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, reviveSandboxValue(child)]),
  );
}

export function extractAbilities(entry, { megaOnly = /-Mega(?:-|$)/i.test(entry.name ?? "") } = {}) {
  const abilities = megaOnly && entry.abilities?.[0] ? [entry.abilities[0]] : Object.values(entry.abilities ?? {});
  return [...new Set(abilities)].sort((a, b) =>
    a.localeCompare(b),
  );
}

export function extractLearnsetMoves(learnsets, id, baseSpecies) {
  const learnsetEntry = learnsets[id]?.learnset
    ? learnsets[id]
    : learnsets[normalizeId(baseSpecies)];
  return Object.keys(learnsetEntry?.learnset ?? {}).sort((a, b) => a.localeCompare(b));
}

export function extractCatalogEntries(table, textTable = {}) {
  return Object.entries(table)
    .map(([id, entry]) => ({
      id,
      ...toSerializableValue(entry),
      ...toSerializableValue(textTable[id] ?? {}),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function stripTypeAssertions(source) {
  source = source.replace(
    /(?<!export\s)\b(let|const|var)\s+([A-Za-z_$][\w$]*)\s*:\s*[^=;]+(?=[=;])/g,
    "$1 $2",
  );
  source = source.replace(/([A-Za-z0-9_$\]\)])!(?=\s*[.\[<>=,);\]+\-*/%])/g, "$1");
  source = stripParameterTypes(source);

  let output = "";
  let index = 0;

  while (index < source.length) {
    if (source.startsWith(" as ", index)) {
      const typeEnd = findTypeAssertionEnd(source, index + 4);
      if (typeEnd > index + 4) {
        index = typeEnd;
        continue;
      }
    }

    const character = source[index];
    if (character === '"' || character === "'" || character === "`") {
      const end = copyQuoted(source, index, character);
      output += source.slice(index, end);
      index = end;
    } else if (source.startsWith("//", index)) {
      const end = source.indexOf("\n", index + 2);
      const commentEnd = end === -1 ? source.length : end;
      output += source.slice(index, commentEnd);
      index = commentEnd;
    } else if (source.startsWith("/*", index)) {
      const end = source.indexOf("*/", index + 2);
      const commentEnd = end === -1 ? source.length : end + 2;
      output += source.slice(index, commentEnd);
      index = commentEnd;
    } else {
      output += character;
      index += 1;
    }
  }

  return output;
}

export function stripParameterTypes(source) {
  let output = "";
  let index = 0;

  while (index < source.length) {
    const character = source[index];
    if (character === '"' || character === "'" || character === "`") {
      const end = copyQuoted(source, index, character);
      output += source.slice(index, end);
      index = end;
    } else if (source.startsWith("//", index)) {
      const end = source.indexOf("\n", index + 2);
      const commentEnd = end === -1 ? source.length : end;
      output += source.slice(index, commentEnd);
      index = commentEnd;
    } else if (source.startsWith("/*", index)) {
      const end = source.indexOf("*/", index + 2);
      const commentEnd = end === -1 ? source.length : end + 2;
      output += source.slice(index, commentEnd);
      index = commentEnd;
    } else if (character === "(" && isFunctionParameterList(source, index, output)) {
      const end = consumeBalancedParens(source, index);
      output += stripTypesFromParameterList(source.slice(index, end));
      index = end;
    } else {
      output += character;
      index += 1;
    }
  }

  return output;
}

function toSerializableValue(value) {
  if (Array.isArray(value)) return value.map(toSerializableValue);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, childValue]) => typeof childValue !== "function")
      .map(([key, childValue]) => [key, toSerializableValue(childValue)]),
  );
}

function copyQuoted(source, start, quote) {
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === "\\") {
      index += 2;
    } else if (source[index] === quote) {
      return index + 1;
    } else {
      index += 1;
    }
  }
  return source.length;
}

function findTypeAssertionEnd(source, start) {
  let index = start;
  if (source[index] === "(") {
    index = consumeBalancedParens(source, index);
    while (/\s/.test(source[index] ?? "")) index += 1;
    if (!source.startsWith("=>", index)) return start;
    index += 2;
  }

  while (index < source.length && !/[).,;}]/.test(source[index])) {
    index += 1;
  }
  return index;
}

function consumeBalancedParens(source, start) {
  let depth = 0;
  let index = start;

  while (index < source.length) {
    const character = source[index];
    if (character === '"' || character === "'" || character === "`") {
      index = copyQuoted(source, index, character);
    } else if (character === "(") {
      depth += 1;
      index += 1;
    } else if (character === ")") {
      depth -= 1;
      index += 1;
      if (depth === 0) return index;
    } else {
      index += 1;
    }
  }

  return index;
}

function isFunctionParameterList(source, index, output) {
  const prefix = output.trimEnd();
  if (/\b(if|for|while|switch|catch)$/.test(prefix)) return false;
  if (/\bfunction\s*[A-Za-z_$\w$]*$/.test(prefix)) return true;
  if (/[A-Za-z_$][\w$]*$/.test(prefix)) {
    const parameterEnd = consumeBalancedParens(source, index);
    const suffix = source.slice(parameterEnd).trimStart();
    return suffix.startsWith("{");
  }
  return false;
}

function stripTypesFromParameterList(parameters) {
  return parameters.replace(
    /([,(]\s*[A-Za-z_$][\w$]*)\s*:\s*[^,)=]+(?=[,)])/g,
    "$1",
  );
}
