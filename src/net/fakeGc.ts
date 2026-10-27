// 友と対局（Game Center・開発中だけ）：同じパソコンのブラウザのタブ同士を BroadcastChannel でつなぐ、にせの Game Center の部品。
// 形は iPhone の部品（GcPlugin）と同じ。同じ番号で誘う側と入れる側がそろえばつなぐ。fakeGcCut で「切れた」ふりができる
import type { PluginListenerHandle } from '@capacitor/core';
import type { GcPlugin } from './gcLink';

type Wire =
  | { k: 'seek'; from: string; group: number; host: boolean }   // 探しています
  | { k: 'pair'; from: string; to: string; group: number }        // あなたとつなぎます
  | { k: 'data'; from: string; to: string; data: string }
  | { k: 'bye'; from: string; to: string };
type Name = 'connected' | 'failed' | 'disconnected' | 'message';

const cutters = new Set<() => void>();

/** このタブのにせの Game Center のつながりを切る（相手のタブも切れる） */
export function fakeGcCut(): void {
  for (const c of cutters) c();
}

export function createDevGcPlugin(channel = 'super-shogi-fakegc'): GcPlugin {
  const me = Math.random().toString(36).slice(2, 10);
  const bc = new BroadcastChannel(channel);
  const fns = new Map<Name, ((e: Record<string, string>) => void)[]>();
  const emit = (name: Name, data: Record<string, string> = {}): void => { for (const f of fns.get(name) ?? []) f(data); };
  let search: { group: number; host: boolean } | null = null;
  let peer: string | null = null;
  let timer = 0;
  const post = (w: Wire): void => bc.postMessage(w);
  const connect = (p: string): void => {
    search = null; peer = p;
    clearTimeout(timer);
    emit('connected');
  };
  const drop = (tell: boolean): void => {
    if (!peer) return;
    if (tell) post({ k: 'bye', from: me, to: peer });
    peer = null;
    emit('disconnected');
  };
  cutters.add(() => drop(true));

  bc.onmessage = (e: MessageEvent<Wire>) => {
    const w = e.data;
    if ('to' in w && w.to !== me) return;
    switch (w.k) {
      case 'seek':
        // 補い合う役割で同じ番号を探していたら、こちらから「つなぎます」と返す
        if (search && search.group === w.group && search.host !== w.host) {
          post({ k: 'pair', from: me, to: w.from, group: w.group });
          connect(w.from);
        }
        break;
      case 'pair': if (search && search.group === w.group) connect(w.from); break;
      case 'data': if (peer === w.from) emit('message', { data: w.data }); break;
      case 'bye': if (peer === w.from) drop(false); break;
    }
  };

  return {
    async signIn() { return { signedIn: true }; },
    async find(o) {
      drop(true);
      clearTimeout(timer);
      search = { group: o.group, host: o.host };
      if (o.timeoutSec > 0) timer = window.setTimeout(() => { if (search) { search = null; emit('failed', { reason: 'timeout' }); } }, o.timeoutSec * 1000);
      post({ k: 'seek', from: me, group: o.group, host: o.host });
    },
    async send(o) { if (peer) post({ k: 'data', from: me, to: peer, data: o.data }); },
    async stop() { search = null; clearTimeout(timer); drop(true); },
    async addListener(name, fn) {
      const list = fns.get(name) ?? [];
      list.push(fn);
      fns.set(name, list);
      const handle: PluginListenerHandle = { remove: async () => { list.splice(list.indexOf(fn), 1); } };
      return handle;
    },
  };
}
