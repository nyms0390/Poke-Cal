// Static checks for the parts of DESIGN.md that can be read from source: type roles, the weight
// scale, the system font stack, color tokens, and text wrapping/truncation. Pure functions over
// file contents; scripts/lint-design.mjs reads the files and applies the baseline.
//
// Rendered checks (contrast in context, touch targets, layout at 320–1440px in en and zh-TW, role
// choice per element) stay manual: see docs/ui-quality-workflow.md.

export const RULES = {
  "font-size-literal": "Text sizes come from a --type-* role token (DESIGN.md \"Type roles\"), not a literal size.",
  "font-size-raw-step": "Use the --type-* role for this text, not a raw --text-* step.",
  "font-weight": "Font weights stay on the 400 / 500 / 600 / 700 scale used by the type roles.",
  "font-family": "Only :root declares the system font stack; everything else inherits it.",
  "font-shorthand": "The font shorthand may only reset to inherit; set size and weight from roles.",
  "font-face": "Do not add downloaded or proprietary fonts (@font-face, @import, font hosts).",
  "color-literal": "Colors come from the :root tokens (or rgb() alpha tints of them); literals belong only to the Pokémon type, move category, and Speed preset palettes.",
  "wrap-mid-word": "Do not break words anywhere: use overflow-wrap: break-word with min-width: 0 so names next to badges and icons wrap whole.",
  "truncation": "Wrap primary content; reserve ellipsis truncation for compact navigation aids (DESIGN.md \"Components\").",
  "inline-style": "Styles live in src/styles.css, not in style attributes, <style> blocks, or JS font/color assignments.",
};

// Display-size figures DESIGN.md allows a literal size for: Lookup's selected Pokémon name and
// its base-stat and BST values. `body` sets the 16px base the rem roles scale from.
export const LITERAL_SIZE_SELECTORS = new Set([
  "body",
  ".pokemon-card h2",
  ".lookup-page .pokemon-card h2",
  ".base-stat strong",
  ".base-stat-total strong",
  ".lookup-page .base-stat strong",
  ".lookup-page .base-stat-total strong",
]);

function isLiteralSizeSelector(selector) {
  return selector.split(",").every((part) => LITERAL_SIZE_SELECTORS.has(part.trim()));
}

const ALLOWED_WEIGHTS = new Set(["400", "500", "600", "700", "normal", "bold", "inherit"]);
const PALETTE_SELECTOR = /(?:^|[\s,>+~])(?::root\b|\.type-[a-z-]+|\.move-category-[a-z]+|\.speed-preset-[a-z]+)/;
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\([^)]*\)/g;
const NAMED_COLOR = /\b(?:black|red|green|blue|gr[ae]y|orange|yellow|purple|pink|silver|navy|teal|maroon|olive|lime|aqua|fuchsia)\b/;
const COLOR_PROPERTY = /^(?:color|background(?:-color)?|border(?:-[a-z]+)*|outline(?:-color)?|box-shadow|text-shadow|fill|stroke|caret-color|accent-color|text-decoration(?:-color)?|column-rule(?:-color)?|scrollbar-color|--.+)$/;

// Parses CSS into flat declarations: { selector, atRules, property, value, line }.
export function parseCss(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));
  const declarations = [];
  const atRules = [];
  const stack = [];
  let buffer = "";
  let bufferLine = 1;
  let line = 1;
  let quote = null;

  const flushDeclaration = () => {
    const source = buffer.trim();
    buffer = "";
    const top = stack.at(-1);
    if (!source || !top || top.kind !== "rule") return;
    const colon = source.indexOf(":");
    if (colon < 0) return;
    declarations.push({
      selector: top.selector,
      atRules: stack.filter((entry) => entry.kind === "at").map((entry) => entry.prelude),
      property: source.slice(0, colon).trim().toLowerCase(),
      value: source.slice(colon + 1).trim().replace(/\s+/g, " "),
      line: bufferLine,
    });
  };

  for (const char of text) {
    if (!buffer.trim() && char.trim()) bufferLine = line;
    if (char === "\n") line += 1;
    if (quote) {
      buffer += char;
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      buffer += char;
    } else if (char === "{") {
      const prelude = buffer.trim().replace(/\s+/g, " ");
      buffer = "";
      if (prelude.startsWith("@")) {
        atRules.push({ prelude, line: bufferLine });
        // Keyframe steps hold declarations under the keyframes name.
        stack.push({ kind: "at", prelude });
      } else {
        const parentAt = stack.at(-1);
        const selector = parentAt?.kind === "at" && /^@(?:-webkit-)?keyframes\b/.test(parentAt.prelude)
          ? `${parentAt.prelude} ${prelude}`
          : prelude;
        stack.push({ kind: "rule", selector });
      }
    } else if (char === "}") {
      flushDeclaration();
      stack.pop();
    } else if (char === ";") {
      if (stack.at(-1)?.kind === "rule") flushDeclaration();
      else {
        const statement = buffer.trim();
        buffer = "";
        if (statement.startsWith("@")) atRules.push({ prelude: statement, line: bufferLine });
      }
    } else {
      buffer += char;
    }
  }
  return { declarations, atRules };
}

function channels(literal) {
  const hex = literal.match(/^#([0-9a-f]{3,8})$/i)?.[1];
  if (hex) {
    const full = hex.length <= 4 ? [...hex.slice(0, 3)].map((digit) => digit + digit).join("") : hex.slice(0, 6);
    return [0, 2, 4].map((offset) => Number.parseInt(full.slice(offset, offset + 2), 16)).join(" ");
  }
  const rgb = literal.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i);
  return rgb ? rgb.slice(1, 4).join(" ") : null;
}

