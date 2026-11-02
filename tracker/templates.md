# Message templates seen in 1030_2005.mov (zh-TW)

Collected from `out/turn-log.sentences.txt` (71 deduplicated sentences over the whole match, 68 matched). The regexes are in `templates.mjs`. `X` is a Pokémon name, with the prefix `對手的` ("the opponent's") on the opponent's side; `P` is a player name.

| Kind | Phrasing | Seen | Example from this video | Event |
|---|---|---|---|---|
| move | `X使出了M！` / `對手的X使出了M！` | 15 | 具甲武者使出了迎頭一擊！ | `move` |
| faint | `X倒下了！` | 6 | 對手的一家鼠倒下了！ | `faint` (+ `hp` → 0) |
| own send-out | `上吧！X！` | 6 | 上吧！轟擂金剛猩！ (OCR splits it in two at the first ！; the parser glues it back) | `switch` |
| opp send-out | `P派出了X！` | 4 | DeeObaweea派出了愛管侍！; leads: DeeObaweea派出了一家鼠和水箭龜！ | `switch` |
| own withdraw | `X，回來！` | 2 | 蚊香蛙皇，回來！ | sets `out` for the next send-out |
| own U-turn return | `X要回到P的身邊了！` | 1 | 具甲武者要回到nyms的身邊了！ | sets `out` |
| opp withdraw | `P換下了X！` | 1 | DeeObaweea換下了水箭龜！ | sets `out` |
| effectiveness | `對X效果絕佳！` / `對X效果不好。` / `對A和B效果不好。` | 5 | 對轟擂金剛猩和幽尾玄魚效果不好。 | `hp` with `effect`, adds targets |
| crit | `擊中了要害！` (single target) / `擊中了X的要害！` (spread) | 3 | 擊中了幽尾玄魚的要害！ | `crit: true` on the hit |
| Mega trigger | `X的S和P的全一環產生了反應！` | 2 | 對手的水箭龜的水箭龜進化石和DeeObaweea的全一環產生了反應！ | `reveal` item |
| Mega | `X超級進化成了超級X！` | 2 | 具甲武者超級進化成了超級具甲武者！ | `mega` |
| Protect up | `X擺出了防守的架勢！` | 2 | 對手的大狃拉擺出了防守的架勢！ | none (the `使出了守住` line is the move) |
| Protect blocks | `X在攻擊中守護住了自己！` | 3 | 具甲武者在攻擊中守護住了自己！ | adds target to the move |
| stat | `X的S、S降低了！` / `…大幅提高了！` | 3 | 對手的水箭龜的攻擊、特攻、速度大幅提高了！ | `stat` (two lines merged) |
| heal | `X的體力回復了！` | 5 | 轟擂金剛猩的體力回復了！ (Grassy Terrain end of turn) | `hp` cause `terrain` |
| recoil | `X的生命被削減了一些！` | 1 | 幽尾玄魚的生命被削減了一些！ (Life Orb) | `hp` cause `recoil` |
| Follow Me | `X變得萬眾矚目了！` | 1 | 對手的一家鼠變得萬眾矚目了！ | none |
| Grassy Terrain | `腳下青草如茵！` | 2 | | field + Surge `reveal` after a switch-in |
| Psychic Terrain | `腳下傳來了奇妙的感覺！` | 1 | | field + Surge `reveal` |
| rain | `開始下雨了！` | 1 | | (field banner gives the turns) |
| win | `成功戰勝了P！` | 1 | 成功戰勝了DeeObaweea！ | `end` |
| waiting | `正在等待。` | 1 | (between team preview and battle) | none |

Not messages: two other channels.

- **Ability / item banner** (box 59,614,420,120, own side only): `X的 / ability` (蚊香蛙皇的 / 降雨, 轟擂金剛猩的 / 青草製造者) and `X使用了 / item！` (蚊香蛙皇使用了 / 文柚果！, 幽尾玄魚使用了 / 生命寶珠). These give `reveal` events and the Sitrus Berry `hp` event. No opponent banner appeared in this match.
- **Field banner** (390,65,640,60): `下雨狀態 N/5` on every choose screen.

Unmatched (3): `勻碗眠廣角鏡Marg！` (team-preview noise at 30 s) and the leads `蚊香蛙皇！` / `具甲武者！` at 100 s, whose `上吧！` was read as a separate faded line.

Written into `templates.mjs` but not seen in this video, so unverified: immune (`對X好像沒有效果`), other terrains and weathers, weather end, `無法再提高了`, `顯著` (+3), loss (`輸給了P！`).
