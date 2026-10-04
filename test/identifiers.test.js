import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { normalizeId } from "../src/identifiers.js";

test("normalizes shared Showdown-style identifiers", () => {
  assert.equal(normalizeId("Thunder Punch"), "thunderpunch");
  assert.equal(normalizeId("10,000,000 Volt Thunderbolt"), "10000000voltthunderbolt");
  assert.equal(normalizeId(null), "");
});

test("folds accents and gender symbols like Showdown ids", () => {
  assert.equal(normalizeId("Flabébé"), "flabebe");
  assert.equal(normalizeId("Nidoran♀"), "nidoranf");
  assert.equal(normalizeId("Nidoran♂"), "nidoranm");
  assert.equal(normalizeId("Nidoran-F"), "nidoranf");
  assert.equal(normalizeId("Nidoran-M"), "nidoranm");
  assert.equal(normalizeId("Farfetch’d"), "farfetchd");
  assert.equal(normalizeId("Poké Ball"), "pokeball");
  assert.equal(normalizeId("ＤＤ Lariat"), "ddlariat"); // fullwidth letters fold to ASCII
  assert.equal(normalizeId("謎擬Ｑ"), "q"); // CJK is still dropped
});

test("every catalog name normalizes to its catalog id", () => {
  for (const file of ["pokemon", "moves", "items", "abilities"]) {
    for (const directory of ["public", "public/web"]) {
      const entries = JSON.parse(readFileSync(new URL(`../${directory}/${file}.json`, import.meta.url), "utf8"));
      const mismatched = entries.filter((entry) => normalizeId(entry.name) !== entry.id).map((entry) => entry.name);
      assert.deepEqual(mismatched, [], `${directory}/${file}.json`);
    }
  }
  const pokemon = JSON.parse(readFileSync(new URL("../public/pokemon.json", import.meta.url), "utf8"));
  assert.equal(pokemon.find((entry) => entry.id === normalizeId("Flabébé"))?.id, "flabebe");
  // Catalog names may be NFC or NFD; both spellings resolve to the same id.
  assert.equal(normalizeId("Flabébé".normalize("NFC")), normalizeId("Flabébé".normalize("NFD")));
  assert.equal(pokemon.find((entry) => entry.id === normalizeId("Nidoran♀"))?.name, "Nidoran-F");
  assert.equal(pokemon.find((entry) => entry.id === normalizeId("Nidoran♂"))?.name, "Nidoran-M");
});
