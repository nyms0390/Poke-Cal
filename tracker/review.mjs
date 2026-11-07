#!/usr/bin/env node
// Match review: reads a turn log (docs/battle-tracker.md "Turn log format") and checks it with
// PokéCal's engine. For each opposing Pokémon it tests every listed Smogon spread and NCP set
// against what happened: who moved first, the damage it dealt, and the damage it took. The
// result is a Markdown review plus, with --json, the raw checks.
//
// Usage: node review.mjs <turn-log.jsonl> [review.md] [--team <paste file>] [--json <out.json>]
//
// --team is your team as a Showdown paste (PokéCal Teams export). Without it, each of your
// Pokémon gets the most used listed spread whose HP matches the max HP the game showed, and
// the review says so.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createStrategyContext, sideState } from '../src/data/strategy-tools.js';
import { parseUsageSpread } from '../src/data/usage-defaults.js';
import { calculateDamage } from '../src/engine/damage.js';
import { createField } from '../src/engine/field.js';
import { finalSpeed } from '../src/engine/speed.js';
import { calculateStat } from '../src/engine/stats.js';
import { normalizeId } from '../src/identifiers.js';

const CONSUMABLE = /berry|herb|seed|sash|gem|booster|balloon/i;
const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
const MIN_ITEM_PERCENT = 2;
const MAX_SPREADS = 14;
const ASSUMED_NOTE = ' (uses an assumed set for your Pokémon, so it does not count)';

export function loadContext() {
  const dir = new URL('../public/mcp-catalogs/', import.meta.url);
  const load = (name) => {
    const json = JSON.parse(readFileSync(new URL(`${name}.json`, dir), 'utf8'));
    return Array.isArray(json) ? json : Object.values(json)[0];
  };
  return createStrategyContext({ pokemon: load('pokemon'), moves: load('moves'), items: load('items'), abilities: load('abilities') });
}

// ---------- candidate sets ----------

function entryOf(ctx, species) {
  return ctx.pokemonLookup.get(normalizeId(species)) ?? null;
}

function usageOf(ctx, entry) {
  if (entry?.champions?.usage?.spreads?.length) return entry.champions;
  const base = entryOf(ctx, entry?.baseSpecies);
  return base?.champions?.usage ? base.champions : entry?.champions ?? {};
}

function spreadLabel(name) {
  const parsed = parseUsageSpread(name);
  if (!parsed) return name;
  const parts = STAT_KEYS.filter((k) => parsed.sp[k]).map((k) => `${parsed.sp[k]} ${k === 'hp' ? 'HP' : k[0].toUpperCase() + k.slice(1)}`);
  return `${parsed.nature} ${parts.join(' / ')}`;
}

// Every listed spread (Smogon ladder share, NCP sets) × every item with at least 2% use, or the
// revealed item. Weight is the spread share times the item share; NCP-only spreads get a small
// weight so they rank below ladder spreads but still get tested.
export function opponentCandidates(ctx, species, { item = null, ability = null } = {}) {
  const entry = entryOf(ctx, species);
  if (!entry) return [];
  const champ = usageOf(ctx, entry);
  const usage = champ.usage ?? {};
  const spreads = new Map();
  for (const s of (usage.spreads ?? []).slice(0, MAX_SPREADS)) {
    if (parseUsageSpread(s.name)) spreads.set(s.name, { name: s.name, weight: s.usagePercent, source: 'Smogon' });
  }
  for (const set of champ.ncp?.sets ?? []) {
    if (!parseUsageSpread(set.spreadName)) continue;
    const known = spreads.get(set.spreadName);
    if (known) known.ncp = set.name;
    else spreads.set(set.spreadName, { name: set.spreadName, weight: 0.5, source: 'NCP', ncp: set.name });
  }
  if (!spreads.size) spreads.set('Hardy:0/0/0/0/0/0', { name: 'Hardy:0/0/0/0/0/0', weight: 1, source: 'none' });
  let items;
  if (item) items = [{ name: item, weight: 100 }];
  else {
    items = (usage.items ?? []).filter((i) => i.usagePercent >= MIN_ITEM_PERCENT).map((i) => ({ name: i.name, weight: i.usagePercent }));
    if (!items.length) items = [{ name: 'none', weight: 100 }];
  }
  const out = [];
  for (const s of spreads.values()) {
    for (const i of items) {
      let state;
      try {
        state = sideState(ctx, entry.name, { spread: s.name, item: resolvesItem(ctx, i.name) ? i.name : 'none', ability: ability ?? undefined });
      } catch { continue; }
      out.push({ id: `${s.name} @ ${i.name}`, spread: s.name, item: i.name, source: s.source, ncp: s.ncp, weight: s.weight * i.weight, state });
    }
  }
  const total = out.reduce((a, c) => a + c.weight, 0) || 1;
  for (const c of out) c.share = c.weight / total;
  return out.sort((a, b) => b.weight - a.weight);
}

