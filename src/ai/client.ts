// メイン側から CPU に「考えて」と頼む窓口。id で答えを対応づける
import type { Action, GameState, Side } from '../rules/types';
import { LEVELS, type Level } from './levels';
import type { ThinkRequest, ThinkResponse } from './protocol';

// この型チェックは lib が ES2022 だけで setTimeout の型がないので、使う分だけ自前で宣言する
declare function setTimeout(fn: () => void, ms: number): unknown;
declare function clearTimeout(id: unknown): void;

export interface WorkerLike {
  postMessage(m: ThinkRequest): void;
  onmessage: ((e: { data: ThinkResponse }) => void) | null;
  onerror: ((e: unknown) => void) | null;
  terminate?(): void;
}
export interface CpuClient {
  think(view: GameState, side: Side, level: Level, seed: number): Promise<Action>;
  // 待っている頼みをすべて reject し、Worker を止める
  dispose(): void;
}

export function createCpuClient(
  worker: WorkerLike,
  opts?: { timeoutMs?: (level: Level) => number },
): CpuClient {
  const timeoutMs = opts?.timeoutMs ?? ((level: Level) => LEVELS[level].timeLimitMs + 3000);
  let nextId = 1;
  let disposed = false;
  const waiting = new Map<number, { resolve: (a: Action) => void; reject: (e: Error) => void; timer: unknown }>();

  // 待ち一覧から外し、時間切れの見張りも止める
  const take = (id: number) => {
    const w = waiting.get(id);
    if (!w) return undefined;
    waiting.delete(id);
    clearTimeout(w.timer);
    return w;
  };
  const rejectAll = (message: string) => {
    for (const id of [...waiting.keys()]) take(id)?.reject(new Error(message));
  };

  worker.onmessage = (e) => {
    const res = e.data;
    const w = take(res.id);
    if (!w) return; // 時間切れや dispose のあとに来た答えは捨てる
    if ('error' in res) w.reject(new Error(res.error));
    else w.resolve(res.action);
  };
  worker.onerror = () => rejectAll('CPU が止まりました');

  return {
    think(view, side, level, seed) {
      // 止めたあとの頼みは、Worker に送らずすぐ失敗にする
      if (disposed) return Promise.reject(new Error('CPU を止めました'));
      const id = nextId++;
      return new Promise<Action>((resolve, reject) => {
        const timer = setTimeout(() => {
          take(id)?.reject(new Error('CPU が時間内に答えませんでした'));
        }, timeoutMs(level));
        waiting.set(id, { resolve, reject, timer });
        worker.postMessage({ id, view, side, level, seed });
      });
    },
    dispose() {
      disposed = true;
      rejectAll('CPU を止めました');
      worker.terminate?.();
    },
  };
}
