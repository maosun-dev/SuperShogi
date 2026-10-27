// 友と対局（Game Center）：Game Center 版の窓口を、偽の部品の対で Session とつないで確かめる
import { expect, test } from 'vitest';
import { createFakeGcPlugins, createGcLink } from '../../src/net/gcLink';
import { createSession, type SessionEvent } from '../../src/net/session';
import { makeGcCode } from '../../src/net/gcCode';
import { flush } from '../helpers';

function seq(...xs: number[]): () => number {
  let i = 0;
  return () => xs[i++ % xs.length];
}
const flushN = async (n: number): Promise<void> => { for (let i = 0; i < n; i++) await flush(); };

function setup(opts: { signedIn?: boolean } = {}) {
  const fake = createFakeGcPlugins(opts);
  const la = createGcLink(fake.a, '1.0.2', { retryMs: 0 }), lb = createGcLink(fake.b, '1.0.2', { retryMs: 0 });
  const host = createSession(la, { version: '1.0.2', rng: seq(0.3, 0.6, 0.9), stopDelayMs: 0, makeCode: makeGcCode });
  const guest = createSession(lb, { version: '1.0.2', rng: seq(0.1), stopDelayMs: 0 });
  const he: SessionEvent[] = [], ge: SessionEvent[] = [];
  host.on((e) => he.push(e)); guest.on((e) => ge.push(e));
  return { fake, la, lb, host, guest, he, ge };
}

/** 入れる側：合言葉を入れてつなぐ（画面がすること） */
function enterAndJoin(p: ReturnType<typeof setup>, code: string): void {
  p.guest.browse();
  p.lb.enter(code);
  p.guest.join(code);
}

test('誘う→合言葉を入れる で、両方とも札選びへ', async () => {
  const p = setup();
  p.host.host();
  enterAndJoin(p, p.host.code()!);
  await flushN(4);
  expect(p.host.phase()).toBe('deck');
  expect(p.guest.phase()).toBe('deck');
});

test('合言葉が違えばつながらない', async () => {
  const p = setup();
  p.host.host();
  enterAndJoin(p, p.host.code() === '歩兵の一一' ? '歩兵の一二' : '歩兵の一一');
  await flushN(4);
  expect(p.host.phase()).toBe('hosting');
  expect(p.guest.phase()).toBe('browsing');
});

test('入れる側がやめたら、あとから誘う側が来てもつながらない', async () => {
  const p = setup();
  const code = '桂馬の三七';
  enterAndJoin(p, code);
  await flush();
  p.guest.quit();
  await flush();
  // 同じ合言葉で誘う側が来たことにする
  void p.la.host(code, '1.0.2');
  await flushN(4);
  expect(p.guest.phase()).toBe('closed');
  expect(p.he).not.toContainEqual({ type: 'connected' });
});

test('対局中に切れても、同じ合言葉で探し直してつながり、記録が続く', async () => {
  const p = setup();
  p.host.host();
  enterAndJoin(p, p.host.code()!);
  await flushN(4);
  p.host.ready(['rakurai']);
  p.guest.ready(['kagami']);
  await flushN(2);
  expect(p.guest.phase()).toBe('match');
  p.fake.cut();
  await flush();
  expect(p.he).toContainEqual({ type: 'lost' });
  expect(p.ge).toContainEqual({ type: 'lost' });
  await flushN(8);
  expect(p.ge).toContainEqual({ type: 'back' });
  expect(p.host.phase()).toBe('match');
  expect(p.guest.phase()).toBe('match');
  expect(p.guest.setup()).toEqual(p.host.setup());
});

test('誘う側の探しが失敗しても、少し待って探し直し、あとから来た相手とつながる', async () => {
  const p = setup();
  p.fake.failHost(1);
  p.host.host();
  await flushN(4);
  enterAndJoin(p, p.host.code()!);
  await flushN(6);
  expect(p.host.phase()).toBe('deck');
  expect(p.guest.phase()).toBe('deck');
});

test('探しが失敗した理由を画面に知らせる（サインインが切れた など）', async () => {
  const p = setup();
  const reasons: string[] = [];
  p.la.onTrouble((r) => reasons.push(r));
  p.fake.failHost(1, 'signedOut');
  p.host.host();
  await flushN(4);
  expect(reasons).toEqual(['signedOut']);
});

test('探すのに2回失敗しても、自動で頼み直してつながる', async () => {
  const p = setup();
  p.host.host();
  p.fake.failFind(2);
  enterAndJoin(p, p.host.code()!);
  await flushN(8);
  expect(p.ge.filter((e) => e.type === 'joinRetry')).toHaveLength(2);
  expect(p.guest.phase()).toBe('deck');
});

test('signIn は部品の答えを返す', async () => {
  expect(await setup({ signedIn: true }).la.signIn()).toBe(true);
  expect(await setup({ signedIn: false }).la.signIn()).toBe(false);
});

