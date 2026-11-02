// Draws a name on a canvas and returns its trimmed mask, for the shape matching in
// src/data/team-screens.js. Traditional Chinese system fonts first; the game's own font is not
// available, so matching relies on shape, not exact pixels.
import { trimMask } from "../data/team-screens.js";

const FONT = '500 40px "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", "Heiti TC", sans-serif';

export function createTextRenderer() {
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
    context.font = FONT;
    context.textBaseline = "top";
    context.fillText(text, 4, 12);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const data = new Uint8Array(canvas.width * canvas.height);
    for (let i = 0; i < data.length; i++) data[i] = pixels[i * 4] > 128 ? 1 : 0;
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
