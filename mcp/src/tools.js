import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import {
  calculateDamageMatchup,
  compareSpeed,
  resolvePokemon,
} from "../../src/data/strategy-tools.js";

import { TYPE_EFFECTIVENESS } from "../../src/engine/type-chart.js";

// Free-text inputs are bounded so a caller cannot make the Worker parse, search, or echo
// arbitrarily large strings. Error messages quote at most ECHO_LIMIT characters of input.
export const TEXT_MAX = 100;
const ECHO_LIMIT = 40;

// Canonical values are exactly what the engine compares against (see src/ui/field-controls.js
// and src/engine/*): weather/terrain go through normalizeId(), statuses are compared verbatim.
// Alias keys are lowercase with spaces, hyphens, and underscores removed; every canonical
// value is also its own alias so parsing an already-normalized input is idempotent.
const WEATHER_ALIASES = {
  RainDance: ["rain", "raindance"],
  SunnyDay: ["sun", "sunny", "sunnyday", "harshsunlight"],
  Sandstorm: ["sand", "sandstorm"],
  Snowscape: ["snow", "snowscape", "hail"],
};
const TERRAIN_ALIASES = {
  "Electric Terrain": ["electric", "electricterrain"],
  "Grassy Terrain": ["grassy", "grass", "grassyterrain"],
  "Misty Terrain": ["misty", "mistyterrain"],
  "Psychic Terrain": ["psychic", "psychicterrain"],
};
const STATUS_ALIASES = {
  paralysis: ["par", "paralysis", "paralyzed", "paralysed"],
  burn: ["brn", "burn", "burned", "burnt"],
  poison: ["psn", "poison", "poisoned"],
  toxic: ["tox", "toxic", "badlypoisoned"],
  sleep: ["slp", "sleep", "asleep"],
  freeze: ["frz", "freeze", "frozen"],
};
export const POKEMON_TYPES = Object.keys(TYPE_EFFECTIVENESS);
const TYPE_ALIASES = Object.fromEntries(POKEMON_TYPES.map((type) => [type, [type.toLowerCase()]]));

export const CANONICAL_VALUES = {
  weather: Object.keys(WEATHER_ALIASES),
  terrain: Object.keys(TERRAIN_ALIASES),
  status: Object.keys(STATUS_ALIASES),
  type: POKEMON_TYPES,
};

