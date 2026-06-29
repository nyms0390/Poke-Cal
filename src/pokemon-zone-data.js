const POKEMON_ZONE_BASE_URL = "https://www.pokemon-zone.com";

export function parsePokemonZoneCatalog(html, kind) {
  if (/Just a moment|cf_chl|challenge-platform|Enable JavaScript and cookies/i.test(html)) {
    throw new Error("Pokemon Zone returned a Cloudflare challenge page.");
  }

  if (kind === "pokemon") return parsePokemon(html);
  return parseListingCards(html, kind);
}

export function parsePokemonZonePokemonDetail(html) {
  if (/Just a moment|cf_chl|challenge-platform|Enable JavaScript and cookies/i.test(html)) {
    throw new Error("Pokemon Zone returned a Cloudflare challenge page.");
  }

  const overview = firstByClass(html, "pokemon-overview-grid");
  const learnableMoves = firstByClass(html, "learnable-moves-split");

  return {
    baseStats: parseBaseStats(overview),
    abilities: parseDetailAbilities(overview),
    moves: parseLearnableMoves(learnableMoves),
  };
}

export function mergePokemonZoneCatalogs(data, catalogs) {
  return {
    ...data,
    pokemon: mergeEntries(data.pokemon, catalogs.pokemon, mergePokemonEntry),
    abilities: mergeEntries(data.abilities, catalogs.abilities, mergeCatalogEntry),
    moves: mergeEntries(data.moves, catalogs.moves, mergeMoveEntry),
    items: mergeEntries(data.items, catalogs.items, mergeCatalogEntry),
  };
}

function parsePokemon(html) {
  return elementsByClass(html, "champs-pokemon-card").map((card, index) => {
    const name = textOf(firstByClass(card, "champs-pokemon-card__name"));
    const usageCount = numberFromText(textOf(firstByClass(card, "champs-pokemon-card__usage")));

    return {
      rank: index + 1,
      id: pokemonId(name),
      name,
      types: elementsByClass(card, "type-badge").map(textOf).filter(Boolean),
      usageCount,
      sourceUrl: absoluteUrl(attribute(card, "href")),
      icon: absoluteUrl(attribute(firstTag(card, "img"), "src")),
    };
  });
}

function parseListingCards(html, kind) {
  return elementsByClass(html, "champs-listing-card").map((card, index) => {
    const name = textOf(firstByClass(card, "champs-listing-card__name"));
    const descriptions = elementsByClass(card, "champs-listing-card__desc").map(textOf).filter(Boolean);
    const meta = textOf(firstByClass(card, "champs-listing-card__meta"));
    const detail = kind === "moves" ? parseMoveDetail(descriptions[1] ?? "", card) : {};

    return {
      rank: index + 1,
      id: toId(name),
      name,
      shortDesc: descriptions[0] ?? "",
      usageCount: numberFromText(meta),
      sourceUrl: absoluteUrl(attribute(card, "href")),
      icon: absoluteUrl(attribute(firstByClass(card, "champs-listing-card__icon"), "src")),
      ...detail,
    };
  });
}

function parseMoveDetail(detail, card) {
  const category =
    attribute(elementsByClass(card, "champs-listing-card__desc")[1] ?? "", "alt") ||
    null;
  const type = attribute(
    [...card.matchAll(/<img\b[^>]*src="[^"]*\/types\/[^"]+"[^>]*>/g)].at(-1)?.[0] ?? "",
    "alt",
  );
  const basePower = numberFromMatch(detail.match(/(\d+)\s*BP/i));
  const accuracyMatch = detail.match(/(\d+)%/);
  const accuracy = accuracyMatch ? Number(accuracyMatch[1]) : null;
  const pp = numberFromMatch(detail.match(/(\d+)\s*PP/i));

  return {
    category,
    type,
    basePower,
    accuracy,
    pp,
  };
}

