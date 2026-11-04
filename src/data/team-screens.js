// Reads a team from the two Pokémon Champions team screens: 能力 (abilities: ability, item,
// moves) and 狀態 (stats: each stat with its SP and the nature arrows). No OCR library:
//
// - Numbers are matched against digit templates learned from the game font
//   (team-screens-digits.js).
// - The nature comes from the colour of the ↑ and ↓ arrows next to the stat names.
// - The species and form come from the stats: with SP and nature known, the six stats pin down
//   the base stats. The type icons settle forms that share base stats, such as Rotom's.
// - Ability, item and move names are compared as shapes against the zh-TW names of that
//   species' own candidates, drawn by `renderText` (a canvas in the browser). Each move is
//   first narrowed to the type of its icon.
//
// Images are { width, height, data } with RGBA bytes, as from a canvas's getImageData. Boxes
// are in the coordinates of a 2360×1640 iPad screenshot and scaled to the image's width.
import { normalizeId } from "../identifiers.js";
import { calculateStat } from "../engine/stats.js";
import { NATURES } from "../engine/natures.js";
import { DIGIT_TEMPLATES, DIGIT_GRID } from "./team-screens-digits.js";

export const REFERENCE_WIDTH = 2360;
export const REFERENCE_HEIGHT = 1640;
const STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"];
const PANEL_X = [230, 1215];
const PANEL_Y = [442, 711, 980];
// Panel order on screen: left then right, top to bottom.
export const PANELS = PANEL_Y.flatMap((y) => PANEL_X.map((x) => ({ x, y })));

// Stats screen, relative to a panel: [stat, row y, value box x, SP box x, arrow x].
const STAT_CELLS = [
  ["hp", 90, [240, 335], [370, 445], null],
  ["atk", 146, [240, 335], [370, 445], 185],
  ["def", 201, [240, 335], [370, 445], 185],
  ["spa", 90, [670, 765], [795, 875], 615],
  ["spd", 146, [670, 765], [795, 875], 615],
  ["spe", 201, [670, 765], [795, 875], 615],
];
const ROW_HALF = 22;
const TYPE_ICON_X = [502, 450, 404];
const TYPE_ICON_Y = 36;
const ABILITY_BOX = [100, 72, 395, 118];
const ITEM_BOX = [108, 128, 395, 176];
const MOVE_ROWS = [38, 96, 150, 205];
const MOVE_ICON_X = 580;
const MOVE_TEXT_X = [604, 911];

// Type icon colours as averaged over the icon (glyph excluded). Measured on game screenshots
// where available; the rest are the Scarlet/Violet icon colours blended a quarter toward white,
// which is how the measured ones relate to theirs.
const TYPE_COLORS = {
  Normal: [166, 166, 166], Fire: [221, 90, 90], Water: [85, 154, 243], Electric: [251, 204, 50],
  Grass: [125, 191, 109], Ice: [110, 218, 246], Fighting: [255, 180, 103], Poison: [173, 113, 216],
  Ground: [173, 126, 91], Flying: [145, 193, 242], Psychic: [243, 100, 146], Bug: [173, 184, 83],
  Rock: [195, 191, 161], Ghost: [156, 123, 156], Dragon: [124, 136, 233], Dark: [122, 110, 110],
  Steel: [136, 185, 202], Fairy: [243, 148, 243],
};

// ---------- pixels ----------

function scaleOf(image) {
  return image.width / REFERENCE_WIDTH;
}

function pixel(image, x, y) {
  const k = (Math.round(y) * image.width + Math.round(x)) * 4;
  return [image.data[k], image.data[k + 1], image.data[k + 2]];
}

// Masks hold a weight per pixel, 0–255. Light text on the purple panels: red and green are what
// set it apart, since the panel and its faint slot numbers are purple-blue and item and type
// icons are saturated. Thin strokes come out half-bright, so the weight ramps up instead of
// cutting off; bounds, columns and digit splits count only strong pixels (STRONG and up), while
// the shape comparison uses every weight.
export const STRONG = 128;
function textWeight([r, g, b]) {
  if (b <= 200 || Math.abs(r - g) >= 30) return 0;
  const w = ((r + g) / 2 - 170) / 50;
  return w <= 0 ? 0 : w >= 1 ? 255 : Math.round(w * 255);
}

