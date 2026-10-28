// 術札6枚
import type { GameState, HandKind, Piece, Side, Square } from '../rules/types';
import { HAND_KINDS, idx, onBoard, opponent, sqOf } from '../rules/board';
import { mustPromote } from '../rules/moves';
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
  text: '相手の駒1つを、相手側へ1マス押し戻す。押し戻す先が空いているときだけ使える。王も対象にできる。押し戻したあと、続けて駒を1つ動かすか、持ち駒を1つ打てる（この手番は王を取れない）',
  continuesTurn: true,
  prompt: '押し戻す相手の駒を選んでください',
  targetSets(s, side) {
    return piecesOf(s, opponent(side))
      .filter(({ sq, p }) => {
        const to = pushDest(p, sq);
        return onBoard(to) && !s.board[idx(to)];
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
  id: 'irekae', name: '入れ替えの術', kind: 'magic', cost: 1, fx: 'irekae',
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

export const RAKURAI_REACH = 3; // 落雷を受けた飛車・角が滑って進めるマスの数

export const rakurai: CardDef = {
  id: 'rakurai', name: '落雷', kind: 'magic', cost: 4, fx: 'rakurai',
  text: '相手の王以外の駒1つに雷を落とす。飛車・角（竜・馬も）でなければ壊し、まわり8マスの駒（自分の駒も）は、使った人の次の手番が終わるまで痺れて動けない。飛車・角なら壊さず、対局の終わりまで滑って進めるのは3マスまでになる',
  prompt: '雷を落とす相手の駒を選んでください',
  targetSets(s, side) {
    return piecesOf(s, opponent(side))
      .filter(({ p }) => p.kind !== 'OU')
      .map(({ sq }) => [sq]);
  },
  resolve(ctx, [sq]) {
    const s = ctx.state;
    const p = s.board[idx(sq)]!;
    if (p.kind === 'HI' || p.kind === 'KA') {
      // 飛車・角（竜・馬も）：壊さず、滑るのを3マスまでに（成っても続く）
      p.reach = RAKURAI_REACH;
      ctx.emit({ type: 'reachLimited', pieceId: p.id, at: sq });
      return;
    }
    ctx.destroy(sq, 'rakurai');
    // まわり8マスの駒が痺れる。使った側の駒は、この手番の終わりで1減るぶん1つ多く
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dc && !dr) continue;
        const n = { c: sq.c + dc, r: sq.r + dr };
        if (!onBoard(n)) continue;
        const q = s.board[idx(n)];
        if (!q) continue;
        q.numb = Math.max(q.numb ?? 0, q.side === ctx.side ? 2 : 1);
        ctx.emit({ type: 'numbed', pieceId: q.id, at: n });
      }
    }
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
  id: 'kakuotoshi', name: '格落とし', kind: 'magic', cost: 2, fx: 'kakuotoshi',
  text: '相手の成った駒1つを、成る前の駒に戻す。戻した駒は対局の終わりまで成れない。纏札は残る。戻すと行き所のない駒や二歩になる駒は選べない',
  prompt: '成りを戻す相手の駒を選んでください',
  targetSets(s, side) {
    return piecesOf(s, opponent(side))
      .filter(({ sq, p }) => p.promoted
        && !mustPromote(p.kind, p.side, sq)
        && !(p.kind === 'FU' && hasPawnInColumn(s, p.side, sq.c, sq)))
      .map(({ sq }) => [sq]);
  },
  resolve(ctx, [sq]) {
    const p = ctx.state.board[idx(sq)]!;
    p.promoted = false;
    p.sealed = true; // 成り封じと同じく、もう成れない
    ctx.emit({ type: 'demoted', pieceId: p.id, at: sq });
  },
};

// 成り上がりが強くなる手（両者合わせての手数）。この手から飛車・角も選べて、2つまで成らせる
export const SHORYU_POWER_MOVE = 50;

/** 成り上がりが強くなるまで、あと何手か（0 なら強くなっている）。s.ply は指し終えた手の数 */
export function shoryuWait(s: GameState): number {
  return Math.max(0, SHORYU_POWER_MOVE - (s.ply + 1));
}

export const shoryu: CardDef = {
  id: 'shoryu', name: '成り上がり', kind: 'magic', cost: 2, fx: 'shoryu',
  text: `自分の歩・香車・桂馬・銀1つを、どこにいてもその場で成らせる。${SHORYU_POWER_MOVE}手目からは飛車・角も選べて、2つまで成らせる。成った駒・成り封じを受けた駒は選べない。相手の成り封じは発動する`,
  prompt: '成らせる自分の駒を選んでください',
  targetSets(s, side) {
    const powered = shoryuWait(s) === 0;
    const cands = piecesOf(s, side)
      .filter(({ p }) => !p.promoted && !p.sealed
        && (p.kind === 'FU' || p.kind === 'KY' || p.kind === 'KE' || p.kind === 'GI'
          || (powered && (p.kind === 'HI' || p.kind === 'KA'))))
      .map(({ sq }) => sq);
    const sets = cands.map(sq => [sq]);
    if (powered) {
      for (let i = 0; i < cands.length; i++) {
        for (let j = i + 1; j < cands.length; j++) sets.push([cands[i], cands[j]]);
      }
    }
    return sets;
  },
  resolve(ctx, targets) {
    for (const sq of targets) ctx.promoteInPlace(sq);
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
