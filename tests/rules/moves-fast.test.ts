// 速くした利きの部品が、もとの pieceTargets（下に写しを置く）と同じ答えを返すかの突き合わせ。
// 局面集（纏札・凍結・成り封じ・王のいない盤・伏せた罠を隠した局面を含む）の全部の駒・全部のマスで比べる
import { describe, expect, test } from 'vitest';
import { attackCount, attackedBy, attacks, pieceTargetIdx, pieceTargets } from '../../src/rules/moves';
import { forward, idx, onBoard, sqOf } from '../../src/rules/board';
import type { GameState, Piece, Side, Square } from '../../src/rules/types';
import { benchPositions } from '../ai/helpers/positions';
import { kingSafety, ATTACK, KING_GUARD } from '../../src/ai/evaluate';
import { opponent } from '../../src/rules/board';
import { emptyState, put } from '../helpers';

// 開けた盤に纏札の駒を置いた局面（局面集では味方の駒で動ける先が埋まりがちなので足す）
function openBoard(): GameState {
  const s = emptyState('sente');
  put(s, { c: 4, r: 8 }, 'OU', 'sente');
  put(s, { c: 4, r: 0 }, 'OU', 'gote');
  put(s, { c: 2, r: 5 }, 'KE', 'sente', { equip: 'tenma' });          // 桂に天馬（同じ跳びが重なる）
  put(s, { c: 6, r: 5 }, 'GI', 'sente', { equip: 'hikijin' });        // 銀に退き陣
  put(s, { c: 6, r: 3 }, 'GI', 'gote', { equip: 'hikijin' });         // 後手の銀に退き陣（向きが逆）
  put(s, { c: 0, r: 4 }, 'HI', 'sente', { equip: 'bangasa' });        // 飛に番傘（動きは変わらない）、筋に駒が2つ
  put(s, { c: 3, r: 4 }, 'FU', 'gote');
  put(s, { c: 5, r: 4 }, 'FU', 'gote');
  put(s, { c: 8, r: 8 }, 'KA', 'gote', { promoted: true, equip: 'omori' }); // 馬に枷
  put(s, { c: 4, r: 4 }, 'KE', 'gote', { equip: 'tenma', frozen: 1 });     // 凍った桂
  put(s, { c: 8, r: 0 }, 'KY', 'sente', { equip: 'bangasa', promoted: true });
  put(s, { c: 3, r: 5 }, 'KE', 'gote');                               // 王から3段離れた桂が王のまわりに利く
  return s;
}
const positions = [...benchPositions(), openBoard()];
const SIDES: Side[] = ['sente', 'gote'];

