// 友と対局：つながりの流れ（札選び・くじ・記録・待った・つなぎ直し・片付け）
import { test, expect } from 'vitest';
import { createPairLinks } from '../../src/net/link';
import { createSession, makeCode, type Session, type SessionEvent } from '../../src/net/session';
import { buildState } from '../../src/net/record';
import { fingerprint } from '../../src/net/fingerprint';
import { applyAction, legalActions } from '../../src/rules/game';
import type { Action } from '../../src/rules/types';
import { flush } from '../helpers';

function seq(...xs: number[]): () => number {
  let i = 0;
  return () => xs[i++ % xs.length];
}

async function pair(opts: { hostVersion?: string } = {}) {
  const links = createPairLinks();
  const host = createSession(links.a, { version: opts.hostVersion ?? '1', rng: seq(0.3, 0.6, 0.9), stopDelayMs: 0 });
  const guest = createSession(links.b, { version: '1', rng: seq(0.1), stopDelayMs: 0 });
  const he: SessionEvent[] = [], ge: SessionEvent[] = [];
  host.on((e) => he.push(e)); guest.on((e) => ge.push(e));
  host.host();
  guest.browse();
  await flush();
  guest.join(guest.peers()[0]!.peer);
  await flush(); await flush();
  return { ...links, host, guest, he, ge };
}

async function started() {
  const p = await pair();
  p.host.ready(['rakurai']);
  p.guest.ready(['kagami']);
  await flush();
  return p;
}

/** 手番の側が最初の合法手を指して送る */
function play(s: Session): Action {
  const st = buildState(s.setup()!, s.log());
  const a = legalActions(st).find((x) => x.type === 'move')!;
  s.sendAct(a, fingerprint(applyAction(st, a).state));
  return a;
}
const mover = (p: { host: Session; guest: Session }): Session =>
  buildState(p.host.setup()!, p.host.log()).turn === 'sente' ? p.host : p.guest;

test('合言葉は駒の名前＋の＋漢数字', () => {
  expect(makeCode(seq(0.3, 0.2))).toBe('桂馬の二');
});

test('誘う→探す→つなぐ で両方とも札選びへ', async () => {
  const p = await pair();
  expect(p.guest.peers()[0]?.name).toBe(p.host.code());
  expect(p.host.phase()).toBe('deck');
  expect(p.guest.phase()).toBe('deck');
  expect(p.he).toContainEqual({ type: 'connected' });
  expect(p.ge).toContainEqual({ type: 'connected' });
  expect(p.guest.seat()).toBe('gote');
});

test('版が違えばつながない', async () => {
  const p = await pair({ hostVersion: '2' });
  expect(p.ge).toContainEqual({ type: 'versionMismatch' });
  expect(p.guest.phase()).toBe('closed');
  expect(p.host.phase()).toBe('closed');
});

test('両方の札がそろうと、同じ setup で始まる。駒落ちがあれば落とした側が先', async () => {
  const p = await started();
  expect(p.host.phase()).toBe('match');
  expect(p.guest.setup()).toEqual(p.host.setup());
  expect(p.host.setup()!.decks).toEqual({ sente: ['rakurai'], gote: ['kagami'] });

  const q = await pair();
  q.guest.ready([]);
  q.host.ready([], { side: 'gote', kind: 'kaku' });
  await flush();
  expect(q.guest.setup()!.first).toBe('gote');
});

test('指した手が相手に届き、記録が同じになる', async () => {
  const p = await started();
  for (let i = 0; i < 4; i++) { play(mover(p)); await flush(); }
  expect(p.guest.log()).toEqual(p.host.log());
  expect(p.guest.log()).toHaveLength(4);
});

test('切れたら両方つなぎ直し、切れている間に送った手も届く', async () => {
  const p = await started();
  play(mover(p)); await flush();
  p.cut();
  await flush();
  expect(p.he).toContainEqual({ type: 'lost' });
  expect(p.guest.phase()).toBe('reconnecting');
  play(mover(p)); // 届かない
  p.heal();
  for (let i = 0; i < 4; i++) await flush();
  expect(p.ge).toContainEqual({ type: 'back' });
  expect(p.host.phase()).toBe('match');
  expect(p.guest.log()).toEqual(p.host.log());
  expect(p.host.log()).toHaveLength(2);
});

test('片方がやめると、相手の対局も消える', async () => {
  const p = await started();
  p.host.quit();
  await flush();
  expect(p.ge).toContainEqual({ type: 'foeQuit' });
  expect(p.guest.setup()).toBeNull();
  expect(p.guest.phase()).toBe('closed');
});

test('切れている間に相手がやめて新しく誘い直したら、続きとはみなさない', async () => {
  const p = await started();
  p.cut();
  await flush();
  p.host.quit();
  // 同じ窓口で、まっさらな誘う側が同じ合言葉で待っている形にする
  const fresh = createSession(p.a, { version: '1', rng: seq(0.3, 0.6), stopDelayMs: 0 });
  fresh.host();
  p.heal();
  for (let i = 0; i < 4; i++) await flush();
  expect(p.ge).toContainEqual({ type: 'foeQuit' });
  expect(p.guest.setup()).toBeNull();
});

test('待ったを受けると、両方の記録が自分の最後の手番の頭まで戻る', async () => {
  const p = await started();
  const first = mover(p);
  play(first); await flush();
  play(mover(p)); await flush();
  expect(first.canMatta()).toBe(true);
  expect(first.requestMatta()).toBe(true);
  await flush();
  const other = first === p.host ? p.guest : p.host;
  expect(other.mattaPending()).toBe('theirs');
  other.replyMatta(true);
  await flush();
  expect(p.host.log()).toHaveLength(0);
  expect(p.guest.log()).toHaveLength(0);
  expect([...p.he, ...p.ge].filter((e) => e.type === 'rewind')).toHaveLength(2);
});

test('待ったを断る・取り消す', async () => {
  const p = await started();
  const first = mover(p);
  play(first); await flush();
  const other = first === p.host ? p.guest : p.host;
  const events = first === p.host ? p.he : p.ge;
  const otherEvents = first === p.host ? p.ge : p.he;
  first.requestMatta(); await flush();
  other.replyMatta(false); await flush();
  expect(events).toContainEqual({ type: 'mattaAnswered', ok: false });
  expect(first.log()).toHaveLength(1);
  first.requestMatta(); await flush();
  first.cancelMatta(); await flush();
  expect(otherEvents).toContainEqual({ type: 'mattaCancelled' });
  expect(other.mattaPending()).toBeNull();
});

test('待ったと相手の手が行き違っても、受けたあとの記録は同じ', async () => {
  const p = await started();
  const first = mover(p);
  play(first); await flush();
  const other = first === p.host ? p.guest : p.host;
  first.requestMatta();   // 届く前に相手が指す
  play(other);
  await flush();
  other.replyMatta(true);
  await flush();
  expect(p.host.log()).toEqual(p.guest.log());
  expect(p.host.log()).toHaveLength(0);
});

test('決着や投了で結果画面へ行くと、対局の中身が消える', async () => {
  const p = await started();
  play(mover(p)); await flush();
  p.host.resign(); await flush();
  expect(p.ge).toContainEqual({ type: 'resign', seat: 'sente' });
  p.host.finish(); p.guest.finish();
  expect(p.host.setup()).toBeNull();
  expect(p.guest.log()).toHaveLength(0);
  expect(p.host.phase()).toBe('over');
  // もう一度：札選びから
  p.guest.ready([]); p.host.ready([]);
  await flush();
  expect(p.guest.phase()).toBe('match');
});
