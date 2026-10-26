// 友と対局（開発中だけ）：同じパソコンのブラウザのタブ同士を BroadcastChannel でつなぐ、にせの通信。
// 形は近距離の部品と同じ。fakeCut で「切れた」ふりができる（その間は誘う・探す・送るが届かない）
import type { Link } from './link';
import { emitter } from './emitter';

type Wire =
  | { k: 'advert'; from: string; name: string; version: string | null } // 誘っています（探している人へ）
  | { k: 'browse'; from: string }                         // 探しています（誘っている人へ）
  | { k: 'join'; from: string; to: string }
  | { k: 'accept'; from: string; to: string; name: string }
  | { k: 'data'; from: string; to: string; data: string }
  | { k: 'bye'; from: string; to: string }
  | { k: 'cut'; from: string; to: string; until: number };

const cutters = new Set<(ms: number) => void>();

/** このタブのにせの通信を ms のあいだ切る（相手のタブも切れる） */
export function fakeCut(ms = 4000): void {
  for (const c of cutters) c(ms);
}

export function createFakeLink(channel = 'super-shogi-fake'): Link {
  const me = Math.random().toString(36).slice(2, 10);
  const bc = new BroadcastChannel(channel);
  const ev = emitter();
  let hosting: string | null = null;
  let version: string | null = null;
  let browsing = false;
  let peer: string | null = null;
  let blockedUntil = 0;
  const blocked = (): boolean => Date.now() < blockedUntil;
  const post = (w: Wire): void => { if (!blocked()) bc.postMessage(w); };
  const disconnect = (): void => {
    if (!peer) return;
    const p = peer;
    peer = null;
    ev.emit({ type: 'disconnected', peer: p });
  };

  // 切れている間に誘う・探すを頼まれたら、切れ終わったときに名乗り直す
  const announceLater = (ms: number): void => {
    setTimeout(() => {
      if (hosting !== null) post({ k: 'advert', from: me, name: hosting, version });
      if (browsing) post({ k: 'browse', from: me });
    }, ms + 50);
  };

  cutters.add((ms) => {
    if (peer) bc.postMessage({ k: 'cut', from: me, to: peer, until: Date.now() + ms } satisfies Wire);
    blockedUntil = Date.now() + ms;
    disconnect();
    announceLater(ms);
  });

  bc.onmessage = (e: MessageEvent<Wire>) => {
    const w = e.data;
    if (blocked()) return;
    if ('to' in w && w.to !== me) return;
    switch (w.k) {
      case 'advert': if (browsing && !peer) ev.emit({ type: 'found', peer: w.from, name: w.name, version: w.version }); break;
      case 'browse': if (hosting !== null && !peer) post({ k: 'advert', from: me, name: hosting, version }); break;
      case 'join':
        if (hosting === null || peer) return;
        peer = w.from;
        post({ k: 'accept', from: me, to: w.from, name: hosting });
        hosting = null;
        ev.emit({ type: 'connected', peer: w.from, name: 'guest' });
        break;
      case 'accept':
        peer = w.from; browsing = false;
        ev.emit({ type: 'connected', peer: w.from, name: w.name });
        break;
      case 'data': if (peer === w.from) ev.emit({ type: 'message', data: w.data }); break;
      case 'bye': if (peer === w.from) disconnect(); break;
      case 'cut':
        blockedUntil = w.until;
        disconnect();
        announceLater(w.until - Date.now());
        break;
    }
  };

  return {
    async host(name, v) { hosting = name; version = v ?? null; post({ k: 'advert', from: me, name, version }); },
    async browse() { browsing = true; post({ k: 'browse', from: me }); },
    async join(p) { post({ k: 'join', from: me, to: p }); },
    async send(data) { if (peer) post({ k: 'data', from: me, to: peer, data }); },
    async stop() {
      hosting = null; browsing = false;
      if (peer) post({ k: 'bye', from: me, to: peer });
      disconnect();
    },
    on: (fn) => ev.on(fn),
  };
}