export function truncateForMessage(value, max = ECHO_LIMIT) {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function aliasKey(value) {
  return String(value).toLowerCase().replace(/[\s_-]+/g, "");
}

// A bounded string normalised through an alias map and then checked with z.enum. Unknown
// values fail validation with the accepted canonical values instead of being ignored.
function aliasedEnum(label, aliases, { allowNone = false } = {}) {
  const canonical = Object.keys(aliases);
  const lookup = new Map();
  for (const [value, keys] of Object.entries(aliases)) {
    for (const key of [value, ...keys]) lookup.set(aliasKey(key), value);
  }
  const accepted = allowNone ? [...canonical, "none"] : canonical;
  const description = `${label}: one of ${accepted.join(", ")} (case-insensitive; common aliases accepted).`;
  return z
    .string()
    .max(40)
    .transform((value, ctx) => {
      const key = aliasKey(value);
      if (allowNone && (key === "" || key === "none")) return undefined;
      const match = lookup.get(key);
      if (match) return match;
      ctx.addIssue({ code: "custom", message: `Unknown ${label} "${truncateForMessage(value)}". Use one of: ${accepted.join(", ")}.` });
      return z.NEVER;
    })
    .pipe(z.enum(canonical).optional())
    .optional()
    .describe(description);
}

const text = () => z.string().trim().max(TEXT_MAX);
const name = (label) => text().min(1).describe(`${label} name or ID (max ${TEXT_MAX} characters).`);
const optionalText = (label) => text().optional().describe(`${label} (max ${TEXT_MAX} characters).`);
const weather = aliasedEnum("weather", WEATHER_ALIASES, { allowNone: true });
const terrain = aliasedEnum("terrain", TERRAIN_ALIASES, { allowNone: true });
const status = aliasedEnum("status", STATUS_ALIASES, { allowNone: true });
const pokemonType = (label) => aliasedEnum(label, TYPE_ALIASES);
const stage = () => z.number().int().min(-6).max(6).optional();

const limit = z.number().int().min(1).max(10).default(5);
const query = z.string().trim().min(1).max(TEXT_MAX);
const speedSchema = z.object({
  left: name("Left Pokémon"), right: name("Right Pokémon"),
  leftSpread: optionalText("Left spread"), rightSpread: optionalText("Right spread"),
  leftAbility: optionalText("Left ability"), rightAbility: optionalText("Right ability"),
  leftItem: optionalText("Left item"), rightItem: optionalText("Right item"),
  leftStatus: status, rightStatus: status,
  leftTailwind: z.boolean().optional(), rightTailwind: z.boolean().optional(),
  leftSpeedStage: stage(), rightSpeedStage: stage(),
  weather, terrain, trickRoom: z.boolean().optional(),
});
const damageSchema = z.object({
  attacker: name("Attacking Pokémon"), defender: name("Defending Pokémon"), move: name("Move"),
  attackerSpread: optionalText("Attacker spread"), defenderSpread: optionalText("Defender spread"),
  attackerAbility: optionalText("Attacker ability"), defenderAbility: optionalText("Defender ability"),
  attackerItem: optionalText("Attacker item"), defenderItem: optionalText("Defender item"),
  attackerTeraType: pokemonType("attackerTeraType"), defenderTeraType: pokemonType("defenderTeraType"), targetType: pokemonType("targetType"),
  attackerHpFraction: z.number().gt(0).lte(1).optional(), defenderHpFraction: z.number().gt(0).lte(1).optional(),
  attackerStatus: status, defenderStatus: status,
  attackerAtkStage: stage(), attackerSpaStage: stage(),
  defenderDefStage: stage(), defenderSpdStage: stage(),
  format: z.enum(["singles", "doubles"]).optional(), weather, terrain,
  gravity: z.boolean().optional(), helpingHand: z.boolean().optional(), powerSpot: z.boolean().optional(), battery: z.boolean().optional(),
  steelySpirit: z.boolean().optional(), attackerFlowerGift: z.boolean().optional(), defenderFlowerGift: z.boolean().optional(),
  attackerTailwind: z.boolean().optional(), defenderTailwind: z.boolean().optional(), reflect: z.boolean().optional(),
  lightScreen: z.boolean().optional(), auroraVeil: z.boolean().optional(), friendGuard: z.boolean().optional(), critical: z.boolean().optional(),
  moveOptions: z.object({ singleTarget: z.boolean().optional(), hitCount: z.number().int().min(1).max(10).optional() }).optional(),
});

export function createToolServer(context) {
  const server = new McpServer({
    name: "PokéCal Champions Strategy",
    version: "0.1.0",
    instructions: "Calculations target Pokémon Champions. Doubles is the default. Results are deterministic; PokéCal does not require or accept a user model token.",
  });
  const tools = registerTools(server, context);
  server.__pokecalTools = tools;
  return server;
}

export function registerTools(server, context) {
  const tools = {
    lookup_pokemon: {
      schema: z.object({ query, limit }),
      handler: ({ query: value, limit: count = 5 }) => searchPokemon(context, value, count),
      description: "Find Pokémon and concise Pokémon Champions availability and usage summaries.",
    },
    lookup_move: {
      schema: z.object({ query, limit }),
      handler: ({ query: value, limit: count = 5 }) => searchMoves(context, value, count),
      description: "Find moves and concise Pokémon Champions legality summaries.",
    },
    compare_speed: { schema: speedSchema, handler: (input) => speedResult(context, input), description: "Compare final Pokémon Champions Speed and acting order. Results include legal:false and warnings when a Pokémon is not Champions-legal." },
    calculate_damage: { schema: damageSchema, handler: (input) => serializeDamage(assertDamage(calculateDamageMatchup(context, input))), description: "Calculate deterministic Pokémon Champions damage. Results include legal:false and warnings when a Pokémon or move is not Champions-legal." },
    check_survival: { schema: damageSchema, handler: (input) => survivalResult(assertDamage(calculateDamageMatchup(context, input))), description: "Check whether a Pokémon survives deterministic damage. Results include legal:false and warnings when a Pokémon or move is not Champions-legal." },
  };
  for (const [name, tool] of Object.entries(tools)) {
    server.registerTool(name, { description: tool.description, inputSchema: tool.schema.shape }, async (input) => {
      try {
        const data = tool.handler(parseInput(tool.schema, input));
        return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data };
      } catch (error) {
        throw new Error(truncateForMessage(error instanceof Error ? error.message : "Tool request failed.", 600));
      }
    });
  }
  return tools;
}

