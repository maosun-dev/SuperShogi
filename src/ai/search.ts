// CPU の先読み：ネガマックス＋アルファベータ、駒を取る手の延長読み、時間切れでの打ち切り。
// 読んだ局面を覚える表・良い手から読む並べ替え・王手の延長・札の候補の絞り込みで、速く深く読む。
// 決めごと：同じ局面・同じ種なら同じ手を返す。
// ただし時間いっぱいまで読む局面では、どの深さまで読み終えるかが機械の速さで変わるので、同じ種でも手が変わりうる
import { applyActionUnchecked, legalActions, moveActions } from '../rules/game';
import { HAND_KINDS, idx, opponent, positionKey, sameSq, sqOf } from '../rules/board';
import { dropTargets, isInCheck, pieceTargets } from '../rules/moves';
import type { Action, GameState, PieceKind, Side } from '../rules/types';
import { evaluate, PIECE_VALUE } from './evaluate';
import { cardHints } from './cardHints';
import { makeRng } from './random';

export interface SearchOptions {
  maxDepth: number;      // 読む深さの上限（手番1回＝1）
  timeLimitMs: number;   // これを過ぎたら、読み終えたいちばん深い結果を返す
  qDepth: number;        // 深さ0のあと、駒を取る手だけで延長して読む回数
  cardPlies: number;     // 根から何手目までカードの行動を候補に入れるか
  cardWidth: number;     // 候補に入れるカードの行動の数の上限
  noise: number;         // 末端の点数に混ぜるゆらぎの幅（±noise）
  maxNodes?: number;     // 調べた局面数がこれに達したら、時間切れと同じく打ち切る（無ければ上限なし）
  seed: number;
  now?: () => number;    // 既定は Date.now（テストで差し替える）
}
export interface SearchResult { action: Action; score: number; depth: number; nodes: number }

export const WIN = 1_000_000;

const CHECK_EVERY = 16;           // 何局面ごとに時計を見るか
const KING_VICTIM = 100_000;      // 並べ替え用：王を取る手は最優先（取れば勝ち）
const EXTEND_MORE = 2;            // 王手の延長は、根から maxDepth + これ まで
const CONTEMPT = 150;             // 同じ局面に戻る（千日手へ向かう）のは、CPU の側から見て少し損とする
const DROP_NEAR_FOE = 2;          // 根より下では、相手の王からこのマス数以内に打つ手だけ読む
const DROP_NEAR_ME = 1;           // …または自分の王の隣
export const CARD_CANDIDATES_PER_CARD = 3; // 1枚のカードから候補に残す行動の数の上限

// 読みの中の適用：王手の知らせは使わないので作らない
const QUIET = { quiet: true };

// 時間切れで読みを打ち切るための合図
class TimeUp extends Error {}

// 候補の行動。カードは絞り込みのために一度適用しているので、その結果を使い回す
interface Cand { a: Action; key: string; child?: GameState; order: number }

// 覚えておく局面：深さ・点数・点数の種類（ちょうど／下限／上限）・いちばん良かった手
const EXACT = 0, LOWER = 1, UPPER = 2;
interface TTEntry { depth: number; score: number; flag: number; best: string | null }

// 王手をかけている遠くの駒と王の間の空きマス（合い駒を打てる所）。王の位置を i で
function blockSquares(s: GameState, side: Side): Set<number> {
  const out = new Set<number>();
  const k = s.board.findIndex(p => p !== null && p.side === side && p.kind === 'OU');
  if (k < 0) return out;
  const king = sqOf(k);
  for (let dc = -1; dc <= 1; dc++) {
    for (let dr = -1; dr <= 1; dr++) {
      if (!dc && !dr) continue;
      const between: number[] = [];
      let c = king.c + dc, r = king.r + dr;
      while (c >= 0 && c < 9 && r >= 0 && r < 9) {
        const p = s.board[r * 9 + c];
        if (p) {
          if (p.side === opponent(side) && between.length > 0
            && pieceTargets(s, { c, r }).some(t => sameSq(t, king))) for (const i of between) out.add(i);
          break;
        }
        between.push(r * 9 + c);
        c += dc; r += dr;
      }
    }
  }
  return out;
}

function victimValue(kind: PieceKind): number {
  return kind === 'OU' ? KING_VICTIM : PIECE_VALUE[kind];
}

