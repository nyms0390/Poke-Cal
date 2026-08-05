import test from "node:test";
import assert from "node:assert/strict";

import { buildLimitlessTeamArchive } from "../src/data/limitless-teams.js";

function tournament(id, date, name = id) {
  return { id, game: "VGC", format: "M-B", name, date, players: 16 };
}

function details({ phase = 2, type = "SINGLE_BRACKET" } = {}) {
  return {
    organizer: { id: 42, name: "PokéCal Cup" },
    platform: "SWITCH",
    isPublic: true,
    isOnline: true,
    phases: [
      { phase: 1, type: "SWISS", rounds: 5, mode: "BO3" },
      { phase, type, rounds: 1, mode: "BO3" },
    ],
  };
}

function standing(player, placing, decklist = []) {
  return {
    player,
    name: player.toUpperCase(),
    country: "TW",
    placing,
    record: { wins: 5, losses: 1, ties: 0 },
    drop: null,
    deck: {},
    decklist,
  };
}

function set(id, name, overrides = {}) {
  return {
    id,
    name,
    item: "Focus Sash",
    ability: "Intimidate",
    attacks: ["Protect", "Fake Out", "Helping Hand", "Tailwind"],
    nature: "Jolly",
    tera: null,
    ...overrides,
  };
}

test("builds newest completed bracket tournaments and preserves submitted teams", () => {
  const tournaments = [
    tournament("new", "2026-08-04T17:00:00.000Z", "Newest Cup"),
    tournament("old", "2026-08-03T17:00:00.000Z", "Older Cup"),
  ];
  const standings = new Map([
    [
      "new",
      [
        standing("winner", 1, [
          set("raichu", "Raichu", { tera: "Stellar" }),
          set("miraidon", "Miraidon", { item: null, attacks: ["Electro Drift"] }),
        ]),
        standing("runner", 2),
        standing("swiss-only", 3),
      ],
    ],
    ["old", [standing("old-winner", 1, [set("pikachu", "Pikachu")]), standing("old-runner", 2)]],
  ]);
  const detailsByTournament = new Map([
    ["new", details()],
    ["old", details()],
  ]);
  const pairingsByTournament = new Map([
    [
      "new",
      [
        { phase: 2, round: 2, match: "T2-1", player1: "winner", player2: "runner", winner: "winner" },
        { phase: 2, round: 1, match: "T4-1", player1: "winner", player2: "swiss-only", winner: "winner" },
      ],
    ],
    ["old", [{ phase: 2, round: 1, match: "T2-1", player1: "old-winner", player2: "old-runner", winner: "old-winner" }]],
  ]);

  const archive = buildLimitlessTeamArchive(
    tournaments,
    detailsByTournament,
    standings,
    pairingsByTournament,
    { limit: 10 },
  );

  assert.equal(archive.version, 1);
  assert.deepEqual(archive.tournaments.map(({ id }) => id), ["new", "old"]);
  assert.deepEqual(archive.tournaments[0].topCut.map(({ playerId }) => playerId), [
    "winner",
    "runner",
    "swiss-only",
  ]);
  assert.equal(archive.tournaments[0].topCut[0].playerName, "WINNER");
  assert.equal(archive.tournaments[0].topCut[0].pokemon[0].tera, "Stellar");
  assert.deepEqual(archive.tournaments[0].topCut[0].pokemon[1].attacks, undefined);
  assert.deepEqual(archive.tournaments[0].topCut[0].pokemon[1].moves, ["Electro Drift"]);
  assert.equal(archive.tournaments[0].topCut[0].pokemon[1].item, null);
  assert.equal(archive.tournaments[0].topCut[0].url, "https://play.limitlesstcg.com/tournament/new/player/winner/decklist");
});

test("skips Swiss-only, unfinished, and non-public-champion events, then limits the archive", () => {
  const tournaments = [
    tournament("ongoing", "2026-08-06T17:00:00.000Z"),
    tournament("swiss", "2026-08-05T17:00:00.000Z"),
    tournament("private-champion", "2026-08-04T17:00:00.000Z"),
    ...Array.from({ length: 3 }, (_, index) => tournament(`valid-${index}`, `2026-08-0${3 - index}T17:00:00.000Z`)),
  ];
  const standings = new Map([
    ["ongoing", [standing("ongoing-winner", null, [set("pikachu", "Pikachu")]), standing("ongoing-runner", 2)]],
    ["swiss", [standing("swiss-winner", 1, [set("pikachu", "Pikachu")])]],
    ["private-champion", [standing("private-winner", 1), standing("private-runner", 2, [set("raichu", "Raichu")])]],
    ...Array.from({ length: 3 }, (_, index) => [
      `valid-${index}`,
      [standing(`valid-${index}-winner`, 1, [set("raichu", "Raichu")])],
    ]),
  ]);
  const detailsByTournament = new Map([
    ["ongoing", details()],
    ["swiss", details({ phase: 1, type: "SWISS" })],
    ["private-champion", details()],
    ...Array.from({ length: 3 }, (_, index) => [`valid-${index}`, details()]),
  ]);
  const pairingsByTournament = new Map([
    ["ongoing", [{ phase: 2, match: "T2-1", player1: "ongoing-winner", player2: "ongoing-runner", winner: "ongoing-winner" }]],
    ["swiss", [{ phase: 1, player1: "swiss-winner", player2: "swiss-winner", winner: "swiss-winner" }]],
    ["private-champion", [{ phase: 2, match: "T2-1", player1: "private-winner", player2: "private-runner", winner: "private-winner" }]],
    ...Array.from({ length: 3 }, (_, index) => [
      `valid-${index}`,
      [{ phase: 2, match: "T2-1", player1: `valid-${index}-winner`, winner: `valid-${index}-winner` }],
    ]),
  ]);

  const archive = buildLimitlessTeamArchive(
    tournaments,
    detailsByTournament,
    standings,
    pairingsByTournament,
    { limit: 2 },
  );

  assert.deepEqual(archive.tournaments.map(({ id }) => id), ["valid-0", "valid-1"]);
});
