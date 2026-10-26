// 駒ごとの動ける先・成りの判定・打てる場所
import type { GameState, HandKind, Piece, PieceKind, Side, Square } from './types';
import { forward, idx, onBoard, opponent, sqOf } from './board';

// 向きは [横, 前]。前が正なら、その駒の持ち主から見て前へ進む
type Vec = readonly [number, number];

const GOLD: Vec[] = [[-1, 1], [0, 1], [1, 1], [-1, 0], [1, 0], [0, -1]];
const SILVER: Vec[] = [[-1, 1], [0, 1], [1, 1], [-1, -1], [1, -1]];
const KING: Vec[] = [[-1, 1], [0, 1], [1, 1], [-1, 0], [1, 0], [-1, -1], [0, -1], [1, -1]];
const ORTHO: Vec[] = [[0, 1], [0, -1], [-1, 0], [1, 0]];
const DIAG: Vec[] = [[-1, 1], [1, 1], [-1, -1], [1, -1]];
const KNIGHT: Vec[] = [[-1, 2], [1, 2]];

// 1マス（または跳ぶ）動きと、滑る動き
function vectors(p: Piece): { steps: Vec[]; slides: Vec[] } {
  if (p.promoted) {
    if (p.kind === 'HI') return { steps: DIAG, slides: ORTHO };
    if (p.kind === 'KA') return { steps: ORTHO, slides: DIAG };
    return { steps: GOLD, slides: [] };
  }
  switch (p.kind) {
    case 'FU': return { steps: [[0, 1]], slides: [] };
    case 'KY': return { steps: [], slides: [[0, 1]] };
    case 'KE': return { steps: KNIGHT, slides: [] };
    case 'GI': return { steps: SILVER, slides: [] };
    case 'KI': return { steps: GOLD, slides: [] };
    case 'KA': return { steps: [], slides: DIAG };
    case 'HI': return { steps: [], slides: ORTHO };
    case 'OU': return { steps: KING, slides: [] };
  }
}

// その駒が動ける先（味方のいるマスは除く。相手の駒のマスは含む）。
// 凍った駒は動けない。重りの枷を付けた駒は隣8マスだけ。貫きの槍は滑る途中の駒を1つ飛び越えられる。退き陣の旗は真後ろへ1マス
export function pieceTargets(s: GameState, from: Square): Square[] {
  const p = s.board[idx(from)];
  if (!p || p.frozen) return [];
  const f = forward(p.side);
  const { steps, slides } = vectors(p);
  // 天馬の蹄は桂馬の動きを足す。退き陣の旗は成っていない駒に真後ろ1マスを足す
  const extra: Vec[] = p.equip?.cardId === 'tenma' ? KNIGHT
    : p.equip?.cardId === 'hikijin' && !p.promoted ? [[0, -1]] : [];
  const out: Square[] = [];
  const seen = new Set<number>();
  const add = (sq: Square) => {
    const i = idx(sq);
    if (!seen.has(i)) { seen.add(i); out.push(sq); }
  };
  for (const [dc, df] of [...steps, ...extra]) {
    const to = { c: from.c + dc, r: from.r + df * f };
    if (!onBoard(to)) continue;
    const q = s.board[idx(to)];
    if (q && q.side === p.side) continue;
    add(to);
  }
  const pierce = p.equip?.cardId === 'tsuranuki';
  for (const [dc, df] of slides) {
    let to = { c: from.c + dc, r: from.r + df * f };
    let jumped = false;
    while (onBoard(to)) {
      const q = s.board[idx(to)];
      if (q) {
        if (q.side !== p.side) add(to);
        if (!pierce || jumped) break;
        jumped = true;
      } else {
        add(to);
      }
      to = { c: to.c + dc, r: to.r + df * f };
    }
  }
  if (p.equip?.cardId === 'omori') {
    return out.filter(t => Math.abs(t.c - from.c) <= 1 && Math.abs(t.r - from.r) <= 1);
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
  for (const [vc, vf] of steps) if (vc === dc && vf === df) return true;
  if (equip === 'tenma' && (dc === -1 || dc === 1) && df === 2) return true;
  if (equip === 'hikijin' && !p.promoted && dc === 0 && df === -1) return true;
  // 滑る動き：to がその筋の上にあり、間の駒が0（貫きの槍なら1つまで）
  const allowed = equip === 'tsuranuki' ? 1 : 0;
  for (const [vc, vf] of slides) {
    if ((vc === 0 && dc !== 0) || (vf === 0 && df !== 0)) continue;
    const k = vc !== 0 ? dc * vc : df * vf;
    if (k < 1 || (vc !== 0 && vf !== 0 && dc * vc !== df * vf)) continue;
    const stepR = (tr - fr) / k, stepC = dc / k;
    let blockers = 0;
    for (let n = 1; n < k; n++) {
      if (s.board[(fr + stepR * n) * 9 + fc + stepC * n] && ++blockers > allowed) break;
    }
    if (blockers <= allowed) return true;
  }
  return false;
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
