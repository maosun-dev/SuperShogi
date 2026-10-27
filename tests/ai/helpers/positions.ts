// 答え合わせ・速さ測りに使う決まった局面の並び（何度呼んでも同じ局面）。
// でたらめに進めた対局の途中（18枚の札がどこかで出る・駒落ち・後手から）と、
// 纏札・凍った駒・成り封じ・王のいない盤を手で置いた局面。どれも手番の側から見た viewFor の局面
import { makeRng } from '../../../src/ai/random';
import { applyAction, createGame, legalActions } from '../../../src/rules/game';
import { idx } from '../../../src/rules/board';
import { viewFor } from '../../../src/rules/view';
import type { Action, CardId, GameState, Handicap, Side } from '../../../src/rules/types';

// 4組で18枚すべてが1回は出る（どれもコスト10以内・同じ札なし）
const DECKS: [CardId[], CardId[]][] = [
  [['itetsuku', 'aiuchi', 'bangasa', 'hagane'], ['rakurai', 'omori', 'tenma']],
  [['oshikaeshi', 'irekae', 'idaten', 'hikijin'], ['kagami', 'narifuuji', 'shoryu', 'yobimodoshi']],
  [['migawari', 'otoshiana', 'narifuuji'], ['hagane', 'idaten', 'itetsuku', 'oshikaeshi']],
  [['tenma', 'rakurai', 'kakuotoshi', 'hikijin'], ['bangasa', 'aiuchi', 'irekae']],
];
const SNAP_PLIES = [6, 20, 40, 60];

// 行動の種類（動かす・打つ・札）を先に選び、その中から1つ選ぶ（tests/rules/random-play.test.ts と同じ選び方）
function pickAction(acts: Action[], rand: () => number): Action {
  const groups = (['move', 'drop', 'card'] as const)
    .map(t => acts.filter(a => a.type === t))
    .filter(g => g.length > 0);
  const g = groups[Math.floor(rand() * groups.length)];
  return g[Math.floor(rand() * g.length)];
}

function playedPositions(): GameState[] {
  const out: GameState[] = [];
  for (let seed = 1; seed <= 8; seed++) {
    const [a, b] = DECKS[(seed - 1) % DECKS.length];
    const decks: Record<Side, CardId[]> = seed % 2 === 0 ? { sente: b, gote: a } : { sente: a, gote: b };
    const opts: { handicap?: Handicap; first?: Side } = seed === 7 ? { handicap: { side: 'sente', kind: 'yonmai' } }
      : seed === 8 ? { first: 'gote' } : {};
    let s = createGame(decks, opts);
    const rand = makeRng(seed);
    for (let step = 1; step <= SNAP_PLIES[SNAP_PLIES.length - 1] && !s.result; step++) {
      s = applyAction(s, pickAction(legalActions(s), rand)).state;
      if (s.result) break;
      if (SNAP_PLIES.includes(step)) out.push(viewFor(s, s.turn));
    }
  }
  return out;
}

// 平手の盤に纏札・凍結・成り封じを置いた局面
function decorated(turn: Side, opts: { noFoeKing?: boolean; frozenKing?: boolean } = {}): GameState {
  const s = createGame({ sente: [], gote: [] });
  s.turn = turn;
  const at = (c: number, r: number) => s.board[idx({ c, r })]!;
  at(7, 7).equip = { cardId: 'bangasa' };              // 先手の飛車に番傘
  at(0, 8).equip = { cardId: 'bangasa' };              // 先手の香に番傘
  at(1, 8).equip = { cardId: 'tenma' };                  // 先手の桂に天馬
  at(4, 6).equip = { cardId: 'hikijin' };                // 先手の歩に退き陣（成る前）
  at(6, 8).equip = { cardId: 'idaten' };                 // 先手の銀に韋駄天
  at(2, 0).equip = { cardId: 'omori', left: 2 };         // 後手の銀に重りの枷
  at(5, 0).equip = { cardId: 'hagane' };                 // 後手の金に鋼の鎧
  at(3, 0).frozen = 2;                                   // 後手の金が凍っている
  at(2, 6).sealed = true;                                // 先手の歩は成れない
  // 成った歩（と金）に退き陣：成ったあとは真後ろへ下がれない
  s.board[idx({ c: 4, r: 4 })] = { id: s.nextId++, kind: 'FU', side: 'sente', promoted: true, equip: { cardId: 'hikijin' } };
  // 後手の角を前に出し、先手の王の筋に利かせる
  s.board[idx({ c: 7, r: 1 })] = null;
  s.board[idx({ c: 6, r: 4 })] = { id: s.nextId++, kind: 'KA', side: 'gote', promoted: false, equip: { cardId: 'bangasa' } };
  if (opts.frozenKing) at(4, 8).frozen = 1;
  if (opts.noFoeKing) s.board[idx({ c: 4, r: 0 })] = null;
  return viewFor(s, turn);
}

export function benchPositions(): GameState[] {
  return [
    ...playedPositions(),
    decorated('sente'),
    decorated('gote', { frozenKing: true }),
    decorated('sente', { noFoeKing: true }),
  ];
}

// 答え合わせの読みの設定。時間では止めず、読む量の上限だけで止める（機械の速さに左右されない）
export const GOLDEN_OPTS = {
  maxDepth: 6, timeLimitMs: 600_000, maxNodes: 20_000, qDepth: 6, cardPlies: 2, cardWidth: 8, noise: 0, seed: 1,
} as const;
