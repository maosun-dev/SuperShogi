// 友と対局：つながり〜札選び〜くじ〜対局〜待った〜つなぎ直し〜片付けの決まりごと（DOM なし）。
// 対局の中身は setup（最初の盤面の材料）と log（手の記録）だけで、保存しない。
// 誘った側（host）が先手の席、探した側（guest）が後手の席
import type { Action, CardId, Handicap, Side } from '../rules/types';
import type { Link, LinkEvent } from './link';
import { APP_VERSION } from './link';
import { encodeMsg, parseMsg, type Msg } from './protocol';
import { buildState, lastTurnStart, type Setup } from './record';

export type SessionPhase = 'idle' | 'hosting' | 'browsing' | 'deck' | 'match' | 'reconnecting' | 'over' | 'closed';

export type SessionEvent =
  | { type: 'peers' }                          // 見つかった合言葉の一覧が変わった
  | { type: 'connected' }                      // つながって版も合った（札選びへ）
  | { type: 'versionMismatch' }
  | { type: 'start'; setup: Setup }
  | { type: 'act'; action: Action; fp: string | null }   // 相手の手（本当の盤面の向き）
  | { type: 'resign'; seat: Side }             // seat の側が投了した
  | { type: 'mattaAsked' }
  | { type: 'mattaAnswered'; ok: boolean }
  | { type: 'mattaCancelled' }
  | { type: 'rewind'; to: number }             // 待ったが通り、記録を to まで切った
  | { type: 'lost' }                           // 対局中に切れた（つなぎ直している）
  | { type: 'back' }                           // つなぎ直せた
  | { type: 'foeQuit' }                        // 相手が対局をやめた（対局は消えた）
  | { type: 'closed' };                        // 対局の前に切れた

export interface Session {
  role(): 'host' | 'guest' | null;
  phase(): SessionPhase;
  code(): string | null;
  peers(): { peer: string; name: string }[];
  seat(): Side;
  setup(): Setup | null;
  log(): readonly Action[];
  mattaPending(): 'mine' | 'theirs' | null;
  canMatta(): boolean;
  host(): void;
  browse(): void;
  join(peer: string): void;
  ready(deck: CardId[], handicap?: Handicap): void;
  sendAct(action: Action, fp: string): void;
  resign(): void;
  requestMatta(): boolean;
  cancelMatta(): void;
  replyMatta(ok: boolean): void;
  finish(): void;
  quit(): void;
  on(fn: (e: SessionEvent) => void): () => void;
}

const PIECE_NAMES = ['歩兵', '香車', '桂馬', '銀将', '金将', '角行', '飛車'];
const KANSUJI = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const NO_HANDICAP: Handicap = { side: 'sente', kind: 'none' };

/** 合言葉：駒の名前＋「の」＋漢数字（例「桂馬の三」） */
export function makeCode(rng: () => number): string {
  return `${PIECE_NAMES[Math.floor(rng() * PIECE_NAMES.length)]}の${KANSUJI[Math.floor(rng() * KANSUJI.length)]}`;
}

