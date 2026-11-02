// OCR JSON lines (ocr.swift / fasttrack.swift) -> turn log JSON lines (docs/battle-tracker.md "Turn log format").
// Usage: node parse.mjs <ocr.jsonl> <turn-log.jsonl> [--repo <PokéCal checkout, default: the one holding tracker/>] [--video <name>] [--profile <name|path>]
// The source profile (profiles/*.json) comes from --profile, else fasttrack's header line, else ipad-zh.
// It sets the message language (zh-TW or en templates), how own HP reads (hp or pct) and whether the
// video is split into games (one match event per game).
// No dependencies. Code only: regex templates + catalog fuzzy matching.
import { readFileSync, writeFileSync } from 'node:fs';
import { loadLexicon, match, levenshtein, megaForm } from './lexicon.mjs';
import * as zh from './templates.mjs';
import * as en from './templates-en.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const [inPath, outPath] = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
const repo = opt('--repo', undefined);
const lex = loadLexicon(repo);
const rows = readFileSync(inPath, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const allFrames = rows.filter((r) => r.regions);
const profileArg = opt('--profile', rows.find((r) => r.profile)?.profile ?? 'ipad-zh');
const profile = JSON.parse(readFileSync(profileArg.endsWith('.json') ? profileArg : new URL(`./profiles/${profileArg}.json`, import.meta.url), 'utf8'));
const EN = profile.language === 'en';
const { TEMPLATES, STAT_NAMES, STAT_AMOUNTS } = EN ? en : zh;
const bannerRegions = (profile.banners ?? [{ name: 'ability' }]).map((b) => b.name);
// Own HP as cur/max (iPad, own side) or % (broadcast: both sides).
const pctSide = (side) => side === 'opp' || profile.ownHp === 'pct';
const unitOf = (side) => (pctSide(side) ? 'pct' : 'hp');

const CJK = /[㐀-鿿]/g;
const cjkCount = (s) => (s.match(CJK) ?? []).length;
const letters = (s) => (s.match(/[A-Za-z]/g) ?? []).length;
const lines = (f, region) => f.regions[region] ?? [];
const text = (f, region) => lines(f, region).map((l) => l.text).join('');
// English send-out lines add a trainer title: "Floette the Champion-Tiered", "Incineroar the Great Friend".
const PIVOTS = new Set(['U-turn', 'Volt Switch', 'Flip Turn', 'Parting Shot', 'Teleport', 'Baton Pass', 'Shed Tail', 'Chilly Reception']);
// zh-TW send-out/win lines may show a generic title instead of the player's name: never take it as the name.
const GENERIC_PLAYER = /^(?:訓練家|對手|寶可夢訓練家|Trainer|Opponent)$/;
// Catalog move data (target type, category) by English name.
const MOVE_DATA = new Map(lex.moves.entries.map((m) => [m.name, m]));
const SINGLE_TARGET = new Set(['normal', 'any', 'adjacentFoe', 'randomNormal', 'adjacentAlly', 'adjacentAllyOrSelf', 'scripted']);
const SPREAD_TARGET = new Set(['allAdjacent', 'allAdjacentFoes']);
const NO_TARGET = new Set(['self', 'allySide', 'foeSide', 'all', 'allyTeam']);
const stripTitle = (s) => s.replace(/\s+the\s+[A-Z][\w’'-]*(?:\s+[A-Z][\w’'-]*)*\s*$/, '').trim();

