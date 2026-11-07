// Replays the battle tracker's saved OCR fixtures through tracker/parse.mjs and
// checks the turn log matches the saved one, so parser changes show up as diffs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const trackerDir = fileURLToPath(new URL('../tracker/', import.meta.url));

function readLog(path) {
  return readFileSync(path, 'utf8').split('\n').filter(Boolean).map((line) => {
    const event = JSON.parse(line);
    delete event.video;
    return event;
  });
}

for (const fixture of ['live-1', 'ipad-ladder-1', 'floette-window2', 'live-2']) {
  test(`tracker parse matches the saved turn log: ${fixture}`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'pokecal-tracker-'));
    try {
      const out = join(dir, 'turn-log.jsonl');
      execFileSync(process.execPath, ['parse.mjs', join('fixtures', fixture, 'ocr.jsonl'), out], { cwd: trackerDir, stdio: 'pipe' });
      assert.deepEqual(readLog(out), readLog(join(trackerDir, 'fixtures', fixture, 'turn-log.jsonl')));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

// live-2: a ladder session captured live (two matches). The owner forfeited the first; the opponent forfeited the second.
test("a live session splits into one log per match, ending on forfeits", () => {
  const log = readLog(join(trackerDir, 'fixtures', 'live-2', 'turn-log.jsonl'));
  const matches = log.filter((e) => e.type === 'match');
  const ends = log.filter((e) => e.type === 'end');
  assert.deepEqual(matches.map((m) => [m.game, m.players.you]), [[1, 'nyms'], [2, 'nyms']]);
  assert.equal(matches[1].players.opp, 'Sannoke');
  assert.deepEqual(ends.map((e) => [e.winner, e.forfeit]), [['opp', true], ['you', true]]);
  // Turns restart in each match and start after the leads are sent out.
  const turnsPerGame = matches.map((m, i) => log.slice(log.indexOf(m), matches[i + 1] ? log.indexOf(matches[i + 1]) : undefined).filter((e) => e.type === 'turn').map((e) => e.n));
  assert.deepEqual(turnsPerGame, [[1], [1, 2, 3, 4]]);
  // Head Smash settles 風速狗 as Arcanine-Hisui; 生命被削減 is Life Orb, 反作用力 is recoil.
  assert.ok(log.some((e) => e.type === 'move' && e.move === 'Head Smash' && e.species === 'Arcanine-Hisui'));
  assert.ok(!log.some((e) => e.species === 'Arcanine' || e.in === 'Arcanine'));
  assert.ok(log.some((e) => e.type === 'hp' && e.species === 'Gholdengo' && e.cause === 'item' && e.item === 'Life Orb'));
  assert.ok(log.some((e) => e.type === 'hp' && e.species === 'Salamence-Mega' && e.cause === 'recoil'));
  // Malamar set Trick Room on turn 1, so turns 2-4 run under it with 4, 3 and 2 turns left.
  const game2Turns = log.filter((e) => e.type === 'turn').slice(1);
  assert.deepEqual(game2Turns.map((e) => [e.n, e.field.trickRoom ?? false, e.field.trickRoomTurns]), [[1, false, undefined], [2, true, 4], [3, true, 3], [4, true, 2]]);
});
