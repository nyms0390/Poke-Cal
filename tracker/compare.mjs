// Score turn-log.jsonl against a hand-made ground truth. Default: ladder-1/turn-log.md (turns 1–3), encoded
// below as events. --truth <file.json> scores another one instead ({about, game?, events: [...]}, e.g.
// truth/floette-g2.json); its `game` (or --game N) picks that game's events from a multi-game log, and only
// turns up to the last truth turn are scored. Truth events may leave out slots, and a turn may give
// `activeSet` (unordered [species, hp%] per side; hp null = not checked) instead of `active`.
// Usage: node compare.mjs <turn-log.jsonl> [--truth <file.json>] [--game N] [--until <seconds>]
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const truthFile = opt('--truth') ? JSON.parse(readFileSync(opt('--truth'), 'utf8')) : null;
const game = +(opt('--game') ?? truthFile?.game ?? NaN);
const until = opt('--until') ? +opt('--until') : truthFile ? Infinity : 339; // end of turn 3 (f0338 at 1 fps)
let got = readFileSync(args[0], 'utf8').trim().split('\n').map((l) => JSON.parse(l));
if (!Number.isNaN(game)) {
  const i = got.findIndex((e) => e.type === 'match' && e.game === game);
  if (i < 0) { console.log(`No game ${game} in ${args[0]}`); process.exit(1); }
  const j = got.findIndex((e, k) => k > i && e.type === 'match');
  got = got.slice(i, j < 0 ? undefined : j);
}
got = got.filter((e) => e.type === 'match' || e.t <= until);

const base = (s) => s?.replace(/-Mega.*/, '') ?? null;
// Ground truth from turn-log.md (turns 1–3). Turn n = which choose phase the event follows.
const truth = truthFile?.events ?? [
  { type: 'reveal', turn: 0, side: 'you', species: 'Politoed', ability: 'Drizzle' },
  { type: 'turn', turn: 1, field: { weather: 'rain', weatherTurns: 5 }, active: { you: { left: ['Politoed', 197, 197], right: ['Golisopod', 182, 182] }, opp: { left: ['Blastoise', 100], right: ['Maushold', 100] } } },
  { type: 'switch', turn: 1, side: 'you', slot: 'left', out: 'Politoed', in: 'Rillaboom' },
  { type: 'reveal', turn: 1, side: 'you', species: 'Rillaboom', ability: 'Grassy Surge' },
  { type: 'reveal', turn: 1, side: 'you', species: 'Golisopod', item: 'Golisopite' },
  { type: 'mega', turn: 1, side: 'you', slot: 'right', species: 'Golisopod' },
  { type: 'move', turn: 1, side: 'opp', slot: 'right', species: 'Maushold', move: 'Follow Me' },
  { type: 'move', turn: 1, side: 'you', slot: 'right', species: 'Golisopod', move: 'First Impression', targets: ['opp.right'] },
  { type: 'hp', turn: 1, side: 'opp', slot: 'right', species: 'Maushold', from: 100, to: 0 },
  { type: 'faint', turn: 1, side: 'opp', slot: 'right', species: 'Maushold' },
  { type: 'move', turn: 1, side: 'opp', slot: 'left', species: 'Blastoise', move: 'Shell Smash' },
  { type: 'stat', turn: 1, side: 'opp', slot: 'left', species: 'Blastoise', stages: { def: -1, spd: -1, atk: 2, spa: 2, spe: 2 } },
  { type: 'switch', turn: 1, side: 'opp', slot: 'right', out: null, in: 'Indeedee' },
  { type: 'reveal', turn: 1, side: 'opp', species: 'Indeedee', ability: 'Psychic Surge' },
  { type: 'turn', turn: 2, field: { weather: 'rain', weatherTurns: 4 }, active: { you: { left: ['Rillaboom', 207, 207], right: ['Golisopod', 182, 182] }, opp: { left: ['Blastoise', 100], right: ['Indeedee', 100] } } },
  { type: 'switch', turn: 2, side: 'you', slot: 'left', out: 'Rillaboom', in: 'Politoed' },
  { type: 'reveal', turn: 2, side: 'opp', species: 'Blastoise', item: 'Blastoisinite' },
  { type: 'mega', turn: 2, side: 'opp', slot: 'left', species: 'Blastoise' },
  { type: 'move', turn: 2, side: 'you', slot: 'right', species: 'Golisopod', move: 'Protect' },
  { type: 'move', turn: 2, side: 'opp', slot: 'left', species: 'Blastoise', move: 'Water Spout', targets: ['you.left', 'you.right'] },
  { type: 'hp', turn: 2, side: 'you', slot: 'left', species: 'Politoed', from: 197, to: 22, effect: 'resisted' },
  { type: 'reveal', turn: 2, side: 'you', species: 'Politoed', item: 'Sitrus Berry' },
  { type: 'hp', turn: 2, side: 'you', slot: 'left', species: 'Politoed', from: 22, to: 71, cause: 'item' },
  { type: 'move', turn: 2, side: 'opp', slot: 'right', species: 'Indeedee', move: 'Expanding Force', targets: ['you.left', 'you.right'] },
  { type: 'hp', turn: 2, side: 'you', slot: 'left', species: 'Politoed', from: 71, to: 0 },
  { type: 'faint', turn: 2, side: 'you', slot: 'left', species: 'Politoed' },
  { type: 'switch', turn: 2, side: 'you', slot: 'left', out: null, in: 'Rillaboom' },
  { type: 'turn', turn: 3, field: { weather: 'rain', weatherTurns: 3 }, active: { you: { left: ['Rillaboom', 207, 207], right: ['Golisopod', 182, 182] }, opp: { left: ['Blastoise', 100], right: ['Indeedee', 100] } } },
  { type: 'switch', turn: 3, side: 'opp', slot: 'left', out: 'Blastoise', in: 'Sneasler' },
  { type: 'move', turn: 3, side: 'you', slot: 'left', species: 'Rillaboom', move: 'Grassy Glide', targets: ['opp.left'] },
  { type: 'hp', turn: 3, side: 'opp', slot: 'left', species: 'Sneasler', from: 100, to: 61, effect: 'resisted' },
  { type: 'move', turn: 3, side: 'opp', slot: 'right', species: 'Indeedee', move: 'Expanding Force', targets: ['you.left'] },
  { type: 'hp', turn: 3, side: 'you', slot: 'left', species: 'Rillaboom', from: 207, to: 89, crit: true },
  { type: 'move', turn: 3, side: 'you', slot: 'right', species: 'Golisopod', move: 'U-turn', targets: ['opp.right'] },
  { type: 'hp', turn: 3, side: 'opp', slot: 'right', species: 'Indeedee', effect: 'super' },
  { type: 'faint', turn: 3, side: 'opp', slot: 'right', species: 'Indeedee' },
  { type: 'switch', turn: 3, side: 'you', slot: 'right', out: 'Golisopod', in: 'Basculegion' },
];

