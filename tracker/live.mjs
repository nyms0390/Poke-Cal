// Live turn log: runs `fasttrack --live` on one window, appends its OCR lines to <outdir>/ocr.jsonl as they
// come, re-runs parse.mjs every 2 s while new lines arrive, and prints one console line per new turn-log event
// ("T2 opp Blastoise used Water Spout → you.left, you.right"). An event whose details fill in later (HP once the
// next choose screen shows the plates) prints again as "↳ …". Stops on Ctrl-C, when the window goes away, or
// 3 s after a win/lose message; then a final parse writes turn-log.jsonl and live-stats.json (latency per event
// type: console time minus the time the message settled on screen). When it ends on its own (win/lose message,
// --duration) it prints "Done — turn log at …" and plays a short system sound.
// Stops on Ctrl-C, SIGTERM, SIGHUP (terminal closed) or a failed print (terminal gone) too; fasttrack gets SIGINT, and
// SIGKILL if it is still running 4 s later (or on a second Ctrl-C).
// Usage (run-live.sh does this): node live.mjs <fasttrack binary> <outdir> [fasttrack --live options]
//        node live.mjs --replay <ocr.jsonl> <outdir> [--speed 10]   feeds a saved ocr.jsonl at its own timing
//        (× speed) instead of capturing, to check the console and the auto-stop offline
//        --quiet (or POKECAL_QUIET=1): no sound at the end, for replays and tests
//        --matches N: stop 3 s after the Nth match ends (default 1); --matches 0 runs until Ctrl-C
import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const replay = argv[0] === '--replay';
const quiet = argv.includes('--quiet') || !!process.env.POKECAL_QUIET;
// --matches N: stop after N matches end (default 1); 0 keeps going until Ctrl-C, for a ladder session.
const mi = argv.indexOf('--matches');
const matchLimit = mi >= 0 ? Number(argv[mi + 1]) : 1;
const [bin, out, ...rest] = (replay ? argv.slice(1) : argv).filter((a, i, all) => a !== '--quiet' && a !== '--matches' && all[i - 1] !== '--matches');
const here = fileURLToPath(new URL('.', import.meta.url));
// Replay feeder: prints the saved lines at t / speed s, then keeps running like a capture until stopped (gives up 30 s on).
const FEED = `const [p, k] = process.argv.slice(1), rows = require('fs').readFileSync(p, 'utf8').trim().split('\\n');
process.on('SIGINT', () => process.exit(0));
const t0 = Date.now(); let i = 0;
const tick = setInterval(() => { const now = (Date.now() - t0) / 1000 * k;
  while (i < rows.length && (i === 0 || (JSON.parse(rows[i]).t ?? 0) <= now)) console.log(rows[i++]);
  if (i >= rows.length) { clearInterval(tick); setTimeout(() => { console.error('replay: not stopped 30 s after the last line'); process.exit(2); }, 30000); } }, 50);`;
const speed = rest.includes('--speed') ? +rest[rest.indexOf('--speed') + 1] : 10;
const ocrPath = `${out}/ocr.jsonl`, logPath = `${out}/turn-log.jsonl`;
const window = replay ? 'replay' : rest.includes('--window') ? rest[rest.indexOf('--window') + 1] : rest.includes('--display') ? 'display' : 'window';

const ocr = createWriteStream(ocrPath);
const child = replay
  ? spawn(process.execPath, ['-e', FEED, bin, String(speed)], { stdio: ['ignore', 'pipe', 'inherit'] })
  : spawn(bin, ['--live', '--profiles', `${here}profiles`, '--content-png', `${out}/content.png`, ...rest], { stdio: ['ignore', 'pipe', 'inherit'] });
child.stdout.pipe(ocr);

let liveStart = null, lastSize = 0, ended = false, stopping = false, userStop = false, endsSeen = 0;
const printed = new Map(); // event key -> printed line
const latency = {}; // type -> [seconds]

