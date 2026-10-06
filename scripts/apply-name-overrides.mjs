// Applies src/locales/zh-tw-name-overrides.js to the committed public/*.json catalogs and
// rebuilds public/web and public/mcp-catalogs, without downloading anything. Run after editing
// the overrides; `npm run sync-data` applies the same table on every scheduled update.
import {
  ZH_TW_NAME_OVERRIDES,
  applyZhTwNameOverrides,
  unknownOverrideIds,
} from "../src/locales/zh-tw-name-overrides.js";
import { buildMcpCatalogs, buildWebCatalogs } from "./build-web-catalogs.mjs";
import { isMainModule, readJson, writeJsonEntries } from "./lib/sync-utils.mjs";

const directory = new URL("../public/", import.meta.url);
const KINDS = Object.keys(ZH_TW_NAME_OVERRIDES);

export async function applyNameOverrides({ source = directory } = {}) {
  const catalogs = Object.fromEntries(
    await Promise.all(KINDS.map(async (kind) => [kind, await readJson(source, kind)])),
  );
  const unknown = unknownOverrideIds(catalogs);
  if (unknown.length > 0) throw new Error(`Unknown override ids: ${unknown.join(", ")}`);
  await writeJsonEntries(source, applyZhTwNameOverrides(catalogs));
}

if (isMainModule(import.meta.url)) {
  try {
    await applyNameOverrides();
    await buildWebCatalogs();
    await buildMcpCatalogs();
    const count = KINDS.reduce((sum, kind) => sum + Object.keys(ZH_TW_NAME_OVERRIDES[kind]).length, 0);
    console.log(`Applied ${count} zh-TW name overrides to public/*.json and rebuilt web/MCP catalogs`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
