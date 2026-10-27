// 友と対局（Game Center）：Game Center の部品（plugins/capacitor-gamecenter）を Link の形にする。
// 決まりごと（session.ts）はそのまま使う。合言葉から番号を作り、同じ番号で誘う側と入れる側がそろえばつながる。
// 近くの人を見つける仕組みはないので、入れる側は合言葉を入力する（enter）。
// 一度切れた GKMatch には戻れないので、つなぎ直しは同じ合言葉で探し直す（browse で合言葉を出し直す）
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { Link } from './link';
import { emitter } from './emitter';
import { gcGroup } from './gcCode';
import { APP_VERSION, linkAvailable } from './link';
import { createDevGcPlugin } from './fakeGc';
import { isNativeApp } from '../app/native';

/** iPhone の部品（GameCenterMatch）の形 */
export interface GcPlugin {
  signIn(): Promise<{ signedIn: boolean }>;
  /** 相手を探す。host＝誘う側。timeoutSec が 0 なら見切らない */
  find(o: { group: number; host: boolean; timeoutSec: number }): Promise<void>;
  send(o: { data: string }): Promise<void>;
  stop(): Promise<void>;
  addListener(name: 'connected' | 'failed' | 'disconnected' | 'message', fn: (e: Record<string, string>) => void): Promise<PluginListenerHandle>;
}

export interface GcLink extends Link {
  /** Game Center にサインインする（していなければ Apple の画面が出る） */
  signIn(): Promise<boolean>;
  /** 入れる側：合言葉を入れた（found を出す。続けて Session.join(合言葉)） */
  enter(code: string): void;
  /** 探しが失敗した理由（signedOut・timeout・ほかはエラーの説明）を受け取る。戻り値で受け取りをやめる */
  onTrouble(fn: (reason: string) => void): () => void;
}

const JOIN_TIMEOUT_SEC = 60; // 入れる側はこれだけ探して見切る

/** retryMs：誘う側の探しが失敗したら、これだけ待って探し直す（ネットが戻るまで続ける） */
export function createGcLink(plugin: GcPlugin, version: string, opts: { retryMs?: number } = {}): GcLink {
  const ev = emitter();
  let code: string | null = null; // いまの合言葉（誘う・入れる・つなぎ直しで使う）
  let hostWanted = false;          // 誘う側として相手を待ちたい（失敗したら探し直す）
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  const retryMs = opts.retryMs ?? 4000;
  const troubles = new Set<(reason: string) => void>();
  const peer = (): string => code ?? '';
  const findAsHost = (): Promise<void> => plugin.find({ group: gcGroup(peer(), version), host: true, timeoutSec: 0 });
  void plugin.addListener('connected', () => { hostWanted = false; ev.emit({ type: 'connected', peer: peer(), name: peer() }); });
  void plugin.addListener('failed', (e) => {
    for (const fn of [...troubles]) fn(e.reason ?? '');
    if (!hostWanted) { ev.emit({ type: 'failed', peer: peer() }); return; }
    // 誘う側は待ち続ける：ネットやサインインが戻るまで、少し待って探し直す
    const retry = (): void => { if (hostWanted) void findAsHost(); };
    if (retryMs > 0) retryTimer = setTimeout(retry, retryMs); else queueMicrotask(retry);
  });
  void plugin.addListener('disconnected', () => ev.emit({ type: 'disconnected', peer: peer() }));
  void plugin.addListener('message', (e) => ev.emit({ type: 'message', data: e.data ?? '' }));
  // 版が違う人とは番号が違ってつながらないので、見つけた相手の版は自分と同じとしてよい
  const found = (c: string): void => ev.emit({ type: 'found', peer: c, name: c, version });
  return {
    async signIn() { return (await plugin.signIn()).signedIn; },
    enter(c) { code = c; found(c); },
    onTrouble(fn) { troubles.add(fn); return () => { troubles.delete(fn); }; },
    async host(c) { code = c; hostWanted = true; await findAsHost(); },
    async browse() { if (code) found(code); },
    async join(c) { code = c; hostWanted = false; await plugin.find({ group: gcGroup(c, version), host: false, timeoutSec: JOIN_TIMEOUT_SEC }); },
    send: (data) => plugin.send({ data }),
    stop: () => { hostWanted = false; clearTimeout(retryTimer); return plugin.stop(); },
    on: (fn) => ev.on(fn),
  };
}

let shared: GcLink | null = null;
/** Game Center の窓口は1つを使い回す（部品の知らせの受け口を何重にも付けないため） */
export function pickGcLink(): GcLink {
  if (shared) return shared;
  if (isNativeApp()) shared = createGcLink(registerPlugin<GcPlugin>('GameCenterMatch'), APP_VERSION);
  else if (linkAvailable()) shared = createGcLink(createDevGcPlugin(), APP_VERSION); // 開発中の ?link=fake：タブ同士
  else throw new Error('Game Center はアプリでだけ使えます');
  return shared;
}

// ---- テスト用：Game Center の部品の偽物の対。同じ番号で誘う側と入れる側がそろえばつなぐ ----
type Name = 'connected' | 'failed' | 'disconnected' | 'message';
export function createFakeGcPlugins(opts: { signedIn?: boolean } = {}): { a: GcPlugin; b: GcPlugin; cut(): void; failFind(n: number): void; failHost(n: number, reason?: string): void } {
  interface End { fns: Map<Name, ((e: Record<string, string>) => void)[]>; search: { group: number; host: boolean } | null; peer: End | null }
  const mk = (): End => ({ fns: new Map(), search: null, peer: null });
  const A = mk(), B = mk();
  let fails = 0;
  let hostFails = 0, hostReason = 'error';
  const later = (e: End, name: Name, data: Record<string, string> = {}): void => {
    queueMicrotask(() => { for (const f of e.fns.get(name) ?? []) f(data); });
  };
  const other = (e: End): End => (e === A ? B : A);
  const drop = (e: End): void => {
    const o = e.peer;
    if (!o) return;
    e.peer = null; o.peer = null;
    later(e, 'disconnected'); later(o, 'disconnected');
  };
  const plugin = (e: End): GcPlugin => ({
    async signIn() { return { signedIn: opts.signedIn ?? true }; },
    async find(o) {
      drop(e);
      if (!o.host && fails > 0) { fails--; e.search = null; later(e, 'failed', { reason: 'timeout' }); return; }
      if (o.host && hostFails > 0) { hostFails--; e.search = null; later(e, 'failed', { reason: hostReason }); return; }
      e.search = { group: o.group, host: o.host };
      const x = other(e);
      if (x.search && x.search.group === o.group && x.search.host !== o.host) {
        e.search = null; x.search = null;
        e.peer = x; x.peer = e;
        later(e, 'connected'); later(x, 'connected');
      }
    },
    async send(o) { if (e.peer) later(e.peer, 'message', { data: o.data }); },
    async stop() { e.search = null; drop(e); },
    async addListener(name, fn) {
      const list = e.fns.get(name) ?? [];
      list.push(fn);
      e.fns.set(name, list);
      return { remove: async () => { list.splice(list.indexOf(fn), 1); } };
    },
  });
  return {
    a: plugin(A), b: plugin(B),
    cut() { drop(A); },
    failFind(n) { fails = n; },
    failHost(n, reason = 'error') { hostFails = n; hostReason = reason; },
  };
}
