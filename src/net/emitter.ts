// 友と対局：通信の知らせを配る小さな道具（窓口の作りで使い回す）
import type { LinkEvent } from './link';

export function emitter(): { on(fn: (e: LinkEvent) => void): () => void; emit(e: LinkEvent): void } {
  const fns = new Set<(e: LinkEvent) => void>();
  return {
    on(fn) { fns.add(fn); return () => { fns.delete(fn); }; },
    emit(e) { for (const fn of [...fns]) fn(e); },
  };
}
