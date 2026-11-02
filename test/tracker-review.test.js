// The battle tracker's review step: turn-log readings checked against listed opponent sets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatReview, loadContext, opponentCandidates, reviewLog } from '../tracker/review.mjs';

const ctx = loadContext();
const POLITOED = 'Politoed @ Sitrus Berry\nAbility: Drizzle\nSPs: 32 HP / 12 Def / 22 SpA\nModest Nature\n- Protect\n';
const event = (e) => ({ conf: 'sure', ...e });

function waterSpoutLog({ shellSmash }) {
  return [
    event({ type: 'match', players: { you: 'me', opp: 'them' }, yourTeam: 'Politoed @ Sitrus Berry' }),
    event({ type: 'turn', n: 2, field: { weather: 'rain' }, active: {
      you: { left: { species: 'Politoed', hp: { cur: 197, max: 197 } } },
      opp: { left: { species: 'Blastoise', hp: { pct: 100 } } },
    } }),
    ...(shellSmash ? [event({ type: 'stat', side: 'opp', slot: 'left', species: 'Blastoise', stages: { def: -1, spd: -1, atk: 2, spa: 2, spe: 2 } })] : []),
    event({ type: 'mega', side: 'opp', slot: 'left', species: 'Blastoise', form: 'Blastoise-Mega' }),
    event({ type: 'move', side: 'opp', slot: 'left', species: 'Blastoise-Mega', move: 'Water Spout', targets: ['you.left', 'you.right'] }),
    event({ type: 'hp', side: 'you', slot: 'left', species: 'Politoed', from: 197, to: 22, unit: 'hp', cause: 'move', effect: 'resisted' }),
  ];
}

test('opponent candidates cover every listed spread with the revealed item', () => {
  const candidates = opponentCandidates(ctx, 'Sneasler', { item: 'White Herb' });
  assert.ok(candidates.length >= 5);
  assert.ok(candidates.every((c) => c.item === 'White Herb'));
  assert.ok(Math.abs(candidates.reduce((a, c) => a + c.share, 0) - 1) < 1e-9);
});

test('stat stages carry over Mega Evolution, so a +2 Water Spout fits the listed sets', () => {
  const review = reviewLog(ctx, waterSpoutLog({ shellSmash: true }), { teamPaste: POLITOED });
  const blastoise = review.verdicts.find((v) => v.species === 'Blastoise-Mega');
  assert.ok(blastoise.fitting.length > 0);
  assert.equal(blastoise.checks[0].assumed, false);
});

test('without the boost the same hit fits no listed set', () => {
  const review = reviewLog(ctx, waterSpoutLog({ shellSmash: false }), { teamPaste: POLITOED });
  const blastoise = review.verdicts.find((v) => v.species === 'Blastoise-Mega');
  assert.equal(blastoise.fitting.length, 0);
  assert.match(formatReview(review), /No listed set fits every reading/);
});

test('readings that depend on an assumed set of yours are shown but not counted', () => {
  const review = reviewLog(ctx, waterSpoutLog({ shellSmash: false }));
  const blastoise = review.verdicts.find((v) => v.species === 'Blastoise-Mega');
  assert.equal(blastoise.checks[0].assumed, true);
  assert.equal(blastoise.fitting.length, blastoise.total);
  assert.match(formatReview(review), /Pass `--team`/);
});

test('move order checks Speed only between moves of the same known priority', () => {
  const log = [
    event({ type: 'match', yourTeam: 'Politoed @ Sitrus Berry' }),
    event({ type: 'turn', n: 1, field: {}, active: {
      you: { left: { species: 'Politoed', hp: { cur: 197, max: 197 } } },
      opp: { left: { species: 'Garchomp', hp: { pct: 100 } }, right: { species: 'Maushold', hp: { pct: 100 } } },
    } }),
    event({ type: 'move', side: 'opp', slot: 'right', species: 'Maushold', move: 'Follow Me', targets: [] }),
    event({ type: 'move', side: 'you', slot: 'left', species: 'Politoed', move: 'Ice Beam', targets: ['opp.left'] }),
    event({ type: 'move', side: 'opp', slot: 'left', species: 'Garchomp', move: 'Earthquake', targets: ['you.left', 'opp.right'] }),
  ];
  const review = reviewLog(ctx, log, { teamPaste: POLITOED });
  const garchomp = review.verdicts.find((v) => v.species === 'Garchomp');
  assert.equal(garchomp.checks.length, 1);
  assert.equal(garchomp.checks[0].kind, 'speed');
  // Politoed (no Speed SP) outsped Garchomp: only sets slower than it fit, and none are listed.
  assert.equal(garchomp.fitting.length, 0);
  assert.equal(review.verdicts.some((v) => v.species === 'Maushold'), false);
});

test('the live match with the real team narrows Kingambit to fast sets and rules out max-Attack Life Orb Garchomp', async () => {
  const { readFileSync } = await import('node:fs');
  const dir = new URL('../tracker/fixtures/live-1/', import.meta.url);
  const events = readFileSync(new URL('turn-log.jsonl', dir), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const review = reviewLog(ctx, events, { teamPaste: readFileSync(new URL('team.txt', dir), 'utf8') });
  assert.ok(review.own.every((o) => o.source === 'paste' && !o.note));
  const kingambit = review.verdicts.find((v) => v.species === 'Kingambit');
  assert.ok(kingambit.fitting.length > 0);
  assert.ok(kingambit.fitting.every((c) => c.state.sp.spe === 32));
  const garchomp = review.verdicts.find((v) => v.species === 'Garchomp');
  assert.equal(garchomp.fitting[0].item, 'Choice Scarf');
  assert.ok(garchomp.ruledOut.some((c) => c.item === 'Life Orb'));
});
