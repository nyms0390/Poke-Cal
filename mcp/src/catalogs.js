import { createStrategyContext } from "../../src/data/strategy-tools.js";

const CATALOG_NAMES = ["pokemon", "moves", "abilities", "items"];
const cache = new WeakMap();

export async function loadCatalogs(env) {
  if (!env?.ASSETS || typeof env.ASSETS.fetch !== "function") {
    throw new Error("ASSETS binding is unavailable.");
  }
  if (cache.has(env)) return cache.get(env);
  const loading = Promise.all(CATALOG_NAMES.map(async (name) => {
    let response;
    try {
      response = await env.ASSETS.fetch(new Request(`https://assets.local/${name}.json`));
    } catch {
      throw new Error(`Asset ${name}.json could not be loaded.`);
    }
    if (!response?.ok) throw new Error(`Asset ${name}.json is unavailable.`);
    try {
      const value = await response.json();
      if (!Array.isArray(value)) throw new Error("not an array");
      return value;
    } catch {
      throw new Error(`Asset ${name}.json is invalid.`);
    }
  })).then(([pokemon, moves, abilities, items]) => createStrategyContext({ pokemon, moves, abilities, items }));
  cache.set(env, loading);
  try {
    return await loading;
  } catch (error) {
    cache.delete(env);
    throw error;
  }
}
