// Name lookup from PokéCal's slim catalogs: zh-TW aliases + English names -> English catalog name.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The PokéCal checkout this folder sits in (tracker/..), for public/web/*.json.
export const REPO = fileURLToPath(new URL('..', import.meta.url));

export function levenshtein(a, b) {
  const A = [...a], B = [...b];
  let prev = Array.from({ length: B.length + 1 }, (_, j) => j);
  for (let i = 1; i <= A.length; i++) {
    const cur = [i];
    for (let j = 1; j <= B.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[B.length];
}

function table(repo, file, filter = () => true) {
  const entries = JSON.parse(readFileSync(join(repo, 'public/web', file), 'utf8')).filter(filter);
  const keys = [];
  for (const e of entries) {
    for (const alias of e.aliases ?? []) keys.push({ key: alias.normalize('NFKC').replace(/\s+/g, '').toLowerCase(), name: e.name, entry: e });
    keys.push({ key: e.name.toLowerCase(), name: e.name, entry: e });
  }
  // English battle text names the base species ("Floette") where the catalog only has a forme
  // ("Floette-Eternal", the Champions Floette): add the base name for non-Mega formes, named as in battle.
  const names = new Set(entries.map((e) => e.name));
  for (const e of entries) {
    if (e.baseSpecies && !names.has(e.baseSpecies) && !/-Mega/.test(e.name)) {
      names.add(e.baseSpecies);
      keys.push({ key: e.baseSpecies.toLowerCase(), name: e.baseSpecies, entry: e });
    }
  }
  return { entries, keys };
}

export function loadLexicon(repo = REPO) {
  // Base forms only for species (Mega forms share the zh alias; megas come from messages).
  return {
    pokemon: table(repo, 'pokemon.json', (e) => !e.forme || !/Mega/.test(e.forme)),
    allPokemon: JSON.parse(readFileSync(join(repo, 'public/web/pokemon.json'), 'utf8')),
    moves: table(repo, 'moves.json'),
    items: table(repo, 'items.json'),
    abilities: table(repo, 'abilities.json'),
  };
}

// Fuzzy match. `prefer` is a list of English names tried first with a looser threshold.
// Returns {name, dist, conf} or null.
export function match(tab, raw, { prefer = [] } = {}) {
  const text = (raw ?? '').normalize('NFKC').replace(/\s+/g, '');
  if (!text) return null;
  const lower = text.toLowerCase();
  const scan = (keys, maxRatio) => {
    let best = null;
    for (const k of keys) {
      const d = levenshtein(lower, k.key);
      if (!best || d < best.dist || (d === best.dist && k.key.length > best.key.length)) best = { ...k, dist: d };
    }
    if (!best) return null;
    const len = Math.max([...best.key].length, [...lower].length);
    return best.dist <= Math.floor(len * maxRatio) ? best : null;
  };
  const preferred = prefer.length ? scan(tab.keys.filter((k) => prefer.includes(k.name)), 0.5) : null;
  const any = scan(tab.keys, 0.34);
  let best = preferred;
  if (!best || (any && any.dist < best.dist)) best = any ?? preferred;
  if (!best) return null;
  return { name: best.name, dist: best.dist, conf: best.dist === 0 ? 'sure' : best.dist === 1 ? 'likely' : 'unsure' };
}

export function megaForm(lex, species) {
  const e = lex.allPokemon.find((p) => p.baseSpecies === species && /^Mega/.test(p.forme ?? ''));
  return e?.name ?? `${species}-Mega`;
}
