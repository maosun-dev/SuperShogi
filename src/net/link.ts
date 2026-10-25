// 友と対局：通信の窓口。運ぶだけで決まりごとは持たない（決まりごとは session.ts）。
// iPhone では近距離の部品（Swift の Nearby）、開発中のブラウザではタブ同士のにせの通信、テストでは対の窓口を使う
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { isNativeApp } from '../app/native';
import { createFakeLink } from './fakeLink';
import { emitter } from './emitter';

export type LinkEvent =
  | { type: 'found'; peer: string; name: string }
  | { type: 'lost'; peer: string }
  | { type: 'connected'; peer: string; name: string }
  | { type: 'disconnected'; peer: string }
  | { type: 'message'; data: string };

export interface Link {
  host(name: string): Promise<void>;   // 合言葉 name で誘う。来た相手は受け入れる（1人だけ）
  browse(): Promise<void>;             // 誘っている人を探す
  join(peer: string): Promise<void>;   // 見つけた相手につなぐ
  send(data: string): Promise<void>;   // 順番どおり確実に送る（つながっていなければ捨てる）
  stop(): Promise<void>;               // 誘う・探す・つながりを全部やめる
  on(fn: (e: LinkEvent) => void): () => void;
}

// ---- テスト用：2つの窓口を直接つなぐ。cut で切り、heal でまたつなげるようにする ----
export function createPairLinks(): { a: Link; b: Link; cut(): void; heal(): void } {
  interface End { id: string; ev: ReturnType<typeof emitter>; hosting: string | null; browsing: boolean; peer: End | null }
  const mk = (id: string): End => ({ id, ev: emitter(), hosting: null, browsing: false, peer: null });
  const A = mk('A'), B = mk('B');
  let healthy = true;
  const later = (fn: () => void): void => { queueMicrotask(fn); };
  const other = (e: End): End => (e === A ? B : A);
  // 誘っている側と探している側がそろったら、探している側に見つかったと知らせる
  const announce = (): void => {
    for (const h of [A, B]) {
      const o = other(h);
      if (healthy && h.hosting !== null && o.browsing && !h.peer) {
        const name = h.hosting;
        later(() => o.ev.emit({ type: 'found', peer: h.id, name }));
      }
    }
  };
  const drop = (e: End): void => {
    const o = e.peer;
    if (!o) return;
    e.peer = null; o.peer = null;
    later(() => { e.ev.emit({ type: 'disconnected', peer: o.id }); o.ev.emit({ type: 'disconnected', peer: e.id }); });
  };
  const link = (e: End): Link => ({
    async host(name) { e.hosting = name; announce(); },
    async browse() { e.browsing = true; announce(); },
    async join(peer) {
      const h = other(e);
      if (!healthy || h.id !== peer || h.hosting === null || h.peer) return;
      const name = h.hosting;
      h.hosting = null; e.browsing = false;
      e.peer = h; h.peer = e;
      later(() => { h.ev.emit({ type: 'connected', peer: e.id, name: 'guest' }); e.ev.emit({ type: 'connected', peer: h.id, name }); });
    },
    async send(data) {
      const o = e.peer;
      if (!healthy || !o) return;
      later(() => o.ev.emit({ type: 'message', data })); // つながっている間に送ったものは届く
    },
    async stop() { e.hosting = null; e.browsing = false; drop(e); },
    on: (fn) => e.ev.on(fn),
  });
  return {
    a: link(A), b: link(B),
    cut() { healthy = false; drop(A); },
    heal() { healthy = true; announce(); },
  };
}

// ---- iPhone：近距離の部品（plugins/capacitor-nearby） ----
interface NearbyPlugin {
  host(o: { name: string }): Promise<void>;
  browse(): Promise<void>;
  join(o: { peer: string }): Promise<void>;
  send(o: { data: string }): Promise<void>;
  stop(): Promise<void>;
  addListener(name: string, fn: (e: Record<string, string>) => void): Promise<PluginListenerHandle>;
}

export function createNativeLink(): Link {
  const plugin = registerPlugin<NearbyPlugin>('Nearby');
  const ev = emitter();
  void plugin.addListener('found', (e) => ev.emit({ type: 'found', peer: e.peer, name: e.name }));
  void plugin.addListener('lost', (e) => ev.emit({ type: 'lost', peer: e.peer }));
  void plugin.addListener('connected', (e) => ev.emit({ type: 'connected', peer: e.peer, name: e.name }));
  void plugin.addListener('disconnected', (e) => ev.emit({ type: 'disconnected', peer: e.peer }));
  void plugin.addListener('message', (e) => ev.emit({ type: 'message', data: e.data }));
  return {
    host: (name) => plugin.host({ name }),
    browse: () => plugin.browse(),
    join: (peer) => plugin.join({ peer }),
    send: (data) => plugin.send({ data }),
    stop: () => plugin.stop(),
    on: (fn) => ev.on(fn),
  };
}

/** 友と対局ができる所か（アプリ、または開発中の ?link=fake） */
export function linkAvailable(): boolean {
  if (isNativeApp()) return true;
  return import.meta.env.DEV && new URLSearchParams(location.search).get('link') === 'fake';
}

let shared: Link | null = null;
/** 窓口は1つを使い回す（部品の知らせの受け口を何重にも付けないため） */
export function pickLink(): Link {
  if (shared) return shared;
  if (isNativeApp()) shared = createNativeLink();
  else if (linkAvailable()) shared = createFakeLink();
  else throw new Error('友と対局はアプリでだけ使えます');
  return shared;
}

declare const __APP_VERSION__: string | undefined;
/** アプリの版（組み立てのときに MARKETING_VERSION を埋め込む。テストでは 'test'） */
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'test';