// A text mask over a reference-coordinate box, trimmed to the text's bounding box.
export function textMask(image, [x0, y0, x1, y1]) {
  const s = scaleOf(image);
  const left = Math.round(x0 * s);
  const top = Math.round(y0 * s);
  const width = Math.max(1, Math.round((x1 - x0) * s));
  const height = Math.max(1, Math.round((y1 - y0) * s));
  const data = new Uint8Array(width * height);
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      if (top + j >= image.height || left + i >= image.width) continue;
      data[j * width + i] = textWeight(pixel(image, left + i, top + j));
    }
  }
  return trimMask(mainColumns(trimMask({ width, height, data })));
}

// Keeps the densest group of columns, where a group allows gaps up to 1.6 line heights: the
// space between characters, plus a character whose strokes are too thin to pass the text test
// (一 in 再來一次). Drops specks from the panel edge or a faint slot number further away.
export function mainColumns(mask) {
  if (!mask) return null;
  const counts = new Array(mask.width).fill(0);
  for (let j = 0; j < mask.height; j++) for (let i = 0; i < mask.width; i++) if (mask.data[j * mask.width + i] >= STRONG) counts[i]++;
  const maxGap = Math.max(3, Math.round(mask.height * 1.6));
  let best = null;
  let group = null;
  let gap = 0;
  for (let i = 0; i <= mask.width; i++) {
    const filled = i < mask.width && counts[i] > 0;
    if (filled) {
      if (!group) group = { start: i, end: i, weight: 0 };
      group.end = i;
      group.weight += counts[i];
      gap = 0;
    } else if (group && (++gap > maxGap || i === mask.width)) {
      if (!best || group.weight > best.weight) best = group;
      group = null;
    }
  }
  if (!best) return mask;
  const data = new Uint8Array(mask.width * mask.height);
  for (let j = 0; j < mask.height; j++) for (let i = best.start; i <= best.end; i++) data[j * mask.width + i] = mask.data[j * mask.width + i];
  return { width: mask.width, height: mask.height, data };
}

export function trimMask(mask) {
  const { width, height, data } = mask;
  let x0 = width;
  let x1 = -1;
  let y0 = height;
  let y1 = -1;
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      if (data[j * width + i] < STRONG) continue;
      if (i < x0) x0 = i;
      if (i > x1) x1 = i;
      if (j < y0) y0 = j;
      if (j > y1) y1 = j;
    }
  }
  if (x1 < 0) return null;
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const out = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) out[j * w + i] = data[(y0 + j) * width + x0 + i];
  return { width: w, height: h, data: out };
}

// Area-sampled, unit-length vector of a mask on a gw×gh grid.
export function maskVector(mask, gw, gh) {
  const v = new Float64Array(gw * gh);
  for (let j = 0; j < mask.height; j++) {
    for (let i = 0; i < mask.width; i++) {
      const w = mask.data[j * mask.width + i];
      if (w) v[Math.floor((j * gh) / mask.height) * gw + Math.floor((i * gw) / mask.width)] += w;
    }
  }
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= norm;
  return v;
}

function dot(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

// Shape similarity of two text masks: grid correlation, penalised when the widths (relative to
// height) differ, which mostly means a different number of characters.
const SHAPE = { grid: 16, blur: 1 };
export function shapeScore(a, b) {
  const ar = a.width / a.height;
  const br = b.width / b.height;
  const ratio = Math.min(ar, br) / Math.max(ar, br);
  const gh = SHAPE.grid;
  const gw = Math.max(8, Math.round(ar * gh));
  return dot(blurVector(maskVector(a, gw, gh), gw, gh), blurVector(maskVector(b, gw, gh), gw, gh)) * ratio ** 1.5;
}

// 3×3 box blur, renormalised, so strokes a cell apart in two fonts still overlap.
function blurVector(v, gw, gh) {
  if (!SHAPE.blur) return v;
  const out = new Float64Array(v.length);
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      let sum = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const y = j + dj;
        const x = i + di;
        if (x >= 0 && x < gw && y >= 0 && y < gh) sum += v[y * gw + x] * (di === 0 && dj === 0 ? 2 : 1);
      }
      out[j * gw + i] = sum;
    }
  }
  let norm = 0;
  for (const x of out) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

