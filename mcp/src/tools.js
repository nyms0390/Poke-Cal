import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import {
  calculateDamageMatchup,
  compareSpeed,
} from "../../src/data/strategy-tools.js";

const limit = z.number().int().min(1).max(10).default(5);
const query = z.string().min(1);
const speedSchema = z.object({
  left: z.string().min(1), right: z.string().min(1),
  leftSpread: z.string().optional(), rightSpread: z.string().optional(),
  leftAbility: z.string().optional(), rightAbility: z.string().optional(),
  leftItem: z.string().optional(), rightItem: z.string().optional(),
  leftStatus: z.string().optional(), rightStatus: z.string().optional(),
  leftTailwind: z.boolean().optional(), rightTailwind: z.boolean().optional(),
  leftSpeedStage: z.number().int().min(-6).max(6).optional(), rightSpeedStage: z.number().int().min(-6).max(6).optional(),
  weather: z.string().optional(), terrain: z.string().optional(), trickRoom: z.boolean().optional(),
});
const damageSchema = z.object({
  attacker: z.string().min(1), defender: z.string().min(1), move: z.string().min(1),
  attackerSpread: z.string().optional(), defenderSpread: z.string().optional(),
  attackerAbility: z.string().optional(), defenderAbility: z.string().optional(),
  attackerItem: z.string().optional(), defenderItem: z.string().optional(),
  attackerTeraType: z.string().optional(), defenderTeraType: z.string().optional(), targetType: z.string().optional(),
  attackerHpFraction: z.number().gt(0).lte(1).optional(), defenderHpFraction: z.number().gt(0).lte(1).optional(),
  attackerStatus: z.string().optional(), defenderStatus: z.string().optional(),
  attackerAtkStage: z.number().int().min(-6).max(6).optional(), attackerSpaStage: z.number().int().min(-6).max(6).optional(),
  defenderDefStage: z.number().int().min(-6).max(6).optional(), defenderSpdStage: z.number().int().min(-6).max(6).optional(),
  format: z.enum(["singles", "doubles"]).optional(), weather: z.string().optional(), terrain: z.string().optional(),
  gravity: z.boolean().optional(), helpingHand: z.boolean().optional(), powerSpot: z.boolean().optional(), battery: z.boolean().optional(),
  steelySpirit: z.boolean().optional(), attackerFlowerGift: z.boolean().optional(), defenderFlowerGift: z.boolean().optional(),
  attackerTailwind: z.boolean().optional(), defenderTailwind: z.boolean().optional(), reflect: z.boolean().optional(),
  lightScreen: z.boolean().optional(), auroraVeil: z.boolean().optional(), friendGuard: z.boolean().optional(), critical: z.boolean().optional(),
  moveOptions: z.object({ singleTarget: z.boolean().optional(), hitCount: z.number().optional() }).optional(),
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
    compare_speed: { schema: speedSchema, handler: (input) => compareSpeed(context, input), description: "Compare final Pokémon Champions Speed and acting order." },
    calculate_damage: { schema: damageSchema, handler: (input) => serializeDamage(assertDamage(calculateDamageMatchup(context, input))), description: "Calculate deterministic Pokémon Champions damage." },
    check_survival: { schema: damageSchema, handler: (input) => survivalResult(assertDamage(calculateDamageMatchup(context, input))), description: "Check whether a Pokémon survives deterministic damage." },
  };
  for (const [name, tool] of Object.entries(tools)) {
    server.registerTool(name, { description: tool.description, inputSchema: tool.schema.shape }, async (input) => {
      try {
        const data = tool.handler(tool.schema.parse(input));
        return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data };
      } catch (error) {
        throw new Error(error instanceof Error ? error.message : "Tool request failed.");
      }
    });
  }
  return tools;
}

export async function callTool(server, name, input) {
  const tool = server.__pokecalTools?.[name];
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return tool.handler(tool.schema.parse(input));
}

function searchPokemon(context, value, count) {
  const needle = normalize(value);
  const matches = rankMatches(context.pokemon, needle);
  if (!matches.length) throw new Error(`Unknown Pokémon query: ${value}`);
  return matches.slice(0, count).map((entry) => ({
    id: entry.id, name: entry.name, baseSpecies: entry.baseSpecies ?? null, types: entry.types ?? [], baseStats: entry.baseStats ?? {}, abilities: entry.abilities ?? [],
    champions: { legal: entry.champions?.legal ?? false, tier: entry.champions?.tier ?? null, usageCount: entry.champions?.usageCount ?? null, usagePercent: entry.champions?.usagePercent ?? null },
  }));
}

function searchMoves(context, value, count) {
  const needle = normalize(value);
  const matches = rankMatches(context.moves, needle, { includeDescription: true });
  if (!matches.length) throw new Error(`Unknown move query: ${value}`);
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
  return { damage, survives: survival.verdict !== "NO", remainingHp: { min: minRemaining, max: maxRemaining }, summary: survival.summary };
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
