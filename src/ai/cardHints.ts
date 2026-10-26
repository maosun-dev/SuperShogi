// 札の行動の候補を、札ごとの「使う価値のある場面」の目安で絞る（CPU の読みを速くするため）。
// 見えている局面だけを見る。相手の伏せた札の中身と場所は使わない
import { CARDS } from '../cards';
import { idx, sqOf } from '../rules/board';
import { isInCheck, pieceTargetIdx } from '../rules/moves';
import { PROMOTED_VALUE, pieceValue } from '../rules/values';
import type { Action, CardId, GameState, Side, Square } from '../rules/types';

type CardAction = Extract<Action, { type: 'card' }>;

export const HINT_TOP = 3;      // 駒を選ぶ札：点数の大きい順にこの数まで
export const HINT_SWAP = 6;     // 入れ替えの術の組の上限
export const HINT_SQUARES = 4;  // マスに伏せる札のマスの上限

function at(s: GameState, sq: Square | undefined) {
  return sq ? s.board[idx(sq)] : null;
}

function kingSq(s: GameState, side: Side): Square | null {
  const i = s.board.findIndex(p => p !== null && p.side === side && p.kind === 'OU');
  return i < 0 ? null : sqOf(i);
}

const dist = (a: Square, b: Square): number => Math.max(Math.abs(a.c - b.c), Math.abs(a.r - b.r));

// 対象の駒の点数（大きい順に並べるため）
function targetValue(s: GameState, a: CardAction): number {
  const p = at(s, a.targets[0]);
  return p ? pieceValue(p) : 0;
}

function topBy(list: CardAction[], score: (a: CardAction) => number, n: number): CardAction[] {
  return [...list].sort((x, y) => score(y) - score(x)).slice(0, n);
}

// 相手の王以外の駒が動けるマス
function foeReach(s: GameState, side: Side): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i < 81; i++) {
    const p = s.board[i];
    if (!p || p.side === side || p.kind === 'OU') continue;
    for (const t of pieceTargetIdx(s, i)) out.add(t);
  }
  return out;
}

// 1枚の札の行動から、使う価値のありそうなものを選ぶ
function pick(s: GameState, side: Side, cardId: CardId, acts: CardAction[]): CardAction[] {
  const myKing = kingSq(s, side);
  switch (cardId) {
    case 'oshikaeshi':
    case 'rakurai':
    case 'omori':
      return topBy(acts, a => targetValue(s, a), HINT_TOP);
    case 'irekae': {
      const check = isInCheck(s, side);
      const big = (a: CardAction) => a.targets.some(t => {
        const k = at(s, t)?.kind;
        return k === 'HI' || k === 'KA' || (check && k === 'OU');
      });
      return topBy(acts.filter(big), a => a.targets.reduce((n, t) => n + (at(s, t)?.kind === 'OU' ? 10_000 : pieceValue(at(s, t)!)), 0), HINT_SWAP);
    }
    case 'yobimodoshi':
    case 'kakuotoshi':
      return acts;
    case 'shoryu':
      return topBy(acts, a => {
        const p = at(s, a.targets[0]);
        return p ? (PROMOTED_VALUE[p.kind] ?? 0) - pieceValue(p) : 0;
      }, HINT_TOP);
    case 'otoshiana':
    case 'itetsuku': {
      const reach = foeReach(s, side);
      const near = acts.filter(a => reach.has(idx(a.targets[0])));
      return topBy(near, a => (myKing ? -dist(a.targets[0], myKing) : 0), HINT_SQUARES);
    }
    case 'migawari': {
      if (!myKing) return [];
      const guarded = s.board.some((p, i) => p && p.side === side && p.kind !== 'OU' && dist(sqOf(i), myKing) === 1);
      return guarded ? acts.slice(0, 1) : [];
    }
    case 'kagami':
    case 'narifuuji':
    case 'aiuchi':
      return acts.slice(0, 1);
    case 'hikijin':
      // 退き陣の旗：前に出ている駒ほど下がり道が役に立つ
      return topBy(acts, a => (side === 'sente' ? 8 - a.targets[0].r : a.targets[0].r), HINT_TOP);
    case 'hagane':
      // 守りの纏札：点数の大きい駒と、王の隣の駒
      return topBy(acts, a => targetValue(s, a) + (myKing && dist(a.targets[0], myKing) <= 1 ? 2000 : 0), HINT_TOP);
    default:
      // 天馬の蹄・貫きの槍・韋駄天：点数の大きい自分の駒
      return topBy(acts, a => targetValue(s, a), HINT_TOP);
  }
}

// 札の行動のうち、使う価値のありそうなものだけを返す（駒の行動は返さない）
export function cardHints(s: GameState, actions: Action[]): CardAction[] {
  const byUid = new Map<number, CardAction[]>();
  for (const a of actions) {
    if (a.type !== 'card') continue;
    const list = byUid.get(a.uid);
    if (list) list.push(a); else byUid.set(a.uid, [a]);
  }
  const side = s.turn;
  const out: CardAction[] = [];
  const seen = new Set<CardId>(); // 同じ札を2枚持っていても、候補は1枚ぶんだけ
  for (const [uid, acts] of byUid) {
    const card = s.players[side].cards.find(c => c.uid === uid);
    if (!card || seen.has(card.cardId) || !CARDS[card.cardId]) continue;
    seen.add(card.cardId);
    out.push(...pick(s, side, card.cardId, acts));
  }
  return out;
}

