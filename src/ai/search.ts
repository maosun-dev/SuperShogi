// CPU の先読み：ネガマックス＋アルファベータ、駒を取る手だけの延長読み、時間切れでの打ち切り
import { applyActionUnchecked, legalActions } from '../rules/game';
import { idx } from '../rules/board';
import type { Action, GameState, PieceKind, Side } from '../rules/types';
import { evaluate, PIECE_VALUE } from './evaluate';
import { makeRng } from './random';

export interface SearchOptions {
  maxDepth: number;      // 読む深さの上限（手番1回＝1）
  timeLimitMs: number;   // これを過ぎたら、読み終えたいちばん深い結果を返す
  qDepth: number;        // 深さ0のあと、駒を取る手だけで延長して読む回数
  cardPlies: number;     // 根から何手目までカードの行動を候補に入れるか
  cardWidth: number;     // 候補に入れるカードの行動の数の上限
  noise: number;         // 末端の点数に混ぜるゆらぎの幅（±noise）
  seed: number;
  now?: () => number;    // 既定は Date.now（テストで差し替える）
}
export interface SearchResult { action: Action; score: number; depth: number; nodes: number }

export const WIN = 1_000_000;

const CHECK_EVERY = 16;           // 何局面ごとに時計を見るか
const KING_VICTIM = 100_000;      // 並べ替え用：王を取る手は最優先（取れば勝ち）

// 時間切れで読みを打ち切るための合図
class TimeUp extends Error {}

// 候補の行動。カードは絞り込みのために一度適用しているので、その結果を使い回す
interface Cand { a: Action; child?: GameState; order: number }

function victimValue(kind: PieceKind): number {
  return kind === 'OU' ? KING_VICTIM : PIECE_VALUE[kind];
}