// ---------- screen detection ----------

// Which tab is lit: 能力 (abilities) on the left, 狀態 (stats) on the right. The lit tab is
// yellow-green.
export function detectScreen(image) {
  const ratio = image.width / image.height;
  if (Math.abs(ratio - REFERENCE_WIDTH / REFERENCE_HEIGHT) > 0.03) return null;
  const lit = (x0, x1) => {
    const s = scaleOf(image);
    let count = 0;
    let total = 0;
    for (let y = 372; y <= 396; y += 4) {
      for (let x = x0; x <= x1; x += 6) {
        const [r, g, b] = pixel(image, x * s, y * s);
        total++;
        if (g > 210 && b < 150 && r > 150) count++;
      }
    }
    return count / total;
  };
  const left = lit(780, 1150);
  const right = lit(1200, 1560);
  if (left > 0.4 && right < 0.2) return "abilities";
  if (right > 0.4 && left < 0.2) return "stats";
  return null;
}

// ---------- numbers and arrows ----------

// Splits a line of digits at empty columns. Thin strokes can break a digit into pieces, so runs
// a column or two apart are joined while the result is still no wider than a digit.
export function splitGlyphs(mask) {
  const runs = [];
  let start = -1;
  for (let i = 0; i <= mask.width; i++) {
    let filled = false;
    if (i < mask.width) for (let j = 0; j < mask.height; j++) if (mask.data[j * mask.width + i] >= STRONG) { filled = true; break; }
    if (filled && start < 0) start = i;
    if (!filled && start >= 0) {
      runs.push([start, i]);
      start = -1;
    }
  }
  const maxWidth = mask.height * 0.75;
  const merged = [];
  for (const run of runs) {
    const last = merged[merged.length - 1];
    if (last && run[0] - last[1] <= 2 && run[1] - last[0] <= maxWidth) last[1] = run[1];
    else merged.push([...run]);
  }
  return merged
    .map(([a, b]) => {
      const w = b - a;
      const data = new Uint8Array(w * mask.height);
      for (let j = 0; j < mask.height; j++) for (let k = 0; k < w; k++) data[j * w + k] = mask.data[j * mask.width + a + k];
      return trimMask({ width: w, height: mask.height, data });
    })
    .filter(Boolean);
}

export function glyphVector(glyph) {
  // Pad to the line height so a short glyph keeps its place, then sample on the digit grid.
  return maskVector(glyph, DIGIT_GRID.width, DIGIT_GRID.height);
}

export function readNumber(image, box) {
  const mask = textMask(image, box);
  if (!mask) return { value: null, confidence: 0 };
  const glyphs = splitGlyphs(mask).filter((g) => g.height > mask.height * 0.5);
  if (!glyphs.length || glyphs.length > 3) return { value: null, confidence: 0 };
  let confidence = 1;
  let text = "";
  for (const glyph of glyphs) {
    const v = glyphVector(glyph);
    const ranked = Object.entries(DIGIT_TEMPLATES)
      .map(([digit, t]) => [digit, dot(v, t)])
      .sort((a, b) => b[1] - a[1]);
    text += ranked[0][0];
    confidence = Math.min(confidence, ranked[0][1] - ranked[1][1]);
  }
  return { value: Number(text), confidence };
}

// "up", "down" or null from the arrow beside a stat name.
export function readArrow(image, x, y) {
  const s = scaleOf(image);
  let up = 0;
  let down = 0;
  for (let j = -12; j <= 12; j += 2) {
    for (let i = -12; i <= 12; i += 2) {
      const [r, g, b] = pixel(image, (x + i) * s, (y + j) * s);
      if (r > 220 && g < 160 && b < 190) up++;
      else if (b > 210 && r < 150 && g > 140) down++;
    }
  }
  if (up >= 4 && up > down * 2) return "up";
  if (down >= 4 && down > up * 2) return "down";
  return null;
}