// 行動を見分ける短い文字列
export function actionKey(a: Action): string {
  if (a.type === 'move') {
    const sec = a.second ? `>${a.second.to.c}${a.second.to.r}${a.second.promote ? '+' : ''}` : '';
    return `m${a.from.c}${a.from.r}${a.to.c}${a.to.r}${a.promote ? '+' : ''}${sec}`;
  }
  if (a.type === 'drop') return `d${a.kind}${a.to.c}${a.to.r}`;
  return `c${a.uid}:${a.targets.map(t => `${t.c}${t.r}`).join(',')}:${a.pick ?? ''}`;
}

export interface CardCand { a: Action; child: GameState; score: number }

// 同点のときの順位：対象の先頭マスにある駒の価値（対象のないカード・空きマスは0）
function targetValue(s: GameState, a: Action): number {
  if (a.type !== 'card' || a.targets.length === 0) return 0;
  const p = s.board[idx(a.targets[0])];
  return p ? PIECE_VALUE[p.kind] : 0;
}

// カードの行動を1回ずつ適用して点数を付け、よい順に選ぶ。
// 点数が同じなら価値の高い駒を対象にした方を先にする（装備がいつも盤の順の最初の駒に付かないように）。
// 1枚のカードからは CARD_CANDIDATES_PER_CARD 個までにして、他のカードが枠から締め出されないようにする
export function cardCandidates(s: GameState, actions: Action[], cardWidth: number): CardCand[] {
  const cards: (CardCand & { tie: number; uid: number })[] = [];
  for (const a of actions) {
    if (a.type !== 'card') continue;
    const child = applyActionUnchecked(s, a, QUIET).state;
    cards.push({ a, child, score: evaluate(child, s.turn), tie: targetValue(s, a), uid: a.uid });
  }
  cards.sort((x, y) => y.score - x.score || y.tie - x.tie);
  const perCard = new Map<number, number>();
  const out: CardCand[] = [];
  for (const c of cards) {
    if (out.length >= cardWidth) break;
    const n = perCard.get(c.uid) ?? 0;
    if (n >= CARD_CANDIDATES_PER_CARD) continue;
    perCard.set(c.uid, n + 1);
    out.push({ a: c.a, child: c.child, score: c.score });
  }
  return out;
}

