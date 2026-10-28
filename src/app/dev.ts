// 開発用の局面づくり（app 側に置く。view/fx は createGame/applyAction を使わない決まりのため）
import type { Action, CardId, GameState, Square } from '../rules/types';
import { CARDS } from '../cards';
import { isLevel, LEVELS, type Level } from '../ai/levels';
import type { Match } from './match';
import type { CpuClient } from '../ai/client';
import { makeRng } from '../ai/random';
import { autoDeck } from './deck';
import { applyAction, createGame } from '../rules/game';
import { viewFor } from '../rules/view';
import { SAMPLES, getSound, type SoundName } from '../fx/sound';
import { KING_FX, KING_FX_LABEL } from '../fx/kingfx/kinds';

/** 初期配置（先手から見た局面） */
export function initialView(): GameState {
  return viewFor(createGame({ sente: [], gote: [] }), 'sente');
}

/**
 * 盤の見た目を確かめるための局面：成り駒・纏札・自分の伏せたマス・王手・凍結・成れない・重りの枷をひと通り入れる。
 * 本物の対局では起きない並びもある（見た目の確認専用）
 */
export function sampleView(): GameState {
  const s = createGame({ sente: [], gote: [] });
  const at = (c: number, r: number) => r * 9 + c;
  // 先手の飛車を 5三 に進めて竜にし、天馬の蹄を付ける（後手の王に王手）
  const hi = s.board[at(7, 7)]!;
  s.board[at(7, 7)] = null;
  s.board[at(4, 2)] = { ...hi, promoted: true, equip: { cardId: 'tenma' } };
  // 後手の歩を1枚「と」にする（後手の駒は逆さの紅の字）
  const fu = s.board[at(0, 2)]!;
  s.board[at(0, 3)] = { ...fu, promoted: true };
  s.board[at(0, 2)] = null;
  // 先手の銀に鋼の鎧
  const gi = s.board[at(2, 8)]!;
  s.board[at(2, 8)] = { ...gi, equip: { cardId: 'hagane' } };
  // 自分（先手）の落とし穴と、相手の隠れた罠
  s.traps.push({ uid: 900, owner: 'sente', cardId: 'otoshiana', at: { c: 4, r: 4 } });
  s.traps.push({ uid: 901, owner: 'gote', cardId: 'otoshiana', at: { c: 6, r: 5 } });
  // 凍った駒（後手の歩は残り2、先手の歩は残り1で成れない印も）・成れない銀・重りの枷・自分の凍てつく床
  const gfu = s.board[at(5, 2)]!;
  s.board[at(5, 2)] = { ...gfu, frozen: 2 };
  const sfu = s.board[at(3, 6)]!;
  s.board[at(3, 6)] = { ...sfu, frozen: 1, sealed: true };
  const sgi = s.board[at(6, 8)]!;
  s.board[at(6, 8)] = { ...sgi, sealed: true };
  const gki = s.board[at(3, 0)]!;
  s.board[at(3, 0)] = { ...gki, shackle: { left: 3 } };
  s.traps.push({ uid: 902, owner: 'sente', cardId: 'itetsuku', at: { c: 2, r: 4 } });
  return viewFor(s, 'sente');
}

/** 開発中に URL に ?dev=board があれば確認用の局面、なければ初期配置 */
export function titleView(): GameState {
  if (!import.meta.env.DEV) return initialView();
  const q = new URLSearchParams(location.search);
  return q.get('dev') === 'board' ? sampleView() : initialView();
}

