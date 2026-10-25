// Shared pieces for the user's own teams (src/data/my-teams.js): the My teams page rows and
// the sprite previews.
import { STAT_KEYS } from "../engine/constants.js";
import { localizedName, localizedTerm, t } from "../i18n.js";
import { itemLabel, moveChip, natureLabel, pokemonSpriteElements, setRow, STAT_LABELS } from "./components.js";

// A member's sprite (or "?" for a paste whose Pokémon is unknown), named for assistive tech.
export function teamMemberSprite(pokemon, { size = 40 } = {}) {
  const wrap = document.createElement("span");
  wrap.className = "my-teams-sprite";
  if (pokemon) {
    wrap.append(...pokemonSpriteElements(pokemon, { size, lazy: true }));
  } else {
    wrap.classList.add("empty");
    wrap.textContent = "?";
  }
  return wrap;
}

export function teamMemberSprites(members, { size = 30 } = {}) {
  const list = document.createElement("span");
  list.className = "my-teams-sprites";
  list.setAttribute("aria-label", members
    .map(({ parsed }) => parsed.pokemon ? localizedName(parsed.pokemon) : t("myTeams.unknownPokemon"))
    .join(", "));
  list.setAttribute("role", "img");
  list.append(...members.map(({ parsed }) => {
    const sprite = teamMemberSprite(parsed.pokemon, { size });
    sprite.setAttribute("aria-hidden", "true");
    return sprite;
  }));
  return list;
}

// "32 HP / 2 Def / 32 SpA", with localized stat names; "—" when the paste sets no spread.
export function spreadText(parsed) {
  if (!parsed?.hasSpread) return "—";
  const parts = STAT_KEYS
    .filter((stat) => Number(parsed.sp?.[stat] ?? 0) > 0)
    .map((stat) => `${parsed.sp[stat]} ${localizedTerm("stat", STAT_LABELS[stat])}`);
  return parts.join(" / ") || "0";
}

// One member as the shared set row: sprite, name and types, ability, nature, item, SP, moves.
export function memberSetRow({ text, parsed }, catalogs) {
  const media = teamMemberSprite(parsed.pokemon, { size: 48 });
  media.setAttribute("aria-hidden", "true");
  const unset = t("myTeams.notSet");
  const facts = [
    [t("label.ability"), parsed.ability ? localizedName(parsed.ability) : unset],
    [t("label.nature"), parsed.nature ? natureLabel(parsed.nature) : unset],
    [t("label.item"), parsed.item ? itemLabel(parsed.item) : unset],
    [t("myTeams.spread"), spreadText(parsed)],
  ];
  const moves = parsed.selectedMoveIds
    .map((id) => catalogs.moveLookup.get(id))
    .filter(Boolean)
    .map((move) => moveChip(move));
  return setRow({
    className: "my-teams-set-row",
    media,
    title: parsed.pokemon ? localizedName(parsed.pokemon) : text.split("\n")[0] || t("myTeams.unknownPokemon"),
    types: parsed.pokemon?.types ?? [],
    facts,
    moves,
  });
}