// side は CPU が受け持つ側。view はその側の viewFor の結果で、手番も side であること
export function search(view: GameState, side: Side, opts: SearchOptions): SearchResult {
  const now = opts.now ?? Date.now;
  const start = now();
  if (view.result) throw new Error('対局はもう終わっています');
  if (view.turn !== side) throw new Error('CPU の手番ではありません');
  // 対局でこれまでに出た局面。読みの中で同じ局面に戻ったら引き分けの点数にする（千日手を避けるため）
  const history = view.seen;
  const root: GameState = { ...view, seen: {} };
  const rootActions = legalActions(root);
  if (rootActions.length === 0) throw new Error('指せる行動がありません');
  if (rootActions.length === 1) {
    return { action: rootActions[0], score: evaluate(root, root.turn), depth: 0, nodes: 0 };
  }

  const rng = makeRng(opts.seed);
  const tt = new Map<string, TTEntry>();
  const killers: string[][] = [];
  let nodes = 0;
  // 根の候補を1つ読み終えるまでは、時間の2倍まで待つ（それでも終わらなければ、並べ替えで先頭の手を返す）
  let canStop = false;
  let maxPly = opts.maxDepth + EXTEND_MORE;

  // 局面を1つ数え、CHECK_EVERY 局面ごとに時計を見る
  function tick(): void {
    nodes++;
    if (nodes % CHECK_EVERY === 0 && outOfBudget(canStop ? 1 : 2)) throw new TimeUp();
  }

  // 時間か読む量の上限を過ぎたか。根の候補を1つ読み終えるまでは、どちらも scale 倍まで待つ
  const maxNodes = opts.maxNodes ?? Infinity;
  function outOfBudget(scale: number): boolean {
    return now() - start >= opts.timeLimitMs * scale || nodes >= maxNodes * scale;
  }

  const path = new Set<string>(); // 根からいまの局面までに通った局面

  // 同じ局面に戻ったときの点数（その局面の手番から見る）
  function drawScore(s: GameState): number {
    return s.turn === side ? -CONTEMPT : CONTEMPT;
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
  function orderKey(s: GameState, a: Action, key: string, best: string | null, ply: number): number {
    if (key === best) return -2_000_000_000;
    if (a.type === 'move') {
      const victim = s.board[idx(a.to)];
      if (victim && victim.side !== s.turn) {
        const mover = s.board[idx(a.from)]!;
        // 取る手：取られる駒の価値の大きい順、同じなら動かす駒の価値の小さい順
        return -1_000_000_000 - victimValue(victim.kind) * 1000 + victimValue(mover.kind) / 1000;
      }
      const k = killers[ply];
      if (k && (k[0] === key || k[1] === key)) return 0;
      if (a.promote || a.second?.promote) return 1;
      return 3;
    }
    if (a.type === 'card') return 2;
    return 3;
  }

  function kingAt(s: GameState, side: Side): { c: number; r: number } | null {
    const k = s.board.findIndex(p => p !== null && p.side === side && p.kind === 'OU');
    return k < 0 ? null : sqOf(k);
  }

  function candidates(s: GameState, ply: number, best: string | null): Cand[] {
    const all = ply === 0 ? rootActions : legalActions(s);
    const out: Cand[] = [];
    // 根より下では、打つ手は王の近くだけ（持ち駒が多いと手の数が膨らむため）
    const foeK = ply > 0 ? kingAt(s, opponent(s.turn)) : null;
    const myK = ply > 0 ? kingAt(s, s.turn) : null;
    const near = (to: { c: number; r: number }, k: { c: number; r: number } | null, n: number): boolean =>
      !!k && Math.max(Math.abs(to.c - k.c), Math.abs(to.r - k.r)) <= n;
    for (const a of all) {
      if (a.type === 'card') continue;
      if (ply > 0 && a.type === 'drop' && !near(a.to, foeK, DROP_NEAR_FOE) && !near(a.to, myK, DROP_NEAR_ME)) continue;
      const key = actionKey(a);
      out.push({ a, key, order: orderKey(s, a, key, best, ply) });
    }
    if (ply < opts.cardPlies) {
      for (const c of cardCandidates(s, cardHints(s, all), opts.cardWidth)) {
        const key = actionKey(c.a);
        out.push({ a: c.a, key, child: c.child, order: key === best ? -2_000_000_000 : 2 });
      }
    }
    // 同じ順位の中では元の並びを保つ（安定な並べ替え）
    out.sort((x, y) => x.order - y.order);
    return out;
  }

  function remember(key: string, depth: number, score: number, alpha0: number, beta: number, best: string | null): void {
    const flag = score <= alpha0 ? UPPER : score >= beta ? LOWER : EXACT;
    const old = tt.get(key);
    if (!old || old.depth <= depth) tt.set(key, { depth, score, flag, best });
  }

  function killer(ply: number, key: string): void {
    const k = killers[ply] ?? (killers[ply] = []);
    if (k[0] !== key) { k[1] = k[0]; k[0] = key; }
  }

  // 延長読み：そのまま止まる点数を下限にして、相手の駒のマスへ動く手だけを読む。
  // 王手をかけられている側は止まれないので、すべての動かす手・打つ手を読む
  function quiesce(s: GameState, qd: number, alpha: number, beta: number, ply: number): number {
    tick();
    if (s.result) return terminal(s, ply);
    // 王手を逃げる手まで読むのは、延長読みの最初の2段だけ（王手の連続で手が膨らむため）
    if (qd > 0 && qd >= opts.qDepth - 1 && isInCheck(s, s.turn)) {
      let best = -Infinity;
      const evasions: Cand[] = [];
      // 合い駒は、いちばん安い持ち駒を、王手の筋の間に打つ手だけ
      const hand = s.players[s.turn].hand;
      const cheapest = [...HAND_KINDS].reverse().find(k => hand[k] > 0);
      const acts = moveActions(s);
      if (cheapest) {
        const blocks = blockSquares(s, s.turn);
        for (const to of dropTargets(s, s.turn, cheapest)) {
          if (blocks.has(idx(to))) acts.push({ type: 'drop', kind: cheapest, to });
        }
      }
      for (const a of acts) {
        if (a.type === 'move' && a.second) continue;
        const key = actionKey(a);
        evasions.push({ a, key, order: orderKey(s, a, key, null, ply) });
      }
      evasions.sort((x, y) => x.order - y.order);
      for (const c of evasions) {
        const child = applyActionUnchecked(s, c.a, QUIET).state;
        const v = childScore(s, child, alpha, beta, (n, al, be) => quiesce(n, qd - 1, al, be, ply + 1));
        if (v > best) best = v;
        if (v > alpha) alpha = v;
        if (alpha >= beta) break;
      }
      return best === -Infinity ? leaf(s) : best;
    }
    const stand = leaf(s);
    if (qd <= 0 || stand >= beta) return stand;
    let best = stand;
    if (stand > alpha) alpha = stand;
    const caps: Cand[] = [];
    for (const a of moveActions(s)) {
      if (a.type !== 'move' || a.second) continue;
      const t = s.board[idx(a.to)];
      if (!t || t.side === s.turn) continue;
      caps.push({ a, key: '', order: orderKey(s, a, '', null, ply) });
    }
    caps.sort((x, y) => x.order - y.order);
    for (const c of caps) {
      const child = applyActionUnchecked(s, c.a, QUIET).state;
      const v = childScore(s, child, alpha, beta, (n, al, be) => quiesce(n, qd - 1, al, be, ply + 1));
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  }

  // 子の深さ：深さ0になる子が王手をかけられていたら、1手延長する
  function childDepth(s: GameState, child: GameState, depth: number, ply: number): number {
    const d = depth - 1;
    if (d > 0 || ply + 1 >= maxPly || child.result || child.turn === s.turn) return d;
    return isInCheck(child, child.turn) ? 1 : d;
  }

  function negamax(s: GameState, depth: number, alpha: number, beta: number, ply: number): number {
    if (depth <= 0) return quiesce(s, opts.qDepth, alpha, beta, ply);
    tick();
    if (s.result) return terminal(s, ply);
    const key = positionKey(s);
    if (path.has(key) || (history[key] ?? 0) > 0) return drawScore(s);
    const hit = tt.get(key);
    if (hit && hit.depth >= depth) {
      if (hit.flag === EXACT) return hit.score;
      if (hit.flag === LOWER && hit.score >= beta) return hit.score;
      if (hit.flag === UPPER && hit.score <= alpha) return hit.score;
    }
    const cands = candidates(s, ply, hit?.best ?? null);
    if (cands.length === 0) return leaf(s);
    const alpha0 = alpha;
    let best = -Infinity;
    let bestKey: string | null = null;
    path.add(key);
    try {
      for (const c of cands) {
        const child = c.child ?? applyActionUnchecked(s, c.a, QUIET).state;
        const d = childDepth(s, child, depth, ply);
        const v = childScore(s, child, alpha, beta, (n, al, be) => negamax(n, d, al, be, ply + 1));
        if (v > best) { best = v; bestKey = c.key; }
        if (v > alpha) alpha = v;
        if (alpha >= beta) {
          if (c.a.type === 'move' && !s.board[idx(c.a.to)]) killer(ply, c.key);
          break;
        }
      }
    } finally {
      path.delete(key);
    }
    remember(key, depth, best, alpha0, beta, bestKey);
    return best;
  }

  let partial = null as { action: Action; score: number } | null; // 深さ1の途中結果

  // 根：前の深さで一番だった手を先頭にして、すべての候補を読む
  function rootSearch(depth: number, prevBest: Action | null): { action: Action; score: number } {
    tick();
    const cands = candidates(root, 0, prevBest ? actionKey(prevBest) : null);
    let alpha = -Infinity;
    let bestAction = cands[0].a;
    let bestScore = -Infinity;
    // 深さ1で1つも読み終えないうちに時間切れになったときの答え（並べ替えで先頭の手）
    partial = depth === 1 ? { action: cands[0].a, score: -Infinity } : null;
    for (const c of cands) {
      const child = c.child ?? applyActionUnchecked(root, c.a, QUIET).state;
      const d = childDepth(root, child, depth, 0);
      const v = childScore(root, child, alpha, Infinity, (n, al, be) => negamax(n, d, al, be, 1));
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
        if (outOfBudget(1)) throw new TimeUp();
      }
    }
    return { action: bestAction, score: bestScore };
  }

  let result: SearchResult | null = null;
  for (let depth = 1; depth <= opts.maxDepth; depth++) {
    if (result && outOfBudget(1)) break;
    maxPly = depth + EXTEND_MORE;
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
    // 勝ちを読み切ったら、それ以上深く読まない
    if (Math.abs(result.score) >= WIN - 100) break;
  }
  result!.nodes = nodes;
  return result!;
}
