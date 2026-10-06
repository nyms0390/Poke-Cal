import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  ZH_TW_NAME_OVERRIDES,
  applyZhTwNameOverrides,
  unknownOverrideIds,
} from "../src/locales/zh-tw-name-overrides.js";
import { localizedName } from "../src/i18n.js";

const readCatalog = async (path) =>
  JSON.parse(await readFile(new URL(`../public/${path}.json`, import.meta.url), "utf8"));

test("replaces the PokeAPI name, keeps other aliases, and covers every form", () => {
  const result = applyZhTwNameOverrides(
    {
      pokemon: [
        { id: "kingambit", name: "Kingambit", baseSpecies: "Kingambit", aliases: ["仆刀將軍", "x"] },
        { id: "kingambitmega", name: "Kingambit-Mega", baseSpecies: "Kingambit", aliases: ["仆刀將軍"] },
        { id: "bisharp", name: "Bisharp", baseSpecies: "Bisharp", aliases: ["劈斬司令"] },
      ],
      abilities: [{ id: "terashell", name: "Tera Shell" }],
    },
    { pokemon: { kingambit: "仆斬將軍" }, abilities: { terashell: "太晶甲殼" } },
  );
  assert.deepEqual(result.pokemon.map((entry) => entry.aliases), [["仆斬將軍", "x"], ["仆斬將軍"], ["劈斬司令"]]);
  assert.deepEqual(result.abilities[0].aliases, ["太晶甲殼"]);
  assert.equal(localizedName(result.pokemon[1], "zh-TW"), "仆斬將軍（超級）");
});

test("every override id exists in the committed catalogs", async () => {
  const catalogs = Object.fromEntries(
    await Promise.all(Object.keys(ZH_TW_NAME_OVERRIDES).map(async (kind) => [kind, await readCatalog(kind)])),
  );
  assert.deepEqual(unknownOverrideIds(catalogs), []);
});

test("committed full and web catalogs already carry the overrides (run npm run apply-name-overrides)", async () => {
  for (const directory of ["", "web/"]) {
    for (const [kind, names] of Object.entries(ZH_TW_NAME_OVERRIDES)) {
      let entries;
      try {
        entries = await readCatalog(`${directory}${kind}`);
      } catch (error) {
        if (error.code === "ENOENT") continue;
        throw error;
      }
      for (const [id, name] of Object.entries(names)) {
        const entry = entries.find((candidate) => candidate.id === id);
        assert.equal(entry?.aliases?.[0], name, `${directory}${kind}.json ${id}`);
      }
    }
  }
});
