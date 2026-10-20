// メイン側から CPU に「考えて」と頼む窓口。id で答えを対応づける
import type { Action, GameState } from '../rules/types';
import type { Level } from './levels';
import type { ThinkRequest, ThinkResponse } from './protocol';

export interface WorkerLike {
  postMessage(m: ThinkRequest): void;
  onmessage: ((e: { data: ThinkResponse }) => void) | null;
}
export interface CpuClient { think(view: GameState, level: Level, seed: number): Promise<Action> }

export function createCpuClient(worker: WorkerLike): CpuClient {
  let nextId = 1;
  const waiting = new Map<number, { resolve: (a: Action) => void; reject: (e: Error) => void }>();
  worker.onmessage = (e) => {
    const res = e.data;
    const w = waiting.get(res.id);
    if (!w) return;
    waiting.delete(res.id);
    if ('error' in res) w.reject(new Error(res.error));
    else w.resolve(res.action);
  };
  return {
    think(view, level, seed) {
      const id = nextId++;
      return new Promise<Action>((resolve, reject) => {
        waiting.set(id, { resolve, reject });
        worker.postMessage({ id, view, level, seed });
      });
    },
  };
}