function parseGame(frames, game, { sentencesOnly = false } = {}) {
  // ---------- 1. team preview: own names + items, player names ----------
  const preview = { you: [], players: {} };
  {
    const pf = frames.filter((f) => lines(f, 'preview_own').filter((l) => cjkCount(l.text) >= 2).length >= 8);
    // Each slot is a species line then an item line (pick numbers 1–4 show as lone digits).
    // Vote per slot across all preview frames.
    const slots = new Map(); // species -> Map(item -> count)
    const order = [];
    for (const f of pf) {
      const ls = lines(f, 'preview_own').filter((l) => !/^\s*\d\s*$/.test(l.text));
      for (let i = 0; i < ls.length - 1; i++) {
        const sp = match(lex.pokemon, ls[i].text);
        if (!sp || sp.dist > 1) continue;
        const im = match(lex.items, ls[i + 1].text);
        if (!slots.has(sp.name)) { slots.set(sp.name, new Map()); order.push(sp.name); }
        const k = im?.name ?? '';
        slots.get(sp.name).set(k, (slots.get(sp.name).get(k) ?? 0) + 1);
        if (im) i++;
      }
    }
    for (const sp of order) {
      const item = [...slots.get(sp)].sort((x, y) => y[1] - x[1])[0][0] || null;
      preview.you.push({ species: sp, item, raw: `${sp}: ${[...slots.get(sp)].map(([k, n]) => `${k || '?'}×${n}`).join(', ')}` });
    }
    const last = pf.at(-1);
    if (last) {
      preview.players.you = mode(pf.map((f) => text(f, 'preview_name').trim()).filter(Boolean));
      preview.t = pf[0].t;
    }
  }

  // ---------- 2. message sentences with dedupe ----------
  // A frame's message = message-region lines with real text, joined; sentences end with ！ or 。
  // (English: lines joined with spaces, sentences end with ! or .)
  const JUNK = /^[•·@©®0-9:：\s\-—|()（）]+$/;
  const frameLines = (f) => lines(f, 'msg')
    .filter((l) => !JUNK.test(l.text) && (cjkCount(l.text) >= 2 || /[A-Za-z]{3,}/.test(l.text)))
    .map((l) => (EN ? l.text.replace(/\s+/g, ' ').trim() : l.text.replace(/\s+/g, '')));
  const joinLines = (ls) => ls.join(EN ? ' ' : '').replace(/\bSp\.\s*(Atk|Def)/g, 'Sp.$1'); // keep "Sp. Atk" from ending a sentence
  const END = EN ? /[!.…]$/ : /[！。!…]$/;
  // "上吧！X！" / "去吧！X！" / "Go! X!" are one message: glue the call-out to the name after it.
  const splitSentences = (s) => (s.match(EN ? /(?:[^!.]|\.(?=[A-Za-z]))+[!.]/g : /[^！。!…]+[！。!…]+/g) ?? []).map((p) => p.trim()).reduce((acc, part) => {
    if (acc.length && /^(?:上吧|去吧|就決定是你了|Go)[！!]$/.test(acc.at(-1))) acc[acc.length - 1] += (EN ? ' ' : '') + part;
    else acc.push(part);
    return acc;
  }, []);
  const norm = (s) => s.replace(/[！。!，,\s]/g, '');
  const near = (a, b) => {
    const A = norm(a), B = norm(b);
    if (!A || !B) return false;
    if (A.startsWith(B) || B.startsWith(A)) return true;
    return levenshtein(A, B) <= Math.max(1, Math.floor(Math.min(A.length, B.length) * 0.2));
  };

  const sentences = []; // {text, t, frame, last}
  const tails = []; // text after the last sentence end in a frame: {text, t, frame}
  let prev = null; // previous frame with message lines: {ls, t}
  for (const f of frames) {
    let ls = frameLines(f);
    if (!ls.length) continue;
    // The two-line box scrolls a long message: the old 2nd line moves up ("對手的大狃拉和 / 對手的烈咬陸鯊的" then
    // "對手的烈咬陸鯊的 / 攻擊降低了！"). When this frame starts with the previous frame's last line and that frame
    // ended mid-sentence, read the two as one message.
    const own = ls;
    if (prev && prev.ls.length >= 2 && f.t - prev.t <= 2 && !END.test(joinLines(prev.ls))
      && levenshtein(ls[0], prev.ls.at(-1)) <= Math.floor(ls[0].length * 0.2)) ls = [...prev.ls.slice(0, -1), ...ls];
    prev = { ls: own, t: f.t };
    const msg = joinLines(ls);
    const parts = splitSentences(msg);
    const rest = msg.match(EN ? /(?:[^!.…]|\.(?=[A-Za-z]))+$/ : /[^！。!…]+$/)?.[0].trim();
    if (rest) tails.push({ text: rest, t: f.t, frame: f.frame });
    for (const s of parts) {
      if (EN ? letters(s) < 6 : cjkCount(s) < 3) continue;
      const recent = sentences.filter((x) => f.t - x.last <= 2.5);
      const dup = recent.find((x) => near(x.text, s));
      if (dup) {
        dup.last = f.t;
        if (norm(s).length > norm(dup.text).length) dup.text = s; // keep the longest stable version
        dup.reads.push(s);
      } else {
        sentences.push({ text: s, t: f.t, last: f.t, frame: f.frame, reads: [s] });
      }
    }
  }
  // A message read only without its final ！ (read while the last glyph typed, or OCR dropped it, e.g.
  // "紅蓮鎧騎的防禦、特防降低了", or "對手的仆斬將軍倒" for 倒下了！): if no complete read of it exists nearby,
  // accept it when it matches a template once completed. Marked `partial` (its events are at most "likely").
  for (const tail of tails) {
    if (EN ? letters(tail.text) < 6 : cjkCount(tail.text) < 3) continue;
    if (sentences.some((x) => Math.abs(x.t - tail.t) <= 3 && near(x.text, tail.text))) continue;
    const cands = EN ? [`${tail.text}!`] : [`${tail.text}！`, tail.text.replace(/倒(?:下了?)?$/, '倒下了！')];
    const text = cands.find((c) => TEMPLATES.some((tp) => tp.resolves && tp.re.test(c)));
    if (!text) continue;
    const dup = sentences.find((x) => x.partial && tail.t - x.last <= 2.5 && near(x.text, text));
    if (dup) { dup.last = tail.t; dup.reads.push(text); continue; }
    sentences.push({ text, t: tail.t, last: tail.t, frame: tail.frame, reads: [text], partial: true, rawRead: tail.text });
  }
  sentences.sort((a, b) => a.t - b.t);
  // Prefer the most frequent full read (typing partials are shorter and rarer).
  for (const s of sentences) {
    const tally = new Map();
    for (const r of s.reads) tally.set(r, (tally.get(r) ?? 0) + 1);
    const top = [...tally].sort((a, b) => b[1] - a[1] || norm(b[0]).length - norm(a[0]).length)[0][0];
    if (norm(top).length >= norm(s.text).length - 1) s.text = top;
  }

  if (sentencesOnly) return { sentences };

  // ---------- 3. choose screens -> turns ----------
  const isChoose = (f) => {
    if (typeof f.choose === 'boolean') return f.choose; // fasttrack.swift: detected from pixels, move list not OCRed
    const moveHits = lines(f, 'moves').filter((l) => cjkCount(l.text) >= 2 && match(lex.moves, l.text.replace(/^[^㐀-鿿]+/, ''))?.dist <= 1).length;
    return moveHits >= 3;
  };
  const chooseFrames = frames.filter(isChoose);
  // A new turn starts at the first choose frame after at least one battle message since the last choose frame.
  const turns = [];
  {
    let lastChoose = -Infinity;
    for (const f of chooseFrames) {
      const msgsBetween = sentences.filter((s) => s.t > lastChoose && s.t < f.t && TEMPLATES.some((tp) => tp.re.test(s.text) && tp.resolves));
      if (!turns.length || msgsBetween.length) turns.push({ n: turns.length + 1, t: f.t, frames: [] });
      turns.at(-1).frames.push(f);
      lastChoose = f.t;
    }
  }

  // ---------- known species so far (for fuzzy preference) ----------
  const known = { you: preview.you.map((p) => p.species), opp: [] };
  const ownMax = {}; // species -> max HP

  function parseOwnHp(raw, species) {
    const groups = raw.split(/[^0-9]+/).filter(Boolean);
    const digits = groups.join('');
    const max = ownMax[species];
    if (!max) {
      // full-HP read: A sep A (sep read as a digit) or A/A
      if (groups.length === 2 && groups[1].endsWith(groups[0])) return { cur: +groups[0], max: +groups[0], learned: true };
      const n = digits.length;
      if (n % 2 === 1 && n >= 5) {
        const k = (n - 1) / 2;
        if (digits.slice(0, k) === digits.slice(k + 1)) return { cur: +digits.slice(0, k), max: +digits.slice(k + 1), learned: true };
      }
      return null;
    }
    const M = String(max);
    if (groups.length === 2 && groups[1].endsWith(M)) {
      const cur = +groups[0];
      if (cur <= max) return { cur, max };
    }
    if (!digits.endsWith(M)) return null;
    let rest = digits.slice(0, -M.length);
    if (!rest) return null;
    if (+rest > max || rest.length > M.length) rest = rest.slice(0, -1); // drop the separator read as a digit
    if (!rest || +rest > max) return null;
    return { cur: +rest, max };
  }
  function parseOppPct(raw) {
    const m = raw.match(/\d+/);
    if (!m) return null;
    let v = +m[0];
    if (v > 100 && m[0].startsWith('7')) v = +('1' + m[0].slice(1)); // 1 read as 7
    return v >= 0 && v <= 100 ? v : null;
  }

  function plateSpecies(f, side, slot) {
    const ls = lines(f, `${side}_${slot}`).filter((l) => (EN ? letters(l.text) >= 3 : cjkCount(l.text) >= 2));
    for (const l of ls) {
      const m = match(lex.pokemon, EN ? l.text.replace(/[^A-Za-z.'’ -]/g, '').trim() : l.text.replace(/[^㐀-鿿]/g, ''), { prefer: known[side] });
      if (m) return { ...m, raw: l.text };
    }
    return null;
  }

  function turnSnapshot(turn) {
    const active = { you: {}, opp: {} };
    const raws = [];
    for (const side of ['you', 'opp']) {
      for (const slot of ['left', 'right']) {
        const votes = new Map();
        const hps = [];
        for (const f of turn.frames) {
          const sp = plateSpecies(f, side, slot);
          if (sp) votes.set(sp.name, (votes.get(sp.name) ?? 0) + (sp.dist === 0 ? 2 : 1));
          const raw = lines(f, `${side}_${slot}_hp`).sort((a, b) => a.x - b.x).map((l) => l.text).join(' ');
          if (raw) hps.push(raw);
          if (sp) raws.push(`${side}.${slot}: ${sp.raw} ${raw}`);
        }
        const species = [...votes].sort((a, b) => b[1] - a[1])[0]?.[0];
        if (!species) continue;
        if (!known[side].includes(species)) known[side].push(species);
        let hp = null;
        if (!pctSide(side)) {
          for (const raw of hps) {
            const r = parseOwnHp(raw, species);
            if (r?.learned) ownMax[species] = r.max;
          }
          const reads = hps.map((raw) => parseOwnHp(raw, species)).filter(Boolean);
          hp = mode(reads.map((r) => `${r.cur}/${r.max}`));
          hp = hp ? { cur: +hp.split('/')[0], max: +hp.split('/')[1] } : null;
        } else {
          const v = mode(hps.map(parseOppPct).filter((x) => x != null));
          hp = v != null ? { pct: v } : null;
        }
        active[side][slot] = { species, ...(hp ? { hp } : {}) };
      }
    }
    return { active, raw: [...new Set(raws)].slice(0, 8).join(' | ') };
  }
  function mode(xs) {
    const c = new Map();
    for (const x of xs) c.set(x, (c.get(x) ?? 0) + 1);
    return [...c].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }

  function fieldAt(turn) {
    // Prefer a read with the turn counter: the banner may still be fading in on the first choose frame.
    const withCount = turn.frames.filter((f) => /\d\s*\/\s*\d/.test(text(f, 'field')));
    for (const f of [...withCount, ...turn.frames]) {
      const t = text(f, 'field');
      const w = t.match(/(下雨|大晴天|日照|沙暴|下雪|冰雹)/);
      const n = t.match(/(\d)\s*\/\s*(\d)/);
      if (w) return { weather: { 下雨: 'rain', 大晴天: 'sun', 日照: 'sun', 沙暴: 'sand', 下雪: 'snow', 冰雹: 'snow' }[w[1]], weatherTurns: n ? +n[1] : undefined, raw: t };
    }
    return {};
  }

  // ---------- 4. events ----------
  const events = [];
  const emit = (e) => events.push(e);
  const conf = (...ms) => (ms.some((m) => !m || m.conf === 'unsure') ? 'unsure' : ms.some((m) => m.conf === 'likely') ? 'likely' : 'sure');

  // Board: side -> slot -> species (updated by turn snapshots and switch events).
  const board = { you: {}, opp: {} };
  const slotOf = (side, species) => Object.entries(board[side]).find(([, s]) => s === species || s?.replace(/-Mega.*/, '') === species)?.[0] ?? null;
  const lastFainted = { you: [], opp: [] };
  const pendingOut = { you: null, opp: null };
  const base0 = (s) => s?.replace(/-Mega.*/, '') ?? null;
  const megaOf = {}; // "side:species" -> form
  const curName = (side, sp) => megaOf[`${side}:${sp}`] ?? sp;
  let terrain = null;
  let weather = null; // from weather messages; the field banner wins when it shows one
  let lastMove = null;
  const stages = {}; // "side:species" -> {atk: -1, …}, reset on switch-in (for White Herb)
  const protectedAt = []; // {side, species, t}: "X protected itself" lines
  let lastItemBanner = null; // {side, species, item, t}
  let lastSwitchIn = null;

  const lastT = frames.at(-1).t;
  const timeline = [
    ...sentences.map((s) => ({ kind: 'msg', t: s.t, s })),
    ...turns.map((tu) => ({ kind: 'turn', t: tu.t, tu })),
    ...frames.flatMap((f) => bannerRegions.filter((r) => lines(f, r).length >= 2).map((region) => ({ kind: 'ability', t: f.t, f, region }))),
  ].sort((a, b) => a.t - b.t || (a.kind === 'turn' ? -1 : 1));

  const playerNames = { you: preview.players.you };
  const nameSide = (who) => {
    // "對手的X" -> opp. Player names: own from preview, opponent learned from 派出/換下 with a non-own name.
    if (who.startsWith('對手的')) return { side: 'opp', name: who.slice(3) };
    if (/^the opposing /i.test(who)) return { side: 'opp', name: stripTitle(who.replace(/^the opposing /i, '')) };
    return { side: 'you', name: EN ? stripTitle(who) : who };
  };
  const species = (side, raw) => match(lex.pokemon, EN ? stripTitle(raw) : raw, { prefer: known[side] });

  const seenItemReveal = new Set();
  const seenAbilityReveal = new Set();
  emitMatch();

  for (const ev of timeline) {
    if (ev.kind === 'turn') {
      // The result screen after a win/lose message can match the choose-screen signature (empty plates).
      if (events.some((e) => e.type === 'end')) continue;
      const snap = turnSnapshot(ev.tu);
      const field = fieldAt(ev.tu);
      for (const side of ['you', 'opp']) {
        for (const slot of ['left', 'right']) {
          const a = snap.active[side][slot];
          if (!a) continue;
          board[side][slot] = a.species;
          const form = megaOf[`${side}:${a.species}`];
          if (form) a.mega = true;
        }
      }
      ev.tu.snapshot = snap;
      emit({ type: 'turn', n: ev.tu.n, t: ev.t, src: 'ocr', conf: 'likely', raw: `${field.raw ?? ''} | ${snap.raw}`,
        field: { ...(field.weather ? { weather: field.weather, weatherTurns: field.weatherTurns } : weather ? { weather } : {}), ...(terrain ? { terrain } : {}) },
        active: snap.active });
      continue;
    }
    if (ev.kind === 'ability' && EN) {
      handleBannerEn(ev);
      continue;
    }
    if (ev.kind === 'ability') {
      const ls = lines(ev.f, 'ability');
      // The same banner shows items: "X使用了 / 文柚果！"
      const user = ls.find((l) => /使用了$/.test(l.text.trim()));
      if (user) { handleItemBanner(ev, ls, user); continue; }
      const who = ls.find((l) => /的$/.test(l.text.trim()));
      const ab = ls.find((l) => l !== who && cjkCount(l.text) >= 2);
      if (!who || !ab) continue;
      const sp = species('you', who.text.trim().replace(/的$/, ''));
      const am = match(lex.abilities, ab.text);
      if (!sp || !am) continue;
      const key = `you:${sp.name}:${am.name}`;
      if (seenAbilityReveal.has(key)) continue;
      seenAbilityReveal.add(key);
      emit({ type: 'reveal', t: ev.t, src: 'ocr', conf: conf(sp, am), raw: ls.map((l) => l.text).join(' / '), side: 'you', species: sp.name, ability: am.name });
      continue;
    }
    // message
    const s = ev.s;
    let handled = false;
    const before = events.length;
    for (const tp of TEMPLATES) {
      const m = s.text.match(tp.re);
      if (!m) continue;
      handled = true;
      s.kind = tp.kind;
      const base = { t: s.t, src: 'ocr', raw: s.rawRead ?? s.text };
      const g = m.groups ?? {};
      switch (tp.kind) {
        case 'move': {
          const { side, name } = nameSide(g.who);
          const sp = species(side, name);
          const mv = match(lex.moves, g.move);
          const spName = sp ? curName(side, sp.name) : name;
          lastMove = { ...base, type: 'move', conf: conf(sp, mv), side, slot: sp ? slotOf(side, sp.name) : null, species: spName, move: mv?.name ?? g.move, targets: [],
            // Expanding Force hits both foes in Psychic Terrain.
            tgt: mv?.name === 'Expanding Force' && terrain === 'psychic' ? 'allAdjacentFoes' : MOVE_DATA.get(mv?.name)?.target };
          emit(lastMove);
          // A pivot move's user is the one a following send-out replaces (no "come back" line for it).
          if (sp && PIVOTS.has(mv?.name)) pendingOut[side] = { species: sp.name, slot: slotOf(side, sp.name), conf: sp.conf };
          break;
        }
        case 'faint': {
          const { side, name } = nameSide(g.who);
          const sp = species(side, name);
          const slot = sp ? slotOf(side, sp.name) : null;
          // A KO with no effect message still means the last move hit it: log the drop to 0.
          if (sp && lastMove && !events.some((e) => e.t >= lastMove.t && e.type === 'hp' && e.side === side && base0(e.species) === sp.name && e.cause === 'move')) {
            emit({ ...base, type: 'hp', conf: 'likely', side, slot, species: curName(side, sp.name), from: null, to: 0, unit: unitOf(side), cause: 'move' });
          }
          emit({ ...base, type: 'faint', conf: conf(sp), side, slot, species: sp ? curName(side, sp.name) : name });
          if (sp) {
            lastFainted[side].push(slot);
            addTarget(side, slot);
            board[side][slot] = null;
          }
          break;
        }
        case 'withdraw-you':
        case 'withdraw-opp':
        case 'return-you': {
          const side = tp.kind === 'withdraw-opp' ? 'opp' : 'you';
          const sp = species(side, g.who);
          if (sp) pendingOut[side] = { species: sp.name, slot: slotOf(side, sp.name), conf: sp.conf };
          break;
        }
        case 'sendout-you':
        case 'sendout-opp': {
          const side = tp.kind === 'sendout-opp' ? 'opp' : 'you';
          if (side === 'opp' && g.player && !playerNames.opp && !GENERIC_PLAYER.test(g.player)) playerNames.opp = g.player;
          const sp = species(side, g.who);
          if (!sp) break;
          if (!known[side].includes(sp.name)) known[side].push(sp.name);
          const out = pendingOut[side];
          let slot = out?.slot ?? lastFainted[side].shift() ?? null;
          if (!slot && !out) slot = inferFaint(side, sp.name, s);
          if (!slot && !Object.keys(board[side]).length) break; // leads, before the first choose screen
          emit({ ...base, type: 'switch', conf: conf(sp, out ? { conf: out.conf } : { conf: slot ? 'likely' : 'unsure' }), side, slot,
            out: out ? curName(side, out.species) : null, in: curName(side, sp.name) });
          if (slot) board[side][slot] = sp.name;
          delete stages[`${side}:${sp.name}`];
          pendingOut[side] = null;
          lastSwitchIn = { side, species: sp.name, t: s.t };
          break;
        }
        case 'leads': {
          // Lead send-outs come before the first choose screen: the plates set the board; just learn names.
          const side = g.player ? 'opp' : 'you';
          if (g.player && !playerNames.opp && !GENERIC_PLAYER.test(g.player)) playerNames.opp = g.player;
          for (const w of [g.who, g.who2]) {
            const sp = species(side, stripTitle(w));
            if (sp && !known[side].includes(sp.name)) known[side].push(sp.name);
          }
          break;
        }
        case 'item-reveal': // "X's Occa Berry lessened the damage it took!"
        case 'mega-trigger': {
          const { side, name } = nameSide(g.who);
          const sp = species(side, name);
          const im = match(lex.items, g.item);
          if (sp && im) {
            const key = `${side}:${sp.name}:${im.name}`;
            if (!seenItemReveal.has(key)) {
              seenItemReveal.add(key);
              emit({ ...base, type: 'reveal', conf: conf(sp, im), side, species: sp.name, item: im.name });
            }
          }
          break;
        }
        case 'mega': {
          const { side, name } = nameSide(g.who);
          const sp = species(side, name);
          if (!sp) break;
          const form = megaForm(lex, sp.name);
          megaOf[`${side}:${sp.name}`] = form;
          emit({ ...base, type: 'mega', conf: conf(sp), side, slot: slotOf(side, sp.name), species: sp.name, form });
          break;
        }
        case 'effect': {
          // "對A和B效果不好。" covers both targets of a spread move.
          const { side, name } = nameSide(g.who);
          for (const one of name.split(EN ? /\s*,\s*|\s+and\s+/ : '和')) {
            const sp = species(side, one);
            const slot = sp ? slotOf(side, sp.name) : null;
            addTarget(side, slot);
            emit({ ...base, type: 'hp', conf: conf(sp), side, slot, species: sp ? curName(side, sp.name) : one, from: null, to: null,
              unit: unitOf(side), cause: 'move', effect: tp.effect });
          }
          break;
        }
        case 'crit': {
          // "擊中了X的要害！" names the target (spread moves); bare "擊中了要害！" means the move's only target.
          let side = null, sp = null;
          if (g.who) { const ns = nameSide(g.who); side = ns.side; sp = species(side, ns.name); }
          const existing = events.slice(-4).find((e) => e.type === 'hp' && e.cause === 'move' && s.t - e.t < 4 && !e.crit
            && (!sp || base0(e.species) === sp.name));
          if (existing) { existing.crit = true; break; }
          const slot = sp ? slotOf(side, sp.name) : null;
          if (sp) addTarget(side, slot);
          emit({ ...base, type: 'hp', conf: sp ? conf(sp) : 'unsure', side, slot, species: sp ? curName(side, sp.name) : null, from: null, to: null,
            unit: side ? unitOf(side) : null, cause: 'move', crit: true, attacker: lastMove ? `${lastMove.side}.${lastMove.slot}` : null });
          break;
        }
        case 'recoil': {
          const { side, name } = nameSide(g.who);
          const sp = species(side, name);
          // Life Orb shows its banner just before the recoil line: an item cause with a known size (max/10).
          const lo = sp && lastItemBanner?.item === 'Life Orb' && lastItemBanner.side === side && lastItemBanner.species === sp.name && s.t - lastItemBanner.t < 4;
          emit({ ...base, type: 'hp', conf: conf(sp), side, slot: sp ? slotOf(side, sp.name) : null, species: sp ? curName(side, sp.name) : name,
            from: null, to: null, unit: unitOf(side), cause: lo ? 'item' : 'recoil', ...(lo ? { item: 'Life Orb' } : {}) });
          break;
        }
        case 'heal': {
          const { side, name } = nameSide(g.who);
          const sp = species(side, name);
          emit({ ...base, type: 'hp', conf: conf(sp), side, slot: sp ? slotOf(side, sp.name) : null, species: sp ? curName(side, sp.name) : name,
            from: null, to: null, unit: unitOf(side), cause: terrain === 'grassy' ? 'terrain' : 'heal' });
          break;
        }
        case 'protected': {
          const { side, name } = nameSide(g.who);
          const sp = species(side, name);
          addTarget(side, sp ? slotOf(side, sp.name) : null);
          if (sp) protectedAt.push({ side, species: sp.name, t: s.t });
          break;
        }
        case 'stat': {
          // "The opposing Glimmora and the opposing Whimsicott's Attack fell!" (Intimidate on both): one event each.
          const many = g.who.split(EN ? /\s+and\s+/ : '和');
          if (many.length > 1) {
            for (const who of many) {
              const ns = nameSide(who), sp1 = species(ns.side, ns.name);
              const amount = STAT_AMOUNTS.find(([re]) => re.test(g.change))?.[1];
              const stages = Object.fromEntries(g.stats.split(/\s*,\s*(?:and\s+)?|\s+and\s+/).map((p) => [STAT_NAMES[p.trim()], amount]).filter(([k]) => k && amount));
              if (sp1 && Object.keys(stages).length) emitStat({ ...base, type: 'stat', conf: conf(sp1), side: ns.side, slot: slotOf(ns.side, sp1.name), species: curName(ns.side, sp1.name), stages });
            }
            break;
          }
          const { side, name } = nameSide(g.who);
          const sp = species(side, name);
          const amount = STAT_AMOUNTS.find(([re]) => re.test(g.change))?.[1];
          const st = {};
          for (const part of g.stats.split(EN ? /\s*,\s*(?:and\s+)?|\s+and\s+/ : /[、,，和]/)) {
            const k = STAT_NAMES[part.trim()];
            if (k && amount) st[k] = amount;
          }
          if (!Object.keys(st).length) break;
          // Shell Smash etc. print two lines: merge into the previous stat event for the same mon at the same moment.
          const prev = events.at(-1);
          if (prev?.type === 'stat' && prev.species === (sp ? curName(side, sp.name) : name) && s.t - prev.t < 4) {
            Object.assign(prev.stages, st);
            if (sp) trackStages(side, sp.name, st);
            prev.raw += ` ${s.text}`;
          } else {
            emitStat({ ...base, type: 'stat', conf: conf(sp), side, slot: sp ? slotOf(side, sp.name) : null, species: sp ? curName(side, sp.name) : name, stages: st });
          }
          break;
        }
        case 'item-restore': {
          // White Herb: reveal the item and undo the lowered stages (Intimidate −1 Atk -> +1 Atk).
          const { side, name } = nameSide(g.who);
          const sp = species(side, name);
          const im = match(lex.items, g.item);
          if (!sp) break;
          if (im && !seenItemReveal.has(`${side}:${sp.name}:${im.name}`)) {
            seenItemReveal.add(`${side}:${sp.name}:${im.name}`);
            emit({ ...base, type: 'reveal', conf: conf(sp, im), side, species: sp.name, item: im.name });
          }
          const back = Object.fromEntries(Object.entries(stages[`${side}:${sp.name}`] ?? {}).filter(([, v]) => v < 0).map(([k, v]) => [k, -v]));
          if (Object.keys(back).length) emitStat({ ...base, type: 'stat', conf: conf(sp, im), side, slot: slotOf(side, sp.name), species: curName(side, sp.name), stages: back });
          break;
        }
        case 'terrain-end':
          terrain = null;
          break;
        case 'weather':
          weather = tp.weather;
          break;
        case 'weather-end':
          weather = null;
          break;
        case 'terrain': {
          terrain = tp.terrain;
          // Surge abilities announce terrain right after a switch-in; reveal the ability then.
          if (lastSwitchIn && s.t - lastSwitchIn.t < 5) {
            const ab = lex.allPokemon.find((p) => p.name === lastSwitchIn.species)?.abilities?.find((a) => /Surge/.test(a) && a.toLowerCase().startsWith(tp.terrain));
            const key = `${lastSwitchIn.side}:${lastSwitchIn.species}:${ab}`;
            if (ab && !seenAbilityReveal.has(key)) {
              seenAbilityReveal.add(key);
              emit({ ...base, type: 'reveal', conf: 'likely', side: lastSwitchIn.side, species: lastSwitchIn.species, ability: ab });
            }
          }
          break;
        }
        case 'win':
        case 'lose':
          // "成功戰勝了<opponent>！": the opponent's name, unless it is the generic title.
          if (g.player && !GENERIC_PLAYER.test(g.player.trim())) playerNames.opp ??= g.player.trim();
          emit({ ...base, type: 'end', conf: 'likely', winner: tp.kind === 'win' ? 'you' : 'opp' });
          break;
        case 'lost':
          emit({ ...base, type: 'end', conf: 'likely', winner: playerNames.opp && levenshtein(g.player, playerNames.opp) <= 1 ? 'you' : 'opp' });
          break;
        case 'forfeit':
          emit({ ...base, type: 'end', conf: 'unsure', winner: null, forfeit: true });
          break;
        default:
          break;
      }
      break;
    }
    if (!handled) s.unmatched = true;
    // A read completed from a truncated line: at most "likely".
    if (s.partial) for (const e of events.slice(before)) if (e.conf === 'sure') e.conf = 'likely';
  }

  // English banners: "Incineroar's" over "Intimidate" (or an item). The banner's side is its position.
  function handleBannerEn(ev) {
    const ls = lines(ev.f, ev.region);
    const raw = ls.map((l) => l.text).join(' / ');
    const whoLine = ls.find((l) => /['’‘`]s\s*$/.test(l.text.trim()));
    const rest = ls.filter((l) => l !== whoLine && letters(l.text) >= 3).map((l) => l.text.trim()).join(' ');
    if (!whoLine || !rest) return;
    const side = ev.region.endsWith('_opp') ? 'opp' : 'you';
    const sp = species(side, whoLine.text.trim().replace(/['’‘`]s\s*$/, ''));
    const am = match(lex.abilities, rest), im = match(lex.items, rest);
    if (!sp || (!am && !im)) return;
    const asItem = im && (!am || im.dist < am.dist);
    const key = `${side}:${sp.name}:${asItem ? im.name : am.name}`;
    if ((asItem ? seenItemReveal : seenAbilityReveal).has(key)) return;
    (asItem ? seenItemReveal : seenAbilityReveal).add(key);
    const base = { t: ev.t, src: 'ocr', conf: conf(sp, asItem ? im : am), raw };
    emit({ type: 'reveal', ...base, side, species: sp.name, ...(asItem ? { item: im.name } : { ability: am.name }) });
    if (asItem && /^(?:Sitrus|Oran|Figy|Wiki|Mago|Aguav|Iapapa) Berry$/.test(im.name)) emit({ type: 'hp', ...base, side, slot: slotOf(side, sp.name), species: curName(side, sp.name), from: null, to: null, unit: unitOf(side), cause: 'item', item: im.name });
  }

  function handleItemBanner(ev, ls, user) {
    const raw = ls.map((l) => l.text).join(' / ');
    const itemLine = ls.find((l) => l !== user && cjkCount(l.text) >= 2);
    if (!itemLine) return;
    const sp = match(lex.pokemon, user.text.trim().replace(/^對手的/, '').replace(/使用了$/, ''), { prefer: [...known.you, ...known.opp] });
    const im = match(lex.items, itemLine.text.replace(/[！!。\s]/g, ''));
    if (!sp || !im) return;
    const side = /^對手的/.test(user.text) || (!known.you.includes(sp.name) && known.opp.includes(sp.name)) ? 'opp' : 'you';
    // The banner stays up for a few samples: one activation per mon and item within 3 s.
    if (lastItemBanner && lastItemBanner.side === side && lastItemBanner.species === sp.name && lastItemBanner.item === im.name && ev.t - lastItemBanner.t < 3) return;
    lastItemBanner = { side, species: sp.name, item: im.name, t: ev.t };
    const key = `${side}:${sp.name}:${im.name}`;
    const base = { t: ev.t, src: 'ocr', conf: conf(sp, im), raw };
    if (!seenItemReveal.has(key)) {
      seenItemReveal.add(key);
      emit({ type: 'reveal', ...base, side, species: sp.name, item: im.name });
    }
    if (/Berry/.test(im.name) || im.name === 'Leftovers') emit({ type: 'hp', ...base, side, slot: slotOf(side, sp.name), species: curName(side, sp.name), from: null, to: null, unit: unitOf(side), cause: 'item', item: im.name });
    // Rocky Helmet hurts the attacker that made contact: the last move's user, from the other side.
    if (im.name === 'Rocky Helmet' && lastMove && lastMove.side !== side && ev.t - lastMove.t < 8 && lastMove.slot) {
      emit({ type: 'hp', ...base, side: lastMove.side, slot: lastMove.slot, species: lastMove.species, from: null, to: null, unit: unitOf(lastMove.side), cause: 'item', item: 'Rocky Helmet' });
    }
  }

  function addTarget(side, slot, mv = lastMove) {
    if (!mv || !side || !slot) return;
    const k = `${side}.${slot}`;
    if (mv.targets.includes(k)) return;
    // Never the user itself (Final Gambit's own faint, recoil KOs); the catalog target type limits the rest.
    if (side === mv.side && slot === mv.slot) return;
    const tgt = mv.tgt;
    if (NO_TARGET.has(tgt)) return;
    if (tgt === 'allAdjacentFoes' && side === mv.side) return;
    if (SINGLE_TARGET.has(tgt) && mv.targets.length) {
      // One target: a foe named by a result line replaces an ally picked up earlier, never adds to it.
      if (side !== mv.side && mv.targets.every((x) => x.startsWith(`${mv.side}.`))) mv.targets = [k];
      return;
    }
    mv.targets.push(k);
  }

  function trackStages(side, sp, st) {
    const cur = (stages[`${side}:${sp}`] ??= {});
    for (const [k, v] of Object.entries(st)) cur[k] = Math.max(-6, Math.min(6, (cur[k] ?? 0) + v));
  }
  function emitStat(e) {
    const sp = base0(e.species);
    if (sp) trackStages(e.side, sp, e.stages);
    emit(e);
  }

  // A send-out with no "come back" line and no faint message to free a slot: the faint line was missed.
  // The mon of this side that is gone from the next choose screen's plates fainted; the newcomer takes its slot.
  function inferFaint(side, newcomer, s) {
    const next = turns.find((tu) => tu.t > s.t);
    if (!next) return null;
    next.snapshot ??= turnSnapshot(next);
    const plates = next.snapshot.active[side];
    const gone = ['left', 'right'].filter((slot) => board[side][slot] && !Object.values(plates).some((p) => p.species === board[side][slot]));
    if (gone.length !== 1 || (plates[gone[0]] && plates[gone[0]].species !== newcomer)) return null;
    const slot = gone[0], sp = board[side][slot];
    const base = { t: +(s.t - 0.01).toFixed(2), src: 'inferred', conf: 'likely', raw: `not on the next choose screen; ${s.text}` };
    if (lastMove && !events.some((e) => e.t >= lastMove.t && e.type === 'hp' && e.side === side && base0(e.species) === sp && e.cause === 'move')) {
      emit({ ...base, type: 'hp', side, slot, species: curName(side, sp), from: null, to: 0, unit: unitOf(side), cause: 'move' });
    }
    emit({ ...base, type: 'faint', side, slot, species: curName(side, sp) });
    addTarget(side, slot);
    board[side][slot] = null;
    return slot;
  }

  // HP from/to. Plates are only readable on choose screens, so each mon's HP is known at turn start
  // (or when it switches in: last known value, 100% for a fresh opponent) and at the next choose screen
  // (or 0 when it faints). Fixed-size changes are inverted (Grassy Terrain and Leftovers +1/16, Sitrus Berry
  // +1/4, Life Orb −1/10, Rocky Helmet −1/6, immune 0), so a turn with one unknown hit is solved exactly;
  // with more unknown hits only the ends are filled.
  const lastKnown = {}; // "side:species" -> value
  const sized = (side, max, frac, pct) => (!pctSide(side) ? (max ? Math.floor(max / frac) : null) : pct);
  const deltaOf = (e, side, max) => {
    if (e.effect === 'immune') return 0;
    if (e.cause === 'terrain') return sized(side, max, 16, 6);
    if (e.cause !== 'item') return null;
    if (/Sitrus/.test(e.item ?? 'Sitrus')) return sized(side, max, 4, 25);
    if (e.item === 'Leftovers') return sized(side, max, 16, 6);
    if (e.item === 'Life Orb') return -sized(side, max, 10, 10) || null;
    if (e.item === 'Rocky Helmet') return pctSide(side) ? null : -sized(side, max, 6) || null; // % rounding unknown
    return null;
  };
  // Events before the first choose screen (Intimidate, White Herb) get their slot from its plates.
  const first = turns[0]?.snapshot?.active;
  if (first) for (const e of events) if (e.t < turns[0].t && e.slot === null && e.side && e.species) e.slot = Object.entries(first[e.side]).find(([, a]) => a.species === base0(e.species))?.[0] ?? null;
  for (let i = 0; i < turns.length; i++) {
    const a = turns[i].snapshot?.active, b = turns[i + 1]?.snapshot?.active;
    if (!a) continue;
    const tEnd = turns[i + 1]?.t ?? Infinity;
    const inTurn = events.filter((e) => e.t >= turns[i].t && e.t < tEnd);
    const mons = [];
    for (const side of ['you', 'opp']) for (const slot of ['left', 'right']) {
      const s = a[side][slot];
      if (s?.hp) mons.push({ side, species: s.species, start: pctSide(side) ? s.hp.pct : s.hp.cur, max: s.hp.max, t0: turns[i].t, slot });
    }
    for (const e of inTurn.filter((e) => e.type === 'switch' && e.in)) {
      const sp = base0(e.in);
      const k = `${e.side}:${sp}`;
      const start = lastKnown[k] ?? (pctSide(e.side) ? 100 : ownMax[sp] ?? null);
      mons.push({ side: e.side, species: sp, start, max: ownMax[sp], t0: e.t, slot: e.slot, fresh: !(k in lastKnown) });
    }
    // Spread moves print nothing on a neutral hit: each mon in range (foes; for Earthquake-like moves the ally
    // too) with no result, protect or faint line for it before the next move took an unlogged hit.
    const turnMoves = inTurn.filter((e) => e.type === 'move');
    turnMoves.forEach((mv, mi) => {
      const md = MOVE_DATA.get(mv.move);
      if (!md || md.category === 'Status' || !SPREAD_TARGET.has(mv.tgt) || !mv.slot) return;
      const tNext = turnMoves[mi + 1]?.t ?? tEnd;
      for (const m of mons) {
        if (!m.slot || m.t0 > mv.t || (m.side === mv.side && (mv.tgt === 'allAdjacentFoes' || m.slot === mv.slot))) continue;
        const isMe = (e) => e.side === m.side && base0(e.species) === m.species;
        if (inTurn.some((e) => e.t < mv.t && e.t > m.t0 && ((e.type === 'switch' && e.side === m.side && base0(e.out) === m.species) || (e.type === 'faint' && isMe(e))))) continue;
        if (protectedAt.some((p) => p.side === m.side && p.species === m.species && p.t > mv.t && p.t < tNext)) continue;
        if (inTurn.some((e) => e.type === 'hp' && isMe(e) && e.cause === 'move' && e.t >= mv.t && e.t < tNext)) continue;
        const hit = { type: 'hp', t: +(mv.t + 0.01).toFixed(2), src: 'inferred', conf: 'unsure', raw: `no result line after ${mv.move}`, side: m.side, slot: m.slot,
          species: curName(m.side, m.species), from: null, to: null, unit: unitOf(m.side), cause: 'move' };
        emit(hit);
        inTurn.push(hit);
        addTarget(m.side, m.slot, mv);
      }
    });
    inTurn.sort((x, y) => x.t - y.t);
    // A single-target attack with no result line: the one foe whose HP dropped with nothing else to explain it.
    const hitterFor = (m, tStop) => {
      const c = turnMoves.filter((e) => e.side !== m.side && e.slot && !e.targets.length && e.t >= m.t0 && e.t < tStop
        && SINGLE_TARGET.has(e.tgt) && MOVE_DATA.get(e.move)?.category !== 'Status');
      return c.length === 1 ? c[0] : null;
    };
    for (const m of mons) {
      const after = inTurn.filter((e) => e.t >= m.t0);
      const out = after.find((e) => e.type === 'switch' && e.side === m.side && base0(e.out) === m.species);
      const tStop = out?.t ?? Infinity;
      let mine = after.filter((e) => e.t <= tStop && e.type === 'hp' && e.side === m.side && base0(e.species) === m.species);
      const fainted = after.some((e) => e.t <= tStop && e.type === 'faint' && e.side === m.side && base0(e.species) === m.species);
      const next = b?.[m.side]?.[m.slot];
      const end = fainted ? 0 : out ? null : next?.species === m.species && next.hp ? (pctSide(m.side) ? next.hp.pct : next.hp.cur) : null;
      const k = `${m.side}:${m.species}`;
      if (end != null) lastKnown[k] = end; else if (out && !mine.length && m.start != null) lastKnown[k] = m.start;
      // An unattributed crit ("擊中了要害！" after a move with no named target) goes to the one mon that lost HP.
      const orphan = after.find((e) => e.type === 'hp' && e.crit && !e.side);
      if (orphan && end != null && m.start != null && end < m.start && !mine.some((e) => e.cause === 'move')) {
        Object.assign(orphan, { side: m.side, slot: m.slot, species: curName(m.side, m.species), unit: unitOf(m.side), conf: 'likely' });
        const mv = inTurn.find((e) => e.type === 'move' && `${e.side}.${e.slot}` === orphan.attacker);
        if (mv && !mv.targets.includes(`${m.side}.${m.slot}`)) mv.targets.push(`${m.side}.${m.slot}`);
        mine = [orphan, ...mine].sort((x, y) => x.t - y.t);
      }
      if (!mine.length) {
        if (end != null && m.start != null && end !== m.start && !fainted) {
          const by = end < m.start ? hitterFor(m, tStop) : null;
          if (by) addTarget(m.side, m.slot, by);
          emit({ type: 'hp', t: by ? +(by.t + 0.01).toFixed(2) : tEnd === Infinity ? lastT : tEnd - 0.01, src: by ? 'inferred' : 'ocr', conf: by ? 'likely' : 'unsure',
            raw: by ? `choose-screen diff after ${by.move}` : 'choose-screen diff', side: m.side, slot: m.slot,
            species: curName(m.side, m.species), from: m.start, to: end, unit: unitOf(m.side), cause: by ? 'move' : 'unknown' });
        }
        continue;
      }
      // Only fixed heals were logged but they don't add up to the end value: a hit with no message
      // (a neutral hit) came first. Log it as the one unknown so the walk below solves it.
      if (m.start != null && end != null && !fainted && mine.every((e) => e.cause !== 'move' && e.cause !== 'recoil')) {
        const ds = mine.map((e) => deltaOf(e, m.side, m.max));
        if (ds.every((d) => d != null) && m.start + ds.reduce((a, b) => a + b, 0) > end) {
          const by = hitterFor(m, tStop);
          if (by) addTarget(m.side, m.slot, by);
          const hit = { type: 'hp', t: by ? +(by.t + 0.01).toFixed(2) : mine[0].t - 0.01, src: by ? 'inferred' : 'ocr', conf: 'unsure', raw: by ? `choose-screen diff after ${by.move}` : 'choose-screen diff', side: m.side, slot: m.slot,
            species: curName(m.side, m.species), from: null, to: null, unit: unitOf(m.side), cause: by ? 'move' : 'unknown' };
          emit(hit);
          mine = [hit, ...mine];
        }
      }
      const deltas = mine.map((e) => deltaOf(e, m.side, m.max));
      const unknown = deltas.filter((d) => d == null).length;
      if (m.start != null) mine[0].from = m.start;
      if (end != null) mine.at(-1).to = end;
      if (unknown >= 1) {
        // Walk forward from the start to the first unknown and backward from the end to the last one;
        // with one unknown that solves the whole chain.
        const j = deltas.findIndex((d) => d == null), k = deltas.findLastIndex((d) => d == null);
        if (m.start != null) {
          let v = m.start;
          for (let q = 0; q < j; q++) { mine[q].from = v; v = Math.max(0, Math.min(m.max ?? 100, v + deltas[q])); mine[q].to = v; }
          mine[j].from = v;
        }
        if (end != null) {
          let w = end;
          for (let q = mine.length - 1; q > k; q--) { mine[q].to = w; w -= deltas[q]; mine[q].from = w; }
          mine[k].to = w;
        }
        if (unknown === 1 && m.start != null && end != null) for (const e of mine) e.conf = e.conf === 'unsure' ? 'unsure' : 'likely';
      }
      if (m.fresh && m.start != null) mine[0].conf = 'likely';
    }
  }
  for (const e of events) { delete e.attacker; delete e.tgt; }
  events.sort((a, b) => (a.type === 'match' ? -1 : b.type === 'match' ? 1 : a.t - b.t));

  function emitMatch() {
    const paste = preview.you.map((p) => `${p.species}${p.item ? ` @ ${p.item}` : ''}`).join('\n\n');
    emit({ type: 'match', schema: 1, source: 'ocr-prototype', language: profile.language, video: opt('--video', null),
      ...(game ? { profile: profile.name, game: game.n, ...(game.partial ? { partial: true } : {}) } : {}),
      players: { you: preview.players.you ?? null, opp: null }, yourTeam: paste, oppPreview: [], t: preview.t ?? (game ? frames[0].t : 0), src: 'ocr',
      conf: preview.you.length === 6 ? 'likely' : 'unsure', raw: preview.you.map((p) => p.raw).join(' | ') });
  }
  events[0].players.opp = playerNames.opp ?? null;
  return { events, sentences, turns };
}

// ---------- games ----------
// A broadcast holds several games with desk segments between them. A game starts at a lead send-out
// ("X sent out A and B!" / "派出了A和B") with no choose screen in the 60 s before it.
function gameStarts(frames) {
  if (!profile.splitGames) return [frames[0].t];
  const { sentences } = parseGame(frames, 0, { sentencesOnly: true });
  const chooseTs = frames.filter((f) => f.choose).map((f) => f.t);
  const starts = [];
  for (const s of sentences) {
    if (!TEMPLATES.some((tp) => tp.kind === 'leads' && tp.re.test(s.text))) continue;
    if (chooseTs.some((t) => t < s.t && s.t - t < 60)) continue;
    if (starts.length && s.t - starts.at(-1) < 60) continue;
    starts.push(s.t);
  }
  return starts;
}
const starts = gameStarts(allFrames);
// Frames before the first start are the tail of a game already in progress: kept as a partial game if they hold choose screens.
const bounds = [-Infinity, ...starts.map((t) => t - 5), Infinity];
const games = [];
for (let i = 0; i + 1 < bounds.length; i++) {
  const fs = allFrames.filter((f) => f.t >= bounds[i] && f.t < bounds[i + 1]);
  if (fs.length && (!profile.splitGames || fs.some((f) => f.choose))) games.push({ frames: fs, partial: profile.splitGames && i === 0 });
}
const results = games.map((g, i) => parseGame(g.frames, profile.splitGames ? { n: i + 1, partial: g.partial } : null));
const events = results.flatMap((r) => r.events);
writeFileSync(outPath, events.map((e) => JSON.stringify(e)).join('\n') + '\n');
writeFileSync(outPath.replace(/\.jsonl$/, '.sentences.txt'), results.map((r, i) => (results.length > 1 ? `# game ${i + 1}\n` : '')
  + r.sentences.map((s) => `${s.t.toFixed(1).padStart(6)}  ${(s.kind ?? '?').padEnd(13)} ${s.text}`).join('\n')).join('\n') + '\n');
console.error(`${allFrames.length} frames, ${results.length} game(s), ${results.reduce((n, r) => n + r.sentences.length, 0)} sentences (${results.reduce((n, r) => n + r.sentences.filter((s) => s.unmatched).length, 0)} unmatched), ${results.reduce((n, r) => n + r.turns.length, 0)} turns, ${events.length} events`);
