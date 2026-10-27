// 駒ごとの動ける先・成りの判定・打てる場所
import type { GameState, HandKind, Piece, PieceKind, Side, Square } from './types';
import { forward, idx, opponent, sqOf } from './board';

// 向きは [横, 前]。前が正なら、その駒の持ち主から見て前へ進む
type Vec = readonly [number, number];

const GOLD: Vec[] = [[-1, 1], [0, 1], [1, 1], [-1, 0], [1, 0], [0, -1]];
const SILVER: Vec[] = [[-1, 1], [0, 1], [1, 1], [-1, -1], [1, -1]];
const KING: Vec[] = [[-1, 1], [0, 1], [1, 1], [-1, 0], [1, 0], [-1, -1], [0, -1], [1, -1]];
const ORTHO: Vec[] = [[0, 1], [0, -1], [-1, 0], [1, 0]];
const DIAG: Vec[] = [[-1, 1], [1, 1], [-1, -1], [1, -1]];
const KNIGHT: Vec[] = [[-1, 2], [1, 2]];

// 1マス（または跳ぶ）動きと、滑る動き。読みで何度も呼ぶので、組は作り置きを返す
interface Moves { steps: readonly Vec[]; slides: readonly Vec[] }
const NONE: readonly Vec[] = [];
const M = (steps: readonly Vec[], slides: readonly Vec[]): Moves => ({ steps, slides });
const MOVES_RAW: Record<PieceKind, Moves> = {
  FU: M([[0, 1]], NONE), KY: M(NONE, [[0, 1]]), KE: M(KNIGHT, NONE), GI: M(SILVER, NONE),
  KI: M(GOLD, NONE), KA: M(NONE, DIAG), HI: M(NONE, ORTHO), OU: M(KING, NONE),
};
const MOVES_GOLD = M(GOLD, NONE);
const MOVES_RYU = M(DIAG, ORTHO);
const MOVES_UMA = M(ORTHO, DIAG);

function vectors(p: Piece): Moves {
  if (p.promoted) return p.kind === 'HI' ? MOVES_RYU : p.kind === 'KA' ? MOVES_UMA : MOVES_GOLD;
  return MOVES_RAW[p.kind];
}

// その駒が動ける先（味方のいるマスは除く。相手の駒のマスは含む）。
// 凍った駒は動けない。重りの枷を付けた駒は隣8マスだけ。陣替えの旗は真後ろ（と左右）へ1マス
export function pieceTargets(s: GameState, from: Square): Square[] {
  return pieceTargetIdx(s, idx(from)).map(sqOf);
}

// 陣替えの旗：真後ろと左右へ1マス
const JINGAE: readonly Vec[] = [[0, -1], [-1, 0], [1, 0]];

// pieceTargets と同じマスを同じ並び順で、マスの番号（r*9+c）で返す。CPU の読みで何度も呼ぶので、マスの物を作らない
export function pieceTargetIdx(s: GameState, from: number): number[] {
  const p = s.board[from];
  if (!p || p.frozen) return [];
  const f = forward(p.side);
  const fc = from % 9, fr = (from - fc) / 9;
  const { steps, slides } = vectors(p);
  // 天馬の蹄は桂馬の動きを足す。陣替えの旗は成っていない駒に真後ろと左右の1マスを足す
  const equip = p.equip?.cardId;
  const extra: readonly Vec[] = equip === 'tenma' ? KNIGHT : equip === 'hikijin' && !p.promoted ? JINGAE : [];
  const out: number[] = [];
  // 重なりが起こりうるのは足す動きがあるときだけ（桂に天馬など）
  const dedupe = extra.length > 0;
  const add = (i: number) => {
    if (!dedupe || !out.includes(i)) out.push(i);
  };
  const step = (dc: number, df: number) => {
    const c = fc + dc, r = fr + df * f;
    if (c < 0 || c > 8 || r < 0 || r > 8) return;
    const i = r * 9 + c;
    const q = s.board[i];
    if (q && q.side === p.side) return;
    add(i);
  };
  for (const [dc, df] of steps) step(dc, df);
  for (const [dc, df] of extra) step(dc, df);
  for (const [dc, df] of slides) {
    const dr = df * f;
    let c = fc + dc, r = fr + dr;
    while (c >= 0 && c <= 8 && r >= 0 && r <= 8) {
      const i = r * 9 + c;
      const q = s.board[i];
      if (q) {
        if (q.side !== p.side) add(i);
        break;
      }
      add(i);
      c += dc; r += dr;
    }
  }
  if (equip === 'omori') {
    return out.filter(t => Math.abs((t % 9) - fc) <= 1 && Math.abs(Math.floor(t / 9) - fr) <= 1);
  }
  return out;
}