function mergeEntries(existingEntries, zoneEntries, mergeEntry) {
  const existing = existingEntries ?? [];
  const zoneById = new Map(zoneEntries.map((entry) => [entry.id, entry]));
  const usedZoneIds = new Set();
  const merged = existing.map((entry) => {
    const zoneEntry = findZoneEntry(entry, zoneById);
    if (!zoneEntry) return entry;
    usedZoneIds.add(zoneEntry.id);
    return mergeEntry(entry, zoneEntry);
  });

  for (const zoneEntry of zoneEntries) {
    if (!usedZoneIds.has(zoneEntry.id)) merged.push(mergeEntry({ id: zoneEntry.id, name: zoneEntry.name }, zoneEntry));
  }

  return merged.sort((a, b) => a.name.localeCompare(b.name));
}

function findZoneEntry(entry, zoneById) {
  return (
    zoneById.get(entry.id) ??
    zoneById.get(toId(entry.name)) ??
    zoneById.get(pokemonId(entry.name)) ??
    null
  );
}

function mergeCatalogEntry(entry, zoneEntry) {
  return {
    ...entry,
    shortDesc: zoneEntry.shortDesc || entry.shortDesc,
    desc: zoneEntry.shortDesc || entry.desc,
    champions: championsMetadata(zoneEntry),
  };
}

function mergeMoveEntry(entry, zoneEntry) {
  return {
    ...entry,
    shortDesc: zoneEntry.shortDesc || entry.shortDesc,
    desc: zoneEntry.shortDesc || entry.desc,
    type: zoneEntry.type ?? entry.type,
    category: zoneEntry.category ?? entry.category,
    basePower: zoneEntry.basePower ?? entry.basePower,
    accuracy: zoneEntry.accuracy ?? entry.accuracy,
    pp: zoneEntry.pp ?? entry.pp,
    champions: championsMetadata(zoneEntry),
  };
}

function mergePokemonEntry(entry, zoneEntry) {
  return {
    ...entry,
    types: zoneEntry.types.length > 0 ? zoneEntry.types : entry.types,
    baseStats: zoneEntry.baseStats ?? entry.baseStats,
    baseSpeed: zoneEntry.baseStats?.spe ?? entry.baseSpeed,
    abilities:
      Array.isArray(zoneEntry.abilities) && zoneEntry.abilities.length > 0
        ? zoneEntry.abilities.map(({ name }) => name)
        : entry.abilities,
    moves:
      Array.isArray(zoneEntry.moves) && zoneEntry.moves.length > 0
        ? zoneEntry.moves.map(({ id }) => id)
        : entry.moves,
    champions: championsMetadata(zoneEntry),
  };
}

function championsMetadata(zoneEntry) {
  const metadata = {
    source: "Pokemon Zone",
    sourceUrl: zoneEntry.sourceUrl,
    rank: zoneEntry.rank,
    usageCount: zoneEntry.usageCount,
  };
  if (zoneEntry.icon) metadata.icon = zoneEntry.icon;
  if (Array.isArray(zoneEntry.moves)) metadata.learnableMoveCount = zoneEntry.moves.length;
  return metadata;
}

function parseBaseStats(overview) {
  const text = textOf(firstByClass(overview, "pokemon-overview-grid__stats"));
  const labels = [
    ["hp", "HP"],
    ["atk", "Atk"],
    ["def", "Def"],
    ["spa", "Sp.Atk"],
    ["spd", "Sp.Def"],
    ["spe", "Speed"],
  ];
  const stats = {};

  for (const [key, label] of labels) {
    const match = new RegExp(`\\b${escapeRegExp(label)}\\s+(\\d+)\\b`).exec(text);
    if (!match) return null;
    stats[key] = Number(match[1]);
  }

  return stats;
}

function parseDetailAbilities(overview) {
  return elementsByClass(firstByClass(overview, "pokemon-overview-grid__abilities"), "champs-listing-card")
    .map((card) => ({
      id: toId(textOf(firstByClass(card, "champs-listing-card__name"))),
      name: textOf(firstByClass(card, "champs-listing-card__name")),
      shortDesc: textOf(firstByClass(card, "champs-listing-card__desc")),
    }))
    .filter(({ name }) => name);
}