// ---------- 演出の試し口（?fx=<名前>。開発中だけ） ----------
//
// ?fx=<カード>     そのカード1枚を持って始め、Space で使う（&kagami=1 で相手に鏡の結界を伏せておく）。
//                  韋駄天は、付けたあとの Space で2回動く手を指す。罠のカードは &set=1 のとき自分が伏せる
// ?fx=otoshiana    相手が 7六（歩の前）に落とし穴を伏せた状態。Space で歩がそのマスへ進む
// ?fx=kagami       相手が鏡の結界を伏せ、自分は落雷を持つ。Space で落雷を使う
// ?fx=narifuuji    相手が成り封じを伏せ、自分の歩が 5四 にいる。Space で 5三 へ成ろうとする
// ?fx=hagane-block 相手の 5三 の歩が鋼の鎧を付け、自分の歩が 5四 にいる。Space でその歩を取りにいく
// ?fx=check        自分に持ち駒の金。Space で王手になる手を指す
// ?fx=win          自分の金が相手の王の前にいる。Space で王を取る
// ?fx=lose         相手の金が自分の王の前にいる。Space で歩を進め、CPU が王を取る
// ?fx=draw         手数を上限にしておく。Space で歩を進めると手数の上限で引き分け
// ?fx=resign       初期配置のまま。Space で投了する（王が伏せられて「負」→ 結果画面）
//   &king=<案>      win・lose で流す王を取る演出の案（tataki・iai・hanabi）。左下の切り替えでも選べる
// ?fx=itetsuku    相手が 7六 に凍てつく床を伏せた状態。Space で歩がそのマスへ進んで凍る
// ?fx=aiuchi      相手が相討ちを伏せ、相手の歩が 7六 にいる。Space で自分の歩が取り、取った歩も壊れる
// ?fx=migawari    相手が身代わりを伏せ、自分の金が相手の王の前にいる。Space で王を取りにいく
// ?fx=marks       凍結・成れない・重りの枷の印を見るだけの局面
// ?fx=equips      6種類の纏札の印（旗・蹄の跡・鎧・鎖と鉄球・槍・炎）を見るだけの局面（後手の駒にも付ける）
// ?fx=kakuotoshi  相手の飛車を竜にしておく（格落としの的）
// ?fx=omori-break 相手の 3一 の銀に残り1の重りの枷。Space で歩を進め、CPU が指し終えると枷が外れる
// ?fx=move        初期配置のまま。Space で歩を1つ進める（ふだんの1手）
// ?fx=capture     相手の歩が 7五、自分の歩が 7六。Space で取る（CPU が取り返すと、相手の手の光りも見られる）
// ?fx=promote     自分の歩が 5四、相手の 5三 は空き。Space で 5三 へ成る
// ?fx=drop        自分に持ち駒の歩（7七 の歩は外す）。Space で 7五 に打つ
// &cpu=normal などで相手の持ち込みと強さを変える

type FxScene = 'card' | 'otoshiana' | 'kagami' | 'narifuuji' | 'hagane-block' | 'check' | 'win' | 'lose' | 'draw'
  | 'itetsuku' | 'aiuchi' | 'migawari' | 'marks' | 'equips' | 'omori-break' | 'bangasa-ward'
  | 'move' | 'capture' | 'promote' | 'drop' | 'resign';
const SCENES: FxScene[] = [
  'otoshiana', 'kagami', 'narifuuji', 'hagane-block', 'check', 'win', 'lose', 'draw', 'itetsuku', 'aiuchi', 'migawari', 'marks', 'equips', 'omori-break', 'bangasa-ward',
  'move', 'capture', 'promote', 'drop', 'resign',
];
const TRAP_SCENES = ['otoshiana', 'kagami', 'narifuuji', 'itetsuku', 'aiuchi', 'migawari'];
const PIT: Square = { c: 2, r: 5 };   // 落とし穴を伏せるマス（7六）
const PROMO: Square = { c: 4, r: 2 }; // 成り封じ・鋼の鎧で狙うマス（5三）
const MEET: Square = { c: 2, r: 4 };  // ふだんの1手の試し口で、取る・打つマス（7五）

