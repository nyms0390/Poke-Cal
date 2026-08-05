import { normalizeId } from "../identifiers.js";

export const LIMITLESS_TEAM_ARCHIVE_VERSION = 1;
export const LIMITLESS_TEAM_SOURCE_URL = "https://play.limitlesstcg.com/tournaments";

export async function loadLimitlessTeamArchive(fetcher = fetch) {
  const response = await fetcher("./public/limitless-teams.json");
  if (!response.ok) throw new Error(`Team archive request failed: ${response.status}`);
  return response.json();
}

export function buildLimitlessTeamArchive(
  tournaments = [],
  detailsByTournament = new Map(),
  standingsByTournament = new Map(),
  pairingsByTournament = new Map(),
  { limit = 10 } = {},
) {
  const orderedTournaments = [...tournaments]
    .filter(Boolean)
    .sort((a, b) => dateValue(b.date) - dateValue(a.date) || String(b.id).localeCompare(String(a.id)));
  const qualifying = [];

  for (const tournament of orderedTournaments) {
    const archiveTournament = buildArchiveTournament(
      tournament,
      detailsByTournament.get(tournament.id),
      standingsByTournament.get(tournament.id),
      pairingsByTournament.get(tournament.id),
    );
    if (!archiveTournament) continue;
    qualifying.push(archiveTournament);
    if (qualifying.length >= limit) break;
  }

  return {
    version: LIMITLESS_TEAM_ARCHIVE_VERSION,
    source: "Limitless",
    sourceUrl: LIMITLESS_TEAM_SOURCE_URL,
    game: "VGC",
    format: "M-B",
    tournaments: qualifying,
  };
}

function buildArchiveTournament(tournament, details, standings = [], pairings = []) {
  const bracketPhase = finalBracketPhase(details?.phases);
  if (!bracketPhase) return null;

  const bracketPlayerIds = new Set(
    pairings
      .filter((pairing) => pairing?.phase === bracketPhase.phase)
      .flatMap((pairing) => [pairing.player1, pairing.player2])
      .filter(Boolean),
  );
  if (bracketPlayerIds.size === 0) return null;

  const standingsByPlayer = new Map(
    standings
      .filter((standing) => standing?.player)
      .map((standing) => [standing.player, standing]),
  );
  const bracketStandings = [...bracketPlayerIds]
    .map((playerId) => standingsByPlayer.get(playerId))
    .filter(Boolean);
  if (bracketStandings.length !== bracketPlayerIds.size) return null;
  if (bracketStandings.some(({ placing }) => !Number.isFinite(placing))) return null;

  const champion = bracketStandings.find(({ placing }) => placing === 1);
  if (!champion || !hasTeamList(champion)) return null;

  return {
    id: tournament.id,
    name: tournament.name ?? tournament.id,
    date: tournament.date ?? null,
    players: tournament.players ?? null,
    organizer: details?.organizer ?? null,
    platform: details?.platform ?? null,
    isOnline: details?.isOnline ?? null,
    phases: details?.phases ?? [],
    url: tournamentUrl(tournament.id),
    topCut: bracketStandings
      .map((standing) => archiveStanding(standing, tournament.id))
      .sort(comparePlacing),
    ...pickExtraTournamentFields(tournament),
  };
}

function archiveStanding(standing, tournamentId) {
  const playerId = String(standing.player);
  return {
    playerId,
    playerName: standing.name ?? playerId,
    country: standing.country ?? null,
    placing: Number.isFinite(standing.placing) ? standing.placing : null,
    record: standing.record ? { ...standing.record } : null,
    drop: standing.drop ?? null,
    deck: standing.deck ? { ...standing.deck } : null,
    url: `${tournamentRootUrl(tournamentId)}/player/${encodeURIComponent(playerId)}/decklist`,
    pokemon: (Array.isArray(standing.decklist) ? standing.decklist : [])
      .filter((set) => set && typeof set === "object")
      .map(archivePokemonSet),
  };
}

function archivePokemonSet(set) {
  const name = set.name ?? set.id ?? "Unknown Pokémon";
  return {
    id: set.id ?? normalizeId(name),
    name,
    item: set.item ?? null,
    ability: set.ability ?? null,
    moves: [...(set.attacks ?? set.moves ?? [])],
    nature: set.nature ?? null,
    tera: set.tera ?? null,
  };
}

function finalBracketPhase(phases = []) {
  return [...phases]
    .filter((phase) => /bracket/i.test(String(phase?.type ?? "")))
    .sort((a, b) => Number(b.phase) - Number(a.phase))
    .at(0) ?? null;
}

function hasTeamList(standing) {
  return Array.isArray(standing?.decklist) && standing.decklist.length > 0;
}

function comparePlacing(a, b) {
  return (a.placing ?? Number.POSITIVE_INFINITY) - (b.placing ?? Number.POSITIVE_INFINITY)
    || a.playerName.localeCompare(b.playerName);
}

function dateValue(value) {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function tournamentUrl(id) {
  return `${tournamentRootUrl(id)}/standings`;
}

function tournamentRootUrl(id) {
  return `${LIMITLESS_TEAM_SOURCE_URL.replace(/\/tournaments$/, "")}/tournament/${encodeURIComponent(id)}`;
}

function pickExtraTournamentFields(tournament) {
  return tournament.organizerId === undefined ? {} : { organizerId: tournament.organizerId };
}
