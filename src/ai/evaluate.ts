// CPU 用の局面の点数（side から見た 自分−相手）
import { CARDS } from '../cards';
import { OMORI_TURNS } from '../cards/equip';
import { HAND_KINDS, idx, opponent } from '../rules/board';
import { attacks, pieceTargetIdx } from '../rules/moves';
import type { CardId, GameState, Side, Square } from '../rules/types';

import { PIECE_VALUE, PROMOTED_VALUE } from '../rules/values';

export { PIECE_VALUE, PROMOTED_VALUE };
export const HAND_FACTOR = 1.1;   // 持ち駒は盤上の1.1倍（どこにでも打てるため）
export const CARD_PER_COST = 80;  // 未使用のカード：コスト×80
export const TRAP_PER_COST = 100; // 中身の分かる伏せた罠：コスト×100
export const PITFALL_BONUS = 100; // 自分の落とし穴のマスに、相手の王以外の駒が動ける
export const EQUIP_VALUE: Partial<Record<CardId, number>> = {
  tenma: 200, hagane: 350, hikijin: 80, idaten: 500, tsuranuki: 150,
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
    for (const t of pieceTargetIdx(s, i)) out.add(t);
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
    // 重りの枷：残りの手番が少ないほど損は小さい
    if (p.equip?.cardId === 'omori') total -= Math.max(OMORI_MIN, v * OMORI_RATE) * (p.equip.left ?? OMORI_TURNS) / OMORI_TURNS;
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

function kingIndex(s: GameState, side: Side): number {
  return s.board.findIndex(p => p !== null && p.side === side && p.kind === 'OU');
}

// 王のまわり（隣8マスと王のマス）に届きうる相手の駒。
// 1マスの動き・桂の跳びは2マスまでしか届かないので、王から3マス以内だけ。
// 滑る駒は、筋がまわりの3×3を通るものだけ（縦横は王の列か段から1以内、斜めは王の斜めの筋から2以内）
function zoneAttackers(s: GameState, k: number, by: Side): number[] {
  const kc = k % 9, kr = (k - kc) / 9;
  const out: number[] = [];
  for (let i = 0; i < 81; i++) {
    const p = s.board[i];
    if (!p || p.side !== by || p.frozen) continue;
    const c = i % 9, r = (i - c) / 9;
    const dc = c - kc, dr = r - kr;
    if (Math.max(Math.abs(dc), Math.abs(dr)) <= 3) { out.push(i); continue; }
    const ortho = dc >= -1 && dc <= 1 || dr >= -1 && dr <= 1;
    const diag = Math.abs(dc - dr) <= 2 || Math.abs(dc + dr) <= 2;
    if (p.kind === 'HI' ? ortho : p.kind === 'KA' ? diag : p.kind === 'KY' && !p.promoted && dc >= -1 && dc <= 1) out.push(i);
  }
  return out;
}

// 王の囲いと、相手の王への迫り（side から見た 自分−相手）。
// 迫りは王のまわりの各マスへの相手の利き（1マス2つまで）。利きの地図を盤全体で作らず、まわりだけ数える
export function kingSafety(s: GameState, side: Side): number {
  const foe = opponent(side);
  const one = (me: Side): number => {
    const k = kingIndex(s, me);
    if (k < 0) return 0;
    const kc = k % 9, kr = Math.floor(k / 9);
    const enemies = zoneAttackers(s, k, opponent(me));
    let guard = 0, danger = 0;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const c = kc + dc, r = kr + dr;
        if (c < 0 || c > 8 || r < 0 || r > 8) continue;
        const i = r * 9 + c;
        const q = s.board[i];
        if (i !== k && q && q.side === me) guard++;
        let n = 0;
        for (let j = 0; j < enemies.length && n < 2; j++) if (attacks(s, enemies[j], i)) n++;
        danger += n;
      }
    }
    return guard * KING_GUARD - danger * ATTACK;
  };
  return one(side) - one(foe);
}

// ---- 賢くした見方（師範・傾奇者だけ。smart のとき足す）----
export const KING_HOME = [40, 30, 0];  // 王の段：自陣のいちばん奥・その前・その前（それより前は1段ごとに −20）
export const KING_EDGE = 5;            // 王が中央の筋から1筋離れるごと
export const CASTLE = 30;              // 王から2マス以内の自分の金・銀1枚
export const ESCAPE = 15;              // 王の逃げ道1マス（相手の利きが無く、味方もいない隣のマス）
export const PAWN_STEP = 5;            // 歩が1段前に出るごと（3段＝敵陣の手前まで）

function positionalOne(s: GameState, me: Side): number {
  let total = 0;
  const back = (r: number): number => (me === 'sente' ? 8 - r : r); // 自陣のいちばん奥からの段の数
  for (let i = 0; i < 81; i++) {
    const p = s.board[i];
    if (p && p.side === me && p.kind === 'FU' && !p.promoted) total += Math.min(3, Math.max(0, back(Math.floor(i / 9)) - 2)) * PAWN_STEP;
  }
  const k = kingIndex(s, me);
  if (k < 0) return total;
  const kc = k % 9, kr = (k - kc) / 9;
  const depth = back(kr);
  total += depth < KING_HOME.length ? KING_HOME[depth] : -20 * (depth - 2);
  total += Math.abs(kc - 4) * KING_EDGE;
  const enemies = zoneAttackers(s, k, opponent(me));
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      const c = kc + dc, r = kr + dr;
      if (c < 0 || c > 8 || r < 0 || r > 8 || (!dc && !dr)) continue;
      const q = s.board[r * 9 + c];
      if (q && q.side === me && (q.kind === 'KI' || q.kind === 'GI')) total += CASTLE;
      // 逃げ道は隣の8マスだけ
      if (Math.abs(dc) > 1 || Math.abs(dr) > 1 || (q && q.side === me)) continue;
      const to = r * 9 + c;
      if (!enemies.some(j => attacks(s, j, to))) total += ESCAPE;
    }
  }
  return total;
}

// 駒の置き場所・囲い・王の逃げ道（side から見た 自分−相手）
export function positional(s: GameState, side: Side): number {
  return positionalOne(s, side) - positionalOne(s, opponent(side));
}

export function evaluate(s: GameState, side: Side, smart = false): number {
  const base = material(s, side) + kingSafety(s, side);
  return smart ? base + positional(s, side) : base;
}