export function createSession(link: Link, opts: { version?: string; rng?: () => number; stopDelayMs?: number } = {}): Session {
  const version = opts.version ?? APP_VERSION;
  const rng = opts.rng ?? Math.random;
  const stopDelayMs = opts.stopDelayMs ?? 300; // 最後の知らせが届くのを待ってから切る
  const fns = new Set<(e: SessionEvent) => void>();
  const emit = (e: SessionEvent): void => { for (const fn of [...fns]) fn(e); };

  let role: 'host' | 'guest' | null = null;
  let phase: SessionPhase = 'idle';
  let code: string | null = null;
  const peers = new Map<string, string>();
  let connected = false;
  let myReady: { deck: CardId[]; handicap?: Handicap } | null = null;
  let foeReady: { deck: CardId[]; handicap?: Handicap } | null = null;
  let matchId: string | null = null;
  let setup: Setup | null = null;
  let log: Action[] = [];
  let fps: string[] = [];
  let matta: { who: 'mine' | 'theirs'; to: number } | null = null;

  const seat = (): Side => (role === 'guest' ? 'gote' : 'sente');
  const foeSeat = (): Side => (role === 'guest' ? 'sente' : 'gote');
  const send = (m: Msg): void => { if (connected) void link.send(encodeMsg(m)); };

  function clearMatch(): void {
    matchId = null; setup = null; log = []; fps = []; matta = null; myReady = null; foeReady = null;
  }
  function close(): void {
    clearMatch();
    phase = 'closed';
    connected = false;
    unlisten();
    void link.stop();
  }
  function dropMatta(): void {
    if (!matta) return;
    matta = null;
    emit({ type: 'mattaCancelled' });
  }
  function truncate(to: number): void {
    log = log.slice(0, to);
    fps = fps.slice(0, to);
  }
  function append(action: Action, fp: string | null): void {
    log.push(action);
    fps.push(fp ?? '');
    emit({ type: 'act', action, fp });
  }
  // 切れたあと、もう一度誘う・探す
  function searchAgain(): void {
    if (role === 'host' && code) void link.host(code);
    else { peers.clear(); void link.browse(); }
  }

  // 誘った側：両方の札がそろったら、先手を決めて対局を始める
  function begin(): void {
    if (role !== 'host' || !myReady || !foeReady) return;
    const handicap = myReady.handicap ?? NO_HANDICAP;
    const first: Side = handicap.kind !== 'none' ? handicap.side : rng() < 0.5 ? 'sente' : 'gote';
    const s: Setup = { decks: { sente: myReady.deck, gote: foeReady.deck }, handicap, first };
    const id = Math.floor(rng() * 0x100000000).toString(16).padStart(8, '0');
    clearMatch();
    matchId = id; setup = s; phase = 'match';
    send({ t: 'start', matchId: id, setup: s });
    emit({ type: 'start', setup: s });
  }

  function onMessage(m: Msg): void {
    switch (m.t) {
      case 'hello':
        if (m.version !== version) { close(); emit({ type: 'versionMismatch' }); return; }
        if (phase === 'hosting' || phase === 'browsing') { phase = 'deck'; emit({ type: 'connected' }); return; }
        if (phase === 'reconnecting') {
          if (matchId && m.matchId === matchId) send({ t: 'sync', n: log.length });
          else { close(); emit({ type: 'foeQuit' }); }
        }
        return;
      case 'sync':
        if (phase !== 'reconnecting' && phase !== 'match') return;
        if (m.n < log.length) send({ t: 'log', from: m.n, actions: log.slice(m.n), fps: fps.slice(m.n) });
        phase = 'match';
        emit({ type: 'back' });
        return;
      case 'log':
        m.actions.forEach((a, i) => { if (m.from + i === log.length) append(a, m.fps[i] || null); });
        return;
      case 'ready':
        foeReady = { deck: m.deck, handicap: m.handicap };
        begin();
        return;
      case 'start':
        if (role !== 'guest') return;
        clearMatch();
        matchId = m.matchId; setup = m.setup; phase = 'match';
        emit({ type: 'start', setup: m.setup });
        return;
      case 'act':
        if (setup && m.n === log.length) append(m.action, m.fp);
        return;
      case 'resign':
        if (setup) emit({ type: 'resign', seat: foeSeat() });
        return;
      case 'matta':
        // 両方が同時に求めたときは、誘った側の待ったを先にする
        if (matta?.who === 'mine') {
          if (role === 'host') return;
          dropMatta();
        }
        matta = { who: 'theirs', to: m.to };
        emit({ type: 'mattaAsked' });
        return;
      case 'mattaReply':
        if (matta?.who !== 'mine') return;
        matta = null;
        if (m.ok) { truncate(m.to); emit({ type: 'rewind', to: m.to }); }
        emit({ type: 'mattaAnswered', ok: m.ok });
        return;
      case 'mattaCancel':
        if (matta?.who === 'theirs') dropMatta();
        return;
      case 'quit':
        close();
        emit({ type: 'foeQuit' });
        return;
    }
  }

  function onLink(e: LinkEvent): void {
    switch (e.type) {
      case 'found':
        if (role !== 'guest') return;
        peers.set(e.peer, e.name);
        emit({ type: 'peers' });
        if (phase === 'reconnecting' && e.name === code) void link.join(e.peer);
        return;
      case 'lost':
        if (peers.delete(e.peer)) emit({ type: 'peers' });
        return;
      case 'connected':
        connected = true;
        if (role === 'guest' && phase === 'browsing') code = e.name;
        send({ t: 'hello', version, matchId });
        return;
      case 'disconnected':
        if (!connected) return;
        connected = false;
        dropMatta();
        if (phase === 'match' || phase === 'reconnecting') {
          phase = 'reconnecting';
          emit({ type: 'lost' });
          searchAgain();
        } else if (phase === 'deck' || phase === 'over') {
          close();
          emit({ type: 'closed' });
        }
        return;
      case 'message': {
        const m = parseMsg(e.data);
        if (m) onMessage(m);
        return;
      }
    }
  }
  const unlisten = link.on(onLink);

  return {
    role: () => role,
    phase: () => phase,
    code: () => code,
    peers: () => [...peers].map(([peer, name]) => ({ peer, name })),
    seat,
    setup: () => setup,
    log: () => log,
    mattaPending: () => matta?.who ?? null,
    canMatta() {
      if (phase !== 'match' || !connected || matta || !setup) return false;
      if (buildState(setup, log).result) return false;
      return lastTurnStart(setup, log, seat()) !== null;
    },
    host() {
      role = 'host'; phase = 'hosting';
      code = makeCode(rng);
      void link.host(code);
    },
    browse() {
      role = 'guest'; phase = 'browsing';
      peers.clear();
      void link.browse();
    },
    join(peer) {
      if (phase === 'browsing') void link.join(peer);
    },
    ready(deck, handicap) {
      if (phase !== 'deck' && phase !== 'over') return;
      phase = 'deck';
      myReady = role === 'host' ? { deck, handicap: handicap ?? NO_HANDICAP } : { deck };
      if (role === 'guest') send({ t: 'ready', deck });
      else begin();
    },
    sendAct(action, fp) {
      if (!setup) return;
      log.push(action);
      fps.push(fp);
      send({ t: 'act', n: log.length - 1, action, fp });
    },
    resign() {
      if (!setup) return;
      send({ t: 'resign', n: log.length });
      emit({ type: 'resign', seat: seat() });
    },
    requestMatta() {
      if (!this.canMatta() || !setup) return false;
      const to = lastTurnStart(setup, log, seat())!;
      matta = { who: 'mine', to };
      send({ t: 'matta', to });
      return true;
    },
    cancelMatta() {
      if (matta?.who !== 'mine') return;
      matta = null;
      send({ t: 'mattaCancel' });
    },
    replyMatta(ok) {
      if (matta?.who !== 'theirs') return;
      const to = matta.to;
      matta = null;
      send({ t: 'mattaReply', ok, to });
      if (ok) { truncate(to); emit({ type: 'rewind', to }); }
    },
    finish() {
      clearMatch();
      if (phase === 'match') phase = 'over';
    },
    quit() {
      if (phase === 'closed') return;
      const wasConnected = connected;
      if (wasConnected) void link.send(encodeMsg({ t: 'quit' }));
      clearMatch();
      phase = 'closed';
      connected = false;
      unlisten();
      if (wasConnected && stopDelayMs > 0) setTimeout(() => { void link.stop(); }, stopDelayMs);
      else void link.stop();
    },
    on(fn) { fns.add(fn); return () => { fns.delete(fn); }; },
  };
}