function resolvesItem(ctx, name) {
  return name !== 'none' && ctx.itemLookup.has(normalizeId(name));
}

// Splits a team paste into sets keyed by species id (base species too, for Megas).
export function parseTeamPaste(ctx, text) {
  const sets = new Map();
  for (const block of String(text ?? '').split(/\n\s*\n/)) {
    const header = block.trim().split('\n')[0];
    if (!header) continue;
    const name = header.replace(/@.*$/, '').replace(/\((?:M|F)\)\s*$/, '').trim();
    const nick = /\(([^()]+)\)\s*$/.exec(name);
    const entry = entryOf(ctx, nick ? nick[1] : name);
    if (!entry) continue;
    sets.set(entry.id, block.trim());
    // Logs name forms like Rotom-Wash or Indeedee-F by their base species.
    const base = entryOf(ctx, entry.baseSpecies);
    if (base && !sets.has(base.id)) sets.set(base.id, block.trim());
  }
  return sets;
}

function maxHp(state) {
  return calculateStat({ base: state.pokemon.baseStats.hp, stat: 'hp', sp: state.sp.hp ?? 0, nature: state.nature });
}

// Your set: the paste when given; otherwise the most used listed spread whose HP matches the
// max HP the game showed (or the top spread with its HP SP solved to match).
function ownState(ctx, species, { paste, observedMaxHp, item }) {
  const entry = entryOf(ctx, species);
  if (paste) {
    const state = sideState(ctx, null, { set: paste });
    const hp = maxHp(state);
    const note = observedMaxHp && hp !== observedMaxHp ? `paste gives ${hp} HP but the game showed ${observedMaxHp}` : '';
    return { state, source: 'paste', note };
  }
  const options = opponentCandidates(ctx, species, { item });
  const byHp = observedMaxHp ? options.filter((c) => maxHp(c.state) === observedMaxHp) : options;
  if (byHp.length) return { state: byHp[0].state, source: `assumed ${spreadLabel(byHp[0].spread)}`, note: '' };
  const state = options[0]?.state ?? sideState(ctx, entry.name, item ? { item } : {});
  if (observedMaxHp) {
    for (let hp = 0; hp <= 32; hp++) {
      if (maxHp({ ...state, sp: { ...state.sp, hp } }) === observedMaxHp) {
        state.sp = { ...state.sp, hp };
        break;
      }
    }
  }
  return { state, source: `assumed ${spreadLabel(options[0]?.spread ?? 'usage default')}, HP SP set to match ${observedMaxHp ?? '?'} HP`, note: '' };
}

// ---------- replaying the log ----------

const key = (side, slot) => `${side}.${slot}`;

