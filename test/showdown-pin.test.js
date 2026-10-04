import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  championsModBaseUrl,
  isValidShowdownPin,
  showdownDataBaseUrl,
} from "../src/data/champions-data.js";
import { parseShowdownPin, readShowdownPin } from "../scripts/lib/showdown-pin.mjs";
import { showdownUrls } from "../scripts/sync-pokemon-data.mjs";
import {
  bumpShowdownPin,
  compareUrl,
  parseLsRemote,
  pullRequestBody,
} from "../scripts/bump-showdown-pin.mjs";

const OLD = "1111111111111111111111111111111111111111";
const NEW = "2222222222222222222222222222222222222222";
const PIN = { repo: "smogon/pokemon-showdown", commit: OLD };

test("the committed Showdown pin is a full commit SHA of smogon/pokemon-showdown", async () => {
  const pin = await readShowdownPin();
  assert.equal(pin.repo, "smogon/pokemon-showdown");
  assert.match(pin.commit, /^[0-9a-f]{40}$/);
});

test("builds raw Showdown and Champions mod URLs from the pinned commit", () => {
  assert.equal(
    showdownDataBaseUrl(PIN),
    `https://raw.githubusercontent.com/smogon/pokemon-showdown/${OLD}/data`,
  );
  assert.equal(
    championsModBaseUrl(PIN),
    `https://raw.githubusercontent.com/smogon/pokemon-showdown/${OLD}/data/mods/champions`,
  );
});

test("every Showdown sync URL uses the pinned commit, never a branch", () => {
  const urls = Object.values(showdownUrls(PIN));
  assert.equal(urls.length, 13);
  for (const url of urls) {
    assert.ok(url.startsWith(`https://raw.githubusercontent.com/smogon/pokemon-showdown/${OLD}/data/`), url);
    assert.ok(!url.includes("/master/"), url);
  }
  assert.equal(urls.filter((url) => url.includes("/data/mods/champions/")).length, 5);
  assert.equal(urls.filter((url) => url.includes("/data/text/")).length, 3);
});

test("rejects branch names, short SHAs, and malformed repos", () => {
  for (const pin of [
    { repo: "smogon/pokemon-showdown", commit: "master" },
    { repo: "smogon/pokemon-showdown", commit: OLD.slice(0, 12) },
    { repo: "smogon/pokemon-showdown", commit: `ABCDEF${OLD.slice(6)}` },
    { repo: "../..", commit: OLD },
    { repo: "smogon/pokemon-showdown/../x", commit: OLD },
    { repo: "pokemon-showdown", commit: OLD },
    { commit: OLD },
    null,
  ]) {
    assert.equal(isValidShowdownPin(pin), false, JSON.stringify(pin));
    assert.throws(() => showdownDataBaseUrl(pin), /Invalid Showdown pin/);
  }
  assert.throws(() => parseShowdownPin('{"repo":"smogon/pokemon-showdown","commit":"master"}'), /40-hex/);
  assert.throws(() => parseShowdownPin("not json"), /not valid JSON/);
  assert.deepEqual(parseShowdownPin(JSON.stringify({ ...PIN, extra: true })), PIN);
});

test("parses the branch SHA out of git ls-remote output", () => {
  const output = `${NEW}\tHEAD\n${OLD}\trefs/heads/other\n${NEW}\trefs/heads/master\n`;
  assert.equal(parseLsRemote(output), NEW);
  assert.equal(parseLsRemote(output, "other"), OLD);
  assert.throws(() => parseLsRemote(output, "missing"), /refs\/heads\/missing/);
});

test("bumps the pin file only when the resolved commit changed", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "pokecal-pin-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, "showdown-pin.json");
  await writeFile(file, `${JSON.stringify(PIN, null, 2)}\n`);

  const calls = [];
  const resolveCommit = async (repo, ref) => {
    calls.push([repo, ref]);
    return NEW;
  };
  const bumped = await bumpShowdownPin({ file, resolveCommit });
  assert.deepEqual(calls, [["smogon/pokemon-showdown", "master"]]);
  assert.deepEqual(bumped, {
    changed: true,
    repo: "smogon/pokemon-showdown",
    from: OLD,
    to: NEW,
    compareUrl: `https://github.com/smogon/pokemon-showdown/compare/${OLD}...${NEW}`,
  });
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")), { ...PIN, commit: NEW });

  const unchanged = await bumpShowdownPin({ file, resolveCommit });
  assert.equal(unchanged.changed, false);
  assert.equal(unchanged.from, NEW);

  await assert.rejects(bumpShowdownPin({ file, commit: "master" }), /Not a full commit SHA/);
  assert.equal(JSON.parse(await readFile(file, "utf8")).commit, NEW);
});

test("the pull-request body links the upstream comparison and explains the effect", () => {
  const body = pullRequestBody({ repo: "smogon/pokemon-showdown", from: OLD, to: NEW });
  assert.ok(body.includes(compareUrl("smogon/pokemon-showdown", OLD, NEW)));
  assert.match(body, /next weekly data sync/);
});