export async function callTool(server, name, input) {
  const tool = server.__pokecalTools?.[name];
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return tool.handler(parseInput(tool.schema, input));
}

// Validate tool arguments and turn Zod issues into one readable message. Zod issues do not
// include the raw input, and custom alias messages quote a truncated value only.
export function parseInput(schema, input) {
  const parsed = schema.safeParse(input ?? {});
  if (parsed.success) return parsed.data;
  throw new Error(`Invalid arguments: ${parsed.error.issues.map(formatIssue).join("; ")}`);
}

function formatIssue(issue) {
  const path = issue.path?.length ? issue.path.join(".") : "input";
  return `${path}: ${truncateForMessage(issue.message, 200)}`;
}

function speedResult(context, input) {
  const result = compareSpeed(context, input);
  return { ...result, ...legality([resolvePokemon(context, input.left), resolvePokemon(context, input.right)], []) };
}

// Champions legality comes from the Showdown Champions mod overlay (champions.legal). An
// entry without champions.legal === true is reported as not legal; the calculation still
// runs so callers can explore hypotheticals, but the result is flagged instead of silently
// presented as a legal Champions matchup.
function legality(pokemon, moves) {
  const warnings = [];
  for (const entry of new Set(pokemon)) {
    if (entry?.champions?.legal !== true) warnings.push(`${entry.name} is not legal in Pokémon Champions; result is a hypothetical calculation.`);
  }
  for (const entry of moves) {
    if (entry?.champions?.legal !== true) warnings.push(`${entry.name} is not legal in Pokémon Champions; result is a hypothetical calculation.`);
  }
  return { legal: warnings.length === 0, warnings };
}

function searchPokemon(context, value, count) {
  const needle = normalize(value);
  const matches = rankMatches(context.pokemon, needle);
  if (!matches.length) throw new Error(`Unknown Pokémon query: ${truncateForMessage(value)}`);
  return matches.slice(0, count).map((entry) => ({
    id: entry.id, name: entry.name, baseSpecies: entry.baseSpecies ?? null, types: entry.types ?? [], baseStats: entry.baseStats ?? {}, abilities: entry.abilities ?? [],
    champions: { legal: entry.champions?.legal ?? false, tier: entry.champions?.tier ?? null, usageCount: entry.champions?.usageCount ?? null, usagePercent: entry.champions?.usagePercent ?? null },
  }));
}

function searchMoves(context, value, count) {
  const needle = normalize(value);
  const matches = rankMatches(context.moves, needle, { includeDescription: true });
  if (!matches.length) throw new Error(`Unknown move query: ${truncateForMessage(value)}`);
  return matches.slice(0, count).map((entry) => ({
    id: entry.id, name: entry.name, type: entry.type, category: entry.category, basePower: entry.basePower ?? null, accuracy: entry.accuracy ?? null, priority: entry.priority ?? 0, target: entry.target ?? null, shortDesc: entry.shortDesc ?? entry.desc ?? "", champions: { legal: entry.champions?.legal ?? false, tier: entry.champions?.tier ?? null },
  }));
}

function assertDamage(result) {
  if (!result.supported) throw new Error(result.reason ?? "Damage calculation is unsupported.");
  return result;
}

function serializeDamage(result) {
  const distribution = [...new Set(result.rolls)].map((damage) => ({ damage, chance: result.rolls.filter((roll) => roll === damage).length / result.rolls.length }));
  return {
    supported: true,
    ...legality([result.attackerState.pokemon, result.defenderState.pokemon], [result.move]),
    attacker: pickPokemon(result.attacker), defender: pickPokemon(result.defender), move: pickMove(result.move),
    damage: { min: result.minDamage, max: result.maxDamage, distribution },
    percent: { min: result.minPercent, max: result.maxPercent },
    currentHp: { current: result.defenderCurrentHp, max: result.defenderHp }, typeEffectiveness: result.typeMultiplier,
    koChance: result.ko ?? null, notes: result.notes ?? [], assumptions: assumptions(result),
    defenderCurrentHp: result.defenderCurrentHp, minDamage: result.minDamage, maxDamage: result.maxDamage,
  };
}