export function reviewLog(ctx, events, { teamPaste = '' } = {}) {
  const match = events.find((e) => e.type === 'match') ?? {};
  const pasteSets = parseTeamPaste(ctx, teamPaste);
  const previewItems = new Map();
  for (const block of String(match.yourTeam ?? '').split(/\n\s*\n/)) {
    const m = /^(.+?)\s*@\s*(.+)$/.exec(block.trim());
    const entry = m && entryOf(ctx, m[1].trim());
    if (entry) previewItems.set(entry.id, m[2].trim());
  }
  const observedMaxHp = new Map();
  for (const e of events) {
    if (e.type !== 'turn') continue;
    for (const slot of Object.values(e.active?.you ?? {})) {
      const id = entryOf(ctx, slot.species)?.id;
      if (id && slot.hp?.max) observedMaxHp.set(id, slot.hp.max);
    }
  }

  const own = new Map();
  const ownFor = (species) => {
    const entry = entryOf(ctx, species);
    if (!entry) return null;
    if (!own.has(entry.id)) {
      const base = entryOf(ctx, entry.baseSpecies) ?? entry;
      const paste = pasteSets.get(entry.id) ?? pasteSets.get(base.id);
      const built = ownState(ctx, base.name, {
        paste,
        observedMaxHp: observedMaxHp.get(base.id) ?? observedMaxHp.get(entry.id),
        item: previewItems.get(base.id) ?? null,
      });
      if (entry.id !== base.id) built.state = { ...built.state, pokemon: entry };
      own.set(entry.id, { species: entry.name, ...built });
    }
    return own.get(entry.id);
  };

  const oppReveals = new Map();
  for (const e of events) {
    if (e.type === 'reveal' && e.side === 'opp') {
      const id = entryOf(ctx, e.species)?.id;
      if (!id) continue;
      const r = oppReveals.get(id) ?? {};
      if (e.item) r.item = e.item;
      if (e.ability) r.ability = e.ability;
      oppReveals.set(id, r);
    }
  }
  const opp = new Map();
  const oppFor = (species) => {
    const entry = entryOf(ctx, species);
    if (!entry) return null;
    if (!opp.has(entry.id)) {
      const base = entryOf(ctx, entry.baseSpecies) ?? entry;
      const reveal = oppReveals.get(entry.id) ?? oppReveals.get(base.id) ?? {};
      const item = entry.id !== base.id ? null : reveal.item ?? null;
      const candidates = opponentCandidates(ctx, entry.name, { item, ability: reveal.ability });
      opp.set(entry.id, { species: entry.name, candidates, checks: [] });
    }
    return opp.get(entry.id);
  };

  // Stat stages, consumed items and hits taken stay with the Pokémon when it Mega Evolves.
  const baseId = (species) => {
    const entry = entryOf(ctx, species);
    return entryOf(ctx, entry?.baseSpecies)?.id ?? entry?.id;
  };
  const active = new Map();
  const stages = new Map();
  const consumed = new Set();
  const hitsReceived = new Map();
  const oppPct = new Map();
  let field = {};
  let turn = 0;
  let moves = [];
  const notes = [];
  const turnNotes = new Map();
  const addNote = (text) => {
    if (!turnNotes.has(turn)) turnNotes.set(turn, []);
    turnNotes.get(turn).push(text);
  };
  const stageOf = (side, species) => stages.get(`${side}:${baseId(species)}`) ?? { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  const stateFor = (side, species, base) => ({
    ...base,
    stages: stageOf(side, species),
    itemConsumed: consumed.has(`${side}:${baseId(species)}`) || undefined,
    tailwind: Boolean(field.tailwind?.[side]),
  });
  const fieldFor = () => createField({ format: 'doubles', weather: field.weather ?? '', terrain: field.terrain ?? '', trickRoom: Boolean(field.trickRoom) });
  let lastMove = null;
  let turnMoves = []; // every move this turn, for hits whose damage was never read

  for (const e of events) {
    if (e.type === 'turn') {
      turn = e.n;
      field = e.field ?? {};
      moves = [];
      turnMoves = [];
      lastMove = null;
      active.clear();
      for (const side of ['you', 'opp']) {
        for (const [slot, a] of Object.entries(e.active?.[side] ?? {})) {
          active.set(key(side, slot), a.species);
          if (side === 'opp' && a.hp?.pct != null) oppPct.set(baseId(a.species), a.hp.pct);
        }
      }
      continue;
    }
    if (e.type === 'switch') {
      if (e.in) {
        active.set(key(e.side, e.slot), e.in);
        stages.delete(`${e.side}:${baseId(e.in)}`);
      }
      continue;
    }
    if (e.type === 'mega') {
      active.set(key(e.side, e.slot), e.form);
      continue;
    }
    if (e.type === 'stat') {
      const id = `${e.side}:${baseId(e.species)}`;
      const s = { ...(stages.get(id) ?? { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }) };
      for (const [k, v] of Object.entries(e.stages ?? {})) s[k] = Math.max(-6, Math.min(6, (s[k] ?? 0) + v));
      stages.set(id, s);
      continue;
    }
    if (e.type === 'reveal' && e.item && CONSUMABLE.test(e.item)) {
      consumed.add(`${e.side}:${baseId(e.species)}`);
      continue;
    }
    if (e.type === 'move') {
      const move = ctx.moveLookup.get(normalizeId(e.move));
      const m = { ...e, moveEntry: move, priority: move?.priority ?? 0 };
      lastMove = m;
      turnMoves.push(m);
      if (turn > 0) {
        for (const earlier of moves) checkOrder(earlier, m);
        moves.push(m);
      }
      continue;
    }
    if (e.type === 'hp' && e.cause === 'move' && lastMove && lastMove.side !== e.side) {
      lastMove.read = true;
      checkHit(lastMove, e);
      continue;
    }
    if (e.type === 'hp' && e.side === 'opp' && e.to != null) oppPct.set(baseId(e.species), e.to);
  }

  // Priority that depends on the field or an ability is not knowable from the log alone, so
  // those pairs are skipped rather than guessed.
  function priorityKnown(m) {
    const move = m.moveEntry;
    if (!move) return false;
    if (move.id === 'grassyglide') return false;
    const abilities = (entryOf(ctx, m.species)?.abilities ?? []).map(normalizeId);
    if (abilities.includes('prankster') && move.category === 'Status') return false;
    if (abilities.includes('triage') && move.flags?.heal) return false;
    if (abilities.includes('galewings') && move.type === 'Flying') return false;
    return true;
  }

  function checkOrder(first, second) {
    if (first.side === second.side) return;
    if (!priorityKnown(first) || !priorityKnown(second)) return;
    if (first.priority !== second.priority) return;
    const mine = first.side === 'you' ? first : second;
    const theirs = first.side === 'opp' ? first : second;
    const o = ownFor(mine.species);
    const t = oppFor(theirs.species);
    if (!o || !t) return;
    const f = fieldFor();
    const mySpeed = finalSpeed(stateFor('you', mine.species, o.state), f);
    const oppFirst = first.side === 'opp';
    const trickRoom = Boolean(field.trickRoom);
    const fits = [];
    for (const c of t.candidates) {
      const s = finalSpeed(stateFor('opp', theirs.species, { ...c.state, pokemon: entryOf(ctx, theirs.species) }), f);
      let ok;
      if (s === mySpeed) ok = 'tie';
      else ok = (s > mySpeed) !== trickRoom === oppFirst;
      fits.push({ id: c.id, ok: ok === 'tie' ? true : ok, tie: ok === 'tie', speed: s });
    }
    const verb = oppFirst ? 'before' : 'after';
    const text = `${theirs.species} (${theirs.move}) moved ${verb} your ${mine.species} (${mine.move}, Speed ${mySpeed}${trickRoom ? ', Trick Room' : ''})`;
    const assumed = o.source !== 'paste';
    t.checks.push({ turn, kind: 'speed', text, fits, assumed });
    addNote(`${text}: ${summarizeFits(t, fits)}${assumed ? ASSUMED_NOTE : ''}`);
  }

  function checkHit(m, hp) {
    if (hp.effect === 'immune' || !m.moveEntry || m.moveEntry.category === 'Status') return;
    if (hp.side === 'you') {
      const id = baseId(hp.species);
      hitsReceived.set(id, (hitsReceived.get(id) ?? 0) + 1);
    }
    if (hp.from == null || hp.to == null) return;
    // A KO after an earlier attack this turn that may have hit the same Pokémon, with no HP read
    // for it, did less than the HP the log starts it from: no damage check (live-2, Double-Edge
    // then Shadow Ball on Malamar).
    if (hp.to === 0 && unreadHitBefore(m, hp)) {
      addNote(`${m.side === 'opp' ? '' : 'your '}${m.species}'s ${m.move} KO'd ${hp.side === 'you' ? 'your ' : ''}${hp.species}: not checked, an earlier hit this turn had no HP reading`);
      return;
    }
    const targets = (m.targets ?? []).length;
    const moveOptions = targets <= 1 ? { singleTarget: true } : {};
    const f = fieldFor();
    const unsure = hp.conf === 'unsure' || hp.src === 'inferred' ? ' (HP reading unsure)' : '';
    if (m.side === 'opp') {
      const t = oppFor(m.species);
      const o = ownFor(hp.species);
      if (!t || !o) return;
      const defender = stateFor('you', hp.species, o.state);
      const max = maxHp(defender);
      defender.currentHpFraction = Math.min(1, Math.max(hp.from, 1) / max);
      const observed = hp.from - hp.to;
      const ko = hp.to === 0;
      const fits = t.candidates.map((c) => {
        const attacker = stateFor('opp', m.species, { ...c.state, pokemon: entryOf(ctx, m.species) });
        return hitFit({ attacker, defender, move: m.moveEntry, f, moveOptions, observed, ko, unit: 'hp', from: hp.from, id: c.id, crit: hp.crit });
      });
      const text = `${m.species}'s ${m.move} did ${observed} HP to your ${hp.species} (${hp.from}→${hp.to}${ko ? ', KO' : ''}${hp.crit ? ', crit' : ''})${unsure}`;
      const assumed = o.source !== 'paste';
      t.checks.push({ turn, kind: 'attack', text, fits, unsure: Boolean(unsure), assumed });
      addNote(`${text}: ${summarizeFits(t, fits)}${assumed ? ASSUMED_NOTE : ''}`);
    } else {
      const t = oppFor(hp.species);
      const o = ownFor(m.species);
      if (!t || !o) return;
      const attacker = stateFor('you', m.species, o.state);
      const from = hp.from ?? oppPct.get(baseId(hp.species)) ?? 100;
      const observed = from - hp.to;
      const ko = hp.to === 0;
      const opts = { ...moveOptions, hitsReceived: hitsReceived.get(baseId(m.species)) ?? 0 };
      const fits = t.candidates.map((c) => {
        const defender = stateFor('opp', hp.species, { ...c.state, pokemon: entryOf(ctx, hp.species) });
        defender.currentHpFraction = Math.min(1, Math.max(from, 1) / 100);
        return hitFit({ attacker, defender, move: m.moveEntry, f, moveOptions: opts, observed, ko, unit: 'pct', from, id: c.id, crit: hp.crit });
      });
      const text = `your ${m.species}'s ${m.move} did ${observed}% to ${hp.species} (${from}%→${hp.to}%${ko ? ', KO' : ''}${hp.crit ? ', crit' : ''})${unsure}`;
      const assumed = o.source !== 'paste';
      t.checks.push({ turn, kind: 'defense', text, fits, unsure: Boolean(unsure), assumed });
      addNote(`${text}: ${summarizeFits(t, fits)}${assumed ? ASSUMED_NOTE : ''}`);
      oppPct.set(baseId(hp.species), hp.to);
    }
  }

  function unreadHitBefore(m, hp) {
    const target = `${hp.side}.${hp.slot}`;
    return turnMoves.some((x) => x !== m && x.side === m.side && !x.read
      && x.moveEntry && x.moveEntry.category !== 'Status'
      && (!(x.targets ?? []).length || x.targets.includes(target)));
  }

  function hitFit({ attacker, defender, move, f, moveOptions, observed, ko, unit, from, id, crit: wasCrit }) {
    const calc = (critical) => calculateDamage({ attacker: attacker.pokemon, defender: defender.pokemon, move, attackerState: attacker, defenderState: defender, field: f, critical, moveOptions });
    const normal = calc(Boolean(wasCrit));
    if (!normal.supported) return { id, ok: null, reason: normal.reason ?? 'unsupported' };
    const range = (r) => unit === 'hp'
      ? [r.minDamage, r.maxDamage]
      : [r.minDamage / r.defenderHp * 100, r.maxDamage / r.defenderHp * 100];
    const inRange = ([lo, hi]) => (ko ? hi >= from - (unit === 'pct' ? 1 : 0) : lo - (unit === 'pct' ? 1.5 : 0) <= observed && observed <= hi + (unit === 'pct' ? 1.5 : 0));
    const [lo, hi] = range(normal);
    if (inRange([lo, hi])) return { id, ok: true, range: [lo, hi] };
    if (wasCrit) return { id, ok: false, range: [lo, hi], low: ko ? true : observed > hi };
    const crit = calc(true);
    if (crit.supported && inRange(range(crit))) return { id, ok: true, crit: true, range: range(crit) };
    return { id, ok: false, range: [lo, hi], low: ko ? true : observed > hi };
  }

  function summarizeFits(t, fits) {
    const known = fits.filter((f) => f.ok !== null);
    if (!known.length) return 'not calculable';
    const share = known.filter((f) => f.ok).reduce((a, f) => a + (t.candidates.find((c) => c.id === f.id)?.share ?? 0), 0);
    const top = t.candidates[0];
    const topFit = fits.find((f) => f.id === top.id);
    const topText = topFit?.ok === null ? '' : `; the most used set (${spreadLabel(top.spread)} @ ${top.item}) ${topFit.ok ? (topFit.crit ? 'fits only with a crit' : 'fits') : 'does not fit'}${topFit.range ? ` (${topFit.crit ? 'crit ' : ''}${fmtRange(topFit.range, topFit)})` : ''}`;
    return `${Math.round(share * 100)}% of listed sets fit${topText}`;
  }

  // ---------- verdicts per opposing Pokémon ----------
  const verdicts = [];
  for (const t of opp.values()) {
    if (!t.checks.length) continue;
    const scored = t.candidates.map((c) => {
      let misses = 0;
      let crits = 0;
      for (const check of t.checks) {
        const f = check.fits.find((x) => x.id === c.id);
        if (!f || f.ok === null) continue;
        if (!f.ok && !check.assumed) misses += check.unsure ? 0.5 : 1;
        if (f.crit) crits++;
      }
      return { ...c, misses, crits };
    });
    const fitting = scored.filter((c) => c.misses === 0).sort((a, b) => a.crits - b.crits || b.weight - a.weight);
    const share = fitting.reduce((a, c) => a + c.share, 0);
    verdicts.push({ species: t.species, checks: t.checks, total: scored.length, fitting, share, best: [...scored].sort((a, b) => a.misses - b.misses || a.crits - b.crits || b.weight - a.weight).slice(0, 5), ruledOut: scored.filter((c) => c.misses > 0).slice(0, 3) });
  }

  for (const o of own.values()) if (o.note) notes.push(`Your ${o.species}: ${o.note}.`);
  return { match, own: [...own.values()], verdicts, turnNotes, notes };
}

function fmtRange([lo, hi], f) {
  const pct = f && !Number.isInteger(lo);
  return pct ? `${lo.toFixed(1)}–${hi.toFixed(1)}%` : `${lo}–${hi}`;
}

// ---------- Markdown ----------

export function formatReview(review) {
  const lines = [];
  const { match } = review;
  lines.push(`# Match review${match.players?.opp ? ` vs ${match.players.opp}` : ''}`, '');
  if (match.video) lines.push(`Source: ${match.video}.`, '');
  lines.push('## Opponent sets', '');
  if (!review.verdicts.length) lines.push('No Speed or damage readings to check.', '');
  for (const v of review.verdicts) {
    lines.push(`### ${v.species}`, '');
    const counted = v.checks.filter((c) => !c.assumed).length;
    if (!counted) {
      lines.push('Every reading for this Pokémon depends on one of your sets, which are assumed, so nothing is ruled out. Pass `--team`.');
    } else if (v.fitting.length) {
      lines.push(`${v.fitting.length} of ${v.total} listed sets fit everything seen (${Math.round(v.share * 100)}% of usage weight). Most likely:`, '');
      for (const c of v.fitting.slice(0, 5)) lines.push(`- ${spreadLabel(c.spread)} @ ${c.item} (${(c.share * 100).toFixed(1)}%${c.ncp ? `, NCP "${c.ncp}"` : ''}${c.crits ? ', needs a crit' : ''})`);
    } else {
      lines.push(`No listed set fits every reading. Closest:`, '');
      for (const c of v.best.slice(0, 3)) lines.push(`- ${spreadLabel(c.spread)} @ ${c.item} (misses ${c.misses})`);
    }
    if (v.fitting.length && v.ruledOut.length) {
      lines.push('', `Ruled out: ${v.ruledOut.map((c) => `${spreadLabel(c.spread)} @ ${c.item} (${(c.share * 100).toFixed(1)}%)`).join('; ')}.`);
    }
    lines.push('', 'Based on:', '');
    for (const c of v.checks) lines.push(`- T${c.turn}: ${c.text}${c.assumed ? ' (not counted: your set is assumed)' : ''}`);
    lines.push('');
  }
  lines.push('## Turn by turn', '');
  for (const [turn, notes] of [...review.turnNotes.entries()].sort((a, b) => a[0] - b[0])) {
    lines.push(`**Turn ${turn || 'lead'}**`, '');
    for (const n of notes) lines.push(`- ${n}`);
    lines.push('');
  }
  lines.push('## Your sets', '');
  for (const o of review.own) lines.push(`- ${o.species}: ${o.source}${o.note ? ` (${o.note})` : ''}`);
  if (review.own.some((o) => o.source !== 'paste')) lines.push('', 'Pass `--team <paste>` for exact results; assumed sets only match your HP, not your offence or Speed.');
  lines.push('');
  return lines.join('\n');
}

// A live session's log holds one match … end run per match: review each on its own.
export function splitMatches(events) {
  const games = [];
  for (const e of events) {
    if (e.type === 'match' || !games.length) games.push([]);
    games.at(-1).push(e);
  }
  return games;
}

// ---------- CLI ----------

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const opt = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const positional = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
  const [logPath, outPath] = positional;
  if (!logPath) {
    console.error('Usage: node review.mjs <turn-log.jsonl> [review.md] [--team <paste file>] [--json <out.json>]');
    process.exit(2);
  }
  const events = readFileSync(logPath, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const teamPath = opt('--team');
  const ctx = loadContext();
  const teamPaste = teamPath ? readFileSync(teamPath, 'utf8') : '';
  const games = splitMatches(events);
  const reviews = games.map((g) => reviewLog(ctx, g, { teamPaste }));
  const md = reviews.map((r, i) => {
    const text = formatReview(r);
    return games.length > 1 ? text.replace(/^# Match review/, `# Match ${i + 1} review`) : text;
  }).join('\n');
  if (outPath) writeFileSync(outPath, md);
  else process.stdout.write(md);
  const jsonPath = opt('--json');
  if (jsonPath) {
    const slim = (review) => ({ ...review, turnNotes: Object.fromEntries(review.turnNotes), own: review.own.map(({ state, ...o }) => o), verdicts: review.verdicts.map((v) => ({ ...v, fitting: v.fitting.map(({ state, ...c }) => c), best: v.best.map(({ state, ...c }) => c), ruledOut: v.ruledOut.map(({ state, ...c }) => c) })) });
    writeFileSync(jsonPath, JSON.stringify(reviews.length > 1 ? reviews.map(slim) : slim(reviews[0]), null, 1));
  }
}
