// Browser check for the team-screen reader (src/data/team-screens.js): reads the fixture
// screenshots in Chromium with the page's text renderer and compares every field with
// test/fixtures/team-screens/truth.json. Needs Playwright (not a project dependency) and the
// dev server: `npm start`, then `node scripts/check-team-screens.cjs`.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const fixtures = path.join(root, "test/fixtures/team-screens");
const base = process.env.POKECAL_URL ?? "http://127.0.0.1:4173";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`${base}/my-teams.html`);
  const files = ["stats", "abilities"].map((f) => `data:image/png;base64,${fs.readFileSync(path.join(fixtures, `${f}.png`)).toString("base64")}`);
  const truth = JSON.parse(fs.readFileSync(path.join(fixtures, "truth.json"), "utf8")).team;
  const members = await page.evaluate(async (sources) => {
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
    return readTeamScreens(images, catalogs, createTextRenderer()).members.map((m) => ({ species: m.species.name, ability: m.ability, item: m.item, moves: m.moves }));
  }, files);
  let right = 0;
  let total = 0;
  members.forEach((member, slot) => {
    const want = truth[slot];
    const fields = [["species", member.species, want.species], ["ability", member.ability, want.ability], ["item", member.item, want.item], ...want.moves.map((move, i) => [`move ${i + 1}`, member.moves[i], move])];
    for (const [field, got, expected] of fields) {
      total++;
      if (got === expected) right++;
      else console.log(`${want.species} ${field}: read ${got}, expected ${expected}`);
    }
  });
  console.log(`${right}/${total} fields right`);
  await browser.close();
  process.exit(right === total ? 0 : 1);
})();
