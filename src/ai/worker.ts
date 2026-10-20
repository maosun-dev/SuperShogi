// Worker の入口。lib に WebWorker の型がないので、使う部分だけ自前の型にする
// （実際に Worker として起動するのは別の作業）
import { handleThinkRequest, type ThinkRequest, type ThinkResponse } from './protocol';

interface WorkerScope {
  onmessage: ((e: { data: ThinkRequest }) => void) | null;
  postMessage(m: ThinkResponse): void;
}

const scope = globalThis as unknown as WorkerScope;
scope.onmessage = (e) => {
  scope.postMessage(handleThinkRequest(e.data));
};