function survivalResult(result) {
  const damage = serializeDamage(result);
  const survival = checkSurvivalFromResult(result);
  const protectedAtOneHp = survival.reason === "Focus Sash" || survival.reason === "Sturdy";
  const minRemaining = protectedAtOneHp ? 1 : Math.max(0, result.defenderCurrentHp - result.maxDamage);
  const maxRemaining = protectedAtOneHp ? 1 : Math.max(0, result.defenderCurrentHp - result.minDamage);
  return { legal: damage.legal, warnings: damage.warnings, damage, survives: survival.verdict !== "NO", remainingHp: { min: minRemaining, max: maxRemaining }, summary: survival.summary };
}

function checkSurvivalFromResult(result) {
  const fullHp = result.defenderState.currentHpFraction === 1;
  const focusSash = fullHp && normalize(result.defenderState.item?.id) === "focussash";
  const sturdy = fullHp && result.ko?.text?.includes("Sturdy");
  const immune = result.maxDamage === 0;
  const guaranteed = focusSash || sturdy || immune || result.maxDamage < result.defenderCurrentHp;
  const possible = guaranteed || result.minDamage < result.defenderCurrentHp;
  const chance = guaranteed ? 1 : result.rolls.filter((damage) => damage < result.defenderCurrentHp).length / result.rolls.length;
  const name = result.defender.name;
  const range = `${result.minPercent}–${result.maxPercent}%`;
  if (focusSash) return { verdict: "YES", reason: "Focus Sash", summary: `YES — ${name} survives with Focus Sash (${range}).` };
  if (sturdy) return { verdict: "YES", reason: "Sturdy", summary: `YES — ${name} survives with Sturdy (${range}).` };
  if (immune) return { verdict: "YES", summary: `YES — ${name} is immune.` };
  if (guaranteed) {
    const hp = fullHp ? "full HP" : `${Number((result.defenderState.currentHpFraction * 100).toFixed(1))}% HP`;
    return { verdict: "YES", summary: `YES — ${name} survives ${result.minDamage}–${result.maxDamage} damage (${range}) at ${hp}.` };
  }
  if (possible) return { verdict: "ROLL", summary: `ROLL — ${name} has a ${(chance * 100).toFixed(1)}% survival chance (${range}).` };
  return { verdict: "NO", summary: `NO — ${name} is always KO'd (${range}).` };
}

function pickPokemon(entry) { return { id: entry.id, name: entry.name, types: entry.types ?? [] }; }
function pickMove(entry) { return { id: entry.id, name: entry.name, type: entry.type, category: entry.category, basePower: entry.basePower ?? null }; }
function assumptions(result) { return [`Format: ${result.field.format ?? "doubles"}`, "Damage rolls use the deterministic engine distribution.", "Data: Pokémon Showdown mechanics/catalog seed with Champions mod, plus Champions usage overlays where present."]; }
function normalize(value) { return String(value ?? "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]/g, ""); }

function rankMatches(entries, needle, { includeDescription = false } = {}) {
  return entries
    .map((entry, index) => ({ entry, index, rank: relevanceRank(entry, needle, includeDescription) }))
    .filter(({ rank }) => rank !== null)
    .sort((left, right) => left.rank - right.rank || championPriority(right.entry) - championPriority(left.entry) || left.entry.name.localeCompare(right.entry.name) || left.index - right.index)
    .map(({ entry }) => entry);
}

function relevanceRank(entry, needle, includeDescription) {
  const keys = [entry.id, entry.name, ...(entry.aliases ?? [])].map(normalize);
  if (keys.some((key) => key === needle)) return 0;
  if (keys.some((key) => key.startsWith(needle))) return 1;
  if (keys.some((key) => key.includes(needle))) return 2;
  if (includeDescription && normalize(entry.shortDesc ?? entry.desc).includes(needle)) return 3;
  return null;
}

function championPriority(entry) {
  const legality = entry.champions?.legal === true ? 1 : 0;
  const usage = Number.isFinite(entry.champions?.usagePercent)
    ? entry.champions.usagePercent
    : Number.isFinite(entry.champions?.usageCount) ? entry.champions.usageCount / 1_000_000 : -Infinity;
  return legality * 1_000_000_000 + (Number.isFinite(usage) ? usage : -1);
}