// Assign each got event to a turn by the turn events' times; score only up to the last truth turn.
let turn = 0;
const gotEvents = [];
const lastTurn = Math.max(...truth.map((t) => t.turn));
for (const e of got) {
  if (e.type === 'match') continue;
  if (e.type === 'turn') turn = e.n;
  if (truthFile && turn > lastTurn) break;
  gotEvents.push({ ...e, turn });
}

const key = (e) => {
  switch (e.type) {
    case 'move': return `move ${e.side} ${base(e.species)} ${e.move}`;
    case 'faint': return `faint ${e.side} ${base(e.species)}`;
    case 'switch': return `switch ${e.side} ${base(e.out) ?? '-'}>${e.in}`;
    case 'mega': return `mega ${e.side} ${base(e.species)}`;
    case 'reveal': return `reveal ${e.side} ${e.species} ${e.item ?? e.ability}`;
    case 'stat': return `stat ${e.side} ${base(e.species)}`;
    case 'hp': return `hp ${e.side} ${base(e.species)}`;
    case 'turn': return `turn ${e.turn}`;
    default: return e.type;
  }
};

// Greedy in-order matching per turn, by key; then compare details.
const used = new Set();
const rows = [];
for (const t of truth) {
  const cand = gotEvents.findIndex((g, i) => !used.has(i) && g.turn === t.turn && key(g) === key(t)
    && (t.type !== 'hp' || hpCompatible(g, t)));
  if (cand < 0) { rows.push({ t, g: null }); continue; }
  used.add(cand);
  rows.push({ t, g: gotEvents[cand], gi: cand });
}
function hpCompatible(g, t) {
  if (t.from != null && g.from != null) return g.from === t.from;
  return true;
}