function isRoot(selector) {
  return selector.split(",").some((part) => part.trim() === ":root");
}

export function lintCss(css, { file = "src/styles.css" } = {}) {
  const { declarations, atRules } = parseCss(css);
  const findings = [];
  const report = (rule, declaration, detail = `${declaration.property}: ${declaration.value}`) => {
    const context = [...declaration.atRules, declaration.selector].join(" ");
    findings.push({ rule, file, line: declaration.line, key: `${rule} | ${context} | ${detail}` });
  };

  for (const atRule of atRules) {
    if (/^@(?:font-face|import)\b/i.test(atRule.prelude)) {
      findings.push({ rule: "font-face", file, line: atRule.line, key: `font-face | ${atRule.prelude}` });
    }
  }

  // Token colors: every hex/rgb literal :root defines, so rgb() alpha tints of tokens pass. A hex
  // literal is never a tint, so it always names the token (or a new one) instead.
  const tokenChannels = new Set(
    declarations
      .filter((declaration) => isRoot(declaration.selector))
      .flatMap((declaration) => declaration.value.match(COLOR_LITERAL) ?? [])
      .map(channels)
      .filter(Boolean),
  );

  for (const declaration of declarations) {
    const { selector, property, value } = declaration;
    const root = isRoot(selector);

    if (property === "font-size" && !root && value !== "inherit" && !/^var\(--type-[a-z-]+\)$/.test(value)) {
      if (/^var\(--text-[a-z]+\)$/.test(value)) report("font-size-raw-step", declaration);
      else if (!isLiteralSizeSelector(selector)) report("font-size-literal", declaration);
    }
    if (property === "font-weight" && !ALLOWED_WEIGHTS.has(value)) report("font-weight", declaration);
    if (property === "font-family" && !root && value !== "inherit") report("font-family", declaration);
    if (property === "font" && value !== "inherit") report("font-shorthand", declaration);
    if (/url\([^)]*(?:fonts\.googleapis|fonts\.gstatic|typekit|\.woff2?|\.ttf|\.otf)/i.test(value)) {
      report("font-face", declaration);
    }
    if ((property === "overflow-wrap" || property === "word-wrap") && value === "anywhere") {
      report("wrap-mid-word", declaration);
    }
    if (property === "word-break" && /^break-(?:all|word)$/.test(value)) report("wrap-mid-word", declaration);
    if (property === "text-overflow" && value === "ellipsis") report("truncation", declaration);

    if (!root && !PALETTE_SELECTOR.test(selector) && COLOR_PROPERTY.test(property)) {
      for (const literal of value.match(COLOR_LITERAL) ?? []) {
        const tint = !literal.startsWith("#") && tokenChannels.has(channels(literal));
        if (!tint) report("color-literal", declaration, `${property}: ${literal}`);
      }
      const named = value.replace(/var\([^)]*\)/g, "").match(NAMED_COLOR);
      if (named) report("color-literal", declaration, `${property}: ${named[0]}`);
    }
  }
  return findings;
}

export function lintHtml(html, { file }) {
  const findings = [];
  const lineOf = (index) => html.slice(0, index).split("\n").length;
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    const href = tag.match(/\bhref\s*=\s*["']([^"']*)["']/i)?.[1] ?? "";
    if (/fonts\.googleapis|fonts\.gstatic|typekit|\.woff2?\b|\.ttf\b|\.otf\b/i.test(href) || /\brel\s*=\s*["']?preload[^>]*\bas\s*=\s*["']?font/i.test(tag)) {
      findings.push({ rule: "font-face", file, line: lineOf(match.index), key: `font-face | ${href}` });
    } else if (/\brel\s*=\s*["']?stylesheet/i.test(tag) && !/(?:^|\/)src\/styles\.css$/.test(href)) {
      findings.push({ rule: "inline-style", file, line: lineOf(match.index), key: `inline-style | stylesheet ${href}` });
    }
  }
  for (const match of html.matchAll(/<style\b|\sstyle\s*=\s*["'][^"']*["']/gi)) {
    findings.push({ rule: "inline-style", file, line: lineOf(match.index), key: `inline-style | ${match[0].trim()}` });
  }
  return findings;
}

// Pages may size and position elements from data (meter widths, sprite sheets), but text styles
// and colors other than data-driven fills come from the stylesheet.
export function lintScript(source, { file }) {
  const findings = [];
  const pattern = /\.style\.(font[A-Za-z]*|color|lineHeight|letterSpacing|cssText)\s*=|\.style\.setProperty\(\s*["'`](font[a-z-]*|color|line-height|letter-spacing)["'`]/g;
  for (const match of source.matchAll(pattern)) {
    const line = source.slice(0, match.index).split("\n").length;
    findings.push({ rule: "inline-style", file, line, key: `inline-style | ${file} .style.${match[1] ?? match[2]}` });
  }
  return findings;
}

// Splits findings into ones the baseline does not cover (new) and baseline entries no finding
// matches any more (stale). Keys are compared as a multiset so repeated rules count separately.
export function compareWithBaseline(findings, baseline = []) {
  const remaining = new Map();
  for (const key of baseline) remaining.set(key, (remaining.get(key) ?? 0) + 1);
  const fresh = [];
  for (const finding of findings) {
    const count = remaining.get(finding.key) ?? 0;
    if (count > 0) remaining.set(finding.key, count - 1);
    else fresh.push(finding);
  }
  const stale = [...remaining].flatMap(([key, count]) => Array(count).fill(key));
  return { fresh, stale };
}
