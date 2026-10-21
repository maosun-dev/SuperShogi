// 本物の Worker（別スレッド）を作って、CPU の窓口に渡す
import { createCpuClient, type CpuClient, type WorkerLike } from '../ai/client';

// Worker が落ちたら、次の頼みの前に作り直す窓口。dispose のあとは作り直さない
export function createRestartingCpu(makeWorker: () => WorkerLike): CpuClient {
  let disposed = false;
  let crashed = false;
  let client: CpuClient;

  // createCpuClient が onerror を上書きするので、包んで外側でも落ちたことを覚える。
  // onmessage はそのまま本物へ渡し、onerror は「落ちた印を付けてから client 側の処理を呼ぶ」形にする
  const start = () => {
    const real = makeWorker();
    const wrapped: WorkerLike = {
      postMessage: (m) => real.postMessage(m),
      terminate: () => real.terminate?.(),
      get onmessage() { return real.onmessage; },
      set onmessage(f) { real.onmessage = f; },
      get onerror() { return real.onerror; },
      set onerror(f) {
        real.onerror = f ? (e) => { crashed = true; f(e); } : f;
      },
    };
    client = createCpuClient(wrapped);
    crashed = false;
  };
  start();

  return {
    think(view, side, level, seed) {
      if (disposed) return Promise.reject(new Error('CPU を止めました'));
      if (crashed) {
        // 落ちた Worker を止めて（dispose が terminate も呼ぶ）、新しいものに交換する
        client.dispose();
        start();
      }
      return client.think(view, side, level, seed);
    },
    dispose() {
      disposed = true;
      client.dispose();
    },
  };
}

export function createBrowserCpu(): CpuClient {
  return createRestartingCpu(
    () => new Worker(new URL('../ai/worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike,
  );
}
