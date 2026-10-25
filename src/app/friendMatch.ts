// 友との対局の進行役：本当の局面は Session の記録から作り、自分の席から見た形にして演出役に渡す（DOM なし）。
// 後手の席では、見せる形を180度回す（自分はいつも手前の先手として見える）。
// 相手の手は届いた順に並べ、演出が終わるたびに1つずつ当てはめる
import type { Action, GameEvent, GameState, Result, Side } from '../rules/types';
import { applyAction, legalActions } from '../rules/game';
import { filterEventsFor, viewFor } from '../rules/view';
import type { Match, MatchPhase, Presenter } from './match';
import type { Session } from '../net/session';
import { buildState } from '../net/record';
import { fingerprint } from '../net/fingerprint';
import { mirrorAction, mirrorEvents, mirrorResult, mirrorSide, mirrorState } from '../net/mirror';

// phase の 'cpu' は「相手の番」の意味で使う
export interface FriendMatch extends Match {
  resign(): Result;   // 投了する。自分から見た結果（いつも自分＝先手の負け）を返す
}

export function createFriendMatch(opts: {
  session: Session; presenter: Presenter;
  onOver(r: Result): void;   // 決着（自分から見た形）。相手の投了もここ
  onDesync(): void;          // 2台の盤面が食い違った
  onRewind(): void;          // 待ったで盤面が戻った（画面は描き直す）
  onTurn?(): void;           // 手番が決まった（相手の手の演出のあとに自分の番が来た、など）
}): FriendMatch {
  const { session, presenter } = opts;
  const setup = session.setup();
  if (!setup) throw new Error('対局が始まっていません');
  const me: Side = session.seat();
  const flip = me === 'gote';
  const toMeState = (s: GameState): GameState => (flip ? mirrorState(s) : s);
  const toMeEvents = (es: GameEvent[]): GameEvent[] => (flip ? mirrorEvents(es) : es);
  const turnAction = (a: Action): Action => (flip ? mirrorAction(a) : a);
  const toMeSide = (s: Side): Side => (flip ? mirrorSide(s) : s);

  let real: GameState = buildState(setup, session.log());
  let phase: MatchPhase = 'cpu';
  let gen = 0;          // 待ったで作り直すたびに進める（古い演出のあとの続きを捨てる）
  let draining: number | null = null; // 並びを処理している世代（古い世代の処理が新しい処理の印を消さないように）
  let overSent = false;
  const queue: { action: Action; fp: string | null }[] = [];

  const view = (): GameState => toMeState(viewFor(real, me));
  const disposed = (): boolean => phase === 'disposed';

  function over(r: Result): void {
    phase = 'over';
    if (overSent) return;
    overSent = true;
    opts.onOver(r);
  }

  // 局面に合わせて手番を決める（決着なら知らせる）
  function settle(): void {
    if (disposed() || phase === 'over') return;
    if (real.result) { over(flip ? mirrorResult(real.result) : real.result); return; }
    phase = real.turn === me ? 'human' : 'cpu';
    opts.onTurn?.();
  }

  async function applyAndPresent(a: Action): Promise<void> {
    const before = view();
    const actor = real.turn;
    const out = applyAction(real, a);
    real = out.state;
    phase = 'presenting';
    await presenter.present({ actor: toMeSide(actor), events: toMeEvents(filterEventsFor(out.events, me)), before, after: view() });
  }

  // 届いた相手の手を順に当てはめて演出する
  async function drain(): Promise<void> {
    if (draining === gen) return;
    const g = gen;
    draining = g;
    try {
      while (queue.length && g === gen && !disposed() && phase !== 'over') {
        const { action, fp } = queue.shift()!;
        try {
          await applyAndPresent(action);
        } catch (e) {
          console.error('相手の手を当てはめられませんでした', e);
          phase = 'over';
          opts.onDesync();
          return;
        }
        if (g !== gen || disposed()) return;
        if (fp && fingerprint(real) !== fp) { phase = 'over'; opts.onDesync(); return; }
        settle();
      }
    } finally {
      if (draining === g) draining = null;
    }
    if (g === gen) settle();
  }

  const unlisten = session.on((e) => {
    if (disposed()) return;
    switch (e.type) {
      case 'act':
        queue.push({ action: e.action, fp: e.fp });
        void drain();
        return;
      case 'rewind':
        gen++;
        queue.length = 0;
        real = buildState(setup, session.log());
        if (phase !== 'over') phase = 'cpu';
        settle();
        opts.onRewind();
        return;
      case 'resign':
        if (e.seat !== me) over({ winner: 'sente', reason: 'resign' }); // 相手の投了＝自分（手前の先手）の勝ち
        return;
    }
  });

  return {
    view,
    legal: () => (phase === 'human' ? legalActions(viewFor(real, me)).map(turnAction) : []),
    phase: () => phase,
    result: () => (real.result ? (flip ? mirrorResult(real.result) : real.result) : null),
    async start() {
      settle();
      await drain();
    },
    async submit(a) {
      if (phase !== 'human') return;
      const ra = turnAction(a); // 本当の盤面の向きへ戻す（回すのは2回で元どおり）
      const after = applyAction(real, ra).state; // 通らない手はここで例外
      session.sendAct(ra, fingerprint(after));
      const g = gen;
      await applyAndPresent(ra);
      if (g !== gen || disposed()) return;
      settle();
      await drain();
    },
    resign() {
      session.resign();
      phase = 'over';
      overSent = true; // 投了は画面が自分で結果画面へ運ぶ
      return { winner: 'gote', reason: 'resign' };
    },
    dispose() {
      phase = 'disposed';
      gen++;
      queue.length = 0;
      unlisten();
    },
  };
}
