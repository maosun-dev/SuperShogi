// 対局の進行役：本当の局面を持ち、人間と CPU の行動を順に適用して演出役に渡す（DOM なし）
import type { Action, GameEvent, GameState, Result, Side } from '../rules/types';
import type { CardId } from '../rules/types';
import { applyAction, createGame, legalActions } from '../rules/game';
import { filterEventsFor, viewFor } from '../rules/view';
import { LEVELS, type Level } from '../ai/levels';
import type { CpuClient } from '../ai/client';
import { makeRng } from '../ai/random';

// events・before・after は人間側（先手）から見た形
export interface Step { actor: Side; events: GameEvent[]; before: GameState; after: GameState }
export interface Presenter { present(step: Step): Promise<void> }
export type MatchPhase = 'human' | 'cpu' | 'presenting' | 'over' | 'disposed';

export interface Match {
  view(): GameState;                // 人間側から見た今の局面
  legal(): Action[];                // phase が 'human' のときだけ中身がある
  phase(): MatchPhase;
  result(): Result | null;
  start(): Promise<void>;
  // 人間の行動 → 演出 → CPU の考え → 演出 → 人間の手番に戻るまで待つ。phase が 'human' 以外なら何もしない
  submit(a: Action): Promise<void>;
  dispose(): void;                  // 以降、present も onOver も呼ばない
}

const HUMAN: Side = 'sente';
const CPU: Side = 'gote';

export function createMatch(opts: {
  level: Level; humanDeck: CardId[]; cpu: CpuClient; presenter: Presenter;
  onOver?(r: Result): void; seed?: number;
  initial?: GameState; // テスト専用：本当の局面を差し込む口。通常は使わない
}): Match {
  let real: GameState = opts.initial ?? createGame({ sente: opts.humanDeck, gote: LEVELS[opts.level].deck });
  let phase: MatchPhase = 'human';
  const rng = makeRng(opts.seed ?? Date.now());

  const view = () => viewFor(real, HUMAN);
  const disposed = () => phase === 'disposed';

  // 行動を本当の局面に適用し、人間側から見た形にして演出役へ渡す
  async function applyAndPresent(a: Action): Promise<void> {
    const before = view();
    const actor = real.turn;
    const out = applyAction(real, a);
    real = out.state;
    phase = 'presenting';
    await opts.presenter.present({
      actor,
      events: filterEventsFor(out.events, HUMAN),
      before,
      after: view(),
    });
  }

  // CPU の手を決める。失敗・反則のときは後手から見た合法手を順に試して最初に通る手にする
  async function cpuAction(): Promise<Action> {
    const gview = viewFor(real, CPU);
    const seed = Math.floor(rng() * 0x100000000);
    let reason: string;
    try {
      const a = await opts.cpu.think(gview, CPU, opts.level, seed);
      if (disposed()) return a;
      applyAction(real, a); // 通るかだけ確かめる（applyAction は元の局面を壊さない）
      return a;
    } catch (e) {
      reason = e instanceof Error ? e.message : String(e);
    }
    console.warn(`CPU の手が使えないので代わりの手を指します：${reason}`);
    for (const a of legalActions(gview)) {
      try {
        applyAction(real, a);
        return a;
      } catch { /* 本当の局面では通らない手は飛ばす */ }
    }
    throw new Error('指せる手がありません');
  }

  function finishIfOver(): boolean {
    if (!real.result) return false;
    phase = 'over';
    opts.onOver?.(real.result);
    return true;
  }

  return {
    view,
    legal: () => (phase === 'human' ? legalActions(view()) : []),
    phase: () => phase,
    result: () => real.result,
    async start() {
      // 人間が先手なので何もせずすぐ返る（将来、後手になるときはここで CPU の初手を呼ぶ）
    },
    async submit(a) {
      if (phase !== 'human') return;
      await applyAndPresent(a);
      for (;;) {
        if (disposed()) return;
        if (finishIfOver()) return;
        if (real.turn === HUMAN) { phase = 'human'; return; }
        phase = 'cpu';
        const next = await cpuAction();
        if (disposed()) return;
        await applyAndPresent(next);
      }
    },
    dispose() { phase = 'disposed'; },
  };
}
