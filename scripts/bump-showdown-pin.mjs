// Moves scripts/showdown-pin.json to the latest commit of the Showdown branch (default `master`).
// Run by .github/workflows/bump-showdown.yml, which opens/updates the "Bump Showdown pin" pull
// request; merging it lets the next weekly `sync-data` pick up Showdown catalog changes.
//
//   npm run bump-showdown                          # resolve master via git ls-remote and rewrite the pin
//   npm run bump-showdown -- --commit <sha>        # pin an explicit full SHA instead
//   npm run bump-showdown -- --ref <branch>        # follow another branch
//   npm run bump-showdown -- --body-file <path>    # also write a pull-request body (only when changed)
//
// When GITHUB_OUTPUT is set it appends `changed`, `old`, `new`, and `compare_url`.
import { execFile } from "node:child_process";
import { appendFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";

import { argumentValue, isMainModule } from "./lib/sync-utils.mjs";
import { SHOWDOWN_PIN_URL, readShowdownPin, writeShowdownPin } from "./lib/showdown-pin.mjs";

const execFileAsync = promisify(execFile);
const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/;
const BRANCH_PATTERN = /^[A-Za-z0-9._/-]+$/;

// Picks the SHA for `refs/heads/<ref>` out of `git ls-remote` output.
export function parseLsRemote(output, ref = "master") {
  const wanted = `refs/heads/${ref}`;
  for (const line of output.split(/\r?\n/)) {
    const [sha, name] = line.trim().split(/\s+/);
    if (name === wanted && COMMIT_SHA_PATTERN.test(sha ?? "")) return sha;
  }
  throw new Error(`git ls-remote did not list ${wanted}`);
}

export async function resolveLatestCommit(repo, ref = "master") {
  if (!BRANCH_PATTERN.test(ref)) throw new Error(`Invalid branch name: ${ref}`);
  const { stdout } = await execFileAsync(
    "git",
    ["ls-remote", `https://github.com/${repo}.git`, `refs/heads/${ref}`],
    { timeout: 60_000 },
  );
  return parseLsRemote(stdout, ref);
}

export function compareUrl(repo, from, to) {
  return `https://github.com/${repo}/compare/${from}...${to}`;
}

export function pullRequestBody({ repo, from, to, ref = "master" }) {
  return [
    `Moves the pinned Pokémon Showdown commit in \`scripts/showdown-pin.json\` to the head of \`${repo}\` \`${ref}\`.`,
    "",
    `- Old: [\`${from.slice(0, 12)}\`](https://github.com/${repo}/commit/${from})`,
    `- New: [\`${to.slice(0, 12)}\`](https://github.com/${repo}/commit/${to})`,
    `- Upstream changes: ${compareUrl(repo, from, to)}`,
    "",
    "Merging this pulls Showdown catalog changes (base stats, moves, abilities, items, text, and the " +
      "Champions mod's legality, learnsets, and balance changes) into the next weekly data sync " +
      "(`update-data.yml`, Mondays 06:00 UTC; or run it manually). Review the compare link for " +
      "Champions-relevant changes first, especially under `data/mods/champions/`.",
    "",
    "Opened automatically by `.github/workflows/bump-showdown.yml`; this PR is updated in place on later runs.",
    "",
  ].join("\n");
}

// Rewrites the pin when the resolved commit differs. Returns `{ changed, repo, from, to, compareUrl }`.
export async function bumpShowdownPin({
  file = SHOWDOWN_PIN_URL,
  ref = "master",
  commit,
  resolveCommit = resolveLatestCommit,
} = {}) {
  const pin = await readShowdownPin(file);
  const to = commit ?? (await resolveCommit(pin.repo, ref));
  if (!COMMIT_SHA_PATTERN.test(to)) throw new Error(`Not a full commit SHA: ${to}`);
  const changed = to !== pin.commit;
  if (changed) await writeShowdownPin({ ...pin, commit: to }, file);
  return {
    changed,
    repo: pin.repo,
    from: pin.commit,
    to,
    compareUrl: compareUrl(pin.repo, pin.commit, to),
  };
}

if (isMainModule(import.meta.url)) {
  try {
    const ref = argumentValue(process.argv, "--ref") ?? "master";
    const result = await bumpShowdownPin({ ref, commit: argumentValue(process.argv, "--commit") });
    if (result.changed) {
      console.log(`Showdown pin: ${result.from} -> ${result.to}`);
      console.log(`Compare: ${result.compareUrl}`);
      const bodyFile = argumentValue(process.argv, "--body-file");
      if (bodyFile) {
        await writeFile(bodyFile, pullRequestBody({ repo: result.repo, from: result.from, to: result.to, ref }));
      }
    } else {
      console.log(`Showdown pin already at ${result.repo}@${result.to} (${ref}).`);
    }
    if (process.env.GITHUB_OUTPUT) {
      await appendFile(
        process.env.GITHUB_OUTPUT,
        `changed=${result.changed}\nold=${result.from}\nnew=${result.to}\ncompare_url=${result.compareUrl}\n`,
      );
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