function sameAction(a: Action, b: Action): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// side は CPU が受け持つ側。view はその側の viewFor の結果で、手番も side であること
export function search(view: GameState, side: Side, opts: SearchOptions): SearchResult {
  const now = opts.now ?? Date.now;
  const start = now();
  if (view.result) throw new Error('対局はもう終わっています');
  if (view.turn !== side) throw new Error('CPU の手番ではありません');
  const root: GameState = { ...view, seen: {} }; // 読みの中では千日手を考えない
  const rootActions = legalActions(root);
  if (rootActions.length === 0) throw new Error('指せる行動がありません');
  if (rootActions.length === 1) {
    return { action: rootActions[0], score: evaluate(root, root.turn), depth: 0, nodes: 0 };
  }

  const rng = makeRng(opts.seed);
  let nodes = 0;
  let canStop = false; // 根の候補を1つも読み終えるまでは打ち切らない（必ず手を返すため）

  // 局面を1つ数え、256局面ごとに時計を見る
  function tick(): void {
    nodes++;
    if (canStop && nodes % CHECK_EVERY === 0 && now() - start >= opts.timeLimitMs) throw new TimeUp();
  }

  function leaf(s: GameState): number {
    return evaluate(s, s.turn) + (rng() * 2 - 1) * opts.noise;
  }

  // 終局の点数（その局面の手番から見る）。早く勝つ・遅く負ける手を選ぶため、根からの手数を引く
  function terminal(s: GameState, ply: number): number {
    const r = s.result!;
    if (r.winner === null) return 0;
    return r.winner === s.turn ? WIN - ply : -(WIN - ply);
  }

  // 子の局面の点数を、親の手番から見た値にする。手番が変わらなかったら符号も窓もそのまま
  function childScore(
    parent: GameState, child: GameState, alpha: number, beta: number,
    next: (c: GameState, alpha: number, beta: number) => number,
  ): number {
    if (child.turn === parent.turn) return next(child, alpha, beta);
    return -next(child, -beta, -alpha);
  }

  // 行動の並べ替えの順位（小さいほど先）
  function orderKey(s: GameState, a: Action): number {
    if (a.type === 'move') {
      const victim = s.board[idx(a.to)];
      if (victim && victim.side !== s.turn) {
        const mover = s.board[idx(a.from)]!;
        // 取る手：取られる駒の価値の大きい順、同じなら動かす駒の価値の小さい順
        return -1_000_000_000 - victimValue(victim.kind) * 1000 + victimValue(mover.kind) / 1000;
      }
      if (a.promote || a.second?.promote) return 1;
      return 3;
    }
    if (a.type === 'card') return 2;
    return 3;
  }

  function candidates(s: GameState, ply: number): Cand[] {
    const all = ply === 0 ? rootActions : legalActions(s);
    const out: Cand[] = [];
    const cards: { a: Action; child: GameState; score: number }[] = [];
    const useCards = ply < opts.cardPlies;
    for (const a of all) {
      if (a.type === 'card') {
        if (!useCards) continue;
        const child = applyActionUnchecked(s, a).state;
        cards.push({ a, child, score: evaluate(child, s.turn) });
      } else {
        out.push({ a, order: orderKey(s, a) });
      }
    }
    if (cards.length > 0) {
      cards.sort((x, y) => y.score - x.score);
      for (const c of cards.slice(0, opts.cardWidth)) out.push({ a: c.a, child: c.child, order: 2 });
    }
    // 同じ順位の中では元の並びを保つ（安定な並べ替え）
    out.sort((x, y) => x.order - y.order);
    return out;
  }

  // 延長読み：そのまま止まる点数を下限にして、相手の駒のマスへ動く手だけを読む
  function quiesce(s: GameState, qd: number, alpha: number, beta: number, ply: number): number {
    tick();
    if (s.result) return terminal(s, ply);
    const stand = leaf(s);
    if (qd <= 0 || stand >= beta) return stand;
    let best = stand;
    if (stand > alpha) alpha = stand;
    const caps: Cand[] = [];
    for (const a of legalActions(s)) {
      if (a.type !== 'move' || a.second) continue;
      const t = s.board[idx(a.to)];
      if (!t || t.side === s.turn) continue;
      caps.push({ a, order: orderKey(s, a) });
    }
    caps.sort((x, y) => x.order - y.order);
    for (const c of caps) {
      const child = applyActionUnchecked(s, c.a).state;
      const v = childScore(s, child, alpha, beta, (n, al, be) => quiesce(n, qd - 1, al, be, ply + 1));
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  }

  function negamax(s: GameState, depth: number, alpha: number, beta: number, ply: number): number {
    if (depth <= 0) return quiesce(s, opts.qDepth, alpha, beta, ply);
    tick();
    if (s.result) return terminal(s, ply);
    const cands = candidates(s, ply);
    if (cands.length === 0) return leaf(s);
    let best = -Infinity;
    for (const c of cands) {
      const child = c.child ?? applyActionUnchecked(s, c.a).state;
      const v = childScore(s, child, alpha, beta, (n, al, be) => negamax(n, depth - 1, al, be, ply + 1));
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  }

  let partial = null as { action: Action; score: number } | null; // 深さ1の途中結果

  // 根：前の深さで一番だった手を先頭にして、すべての候補を読む
  function rootSearch(depth: number, prevBest: Action | null): { action: Action; score: number } {
    tick();
    const cands = candidates(root, 0);
    if (prevBest) {
      const i = cands.findIndex(c => sameAction(c.a, prevBest));
      if (i > 0) cands.unshift(...cands.splice(i, 1));
    }
    let alpha = -Infinity;
    let bestAction = cands[0].a;
    let bestScore = -Infinity;
    partial = null;
    for (const c of cands) {
      const child = c.child ?? applyActionUnchecked(root, c.a).state;
      const v = childScore(root, child, alpha, Infinity, (n, al, be) => negamax(n, depth - 1, al, be, 1));
      if (v > bestScore) {
        bestScore = v;
        bestAction = c.a;
      }
      if (v > alpha) alpha = v;
      // 深さ1は、読み終えた候補までの結果を、時間切れのときの答えにする
      if (depth === 1) {
        partial = { action: bestAction, score: bestScore };
        canStop = true;
        // 局面数が少なくても、候補を1つ読むごとに時計を見る
        if (now() - start >= opts.timeLimitMs) throw new TimeUp();
      }
    }
    return { action: bestAction, score: bestScore };
  }

  let result: SearchResult | null = null;
  for (let depth = 1; depth <= opts.maxDepth; depth++) {
    if (result && now() - start >= opts.timeLimitMs) break;
    try {
      const r = rootSearch(depth, result?.action ?? null);
      result = { action: r.action, score: r.score, depth, nodes };
    } catch (e) {
      if (e instanceof TimeUp) {
        // 深さ1の途中で止まったら、読み終えた候補の中でいちばんよい手を返す。深さ2以上は前の深さの結果を使う
        const p = partial as { action: Action; score: number } | null;
        if (depth === 1 && p) result = { action: p.action, score: p.score, depth: 1, nodes };
        break;
      }
      throw e;
    }
    canStop = true;
  }
  result!.nodes = nodes;
  return result!;
}
