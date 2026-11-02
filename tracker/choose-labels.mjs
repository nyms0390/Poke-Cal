// Label old 2 fps OCR frames as choose screens (3+ move names in the move list) for
// `fasttrack --learn-choose`. Usage: node choose-labels.mjs out/ocr.jsonl > labels.txt
import { readFileSync } from 'node:fs';
import { loadLexicon, match } from './lexicon.mjs';
const lex = loadLexicon();
const CJK = /[㐀-鿿]/g; const cjk = (s) => (s.match(CJK) ?? []).length;
for (const l of readFileSync(process.argv[2], 'utf8').trim().split('\n')) {
  const f = JSON.parse(l);
  const hits = (f.regions.moves ?? []).filter((x) => cjk(x.text) >= 2 && match(lex.moves, x.text.replace(/^[^㐀-鿿]+/, ''))?.dist <= 1).length;
  console.log(f.frame, hits >= 3 ? 1 : 0);
}
