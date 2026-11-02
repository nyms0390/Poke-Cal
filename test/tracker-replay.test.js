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

for (const fixture of ['live-1', 'ipad-ladder-1', 'floette-window2']) {
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