/** URL から試し口の場面を読む。開発中でなければ、または場面がなければ null */
function fxScene(): { scene: FxScene; card: CardId | null } | null {
  if (!import.meta.env.DEV) return null;
  const q = new URLSearchParams(location.search);
  const name = q.get('fx');
  if (!name) return null;
  const isTrap = TRAP_SCENES.includes(name);
  if ((SCENES as string[]).includes(name) && !(isTrap && q.get('set'))) return { scene: name as FxScene, card: null };
  if (name in CARDS) return { scene: 'card', card: name as CardId };
  // 落雷を飛車に落とす（壊さず3マスまで）
  if (name === 'rakurai-hisha') return { scene: 'card', card: 'rakurai' };
  return null;
}

/** 盤の駒を動かす（局面づくり用。持ち主・種類はそのまま） */
function put(s: GameState, from: Square, to: Square): void {
  s.board[to.r * 9 + to.c] = s.board[from.r * 9 + from.c];
  s.board[from.r * 9 + from.c] = null;
}

/**
 * 試し口の局面で対局画面を開くための引数。開発中（import.meta.env.DEV）だけ。ふだんは null
 */
export function fxMatchParams(): { level: Level; deck: CardId[]; initial: GameState; fxKey: true } | null {
  // ここで直接見ておくと、本番の組み立てで中身ごと消える
  if (!import.meta.env.DEV) return null;
  const fx = fxScene();
  if (!fx) return null;
  const q = new URLSearchParams(location.search);
  const cpu = q.get('cpu');
  const level: Level = isLevel(cpu) ? cpu : 'weak';
  const deck: CardId[] = fx.card ? [fx.card] : fx.scene === 'kagami' ? ['rakurai'] : [];
  const s = createGame({ sente: deck, gote: cpu ? LEVELS[level].deck : [] });
  const trap = (cardId: CardId, at: Square | null): void => {
    s.traps.push({ uid: s.nextId++, owner: 'gote', cardId, at });
  };
  switch (fx.scene) {
    case 'card':
      // 呼び戻し：相手に持ち駒を持たせる
      if (fx.card === 'yobimodoshi') { s.players.gote.hand.KI = 1; s.players.gote.hand.FU = 2; }
      if (q.get('kagami')) trap('kagami', null);
      // 格落とし：相手の飛車を竜にする
      if (fx.card === 'kakuotoshi') s.board[1 * 9 + 1]!.promoted = true;
      break;
    case 'itetsuku':
      trap('itetsuku', PIT);
      break;
    case 'aiuchi':
      trap('aiuchi', null);
      put(s, { c: 2, r: 2 }, PIT);
      break;
    case 'migawari':
      trap('migawari', null);
      put(s, { c: 3, r: 8 }, { c: 4, r: 1 });
      break;
    case 'marks': {
      const at = (c: number, r: number) => s.board[r * 9 + c]!;
      at(2, 6).frozen = 2;
      at(4, 6).frozen = 1;
      at(4, 6).sealed = true;
      at(6, 8).sealed = true;
      at(3, 0).shackle = { left: 3 };
      at(3, 0).equip = { cardId: 'hagane' };   // 枷と纏札を両方
      at(5, 2).frozen = 2;
      at(2, 2).numb = 1;                       // 痺れ
      at(7, 7).reach = 3;                      // 落雷を受けた飛車（3マスまで）
      at(1, 1).reach = 3;                      // 後手の飛車も
      s.traps.push({ uid: s.nextId++, owner: 'sente', cardId: 'itetsuku', at: { c: 4, r: 4 } });
      s.traps.push({ uid: s.nextId++, owner: 'sente', cardId: 'otoshiana', at: { c: 6, r: 4 } });
      break;
    }
    case 'equips': {
      const at = (c: number, r: number) => s.board[r * 9 + c]!;
      at(2, 6).equip = { cardId: 'hikijin' };
      at(1, 8).equip = { cardId: 'tenma' };
      at(2, 8).equip = { cardId: 'hagane' };
      at(7, 7).equip = { cardId: 'bangasa' };
      at(5, 8).equip = { cardId: 'idaten' };
      at(6, 6).shackle = { left: 3 };
      // 後手の駒（向きが合っているか）
      at(6, 2).equip = { cardId: 'hikijin' };
      at(6, 0).equip = { cardId: 'hagane' };
      at(1, 1).equip = { cardId: 'bangasa' };
      at(5, 0).equip = { cardId: 'idaten' };
      break;
    }
    case 'otoshiana':
      trap('otoshiana', PIT);
      break;
    case 'bangasa-ward':
      // 自分の 7七 の歩に番傘。相手が 7六 に落とし穴。Space で歩が進み、傘が受け止める
      trap('otoshiana', PIT);
      s.board[6 * 9 + 2]!.equip = { cardId: 'bangasa' };
      break;
    case 'kagami':
      trap('kagami', null);
      break;
    case 'narifuuji':
    case 'hagane-block': {
      // 相手の 5三 の歩を残すか外し、自分の 5七 の歩を 5四 へ
      if (fx.scene === 'narifuuji') { s.board[PROMO.r * 9 + PROMO.c] = null; trap('narifuuji', null); }
      else s.board[PROMO.r * 9 + PROMO.c]!.equip = { cardId: 'hagane' };
      put(s, { c: 4, r: 6 }, { c: 4, r: 3 });
      break;
    }
    case 'check':
      s.players.sente.hand.KI = 1;
      break;
    case 'win':
      // 自分の 6九 の金を、相手の王（5一）の前の 5二 へ
      put(s, { c: 3, r: 8 }, { c: 4, r: 1 });
      break;
    case 'lose':
      // 相手の 4一 の金を、自分の王（5九）の前の 5八 へ
      put(s, { c: 3, r: 0 }, { c: 4, r: 7 });
      break;
    case 'draw':
      s.ply = 300;
      break;
    case 'omori-break':
      s.board[0 * 9 + 6]!.shackle = { left: 1 };
      break;
    case 'move':
      break;
    case 'capture':
      put(s, { c: 2, r: 2 }, MEET);
      put(s, { c: 2, r: 6 }, PIT);
      break;
    case 'promote':
      s.board[PROMO.r * 9 + PROMO.c] = null;
      put(s, { c: 4, r: 6 }, { c: 4, r: 3 });
      break;
    case 'drop':
      s.board[6 * 9 + 2] = null;
      s.players.sente.hand.FU = 1;
      break;
  }
  return { level, deck, initial: s, fxKey: true };
}

