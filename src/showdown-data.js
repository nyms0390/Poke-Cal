import vm from "node:vm";

export function parseShowdownExport(source, exportName) {
  const declaration = new RegExp(`export const ${exportName}: [^=]+ =`);
  const executableSource = stripTypeAssertions(source).replace(
    declaration,
    `exports.${exportName} =`,
  );
  const sandbox = { exports: {} };
  vm.runInNewContext(executableSource, sandbox, { timeout: 5000 });

  const value = sandbox.exports[exportName];
  if (!value || typeof value !== "object") {
    throw new Error(`Pokémon Showdown data did not expose ${exportName}.`);
  }
  return value;
}

export function extractAbilities(entry) {
  return [...new Set(Object.values(entry.abilities ?? {}))].sort((a, b) =>
    a.localeCompare(b),
  );
}

export function extractLearnsetMoves(learnsets, id, baseSpecies) {
  const learnsetEntry = learnsets[id]?.learnset
    ? learnsets[id]
    : learnsets[toId(baseSpecies)];
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

export function normalizeChaosUsageStats(chaos, { month, format }) {
  const pokemon = {};

  for (const [name, entry] of Object.entries(chaos?.data ?? {})) {
    const rawCount = entry["Raw count"] ?? entry.rawCount ?? entry.raw;
    pokemon[toId(name)] = {
      usagePercent: toUsagePercent(entry.usage ?? entry.Usage ?? 0),
      abilities: normalizeUsageTable(entry.Abilities ?? entry.abilities, rawCount),
      items: normalizeUsageTable(entry.Items ?? entry.items, rawCount),
      moves: normalizeUsageTable(entry.Moves ?? entry.moves, rawCount),
      spreads: normalizeSpreadTable(entry.Spreads ?? entry.spreads, rawCount),
    };
  }

  return {
    source: "Smogon / Pokémon Showdown",
    month,
    format,
    pokemon,
  };
}

export function toId(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeUsageTable(table = {}, denominator) {
  return Object.entries(table)
    .map(([name, usage]) => ({
      id: toId(name),
      name,
      usagePercent: toUsagePercent(usage, denominator),
    }))
    .sort((a, b) => b.usagePercent - a.usagePercent || a.name.localeCompare(b.name));
}

function normalizeSpreadTable(table = {}, denominator) {
  return Object.entries(table)
    .map(([name, usage]) => ({
      name,
      usagePercent: toUsagePercent(usage, denominator),
    }))
    .sort((a, b) => b.usagePercent - a.usagePercent || a.name.localeCompare(b.name));
}

function toUsagePercent(value, denominator) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  const total = Number(denominator);
  if (Number.isFinite(total) && total > 0) {
    return Number(((number / total) * 100).toFixed(3));
  }
  return number > 0 && number <= 1 ? Number((number * 100).toFixed(3)) : number;
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
