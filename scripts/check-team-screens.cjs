// Browser check for the team-screen reader (src/data/team-screens.js): reads the fixture
// screenshots in Chromium with the page's text renderer and compares every field with the
// truth.json beside them in test/fixtures/team-screens/*/. It fails when a field is wrong and
// not listed to check. Each team is read twice: with the page's renderer, and with one whose X and
// Y are swapped, as the iPad's PingFang behaved against the game's letters. Needs Playwright (not a project dependency) and the
// dev server: `npm start`, then `node scripts/check-team-screens.cjs`.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const fixtureRoot = path.join(root, "test/fixtures/team-screens");
const base = process.env.POKECAL_URL ?? "http://127.0.0.1:4173";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`${base}/my-teams.html`);
  let right = 0;
  let total = 0;
  let silent = 0;
  for (const swapXY of [false, true]) {
  for (const team of fs.readdirSync(fixtureRoot)) {
  const label = swapXY ? `${team} (X/Y swapped)` : team;
  const fixtures = path.join(fixtureRoot, team);
  const files = ["stats", "abilities"].map((f) => `data:image/png;base64,${fs.readFileSync(path.join(fixtures, `${f}.png`)).toString("base64")}`);
  const truth = JSON.parse(fs.readFileSync(path.join(fixtures, "truth.json"), "utf8")).team;
  const members = await page.evaluate(async ({ sources, swapXY }) => {
    const { readTeamScreens } = await import("/src/data/team-screens.js");
    const { createTextRenderer } = await import("/src/ui/team-screen-text.js");
    const load = async (name) => (await fetch(`/public/web/${name}.json`)).json();
    const catalogs = { pokemon: await load("pokemon"), moves: await load("moves"), items: await load("items"), abilities: await load("abilities") };
    const images = [];
    for (const src of sources) {
      const image = new Image();
      image.src = src;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      images.push(context.getImageData(0, 0, canvas.width, canvas.height));
    }
    const render = createTextRenderer();
    const swap = { X: "Y", Y: "X", "Ｘ": "Ｙ", "Ｙ": "Ｘ" };
    const renderText = swapXY ? (text) => render(text && [...text].map((c) => swap[c] ?? c).join("")) : render;
    return readTeamScreens(images, catalogs, renderText).members.map((m) => ({ species: m.species.name, ability: m.ability, item: m.item, moves: m.moves, warnings: m.warnings }));
  }, { sources: files, swapXY });
  members.forEach((member, slot) => {
    const want = truth[slot];
    const fields = [["species", member.species, want.species], ["ability", member.ability, want.ability], ["item", member.item, want.item], ...want.moves.map((move, i) => [`move ${i + 1}`, member.moves[i], move])];
    for (const [field, got, expected] of fields) {
      total++;
      if (got === expected) right++;
      else {
        const flagged = member.warnings.includes(field.replace(" ", ""));
        if (!flagged) silent++;
        console.log(`${label}: ${want.species} ${field}: read ${got}, expected ${expected}${flagged ? " (listed to check)" : " (NOT listed to check)"}`);
      }
    }
  });
  }
  }
  console.log(`${right}/${total} fields right; ${silent} wrong without being listed to check`);
  await browser.close();
  process.exit(silent === 0 ? 0 : 1);
})();