const detailIssues = (t, g) => {
  const out = [];
  if (t.slot && g.slot !== t.slot) out.push(`slot ${g.slot ?? 'null'} (want ${t.slot})`);
  if (t.type === 'move' && t.targets && JSON.stringify([...(g.targets ?? [])].sort()) !== JSON.stringify([...t.targets].sort())) out.push(`targets ${JSON.stringify(g.targets)} (want ${JSON.stringify(t.targets)})`);
  if (t.type === 'stat' && JSON.stringify(sortObj(g.stages)) !== JSON.stringify(sortObj(t.stages))) out.push(`stages ${JSON.stringify(g.stages)} (want ${JSON.stringify(t.stages)})`);
  if (t.type === 'hp') {
    if (t.from != null && g.from !== t.from) out.push(`from ${g.from} (want ${t.from})`);
    if (t.to != null && g.to !== t.to) out.push(`to ${g.to} (want ${t.to})`);
    if (t.effect && g.effect !== t.effect) out.push(`effect ${g.effect} (want ${t.effect})`);
    if (t.crit && !g.crit) out.push('crit missing');
    if (t.cause && g.cause !== t.cause && !(t.cause === 'recoil' && g.cause === 'unknown')) out.push(`cause ${g.cause} (want ${t.cause})`);
  }
  if (t.type === 'end' && g.winner !== t.winner) out.push(`winner ${g.winner} (want ${t.winner})`);
  if (t.type === 'switch' && (t.slot !== g.slot)) {} // covered by slot
  if (t.type === 'turn' && t.activeSet) {
    for (const side of ['you', 'opp']) {
      const want = t.activeSet[side];
      const have = Object.values(g.active?.[side] ?? {}).map((a) => [a.species, a.hp?.pct ?? a.hp?.cur ?? null]);
      for (const [sp, hp] of want) {
        const h = have.find(([s]) => s === sp);
        if (!h) out.push(`${side} ${sp} missing`);
        else if (hp != null && h[1] !== hp) out.push(`${side} ${sp} hp ${h[1]} (want ${hp})`);
      }
      for (const [s] of have) if (!want.some(([sp]) => sp === s)) out.push(`${side} extra ${s}`);
    }
  } else if (t.type === 'turn') {
    if (g.field?.weather !== t.field.weather) out.push(`weather ${g.field?.weather}`);
    if (g.field?.weatherTurns !== t.field.weatherTurns) out.push(`weatherTurns ${g.field?.weatherTurns} (want ${t.field.weatherTurns})`);
    for (const side of ['you', 'opp']) for (const slot of ['left', 'right']) {
      const [sp, a, b] = t.active[side][slot];
      const ga = g.active?.[side]?.[slot];
      if (!ga) { out.push(`${side}.${slot} missing`); continue; }
      if (ga.species !== sp) out.push(`${side}.${slot} species ${ga.species} (want ${sp})`);
      const hp = side === 'you' ? `${ga.hp?.cur}/${ga.hp?.max}` : `${ga.hp?.pct}`;
      const want = side === 'you' ? `${a}/${b}` : `${a}`;
      if (hp !== want) out.push(`${side}.${slot} hp ${hp} (want ${want})`);
    }
  }
  return out;
};
const sortObj = (o) => Object.fromEntries(Object.entries(o ?? {}).sort());

// Order of moves: longest common subsequence of move keys.
const lcs = (a, b) => {
  const d = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = a[i - 1] === b[j - 1] ? d[i - 1][j - 1] + 1 : Math.max(d[i - 1][j], d[i][j - 1]);
  return d[a.length][b.length];
};

const byType = {};
for (const r of rows) {
  const ty = r.t.type;
  byType[ty] ??= { truth: 0, found: 0, exact: 0, got: 0 };
  byType[ty].truth++;
  if (r.g) { byType[ty].found++; if (!detailIssues(r.t, r.g).length) byType[ty].exact++; }
}
for (const [i, g] of gotEvents.entries()) {
  byType[g.type] ??= { truth: 0, found: 0, exact: 0, got: 0 };
  byType[g.type].got++;
}

console.log(truthFile ? `Game ${game}, turns ${Math.min(...truth.map((t) => t.turn))}–${lastTurn} (${opt('--truth')})\n` : `Events up to t=${until}s (turns 1–3)\n`);
console.log('| type | truth | found | exact | emitted | recall | precision |');
console.log('|---|---|---|---|---|---|---|');
let T = 0, F = 0, E = 0, G = 0;
for (const [ty, s] of Object.entries(byType)) {
  T += s.truth; F += s.found; E += s.exact; G += s.got;
  console.log(`| ${ty} | ${s.truth} | ${s.found} | ${s.exact} | ${s.got} | ${s.truth ? Math.round(100 * s.found / s.truth) + '%' : '–'} | ${s.got ? Math.round(100 * s.found / s.got) + '%' : '–'} |`);
}
console.log(`| **all** | ${T} | ${F} | ${E} | ${G} | ${Math.round(100 * F / T)}% | ${Math.round(100 * F / G)}% |`);

const tm = truth.filter((t) => t.type === 'move').map(key), gm = gotEvents.filter((g) => g.type === 'move').map(key);
console.log(`\nMove order: ${lcs(tm, gm)}/${tm.length} truth moves in the right relative order (LCS); ${gm.length} moves emitted.`);

console.log('\nMisses (in truth, not emitted):');
for (const r of rows) if (!r.g) console.log(`- T${r.t.turn} ${key(r.t)}`);
console.log('\nFound with wrong details:');
for (const r of rows) if (r.g) { const d = detailIssues(r.t, r.g); if (d.length) console.log(`- T${r.t.turn} ${key(r.t)} @${r.g.t}s: ${d.join('; ')}`); }
console.log('\nFalse / extra events (emitted, not in truth):');
for (const [i, g] of gotEvents.entries()) if (!used.has(i)) console.log(`- T${g.turn} ${key(g)} @${g.t}s conf=${g.conf} raw=${JSON.stringify(g.raw)}`);
