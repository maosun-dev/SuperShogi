// 本物の Worker（別スレッド）を作って、CPU の窓口に渡す
import { createCpuClient, type CpuClient, type WorkerLike } from '../ai/client';

export function createBrowserCpu(): CpuClient {
  const worker = new Worker(new URL('../ai/worker.ts', import.meta.url), { type: 'module' });
  return createCpuClient(worker as unknown as WorkerLike);
}