function parseLearnableMoves(section) {
  return elementsByTag(section, "tr")
    .map(parseLearnableMoveRow)
    .filter(Boolean);
}

function parseLearnableMoveRow(row) {
  const cells = elementsByTag(row, "td");
  if (cells.length < 6) return null;

  const moveCell = cells[0];
  const name = textOf(moveCell);
  if (!name) return null;

  const href = attribute(firstTag(moveCell, "a"), "href");
  return {
    id: moveIdFromHref(href) ?? toId(name),
    name,
    type: textOf(cells[1]) || null,
    category: textOf(cells[2]) || null,
    basePower: numberOrNull(textOf(cells[3])),
    accuracy: numberOrNull(textOf(cells[4])),
    pp: numberOrNull(textOf(cells[5])),
  };
}

function moveIdFromHref(href) {
  if (!href) return null;
  const slug = String(href).match(/\/champions\/moves\/([^/]+)\//)?.[1];
  return slug ? toId(slug) : null;
}

function pokemonId(name) {
  const normalized = String(name).replace(/^Mega\s+(.+?)\s+([XY])$/i, "$1 Mega $2");
  return toId(normalized);
}

function numberFromMatch(match) {
  return match ? Number(match[1]) : null;
}

function numberFromText(text) {
  const value = String(text).replace(/,/g, "").match(/\d+(?:\.\d+)?/)?.[0];
  return value == null ? null : Number(value);
}

function numberOrNull(text) {
  const normalized = String(text).trim();
  return /^\d+$/.test(normalized) ? Number(normalized) : null;
}

function elementsByClass(html, className) {
  const elements = [];
  const startPattern = new RegExp(
    `<([a-z0-9-]+)\\b[^>]*class="[^"]*\\b${escapeRegExp(className)}\\b[^"]*"[^>]*>`,
    "gi",
  );
  let match;
  while ((match = startPattern.exec(html))) {
    const end = closingTagIndex(html, match.index, match[1]);
    if (end !== -1) elements.push(html.slice(match.index, end));
  }
  return elements;
}

function elementsByTag(html, tagName) {
  const elements = [];
  const tagPattern = new RegExp(`<${tagName}\\b[^>]*>`, "gi");
  let match;
  while ((match = tagPattern.exec(html))) {
    const end = closingTagIndex(html, match.index, tagName);
    if (end !== -1) elements.push(html.slice(match.index, end));
  }
  return elements;
}

function firstByClass(html, className) {
  return elementsByClass(html, className)[0] ?? "";
}

function firstTag(html, tagName) {
  return new RegExp(`<${tagName}\\b[^>]*>`, "i").exec(html)?.[0] ?? "";
}

function closingTagIndex(html, start, tagName) {
  const tagPattern = new RegExp(`</?${tagName}\\b[^>]*>`, "gi");
  tagPattern.lastIndex = start;
  let depth = 0;
  let match;
  while ((match = tagPattern.exec(html))) {
    if (match[0].startsWith("</")) {
      depth -= 1;
      if (depth === 0) return tagPattern.lastIndex;
    } else if (!match[0].endsWith("/>")) {
      depth += 1;
    }
  }
  return -1;
}

function attribute(html, name) {
  return (
    new RegExp(`${escapeRegExp(name)}=(?:"([^"]*)"|'([^']*)')`, "i").exec(html)?.slice(1).find(Boolean) ??
    null
  );
}

function textOf(html) {
  return decodeHtml(String(html).replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function absoluteUrl(value) {
  if (!value) return null;
  return new URL(value, POKEMON_ZONE_BASE_URL).href;
}

function toId(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function decodeHtml(value) {
  const namedEntities = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return String(value).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code) => {
    if (code[0] === "#") {
      const number = code[1]?.toLowerCase() === "x" ? Number.parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(number) ? String.fromCodePoint(number) : entity;
    }
    return namedEntities[code.toLowerCase()] ?? entity;
  });
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