const side = (e) => (e.side ? `${e.side}${e.slot ? `.${e.slot}` : ''}` : '');
const hpOf = (h) => (h == null ? '?' : h.pct != null ? `${h.pct}%` : `${h.cur}/${h.max}`);
const unit = (e, v) => (v == null ? '?' : e.unit === 'pct' ? `${v}%` : `${v}`);
function describe(e) {
  switch (e.type) {
    case 'match': return `match: ${e.players?.you ?? '?'} vs ${e.players?.opp ?? '?'}; team ${e.yourTeam.split('\n\n').map((s) => s.split(' @ ')[0]).join(', ') || '?'}`;
    case 'turn': {
      const a = e.active ?? {};
      const team = (s) => ['left', 'right'].map((k) => a[s]?.[k] && `${a[s][k].species} ${hpOf(a[s][k].hp)}`).filter(Boolean).join(', ');
      const f = e.field ?? {};
      const field = [f.weather && `${f.weather}${f.weatherTurns ? ` ${f.weatherTurns}` : ''}`, f.terrain && `${f.terrain}${f.terrainTurns ? ` ${f.terrainTurns}` : ''}`].filter(Boolean).join(', ');
      return `begins: you ${team('you')} | opp ${team('opp')}${field ? ` | ${field}` : ''}`;
    }
    case 'move': return `${side(e)} ${e.species} used ${e.move}${e.targets?.length ? ` → ${e.targets.join(', ')}` : ''}`;
    case 'switch': return `${side(e)} ${e.out ?? '–'} → ${e.in}`;
    case 'reveal': return `${e.side} ${e.species}${e.ability ? ` ability ${e.ability}` : ''}${e.item ? ` item ${e.item}` : ''}`;
    case 'mega': return `${side(e)} ${e.species} Mega Evolved`;
    case 'hp': return `${side(e) || '?'} ${e.species ?? '?'} HP ${unit(e, e.from)} → ${unit(e, e.to)}${e.crit ? ' (crit)' : ''}${e.effect ? ` (${e.effect})` : ''}${e.cause && e.cause !== 'move' ? ` [${e.cause}${e.item ? ` ${e.item}` : ''}]` : ''}`;
    case 'faint': return `${side(e)} ${e.species} fainted`;
    case 'stat': return `${side(e)} ${e.species} ${Object.entries(e.stages ?? {}).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`).join(', ')}`;
    case 'end': return `game over: ${e.winner === 'you' ? 'you won' : e.winner === 'opp' ? 'you lost' : 'result unknown'}${e.forfeit ? ' (forfeit)' : ''}`;
    default: return `${side(e)} ${e.type} ${JSON.stringify(Object.fromEntries(Object.entries(e).filter(([k]) => !['t', 'src', 'conf', 'raw', 'type', 'side', 'slot'].includes(k))))}`;
  }
}

function parse() {
  const r = spawnSync(process.execPath, [`${here}parse.mjs`, ocrPath, logPath, '--video', `live:${window}`], { encoding: 'utf8' });
  if (r.status !== 0 || !existsSync(logPath)) return [];
  try { return readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; }
}

function update() {
  if (!existsSync(ocrPath)) return;
  const size = statSync(ocrPath).size;
  if (size === lastSize) return;
  lastSize = size;
  const text = readFileSync(ocrPath, 'utf8');
  if (liveStart == null) liveStart = JSON.parse(text.split('\n')[0] || '{}').liveStart ?? null;
  if (text.split('\n').length < 3) return;
  const now = Date.now() / 1000;
  let turn = 0, game = 1;
  for (const e of parse()) {
    if (e.type === 'turn') turn = e.n;
    if (e.type === 'match') game = e.game ?? 1;
    const key = e.type === 'match' ? `match|${game}` : `${e.type}|${e.t}|${e.side ?? ''}|${e.slot ?? ''}|${game}|${e.n ?? ''}`;
    const line = `${e.type === 'match' ? '' : `T${turn} `}${describe(e)}`;
    const old = printed.get(key);
    if (old === line) continue;
    printed.set(key, line);
    if (old != null) { console.log(`  ↳ ${line}`); continue; }
    const lat = liveStart != null && e.type !== 'match' ? now - (liveStart + e.t) : null;
    if (lat != null) (latency[e.type] ??= []).push(+lat.toFixed(2));
    console.log(`${line}${lat != null ? `   (+${lat.toFixed(1)} s)` : ''}`);
    if (e.type === 'end' && !ended && matchLimit > 0 && ++endsSeen >= matchLimit) {
      ended = true;
      setTimeout(stop, 3000);
    }
  }
}

function stop() {
  if (stopping) { child.kill('SIGKILL'); return; }
  stopping = true;
  child.kill('SIGINT');
  setTimeout(() => child.kill('SIGKILL'), 4000).unref();
}
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { userStop = true; stop(); });
// A terminal that went away without a SIGHUP fails the next print (EIO): stop, and still write the turn log.
process.stdout.on('error', () => { userStop = true; stop(); });

const timer = setInterval(update, 2000);
child.on('close', (code) => {
  clearInterval(timer);
  const done = () => {
    lastSize = -1;
    update();
    const stats = Object.fromEntries(Object.entries(latency).map(([k, v]) => {
      const s = [...v].sort((a, b) => a - b);
      return [k, { n: s.length, median: s[Math.floor(s.length / 2)], p90: s[Math.floor(s.length * 0.9)], max: s.at(-1) }];
    }));
    writeFileSync(`${out}/live-stats.json`, JSON.stringify({ liveStart, latency: stats, samples: latency }, null, 1) + '\n');
    console.log(`\nturn log: ${logPath} (${printed.size} events); latency per type in ${out}/live-stats.json`);
    console.log(`Done — turn log at ${logPath}${ended ? '' : ' (no win/lose message seen)'}`);
    if (!userStop && !quiet) spawnSync('afplay', ['/System/Library/Sounds/Glass.aiff']);
    process.exit(code ?? 0);
  };
  if (ocr.writableFinished) done(); else ocr.on('finish', done);
});