// もとの pieceTargets の写し（速くする前の作り。比べる相手）
type Vec = readonly [number, number];
const GOLD: Vec[] = [[-1, 1], [0, 1], [1, 1], [-1, 0], [1, 0], [0, -1]];
const SILVER: Vec[] = [[-1, 1], [0, 1], [1, 1], [-1, -1], [1, -1]];
const KING: Vec[] = [[-1, 1], [0, 1], [1, 1], [-1, 0], [1, 0], [-1, -1], [0, -1], [1, -1]];
const ORTHO: Vec[] = [[0, 1], [0, -1], [-1, 0], [1, 0]];
const DIAG: Vec[] = [[-1, 1], [1, 1], [-1, -1], [1, -1]];
const KNIGHT: Vec[] = [[-1, 2], [1, 2]];
function vectorsRef(p: Piece): { steps: Vec[]; slides: Vec[] } {
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
export function pieceTargetsRef(s: GameState, from: Square): Square[] {
  const p = s.board[idx(from)];
  if (!p || p.frozen) return [];
  const f = forward(p.side);
  const { steps, slides } = vectorsRef(p);
  const extra: Vec[] = p.equip?.cardId === 'tenma' ? KNIGHT
    : p.equip?.cardId === 'hikijin' && !p.promoted ? [[0, -1], [-1, 0], [1, 0]] : []; // 2026-10：陣替えの旗は左右にも
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
  // 2026-10：貫きの槍はなくなった（写しも飛び越えない）
  for (const [dc, df] of slides) {
    let to = { c: from.c + dc, r: from.r + df * f };
    while (onBoard(to)) {
      const q = s.board[idx(to)];
      if (q) {
        if (q.side !== p.side) add(to);
        break;
      }
      add(to);
      to = { c: to.c + dc, r: to.r + df * f };
    }
  }
  if (p.equip?.cardId === 'omori') {
    return out.filter(t => Math.abs(t.c - from.c) <= 1 && Math.abs(t.r - from.r) <= 1);
  }
  return out;
}


// もとの attackedBy（全部の駒の動ける先を並べて探す）
function attackedByRef(s: GameState, sq: { c: number; r: number }, side: Side): boolean {
  for (let i = 0; i < 81; i++) {
    const p = s.board[i];
    if (!p || p.side !== side) continue;
    if (pieceTargetsRef(s, sqOf(i)).some(t => t.c === sq.c && t.r === sq.r)) return true;
  }
  return false;
}

describe('attacks', () => {
  test('全部の駒・全部のマスで pieceTargets と同じ', () => {
    let checked = 0;
    for (const s of positions) {
      for (let i = 0; i < 81; i++) {
        if (!s.board[i]) continue;
        const reach = new Set(pieceTargetsRef(s, sqOf(i)).map(idx));
        for (let t = 0; t < 81; t++) {
          expect(attacks(s, i, t), `局面${positions.indexOf(s)} ${i}→${t}`).toBe(reach.has(t));
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(50_000);
  });
  test('駒のないマスからは利かない', () => {
    const s = positions[0];
    const empty = s.board.findIndex(p => p === null);
    expect(attacks(s, empty, 40)).toBe(false);
  });
});

describe('attackedBy', () => {
  test('全部のマス・両方の側で、もとの作りと同じ', () => {
    for (const s of positions) {
      for (let t = 0; t < 81; t++) {
        for (const side of SIDES) expect(attackedBy(s, sqOf(t), side)).toBe(attackedByRef(s, sqOf(t), side));
      }
    }
  });
});

describe('pieceTargetIdx', () => {
  test('全部の駒で、pieceTargets と同じマスを同じ並び順で返す', () => {
    for (const s of positions) {
      for (let i = 0; i < 81; i++) {
        if (!s.board[i]) continue;
        expect(pieceTargetIdx(s, i)).toEqual(pieceTargetsRef(s, sqOf(i)).map(idx));
        expect(pieceTargets(s, sqOf(i))).toEqual(pieceTargetsRef(s, sqOf(i)));
      }
    }
  });
});

describe('attackCount', () => {
  test('全部のマス・両方の側で、動ける駒の数と cap の小さい方', () => {
    for (const s of positions) {
      for (let t = 0; t < 81; t++) {
        for (const by of SIDES) {
          let n = 0;
          for (let i = 0; i < 81; i++) {
            const p = s.board[i];
            if (p && p.side === by && pieceTargetsRef(s, sqOf(i)).some(q => idx(q) === t)) n++;
          }
          expect(attackCount(s, t, by, 2)).toBe(Math.min(2, n));
          expect(attackCount(s, t, by, 9)).toBe(Math.min(9, n));
        }
      }
    }
  });
});

// もとの kingSafety の写し（全部の利きの地図を作って数える）
function kingSafetyRef(s: GameState, side: Side): number {
  const map = (by: Side) => {
    const m = new Uint8Array(81);
    for (let i = 0; i < 81; i++) {
      const p = s.board[i];
      if (!p || p.side !== by) continue;
      for (const t of pieceTargetsRef(s, sqOf(i))) m[idx(t)]++;
    }
    return m;
  };
  const maps: Record<Side, Uint8Array> = { sente: map('sente'), gote: map('gote') };
  const one = (me: Side): number => {
    const k = s.board.findIndex(p => p !== null && p.side === me && p.kind === 'OU');
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
  return one(side) - one(opponent(side));
}

describe('kingSafety', () => {
  test('全部の局面・両方の側で、もとの作りと同じ', () => {
    for (const s of positions) for (const side of SIDES) expect(kingSafety(s, side)).toBe(kingSafetyRef(s, side));
  });
});