export function natureFromArrows(up, down) {
  if (!up && !down) return "Hardy";
  if (!up || !down) return null;
  return Object.entries(NATURES).find(([, effect]) => effect.up === up && effect.down === down)?.[0] ?? null;
}

// Average colour of an icon with its white glyph left out, matched to the nearest type.
export function iconType(image, x, y) {
  const s = scaleOf(image);
  let n = 0;
  const sum = [0, 0, 0];
  for (let j = -9; j <= 9; j++) {
    for (let i = -9; i <= 9; i++) {
      const p = pixel(image, (x + i) * s, (y + j) * s);
      if (Math.min(...p) > 200) continue;
      sum[0] += p[0];
      sum[1] += p[1];
      sum[2] += p[2];
      n++;
    }
  }
  if (!n) return [];
  const color = sum.map((v) => v / n);
  return Object.entries(TYPE_COLORS)
    .map(([type, c]) => ({ type, distance: Math.hypot(c[0] - color[0], c[1] - color[1], c[2] - color[2]) }))
    .sort((a, b) => a.distance - b.distance);
}

// ---------- the stats screen ----------

// The value and SP boxes of each stat in a panel, in STAT_KEYS order.
export function statCellBoxes({ x, y }) {
  return STAT_CELLS.map(([stat, row, valueX, spX, arrowX]) => ({
    stat,
    index: STAT_KEYS.indexOf(stat),
    valueBox: [x + valueX[0], y + row - ROW_HALF, x + valueX[1], y + row + ROW_HALF],
    spBox: [x + spX[0], y + row - ROW_HALF, x + spX[1], y + row + ROW_HALF],
    arrow: arrowX == null ? null : [x + arrowX, y + row],
  }));
}

export function readStatsScreen(image) {
  return PANELS.map(({ x, y }) => {
    const stats = {};
    const sp = {};
    const arrows = {};
    let confidence = 1;
    for (const [stat, row, valueX, spX, arrowX] of STAT_CELLS) {
      const value = readNumber(image, [x + valueX[0], y + row - ROW_HALF, x + valueX[1], y + row + ROW_HALF]);
      const points = readNumber(image, [x + spX[0], y + row - ROW_HALF, x + spX[1], y + row + ROW_HALF]);
      stats[stat] = value.value;
      sp[stat] = points.value;
      confidence = Math.min(confidence, value.confidence, points.confidence);
      if (arrowX != null) arrows[stat] = readArrow(image, x + arrowX, y + row);
    }
    if (STAT_KEYS.every((k) => stats[k] == null)) return null;
    const up = STAT_KEYS.find((k) => arrows[k] === "up") ?? null;
    const down = STAT_KEYS.find((k) => arrows[k] === "down") ?? null;
    const types = TYPE_ICON_X.map((ix) => iconType(image, x + ix, y + TYPE_ICON_Y)[0]).filter(Boolean);
    return { stats, sp, nature: natureFromArrows(up, down), types, confidence };
  });
}

// Species whose stats match: exact first, else the ones that miss a single stat (one misread
// number). Forms with equal base stats are ordered by how well their types match the icons.
export function speciesFromStats(pokemon, { stats, sp, nature, types = [] }) {
  if (!nature) return [];
  const scored = [];
  for (const entry of pokemon) {
    if (!entry.baseStats || entry.champions?.legal === false) continue;
    let misses = 0;
    for (const k of STAT_KEYS) {
      if (stats[k] == null || sp[k] == null) { misses++; continue; }
      if (calculateStat({ base: entry.baseStats[k], stat: k, sp: sp[k], nature }) !== stats[k]) misses++;
      if (misses > 1) break;
    }
    if (misses <= 1) scored.push({ entry, misses, typeScore: typeScore(entry, types) });
  }
  const best = Math.min(...scored.map((s) => s.misses));
  return scored
    .filter((s) => s.misses === best)
    .sort((a, b) => b.typeScore - a.typeScore || (a.entry.baseSpecies === a.entry.name ? -1 : 0) - (b.entry.baseSpecies === b.entry.name ? -1 : 0))
    .map((s) => ({ ...s.entry, statMisses: s.misses }));
}

