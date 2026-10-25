// 友と対局：送るものの形と、テスト用の対の窓口
import { test, expect } from 'vitest';
import { encodeMsg, parseMsg, type Msg } from '../../src/net/protocol';
import { createPairLinks, type LinkEvent } from '../../src/net/link';

import { flush } from '../helpers';

const SQ = { c: 4, r: 6 };
const MSGS: Msg[] = [
  { t: 'hello', version: '0.5.0', matchId: null },
  { t: 'hello', version: '0.5.0', matchId: 'ab12' },
  { t: 'ready', deck: ['rakurai'] },
  { t: 'ready', deck: [], handicap: { side: 'gote', kind: 'kaku' } },
  { t: 'start', matchId: 'ab12', setup: { decks: { sente: ['kagami'], gote: [] }, handicap: { side: 'sente', kind: 'none' }, first: 'gote' } },
  { t: 'act', n: 3, action: { type: 'move', from: SQ, to: { c: 4, r: 5 }, promote: false }, fp: '0a1b2c3d' },
  { t: 'act', n: 0, action: { type: 'card', uid: 40, targets: [], pick: 'FU' }, fp: '00000000' },
  { t: 'resign', n: 5 },
  { t: 'matta', to: 2 },
  { t: 'mattaReply', ok: true, to: 2 },
  { t: 'mattaCancel' },
  { t: 'sync', n: 7 },
  { t: 'log', from: 6, actions: [{ type: 'drop', kind: 'FU', to: SQ }], fps: ['12345678'] },
  { t: 'quit' },
];

test('送るものは全種類、文字にして戻すと元どおり', () => {
  for (const m of MSGS) expect(parseMsg(encodeMsg(m))).toEqual(m);
});

test('形の合わないものは null', () => {
  expect(parseMsg('{oops')).toBeNull();
  expect(parseMsg('{"t":"dance"}')).toBeNull();
  expect(parseMsg('{"t":"act","n":"3","action":{"type":"drop","kind":"FU","to":{"c":1,"r":1}},"fp":"x"}')).toBeNull();
  expect(parseMsg('{"t":"act","n":3,"action":{"type":"move","from":{"c":9,"r":1},"to":{"c":1,"r":1},"promote":false},"fp":"x"}')).toBeNull();
  expect(parseMsg('{"t":"log","from":0,"actions":[],"fps":["a"]}')).toBeNull();
  expect(parseMsg('[]')).toBeNull();
});

test('対の窓口：誘う→探す→見つかる→つなぐ→送る→切る→またつなぐ', async () => {
  const { a, b, cut, heal } = createPairLinks();
  const ea: LinkEvent[] = [], eb: LinkEvent[] = [];
  a.on((e) => ea.push(e)); b.on((e) => eb.push(e));
  await a.host('桂馬の三');
  await b.browse();
  await flush();
  expect(eb).toContainEqual({ type: 'found', peer: 'A', name: '桂馬の三' });
  await b.join('A');
  await flush();
  expect(ea).toContainEqual({ type: 'connected', peer: 'B', name: 'guest' });
  expect(eb).toContainEqual({ type: 'connected', peer: 'A', name: '桂馬の三' });
  await a.send('x'); await a.send('y');
  await flush();
  expect(eb.filter((e) => e.type === 'message')).toEqual([{ type: 'message', data: 'x' }, { type: 'message', data: 'y' }]);
  cut();
  await b.send('lost');
  await flush();
  expect(ea.at(-1)).toEqual({ type: 'disconnected', peer: 'B' });
  expect(ea.some((e) => e.type === 'message')).toBe(false);
  await a.host('桂馬の三'); await b.browse();
  heal();
  await flush();
  await b.join('A');
  await flush();
  expect(eb.filter((e) => e.type === 'connected')).toHaveLength(2);
});