/** 試し口で使う行動：カードの行動のうち、対象の駒の種類が違うもの（入れ替えで同じ駒どうしを避ける）を先に選ぶ */
function pickCardAction(view: GameState, legal: Action[]): Action | undefined {
  const cards = legal.filter((a): a is Extract<Action, { type: 'card' }> => a.type === 'card');
  const kinds = (a: Extract<Action, { type: 'card' }>) => new Set(a.targets.map((t) => view.board[t.r * 9 + t.c]?.kind));
  // 落雷：?fx=rakurai-hisha は飛車へ。ふだんは、まわりに駒がいちばん多い駒へ（痺れが見えるように）
  const fx = new URLSearchParams(location.search).get('fx');
  if (fx === 'rakurai-hisha') return cards.find((a) => view.board[a.targets[0].r * 9 + a.targets[0].c]?.kind === 'HI');
  if (fx === 'rakurai') {
    const around = (sq: Square) => {
      let n = 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const c = sq.c + dc, r = sq.r + dr;
        if ((dc || dr) && c >= 0 && c < 9 && r >= 0 && r < 9 && view.board[r * 9 + c]) n++;
      }
      return n;
    };
    const plain = cards.filter((a) => !['HI', 'KA'].includes(view.board[a.targets[0].r * 9 + a.targets[0].c]?.kind ?? ''));
    return plain.sort((a, b) => around(b.targets[0]) - around(a.targets[0]))[0];
  }
  return cards.find((a) => a.targets.length < 2 || kinds(a).size === a.targets.length) ?? cards[0];
}

type MoveAction = Extract<Action, { type: 'move' }>;
const isMove = (a: Action): a is MoveAction => a.type === 'move';
const pieceAt = (view: GameState, sq: Square) => view.board[sq.r * 9 + sq.c];
const same = (a: Square, b: Square): boolean => a.c === b.c && a.r === b.r;