function typeScore(entry, icons) {
  // Icons read right to left: the last type first, then the first type or a gender icon.
  const want = [...(entry.types ?? [])].reverse();
  let score = 0;
  want.forEach((type, i) => {
    const icon = icons[i];
    if (icon?.type === type && icon.distance < 45) score += 1;
  });
  return score;
}

// ---------- the abilities screen ----------

// Limitless usage of a species, or of its base species for a form without its own.
function usageOf(species, pokemon) {
  if (species.champions?.usage?.moves?.length) return species.champions.usage;
  return pokemon.find((p) => p.name === species.baseSpecies)?.champions?.usage ?? {};
}

function zhName(entry) {
  return entry?.aliases?.find((a) => /[㐀-鿿]/.test(a)) ?? null;
}

// Best match among named candidates; each candidate is { name, zh, usage } with usage as a
// percentage. The bundled name font only resembles the game's, so close shapes are settled by a small
// usage prior: a name people actually run wins a near tie over one nobody does.
export const USAGE_PRIOR = 0.08;
export function matchText(mask, candidates, renderText) {
  if (!mask || !candidates.length) return { name: null, confidence: 0, alternatives: [] };
  const ranked = candidates
    .map((c) => {
      const drawn = renderText(c.zh);
      const shape = drawn ? shapeScore(mask, drawn) : 0;
      return { name: c.name, zh: c.zh, shape, score: shape + USAGE_PRIOR * Math.sqrt(Math.min(100, c.usage ?? 0) / 100) };
    })
    .sort((a, b) => b.score - a.score);
  const tail = rankByTail(mask, ranked, renderText);
  const [first, second] = tail?.ranked ?? ranked;
  return {
    name: first.shape > 0.2 ? first.name : null,
    confidence: tail?.confidence ?? first.score - (second?.score ?? 0),
    score: first.score,
    alternatives: ranked.slice(1, 4).map((r) => r.name),
  };
}

// Names that differ only in their last character or two (Charizardite X and Y) draw almost the
// same shape, so the usage prior would decide. The close ones of equal length are re-ranked on
// the part of the text where they differ, without the prior.
const TAIL_GROUP = 0.08;
function rankByTail(mask, ranked, renderText) {
  const length = [...ranked[0].zh].length;
  const close = ranked.filter((r) => r.score >= ranked[0].score - TAIL_GROUP && [...r.zh].length === length);
  if (close.length < 2) return null;
  const chars = close.map((r) => [...r.zh]);
  let prefix = 0;
  while (prefix < length && chars.every((c) => c[prefix] === chars[0][prefix])) prefix++;
  if (prefix === 0 || length - prefix > 2) return null;
  // A Latin letter (Ｘ, Ｙ, Z) is narrower than a CJK character in the game's font, so it is cut
  // as the last run of columns rather than by character count, and drawn half-width.
  const tails = chars.map((c) => c.slice(prefix).join("").normalize("NFKC"));
  const latin = tails.every((t) => /^[A-Za-z0-9]$/.test(t));
  const tailMask = latin ? lastRun(mask) : sliceColumns(mask, prefix / length);
  if (!tailMask) return null;
  if (latin && tails.length === 2 && [...tails].sort().join("") === "XY") {
    // X and Y are told apart by their shape alone: X spreads to both lower corners, Y stands on
    // one stem. Comparing against a system font's X and Y depends on that font (on iPad PingFang
    // swapped them), so the glyph is measured instead.
    const spread = lowerSpread(tailMask);
    const want = spread > XY_SPREAD ? "X" : "Y";
    const scored = close.map((r, i) => ({ ...r, tail: tails[i] === want ? 1 : 0 })).sort((a, b) => b.tail - a.tail);
    const names = new Set(scored.map((r) => r.name));
    return {
      ranked: [...scored, ...ranked.filter((r) => !names.has(r.name))],
      confidence: Math.abs(spread - XY_SPREAD),
    };
  }
  const scored = close
    .map((r, i) => {
      const drawn = renderText(latin ? tails[i] : chars[i].slice(prefix).join(""));
      return { ...r, tail: drawn ? shapeScore(tailMask, drawn) : 0 };
    })
    .sort((a, b) => b.tail - a.tail);
  const names = new Set(scored.map((r) => r.name));
  return {
    ranked: [...scored, ...ranked.filter((r) => !names.has(r.name))],
    confidence: scored[0].tail - scored[1].tail,
  };
}

