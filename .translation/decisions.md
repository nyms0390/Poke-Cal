# Translation decisions

## 2026-10-12

- Decision: Proper nouns (Pokémon, move, ability, item names and other catalog-sourced game names) keep their existing localized catalog form; UI copy around them is polished.
- Context: Owner request for the zh-TW polish pass.
- Locale: zh-TW
- Status: approved

- Decision: "set" = 配置 everywhere; the Builder page name 配招構築 is unchanged.
- Context: Previously split between 配招 and 配置.
- Locale: zh-TW
- Status: approved

- Decision: Speed presets — Max (+Spe, 32 SP) = 極速; Fast (neutral, 32 SP) = 滿速; Neutral (0 SP) = 無投資; Slow (-Spe, 0 SP) = 0速 (changed from 最慢 by owner, 2026-10-12).
- Context: Owner decision during setup.
- Locale: zh-TW
- Status: approved

- Decision: Rotom forms use their official full names (加熱洛托姆, 清洗洛托姆, 結冰洛托姆, 旋轉洛托姆, 切割洛托姆) via zh-tw-name-overrides.js, without a form suffix.
- Context: Owner request; PokeAPI only lists 洛托姆 for every form.
- Locale: zh-TW
- Status: approved