/** 行動を見えている局面に当てたときの出来事（当てられなければ空） */
function eventsOf(view: GameState, a: Action) {
  try { return applyAction(view, a).events; } catch { return []; }
}

/** 歩を1つ前へ進める、取らない手 */
function quietPawnMove(view: GameState, legal: Action[]): Action | undefined {
  return legal.filter(isMove).find((a) => pieceAt(view, a.from)?.kind === 'FU' && !pieceAt(view, a.to) && !a.second);
}

/** 場面ごとに、Space で指す行動を選ぶ */
function pickFxAction(scene: FxScene, view: GameState, legal: Action[]): Action | undefined {
  switch (scene) {
    case 'card':
      // カードを使ったあと（韋駄天を付けたあと）は、2回動く手を指す
      return pickCardAction(view, legal) ?? legal.filter(isMove).find((a) => a.second);
    case 'kagami':
      return pickCardAction(view, legal);
    case 'otoshiana':
    case 'itetsuku':
    case 'aiuchi':
    case 'bangasa-ward':
      return legal.filter(isMove).find((a) => same(a.to, PIT) && pieceAt(view, a.from)?.kind !== 'OU');
    case 'migawari':
      return legal.filter(isMove).find((a) => pieceAt(view, a.to)?.kind === 'OU');
    case 'marks':
    case 'equips':
      return undefined;
    case 'narifuuji':
      return legal.filter(isMove).find((a) => same(a.to, PROMO) && a.promote);
    case 'hagane-block':
      return legal.filter(isMove).find((a) => same(a.to, PROMO) && !a.promote);
    case 'check':
      return legal.find((a) => eventsOf(view, a).some((e) => e.type === 'check' && e.side === 'gote'));
    case 'win':
      return legal.find((a) => eventsOf(view, a).some((e) => e.type === 'gameOver' && e.result.winner === 'sente'));
    case 'capture':
      return legal.filter(isMove).find((a) => same(a.to, MEET));
    case 'promote':
      return legal.filter(isMove).find((a) => same(a.to, PROMO) && a.promote);
    case 'drop':
      return legal.find((a) => a.type === 'drop' && a.kind === 'FU' && same(a.to, MEET));
    case 'resign':
      return undefined; // Space で投了する（installFxKey）
    case 'move':
    case 'lose':
    case 'draw':
    case 'omori-break':
      return quietPawnMove(view, legal);
  }
}

// 試し口の切り替え（画面の左下）：札や場面を選ぶと、その試し口で開き直す。アドレスを書き換えなくて済むように
const PICKS: [string, string][] = [
  ['oshikaeshi', '術・押し返しの風'], ['irekae', '術・入れ替えの術'], ['shoryu', '術・成り上がり'],
  ['yobimodoshi', '術・呼び戻し'], ['kakuotoshi', '術・格落とし'], ['rakurai', '術・落雷'], ['rakurai-hisha', '術・落雷（飛車）'],
  ['itetsuku', '忍・凍てつく床'], ['otoshiana', '忍・落とし穴'], ['narifuuji', '忍・成り封じ'],
  ['kagami', '忍・鏡の結界'], ['aiuchi', '忍・相討ち'], ['migawari', '忍・身代わり'],
  ['hikijin', '纏・陣替えの旗'], ['tenma', '纏・天馬の蹄'], ['hagane', '纏・鋼の鎧'],
  ['omori', '纏・重りの枷'], ['bangasa', '纏・番傘'], ['idaten', '纏・韋駄天'],
  ['hagane-block', '出番・鎧が守る'], ['omori-break', '出番・枷が外れる'], ['bangasa-ward', '出番・番傘が受け止める'],
  ['equips', '纏札の印を見る'], ['move', '1手・動かす'], ['capture', '1手・取る'], ['promote', '1手・成る'], ['drop', '1手・打つ'],
  ['check', '決着・王手'], ['win', '決着・勝ち'], ['lose', '決着・負け'], ['draw', '決着・引き分け'], ['resign', '決着・投了'],
];