// The last glyph: the last run of columns with ink, bridging gaps of up to two columns where a
// thin stroke (the fork of a Y) is too faint to count.
// Mean width of ink across the bottom quarter of a glyph, relative to the glyph's width: near 1
// for X, near a stem's width for Y.
const XY_SPREAD = 0.6;
export function lowerSpread(mask) {
  const from = Math.floor(mask.height * 0.75);
  let sum = 0;
  let rows = 0;
  for (let j = from; j < mask.height; j++) {
    let left = -1;
    let right = -1;
    for (let i = 0; i < mask.width; i++) {
      if (mask.data[j * mask.width + i] < STRONG / 2) continue;
      if (left < 0) left = i;
      right = i;
    }
    if (left < 0) continue;
    sum += (right - left + 1) / mask.width;
    rows++;
  }
  return rows ? sum / rows : 0;
}

export function lastRun(mask) {
  const filled = (i) => {
    for (let j = 0; j < mask.height; j++) if (mask.data[j * mask.width + i] >= STRONG / 2) return true;
    return false;
  };
  let end = mask.width - 1;
  while (end >= 0 && !filled(end)) end--;
  if (end < 0) return null;
  let start = end;
  for (let i = end - 1; i >= 0 && end - i < mask.height; i--) {
    if (filled(i)) start = i;
    else if (start - i > 2) break;
  }
  return sliceColumns(mask, start / mask.width);
}

function sliceColumns(mask, fromFraction) {
  const start = Math.floor(mask.width * fromFraction);
  const width = mask.width - start;
  if (width < 2) return null;
  const data = new Uint8Array(width * mask.height);
  for (let j = 0; j < mask.height; j++) for (let i = 0; i < width; i++) data[j * width + i] = mask.data[j * mask.width + start + i];
  return trimMask({ width, height: mask.height, data });
}

export function readAbilitiesScreen(image, members, catalogs, renderText) {
  const moveById = new Map(catalogs.moves.map((m) => [m.id, m]));
  const abilityByName = new Map(catalogs.abilities.map((a) => [normalizeId(a.name), a]));
  return PANELS.map(({ x, y }, slot) => {
    const member = members[slot];
    if (!member?.species) return null;
    const species = member.species;
    const base = species.baseSpecies ?? species.name;
    const usage = usageOf(species, catalogs.pokemon);
    const pct = (list, name) => list?.find((e) => normalizeId(e.name) === normalizeId(name))?.usagePercent ?? 0;
    const abilities = (member.abilityOptions ?? species.abilities ?? [])
      .map((name) => ({ name, zh: zhName(abilityByName.get(normalizeId(name))), usage: pct(usage.abilities, name) }))
      .filter((c) => c.zh);
    const ability = matchText(textMask(image, [x + ABILITY_BOX[0], y + ABILITY_BOX[1], x + ABILITY_BOX[2], y + ABILITY_BOX[3]]), abilities, renderText);
    const items = catalogs.items
      .filter((item) => item.champions?.legal !== false && !item.isNonstandard)
      .filter((item) => !item.megaStone || (item.itemUser ?? []).includes(base))
      .map((item) => ({ name: item.name, zh: zhName(item), usage: Math.max(pct(usage.items, item.name), item.champions?.usagePercent ?? 0) }))
      .filter((c) => c.zh);
    const item = matchText(textMask(image, [x + ITEM_BOX[0], y + ITEM_BOX[1], x + ITEM_BOX[2], y + ITEM_BOX[3]]), items, renderText);
    const learnable = (species.moves ?? [])
      .map((id) => moveById.get(id))
      .filter((m) => m && m.champions?.legal !== false && zhName(m));
    const moves = MOVE_ROWS.map((row) => {
      const mask = textMask(image, [x + MOVE_TEXT_X[0], y + row - 24, x + MOVE_TEXT_X[1], y + row + 24]);
      if (!mask) return null;
      const types = iconType(image, x + MOVE_ICON_X, y + row);
      const near = types.filter((t) => t.distance <= types[0].distance + 15).map((t) => t.type);
      const ofType = learnable.filter((m) => near.includes(m.type));
      const pool = (ofType.length ? ofType : learnable).map((m) => ({ name: m.name, zh: zhName(m), usage: pct(usage.moves, m.name) }));
      return matchText(mask, pool, renderText);
    });
    return { ability, item, moves };
  });
}