function inEnemyCamp(side: Side, sq: Square): boolean {
  return side === 'sente' ? sq.r <= 2 : sq.r >= 6;
}

export function canPromote(p: Piece, from: Square, to: Square): boolean {
  if (p.promoted || p.sealed || p.kind === 'KI' || p.kind === 'OU') return false;
  return inEnemyCamp(p.side, from) || inEnemyCamp(p.side, to);
}

// 成らないと行き所がない（歩・香が最奥段、桂が奥2段）
export function mustPromote(kind: PieceKind, side: Side, to: Square): boolean {
  const depth = side === 'sente' ? to.r : 8 - to.r;   // 最奥段が0
  if (kind === 'FU' || kind === 'KY') return depth === 0;
  if (kind === 'KE') return depth <= 1;
  return false;
}

// 空きマスのうち、二歩・行き所のない駒にならない所
export function dropTargets(s: GameState, side: Side, kind: HandKind): Square[] {
  const pawnCols = new Set<number>();
  if (kind === 'FU') {
    s.board.forEach((p, i) => {
      if (p && p.side === side && p.kind === 'FU' && !p.promoted) pawnCols.add(sqOf(i).c);
    });
  }
  const out: Square[] = [];
  for (let i = 0; i < 81; i++) {
    if (s.board[i]) continue;
    const sq = sqOf(i);
    if (mustPromote(kind, side, sq)) continue;
    if (pawnCols.has(sq.c)) continue;
    out.push(sq);
  }
  return out;
}

// from（マスの番号）の駒が to へ動けるか。pieceTargets(s, sqOf(from)) に to が入っているかと必ず同じ答え。
// 動ける先を全部並べずに、向きの差し引きと間のマスだけで決める（王手の確かめ・点数づけで何度も呼ぶため）
export function attacks(s: GameState, from: number, to: number): boolean {
  if (from === to) return false;
  const p = s.board[from];
  if (!p || p.frozen) return false;
  const q = s.board[to];
  if (q && q.side === p.side) return false;
  const fc = from % 9, fr = (from - fc) / 9;
  const tc = to % 9, tr = (to - tc) / 9;
  const dc = tc - fc;
  const df = (tr - fr) * forward(p.side); // 持ち主から見て前へ何マスか
  const equip = p.equip?.cardId;
  if (equip === 'omori' && (Math.abs(dc) > 1 || Math.abs(df) > 1)) return false;
  const { steps, slides } = vectors(p);
  // 滑らない駒（1マスの動き・桂の跳び）は2マスより遠くへは届かない
  if (slides.length === 0 && (dc > 2 || dc < -2 || df > 2 || df < -2)) return false;
  for (const [vc, vf] of steps) if (vc === dc && vf === df) return true;
  if (equip === 'tenma' && (dc === -1 || dc === 1) && df === 2) return true;
  if (equip === 'hikijin' && !p.promoted && ((dc === 0 && df === -1) || (df === 0 && (dc === 1 || dc === -1)))) return true;
  // 滑る動き：to がその筋の上にあり、間に駒が無い
  for (const [vc, vf] of slides) {
    if ((vc === 0 && dc !== 0) || (vf === 0 && df !== 0)) continue;
    const k = vc !== 0 ? dc * vc : df * vf;
    if (k < 1 || (vc !== 0 && vf !== 0 && dc * vc !== df * vf)) continue;
    const stepR = (tr - fr) / k, stepC = dc / k;
    let blockers = 0;
    for (let n = 1; n < k; n++) {
      if (s.board[(fr + stepR * n) * 9 + fc + stepC * n] && ++blockers > 0) break;
    }
    if (blockers === 0) return true;
  }
  return false;
}

// by の駒のうち to へ動けるものの数。cap に達したらそこで数えるのをやめて cap を返す
export function attackCount(s: GameState, to: number, by: Side, cap: number): number {
  let n = 0;
  for (let i = 0; i < 81 && n < cap; i++) {
    const p = s.board[i];
    if (p && p.side === by && attacks(s, i, to)) n++;
  }
  return n;
}

// side の駒のどれかが sq に動けるか
export function attackedBy(s: GameState, sq: Square, side: Side): boolean {
  const to = idx(sq);
  for (let i = 0; i < 81; i++) {
    const p = s.board[i];
    if (p && p.side === side && attacks(s, i, to)) return true;
  }
  return false;
}

// side の王が相手に狙われているか
export function isInCheck(s: GameState, side: Side): boolean {
  const i = s.board.findIndex(p => p !== null && p.side === side && p.kind === 'OU');
  if (i < 0) return false;
  return attackedBy(s, sqOf(i), opponent(side));
}