/** 効果音の試し聞きの一覧（鳴る場面の名前）。録った音でないものは名前に「仮」を付けて出す */
const SOUND_PICKS = {
  hyoshigi: '拍子木（札の名前・王手・幕）', tsuke: 'ツケ打ち（大技の前振り）', maku: '垂れ幕（結果画面への幕）',
  koma: '駒を打つ', komaHard: '駒を強く打つ（取る・打つ）', tick: '駒を選ぶ', kaesu: '成る（裏返す）',
  whoosh: '風を切る（札が飛ぶ）', chime: '鈴（いまは鳴らさない）', kirakira: 'きらきら（札の力が宿る）', bubble: '水鏡で沈む泡', kotsuzumi: '小鼓（札の名前のカットイン）', shakuhachi: '尺八（開戦）', ote: '王手（低い拍子木）', flameShort: '韋駄天（短い炎・歩く）', flip: '伏せ札がめくれる', stamp: '判子',
  wind: '押し返しの風', poof: '煙玉（入れ替え・身代わり）', thud: 'ドスン（成り上がり・身代わり・王が墨に染まる）', reel: '呼び戻しのリール',
  glass: '格落とし（割れる）', raimei: '落雷のため（雷鳴）', rakurai: '落雷の本命', thunder: '落雷の余韻',
  shatter: '木が砕ける（落雷・身代わり）', ice: '凍てつく床（氷）', frost: '凍る瞬間（凍てつく床・水鏡）',
  trapdoor: '落とし穴（扉）', paper: '成り封じ（お札）', splash: '水鏡（ちゃぽん）', slash: '相討ち（一閃）',
  hoof: '天馬の蹄', inanaki: '天馬のいななき', armor: '鋼の鎧', chain: '重りの枷（鎖）', tekkyu: '重りの枷（鉄球）',
  clang: '金属の音', flame: '韋駄天（炎）', drum: '大太鼓（王が取られる・引き分け）', fude: '筆（決着の一画ごと）',
  cardOut: '札が大きく出る（シャッフル）', levelup: '成り上がり（レベルアップ）', anaThud: '落とし穴の底', fuuin: '成り封じ（封印）',
  kachi: '勝ちの決め音', make: '負けの決め音', suzu: 'りん（引き分けの書き終わり）',
  bakuhatsu: '爆発1（王取り）', bakuhatsu2: '爆発2（王取り）', iai: '居合抜き（王取り）', daiken: '大剣（王取り）',
  naguru: '強く殴る（叩き割り）', slowWhoosh: 'スローの風切り（王取り）', slowmo: 'スローモーション（王取り）',
  uchitottari: '声「傾奇者、討ち取ったりー」（大見得）',
} satisfies Record<SoundName, string>;

/** 左下の効果音の試し聞き：一覧から選ぶとすぐ鳴る。「鳴らす」でもう一度 */
function soundPicker(btn: (label: string, title: string, onClick: () => void) => HTMLButtonElement): HTMLElement {
  const row = document.createElement('div');
  row.setAttribute('style', 'display:flex;gap:4px;align-items:center');
  const sel = document.createElement('select');
  sel.setAttribute('aria-label', '効果音の試し聞き');
  sel.setAttribute('style', 'height:30px;max-width:190px;border:0;border-radius:4px;background:#eee8dc;color:#1d1a17');
  const head = document.createElement('option');
  head.value = ''; head.textContent = '音を選んで鳴らす';
  sel.append(head);
  for (const [id, name] of Object.entries(SOUND_PICKS) as [SoundName, string][]) {
    const o = document.createElement('option');
    o.value = id; o.textContent = SAMPLES[id] ? name : `仮・${name}`;
    sel.append(o);
  }
  const play = (): void => {
    if (!sel.value) return;
    const s = getSound();
    s.unlock();
    s.play(sel.value as SoundName);
  };
  // Space は演出を流すキーなので、選んだら選択欄から外す
  sel.addEventListener('change', () => { play(); sel.blur(); });
  row.append(sel, btn('鳴らす', '選んだ音をもう一度', play));
  return row;
}

