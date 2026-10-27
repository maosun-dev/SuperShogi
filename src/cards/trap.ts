// 忍札6枚。伏せる・発動するのはルール本体（game.ts）が trap の指定を見て行う
import type { GameState, Side, Square } from '../rules/types';
import { sameSq, sqOf } from '../rules/board';
import type { CardDef } from './types';

export const TRAP_LIMIT = 3;

function trapRoom(s: GameState, side: Side): boolean {
  return s.traps.filter(t => t.owner === side).length < TRAP_LIMIT;
}

// 空きマス。自分の落とし穴がすでにあるマスは除く（相手の札は見えないので考えない）
function squareTargets(s: GameState, side: Side): Square[][] {
  if (!trapRoom(s, side)) return [];
  const out: Square[][] = [];
  s.board.forEach((p, i) => {
    if (p) return;
    const sq = sqOf(i);
    if (s.traps.some(t => t.owner === side && t.at && sameSq(t.at, sq))) return;
    out.push([sq]);
  });
  return out;
}

function slotTargets(s: GameState, side: Side): Square[][] {
  return trapRoom(s, side) ? [[]] : [];
}

export const otoshiana: CardDef = {
  id: 'otoshiana', name: '落とし穴', kind: 'trap', cost: 2, fx: 'otoshiana',
  text: 'このマスに入った相手の駒を破壊する。王が入ったときは発動せず、札は残る。伏せた手番のうちは発動しない。相手からは場所が見えない',
  prompt: '落とし穴を仕掛けるマスを選んでください',
  targetSets: squareTargets,
  trap: { placement: 'square', trigger: 'enter' },
};

export const itetsuku: CardDef = {
  id: 'itetsuku', name: '凍てつく床', kind: 'trap', cost: 1, fx: 'itetsuku',
  text: 'このマスに入った相手の駒を凍らせる。王は1手番、王以外は2手番動けない。伏せた手番のうちは発動しない。相手からは場所が見えない',
  prompt: '凍てつく床を仕掛けるマスを選んでください',
  targetSets: squareTargets,
  trap: { placement: 'square', trigger: 'enter' },
};

export const kagami: CardDef = {
  id: 'kagami', name: '鏡の結界', kind: 'trap', cost: 3, fx: 'kagami',
  text: '相手がコスト2以上の術札・纏札を使ったとき、その札を打ち消す。打ち消された側も手番は終わる',
  targetSets: slotTargets,
  trap: { placement: 'slot', trigger: 'magic' },
};

export const narifuuji: CardDef = {
  id: 'narifuuji', name: '成り封じ', kind: 'trap', cost: 1, fx: 'narifuuji',
  text: '相手が成ろうとしたとき（成り上がりも含む）、成れなくする。その駒は対局の終わりまで成れない。成らないと行き所がなくなる場合は発動しない',
  targetSets: slotTargets,
  trap: { placement: 'slot', trigger: 'promote' },
};

export const aiuchi: CardDef = {
  id: 'aiuchi', name: '相討ち', kind: 'trap', cost: 3, fx: 'aiuchi',
  text: '相手が自分の駒を取ったとき、取った相手の駒も壊す。取られた駒は相手の持ち駒になる。王で取ったときは発動せず残る',
  targetSets: slotTargets,
  trap: { placement: 'slot', trigger: 'capture' },
};

export const migawari: CardDef = {
  id: 'migawari', name: '身代わり', kind: 'trap', cost: 6, fx: 'migawari',
  text: '相手が自分の王を取ろうとしたとき、王の隣にいる味方のうちいちばん安い駒を代わりに壊し、王はそのマスへ移る。取りに来た駒は動かず、相手の手番は終わる。王の隣に味方がいないときは発動しない',
  targetSets: slotTargets,
  trap: { placement: 'slot', trigger: 'kingCapture' },
};

export const TRAP_CARDS: CardDef[] = [otoshiana, itetsuku, narifuuji, kagami, aiuchi, migawari];
