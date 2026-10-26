// 定跡：師範・傾奇者が序盤に組む「自分の駒の組み方の手順」（相手の手には合わせない）。
// 手順の各手は 駒の種類・元のマス・行き先（将棋の書き方、先手の向き。'77' は7筋7段）。後手は盤を180度回して使う。
// 済んだかどうかは盤を見て決める（元のマスにその駒が無い＝動いた・取られた、または行き先にもう居る）。
// 前から続けて済んでいる手の数（進み具合）がいちばん多い定跡を選び、同じなら種で決める。
// 各定跡は最初の2手のうちに他と分かれるので、1手指せばそのあと同じ定跡が続く
import { legalActions } from '../rules/game';
import type { Action, GameState, PieceKind, Side, Square } from '../rules/types';

export interface JosekiStep { kind: PieceKind; from: string; to: string }
export interface Joseki { name: string; steps: JosekiStep[] }

const S = (kind: PieceKind, from: string, to: string): JosekiStep => ({ kind, from, to });

export const JOSEKI: Joseki[] = [
  {
    name: '矢倉',
    steps: [
      S('FU', '77', '76'), S('FU', '67', '66'), S('GI', '79', '68'), S('GI', '68', '77'), S('KI', '69', '78'),
      S('KI', '49', '58'), S('KI', '58', '67'), S('OU', '59', '69'), S('OU', '69', '79'), S('FU', '27', '26'), S('FU', '26', '25'),
    ],
  },
  {
    name: '棒銀',
    steps: [
      S('FU', '27', '26'), S('FU', '26', '25'), S('FU', '77', '76'), S('GI', '39', '38'), S('GI', '38', '27'),
      S('OU', '59', '68'), S('OU', '68', '78'), S('KI', '49', '58'), S('GI', '27', '26'),
    ],
  },
  {
    name: '四間飛車',
    steps: [
      S('FU', '67', '66'), S('HI', '28', '68'), S('FU', '77', '76'), S('OU', '59', '48'), S('OU', '48', '38'),
      S('OU', '38', '28'), S('GI', '39', '38'), S('KI', '69', '58'), S('FU', '17', '16'), S('FU', '47', '46'),
    ],
  },
];

export const JOSEKI_LAST_PLY = 40; // これを過ぎたら定跡は使わない

// 将棋の書き方のマス（先手の向き）を、side から見た盤のマスにする
function sq(code: string, side: Side): Square {
  const file = Number(code[0]), rank = Number(code[1]);
  const c = 9 - file, r = rank - 1;
  return side === 'sente' ? { c, r } : { c: 8 - c, r: 8 - r };
}

function has(s: GameState, at: Square, kind: PieceKind, side: Side): boolean {
  const p = s.board[at.r * 9 + at.c];
  return !!p && p.side === side && p.kind === kind && !p.promoted;
}

// その手は済んだか（元のマスにもう居ない、または行き先に居る）
function done(s: GameState, side: Side, st: JosekiStep): boolean {
  return !has(s, sq(st.from, side), st.kind, side) || has(s, sq(st.to, side), st.kind, side);
}

// 前から続けて済んでいる手の数
function progress(s: GameState, side: Side, j: Joseki): number {
  let n = 0;
  while (n < j.steps.length && done(s, side, j.steps[n])) n++;
  return n;
}

/** 勧める手：いちばん進んでいる定跡の、まだの手のうち今指せる最初の1手（成らない移動）。無ければ null */
export function josekiMove(s: GameState, side: Side, seed: number): { name: string; action: Action } | null {
  if (s.ply > JOSEKI_LAST_PLY || s.turn !== side || s.result) return null;
  const all = JOSEKI.map(j => ({ j, n: progress(s, side, j) }));
  // どれか1本を指しきったら、そこで定跡は終わり（ほかの定跡の残りは指さない）
  if (all.some(x => x.n === x.j.steps.length)) return null;
  const scored = all;
  const best = Math.max(...scored.map(x => x.n));
  const tied = scored.filter(x => x.n === best);
  const { j } = tied[Math.abs(seed) % tied.length];
  const legal = legalActions(s);
  for (const st of j.steps) {
    if (done(s, side, st)) continue;
    const from = sq(st.from, side), to = sq(st.to, side);
    const a = legal.find(x => x.type === 'move' && !x.second && !x.promote
      && x.from.c === from.c && x.from.r === from.r && x.to.c === to.c && x.to.r === to.r);
    if (a) return { name: j.name, action: a };
  }
  return null;
}