/** 左下の試し口の切り替え。決着のあとの結果画面でも選び直せるよう、一度出したら画面が替わっても残す */
function installFxPicker(): void {
  if (document.getElementById('fx-picker')) return;
  const q = new URLSearchParams(location.search);
  const now = q.get('fx') ?? '';
  const i = PICKS.findIndex(([id]) => id === now);
  const go = (id: string): void => {
    q.set('fx', id);
    location.search = q.toString();
  };
  const bar = document.createElement('div');
  bar.id = 'fx-picker';
  bar.setAttribute('style', [
    'position:fixed', 'left:8px', 'bottom:8px', 'z-index:2000', 'display:flex', 'flex-wrap:wrap', 'max-width:calc(100vw - 16px)', 'gap:4px', 'align-items:center',
    'padding:4px', 'border-radius:6px', 'background:rgba(29,26,23,.82)', 'font:13px/1 sans-serif',
  ].join(';'));
  const btn = (label: string, title: string, onClick: () => void): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.title = title;
    b.setAttribute('style', 'min-width:32px;height:30px;border:0;border-radius:4px;background:#eee8dc;color:#1d1a17;font-weight:700');
    b.addEventListener('click', onClick);
    return b;
  };
  const sel = document.createElement('select');
  sel.setAttribute('aria-label', '試し口');
  sel.setAttribute('style', 'height:30px;max-width:150px;border:0;border-radius:4px;background:#eee8dc;color:#1d1a17');
  for (const [id, name] of PICKS) {
    const o = document.createElement('option');
    o.value = id; o.textContent = name; o.selected = id === now;
    sel.append(o);
  }
  sel.addEventListener('change', () => go(sel.value));
  // 王を取る演出の案（?king=）。決着・勝ち／負けで流す案を替える
  const kingSel = document.createElement('select');
  kingSel.setAttribute('aria-label', '王を取る演出の案');
  kingSel.setAttribute('style', 'height:30px;max-width:110px;border:0;border-radius:4px;background:#eee8dc;color:#1d1a17');
  const nowKing = q.get('king') ?? '';
  for (const [id, name] of [['', '王取り：設定どおり'], ...KING_FX.map((k) => [k, `王取り・${KING_FX_LABEL[k]}`])] as [string, string][]) {
    const o = document.createElement('option');
    o.value = id; o.textContent = name; o.selected = id === nowKing;
    kingSel.append(o);
  }
  kingSel.addEventListener('change', () => {
    if (kingSel.value) q.set('king', kingSel.value); else q.delete('king');
    location.search = q.toString();
  });
  const n = PICKS.length;
  bar.append(
    btn('◀', '前の札', () => go(PICKS[(Math.max(0, i) - 1 + n) % n][0])),
    sel,
    btn('▶', '次の札', () => go(PICKS[(i + 1) % n][0])),
    btn('もう一度', '同じ札をもう一度', () => location.reload()),
    kingSel,
    soundPicker(btn),
  );
  // Space は演出を流すキーなので、選んだあとは選択欄から外す
  bar.addEventListener('click', () => sel.blur());
  document.body.append(bar);
}

