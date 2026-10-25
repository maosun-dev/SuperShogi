// 友との対局の進行役：2台ぶんを対の窓口でつなぎ、向き・順番・食い違い・待った・決着を確かめる
import { test, expect } from 'vitest';
import { createPairLinks } from '../../src/net/link';
import { createSession, type Session } from '../../src/net/session';
import { createFriendMatch, type FriendMatch } from '../../src/app/friendMatch';
import type { Step } from '../../src/app/match';
import type { Result } from '../../src/rules/types';
import { buildState } from '../../src/net/record';
import { fingerprint } from '../../src/net/fingerprint';
import { flush } from '../helpers';

interface Side { s: Session; m: FriendMatch; steps: Step[]; over: Result[]; desync: number; rewinds: number; release: (() => void)[] }

async function setup(opts: { hold?: boolean } = {}) {
  const links = createPairLinks();
  const hs = createSession(links.a, { version: '1', rng: () => 0.3, stopDelayMs: 0 });
  const gs = createSession(links.b, { version: '1', rng: () => 0.3, stopDelayMs: 0 });
  hs.host(); gs.browse(); await flush();
  gs.join(gs.peers()[0]!.peer); await flush(); await flush();
  hs.ready(['rakurai']); gs.ready([]); await flush();
  const mk = (s: Session): Side => {
    const side = { s, steps: [], over: [], desync: 0, rewinds: 0, release: [] } as unknown as Side;
    side.m = createFriendMatch({
      session: s,
      presenter: {
        present: (step) => {
          side.steps.push(step);
          if (!opts.hold) return Promise.resolve();
          return new Promise<void>((r) => side.release.push(r));
        },
      },
      onOver: (r) => side.over.push(r),
      onDesync: () => { side.desync++; },
      onRewind: () => { side.rewinds++; },
    });
    return side;
  };
  const host = mk(hs), guest = mk(gs);
  await host.m.start(); await guest.m.start();
  return { links, host, guest };
}

const turnOf = (p: { host: Side; guest: Side }) => (p.host.m.phase() === 'human' ? p.host : p.guest);
async function playOne(p: { host: Side; guest: Side }): Promise<void> {
  const side = turnOf(p);
  const a = side.m.legal().find((x) => x.type === 'move')!;
  await side.m.submit(a);
  await flush(); await flush();
}

test('後手の席でも、自分の玉は手前（{4,8}）の先手として見える', async () => {
  const p = await setup();
  expect(p.guest.m.view().board[8 * 9 + 4]).toMatchObject({ kind: 'OU', side: 'sente' });
  expect(p.host.m.view().board[8 * 9 + 4]).toMatchObject({ kind: 'OU', side: 'sente' });
  expect(p.guest.m.view().players.gote.cards.map((c) => c.cardId)).toEqual(['rakurai']);
});

test('指した手が相手に回った向きで届き、2台の盤面がいつも同じ', async () => {
  const p = await setup();
  for (let i = 0; i < 6; i++) await playOne(p);
  const real = (s: Session) => fingerprint(buildState(s.setup()!, s.log()));
  expect(real(p.guest.s)).toBe(real(p.host.s));
  expect(p.host.s.log()).toHaveLength(6);
  const fromHost = p.guest.steps.find((st) => st.actor === 'gote')!;
  const mv = fromHost.events.find((e) => e.type === 'moved');
  expect(mv && mv.type === 'moved' && mv.to.r).toBeLessThan(5); // 相手の駒は奥で動く
});

test('演出の途中に届いた手は、順に1つずつ流れる', async () => {
  const p = await setup({ hold: true });
  const first = turnOf(p);
  const other = first === p.host ? p.guest : p.host;
  const done = first.m.submit(first.m.legal().find((x) => x.type === 'move')!);
  await flush();
  first.release.shift()!(); await done; await flush();
  expect(other.steps).toHaveLength(1);
  expect(other.m.phase()).toBe('presenting');
  other.release.shift()!(); await flush();
  expect(other.m.phase()).toBe('human');
});

test('指紋が合わなければ食い違いを知らせる', async () => {
  const p = await setup();
  const first = turnOf(p);
  const other = first === p.host ? p.guest : p.host;
  // 送る指紋をわざと壊す
  const send = first.s.sendAct.bind(first.s);
  first.s.sendAct = (a) => send(a, 'deadbeef');
  await playOne(p);
  expect(other.desync).toBe(1);
});

test('待ったを受けると、両方の盤面が戻り描き直しを頼む', async () => {
  const p = await setup();
  const first = turnOf(p);
  const other = first === p.host ? p.guest : p.host;
  const start = fingerprint(first.m.view());
  await playOne(p);
  first.s.requestMatta(); await flush();
  other.s.replyMatta(true); await flush();
  expect(first.rewinds).toBe(1);
  expect(other.rewinds).toBe(1);
  expect(fingerprint(first.m.view())).toBe(start);
  expect(first.m.phase()).toBe('human');
});

test('相手が投了すると自分の勝ち、自分の投了は自分の負け（どちらも自分視点）', async () => {
  const p = await setup();
  expect(p.guest.m.resign()).toEqual({ winner: 'gote', reason: 'resign' });
  await flush();
  expect(p.host.over).toEqual([{ winner: 'sente', reason: 'resign' }]);
  expect(p.guest.over).toEqual([]);
});
