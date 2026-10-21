// 術札6枚
import type { GameState, HandKind, Piece, Side, Square } from '../rules/types';
import { HAND_KINDS, idx, onBoard, opponent, sqOf } from '../rules/board';
import { mustPromote } from '../rules/moves';
import { isShielded } from './shield';
import type { CardDef } from './types';

// side の駒とそのマスを盤の順に並べる
function piecesOf(s: GameState, side: Side): { sq: Square; p: Piece }[] {
  const out: { sq: Square; p: Piece }[] = [];
  s.board.forEach((p, i) => {
    if (p && p.side === side) out.push({ sq: sqOf(i), p });
  });
  return out;
}

// 相手側へ1マス：後手の駒なら r-1、先手の駒なら r+1
function pushDest(p: Piece, sq: Square): Square {
  return { c: sq.c, r: sq.r + (p.side === 'gote' ? -1 : 1) };
}

// 入れ替えたあと、行き所のない駒や二歩ができないか
function swapIsSound(s: GameState, side: Side, a: Square, b: Square): boolean {
  const pa = s.board[idx(a)]!;
  const pb = s.board[idx(b)]!;
  if (!pa.promoted && mustPromote(pa.kind, side, b)) return false;
  if (!pb.promoted && mustPromote(pb.kind, side, a)) return false;
  const board = [...s.board];
  board[idx(a)] = pb;
  board[idx(b)] = pa;
  const pawns = new Array(9).fill(0);
  board.forEach((p, i) => {
    if (p && p.side === side && p.kind === 'FU' && !p.promoted) pawns[sqOf(i).c]++;
  });
  return pawns.every(n => n <= 1);
}

export const oshikaeshi: CardDef = {
  id: 'oshikaeshi', name: '押し返しの風', kind: 'magic', cost: 1, fx: 'oshikaeshi',
  text: '相手の駒1つを、相手側へ1マス押し戻す。押し戻す先が空いているときだけ使える。王も対象にできる',
  prompt: '押し戻す相手の駒を選んでください',
  targetSets(s, side) {
    return piecesOf(s, opponent(side))
      .filter(({ sq, p }) => {
        const to = pushDest(p, sq);
        return onBoard(to) && !s.board[idx(to)] && !isShielded(s, sq);
      })
      .map(({ sq }) => [sq]);
  },
  resolve(ctx, [sq]) {
    const p = ctx.state.board[idx(sq)]!;
    const to = pushDest(p, sq);
    ctx.emit({ type: 'pushed', pieceId: p.id, from: sq, to });
    ctx.relocate(sq, to);
  },
};

export const irekae: CardDef = {
  id: 'irekae', name: '入れ替えの術', kind: 'magic', cost: 2, fx: 'irekae',
  text: '自分の駒2つの位置を入れ替える。王も対象にできる。行き所のない駒や二歩ができるなら使えない',
  prompt: '入れ替える自分の駒を2つ選んでください',
  targetSets(s, side) {
    const mine = piecesOf(s, side).filter(({ p }) => !p.frozen); // 凍った駒は動けない
    const out: Square[][] = [];
    for (let i = 0; i < mine.length; i++) {
      for (let j = i + 1; j < mine.length; j++) {
        if (swapIsSound(s, side, mine[i].sq, mine[j].sq)) out.push([mine[i].sq, mine[j].sq]);
      }
    }
    return out;
  },
  resolve(ctx, [a, b]) {
    ctx.emit({ type: 'swapped', a, b });
    ctx.swap(a, b);
  },
};

export const rakurai: CardDef = {
  id: 'rakurai', name: '落雷', kind: 'magic', cost: 4, fx: 'rakurai',
  text: '相手の駒1つを破壊する。王・飛車・角（竜・馬も）は選べない。壊れた駒は誰の持ち駒にもならない',
  prompt: '壊す相手の駒を選んでください',
  targetSets(s, side) {
    return piecesOf(s, opponent(side))
      .filter(({ sq, p }) => p.kind !== 'OU' && p.kind !== 'HI' && p.kind !== 'KA' && !isShielded(s, sq))
      .map(({ sq }) => [sq]);
  },
  resolve(ctx, [sq]) {
    ctx.destroy(sq, 'rakurai');
  },
};

// その列に side の成っていない歩があるか（except のマスは数えない）
function hasPawnInColumn(s: GameState, side: Side, c: number, except: Square): boolean {
  return s.board.some((p, i) => {
    const sq = sqOf(i);
    return !!p && p.side === side && p.kind === 'FU' && !p.promoted && sq.c === c && !(sq.c === except.c && sq.r === except.r);
  });
}

export const kakuotoshi: CardDef = {
  id: 'kakuotoshi', name: '格落とし', kind: 'magic', cost: 3, fx: 'kakuotoshi',
  text: '相手の成った駒1つを、成る前の駒に戻す。纏札は残る。戻すと行き所のない駒や二歩になる駒は選べない',
  prompt: '成りを戻す相手の駒を選んでください',
  targetSets(s, side) {
    return piecesOf(s, opponent(side))
      .filter(({ sq, p }) => p.promoted && !isShielded(s, sq)
        && !mustPromote(p.kind, p.side, sq)
        && !(p.kind === 'FU' && hasPawnInColumn(s, p.side, sq.c, sq)))
      .map(({ sq }) => [sq]);
  },
  resolve(ctx, [sq]) {
    const p = ctx.state.board[idx(sq)]!;
    p.promoted = false;
    ctx.emit({ type: 'demoted', pieceId: p.id, at: sq });
  },
};

export const shoryu: CardDef = {
  id: 'shoryu', name: '昇竜', kind: 'magic', cost: 3, fx: 'shoryu',
  text: '自分の駒1つを、どこにいてもその場で成らせる。金・王・成った駒・成れない駒は選べない。相手の成り封じは発動する',
  prompt: '成らせる自分の駒を選んでください',
  targetSets(s, side) {
    return piecesOf(s, side)
      .filter(({ p }) => !p.promoted && !p.sealed && p.kind !== 'KI' && p.kind !== 'OU')
      .map(({ sq }) => [sq]);
  },
  resolve(ctx, [sq]) {
    ctx.promoteInPlace(sq);
  },
};

// 相手の持ち駒にある種類
function foeHandKinds(s: GameState, side: Side): HandKind[] {
  const hand = s.players[opponent(side)].hand;
  return HAND_KINDS.filter(k => hand[k] > 0);
}

export const yobimodoshi: CardDef = {
  id: 'yobimodoshi', name: '呼び戻し', kind: 'magic', cost: 2, fx: 'yobimodoshi',
  text: '相手の持ち駒を1枚、自分の持ち駒に移す。相手に持ち駒がないときは使えない',
  prompt: '呼び戻す駒の種類を選んでください',
  targetSets(s, side) {
    return foeHandKinds(s, side).length > 0 ? [[]] : [];
  },
  choices: foeHandKinds,
  resolve(ctx, _targets, pick) {
    const foe = opponent(ctx.side);
    const kind = pick!;
    ctx.state.players[foe].hand[kind]--;
    ctx.state.players[ctx.side].hand[kind]++;
    ctx.emit({ type: 'handTransferred', kind, from: foe, to: ctx.side });
  },
};

export const MAGIC_CARDS: CardDef[] = [oshikaeshi, irekae, yobimodoshi, kakuotoshi, shoryu, rakurai];
