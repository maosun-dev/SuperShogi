// 友と対局：記録から盤面を作る・指紋・自分の最後の手番
import { test, expect } from 'vitest';
import { createGame, applyAction } from '../../src/rules/game';
import type { Action } from '../../src/rules/types';
import { buildState, lastTurnStart, type Setup } from '../../src/net/record';
import { fingerprint } from '../../src/net/fingerprint';

const mv = (fc: number, fr: number, tc: number, tr: number): Action =>
  ({ type: 'move', from: { c: fc, r: fr }, to: { c: tc, r: tr }, promote: false });

const setup = (first: 'sente' | 'gote' = 'sente'): Setup =>
  ({ decks: { sente: ['kagami'], gote: [] }, handicap: { side: 'sente', kind: 'none' }, first });

test('createGame は first の側から指す。駒落ちがあれば落とした側が先', () => {
  expect(createGame({ sente: [], gote: [] }, { first: 'gote' }).turn).toBe('gote');
  expect(createGame({ sente: [], gote: [] }, { first: 'gote', handicap: { side: 'sente', kind: 'kaku' } }).turn).toBe('sente');
});

test('記録から作った盤面は、順に当てはめた盤面と同じ', () => {
  const log = [mv(6, 6, 6, 5), mv(2, 2, 2, 3)];
  let s = createGame({ sente: ['kagami'], gote: [] });
  for (const a of log) s = applyAction(s, a).state;
  expect(fingerprint(buildState(setup(), log))).toBe(fingerprint(s));
});

test('指紋は同じ局面で同じ、1手違えば違う', () => {
  const a = buildState(setup(), [mv(6, 6, 6, 5)]);
  const b = buildState(setup(), [mv(6, 6, 6, 5)]);
  const c = buildState(setup(), [mv(7, 6, 7, 5)]);
  expect(fingerprint(a)).toBe(fingerprint(b));
  expect(fingerprint(a)).not.toBe(fingerprint(c));
  expect(fingerprint(a)).toMatch(/^[0-9a-f]{8}$/);
});

test('自分の最後の手番の頭：一度も指していなければ null', () => {
  expect(lastTurnStart(setup(), [], 'sente')).toBeNull();
  expect(lastTurnStart(setup(), [mv(6, 6, 6, 5)], 'gote')).toBeNull();
});

test('自分の最後の手番の頭：相手がもう指していても、自分の手番の頭まで', () => {
  const log = [mv(6, 6, 6, 5), mv(2, 2, 2, 3), mv(7, 6, 7, 5), mv(3, 2, 3, 3)];
  expect(lastTurnStart(setup(), log, 'sente')).toBe(2);
  expect(lastTurnStart(setup(), log, 'gote')).toBe(3);
  expect(lastTurnStart(setup(), log.slice(0, 3), 'sente')).toBe(2);
});

test('自分の最後の手番の頭：忍札を伏せてから指した手番は、伏せた所から戻す', () => {
  const s0 = buildState(setup(), []);
  const uid = s0.players.sente.cards[0].uid;
  const log: Action[] = [mv(6, 6, 6, 5), mv(2, 2, 2, 3), { type: 'card', uid, targets: [] }, mv(7, 6, 7, 5)];
  expect(lastTurnStart(setup(), log, 'sente')).toBe(2);
});