/** Space キーで、試し口の行動を指す。画面の左下に試し口の切り替えも出す。戻り値で外す */
export function installFxKey(match: Match, submit: (a: Action) => void): () => void {
  if (!import.meta.env.DEV) return () => {};
  installFxPicker();
  const scene = fxScene()?.scene ?? 'card';
  const onKey = (e: KeyboardEvent): void => {
    if (e.code !== 'Space' || e.repeat) return;
    e.preventDefault();
    if (match.phase() !== 'human') return;
    if (scene === 'resign') {
      // 「戻る」→「投了する」を押したことにする
      const btn = (t: string): HTMLButtonElement | undefined => [...document.querySelectorAll<HTMLButtonElement>('.match button')].find((b) => b.textContent === t);
      btn('戻る')?.click();
      btn('投了する')?.click();
      return;
    }
    const a = pickFxAction(scene, match.view(), match.legal());
    if (a) submit(a);
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}

// ---------- 自動対局（?auto=weak|normal|strong。開発中だけ） ----------
//
// 人間側（先手）も2つ目の Worker の CPU がその強さで指し、演出は「短め」で流れ続ける。
// 先手の持ち込みは「おまかせ」で組む（カードの演出も通しで流すため）。結果画面まで行ったら止まる。
// 戦績には数えない。保存された設定（演出の長さ）は書き換えない

/** URL の ?auto= から自動対局の強さを読む。開発中でなければ、または無ければ null */
// ---------- エンディングの試し口（?ending=1。開発中だけ）----------
// 対局せずにエンディングを開く（設定からの見返しと同じ：大見得なし・いつでも飛ばせる・終わったら設定へ）。
// &at=<秒> でその秒から（曲は頭から流れるので、場面だけを先へ進めて見るときに使う）
export function endingDevParams(): { replay: true; devAt?: number } | null {
  if (!import.meta.env.DEV) return null;
  const q = new URLSearchParams(location.search);
  if (q.get('ending') !== '1') return null;
  const at = Number(q.get('at'));
  return Number.isFinite(at) && at > 0 ? { replay: true, devAt: at } : { replay: true };
}

export function autoLevel(): Level | null {
  if (!import.meta.env.DEV) return null;
  const v = new URLSearchParams(location.search).get('auto');
  return isLevel(v) ? v : null;
}

/** 自動対局で対局画面を開くための引数。ふだんは null */
export function autoMatchParams(): { level: Level; deck: CardId[]; auto: true } | null {
  if (!import.meta.env.DEV) return null;
  const level = autoLevel();
  if (!level) return null;
  return { level, deck: autoDeck(makeRng(Date.now())), auto: true };
}

/** 形がまったく同じか（行動を合法手の要素に対応づけるため。キーの並びには頼らない） */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/**
 * 人間の手番になるたびに、2つ目の CPU に先手として考えさせ、その手を指す。
 * CPU の答えは合法手の配列の要素そのものに置き換えてから渡す（画面で行動を組み立てない決まりのため）。
 * 答えられないとき・合法手に無い答えのときは、合法手の先頭を指す。戻り値で止める
 */
export function installAutoPlay(
  match: Match, cpu: CpuClient, level: Level, submit: (a: Action) => Promise<void>,
): () => void {
  if (!import.meta.env.DEV) return () => {};
  let stopped = false;
  let moves = 0;
  const rng = makeRng(Date.now() ^ 0x5eed);
  const loop = async (): Promise<void> => {
    // CPU が先に指す（相手の駒落ち）ときは、先手の番が来るまで待つ
    while (!stopped && (match.phase() === 'cpu' || match.phase() === 'presenting')) {
      await new Promise((r) => setTimeout(r, 100));
    }
    while (!stopped && match.phase() === 'human') {
      const legal = match.legal();
      if (legal.length === 0) return;
      let pick: Action | undefined;
      try {
        const a = await cpu.think(match.view(), 'sente', level, Math.floor(rng() * 0x100000000));
        if (stopped) return;
        pick = legal.find((x) => deepEqual(x, a));
        if (!pick) console.warn('自動対局：CPU の答えが合法手に無いので、合法手の先頭を指します', a);
      } catch (e) {
        if (stopped) return;
        console.warn('自動対局：CPU が答えないので、合法手の先頭を指します', e);
      }
      // 考えている間に局面が変わっていないか（念のため）
      if (match.phase() !== 'human') return;
      moves++;
      await submit(pick ?? match.legal()[0]!);
    }
    if (!stopped) console.info(`自動対局：先手が ${moves} 手指したところで止まりました（${match.phase()}）`);
  };
  void loop();
  return () => { stopped = true; };
}
