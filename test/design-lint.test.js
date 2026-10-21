import test from "node:test";
import assert from "node:assert/strict";

import {
  compareWithBaseline,
  lintCss,
  lintHtml,
  lintScript,
  parseCss,
} from "../scripts/lib/design-lint.mjs";
import { formatReport, lintDesign, readBaseline } from "../scripts/lint-design.mjs";

const ROOT = `:root {
  font-family: system-ui, sans-serif;
  --accent: #166a70;
  --danger: #c23b3b;
  --text-sm: 0.85rem;
  --type-label: var(--text-sm);
  --shadow-micro: 0 1px 4px rgb(16 24 40 / 4%);
}
`;

const rules = (css) => lintCss(ROOT + css).map((finding) => finding.rule);

test("the app passes the design lint against its baseline", async () => {
  const findings = await lintDesign();
  const { fresh, stale } = compareWithBaseline(findings, await readBaseline());
  assert.deepEqual(fresh, [], formatReport({ findings, fresh, stale }));
  assert.deepEqual(stale, [], formatReport({ findings, fresh, stale }));
});

test("parseCss keeps selectors, media context, and lines", () => {
  const { declarations } = parseCss(`/* a { color: red } */
.a,
.b { color: var(--ink); }
@media (max-width: 720px) {
  .c { content: "{;}"; font-size: 1rem }
}`);
  assert.deepEqual(declarations.map(({ selector, atRules, property, line }) => ({ selector, atRules, property, line })), [
    { selector: ".a, .b", atRules: [], property: "color", line: 3 },
    { selector: ".c", atRules: ["@media (max-width: 720px)"], property: "content", line: 5 },
    { selector: ".c", atRules: ["@media (max-width: 720px)"], property: "font-size", line: 5 },
  ]);
});

test("font sizes must use type roles", () => {
  assert.deepEqual(rules(".a { font-size: var(--type-label); } .b { font-size: inherit; }"), []);
  assert.deepEqual(rules(".a { font-size: var(--text-sm); }"), ["font-size-raw-step"]);
  assert.deepEqual(rules(".a { font-size: 0.7rem; } .b { font-size: 12px; } .c { font-size: 0.9em; }"),
    ["font-size-literal", "font-size-literal", "font-size-literal"]);
  // DESIGN.md's display figures and the body base size may stay literal.
  assert.deepEqual(rules("body { font-size: 16px; } .lookup-page .pokemon-card h2 { font-size: 2.4rem; }"), []);
  assert.deepEqual(rules(".lookup-page .base-stat strong, .lookup-page .base-stat-total strong { font-size: 1.45rem; }"), []);
  assert.deepEqual(rules(".pokemon-card h2, .other { font-size: 2rem; }"), ["font-size-literal"]);
});

test("font weights, families, and downloaded fonts", () => {
  assert.deepEqual(rules(".a { font-weight: 600; } .b { font-weight: 700; } .c { font: inherit; font-family: inherit; }"), []);
  assert.deepEqual(rules(".a { font-weight: 800; } .b { font-weight: 300; }"), ["font-weight", "font-weight"]);
  assert.deepEqual(rules(".a { font-family: Inter, sans-serif; } .b { font: 700 1rem Inter; }"), ["font-family", "font-shorthand"]);
  assert.deepEqual(rules('@import url("https://fonts.googleapis.com/css2?family=Inter"); @font-face { font-family: X; src: url(x.woff2); }'),
    ["font-face", "font-face"]);
});

test("colors come from tokens or the domain palettes", () => {
  assert.deepEqual(rules(".a { color: var(--accent); background: rgb(194 59 59 / 10%); box-shadow: 0 2px 8px rgb(16 24 40 / 8%); }"), []);
  assert.deepEqual(rules(".a { color: white; background: transparent; border-color: currentColor; }"), []);
  assert.deepEqual(rules(".type-fire { background: #ee8130; } .move-category-status { background: #6f7180; } .speed-preset-max { --speed-preset-color: #dc445c; }"), []);
  assert.deepEqual(rules(".a { color: #a52f2f; } .b { background: rgb(1 2 3 / 5%); } .c { border: 1px solid gray; }"),
    ["color-literal", "color-literal", "color-literal"]);
  // A full-strength hex equal to a token still names the token.
  assert.deepEqual(rules(".a { color: #166a70; }"), ["color-literal"]);
});

test("names wrap whole and primary text is not truncated", () => {
  assert.deepEqual(rules(".a { overflow-wrap: break-word; min-width: 0; }"), []);
  assert.deepEqual(rules(".a { overflow-wrap: anywhere; } .b { word-break: break-all; } .c { text-overflow: ellipsis; }"),
    ["wrap-mid-word", "wrap-mid-word", "truncation"]);
});

test("HTML pages load only the shared stylesheet and carry no inline styles", () => {
  const page = `<link rel="stylesheet" href="./src/styles.css" />
<link rel="icon" href="./public/icons/favicon.svg" />`;
  assert.deepEqual(lintHtml(page, { file: "index.html" }), []);
  const bad = `<link rel="preconnect" href="https://fonts.gstatic.com" />
<link rel="stylesheet" href="./other.css" />
<style>p { color: red }</style>
<p style="font-size: 12px">x</p>`;
  assert.deepEqual(lintHtml(bad, { file: "bad.html" }).map(({ rule, line }) => [rule, line]),
    [["font-face", 1], ["inline-style", 2], ["inline-style", 3], ["inline-style", 4]]);
});

test("scripts set no text styles or colors directly", () => {
  assert.deepEqual(lintScript('fill.style.width = "40%"; icon.style.backgroundImage = "url(x)";', { file: "a.js" }), []);
  assert.deepEqual(lintScript('el.style.fontSize = "12px";\nel.style.setProperty("color", "red");', { file: "a.js" })
    .map(({ rule, line }) => [rule, line]), [["inline-style", 1], ["inline-style", 2]]);
});

test("compareWithBaseline reports new findings and stale baseline entries", () => {
  const findings = [{ key: "a" }, { key: "a" }, { key: "b" }];
  assert.deepEqual(compareWithBaseline(findings, ["a", "c"]), { fresh: [{ key: "a" }, { key: "b" }], stale: ["c"] });
});
