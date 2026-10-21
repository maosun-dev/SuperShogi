// CPU 用の局面の点数（side から見た 自分−相手）
import { CARDS } from '../cards';
import { HAND_KINDS, idx, opponent, sqOf } from '../rules/board';
import { pieceTargets } from '../rules/moves';
import type { CardId, GameState, Side, Square } from '../rules/types';

import { PIECE_VALUE, PROMOTED_VALUE } from '../rules/values';

export { PIECE_VALUE, PROMOTED_VALUE };
export const HAND_FACTOR = 1.1;   // 持ち駒は盤上の1.1倍（どこにでも打てるため）
export const CARD_PER_COST = 80;  // 未使用のカード：コスト×80
export const TRAP_PER_COST = 100; // 中身の分かる伏せた罠：コスト×100
export const PITFALL_BONUS = 100; // 自分の落とし穴のマスに、相手の王以外の駒が動ける
export const EQUIP_VALUE: Partial<Record<CardId, number>> = {
  tenma: 200, hagane: 350, tate: 300, idaten: 500, tsuranuki: 300,
};
export const OMORI_RATE = 0.4;     // 重りの枷：付けられた駒の点数のこの割合だけ、持ち主の損
export const OMORI_MIN = 150;
export const FROZEN_RATE = 0.15;   // 凍った駒：残りの手番1つにつき駒の点数のこの割合を引く
export const SEALED_BIG = 150;     // 成れない飛車・角
export const SEALED_SMALL = 40;    // ほかの成れない駒
export const KING_GUARD = 40;      // 王の隣8マスにいる味方1つ
export const ATTACK = 30;          // 相手の王とその隣のマスへの利き1つ（1マス2つまで数える）

// 相手の王以外の駒が動けるマスの集合
function nonKingReach(s: GameState, by: Side): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i < 81; i++) {
    const p = s.board[i];
    if (!p || p.side !== by || p.kind === 'OU') continue;
    for (const t of pieceTargets(s, sqOf(i))) out.add(idx(t));
  }
  return out;
}

function sideScore(s: GameState, side: Side): number {
  let total = 0;
  for (const p of s.board) {
    if (!p || p.side !== side) continue;
    const v = p.promoted ? (PROMOTED_VALUE[p.kind] ?? PIECE_VALUE[p.kind]) : PIECE_VALUE[p.kind];
    total += v;
    if (p.frozen) total -= v * FROZEN_RATE * p.frozen;
    if (p.sealed) total -= p.kind === 'HI' || p.kind === 'KA' ? SEALED_BIG : SEALED_SMALL;
    if (p.equip?.cardId === 'omori') total -= Math.max(OMORI_MIN, v * OMORI_RATE);
    else if (p.equip) total += EQUIP_VALUE[p.equip.cardId] ?? 0;
  }
  for (const k of HAND_KINDS) total += s.players[side].hand[k] * PIECE_VALUE[k] * HAND_FACTOR;
  for (const c of s.players[side].cards) {
    if (!c.used) total += CARDS[c.cardId].cost * CARD_PER_COST;
  }
  let reach: Set<number> | null = null;
  for (const t of s.traps) {
    if (t.owner !== side || t.cardId === null) continue; // 隠れた罠は0点
    const def = CARDS[t.cardId];
    total += def.cost * TRAP_PER_COST;
    if (t.cardId === 'otoshiana' && t.at) {
      reach ??= nonKingReach(s, opponent(side));
      if (reach.has(idx(t.at as Square))) total += PITFALL_BONUS;
    }
  }
  return total;
}

// 駒・持ち駒・札の点数だけ（side から見た 自分−相手）
export function material(s: GameState, side: Side): number {
  return sideScore(s, side) - sideScore(s, opponent(side));
}

// 側ごとの利きの数（マスごと）
function attackMap(s: GameState, by: Side): Uint8Array {
  const m = new Uint8Array(81);
  for (let i = 0; i < 81; i++) {
    const p = s.board[i];
    if (!p || p.side !== by) continue;
    for (const t of pieceTargets(s, sqOf(i))) m[idx(t)]++;
  }
  return m;
}

function kingIndex(s: GameState, side: Side): number {
  return s.board.findIndex(p => p !== null && p.side === side && p.kind === 'OU');
}

// 王の囲いと、相手の王への迫り（side から見た 自分−相手）
export function kingSafety(s: GameState, side: Side): number {
  const foe = opponent(side);
  const maps: Record<Side, Uint8Array> = { sente: attackMap(s, 'sente'), gote: attackMap(s, 'gote') };
  const one = (me: Side): number => {
    const k = kingIndex(s, me);
    if (k < 0) return 0;
    const kc = k % 9, kr = Math.floor(k / 9);
    const enemy = maps[opponent(me)];
    let guard = 0, danger = 0;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const c = kc + dc, r = kr + dr;
        if (c < 0 || c > 8 || r < 0 || r > 8) continue;
        const i = r * 9 + c;
        const q = s.board[i];
        if (i !== k && q && q.side === me) guard++;
        danger += Math.min(2, enemy[i]);
      }
    }
    return guard * KING_GUARD - danger * ATTACK;
  };
  return one(side) - one(foe);
}

export function evaluate(s: GameState, side: Side): number {
  return material(s, side) + kingSafety(s, side);
}