// ---------- both screens ----------

// A name whose best match beats the runner-up by less than this is listed to check. Measured on
// the fixture teams: every misread so far fell under it, along with about one right read in 15.
const CHECK_MARGIN = 0.035;

const SP_LABELS = { hp: "HP", atk: "Atk", def: "Def", spa: "SpA", spd: "SpD", spe: "Spe" };

// Reads a team from any order of the two screenshots. Returns members (with warnings) and a
// Showdown paste with SPs.
export function readTeamScreens(images, catalogs, renderText) {
  const warnings = [];
  const byScreen = {};
  for (const image of images) {
    const screen = detectScreen(image);
    if (screen) byScreen[screen] = image;
  }
  if (!byScreen.stats) {
    return { members: [], paste: "", warnings: ["noStats"], screens: Object.keys(byScreen) };
  }
  const statPanels = readStatsScreen(byScreen.stats);
  const members = statPanels.map((panel) => {
    if (!panel) return null;
    const matches = speciesFromStats(catalogs.pokemon, panel);
    return {
      species: matches[0] ?? null,
      forms: matches.slice(1).map((m) => m.name),
      nature: panel.nature,
      sp: panel.sp,
      stats: panel.stats,
      statMisses: matches[0]?.statMisses ?? null,
      warnings: [],
    };
  });
  let abilityPanels = [];
  if (byScreen.abilities && renderText) {
    abilityPanels = readAbilitiesScreen(byScreen.abilities, members, catalogs, renderText);
  }
  members.forEach((member, slot) => {
    if (!member) return;
    if (!member.species) member.warnings.push("species");
    else if (member.statMisses) member.warnings.push("statMismatch");
    if (!member.nature) member.warnings.push("nature");
    const read = abilityPanels[slot];
    if (read) {
      member.ability = read.ability.name;
      member.item = read.item.name;
      member.moves = read.moves.filter((m) => m?.name).map((m) => m.name);
      member.confidence = { ability: read.ability.confidence, item: read.item.confidence, moves: read.moves.map((m) => m?.confidence ?? 0) };
      if (!read.ability.name || read.ability.confidence < CHECK_MARGIN) member.warnings.push("ability");
      if (!read.item.name || read.item.confidence < CHECK_MARGIN) member.warnings.push("item");
      read.moves.forEach((m, i) => {
        if (m && (!m.name || m.confidence < CHECK_MARGIN)) member.warnings.push(`move${i + 1}`);
      });
      // Forms that share stats but not abilities (Squawkabilly's plumages) follow the ability.
      if (member.ability && member.forms.length) {
        const all = [member.species, ...member.forms.map((name) => catalogs.pokemon.find((p) => p.name === name))];
        const fit = all.find((p) => p?.abilities?.includes(member.ability));
        if (fit) member.species = fit;
      }
    }
  });
  if (!byScreen.abilities) warnings.push("noAbilities");
  const found = members.filter((m) => m?.species);
  return { members: found, paste: found.map(formatMember).join("\n\n"), warnings, screens: Object.keys(byScreen) };
}

export function formatMember(member) {
  const lines = [`${member.species.name}${member.item ? ` @ ${member.item}` : ""}`];
  if (member.ability) lines.push(`Ability: ${member.ability}`);
  const sp = STAT_KEYS.filter((k) => member.sp[k]).map((k) => `${member.sp[k]} ${SP_LABELS[k]}`);
  if (sp.length) lines.push(`SPs: ${sp.join(" / ")}`);
  if (member.nature) lines.push(`${member.nature} Nature`);
  for (const move of member.moves ?? []) lines.push(`- ${move}`);
  return lines.join("\n");
}
