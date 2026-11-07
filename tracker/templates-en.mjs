// English battle message templates (Pokémon Champions broadcast, spectator view from one player's side).
// Same kinds as templates.mjs; order matters: first match wins. Collected from the OCR of the 2027 Gdańsk
// Regional Top 8 broadcast (floette/window2.ts); OCR noise tolerated: ' or ’, optional spaces.
// `resolves`: the message only appears during turn resolution (used to split turns).
const W = "(?<who>(?:[Tt]he opposing )?[A-Z][A-Za-z.'’\\- ]{1,40}?)";
const S = "['’‘`]s";
export const TEMPLATES = [
  { kind: 'leads', re: /^(?<player>.+?) sent out (?<who>.+?) and (?<who2>.+?)!/, resolves: false },
  { kind: 'leads', re: /^Go! (?<who>.+?) and (?<who2>.+?)!/, resolves: false },
  // "…is reacting to Liam's Omni Ring!" (the own player's name may be Japanese and OCR to junk)
  { kind: 'mega-trigger', re: new RegExp(`^${W}${S} (?<item>[A-Za-z ]+?) is reacting to (?<player>.*?)(?:${S})? \\S* ?Ring!`), resolves: true },
  { kind: 'mega', re: new RegExp(`^${W} has Mega Evolved`), resolves: true },
  { kind: 'move', re: new RegExp(`^${W} used (?<move>[A-Za-z0-9'’\\- ]+)!`), resolves: true },
  { kind: 'faint', re: new RegExp(`^${W} fainted!`), resolves: true },
  { kind: 'withdraw-opp', re: /^(?<player>.+?) withdrew (?<who>[^!]+)!/, resolves: true },
  { kind: 'withdraw-you', re: /^(?<who>[A-Z][A-Za-z.'’\- ]{1,20}), come back!/, resolves: true },
  { kind: 'sendout-you', re: /^(?:Go!|Go for it!|You're in charge,|Just a little more! Hang in there,|Your foe's weak! Get 'em,) (?<who>[^!]+)!/, resolves: true },
  { kind: 'sendout-opp', re: /^(?<player>.+?) sent out (?<who>[^!]+)!/, resolves: true },
  { kind: 'effect', effect: 'super', re: new RegExp(`^It${S} (?:super|extremely) effective on ${W}[!.]`), resolves: true },
  { kind: 'effect', effect: 'resisted', re: new RegExp(`^It${S} not very effective on ${W}[!.…]`), resolves: true },
  { kind: 'effect', effect: 'immune', re: new RegExp(`^It doesn${S.replace('s', 't')} affect ${W}[!.…]`), resolves: true },
  { kind: 'crit', re: new RegExp(`^A critical hit on ${W}!`), resolves: true },
  { kind: 'crit', re: /^A critical hit!/, resolves: true },
  { kind: 'recoil', re: new RegExp(`^${W} (?:was hurt by its|lost some of its HP|was damaged by the recoil)`), resolves: true },
  { kind: 'item-reveal', re: new RegExp(`^${W}${S} (?<item>[A-Za-z ]+?) (?:lessened the damage|weakened the damage)`), resolves: true },
  { kind: 'fail', re: /^But it failed!/, resolves: true },
  { kind: 'protected', re: new RegExp(`^${W} protected itself!`), resolves: true },
  { kind: 'stat', re: new RegExp(`^${W}${S} (?<stats>(?:Attack|Defense|Sp\\. ?Atk|Sp\\. ?Def|Speed|accuracy|evasiveness)(?:(?:,| and|, and) (?:Attack|Defense|Sp\\. ?Atk|Sp\\. ?Def|Speed|accuracy|evasiveness))*) (?<change>(?:rose|fell|won't go any (?:higher|lower))(?: sharply| drastically| harshly| severely)?)!`), resolves: true },
  { kind: 'terrain', terrain: 'grassy', re: /^Grass grew to cover the battlefield!/, resolves: true },
  { kind: 'terrain', terrain: 'psychic', re: /^The battlefield got weird!/, resolves: true },
  { kind: 'terrain', terrain: 'electric', re: /^An electric current (?:ran|runs) across the battlefield!/, resolves: true },
  { kind: 'terrain', terrain: 'misty', re: /^Mist swirled (?:about|around) the battlefield!/, resolves: true },
  { kind: 'terrain-end', re: /^The (?:grass|mist|electricity|weirdness) disappeared from the battlefield/, resolves: true },
  { kind: 'trick-room', re: new RegExp(`^${W} twisted the dimensions!`), resolves: true },
  { kind: 'trick-room-end', re: /^The twisted dimensions returned to normal!/, resolves: true },
  { kind: 'weather', weather: 'rain', re: /^It started to rain!/, resolves: false },
  { kind: 'weather', weather: 'sun', re: /^The sunlight turned harsh!/, resolves: false },
  { kind: 'weather', weather: 'sand', re: /^A sandstorm kicked up!/, resolves: false },
  { kind: 'weather', weather: 'snow', re: /^It started to snow!/, resolves: false },
  { kind: 'weather-end', re: /^(?:The rain stopped|The harsh sunlight faded|The sandstorm subsided|The snow stopped)/, resolves: true },
  { kind: 'tailwind', re: /^A tailwind started blowing on (?<team>your|the opposing) side!/, resolves: true },
  { kind: 'tailwind-end', re: /^(?<team>Your|The opposing) side['’]s tailwind petered out!/, resolves: true },
  { kind: 'status', status: 'psn', re: new RegExp(`^${W} was (?:badly )?poisoned!`), resolves: true },
  { kind: 'flinch', re: new RegExp(`^${W} flinched`), resolves: true },
  { kind: 'item-restore', re: new RegExp(`^${W} returned its (?:lowered )?stats to normal using its (?<item>[A-Za-z ]+?)!`), resolves: true },
  { kind: 'heal', re: new RegExp(`^${W}(?:${S} HP was restored| had its HP restored| restored (?:a little )?HP)`), resolves: true },
  { kind: 'win', re: /^You defeated (?<player>.+?)!/, resolves: true },
  { kind: 'lose', re: /^You lost to (?<player>.+?)!/, resolves: true },
  // Broadcast: "Liam lost!" (winner: the other side) and "The battle has ended due to a forfeit." (winner unknown)
  { kind: 'lost', re: /^(?<player>[^!]{1,30}) lost!/, resolves: true },
  { kind: 'forfeit', re: /^The battle has ended due to a forfeit/, resolves: true },
];

export const STAT_NAMES = { Attack: 'atk', Defense: 'def', 'Sp. Atk': 'spa', 'Sp.Atk': 'spa', 'Sp. Def': 'spd', 'Sp.Def': 'spd', Speed: 'spe', accuracy: 'accuracy', evasiveness: 'evasion' };
export const STAT_AMOUNTS = [
  [/rose drastically/, 3], [/rose sharply/, 2], [/rose/, 1],
  [/fell severely/, -3], [/fell harshly/, -2], [/fell/, -1],
];
