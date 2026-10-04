const NON_ASCII = /[^\x00-\x7f]/;
const COMBINING_MARKS = /\p{M}/gu;

/**
 * Showdown-style id: lowercase ASCII letters and digits only. Accents are folded first
 * (NFKD + combining marks stripped, so "Flabébé" → "flabebe", fullwidth letters → ASCII)
 * and the gender symbols map to Showdown's suffixes ("Nidoran♀" → "nidoranf", "♂" → "m").
 */
export function normalizeId(value) {
  let text = String(value ?? "");
  if (NON_ASCII.test(text)) {
    text = text
      .replace(/♀/g, "f")
      .replace(/♂/g, "m")
      .normalize("NFKD")
      .replace(COMBINING_MARKS, "");
  }
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}
