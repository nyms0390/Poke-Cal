// zh-TW battle message templates (Pokémon Champions). Order matters: first match wins.
// `resolves`: the message only appears during turn resolution (used to split turns).
const W = '(?<who>(?:對手的)?[^，,！。]{1,12}?)';
export const TEMPLATES = [
  { kind: 'mega-trigger', re: new RegExp(`^${W}的(?<item>[^的]{2,12}?)和(?<player>.+?)的全一環產生了反應[！!]`), resolves: true },
  { kind: 'mega', re: new RegExp(`^${W}超級進化成了超級`), resolves: true },
  { kind: 'move', re: new RegExp(`^${W}使出了(?<move>[^！!]+)[！!]`), resolves: true },
  { kind: 'faint', re: new RegExp(`^${W}倒下了[！!]`), resolves: true },
  { kind: 'return-you', re: /^(?<who>[^，,！]{1,12}?)要回到(?<player>.+?)的身邊了[！!]/, resolves: true },
  { kind: 'withdraw-you', re: /^(?<who>[^，,！]{1,12}?)[，,]回來[！!]/, resolves: true },
  { kind: 'withdraw-opp', re: /^(?<player>.+?)換下了(?<who>[^！!]{1,12})[！!]/, resolves: true },
  { kind: 'sendout-you', re: /^上吧[！!](?<who>[^！!]{1,12})[！!]/, resolves: true },
  { kind: 'sendout-you', re: /^就決定是你了[！!](?<who>[^！!]{1,12})[！!]/, resolves: true },
  { kind: 'sendout-opp', re: /^(?<player>.+?)派出了(?<who>[^！!]{1,12})[！!]/, resolves: true },
  // "對於對手的仆斬將軍，好像沒有效果…" (ends in …, not ！)
  { kind: 'effect', effect: 'immune', re: new RegExp(`^對於${W}[，,]?(?:好像)?沒有效果`), resolves: true },
  { kind: 'effect', effect: 'super', re: new RegExp(`^對${W}效果絕佳`), resolves: true },
  { kind: 'effect', effect: 'resisted', re: new RegExp(`^對${W}效果不好`), resolves: true },
  { kind: 'effect', effect: 'immune', re: new RegExp(`^對${W}(?:好像)?沒有效果`), resolves: true },
  { kind: 'crit', re: new RegExp(`^擊中了${W}的要害[！!]`), resolves: true },
  { kind: 'crit', re: /擊中了要害[！!]/, resolves: true },
  // "X的生命被削減了一些！" is Life Orb's self-damage in zh-TW; recoil moves say "受到了反作用力造成的傷害".
  { kind: 'life-orb', re: new RegExp(`^${W}的生命被削減了`), resolves: true },
  { kind: 'recoil', re: new RegExp(`^${W}受到了反作用力造成的傷害`), resolves: true },
  { kind: 'protected', re: new RegExp(`^${W}在攻擊中守護住了自己`), resolves: true },
  { kind: 'protect-up', re: new RegExp(`^${W}擺出了防守的架勢`), resolves: true },
  { kind: 'follow-me', re: new RegExp(`^${W}變得萬眾矚目了`), resolves: true },
  { kind: 'stat', re: new RegExp(`^${W}的(?<stats>(?:攻擊|防禦|特攻|特防|速度|命中率|閃避率)(?:[、,，和](?:攻擊|防禦|特攻|特防|速度|命中率|閃避率))*)(?<change>(?:大幅|顯著)?(?:提高|降低)了|無法再(?:提高|降低)了)`), resolves: true },
  { kind: 'terrain', terrain: 'grassy', re: /^腳下青草如茵[！!]/, resolves: true },
  { kind: 'terrain', terrain: 'psychic', re: /^腳下傳來了奇妙的感覺[！!]/, resolves: true },
  { kind: 'terrain', terrain: 'electric', re: /^腳下電光飛閃[！!]/, resolves: true },
  { kind: 'terrain', terrain: 'misty', re: /^腳下霧氣繚繞[！!]/, resolves: true },
  { kind: 'terrain-end', re: /^腳下的(?:草|霧|電|奇妙).*(?:消失|恢復)/, resolves: true },
  { kind: 'weather', weather: 'rain', re: /^開始下雨了[！!]/, resolves: false },
  { kind: 'weather', weather: 'sun', re: /^日照變強了[！!]/, resolves: false },
  { kind: 'weather', weather: 'sand', re: /^開始刮沙暴了[！!]/, resolves: false },
  { kind: 'weather', weather: 'snow', re: /^開始下雪了[！!]/, resolves: false },
  { kind: 'weather-end', re: /^(?:雨停了|日照復原了|沙暴停止了|雪停了)/, resolves: true },
  // White Herb: "對手的大狃拉用白色香草復原了能力！"
  { kind: 'item-restore', re: new RegExp(`^${W}用(?<item>[^！!]{2,10}?)復原了能力[！!]`), resolves: true },
  { kind: 'heal', re: new RegExp(`^${W}的體力回復了`), resolves: true },
  { kind: 'win', re: /^成功戰勝了(?<player>.+?)[！!]/, resolves: true },
  { kind: 'lose', re: /^(?:輸給了|敗給了)(?<player>.+?)[！!]/, resolves: true },
  // A loss can also read "打敗了！" (seen after a forfeit, live-2).
  { kind: 'lose', re: /打敗了[！!]$/, resolves: true },
  // "有一方選擇了投降。": followed by the win or loss line, which carries the result.
  { kind: 'forfeit', re: /^有一方選擇了投降/, resolves: true },
  { kind: 'wait', re: /^正在等待/, resolves: false },
];

export const STAT_NAMES = { 攻擊: 'atk', 防禦: 'def', 特攻: 'spa', 特防: 'spd', 速度: 'spe', 命中率: 'accuracy', 閃避率: 'evasion' };
export const STAT_AMOUNTS = [
  [/顯著提高/, 3], [/大幅提高/, 2], [/提高/, 1],
  [/顯著降低/, -3], [/大幅降低/, -2], [/降低/, -1],
];
export const TERRAIN_MESSAGES = TEMPLATES.filter((t) => t.kind === 'terrain');
export const WEATHER_MESSAGES = TEMPLATES.filter((t) => t.kind === 'weather');
