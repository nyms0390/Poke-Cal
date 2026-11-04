// Draws a name on a canvas and returns its trimmed mask, for the shape matching in
// src/data/team-screens.js. The game's own font is commercial, so names are drawn with a bundled
// cut of Noto Sans TC (public/fonts/, built by scripts/build-name-font.mjs). Every device then
// draws the same shapes the reader is tested with. System fonts are only a fallback if the font
// fails to load.
import { trimMask } from "../data/team-screens.js";

const NAME_FONT = "PokeCal Names";
const NAME_FONT_URL = new URL("../../public/fonts/pokecal-names.woff2", import.meta.url);
const FONT = `40px "${NAME_FONT}", "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", "Heiti TC", sans-serif`;

// Loads the bundled name font once; resolves false (and the renderer falls back to system fonts)
// when it can't be loaded.
let nameFont = null;
export function loadNameFont() {
  nameFont ??= (async () => {
    try {
      const face = new FontFace(NAME_FONT, `url(${NAME_FONT_URL})`);
      await face.load();
      document.fonts.add(face);
      return true;
    } catch {
      return false;
    }
  })();
  return nameFont;
}

export function createTextRenderer(font = FONT) {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 80;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const cache = new Map();
  return (text) => {
    if (!text) return null;
    if (cache.has(text)) return cache.get(text);
    context.fillStyle = "#000";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#fff";
    context.font = font;
    context.textBaseline = "top";
    context.fillText(text, 4, 12);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const data = new Uint8Array(canvas.width * canvas.height);
    for (let i = 0; i < data.length; i++) data[i] = pixels[i * 4] > 128 ? 255 : 0;
    const mask = trimMask({ width: canvas.width, height: canvas.height, data });
    cache.set(text, mask);
    return mask;
  };
}

// Pixels of an image file, scaled to the reference width when larger, as { width, height, data }.
export async function imageFilePixels(file) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0);
  bitmap.close?.();
  return context.getImageData(0, 0, canvas.width, canvas.height);
}
